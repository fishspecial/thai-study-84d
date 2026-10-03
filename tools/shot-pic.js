/* 配图尺寸视觉回归：
 * 手机视口下进闪卡，量 ".pic" 的实际渲染宽高，并把正面/背面/测验答完三个状态截图。
 * 目的：确认「练习时图片占主要位置」落到屏幕上是什么样，而不是只看 CSS 写没写。
 */
const { chromium } = require('playwright-core');
const fs = require('fs');
const path = require('path');
const CHROME = 'C:/Program Files/Google/Chrome/Application/chrome.exe';
const LIVE = process.env.TEST_URL || 'http://127.0.0.1:8899/';
const OUT = path.join(__dirname, 'shots-pic');

const HAS_PIC = ['w|ข้าว', 'w|รัก', 'w|ก็', 'w|ทำงาน'];

(async () => {
  fs.mkdirSync(OUT, { recursive: true });
  const browser = await chromium.launch({ executablePath: CHROME, args: ['--autoplay-policy=no-user-gesture-required'] });
  const out = {};

  for (const scheme of ['light', 'dark']) {
    const ctx = await browser.newContext({
      viewport: { width: 390, height: 844 },
      deviceScaleFactor: 2,
      colorScheme: scheme,
    });
    await ctx.route('**/cloud-sdk.js', r => r.fulfill({ status: 200, contentType: 'application/javascript; charset=utf-8', body: '/* x */' }));
    const page = await ctx.newPage();
    await page.goto(LIVE, { waitUntil: 'load', timeout: 40000 });
    await page.waitForTimeout(1200);
    await page.click('.tabbar button[data-v="drill"]');
    await page.waitForTimeout(300);

    const meas = async (label, sel) => {
      const m = await page.evaluate((sel) => {
        function box(s) {
          const el = document.querySelector(s);
          if (!el) return null;
          const r = el.getBoundingClientRect();
          return { w: Math.round(r.width), h: Math.round(r.height), top: Math.round(r.top) };
        }
        const im = document.querySelector(sel);
        const loaded = im ? { natural: im.naturalWidth, complete: im.complete } : null;
        return {
          pic: box(sel), study: box('.study'), q: box('.study .q'), a: box('.study .a'),
          cardW: box('#runner') ? box('#runner').w : null,
          loaded,
          vh: document.documentElement.clientHeight,
          hasAns: !!document.querySelector('.study.ans'),
        };
      }, sel);
      out[label] = m;
      await page.screenshot({ path: path.join(OUT, `${scheme}-${label}.png`), fullPage: true });
      return m;
    };

    /* 正面：一张确定有图的词卡 */
    await page.evaluate((keys) => {
      run = { kind: 'new', keys: keys, i: 0, right: 0, half: 0, wrong: 0, show: false, t0: Date.now() };
      enterFocus('new'); renderRun(); renderDrillChrome();
    }, HAS_PIC);
    await page.waitForTimeout(500);
    await meas('card-front', '.study img.pic');

    /* 背面：翻牌后的图应该缩回去 */
    await page.evaluate(() => { run.show = true; renderRun(); });
    await page.waitForTimeout(500);
    await meas('card-back', '.study img.pic');

    /* 测验：答题前 vs 答完后。
       放两题，否则答错那 1400ms / 答对那 380ms 之后就结算了，测不到答完的瞬间。 */
    await page.evaluate(() => {
      const w = WMAP['ข้าว'];
      const mk = () => ({ ty: 'th2zh', o: w, ans: w.z, key: 'w|ข้าว', opts: [w.z, '水', '车', '家'] });
      quiz = { qs: [mk(), mk()], i: 0, right: 0, done: false, t0: Date.now() };
      enterFocus('quiz'); renderQuiz(); renderDrillChrome();
    });
    await page.waitForTimeout(400);
    await meas('quiz-before', '.qpic');
    /* 直接点答案那个选项，答得快，测到的是答完的瞬间 */
    await page.evaluate(() => {
      const b = Array.prototype.find.call(document.querySelectorAll('.opt'), x => x.getAttribute('data-o') === quiz.qs[quiz.i].ans);
      b.click();
    });
    await page.waitForTimeout(120);
    await meas('quiz-after', '.qpic');

    await ctx.close();
  }
  await browser.close();

  console.log(JSON.stringify(out, null, 2));
  console.log('\n截图目录: ' + OUT);
})();
