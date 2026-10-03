/* 量泰文选项的视觉基线是否对齐。
 * 截图里第2、4 段明显比第 1、3 段靠上。怀疑是泰文上标元音（้ป็ ่）
 * 撑高了行盒，而 line-height 太紧导致基线被顶偏。
 * 量法：给每个 .opt 塞一个零宽的基准 span，用它的 top 当基线参照。
 */
const { chromium } = require('playwright-core');
const CHROME = 'C://Program Files\\Google\\Chrome\\Application\\chrome.exe';
const LIVE = 'http://127.0.0.1:8848/';

(async () => {
  const browser = await chromium.launch({ executablePath: CHROME, args: ['--autoplay-policy=no-user-gesture-required'] });
  const ctx = await browser.newContext({ viewport: { width: 1080, height: 700 } });
  ctx.on('dialog', async d => d.accept());
  await ctx.route('**/cloud-sdk.js', r => r.fulfill({ status: 200, contentType: 'application/javascript; charset=utf-8', body: '/* x */' }));
  const page = await ctx.newPage();
  await page.goto(LIVE, { waitUntil: 'load', timeout: 40000 });
  await page.waitForTimeout(1500);
  await page.click('[data-run="quiz"]');
  await page.waitForTimeout(900);

  /* 构造一个受控用例：三条无上标元音、两条有上标元音 */
  const test = await page.evaluate(() => {
    const mk = (t) => { const b = document.createElement('button'); b.className = 'opt';
      b.innerHTML = '<span class="thai">' + t + '</span>'; return b; };
    const box = document.createElement('div');
    box.style.cssText = 'position:fixed;left:-9999px;top:0;width:900px';
    const rows = [
      ['无上标  คุณอยู่ในรถรอฉ', 'base1'],
      ['有上标้ ช่วงนี้ฉันขีดรอยดำ', 'up1'],
      ['无上标  ผมชอบคุณตอนนี้', 'base2'],
      ['有上标่ สั้นแค่ของเสื้อ', 'up2'],
      ['无上标  คนจีนหลายคนเก็บ', 'base3'],
    ];
    rows.forEach(r => { const b = mk(r[0]); b.id = r[1]; box.appendChild(b); });
    document.body.appendChild(box);
    const out = rows.map(r => {
      const b = document.getElementById(r[1]);
      const sp = b.querySelector('.thai');
      const br = b.getBoundingClientRect(), sr = sp.getBoundingClientRect();
      const cs = getComputedStyle(sp);
      /* 关键：span 内的文字实际从哪个 y 开始画 */
      const range = document.createRange();
      range.selectNodeContents(sp);
      const rr = range.getBoundingClientRect();
      return {
        id: r[1],
        th: sp.textContent,
        spanH: Math.round(sr.height),
        textTop: Math.round(rr.top - br.top),
        textH: Math.round(rr.height),
        fontSize: cs.fontSize, lineHeight: cs.lineHeight, fontFamily: cs.fontFamily.split(',')[0],
      };
    });
    box.remove();
    return out;
  });

  console.log('===== 泰文基线测量 =====');
  test.forEach(t => console.log('  ' + t.id.padEnd(6) + ' 文字距顶=' + String(t.textTop).padStart(3)
    + 'px  文字高=' + String(t.textH).padStart(3) + 'px  span高=' + String(t.spanH).padStart(3)
    + '  font=' + t.fontSize + '/' + t.lineHeight + '  ' + t.fontFamily + '  「' + t.th + '」'));
  const tops = test.map(t => t.textTop);
  console.log('\n  文字起始 y 的差异: ' + (Math.max(...tops) - Math.min(...tops)) + 'px'
    + '  → ' + (new Set(tops).size === 1 ? '对齐' : '不对齐（这就是截图里看着歪的原因）'));
  const hs = test.map(t => t.spanH);
  console.log('  span 高度差异: ' + (Math.max(...hs) - Math.min(...hs)) + 'px'
    + (new Set(hs).size === 1 ? '  （高度一致但基线仍可能偏 → 说明是上标溢出行盒）' : ''));

  await browser.close();
})();
