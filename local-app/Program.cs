using System;
using System.Collections.Generic;
using System.Diagnostics;
using System.Drawing;
using System.Drawing.Printing;
using System.IO;
using System.Net;
using System.Net.Sockets;
using System.Reflection;
using System.Runtime.InteropServices;
using System.Text;
using System.Threading;
using System.Web.Script.Serialization;
using System.Windows.Forms;

/// <summary>
/// 敏群商贸 ERP · 本地版（单文件 exe）
///
/// 一个 exe 干三件事：
///   1. 本机 http://127.0.0.1:8788 提供与服务器版**完全一致**的 ERP 页面（页面已内嵌进 exe）；
///   2. 把 /api、/uploads、/health 反向代理到服务器后端 —— 数据仍来自服务器，实时一致；
///   3. 本机 http://127.0.0.1:8790 内建打印服务：网页点「直接打印」→ 渲染 70×40mm 整张位图 →
///      包成 PPLB 原生指令 → winspool 以 RAW 类型直发本机已安装的打印机驱动（与原版
///      HSTIP_SHMQ 的 hsReport19_3.bpl 走同一条通道：OpenPrinter/StartDocPrinter(RAW)/WritePrinter）。
///
/// 关键点：打印不走驱动渲染、不读系统纸张/缩放/份数设置，参数全部由程序写死，
///        所以「点击就能打」且所有电脑输出一致；不再需要单独运行打印代理。
///
/// 渲染与指令封装直接复用 print-agent 的 LabelRender.cs，保证与既有输出 100% 相同。
/// </summary>
internal static class LocalErp
{
    private sealed class Req
    {
        public string Method = "GET";
        public string Path = "/";
        public readonly Dictionary<string, string> Headers = new Dictionary<string, string>(StringComparer.OrdinalIgnoreCase);
        public byte[] Body = new byte[0];
    }

    private sealed class Conn
    {
        public TcpClient Client;
        public bool IsPrintPort;   // true = 打印服务端口（8790），false = 页面端口（8788）
    }

    private static readonly object LogLock = new object();

    // ===== 页面服务参数 =====
    private static int _pagePort = 8788;
    private static string _target = "http://195.72.185.32:7776";
    private static bool _openBrowser = true;
    private static string _homePath = "/print/labels";

    // ===== 打印参数（与 print-agent 完全一致，可在 config.json 里改） =====
    private static int _printPort = 8790;
    private static string _printerName = "Argox CP-2140M PPLB";
    private static double _widthMm = 70, _heightMm = 40;
    private static int _dpi = 203;
    private static double _gapMm = 2;       // 标签间隙，成卷间隙纸必须填实际缝隙宽度
    private static double _xOffsetMm = 16;  // 横向偏移补偿：居中装 70mm 标签时打印头左基准偏左 16mm
    private static string _calibrateCmd = "xa\n";  // PPLB 测纸（自动校准）指令
    // 打印方向：PPLB 的 Z 命令，ZT = 正常、ZB = 上下颠倒。每张都下发，不再依赖打印机存储的方向
    private static string _printDirection = "ZT";
    // 首次打印前先测纸一次：仅在从未校准过（calibrated.pref 不存在）时为 true，
    // 完成后落盘，重启不再自动走纸；换纸/换机器用托盘菜单或状态页手动触发
    private static bool _needCalibrate = true;

    private static readonly Dictionary<string, byte[]> Web = new Dictionary<string, byte[]>(StringComparer.OrdinalIgnoreCase);
    private static readonly List<TcpListener> Listeners = new List<TcpListener>();
    private static NotifyIcon _tray;
    private static string _dir, _logPath, _configPath, _calibPath, _pageUrl;

    /// <summary>标记本机已完成定位校准并落盘，后续启动不再自动走纸测纸</summary>
    private static void MarkCalibrated()
    {
        _needCalibrate = false;
        try { File.WriteAllText(_calibPath, "1"); } catch { }
    }

    [STAThread]
    private static void Main()
    {
        bool createdNew;
        using (Mutex mutex = new Mutex(true, "MQLocalErp", out createdNew))
        {
            if (!createdNew)
            {
                MessageBox.Show("本地版已在运行（请查看屏幕右下角托盘图标）。", "敏群商贸 ERP 本地版",
                    MessageBoxButtons.OK, MessageBoxIcon.Information);
                return;
            }

            _dir = AppDomain.CurrentDomain.BaseDirectory;
            _logPath = Path.Combine(_dir, "local-erp.log");
            _configPath = Path.Combine(_dir, "config.json");
            _calibPath = Path.Combine(_dir, "calibrated.pref");
            LoadConfig(_configPath);
            // 本机已校准过（定位结果存在打印机里、断电不丢）就不再于每次启动后走纸测纸，
            // 换纸/换机器时用托盘菜单或状态页的「校准标签定位」手动触发
            try
            {
                if (File.Exists(_calibPath) && File.ReadAllText(_calibPath).Trim() == "1") _needCalibrate = false;
            }
            catch { }
            LoadEmbeddedWeb();
            _pageUrl = "http://127.0.0.1:" + _pagePort + _homePath;

            if (!TryListen(IPAddress.Loopback, _pagePort, false))
            {
                Log("[错误] 页面端口 " + _pagePort + " 无法监听（可能被占用）");
                MessageBox.Show("页面端口 " + _pagePort + " 无法监听（可能已被占用）。\n请修改 config.json 里的 port 后重试。",
                    "敏群商贸 ERP 本地版", MessageBoxButtons.OK, MessageBoxIcon.Error);
                return;
            }

            // 打印端口：IPv4/IPv6 回环各起一个，兼容浏览器把 localhost 解析成 ::1 的情况
            bool printOk = TryListen(IPAddress.Loopback, _printPort, true);
            if (TryListen(IPAddress.IPv6Loopback, _printPort, true)) printOk = true;

            Log("已启动 页面=" + _pageUrl + " 数据源=" + _target + " 打印端口=" + _printPort +
                (printOk ? "" : "(未启动)") + " 打印机=" + _printerName + " 内嵌页面=" + Web.Count + " 个文件");

            SetupTray();
            foreach (TcpListener listener in Listeners) StartAcceptLoop(listener);
            CheckPrinter();
            if (_openBrowser) TryOpenBrowser(_pageUrl);
            Application.Run();
            StopListeners();
        }
    }

