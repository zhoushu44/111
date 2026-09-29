// 标签打印引擎（单文件 exe，免依赖）：
//   1) 按固定 203dpi / 70x40mm 把整张标签渲染成 1-bit 位图（含中文、二维码、边框）
//   2) 包成 PPLB（Argox 原生）指令，经 winspool 以 RAW 类型直接写入打印队列
// 关键点——字体、字号、坐标、纸张尺寸全部写死，不读取任何驱动或系统打印设置，
// 且完全绕过驱动渲染，因此任何电脑输出都完全相同。
//
// 用法：
//   labelrender <job.json>                          由本地代理调用（渲染 + 直发打印）
//   labelrender <out.prn> [itemNo] [preview.png]    调试：渲染样例并输出 .prn
using System;
using System.Collections;
using System.Collections.Generic;
using System.Drawing;
using System.Drawing.Drawing2D;
using System.Drawing.Imaging;
using System.Drawing.Text;
using System.Globalization;
using System.IO;
using System.Linq;
using System.Runtime.InteropServices;
using System.Text;
using System.Text.RegularExpressions;
using System.Web.Script.Serialization;
using QRCoder;

internal static class LabelRender
{
    private const int FALLBACK_DPI = 203;
    private const double MM = 25.4;
    private const int PAD_MM = 2;   // 版心内边距
    private const int GAP_MM = 1;   // 文本列与二维码列间距
    // 标签间隙：成卷间隙纸必须填实际缝隙宽度，PPLB 靠它定位每张标签的原点
    // 填 0 = 交打印机自动测纸，定位会漂移导致内容跑出标签（表现为只打出一半）
    private const double LABEL_GAP_MM = 2;
    // 横向偏移补偿：本机 70mm 标签居中装纸时，打印头左基准与标签左边差 16mm
    // GW 起点右移该值，内容才会落在标签实际区域内（0 = 不补偿）
    private const double LABEL_X_OFFSET_MM = 16;
    private const int MIN_UNITS_PER_LINE = 6;
    private const string DEFAULT_HEADER = "Mint Chance Textile Co.,Ltd";
    private const string DEFAULT_ITEM_NO = "CN26F81059";
    // 测纸（自动校准）指令：PPLB 的 xa = Auto Calibration，会走纸 1~4 张找到标签缝隙
    // 首张打印前先发一次，打印机才会把原点对到标签起点，否则从当前纸位直接开印导致内容偏移/被切
    private const string DEFAULT_CALIBRATE_CMD = "xa\n";
    // 打印热度/浓度（PPLB 的 D 指令，0~15）。原版 HSTIP 样本文件用的是 D11，这里取同值。
    private const int DEFAULT_DARKNESS = 11;

    // 缩字号档位：从原字号逐档缩小，取第一个能整体放下的
    private static readonly double[] SCALES = { 1, 0.95, 0.9, 0.85, 0.8, 0.75, 0.7, 0.65, 0.6 };
    // 备注专属档位：备注过长时优先只缩备注字号，其他行保持不变；实在放不下才整体缩小
    private static readonly double[] REMARK_SCALES = { 1, 0.9, 0.8, 0.7, 0.6, 0.5 };
    // 各元素基准字号/行高（dots @203dpi，随档位等比缩放）
    private const int BASE_ROW_FONT = 20, BASE_ROW_LINE = 22;
    private const int BASE_ITEM_FONT = 24, BASE_ITEM_LINE = 30;
    private const int BASE_HEADER_FONT = 30, BASE_HEADER_LINE = 36;

    private static int Dots(double mm, int dpi) { return (int)Math.Round(mm * dpi / MM); }

    // XP 没有「微软雅黑」，且 GDI+ 不做字体链接（找到的字体缺字形时直接画方框），
    // 所以必须按「优先级 + 本机确实存在」挑一个能显示中文的字体，否则 XP 上中文全变方框。
    private static readonly string[] FONT_CANDIDATES = {
        "Microsoft YaHei",   // Vista 及以上中文默认字体（Win7/10/11）
        "Microsoft YaHei UI",
        "SimHei",            // 黑体，XP 简体中文自带
        "SimSun",            // 宋体，XP 简体中文自带
        "NSimSun",
        "Arial Unicode MS",
        "Arial"
    };
    private static string _fontName;

    /// <summary>挑一个本机存在的中文字体名（XP 上回退到黑体/宋体）</summary>
    private static string FontName()
    {
        if (_fontName != null) return _fontName;
        foreach (string name in FONT_CANDIDATES)
        {
            try
            {
                using (FontFamily ff = new FontFamily(name))
                {
                    if (ff.Name.Length > 0) { _fontName = name; break; }
                }
            }
            catch { }
        }
        // 候选字体全不存在时用系统默认字体族，避免构造 Font 时抛异常
        if (_fontName == null) _fontName = FontFamily.GenericSansSerif.Name;
        return _fontName;
    }

    // ===== 版式 =====

    private sealed class LaidRow
    {
        public string K;
        public int Indent;
        public double FontScale = 1;   // 本行字号缩放（备注行可独立缩小）
        public List<string> Lines = new List<string>();
    }

    private sealed class Layout
    {
        public int Pad, Gap, QrSize, TextW, ContentH;
        public int RowFont, RowLine, ItemFont, ItemLine, HeaderFont, HeaderLine, HeaderLines;
        public List<string> HeaderText;
        public bool WithHeader;
        public string Header, ItemNo;
        public List<LaidRow> Rows = new List<LaidRow>();
    }

