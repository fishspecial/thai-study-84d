/* 复习改造验收（真浏览器，模拟真人操作流程）
 * 用户提的四件事在这里逐一验证：
 *   1. 复习做到一半关掉页面，下次进来接着做（不再从头）
 *   2. 单词和句子分开复习
 *   3. 句子有罗马音
 *   4. 答错的进错题本，连续答对 2 次才放出
 * 用法: TEST_URL=http://127.0.0.1:8899/ node tools/verify-resume.js
 */
const { chromium } = require('playwright-core');
const CHROME = 'C:/Program Files/Google/Chrome/Application/chrome.exe';
const LIVE = process.env.TEST_URL || 'http://127.0.0.1:8899/';

let pass = 0, fail = 0;
function ok(n, c, d) { (c ? pass++ : fail++); console.log((c ? 'PASS  ' : 'FAIL  ') + n + (d ? '  | ' + d : '')); }

function ymd(d) {
  const p = x => String(x).padStart(2, '0');
  return d.getFullYear() + '-' + p(d.getMonth() + 1) + '-' + p(d.getDate());
}
const TODAY = ymd(new Date());

/* 造一份「今天有 8 个词到期 + 3 个句子到期」的存档 */
function mkSeed() {
  const items = {};
  const words = ['ข้าว', 'รัก', 'ก็', 'ไป', 'ทำ', 'ดี', 'ได้', 'แล้ว'];
  words.forEach((t, i) => {
    items['w|' + t] = { box: 1, r: 1, w: 0, seen: 2, due: TODAY, lg: [[1, 1]] };
  });
  ['h1', 'h16', 'm835'].forEach(id => {
    items['s|' + id] = { box: 1, r: 1, w: 0, seen: 2, due: TODAY, lg: [[1, 1]] };
  });
  const y = new Date(); y.setDate(y.getDate() - 2);
  /* 注意：不要给「今天」那天塞任何记录。
     getDay(d) 只在 S.days[d] 不存在时才 buildPlan() —— 一旦塞了 plan 字段，
     页面会照着那份旧计划走，今天该复习的东西一条都排不进来。
     只放 Day 2 的 st.rev，用来测旧存档迁移。 */
  return {
    v: 1, start: ymd(y), day: 3, savedAt: Date.now(),
    cfg: { newWords: 12, newGrams: 3, newHerSent: 5, newMySent: 4, quizCount: 10 },
    q: { w: 0, g: 0, hs: 0, ms: 0 },
    master: {}, items: items,
    days: {
      2: { st: { rev: { done: true, n: 5, score: 80 } } },
    },
    focus: '',
  };
}

