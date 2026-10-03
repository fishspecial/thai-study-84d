/* 诊断 B4：学习记录里哪些行缺 data-af */
const { chromium } = require('playwright-core');
const CHROME = 'C:/Program Files/Google/Chrome/Application/chrome.exe';
const LIVE = process.env.TEST_URL || 'http://127.0.0.1:8899/';
const SEED = require('./seed-for-visual.js');

(async () => {
  const browser = await chromium.launch({ executablePath: CHROME, args: ['--autoplay-policy=no-user-gesture-required'] });
  const ctx = await browser.newContext({ viewport: { width: 420, height: 860 } });
  await ctx.route('**/cloud-sdk.js', r => r.fulfill({ status: 200, contentType: 'application/javascript; charset=utf-8', body: '/* x */' }));
  await ctx.addInitScript((seed) => {
    try { localStorage.setItem('thai-daily-v1', JSON.stringify(seed)); } catch (e) {}
  }, SEED);
  const page = await ctx.newPage();
  await page.goto(LIVE, { waitUntil: 'load', timeout: 40000 });
  await page.waitForTimeout(1800);
  await page.click('.tabbar button[data-v="me"]');
  await page.waitForTimeout(900);

  const r = await page.evaluate(() => {
    const rows = [].slice.call(document.querySelectorAll('#dayDetail .lrow'));
    const bad = rows.filter(r => !r.getAttribute('data-af'));
    const dump = r => ({
      k: r.getAttribute('data-k'),
      af: r.getAttribute('data-af'),
      ad: r.getAttribute('data-ad'),
      t: (r.getAttribute('data-t') || '').slice(0, 30),
    });
    // 对每一行去查 keyObj 看是哪个分支丢了
    const detail = bad.map(r => {
      const k = r.getAttribute('data-k');
      const o = keyObj(k);
      const raw = o ? o.o : null;
      let smapHit = null, sentOfHit = null;
      if (k.indexOf('s|') === 0) {
        smapHit = !!SMAP[k.slice(2)];
        sentOfHit = !!sentOf(k.slice(2));
      }
      return {
        k: k, type: o ? o.type : null,
        hasObj: !!raw,
        aField: raw ? (raw.a === undefined ? 'undef' : String(raw.a)) : '-',
        idField: raw ? (raw.id === undefined ? 'undef' : String(raw.id)) : '-',
        smapHit: smapHit, sentOfHit: sentOfHit,
        shownT: o ? String(o.t).slice(0, 24) : '-',
      };
    });
    return { total: rows.length, badCount: bad.length, badDump: bad.map(dump), detail: detail };
  });
  console.log(JSON.stringify(r, null, 2));
  await browser.close();
})();
