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

## 运行

```bash
cd print-agent
node server.js
# 打开 http://localhost:8790 进行配置与测试打印
```

零原生依赖即可启动（raw 模式 + 仪表盘 + ZPL 生成）。  
串口扫描器需先安装：`npm i serialport`（可选）。

## 配置（config.json 或仪表盘）

- `printer.mode = "raw"`：ZPL 经 TCP 直发打印机 `host:port`（Zebra/TSC/Argox-ZPL仿真，端口通常 9100）。**最贴近老系统。**
- `printer.mode = "system"`：写临时文件经 Windows 打印（建议打印机端口设为 Generic / Text Only）。
- `printer.label`：标签尺寸（默认 70×40mm @203dpi，对应 Argox CP-2140M/3140）。
- `scanner`：COM 端口与波特率，启用后扫描码经 `GET /api/scanner/stream`（SSE）推送。

## Web 端对接

标签打印页（`/print/labels`）新增「使用本地打印代理（软件）」开关：
- 关闭 → 浏览器打印（选 Argox 驱动，原有行为）。
- 开启 → 标签数据 `POST /api/print/label` 发给本代理，由本机真正打到标签打印机（等价老系统打印路径）。

## API

- `GET  /`                      仪表盘（配置 + 测试 + ZPL 预览）
- `GET  /api/status`            代理状态（打印机/扫描器）
- `POST /api/print/label`       body `{ labels:[{ qrValue, data:{itemNo,name,...} }] }` → 逐张打印
- `POST /api/config`            保存配置（printer / scanner）
- `GET  /api/scanner/stream`    SSE，推送串口扫描到的条码
- `GET  /api/zpl/preview`       `?itemNo=` 返回 ZPL 文本（调试用）
