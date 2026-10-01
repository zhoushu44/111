// 敏群商贸 ERP 本地打印代理 —— 免安装单文件 exe
//
// 双击即用：内置 HTTP 服务 + 标签打印引擎，无需安装 Node.js 或任何额外运行库。
// 目标框架 .NET Framework 3.5（CLR2），兼容 Windows XP / 7 / 10 / 11：
//   - XP   ：需装一次 .NET Framework 3.5 离线包
//   - Win7 ：系统自带 3.5.1，免安装
//   - Win10/11：系统自带 .NET 4.x，由 exe.config 的 supportedRuntime 兼容加载，免安装
//
// 链路：网页(localhost:8790) → 本 exe → winspool RAW 直发 → Argox 标签打印机
// 版式、纸张、字体全部固定在 exe 内，不读驱动/系统打印设置，所有电脑输出一致。
using System;
using System.Collections.Generic;
using System.Diagnostics;
using System.Drawing;
using System.Drawing.Drawing2D;
using System.Drawing.Printing;
using System.Globalization;
using System.IO;
using System.Net;
using System.Net.Sockets;
using System.Text;
using System.Threading;
using System.Windows.Forms;
using Microsoft.Win32;
using System.Web.Script.Serialization;

internal static class MQPrintAgent
{
    private const string APP_NAME = "MQPrintAgent";
    private const string RUN_KEY = @"Software\Microsoft\Windows\CurrentVersion\Run";

    private static int _port = 8790;
    private static string _printerName = "Argox CP-2140M PPLB";
    private static double _widthMm = 70, _heightMm = 40;
    private static int _dpi = 203;
    private static double _gapMm = 2;     // 标签间隙，成卷间隙纸必须填实际缝隙宽度
    private static double _xOffsetMm = 16; // 横向偏移补偿：居中装 70mm 标签时打印头左基准偏左 16mm
    // 测纸指令：PPLB 的 xa = 自动校准，走纸 1~4 张把原点对到标签起点
    private static string _calibrateCmd = "xa\n";
    // 打印方向：PPLB 的 Z 命令，ZT = 正常、ZB = 上下颠倒。每张都下发，不再依赖打印机存储的方向
    private static string _printDirection = "ZT";
    // 代理启动后首次打印前先测纸一次：仅在从未校准过（calibrated.pref 不存在）时为 true，
    // 完成后落盘，重启不再自动走纸；换纸/换机器用托盘或状态页的「重新校准」手动触发
    private static bool _needCalibrate = true;
    // 启动时校验结果：本机是否存在配置的打印机名，以及本机已安装的全部打印机
    // 供状态页展示、/api/status 返回，避免「名字对不上就只报错误 1801」这种看不懂的故障
    private static bool _printerFound;
    private static List<string> _installedPrinters = new List<string>();

    /// <summary>标记本机已完成定位校准并落盘，后续启动不再自动走纸测纸</summary>
    private static void MarkCalibrated()
    {
        _needCalibrate = false;
        try { File.WriteAllText(_calibPath, "1"); } catch { }
    }

    private static readonly List<TcpListener> _listeners = new List<TcpListener>();
    private static NotifyIcon _tray;
    private static string _dir, _logPath, _prefPath, _calibPath;

    [STAThread]
    private static void Main()
    {
        bool createdNew;
        using (Mutex mutex = new Mutex(true, APP_NAME, out createdNew))
        {
            if (!createdNew)
            {
                MessageBox.Show("打印代理已在运行（请查看屏幕右下角托盘图标）。", "敏群打印代理",
                    MessageBoxButtons.OK, MessageBoxIcon.Information);
                return;
            }

            _dir = Path.GetDirectoryName(Application.ExecutablePath);
            _logPath = Path.Combine(_dir, "agent.log");
            _prefPath = Path.Combine(_dir, "autostart.pref");
            _calibPath = Path.Combine(_dir, "calibrated.pref");
            LoadConfig();
            // 本机已校准过（定位结果存在打印机里、断电不丢）就不再于每次启动后走纸测纸，
            // 换纸/换机器时用托盘或状态页的「重新校准」手动触发
            try
            {
                if (File.Exists(_calibPath) && File.ReadAllText(_calibPath).Trim() == "1") _needCalibrate = false;
            }
            catch { }

            // 双栈监听：.NET 3.5 无 DualMode，改为在 IPv4 与 IPv6 上各起一个监听
            // 先绑 IPv4（XP/7/10/11 均可用），再尽力绑 IPv6；IPv6 被禁用时忽略即可
            int bound = 0;
            if (TryListen(IPAddress.Any)) bound++;
            if (TryListen(IPAddress.IPv6Any)) bound++;
            if (bound == 0)
            {
                MessageBox.Show("端口 " + _port + " 无法监听（可能已被其它程序占用）。", "敏群打印代理",
                    MessageBoxButtons.OK, MessageBoxIcon.Error);
                return;
            }

            ApplyAutoStartPref();
            StartAcceptLoop();
            SetupTray();
            CheckPrinter();
            Log("已启动 端口=" + _port + " 打印机=" + _printerName + " 标签=" + _widthMm + "x" + _heightMm + "mm@" + _dpi + "dpi");
            Application.Run();
            StopListeners();
        }
    }

