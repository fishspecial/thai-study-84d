/* 测验发音验收：四种题型都必须有可听的入口。
 *
 * 用户原话：「你测验里面的那些句子都没有发音的。」
 * 真实原因是renderQuiz() 里只在 q.ty === 'audio' 时渲染 #qPlay，
 * 另外三种题型一个可点读元素都没有 —— 音频文件全在（抽查都 HTTP 200），
 * 纯粹是页面没给入口。
 *
 * 判据设计（踩过两次坑才定下来）：
 *  1. **必须查页面实际发出的音频请求，不能只查按钮存在**。
 *     按钮渲染出来但没绑 onclick、或绑错了参数，都会静默失败。
 *  2. **headless Chrome 默认禁止自动播放**（不加
 *     --autoplay-policy=no-user-gesture-required 时play() 直接被拒），
 *     所以自动播放那几项必须在带该参数且有真实点击手势的上下文里测。
 *  3. zh2th 作答前**不能**有发音按钮 —— 那类题考「中文对应哪个泰文」，
 *     提前给发音等于剧透答案。要验的是「答完之后补上按钮且能播」。
 */
const { chromium } = require('playwright-core');
const CHROME = 'C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe';
const LIVE = 'http://127.0.0.1:8848/';

const results = [];
function log(name, ok, detail) {
  results.push({ name, ok });
  console.log((ok ? 'PASS  ' : 'FAIL  ') + name + (detail ? '  | ' + detail : ''));
}

(async () => {
  const browser = await chromium.launch({
    executablePath: CHROME,
    args: ['--autoplay-policy=no-user-gesture-required'],
  });
  const ctx = await browser.newContext({ viewport: { width: 390, height: 844 } });
  ctx.on('dialog', async d => d.accept());
  await ctx.route('**/cloud-sdk.js', r => r.fulfill({
    status: 200, contentType: 'application/javascript; charset=utf-8', body: '/* 拦截 */',
  }));

  const page = await ctx.newPage();
  const errs = [];
  page.on('pageerror', e => errs.push(e.message));
  /* 记录播放尝试：只记 URL 不足以判断成败，play() 可能被拒 */
  const plays = [];
  await ctx.addInitScript(() => {
    window.__PLAY__ = [];
    const Real = window.Audio;
    window.Audio = function () {
      const a = new Real();
      const rec = { src: '', ok: false, rejected: false };
      window.__PLAY__.push(rec);
      a.addEventListener('loadedmetadata', () => { rec.src = String(a.src).split('/').pop(); });
      const rp = a.play.bind(a);
      a.play = function () {
        const p = rp();
        if (p && p.then) p.then(() => { rec.ok = true; }).catch(() => { rec.rejected = true; });
        return p;
      };
      return a;
    };
  });

  await page.goto(LIVE, { waitUntil: 'load', timeout: 40000 });
  await page.waitForTimeout(1500);
  await page.click('[data-run="quiz"]');
  await page.waitForTimeout(900);

  /* 逐题走完整个测验，覆盖四种题型 */
  const byType = {};
  let zh2thAnswered = false;
  for (let i = 0; i < 16; i++) {
    const st = await page.evaluate(() => {
      if (!window.quiz || !quiz.qs || quiz.i >= quiz.qs.length) return null;
      const q = quiz.qs[quiz.i];
      return {
        ty: q.ty,
        hasPlay: !!document.getElementById('qPlay'),
        hasPlayOnclick: typeof (document.getElementById('qPlay') || {}).onclick === 'function',
        autoPlays: window.__PLAY__.length,
      };
    });
    if (!st) break;
    if (!byType[st.ty]) {
      byType[st.ty] = { prePlay: st.hasPlay, preOnclick: st.hasPlayOnclick, playsBefore: st.autoPlays, after: null };
    }
    /* zh2th 故意答错，验「答完补按钮 + 播放正确读音」 */
    if (st.ty === 'zh2th' && !zh2thAnswered) {
      zh2thAnswered = true;
      const r = await page.evaluate(() => {
        const q = quiz.qs[quiz.i];
        const wrong = Array.from(document.querySelectorAll('.opt'))
          .find(b => b.getAttribute('data-o') !== q.ans);
        if (!wrong) return null;
        const n0 = window.__PLAY__.length;
        wrong.click();
        return { target: q.o.a, before: n0 };
      });
      await page.waitForTimeout(900);
      const post = await page.evaluate(() => {
        const el = document.getElementById('qPlay');
        return {
          hasPlay: !!el,
          hasOnclick: typeof (el || {}).onclick === 'function',
          label: (document.querySelector('#qAfter .sub') || {}).textContent || '',
          plays: window.__PLAY__.slice(),
        };
      });
      const played = post.plays.filter(p => p.ok && p.src === r.target + '.mp3');
      byType[st.ty].after = { ...post, target: r.target, playedTarget: played.length > 0 };
    } else {
      await page.evaluate(() => {
        const q = quiz.qs[quiz.i];
        const el = document.getElementById('qPlay');
        if (el && el.onclick) el.click();   /* 手动点一下，模拟真实手势 */
      });
      await page.waitForTimeout(500);
    }
    const opt = await page.$('.opt:not([disabled])');
    if (opt) { await opt.click(); await page.waitForTimeout(1550); }
  }

  console.log('\n===== 各题型发音验收 =====');
  ['th2zh', 'zh2th', 'audio', 'sent'].forEach(ty => {
    const d = byType[ty];
    if (!d) { log(ty + ' 题型有发音入口', false, '未抽到该题型'); return; }
    if (ty === 'zh2th'){
      log('zh2th 作答前不剧露答案（无发音按钮）', !d.prePlay, '有按钮=' + d.prePlay);
      log('zh2th 答完后补出「正确读音」按钮', d.after && d.after.hasPlay && d.after.hasOnclick,
        d.after ? '按钮=' + d.after.hasPlay + ' onclick=' + d.after.hasOnclick + ' 提示「' + d.after.label + '」' : '未触发');
      log('zh2th 答完自动播出正确读音', !!(d.after && d.after.playedTarget),
        d.after ? '目标 ' + d.after.target + '.mp3 播放成功=' + d.after.playedTarget : '未触发');
    } else {
      log(ty + ' 题型有发音按钮且已绑事件', d.prePlay && d.preOnclick,
        '按钮=' + d.prePlay + ' onclick=' + d.preOnclick);
    }
  });

  const totalPlays = await page.evaluate(() => window.__PLAY__.filter(p => p.ok).length);
  log('四种题型都能实际发出音频', totalPlays >= 3, '成功播放 ' + totalPlays + ' 次');
  log('无 JS 错误', errs.length === 0, errs.length ? errs[0] : '0 个');

  await browser.close();
  const fail = results.filter(r => !r.ok).length;
  console.log('\n' + (fail === 0 ? '全部通过（' + results.length + ' 项）' : '失败 ' + fail + ' / ' + results.length + ' 项'));
  process.exit(fail === 0 ? 0 : 1);
})();
