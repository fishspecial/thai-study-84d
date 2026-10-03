/* 验证 zh2th 答完后是否补上发音按钮。
 * 诊断脚本报的「#qPlay 按钮: false」对 zh2th 是符合设计的 ——
 * 那类题考「中文对应哪个泰文」，作答前给发音等于剧透答案。
 * 但答完之后必须补上，否则选错的人不知道该记住哪个读音。
 * 这个脚本专门验「作答前无按钮 → 答完后有按钮且能播」。
 */
const { chromium } = require('playwright-core');
const CHROME = 'C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe';
const LIVE = 'http://127.0.0.1:8848/';

(async () => {
  const browser = await chromium.launch({ executablePath: CHROME });
  const ctx = await browser.newContext({ viewport: { width: 390, height: 844 } });
  ctx.on('dialog', async d => d.accept());
  await ctx.route('**/cloud-sdk.js', r => r.fulfill({
    status: 200, contentType: 'application/javascript; charset=utf-8', body: '/* 拦截 */',
  }));
  const page = await ctx.newPage();
  const audioReqs = [];
  page.on('response', r => { if (/\.mp3/.test(r.url())) audioReqs.push(r.url().split('/').pop()); });
  page.on('pageerror', e => console.log('  [错误] ' + e.message));

  await page.goto(LIVE, { waitUntil: 'load', timeout: 40000 });
  await page.waitForTimeout(1500);
  await page.click('[data-run="quiz"]');
  await page.waitForTimeout(900);

  /* 一直走到抽中 zh2th 为止 */
  let found = false;
  for (let i = 0; i < 14 && !found; i++) {
    const ty = await page.evaluate(() => (window.quiz && quiz.qs[quiz.i]) ? quiz.qs[quiz.i].ty : null);
    if (ty === 'zh2th') {
      found = true;
      const before = await page.evaluate(() => ({
        playBtn: !!document.getElementById('qPlay'),
        afterHtml: (document.getElementById('qAfter') || {}).innerHTML || '',
        autoPlayed: window.__AUTO_PLAYED__ || 0,
      }));
      console.log('\n=== zh2th 作答前 ===');
      console.log('  #qPlay 按钮: ' + before.playBtn + '（应为 false，不能剧透答案）');
      console.log('  #qAfter 内容: ' + JSON.stringify(before.afterHtml));

      /* 故意选一个错的，看补按钮和自动播放是否都发生 */
      const clicked = await page.evaluate(() => {
        const q = quiz.qs[quiz.i];
        const wrong = Array.from(document.querySelectorAll('.opt'))
          .find(b => b.getAttribute('data-o') !== q.ans);
        if (wrong) { wrong.click(); return wrong.getAttribute('data-o'); }
        return null;
      });
      console.log('\n=== 点击错误选项后（选项: ' + clicked + '）===');
      await page.waitForTimeout(600);
      const after = await page.evaluate(() => ({
        playBtn: !!document.getElementById('qPlay'),
        btnText: (document.getElementById('qPlay') || {}).textContent || '',
        hasOnclick: typeof (document.getElementById('qPlay') || {}).onclick === 'function',
        afterHtml: (document.getElementById('qAfter') || {}).innerHTML || '',
        label: (document.querySelector('#qAfter .sub') || {}).textContent || '',
      }));
      console.log('  #qPlay 按钮: ' + after.playBtn + '（应为 true）');
      console.log('  按钮文案: ' + JSON.stringify(after.btnText));
      console.log('  onclick 已绑: ' + after.hasOnclick);
      console.log('  提示文字: ' + JSON.stringify(after.label));
      console.log('  #qAfter 区域: ' + JSON.stringify(after.afterHtml.replace(/\s+/g, ' ')));

      await page.waitForTimeout(400);
      break;
    }
    const opt = await page.$('.opt');
    if (opt) { await opt.click(); await page.waitForTimeout(1600); }
  }

  if (!found) console.log('\n没抽到 zh2th 题型');
  console.log('\n=== 全程音频请求 ===');
  console.log('  ' + (audioReqs.join(', ') || '无'));

  await browser.close();
})();
