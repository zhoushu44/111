'use strict'
/**
 * 把标签数据渲染为 ZPL（Zebra Programming Language）指令。
 * 兼容 ZPL 的打印机：Zebra、TSC(部分)、Argox(开启 ZPL 仿真) 等均能接收。
 * 若标签机只认 TSPL(PPLA/PPLB)，后续可在此扩展 buildTspl()。
 *
 * 版式对齐浏览器预览（LabelPrint.tsx）：抬头 + Item No. + 字段行（字段名加粗、
 * 内容悬挂缩进对齐），二维码贴右下角。
 */

function dots(mm, dpi) {
  return Math.round((mm * dpi) / 25.4)
}

/** 单行裁剪，超长以 … 结尾 */
function clip(str, max) {
  if (!str) return '-'
  str = String(str)
  return str.length > max ? str.slice(0, max - 1) + '…' : str
}

/**
 * 按「首行前缀 + 悬挂缩进」把内容折行。
 * 首行前缀占 prefix 个字符宽，续行缩进 prefix 个字符。
 * @returns {string[]} 每个元素是「缩进后」的整行文本（首行已含前缀）
 */
function wrapHanging(prefix, value, lineChars) {
  const text = String(value == null || value === '' ? '-' : value).replace(/\r\n?/g, '\n').replace(/\n/g, ' ')
  const rest = lineChars - prefix.length // 首行去掉前缀后可容纳的字符数
  const lines = []
  let first = true
  for (let offset = 0; offset < text.length;) {
    const cap = first ? Math.max(1, rest) : lineChars
    lines.push((first ? prefix : ' '.repeat(prefix.length)) + text.slice(offset, offset + cap))
    offset += cap
    first = false
  }
  if (!lines.length) lines.push(prefix + '-')
  return lines
}

/**
 * @param {object} label { qrValue:string, variant?:'SPEC'|'FULL', header?:boolean, data:{ itemNo,name,specification,composition,construction,width,weight,remark,companyName } }
 * @param {object} cfg printer.label { widthMm,heightMm,dpi }
 */
function buildZpl(label, cfg) {
  const dpi = cfg.dpi || 203
  const W = dots(cfg.widthMm, dpi)
  const H = dots(cfg.heightMm, dpi)
  const d = label.data || {}
  const qr = (label.qrValue || d.itemNo || '').toString()

  const variant = label.variant || 'FULL'
  const withHeader = label.header !== false
  const header = d.companyName || 'Mint Chance Textile Co.,Ltd'

  // 二维码：右下角，边长约标签高的 58%（不超过宽的 28%）
  const qrSize = Math.min(Math.round(H * 0.58), Math.round(W * 0.28))
  const qrX = W - qrSize - dots(2, dpi)
  const qrY = H - qrSize - dots(2, dpi)
  const qrMag = Math.max(2, Math.round(qrSize / 22 / 2))

  // 文本按整幅标签可用宽度折行（与原版一致：文字铺满版心，二维码压在右下角）
  const textW = W - dots(2, dpi) * 2
  const fontSize = 20
  const lineChars = Math.max(20, Math.floor(textW / fontSize))

  const lines = []
  lines.push('^XA')
  lines.push(`^PW${W}^LL${H}^LH0,0`)

  const x = dots(2, dpi)
  let y = dots(2, dpi)

  if (withHeader) {
    // 抬头：独占整行、居中、加粗（字号比正文大一号），显示完整内容，超宽自动换行
    // ^FB 换行不改变后续 ^FO 的绝对 y，故按预估行数推进 y，避免与下方正文重叠
    const headerChars = Math.max(1, Math.floor(W / 18)) // 30pt 字号约 18 dots/字符（含字距）
    const headerLines = Math.min(2, Math.ceil([...header].length / headerChars))
    lines.push(`^FO0,${y}^A0N,30,30^FB${W},${headerLines},0,C,0^FD${header}^FS`)
    y += 36 * headerLines
  }
  lines.push(`^FO${x},${y}^A0N,24,24^FDItem No.: ${clip(d.itemNo, lineChars - 10)}^FS`)
  y += 30

  const rows = variant === 'SPEC'
    ? [{ k: 'Specification', v: d.specification }]
    : [
      { k: 'Composition', v: d.composition },
      { k: 'Construction', v: d.construction },
      { k: 'Width', v: d.width },
      { k: 'Weight', v: d.weight },
      { k: 'Remark', v: d.remark },
    ]

  rows.forEach((row) => {
    wrapHanging(`${row.k}: `, row.v, lineChars).forEach((lineText) => {
      if (y + 22 > H) return
      lines.push(`^FO${x},${y}^A0N,${fontSize},${fontSize}^FD${lineText}^FS`)
      y += 22
    })
  })

  lines.push(`^FO${qrX},${qrY}^BQN,2,${qrMag}^FDMA,${qr}^FS`)
  lines.push('^XZ')
  return lines.join('\n')
}

module.exports = { buildZpl, dots }
