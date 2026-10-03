/* 云端 8 条 / 本地 8 条、key 全对，但逐条内容不一致 —— 差在哪个字段？
 * 怀疑：S.savedAt 在 pushCloud 里被就地改写了，而 payload 传的是 S 本身（同一个引用）。
 * 于是云端存下的对象和本地 S 是**同一个对象**，两边永远"看起来一样"，
 * 但真云端会把 JSON 序列化一份快照 —— 序列化发生在 upsert 调用那一刻。
 * 如果那之后本地又有改动（比如 savedAt、下一次评分），云端就是旧快照。
 * 这里把每条的差异逐字段打出来。
 */
const { chromium } = require('playwright-core');
const CHROME = 'C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe';
const LIVE = 'http://127.0.0.1:8848/';

function fakeSdk(opts) {
  const state = { pushes: 0, lastPayload: null, failNext: false, pushLog: [], snapshots: [] };
  window.__FAKE__ = state;
  const rows = { exists: opts.cloudHasRow, payload: opts.cloudPayload || null };
  const makeUser = () => ({ id: 'u_test', email: 'test@example.com' });
  /* 关键：真云端存的是 JSON 快照，不是引用。这里也做 JSON 序列化，
     否则测出来的"一致"是假象 —— 两边是同一个内存对象。 */
  const fake = {
    auth: {
      getSession: async () => (opts.loggedIn ? { data: { user: makeUser() }, error: null } : { data: null, error: null }),
      signOut: async () => ({ error: null }),
      signInWithPassword: async () => ({ data: { user: makeUser() }, error: null }),
    },
    database: {
      from() {
        return {
          select() { return this; },
          maybeSingle: async () => {
            await new Promise(r => setTimeout(r, 30));
            if (!rows.exists) return { data: null, error: null };
            return { data: { payload: rows.payload, updated_at: rows.updated_at || new Date().toISOString() }, error: null };
          },
          upsert(p) {
            return { async select() {
              await new Promise(r => setTimeout(r, 20));
              state.pushes++;
              /* 序列化快照，模拟真云端的存储语义 */
              const snap = JSON.parse(JSON.stringify(p.payload));
              state.snapshots.push(snap);
              state.lastPayload = snap;
              rows.exists = true; rows.payload = snap;
              return { data: [{ payload: snap }], error: null };
            } };
          },
        };
      },
    },
  };
  window.WorkBuddyCloud = { createWorkBuddyCloud: () => fake };
}

(async () => {
  const browser = await chromium.launch({ executablePath: CHROME });
  const ctx = await browser.newContext({ viewport: { width: 390, height: 844 } });
  await ctx.addInitScript(fakeSdk, { loggedIn: true, cloudHasRow: false });
  await ctx.route('**/cloud-sdk.js', r => r.fulfill({ status: 200, contentType: 'application/javascript; charset=utf-8', body: '/* 拦截 */' }));
  const page = await ctx.newPage();
  page.on('pageerror', e => console.log('  [错误] ' + e.message));
  await page.goto(LIVE, { waitUntil: 'load', timeout: 40000 });
  await page.waitForTimeout(1200);
  await page.click('[data-run="new"]');
  await page.waitForTimeout(700);

  for (let i = 0; i < 8; i++) {
    if (await page.$('#cShow')) { await page.click('#cShow'); await page.waitForTimeout(120); }
    if (await page.$('#cR')) { await page.click('#cR'); await page.waitForTimeout(300); }
  }
  await page.waitForTimeout(5500);

  const r = await page.evaluate(() => {
    const lp = window.__FAKE__.lastPayload || {};
    const keys = Object.keys(S.items || {});
    const diffs = [];
    keys.forEach(k => {
      const a = JSON.stringify((lp.items || {})[k]);
      const b = JSON.stringify(S.items[k]);
      if (a !== b) {
        const oa = (lp.items || {})[k] || {}, ob = S.items[k] || {};
        const fields = {};
        Object.keys(ob).forEach(f => { if (JSON.stringify(oa[f]) !== JSON.stringify(ob[f])) fields[f] = { 云端: oa[f], 本地: ob[f] }; });
        diffs.push({ k, fields });
      }
    });
    return {
      pushes: window.__FAKE__.pushes,
      cloudItems: Object.keys(lp.items || {}).length,
      localItems: keys.length,
      diffCount: diffs.length,
      diffs: diffs.slice(0, 4),
      cloudSavedAt: lp.savedAt, localSavedAt: S.savedAt,
    };
  });

  console.log('\n推送次数=' + r.pushes + '  云端条目=' + r.cloudItems + '  本地条目=' + r.localItems);
  console.log('不一致条数=' + r.diffCount);
  console.log('云端 savedAt=' + r.cloudSavedAt + '  本地 savedAt=' + r.localSavedAt);
  if (r.diffs.length) console.log('\n差异明细（最多 4 条）:\n' + JSON.stringify(r.diffs, null, 2));
  await browser.close();
})();