    /// <summary>全角字符（中文、全角标点等）占 2 个字宽单位，其余占 1 个</summary>
    private static int CharUnits(int code)
    {
        return (code >= 0x1100 && code <= 0x115f) ||
               (code >= 0x2e80 && code <= 0xa4cf) ||
               (code >= 0xac00 && code <= 0xd7a3) ||
               (code >= 0xf900 && code <= 0xfaff) ||
               (code >= 0xfe30 && code <= 0xfe6f) ||
               (code >= 0xff00 && code <= 0xff60) ||
               (code >= 0xffe0 && code <= 0xffe6) ||
               (code >= 0x20000 && code <= 0x3fffd) ? 2 : 1;
    }

    private static int TextUnits(string str)
    {
        if (string.IsNullOrEmpty(str)) return 0;
        int total = 0;
        for (int i = 0; i < str.Length; i++)
        {
            int code = char.ConvertToUtf32(str, i);
            if (char.IsHighSurrogate(str[i]) && i + 1 < str.Length) i++;
            total += CharUnits(code);
        }
        return total;
    }

    /// <summary>按字宽单位折行</summary>
    private static List<string> WrapUnits(string value, int cap)
    {
        string text = (value ?? "").Replace("\r\n", "\n").Replace('\r', '\n').Replace('\n', ' ').Trim();
        if (text.Length == 0) text = "-";
        List<string> outp = new List<string>();
        string cur = "";
        int used = 0;
        for (int i = 0; i < text.Length; i++)
        {
            int code = char.ConvertToUtf32(text, i);
            string ch = char.ConvertFromUtf32(code);
            if (char.IsHighSurrogate(text[i]) && i + 1 < text.Length) i++;
            int u = CharUnits(code);
            if (used + u > cap && cur.Length > 0) { outp.Add(cur); cur = ""; used = 0; }
            cur += ch;
            used += u;
        }
        outp.Add(cur);
        return outp;
    }

    private static Layout LayoutLabel(int dpi, double widthMm, double heightMm, string header, string itemNo, string[] keys, string[] values, bool withHeader)
    {
        int W = Dots(widthMm, dpi);
        int H = Dots(heightMm, dpi);
        int pad = Dots(PAD_MM, dpi);
        int gap = Dots(GAP_MM, dpi);
        int qrSize = Math.Min((int)Math.Round(H * 0.58), (int)Math.Round(W * 0.28));
        int textW = Math.Max(40, W - pad * 2 - gap - qrSize);
        int contentH = H - pad * 2;

        Layout last = null;
        foreach (double scale in SCALES)
        {
            int rowFont = Math.Max(8, (int)Math.Round(BASE_ROW_FONT * scale));
            int rowLine = (int)Math.Round(BASE_ROW_LINE * scale);
            int itemFont = (int)Math.Round(BASE_ITEM_FONT * scale);
            int itemLine = (int)Math.Round(BASE_ITEM_LINE * scale);
            int headerFont = (int)Math.Round(BASE_HEADER_FONT * scale);
            int headerLine = (int)Math.Round(BASE_HEADER_LINE * scale);

            // 备注（最后一个字段）过长时优先只缩备注字号，其他行保持当前档位不变
            // remarkIdx = -1 表示备注与其他行同字号
            int remarkIdx = keys.Length - 1;
            string remarkKey = keys[remarkIdx];
            string remarkVal = values[remarkIdx];
            string[] subKeys = keys.Take(keys.Length - 1).ToArray();
            string[] subVals = values.Take(values.Length - 1).ToArray();

            foreach (double rs in REMARK_SCALES)
            {
                int rRowFont = Math.Max(6, (int)Math.Round(rowFont * rs));
                int rRowLine = Math.Max(8, (int)Math.Round(rowLine * rs));
                int cap = Math.Max(MIN_UNITS_PER_LINE, (int)Math.Floor((textW * 2.0) / rRowFont));

                List<LaidRow> laid = new List<LaidRow>();
                for (int i = 0; i < subKeys.Length; i++)
                {
                    LaidRow r = new LaidRow();
                    r.K = subKeys[i];
                    r.Indent = TextUnits(subKeys[i]) + 2;
                    r.Lines = WrapUnits(subVals[i], Math.Max(MIN_UNITS_PER_LINE, cap - r.Indent));
                    r.FontScale = 1;
                    laid.Add(r);
                }
                LaidRow rr = new LaidRow();
                rr.K = remarkKey;
                rr.Indent = TextUnits(remarkKey) + 2;
                rr.Lines = WrapUnits(remarkVal, Math.Max(MIN_UNITS_PER_LINE, cap - rr.Indent));
                rr.FontScale = rs;
                laid.Add(rr);

                int headerCap = Math.Max(MIN_UNITS_PER_LINE, (int)Math.Floor((W * 2.0) / headerFont));
                // 标题真正按宽度拆行（与 ZPL ^FB 块模式、浏览器自动换行行为一致），最多 2 行
                List<string> headerText = withHeader ? WrapUnits(header, headerCap) : new List<string>();
                if (headerText.Count > 2)
                {
                    headerText = new List<string> { headerText[0], headerText[1] + "…" };
                }
                int headerLines = withHeader ? Math.Max(1, headerText.Count) : 0;
                int height = headerLines * headerLine + itemLine;
                foreach (LaidRow r in laid)
                {
                    int fLine = (r.FontScale == 1) ? rowLine : rRowLine;
                    height += r.Lines.Count * fLine;
                }

                last = new Layout
                {
                    Pad = pad, Gap = gap, QrSize = qrSize, TextW = textW, ContentH = contentH,
                    RowFont = rowFont, RowLine = rowLine, ItemFont = itemFont, ItemLine = itemLine,
                    HeaderFont = headerFont, HeaderLine = headerLine, HeaderLines = headerLines,
                    HeaderText = headerText, WithHeader = withHeader, Header = header, ItemNo = itemNo, Rows = laid
                };
                if (height <= contentH) return last;
            }
        }

        // 兜底：最小字号仍放不下，按版面容量截取并在末行加 …
        Layout b = last;
        int budget = Math.Max(1, (int)Math.Floor((b.ContentH - b.HeaderLines * b.HeaderLine - b.ItemLine) / (double)b.RowLine));
        List<LaidRow> kept = new List<LaidRow>();
        int left = budget;
        foreach (LaidRow row in b.Rows)
        {
            if (left <= 0) break;
            int take = Math.Min(left, row.Lines.Count);
            List<string> lines = row.Lines.GetRange(0, take);
            if (take < row.Lines.Count && lines.Count > 0)
                lines[lines.Count - 1] = lines[lines.Count - 1] + "…";
            kept.Add(new LaidRow { K = row.K, Indent = row.Indent, Lines = lines });
            left -= take;
        }
        b.Rows = kept;
        return b;
    }

