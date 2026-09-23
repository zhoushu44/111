'use strict'
/**
 * 把标签数据渲染为 ZPL（Zebra Programming Language）指令。
 * 兼容 ZPL 的打印机：Zebra、TSC(部分)、Argox(开启 ZPL 仿真) 等均能接收。
 * 若标签机只认 TSPL(PPLA/PPLB)，后续可在此扩展 buildTspl()。
 *
 * 超长内容不再截断：先按「字宽单位」精确折行（中文/全角=2 单位，英文数字=1 单位），
 * 再从 1.0 起按 5% 递减搜索能把整张标签放进 70×40mm 版面的字号（下限 0.6）；
 * 只有在最小字号仍放不下时才在末行加 …（避免无提示丢内容）。
 * 前端预览 src/pages/LabelPrint.tsx 使用完全相同的 layoutLabel()（单位定义、缩放档位、
 * 行高、版心边距都一致），保证所见即所得；两边改动必须同步。
 */

const DPI_FALLBACK = 203
const PAD_MM = 2 // 版心内边距
const GAP_MM = 1 // 文本列与二维码列间距
/** 缩字号档位：从原字号逐档缩小，取第一个能整体放下的 */
const SCALES = [1, 0.95, 0.9, 0.85, 0.8, 0.75, 0.7, 0.65, 0.6]
/** 各元素基准字号/行高（dots @203dpi，随档位等比缩放） */
const BASE = { rowFont: 20, rowLine: 22, itemFont: 24, itemLine: 30, headerFont: 30, headerLine: 36 }
const MIN_UNITS_PER_LINE = 6

function dots(mm, dpi) {
  return Math.round((mm * dpi) / 25.4)
}

/** 全角字符（中文、全角标点等）占 2 个字宽单位，其余占 1 个 */
function charUnits(code) {
  return (code >= 0x1100 && code <= 0x115f) ||
    (code >= 0x2e80 && code <= 0xa4cf) ||
    (code >= 0xac00 && code <= 0xd7a3) ||
    (code >= 0xf900 && code <= 0xfaff) ||
    (code >= 0xfe30 && code <= 0xfe6f) ||
    (code >= 0xff00 && code <= 0xff60) ||
    (code >= 0xffe0 && code <= 0xffe6) ||
    (code >= 0x20000 && code <= 0x3fffd) ? 2 : 1
}

function textUnits(str) {
  let total = 0
  for (const ch of String(str)) total += charUnits(ch.codePointAt(0))
  return total
}

/**
 * 按字宽单位折行，只返回内容本身（不含字段名前缀）。
 * 首行要放「字段名: 」，续行用等宽空白悬挂缩进，故每行内容上限同为 cap。
 */
function wrapUnits(value, cap) {
  const text = String(value == null ? '' : value).replace(/\r\n?/g, '\n').replace(/\n/g, ' ').trim() || '-'
  const out = []
  let cur = ''
  let used = 0
  for (const ch of text) {
    const u = charUnits(ch.codePointAt(0))
    if (used + u > cap && cur) { out.push(cur); cur = ''; used = 0 }
    cur += ch
    used += u
  }
  out.push(cur)
  return out
}

