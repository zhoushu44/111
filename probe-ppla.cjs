const fs = require('fs')

const orig = fs.readFileSync('C:/Users/zs/Desktop/HSTIP_SHMQ(1)/HSTIP_SHMQ/1')
const gi = orig.indexOf(Buffer.from('ICPgfx0')) + 9      // 55
const li = orig.lastIndexOf(0x0d)                        // CR before final

// 尝试多种「头长度」，把后面的数据当裸位图渲染，看哪种能得到清晰标签
const body = orig.slice(gi, li)   // 到 CR 前
console.log('图形区(到CR前):', body.length, '字节')

const candidates = [0, 16, 21, 22, 26, 32]
for (const hdr of candidates) {
  const b = body.slice(hdr)
  // 找能被整除的宽度
  const hits = []
  for (let w = 8; w <= 640; w += 8) {
    const bpr = w / 8
    if (b.length % bpr === 0) {
      const rows = b.length / bpr
      if (rows >= 100 && rows <= 400) hits.push([w, rows])
    }
  }
  if (hits.length) console.log('hdr=' + hdr, '→ 可能尺寸:', hits.map(([w, r]) => w + 'x' + r).join(', '))
}

// 用 hdr=0、w=264 输出可视化
const W = 264, H = Math.floor(body.length / (W / 8))
console.log()
console.log('按 264 宽解析：行数 =', H, '(应为 299 才正好是原版画布)')
const bpr = W / 8
let out = ''
for (let r = 0; r < Math.min(H, 60); r += 2) {
  let line = ''
  for (let c = 0; c < W; c += 2) {
    const byte = body[r * bpr + (c >> 3)]
    line += (byte & (128 >> (c & 7))) ? '#' : ' '
  }
  out += line + '\n'
}
console.log(out)
