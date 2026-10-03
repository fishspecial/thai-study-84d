/* 探针：查 1.2-1.4 / 2.3-2.4 的真实根因 */
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
    out.POOL_HS_len = POOL_HS.length;
    out.POOL_MS_len = POOL_MS.length;
    out.newHerSent = S.cfg.newHerSent;
    out.newMySent = S.cfg.newMySent;
    out.q_hs = S.q.hs;
    out.q_ms = S.q.ms;

    out.Dplan_read_len = D.plan.read.length;
    out.Dplan_hsEnd = D.plan.hsEnd;
    out.Dplan_dueSH = (D.plan.dueSH || []).length;
    out.Dplan_dueSM = (D.plan.dueSM || []).length;
    out.Dplan_dueSOther = (D.plan.dueSOther || []).length;

    // 造 6 条到期例句（POOL_HS 前 3 + POOL_MS 前 3）
    var past = addDays(today(), -2), made = [];
    for (var i = 0; i < 6; i++) {
      var src = i < 3 ? POOL_HS[i] : POOL_MS[i - 3];
      if (!src) break;
      var k = 's|' + src.id;
      var it = ensure(k);
      it.seen = 1; it.box = 1; it.r = 1; it.w = 0; it.h = 0;
      it.lg = [[Math.max(1, S.day - 2), 1]];
      it.due = past;
      made.push(k);
    }
    out.made = made;

    var np = buildPlan();
    out.new_dueSH = (np.dueSH || []).length;
    out.new_dueSM = (np.dueSM || []).length;
    out.new_dueOther = (np.dueSOther || []).length;
    out.same_obj = (np === D.plan);
    out.Dplan_dueSH_after = (D.plan.dueSH || []).length;
    out.taskKeys_rev_sent = taskKeys('rev').filter(k => k.indexOf('s|') === 0).length;
    out.dueList_s_len = dueList('s|').length;

    // 关键：buildPlan 返回的对象是否就是 D.plan 引用的那个
    out.np_read_is_D_read = (np.read === D.plan.read);
    out.np_read_len = np.read.length;
    out.D_read_len = D.plan.read.length;

    // extendToday 探针
    var b0 = D.plan.read.length, e0 = D.plan.hsEnd;
    var added = extendToday('read', 3);
    out.ext = { b0: b0, added: added, b1: D.plan.read.length, e0: e0, e1: D.plan.hsEnd };
    out.q_hs_after_ext = S.q.hs;

    return out;
  });
  console.log(JSON.stringify(r, null, 2));
  await browser.close();
})();