    // ===== Remark 价格过滤（与 zpl.js stripPrice 一致） =====

    private static readonly Regex RePrice = new Regex(@"(?:USD|US\$|CNY|RMB|JPY|EUR|GBP|TWD|HKD|NT\$|\$|￥|¥)\s*\d[\d.,]*", RegexOptions.IgnoreCase);
    private static readonly Regex ReHashPrice = new Regex(@"[#＃]\s*\d[\d.,]*");
    private static readonly Regex ReDupSep = new Regex(@"[\s；;、,，\-]{2,}");
    private static readonly Regex ReEdgeSep = new Regex(@"^[；;、,，\-\s]+|[；;、,，\-\s]+$");

    private static string StripPrice(string str)
    {
        if (str == null || str.Trim().Length == 0) return "-";
        string s = RePrice.Replace(str, " ");
        s = ReHashPrice.Replace(s, " ");
        s = ReDupSep.Replace(s, "；");
        s = ReEdgeSep.Replace(s, "");
        s = s.Trim();
        return s.Length == 0 ? "-" : s;
    }

    // ===== 渲染 =====

    private sealed class RenderResult
    {
        public int WidthDots;
        public int HeightDots;
        public byte[] Raster;
    }

    /// <summary>把二维码模块矩阵按整数倍缩放到 (x,y) 处</summary>
    private static void DrawQr(Graphics g, QRCodeData qr, int x, int y, int boxSize)
    {
        int count = qr.ModuleMatrix.Count;
        if (count <= 0) return;
        int scale = Math.Max(1, boxSize / count);
        // 必须用独立实例：Brushes.Black 是全局静态共享对象，Dispose 后会导致同进程后续渲染全部失败
        using (Brush black = new SolidBrush(Color.Black))
        {
            for (int my = 0; my < count; my++)
            {
                BitArray row = qr.ModuleMatrix[my];
                for (int mx = 0; mx < count; mx++)
                {
                    if (row[mx])
                        g.FillRectangle(black, x + mx * scale, y + my * scale, scale, scale);
                }
            }
        }
    }

