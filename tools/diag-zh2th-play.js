/* zh2th 答完后的自动播放到底有没有触发？
 * 上一版测试只看到 t0/t1，没看到 zh2th 目标音频。两种可能：
 *   A) setTimeout(playQ,150) 根本没执行（代码问题）
 *   B) 执行了，但 Audio.play() 被浏览器自动播放策略拒绝（环境问题）
 * 区分办法：在 say() 入口和 play() 的 catch 上打点，看走到哪一步。
 */
const { chromium } = require('playwright-core');
const CHROME = 'C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe';
const LIVE = 'http://127.0.0.1:8848/';

(async () => {
  const browser = await chromium.launch({
    executablePath: CHROME,
    /* 关键：headless 下 Chromium 的自动播放策略更严，
       不加这个参数 Audio.play() 可能直接被拒。带上它才能测出真实行为。 */
    args: ['--autoplay-policy=no-user-gesture-required'],
  });
  const ctx = await browser.newContext({ viewport: { width: 390, height: 844 } });
  ctx.on('dialog', async d => d.accept());
  await ctx.route('**/cloud-sdk.js', r => r.fulfill({
    status: 200, contentType: 'application/javascript; charset=utf-8', body: '/* 拦截 */',
  }));
  const page = await ctx.newPage();
  const audioReqs = [];
  page.on('response', r => { if (/\.mp3/.test(r.url())) audioReqs.push(r.url().split('/').pop()); });
  page.on('console', m => { if (m.type() === 'error') console.log('  [console] ' + m.text().slice(0, 80)); });
  page.on('pageerror', e => console.log('  [错误] ' + e.message));

  /* 注入打点：包住 Audio 构造和 play()，记录每次尝试 */
  await ctx.addInitScript(() => {
    window.__PLAY_LOG__ = [];
    const RealAudio = window.Audio;
    window.Audio = function (src) {
      const a = new RealAudio();
      const rec = { src: '', played: false, rejected: false };
      window.__PLAY_LOG__.push(rec);
      a.addEventListener('loadedmetadata', () => { rec.src = a.src.split('/').pop(); });
      const realPlay = a.play.bind(a);
      a.play = function () {
        const p = realPlay();
        if (p && p.then) {
          p.then(() => { rec.played = true; }).catch(err => { rec.rejected = true; rec.err = String(err.name || err); });
        }
        return p;
      };
      return a;
    };
  });

  await page.goto(LIVE, { waitUntil: 'load', timeout: 40000 });
  await page.waitForTimeout(1500);
  await page.click('[data-run="quiz"]');
  await page.waitForTimeout(900);

  for (let i = 0; i < 14; i++) {
    const ty = await page.evaluate(() => (window.quiz && quiz.qs[quiz.i]) ? quiz.qs[quiz.i].ty : null);
    if (ty === 'zh2th') {
      const target = await page.evaluate(() => {
        const q = quiz.qs[quiz.i];
        return { file: q.o.a, dir: q.o.d || 'audio-pany', text: q.o.t };
      });
      console.log('\n目标音频: ' + target.dir + '/' + target.file + '.mp3');
      await page.evaluate(() => { window.__PLAY_LOG__.length = 0; });
      /* 答错，补按钮 + 自动播 */
      await page.evaluate(() => {
        const q = quiz.qs[quiz.i];
        const wrong = Array.from(document.querySelectorAll('.opt'))
          .find(b => b.getAttribute('data-o') !== q.ans);
        if (wrong) wrong.click();
      });
      await page.waitForTimeout(1000);
      const log = await page.evaluate(() => window.__PLAY_LOG__);
      console.log('\n点击后 1 秒内的播放尝试:');
      log.forEach((r, i) => console.log('  #' + (i + 1) + ' src=' + (r.src || '(未加载)')
        + ' played=' + r.played + ' rejected=' + r.rejected + (r.err ? ' err=' + r.err : '')));
      break;
    }
    const opt = await page.$('.opt');
    if (opt) { await opt.click(); await page.waitForTimeout(1600); }
  }

  console.log('\n全程音频请求: ' + (audioReqs.join(', ') || '无'));
  await browser.close();
})();