    private static void StartAcceptLoop(TcpListener listener)
    {
        Thread thread = new Thread(delegate () { AcceptLoop(listener); });
        thread.IsBackground = true;
        thread.Start();
    }

    private static void StopListeners()
    {
        foreach (TcpListener listener in Listeners) { try { listener.Stop(); } catch { } }
        Listeners.Clear();
    }

    // ===== 托盘图标（替代命令行窗口：无黑窗口，双击开页面，右键可退出） =====

    private static void SetupTray()
    {
        _tray = new NotifyIcon();
        _tray.Icon = MakeIcon(Color.FromArgb(16, 185, 129));
        _tray.Text = "敏群ERP本地版（运行中 :" + _pagePort + "）";
        _tray.Visible = true;

        ContextMenuStrip menu = new ContextMenuStrip();
        menu.Items.Add("打开页面", null, delegate { TryOpenBrowser(_pageUrl); });
        menu.Items.Add("打印测试标签", null, delegate { PrintTestLabel(); });
        menu.Items.Add("校准标签定位", null, delegate { CalibrateLabel(); });
        menu.Items.Add("打印机诊断", null, delegate { DiagnosePrinter(); });
        menu.Items.Add(new ToolStripSeparator());
        menu.Items.Add("打开配置文件", null, delegate { OpenFile(_configPath, null); });
        menu.Items.Add("查看日志", null, delegate { OpenFile(_logPath, "notepad.exe"); });
        menu.Items.Add(new ToolStripSeparator());
        menu.Items.Add("退出", null, delegate
        {
            _tray.Visible = false;
            Application.Exit();
        });
        _tray.ContextMenuStrip = menu;
        _tray.DoubleClick += delegate { TryOpenBrowser(_pageUrl); };
    }

    private static Icon MakeIcon(Color dot)
    {
        using (Bitmap bmp = new Bitmap(16, 16))
        {
            using (Graphics g = Graphics.FromImage(bmp))
            {
                g.SmoothingMode = System.Drawing.Drawing2D.SmoothingMode.AntiAlias;
                using (Brush bg = new SolidBrush(Color.FromArgb(18, 60, 90))) g.FillRectangle(bg, 0, 0, 16, 16);
                using (Brush fg = new SolidBrush(Color.White)) g.FillRectangle(fg, 3, 5, 10, 3);
                using (Brush fg = new SolidBrush(dot)) g.FillEllipse(fg, 8, 8, 7, 7);
            }
            return Icon.FromHandle(bmp.GetHicon());
        }
    }

    private static void OpenFile(string path, string app)
    {
        try
        {
            if (app == null) Process.Start(path);
            else Process.Start(app, path);
        }
        catch (Exception ex) { Log("[提示] 打开文件失败 " + path + "：" + ex.Message); }
    }

    /// <summary>托盘菜单：打印一张自检标签（不经过网页，用于快速验证打印机链路）</summary>
    private static void PrintTestLabel()
    {
        try
        {
            string testJson = "{\"labels\":[{\"qrValue\":\"MQ-TEST-001\",\"variant\":\"FULL\",\"header\":true,\"copies\":1," +
                "\"data\":{\"itemNo\":\"MQ-TEST-001\",\"companyName\":\"Mint Chance Textile Co.,Ltd\"," +
                "\"composition\":\"65% Cotton 35% Polyester\",\"construction\":\"Knitted\",\"width\":\"150cm\"," +
                "\"weight\":\"120g/m2\",\"remark\":\"本地版打印自检\"}}]}";
            LabelRender.ExecuteJobText(BuildJob(testJson));
            MarkCalibrated();
            Log("自检标签已发送");
            Log("[诊断] " + PrinterDiag());
            Balloon("测试标签已发送到打印机", ToolTipIcon.Info);
        }
        catch (Exception ex)
        {
            Log("[错误] 自检打印失败：" + ex.Message);
            Balloon("打印失败：" + ex.Message, ToolTipIcon.Error);
        }
    }

    private static void CalibrateLabel()
    {
        try
        {
            LabelRender.CalibrateMedia(_printerName, _calibrateCmd);
            MarkCalibrated();
            Log("已发送测纸指令");
            Balloon("已发送测纸指令，打印机会走纸对齐标签起点", ToolTipIcon.Info);
        }
        catch (Exception ex)
        {
            Log("[错误] 测纸失败：" + ex.Message);
            Balloon("校准失败：" + ex.Message, ToolTipIcon.Error);
        }
    }

    private static void Balloon(string text, ToolTipIcon icon)
    {
        try { _tray.ShowBalloonTip(5000, "敏群商贸 ERP 本地版", text, icon); } catch { }
    }

    /// <summary>检查打印机名是否与本机「设备和打印机」中的条目一致，不一致时提示并把全部名字写进日志</summary>
    private static void CheckPrinter()
    {
        try
        {
            List<string> installed = InstalledPrinters();
            foreach (string name in installed)
            {
                if (string.Equals(name, _printerName, StringComparison.OrdinalIgnoreCase))
                {
                    Log("打印机已就绪：" + _printerName);
                    return;
                }
            }
            Log("[警告] 本机没有名为「" + _printerName + "」的打印机，打印会失败。本机已安装：" + string.Join("；", installed.ToArray()));
            Balloon("未找到打印机「" + _printerName + "」。\n请在 config.json 修改 printerName（本机打印机名见日志）。", ToolTipIcon.Warning);
        }
        catch (Exception ex) { Log("[警告] 读取打印机列表失败：" + ex.Message); }
    }

    // ---------------- 启动 / 配置 ----------------

    private static bool TryListen(IPAddress address, int port, bool isPrintPort)
    {
        TcpListener listener = null;
        try
        {
            listener = new TcpListener(address, port);
            listener.Start();
            Listeners.Add(listener);
            // 把角色记在队列里：Accept 循环需要知道这条连接属于哪个端口
            _roles[listener] = isPrintPort;
            return true;
        }
        catch (Exception ex)
        {
            if (listener != null) { try { listener.Stop(); } catch { } }
            Log("[警告] 监听 " + address + ":" + port + " 失败：" + ex.Message);
            return false;
        }
    }