/** 过滤价格类内容（USD/CNY 等报价不允许出现在标签 Remark 上） */
function stripPrice(str) {
  if (str == null || String(str).trim() === '') return '-'
  let s = String(str)
    .replace(/(?:USD|US\$|CNY|RMB|JPY|EUR|GBP|TWD|HKD|NT\$|\$|￥|¥)\s*\d[\d.,]*/gi, ' ')
    .replace(/[#＃]\s*\d[\d.,]*/g, ' ')
  s = s.replace(/[\s；;、,，-]{2,}/g, '；').replace(/^[；;、,，-\s]+|[；;、,，-\s]+$/g, '')
  s = s.trim()
  return s || '-'
}

/**
 * 计算标签版式：折行 + 自动缩字号，返回各元素的最终字号与逐行文本。
 * @param {object} label { qrValue, variant?:'SPEC'|'FULL', header?:boolean, copies?:number, data:{} }
 * @param {object} cfg printer.label { widthMm, heightMm, dpi }
 */
function layoutLabel(label, cfg) {
  const dpi = cfg.dpi || DPI_FALLBACK
  const W = dots(cfg.widthMm, dpi)
  const H = dots(cfg.heightMm, dpi)
  const pad = dots(PAD_MM, dpi)
  const gap = dots(GAP_MM, dpi)
  // 二维码固定右下角，文本列宽度需让出二维码及其间距，避免文字压到码上
  const qrSize = Math.min(Math.round(H * 0.58), Math.round(W * 0.28))
  const textW = Math.max(40, W - pad * 2 - gap - qrSize)
  const contentH = H - pad * 2
  const d = label.data || {}
  const withHeader = label.header !== false
  const header = d.companyName || 'Mint Chance Textile Co.,Ltd'
  const itemNo = String(d.itemNo == null || d.itemNo === '' ? '-' : d.itemNo)
  const rows = (label.variant || 'FULL') === 'SPEC'
    ? [{ k: 'Specification', v: d.specification }]
    : [
      { k: 'Composition', v: d.composition },
      { k: 'Construction', v: d.construction },
      { k: 'Width', v: d.width },
      { k: 'Weight', v: d.weight },
      { k: 'Remark', v: stripPrice(d.remark) },
    ]

  let last = null
  for (const scale of SCALES) {
    const rowFont = Math.max(8, Math.round(BASE.rowFont * scale))
    const rowLine = Math.round(BASE.rowLine * scale)
    const itemFont = Math.round(BASE.itemFont * scale)
    const itemLine = Math.round(BASE.itemLine * scale)
    const headerFont = Math.round(BASE.headerFont * scale)
    const headerLine = Math.round(BASE.headerLine * scale)
    const cap = Math.max(MIN_UNITS_PER_LINE, Math.floor((textW * 2) / rowFont))
    // 每行都要容纳悬挂缩进（首行「字段名: 」、续行等宽空白），故内容上限先减去缩进占宽
    const laid = rows.map((row) => {
      const indent = textUnits(row.k) + 2
      return { k: row.k, indent, lines: wrapUnits(row.v, Math.max(MIN_UNITS_PER_LINE, cap - indent)) }
    })
    const headerCap = Math.max(MIN_UNITS_PER_LINE, Math.floor((W * 2) / headerFont))
    const headerLines = withHeader ? Math.min(2, Math.max(1, Math.ceil(textUnits(header) / headerCap))) : 0
    const height = headerLines * headerLine + itemLine + laid.reduce((sum, row) => sum + row.lines.length * rowLine, 0)
    last = { scale, W, H, pad, gap, qrSize, textW, contentH, rowFont, rowLine, itemFont, itemLine, headerFont, headerLine, headerLines, header, withHeader, itemNo, rows: laid, overflow: height > contentH }
    if (height <= contentH) return last
  }

  // 兜底：最小字号仍放不下，按版面容量截取并在末行加 …（正常长度不会走到这里）
  const budget = Math.max(1, Math.floor((last.contentH - last.headerLines * last.headerLine - last.itemLine) / last.rowLine))
  const kept = []
  let left = budget
  for (const row of last.rows) {
    if (left <= 0) break
    const take = Math.min(left, row.lines.length)
    const lines = row.lines.slice(0, take)
    if (take < row.lines.length) lines[take - 1] = lines[take - 1].slice(0, -1) + '…'
    kept.push({ k: row.k, indent: row.indent, lines })
    left -= take
  }
  last.rows = kept
  return last
}

function buildZpl(label, cfg) {
  const L = layoutLabel(label, cfg)
  const qr = (label.qrValue || (label.data && label.data.itemNo) || '').toString()
  const copies = Math.max(1, Math.min(100, Number(label.copies) || 1))

  // 二维码：右下角，位置与 layoutLabel 预留的文本列一致
  const qrX = L.W - L.qrSize - L.pad
  const qrY = L.H - L.qrSize - L.pad
  const qrMag = Math.max(2, Math.round(L.qrSize / 22 / 2))

  const out = []
  out.push('^XA')
  // 显式固定字段方向（不依赖打印机/驱动默认旋转）与标签尺寸
  out.push(`^FWN^PW${L.W}^LL${L.H}^LH0,0`)

  let y = L.pad
  if (L.withHeader) {
    // 抬头：独占整行、居中、加粗，显示完整内容，超宽由 ^FB 自动换行（高度已按预估行数预留）
    out.push(`^FO0,${y}^A0N,${L.headerFont},${L.headerFont}^FB${L.W},${L.headerLines},0,C,0^FD${L.header}^FS`)
    y += L.headerLine * L.headerLines
  }
  out.push(`^FO${L.pad},${y}^A0N,${L.itemFont},${L.itemFont}^FDItem No.: ${L.itemNo}^FS`)
  y += L.itemLine

  L.rows.forEach((row) => {
    row.lines.forEach((text, index) => {
      // 首行带字段名，续行用等宽空白悬挂缩进（与前端预览一致）
      const prefix = index === 0 ? `${row.k}: ` : ' '.repeat(row.indent)
      out.push(`^FO${L.pad},${y}^A0N,${L.rowFont},${L.rowFont}^FD${prefix}${text}^FS`)
      y += L.rowLine
    })
  })

  out.push(`^FO${qrX},${qrY}^BQN,2,${qrMag}^FDMA,${qr}^FS`)
  // 份数：指令级控制（等价老系统模板份数），避免依赖驱动默认份数
  out.push(`^PQ${copies},0,0,N`)
  out.push('^XZ')
  return out.join('\n')
}

/**
 * 把整张标签的 1-bit 位图包成 PPLB（Argox 原生 / Eltron EPL2）指令。
 * 这是「全机一致」的物理通道：位图由浏览器按固定 203dpi 渲染，
 * 打印机只负责逐点还原，完全不经过字体/字库/驱动缩放，因此：
 *   1) 中文可用（不依赖打印机内置字库板）
 *   2) 二维码可用（由浏览器 QR 库渲染进位图）
 *   3) 版式固定（坐标即像素，任何电脑输出完全相同）
 * @param {Buffer} raster 1-bit 位图数据，行优先、每行按字节对齐
 * @param {number} widthDots 位图宽（dot）
 * @param {number} heightDots 位图高（dot）
 * @param {number} copies 份数
 * @param {number} gapMm 标签间隙(mm)。成卷间隙纸必须给实际缝隙宽度：
 *   PPLB 的 Q 指令第二参数是间隙(dot)，填 0 会让打印机自己测纸，
 *   定位漂移会把内容印到标签外（表现为只打出一半）。
 * @param {number} xOffsetMm 横向偏移补偿(mm)。70mm 标签居中装纸时，
 *   打印头左基准比标签左边偏左约 16mm，GW 起点须右移该值，
 *   否则左侧内容会被切掉（本机实测 16mm = 128 dot）。
 * @returns {Buffer} 完整 PPLB 指令（ASCII 头尾 + 二进制位图）
 */
function buildPplbRaster(raster, widthDots, heightDots, copies = 1, gapMm = 2, dpi = 203, xOffsetMm = 16) {
  const W = Math.max(8, Math.round(widthDots))
  const H = Math.max(1, Math.round(heightDots))
  const bytesPerRow = Math.ceil(W / 8)
  const need = bytesPerRow * H
  if (raster.length !== need) {
    throw new Error(`位图长度不符：期望 ${need} 字节（${bytesPerRow}x${H}），实际 ${raster.length}`)
  }
  const n = Math.max(1, Math.min(100, Number(copies) || 1))
  const gapDots = Math.max(0, Math.round((Number(gapMm) || 0) * Number(dpi) / 25.4))
  const xOffset = Math.max(0, Math.round((Number(xOffsetMm) || 0) * Number(dpi) / 25.4))
  // q=标签宽(dot)，Q=标签高+间隙(dot)，R=原点，GW=直接写图形
  const header = Buffer.from(`N\nq${W}\nQ${H},${gapDots}\nR0,0\nGW${xOffset},0,${bytesPerRow},${H},`, 'ascii')
  const footer = Buffer.from(`\nP${n}\n`, 'ascii')
  return Buffer.concat([header, raster, footer])
}

module.exports = { buildZpl, buildPplbRaster, layoutLabel, dots, stripPrice, textUnits }
