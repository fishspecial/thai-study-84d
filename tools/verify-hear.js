/* 听说分工验收（真浏览器）
 * 教育侧三条改动在这里验：
 *   1. 听力任务：进卡自动出声，答案翻面才给，正面没有任何泰文/罗马音
 *   2. 复习句子按说话人定方向：她的话练「读懂」，自己的话练「说出」
 *   3. 遗忘曲线最深那档可达（原来 Math.min(5,..) 把第 7 档锁死）
 * 用法: TEST_URL=http://127.0.0.1:8899/ node tools/verify-hear.js
 */
const { chromium } = require('playwright-core');
const CHROME = 'C:/Program Files/Google/Chrome/Application/chrome.exe';
const LIVE = process.env.TEST_URL || 'http://127.0.0.1:8899/';

let pass = 0, fail = 0;
function ok(n, c, d) { (c ? pass++ : fail++); console.log((c ? 'PASS  ' : 'FAIL  ') + n + (d ? '  | ' + d : '')); }
function ymd(d) { const p = x => String(x).padStart(2, '0'); return d.getFullYear() + '-' + p(d.getMonth() + 1) + '-' + p(d.getDate()); }
const TODAY = ymd(new Date());

(async () => {
  const browser = await chromium.launch({ executablePath: CHROME, args: ['--autoplay-policy=no-user-gesture-required'] });
  const ctx = await browser.newContext({ viewport: { width: 390, height: 844 } });
  await ctx.route('**/cloud-sdk.js', r => r.fulfill({ status: 200, contentType: 'application/javascript', body: '/*x*/' }));
  const items = {};
  ['ข้าว', 'รัก'].forEach(t => { items['w|' + t] = { box: 1, r: 1, w: 0, seen: 2, due: TODAY, lg: [[1, 1]] }; });
  /* 她说的 h1 + 我说的 m835 都设为到期，用来验「复习句子」的方向分工 */
  ['h1', 'm835'].forEach(id => { items['s|' + id] = { box: 1, r: 1, w: 0, seen: 2, due: TODAY, lg: [[1, 1]] }; });
  const seed = {
    v: 3, start: TODAY, day: 2, savedAt: Date.now(),
    cfg: { newWords: 12, newGrams: 3, newHerSent: 5, newMySent: 4, quizCount: 10, hearCount: 6 },
    q: { w: 0, g: 0, hs: 0, ms: 0 }, master: {}, items: items, days: {}, focus: '', resume: {}, wrong: {},
  };
  await ctx.addInitScript(s => { try { if (!localStorage.getItem('thai-daily-v1')) localStorage.setItem('thai-daily-v1', JSON.stringify(s)); } catch (e) {} }, seed);
  const page = await ctx.newPage();
  const errs = [], audio = [];
  page.on('pageerror', e => errs.push(e.message));
  page.on('request', r => { if (/\.mp3/.test(r.url())) audio.push(r.url().split('/').pop()); });

  await page.goto(LIVE, { waitUntil: 'load', timeout: 40000 });
  await page.waitForTimeout(1300);
  await page.click('.tabbar button[data-v="drill"]');
  await page.waitForTimeout(400);

  /* ============ A. 听力任务 ============ */
  const hasHear = await page.evaluate(() => {
    const b = document.querySelector('#drillList button[data-run="hear"]');
    return b ? b.textContent.trim() : null;
  });
  ok('A1 练习页出现「听力」任务', !!hasHear, hasHear);

  audio.length = 0;
  await page.click('#drillList button[data-run="hear"]');
  await page.waitForTimeout(900);
  const hearFront = await page.evaluate(() => {
    const st = document.querySelector('.study');
    return {
      hasPlayBtn: !!document.querySelector('.hearbtn'),
      /* 正面不能出现任何泰文或罗马音，否则就是阅读题不是听力题 */
      thaiVisible: st ? /[\u0E00-\u0E7F]/.test(st.textContent) : null,
      romVisible: !!st.querySelector('.rom'),
      hasThWord: !!st.querySelector('.q.th'),
    };
  });
  ok('A2 正面只有播放键', hearFront.hasPlayBtn, '');
  ok('A3 正面不露泰文（不然是阅读题）', hearFront.thaiVisible === false, '泰文=' + hearFront.thaiVisible);
  ok('A4 正面不露罗马音', !hearFront.romVisible && !hearFront.hasThWord, '');
  ok('A5 进卡自动播一遍', audio.length > 0, audio.slice(0, 2).join(','));

  /* 点大播放键能重播 */
  audio.length = 0;
  await page.click('.hearbtn');
  await page.waitForTimeout(700);
  ok('A6 点播放键能重播', audio.length > 0, audio.slice(0, 2).join(','));

  await page.click('#cShow');
  await page.waitForTimeout(300);
  const hearBack = await page.evaluate(() => {
    const st = document.querySelector('.study');
    return {
      thai: !!st.querySelector('.q.th'),
      zh: !!st.querySelector('.a'),
      rom: !!st.querySelector('.rom'),
      labels: Array.from(document.querySelectorAll('.study .btnrow .btn')).map(b => b.textContent.trim()).slice(0, 4),
    };
  });
  ok('A7 翻面才给泰文+中文', hearBack.thai && hearBack.zh, '');
  ok('A8 翻面带罗马音（听不出来时对照着看）', hearBack.rom, '');
  ok('A9 自评问「听懂了吗」不是「认识吗」', hearBack.labels.some(x => /听懂/.test(x)), hearBack.labels.join('/'));

  /* ============ B. 复习句子方向分工 ============ */
  const dir = await page.evaluate(() => {
    const out = {};
    ['h1', 'm835'].forEach(id => {
      const s = sentOf(id);
      if (!s) { out[id] = null; return; }
      run = { kind: 'revS', keys: ['s|' + id], i: 0, right: 0, half: 0, wrong: 0, show: false, t0: Date.now(), base: { n: 0 } };
      renderRun();
      const st = document.querySelector('.study');
      /* 正面第一个字块是泰文 → 练「读懂」；是中文 → 练「说出」 */
      const first = st.querySelector('.q.th, .a');
      out[id] = { who: s.who, frontIsThai: first ? first.classList.contains('q') : null };
    });
    run = null;
    return out;
  });
  ok('B1 她的话：正面是泰文（练读懂）', dir['h1'] && dir['h1'].frontIsThai === true, JSON.stringify(dir['h1']));
  ok('B2 我说的话：正面是中文（练说出）', dir['m835'] && dir['m835'].frontIsThai === false, JSON.stringify(dir['m835']));

  const labels = await page.evaluate(() => {
    const out = {};
    ['h1', 'm835'].forEach(id => {
      run = { kind: 'revS', keys: ['s|' + id], i: 0, right: 0, half: 0, wrong: 0, show: true, t0: Date.now(), base: { n: 0 } };
      renderRun();
      out[id] = Array.from(document.querySelectorAll('.study .btnrow .btn')).map(b => b.textContent.trim()).slice(1, 4).join('/');
    });
    run = null;
    return out;
  });
  ok('B3 她的话自评问「读懂了吗」', /读懂/.test(labels['h1'] || ''), labels['h1']);
  ok('B4 我的话自评问「说得得出吗」', /说得出/.test(labels['m835'] || ''), labels['m835']);

  /* ============ C. 遗忘曲线最深档可达 ============ */
  const box = await page.evaluate(() => {
    const k = 'w|ข้าว';
    S.items[k] = { box: 0, due: today(), r: 0, w: 0, h: 0, seen: 0, lg: [], peak: 0 };
    const seq = [];
    for (let i = 0; i < 9; i++) { grade(k, 1); seq.push(S.items[k].box); }
    return { seq, top: BOX.length - 1, reached: S.items[k].box, due: S.items[k].due };
  });
  ok('C1 连答对能进到最深档', box.reached === box.top, 'box=' + box.reached + ' 上限=' + box.top);
  ok('C2 只在最深档封顶，不会越界', box.seq[box.seq.length - 1] === box.top, box.seq.join('→'));

  /* ============ D. 存档迁移统一入口 ============ */
  const mig = await page.evaluate(() => {
    /* 造一份「很旧」的存档：没有 v、没有 resume/wrong、st 里还是 rev */
    const old = { start: today(), day: 2, cfg: {}, q: { w: 0, g: 0, hs: 0, ms: 0 },
      items: {}, days: { 1: { st: { rev: { done: true, n: 4, score: 75 } } } }, master: {} };
    S = old;
    migrate();
    return {
      v: S.v, hasResume: !!S.resume, hasWrong: !!S.wrong, hasCfg: !!(S.cfg && S.cfg.hearCount != null),
      day1revW: !!(S.days['1'].st.revW), day1rev: !!S.days['1'].st.rev,
      score: S.days['1'].st.revW && S.days['1'].st.revW.score,
    };
  });
  ok('D1 旧存档过一遍 migrate 就补齐', mig.hasResume && mig.hasWrong && mig.hasCfg && mig.v === 3, JSON.stringify(mig));
  ok('D2 老 st.rev 迁移后成绩不丢', mig.day1revW && !mig.day1rev && mig.score === 75, 'score=' + mig.score);

  ok('E1 无 JS 错误', errs.length === 0, errs.slice(0, 2).join(' | '));

  await browser.close();
  console.log('\n==============================================');
  console.log('  通过 ' + pass + ' / ' + (pass + fail) + (fail ? '　✗ 有失败' : '　✓ 全绿'));
  console.log('==============================================');
  process.exit(fail ? 1 : 0);
})();