    private static readonly Dictionary<TcpListener, bool> _roles = new Dictionary<TcpListener, bool>();

    private static void AcceptLoop(TcpListener listener)
    {
        bool isPrintPort = _roles.ContainsKey(listener) && _roles[listener];
        while (true)
        {
            TcpClient client;
            try { client = listener.AcceptTcpClient(); }
            catch (Exception ex) { Log("[错误] 接受连接失败：" + ex.Message); return; }
            Conn conn = new Conn { Client = client, IsPrintPort = isPrintPort };
            Thread thread = new Thread(Serve);
            thread.IsBackground = true;
            thread.Start(conn);
        }
    }

    private static List<string> InstalledPrinters()
    {
        List<string> list = new List<string>();
        foreach (string name in PrinterSettings.InstalledPrinters) list.Add(name);
        return list;
    }

    private static void LoadConfig(string path)
    {
        if (!File.Exists(path)) return;
        try
        {
            JavaScriptSerializer ser = new JavaScriptSerializer();
            IDictionary<string, object> cfg = ser.Deserialize<IDictionary<string, object>>(File.ReadAllText(path, Encoding.UTF8));
            if (cfg == null) return;

            object value;
            if (cfg.TryGetValue("port", out value) && value != null) _pagePort = Convert.ToInt32(value);
            if (cfg.TryGetValue("apiTarget", out value) && value != null) _target = Convert.ToString(value).Trim().TrimEnd('/');
            if (cfg.TryGetValue("open", out value) && value != null) _openBrowser = Convert.ToBoolean(value);
            if (cfg.TryGetValue("homePath", out value) && value != null) _homePath = Convert.ToString(value);

            IDictionary<string, object> printer = cfg.ContainsKey("printer") ? cfg["printer"] as IDictionary<string, object> : null;
            if (printer == null) return;
            if (printer.ContainsKey("port") && printer["port"] != null) _printPort = Convert.ToInt32(printer["port"]);
            if (printer.ContainsKey("printerName") && printer["printerName"] != null) _printerName = Convert.ToString(printer["printerName"]);
            IDictionary<string, object> label = printer.ContainsKey("label") ? printer["label"] as IDictionary<string, object> : null;
            if (label == null) return;
            if (label.ContainsKey("widthMm") && label["widthMm"] != null) _widthMm = Convert.ToDouble(label["widthMm"]);
            if (label.ContainsKey("heightMm") && label["heightMm"] != null) _heightMm = Convert.ToDouble(label["heightMm"]);
            if (label.ContainsKey("dpi") && label["dpi"] != null) _dpi = Convert.ToInt32(label["dpi"]);
            if (label.ContainsKey("gapMm") && label["gapMm"] != null) _gapMm = Convert.ToDouble(label["gapMm"]);
            if (label.ContainsKey("xOffsetMm") && label["xOffsetMm"] != null) _xOffsetMm = Convert.ToDouble(label["xOffsetMm"]);
            if (label.ContainsKey("calibrateCmd") && label["calibrateCmd"] != null) _calibrateCmd = Convert.ToString(label["calibrateCmd"]);
            if (label.ContainsKey("printDirection") && label["printDirection"] != null) _printDirection = Convert.ToString(label["printDirection"]).ToUpperInvariant();
        }
        catch (Exception ex)
        {
            Log("[警告] config.json 解析失败，改用内置默认值：" + ex.Message);
        }
    }

    private static void LoadEmbeddedWeb()
    {
        Assembly assembly = Assembly.GetExecutingAssembly();
        foreach (string name in assembly.GetManifestResourceNames())
        {
            string normalized = name.Replace('\\', '/');
            int index = normalized.IndexOf("web/", StringComparison.OrdinalIgnoreCase);
            if (index < 0) continue;
            string key = normalized.Substring(index + 4);
            if (key.Length == 0) continue;
            try
            {
                using (Stream stream = assembly.GetManifestResourceStream(name))
                {
                    if (stream == null) continue;
                    using (MemoryStream buffer = new MemoryStream())
                    {
                        byte[] chunk = new byte[32768];
                        int read;
                        while ((read = stream.Read(chunk, 0, chunk.Length)) > 0) buffer.Write(chunk, 0, read);
                        Web[key] = buffer.ToArray();
                    }
                }
            }
            catch (Exception ex) { Log("[警告] 读取内嵌资源失败 " + key + "：" + ex.Message); }
        }
        if (Web.Count == 0) Log("[警告] exe 内没有内嵌页面资源，请用 build.ps1 重新构建。");
    }

    // ---------------- 请求分发 ----------------

    private static void Serve(object state)
    {
        Conn conn = (Conn)state;
        try
        {
            using (conn.Client)
            using (NetworkStream stream = conn.Client.GetStream())
            {
                conn.Client.ReceiveTimeout = 30000;
                conn.Client.SendTimeout = 120000;
                Req req = ReadRequest(stream);
                if (req == null) return;
                // 兜底：任何未预期异常也要给浏览器明确响应，避免连接被断开（页面只显示「网络失败」）
                try
                {
                    if (conn.IsPrintPort) HandlePrintApi(req, stream);
                    else HandlePage(req, stream);
                }
                catch (Exception ex)
                {
                    // 浏览器提前关连接（刷新/跳走）会抛 IO/Socket 异常，属于正常现象，不必当错误报
                    if (ex is IOException || ex is SocketException) Log("[提示] 客户端提前断开连接（可忽略）");
                    else
                    {
                        Log("[错误] 处理请求失败：" + ex.Message);
                        try { WriteRawJson(stream, 502, "{\"ok\":false,\"error\":" + JsonQuote(ex.Message) + "}", AgentHeaders()); } catch { }
                    }
                }
            }
        }
        catch (Exception ex) { Log("[错误] 连接异常：" + ex.Message); }
    }

