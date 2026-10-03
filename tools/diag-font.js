/* 验证假设：泰文上标元音撑破行盒，导致带标的行视觉上偏上。
 * 办法：换不同字体 / 加大 line-height，看错位是否消失或变化。
 * 若加 line-height 后错位消失 → 确认是行盒不足，不是布局 bug。
 */
const { chromium } = require('playwright-core');
const CHROME = 'C://Program Files\\Google\\Chrome\\Application\\chrome.exe';
const LIVE = 'http://127.0.0.1:8848/';
const OPTS = ['ช่วงนี้ฉันขีดรอยดำบนใบลันเต็นตลอด','คุณดูข้างหน้าของฉันด้านเขยะมากเลย','อย่ารำคาญกันนะ','สั้นแค่ของเสื้อแบบนี้ ทำไมคุณไม่ให้ฉันใส่'];

(async () => {
  const browser = await chromium.launch({ executablePath: CHROME });
  const ctx = await browser.newContext({ viewport: { width: 1000, height: 700 } });
  await ctx.route('**/cloud-sdk.js', r => r.fulfill({ status: 200, contentType: 'application/javascript; charset=utf-8', body: '/* x */' }));
  const page = await ctx.newPage();
  await page.goto(LIVE, { waitUntil: 'load', timeout: 40000 });
  await page.waitForTimeout(1200);

  for (const cfg of [
    { name: '现状（Leelawadee UI / lh 28.5）', css: '' },
    { name: 'lh 加大到 44', css: '.opt .thai{line-height:44px !important}' },
    { name: '换 Noto Sans Thai', css: '.opt .thai{font-family:"Noto Sans Thai","Leelawadee UI",sans-serif !important}' },
    { name: 'Tahoma（Windows 通用泰文）', css: '.opt .thai{font-family:Tahoma,Leelawadee UI,sans-serif !important}' },
    { name: 'lh 44 + padding 上下 16', css: '.opt{padding:16px 14px !important}.opt .thai{line-height:44px !important}' },
  ]) {
    await page.evaluate((c) => {
      document.getElementById('__lab__')?.remove();
      document.getElementById('__sty__')?.remove();
      if (c) { const s = document.createElement('style'); s.id = '__sty__'; s.textContent = c; document.head.appendChild(s); }
    }, cfg.css);
    const r = await page.evaluate((opts) => {
      const host = document.createElement('div');
      host.id = '__lab__';
      host.style.cssText = 'position:fixed;left:0;top:0;width:960px;z-index:99999;background:#fff;padding:16px';
      opts.forEach(t => { const b = document.createElement('button'); b.className = 'opt';
        b.innerHTML = '<span class="thai">' + t + '</span>'; host.appendChild(b); });
      document.body.appendChild(host);
      /* 用 Range 量「字形墨迹」的实际上下边界 —— 这才是肉眼看到的位置。
         getClientRects 量的是行盒，不是墨迹，所以之前一直量出 0px 差异。 */
      const marks = Array.from(host.querySelectorAll('.opt')).map(b => {
        const sp = b.querySelector('.thai');
        const br = b.getBoundingClientRect();
        /* 把 span 复制一份，用 canvas 量真实墨迹 bbox */
        const cs = getComputedStyle(sp);
        const c = document.createElement('canvas');
        const g = c.getContext('2d');
        c.width = 1200; c.height = 90;
        g.font = cs.fontWeight + ' ' + cs.fontSize + ' ' + cs.fontFamily;
        g.textBaseline = 'alphabetic';
        const m = g.measureText(sp.textContent);
        return {
          /* actualBoundingBoxAscent/Descent 是字形墨迹相对基线的上下延伸 */
          ascent: Math.round(m.actualBoundingBoxAscent),
          descent: Math.round(m.actualBoundingBoxDescent),
          fontAscent: Math.round(m.fontBoundingBoxAscent),
          fontDescent: Math.round(m.fontBoundingBoxDescent),
          btnH: Math.round(br.height),
        };
      });
      host.remove();
      return marks;
    }, OPTS);
    /* 墨迹顶部越高，越会顶出按钮上沿 */
    const tops = r.map(x => -(x.ascent));
    console.log('\n' + cfg.name);
    r.forEach((x, i) => console.log('  ' + (i + 1) + '. 墨迹上探=' + x.ascent + 'px 下探=' + x.descent
      + ' 字体框上探=' + x.fontAscent + ' 按钮高=' + x.btnH));
    console.log('  → 带标的行（2、4）墨迹上探比无标的行多 '
      + Math.round((Math.max(r[0].ascent, r[2].ascent) - Math.min(r[1].ascent, r[3].ascent))) + 'px'
      + '  ← 这个差就是视觉错位量');
  }
  await browser.close();
})();
