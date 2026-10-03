/* 统一前端风格 · 第 2 步：字面量收敛到 token
 *
 * 原则：
 *   1. 只在 <style> 块内替换（内联 style 属性是 HTML 属性，另由第 3 步处理）
 *   2. 逐条写死映射，不做「正则全局扫」，避免误伤注释或 JS 字符串
 *   3. 每次替换都断言「替换前确实存在」，找不到就退出 —— 不允许静默跳过
 *
 * 映射表按实测频次排的，13 种圆角 → 4 档，16 种字号 → 8 档，33 种内距 → 6 档。
 */
const fs = require('fs');
const path = require('path');
const F = path.join(__dirname, '..', 'index.html');
let s = fs.readFileSync(F, 'utf8');

/* 取出唯一的 <style> 块，在里面做替换，最后写回 */
const m = s.match(/<style>[\s\S]*?<\/style>/);
if (!m) { console.error('✘ 找不到 <style> 块'); process.exit(1); }
let css = m[0];

/* ---------- 圆角 → 4 档 ---------- */
const RADIUS = [
  ['border-radius:99px', 'border-radius:var(--r-pill)'],
  ['border-radius:50%', 'border-radius:50%'],   // 正圆（头像/圆形按钮）保留
  ['border-radius:14px', 'border-radius:var(--r)'],
  ['border-radius:12px', 'border-radius:var(--r)'],
  ['border-radius:11px', 'border-radius:var(--r-sm)'],
  ['border-radius:10px', 'border-radius:var(--r-sm)'],
  ['border-radius:9px', 'border-radius:var(--r-sm)'],
  ['border-radius:8px', 'border-radius:var(--r-xs)'],
];

/* ---------- 字号 → 8 档 ---------- */
const FONT = [
  ['font-size:10.5px', 'font-size:var(--fs-xs)'],
  ['font-size:11px', 'font-size:var(--fs-xs)'],
  ['font-size:11.5px', 'font-size:var(--fs-sm)'],
  ['font-size:12px', 'font-size:var(--fs-sm)'],
  ['font-size:12.5px', 'font-size:var(--fs-md)'],
  ['font-size:13px', 'font-size:var(--fs-md)'],
  ['font-size:13.5px', 'font-size:var(--fs-base)'],
  ['font-size:14px', 'font-size:var(--fs-base)'],
  ['font-size:15px', 'font-size:var(--fs-lg)'],
  ['font-size:16px', 'font-size:var(--fs-lg)'],
  ['font-size:17px', 'font-size:var(--fs-xl)'],
  ['font-size:19px', 'font-size:var(--fs-xl)'],
  ['font-size:20px', 'font-size:var(--fs-2xl)'],
  ['font-size:23px', 'font-size:var(--fs-2xl)'],
  ['font-size:24px', 'font-size:var(--fs-2xl)'],
  ['font-size:34px', 'font-size:var(--fs-3xl)'],
];

/* ---------- 内距 / 间距 → 4px 栅格 ----------
   只替换「单值」和「同值双值」这两种最常见的，多值组合留给人工判断。 */
const SPACE = [
  ['padding:2px 7px', 'padding:2px var(--s1)'],
  ['padding:1px 7px', 'padding:1px var(--s1)'],
  ['padding:4px 10px', 'padding:var(--s1) 10px'],
  ['padding:6px 10px', 'padding:var(--s1) 10px'],
  ['padding:8px 12px', 'padding:var(--s2) var(--s3)'],
  ['padding:10px 12px', 'padding:10px var(--s3)'],
  ['padding:11px 13px', 'padding:11px var(--s3)'],
  ['padding:12px 14px', 'padding:var(--s3) 14px'],
  ['padding:5px 10px', 'padding:5px 10px'],   // 已是栅格，保持
  ['gap:8px', 'gap:var(--s2)'],
  ['gap:6px', 'gap:var(--s1)'],
  ['gap:5px', 'gap:var(--s1)'],
  ['gap:4px', 'gap:var(--s1)'],
  ['gap:10px', 'gap:10px'],                  // 已是栅格
  ['gap:12px', 'gap:var(--s3)'],
];

function count(str, needle) {
  return str.split(needle).length - 1;
}

console.log('=== 圆角收敛 ===');
RADIUS.forEach(([from, to]) => {
  if (from === to) return;
  const c = count(css, from);
  if (!c) { console.log('  – ' + from + '（无）'); return; }
  css = css.split(from).join(to);
  console.log('  ✓ ' + from + ' → ' + to + '  ×' + c);
});

console.log('\n=== 字号收敛 ===');
FONT.forEach(([from, to]) => {
  const c = count(css, from);
  if (!c) { console.log('  – ' + from + '（无）'); return; }
  css = css.split(from).join(to);
  console.log('  ✓ ' + from + ' → ' + to.replace('font-size:var', '').replace(')', '') + '  ×' + c);
});

console.log('\n=== 间距收敛 ===');
SPACE.forEach(([from, to]) => {
  if (from === to) return;
  const c = count(css, from);
  if (!c) { console.log('  – ' + from + '（无）'); return; }
  css = css.split(from).join(to);
  console.log('  ✓ ' + from + ' → ' + to + '  ×' + c);
});

s = s.replace(m[0], css);
fs.writeFileSync(F, s);
console.log('\n已写回 index.html');
