/* 截三个新功能的实图：专注模式 / 每日记录查询 / 预计时长
 * 用法: TEST_URL=http://127.0.0.1:8899/ node tools/shot-3features.js
 */
const { chromium } = require('playwright-core');
const CHROME = 'C:/Program Files/Google/Chrome/Application/chrome.exe';
const LIVE = process.env.TEST_URL || ('http://127.0.0.1:' + (process.env.TEST_PORT || 8899) + '/');

const SEED = require('./seed-for-visual.js');

(async () => {
  const browser = await chromium.launch({ executablePath: CHROME, args: ['--autoplay-policy=no-user-gesture-required'] });
  for (const theme of ['light', 'dark']) {
    const ctx = await browser.newContext({ viewport: { width: 420, height: 900 }, deviceScaleFactor: 2 });
    await ctx.route('**/cloud-sdk.js', r => r.fulfill({ status: 200, contentType: 'application/javascript; charset=utf-8', body: '/* x */' }));
    await ctx.addInitScript((seed) => {
      try { localStorage.setItem('thai-daily-v1', JSON.stringify(seed)); } catch (e) {}
      try { localStorage.setItem('thai-theme', seed.__theme || 'light'); } catch (e) {}
    }, SEED);
    const page = await ctx.newPage();
    await page.goto(LIVE, { waitUntil: 'load', timeout: 40000 });
    await page.waitForTimeout(1600);
    if (theme === 'dark') {
      await page.evaluate(() => { document.documentElement.setAttribute('data-theme', 'dark'); });
      await page.waitForTimeout(400);
    }

    /* ① 今日页常态 */
    await page.screenshot({ path: `.vt/shots/f3-today-${theme}.png` });

    /* ② 专注模式（测验中） */
    await page.evaluate(() => { const b = document.querySelector('[data-run="quiz"]'); if (b) b.click(); });
    await page.waitForTimeout(900);
    await page.screenshot({ path: `.vt/shots/f3-focus-${theme}.png` });

    /* ③ 闪卡专注 */
    await page.evaluate(() => { const b = document.getElementById('qQuit'); if (b) b.click(); });
    await page.waitForTimeout(500);
    await page.evaluate(() => { const b = document.querySelector('[data-run="rev"]'); if (b) b.click(); });
    await page.waitForTimeout(900);
    await page.screenshot({ path: `.vt/shots/f3-card-${theme}.png` });

    /* ④ 我的页：每天学了哪些词 + 预计时长 */
    await page.evaluate(() => { const b = document.getElementById('cQuit'); if (b) b.click(); });
    await page.waitForTimeout(400);
    await page.evaluate(() => { document.querySelector('.tabbar button[data-v="me"]').click(); });
    await page.waitForTimeout(900);
    /* 滚到「每天学了哪些词」 */
    const y1 = await page.evaluate(() => {
      const hs = Array.from(document.querySelectorAll('#v-me h3'));
      const t = hs.find(h => h.textContent.indexOf('每天学了哪些词') >= 0);
      if (!t) return null;
      window.scrollTo(0, t.getBoundingClientRect().top + window.scrollY - 12);
      return true;
    });
    await page.waitForTimeout(400);
    await page.screenshot({ path: `.vt/shots/f3-daylog-${theme}.png` });

    /* ⑤ 预计时长 */
    const y2 = await page.evaluate(() => {
      const hs = Array.from(document.querySelectorAll('#v-me h3'));
      const t = hs.find(h => h.textContent.indexOf('预计学多久') >= 0);
      if (!t) return false;
      window.scrollTo(0, t.getBoundingClientRect().top + window.scrollY - 12);
      return true;
    });
    await page.waitForTimeout(400);
    await page.screenshot({ path: `.vt/shots/f3-eta-${theme}.png` });

    console.log('✓ ' + theme + ' 五张（今日/测验专注/闪卡专注/每日记录/预计时长）'
      + (y1 ? '' : ' ⚠️ 没找到「每天学了哪些词」') + (y2 ? '' : ' ⚠️ 没找到「预计学多久」'));
    await ctx.close();
  }
  await browser.close();
})();
