/* 同步机制专项测试：验证用户报的两个问题确实修好了。
 *
 * 用户原话：
 *   1)「你登录之后，它还是会有那个登录跟注册那个按钮」
 *   2)「我必须手动确认同步。不然的话我只要一刷新这个数据又不见了」
 *
 * 做法：在页面加载前注入一个**假云端 SDK**，完全掌控登录态与云端表内容，
 * 这样能确定性地复现两种场景，不依赖真实账号。
 *
 *   场景 A：已登录 + 云端表里没有这一行（刚注册还没学）
 *            → 期望显示账号面板，**不能**退回登录表单
 *   场景 B：已登录 + 云端有数据
 *            → 期望正常恢复并保持登录态
 *   场景 C：连续快速答题 8 次（间隔 300ms，远小于 4 秒节流窗口）
 *            → 期望「停下后」已经真的推送过，而不是一直挂在定时器上
 *   场景 D：同步失败 → 期望顶栏标签文案提示可重试，且能点
 *   场景 E：换新设备登录（本地空白）→ 必须**无声**恢复云端进度
 *            这条是 localHasProgress() 的主战场。旧判据 localIsEmpty()
 *            查 S.days 是否为空，但 getDay() 在页面加载时就建好了今天那条记录
 *            → 恒为 false → 必定弹 confirm，用户点「取消」就再也拿不回进度
 *   场景 F：本地有成果且比云端新 → 不得被云端静默覆盖
 *
 * 用法：NODE_PATH=... node tools/verify-sync.js
 */
const path = require('path');
const { chromium } = require('playwright-core');

const CHROME = 'C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe';
/* 指向工作副本而非 8848：8848 跑的是 live/index.html 冻结快照，
   改完 index.html 立刻访问会拿到旧代码（上一轮因此误判 splitEmoji 未定义）。 */
const LIVE = process.env.TEST_URL || ('http://127.0.0.1:' + (process.env.TEST_PORT || 8899) + '/');

/* 注入到页面最前面的假 SDK。
 *
 * 关键难点：index.html 里的 <script src="./cloud-sdk.js"> 会执行
 * `var WorkBuddyCloud = ...`，**直接覆盖**我们预设的假对象。
 * 所以光 addInitScript 设 window.WorkBuddyCloud 没用 ——
 * 必须把 ./cloud-sdk.js 本身拦掉。用 route 拦截并返回空内容。
 *
 * 另一个坑：SDK 里用的是 `var WorkBuddyCloud`（顶层 var），
 * 在页面脚本里等价于 window.WorkBuddyCloud，直接赋值即可覆盖。
 */
function fakeSdk(opts) {
  const state = { pushes: 0, lastPayload: null, failNext: opts.fail || false, pushLog: [] };
  window.__FAKE__ = state;
  const rows = { exists: opts.cloudHasRow, payload: opts.cloudPayload || null };
  const makeUser = () => ({ id: 'u_test', email: 'test@example.com' });

  /* 预置本地记录：addInitScript 在页面任何脚本之前跑，
     所以这里写进去的 localStorage 就是页面看到的样子。 */
  if (opts.seedLocal) {
    try { localStorage.setItem('thai-daily-v1', JSON.stringify(opts.seedLocal)); } catch (e) {}
  }

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
        return {
          select() { return this; },
          maybeSingle: async () => {
            await new Promise(r => setTimeout(r, 30));
            if (!rows.exists) return { data: null, error: null };
            return { data: { payload: rows.payload, updated_at: rows.updated_at || new Date().toISOString() }, error: null };
          },
          upsert(p) {
            return {
              async select() {
                await new Promise(r => setTimeout(r, 20));
                if (window.__FAKE__.failNext) {
                  return { data: null, error: { message: '模拟的同步失败' } };
                }
                /* 必须深拷贝成 JSON 快照，模拟真云端的存储语义。
                   早先版本直接 lastPayload = p.payload，而 p.payload 就是页面里的 S
                   —— 同一个内存对象，于是「云端 == 本地」恒成立，
                   任何同步缺陷都测不出来（实测「逐条一致」永远是 true）。
                   真云端存的是请求发出那一刻的序列化结果，之后本地再改它不会跟着变。
                   这个坑和「用引用冒充快照」是同一类错误：测出来的通过是假的。 */
                const snap = JSON.parse(JSON.stringify(p.payload));
                window.__FAKE__.pushes++;
                window.__FAKE__.lastPayload = snap;
                window.__FAKE__.pushLog.push({
                  at: Date.now(),
                  items: Object.keys(snap.items || {}).length,
                });
                rows.exists = true;
                rows.payload = snap;
                return { data: [{ payload: snap }], error: null };
              },
            };
          },
        };
      },
    },
  };
  window.WorkBuddyCloud = { createWorkBuddyCloud: () => fake };
}

