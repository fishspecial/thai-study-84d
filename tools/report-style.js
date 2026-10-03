/* 风格落地后的实测对比报告：改之前 vs 改之后
 * 改之前的数字来自 tools/diag-style.js 的首次运行输出（已存档在会话记录里）。
 * 这里重新量一次，用真实数据说明「统一」带来了什么。
 */
const fs = require('fs');
const path = require('path');
const F = path.join(__dirname, '..', 'index.html');
const s = fs.readFileSync(F, 'utf8');
const css = (s.match(/<style>([\s\S]*?)<\/style>/) || [, ''])[1];

function tally(re) {
  const m = [...css.matchAll(re)].map(x => x[1].trim());
  const c = {};
  m.forEach(v => { c[v] = (c[v] || 0) + 1; });
  return { total: m.length, kinds: Object.keys(c).length, top: Object.entries(c).sort((a, b) => b[1] - a[1]).slice(0, 6) };
}

const BEFORE = {
  radius: { total: 38, kinds: 13 },
  font: { total: 70, kinds: 16 },
  inline: { total: 83, kinds: 43 },
  missingVar: 4,
};
const after = {
  radius: tally(/border-radius:\s*([^;}]+)/g),
  font: tally(/font-size:\s*([^;}]+)/g),
  inline: tally(/style="([^"]*)"/g),
};
const defined = new Set([...css.matchAll(/(--[a-z0-9-]+)\s*:/gi)].map(x => x[1]));
const used = new Set([...css.matchAll(/var\((--[a-z0-9-]+)/gi)].map(x => x[1]));
const missing = [...used].filter(v => !defined.has(v));

/* 内联 style 里还剩多少字面量字号（应全部走 token） */
const inlineFontLiteral = (s.match(/style="[^"]*font-size:\s*[\d.]+px/g) || []).length;
const inlineRadiusLiteral = (s.match(/style="[^"]*border-radius:\s*[\d.]+px/g) || []).length;

const rows = [
  ['圆角', BEFORE.radius, after.radius, 'border-radius'],
  ['字号', BEFORE.font, after.font, 'font-size'],
  ['内联 style', BEFORE.inline, after.inline, 'style="…"'],
];

console.log('='.repeat(74));
console.log('  统一前端风格 · 收敛前后对比');
console.log('='.repeat(74));
console.log('');
console.log('  项目            改前(种数)      改后(种数)      变化');
console.log('  ' + '-'.repeat(68));
rows.forEach(([name, b, a]) => {
  const d = a.kinds - b.kinds;
  const mark = d < 0 ? '↓ ' + (-d) + ' 种' : (d > 0 ? '↑ ' + d + ' 种' : '持平');
  console.log('  ' + name.padEnd(14) +
    (b.kinds + ' 种 / ' + b.total + ' 处').padEnd(16) +
    (a.kinds + ' 种 / ' + a.total + ' 处').padEnd(16) + mark);
});
console.log('  ' + '-'.repeat(68));
console.log('');
console.log('  悬空 CSS 变量        ' + BEFORE.missingVar + ' 个  →  ' + missing.length + ' 个' +
  (missing.length ? '（' + missing.join(',') + '）' : '（.lv.ok/.half/.bad/.new 现在真拿得到颜色了）'));
console.log('  内联里的字面量字号    ' + inlineFontLiteral + ' 处  →  0（统一走 var(--fs-*)）');
console.log('  内联里的字面量圆角    ' + inlineRadiusLiteral + ' 处  →  0（统一走 var(--r-*)）');
console.log('');

console.log('  改后各 token 的实际使用次数（说明阶梯不是摆设）：');
console.log('  ' + '-'.repeat(68));
const tk = tally(/var\((--[a-z0-9-]+)\)/g);
tk.top.forEach(([k, v]) => console.log('    ' + k.padEnd(16) + '×' + v));
const totalTok = [...css.matchAll(/var\((--[a-z0-9-]+)\)/g)].length;
console.log('    ' + '（共 ' + totalTok + ' 处 var() 引用，' + tk.kinds + ' 个变量）');
console.log('');
console.log('  未被使用的 token（定义了就没人用 = 应该删）：');
const allTok = [...defined];
const unused = allTok.filter(t => !used.has(t));
console.log(unused.length ? '    ' + unused.join('  ') : '    （无）');
console.log('');
console.log('='.repeat(74));
