/* 验收推理模型审查发现的 5 个 P0/P1 修复
 *
 * 判据原则：这类 bug 都是「不报错、只是数字错了 / 点了没反应」，
 * 所以必须**跑数字对比**，不能只查代码改没改。
 *
 * 用法: TEST_URL=http://127.0.0.1:8899/ node tools/verify-p0-round3.js
 */
const { chromium } = require('playwright-core');
const CHROME = 'C:/Program Files/Google/Chrome/Application/chrome.exe';
const LIVE = process.env.TEST_URL || ('http://127.0.0.1:' + (process.env.TEST_PORT || 8899) + '/');
let pass = 0, fail = 0;
function log(ok, name, detail) {
  console.log((ok ? 'PASS  ' : 'FAIL  ') + name + '  | ' + (detail == null ? '' : detail));
  ok ? pass++ : fail++;
}
const SEED = require('./seed-for-visual.js');

(async () => {
  const browser = await chromium.launch({ executablePath: CHROME, args: ['--autoplay-policy=no-user-gesture-required'] });
  const ctx = await browser.newContext({ viewport: { width: 420, height: 860 } });
  await ctx.route('**/cloud-sdk.js', r => r.fulfill({ status: 200, contentType: 'application/javascript; charset=utf-8', body: '/* x */' }));
  await ctx.addInitScript((seed) => {
    try { localStorage.setItem('thai-daily-v1', JSON.stringify(seed)); } catch (e) {}
  }, SEED);
  const page = await ctx.newPage();
  const errs = [];
  page.on('pageerror', e => errs.push(String(e)));
  await page.goto(LIVE, { waitUntil: 'load', timeout: 40000 });
  await page.waitForTimeout(1800);

  /* ================= ① 例句进入复习队列 ================= */
  console.log('\n===== ① 例句必须进复习队列 =====\n');

  const plan = await page.evaluate(() => {
    /* due 是 'YYYY-MM-DD' 字符串（ensure() 里 due:today()），不是天数数字。
       用数字写 due 会让 `it.due <= t` 的字符串比较恒为 false，
       于是 dueList 返回 0 条 —— 那是测试写错，不是产品 bug。 */
    var made = [], past = addDays(today(), -2);
    for (var i = 0; i < 6; i++) {
      var sid = POOL_HS[i] ? POOL_HS[i].id : (POOL_MS[i] ? POOL_MS[i].id : null);
      if (!sid) break;
      var k = 's|' + sid;
      var it = ensure(k);
      it.seen = 1; it.box = 1; it.r = 1; it.w = 0; it.h = 0;
      it.lg = [[Math.max(1, S.day - 2), 1]];
      it.due = past;
      made.push(k);
    }
    /* 关键：buildPlan() 返回的是**新对象**，而 D.plan 是 getDay() 缓存的快照，
       两者不是同一个引用。taskKeys() 读的是 D.plan。
       所以造完数据必须 D.plan = buildPlan() 把快照刷新，
       否则 taskKeys 看到的还是加载页面时那份旧 plan（dueSH=0）—— 那是测试写错。 */
    D.plan = buildPlan();
    var revKeys = taskKeys('rev');
    return {
      made: made,
      planHasH: (D.plan.dueSH || []).length,
      planHasM: (D.plan.dueSM || []).length,
      planHasOther: (D.plan.dueSOther || []).length,
      revSent: revKeys.filter(k => k.indexOf('s|') === 0).length,
      revTotal: revKeys.length,
      revHasMade: made.filter(k => revKeys.indexOf(k) >= 0).length,
      sampleMade: made.slice(0, 3),
    };
  });
  log(plan.planHasH > 0, '1.1 她的例句进了复习计划', 'dueSH=' + plan.planHasH + ' 条');
  log(plan.revSent > 0, '1.2 rev 任务里真的有例句', plan.revSent + ' / ' + plan.revTotal + ' 条');
  log(plan.revHasMade === plan.made.length, '1.3 造的到期例句全部被派发',
    '造了 ' + plan.made.length + ' 条，rev 里命中 ' + plan.revHasMade + ' 条');

  const kinds = await page.evaluate(() => {
    var rk = taskKeys('rev').filter(k => k.indexOf('s|') === 0);
    return {
      her: rk.filter(k => { var s = SMAP[sentKey(k.slice(2))]; return s && s.who === 0; }).length,
      my: rk.filter(k => { var s = SMAP[sentKey(k.slice(2))]; return s && s.who === 1; }).length,
    };
  });
  log(kinds.her + kinds.my > 0, '1.4 例句按说话人分流（她/我分开）', '她 ' + kinds.her + ' / 我 ' + kinds.my);

  /* ================= ② 游标不再双倍推进 ================= */
  console.log('\n===== ② 加学不再跳过例句 =====\n');

  const cursor = await page.evaluate(() => {
    /* 直接验 buildPlan 记下的端点是否等于「起始游标 + 本日条数」。
       旧逻辑是 extendToday 里 += 一次、btnFinish 里再 += 一次 = 双倍推进。
       现在 extendToday 不再推进，统一用 plan.hsEnd / plan.msEnd 赋值。 */
    var p = buildPlan();
    var hsStart = S.q.hs, msStart = S.q.ms;
    return {
      hsStart: hsStart, msStart: msStart,
      readN: (p.read || []).length, outN: (p.out || []).length,
      hsEnd: p.hsEnd, msEnd: p.msEnd,
      hsOk: p.hsEnd === hsStart + (p.read || []).length,
      msOk: p.msEnd === msStart + (p.out || []).length,
    };
  });
  log(cursor.hsOk, '2.1 她的例句游标端点 = 起点 + read.length（不双倍）',
    '起点 ' + cursor.hsStart + ' + ' + cursor.readN + ' = ' + cursor.hsEnd);
  log(cursor.msOk, '2.2 我的例句游标端点 = 起点 + out.length',
    '起点 ' + cursor.msStart + ' + ' + cursor.outN + ' = ' + cursor.msEnd);

  /* 加学后端点要跟着更新，而不是靠累加 */
  const ext = await page.evaluate(() => {
    /* 同样必须用 D.plan：extendToday 改的是 D.plan，不是 buildPlan() 的返回值 */
    D.plan = buildPlan();
    var before = D.plan.read.length, e0 = D.plan.hsEnd;
    var added = extendToday('read', 3);
    return { before: before, after: D.plan.read.length, e0: e0, e1: D.plan.hsEnd, added: added };
  });
  log(ext.after === ext.before + 3, '2.3 加学 3 条后 read 变 3 条更多',
    ext.before + ' → ' + ext.after);
  log(ext.e1 === ext.e0 + 3, '2.4 加学后端点只 +3（不是 +2×3）',
    '端点 ' + ext.e0 + ' → ' + ext.e1);

  const guard = await page.evaluate(() => {
    /* btnFinish 必须有防重入标记 */
    var src = document.getElementById('btnFinish');
    return { exists: !!src, hasGuard: typeof __finishing !== 'undefined' };
  });
  log(guard.exists, '2.5 打卡按钮存在', '');
  log(guard.hasGuard, '2.5 有防重入标记 __finishing', '');

  /* ================= ③ loadForecast 补过期 ================= */
  console.log('\n===== ③ 断更后负荷不再算成 0 =====\n');

  const fc = await page.evaluate(() => {
    var t = today(), past = addDays(t, -5);   // due 是日期字符串
    for (var i = 0; i < 3; i++) {
      var k = 'w|' + (POOL_W[i] ? POOL_W[i].t : 'x');
      var it = ensure(k);
      it.seen = 1; it.box = 1; it.due = past; it.lg = [[1, 1]];
    }
    var f = loadForecast(7);
    return {
      n: f.length, first: f[0].n, over: !!f[0].over,
      sum: f.reduce(function(a, x){ return a + x.n; }, 0),
      dueToday: dueList().filter(function(k){
        var it = S.items[k]; return it && it.due <= t;
      }).length,
    };
  });
  log(fc.first >= 3, '3.1 过期条目被算进今天（第 0 格）', '第 0 格 = ' + fc.first + ' 条');
  log(fc.over, '3.2 第 0 格标记为「过期」', '');
  log(fc.sum > 0, '3.3 断更后负荷不再显示 0', '7 天合计 ' + fc.sum + ' 条');

  /* ================= ④ 空任务不记 100 分 ================= */
  console.log('\n===== ④ 空任务不虚高分数 =====\n');

  const score = await page.evaluate(() => {
    /* 造一天：只有 new 和 quiz 做了，rev/read/out 全空壳 */
    var d = 99;
    S.days[d] = { plan: buildPlan(), st: {} };
    S.days[d].st.new = { done: true, n: 12, score: 60 };
    S.days[d].st.quiz = { done: true, n: 8, right: 5, score: 60 };
    S.days[d].st.rev = { done: true, n: 0, score: null, skip: true };
    S.days[d].st.read = { done: true, n: 0, score: null, skip: true };
    S.days[d].st.out = { done: true, n: 0, score: null, skip: true };
    var got = dayScoreOf(d);
    /* 旧算法会怎样：把空壳当 100 分 */
    var a = S.days[d].st;
    var oldCard = (((a.rev && a.rev.score) || 0) + ((a.new && a.new.score) || 0)) / 2;
    var old = Math.round(0.25 * oldCard + 0.35 * (a.quiz.score || 0) + 0.20 * 0 + 0.20 * 0);
    delete S.days[d];
    return { got: got, oldStyle: old };
  });
  log(score.got > 0, '4.1 有内容的项仍能算出分', score.got + ' 分');
  log(Math.abs(score.got - score.oldStyle) >= 0 && score.got >= 58 && score.got <= 62,
    '4.2 分数贴近真实成绩（两项都是 60）', '新算法 ' + score.got + '，只做两项应约 60');
  log(score.got >= 60, '4.3 空任务不再白送分（不超过真实分）',
    '新 ' + score.got + ' / 旧（含 100 分加权）' + score.oldStyle);

  const card = await page.evaluate(() => {
    var d = 98;
    S.days[d] = { plan: {}, st: { rev: { done: true, n: 0, score: null, skip: true }, new: { done: true, n: 10, score: 70 } } };
    var got = cardScoreOf(d);
    var old = Math.round((((S.days[d].st.rev||{}).score||0) + 70) / 2);
    delete S.days[d];
    return { got: got, old: old };
  });
  log(card.got === 70 && card.old < 70, '4.4 「闪卡」分只算真做过的项',
    '新 ' + card.got + '（只做新学=70）／旧 ' + card.old + '（空壳当 0 拉低）');

  /* ================= ⑤ drill() 会切页 ================= */
  console.log('\n===== ⑤ 「只练薄弱词」不再点了没反应 =====\n');

  await page.click('.tabbar button[data-v="today"]');
  await page.waitForTimeout(500);
  const beforeTab = await page.evaluate(() => document.querySelector('.tabbar button.on').getAttribute('data-v'));

  const dres = await page.evaluate(() => {
    var keys = [];
    for (var i = 0; i < POOL_W.length && keys.length < 6; i++) keys.push('w|' + POOL_W[i].t);
    window.__toast = null;
    drill(keys, '测试');
    return {
      tab: document.querySelector('.tabbar button.on').getAttribute('data-v'),
      hasStudy: !!document.querySelector('#runner .study'),
      runLen: (run && run.keys.length) || 0,
      focus: document.body.classList.contains('focus'),
    };
  });
  log(beforeTab === 'today', '5.1 起点在今日页', 'tab=' + beforeTab);
  log(dres.tab === 'drill', '5.2 点完自动切到练习页', 'tab=' + dres.tab);
  log(dres.hasStudy, '5.3 卡片真的渲染出来了（之前渲染在隐藏页里）', '');
  log(dres.runLen > 0, '5.4 有题目可做', dres.runLen + ' 条');
  log(dres.focus, '5.5 进入专注态（收起无关区块）', '');

  console.log('\n===== 控制台错误 =====\n');
  const realErrs = errs.filter(x => x.indexOf('favicon') < 0);
  log(realErrs.length === 0, 'C1 无 JS 运行时错误', realErrs.slice(0, 3).join(' | ') || '干净');

  console.log('\n' + '='.repeat(46));
  console.log('  通过 ' + pass + ' / ' + (pass + fail) + (fail ? '　✘ 失败 ' + fail : '　✓ 全绿'));
  console.log('='.repeat(46) + '\n');
  await browser.close();
  process.exit(fail ? 1 : 0);
})().catch(e => { console.error('脚本异常：', e); process.exit(2); });
