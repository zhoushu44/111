'use strict'
const net = require('net')
const fs = require('fs')
const path = require('path')
const os = require('os')
const { execFile } = require('child_process')
const { buildZpl, buildPplbRaster } = require('./zpl')

/**
 * Windows RAW 直发：把原始指令以 RAW 数据类型直接写入打印队列。
 * 关键点——完全绕过打印机驱动的渲染，因此驱动里的纸张/缩放/份数设置
 * 都不会影响输出，这是「所有电脑效果一致」的物理基础。
 * @param {object} printer { printerName, rawTool }
 * @param {Buffer} data 原始指令（ASCII 指令 + 二进制位图）
 */
function printWindowsRaw(printer, data) {
  return new Promise((resolve, reject) => {
    const name = printer.printerName
    if (!name) return reject(new Error('未配置 printerName'))
    const tool = path.resolve(__dirname, '..', printer.rawTool || 'tools/rawprint.exe')
    if (!fs.existsSync(tool)) return reject(new Error('找不到 RAW 直发工具: ' + tool))
    const tmp = path.join(os.tmpdir(), `mq-label-${Date.now()}-${Math.random().toString(36).slice(2, 8)}.prn`)
    fs.writeFile(tmp, data, (err) => {
      if (err) return reject(err)
      execFile(tool, [name, tmp], { windowsHide: true }, (e, stdout, stderr) => {
        fs.unlink(tmp, () => {})
        if (e) return reject(new Error('RAW 直发失败: ' + (stderr || e.message)))
        resolve(true)
      })
    })
  })
}

/** 原始 TCP 直发（网络标签机，需打印机自带网口） */
function printTcpRaw(printer, data) {
  return new Promise((resolve, reject) => {
    if (!printer.host || !printer.port) return reject(new Error('未配置打印机 host/port（raw 模式）'))
    const socket = net.connect(Number(printer.port), printer.host, () => {
      socket.write(data, () => socket.end())
    })
    socket.setTimeout(5000)
    socket.on('timeout', () => { socket.destroy(); reject(new Error('连接打印机超时')) })
    socket.on('error', (e) => reject(new Error('打印机连接失败: ' + e.message)))
    socket.on('close', () => resolve(true))
  })
}

/** 按配置的 mode 把原始指令送出 */
function sendRaw(printer, data) {
  if (printer.mode === 'raw') return printTcpRaw(printer, data)
  return printWindowsRaw(printer, data)
}

/**
 * 打印一张「整张位图」标签（PPLB GW 通道）。
 * 位图由浏览器按固定 203dpi 渲染并转 1-bit，打印机只做逐点还原，
 * 因而中文、二维码、版式在所有电脑上完全一致。
 * @param {object} printer
 * @param {string} rasterBase64 1-bit 位图 base64（行优先、每行字节对齐、1=白 0=黑）
 * @param {number} widthDots
 * @param {number} heightDots
 * @param {number} copies
 */
function printRaster(printer, rasterBase64, widthDots, heightDots, copies) {
  const raster = Buffer.from(String(rasterBase64 || ''), 'base64')
  if (!raster.length) return Promise.reject(new Error('位图数据为空'))
  const cfg = printer.label || {}
  const pplb = buildPplbRaster(raster, widthDots, heightDots, copies, cfg.gapMm, cfg.dpi, cfg.xOffsetMm)
  return sendRaw(printer, pplb)
}

/**
 * 标签打印：调用单文件引擎 labelrender.exe。
 * 渲染（203dpi/70×40mm 整张位图，含中文+二维码）+ PPLB 封装 + winspool RAW 直发
 * 全部在 exe 内完成，字体/字号/坐标/纸张全部写死，
 * 不读驱动或系统打印设置，因此所有电脑输出完全一致。
 * @param {object} printer { printerName, labelTool, label: { widthMm, heightMm, dpi, gapMm } }
 * @param {object[]} labels [{ qrValue, variant, header, copies, data: { itemNo, companyName, composition, ... } }]
 */
function printLabelJob(printer, labels) {
  return new Promise((resolve, reject) => {
    const name = printer.printerName
    if (!name) return reject(new Error('未配置 printerName'))
    const tool = path.resolve(__dirname, '..', printer.labelTool || 'tools/labelrender.exe')
    if (!fs.existsSync(tool)) return reject(new Error('找不到标签打印引擎: ' + tool))
    const tmp = path.join(os.tmpdir(), `mq-label-job-${Date.now()}-${Math.random().toString(36).slice(2, 8)}.json`)
    const job = {
      printerName: name,
      label: printer.label || { widthMm: 70, heightMm: 40, dpi: 203, gapMm: 2, xOffsetMm: 16 },
      labels,
    }
    fs.writeFile(tmp, JSON.stringify(job), 'utf8', (err) => {
      if (err) return reject(err)
      execFile(tool, [tmp], { windowsHide: true, maxBuffer: 10 * 1024 * 1024 }, (e, stdout, stderr) => {
        fs.unlink(tmp, () => {})
        if (e) return reject(new Error('标签打印失败: ' + (stderr || e.message)))
        try { resolve(JSON.parse(stdout)) } catch (_) { resolve({ ok: true, printed: labels.length }) }
      })
    })
  })
}

/**
 * 单张标签打印（旧通道，保留给自检位图等非标签输出）。
 */
async function printLabel(printer, label) {
  if (label && label.raster) {
    return printRaster(printer, label.raster, label.widthDots, label.heightDots, label.copies)
  }
  const zpl = buildZpl(label, printer.label || { widthMm: 70, heightMm: 40, dpi: 203 })
  return sendRaw(printer, Buffer.from(zpl, 'utf8'))
}

module.exports = { printLabel, printLabelJob, printRaster, sendRaw, printTcpRaw, printWindowsRaw, buildZpl, buildPplbRaster }
