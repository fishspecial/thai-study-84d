/* 验证「统一基线」的候选方案 —— 用真实像素判断，不用 canvas 推理。
 *
 * 背景：用户截图里四个泰文选项一高一低。已排除 CSS 布局（DOM 行盒差 0px）、
 * line-height（加到 44px 差值恒为 3px）、字体（Noto Sans Thai / Tahoma 都不变）。
 * 根因是泰文字形本身：有上标元音/声调的词墨迹更高，无上标的矮一截。
 *
 * 所以判据必须是「截图像素里每行墨迹的上下边界」—— 这就是用户眼睛看到的东西。
 * 之前用 canvas measureText 只是间接推断，这次直接扫像素。
 *
 * 方案 A：.opt .thai 改 inline-block + vertical-align:middle
 * 方案 B：每行末尾注入零宽基线锚点（用有上标的 ป + 有下标的 ญ 撑开墨迹范围）
 * 方案 C：.opt flex + align-items:center
 * 方案 D：A + B 组合
 */
const { chromium } = require('playwright-core');
const fs = require('fs');
const { PNG } = require('pngjs');
const CHROME = 'C:/Program Files/Google/Chrome/Application/chrome.exe';
const LIVE = 'http://127.0.0.1:8848/';

const OPTS = [
  'ช่วงนี้ฉันขีดรอยดำบนใบลันเต็นตลอด',
  'คุณดูข้างหน้าของฉันด้านเขยะมากเลย',
  'อย่ารำคาญกันนะ',
  'สั้นแค่ของเสื้อแบบนี้ ทำไมคุณไม่ให้ฉันใส่',
];

/* 扫一段像素，返回每个水平行「有多少个非背景像素」，据此定出每行墨迹的上下边界。
   只在按钮左侧 1/3 区域扫 —— 那里只有泰文，不会被后面的元素干扰。 */
function scanRows(buf, w, x0, x1, y0, y1) {
  const rows = [];
  for (let y = y0; y < y1; y++) {
    let n = 0;
    for (let x = x0; x < x1; x++) {
      const i = (y * w + x) * 4;
      /* 背景是白(255)或近白；墨色文字像素明显偏暗。阈值 200 能把抗锯齿边缘算进来。 */
      if (buf[i] < 200 || buf[i + 1] < 200 || buf[i + 2] < 200) n++;
    }
    rows.push({ y, n });
  }
  return rows;
}