    /// <summary>在指定地址上尝试监听，失败返回 false（不中断启动）</summary>
    private static bool TryListen(IPAddress address)
    {
        TcpListener listener = null;
        try
        {
            listener = new TcpListener(address, _port);
            listener.Start();
            _listeners.Add(listener);
            Log("监听 " + address + ":" + _port);
            return true;
        }
        catch (Exception ex)
        {
            if (listener != null) { try { listener.Stop(); } catch { } }
            Log("监听 " + address + ":" + _port + " 失败：" + ex.Message);
            return false;
        }
    }

    private static void StopListeners()
    {
        foreach (TcpListener listener in _listeners)
        {
            try { listener.Stop(); } catch { }
        }
        _listeners.Clear();
    }

    // ===== 配置 =====

    private static void LoadConfig()
    {
        string p = Path.Combine(_dir, "config.json");
        if (!File.Exists(p)) return;
        try
        {
            JavaScriptSerializer ser = new JavaScriptSerializer();
            IDictionary<string, object> cfg = ser.Deserialize<IDictionary<string, object>>(File.ReadAllText(p, Encoding.UTF8));
            if (cfg == null) return;
            if (cfg.ContainsKey("port")) _port = ToInt(cfg["port"], _port);
            IDictionary<string, object> pr = cfg.ContainsKey("printer") ? cfg["printer"] as IDictionary<string, object> : null;
            if (pr == null) return;
            if (pr.ContainsKey("printerName")) _printerName = Convert.ToString(pr["printerName"]);
            IDictionary<string, object> lb = pr.ContainsKey("label") ? pr["label"] as IDictionary<string, object> : null;
            if (lb == null) return;
            if (lb.ContainsKey("widthMm")) _widthMm = ToDbl(lb["widthMm"], _widthMm);
            if (lb.ContainsKey("heightMm")) _heightMm = ToDbl(lb["heightMm"], _heightMm);
            if (lb.ContainsKey("dpi")) _dpi = ToInt(lb["dpi"], _dpi);
            if (lb.ContainsKey("gapMm")) _gapMm = ToDbl(lb["gapMm"], _gapMm);
            if (lb.ContainsKey("xOffsetMm")) _xOffsetMm = ToDbl(lb["xOffsetMm"], _xOffsetMm);
            if (lb.ContainsKey("calibrateCmd")) _calibrateCmd = Convert.ToString(lb["calibrateCmd"]);
            // 打印方向 ZT/ZB：正常用 ZT；某台打印机被改过 180° 时可改成 ZB 单独适配
            if (lb.ContainsKey("printDirection")) _printDirection = Convert.ToString(lb["printDirection"]);
        }
        catch (Exception ex) { Log("读取 config.json 失败: " + ex.Message); }
    }

    /// <summary>把状态页提交的扁平配置应用到内存字段（保存前调用），非法值一律忽略保留原值</summary>
    private static void ApplyConfig(string bodyText)
    {
        JavaScriptSerializer ser = new JavaScriptSerializer();
        IDictionary<string, object> cfg = ser.Deserialize<IDictionary<string, object>>(bodyText);
        if (cfg == null) throw new InvalidOperationException("请求体不是合法 JSON");

        if (cfg.ContainsKey("printerName"))
        {
            string name = Convert.ToString(cfg["printerName"]).Trim();
            if (name.Length > 0) _printerName = name;
        }
        // 尺寸/偏移必须为正数，否则渲染出 0 宽位图直接崩
        if (cfg.ContainsKey("widthMm")) _widthMm = Positive(ToDbl(cfg["widthMm"], _widthMm), _widthMm);
        if (cfg.ContainsKey("heightMm")) _heightMm = Positive(ToDbl(cfg["heightMm"], _heightMm), _heightMm);
        if (cfg.ContainsKey("dpi")) _dpi = ToInt(cfg["dpi"], _dpi) > 0 ? ToInt(cfg["dpi"], _dpi) : _dpi;
        if (cfg.ContainsKey("gapMm")) _gapMm = Math.Max(0, ToDbl(cfg["gapMm"], _gapMm));
        if (cfg.ContainsKey("xOffsetMm")) _xOffsetMm = Math.Max(0, ToDbl(cfg["xOffsetMm"], _xOffsetMm));
        if (cfg.ContainsKey("printDirection"))
        {
            string dir = Convert.ToString(cfg["printDirection"]).Trim().ToUpperInvariant();
            if (dir == "ZT" || dir == "ZB") _printDirection = dir;
        }
        // 改了打印机名/尺寸后重新校验并重置校准标记，下次打印会重新测纸
        _needCalibrate = true;
        try { File.Delete(_calibPath); } catch { }
        CheckPrinter();
    }

    private static double Positive(double v, double def)
    {
        return v > 0 ? v : def;
    }

    private static int ToInt(object v, int def)
    {
        int n;
        return int.TryParse(Convert.ToString(v, CultureInfo.InvariantCulture), NumberStyles.Integer, CultureInfo.InvariantCulture, out n) ? n : def;
    }