    private static Req ReadRequest(NetworkStream stream)
    {
        byte[] terminator = new byte[] { 13, 10, 13, 10 };
        List<byte> buffer = new List<byte>(2048);
        byte[] chunk = new byte[8192];
        int headerEnd = -1;

        while (headerEnd < 0)
        {
            int read = stream.Read(chunk, 0, chunk.Length);
            if (read <= 0) return null;
            for (int i = 0; i < read; i++) buffer.Add(chunk[i]);
            headerEnd = IndexOf(buffer, terminator);
            if (headerEnd < 0 && buffer.Count > 65536) throw new Exception("请求头过大");
        }

        byte[] all = buffer.ToArray();
        string head = Encoding.UTF8.GetString(all, 0, headerEnd);
        string[] lines = head.Split(new string[] { "\r\n" }, StringSplitOptions.None);

        Req req = new Req();
        string[] requestLine = lines[0].Split(' ');
        if (requestLine.Length >= 2) { req.Method = requestLine[0].ToUpperInvariant(); req.Path = requestLine[1]; }
        for (int i = 1; i < lines.Length; i++)
        {
            int colon = lines[i].IndexOf(':');
            if (colon <= 0) continue;
            req.Headers[lines[i].Substring(0, colon).Trim()] = lines[i].Substring(colon + 1).Trim();
        }

        string expect;
        if (req.Headers.TryGetValue("expect", out expect) && expect.ToLowerInvariant().Contains("100-continue"))
        {
            byte[] go = Encoding.ASCII.GetBytes("HTTP/1.1 100 Continue\r\n\r\n");
            stream.Write(go, 0, go.Length);
            stream.Flush();
        }

        int contentLength = 0;
        string rawLength;
        if (req.Headers.TryGetValue("content-length", out rawLength)) int.TryParse(rawLength, out contentLength);
        byte[] body = new byte[contentLength];
        int filled = all.Length - headerEnd - 4;
        if (filled > contentLength) filled = contentLength;
        if (filled > 0) Array.Copy(all, headerEnd + 4, body, 0, filled);
        while (filled < contentLength)
        {
            int read = stream.Read(body, filled, contentLength - filled);
            if (read <= 0) break;
            filled += read;
        }
        req.Body = body;
        return req;
    }

    // ---------------- 页面端口：静态页面 + 反向代理 ----------------

    private static void HandlePage(Req req, NetworkStream stream)
    {
        string path = req.Path.Split('?')[0];
        if (path == "/__local/printers")
        {
            WriteResponse(stream, 200, "text/html; charset=utf-8", Encoding.UTF8.GetBytes(PrinterDiagHtml()), null);
            return;
        }
        // 诊断页按钮的同源转发：/__local/agent/api/xxx → 本机打印服务的 /api/xxx
        if (path.StartsWith("/__local/agent/"))
        {
            Req inner = new Req();
            inner.Method = req.Method;
            inner.Path = req.Path.Substring("/__local/agent".Length);
            inner.Body = req.Body;
            HandlePrintApi(inner, stream);
            return;
        }
        if (path == "/__local/status")
        {
            string json = "{\"ok\":true,\"mode\":\"local-exe\",\"pagePort\":" + _pagePort + ",\"apiTarget\":\"" + _target +
                          "\",\"printPort\":" + _printPort + ",\"printerName\":" + JsonQuote(_printerName) + "}";
            WriteRawJson(stream, 200, json, null);
            return;
        }
        if (path.StartsWith("/api/") || path.StartsWith("/uploads/") || path == "/health") { Proxy(req, stream); return; }
        ServeStatic(req, stream);
    }

    private static void Proxy(Req req, NetworkStream stream)
    {
        string url = _target + req.Path;
        HttpWebRequest upstream;
        try { upstream = (HttpWebRequest)WebRequest.Create(url); }
        catch (Exception ex) { WriteJson(stream, 502, "服务器地址无效：" + ex.Message); return; }

        upstream.Method = req.Method;
        upstream.AllowAutoRedirect = false;
        upstream.Timeout = 120000;
        upstream.ReadWriteTimeout = 120000;
        upstream.KeepAlive = false;
        upstream.Proxy = null;

        string value;
        if (req.Headers.TryGetValue("authorization", out value)) { try { upstream.Headers["Authorization"] = value; } catch { } }
        if (req.Headers.TryGetValue("accept", out value)) { try { upstream.Accept = value; } catch { } }
        if (req.Headers.TryGetValue("content-type", out value)) upstream.ContentType = value;
        if (req.Headers.TryGetValue("cookie", out value)) { try { upstream.Headers["Cookie"] = value; } catch { } }
        if (req.Headers.TryGetValue("user-agent", out value)) { try { upstream.UserAgent = value; } catch { } }
        if (req.Headers.TryGetValue("accept-encoding", out value)) { try { upstream.Headers["Accept-Encoding"] = value; } catch { } }

        if (req.Body != null && req.Body.Length > 0) upstream.ContentLength = req.Body.Length;

        // 连接失败可能在「写请求体」阶段就抛出（GetRequestStream 会立即发起连接），
        // 必须与 GetResponse 一起兜住，否则异常冒泡会导致浏览器拿到断开的连接。
        HttpWebResponse response = null;
        try
        {
            if (req.Body != null && req.Body.Length > 0)
            {
                using (Stream bodyStream = upstream.GetRequestStream()) bodyStream.Write(req.Body, 0, req.Body.Length);
            }
            response = (HttpWebResponse)upstream.GetResponse();
        }
        catch (WebException error)
        {
            response = error.Response as HttpWebResponse;
            if (response == null)
            {
                WriteJson(stream, 502, "无法连接服务器 " + _target + "：" + error.Message + "（请检查网络与服务器状态）");
                return;
            }
        }

        using (response)
        {
            byte[] body;
            using (MemoryStream buffer = new MemoryStream())
            {
                Stream source = response.GetResponseStream();
                if (source != null)
                {
                    byte[] chunk = new byte[32768];
                    int read;
                    while ((read = source.Read(chunk, 0, chunk.Length)) > 0) buffer.Write(chunk, 0, read);
                }
                body = buffer.ToArray();
            }
            Dictionary<string, string> extra = new Dictionary<string, string>();
            string encoding = response.Headers["Content-Encoding"];
            if (!string.IsNullOrEmpty(encoding)) extra["Content-Encoding"] = encoding;
            string cache = response.Headers["Cache-Control"];
            if (!string.IsNullOrEmpty(cache)) extra["Cache-Control"] = cache;
            WriteResponse(stream, (int)response.StatusCode, response.ContentType == null ? "application/octet-stream" : response.ContentType, body, extra);
        }
    }