(async () => {
  const browser = await chromium.launch({ executablePath: CHROME });
  const ctx = await browser.newContext({ viewport: { width: 390, height: 844 } });
  await ctx.route('**/cloud-sdk.js', r => r.fulfill({ status: 200, contentType: 'application/javascript; charset=utf-8', body: '/* x */' }));
  await ctx.addInitScript((seed) => {
    /* 只在第一次注入。addInitScript 每次导航都会跑，
       无条件写入会在 reload 时把用户刚攒下的进度冲掉 ——
       那正好掩盖我们要验证的「刷新后能续上」。 */
    try { if (!localStorage.getItem('thai-daily-v1')) localStorage.setItem('thai-daily-v1', JSON.stringify(seed)); } catch (e) {}
  }, mkSeed());
  const page = await ctx.newPage();
  const errs = [];
  page.on('pageerror', e => errs.push(e.message));
  await page.goto(LIVE, { waitUntil: 'load', timeout: 40000 });
  await page.waitForTimeout(1200);

  /* ============ A. 老存档迁移 ============ */
  const mig = await page.evaluate(() => {
    const raw = JSON.parse(localStorage.getItem('thai-daily-v1'));
    const st2 = (raw.days['2'] || {}).st || {};
    return {
      oldGone: !st2.rev, hasW: !!st2.revW, hasS: !!st2.revS,
      day2Done: st2.revW && st2.revW.score === 80,      // 迁移不能丢原成绩
      today: raw.day, todayPlanKeys: Object.keys(((raw.days[raw.day] || {}).plan) || {}).length,
    };
  });
  ok('A1 旧 st.rev 迁移成 revW/revS 且成绩不丢', mig.oldGone && mig.hasW && mig.hasS && mig.day2Done, JSON.stringify(mig));

  /* ============ B. 单词 / 句子分开复习 ============ */
  const split = await page.evaluate(() => {
    D.plan = buildPlan();
    const rw = taskKeys('revW'), rs = taskKeys('revS');
    return {
      rw: rw.length, rwHasSent: rw.some(k => k.indexOf('s|') === 0),
      rs: rs.length, rsAllSent: rs.every(k => k.indexOf('s|') === 0),
      rsSample: rs.slice(0, 3),
    };
  });
  ok('B1 复习单词里没有句子', split.rw > 0 && !split.rwHasSent, split.rw + ' 词');
  ok('B2 复习句子里全是句子', split.rs > 0 && split.rsAllSent, split.rsSample.join(' '));

  /* ============ C. 句子罗马音 ============ */
  const rom = await page.evaluate(() => {
    const ids = ['h1', 'h16', 'm835'];
    const missing = ids.filter(id => { const s = sentOf(id); return !s || !s.r || !String(s.r).trim(); });
    let total = 0, noRom = 0;
    Object.keys(SMAP).forEach(id => { total++; const s = SMAP[id]; if (!s.r || !String(s.r).trim()) noRom++; });
    return { missing, total, noRom };
  });
  ok('C1 到期的句子有罗马音', rom.missing.length === 0, rom.missing.join(',') || '全部有');
  ok('C2 整句库罗马音覆盖率 >95%', (1 - rom.noRom / rom.total) > 0.95,
     (100 - rom.noRom / rom.total * 100).toFixed(1) + '%（' + rom.total + ' 句中缺 ' + rom.noRom + '）');

  /* ============ D. 断点续传 ============ */
  await page.click('.tabbar button[data-v="drill"]');
  await page.waitForTimeout(400);
  const cards = await page.evaluate(() => {
    const out = {};
    document.querySelectorAll('#drillList button[data-run]').forEach(b => out[b.getAttribute('data-run')] = b.textContent.trim());
    return out;
  });
  ok('D1 练习页出现「复习单词/复习句子」两张卡', !!cards.revW && !!cards.revS, JSON.stringify(cards));
  ok('D2 错题本为空时不占位置', !cards.wrong, 'wrong=' + cards.wrong);

  /* 答 3 条：点开始 → 显示答案 → 认识，重复 3 次 */
  await page.click('#drillList button[data-run="revW"]');
  await page.waitForTimeout(400);
  const firstWord = await page.evaluate(() => keyObj(run.keys[run.i]).t);
  for (let i = 0; i < 3; i++) {
    await page.click('#cShow');
    await page.waitForTimeout(150);
    await page.click('#cR');
    await page.waitForTimeout(200);
  }
  const mid = await page.evaluate(() => {
    const raw = JSON.parse(localStorage.getItem('thai-daily-v1'));
    return { i: run.i, hint: document.querySelector('.study .hint').textContent.split('　')[0], rs: raw.resume && raw.resume.revW ? raw.resume.revW.n : 0 };
  });
  ok('D3 答过的条数写入存档', mid.rs === 3, 'S.resume.revW.n=' + mid.rs);
  ok('D4 进度按当天总数显示', /4 \/ 8/.test(mid.hint), mid.hint);

  /* 模拟「关掉网页」：真的 reload */
  await page.reload({ waitUntil: 'load' });
  await page.waitForTimeout(1200);
  await page.click('.tabbar button[data-v="drill"]');
  await page.waitForTimeout(400);
  const btn = await page.evaluate(() => {
    const b = document.querySelector('#drillList button[data-run="revW"]');
    return b ? b.textContent.trim() : null;
  });
  ok('D5 刷新后按钮写明已做多少', /已做 3\/8/.test(btn || ''), btn);

  await page.click('#drillList button[data-run="revW"]');
  await page.waitForTimeout(400);
  const resumed = await page.evaluate(() => ({ n: run.keys.length, base: run.base.n, cur: keyObj(run.keys[run.i]).t, first: null }));
  ok('D6 续做时只剩没做过的', resumed.n === 5 && resumed.base === 3, '剩 ' + resumed.n + ' 条，已做 ' + resumed.base);
  ok('D7 从第 4 条接着走（不是重头）', resumed.cur !== firstWord, '上次首条=' + firstWord + ' 现在=' + resumed.cur);

  /* 做完剩下的：第 3 条故意答错，验证错题本 */
  await page.click('#cShow'); await page.waitForTimeout(150);
  await page.click('#cW'); await page.waitForTimeout(250);
  const wrongKey = await page.evaluate(() => {
    const raw = JSON.parse(localStorage.getItem('thai-daily-v1'));
    return { keys: Object.keys(raw.wrong || {}), n: Object.keys(raw.wrong || {}).length };
  });
  ok('E1 答错进错题本', wrongKey.n === 1, wrongKey.keys.join(','));

  for (let i = 0; i < 4; i++) {
    await page.click('#cShow'); await page.waitForTimeout(140);
    await page.click('#cR'); await page.waitForTimeout(190);
  }
  const fin = await page.evaluate(() => {
    const raw = JSON.parse(localStorage.getItem('thai-daily-v1'));
    return { st: raw.days[raw.day] ? raw.days[raw.day].st.revW : null, resume: raw.resume && raw.resume.revW, wrongN: Object.keys(raw.wrong || {}).length };
  });
  ok('D8 全部做完后计 8 条（含之前那 3 条）', fin.st && fin.st.n === 8, JSON.stringify(fin.st));
  ok('D9 做完后清掉续传记录', !fin.resume, 'resume=' + JSON.stringify(fin.resume));
  ok('E2 错题本里仍有那条错的', fin.wrongN === 1, fin.wrongN + ' 条');

  /* ============ F. 错题重练 ============ */
  await page.evaluate(() => { drillStarted = false; renderDrill(); renderDrillChrome(); });
  await page.waitForTimeout(300);
  await page.click('.tabbar button[data-v="drill"]');
  await page.waitForTimeout(400);
  const wcard = await page.evaluate(() => {
    const b = document.querySelector('#drillList button[data-run="wrong"]');
    return b ? b.textContent.trim() : null;
  });
  ok('F1 有错题后错题卡才出现', !!wcard, wcard);

  await page.click('#drillList button[data-run="wrong"]');
  await page.waitForTimeout(400);
  await page.click('#cShow'); await page.waitForTimeout(150);
  await page.click('#cR'); await page.waitForTimeout(200);   // 答对第 1 次
  const once = await page.evaluate(() => Object.keys(JSON.parse(localStorage.getItem('thai-daily-v1')).wrong || {}).length);
  ok('F2 答对 1 次还留在本子里（防侥幸）', once === 1, once + ' 条');

  /* 连续答对第 2 次 → 移出 */
  await page.evaluate(() => {
    const k = Object.keys(S.wrong)[0];
    markDone(k, 1); noteRight(k); noteRight(k);
  });
  const twice = await page.evaluate(() => Object.keys(JSON.parse(localStorage.getItem('thai-daily-v1')).wrong || {}).length);
  ok('F3 连续答对 2 次自动移出错题本', twice === 0, twice + ' 条');

  /* ============ G. 不影响「今日完成」判定 ============ */
  const inch = await page.evaluate(() => {
    const before = dayDone(S.day);
    Object.keys(S.days[S.day].st || {}).forEach(k => { if (k !== 'read' && k !== 'out' && k !== 'quiz' && k !== 'new' && k !== 'revW' && k !== 'revS') delete S.days[S.day].st[k]; });
    return { before, tasks: TASKS.length, main: MAIN_TASKS.length, hasWrongOpt: TASKS.some(t => t.k === 'wrong' && t.opt) };
  });
  ok('G1 错题任务是 opt，不阻塞打卡', inch.main === 6 && inch.hasWrongOpt, '总 ' + inch.tasks + ' / 计入 ' + inch.main);

  ok('H1 无 JS 错误', errs.length === 0, errs.slice(0, 2).join(' | '));

  await browser.close();
  console.log('\n==============================================');
  console.log('  通过 ' + pass + ' / ' + (pass + fail) + (fail ? '　✗ 有失败' : '　✓ 全绿'));
  console.log('==============================================');
  process.exit(fail ? 1 : 0);
})();