(async () => {
  const browser = await chromium.launch({ executablePath: CHROME });
  const ctx = await browser.newContext({ viewport: { width: 1000, height: 700 }, deviceScaleFactor: 2 });
  await ctx.route('**/cloud-sdk.js', r => r.fulfill({ status: 200, contentType: 'application/javascript; charset=utf-8', body: '/* x */' }));
  const page = await ctx.newPage();
  await page.goto(LIVE, { waitUntil: 'load', timeout: 40000 });
  await page.waitForTimeout(1200);

  const results = [];

  for (const cfg of [
    { name: '现状（不加任何处理）', css: '', inject: '' },
    { name: 'A: .thai inline-block + vertical-align:middle', css: '.opt .thai{display:inline-block;vertical-align:middle}', inject: '' },
    { name: 'B: 注入零宽锚点（撑开上下墨迹范围）', css: '', inject: '<span style="visibility:hidden">ิปญ</span>' },
    { name: 'C: .opt flex + align-items:center', css: '.opt{display:flex;align-items:center;min-height:56px}', inject: '' },
    { name: 'D: A + B 组合', css: '.opt .thai{display:inline-block;vertical-align:middle}', inject: '<span style="visibility:hidden">ิปญ</span>' },
  ]) {
    /* 搭实验台：四个按钮，注入指定 CSS 和锚点 */
    const box = await page.evaluate((a) => {
      document.getElementById('__lab__')?.remove();
      document.getElementById('__sty__')?.remove();
      if (a.css) { const s = document.createElement('style'); s.id = '__sty__'; s.textContent = a.css; document.head.appendChild(s); }
      const host = document.createElement('div');
      host.id = '__lab__';
      host.style.cssText = 'position:fixed;left:0;top:0;width:960px;z-index:99999;background:#fff;padding:16px';
      a.opts.forEach(t => {
        const b = document.createElement('button');
        b.className = 'opt';
        b.innerHTML = '<span class="thai">' + t + a.inject + '</span>';
        host.appendChild(b);
      });
      document.body.appendChild(host);
      const r = host.getBoundingClientRect();
      return { x: r.x, y: r.y, width: r.width, height: r.height };
    }, { opts: OPTS, inject: cfg.inject, css: cfg.css });

    await page.waitForTimeout(120);

    /* 逐按钮单独截图 —— 不能靠「总高/4」猜分段：
       host 有 padding、按钮之间有 gap，猜出来的段会整体错位，
       实测四行的墨迹中心算出来是 48/43/33/20，明显在往下滑，
       根本不对应各自的按钮。直接问 DOM 要每个按钮的 rect 最稳。 */
    const tops = [], bots = [], centers = [], btnHs = [];
    for (let k = 0; k < 4; k++) {
      const r = await page.evaluate((idx) => {
        const b = document.querySelectorAll('#__lab__ .opt')[idx];
        const q = b.getBoundingClientRect();
        return { x: q.x, y: q.y, width: q.width, height: q.height };
      }, k);
      const shot = await page.screenshot({ clip: r });
      fs.writeFileSync(`tools/shots/lab-${cfg.name.slice(0, 1)}-${k + 1}.png`, shot);
      const png = PNG.sync.read(shot);
      const dpr = 2;
      /* 只扫按钮左侧 1/2：那里只有泰文，避开可能的角标/序号 */
      const x0 = Math.round(30 * dpr);
      const x1 = Math.round(Math.min(r.width - 8, 520) * dpr);
      const rows = scanRows(png.data, png.width, x0, x1, 0, png.height)
        .filter(x => x.n >= 2);
      /* 去掉按钮上下边框：边框是横贯整行的，取「不横贯整行」的连续段。
         简单可靠的办法 —— 边框那两行的暗像素数会接近整个扫描宽度。 */
      const full = Math.round((x1 - x0) * 0.85);
      const ink = rows.filter(x => x.n < full);
      if (!ink.length) { tops.push(null); bots.push(null); centers.push(null); btnHs.push(r.height); continue; }
      const t = ink[0].y / dpr;
      const b = ink[ink.length - 1].y / dpr;
      tops.push(t); bots.push(b);
      centers.push((t + b) / 2);
      btnHs.push(r.height);
    }
    const cv = centers.filter(v => v != null);
    /* 关键：每个按钮高度都一样，所以「墨迹中心 - 按钮中心」的极差，
       就是用户看到的一高一低程度。直接比中心没用（按钮位置本来就不同）。 */
    const offs = centers.map((c, i) => (c == null ? null : c - btnHs[i] / 2));
    const ov = offs.filter(v => v != null);
    const spread = ov.length ? (Math.max(...ov) - Math.min(...ov)) : 999;
    results.push({ name: cfg.name, tops, bots, centers, offs, spread });
  }

  console.log('\n=== 各方案：墨迹中心相对「按钮几何中心」的偏移（px）===');
  console.log('    这个偏移越一致，四行泰文看上去越在同一条水平线上\n');
  for (const r of results) {
    console.log(r.name);
    r.offs.forEach((o, i) => {
      console.log('  ' + (i + 1) + '. 墨迹顶=' + String(r.tops[i] == null ? '-' : r.tops[i].toFixed(1)).padStart(5)
        + '  墨迹底=' + String(r.bots[i] == null ? '-' : r.bots[i].toFixed(1)).padStart(5)
        + '  中心偏移=' + String(o == null ? '-' : o.toFixed(1)).padStart(6));
    });
    console.log('  → 偏移极差 = ' + r.spread.toFixed(1) + 'px   '
      + (r.spread <= 1.5 ? '✅ 齐平' : (r.spread <= 3 ? '⚠️ 改善但仍有差' : '❌ 无效')) + '\n');
  }

  const best = results.slice().sort((a, b) => a.spread - b.spread)[0];
  console.log('最优方案：' + best.name + '（极差 ' + best.spread.toFixed(1) + 'px）');

  await browser.close();
})();