    private static void ServeStatic(Req req, NetworkStream stream)
    {
        string path = req.Path.Split('?')[0];
        try { path = Uri.UnescapeDataString(path); } catch { }
        if (path.Length == 0 || path == "/") path = "/index.html";
        string key = path.TrimStart('/').Replace('\\', '/');

        byte[] data;
        if (!Web.TryGetValue(key, out data))
        {
            if (Path.GetExtension(key).Length > 0) { WriteText(stream, 404, "页面资源不存在：" + key); return; }
            if (!Web.TryGetValue("index.html", out data)) { WriteText(stream, 500, "exe 内缺少内嵌页面，请用 build.ps1 重新构建。"); return; }
            key = "index.html";
        }

        Dictionary<string, string> extra = new Dictionary<string, string>();
        extra["Cache-Control"] = key.Equals("index.html", StringComparison.OrdinalIgnoreCase) ? "no-store" : "public, max-age=2592000";
        WriteResponse(stream, 200, MimeFor(key), data, extra);
    }

    // ---------------- 打印端口：内建打印服务（网页点「直接打印」走这里） ----------------

    private static Dictionary<string, string> AgentHeaders()
    {
        Dictionary<string, string> headers = new Dictionary<string, string>();
        headers["Access-Control-Allow-Origin"] = "*";
        headers["Access-Control-Allow-Methods"] = "GET,POST,OPTIONS";
        headers["Access-Control-Allow-Headers"] = "Content-Type";
        // 即使页面是从服务器地址打开（非本机来源），也不被浏览器的本地网络策略拦掉
        headers["Access-Control-Allow-Private-Network"] = "true";
        return headers;
    }

    private static void HandlePrintApi(Req req, NetworkStream stream)
    {
        string path = req.Path.Split('?')[0];
        if (req.Method == "OPTIONS") { WriteResponse(stream, 204, "text/plain; charset=utf-8", new byte[0], AgentHeaders()); return; }

        if (req.Method == "GET" && path == "/api/status")
        {
            string json = "{\"ok\":true,\"agent\":\"mq-local-erp\",\"port\":" + _printPort +
                          ",\"printer\":{\"mode\":\"windows-raw\",\"printerName\":" + JsonQuote(_printerName) +
                          ",\"label\":{\"widthMm\":" + Num(_widthMm) + ",\"heightMm\":" + Num(_heightMm) +
                          ",\"dpi\":" + _dpi + ",\"gapMm\":" + Num(_gapMm) + ",\"xOffsetMm\":" + Num(_xOffsetMm) +
                          ",\"printDirection\":" + JsonQuote(_printDirection) + ",\"needCalibrate\":" + (_needCalibrate ? "true" : "false") +
                          ",\"calibrateCmd\":" + JsonQuote(_calibrateCmd) + "}}}";
            WriteRawJson(stream, 200, json, AgentHeaders());
            return;
        }

        if (req.Method == "GET" && path == "/api/printer/diag")
        {
            string diag = PrinterDiag();
            Log("[诊断] " + diag);
            WriteRawJson(stream, 200, "{\"ok\":true,\"printerName\":" + JsonQuote(_printerName) + ",\"diag\":" + JsonQuote(diag) + "}", AgentHeaders());
            return;
        }

        if (req.Method == "POST" && path == "/api/print/label")
        {
            try
            {
                string bodyText = req.Body == null || req.Body.Length == 0 ? "" : Encoding.UTF8.GetString(req.Body);
                string result = LabelRender.ExecuteJobText(BuildJob(bodyText));
                MarkCalibrated();
                Log("已提交打印作业：打印机=" + _printerName + " 结果=" + result);
                // 作业是否真的出纸，看这一行：端口/状态/打完队列还剩几个作业
                Log("[诊断] " + PrinterDiag());
                WriteRawJson(stream, 200, result, AgentHeaders());
            }
            catch (Exception ex)
            {
                Log("[错误] 打印失败：" + ex.Message);
                WriteRawJson(stream, 200, "{\"ok\":false,\"error\":" + JsonQuote(ex.Message) + "}", AgentHeaders());
            }
            return;
        }

        if (req.Method == "POST" && path == "/api/print/calibrate")
        {
            try
            {
                LabelRender.CalibrateMedia(_printerName, _calibrateCmd);
                MarkCalibrated();
                Log("已发送测纸指令");
                WriteRawJson(stream, 200, "{\"ok\":true,\"calibrated\":true}", AgentHeaders());
            }
            catch (Exception ex)
            {
                Log("[错误] 测纸失败：" + ex.Message);
                WriteRawJson(stream, 200, "{\"ok\":false,\"error\":" + JsonQuote(ex.Message) + "}", AgentHeaders());
            }
            return;
        }

        if (req.Method == "POST" && path == "/api/print/selftest")
        {
            try
            {
                string testJson = "{\"labels\":[{\"qrValue\":\"MQ-TEST-001\",\"variant\":\"FULL\",\"header\":true,\"copies\":1," +
                    "\"data\":{\"itemNo\":\"MQ-TEST-001\",\"companyName\":\"Mint Chance Textile Co.,Ltd\"," +
                    "\"composition\":\"65% Cotton 35% Polyester\",\"construction\":\"Knitted\",\"width\":\"150cm\"," +
                    "\"weight\":\"120g/m2\",\"remark\":\"本地版打印自检\"}}]}";
                string result = LabelRender.ExecuteJobText(BuildJob(testJson));
                MarkCalibrated();
                WriteRawJson(stream, 200, result, AgentHeaders());
            }
            catch (Exception ex)
            {
                WriteRawJson(stream, 200, "{\"ok\":false,\"error\":" + JsonQuote(ex.Message) + "}", AgentHeaders());
            }
            return;
        }

        WriteRawJson(stream, 404, "{\"ok\":false,\"error\":\"not found\"}", AgentHeaders());
    }

