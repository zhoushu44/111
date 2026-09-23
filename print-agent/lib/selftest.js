'use strict'
/**
 * 内置自检位图：不依赖任何第三方库，直接按 203dpi 绘制几何图案。
 * 用途——验证「网页 → 本机代理 → 打印机」整条链路是否通，
 * 以及位图的极性（1=白 0=黑）、位序（MSB 在左）、行序（自上而下）是否正确。
 *
 * 图案（白底黑图）：
 *   - 四周 2px 黑色边框
 *   - 左上角实心方块
 *   - 一条从左上到右下的对角线
 *   - 右下角实心长条
 *   - 底部一排等距竖线（检查是否有横向拉伸/压缩）
 */

/** 1-bit 位图画布：内部字节初值 0xFF（全白），画黑点即清位 */
function createCanvas(widthDots, heightDots) {
  const bytesPerRow = Math.ceil(widthDots / 8)
  const buf = Buffer.alloc(bytesPerRow * heightDots, 0xff)
  return {
    widthDots,
    heightDots,
    bytesPerRow,
    buf,
    /** 画一个黑点（越界忽略） */
    black(x, y) {
      x = Math.round(x)
      y = Math.round(y)
      if (x < 0 || y < 0 || x >= widthDots || y >= heightDots) return
      buf[y * bytesPerRow + (x >> 3)] &= ~(0x80 >> (x & 7))
    },
    /** 画矩形（含边界） */
    rect(x0, y0, x1, y1) {
      for (let y = Math.round(y0); y <= Math.round(y1); y++) {
        for (let x = Math.round(x0); x <= Math.round(x1); x++) this.black(x, y)
      }
    },
    /** 画线宽为 w 的实心矩形边框 */
    frame(w) {
      this.rect(0, 0, widthDots - 1, w - 1)
      this.rect(0, heightDots - w, widthDots - 1, heightDots - 1)
      this.rect(0, 0, w - 1, heightDots - 1)
      this.rect(widthDots - w, 0, widthDots - 1, heightDots - 1)
    },
  }
}

/**
 * 生成自检位图
 * @param {object} cfg printer.label { widthMm, heightMm, dpi }
 * @returns {{widthDots:number, heightDots:number, raster:Buffer}}
 */
function buildSelfTestRaster(cfg) {
  const dpi = (cfg && cfg.dpi) || 203
  // 宽度向上取整到 8 的倍数：PPLB GW 按字节描述每行，非对齐会导致错位
  const rawW = Math.round(((cfg && cfg.widthMm) || 70) * dpi / 25.4)
  const widthDots = Math.ceil(rawW / 8) * 8
  const heightDots = Math.round(((cfg && cfg.heightMm) || 40) * dpi / 25.4)
  const c = createCanvas(widthDots, heightDots)

  c.frame(2)
  // 左上角实心方块（验证原点在左上）
  c.rect(20, 20, 90, 90)
  // 对角线（验证位序不镜像）
  const diag = Math.min(widthDots, heightDots) - 40
  for (let i = 0; i < diag; i++) c.black(20 + i, 20 + i)
  // 右下角实心长条（验证右下区域可达）
  c.rect(widthDots - 200, heightDots - 120, widthDots - 20, heightDots - 20)
  // 底部等距竖线（验证横向比例正确）
  for (let i = 1; i <= 20; i++) {
    const x = Math.round((widthDots * i) / 21)
    c.rect(x, heightDots - 60, x + 2, heightDots - 20)
  }

  return { widthDots, heightDots, raster: c.buf }
}

module.exports = { buildSelfTestRaster }