    private static double ToDbl(object v, double def)
    {
        double n;
        return double.TryParse(Convert.ToString(v, CultureInfo.InvariantCulture), NumberStyles.Float, CultureInfo.InvariantCulture, out n) ? n : def;
    }

    /// <summary>列出本机「设备和打印机」中的全部打印机名</summary>
    private static List<string> InstalledPrinters()
    {
        List<string> list = new List<string>();
        try
        {
            foreach (string name in PrinterSettings.InstalledPrinters) list.Add(name);
        }
        catch (Exception ex) { Log("读取打印机列表失败: " + ex.Message); }
        return list;
    }

    /// <summary>
    /// 启动时校验配置的打印机名是否与本机一致，不一致就在日志里列出全部可选名字并弹气泡提示。
    /// 代理不自动改配置——把候选名字给出来，由用户在状态页下拉里挑，避免误改。
    /// </summary>
    private static void CheckPrinter()
    {
        _installedPrinters = InstalledPrinters();
        _printerFound = false;
        foreach (string name in _installedPrinters)
        {
            if (string.Equals(name, _printerName, StringComparison.OrdinalIgnoreCase)) { _printerFound = true; break; }
        }
        if (_printerFound)
        {
            Log("打印机已就绪：" + _printerName);
            return;
        }
        Log("[警告] 本机没有名为「" + _printerName + "」的打印机，打印会失败。本机已安装：" +
            (_installedPrinters.Count > 0 ? string.Join("；", _installedPrinters.ToArray()) : "（无）"));
        if (_tray != null)
        {
            _tray.ShowBalloonTip(5000, "敏群打印代理",
                "未找到打印机「" + _printerName + "」。\n请双击托盘图标，在状态页的下拉框中重新选择本机打印机。",
                ToolTipIcon.Warning);
        }
    }

    /// <summary>把当前配置落盘为 config.json（状态页保存时调用），下次启动沿用</summary>
    private static void SaveConfig()
    {
        try
        {
            JavaScriptSerializer ser = new JavaScriptSerializer();
            Dictionary<string, object> label = new Dictionary<string, object>();
            label["widthMm"] = _widthMm;
            label["heightMm"] = _heightMm;
            label["dpi"] = _dpi;
            label["gapMm"] = _gapMm;
            label["xOffsetMm"] = _xOffsetMm;
            label["calibrateCmd"] = _calibrateCmd;
            label["printDirection"] = _printDirection;
            Dictionary<string, object> printer = new Dictionary<string, object>();
            printer["mode"] = "windows-raw";
            printer["printerName"] = _printerName;
            printer["label"] = label;
            Dictionary<string, object> cfg = new Dictionary<string, object>();
            cfg["port"] = _port;
            cfg["printer"] = printer;
            File.WriteAllText(Path.Combine(_dir, "config.json"), ser.Serialize(cfg), Encoding.UTF8);
        }
        catch (Exception ex) { Log("保存 config.json 失败: " + ex.Message); }
    }

    // ===== 开机自启 =====

    private static void ApplyAutoStartPref()
    {
        // 首次运行默认开启；之后以用户上次的选择为准
        string want = File.Exists(_prefPath) ? File.ReadAllText(_prefPath).Trim() : "1";
        if (want != "0" && want != "1") want = "1";
        try { File.WriteAllText(_prefPath, want); } catch { }
        SetAutoStart(want == "1");
    }

    private static bool IsAutoStart()
    {
        try
        {
            using (RegistryKey k = Registry.CurrentUser.OpenSubKey(RUN_KEY, false))
            {
                if (k == null) return false;
                return Convert.ToString(k.GetValue(APP_NAME)) == AutoStartCommand();
            }
        }
        catch { return false; }
    }

    private static string AutoStartCommand()
    {
        return "\"" + Application.ExecutablePath + "\"";
    }

    private static void SetAutoStart(bool on)
    {
        try
        {
            using (RegistryKey k = Registry.CurrentUser.OpenSubKey(RUN_KEY, true))
            {
                if (k == null) return;
                if (on) k.SetValue(APP_NAME, AutoStartCommand());
                else k.DeleteValue(APP_NAME, false);
            }
        }
        catch (Exception ex) { Log("设置开机自启失败: " + ex.Message); }
    }

    // ===== 托盘 =====

    private static void SetupTray()
    {
        _tray = new NotifyIcon();
        _tray.Icon = MakeIcon(Color.FromArgb(16, 185, 129));
        _tray.Text = "敏群打印代理（运行中 :" + _port + "）";
        _tray.Visible = true;

        ContextMenuStrip menu = new ContextMenuStrip();
        menu.Items.Add("打开状态页", null, delegate { OpenStatusPage(); });
        menu.Items.Add("打印测试标签", null, delegate { PrintTestLabel(); });
        menu.Items.Add("校准标签定位", null, delegate { CalibrateLabel(); });
        menu.Items.Add(new ToolStripSeparator());
        ToolStripMenuItem auto = new ToolStripMenuItem("开机自动启动");
        auto.Checked = IsAutoStart();
        auto.Click += delegate
        {
            bool next = !IsAutoStart();
            SetAutoStart(next);
            try { File.WriteAllText(_prefPath, next ? "1" : "0"); } catch { }
            auto.Checked = next;
        };
        menu.Items.Add(auto);
        menu.Items.Add(new ToolStripSeparator());
        menu.Items.Add("退出", null, delegate
        {
            _tray.Visible = false;
            Application.Exit();
        });
        _tray.ContextMenuStrip = menu;
        _tray.DoubleClick += delegate { OpenStatusPage(); };
    }

