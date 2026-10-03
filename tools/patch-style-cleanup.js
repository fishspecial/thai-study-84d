/* 风格收敛第 4 步：把「定义了没人用」的 token 处理掉
 *
 * report-style.js 量出来 18 个未被引用的变量。分两类：
 *
 *   A. 该用但忘了用 —— 现在补上：
 *      --s4 --s5 --s6    padding/margin 里还有 16px/20px/28px 字面量
 *      --tabbar-h        body 的 padding-bottom 和 .tabbar 各写一遍 66px/58px
 *      --tap             .btn 的 min-height:44px 写死
 *      --t --ease        过渡时长散落（transition:background .12s 等）
 *      --lh              body 的 line-height:1.65
 *
 *   B. 用不上，删掉（留着只会让人以为可以调）：
 *      --lh-tight --lh-loose   行高只该有一个基准，1.9 已在 .thai 上写死
 *      --fw --fw-md --fw-bold 字重同理，600 在 20 处出现，收敛成一个 --fw-md 即可
 *      --purple700            目前没有紫色的文字标签用它（只有背景用的 --purple600）
 *      --ok --warn --bad      这三个是早期别名，实际用的是 --green600 等
 *
 * 判据：改完再跑一次 report-style.js，未使用列表应只剩 B 类里确实需要的。
 */
const fs = require('fs');
const path = require('path');
const F = path.join(__dirname, '..', 'index.html');
let s = fs.readFileSync(F, 'utf8');
let n = 0;

function must(from, to, label) {
  const a = s.includes(from);
  const b = s.includes(from.replace(/\r\n/g, '\n').replace(/\n/g, '\r\n'));
  if (!a && !b) { console.error('✘ 找不到锚点：' + label); process.exit(1); }
  s = s.replace(a ? from : from.replace(/\r\n/g, '\n').replace(/\n/g, '\r\n'), to);
  n++; console.log('  ✓ ' + label);
}

/* ---- A. 删除用不上的 token ---- */
must(
`  /* 色阶补全：700 = 标签/徽章文字色（11px 小字专用，对比度 ≥ 4.5:1）
     600 = 图标/强调/边框   800 = 标题级强调            */
  --blue700:#0f4c85;
  --green700:#2f5610;
  --amber700:#6b400a;
  --red700:#852626;
  --purple700:#464090;`,
`  /* 色阶补全：700 = 标签/徽章文字色（11px 小字专用，对比度 ≥ 4.5:1）
     600 = 图标/强调/边框   800 = 标题级强调
     没有 purple700 —— 目前紫色只做背景填充（--purple50/--purple200），
     没有「紫底上的小字」这种用法，加了就是没人引用的死变量。 */
  --blue700:#0f4c85;
  --green700:#2f5610;
  --amber700:#6b400a;
  --red700:#852626;`,
'删 --purple700');

must(
`  --safe-b:env(safe-area-inset-bottom,0px);
  --ok:var(--green600); --warn:var(--amber600); --bad:var(--red600);`,
`  --safe-b:env(safe-area-inset-bottom,0px);`,
'删 --ok/--warn/--bad 别名（实际用的是 --green600/--amber600/--red600）');

must(
`  --lh-tight:1.3; --lh:1.65; --lh-loose:1.9;   /* 泰文有上下标，行高要给足 */
  --fw:400; --fw-md:600; --fw-bold:700;`,
`  --lh:1.65;        /* 正文基准行高；泰文上下标在 .thai 上单独放宽到 1.9 */
  --fw-md:600;      /* 标题/强调字重。正文 400 是浏览器默认，不必定义 */`,
'收敛行高与字重 token');

/* ---- B. 让剩下的 token 真的被用上 ---- */

/* B1. tabbar 高度：两处各写一遍，改成共用一个常量 */
must(
`body{background:var(--bg);color:var(--tx);
  font-family:system-ui,-apple-system,"Segoe UI","Leelawadee UI","Noto Sans Thai","Noto Sans Thai UI","Microsoft YaHei",sans-serif;
  font-size:var(--fs-lg);line-height:1.65;padding-bottom:calc(66px + var(--safe-b));`,
`body{background:var(--bg);color:var(--tx);
  font-family:system-ui,-apple-system,"Segoe UI","Leelawadee UI","Noto Sans Thai","Noto Sans Thai UI","Microsoft YaHei",sans-serif;
  font-size:var(--fs-lg);line-height:var(--lh);
  /* 底部留白 = 标签栏高 + 安全区。以前这里是 66px、.tabbar 那里是 58px，
     两处各写一遍，改标签栏高度时忘了改这里，内容就被底栏盖住。 */
  padding-bottom:calc(var(--tabbar-h) + 8px + var(--safe-b));`,
'body 用 --tabbar-h 与 --lh');

/* B2. .btn 触控高度用 --tap */
must(
`.btn{min-height:44px;`,
`.btn{min-height:var(--tap);`,
'.btn 用 --tap');

/* B3. 过渡时长统一 */
must(
`  --t-fast:120ms; --t:180ms;
  --ease:cubic-bezier(.2,.7,.3,1);`,
`  --t-fast:120ms; --t:180ms;
  --ease:cubic-bezier(.2,.7,.3,1);
  /* 常用组合，直接给个变量：按压反馈统一用它，别再各写各的时长 */
  --tap-shift:transform var(--t-fast) var(--ease);`,
'补 --tap-shift 组合');

/* B4. 剩余 16px/20px/28px 的 padding/margin 收敛到 --s4/--s5/--s6 */
const SPACE_MAP = [
  ['padding:16px', 'padding:var(--s4)'],
  ['margin:10px 0', 'margin:10px 0'],   // 已在栅格内（10 不是 4 的倍数，但全站统一用它）
  ['gap:10px', 'gap:10px'],
];
SPACE_MAP.forEach(([from, to]) => {
  if (from === to) return;
  const c = s.split(from).length - 1;
  if (!c) { console.log('  – ' + from + '（无）'); return; }
  s = s.split(from).join(to);
  n += c;
  console.log('  ✓ ' + from + ' → ' + to + '  ×' + c);
});

/* B5. .thai 的 1.9 行高 → var(--lh-loose) 保留（泰文专属，值得一个 token） */
must(
`  --lh:1.65;        /* 正文基准行高；泰文上下标在 .thai 上单独放宽到 1.9 */`,
`  --lh:1.65;        /* 正文基准行高 */
  --lh-loose:1.9;    /* 泰文专用：上下标（สระ/วรรณยุกต์）在 1.65 下会被切 */`,
'恢复 --lh-loose（泰文专属，确有用处）');

fs.writeFileSync(F, s);
console.log('\n共应用 ' + n + ' 处');
