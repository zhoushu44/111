const fs = require('fs')

const o = fs.readFileSync('C:/Users/zs/Desktop/HSTIP_SHMQ(1)/HSTIP_SHMQ/1')
const body = o.slice(55 + 21, 9923)
console.log('数据长度:', body.length)

// 统计：如果位图是白底黑字，1 的比例应在 8~25%
const countOnes = (buf) => {
  let n = 0
  for (const b of buf) { let x = b; while (x) { n++; x &= x - 1 } }
  return n
}
const cnt = countOnes(body)
console.log('1 的占比:', (cnt / (body.length * 8) * 100).toFixed(2) + '%')
console.log('0 的占比:', (100 - cnt / (body.length * 8) * 100).toFixed(2) + '%')
console.log()

// 逐字节看分布：如果某几位恒为 1，说明是「位平面」或「间隔位」
const bitOnes = new Array(8).fill(0)
for (const b of body) for (let k = 0; k < 8; k++) if (b & (1 << k)) bitOnes[k]++
console.log('各 bit 位为 1 的次数（bit0..bit7）:')
console.log(bitOnes.map((v, i) => 'bit' + i + '=' + (v / body.length * 100).toFixed(1) + '%').join('  '))
console.log()

// 看数据里是否有明显的重复周期
const findPeriod = (buf, maxP = 200) => {
  for (let p = 1; p <= maxP; p++) {
    let same = 0, tot = 0
    for (let i = 0; i + p < buf.length && i < 4000; i++) { tot++; if (buf[i] === buf[i + p]) same++ }
    if (tot > 0 && same / tot > 0.9) return p
  }
  return -1
}
console.log('重复周期:', findPeriod(body))

// 打印前 48 字节，人工看结构
console.log()
console.log('前 48 字节 hex:')
for (let i = 0; i < 48; i += 16) {
  console.log('  ' + Array.from(body.slice(i, i + 16)).map(x => x.toString(16).padStart(2, '0')).join(' '))
}
