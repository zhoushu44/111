const fs = require('fs')

const o = fs.readFileSync('C:/Users/zs/Desktop/HSTIP_SHMQ(1)/HSTIP_SHMQ/1')
const body = o.slice(55 + 21, 9923)

// 思路：真实位图里，行与行之间在「同一列」上有相关性（文字笔画竖直连续）。
// 对每个候选行宽 bpr，计算「相邻行同一字节位置的相似度」；相似度越高越可能是正确行宽。
const score = (bpr) => {
  const rows = Math.floor(body.length / bpr)
  let same = 0, tot = 0
  for (let r = 0; r + 1 < rows; r++) {
    for (let c = 0; c < bpr; c++) {
      tot++
      if (body[r * bpr + c] === body[(r + 1) * bpr + c]) same++
    }
  }
  return same / tot
}

const list = []
for (let bpr = 1; bpr <= 128; bpr++) {
  list.push({ bpr, rows: Math.floor(body.length / bpr), s: score(bpr) })
}
list.sort((a, b) => b.s - a.s)
console.log('按「相邻行相似度」排序 Top 15（越高越像真实行宽）:')
list.slice(0, 15).forEach(x => console.log('  bpr=' + x.bpr, '(宽 ' + x.bpr * 8 + ' 点)', 'rows=' + x.rows, '相似度=' + (x.s * 100).toFixed(2) + '%'))

// 全部相似度均值做参照
const avg = list.reduce((s, x) => s + x.s, 0) / list.length
console.log('平均相似度:', (avg * 100).toFixed(2) + '%（显著高于均值的才是真实行宽）')
