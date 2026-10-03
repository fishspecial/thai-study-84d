/* CSS 结构守卫：抓「少一个括号导致后面所有规则失效」这类静默灾难
 *
 * 为什么必须有这个：patch-style-tokens.js 补 token 时把浅色 :root 的
 * 闭合大括号吃掉了，于是 @media (prefers-color-scheme:dark) 之后的
 * 整段 CSS 都没被解析 —— 页面看着正常（浅色部分都生效），
 * 但深色模式整个失效，肉眼在浅色环境下根本发现不了。
 * 验收脚本 verify-both 报了 matches=true 背景=白 才暴露出来。
 *
 * 这里做四道检查：
 *   A. 花括号配平，且每个 @media 有配对的 { }
 *   B. document.styleSheets 里 @media 规则数量 > 0（真被解析了）
 *   C. 所有 var(--xx) 引用的变量都有定义（悬空变量 = 静默失效）
 *   D. 明暗两套主题下，每个 token 的值都不为空
 */
const { chromium } = require('playwright-core');
const fs = require('fs');
const path = require('path');
const CHROME = 'C:/Program Files/Google/Chrome/Application/chrome.exe';
const LIVE = process.env.TEST_URL || 'http://127.0.0.1:8899/';
const F = path.join(__dirname, '..', 'index.html');

let pass = 0, fail = 0;
function log(ok, name, detail) {
  console.log((ok ? 'PASS  ' : 'FAIL  ') + name + '  | ' + (detail == null ? '' : detail));
  ok ? pass++ : fail++;
}

/* ---- 静态检查：括号配平 + @media 完整 ---- */
const src = fs.readFileSync(F, 'utf8');
const css = (src.match(/<style>([\s\S]*?)<\/style>/) || [, ''])[1];