    /// <summary>给前端作业补上固定的打印机名与标签尺寸（前端无需、也无法指定）——与打印代理一致</summary>
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
        label["printDirection"] = _printDirection;
        label["calibrateCmd"] = _calibrateCmd;
        job["label"] = label;
        return ser.Serialize(job);
    }

    // ---------------- 打印机诊断（判断「已发送但不出纸」到底卡在哪） ----------------
    //
    // 说明：SendRawToPrinter 成功只代表作业被 Windows 打印队列接收，不代表出纸。
    // 下面用 GetPrinter(level 2) 读出这台打印机的 驱动/端口/状态/队列作业数：
    //   · 端口是 FILE:/nul/PORTPROMPT  → 作业被丢弃，永远不会出纸
    //   · 状态含「脱机/设备未连接/已暂停」→ 队列收下但不发给机器
    //   · 打完队列作业数 > 0        → 卡在队列里（打印机没取走）
    //   · 队列已清空且状态正常      → 数据已到设备，问题在指令语言/机型模式

    [StructLayout(LayoutKind.Sequential, CharSet = CharSet.Unicode)]
    private class PRINTER_INFO_2
    {
        public string pServerName;
        public string pPrinterName;
        public string pShareName;
        public string pPortName;
        public string pDriverName;
        public string pComment;
        public string pLocation;
        public IntPtr pDevMode;
        public string pSepFile;
        public string pPrintProcessor;
        public string pDatatype;
        public string pParameters;
        public IntPtr pSecurityDescriptor;
        public uint Attributes;
        public uint Priority;
        public uint DefaultPriority;
        public uint StartTime;
        public uint UntilTime;
        public uint Status;
        public uint cJobs;
        public uint AveragePPM;
    }

    [DllImport("winspool.drv", CharSet = CharSet.Unicode, SetLastError = true)]
    private static extern bool OpenPrinter(string pPrinterName, out IntPtr phPrinter, IntPtr pDefault);

    [DllImport("winspool.drv", SetLastError = true)]
    private static extern bool ClosePrinter(IntPtr hPrinter);

    [DllImport("winspool.drv", CharSet = CharSet.Unicode, SetLastError = true)]
    private static extern bool GetPrinter(IntPtr hPrinter, int level, IntPtr pPrinter, int cbBuf, out int pcbNeeded);

    private static string PrinterDiag()
    {
        IntPtr handle;
        if (!OpenPrinter(_printerName, out handle, IntPtr.Zero))
            return "打开打印机「" + _printerName + "」失败（错误 " + Marshal.GetLastWin32Error() + "，多为打印机名与本机不一致）";
        try
        {
            int needed;
            GetPrinter(handle, 2, IntPtr.Zero, 0, out needed);
            if (needed <= 0) return "读取打印机信息失败（错误 " + Marshal.GetLastWin32Error() + "）";
            IntPtr buffer = Marshal.AllocHGlobal(needed);
            try
            {
                int got;
                if (!GetPrinter(handle, 2, buffer, needed, out got))
                    return "读取打印机信息失败（错误 " + Marshal.GetLastWin32Error() + "）";
                PRINTER_INFO_2 info = (PRINTER_INFO_2)Marshal.PtrToStructure(buffer, typeof(PRINTER_INFO_2));
                string port = info.pPortName ?? "";
                string warn = "";
                string upper = port.ToUpperInvariant();
                if (upper.StartsWith("FILE:") || upper.StartsWith("NUL") || upper.StartsWith("PORTPROMPT"))
                    warn = "  ←★该端口不会真正出纸（作业被丢弃或需要另存为文件），请把打印机端口改到 USB/LPT/网络端口";

                return "驱动=" + info.pDriverName + " 端口=" + port + " 状态=" + StatusText(info.Status) +
                       " 队列作业数=" + info.cJobs + " 数据格式=" + info.pDatatype + warn;
            }
            finally { Marshal.FreeHGlobal(buffer); }
        }
        finally { ClosePrinter(handle); }
    }

    private static string StatusText(uint status)
    {
        if (status == 0) return "就绪(0)";
        List<string> parts = new List<string>();
        if ((status & 0x00000001) != 0) parts.Add("已暂停");
        if ((status & 0x00000002) != 0) parts.Add("错误");
        if ((status & 0x00000008) != 0) parts.Add("卡纸");
        if ((status & 0x00000010) != 0) parts.Add("缺纸");
        if ((status & 0x00000020) != 0) parts.Add("需手动进纸");
        if ((status & 0x00000080) != 0) parts.Add("脱机");
        if ((status & 0x00000200) != 0) parts.Add("忙");
        if ((status & 0x00000400) != 0) parts.Add("打印中");
        if ((status & 0x00001000) != 0) parts.Add("不可用");
        if ((status & 0x00002000) != 0) parts.Add("等待");
        if ((status & 0x00004000) != 0) parts.Add("处理中");
        if ((status & 0x00100000) != 0) parts.Add("需人工干预");
        if ((status & 0x00200000) != 0) parts.Add("内存不足");
        if ((status & 0x00400000) != 0) parts.Add("盖未关");
        if ((status & 0x02000000) != 0) parts.Add("服务器脱机");
        if ((status & 0x04000000) != 0) parts.Add("设备未连接");
        return string.Join("/", parts.ToArray()) + "(" + status + ")";
    }

    /// <summary>托盘菜单：把诊断结果写日志并打开诊断网页（网页里能看到本机所有打印机与状态）</summary>
    private static void DiagnosePrinter()
    {
        Log("[诊断] " + PrinterDiag());
        TryOpenBrowser("http://127.0.0.1:" + _pagePort + "/__local/printers");
    }

    // ===== 内置诊断网页：列出本机所有打印机 + 驱动/端口/状态/队列，并可一键测试打印 =====

    private sealed class PrinterRow
    {
        public string Name, Driver, Port, Datatype;
        public uint Status, Jobs;
    }

    private const int PRINTER_ENUM_LOCAL_AND_CONNECTIONS = 2 | 4;

    [DllImport("winspool.drv", CharSet = CharSet.Unicode, SetLastError = true)]
    private static extern bool EnumPrinters(int flags, string name, int level, IntPtr pPrinterEnum, int cbBuf, out int pcbNeeded, out int pcReturned);

    /// <summary>枚举本机全部打印机（含驱动/端口/状态/队列作业数），用于诊断</summary>
    private static List<PrinterRow> AllPrinters()
    {
        List<PrinterRow> list = new List<PrinterRow>();
        int needed = 0, returned = 0;
        EnumPrinters(PRINTER_ENUM_LOCAL_AND_CONNECTIONS, null, 2, IntPtr.Zero, 0, out needed, out returned);
        if (needed <= 0) return list;
        IntPtr buffer = Marshal.AllocHGlobal(needed);
        try
        {
            if (!EnumPrinters(PRINTER_ENUM_LOCAL_AND_CONNECTIONS, null, 2, buffer, needed, out needed, out returned)) return list;
            int size = Marshal.SizeOf(typeof(PRINTER_INFO_2));
            for (int i = 0; i < returned; i++)
            {
                PRINTER_INFO_2 info = (PRINTER_INFO_2)Marshal.PtrToStructure(new IntPtr(buffer.ToInt64() + (long)i * size), typeof(PRINTER_INFO_2));
                PrinterRow row = new PrinterRow();
                row.Name = info.pPrinterName;
                row.Driver = info.pDriverName;
                row.Port = info.pPortName;
                row.Datatype = info.pDatatype;
                row.Status = info.Status;
                row.Jobs = info.cJobs;
                list.Add(row);
            }
        }
        finally { Marshal.FreeHGlobal(buffer); }
        return list;
    }

    private static string HtmlEscape(string value)
    {
        if (value == null) return "";
        return value.Replace("&", "&amp;").Replace("<", "&lt;").Replace(">", "&gt;").Replace("\"", "&quot;");
    }

    /// <summary>诊断网页：一眼看出「已发送但不出纸」卡在哪一步</summary>
    private static string PrinterDiagHtml()
    {
        StringBuilder sb = new StringBuilder();
        bool matched = false;
        List<PrinterRow> printers = AllPrinters();
        foreach (PrinterRow row in printers)
            if (string.Equals(row.Name, _printerName, StringComparison.OrdinalIgnoreCase)) matched = true;

        sb.Append("<!doctype html><html lang=\"zh\"><head><meta charset=\"utf-8\">");
        sb.Append("<title>本地版打印机诊断</title><style>");
        sb.Append("body{font:14px/1.6 'Microsoft YaHei',SimSun,sans-serif;margin:24px;color:#1f2937}");
        sb.Append("h1{font-size:20px;margin:0 0 12px}.box{border:1px solid #e5e7eb;border-radius:10px;padding:14px;margin-bottom:16px;background:#fafafa}");
        sb.Append("table{border-collapse:collapse;width:100%;background:#fff}th,td{border:1px solid #e5e7eb;padding:8px;text-align:left;vertical-align:top}");
        sb.Append("th{background:#f3f4f6}.ok{color:#059669;font-weight:700}.bad{color:#dc2626;font-weight:700}.warn{color:#d97706;font-weight:700}");
        sb.Append("button{font-size:14px;padding:8px 14px;margin:0 8px 8px 0;border:0;border-radius:8px;background:#123c5a;color:#fff;cursor:pointer}");
        sb.Append("pre{background:#0f172a;color:#e2e8f0;padding:12px;border-radius:8px;overflow:auto;min-height:44px}");
        sb.Append("</style></head><body>");

        sb.Append("<h1>敏群ERP本地版 · 打印机诊断</h1>");
        sb.Append("<div class=\"box\">");
        sb.Append("配置的打印机名：<b>").Append(HtmlEscape(_printerName)).Append("</b> ");
        sb.Append(matched ? "<span class=\"ok\">在本机已找到</span>" : "<span class=\"bad\">本机没有这个名字（打印必然失败，请改 config.json 的 printerName）</span>");
        sb.Append("<br>数据来源：").Append(HtmlEscape(_target));
        sb.Append("　打印服务端口：").Append(_printPort);
        sb.Append("　标签：").Append(_widthMm).Append("×").Append(_heightMm).Append("mm @").Append(_dpi).Append("dpi");
        sb.Append("　间隙 ").Append(_gapMm).Append("mm　横向补偿 ").Append(_xOffsetMm).Append("mm");
        sb.Append("　打印方向 ").Append(HtmlEscape(_printDirection)).Append("（PPLB）");
        sb.Append("</div>");

        sb.Append("<div class=\"box\"><b>本机已安装的打印机</b>（端口为 FILE:/PORTPROMPT/nul 的永远不会出纸）");
        sb.Append("<table><tr><th>打印机名</th><th>驱动</th><th>端口</th><th>状态</th><th>队列作业数</th></tr>");
        foreach (PrinterRow row in printers)
        {
            string port = row.Port ?? "";
            string upper = port.ToUpperInvariant();
            bool deadPort = upper.StartsWith("FILE:") || upper.StartsWith("NUL") || upper.StartsWith("PORTPROMPT");
            sb.Append("<tr><td>").Append(string.Equals(row.Name, _printerName, StringComparison.OrdinalIgnoreCase) ? "<b>" + HtmlEscape(row.Name) + " ★</b>" : HtmlEscape(row.Name)).Append("</td>");
            sb.Append("<td>").Append(HtmlEscape(row.Driver)).Append("</td>");
            sb.Append("<td>").Append(deadPort ? "<span class=\"bad\">" + HtmlEscape(port) + "（不会出纸）</span>" : HtmlEscape(port)).Append("</td>");
            sb.Append("<td>").Append(row.Status == 0 ? "<span class=\"ok\">就绪</span>" : "<span class=\"warn\">" + HtmlEscape(StatusText(row.Status)) + "</span>").Append("</td>");
            sb.Append("<td>").Append(row.Jobs > 0 ? "<span class=\"warn\">" + row.Jobs + "（卡在队列里）</span>" : "0").Append("</td></tr>");
        }
        sb.Append("</table></div>");

        sb.Append("<div class=\"box\"><b>一键测试</b>（结果会显示在下面，同时写入 local-erp.log）<br>");
        sb.Append("<button onclick=\"act('print/selftest')\">打印测试标签</button>");
        sb.Append("<button onclick=\"act('print/calibrate')\">校准标签定位</button>");
        sb.Append("<button onclick=\"location.reload()\">刷新本页</button>");
        sb.Append("<pre id=\"out\">点上面的按钮试一下</pre></div>");

        sb.Append("<div class=\"box\"><b>怎么判断问题</b><br>");
        sb.Append("1) 点「打印测试标签」→ 标签机出纸且有内容 = 打印链路正常，问题只在页面数据；<br>");
        sb.Append("2) 出纸但空白/只有半张 → 调 config.json 的 xOffsetMm（偏左加大、偏右减小）或点「校准标签定位」；<br>");
        sb.Append("3) 完全不出纸，且上表「队列作业数」不为 0 → 作业卡在队列里：打印机脱机/未连接/被暂停，先清空队列；<br>");
        sb.Append("4) 完全不出纸，队列为 0、状态就绪 → 数据已到设备，多半是打印机语言模式不对（Argox 需为 PPLB）；<br>");
        sb.Append("5) 端口是 FILE:/PORTPROMPT → 这台打印机的端口配错了，改成 USB/LPT/网络端口。");
        sb.Append("</div>");

        // 按钮走「页面同源」转发（/__local/agent/* → 本机打印服务），避免浏览器把
        // 127.0.0.1:8788 → localhost:8790 当成本地网络访问而拦截（表现为点了按钮没反应）
        sb.Append("<script>function act(p){var o=document.getElementById('out');o.textContent='发送中…';");
        sb.Append("fetch('/__local/agent/api/'+p,{method:'POST',headers:{'Content-Type':'application/json'},body:'{}'})");
        sb.Append(".then(function(r){return r.json()}).then(function(d){o.textContent=JSON.stringify(d,null,2);setTimeout(function(){location.reload()},1500)}");
        sb.Append(".catch(function(e){o.textContent='请求失败：'+e})}</script>");
        sb.Append("</body></html>");
        return sb.ToString();
    }

    // ---------------- 输出辅助 ----------------

    private static void WriteResponse(NetworkStream stream, int status, string contentType, byte[] body, Dictionary<string, string> extra)
    {
        if (body == null) body = new byte[0];
        StringBuilder head = new StringBuilder();
        head.Append("HTTP/1.1 ").Append(status).Append(' ').Append(Reason(status)).Append("\r\n");
        head.Append("Content-Type: ").Append(contentType).Append("\r\n");
        head.Append("Content-Length: ").Append(body.Length).Append("\r\n");
        if (extra != null)
        {
            foreach (KeyValuePair<string, string> pair in extra)
                head.Append(pair.Key).Append(": ").Append(pair.Value).Append("\r\n");
        }
        head.Append("Connection: close\r\n\r\n");

        byte[] headBytes = Encoding.ASCII.GetBytes(head.ToString());
        stream.Write(headBytes, 0, headBytes.Length);
        if (body.Length > 0) stream.Write(body, 0, body.Length);
        stream.Flush();
    }

    private static void WriteRawJson(NetworkStream stream, int status, string json, Dictionary<string, string> extra)
    {
        WriteResponse(stream, status, "application/json; charset=utf-8", Encoding.UTF8.GetBytes(json ?? ""), extra);
    }

    private static void WriteText(NetworkStream stream, int status, string text)
    {
        WriteResponse(stream, status, "text/plain; charset=utf-8", Encoding.UTF8.GetBytes(text), null);
    }

    private static void WriteJson(NetworkStream stream, int status, string message)
    {
        string json = "{\"code\":" + status + ",\"message\":" + JsonQuote(message) + ",\"data\":null}";
        WriteRawJson(stream, status, json, null);
    }

    private static string JsonQuote(string value)
    {
        return new JavaScriptSerializer().Serialize(value ?? "");
    }

    private static string Num(double value)
    {
        return value.ToString(System.Globalization.CultureInfo.InvariantCulture);
    }

    private static string MimeFor(string key)
    {
        string extension = Path.GetExtension(key).ToLowerInvariant();
        switch (extension)
        {
            case ".html": return "text/html; charset=utf-8";
            case ".js": return "text/javascript; charset=utf-8";
            case ".css": return "text/css; charset=utf-8";
            case ".json": return "application/json; charset=utf-8";
            case ".svg": return "image/svg+xml";
            case ".png": return "image/png";
            case ".jpg":
            case ".jpeg": return "image/jpeg";
            case ".gif": return "image/gif";
            case ".webp": return "image/webp";
            case ".ico": return "image/x-icon";
            case ".woff": return "font/woff";
            case ".woff2": return "font/woff2";
            case ".ttf": return "font/ttf";
            default: return "application/octet-stream";
        }
    }

    private static string Reason(int status)
    {
        switch (status)
        {
            case 200: return "OK";
            case 204: return "No Content";
            case 301: return "Moved Permanently";
            case 302: return "Found";
            case 304: return "Not Modified";
            case 400: return "Bad Request";
            case 401: return "Unauthorized";
            case 403: return "Forbidden";
            case 404: return "Not Found";
            case 405: return "Method Not Allowed";
            case 429: return "Too Many Requests";
            case 500: return "Internal Server Error";
            case 502: return "Bad Gateway";
            default: return "Status";
        }
    }

    private static int IndexOf(List<byte> buffer, byte[] pattern)
    {
        for (int i = 0; i + pattern.Length <= buffer.Count; i++)
        {
            bool matched = true;
            for (int j = 0; j < pattern.Length; j++)
                if (buffer[i + j] != pattern[j]) { matched = false; break; }
            if (matched) return i;
        }
        return -1;
    }

    private static void TryOpenBrowser(string url)
    {
        try { Process.Start(url); }
        catch (Exception ex) { Log("[提示] 自动打开浏览器失败，请手动访问 " + url + "（" + ex.Message + "）"); }
    }

    /// <summary>写日志到 exe 同目录的 local-erp.log（无命令行窗口，排障看这里；托盘右键「查看日志」）</summary>
    private static void Log(string message)
    {
        string line = DateTime.Now.ToString("yyyy-MM-dd HH:mm:ss") + " " + message + Environment.NewLine;
        lock (LogLock)
        {
            try
            {
                if (File.Exists(_logPath) && new FileInfo(_logPath).Length > 2 * 1024 * 1024) File.Delete(_logPath);
                File.AppendAllText(_logPath, line, Encoding.UTF8);
            }
            catch { }
        }
    }
}
