/* 场景 B 诊断：云端有数据时，为什么没恢复到 S？
 *
 * 上一轮 verify-sync 的 B2/B3 报 FAIL（items=0 master=0 day=1），
 * 但不确定卡在哪一步。这个脚本不判定 PASS/FAIL，只把事实摊开：
 *   cloudErr / ME / 登录态 / 云端返回 / localIsEmpty / S.savedAt / updated_at
 *   / 对话框是否弹过 / 恢复分支是否进入 / persist 是否执行
 */
const { chromium } = require('playwright-core');

const CHROME = 'C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe';
const LIVE = 'http://127.0.0.1:8848/';

function fakeSdk(opts) {
  const state = { pushes: 0, lastPayload: null, selects: [] };
  window.__FAKE__ = state;
  const rows = { exists: opts.cloudHasRow, payload: opts.cloudPayload || null };
  const makeUser = () => ({ id: 'u_test', email: 'test@example.com' });

  window.__TRACE__ = [];
  const T = (s) => { window.__TRACE__.push(s); console.log('  [页面] ' + s); };

  /* 记录 S 的引用变化：谁在什么时候把 S 换掉了 */
  const fake = {
    auth: {
      getSession: async () => (opts.loggedIn
        ? { data: { user: makeUser() }, error: null }
        : { data: null, error: null }),
      signOut: async () => { window.__FAKE__.signedOut = true; return { error: null }; },
      signInWithPassword: async () => ({ data: { user: makeUser() }, error: null }),
    },
    database: {
      from(table) {
        T('from(' + table + ')');
        return {
          select(cols) { T('select(' + cols + ')'); return this; },
          maybeSingle: async () => {
            await new Promise(r => setTimeout(r, 30));
            T('maybeSingle → exists=' + rows.exists);
            if (!rows.exists) return { data: null, error: null };
            return {
              data: { payload: rows.payload, updated_at: rows.updated_at || new Date().toISOString() },
              error: null,
            };
          },
          upsert(p) {
            T('upsert(items=' + Object.keys(p.payload.items || {}).length + ')');
            return {
              async select() {
                await new Promise(r => setTimeout(r, 20));
                window.__FAKE__.pushes++;
                window.__FAKE__.lastPayload = p.payload;
                rows.exists = true; rows.payload = p.payload;
                return { data: [{ payload: p.payload }], error: null };
              },
            };
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

  const payload = {
    start: '2026-10-01', day: 3, savedAt: Date.now() - 1000,
    items: { 'w|รัก': { box: 2, due: '2026-10-03', r: 3, w: 0, h: 0, seen: 3, lg: [[1, 1], [3, 1]], peak: 2 } },
    days: {}, master: { 'รัก': 1 }, q: { w: 1, g: 0, hs: 0, ms: 0 }, cfg: {},
  };

  await ctx.addInitScript(fakeSdk, { loggedIn: true, cloudHasRow: true, cloudPayload: payload });
  await ctx.route('**/cloud-sdk.js', r => r.fulfill({
    status: 200, contentType: 'application/javascript; charset=utf-8', body: '/* 拦截 */',
  }));

  const page = await ctx.newPage();
  const errs = [];
  page.on('pageerror', e => errs.push('pageerror: ' + e.message));
  page.on('console', m => { if (m.type() === 'error') errs.push('console: ' + m.text()); });
  ctx.on('dialog', async d => {
    console.log('  [弹窗] ' + d.type() + ': ' + d.message().slice(0, 70));
    await d.dismiss();
  });

  await page.goto(LIVE, { waitUntil: 'load', timeout: 40000 });
  await page.waitForTimeout(2500);

  const r = await page.evaluate(() => {
    let raw = null;
    try { raw = localStorage.getItem('thai-daily-v1'); } catch (e) {}
    return {
      hostname: location.hostname,
      cloudOk: !!(window.cloud),
      cloudErr: window.cloudErr,
      me: window.ME ? window.ME.email : null,
      trace: window.__TRACE__,
      sItems: window.S ? Object.keys(S.items).length : -1,
      sMaster: window.S ? Object.keys(S.master).length : -1,
      sDay: window.S ? S.day : null,
      sStart: window.S ? S.start : null,
      sSavedAt: window.S ? (S.savedAt || 0) : null,
      localHas: window.localHasProgress ? localHasProgress() : '函数不存在',
      cloudRow: window.cloudRow ? {
        updated_at: window.cloudRow.updated_at,
        payloadItems: Object.keys((window.cloudRow.payload || {}).items || {}).length,
      } : null,
      rawLocal: raw ? raw.slice(0, 120) : null,
      sync: (document.getElementById('syncChip') || {}).textContent || '',
      hasLoginForm: !!document.getElementById('auPw'),
    };
  });

  console.log('\n===== 运行时状态 =====');
  Object.keys(r).forEach(k => {
    if (k === 'trace') return;
    console.log('  ' + k + ' = ' + JSON.stringify(r[k]));
  });
  console.log('\n===== 调用轨迹 =====');
  (r.trace || []).forEach(t => console.log('  ' + t));
  console.log('\n===== 错误 =====');
  console.log(errs.length ? errs.map(e => '  ' + e).join('\n') : '  无');

  await browser.close();
})();
