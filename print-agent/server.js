'use strict'
const http = require('http')
const fs = require('fs')
const path = require('path')
const { printLabel } = require('./lib/printer')
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
function cors(res) {
  const allow = (config.corsOrigins || []).join(', ')
  res.setHeader('Access-Control-Allow-Origin', allow || '*')
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
  if (req.method === 'OPTIONS') { cors(res); res.writeHead(204); return res.end() }
  if (url.pathname.startsWith('/api/')) cors(res)

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

    // —— 打印标签 ——
    if (req.method === 'POST' && url.pathname === '/api/print/label') {
      const body = await readBody(req)
      const labels = Array.isArray(body.labels) ? body.labels : (body.label ? [body.label] : [])
      if (!labels.length) return sendJson(res, 400, { ok: false, error: '缺少 labels' })
      const errors = []
      let printed = 0
      for (const lb of labels) {
        try { await printLabel(config.printer, lb); printed++ }
        catch (e) { errors.push(String(e.message || e)) }
      }
      return sendJson(res, errors.length && printed === 0 ? 502 : 200, { ok: errors.length === 0, printed, errors })
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
        'Access-Control-Allow-Origin': (config.corsOrigins || []).join(', ') || '*',
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
