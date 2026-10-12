/* 多设备协作专项测试：证明「换设备学习不会互相覆盖」。
 *
 * 要复现的真实事故：
 *   上午在书房电脑上学了 5 个词 → 推到云端
 *   下午在手机上学了 3 个词     → 推到云端（把电脑上那 5 个整包盖掉）
 *   晚上回到电脑上继续学         → 电脑上只剩 3 个，上午那 5 个没了
 *
 * 难点：两台设备 = 两个浏览器上下文，各自有独立的 localStorage，
 * 但必须共享**同一个云端那一行**。纯前端的假 SDK 做不到跨上下文共享内存，
 * 所以这里把云端状态放在 Node 端，页面里的假 SDK 用 fetch 跟 Node 通信。
 * 这样两个上下文读写的是同一份 CLOUD，跟真云端按 owner_id 只有一行的语义一致。
 *
 * 用法：NODE_PATH=... node tools/verify-multidev.js
 */
const { chromium } = require('playwright-core');

const CHROME = 'C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe';
const URL = process.env.TEST_URL || 'http://127.0.0.1:8899/';

/* ---------- Node 端的「云端那一行」 ---------- */
const CLOUD = { exists: false, payload: null, updated_at: '', pushes: 0, lastWriter: '' };
let LAST = 0;
/* 时间戳必须严格递增：真云端的 updated_at 由服务器生成，后写的一定更大。
   如果两次写入拿到同一个毫秒值，rt > base 就不成立，
   合并会被跳过 —— 于是「测出来通过」其实只是时间戳撞了。 */
function stamp() {
  LAST = Math.max(Date.now(), LAST + 1);
  return new Date(LAST).toISOString();
}

function cloudRpc(route) {
  let body = {};
  try { body = JSON.parse(route.request().postData() || '{}'); } catch (e) {}
  let out;
  if (body.op === 'get') {
    const cols = body.arg && body.arg.cols;
    if (!CLOUD.exists) out = { data: null, error: null };
    else if (cols === 'updated_at') out = { data: { updated_at: CLOUD.updated_at }, error: null };
    else out = { data: { payload: CLOUD.payload, updated_at: CLOUD.updated_at }, error: null };
  } else if (body.op === 'upsert') {
    /* 必须深拷贝成快照：真云端存的是请求发出那一刻的序列化结果，
       之后页面里再改 S 不会跟着变。用引用冒充快照的话
       「云端 == 本地」恒成立，任何覆盖缺陷都测不出来。 */
    CLOUD.payload = JSON.parse(JSON.stringify(body.arg.payload));
    CLOUD.updated_at = stamp();
    CLOUD.exists = true;
    CLOUD.pushes++;
    CLOUD.lastWriter = (body.arg.payload && body.arg.payload.dev) || '';
    out = { data: [{ payload: CLOUD.payload, updated_at: CLOUD.updated_at }], error: null };
  } else {
    out = { data: null, error: { message: 'unknown op' } };
  }
  route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify(out) });
}

