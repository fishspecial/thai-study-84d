/* 视觉回归：六页 × 明暗双主题截图
 * 改了 70+ 处字号/圆角/内距，必须用眼睛确认没退化。
 * 同时把关键元素的实测尺寸打出来（泰文行高、触控目标、横向溢出）。
 */
const { chromium } = require('playwright-core');
const fs = require('fs');
const path = require('path');
const CHROME = 'C:/Program Files/Google/Chrome/Application/chrome.exe';
const LIVE = process.env.TEST_URL || 'http://127.0.0.1:8899/';
const SEED = require('./seed-for-visual.js');
const OUT = path.join(__dirname, 'shots-style');

const PAGES = [
  ['today', null], ['drill', null], ['corpus', null],
  ['words', null], ['ref', null], ['me', null],
];

(async () => {
  fs.mkdirSync(OUT, { recursive: true });
  const browser = await chromium.launch({ executablePath: CHROME, args: ['--autoplay-policy=no-user-gesture-required'] });

  const report = {};
  for (const scheme of ['light', 'dark']) {
    const ctx = await browser.newContext({
      viewport: { width: 390, height: 844 },   // iPhone 14 尺寸，最主流
      deviceScaleFactor: 2,
      colorScheme: scheme,
    });
    await ctx.route('**/cloud-sdk.js', r => r.fulfill({ status: 200, contentType: 'application/javascript; charset=utf-8', body: '/* x */' }));
    await ctx.addInitScript((seed) => {
      try { localStorage.setItem('thai-daily-v1', JSON.stringify(seed)); } catch (e) {}
    }, SEED);
    const page = await ctx.newPage();
    await page.goto(LIVE, { waitUntil: 'load', timeout: 40000 });
    await page.waitForTimeout(1600);

    for (const [v] of PAGES) {
      await page.click(`.tabbar button[data-v="${v}"]`);
      await page.waitForTimeout(700);
      const f = path.join(OUT, `${scheme}-${v}.png`);
      await page.screenshot({ path: f, fullPage: true });
    }

    /* 量关键尺寸 */
    report[scheme] = await page.evaluate(() => {
      function box(sel) {
        const el = document.querySelector(sel);
        if (!el) return null;
        const r = el.getBoundingClientRect();
        return { w: Math.round(r.width), h: Math.round(r.height) };
      }
      /* 横向溢出检测：任何元素比视口宽就是布局事故 */
      const vw = document.documentElement.clientWidth;
      const over = [];
      document.querySelectorAll('body *').forEach(el => {
        const r = el.getBoundingClientRect();
        if (r.width > vw + 1 && r.height > 0 && el.offsetParent !== null) {
          over.push({ tag: el.tagName + '.' + (el.className || '').toString().split(' ')[0], w: Math.round(r.width) });
        }
      });
      /* 触控目标：可点元素高度 < 40px 的（iOS 44pt 指南，列表内按钮可放宽） */
      const small = [];
      document.querySelectorAll('button,.btn,.chip,.opt,.lb').forEach(el => {
        const r = el.getBoundingClientRect();
        if (r.height > 0 && r.height < 32) {
          small.push({ cls: (el.className || '').toString().slice(0, 24), h: Math.round(r.height), t: (el.textContent || '').trim().slice(0, 12) });
        }
      });
      /* 泰文行高：泰文有上下标，line-height 低于 1.5 会切上下标 */
      const thais = [];
      document.querySelectorAll('.thai').forEach(el => {
        const cs = getComputedStyle(el);
        const fs = parseFloat(cs.fontSize), lh = parseFloat(cs.lineHeight);
        if (fs && lh) thais.push({ ratio: +(lh / fs).toFixed(2), size: Math.round(fs) });
      });
      const ratios = thais.map(t => t.ratio);
      return {
        tabbar: box('.tabbar'),
        vw: vw,
        overflow: over.slice(0, 8),
        overflowN: over.length,
        smallTargets: small.slice(0, 8),
        smallN: small.length,
        thaiLineHeight: ratios.length ? {
          min: Math.min.apply(null, ratios), max: Math.max.apply(null, ratios), n: ratios.length,
        } : null,
        /* 状态标签是否真的拿到颜色了（--xx700 之前未定义） */
        lvColor: (() => {
          const el = document.querySelector('.lv');
          if (!el) return null;
          const cs = getComputedStyle(el);
          return { cls: el.className, bg: cs.backgroundColor, fg: cs.color };
        })(),
      };
    });
    await ctx.close();
  }
  await browser.close();
  console.log(JSON.stringify(report, null, 2));
  console.log('\n截图目录: ' + OUT);
})();
