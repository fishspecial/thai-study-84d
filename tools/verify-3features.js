/* 验收三个新需求：功能模块隔离 / 每日记录查询 / 预计学习时长
 *
 * 判据原则（踩过的坑）：
 *   - 不能只查函数存在 —— 必须真点按钮、真看渲染出来的文字
 *   - 不能用 file:// —— Origin 为 null，云服务全拒，同步测试会假 FAIL
 *   - 用 tools/tmp-serve.js（8899）伺服工作副本，别打 8848（那是冻结快照）
 *
 * 用法: TEST_URL=http://127.0.0.1:8899/ node tools/verify-3features.js
 */
const { chromium } = require('playwright-core');
const CHROME = 'C:/Program Files/Google/Chrome/Application/chrome.exe';
const LIVE = process.env.TEST_URL || ('http://127.0.0.1:' + (process.env.TEST_PORT || 8899) + '/');

let pass = 0, fail = 0;
function log(ok, name, detail) {
  console.log((ok ? 'PASS  ' : 'FAIL  ') + name + '  | ' + (detail == null ? '' : detail));
  ok ? pass++ : fail++;
}

/* 种子数据与截图脚本共用 tools/seed-for-visual.js ——
   两处各造一份的话，「测过的页面」和「看到的截图」可能不是同一个状态，
   那种情况下截图只能当装饰，不能当证据。 */
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

  console.log('\n===== 需求 1：功能模块隔离 =====\n');

  /* 初始态：无关区块必须可见 */
  let before = await page.evaluate(() => ({
    focus: document.body.classList.contains('focus'),
    boardH: document.getElementById('board').getBoundingClientRect().height,
    taskH: document.getElementById('taskList').getBoundingClientRect().height,
    heroH: document.querySelector('.hero').getBoundingClientRect().height,
  }));
  log(!before.focus && before.boardH > 10 && before.taskH > 10 && before.heroH > 10,
    '1.1 常态下今日看板/任务列表都可见',
    'focus=' + before.focus + ' 看板高=' + Math.round(before.boardH) + ' 任务高=' + Math.round(before.taskH) + ' KPI高=' + Math.round(before.heroH));

  /* 真点「今日测验」的按钮 */
  const clicked = await page.evaluate(() => {
    const b = document.querySelector('[data-run="quiz"]');
    if (!b) return null;
    b.click();
    return true;
  });
  await page.waitForTimeout(700);
  log(clicked === true, '1.2 能点开今日测验', clicked ? '已点击' : '找不到 [data-run=quiz]');

  let inFocus = await page.evaluate(() => {
    const g = (id) => { const e = document.getElementById(id); return e ? Math.round(e.getBoundingClientRect().height) : -1; };
    return {
      focus: document.body.classList.contains('focus'),
      /* 今天页总览不再被折叠 —— 练习已独立出去，折叠它等于「切去练习今日页就空了」。
         判据改成「练习页的任务列表收起 + 今日页总览保持原样」。 */
      drillListH: g('drillList'),
      listDisplay: getComputedStyle(document.getElementById('drillList')).display,
      boardH: g('board'), taskH: g('taskList'), heroH: Math.round(document.querySelector('.hero').getBoundingClientRect().height),
      runnerH: g('runner'), runnerText: (document.getElementById('runner').innerText || '').slice(0, 40),
      bar: (document.getElementById('focusBar').innerText || '').trim(),
      opts: document.querySelectorAll('#runner .opt').length,
    };
  });
  log(inFocus.focus === true, '1.3 进入测验后进入专注态（body.focus）', 'focus=' + inFocus.focus);
  log(inFocus.listDisplay === 'none',
    '1.4 专注态下练习页任务列表收起，今日页总览保持可见',
    'drillList=' + inFocus.listDisplay + ' 看板=' + inFocus.boardH + 'px KPI=' + inFocus.heroH + 'px');
  log(inFocus.runnerH > 100 && inFocus.opts > 0, '1.5 做题区正常显示',
    'runner 高=' + inFocus.runnerH + 'px 选项=' + inFocus.opts + ' 个');
  log(/第\s*\d+\s*\/\s*\d+\s*题/.test(inFocus.bar), '1.6 返回条显示进度（第几题/共几题）',
    '「' + inFocus.bar.replace(/\s+/g, ' ').slice(0, 46) + '」');

  /* 退出。
     判据在 2026-10-03 改过：练习拆成独立标签后，看板和任务清单不再受
     body.focus 控制（那条折叠规则已收敛到 #drillList），元素也不在今日页了。
     退出专注态后该恢复的是**练习页内部的任务列表**，不是今日页看板。
     继续拿 boardH/taskH 判会永远 FAIL —— 那是判据过时，不是产品坏了。 */
  await page.evaluate(() => { const b = document.getElementById('qQuit'); if (b) b.click(); });
  await page.waitForTimeout(600);
  let after = await page.evaluate(() => {
    const L = document.getElementById('drillList');
    const board = document.getElementById('board');
    const task = document.getElementById('taskList');
    return {
      focus: document.body.classList.contains('focus'),
      listShown: L ? getComputedStyle(L).display !== 'none' : false,
      cards: L ? L.querySelectorAll('.dcard').length : 0,
      /* 今日页两块内容仍在（只是不在练习页了） */
      boardExists: !!board, taskExists: !!task,
      boardH: board ? Math.round(board.getBoundingClientRect().height) : -1,
    };
  });
  log(!after.focus && after.listShown && after.cards === 5,
    '1.7 退出后恢复（专注态解除，练习页任务列表回来了）',
    'focus=' + after.focus + ' 卡片=' + after.cards + ' 张');
  log(after.boardExists && after.taskExists,
    '1.7b 今日页看板与任务清单仍在（只是搬到了今日页）', 'board 存在');

  /* 闪卡也要隔离 */
  await page.evaluate(() => { const b = document.querySelector('[data-run="new"]'); if (b) b.click(); });
  await page.waitForTimeout(700);
  const cardFocus = await page.evaluate(() => ({
    focus: document.body.classList.contains('focus'),
    boardH: Math.round(document.getElementById('board').getBoundingClientRect().height),
    bar: (document.getElementById('focusBar').innerText || '').trim(),
  }));
  log(cardFocus.focus && cardFocus.boardH === 0, '1.8 闪卡同样进入专注态',
    'focus=' + cardFocus.focus + ' 看板=' + cardFocus.boardH + 'px');
  log(cardFocus.bar.length > 0, '1.9 闪卡返回条有内容', '「' + cardFocus.bar.replace(/\s+/g, ' ').slice(0, 40) + '」');

