/* 风格收敛第 5 步：泰文行高与动效时长统一
 *
 * ① .thai / .th 的 line-height:1.9 写死两遍 → var(--lh-loose)
 *    泰文有上下标（สระ วรรณยุกต์），1.65 下会被上下切掉。
 *    这是唯一该用宽松行高的地方，给它一个具名 token，
 *    以后有人改全局 line-height 时不会顺带把泰文切了。
 *
 * ② transition 时长散落 11 处、6 种（.08 .12 .15 .18 .22 .3 .35）→ 三档
 *      --t-instant 80ms   按压（transform:scale），要跟手，慢了有延迟感
 *      --t-fast    120ms  颜色/边框/阴影等状态切换
 *      --t         180ms  展开收起（max-height / height）
 *    .35s 的进度条宽度变化保留 —— 那是「进度在走」的可感知提示，
 *    太快用户看不到变化过程。单独给 --t-slow:350ms。
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

/* ---- ① 泰文行高 ---- */
must(
`  --lh:1.65;        /* 正文基准行高 */
  --lh-loose:1.9;    /* 泰文专用：上下标（สระ/วรรณยุกต์）在 1.65 下会被切 */`,
`  --lh:1.65;        /* 正文基准行高 */
  --lh-loose:1.9;    /* 泰文专用：上下标（สระ วรรณยุกต์）在 1.65 下会被切 */`,
'泰文行高注释（确认保留）');

const thaiBefore = (s.match(/line-height:1\.9/g) || []).length;
s = s.split('line-height:1.9').join('line-height:var(--lh-loose)');
console.log('  ✓ .thai/.th 行高 → var(--lh-loose)  ×' + thaiBefore);
n += thaiBefore;

/* ---- ② 动效时长三档 ---- */
must(
`  /* 动效：只在「按压反馈」和「浮层进出」上用，页面切换不做动画 */
  --t-fast:120ms; --t:180ms;
  --ease:cubic-bezier(.2,.7,.3,1);
  /* 常用组合，直接给个变量：按压反馈统一用它，别再各写各的时长 */
  --tap-shift:transform var(--t-fast) var(--ease);`,
`  /* 动效：只在「按压反馈」和「浮层进出」上用，页面切换不做动画。
     三档足够，多了只会让界面"各有各的 sluggish"：
       --t-instant 80ms  按压（transform:scale）—— 必须跟手，慢了有延迟感
       --t-fast    120ms 颜色/边框/阴影等状态切换
       --t         180ms 展开收起（max-height / height）
       --t-slow    350ms 进度条宽度——这是唯一需要"看得见在走"的地方 */
  --t-instant:80ms; --t-fast:120ms; --t:180ms; --t-slow:350ms;
  --ease:cubic-bezier(.2,.7,.3,1);
  /* 常用组合，直接给变量，别再各写各的 */
  --tap-shift:transform var(--t-instant) var(--ease);
  --tint:background var(--t-fast),border-color var(--t-fast),box-shadow var(--t-fast);`,
'动效三档 + 组合变量');

/* 逐条替换 transition */
const TR = [
  ['transition:transform .18s', 'transition:transform var(--t)'],
  ['transition:transform .08s,background .12s,border-color .12s,box-shadow .12s',
   'transition:var(--tap-shift),var(--tint)'],
  ['transition:transform .08s,background .12s', 'transition:var(--tap-shift),var(--t-fast) background'],
  ['transition:border-color .12s,box-shadow .12s', 'transition:var(--tint)'],
  ['transition:background .12s,border-color .12s,transform .08s', 'transition:var(--tint),var(--tap-shift)'],
  ['transition:background .15s,border-color .15s', 'transition:var(--tint)'],
  ['transition:width .35s ease', 'transition:width var(--t-slow) var(--ease)'],
  ['transition:width .3s ease', 'transition:width var(--t-slow) var(--ease)'],
  ['transition:max-height .22s ease,opacity .22s ease,margin .22s ease',
   'transition:max-height var(--t) var(--ease),opacity var(--t) var(--ease),margin var(--t) var(--ease)'],
  ['transition:background .12s', 'transition:background var(--t-fast)'],
];
TR.forEach(([from, to]) => {
  const c = s.split(from).length - 1;
  if (!c) { console.log('  – ' + from.slice(0, 44) + '（无）'); return; }
  s = s.split(from).join(to);
  n += c;
  console.log('  ✓ ' + from.slice(0, 46) + '  ×' + c);
});

/* 剩下的裸时长 */
const rest = [...s.matchAll(/transition:([^;}]*?)(\d*\.?\d+)s/g)].filter(m => m[2]);
if (rest.length) {
  console.log('  ! 仍有 ' + rest.length + ' 处裸秒数：');
  rest.slice(0, 6).forEach(m => console.log('      ' + m[0].slice(0, 60)));
} else {
  console.log('  ✓ transition 已无裸秒数');
}

fs.writeFileSync(F, s);
console.log('\n共应用 ' + n + ' 处');
