'use strict'
/**
 * 串口扫描器（复刻老系统 COM 口读码）。
 * 使用 serialport（原生模块，可选）。未安装时 startScanner 返回 null，
 * 由 server 在状态里提示；Web 端仍可用键盘楔子扫码（见前端 useBarcodeScanner）。
 */
function startScanner(config, onCode) {
  let SerialPort = null
  try {
    SerialPort = require('serialport').SerialPort
  } catch (e) {
    console.warn('[scanner] 未安装 serialport，串口扫描器不可用。可 `npm i serialport`。')
    return null
  }
  if (!config || !config.comPort) {
    console.warn('[scanner] 未配置 comPort')
    return null
  }
  const port = new SerialPort({ path: config.comPort, baudRate: Number(config.baudRate) || 9600 })
  let buf = ''
  let timer = null
  port.on('data', (chunk) => {
    buf += chunk.toString('utf8')
    if (timer) clearTimeout(timer)
    timer = setTimeout(() => {
      const code = buf.replace(/[\r\n]+/g, '').trim()
      buf = ''
      if (code) onCode(code)
    }, 80)
  })
  port.on('error', (e) => console.warn('[scanner] 串口错误:', e.message))
  return () => { try { port.close() } catch (e) {} if (timer) clearTimeout(timer) }
}

module.exports = { startScanner }
