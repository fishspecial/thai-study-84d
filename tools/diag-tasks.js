/* TASKS 提升顺序 bug 的影响面评估。
 *
 * 事实：var TASKS 在第 1207 行，而第 1128 行 var D = getDay(S.day)
 *      → buildPlan() → quotaForDay() → doneDays() → dayDone() → TASKS.length
 *      此时 TASKS 还是 undefined。
 *
 * 关键问题：这会不会打到真实用户？取决于 doneDays() 会不会被调用 ——
 * Object.keys(S.days) 只有非空时 filter 才会执行 dayDone。
 * 所以「本地存在历史天数记录」的用户才会中招。
 *
 * 这里跑三个真实场景：
 *   1) 全新用户（无 localStorage）—— 预期不报错
 *   2) 学过一天的用户（days={1:...}）—— 预期报错（这就是 bug）
 *   3) 报错后页面还能不能正常渲染今日看板 —— 决定影响严重程度
 */
const { chromium } = require('playwright-core');
const CHROME = 'C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe';
const LIVE = 'http://127.0.0.1:8848/';

(async () => {
  const browser = await chromium.launch({ executablePath: CHROME });

  for (const [label, seed] of [
    ['1) 全新用户（无历史）', null],
    ['2) 学过一天（days={1}）', { start: '2026-10-02', day: 2, items: {}, master: {}, q: { w: 5, g: 0, hs: 0, ms: 0 }, cfg: {}, days: { 1: { plan: { newW: [], dueW: [], newG: [], dueG: [], read: [], out: [], wEnd: 0, gEnd: 0, why: '' }, st: { new: { done: true, n: 12, score: 88 }, rev: { done: true, n: 3, score: 100 }, read: { done: true, n: 5, score: 80 }, out: { done: true, n: 4, score: 75 }, quiz: { done: true, n: 10, score: 90 } } } } }],
  ]) {
    const ctx = await browser.newContext({ viewport: { width: 390, height: 844 } });
    ctx.on('dialog', async d => d.accept());
    if (seed) await ctx.addInitScript(s => { try { localStorage.setItem('thai-daily-v1', JSON.stringify(s)); } catch (e) {} }, seed);
    /* 不需要云端，把 SDK 拦掉让它走仅本地路径 */
    await ctx.route('**/cloud-sdk.js', r => r.fulfill({ status: 200, contentType: 'application/javascript; charset=utf-8', body: '/* 拦截 */' }));

    const page = await ctx.newPage();
    const errs = [];
    page.on('pageerror', e => errs.push(e.message));
    await page.goto(LIVE, { waitUntil: 'load', timeout: 40000 });
    await page.waitForTimeout(1800);
    const r = await page.evaluate(() => ({
      tasks: typeof TASKS !== 'undefined' && TASKS ? TASKS.length : 'undefined',
      board: (document.getElementById('board') || {}).textContent.replace(/\s+/g, ' ').trim().slice(0, 80) || '(空)',
      cards: document.querySelectorAll('#board .card, #todayList .w').length,
    }));
    console.log('\n' + label);
    console.log('  JS 错误: ' + (errs.length ? errs.length + ' 个 → ' + errs[0] : '无'));
    console.log('  TASKS 可见: ' + r.tasks);
    console.log('  今日看板: ' + r.board);
    await ctx.close();
  }
  await browser.close();
})();
