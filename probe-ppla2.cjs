const fs = require('fs')

const orig = fs.readFileSync('C:/Users/zs/Desktop/HSTIP_SHMQ(1)/HSTIP_SHMQ/1')

// 图形数据起点：'ICPgfx0' + CRLF 之后的 0x05 前导
const iStart = orig.indexOf(Buffer.from('ICPgfx0')) + 'ICPgfx0'.length + 2
// 'L' 命令帧的起点： 02 4C 0D 0A
let lFrame = -1
for (let i = iStart; i < orig.length - 3; i++) {
  if (orig[i] === 0x02 && orig[i + 1] === 0x4c && orig[i + 2] === 0x0d && orig[i + 3] === 0x0a) { lFrame = i; break }
}
console.log('图形数据起点:', iStart, ' L帧起点:', lFrame, ' 差:', lFrame - iStart)

const region = orig.slice(iStart, lFrame)
console.log('图形区长度:', region.length)

// 遍历「头部长度 h + 行宽 w」组合，找到「行数 ≈ 标签高」且渲染像文字的
// 先用关键判据：正规位图每行字节不应出现大量 0x0d/0x0a（但原版是二进制可含）
// 更可靠：寻找 w 使 rows 落在 260~310（原版画布 299 行）
const results = []
for (let h = 0; h <= 40; h++) {
  const b = region.slice(h)
  for (let w = 8; w <= 512; w += 8) {
    const bpr = w / 8
    if (b.length % bpr !== 0) continue
    const rows = b.length / bpr
    if (rows >= 120 && rows <= 320) results.push({ h, w, rows, bpr })
  }
}
console.log('候选(h,w,rows):')
results.forEach(r => console.log('  h=' + r.h, 'w=' + r.w, 'rows=' + r.rows))

// 用最可能的组合渲染 + 计算「黑点占比」：文字标签黑点占比通常 8%~25%
function inkRatio(buf, w) {
  const bpr = w / 8
  let ones = 0
  for (const byte of buf) for (let k = 0; k < 8; k++) if (byte & (128 >> k)) ones++
  return ones / (buf.length * 8)
}
console.log()
console.log('黑点占比（越低越可能是真的白底黑字标签）:')
results.slice(0, 20).forEach(r => {
  const b = region.slice(r.h, r.h + r.rows * r.bpr)
  console.log('  h=' + r.h, 'w=' + r.w, 'rows=' + r.rows, '→ 黑点占比', (inkRatio(b, r.w) * 100).toFixed(2) + '%')
})