/* 注入到页面最前面的假 SDK */
function fakeSdk(dev) {
  localStorage.setItem('thai-device-v1', dev);
  async function rpc(op, arg) {
    const r = await fetch('/__cloud', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ op, arg }),
    });
    return await r.json();
  }
  const fake = {
    auth: {
      getSession: async () => ({ data: { user: { id: 'u1', email: 'me@test.com' } }, error: null }),
      signOut: async () => ({ error: null }),
      signInWithPassword: async () => ({ data: { user: { id: 'u1' } }, error: null }),
    },
    database: {
      from() {
        const self = {
          _cols: null,
          select(cols) { self._cols = cols; return self; },
          maybeSingle: async () => rpc('get', { cols: self._cols }),
          upsert(p) {
            return { async select() { return rpc('upsert', p); } };
          },
        };
        return self;
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

async function openDevice(browser, dev) {
  const ctx = await browser.newContext({ viewport: { width: 390, height: 844 } });
  await ctx.addInitScript(fakeSdk, dev);
  await ctx.route('**/cloud-sdk.js', r => r.fulfill({
    status: 200, contentType: 'application/javascript; charset=utf-8', body: '/* 测试拦截 */',
  }));
  await ctx.route('**/__cloud', cloudRpc);
  const page = await ctx.newPage();
  const errs = [], dialogs = [];
  page.on('pageerror', e => errs.push(e.message));
  page.on('dialog', d => { dialogs.push(d.message); d.dismiss(); });
  await page.goto(URL, { waitUntil: 'load', timeout: 40000 });
  await page.waitForTimeout(2000);
  page._errs = errs; page._dialogs = dialogs;
  return { ctx, page };
}

/* 在这台设备上「学」几条：直接写 items + 游标，然后立即推云端 */
async function learn(page, keys, box) {
  await page.evaluate(async ({ keys, box }) => {
    keys.forEach(function (k) {
      S.items[k] = { box: box || 1, due: '2026-12-01', r: box || 1, w: 0, h: 0, seen: box || 1, lg: [[1, 1]], peak: box || 1 };
    });
    S.q.w = (S.q.w || 0) + keys.length;
    markDirty();
    pushNow();
  }, { keys, box });
  await page.waitForTimeout(900);
}

const nItems = async page => page.evaluate(() => Object.keys(S.items).length);
const cloudItems = () => Object.keys((CLOUD.payload && CLOUD.payload.items) || {}).length;

/* 模拟「切回前台」：派发真实事件，走的是页面里那个 visibilitychange 监听器。
   bubbles 必须为 true —— visibilitychange 是在 document 上触发、冒泡到 window 的，
   不冒泡的话 window 上的监听器根本收不到（实测因此误判「合并没生效」）。 */
async function comeBack(page) {
  const vis = await page.evaluate(() => {
    document.dispatchEvent(new Event('visibilitychange', { bubbles: true }));
    return document.visibilityState;
  });
  if (vis !== 'visible') console.log('   注意：页面 visibilityState=' + vis + '，走的是另一条分支');
  await page.waitForTimeout(1400);
}

(async () => {
  const browser = await chromium.launch({ executablePath: CHROME });

  /* ---------- 1. 设备 A 首次登录：云端为空 ---------- */
  const A = await openDevice(browser, 'Win-Chrome-aaa');
  log('M1 设备 A 打开无报错', A.page._errs.length === 0, A.page._errs[0] || '0 个');
  log('M2 设备 A 拿到自己的设备名',
    (await A.page.evaluate(() => DEV)) === 'Win-Chrome-aaa', '');

  /* ---------- 2. A 学 5 条并推送 ---------- */
  await learn(A.page, ['w|a1', 'w|a2', 'w|a3', 'w|a4', 'w|a5']);
  log('M3 A 学 5 条后云端有 5 条', cloudItems() === 5, '云端=' + cloudItems());
  log('M4 云端记录写着是 A 写的', CLOUD.lastWriter === 'Win-Chrome-aaa', CLOUD.lastWriter);

  /* ---------- 3. 设备 B 打开：本地空白，应从云端恢复 ---------- */
  const B = await openDevice(browser, 'iPhone-Safari-bbb');
  log('M5 设备 B 恢复出 A 的 5 条', (await nItems(B.page)) === 5, 'B=' + await nItems(B.page));
  log('M6 B 恢复时不弹「覆盖本地」确认框', B.page._dialogs.length === 0,
    B.page._dialogs[0] || '无弹窗');
  log('M7 B 的设备名与 A 不同',
    (await B.page.evaluate(() => DEV)) === 'iPhone-Safari-bbb', '');

  /* ---------- 4. B 学 3 条（不同的词）并推送 ---------- */
  await learn(B.page, ['w|b1', 'w|b2', 'w|b3']);
  log('M8 B 学完后云端是 8 条（A 的 5 条没被盖掉）', cloudItems() === 8, '云端=' + cloudItems());

  /* ---------- 5. A 切回前台：应该合并而不是被整包替换 ---------- */
  await comeBack(A.page);
  const aItems = await nItems(A.page);
  log('M9 A 切回前台后合并到 8 条', aItems === 8, 'A=' + aItems);
  log('M10 A 自己那 5 条还在',
    await A.page.evaluate(() => ['w|a1', 'w|a2', 'w|a3', 'w|a4', 'w|a5'].every(k => !!S.items[k])), '');
  log('M11 B 那 3 条也到了 A 上',
    await A.page.evaluate(() => ['w|b1', 'w|b2', 'w|b3'].every(k => !!S.items[k])), '');
  log('M12 合并过程不弹确认框', A.page._dialogs.length === 0, A.page._dialogs[0] || '无弹窗');

  /* ---------- 6. A 继续学 2 条，直接推送（测推送前的自动对账） ---------- */
  await learn(A.page, ['w|a6', 'w|a7']);
  log('M13 A 再学 2 条后云端是 10 条', cloudItems() === 10, '云端=' + cloudItems());

  /* ---------- 7. B 切回前台 ---------- */
  await comeBack(B.page);
  log('M14 B 切回前台后合并到 10 条', (await nItems(B.page)) === 10, 'B=' + await nItems(B.page));

  /* ---------- 8. 合并规则：记忆强度取高 ---------- */
  await A.page.evaluate(async () => {
    S.items['w|same'] = { box: 4, due: '2026-12-01', r: 4, w: 0, h: 0, seen: 4, lg: [[1, 1]], peak: 4 };
    markDirty(); pushNow();
  });
  await A.page.waitForTimeout(900);
  await B.page.evaluate(async () => {
    S.items['w|same'] = { box: 1, due: '2026-10-15', r: 1, w: 0, h: 0, seen: 1, lg: [[1, 1]], peak: 1 };
    markDirty();
  });
  await comeBack(B.page);
  const boxSame = await B.page.evaluate(() => S.items['w|same'].box);
  log('M15 同一条目取记忆强度更高的一边（不是更晚的一边）', boxSame === 4, 'box=' + boxSame);

  /* ---------- 9. 合并规则：错题「连续答对」取小 ---------- */
  await A.page.evaluate(async () => {
    S.wrong['w|hard'] = { n: 3, last: '2026-10-12', clr: 2 };
    markDirty(); pushNow();
  });
  await A.page.waitForTimeout(900);
  await B.page.evaluate(async () => {
    S.wrong['w|hard'] = { n: 1, last: '2026-10-12', clr: 0 };
    markDirty();
  });
  await comeBack(B.page);
  const clr = await B.page.evaluate(() => S.wrong['w|hard'].clr);
  log('M16 错题的「连续答对」取小，不会提前移出错题本', clr === 0, 'clr=' + clr);

  /* ---------- 10. 合并规则：游标取大、已掌握取并集 ---------- */
  /* 游标：让 A 是 3、B 是 99，合并后 B 必须还是 99。
     取了小值就等于游标回退 —— 下一批新词会从头再发一遍，
     用户会看到「这个词我明明学过了」。 */
  await A.page.evaluate(async () => { S.q.w = 3; markDirty(); pushNow(); });
  await A.page.waitForTimeout(900);
  await B.page.evaluate(async () => { S.q.w = 99; markDirty(); });
  await comeBack(B.page);
  const qBoth = await B.page.evaluate(() => S.q.w);
  log('M17 游标取两边较大值，不会回退', qBoth === 99, 'q.w=' + qBoth);
  await B.page.evaluate(async () => { S.master['รัก'] = 1; markDirty(); pushNow(); });
  await A.page.waitForTimeout(900);
  await comeBack(A.page);
  log('M18 词库「已掌握」取并集',
    await A.page.evaluate(() => !!S.master['รัก']), '');

  /* ---------- 11. 配额按最后改的那台 ---------- */
  await A.page.evaluate(async () => { S.cfg.newWords = 8; S.cfgAt = Date.now(); markDirty(); pushNow(); });
  await A.page.waitForTimeout(900);
  await comeBack(B.page);
  log('M19 配额按最后改的那台为准（A 改成 8 后 B 也是 8）',
    (await B.page.evaluate(() => S.cfg.newWords)) === 8,
    'B.cfg.newWords=' + await B.page.evaluate(() => S.cfg.newWords));

  /* ---------- 12. 全程不弹确认框、无 JS 错误 ---------- */
  const allDialogs = A.page._dialogs.length + B.page._dialogs.length;
  log('M20 全程没有「用云端覆盖本地」这类确认框', allDialogs === 0, '弹窗数=' + allDialogs);
  const allErrs = A.page._errs.concat(B.page._errs);
  log('M21 两台设备全程无 JS 错误', allErrs.length === 0, allErrs[0] || '0 个');
  log('M22 云端最终 10 条以上，且最后写入者是可识别的设备',
    cloudItems() >= 10 && /Chrome-aaa|Safari-bbb/.test(CLOUD.lastWriter),
    '云端=' + cloudItems() + ' 最后写入=' + CLOUD.lastWriter);

  await browser.close();

  const bad = results.filter(r => !r.ok);
  console.log('\n合计 ' + results.length + ' 项，通过 ' + (results.length - bad.length) + '，失败 ' + bad.length);
  process.exit(bad.length ? 1 : 0);
})();