/* A1. 去掉注释和字符串后数括号 */
const cssClean = css.replace(/\/\*[\s\S]*?\*\//g, '');
let depth = 0, minDepth = 0;
for (const ch of cssClean) {
  if (ch === '{') depth++;
  else if (ch === '}') { depth--; if (depth < minDepth) minDepth = depth; }
}
log(depth === 0 && minDepth === 0, 'A1 CSS 花括号配平',
  '净余 ' + depth + '（0=配平）最深 ' + minDepth + '（≥0=无提前闭合）');

/* A2. 每个 @media 后面都必须有 { */
const medias = [...css.matchAll(/@media[^{]*/g)].map(x => x[0].trim());
const noBlock = medias.filter(t => {
  const after = css.slice(css.indexOf(t) + t.length);
  return !/^\s*\{/.test(after);
});
log(medias.length > 0 && noBlock.length === 0, 'A2 每个 @media 都有代码块',
  medias.length + ' 个 @media，缺块 ' + noBlock.length + ' 个');

/* A3. :root 后面必须有 {，且变量定义区在 @media 之前 */
const rootHasBlock = /:root\s*\{/.test(css);
log(rootHasBlock, 'A3 :root 规则有代码块', rootHasBlock ? '' : '找不到 ":root {"');

/* ---- 动态检查 ---- */
(async () => {
  const browser = await chromium.launch({ executablePath: CHROME });
  const out = {};
  for (const scheme of ['light', 'dark']) {
    const ctx = await browser.newContext({ viewport: { width: 390, height: 844 }, colorScheme: scheme });
    const page = await ctx.newPage();
    await page.goto(LIVE, { waitUntil: 'load', timeout: 40000 });
    await page.waitForTimeout(1400);
    out[scheme] = await page.evaluate(() => {
      var medias = [];
      for (var i = 0; i < document.styleSheets.length; i++) {
        try {
          var cr = document.styleSheets[i].cssRules;
          for (var j = 0; j < cr.length; j++) if (cr[j].type === 4) medias.push(cr[j].conditionText || (cr[j].media && cr[j].media.mediaText));
        } catch (e) { /* 跨域 sheet 忽略 */ }
      }
      var cs = getComputedStyle(document.documentElement);
      var names = ['--bg', '--surface', '--tx', '--blue600', '--blue700', '--green700', '--amber700', '--red700', '--r', '--fs-lg', '--s2', '--r-pill', '--lh-loose', '--tabbar-h', '--tap'];
      var tok = {};
      names.forEach(function(n) { tok[n] = cs.getPropertyValue(n).trim(); });
      return {
        medias: medias,
        bodyBg: getComputedStyle(document.body).backgroundColor,
        tokens: tok,
      };
    });
    await ctx.close();
  }
  await browser.close();

  /* B. @media 真被解析 */
  log(out.light.medias.length > 0, 'B1 @media 规则真被浏览器解析',
    out.light.medias.length + ' 条：' + out.light.medias.join(' | '));

  /* D. 两套主题下 token 都有值 */
  const allNames = Object.keys(out.light.tokens);
  const empty = [];
  ['light', 'dark'].forEach(sc => {
    allNames.forEach(n => { if (!out[sc].tokens[n]) empty.push(sc + ':' + n); });
  });
  log(empty.length === 0, 'B2 明暗两套主题 token 都有值',
    empty.length ? '空值 ' + empty.join(', ') : allNames.length + ' 个变量 × 2 套主题');

  /* D2. 深色下背景必须真的是深色 */
  const m = (out.dark.bodyBg.match(/\d+/g) || []).map(Number);
  const lum = m.length >= 3 ? m[0] * 0.299 + m[1] * 0.587 + m[2] * 0.114 : 999;
  log(lum < 80, 'B3 深色主题下 body 真的是深底',
    out.dark.bodyBg + ' 亮度 ' + Math.round(lum) + '（应<80）');
  const ml = (out.light.bodyBg.match(/\d+/g) || []).map(Number);
  const lumL = ml.length >= 3 ? ml[0] * 0.299 + ml[1] * 0.587 + ml[2] * 0.114 : 0;
  log(lumL > 200, 'B4 浅色主题下 body 是白底',
    out.light.bodyBg + ' 亮度 ' + Math.round(lumL) + '（应>200）');

  /* D3. 深色下 700 色阶必须比浅色更亮（深底上要提亮才够对比） */
  ['--blue700', '--green700', '--red700'].forEach(n => {
    function lumOf(hex) {
      var h = (hex || '').trim();
      if (h.length === 4) h = '#' + h[1] + h[1] + h[2] + h[2] + h[3] + h[3];
      if (!/^#[0-9a-f]{6}$/i.test(h)) return -1;
      var r = parseInt(h.slice(1, 3), 16), g = parseInt(h.slice(3, 5), 16), b = parseInt(h.slice(5, 7), 16);
      return r * 0.299 + g * 0.587 + b * 0.114;
    }
    var l = lumOf(out.light.tokens[n]), d = lumOf(out.dark.tokens[n]);
    log(l >= 0 && d >= 0 && d > l, 'B5 深色下 --' + n + ' 比浅色更亮',
      '浅 ' + out.light.tokens[n] + '(' + Math.round(l) + ') → 深 ' + out.dark.tokens[n] + '(' + Math.round(d) + ')');
  });

  /* C. 无悬空变量 */
  const defined = new Set([...css.matchAll(/(--[a-z0-9-]+)\s*:/gi)].map(x => x[1]));
  const used = new Set([...css.matchAll(/var\((--[a-z0-9-]+)/gi)].map(x => x[1]));
  const missing = [...used].filter(v => !defined.has(v)).sort();
  log(missing.length === 0, 'B6 没有悬空的 CSS 变量引用',
    missing.length ? '缺失 ' + missing.join(', ') : used.size + ' 个引用全部有定义');

  console.log('\n==============================================');
  console.log('  通过 ' + pass + ' / ' + (pass + fail) + (fail ? '　✘ 失败 ' + fail : '　✓ 全绿'));
  console.log('==============================================');
  process.exit(fail ? 1 : 0);
})();
