/* 查 POOL_G 里到底有没有 ครับ，以及 GMAP 键长什么样 */
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

  const r = await page.evaluate(() => {
    var out = {};
    out.POOL_G_len = POOL_G.length;
    out.has_khrab = POOL_G.some(g => g.t === 'ครับ');
    // 找最接近的
    out.samples = POOL_G.slice(0, 6).map(g => ({ t: g.t, a: g.a, z: g.z, keys: Object.keys(g) }));
    // GMAP 里所有键里含 รั 的
    out.gmapHit = Object.keys(GMAP).filter(k => k.indexOf('คร') >= 0).slice(0, 8);
    // 种子里的 g| key
    var gk = [];
    for (var d in S.days) {
      var p = S.days[d].plan || {};
      (p.newG || []).concat(p.dueG || []).forEach(k => { if (gk.indexOf(k) < 0) gk.push(k); });
    }
    out.seedGKeys = gk;
    out.seedG_notInGMAP = gk.filter(k => !GMAP[k.split('|')[1]]);
    return out;
  });
  console.log(JSON.stringify(r, null, 2));
  await browser.close();
})();