    /// <summary>画一个带状态色点的托盘图标</summary>
    private static Icon MakeIcon(Color dot)
    {
        using (Bitmap bmp = new Bitmap(16, 16))
        {
            using (Graphics g = Graphics.FromImage(bmp))
            {
                g.SmoothingMode = SmoothingMode.AntiAlias;
                using (Brush bg = new SolidBrush(Color.FromArgb(18, 60, 90)))
                    g.FillRectangle(bg, 0, 0, 16, 16);
                using (Brush fg = new SolidBrush(Color.White))
                    g.FillRectangle(fg, 3, 5, 10, 3);
                using (Brush fg = new SolidBrush(dot))
                    g.FillEllipse(fg, 8, 8, 7, 7);
            }
            return Icon.FromHandle(bmp.GetHicon());
        }
    }

    private static void OpenStatusPage()
    {
        try { Process.Start("http://localhost:" + _port + "/"); }
        catch (Exception ex) { Log("打开状态页失败: " + ex.Message); }
    }

    /// <summary>用固定样例渲染一张标签，验证「本 exe → 打印机」是否通</summary>
    private static void PrintTestLabel()
    {
        string json = "{\"labels\":[{\"qrValue\":\"MQ-TEST-001\",\"variant\":\"FULL\",\"header\":true,\"copies\":1," +
                      "\"data\":{\"itemNo\":\"MQ-TEST-001\",\"companyName\":\"Mint Chance Textile Co.,Ltd\"," +
                      "\"composition\":\"65% Cotton 35% Polyester\",\"construction\":\"Knitted\",\"width\":\"150cm\"," +
                      "\"weight\":\"120g/m2\",\"remark\":\"打印代理自检标签\"}}]}";
        try
        {
            LabelRender.ExecuteJobText(BuildJob(json));
            MarkCalibrated();
            _tray.ShowBalloonTip(3000, "敏群打印代理", "测试标签已发送到打印机", ToolTipIcon.Info);
        }
        catch (Exception ex)
        {
            Log("测试打印失败: " + ex.Message);
            MessageBox.Show("测试打印失败：" + ex.Message, "敏群打印代理", MessageBoxButtons.OK, MessageBoxIcon.Error);
        }
    }

    /// <summary>手动测纸：发一次校准指令让打印机走纸对齐标签起点（换纸/换卷后使用）</summary>
    private static void CalibrateLabel()
    {
        try
        {
            LabelRender.CalibrateMedia(_printerName, _calibrateCmd);
            MarkCalibrated();
            _tray.ShowBalloonTip(3000, "敏群打印代理", "已发送测纸指令，打印机会走纸对齐标签起点", ToolTipIcon.Info);
        }
        catch (Exception ex)
        {
            Log("测纸失败: " + ex.Message);
            MessageBox.Show("测纸失败：" + ex.Message, "敏群打印代理", MessageBoxButtons.OK, MessageBoxIcon.Error);
        }
    }

    // ===== HTTP 服务 =====

    private static void StartAcceptLoop()
    {
        // 每个监听地址（IPv4 / IPv6）各起一个接受线程
        foreach (TcpListener bound in _listeners)
        {
            TcpListener listener = bound;
            Thread t = new Thread(delegate ()
            {
                while (true)
                {
                    TcpClient client;
                    try { client = listener.AcceptTcpClient(); }
                    catch { break; }
                    ThreadPool.QueueUserWorkItem(delegate (object o) { HandleClient((TcpClient)o); }, client);
                }
            });
            t.IsBackground = true;
            t.Start();
        }
    }

