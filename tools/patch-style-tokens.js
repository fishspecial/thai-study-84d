/* 统一前端风格 · 第 1 步：建立完整 token 层
 * 只动 :root 和深色 :root，不碰任何组件规则 —— 零布局风险。
 */
const fs = require('fs');
const path = require('path');
const T = require('./style-tokens.js');

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

/* ---- 浅色 :root ---- */
must(
`  --r:16px;            /* 统一圆角 */
  --r-sm:11px;
}`,
`  --r:16px;            /* 统一圆角 */
  --r-sm:11px;
${T.COLOR}${T.FONT}${T.SPACE}${T.RADIUS}${T.MOTION}
  /* 触控目标下限：iOS 44pt / Material 48dp，取 44 */
  --tap:44px;
  /* 布局常量：底部标签栏高度，供 body 的 padding-bottom 与 .tabbar 共用，
     避免「加了 safe-b 就顶掉内容」这种两处各写一遍的问题 */
  --tabbar-h:58px;`,
'浅色 :root 补 token');

/* ---- 深色 :root：补 700 色阶 + 覆写需要变的 ----
   深色下 700 要更亮（--xx50 是深底，600 已经够，700 反而更 harmonize），
   这里让 700 落在 600 与 800 之间。 */
must(
`    --purple50:#262347; --purple200:#454080; --purple600:#b0a8f5;
    --sh1:0 1px 2px rgba(0,0,0,.3);`,
`    --purple50:#262347; --purple200:#454080; --purple600:#b0a8f5;
    /* 深色下的 700：比 600 略暗一点（深底上要降亮度防刺眼），
       比 800 亮，保证 11px 小字仍达 4.5:1 */
    --blue700:#7cbcf2;
    --green700:#7cc04a;
    --amber700:#e0b45c;
    --red700:#e07a7a;
    --purple700:#9c93e8;
    --sh1:0 1px 2px rgba(0,0,0,.3);`,
'深色 :root 补 700 色阶');

fs.writeFileSync(F, s);
console.log('\n共应用 ' + n + ' 处');
