/* 直接扫用户原图的像素，量每一行泰文墨迹的位置。
 * 不猜、不推断 —— 用户看到什么，量出来就是什么。
 * 用法: node tools/diag-user-shot.js <png路径>
 */
const fs = require('fs');
const { PNG } = require('pngjs');

const file = process.argv[2] || 'C:/Users/Chuyu Tan/.workbuddy/clipboard-images/clipboard-2026-10-03T11-24-11-259Z-ded87928.png';
const png = PNG.sync.read(fs.readFileSync(file));
const { width: W, height: H, data } = png;

console.log('图片 ' + W + ' x ' + H);

/* 先找按钮边框：横向长条的暗行 */
console.log('\n=== 横向长暗行（按钮上下边框）===');
const borders = [];
for (let y = 0; y < H; y++) {
  let n = 0;
  for (let x = 0; x < W; x++) {
    const i = (y * W + x) * 4;
    if (data[i] < 235 || data[i + 1] < 235 || data[i + 2] < 235) n++;
  }
  /* 边框横贯大部分宽度 */
  if (n > W * 0.6) borders.push({ y, n });
}
/* 合并相邻 */
const merged = [];
borders.forEach(b => {
  const last = merged[merged.length - 1];
  if (last && b.y - last.y1 <= 2) last.y1 = b.y;
  else merged.push({ y0: b.y, y1: b.y });
});
merged.forEach(m => console.log('  y=' + m.y0 + '~' + m.y1 + '  (共' + (m.y1 - m.y0 + 1) + 'px)'));

/* 按钮 = 相邻两条边框之间 */
console.log('\n=== 每个按钮内的文字墨迹位置 ===');
const boxes = [];
for (let k = 0; k + 1 < merged.length; k++) {
  const top = merged[k].y1 + 1;
  const bot = merged[k + 1].y0 - 1;
  if (bot - top < 20) continue;
  /* 只取左侧有文字的区域 x∈[70, 500]，避开居中的「退出」 */
  const x0 = 70, x1 = 520;
  const rows = [];
  for (let y = top; y <= bot; y++) {
    let n = 0, minX = 1e9, maxX = -1;
    for (let x = x0; x <= x1; x++) {
      const i = (y * W + x) * 4;
      if (data[i] < 170 || data[i + 1] < 170 || data[i + 2] < 170) { n++; if (x < minX) minX = x; if (x > maxX) maxX = x; }
    }
    if (n >= 2) rows.push({ y, n, minX, maxX });
  }
  if (!rows.length) continue;
  /* emoji 是彩色，阈值 170 可能漏；用 200 重扫一遍补上 */
  const t = rows[0].y, b = rows[rows.length - 1].y;
  const cx = (t + b) / 2;
  boxes.push({ idx: k, top, bot, h: bot - top + 1, inkTop: t, inkBot: b, inkH: b - t + 1, inkCenter: cx, centerOffset: +(cx - (top + bot) / 2).toFixed(1), xFrom: rows[0].minX, xTo: rows[rows.length - 1].maxX });
}

boxes.forEach(b => {
  console.log('  按钮' + b.idx + ' y=[' + b.top + ',' + b.bot + '] 高' + b.h
    + ' | 墨迹 y=[' + b.inkTop + ',' + b.inkBot + '] 高' + b.inkH
    + ' | 中心偏移=' + b.centerOffset
    + ' | 文字 x=[' + b.xFrom + ',' + b.xTo + ']');
});

const offs = boxes.filter(b => b.h > 40).map(b => b.centerOffset);
if (offs.length > 1) {
  const spread = Math.max(...offs) - Math.min(...offs);
  console.log('\n→ 高按钮的中心偏移极差 = ' + spread.toFixed(1) + 'px');
  console.log('  偏移: ' + offs.join(', '));
}