    private static void HandleClient(TcpClient client)
    {
        try
        {
            using (client)
            {
                client.ReceiveTimeout = 15000;
                client.SendTimeout = 15000;
                NetworkStream ns = client.GetStream();

                MemoryStream buf = new MemoryStream();
                byte[] chunk = new byte[8192];
                int headerEnd = -1;
                while (headerEnd < 0)
                {
                    int n = ns.Read(chunk, 0, chunk.Length);
                    if (n <= 0) return;
                    buf.Write(chunk, 0, n);
                    if (buf.Length > 8 * 1024 * 1024) return;
                    headerEnd = IndexOf(buf.GetBuffer(), (int)buf.Length, "\r\n\r\n");
                }

                byte[] all = buf.ToArray();
                // 诊断：仅对打印相关请求记录原始字节（含请求行/请求头/body 起始），用于区分「前端发错」与「代理解析错位」
                string rawText = Encoding.UTF8.GetString(all);
                if (rawText.IndexOf("/api/print/", StringComparison.Ordinal) >= 0)
                    Log("原始请求 len=" + all.Length + " headEnd=" + headerEnd + " raw=" + Preview(rawText, 500));
                string head = Encoding.UTF8.GetString(all, 0, headerEnd);
                string[] lines = head.Split(new string[] { "\r\n" }, StringSplitOptions.None);
                string[] first = lines[0].Split(' ');
                string method = first.Length > 0 ? first[0].ToUpperInvariant() : "";
                string path = first.Length > 1 ? first[1] : "/";

                int contentLength = 0;
                string origin = null;
                string referer = "";
                string userAgent = "";
                for (int i = 1; i < lines.Length; i++)
                {
                    int c = lines[i].IndexOf(':');
                    if (c <= 0) continue;
                    string k = lines[i].Substring(0, c).Trim().ToLowerInvariant();
                    string v = lines[i].Substring(c + 1).Trim();
                    if (k == "content-length") int.TryParse(v, out contentLength);
                    else if (k == "origin") origin = v;
                    else if (k == "referer") referer = v;
                    else if (k == "user-agent") userAgent = v;
                }

                MemoryStream body = new MemoryStream();
                int bodyStart = headerEnd + 4;
                if (all.Length > bodyStart) body.Write(all, bodyStart, all.Length - bodyStart);
                while (body.Length < contentLength)
                {
                    int want = (int)Math.Min(chunk.Length, contentLength - body.Length);
                    int n = ns.Read(chunk, 0, want);
                    if (n <= 0) break;
                    body.Write(chunk, 0, n);
                }
                string bodyText = Encoding.UTF8.GetString(body.ToArray());

                int q = path.IndexOf('?');
                string route = q >= 0 ? path.Substring(0, q) : path;

                // 诊断：记录所有请求。GET 也记（网页每 8 秒轮询 /api/status），
                // 只要看到 GET 行就说明「用户页面能连上代理」，没看到就是页面压根没打到代理（LNA/端口/页面不对）
                if (method == "GET") Log("请求 " + method + " " + route + " origin=" + origin + " referer=" + referer + " ua=" + userAgent);
                else Log("请求 " + method + " " + route + " len=" + bodyText.Length + "/" + contentLength + " origin=" + origin + " referer=" + referer + " body=" + Preview(bodyText, 400));

                if (method == "OPTIONS")
                {
                    WriteResponse(ns, 204, "text/plain; charset=utf-8", "", origin);
                }
                else if (method == "GET" && (route == "/" || route == "/index.html"))
                {
                    WriteResponse(ns, 200, "text/html; charset=utf-8", StatusPage(), origin);
                }
                else if (method == "GET" && route == "/api/status")
                {
                    WriteResponse(ns, 200, "application/json; charset=utf-8", StatusJson(), origin);
                }
                // 线上前端用 <img src="http://localhost:8790/pixel.gif?t=..."> 探测代理是否在线：
                // 图片加载成功即视为在线，返回 404 会被前端判成「未检测到本地代理（请启动 MQPrintAgent.exe）」
                else if (method == "GET" && (route == "/pixel.gif" || route == "/pixel.png"))
                {
                    WriteResponseBytes(ns, 200, "image/gif", PixelGif, origin);
                }
                else if (method == "POST" && route == "/api/print/label")
                {
                    string result;
                    int code = 200;
                    try
                    {
                        result = LabelRender.ExecuteJobText(BuildJob(bodyText));
                        MarkCalibrated();
                    }
                    catch (Exception ex)
                    {
                        Log("打印失败: " + ex.Message);
                        code = 502;
                        result = "{\"ok\":false,\"error\":" + Quote(ex.Message) + "}";
                    }
                    WriteResponse(ns, code, "application/json; charset=utf-8", result, origin);
                }
                else if (method == "POST" && route == "/api/print/calibrate")
                {
                    string result;
                    int code = 200;
                    try
                    {
                        LabelRender.CalibrateMedia(_printerName, _calibrateCmd);
                        MarkCalibrated();
                        result = "{\"ok\":true,\"calibrated\":true}";
                    }
                    catch (Exception ex)
                    {
                        Log("测纸失败: " + ex.Message);
                        code = 502;
                        result = "{\"ok\":false,\"error\":" + Quote(ex.Message) + "}";
                    }
                    WriteResponse(ns, code, "application/json; charset=utf-8", result, origin);
                }
                else if (method == "POST" && route == "/api/config")
                {
                    string result;
                    int code = 200;
                    try
                    {
                        ApplyConfig(bodyText);
                        SaveConfig();
                        result = "{\"ok\":true}";
                    }
                    catch (Exception ex)
                    {
                        Log("保存配置失败: " + ex.Message);
                        code = 502;
                        result = "{\"ok\":false,\"error\":" + Quote(ex.Message) + "}";
                    }
                    WriteResponse(ns, code, "application/json; charset=utf-8", result, origin);
                }
                else
                {
                    WriteResponse(ns, 404, "application/json; charset=utf-8", "{\"ok\":false,\"error\":\"not found\"}", origin);
                }
            }
        }
        catch (Exception ex)
        {
            // 浏览器预连接的空闲 socket / 主动断开属正常现象，不作为错误记录
            if (!IsClientGone(ex)) Log("请求处理异常: " + ex.Message);
        }
    }