    /// <summary>渲染一张标签为 1-bit 位图（行优先、每行 8 点对齐、1=白 0=黑）</summary>
    private static RenderResult RenderLabel(int dpi, double widthMm, double heightMm, string header, string itemNo, string[] keys, string[] values, bool withHeader, string qrValue, string previewPath)
    {
        int rawW = Dots(widthMm, dpi);
        int W = ((rawW + 7) / 8) * 8; // PPLB GW 按字节描述每行，宽度需 8 点对齐
        int H = Dots(heightMm, dpi);

        Layout L = LayoutLabel(dpi, widthMm, heightMm, header, itemNo, keys, values, withHeader);
        byte[] raster;
        int bpr;

        using (Bitmap bmp = new Bitmap(W, H, PixelFormat.Format24bppRgb))
        using (Graphics g = Graphics.FromImage(bmp))
        {
            g.Clear(Color.White);
            g.TextRenderingHint = TextRenderingHint.SingleBitPerPixelGridFit;
            g.SmoothingMode = SmoothingMode.None;
            g.InterpolationMode = InterpolationMode.NearestNeighbor;
            g.PixelOffsetMode = PixelOffsetMode.Half;

            using (Font fh = new Font(FontName(), L.HeaderFont, FontStyle.Bold, GraphicsUnit.Pixel))
            using (Font fi = new Font(FontName(), L.ItemFont, GraphicsUnit.Pixel))
            using (Font fib = new Font(FontName(), L.ItemFont, FontStyle.Bold, GraphicsUnit.Pixel))
            using (StringFormat sf = new StringFormat(StringFormat.GenericTypographic))
            using (StringFormat sfRow = new StringFormat(StringFormat.GenericTypographic))
            using (StringFormat sfCenter = new StringFormat(StringFormat.GenericTypographic))
            using (Brush br = new SolidBrush(Color.Black))
            {
                sf.FormatFlags |= StringFormatFlags.NoWrap | StringFormatFlags.NoClip | StringFormatFlags.MeasureTrailingSpaces;
                // 注意：不能用 LineAlignment.Center——当矩形高度小于字体实际行高时 GDI+ 会整行不绘制
                sfRow.FormatFlags |= StringFormatFlags.NoWrap | StringFormatFlags.NoClip | StringFormatFlags.MeasureTrailingSpaces;
                sfCenter.FormatFlags |= StringFormatFlags.NoWrap | StringFormatFlags.NoClip | StringFormatFlags.MeasureTrailingSpaces;
                sfCenter.Alignment = StringAlignment.Center;

                int y = L.Pad;
                if (L.WithHeader)
                {
                    // 标题逐行居中绘制（已按宽度拆行，最多 2 行），不会超出标签宽度
                    foreach (string hl in L.HeaderText)
                    {
                        g.DrawString(hl, fh, br, new RectangleF(L.Pad, y, W - L.Pad * 2, L.HeaderLine + 12), sfCenter);
                        y += L.HeaderLine;
                    }
                }

                // Item No. 行：前缀加粗，与前端 <b>Item No.:</b> 一致
                string prefix = "Item No.: ";
                float pw = g.MeasureString(prefix, fib, 4000, sf).Width;
                g.DrawString(prefix, fib, br, new RectangleF(L.Pad, y, pw + 4, L.ItemLine + 12), sfRow);
                g.DrawString(L.ItemNo, fi, br, new RectangleF(L.Pad + pw, y, L.TextW - pw, L.ItemLine + 12), sfRow);
                y += L.ItemLine;

                foreach (LaidRow row in L.Rows)
                {
                    // 备注行可独立缩小字号（FontScale < 1），其他行用统一字号
                    int rowFont = (row.FontScale == 1) ? L.RowFont : Math.Max(6, (int)Math.Round(L.RowFont * row.FontScale));
                    int rowLine = (row.FontScale == 1) ? L.RowLine : Math.Max(8, (int)Math.Round(L.RowLine * row.FontScale));
                    using (Font fRow = new Font(FontName(), rowFont, GraphicsUnit.Pixel))
                    {
                        for (int li = 0; li < row.Lines.Count; li++)
                        {
                            if (li == 0)
                            {
                                g.DrawString(row.K + ": " + row.Lines[li], fRow, br, new RectangleF(L.Pad, y, L.TextW, rowLine + 10), sfRow);
                            }
                            else
                            {
                                // 续行缩进：按「字段名: 」占宽对齐（与前端悬挂缩进一致）
                                float indentW = g.MeasureString(new string(' ', row.Indent), fRow, 4000, sf).Width;
                                g.DrawString(row.Lines[li], fRow, br, new RectangleF(L.Pad + indentW, y, L.TextW - indentW, rowLine + 10), sfRow);
                            }
                            y += rowLine;
                        }
                    }
                }

                // 二维码固定右下角
                string qrText = string.IsNullOrEmpty(qrValue) ? itemNo : qrValue;
                using (QRCodeData qr = QRCodeGenerator.GenerateQrCode(qrText, QRCodeGenerator.ECCLevel.M))
                {
                    int count = qr.ModuleMatrix.Count;
                    int scale = Math.Max(1, L.QrSize / Math.Max(1, count));
                    int total = count * scale;
                    DrawQr(g, qr, W - L.Pad - total, H - L.Pad - total, L.QrSize);
                }
            }

            // 整张标签外框（1px），同时用于验证位图边界是否被裁切
            using (Pen p = new Pen(Color.Black, 1)) { g.DrawRectangle(p, 0, 0, W - 1, H - 1); }

            if (!string.IsNullOrEmpty(previewPath)) bmp.Save(previewPath, ImageFormat.Png);

            raster = Rasterize(bmp, W, H, out bpr);
        }

        return new RenderResult { WidthDots = W, HeightDots = H, Raster = raster };
    }

    /// <summary>
    /// 按原版 HSTIP 的图形尺寸（264×299 点 @203dpi ≈ 33×37.4mm）渲染 PPLA 位图，
    /// 极性为 PPLA 的「1 = 黑」。版式复用 RenderLabel，仅把画布换成原版尺寸并翻转极性。
    /// </summary>
    private static byte[] RenderPplaRaster(int dpi, string header, string itemNo, string[] keys, string[] values, bool withHeader, string qrValue)
    {
        double widthMm = PPLA_IMAGE_WIDTH_DOTS * MM / dpi;   // 264 点 → 33.03mm
        double heightMm = PPLA_IMAGE_HEIGHT_DOTS * MM / dpi; // 299 点 → 37.41mm
        RenderResult tmp = RenderLabel(dpi, widthMm, heightMm, header, itemNo, keys, values, withHeader, qrValue, null);
        byte[] raster = new byte[tmp.Raster.Length];
        // PPLB(GW) 是 1=白，PPLA 是 1=黑，逐位取反
        for (int i = 0; i < raster.Length; i++) raster[i] = (byte)~tmp.Raster[i];
        return raster;
    }

    /// <summary>把 24bpp 位图转成 PPLB GW 的 1-bit 光栅（行优先、每行 8 点对齐、1 = 白 0 = 黑）</summary>
    private static byte[] Rasterize(Bitmap bmp, int W, int H, out int bpr)
    {
        bpr = W / 8;
        byte[] raster = new byte[bpr * H];
        BitmapData bd = bmp.LockBits(new Rectangle(0, 0, W, H), ImageLockMode.ReadOnly, PixelFormat.Format24bppRgb);
        try
        {
            int stride = bd.Stride;
            byte[] line = new byte[stride];
            for (int yy = 0; yy < H; yy++)
            {
                // .NET 3.5 的 IntPtr 没有 + 运算符，需自行按地址偏移（4.0 才支持 Scan0 + n）
                IntPtr rowPtr = new IntPtr(bd.Scan0.ToInt64() + (long)yy * stride);
                Marshal.Copy(rowPtr, line, 0, stride);
                int baseIdx = yy * bpr;
                for (int xx = 0; xx < W; xx++)
                {
                    int b = line[xx * 3], gg = line[xx * 3 + 1], r = line[xx * 3 + 2];
                    int lum = (r * 299 + gg * 587 + b * 114) / 1000;
                    // ★ PPLB GW 极性：1 = 白，0 = 黑，故亮像素置位
                    if (lum >= 128) raster[baseIdx + (xx >> 3)] |= (byte)(0x80 >> (xx & 7));
                }
            }
        }
        finally { bmp.UnlockBits(bd); }
        return raster;
    }

