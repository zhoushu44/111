// 敏群商贸 ERP 本地打印代理 —— 免安装单文件 exe
//
// 双击即用：内置 HTTP 服务 + 标签打印引擎，无需安装 Node.js 或任何额外运行库。
// 目标框架 .NET Framework 4.8，Win10 1803+ / Win11 自带，无需任何运行库安装。
//
// 链路：网页(localhost:8790) → 本 exe → winspool RAW 直发 → Argox 标签打印机
// 版式、纸张、字体全部固定在 exe 内，不读驱动/系统打印设置，所有电脑输出一致。
using System;
using System.Collections.Generic;
using System.Diagnostics;
using System.Drawing;
using System.Drawing.Drawing2D;
using System.Globalization;
using System.IO;
using System.Net;
using System.Net.Sockets;
using System.Text;
using System.Threading;
using System.Web.Script.Serialization;
using System.Windows.Forms;
using Microsoft.Win32;

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
    // 代理启动后首次打印前先测纸一次，之后沿用定位；成功后置 false，换纸可在托盘/状态页重新校准
    private static bool _needCalibrate = true;

    private static readonly List<TcpListener> _listeners = new List<TcpListener>();
    private static NotifyIcon _tray;
    private static string _dir, _logPath, _prefPath, _cfgPath;

    // 1x1 透明 GIF：供 HTTPS 网页用 <img> 探测代理是否在线（绕过混合内容限制）
    private static readonly byte[] PixelGif = new byte[] {
        0x47,0x49,0x46,0x38,0x39,0x61,0x01,0x00,0x01,0x00,
        0x80,0x00,0x00,0xFF,0xFF,0xFF,0x00,0x00,0x00,0x21,
        0xF9,0x04,0x01,0x00,0x00,0x00,0x00,0x2C,0x00,0x00,
        0x00,0x00,0x01,0x00,0x01,0x00,0x00,0x02,0x02,0x44,
        0x01,0x00,0x3B
    };

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
            _cfgPath = Path.Combine(_dir, "config.json");
            LoadConfig();

            // 双栈监听：IPv4 与 IPv6 各起一个监听
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
        if (!File.Exists(_cfgPath)) return;
        try
        {
            JavaScriptSerializer ser = new JavaScriptSerializer();
            IDictionary<string, object> cfg = ser.Deserialize<IDictionary<string, object>>(File.ReadAllText(_cfgPath, Encoding.UTF8));
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
        }
        catch (Exception ex) { Log("读取 config.json 失败: " + ex.Message); }
    }

    /// <summary>保存配置到 config.json，并实时更新内存中的参数</summary>
    private static void SaveConfig(string printerName, double widthMm, double heightMm, int dpi, double gapMm, double xOffsetMm)
    {
        _printerName = printerName ?? _printerName;
        _widthMm = widthMm;
        _heightMm = heightMm;
        _dpi = dpi;
        _gapMm = gapMm;
        _xOffsetMm = xOffsetMm;

        JavaScriptSerializer ser = new JavaScriptSerializer();
        Dictionary<string, object> cfg = new Dictionary<string, object>();
        cfg["port"] = _port;
        Dictionary<string, object> pr = new Dictionary<string, object>();
        pr["printerName"] = _printerName;
        Dictionary<string, object> lb = new Dictionary<string, object>();
        lb["widthMm"] = _widthMm;
        lb["heightMm"] = _heightMm;
        lb["dpi"] = _dpi;
        lb["gapMm"] = _gapMm;
        lb["xOffsetMm"] = _xOffsetMm;
        lb["calibrateCmd"] = _calibrateCmd;
        pr["label"] = lb;
        cfg["printer"] = pr;
        File.WriteAllText(_cfgPath, ser.Serialize(cfg), Encoding.UTF8);
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
        menu.Items.Add("打开设置页", null, delegate { OpenStatusPage(); });
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
        catch (Exception ex) { Log("打开设置页失败: " + ex.Message); }
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
            _needCalibrate = false;
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
            _needCalibrate = false;
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
                string head = Encoding.UTF8.GetString(all, 0, headerEnd);
                string[] lines = head.Split(new string[] { "\r\n" }, StringSplitOptions.None);
                string[] first = lines[0].Split(' ');
                string method = first.Length > 0 ? first[0].ToUpperInvariant() : "";
                string path = first.Length > 1 ? first[1] : "/";

                int contentLength = 0;
                string origin = null;
                for (int i = 1; i < lines.Length; i++)
                {
                    int c = lines[i].IndexOf(':');
                    if (c <= 0) continue;
                    string k = lines[i].Substring(0, c).Trim().ToLowerInvariant();
                    string v = lines[i].Substring(c + 1).Trim();
                    if (k == "content-length") int.TryParse(v, out contentLength);
                    else if (k == "origin") origin = v;
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

                // 所有请求记录日志，方便排查浏览器请求是否到达代理
                Log(method + " " + path + " from " + client.Client.RemoteEndPoint);

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
                else if (method == "GET" && route == "/pixel.gif")
                {
                    // 1x1 透明 GIF：供 HTTPS 网页用 <img> 探测代理是否在线（绕过混合内容限制）
                    WriteBinaryResponse(ns, 200, "image/gif", PixelGif, origin);
                }
                else if (method == "GET" && route == "/api/printers")
                {
                    WriteResponse(ns, 200, "application/json; charset=utf-8", ListPrintersJson(), origin);
                }
                else if (method == "POST" && route == "/api/config")
                {
                    string result;
                    int code = 200;
                    try
                    {
                        ApplyConfigFromJson(bodyText);
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
                else if (method == "POST" && route == "/api/print/label")
                {
                    string result;
                    int code = 200;
                    try
                    {
                        result = LabelRender.ExecuteJobText(BuildJob(bodyText));
                        _needCalibrate = false;
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
                        _needCalibrate = false;
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
                else if (method == "POST" && route == "/api/print/test")
                {
                    string result;
                    int code = 200;
                    try
                    {
                        string testJson = "{\"labels\":[{\"qrValue\":\"MQ-TEST-001\",\"variant\":\"FULL\",\"header\":true,\"copies\":1," +
                          "\"data\":{\"itemNo\":\"MQ-TEST-001\",\"companyName\":\"Mint Chance Textile Co.,Ltd\"," +
                          "\"composition\":\"65% Cotton 35% Polyester\",\"construction\":\"Knitted\",\"width\":\"150cm\"," +
                          "\"weight\":\"120g/m2\",\"remark\":\"打印代理自检标签\"}}]}";
                        result = LabelRender.ExecuteJobText(BuildJob(testJson));
                        _needCalibrate = false;
                    }
                    catch (Exception ex)
                    {
                        Log("测试打印失败: " + ex.Message);
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

    /// <summary>从 POST /api/config 的 JSON 体更新配置并保存</summary>
    private static void ApplyConfigFromJson(string json)
    {
        JavaScriptSerializer ser = new JavaScriptSerializer { MaxJsonLength = int.MaxValue };
        IDictionary<string, object> d = ser.Deserialize<IDictionary<string, object>>(json);
        if (d == null) throw new InvalidOperationException("请求体不是合法 JSON");

        string printerName = Str(d, "printerName", _printerName);
        IDictionary<string, object> lb = Obj(d, "label");
        double widthMm = Dbl(lb, "widthMm", _widthMm);
        double heightMm = Dbl(lb, "heightMm", _heightMm);
        int dpi = Int(lb, "dpi", _dpi);
        double gapMm = Dbl(lb, "gapMm", _gapMm);
        double xOffsetMm = Dbl(lb, "xOffsetMm", _xOffsetMm);

        SaveConfig(printerName, widthMm, heightMm, dpi, gapMm, xOffsetMm);
        Log("配置已更新: 打印机=" + printerName + " 标签=" + widthMm + "x" + heightMm + "mm@" + dpi + "dpi 偏移=" + xOffsetMm + "mm");
    }

    /// <summary>列出本机已安装的打印机名称</summary>
    private static string ListPrintersJson()
    {
        List<string> names = new List<string>();
        try
        {
            // .NET 4.x 可用 PrinterSettings 列举，无需引用 System.Printing
            foreach (string name in System.Drawing.Printing.PrinterSettings.InstalledPrinters)
            {
                names.Add(name);
            }
        }
        catch (Exception ex) { Log("列举打印机失败: " + ex.Message); }

        StringBuilder sb = new StringBuilder("{\"ok\":true,\"printers\":[");
        for (int i = 0; i < names.Count; i++)
        {
            if (i > 0) sb.Append(',');
            sb.Append(Quote(names[i]));
        }
        sb.Append("]}");
        return sb.ToString();
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
        job["label"] = label;
        return ser.Serialize(job);
    }

    private static string StatusJson()
    {
        return "{\"ok\":true,\"agent\":\"mq-print-agent\",\"port\":" + _port +
               ",\"printer\":{\"mode\":\"windows-raw\",\"printerName\":" + Quote(_printerName) +
               ",\"label\":{\"widthMm\":" + _widthMm.ToString(CultureInfo.InvariantCulture) +
               ",\"heightMm\":" + _heightMm.ToString(CultureInfo.InvariantCulture) +
               ",\"dpi\":" + _dpi +
               ",\"gapMm\":" + _gapMm.ToString(CultureInfo.InvariantCulture) +
               ",\"xOffsetMm\":" + _xOffsetMm.ToString(CultureInfo.InvariantCulture) +
               ",\"calibrateCmd\":" + Quote(_calibrateCmd) + "}}}";
    }

    private static string StatusPage()
    {
        string printer = HtmlEncode(_printerName);
        string w = _widthMm.ToString(CultureInfo.InvariantCulture);
        string h = _heightMm.ToString(CultureInfo.InvariantCulture);
        string gap = _gapMm.ToString(CultureInfo.InvariantCulture);
        string xoff = _xOffsetMm.ToString(CultureInfo.InvariantCulture);
        bool auto = IsAutoStart();

        return "<!doctype html><html lang=\"zh-CN\"><head><meta charset=\"utf-8\">" +
               "<meta name=\"viewport\" content=\"width=device-width, initial-scale=1\">" +
               "<meta http-equiv=\"Cache-Control\" content=\"no-cache, no-store, must-revalidate\">" +
               "<meta http-equiv=\"Pragma\" content=\"no-cache\">" +
               "<meta http-equiv=\"Expires\" content=\"0\">" +
               "<title>敏群打印代理</title><style>" +
               "*{box-sizing:border-box;margin:0;padding:0}" +
               "body{font-family:'Microsoft YaHei',sans-serif;background:#f0f4f8;color:#1e293b;padding:20px}" +
               ".card{max-width:560px;margin:0 auto;background:#fff;border-radius:16px;padding:28px;box-shadow:0 1px 3px rgba(0,0,0,.08)}" +
               "h1{font-size:22px;margin-bottom:4px}" +
               ".ok{color:#059669;font-weight:600;font-size:14px;margin-bottom:24px}" +
               "h2{font-size:16px;margin:24px 0 12px;color:#334155;border-bottom:2px solid #e2e8f0;padding-bottom:6px}" +
               "label{display:block;font-size:13px;color:#64748b;margin-bottom:4px;font-weight:500}" +
               "input,select{width:100%;padding:8px 12px;border:1px solid #cbd5e1;border-radius:8px;font-size:14px;margin-bottom:14px;background:#fff;outline:none}" +
               "input:focus,select:focus{border-color:#3b82f6}" +
               ".row{display:flex;gap:12px}" +
               ".row>div{flex:1}" +
               "button{padding:10px 20px;border:none;border-radius:8px;font-size:14px;font-weight:500;cursor:pointer;transition:background .15s}" +
               ".btn-primary{background:#123c5a;color:#fff;width:100%;margin-top:6px}" +
               ".btn-primary:hover{background:#1e5a8a}" +
               ".btn-secondary{background:#f1f5f9;color:#334155}" +
               ".btn-secondary:hover{background:#e2e8f0}" +
               ".btn-green{background:#059669;color:#fff}" +
               ".btn-green:hover{background:#047857}" +
               ".btn-amber{background:#d97706;color:#fff}" +
               ".btn-amber:hover{background:#b45309}" +
               ".actions{display:flex;gap:10px;flex-wrap:wrap}" +
               ".actions button{flex:1;min-width:120px}" +
               ".msg{margin-top:12px;padding:10px 14px;border-radius:8px;font-size:13px;display:none}" +
               ".msg.show{display:block}" +
               ".msg-ok{background:#d1fae5;color:#065f46}" +
               ".msg-err{background:#fee2e2;color:#991b1b}" +
               ".info{margin-top:20px;padding:14px;background:#f8fafc;border-radius:8px;font-size:12px;color:#64748b;line-height:1.6}" +
               "</style></head><body><div class=\"card\">" +
               "<h1>敏群商贸 ERP 本地打印代理</h1>" +
               "<p class=\"ok\">● 运行中（端口 " + _port + "）</p>" +

               "<h2>打印设置</h2>" +
               "<label>打印机</label>" +
               "<select id=\"printerName\"><option value=\"\">加载中…</option></select>" +
               "<div class=\"row\">" +
                 "<div><label>标签宽 (mm)</label><input id=\"widthMm\" type=\"number\" step=\"1\" value=\"" + w + "\"/></div>" +
                 "<div><label>标签高 (mm)</label><input id=\"heightMm\" type=\"number\" step=\"1\" value=\"" + h + "\"/></div>" +
               "</div>" +
               "<div class=\"row\">" +
                 "<div><label>DPI</label><input id=\"dpi\" type=\"number\" step=\"1\" value=\"" + _dpi + "\"/></div>" +
                 "<div><label>标签间隙 (mm)</label><input id=\"gapMm\" type=\"number\" step=\"0.5\" value=\"" + gap + "\"/></div>" +
               "</div>" +
               "<label>横向偏移补偿 (mm) — 内容偏左就加大，偏右就减小</label>" +
               "<input id=\"xOffsetMm\" type=\"number\" step=\"1\" value=\"" + xoff + "\"/>" +
               "<button class=\"btn-primary\" onclick=\"saveConfig()\">保存设置</button>" +
               "<div id=\"msg\" class=\"msg\"></div>" +

               "<h2>操作</h2>" +
               "<div class=\"actions\">" +
                 "<button class=\"btn-green\" onclick=\"testPrint()\">打印测试标签</button>" +
                 "<button class=\"btn-amber\" onclick=\"calibrate()\">校准标签定位</button>" +
               "</div>" +

               "<h2>系统</h2>" +
               "<div class=\"actions\">" +
                 "<button class=\"btn-secondary\" onclick=\"toggleAuto()\" id=\"autoBtn\">" + (auto ? "✓ 开机自启已开启" : "开机自启已关闭") + "</button>" +
               "</div>" +

               "<div class=\"info\">" +
                 "<b>使用说明</b><br/>" +
                 "1. 选择本机已安装的标签打印机（如 Argox CP-2140M PPLB）<br/>" +
                 "2. 标签尺寸默认 70×40mm @203dpi，与需求规格一致<br/>" +
                 "3. 换电脑/换纸后先点「校准标签定位」，再「打印测试标签」<br/>" +
                 "4. 如果内容偏左，加大「横向偏移补偿」；偏右则减小<br/>" +
                 "5. 保存后设置立即生效，重启代理也不丢失" +
               "</div>" +
               "</div>" +

               "<script>" +
               "function $(id){return document.getElementById(id)}" +
               "function showMsg(text,ok){" +
                 "var e=$('msg');e.textContent=text;e.className='msg show '+(ok?'msg-ok':'msg-err')" +
               "}" +
               // 加载打印机列表（带超时，避免一直卡在"加载中"）
               "function fetchTimeout(url,ms){" +
                 "return Promise.race([fetch(url),new Promise(function(_,rej){setTimeout(function(){rej(new Error('timeout'))},ms)})])" +
               "}" +
               "fetchTimeout('/api/printers',5000).then(function(r){return r.json()}).then(function(d){" +
                 "var sel=$('printerName');sel.innerHTML='';" +
                 "if(!d.ok){sel.innerHTML='<option value=\"\">'+(d.error||'加载失败')+'</option>';return}" +
                 "if(!d.printers||!d.printers.length){sel.innerHTML='<option value=\"\">未检测到打印机</option>';return}" +
                 "d.printers.forEach(function(n){" +
                   "var o=document.createElement('option');o.value=n;o.textContent=n;" +
                   "sel.appendChild(o)" +
                 "});" +
                 "// 选中当前打印机" +
                 "for(var i=0;i<sel.options.length;i++){" +
                   "if(sel.options[i].value===\"" + printer.Replace("\\", "\\\\").Replace("\"", "\\\"") + "\")" +
                     "sel.options[i].selected=true" +
                 "}" +
               "}).catch(function(e){" +
                 "$('printerName').innerHTML='<option value=\"\">加载失败：'+(e.message||'')+'</option>'" +
               "});" +

               "function saveConfig(){" +
                 "var body=JSON.stringify({" +
                   "printerName:$('printerName').value," +
                   "label:{" +
                     "widthMm:parseFloat($('widthMm').value)," +
                     "heightMm:parseFloat($('heightMm').value)," +
                     "dpi:parseInt($('dpi').value)," +
                     "gapMm:parseFloat($('gapMm').value)," +
                     "xOffsetMm:parseFloat($('xOffsetMm').value)" +
                   "}" +
                 "});" +
                 "fetch('/api/config',{method:'POST',headers:{'Content-Type':'application/json'},body:body})" +
                   ".then(function(r){return r.json()})" +
                   ".then(function(d){" +
                     "if(d.ok) showMsg('设置已保存，立即生效',true);" +
                     "else showMsg('保存失败：'+(d.error||''),false)" +
                   "}).catch(function(e){showMsg('保存失败：'+e,false)})" +
               "}" +

               "function testPrint(){" +
                 "fetch('/api/print/test',{method:'POST',headers:{'Content-Type':'application/json'},body:'{}'})" +
                   ".then(function(r){return r.json()})" +
                   ".then(function(d){" +
                     "if(d.ok) showMsg('测试标签已发送到打印机',true);" +
                     "else showMsg('打印失败：'+(d.error||''),false)" +
                   "}).catch(function(e){showMsg('打印失败：'+e,false)})" +
               "}" +

               "function calibrate(){" +
                 "fetch('/api/print/calibrate',{method:'POST',headers:{'Content-Type':'application/json'},body:'{}'})" +
                   ".then(function(r){return r.json()})" +
                   ".then(function(d){" +
                     "if(d.ok) showMsg('已发送测纸指令，打印机会走纸对齐标签起点',true);" +
                     "else showMsg('校准失败：'+(d.error||''),false)" +
                   "}).catch(function(e){showMsg('校准失败：'+e,false)})" +
               "}" +

               "function toggleAuto(){" +
                 "// 通过注册表切换，这里只提示用户在托盘菜单操作" +
                 "alert('请在屏幕右下角托盘图标上右键 → 勾选/取消「开机自动启动」')" +
               "}" +
               "</script></body></html>";
    }

    private static void WriteResponse(NetworkStream ns, int status, string contentType, string body, string origin)
    {
        byte[] data = Encoding.UTF8.GetBytes(body ?? "");
        StringBuilder sb = new StringBuilder();
        sb.Append("HTTP/1.1 ").Append(status).Append(' ').Append(StatusText(status)).Append("\r\n");
        sb.Append("Content-Type: ").Append(contentType).Append("\r\n");
        sb.Append("Content-Length: ").Append(data.Length).Append("\r\n");
        sb.Append("Access-Control-Allow-Origin: ").Append(string.IsNullOrEmpty(origin) ? "*" : origin).Append("\r\n");
        sb.Append("Access-Control-Allow-Methods: GET,POST,OPTIONS\r\n");
        sb.Append("Access-Control-Allow-Headers: Content-Type\r\n");
        // 部署在服务器上的 ERP 网页访问本代理属于「本地网络访问（PNA/LNA）」，
        // Chrome/Edge 的预检要求该响应头，缺失时请求被拦截（表现为点了打印没反应）。
        sb.Append("Access-Control-Allow-Private-Network: true\r\n");
        sb.Append("Vary: Origin\r\n");
        sb.Append("Cache-Control: no-store\r\n");
        sb.Append("Connection: close\r\n\r\n");
        byte[] head = Encoding.ASCII.GetBytes(sb.ToString());
        ns.Write(head, 0, head.Length);
        if (data.Length > 0) ns.Write(data, 0, data.Length);
        ns.Flush();
    }

    /// <summary>发送二进制响应（如 GIF 图片），供 HTTPS 网页 <img> 探测</summary>
    private static void WriteBinaryResponse(NetworkStream ns, int status, string contentType, byte[] data, string origin)
    {
        StringBuilder sb = new StringBuilder();
        sb.Append("HTTP/1.1 ").Append(status).Append(' ').Append(StatusText(status)).Append("\r\n");
        sb.Append("Content-Type: ").Append(contentType).Append("\r\n");
        sb.Append("Content-Length: ").Append(data.Length).Append("\r\n");
        sb.Append("Access-Control-Allow-Origin: ").Append(string.IsNullOrEmpty(origin) ? "*" : origin).Append("\r\n");
        sb.Append("Access-Control-Allow-Methods: GET,POST,OPTIONS\r\n");
        sb.Append("Access-Control-Allow-Headers: Content-Type\r\n");
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

    private static string Str(IDictionary<string, object> d, string k, string def)
    {
        if (d == null) return def;
        object v;
        if (!d.TryGetValue(k, out v) || v == null) return def;
        string s = Convert.ToString(v, CultureInfo.InvariantCulture);
        return string.IsNullOrEmpty(s) ? def : s;
    }

    private static bool Bool(IDictionary<string, object> d, string k, bool def)
    {
        if (d == null) return def;
        object v;
        if (!d.TryGetValue(k, out v) || v == null) return def;
        if (v is bool) return (bool)v;
        string s = Convert.ToString(v, CultureInfo.InvariantCulture);
        return s == "true" || s == "1";
    }

    private static int Int(IDictionary<string, object> d, string k, int def)
    {
        if (d == null) return def;
        object v;
        if (!d.TryGetValue(k, out v) || v == null) return def;
        int n;
        return int.TryParse(Convert.ToString(v, CultureInfo.InvariantCulture), NumberStyles.Integer, CultureInfo.InvariantCulture, out n) ? n : def;
    }

    private static double Dbl(IDictionary<string, object> d, string k, double def)
    {
        if (d == null) return def;
        object v;
        if (!d.TryGetValue(k, out v) || v == null) return def;
        double n;
        return double.TryParse(Convert.ToString(v, CultureInfo.InvariantCulture), NumberStyles.Float, CultureInfo.InvariantCulture, out n) ? n : def;
    }

    private static IDictionary<string, object> Obj(IDictionary<string, object> d, string k)
    {
        if (d == null) return null;
        object v;
        if (!d.TryGetValue(k, out v)) return null;
        return v as IDictionary<string, object>;
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

    private static void Log(string msg)
    {
        try
        {
            File.AppendAllText(_logPath, DateTime.Now.ToString("yyyy-MM-dd HH:mm:ss") + "  " + msg + "\r\n", Encoding.UTF8);
        }
        catch { }
    }
}
