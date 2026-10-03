/* 用用户截图里的四个真实选项原样复现。
 * 上一次受控用例差异 0px，说明不是「上标元音撑高行盒」。
 * 这次怀疑是**长句换行**：截图里第1、4 句较长、第 2、3 句较短，
 * 如果 .opt 允许换行，不同行数会因垂直居中方式不同而看着错位。
 * 同时验证一个更可能的点：.opt 是不是 flex 容器 + align-items 导致的。
 */
const { chromium } = require('playwright-core');
const CHROME = 'C://Program Files\\Google\\Chrome\\Application\\chrome.exe';
const LIVE = 'http://127.0.0.1:8848/';
const fs = require('fs');

/* 从截图 OCR 出来的四个真实选项 */
const OPTS = [
  'ช่วงนี้ฉันขีดรอยดำบนใบลันเต็นตลอด',
  'คุณดูข้างหน้าของฉันด้านเขยะมากเลย',
  'อย่ารำคาญกันนะ',
  'สั้นแค่ของเสื้อแบบนี้ ทำไมคุณไม่ให้ฉันใส่',
];

(async () => {
  const browser = await chromium.launch({ executablePath: CHROME, args: ['--autoplay-policy=no-user-gesture-required'] });
  const ctx = await browser.newContext({ viewport: { width: 1080, height: 700 } });
  await ctx.route('**/cloud-sdk.js', r => r.fulfill({ status: 200, contentType: 'application/javascript; charset=utf-8', body: '/* x */' }));
  const page = await ctx.newPage();
  await page.goto(LIVE, { waitUntil: 'load', timeout: 40000 });
  await page.waitForTimeout(1200);

  const r = await page.evaluate((opts) => {
    const host = document.createElement('div');
    host.id = '__lab__';
    host.style.cssText = 'position:fixed;left:0;top:0;width:1000px;z-index:99999;background:#fff;padding:20px';
    opts.forEach((t, i) => {
      const b = document.createElement('button');
      b.className = 'opt';
      b.innerHTML = '<span class="thai">' + t + '</span>';
      b.dataset.i = String(i);
      host.appendChild(b);
    });
    document.body.appendChild(host);
    const out = Array.from(host.querySelectorAll('.opt')).map(b => {
      const sp = b.querySelector('.thai');
      const br = b.getBoundingClientRect(), sr = sp.getBoundingClientRect();
      const cs = getComputedStyle(b);
      const range = document.createRange(); range.selectNodeContents(sp);
      const rr = range.getBoundingClientRect();
      /* 逐行量：把 span 按行切开 */
      const lines = [];
      if (sp.getClientRects) Array.from(sp.getClientRects()).forEach(x => lines.push(Math.round(x.top - br.top)));
      return {
        i: b.dataset.i, text: b.textContent.trim(),
        btnH: Math.round(br.height), btnTop: Math.round(br.top),
        display: cs.display, alignItems: cs.alignItems, justify: cs.justifyContent,
        padding: cs.padding, lineHeight: cs.lineHeight,
        spanH: Math.round(sr.height),
        textTopInBtn: Math.round(rr.top - br.top),
        textH: Math.round(rr.height),
        lineTops: lines,
        lineCount: lines.length,
      };
    });
    return out;
  }, OPTS);

  console.log('===== 用户截图四个选项的实测 =====');
  r.forEach(o => {
    console.log('  ' + o.i + '. 按钮高=' + o.btnH + ' 行数=' + o.lineCount
      + ' 文字距顶=' + o.textTopInBtn + 'px 文字高=' + o.textH + 'px');
    console.log('     display=' + o.display + ' align-items=' + o.alignItems
      + ' line-height=' + o.lineHeight + ' padding=' + o.padding);
    console.log('     各行 top: ' + o.lineTops.join(', ') + '  「' + o.text.slice(0, 30) + '」');
  });
  console.log('\n  文字距顶差异: ' + (Math.max(...r.map(x => x.textTopInBtn)) - Math.min(...r.map(x => x.textTopInBtn))) + 'px');

  /* 截图留证 */
  await page.screenshot({ path: '.vt/shots/lab-opts.png', clip: { x: 0, y: 0, width: 1000, height: 340 } });
  await browser.close();
})();