    /// <summary>诊断用标定标签：整幅外框 + 10mm 网格 + 四角实心块 + mm 刻度，用于判断打印是否偏移/裁切</summary>
    private static RenderResult RenderCalib(int dpi, double widthMm, double heightMm, string previewPath)
    {
        int rawW = Dots(widthMm, dpi);
        int W = ((rawW + 7) / 8) * 8;
        int H = Dots(heightMm, dpi);
        int cell = Dots(10, dpi);   // 10mm 网格
        int bw = 6;                 // 外框线宽

        byte[] raster;
        int bpr;
        using (Bitmap bmp = new Bitmap(W, H, PixelFormat.Format24bppRgb))
        using (Graphics g = Graphics.FromImage(bmp))
        {
            g.Clear(Color.White);
            g.TextRenderingHint = TextRenderingHint.SingleBitPerPixelGridFit;
            g.SmoothingMode = SmoothingMode.None;
            g.PixelOffsetMode = PixelOffsetMode.Half;

            using (Brush br = new SolidBrush(Color.Black))
            {
                // 整幅外框
                g.FillRectangle(br, 0, 0, W, bw);
                g.FillRectangle(br, 0, H - bw, W, bw);
                g.FillRectangle(br, 0, 0, bw, H);
                g.FillRectangle(br, W - bw, 0, bw, H);

                // 10mm 网格
                for (int x = cell; x < W; x += cell) g.FillRectangle(br, x, bw, 2, H - bw * 2);
                for (int y = cell; y < H; y += cell) g.FillRectangle(br, bw, y, W - bw * 2, 2);

                // 四角实心块
                int m = bw + 4, s = 40;
                g.FillRectangle(br, m, m, s, s);
                g.FillRectangle(br, W - m - s, m, s, s);
                g.FillRectangle(br, m, H - m - s, s, s);
                g.FillRectangle(br, W - m - s, H - m - s, s, s);

                // mm 刻度（顶边、左边）
                using (Font f = new Font(FontName(), 16, GraphicsUnit.Pixel))
                using (StringFormat sf = new StringFormat(StringFormat.GenericTypographic))
                {
                    sf.FormatFlags |= StringFormatFlags.NoWrap | StringFormatFlags.NoClip | StringFormatFlags.MeasureTrailingSpaces;
                    sf.Alignment = StringAlignment.Center;
                    for (int mm = 10; mm < (int)widthMm; mm += 10)
                        g.DrawString(mm.ToString(), f, br, new RectangleF(mm * dpi / 25.4f - 20, bw + 2, 40, 24), sf);
                    sf.Alignment = StringAlignment.Near;
                    for (int mm = 10; mm < (int)heightMm; mm += 10)
                        g.DrawString(mm.ToString(), f, br, new RectangleF(W - bw - 46, mm * dpi / 25.4f - 10, 44, 24), sf);
                }

                // 中央文字
                using (Font f2 = new Font(FontName(), 22, FontStyle.Bold, GraphicsUnit.Pixel))
                using (StringFormat sf2 = new StringFormat(StringFormat.GenericTypographic))
                {
                    sf2.FormatFlags |= StringFormatFlags.NoWrap | StringFormatFlags.NoClip | StringFormatFlags.MeasureTrailingSpaces;
                    sf2.Alignment = StringAlignment.Center;
                    g.DrawString(widthMm + "x" + heightMm + "mm", f2, br, new RectangleF(0, H / 2f - 14, W, 30), sf2);
                }
            }

            if (!string.IsNullOrEmpty(previewPath)) bmp.Save(previewPath, ImageFormat.Png);
            raster = Rasterize(bmp, W, H, out bpr);
        }

        return new RenderResult { WidthDots = W, HeightDots = H, Raster = raster };
    }

    /// <summary>包成 PPLB 指令：N 清缓冲 / D 浓度 / Z 方向 / q 宽 / Q 高+gap / R 原点 / GW 位图 / P 份数</summary>
    private static byte[] BuildPplb(byte[] raster, int widthDots, int heightDots, int copies, int gapDots, int darkness)
    {
        int bpr = widthDots / 8;
        int n = Math.Max(1, Math.Min(100, copies));
        int heat = Math.Max(0, Math.Min(15, darkness));
        // Q 的第二个参数是标签间隙（dots），间隙纸必须填实际值，否则走纸定位会漂移
        // ★D 是「打印热度/浓度」（0~15），不是方向：原代码写 D1 = 最低浓度，会打出来几乎全白，
        //   且该值会存进打印机 EEPROM，导致之后任何软件打印都偏淡。原版 HSTIP 样本用 D11。
        // Z 才是 Set Print Direction，这里显式固定为正向，不依赖打印机默认值。
        // GW 的 X 起点补偿打印机横向偏移（本机实测左侧被切 16mm = 128 dots）
        int xOffset = Math.Max(0, Dots(LABEL_X_OFFSET_MM, FALLBACK_DPI));
        byte[] head = Encoding.ASCII.GetBytes("N\nD" + heat + "\nZ0\nq" + widthDots + "\nQ" + heightDots + "," + gapDots + "\nR0,0\nGW" + xOffset + ",0," + bpr + "," + heightDots + ",");
        byte[] foot = Encoding.ASCII.GetBytes("\nP" + n + "\n");
        using (MemoryStream ms = new MemoryStream())
        {
            ms.Write(head, 0, head.Length);
            ms.Write(raster, 0, raster.Length);
            ms.Write(foot, 0, foot.Length);
            return ms.ToArray();
        }
    }

