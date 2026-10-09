/* 复习改造视觉确认：任务卡片 + 续传按钮 + 句子罗马音 */
const { chromium } = require('playwright-core');
const fs = require('fs');
const path = require('path');
const CHROME = 'C:/Program Files/Google/Chrome/Application/chrome.exe';
const LIVE = process.env.TEST_URL || 'http://127.0.0.1:8899/';
const OUT = path.join(__dirname, 'shots-review');

function ymd(d) { const p = x => String(x).padStart(2, '0'); return d.getFullYear() + '-' + p(d.getMonth() + 1) + '-' + p(d.getDate()); }
const TODAY = ymd(new Date());

(async () => {
  fs.mkdirSync(OUT, { recursive: true });
  const items = {};
  ['ข้าว', 'รัก', 'ก็', 'ไป', 'ทำ', 'ดี'].forEach(t => { items['w|' + t] = { box: 1, r: 1, w: 0, seen: 2, due: TODAY, lg: [[1, 1]] }; });
  ['h1', 'h16'].forEach(id => { items['s|' + id] = { box: 1, r: 1, w: 0, seen: 2, due: TODAY, lg: [[1, 1]] }; });
  const seed = {
    v: 1, start: TODAY, day: 2, savedAt: Date.now(),
    cfg: { newWords: 12, newGrams: 3, newHerSent: 5, newMySent: 4, quizCount: 10 },
    q: { w: 0, g: 0, hs: 0, ms: 0 }, master: {}, items: items, days: {}, focus: '',
  };

  const browser = await chromium.launch({ executablePath: CHROME });
  const ctx = await browser.newContext({ viewport: { width: 390, height: 844 }, deviceScaleFactor: 2, colorScheme: 'dark' });
  await ctx.route('**/cloud-sdk.js', r => r.fulfill({ status: 200, contentType: 'application/javascript', body: '/*x*/' }));
  await ctx.addInitScript(s => { try { if (!localStorage.getItem('thai-daily-v1')) localStorage.setItem('thai-daily-v1', JSON.stringify(s)); } catch (e) {} }, seed);
  const page = await ctx.newPage();
  await page.goto(LIVE, { waitUntil: 'load', timeout: 40000 });
  await page.waitForTimeout(1300);

  /* 先答 2 条制造「已做部分」的状态 */
  await page.click('.tabbar button[data-v="drill"]');
  await page.waitForTimeout(400);
  await page.click('#drillList button[data-run="revW"]');
  await page.waitForTimeout(400);
  for (let i = 0; i < 2; i++) { await page.click('#cShow'); await page.waitForTimeout(140); await page.click('#cR'); await page.waitForTimeout(180); }
  await page.evaluate(() => { run = null; exitFocus(); renderToday(); document.getElementById('runner').innerHTML = ''; renderDrillChrome(); });
  await page.waitForTimeout(500);
  await page.screenshot({ path: path.join(OUT, 'drill-partial.png'), fullPage: true });

  /* 句子复习卡：看罗马音 */
  await page.evaluate(() => { startCard('revS'); run.show = true; renderRun(); });
  await page.waitForTimeout(500);
  await page.screenshot({ path: path.join(OUT, 'sent-rom.png'), fullPage: true });

  const info = await page.evaluate(() => {
    const el = document.querySelector('.study .rom');
    const chips = document.querySelectorAll('.sensechip').length;
    return { rom: el ? el.textContent : null, chips };
  });
  console.log(JSON.stringify(info));
  await browser.close();
  console.log('截图目录: ' + OUT);
})();