    /// <summary>判断异常是否只是客户端断开或空闲超时（无需记录）</summary>
    private static bool IsClientGone(Exception ex)
    {
        for (Exception e = ex; e != null; e = e.InnerException)
        {
            if (e is SocketException) return true;
            string m = e.Message ?? "";
            if (m.IndexOf("无法从传输连接中读取数据", StringComparison.Ordinal) >= 0) return true;
            if (m.IndexOf("远程主机强迫关闭", StringComparison.Ordinal) >= 0) return true;
            if (m.IndexOf("现有的连接被远程主机强行关闭", StringComparison.Ordinal) >= 0) return true;
            if (m.IndexOf("由于连接方在一段时间后没有正确答复", StringComparison.Ordinal) >= 0) return true;
        }
        return false;
    }

    /// <summary>给前端作业补上固定的打印机名与标签尺寸（前端无需、也无法指定）</summary>
    private static string BuildJob(string bodyText)
    {
        JavaScriptSerializer ser = new JavaScriptSerializer { MaxJsonLength = int.MaxValue };
        IDictionary<string, object> job = ser.Deserialize<IDictionary<string, object>>(bodyText);
        if (job == null) throw new InvalidOperationException("请求体不是合法 JSON");
        job["printerName"] = _printerName;
        // 首张打印前先测纸，让打印机走纸到标签起点再打印（之后沿用定位）
        job["calibrate"] = _needCalibrate;
        Dictionary<string, object> label = new Dictionary<string, object>();
        label["widthMm"] = _widthMm;
        label["heightMm"] = _heightMm;
        label["dpi"] = _dpi;
        label["gapMm"] = _gapMm;
        label["xOffsetMm"] = _xOffsetMm;
        label["calibrateCmd"] = _calibrateCmd;
        label["printDirection"] = _printDirection;
        job["label"] = label;
        return ser.Serialize(job);
    }

    private static string StatusJson()
    {
        StringBuilder sb = new StringBuilder();
        sb.Append("{\"ok\":true,\"agent\":\"mq-print-agent\",\"port\":").Append(_port);
        sb.Append(",\"printerFound\":").Append(_printerFound ? "true" : "false");
        sb.Append(",\"installedPrinters\":[");
        for (int i = 0; i < _installedPrinters.Count; i++)
        {
            if (i > 0) sb.Append(',');
            sb.Append(Quote(_installedPrinters[i]));
        }
        sb.Append("]");
        sb.Append(",\"printer\":{\"mode\":\"windows-raw\",\"printerName\":").Append(Quote(_printerName));
        sb.Append(",\"label\":{\"widthMm\":").Append(_widthMm.ToString(CultureInfo.InvariantCulture));
        sb.Append(",\"heightMm\":").Append(_heightMm.ToString(CultureInfo.InvariantCulture));
        sb.Append(",\"dpi\":").Append(_dpi);
        sb.Append(",\"gapMm\":").Append(_gapMm.ToString(CultureInfo.InvariantCulture));
        sb.Append(",\"printDirection\":").Append(Quote(_printDirection));
        sb.Append(",\"needCalibrate\":").Append(_needCalibrate ? "true" : "false");
        sb.Append(",\"xOffsetMm\":").Append(_xOffsetMm.ToString(CultureInfo.InvariantCulture));
        sb.Append("}}}");
        return sb.ToString();
    }

