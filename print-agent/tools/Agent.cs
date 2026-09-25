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
    // 代理启动后首次打印前先测纸一次，之后沿用定位；成功后置 false，换纸可在托盘/状态页重新校准
    private static bool _needCalibrate = true;

    private static readonly List<TcpListener> _listeners = new List<TcpListener>();
    private static NotifyIcon _tray;
    private static string _dir, _logPath, _prefPath;

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
            LoadConfig();

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
        }
        catch (Exception ex) { Log("读取 config.json 失败: " + ex.Message); }
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
               ",\"xOffsetMm\":" + _xOffsetMm.ToString(CultureInfo.InvariantCulture) + "}}}";
    }

    private static string StatusPage()
    {
        string printer = HtmlEncode(_printerName);
        return "<!doctype html><html lang=\"zh-CN\"><head><meta charset=\"utf-8\">" +
               "<title>敏群打印代理</title><style>" +
               "body{font-family:'Microsoft YaHei',sans-serif;background:#f6f8fa;margin:0;padding:40px;color:#0f172a}" +
               ".card{max-width:640px;margin:0 auto;background:#fff;border:1px solid #e2e8f0;border-radius:16px;padding:28px}" +
               "h1{font-size:20px;margin:0 0 4px}.ok{color:#059669;font-weight:600}" +
               "table{width:100%;border-collapse:collapse;margin-top:18px;font-size:14px}" +
               "td{padding:9px 0;border-bottom:1px solid #f1f5f9}td:first-child{color:#64748b;width:130px}" +
               "</style></head><body><div class=\"card\">" +
               "<h1>敏群商贸 ERP 本地打印代理</h1><p class=\"ok\">● 运行中（端口 " + _port + "）</p>" +
               "<table><tr><td>打印机</td><td>" + printer + "</td></tr>" +
               "<tr><td>标签尺寸</td><td>" + _widthMm.ToString(CultureInfo.InvariantCulture) + " × " +
               _heightMm.ToString(CultureInfo.InvariantCulture) + " mm @ " + _dpi + " dpi</td></tr>" +
               "<tr><td>标签间隙</td><td>" + (_gapMm > 0 ? _gapMm.ToString(CultureInfo.InvariantCulture) + " mm（指定）" : "自动测纸") + "</td></tr>" +
               "<tr><td>横向偏移补偿</td><td>" + _xOffsetMm.ToString(CultureInfo.InvariantCulture) + " mm</td></tr>" +
               "<tr><td>打印方式</td><td>RAW 原始指令直发（绕过驱动渲染，全机一致）</td></tr>" +
               "<tr><td>开机自启</td><td>" + (IsAutoStart() ? "已开启" : "未开启") + "</td></tr></table>" +
               "<p style=\"margin-top:20px;color:#64748b;font-size:13px\">此页面仅供确认代理状态；打印请回到 ERP 标签打印页点击「直接打印（exe）」。右键托盘图标可退出或切换开机自启。</p>" +
               "</div></body></html>";
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

    private static void Log(string msg)
    {
        try
        {
            File.AppendAllText(_logPath, DateTime.Now.ToString("yyyy-MM-dd HH:mm:ss") + "  " + msg + "\r\n", Encoding.UTF8);
        }
        catch { }
    }
}
