'use strict'
const net = require('net')
const fs = require('fs')
const path = require('path')
const os = require('os')
const { execFile } = require('child_process')
const { buildZpl } = require('./zpl')

/** 原始 TCP 直发（网络标签机，如 Zebra/TSC/Argox-ZPL 仿真），最贴近老系统直连打印机 */
function printRaw(printer, zpl) {
  return new Promise((resolve, reject) => {
    if (!printer.host || !printer.port) return reject(new Error('未配置打印机 host/port（raw 模式）'))
    const socket = net.connect(Number(printer.port), printer.host, () => {
      socket.write(zpl, 'utf8', () => socket.end())
    })
    socket.setTimeout(5000)
    socket.on('timeout', () => { socket.destroy(); reject(new Error('连接打印机超时')) })
    socket.on('error', (e) => reject(new Error('打印机连接失败: ' + e.message)))
    socket.on('close', () => resolve(true))
  })
}

/** 系统打印机（Windows 已装驱动，建议配“Generic / Text Only”端口）；把 ZPL 写临时文件后 print */
function printSystem(printer, zpl) {
  return new Promise((resolve, reject) => {
    const tmp = path.join(os.tmpdir(), `mq-label-${Date.now()}.txt`)
    fs.writeFile(tmp, zpl, (err) => {
      if (err) return reject(err)
      const name = printer.printerName || 'Argox CP-2140M'
      if (process.platform === 'win32') {
        execFile('print', [`/D:${name}`, tmp], (e) => {
          fs.unlink(tmp, () => {})
          if (e) return reject(new Error('系统打印失败: ' + e.message))
          resolve(true)
        })
      } else {
        // macOS / Linux：用 lp 兜底（仍需驱动支持 raw）
        execFile('lp', ['-d', name, tmp], (e) => {
          fs.unlink(tmp, () => {})
          if (e) return reject(new Error('系统打印失败: ' + e.message))
          resolve(true)
        })
      }
    })
  })
}

/** 单张标签打印：按配置 mode 分发 */
async function printLabel(printer, label) {
  const zpl = buildZpl(label, printer.label || { widthMm: 70, heightMm: 40, dpi: 203 })
  if (printer.mode === 'system') return printSystem(printer, zpl)
  return printRaw(printer, zpl)
}

module.exports = { printLabel, printRaw, printSystem, buildZpl }
