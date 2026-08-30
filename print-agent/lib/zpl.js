'use strict'
/**
 * 把标签数据渲染为 ZPL（Zebra Programming Language）指令。
 * 兼容 ZPL 的打印机：Zebra、TSC(部分)、Argox(开启 ZPL 仿真) 等均能接收。
 * 若标签机只认 TSPL(PPLA/PPLB)，后续可在此扩展 buildTspl()。
 */

function dots(mm, dpi) {
  return Math.round((mm * dpi) / 25.4)
}

function clip(str, max) {
  if (!str) return '-'
  str = String(str)
  return str.length > max ? str.slice(0, max - 1) + '…' : str
}

function wrap(str, max) {
  const value = String(str || '-').replace(/\r\n?/g, '\n')
  const lines = []
  value.split('\n').forEach((paragraph) => {
    if (!paragraph) { lines.push(''); return }
    for (let offset = 0; offset < paragraph.length; offset += max) lines.push(paragraph.slice(offset, offset + max))
  })
  return lines
}

/**
 * @param {object} label { qrValue:string, data:{ itemNo,name,specification,composition,construction,width,weight,remark,companyName } }
 * @param {object} cfg printer.label { widthMm,heightMm,dpi }
 */
function buildZpl(label, cfg) {
  const dpi = cfg.dpi || 203
  const W = dots(cfg.widthMm, dpi)
  const H = dots(cfg.heightMm, dpi)
  const d = label.data || {}
  const qr = (label.qrValue || d.itemNo || '').toString()
  const header = d.companyName || 'Mint Chance Textile Co.,Ltd'

  const qrSize = Math.min(dots(cfg.heightMm * 0.58, dpi), dots(cfg.widthMm * 0.25, dpi))
  const qrX = Math.max(0, W - qrSize - 8)
  const qrMag = Math.max(2, Math.round(qrSize / 22 / 2))
  const textWidth = qrX - 14

  const lines = []
  lines.push('^XA')
  lines.push(`^PW${W}^LL${H}^LH0,0`)
  lines.push(`^FO8,6^A0N,20,20^FD${clip(header, 40)}^FS`)
  lines.push(`^FO8,34^A0N,24,24^FDItem No.: ${clip(d.itemNo, 25)}^FS`)
  if (d.specification) lines.push(`^FO8,64^A0N,18,18^FDSpecification: ${clip(d.specification, 28)}^FS`)
  let y = 90
  wrap(d.composition, 30).forEach((line, index) => {
    lines.push(`^FO8,${y}^A0N,17,17^FB${textWidth},1,0,L,0^FD${index === 0 ? 'Composition: ' : ''}${line}^FS`)
    y += 21
  })
  if (d.construction) {
    wrap(d.construction, 30).forEach((line, index) => {
      lines.push(`^FO8,${y}^A0N,17,17^FB${textWidth},1,0,L,0^FD${index === 0 ? 'Construction: ' : ''}${line}^FS`)
      y += 21
    })
  }
  lines.push(`^FO8,${y}^A0N,17,17^FDWidth: ${d.width || '-'}  Weight: ${d.weight || '-'}^FS`)
  y += 21
  if (d.remark) lines.push(`^FO8,${y}^A0N,17,17^FB${textWidth},2,0,L,0^FDRemark: ${d.remark}^FS`)
  lines.push(`^FO${qrX},8^BQN,2,${qrMag}^FDMA,${qr}^FS`)
  lines.push('^XZ')
  return lines.join('\n')
}

module.exports = { buildZpl, dots }
