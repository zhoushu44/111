'use strict'
/**
 * 把标签数据渲染为 ZPL（Zebra Programming Language）指令。
 * 兼容 ZPL 的打印机：Zebra、TSC(部分)、Argox(开启 ZPL 仿真) 等均能接收。
 * 若标签机只认 TSPL(PPLA/PPLB)，后续可在此扩展 buildTspl()。
 */

function dots(mm, dpi) {
  return Math.round((mm * dpi) / 25.4)
}

/** 截断过长字符串，避免溢出标签宽度 */
function clip(str, max) {
  if (!str) return '-'
  str = String(str)
  return str.length > max ? str.slice(0, max - 1) + '…' : str
}

/**
 * @param {object} label { qrValue:string, data:{ itemNo,name,specification,composition,width,weight,remark } }
 * @param {object} cfg printer.label { widthMm,heightMm,dpi }
 */
function buildZpl(label, cfg) {
  const dpi = cfg.dpi || 203
  const W = dots(cfg.widthMm, dpi)
  const H = dots(cfg.heightMm, dpi)
  const d = label.data || {}
  const qr = (label.qrValue || d.itemNo || '').toString()

  // 右侧二维码区域宽度约 45% 标签宽
  const qrSize = Math.min(dots(cfg.heightMm * 0.85, dpi), dots(cfg.widthMm * 0.4, dpi))
  const qrX = Math.max(0, W - qrSize - 8)
  const qrMag = Math.max(2, Math.round(qrSize / 22 / 2)) // BQN 放大系数

  const lines = []
  lines.push('^XA')
  lines.push(`^PW${W}^LL${H}^LH0,0`)
  // 公司名
  lines.push(`^FO8,6^A0N,28,28^FD敏群商贸（上海）^FS`)
  // Item No.
  lines.push(`^FO8,40^A0N,26,26^FDItem: ${clip(d.itemNo, 22)}^FS`)
  // Name
  lines.push(`^FO8,72^A0N,22,22^FD${clip(d.name, 24)}^FS`)
  // Spec
  if (d.specification) lines.push(`^FO8,100^A0N,20,20^FDSpec: ${clip(d.specification, 22)}^FS`)
  // Composition / Width-Weight
  const cw = [d.composition, `${d.width || ''}/${d.weight || ''}`].filter(Boolean).join('  ')
  if (cw) lines.push(`^FO8,126^A0N,18,18^FD${clip(cw, 26)}^FS`)
  // Remark
  if (d.remark) lines.push(`^FO8,150^A0N,18,18^FD${clip(d.remark, 26)}^FS`)
  // 二维码（含 Item No.）
  lines.push(`^FO${qrX},8^BQN,2,${qrMag}^FDMA,${qr}^FS`)
  lines.push('^XZ')
  return lines.join('\n')
}

module.exports = { buildZpl, dots }