    // ===== PPLA 输出通道（照抄原版 HSTIP 打印文件，用于打印机处于 PPLA 仿真的机型）=====
    //
    // 依据：原版 HSTIP_SHMQ 目录下的实际打印文件（9977 字节）逐字节解析结果，
    // 帧结构为「STX(0x02) + 命令 + CR LF」，浓度命令用 SOH(0x01) 前缀：
    //   02 'n'       ┐
    //   02 'M宽'      │ 标签设置
    //   02 'KW长'     │
    //   02 'O偏移'    │
    //   02 'V0'       │
    //   02 'f303'    ┘
    //   01 'D'         打印浓度开关
    //   02 'ICPgfx0'   下载图形，命名 gfx0
    //   05 01 01 00 00 00 00 01 02 0C 01 2C 01 2C 01 00 00 00 FF FF FF   ← 21 字节图形属性头
    //   <裸 1-bit 位图，行优先、每行 8 点对齐、1=黑>
    //   02 'L'  02 'D浓度'  02 'A2'
    //   02 '1Y<行位置>gfx0'   在指定 Y 位置打印图形
    //   02 'Q份数'  02 'E'  02 'xCGgfx0'
    //
    // 图形属性头实测常量（原版 264 点宽）：
    //   05          = 图形块前导
    //   01 01       = 版本/类型
    //   00 00 00 00 = 保留
    //   01 02       = 位深/类型标记（1-bit）
    //   0C          = 12 = 数据格式标记
    //   01 2C 01 2C = 300,300（组件内置画布尺寸，与原版一致）
    //   01 00 00 00 = 保留
    //   FF FF FF    = 调色板/掩码
    private static readonly byte[] PplaImageHeader = new byte[]
    {
        0x05, 0x01, 0x01, 0x00, 0x00, 0x00, 0x00, 0x01, 0x02, 0x0C,
        0x01, 0x2C, 0x01, 0x2C, 0x01, 0x00, 0x00, 0x00, 0xFF, 0xFF, 0xFF
    };

    // PPLA 纸面参数与图形尺寸：照抄原版 HSTIP 打印文件（500 点纸宽 / 267 点标签长 / 264×299 位图）
    private const int PPLA_PAPER_WIDTH_DOTS = 500;
    private const int PPLA_LABEL_LENGTH_DOTS = 267;
    private const int PPLA_ORIGIN_Y_DOTS = 220;
    private const int PPLA_IMAGE_WIDTH_DOTS = 264;
    private const int PPLA_IMAGE_HEIGHT_DOTS = 299;

    /// <summary>STX/SOH 帧：前缀字节 + 命令 + CR LF</summary>
    private static void PplaCmd(MemoryStream ms, byte prefix, string cmd)
    {
        ms.WriteByte(prefix);
        byte[] body = Encoding.ASCII.GetBytes(cmd);
        ms.Write(body, 0, body.Length);
        ms.WriteByte(13);
        ms.WriteByte(10);
    }

    /// <summary>
    /// 照抄原版生成 PPLA 打印流。
    /// ★重要：PPLA 是「1 = 黑」，与 PPLB 的 GW 极性相反，调用方必须传黑点置位的位图。
    /// ★纸面参数照抄原版：M0500(纸宽 500 点) / KW0267(标签长 267 点) / O0220(原点偏移 220)。
    /// </summary>
    private static byte[] BuildPpla(byte[] raster, int widthDots, int heightDots, int copies, int darkness, string itemNo)
    {
        int bpr = widthDots / 8;
        int n = Math.Max(1, Math.Min(9999, copies));
        int heat = Math.Max(0, Math.Min(15, darkness));

        // 原版行位置 "1Y1100000170002"：前段 7 位=图形纵向起始行（1100000 对应 220 点），
        // 末尾 2 位为图像序号（02=第 2 张）。这里按原版保持其结构，行位置给 0。
        int rowPos = 0;
        string imageRef = "1Y" + rowPos.ToString("D7") + "02gfx0";

        using (MemoryStream ms = new MemoryStream())
        {
            PplaCmd(ms, 0x02, "n");
            // 纸面参数固定照抄原版 HSTIP 的取值，不随位图尺寸变化
            PplaCmd(ms, 0x02, "M" + PPLA_PAPER_WIDTH_DOTS.ToString("D4"));
            PplaCmd(ms, 0x02, "KW" + PPLA_LABEL_LENGTH_DOTS.ToString("D4"));
            PplaCmd(ms, 0x02, "O" + PPLA_ORIGIN_Y_DOTS.ToString("D4"));
            PplaCmd(ms, 0x02, "V0");
            PplaCmd(ms, 0x02, "f303");
            PplaCmd(ms, 0x01, "D");
            PplaCmd(ms, 0x02, "ICPgfx0");
            ms.Write(PplaImageHeader, 0, PplaImageHeader.Length);
            ms.Write(raster, 0, bpr * heightDots);
            ms.WriteByte(13);
            ms.WriteByte(10);
            PplaCmd(ms, 0x02, "L");
            PplaCmd(ms, 0x02, "D" + heat);
            PplaCmd(ms, 0x02, "A2");
            PplaCmd(ms, 0x02, imageRef);
            PplaCmd(ms, 0x02, "Q" + n.ToString("D4"));
            PplaCmd(ms, 0x02, "E");
            PplaCmd(ms, 0x02, "xCGgfx0");
            return ms.ToArray();
        }
    }

    // ===== winspool RAW 直发 =====

    [StructLayout(LayoutKind.Sequential, CharSet = CharSet.Unicode)]
    private class DOC_INFO_1
    {
        [MarshalAs(UnmanagedType.LPWStr)] public string pDocName;
        [MarshalAs(UnmanagedType.LPWStr)] public string pOutputFile;
        [MarshalAs(UnmanagedType.LPWStr)] public string pDatatype;
    }

    [DllImport("winspool.drv", CharSet = CharSet.Unicode, SetLastError = true)]
    private static extern bool OpenPrinter(string pPrinterName, out IntPtr phPrinter, IntPtr pDefault);

