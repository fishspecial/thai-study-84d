/* 语境义视觉回归：截「翻面 + 点开某个义项」的样子，明暗两套。 */
const { chromium } = require('playwright-core');
const fs = require('fs');
const path = require('path');
const CHROME = 'C:/Program Files/Google/Chrome/Application/chrome.exe';
const LIVE = process.env.TEST_URL || 'http://127.0.0.1:8899/';
const OUT = path.join(__dirname, 'shots-sense');

(async () => {
  fs.mkdirSync(OUT, { recursive: true });
  const browser = await chromium.launch({ executablePath: CHROME, args: ['--autoplay-policy=no-user-gesture-required'] });
  for (const scheme of ['light', 'dark']) {
    const ctx = await browser.newContext({ viewport: { width: 390, height: 844 }, deviceScaleFactor: 2, colorScheme: scheme });
    await ctx.route('**/cloud-sdk.js', r => r.fulfill({ status: 200, contentType: 'application/javascript; charset=utf-8', body: '/* x */' }));
    const page = await ctx.newPage();
    await page.goto(LIVE, { waitUntil: 'load', timeout: 40000 });
    await page.waitForTimeout(1200);
    await page.click('.tabbar button[data-v="drill"]');
    await page.evaluate(() => {
      run = { kind: 'new', keys: ['w|ไป'], i: 0, right: 0, half: 0, wrong: 0, show: true, t0: Date.now() };
      enterFocus('new'); renderRun(); renderDrillChrome();
    });
    await page.waitForTimeout(400);
    await page.screenshot({ path: path.join(OUT, scheme + '-back.png'), fullPage: true });
    await page.click('.sensechip[data-si="2"]');
    await page.waitForTimeout(400);
    await page.screenshot({ path: path.join(OUT, scheme + '-open.png'), fullPage: true });
    await ctx.close();
  }
  await browser.close();
  console.log('截图目录: ' + OUT);
})();
