const fs = require('fs')

const o = fs.readFileSync('C:/Users/zs/Desktop/HSTIP_SHMQ(1)/HSTIP_SHMQ/1')
const iStart = 55
const hdr = 21                       // 21 字节图形属性头
const W = 264, H = 299
const bpr = W / 8
const body = o.slice(iStart + hdr, iStart + hdr + bpr * H)

const render = (invert) => {
  const rows = []
  for (let r = 0; r < H; r += 4) {
    let line = ''
    for (let c = 0; c < W; c += 2) {
      const byte = body[r * bpr + (c >> 3)]
      let bit = (byte & (128 >> (c & 7))) ? 1 : 0
      if (invert) bit ^= 1
      line += bit ? '#' : ' '
    }
    rows.push(line)
  }
  return rows
}

const show = (title, rows) => {
  console.log('======== ' + title + ' ========')
  rows.slice(0, 40).forEach(l => console.log(l))
  console.log()
}

show('极性 A：1=黑（当前假设）', render(false))
show('极性 B：1=白（取反）', render(true))
