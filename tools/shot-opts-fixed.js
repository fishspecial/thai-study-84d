/* 截「修复后」整组选项的对比图，明眼确认四条泰文是否齐平。
 * 用法: node tools/shot-opts-fixed.js
 */
const { chromium } = require('playwright-core');
const CHROME = 'C:/Program Files/Google/Chrome/Application/chrome.exe';
/* 直接打本地文件，不走 8848。
   8848 跑的是 live/index.html 冻结快照（故意让用户在我改代码时不受影响），
   所以改完 index.html 立刻访问 8848 会拿到旧代码 —— 上一轮就因此
   误判「splitEmoji is not defined」。测当前改动必须用这条。 */
const LIVE = 'file:///' + require('path').resolve(__dirname, '..', 'index.html').replace(/\\/g, '/');

/* 用户截图里的四个选项，原文照抄（第 3 项带 😂，就是它把行撑歪的） */
const OPTS = [
  'ช่วงนี้ฉันขีดรอยดำบนใบลันเต็นตลอด',
  'คุณดูข้างหน้าของฉันด้านเขยะมากเลย',
  'อย่ารำคาญกันนะ 😂',
  'สั้นแค่ของเสื้อแบบนี้ ทำไมคุณไม่ให้ฉันใส่',
];

/* 走页面里已经修好的 splitEmoji()，不要在 Node 侧重写一遍正则 ——
   两份正则一旦不一致，测的就不是页面上跑的那份逻辑。 */
(async () => {
  const browser = await chromium.launch({ executablePath: CHROME });
  for (const theme of ['light', 'dark']) {
    const ctx = await browser.newContext({ viewport: { width: 420, height: 780 }, deviceScaleFactor: 2 });
    await ctx.route('**/cloud-sdk.js', r => r.fulfill({ status: 200, contentType: 'application/javascript; charset=utf-8', body: '/* x */' }));
    const page = await ctx.newPage();
    await page.goto(LIVE, { waitUntil: 'load', timeout: 40000 });
    await page.waitForTimeout(1200);
    if (theme === 'dark') {
      await page.evaluate(() => { document.documentElement.setAttribute('data-theme', 'dark'); });
      await page.waitForTimeout(300);
    }
    await page.evaluate((opts) => {
      document.getElementById('__lab__')?.remove();
      const host = document.createElement('div');
      host.id = '__lab__';
      host.style.cssText = 'position:fixed;left:0;top:0;width:390px;z-index:99999;padding:14px';
      opts.forEach(o => {
        const b = document.createElement('button');
        b.className = 'opt';
        /* 直接调页面自己的 splitEmoji()，保证测的是线上逻辑 */
        const sp = splitEmoji(o);
        b.innerHTML = '<span class="thai">' + esc(sp.t) + '</span>'
          + (sp.e ? '<span class="emo">' + esc(sp.e) + '</span>' : '');
        host.appendChild(b);
      });
      document.body.appendChild(host);
    }, OPTS);
    await page.waitForTimeout(250);
    await page.locator('#__lab__').screenshot({ path: `.vt/shots/opts-fixed-${theme}.png` });
    console.log('✓ .vt/shots/opts-fixed-' + theme + '.png');
    await ctx.close();
  }
  await browser.close();
})();
