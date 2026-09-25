# 敏群 ERP · 本地打印代理（print-agent）

复刻老系统 `HSTIP_SHMQ` 经 **汉思(HUANSI) 打印服务**（`ts2.huansi.net:4090`）连接标签打印机 / 串口扫描器的能力，
在新架构下以一个**本地 Windows 软件（打印代理）**实现：Web ERP 把标签发给本代理，代理真正输出到标签打印机。

## 与老系统的对应关系

| 老系统 HSTIP | 新方案 |
|---|---|
| `huansi.ini` → HUANSI 打印服务（网络中间件） | **本打印代理**（本机 `http://localhost:8790` 服务） |
| 生成 ZPL / TSPL，直发 USB·COM·网络标签机 | 生成 ZPL，raw-TCP 直发（或经 Windows 驱动 system 模式） |
| 串口(COM) 读条码枪 (`READCOMMIZED`) | 串口扫描器（可选 `serialport`）经 SSE 推送；Web 端另可用键盘楔子扫码 |
| 选样单预览 / 打印 (`SPreview`+`PrintDlg`) | Web 端 `SampleChoosePreview.tsx` + `LabelPrint.tsx` |

## 运行（推荐：免安装单文件 exe）

把 `tools/MQPrintAgent.exe` 与同名的 `MQPrintAgent.exe.config` **两个文件一起**拷到目标电脑，双击 exe 即用。

### 系统兼容性（XP / 7 / 10 / 11）

exe 目标框架为 **.NET Framework 3.5（CLR 2.0）**，四代系统均可运行：

| 系统 | 运行前提 |
|---|---|
| Windows XP | 需装一次 .NET Framework 3.5 离线安装包（`dotnetfx35.exe`） |
| Windows 7 | 系统自带 .NET 3.5.1，**免安装** |
| Windows 10 / 11 | 系统自带 .NET 4.x，由 `exe.config` 的 `supportedRuntime` 兼容加载，**免安装** |

> `MQPrintAgent.exe.config` 必须与 exe 放在同一目录，它声明了 CLR 版本回退规则；
> 缺失时 Win10/11 会弹「若要运行此应用程序，必须先安装 .NET Framework v4.0.30319」。
> 分发时请两个文件一起拷贝（`labelrender.exe` / `rawprint.exe` 同理，各带自己的 `.exe.config`）。

- 无需安装 Node.js 或其它运行库
- 启动后常驻右下角托盘，自动监听 `http://localhost:8790`
- 默认开机自启（托盘菜单可关），开机后网页即可直接打印
- 全部打印参数固定在 exe 内：打印机 `Argox CP-2140M PPLB`、标签 `70×40mm @203dpi`
- 打印走 **winspool RAW 直发**，绕过驱动渲染，**所有电脑输出完全一致**

托盘菜单：打开状态页 / 打印测试标签 / 校准标签定位 / 开机自动启动（勾选开关）/ 退出。

### 重新编译

源码在 `tools/`（`Agent.cs` / `LabelRender.cs` / `RawPrint.cs` / `qrcoder/`），构建脚本在 `build/`：

```powershell
cd print-agent\build
.\build.ps1     # 依次编译 3 个 exe，并把 exe 与 exe.config 复制到 ..\tools\
```

构建使用 .NET SDK + NuGet 参考程序集（`Microsoft.NETFramework.ReferenceAssemblies`），**开发机无需安装 .NET 3.5 目标包**。

### 可选配置

在同目录放 `config.json` 可覆盖默认参数：

```json
{ "port": 8790, "printerName": "Argox CP-2140M PPLB", "label": { "widthMm": 70, "heightMm": 40, "dpi": 203 } }
```

### 备用：Node 版（开发调试用）

```bash
cd print-agent
node server.js
# 打开 http://localhost:8790 进行配置与测试打印
```

## 配置（config.json 或仪表盘）

- `printer.mode = "raw"`：ZPL 经 TCP 直发打印机 `host:port`（Zebra/TSC/Argox-ZPL仿真，端口通常 9100）。**最贴近老系统。**
- `printer.mode = "system"`：写临时文件经 Windows 打印（建议打印机端口设为 Generic / Text Only）。
- `printer.label`：标签尺寸（默认 70×40mm @203dpi，对应 Argox CP-2140M/3140）。
- `scanner`：COM 端口与波特率，启用后扫描码经 `GET /api/scanner/stream`（SSE）推送。

## Web 端对接

标签打印页（`/print/labels`）固定走本地打印代理：点击「直接打印（exe）」→ 标签数据 `POST /api/print/label` 发给本机 exe → 由本机真正打到标签打印机。  
无需选择纸张、缩放、打印机等任何参数，也不用打开浏览器打印窗口。

## API

- `GET  /`                      仪表盘（配置 + 测试 + ZPL 预览）
- `GET  /api/status`            代理状态（打印机/扫描器）
- `POST /api/print/label`       body `{ labels:[{ qrValue, data:{itemNo,name,...} }] }` → 逐张打印
- `POST /api/print/calibrate`   让打印机测纸，重新定位每张标签的原点
- `POST /api/config`            保存配置（printer / scanner）
- `GET  /api/scanner/stream`    SSE，推送串口扫描到的条码
- `GET  /api/zpl/preview`       `?itemNo=` 返回 ZPL 文本（调试用）
