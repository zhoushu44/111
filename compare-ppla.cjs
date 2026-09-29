const fs = require('fs')
const orig = fs.readFileSync('C:/Users/zs/Desktop/HSTIP_SHMQ(1)/HSTIP_SHMQ/1')
const mine = fs.readFileSync('C:/Users/zs/Desktop/1112/OUT.prn')

const dump = (b, n) => {
  let s = ''
  for (let i = 0; i < Math.min(n, b.length); i++) {
    const c = b[i]
    if (c === 13) s += '<CR>'
    else if (c === 10) s += '<LF>'
    else if (c === 2) s += '<STX>'
    else if (c === 1) s += '<SOH>'
    else if (c >= 32 && c < 127) s += String.fromCharCode(c)
    else s += '[' + c + ']'
  }
  return s
}

console.log('原版  :', orig.length, '字节')
console.log('新生成:', mine.length, '字节')
console.log()
console.log('原版头部  :', dump(orig, 62))
console.log('新生成头部:', dump(mine, 62))
console.log()

const frames = (b) => {
  const r = []
  let i = 0
  while (i < b.length) {
    if (b[i] === 2 || b[i] === 1) {
      const p = b[i]
      let j = i + 1, s = ''
      while (j < b.length && b[j] !== 13 && s.length < 30) { s += String.fromCharCode(b[j]); j++ }
      if (s.length > 0 && /^[\x20-\x7E]+$/.test(s)) r.push((p === 2 ? 'STX ' : 'SOH ') + s)
      i = j + 2
    } else i++
  }
  return r
}

const fo = frames(orig), fm = frames(mine)
console.log('=== 关键帧比对（前 8）===')
for (let i = 0; i < 8; i++) console.log((fo[i] === fm[i] ? 'OK ' : 'XX ') + '原:' + String(fo[i]).padEnd(16) + ' 新:' + String(fm[i]))

console.log()
console.log('=== 尾部命令是否存在 ===')
;['STX L', 'STX D11', 'STX A2', 'STX Q0001', 'STX E', 'STX xCGgfx0'].forEach(k => console.log((fm.includes(k) ? 'OK ' : 'XX ') + k))

const gi = mine.indexOf(Buffer.from('ICPgfx0'))
const go = orig.indexOf(Buffer.from('ICPgfx0'))
console.log()
console.log('图形属性头 新:', Array.from(mine.slice(gi + 9, gi + 30)).map(x => x.toString(16).padStart(2, '0')).join(' '))
console.log('图形属性头 原:', Array.from(orig.slice(go + 9, go + 30)).map(x => x.toString(16).padStart(2, '0')).join(' '))
console.log('位图区长度 新:', mine.slice(gi + 9 + 21).length - 2, ' 原:', orig.slice(go + 9 + 21).length - 2)
console.log('位图区长度是否符合 264x299=33*299:', 33 * 299)