    [DllImport("winspool.drv", SetLastError = true)]
    private static extern bool ClosePrinter(IntPtr hPrinter);

    [DllImport("winspool.drv", CharSet = CharSet.Unicode, SetLastError = true)]
    private static extern int StartDocPrinter(IntPtr hPrinter, int level, [In] DOC_INFO_1 di);

    [DllImport("winspool.drv", SetLastError = true)]
    private static extern bool EndDocPrinter(IntPtr hPrinter);

    [DllImport("winspool.drv", SetLastError = true)]
    private static extern bool StartPagePrinter(IntPtr hPrinter);

    [DllImport("winspool.drv", SetLastError = true)]
    private static extern bool EndPagePrinter(IntPtr hPrinter);

    [DllImport("winspool.drv", SetLastError = true)]
    private static extern bool WritePrinter(IntPtr hPrinter, IntPtr pBytes, int dwCount, out int dwWritten);

    private static void SendRawToPrinter(string printerName, byte[] data)
    {
        if (string.IsNullOrEmpty(printerName)) throw new InvalidOperationException("未配置打印机名");
        IntPtr hPrinter;
        if (!OpenPrinter(printerName, out hPrinter, IntPtr.Zero))
            throw new InvalidOperationException("找不到打印机「" + printerName + "」(错误 " + Marshal.GetLastWin32Error() + ")");
        try
        {
            DOC_INFO_1 di = new DOC_INFO_1();
            di.pDocName = "MQ Label";
            di.pDatatype = "RAW";
            if (StartDocPrinter(hPrinter, 1, di) == 0)
                throw new InvalidOperationException("StartDocPrinter 失败(" + Marshal.GetLastWin32Error() + ")");
            try
            {
                if (!StartPagePrinter(hPrinter))
                    throw new InvalidOperationException("StartPagePrinter 失败(" + Marshal.GetLastWin32Error() + ")");
                IntPtr p = Marshal.AllocCoTaskMem(data.Length);
                try
                {
                    Marshal.Copy(data, 0, p, data.Length);
                    int written;
                    if (!WritePrinter(hPrinter, p, data.Length, out written))
                        throw new InvalidOperationException("WritePrinter 失败(" + Marshal.GetLastWin32Error() + ")");
                }
                finally { Marshal.FreeCoTaskMem(p); }
                EndPagePrinter(hPrinter);
            }
            finally { EndDocPrinter(hPrinter); }
        }
        finally { ClosePrinter(hPrinter); }
    }

    /// <summary>发一次测纸（自动校准）指令：独立 RAW 作业，打印机走纸 1~4 张定位到标签起点</summary>
    internal static void CalibrateMedia(string printerName, string cmd)
    {
        if (string.IsNullOrEmpty(printerName)) throw new InvalidOperationException("未配置打印机名");
        if (string.IsNullOrEmpty(cmd)) cmd = DEFAULT_CALIBRATE_CMD;
        SendRawToPrinter(printerName, Encoding.ASCII.GetBytes(cmd));
    }

    // ===== JSON 读取辅助 =====

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

    // ===== 入口 =====

    private static int Main(string[] args)
    {
        try
        {
            if (args.Length == 0 || args[0] == "-h" || args[0] == "--help")
            {
                Console.Error.WriteLine("usage: labelrender <job.json>");
                Console.Error.WriteLine("       labelrender <out.prn> [itemNo] [preview.png]");
                return 2;
            }
            if (args[0].EndsWith(".json", StringComparison.OrdinalIgnoreCase)) return RunJob(args[0]);
            if (args[0] == "--calib") return RunCalib(args);
            return RunLegacy(args);
        }
        catch (Exception ex)
        {
            Console.Error.WriteLine("ERR " + ex.Message);
            return 1;
        }
    }

    /// <summary>代理调用入口：读取作业 JSON，逐张渲染并 RAW 直发</summary>
    private static int RunJob(string jsonPath)
    {
        int printed = ExecuteJob(File.ReadAllText(jsonPath, Encoding.UTF8));
        Console.WriteLine("{\"ok\":true,\"printed\":" + printed + "}");
        return 0;
    }

    /// <summary>供本地代理直接调用：以 JSON 文本提交作业，返回结果 JSON 文本</summary>
    internal static string ExecuteJobText(string jsonText)
    {
        return "{\"ok\":true,\"printed\":" + ExecuteJob(jsonText) + "}";
    }

