'use strict'
const http = require('http')
const fs = require('fs')
const path = require('path')
const { printLabel, printLabelJob, printRaster, calibratePrinter } = require('./lib/printer')
const { startScanner } = require('./lib/scanner')

const CONFIG_PATH = path.join(__dirname, 'config.json')
let config = JSON.parse(fs.readFileSync(CONFIG_PATH, 'utf8'))

let scannerStop = null
const scannerClients = new Set()
function pushScan(code) {
  const payload = `data: ${JSON.stringify({ code, ts: Date.now() })}\n\n`
  scannerClients.forEach((res) => res.write(payload))
}
function restartScanner() {
  if (scannerStop) { try { scannerStop() } catch (e) {} scannerStop = null }
  if (config.scanner && config.scanner.enabled) {
    scannerStop = startScanner(config.scanner, pushScan)
  }
}
restartScanner()

function sendJson(res, code, obj) {
  const body = JSON.stringify(obj)
  res.writeHead(code, { 'Content-Type': 'application/json; charset=utf-8' })
  res.end(body)
}
/** 计算应回给浏览器的单一 Origin。
 *  CORS 规范只允许「单个 origin」或「*」，多个来源不能用逗号拼接，
 *  否则浏览器会判定响应头非法并拒绝整个请求。
 *  本代理只监听本机回环，且请求方是任意部署地址的 ERP 网页，
 *  因此优先回显请求方 Origin；白名单命中时同样回显。 */
function resolveOrigin(req) {
  const origin = req.headers.origin
  if (!origin) return '*'
  const list = config.corsOrigins || []
  // 白名单留空或含 '*' 表示放行全部来源
  if (!list.length || list.includes('*')) return origin
  return list.includes(origin) ? origin : list[0]
}
function cors(req, res) {
  res.setHeader('Access-Control-Allow-Origin', resolveOrigin(req))
  res.setHeader('Vary', 'Origin')
  res.setHeader('Access-Control-Allow-Methods', 'GET,POST,OPTIONS')
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type')
}
function readBody(req) {
  return new Promise((resolve, reject) => {
    let data = ''
    req.on('data', (c) => { data += c; if (data.length > 5e6) req.destroy() })
    req.on('end', () => { try { resolve(data ? JSON.parse(data) : {}) } catch (e) { reject(e) } })
    req.on('error', reject)
  })
}

const server = http.createServer(async (req, res) => {
  const url = new URL(req.url, `http://${req.headers.host}`)
  // CORS 预检
  if (req.method === 'OPTIONS') { cors(req, res); res.writeHead(204); return res.end() }
  if (url.pathname.startsWith('/api/')) cors(req, res)

  try {
    // —— 仪表盘 ——
    if (req.method === 'GET' && url.pathname === '/') {
      const html = fs.readFileSync(path.join(__dirname, 'public', 'dashboard.html'), 'utf8')
      res.writeHead(200, { 'Content-Type': 'text/html; charset=utf-8' })
      return res.end(html)
    }

    // —— 状态 ——
    if (req.method === 'GET' && url.pathname === '/api/status') {
      return sendJson(res, 200, {
        ok: true, agent: 'mq-print-agent', port: config.port,
        printer: config.printer,
        scanner: { enabled: !!(config.scanner && config.scanner.enabled), hasSerialport: (() => { try { require.resolve('serialport'); return true } catch (e) { return false } })() },
      })
    }

    // —— 打印标签：整批交给 labelrender.exe（渲染+PPLB+RAW 直发一体，固定版式） ——
    if (req.method === 'POST' && url.pathname === '/api/print/label') {
      const body = await readBody(req)
      const labels = Array.isArray(body.labels) ? body.labels : (body.label ? [body.label] : [])
      if (!labels.length) return sendJson(res, 400, { ok: false, error: '缺少 labels' })
      const result = await printLabelJob(config.printer, labels)
      return sendJson(res, 200, { ok: true, printed: result.printed != null ? result.printed : labels.length })
    }

    // —— 测纸校准：发一次 xa 让打印机走纸到标签起点（换纸后点一次） ——
    if (req.method === 'POST' && url.pathname === '/api/print/calibrate') {
      await calibratePrinter(config.printer)
      return sendJson(res, 200, { ok: true, calibrated: true })
    }

    // —— 自检：打印一张内置测试位图，验证「网页 → 本机代理 → 打印机」全链路 ——
    if (req.method === 'POST' && url.pathname === '/api/print/selftest') {
      const { buildSelfTestRaster } = require('./lib/selftest')
      const { widthDots, heightDots, raster } = buildSelfTestRaster(config.printer.label)
      const copies = Number((await readBody(req)).copies) || 1
      await printRaster(config.printer, raster.toString('base64'), widthDots, heightDots, copies)
      return sendJson(res, 200, { ok: true, printed: 1, widthDots, heightDots })
    }

    // —— 保存配置 ——
    if (req.method === 'POST' && url.pathname === '/api/config') {
      const body = await readBody(req)
      config = Object.assign({}, config, body)
      fs.writeFileSync(CONFIG_PATH, JSON.stringify(config, null, 2))
      restartScanner()
      return sendJson(res, 200, { ok: true, config })
    }

    // —— 扫描器 SSE 流 ——
    if (req.method === 'GET' && url.pathname === '/api/scanner/stream') {
      res.writeHead(200, {
        'Content-Type': 'text/event-stream; charset=utf-8',
        'Cache-Control': 'no-cache', Connection: 'keep-alive',
        'Access-Control-Allow-Origin': resolveOrigin(req),
        'Vary': 'Origin',
      })
      res.write('retry: 3000\n\n')
      scannerClients.add(res)
      req.on('close', () => scannerClients.delete(res))
      return
    }

    // —— ZPL 预览（调试） ——
    if (req.method === 'GET' && url.pathname === '/api/zpl/preview') {
      const itemNo = url.searchParams.get('itemNo') || 'TEST-001'
      const zpl = require('./lib/zpl').buildZpl(
        { qrValue: itemNo, data: { itemNo, name: 'Sample Fabric', specification: 'CVC', composition: '65%C 35%P', width: '150cm', weight: '120g', remark: '' } },
        config.printer.label
      )
      res.writeHead(200, { 'Content-Type': 'text/plain; charset=utf-8' })
      return res.end(zpl)
    }

    res.writeHead(404, { 'Content-Type': 'application/json; charset=utf-8' })
    res.end(JSON.stringify({ ok: false, error: 'not found' }))
  } catch (e) {
    sendJson(res, 500, { ok: false, error: String(e.message || e) })
  }
})

server.listen(config.port, () => {
  console.log(`[mq-print-agent] 本地打印代理已启动: http://localhost:${config.port}`)
  console.log(`[mq-print-agent] 打印机模式: ${config.printer.mode} | 标签: ${config.printer.label.widthMm}x${config.printer.label.heightMm}mm @ ${config.printer.label.dpi}dpi`)
  console.log(`[mq-print-agent] 串口扫描器: ${config.scanner && config.scanner.enabled ? '启用 ' + config.scanner.comPort : '未启用'}`)
})