    private static string StatusPage()
    {
        StringBuilder opts = new StringBuilder();
        bool matched = false;
        foreach (string name in _installedPrinters)
        {
            bool sel = string.Equals(name, _printerName, StringComparison.OrdinalIgnoreCase);
            if (sel) matched = true;
            opts.Append("<option value=\"").Append(HtmlEncode(name)).Append('"')
                .Append(sel ? " selected" : "").Append('>').Append(HtmlEncode(name)).Append("</option>");
        }
        // 配置里的名字在本机不存在时，额外插一条并选中，避免下拉「凭空跳到第一个」造成误解
        if (!matched)
        {
            opts.Insert(0, "<option value=\"" + HtmlEncode(_printerName) + "\" selected>" +
                           HtmlEncode(_printerName) + "（本机未找到）</option>");
        }
        string warn = _printerFound ? "" :
            "<p class=\"warn\">未在本机找到打印机「" + HtmlEncode(_printerName) +
            "」，打印会失败。请在下方下拉框中选择本机实际安装的打印机后保存。</p>";

        return "<!doctype html><html lang=\"zh-CN\"><head><meta charset=\"utf-8\">" +
               "<title>敏群打印代理</title><style>" +
               "body{font-family:'Microsoft YaHei',sans-serif;background:#f6f8fa;margin:0;padding:40px;color:#0f172a}" +
               ".card{max-width:640px;margin:0 auto;background:#fff;border:1px solid #e2e8f0;border-radius:16px;padding:28px}" +
               "h1{font-size:20px;margin:0 0 4px}.ok{color:#059669;font-weight:600}" +
               ".warn{background:#fef2f2;border:1px solid #fecaca;color:#b91c1c;border-radius:10px;padding:10px 12px;font-size:13px}" +
               "label{display:block;font-size:12px;color:#64748b;margin:14px 0 4px}" +
               "select,input{width:100%;box-sizing:border-box;padding:8px 10px;border:1px solid #cbd5e1;border-radius:9px;font-size:14px}" +
               ".grid{display:grid;grid-template-columns:1fr 1fr;gap:12px}" +
               "button{background:#123c5a;color:#fff;border:0;border-radius:9px;padding:9px 16px;font-size:14px;cursor:pointer;margin-top:16px}" +
               ".row{display:flex;gap:10px;align-items:center;margin-top:12px;flex-wrap:wrap}" +
               ".ghost{background:#eef2f6;color:#123c5a}" +
               "table{width:100%;border-collapse:collapse;margin-top:18px;font-size:14px}" +
               "td{padding:9px 0;border-bottom:1px solid #f1f5f9}td:first-child{color:#64748b;width:130px}" +
               ".msg{font-size:13px;color:#059669;margin-left:8px}" +
               "</style></head><body><div class=\"card\">" +
               "<h1>敏群商贸 ERP 本地打印代理</h1><p class=\"ok\">● 运行中（端口 " + _port + "）</p>" +
               warn +
               "<label>打印机（本机「设备和打印机」中的名称）</label>" +
               "<select id=\"printerName\">" + opts + "</select>" +
               "<div class=\"grid\">" +
               "<div><label>标签宽 (mm)</label><input id=\"widthMm\" type=\"number\" step=\"0.1\" value=\"" + _widthMm.ToString(CultureInfo.InvariantCulture) + "\"></div>" +
               "<div><label>标签高 (mm)</label><input id=\"heightMm\" type=\"number\" step=\"0.1\" value=\"" + _heightMm.ToString(CultureInfo.InvariantCulture) + "\"></div>" +
               "<div><label>DPI</label><input id=\"dpi\" type=\"number\" value=\"" + _dpi + "\"></div>" +
               "<div><label>标签间隙 (mm)</label><input id=\"gapMm\" type=\"number\" step=\"0.1\" value=\"" + _gapMm.ToString(CultureInfo.InvariantCulture) + "\"></div>" +
               "<div><label>横向偏移补偿 (mm)</label><input id=\"xOffsetMm\" type=\"number\" step=\"0.1\" value=\"" + _xOffsetMm.ToString(CultureInfo.InvariantCulture) + "\"></div>" +
               "<div><label>打印方向</label><select id=\"printDirection\">" +
               "<option value=\"ZT\"" + (_printDirection == "ZT" ? " selected" : "") + ">ZT 正常</option>" +
               "<option value=\"ZB\"" + (_printDirection == "ZB" ? " selected" : "") + ">ZB 上下颠倒</option>" +
               "</select></div>" +
               "</div>" +
               "<div class=\"row\"><button onclick=\"save()\">保存设置</button>" +
               "<button class=\"ghost\" onclick=\"test()\">打印测试标签</button>" +
               "<button class=\"ghost\" onclick=\"calib()\">校准标签定位</button>" +
               "<span id=\"msg\" class=\"msg\"></span></div>" +
               "<table><tr><td>打印方式</td><td>RAW 原始指令直发（绕过驱动渲染，全机一致）</td></tr>" +
               "<tr><td>开机自启</td><td>" + (IsAutoStart() ? "已开启" : "未开启") + "</td></tr>" +
               "<tr><td>本机打印机</td><td>" + _installedPrinters.Count + " 台</td></tr></table>" +
               "<p style=\"margin-top:20px;color:#64748b;font-size:13px\">此页面用于配置代理；打印请回到 ERP 标签打印页点击「直接打印（exe）」。右键托盘图标可退出或切换开机自启。</p>" +
               "</div><script>" +
               "function post(p,b){return fetch(p,{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify(b||{})}).then(function(r){return r.json()})}" +
               "function val(id){return document.getElementById(id).value}" +
               "function save(){post('/api/config',{printerName:val('printerName'),widthMm:Number(val('widthMm')),heightMm:Number(val('heightMm')),dpi:Number(val('dpi')),gapMm:Number(val('gapMm')),xOffsetMm:Number(val('xOffsetMm')),printDirection:val('printDirection')}).then(function(r){document.getElementById('msg').textContent=r.ok?'已保存，即时生效':'保存失败';if(r.ok)setTimeout(function(){location.reload()},800)}).catch(function(e){document.getElementById('msg').textContent='保存失败：'+e})}" +
               "function test(){post('/api/print/label',{labels:[{qrValue:'MQ-TEST-001',variant:'FULL',header:true,copies:1,data:{itemNo:'MQ-TEST-001',companyName:'Mint Chance Textile Co.,Ltd',composition:'65% Cotton 35% Polyester',construction:'Knitted',width:'150cm',weight:'120g/m2',remark:'打印代理自检标签'}}]}).then(function(r){document.getElementById('msg').textContent=r.ok?'测试标签已发送':'测试失败：'+(r.error||'')}).catch(function(e){document.getElementById('msg').textContent='测试失败：'+e})}" +
               "function calib(){post('/api/print/calibrate').then(function(r){document.getElementById('msg').textContent=r.ok?'已发送测纸指令，打印机会走纸对齐标签起点':'测纸失败：'+(r.error||'')}).catch(function(e){document.getElementById('msg').textContent='测纸失败：'+e})}" +
               "</script></body></html>";
    }

