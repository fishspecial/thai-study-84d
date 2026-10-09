/* 语境义功能验收（真浏览器）
 * 用户报的问题：「例句里这个单词意思都不同，但词条里只有一个意思」。
 * 这里验的是：翻面后出现多种意思、点开能看到对应的真实例句、例句能发音、正面不剧透。
 * 用法: TEST_URL=http://127.0.0.1:8899/ node tools/verify-sense.js
 */
const { chromium } = require('playwright-core');
const CHROME = 'C:/Program Files/Google/Chrome/Application/chrome.exe';
const LIVE = process.env.TEST_URL || 'http://127.0.0.1:8899/';

let pass = 0, fail = 0;
function ok(n, c, d) { (c ? pass++ : fail++); console.log((c ? 'PASS  ' : 'FAIL  ') + n + (d ? '  | ' + d : '')); }

(async () => {
  const browser = await chromium.launch({ executablePath: CHROME, args: ['--autoplay-policy=no-user-gesture-required'] });
  const ctx = await browser.newContext({ viewport: { width: 390, height: 844 } });
  await ctx.route('**/cloud-sdk.js', r => r.fulfill({ status: 200, contentType: 'application/javascript; charset=utf-8', body: '/* x */' }));
  const page = await ctx.newPage();
  const errs = [];
  page.on('pageerror', e => errs.push(e.message));
  const audio = [];
  page.on('request', r => { if (/\.mp3/.test(r.url())) audio.push(r.url().split('/').pop()); });

  await page.goto(LIVE, { waitUntil: 'load', timeout: 40000 });
  await page.waitForTimeout(1200);
  await page.click('.tabbar button[data-v="drill"]');
  await page.waitForTimeout(300);

  /* 数据层 */
  const data = await page.evaluate(() => {
    const m = window.WSENSE || {};
    return { n: Object.keys(m).length, hasGo: !!m['ไป'], goSenses: (m['ไป'] || []).map(x => x[0]) };
  });
  ok('1.1 语境义数据已加载', data.n >= 10, '词条 ' + data.n);
  ok('1.2 ไป 有多个义项', data.goSenses.length >= 3, data.goSenses.join(' / '));
  ok('1.3 包含词典查不到的助词用法', data.goSenses.some(s => /助词/.test(s)), '');

  /* 开一张有语境义的卡 */
  const openCard = async (t) => {
    await page.evaluate((t) => {
      run = { kind: 'new', keys: ['w|' + t], i: 0, right: 0, half: 0, wrong: 0, show: false, t0: Date.now() };
      enterFocus('new'); renderRun(); renderDrillChrome();
    }, t);
    await page.waitForTimeout(350);
  };

  await openCard('ไป');
  const front = await page.evaluate(() => ({
    sense: !!document.querySelector('.sensebox'),
    chips: document.querySelectorAll('.sensechip').length,
  }));
  ok('2.1 正面不显示语境义（不剧透）', !front.sense, 'sensebox=' + front.sense);

  await page.evaluate(() => { run.show = true; renderRun(); });
  await page.waitForTimeout(350);
  const back = await page.evaluate(() => {
    const chips = Array.from(document.querySelectorAll('.sensechip'));
    return {
      sense: !!document.querySelector('.sensebox'),
      n: chips.length,
      labels: chips.map(c => c.textContent.trim()),
      hd: (document.querySelector('.sensehd') || {}).textContent || '',
    };
  });
  ok('2.2 翻面后出现语境义区', back.sense, back.hd);
  ok('2.3 义项以 chip 列出', back.n >= 3, back.labels.join(' / '));
  ok('2.4 标题写明有几种意思', /种意思/.test(back.hd), back.hd);

  /* 点开一个义项 */
  audio.length = 0;
  await page.click('.sensechip[data-si="2"]');   // 「助词，不是「去」」
  await page.waitForTimeout(400);
  const opened = await page.evaluate(() => {
    const box = document.querySelector('#senseEx');
    const exs = box ? Array.from(box.querySelectorAll('.exs')) : [];
    return {
      n: exs.length,
      on: !!document.querySelector('.sensechip.on'),
      note: (box.querySelector('.sensed') || {}).textContent || '',
      first: exs[0] ? { t: exs[0].querySelector('.ext').textContent, z: exs[0].querySelector('.exz').textContent } : null,
      bound: exs[0] ? !!exs[0].onclick : false,
    };
  });
  ok('3.1 点 chip 展开真实例句', opened.n > 0, opened.n + ' 句');
  ok('3.2 chip 有选中态', opened.on, '');
  ok('3.3 展开时带说明（讲清为什么）', opened.note.length > 5, opened.note.slice(0, 30));
  ok('3.4 例句有泰文 + 中文', !!(opened.first && opened.first.t && opened.first.z),
     opened.first ? opened.first.t + ' → ' + opened.first.z : '');
  ok('3.5 例句已绑点读事件', opened.bound, '');

  /* 点例句真的出声 */
  await page.click('#senseEx .exs');
  await page.waitForTimeout(700);
  ok('3.6 点例句能发音', audio.length > 0, audio.slice(0, 2).join(','));

  /* 再点收起 */
  await page.click('.sensechip[data-si="2"]');
  await page.waitForTimeout(250);
  const closed = await page.evaluate(() => ({
    n: document.querySelectorAll('#senseEx .exs').length,
    on: !!document.querySelector('.sensechip.on'),
  }));
  ok('3.7 再点一次收起', closed.n === 0 && !closed.on, '');

  /* 切换到另一个义项 */
  await page.click('.sensechip[data-si="0"]');
  await page.waitForTimeout(300);
  const other = await page.evaluate(() => document.querySelector('#senseEx .exs .exz').textContent);
  ok('3.8 可切换到别的义项', other.length > 0, other.slice(0, 26));

  /* 没有语境义数据的词：静默降级 */
  await openCard('กระดูก');
  await page.evaluate(() => { run.show = true; renderRun(); });
  await page.waitForTimeout(300);
  const none = await page.evaluate(() => ({
    sense: !!document.querySelector('.sensebox'),
    hasAns: !!document.querySelector('.study .a'),
  }));
  ok('4.1 没数据的词不显示空区块', !none.sense, '');
  ok('4.2 没数据时释义照常显示', none.hasAns, '');

  /* 原有例句区没被改坏 */
  await openCard('ไป');
  await page.evaluate(() => { run.show = true; renderRun(); });
  await page.waitForTimeout(300);
  const oldEx = await page.evaluate(() => {
    const box = document.querySelector('.exbox');
    return { n: box ? box.querySelectorAll('.exs').length : 0, bound: box ? !!box.querySelector('.exs').onclick : false };
  });
  ok('5.1 原例句区仍在且已绑事件', oldEx.n > 0 && oldEx.bound, oldEx.n + ' 句');

  ok('6.1 无 JS 错误', errs.length === 0, errs.slice(0, 2).join(' | '));

  await browser.close();
  console.log('\n==============================================');
  console.log('  通过 ' + pass + ' / ' + (pass + fail) + (fail ? '　✗ 有失败' : '　✓ 全绿'));
  console.log('==============================================');
  process.exit(fail ? 1 : 0);
})();
