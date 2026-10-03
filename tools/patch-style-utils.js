/* 统一前端风格 · 第 3 步：消灭内联 style 里最高频的两类
 *
 * 盘点（tools/diag-style.js）：内联 style 属性 83 处 / 43 种。
 * 排第一的是 margin-top:0 独占 16 处 —— 全都是同一个意思：
 * 「卡片里的第一个元素不要上边距」。16 遍重复说明缺一个工具类。
 * 第二是 font-size:12.5px 之类（现在字号已收敛到 token，写字面量本身就是回退）。
 *
 * 这里只做两件事，不做全面重构：
 *   1. 加 .mt0 / .row / .mt-* 四个工具类
 *   2. 把 margin-top:0 全部换成 class="mt0"
 * 其余内联 style 保留 —— 它们大多是一次性的布局微调，
 * 强行抽象反而会造出没人理解的类名。
 */
const fs = require('fs');
const path = require('path');
const F = path.join(__dirname, '..', 'index.html');
let s = fs.readFileSync(F, 'utf8');
let n = 0;

function must(from, to, label, expectAll) {
  const a = s.includes(from);
  const b = s.includes(from.replace(/\r\n/g, '\n').replace(/\n/g, '\r\n'));
  if (!a && !b) { console.error('✘ 找不到锚点：' + label); process.exit(1); }
  const src = a ? from : from.replace(/\r\n/g, '\n').replace(/\n/g, '\r\n');
  const c = src.split(from).length - 1;
  s = s.replace(new RegExp(escapeRe(src), 'g'), to);
  n += c;
  console.log('  ✓ ' + label + '  ×' + c);
}
function escapeRe(x) { return x.replace(/[.*+?^${}()|[\]\\]/g, '\\$&'); }

/* ---- 1. 加工具类：放在 .sub 定义之后（基础排版区） ---- */
must(
`.sub{color:var(--tx2);font-size:var(--fs-md)}`,
`.sub{color:var(--tx2);font-size:var(--fs-md)}
/* ---- 布局工具类 ----
   只收「重复 3 次以上、语义明确」的，其余内联 style 保留。
   内联 style 83 处里 margin-top:0 独占 16 处，全是同一个意思：
   卡片内首个元素不要上边距。用一个类替掉，比写 16 遍内联样式好维护。 */
.mt0{margin-top:0}
.mt6{margin-top:var(--s1) var(--s2)}   /* 上下都留，纵向节奏更匀 */
.mt8{margin-top:var(--s2)}
.mt12{margin-top:var(--s3)}
.row{display:flex;align-items:center;gap:var(--s2)}
.row.wrap{flex-wrap:wrap}`,
'加布局工具类');

/* ---- 2. margin-top:0 → class="mt0" ----
   注意要处理两种形态：style="margin-top:0" 独占整个属性串，
   以及 class="..." 里混着 margin-top:0 的。分开处理。 */
const only = (s.match(/style="margin-top:0"/g) || []).length;
s = s.split('style="margin-top:0"').join('data-mt0="1"');
console.log('  ✓ 独占形态 margin-top:0 → mt0  ×' + only);
n += only;

/* 混合形态：class="x" style="margin-top:0" → class="x mt0" */
const mixed = (s.match(/class="([^"]*)" style="margin-top:0"/g) || []).length;
s = s.replace(/class="([^"]*)" data-mt0="1"/g, 'class="$1 mt0"');
console.log('  ✓ 混合形态 → class="… mt0"  ×' + mixed);
n += mixed;

/* 剩下裸的 data-mt0（前面 class 已带 mt0 的情况要还原） */
const rest = (s.match(/data-mt0="1"/g) || []).length;
if (rest) { s = s.replace(/data-mt0="1"/g, 'class="mt0"'); console.log('  ✓ 剩余裸标记 → class="mt0"  ×' + rest); n += rest; }

/* 若出现重复 class（class="mt0 mt0"）要清一下 */
s = s.replace(/class="([^"]*?)\bmt0\b([^"]*?\bmt0\b[^"]*)"/g, 'class="$1mt0$2"');

if (/margin-top:0"/.test(s)) {
  const left = (s.match(/margin-top:0"/g) || []).length;
  console.error('✘ 仍有 ' + left + ' 处 margin-top:0 未替换');
  process.exit(1);
}

fs.writeFileSync(F, s);
console.log('\n共应用 ' + n + ' 处');