const results = [];
function log(name, ok, detail) {
  results.push({ name, ok });
  console.log((ok ? 'PASS  ' : 'FAIL  ') + name + (detail ? '  | ' + detail : ''));
}

async function newPage(browser, opts) {
  const ctx = await browser.newContext({ viewport: { width: 390, height: 844 } });
  await ctx.addInitScript(fakeSdk, opts);
  /* 把真 SDK 拦掉换成空文件，否则它会重新赋值 WorkBuddyCloud 覆盖假对象。
     必须在 goto 之前挂上 route。 */
  await ctx.route('**/cloud-sdk.js', route => route.fulfill({
    status: 200, contentType: 'application/javascript; charset=utf-8', body: '/* 被测试拦截 */',
  }));
  const page = await ctx.newPage();
  const errs = [];
  page.on('pageerror', e => errs.push(e.message));
  page._errs = errs;
  await page.goto(LIVE, { waitUntil: 'load', timeout: 40000 });
  await page.waitForTimeout(2200);
  return { ctx, page, errs };
}

(async () => {
  const browser = await chromium.launch({ executablePath: CHROME });

  /* ---------- 场景 A：已登录，但云端表里没有行 ---------- */
  {
    const { ctx, page, errs } = await newPage(browser, { loggedIn: true, cloudHasRow: false });
    const r = await page.evaluate(() => {
      const box = document.getElementById('account');
      return {
        me: !!window.ME,
        hasLoginForm: !!document.getElementById('auPw'),
        hasLoginBtn: !!document.getElementById('auOut'),
        acctTitle: (document.getElementById('meAcctT') || {}).textContent || '',
        acctSub: (document.getElementById('meAcctS') || {}).textContent || '',
        sync: (document.getElementById('syncChip') || {}).textContent || '',
        boxText: box ? box.textContent.replace(/\s+/g, ' ').slice(0, 90) : '',
      };
    });
    log('A1 已登录时 ME 被正确识别', r.me, 'ME=' + r.me);
    log('A2 已登录时不显示登录/注册表单', !r.hasLoginForm,
      r.hasLoginForm ? '仍渲染了 auPw 表单' : '无登录表单');
    log('A3 已登录时显示账号面板（可退出）', !!r.hasLoginBtn, '退出按钮=' + !!r.hasLoginBtn);
    log('A4 账号条显示邮箱而非「登录/注册」',
      r.acctTitle.indexOf('test@example.com') >= 0, '标题「' + r.acctTitle + '」');
    log('A5 云端为空时自动建行（不是卡在未登录）',
      r.sync.indexOf('未登录') < 0, '同步标签「' + r.sync + '」');
    log('A6 无 JS 错误', errs.length === 0, errs.length ? errs[0] : '0 个');
    await ctx.close();
  }

  /* ---------- 场景 B：已登录 + 云端有数据 ---------- */
  {
    const payload = {
      start: '2026-10-01', day: 3, savedAt: Date.now() - 1000,
      items: { 'w|รัก': { box: 2, due: '2026-10-03', r: 3, w: 0, h: 0, seen: 3, lg: [[1, 1], [3, 1]], peak: 2 } },
      days: {}, master: { 'รัก': 1 }, q: { w: 1, g: 0, hs: 0, ms: 0 }, cfg: {},
    };
    const { ctx, page, errs } = await newPage(browser, {
      loggedIn: true, cloudHasRow: true, cloudPayload: payload,
      /* 本地空白 + 云端有数据 → 走 localHasProgress() 为 false 的分支，
         直接恢复，不弹窗。 */
    });
    const r = await page.evaluate(() => ({
      me: !!window.ME,
      hasLoginForm: !!document.getElementById('auPw'),
      items: Object.keys(window.S ? S.items : {}).length,
      master: Object.keys(window.S ? S.master : {}).length,
      day: window.S ? S.day : null,
      localItems: (function () {
        try {
          const raw = localStorage.getItem('thai-daily-v1');
          return raw ? Object.keys(JSON.parse(raw).items || {}).length : -1;
        } catch (e) { return -2; }
      })(),
      pushes: window.__FAKE__ ? window.__FAKE__.pushes : -1,
      sync: (document.getElementById('syncChip') || {}).textContent || '',
    }));
    log('B1 已登录+云端有数据时不显示登录表单', !r.hasLoginForm,
      r.hasLoginForm ? '显示了登录表单' : '无');
    log('B2 云端学习记录已恢复到内存', r.items > 0,
      'items=' + r.items + ' master=' + r.master + ' day=' + r.day
      + '（云端给了 1 条 items / 1 个 master）');
    log('B3 云端记录已落到 localStorage（刷新不丢）', r.localItems > 0,
      'localStorage items=' + r.localItems);
    log('B4 无 JS 错误', errs.length === 0, errs.length ? errs[0] : '0 个');
    await ctx.close();
  }

  /* ---------- 场景 C：连续快速答题，停下后必须已推送 ---------- */
  {
    const { ctx, page, errs } = await newPage(browser, { loggedIn: true, cloudHasRow: false });
    await page.waitForTimeout(1200);
    /* 先点「新学」进闪卡 */
    await page.click('[data-run="new"]');
    await page.waitForTimeout(700);
    /* 连续 8 次：翻面 + 「认识」，每次间隔 300ms（远小于 4 秒节流窗口）。
       旧实现是纯防抖 —— 每次 save() 都重置 2.5s 定时器，
       8 次只要 2.4 秒内点完就永远不会推送，这正是用户遇到的 bug。 */
    for (let i = 0; i < 8; i++) {
      if (await page.$('#cShow')) { await page.click('#cShow'); await page.waitForTimeout(120); }
      if (await page.$('#cR')) { await page.click('#cR'); await page.waitForTimeout(300); }
    }
    const mid = await page.evaluate(() => window.__FAKE__.pushes);
    /* 停下 5.5 秒（> SYNC_MIN_GAP 4s + 一次请求耗时），尾部兜底应已触发 */
    await page.waitForTimeout(5500);
    const after = await page.evaluate(() => {
      /* 云端收到的最后一份 payload，与页面内存里的 S 做逐字段比对。
         这才是「刷新后数据还在不在」的直接答案 ——
         早先版本用「推送次数有没有涨」来判定，测出过 3 → 3 的假 FAIL：
         尾部推送可能在读到计数之前就跑完了，计数不涨但数据其实同步了。
         计数是实现细节，内容一致才是用户真正在意的不变量。
         注意必须用 window.S 显式取全局：evaluate 里直接写 S 有时拿到的是
         别的作用域副本，比对会莫名全 false。 */
      const g = window;
      const lp = g.__FAKE__.lastPayload || {};
      const SRef = g.S;
      const ci = lp.items || {}, si = SRef.items || {};
      const cKeys = Object.keys(ci), sKeys = Object.keys(si);
      const mismatched = [];
      sKeys.forEach(k => {
        if (JSON.stringify(ci[k]) !== JSON.stringify(si[k])) mismatched.push(k);
      });
      return {
        pushes: g.__FAKE__.pushes,
        cloudItems: cKeys.length,
        localItems: sKeys.length,
        sameKeys: cKeys.length === sKeys.length && cKeys.every(k => sKeys.indexOf(k) >= 0),
        identical: mismatched.length === 0,
        mismatchSample: mismatched.slice(0, 2),
        oneItemCloud: JSON.stringify(ci[sKeys[0]]),
        oneItemLocal: JSON.stringify(si[sKeys[0]]),
        qMatch: (lp.q || {}).w === (SRef.q || {}).w,
        cloudQW: (lp.q || {}).w, localQW: (SRef.q || {}).w,
        hasItems: cKeys.length > 0,
        sync: (document.getElementById('syncChip') || {}).textContent || '',
      };
    });
    log('C1 连续 8 次评分过程中已开始推送（节流生效，非纯防抖）',
      mid > 0, '答题过程中推送 ' + mid + ' 次');
    log('C2 停下后云端条目与本地完全一致（刷新不丢）',
      after.sameKeys && after.identical && after.cloudItems > 0,
      '云端 ' + after.cloudItems + ' 条 / 本地 ' + after.localItems + ' 条，逐条一致=' + after.identical
      + (after.mismatchSample.length ? '，不一致示例 ' + after.mismatchSample[0] : '')
      + (after.mismatchSample.length ? '\n        云端: ' + after.oneItemCloud + '\n        本地: ' + after.oneItemLocal : ''));
    log('C3 累计答题数云端已跟上（不是只同步了条目）', after.qMatch,
      '云端 q.w=' + after.cloudQW + ' 本地 q.w=' + after.localQW);
    log('C4 同步标签显示「已同步 + 时间」',
      after.sync.indexOf('已同步') >= 0 && /\d\d:\d\d/.test(after.sync),
      '标签「' + after.sync + '」');
    log('C5 无 JS 错误', errs.length === 0, errs.length ? errs[0] : '0 个');
    await ctx.close();
  }

  /* ---------- 场景 D：同步失败要能看见并重试 ---------- */
  {
    const { ctx, page, errs } = await newPage(browser, { loggedIn: true, cloudHasRow: false, fail: true });
    await page.waitForTimeout(2500);
    const r = await page.evaluate(() => ({
      sync: (document.getElementById('syncChip') || {}).textContent || '',
      cls: (document.getElementById('syncChip') || {}).className || '',
      cursor: (document.getElementById('syncChip') || {}).style.cursor || '',
      sub: (document.getElementById('meAcctS') || {}).textContent || '',
      clickable: !!document.getElementById('syncChip').onclick,
    }));
    log('D1 同步失败时标签文案提示可重试', r.sync.indexOf('重试') >= 0, '标签「' + r.sync + '」');
    log('D2 失败态用红色类', r.cls.indexOf('r') >= 0, 'class=' + r.cls);
    log('D3 标签可点击（光标变 pointer）', r.cursor === 'pointer', 'cursor=' + r.cursor);
    log('D4 标签绑定了重试函数', r.clickable, 'onclick=' + r.clickable);
    log('D5 账号条不再谎称「云端已连接」',
      r.sub.indexOf('云端已连接') < 0, '副标题「' + r.sub.slice(0, 60) + '」');
    log('D6 无 JS 错误', errs.length === 0, errs.length ? errs[0] : '0 个');
    await ctx.close();
  }

  /* ---------- 场景 E：换新设备登录，本地空白 → 必须无声恢复 ----------
   * 这是 localHasProgress() 修复的主战场。
   * 旧判据 localIsEmpty() 查 S.days 是否为空，而 getDay() 在页面加载时
   * 就建好了今天那条记录 → 恒为 false → 必定弹 confirm。
   * 用户在弹窗上点「取消」就永远拿不回云端进度。 */
  {
    const payload = {
      start: '2026-10-01', day: 3, savedAt: Date.now() - 1000,
      items: { 'w|รัก': { box: 2, due: '2026-10-03', r: 3, w: 0, h: 0, seen: 3, lg: [[1, 1], [3, 1]], peak: 2 } },
      days: {}, master: { 'รัก': 1 }, q: { w: 1, g: 0, hs: 0, ms: 0 }, cfg: {},
    };
    const ctx = await browser.newContext({ viewport: { width: 390, height: 844 } });
    const dialogs = [];
    /* 任何 confirm 都记下来。若代码错误地弹了窗，这里能第一时间抓到。 */
    ctx.on('dialog', async d => { dialogs.push(d.type() + ':' + d.message().slice(0, 30)); await d.accept(); });
    await ctx.addInitScript(fakeSdk, { loggedIn: true, cloudHasRow: true, cloudPayload: payload });
    await ctx.route('**/cloud-sdk.js', r => r.fulfill({
      status: 200, contentType: 'application/javascript; charset=utf-8', body: '/* 拦截 */',
    }));
    const page = await ctx.newPage();
    const errs = [];
    page.on('pageerror', e => errs.push(e.message));
    await page.goto(LIVE, { waitUntil: 'load', timeout: 40000 });
    await page.waitForTimeout(2500);
    const r = await page.evaluate(() => ({
      items: Object.keys(window.S ? S.items : {}).length,
      master: Object.keys(window.S ? S.master : {}).length,
      start: window.S ? S.start : null,
      localHas: window.localHasProgress ? localHasProgress() : null,
      localItems: (function () {
        try {
          const raw = localStorage.getItem('thai-daily-v1');
          return raw ? Object.keys(JSON.parse(raw).items || {}).length : -1;
        } catch (e) { return -2; }
      })(),
    }));
    log('E1 新设备登录时不弹任何确认框', dialogs.length === 0,
      dialogs.length ? '弹了 ' + dialogs.length + ' 次：' + dialogs[0] : '无弹窗');
    log('E2 云端进度已恢复到内存', r.items > 0 && r.master > 0,
      'items=' + r.items + ' master=' + r.master + ' start=' + r.start);
    log('E3 云端起始日期被沿用（不是被本机今天覆盖）',
      r.start === '2026-10-01', 'start=' + r.start);
    log('E4 云端记录已落到 localStorage', r.localItems > 0, 'localStorage items=' + r.localItems);
    log('E5 无 JS 错误', errs.length === 0, errs.length ? errs[0] : '0 个');
    await ctx.close();
  }

  /* ---------- 场景 F：本地有成果 → 不能被云端静默覆盖 ---------- */
  {
    const cloud = {
      start: '2026-10-01', day: 2, savedAt: Date.now() - 1000,
      items: { 'w|ขอบคุณ': { box: 1, due: '2026-10-05', r: 1, w: 0, h: 0, seen: 1, lg: [], peak: 1 } },
      days: {}, master: { 'ขอบคุณ': 1 }, q: { w: 1, g: 0, hs: 0, ms: 0 }, cfg: {},
    };
    /* 本地有更近的学习成果：savedAt 比云端 updated_at 新，items 也不同 */
    const local = {
      start: '2026-10-01', day: 5, savedAt: Date.now(), focus: '',
      items: { 'w|รัก': { box: 3, due: '2026-10-06', r: 3, w: 0, h: 0, seen: 6, lg: [], peak: 3 } },
      days: { 5: { plan: {}, st: { new: { done: true, n: 12, score: 92 } } } },
      master: { 'รัก': 1 }, q: { w: 12, g: 0, hs: 0, ms: 0 }, cfg: {},
    };
    const ctx = await browser.newContext({ viewport: { width: 390, height: 844 } });
    const dialogs = [];
    ctx.on('dialog', async d => { dialogs.push(d.type()); await d.accept(); });
    await ctx.addInitScript(fakeSdk, {
      loggedIn: true, cloudHasRow: true, cloudPayload: cloud, seedLocal: local,
    });
    await ctx.route('**/cloud-sdk.js', r => r.fulfill({
      status: 200, contentType: 'application/javascript; charset=utf-8', body: '/* 拦截 */',
    }));
    const page = await ctx.newPage();
    const errs = [];
    page.on('pageerror', e => errs.push(e.message));
    await page.goto(LIVE, { waitUntil: 'load', timeout: 40000 });
    await page.waitForTimeout(2500);
    const r = await page.evaluate(() => ({
      items: Object.keys(window.S ? S.items : {}).length,
      hasLocal: !!(window.S && S.items['w|รัก']),
      hasCloud: !!(window.S && S.items['w|ขอบคุณ']),
      qw: window.S ? (S.q || {}).w : null,
    }));
    log('F1 本地更新时不弹窗（本地比云端新，无需打扰）', dialogs.length === 0,
      dialogs.length ? '弹了 ' + dialogs.length + ' 次' : '无弹窗');
    log('F2 本地成果未被云端覆盖', r.hasLocal && !r.hasCloud,
      '本地条目=' + r.hasLocal + ' 云端条目=' + r.hasCloud + ' items=' + r.items);
    log('F3 本地答题数保留', r.qw === 12, 'q.w=' + r.qw + '（本地 12）');
    log('F4 无 JS 错误', errs.length === 0, errs.length ? errs[0] : '0 个');
    await ctx.close();
  }

  /* ---------- 场景 G：有历史学习记录的用户必须能正常打开页面 ----------
   * 这条防的是一个曾经存在、且影响面极大的顺序 bug：
   *   var TASKS 声明在 renderToday 之前，但第 1194 行 var D = getDay(S.day)
   *   → buildPlan() → doneDays() → dayDone() 会读 TASKS.length，
   *   而此时 TASKS 还没赋值（var 提升只提升声明，不提升初始化）。
   * 后果：本地存过任何一天记录的用户，一打开页面整个 <script> 就抛错中断，
   *      今日看板空白、底部导航和所有按钮失灵。触发条件＝有历史记录+跨天。 */
  {
    const ctx = await browser.newContext({ viewport: { width: 390, height: 844 } });
    await ctx.addInitScript(s => {
      try { localStorage.setItem('thai-daily-v1', JSON.stringify(s)); } catch (e) {}
    }, {
      start: '2026-10-01', day: 2, savedAt: Date.now() - 86400000,
      items: { 'w|รัก': { box: 2, due: '2026-10-03', r: 2, w: 0, h: 0, seen: 3, lg: [[1, 1]], peak: 2 } },
      master: { 'รัก': 1 }, q: { w: 12, g: 0, hs: 0, ms: 0 }, cfg: {},
      days: {
        1: {
          plan: { newW: [], dueW: [], newG: [], dueG: [], read: [], out: [], wEnd: 0, gEnd: 0, why: '' },
          st: { rev: { done: true, n: 3, score: 100 }, new: { done: true, n: 12, score: 88 },
                read: { done: true, n: 5, score: 80 }, out: { done: true, n: 4, score: 75 },
                quiz: { done: true, n: 10, score: 90 } },
        },
      },
    });
    await ctx.route('**/cloud-sdk.js', r => r.fulfill({
      status: 200, contentType: 'application/javascript; charset=utf-8', body: '/* 拦截 */',
    }));
    const page = await ctx.newPage();
    const errs = [];
    page.on('pageerror', e => errs.push(e.message));
    await page.goto(LIVE, { waitUntil: 'load', timeout: 40000 });
    await page.waitForTimeout(2200);
    const r = await page.evaluate(() => ({
      tasks: (typeof TASKS !== 'undefined' && TASKS) ? TASKS.length : 0,
      boardLen: ((document.getElementById('board') || {}).textContent || '').replace(/\s+/g, '').length,
      tabBtns: document.querySelectorAll('.tabbar button').length,
      /* 点击「词库」标签必须真的切页 —— 脚本一中断，所有 onclick 都没绑上 */
      canSwitch: (function () {
        const b = document.querySelector('.tabbar button[data-v="words"]');
        if (!b || !b.onclick) return false;
        b.click();
        return !!document.getElementById('v-words').classList.contains('on');
      })(),
    }));
    log('G1 有历史记录时页面无 JS 错误', errs.length === 0, errs.length ? errs[0] : '0 个');
    log('G2 TASKS 正常初始化（提升顺序正确）', r.tasks === 5, 'TASKS.length=' + r.tasks);
    log('G3 今日看板有内容（脚本未中断）', r.boardLen > 20, '看板字符数=' + r.boardLen);
    log('G4 底部导航可切换（事件已绑定）', r.tabBtns === 5 && r.canSwitch,
      '按钮=' + r.tabBtns + ' 可切换=' + r.canSwitch);
    await ctx.close();
  }

  await browser.close();
  const fail = results.filter(r => !r.ok).length;
  console.log('\n' + (fail === 0 ? '全部通过（' + results.length + ' 项）' : '失败 ' + fail + ' / ' + results.length + ' 项'));
  process.exit(fail === 0 ? 0 : 1);
})();
