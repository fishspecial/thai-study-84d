/* 用户截图诊断：
 * 1) 这道题是 sent（例句题）还是 zh2th？sent 修好后应有「🔊 发音」按钮
 * 2) 四个泰文选项的基线/行高是否一致 —— 截图里肉眼看着是乱的，量一下
 */
const { chromium } = require('playwright-core');
const CHROME = 'C://Program Files\\Google\\Chrome\\Application\\chrome.exe';

async function probe(url, tag) {
  const browser = await chromium.launch({ executablePath: CHROME, args: ['--autoplay-policy=no-user-gesture-required'] });
  const ctx = await browser.newContext({ viewport: { width: 1080, height: 700 } });
  ctx.on('dialog', async d => d.accept());
  await ctx.route('**/cloud-sdk.js', r => r.fulfill({ status: 200, contentType: 'application/javascript; charset=utf-8', body: '/* x */' }));
  const page = await ctx.newPage();
  await page.goto(url, { waitUntil: 'load', timeout: 40000 });
  await page.waitForTimeout(1500);
  await page.click('[data-run="quiz"]');
  await page.waitForTimeout(900);

  /* 找到截图里那道例句题（长句选项） */
  let info = null;
  for (let i = 0; i < 16; i++) {
    const st = await page.evaluate(() => {
      if (!window.quiz || quiz.i >= quiz.qs.length) return null;
      const q = quiz.qs[quiz.i];
      const opts = Array.from(document.querySelectorAll('.opt'));
      /* 例句题的特征：选项是完整长句 */
      const longOpts = opts.filter(o => (o.textContent || '').length > 20).length;
      return {
        ty: q.ty, longOpts,
        hasPlay: !!document.getElementById('qPlay'),
        playText: (document.getElementById('qPlay') || {}).textContent || '',
        face: (document.querySelector('.a') || {}).textContent || '',
        metrics: opts.map(o => {
          const r = o.getBoundingClientRect();
          const th = o.querySelector('.thai');
          const cs = getComputedStyle(o);
          return {
            h: Math.round(r.height),
            lh: cs.lineHeight,
            txt: (o.textContent || '').trim().slice(0, 14),
            hasThSpan: !!th,
          };
        }),
      };
    });
    if (!st) break;
    if (st.ty === 'sent' && st.longOpts >= 2) { info = st; break; }
    const opt = await page.$('.opt:not([disabled])');
    if (opt) { await opt.click(); await page.waitForTimeout(1500); }
  }
  await browser.close();
  if (!info) { console.log('[' + tag + '] 没抽到例句题'); return; }
  console.log('\n===== ' + tag + ' =====');
  console.log('题型: ' + info.ty + '  长句选项数: ' + info.longOpts);
  console.log('题面: ' + info.face.trim().slice(0, 30));
  console.log('🔊 发音按钮: ' + info.hasPlay + (info.playText ? ' 文案「' + info.playText.trim() + '」' : ''));
  console.log('\n选项排版：');
  info.metrics.forEach((m, i) => console.log('  ' + (i + 1) + '. 高度=' + m.h + 'px  line-height=' + m.lh
    + '  泰文span=' + m.hasThSpan + '  「' + m.txt + '」'));
  const hs = info.metrics.map(m => m.h);
  console.log('  → 高度是否一致: ' + (new Set(hs).size === 1 ? '是' : '否，差异 ' + (Math.max(...hs) - Math.min(...hs)) + 'px'));
}

(async () => {
  await probe('http://127.0.0.1:8848/', '本地 8848');
  await probe('https://thai-84day.app.workbuddy.host/', '线上正式');
})();
