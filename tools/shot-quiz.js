/* 截测验四种题型的题面，肉眼确认发音按钮的位置和版式 */
const { chromium } = require('playwright-core');
const fs = require('fs');
const path = require('path');
const CHROME = 'C://Program Files\\Google\\Chrome\\Application\\chrome.exe';
const LIVE = 'http://127.0.0.1:8848/';
const OUT = path.resolve(__dirname, '..', '.vt', 'shots');
if (!fs.existsSync(OUT)) fs.mkdirSync(OUT, { recursive: true });

(async () => {
  for (const scheme of ['light', 'dark']) {
    const browser = await chromium.launch({ executablePath: CHROME, args: ['--autoplay-policy=no-user-gesture-required'] });
    const ctx = await browser.newContext({ viewport: { width: 390, height: 844 }, colorScheme: scheme });
    ctx.on('dialog', async d => d.accept());
    await ctx.route('**/cloud-sdk.js', r => r.fulfill({ status: 200, contentType: 'application/javascript; charset=utf-8', body: '/* x */' }));
    const page = await ctx.newPage();
    await page.goto(LIVE, { waitUntil: 'load', timeout: 40000 });
    await page.waitForTimeout(1500);
    await page.click('[data-run="quiz"]');
    await page.waitForTimeout(900);
    const got = {};
    for (let i = 0; i < 10; i++) {
      const ty = await page.evaluate(() => (window.quiz && quiz.qs[quiz.i]) ? quiz.qs[quiz.i].ty : null);
      if (ty && !got[ty]) {
        got[ty] = 1;
        await page.screenshot({ path: path.join(OUT, scheme + '-quiz-' + ty + '.png') });
      }
      if (ty === 'zh2th' && !got['zh2th-answered']) {
        await page.evaluate(() => {
          const q = quiz.qs[quiz.i];
          const w = Array.from(document.querySelectorAll('.opt')).find(b => b.getAttribute('data-o') !== q.ans);
          if (w) w.click();
        });
        await page.waitForTimeout(700);
        if (!got['zh2th-answered']) {
          got['zh2th-answered'] = 1;
          await page.screenshot({ path: path.join(OUT, scheme + '-quiz-zh2th-answered.png') });
        }
      }
      const opt = await page.$('.opt:not([disabled])');
      if (opt) { await opt.click(); await page.waitForTimeout(1500); }
    }
    console.log(scheme + ' 已截: ' + Object.keys(got).join(', '));
    await browser.close();
  }
})();
