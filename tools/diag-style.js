/* 盘点前端风格不一致点：圆角 / 内边距 / 字号 / 间距 四条阶梯 */
const fs = require('fs');
const s = fs.readFileSync(__dirname + '/../index.html', 'utf8');
const css = (s.match(/<style>([\s\S]*?)<\/style>/) || [, ''])[1];
console.log('CSS 行数:', css.split('\n').length);

function tally(re, label) {
  const m = [...css.matchAll(re)].map(x => x[1].trim());
  const c = {};
  m.forEach(v => { c[v] = (c[v] || 0) + 1; });
  const e = Object.entries(c).sort((a, b) => b[1] - a[1]);
  console.log('\n--- ' + label + ' (' + m.length + ' 处 / ' + e.length + ' 种) ---');
  console.log(e.slice(0, 16).map(([k, v]) => k + '×' + v).join('  '));
  if (e.length > 16) console.log('… 还有 ' + (e.length - 16) + ' 种');
}

tally(/border-radius:\s*([^;}]+)/g, 'border-radius');
tally(/padding:\s*([^;}]+)/g, 'padding');
tally(/font-size:\s*([^;}]+)/g, 'font-size');
tally(/gap:\s*([^;}]+)/g, 'gap');

/* 硬编码颜色（不走变量） */
const hexes = [...css.matchAll(/#[0-9a-fA-F]{3,8}\b/g)].map(x => x[0]);
const hc = {};
hexes.forEach(v => { hc[v] = (hc[v] || 0) + 1; });
console.log('\n--- CSS 里硬编码色值 (' + hexes.length + ' 处) ---');
console.log(Object.entries(hc).sort((a, b) => b[1] - a[1]).map(([k, v]) => k + '×' + v).join('  '));

/* HTML 内联 style 里的色值 */
const inline = [...s.matchAll(/style="([^"]*)"/g)].map(x => x[1]);
const ic = {};
inline.forEach(v => { ic[v] = (ic[v] || 0) + 1; });
console.log('\n--- 内联 style 属性 (' + inline.length + ' 处 / ' + Object.keys(ic).length + ' 种) ---');
console.log(Object.entries(ic).sort((a, b) => b[1] - a[1]).slice(0, 18).map(([k, v]) => k.slice(0, 60) + ' ×' + v).join('\n'));