/* 做完闪卡 → 应有「返回今日看板」按钮。
   注意：闪卡一题要点两轮（先「显示答案」再「不会」），而且一批有 15 题，
   所以必须循环到 finishRun，不能点一次就返回 —— 上一版就是这里写错，
   导致 1.11 假 FAIL（按钮其实在第 15 题之后才出现）。 */
  for (let i = 0; i < 80; i++) {
    const st = await page.evaluate(() => {
      if (document.getElementById('focusBack')) return 'done';
      const w = document.getElementById('cW');
      const s = document.getElementById('cShow');
      if (w) { w.click(); return 'graded'; }
      if (s) { s.click(); return 'shown'; }
      return 'stuck';
    });
    if (st === 'done' || st === 'stuck') break;
    await page.waitForTimeout(160);
  }
  await page.waitForTimeout(700);
  const done1 = await page.evaluate(() => ({ hasBack: !!document.getElementById('focusBack'), focus: document.body.classList.contains('focus') }));
  log(done1.focus, '1.10 做完闪卡仍留在专注态（成绩单要看得见）', 'focus=' + done1.focus);

  if (done1.hasBack) {
    await page.evaluate(() => document.getElementById('focusBack').click());
    await page.waitForTimeout(600);
    const back = await page.evaluate(() => ({
      focus: document.body.classList.contains('focus'),
      runnerText: (document.getElementById('runner').innerText || '').trim(),
      boardH: Math.round(document.getElementById('board').getBoundingClientRect().height),
    }));
    log(!back.focus && back.boardH > 10 && back.runnerText === '',
      '1.11 点「返回今日看板」能干净退出（成绩区清空，看板回来）',
      'focus=' + back.focus + ' 看板=' + back.boardH + 'px runner文本长度=' + back.runnerText.length);
  } else {
    log(false, '1.11 完成后有「返回今日看板」按钮', '按钮不存在');
  }

  console.log('\n===== 需求 2：每日学习记录查询 =====\n');

  /* 底部 tab 的 data-v 属性才是切页入口（.tabbar button），
     页面没有 go() 这个函数 —— 之前猜错了两次。 */
  await page.evaluate(() => { document.querySelector('.tabbar button[data-v="me"]').click(); });
  await page.waitForTimeout(700);

  const dp = await page.evaluate(() => {
    const box = document.getElementById('dayPick');
    return {
      exists: !!box,
      btns: box ? box.querySelectorAll('button').length : 0,
      texts: box ? Array.from(box.querySelectorAll('button')).map(b => b.textContent.trim()) : [],
      todayMarked: box ? !!box.querySelector('button.today') : false,
    };
  });
  log(dp.exists && dp.btns >= 5, '2.1 每天一个按钮（5 天历史全在）', dp.btns + ' 个：' + dp.texts.join(' | '));
  log(dp.todayMarked, '2.2 今天那格标了「今天」',
    dp.texts.filter(t => t.indexOf('今天') >= 0).join(',') || '无');

  /* 默认应该就停在「今天」，且今天要有真实条目 ——
     用户问的第一个问题永远是「我今天学了哪些词」，这条必须过。 */
  const detail = await page.evaluate(() => {
    const box = document.getElementById('dayDetail');
    return {
      text: (box.innerText || '').trim(),
      rows: box.querySelectorAll('.lrow').length,
      words: Array.from(box.querySelectorAll('.lrow .thai')).map(e => e.textContent.trim()),
      active: (document.querySelector('#dayPick button.on') || {}).textContent || '',
    };
  });
  log(/今天/.test(detail.active), '2.3 默认停在「今天」那格', '选中「' + detail.active.trim() + '」');
  log(detail.rows > 0, '2.4 今天实际学了哪些词能列出来（用户最常问的）',
    detail.rows + ' 条：' + detail.words.join(' / '));

  /* 点一个真有数据的天 */
  const pick = await page.evaluate(() => {
    const bs = Array.from(document.querySelectorAll('#dayPick button'));
    const target = bs.find(b => /^D5\b/.test(b.textContent.trim()));
    if (!target) return null;
    target.click();
    return target.textContent.trim();
  });
  await page.waitForTimeout(500);
  const d5 = await page.evaluate(() => {
    const box = document.getElementById('dayDetail');
    return {
      text: (box.innerText || '').trim(),
      rows: box.querySelectorAll('.lrow').length,
      words: Array.from(box.querySelectorAll('.lrow .thai')).map(e => e.textContent.trim()),
      kpis: box.querySelectorAll('.kpi').length,
      lvLabels: Array.from(box.querySelectorAll('.lv')).map(e => e.textContent.trim()),
    };
  });
  log(!!pick, '2.5 能切到指定的一天', '点到「' + pick + '」');
  log(d5.rows > 0, '2.6 那天的条目逐条列出', d5.rows + ' 条：' + d5.words.join(' / '));
  log(d5.kpis >= 6, '2.7 当天统计（Day/日期/条目/答题/用时/总分）齐了', d5.kpis + ' 个 KPI');
  log(d5.lvLabels.length === d5.rows && d5.lvLabels.some(t => t.indexOf('新学') >= 0),
    '2.8 每条都有状态标签，且区分得出「新学 / 复习」', d5.lvLabels.join(' | '));

  /* 关键：Day5 计划里有 w|ข้าว、w|ยิ้ม，且 lg=[7,0]/[7,1] → 应归为「新学」，
     而 w|ทำงาน 的 lg 是 [5,1] → 应归为「复习」 */
  const kinds = await page.evaluate(() => {
    const out = [];
    document.querySelectorAll('#dayDetail .lrow').forEach(r => {
      out.push({ t: r.querySelector('.thai').textContent.trim(), lv: r.querySelector('.lv').textContent.trim() });
    });
    return out;
  });
  const newK = kinds.filter(k => k.lv.indexOf('新学') >= 0).map(k => k.t);
  const revK = kinds.filter(k => k.lv.indexOf('复习') >= 0).map(k => k.t);
  log(newK.length > 0 && revK.length > 0, '2.9 能区分当天「新学」与「复习」（靠 items.lg 判别）',
    '新学: ' + newK.join(',') + '　复习: ' + revK.join(','));

  /* 空态 */
  const emptyOk = await page.evaluate(() => {
    const bs = Array.from(document.querySelectorAll('#dayPick button'));
    const t = bs.find(b => /^D1\b/.test(b.textContent.trim()));
    if (!t) return { ok: false, why: '没有 D1 按钮' };
    t.click();
    return { ok: true };
  });
  await page.waitForTimeout(400);
  if (emptyOk.ok) {
    const d1 = await page.evaluate(() => ({
      rows: document.querySelectorAll('#dayDetail .lrow').length,
      text: (document.getElementById('dayDetail').innerText || '').trim(),
    }));
    log(d1.rows > 0, '2.11 Day1 也能正常列出当天条目（不是空态）', d1.rows + ' 条');
    log(/有用时|总分/.test(d1.text) || d1.rows > 0, '2.12 空/有数据都不报错', d1.text.replace(/\s+/g, ' ').slice(0, 50));
  }

  console.log('\n===== 需求 3：预计学习时长 =====\n');

  const eta = await page.evaluate(() => {
    const box = document.getElementById('etaBox');
    const e = etaCalc();
    return {
      exists: !!box,
      text: (box.innerText || '').trim(),
      kpis: box.querySelectorAll('.kpi').length,
      cards: box.querySelectorAll('.card').length,
      rate: e.rate, rateSrc: e.rateSrc, total: e.total,
      tiers: e.tiers.map(t => ({ n: t.n, left: t.left, days: +t.days.toFixed(1) })),
    };
  });
  log(eta.exists, '3.1 预计时长区块已渲染', eta.text.replace(/\s+/g, ' ').slice(0, 50));
  log(eta.kpis >= 4, '3.2 有 KPI：每天投入/当前速度/已拿下/总量', eta.kpis + ' 个');
  log(eta.total === 2252 + 359, '3.3 学习池总量取到真实值（POOL_W + POOL_G）',
    'total=' + eta.total + '（词库页那 2187 是另一批数据，不能拿来当 ETA 端点）');
  log(/实测/.test(eta.rateSrc), '3.4 速度口径说明了来源（实测样本优先）', eta.rateSrc);
  log(eta.tiers.length === 3, '3.5 三档目标（最低/实用/全量）都在',
    eta.tiers.map(t => t.n + ' 剩' + t.left + '条').join('　|　'));
  log(eta.tiers.every(t => t.days >= 0), '3.6 剩余天数都能算出来（无 NaN/Infinity）',
    eta.tiers.map(t => t.n + ' ' + t.days + '天').join('　|　'));
  log(/按当前|线性估算|复习欠账|时长口径/.test(eta.text), '3.7 给了可解释的算法说明，不是只丢一个数字',
    eta.text.replace(/\s+/g, ' ').slice(-70));

  /* 3.8 三档必须严格递增 —— 这是截图暴露过的真 bug：
       原来「全量」用 POOL_ALL_LEN()=2187，「实用」用 POOL_W+POOL_G=2611，
       而 2187 < 2611，于是「全量剩 2184 条」比「实用剩 2608 条」更少，
       显示成「全量 18.2 个月 < 实用 21.7 个月」，要求更多反而更快，纯自相矛盾。 */
  const mono = await page.evaluate(() => etaCalc().tiers.map(t => ({ n: t.n, left: t.left, days: +t.days.toFixed(1) })));
  const lefts = mono.map(t => t.left);
  const daysArr = mono.map(t => t.days);
  log(lefts.every((v, i) => i === 0 || v >= lefts[i - 1]),
    '3.8 三档剩余条数单调不减（不再出现倒挂）',
    mono.map(t => t.n.split(' ')[1] + ' 剩' + t.left).join('　|　'));
  log(daysArr.every((v, i) => i === 0 || v >= daysArr[i - 1] - 0.05),
    '3.9 三档天数单调不减（要求更多，天数不可能更短）',
    mono.map(t => t.n.split(' ')[1] + ' ' + t.days + '天').join('　|　'));

  /* 3.10 每天投入时长必须落在合理区间 —— 原来按 4 条 × 8 秒 = 32 秒
     向上取整成「1′」，但用户每天实际做五件事，1 分钟明显低估。 */
  const eta2 = await page.evaluate(() => etaCalc());
  const minsInTxt = await page.evaluate(() => {
    const k = document.querySelector('#etaBox .kpi .v');
    return k ? k.textContent.trim() : '';
  });
  log(eta2.dayMin >= 3 && eta2.dayMin <= 90,
    '3.10 每天预计投入在 3~90 分钟的合理区间（不再是荒谬的 1′）',
    eta2.dayMin + ' 分钟　页面显示「' + minsInTxt + '」');
  log(/时长口径/.test(eta.text) && eta2.minSrc.length > 5,
    '3.11 时长口径说明了是实测还是折算',
    eta2.minSrc);

  console.log('\n===== 回归 =====\n');

  /* 我的页原有内容不能被破坏 */
  const meOk = await page.evaluate(() => ({
    rows: document.querySelectorAll('#rTbl tr').length,
    spark: document.querySelectorAll('#spark i').length,
    kpi: document.getElementById('rDays') ? document.getElementById('rDays').textContent : null,
  }));
  log(meOk.rows >= 5, 'R1 「我的」页原有明细表没坏', meOk.rows + ' 行');
  log(meOk.spark > 0, 'R2 得分趋势图没坏', meOk.spark + ' 根柱');
  log(meOk.kpi === '6', 'R3 已打卡天数算对（种子数据 6 天，今天也补齐了五项任务）', 'rDays=' + meOk.kpi);

  /* 今日页三个原有模块 */
  await page.evaluate(() => { document.querySelector('.tabbar button[data-v="today"]').click(); });
  await page.waitForTimeout(600);
  const todayOk = await page.evaluate(() => ({
    board: document.getElementById('board').innerHTML.length,
    report: document.getElementById('todayReport').innerHTML.length,
    tasks: document.querySelectorAll('#taskList .task').length,
    kpi: document.getElementById('kTotal') ? document.getElementById('kTotal').textContent : null,
  }));
  log(todayOk.board > 50 && todayOk.report > 50, 'R4 今日看板与「今天学了什么」没坏',
    '看板=' + todayOk.board + ' 报告=' + todayOk.report);
  log(todayOk.tasks === 5, 'R5 五个任务卡片都在', todayOk.tasks + ' 个');
  log(todayOk.kpi !== null && todayOk.kpi !== '0', 'R6 KPI 已学条目数有值', 'kTotal=' + todayOk.kpi);

  const realErrs = errs.filter(x => x.indexOf('favicon') < 0);
  log(realErrs.length === 0, 'R7 全程无 JS 错误', realErrs.length ? realErrs.slice(0, 3).join(' | ') : '0 个');

  console.log('\n通过 ' + pass + ' / ' + (pass + fail) + ' 项' + (fail ? '，失败 ' + fail : '') + '\n');
  await browser.close();
  process.exit(fail ? 1 : 0);
})();