    // 1×1 全透明 GIF：供前端 <img> 在线探测使用，任何浏览器都能正常触发 onload
    private static readonly byte[] PixelGif = new byte[] {
        0x47, 0x49, 0x46, 0x38, 0x39, 0x61, 0x01, 0x00, 0x01, 0x00, 0x80, 0x00, 0x00,
        0x00, 0x00, 0x00, 0xFF, 0xFF, 0xFF, 0x21, 0xF9, 0x04, 0x01, 0x00, 0x00, 0x00, 0x00,
        0x2C, 0x00, 0x00, 0x00, 0x00, 0x01, 0x00, 0x01, 0x00, 0x00, 0x02, 0x02, 0x44, 0x01, 0x00, 0x3B
    };

    private static void WriteResponse(NetworkStream ns, int status, string contentType, string body, string origin)
    {
        WriteResponseBytes(ns, status, contentType, Encoding.UTF8.GetBytes(body ?? ""), origin);
    }

    private static void WriteResponseBytes(NetworkStream ns, int status, string contentType, byte[] data, string origin)
    {
        StringBuilder sb = new StringBuilder();
        sb.Append("HTTP/1.1 ").Append(status).Append(' ').Append(StatusText(status)).Append("\r\n");
        sb.Append("Content-Type: ").Append(contentType).Append("\r\n");
        sb.Append("Content-Length: ").Append(data.Length).Append("\r\n");
        sb.Append("Access-Control-Allow-Origin: ").Append(string.IsNullOrEmpty(origin) ? "*" : origin).Append("\r\n");
        sb.Append("Access-Control-Allow-Methods: GET,POST,OPTIONS\r\n");
        sb.Append("Access-Control-Allow-Headers: Content-Type\r\n");
        // 页面部署在公网 IP 上，浏览器把「公网页面 → localhost」判为私有网络访问（PNA），
        // 预检必须显式允许，否则 Chrome/Edge 直接拦掉请求，前端就会报「未检测到本地代理」
        sb.Append("Access-Control-Allow-Private-Network: true\r\n");
        sb.Append("Vary: Origin\r\n");
        sb.Append("Cache-Control: no-store\r\n");
        sb.Append("Connection: close\r\n\r\n");
        byte[] head = Encoding.ASCII.GetBytes(sb.ToString());
        ns.Write(head, 0, head.Length);
        if (data.Length > 0) ns.Write(data, 0, data.Length);
        ns.Flush();
    }

    private static string StatusText(int code)
    {
        if (code == 200) return "OK";
        if (code == 204) return "No Content";
        if (code == 400) return "Bad Request";
        if (code == 404) return "Not Found";
        if (code == 502) return "Bad Gateway";
        return "Internal Server Error";
    }

    private static int IndexOf(byte[] buf, int len, string pattern)
    {
        byte[] p = Encoding.ASCII.GetBytes(pattern);
        for (int i = 0; i + p.Length <= len; i++)
        {
            bool ok = true;
            for (int j = 0; j < p.Length; j++)
            {
                if (buf[i + j] != p[j]) { ok = false; break; }
            }
            if (ok) return i;
        }
        return -1;
    }

    private static string Quote(string s)
    {
        if (s == null) return "\"\"";
        StringBuilder sb = new StringBuilder("\"");
        foreach (char c in s)
        {
            if (c == '"' || c == '\\') sb.Append('\\').Append(c);
            else if (c == '\r') sb.Append("\\r");
            else if (c == '\n') sb.Append("\\n");
            else if (c < ' ') sb.Append("\\u").Append(((int)c).ToString("x4"));
            else sb.Append(c);
        }
        return sb.Append('"').ToString();
    }

    /// <summary>最小 HTML 转义（.NET 3.5 无 WebUtility.HtmlEncode）</summary>
    private static string HtmlEncode(string s)
    {
        if (string.IsNullOrEmpty(s)) return "";
        StringBuilder sb = new StringBuilder(s.Length);
        foreach (char c in s)
        {
            switch (c)
            {
                case '&': sb.Append("&amp;"); break;
                case '<': sb.Append("&lt;"); break;
                case '>': sb.Append("&gt;"); break;
                case '"': sb.Append("&quot;"); break;
                case '\'': sb.Append("&#39;"); break;
                default: sb.Append(c); break;
            }
        }
        return sb.ToString();
    }

    /// <summary>诊断用：截取字符串首尾片段，便于在日志中辨认实际收到的内容</summary>
    private static string Preview(string s, int max)
    {
        if (s == null) return "(null)";
        if (s.Length <= max) return s;
        return s.Substring(0, max) + "…(共 " + s.Length + " 字符)…" + s.Substring(s.Length - 100);
    }

    private static void Log(string msg)
    {
        try
        {
            File.AppendAllText(_logPath, DateTime.Now.ToString("yyyy-MM-dd HH:mm:ss") + "  " + msg + "\r\n", Encoding.UTF8);
        }
        catch { }
    }
}