    private static int ExecuteJob(string jsonText)
    {
        JavaScriptSerializer ser = new JavaScriptSerializer { MaxJsonLength = int.MaxValue };
        IDictionary<string, object> root = ser.Deserialize<IDictionary<string, object>>(jsonText);
        if (root == null) throw new InvalidOperationException("作业 JSON 为空");

        string printerName = Str(root, "printerName", null);
        string prnOut = Str(root, "prnOut", null);
        string previewOut = Str(root, "previewOut", null);
        bool calibrate = Bool(root, "calibrate", false);
        IDictionary<string, object> cfg = Obj(root, "label");
        int dpi = Int(cfg, "dpi", FALLBACK_DPI);
        double widthMm = Dbl(cfg, "widthMm", 70);
        double heightMm = Dbl(cfg, "heightMm", 40);
        double gapMm = Dbl(cfg, "gapMm", LABEL_GAP_MM);
        int gapDots = Math.Max(0, Dots(gapMm, dpi));
        // 打印热度/浓度（PPLB 的 D 指令），0~15；原版 HSTIP 样本用 11
        int darkness = Int(cfg, "darkness", DEFAULT_DARKNESS);
        // 指令语言：PPLA（原版 HSTIP 用的，默认）/ PPLB（EPL2 兼容）
        string language = Str(cfg, "language", "PPLA").ToUpperInvariant();
        string calibrateCmd = Str(cfg, "calibrateCmd", DEFAULT_CALIBRATE_CMD);

        object rawLabels;
        if (!root.TryGetValue("labels", out rawLabels) || rawLabels == null)
            throw new InvalidOperationException("缺少 labels");
        object[] labels = rawLabels as object[];
        if (labels == null || labels.Length == 0) throw new InvalidOperationException("labels 为空");

        // 首张打印前先测纸：用独立 RAW 作业发校准指令，让打印机走纸到标签起点
        // 单独成作业是为了避免 xa 与位图数据混在一起，异常时污染标签内容
        if (calibrate && !string.IsNullOrEmpty(printerName))
        {
            CalibrateMedia(printerName, calibrateCmd);
        }

        int printed = 0;
        foreach (object item in labels)
        {
            IDictionary<string, object> lb = item as IDictionary<string, object>;
            if (lb == null) continue;
            IDictionary<string, object> d = Obj(lb, "data");

            string variant = Str(lb, "variant", "FULL");
            bool withHeader = Bool(lb, "header", true);
            int copies = Int(lb, "copies", 1);
            string header = Str(d, "companyName", DEFAULT_HEADER);
            string itemNo = Str(d, "itemNo", "-");

            string[] keys;
            string[] values;
            if (variant == "SPEC")
            {
                keys = new[] { "Specification" };
                values = new[] { Str(d, "specification", null) };
            }
            else
            {
                keys = new[] { "Composition", "Construction", "Width", "Weight", "Remark" };
                values = new[]
                {
                    Str(d, "composition", null),
                    Str(d, "construction", null),
                    Str(d, "width", null),
                    Str(d, "weight", null),
                    StripPrice(Str(d, "remark", null)),
                };
            }

            string qrValue = Str(lb, "qrValue", itemNo);
            string preview = previewOut != null && printed == 0 ? previewOut : null;

            RenderResult r = RenderLabel(dpi, widthMm, heightMm, header, itemNo, keys, values, withHeader, qrValue, preview);
            byte[] payload;
            if (language == "PPLB")
            {
                payload = BuildPplb(r.Raster, r.WidthDots, r.HeightDots, copies, gapDots, darkness);
            }
            else
            {
                // PPLA 通道：位图尺寸与纸面参数照抄原版 HSTIP（264×299 点），极性 1=黑
                byte[] pplaRaster = RenderPplaRaster(dpi, header, itemNo, keys, values, withHeader, qrValue);
                payload = BuildPpla(pplaRaster, PPLA_IMAGE_WIDTH_DOTS, PPLA_IMAGE_HEIGHT_DOTS, copies, darkness, itemNo);
            }

            if (!string.IsNullOrEmpty(prnOut))
            {
                File.WriteAllBytes(prnOut, payload);
            }
            if (!string.IsNullOrEmpty(printerName))
            {
                SendRawToPrinter(printerName, payload);
            }
            printed++;
        }

        return printed;
    }

    /// <summary>标定入口：渲染标定标签并（可选）RAW 直发，用于排查打印偏移/裁切</summary>
    private static int RunCalib(string[] args)
    {
        string outPath = args.Length > 1 && args[1].Length > 0 ? args[1] : "calib.prn";
        string printerName = args.Length > 2 && args[2].Length > 0 ? args[2] : null;
        string preview = args.Length > 3 && args[3].Length > 0 ? args[3] : null;

        RenderResult r = RenderCalib(FALLBACK_DPI, 70, 40, preview);
        // 标定标签必须和正式打印用同一个间隙值，否则测出来的偏移不代表真实情况
        byte[] pplb = BuildPplb(r.Raster, r.WidthDots, r.HeightDots, 1, Math.Max(0, Dots(LABEL_GAP_MM, FALLBACK_DPI)), DEFAULT_DARKNESS);
        File.WriteAllBytes(outPath, pplb);
        if (!string.IsNullOrEmpty(printerName))
        {
            SendRawToPrinter(printerName, pplb);
            Console.WriteLine("SENT " + printerName);
        }
        Console.WriteLine("OK " + outPath + " " + pplb.Length);
        return 0;
    }

    /// <summary>调试入口：渲染样例并输出 .prn（可附 PNG 预览），不打印</summary>
    private static int RunLegacy(string[] args)
    {
        string outPath = args.Length > 0 ? args[0] : "label.prn";
        string itemNo = args.Length > 1 ? args[1] : DEFAULT_ITEM_NO;
        // args[2] 为打印机名（传了才真正打印），args[3] 才是 PNG 预览路径
        string printerName = args.Length > 2 && args[2].Length > 0 ? args[2] : null;
        string preview = args.Length > 3 && args[3].Length > 0 ? args[3] : null;

        string[] keys = { "Composition", "Construction", "Width", "Weight", "Remark" };
        string[] values = {
            "65% Cotton 35% Polyester",
            "Knitted",
            "150cm",
            "120g/m2",
            "全棉针织面料 65%棉",
        };

        RenderResult r = RenderLabel(FALLBACK_DPI, 70, 40, DEFAULT_HEADER, itemNo, keys, values, true, itemNo, preview);
        byte[] pplb = BuildPplb(r.Raster, r.WidthDots, r.HeightDots, 1, Math.Max(0, Dots(LABEL_GAP_MM, FALLBACK_DPI)), DEFAULT_DARKNESS);
        File.WriteAllBytes(outPath, pplb);
        Console.WriteLine("OK " + outPath + " " + pplb.Length);
        if (!string.IsNullOrEmpty(printerName))
        {
            SendRawToPrinter(printerName, pplb);
            Console.WriteLine("SENT " + printerName);
        }
        return 0;
    }
}
