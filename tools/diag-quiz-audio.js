/* 诊断：测验四种题型的发音覆盖情况
 *
 * 用户反馈：「你测验里面的那些句子都没有发音的。」
 * 已知 renderQuiz() 里只在 q.ty === 'audio' 时渲染 #qPlay 按钮，
 * 另外三种题型（th2zh / zh2th / sent）没有任何发音入口。
 *
 * 但要区分两件事：
 *   1) 页面上有没有播放入口（UI 缺失）
 *   2) 音频文件在不在（资源缺失）
 * 这个脚本把两者都查清楚，顺便抽查例句题（sent）用的 h/m 音频是否真的存在。
 */
const { chromium } = require('playwright-core');
const CHROME = 'C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe';
const LIVE = 'http://127.0.0.1:8848/';

(async () => {
  const browser = await chromium.launch({ executablePath: CHROME });
  const ctx = await browser.newContext({ viewport: { width: 390, height: 844 } });
  ctx.on('dialog', async d => d.accept());
  /* 屏蔽云端，专注看测验本身 */
  await ctx.route('**/cloud-sdk.js', r => r.fulfill({
    status: 200, contentType: 'application/javascript; charset=utf-8', body: '/* 拦截 */',
  }));
  const page = await ctx.newPage();
  const audioReqs = [];
  /* 记录所有对音频的请求及结果 */
  page.on('response', async r => {
    if (/\.mp3/.test(r.url())) audioReqs.push(r.status() + ' ' + r.url().split('/').pop());
  });
  page.on('pageerror', e => console.log('  [错误] ' + e.message));

  await page.goto(LIVE, { waitUntil: 'load', timeout: 40000 });
  await page.waitForTimeout(1500);

  /* 进入测验 */
  await page.click('[data-run="quiz"]');
  await page.waitForTimeout(900);

  const seen = {};
  for (let i = 0; i < 12; i++) {
    const info = await page.evaluate(() => {
      const R = document.getElementById('runner');
      if (!R || !window.quiz) return null;
      const q = quiz.qs[quiz.i];
      if (!q) return null;
      const qEl = R.querySelector('.q');
      const aEl = R.querySelector('.a');
      return {
        ty: q.ty,
        hasPlayBtn: !!document.getElementById('qPlay'),
        hasSpeakBtn: !!document.getElementById('cPlay'),
        /* 页面上有没有任何可点读的元素 */
        anyClickable: R.querySelectorAll('[data-a],[data-ex],#qPlay,#cPlay').length,
        face: (qEl ? qEl.textContent : (aEl ? aEl.textContent : '')).trim().slice(0, 30),
        audioRef: q.ty === 'sent' ? (q.sent ? q.sent.id : null) : (q.o ? q.o.a : null),
        dir: q.ty === 'sent' ? 'audio-pany' : (q.o ? (q.o.d || 'audio-pany') : null),
      };
    });
    if (!info) break;
    if (!seen[info.ty]) seen[info.ty] = { ...info, count: 0 };
    seen[info.ty].count++;
    seen[info.ty].sampleFace = info.face;
    seen[info.ty].sampleRef = info.audioRef;
    seen[info.ty].sampleDir = info.dir;
    /* 点第一个选项进入下一题 */
    const opt = await page.$('.opt');
    if (opt) { await opt.click(); await page.waitForTimeout(1700); }
    else break;
  }

  console.log('\n===== 各题型发音入口 =====');
  Object.keys(seen).forEach(ty => {
    const s = seen[ty];
    console.log('\n题型: ' + ty + '（抽到 ' + s.count + ' 次）');
    console.log('  题面: ' + s.sampleFace);
    console.log('  #qPlay 按钮: ' + s.hasPlayBtn);
    console.log('  任何可点读元素: ' + s.anyClickable);
    console.log('  音频引用: ' + s.sampleDir + '/' + s.sampleRef + '.mp3');
  });

  /* 抽查音频文件是否真的能下载 —— UI 有按钮但文件 404 等于还是没发音 */
  console.log('\n===== 音频文件实际可达性抽查 =====');
  const refs = [];
  Object.keys(seen).forEach(ty => {
    const s = seen[ty];
    if (s.sampleRef) refs.push({ ty, dir: s.sampleDir, ref: s.sampleRef });
  });
  for (const r of refs) {
    const url = LIVE.replace(/\/$/, '') + '/' + r.dir + '/' + r.ref + '.mp3';
    const resp = await page.request.get(url);
    console.log('  ' + r.ty.padEnd(8) + r.ref + '.mp3 → HTTP ' + resp.status()
      + '  ' + (resp.status() === 200 ? '可播' : '缺失'));
  }

  console.log('\n===== 页面实际发出的音频请求 =====');
  console.log(audioReqs.length ? audioReqs.join('\n') : '  一次都没请求过（说明确实没有发音入口）');

  await browser.close();
})();
