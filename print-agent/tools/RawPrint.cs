// 原始指令直发工具：把文件内容以 RAW 数据类型直接写入 Windows 打印队列，
// 完全绕过打印机驱动的渲染（不读驱动纸张/缩放/份数设置）。
// 用法：rawprint.exe "<打印机名>" "<指令文件路径>"
using System;
using System.IO;
using System.Runtime.InteropServices;

internal static class RawPrint
{
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

    private static int Main(string[] args)
    {
        if (args.Length < 2)
        {
            Console.Error.WriteLine("usage: rawprint <printerName> <commandFile>");
            return 2;
        }

        string printerName = args[0];
        byte[] data = File.ReadAllBytes(args[1]);

        IntPtr hPrinter;
        if (!OpenPrinter(printerName, out hPrinter, IntPtr.Zero))
        {
            Console.Error.WriteLine("OpenPrinter 失败(" + Marshal.GetLastWin32Error() + ")：" + printerName);
            return 3;
        }

        try
        {
            DOC_INFO_1 di = new DOC_INFO_1();
            di.pDocName = "MQ Label";
            di.pDatatype = "RAW";
            if (StartDocPrinter(hPrinter, 1, di) == 0)
            {
                Console.Error.WriteLine("StartDocPrinter 失败(" + Marshal.GetLastWin32Error() + ")");
                return 4;
            }

            try
            {
                if (!StartPagePrinter(hPrinter))
                {
                    Console.Error.WriteLine("StartPagePrinter 失败(" + Marshal.GetLastWin32Error() + ")");
                    return 5;
                }

                IntPtr p = Marshal.AllocCoTaskMem(data.Length);
                try
                {
                    Marshal.Copy(data, 0, p, data.Length);
                    int written;
                    if (!WritePrinter(hPrinter, p, data.Length, out written))
                    {
                        Console.Error.WriteLine("WritePrinter 失败(" + Marshal.GetLastWin32Error() + ")");
                        return 6;
                    }
                }
                finally
                {
                    Marshal.FreeCoTaskMem(p);
                }

                EndPagePrinter(hPrinter);
            }
            finally
            {
                EndDocPrinter(hPrinter);
            }
        }
        finally
        {
            ClosePrinter(hPrinter);
        }

        Console.WriteLine("OK " + data.Length);
        return 0;
    }
}
