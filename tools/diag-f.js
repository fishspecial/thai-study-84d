/* 场景 F 诊断：那个 "Cannot read properties of undefined (reading 'length')"
 * 来自哪里？是测试造的假数据太糙，还是真实场景也会炸？
 * 关键判断：栈里如果落在 renderWords/renderCorpus，说明恢复流程有真缺陷。
 */
const { chromium } = require('playwright-core');
const CHROME = 'C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe';
const LIVE = 'http://127.0.0.1:8848/';

function fakeSdk(opts) {
  const state = { pushes: 0, lastPayload: null, failNext: false };
  window.__FAKE__ = state;
  const rows = { exists: opts.cloudHasRow, payload: opts.cloudPayload || null };
  const makeUser = () => ({ id: 'u_test', email: 'test@example.com' });
  if (opts.seedLocal) {
    try { localStorage.setItem('thai-daily-v1', JSON.stringify(opts.seedLocal)); } catch (e) {}
  }
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
              state.pushes++; state.lastPayload = p.payload;
              rows.exists = true; rows.payload = p.payload;
              return { data: [{ payload: p.payload }], error: null };
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
  ctx.on('dialog', async d => { console.log('  [弹窗] ' + d.type()); await d.accept(); });

  const cloud = {
    start: '2026-10-01', day: 2, savedAt: Date.now() - 1000,
    items: { 'w|ขอบคุณ': { box: 1, due: '2026-10-05', r: 1, w: 0, h: 0, seen: 1, lg: [], peak: 1 } },
    days: {}, master: { 'ขอบคุณ': 1 }, q: { w: 1, g: 0, hs: 0, ms: 0 }, cfg: {},
  };
  /* plan 用真实的空壳而不是 {}：线上真实记录里 plan 是 buildPlan() 产物，
     有 newW/newG/her/my/quota/why 等字段。{} 会让渲染读到 undefined。 */
  const local = {
    start: '2026-10-01', day: 5, savedAt: Date.now(), focus: '',
    items: { 'w|รัก': { box: 3, due: '2026-10-06', r: 3, w: 0, h: 0, seen: 6, lg: [], peak: 3 } },
    days: { 5: { plan: { newW: [], newG: [], her: [], my: [], quiz: [], dueW: [], dueG: [], dueH: [], dueM: [], why: '测试' }, st: { new: { done: true, n: 12, score: 92 } } } },
    master: { 'รัก': 1 }, q: { w: 12, g: 0, hs: 0, ms: 0 }, cfg: {},
  };

  await ctx.addInitScript(fakeSdk, { loggedIn: true, cloudHasRow: true, cloudPayload: cloud, seedLocal: local });
  await ctx.route('**/cloud-sdk.js', r => r.fulfill({ status: 200, contentType: 'application/javascript; charset=utf-8', body: '/* 拦截 */' }));

  const page = await ctx.newPage();
  page.on('pageerror', e => console.log('\n  [页面错误] ' + e.message + '\n' + (e.stack || '').split('\n').slice(0, 6).join('\n')));
  page.on('console', m => { if (m.type() === 'error') console.log('  [console.error] ' + m.text()); });

  await page.goto(LIVE, { waitUntil: 'load', timeout: 40000 });
  await page.waitForTimeout(2500);

  const r = await page.evaluate(() => ({
    items: Object.keys(S.items).length,
    hasLocal: !!S.items['w|รัก'],
    qw: (S.q || {}).w,
    boardText: (document.getElementById('board') || {}).textContent.replace(/\s+/g, ' ').slice(0, 120) || '',
  }));
  console.log('\n===== 状态 =====');
  console.log('  items=' + r.items + ' hasLocal=' + r.hasLocal + ' q.w=' + r.qw);
  console.log('  今日看板: ' + r.boardText);

  await browser.close();
})();
