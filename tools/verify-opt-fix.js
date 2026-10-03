/* 验证选项排版修复效果：直接复现用户截图那一题，逐像素量前后差异。
 * 用法: node tools/verify-opt-fix.js
 * 需要先起本地服务 (8848)。
 */
const { chromium } = require('playwright-core');
const fs = require('fs');
const { PNG } = require('pngjs');
const CHROME = 'C:/Program Files/Google/Chrome/Application/chrome.exe';
/* 指向工作副本而非 8848：8848 跑的是 live/index.html 冻结快照，
   改完 index.html 立刻访问会拿到旧代码（上一轮因此误判 splitEmoji 未定义）。 */
const LIVE = process.env.TEST_URL || ('http://127.0.0.1:' + (process.env.TEST_PORT || 8899) + '/');

/* 用户截图里的四个选项，原文照抄 */
const OPTS = [
  'ช่วงนี้ฉันขีดรอยดำบนใบลันเต็นตลอด',
  'คุณดูข้างหน้าของฉันด้านเขยะมากเลย',
  'อย่ารำคาญกันนะ 😂',
  'สั้นแค่ของเสื้อแบบนี้ ทำไมคุณไม่ให้ฉันใส่',
];

function scanInk(png, x0, x1) {
  const rows = [];
  for (let y = 0; y < png.height; y++) {
    let n = 0, minX = 1e9, maxX = -1;
    for (let x = x0; x < x1; x++) {
      const i = (y * png.width + x) * 4;
      if (png.data[i] < 170 || png.data[i + 1] < 170 || png.data[i + 2] < 170) {
        n++; if (x < minX) minX = x; if (x > maxX) maxX = x;
      }
    }
    if (n >= 2) rows.push({ y, n, minX, maxX });
  }
  return rows;
}

/* 只看泰文那一段的水平范围。
   早先固定扫 x∈[30,520]，结果 emoji（flex 靠右）自己的墨迹也被算进来 ——
   于是「第3项比第2项高 1.5px」被判成 ❌ 仍在撑行，那是判据自己的错：
   emoji 已经不参与泰文的行盒（.thai 高度四项全是 28.5px，完全一致）。
   必须按 .thai 元素的实际 x 范围扫，量到的才是「泰文的墨迹」。 */
function measureBox(box, dpr, label) {
  const png = PNG.sync.read(box.png);
  /* box.thaiX0 / thaiX1 由调用方从 .thai 的 getBoundingClientRect 换算（相对按钮） */
  const x0 = Math.round((box.thaiX0 == null ? 30 : box.thaiX0) * dpr) + 2;
  const x1 = Math.round((box.thaiX1 == null ? 520 : box.thaiX1) * dpr) - 2;
  const rows = scanInk(png, x0, Math.max(x0 + 4, x1));
  if (!rows.length) return null;
  const t = rows[0].y / dpr, b = rows[rows.length - 1].y / dpr;
  return { inkTop: +t.toFixed(1), inkBot: +b.toFixed(1), inkH: +(b - t).toFixed(1), centerOffset: +(((t + b) / 2) - box.height / 2).toFixed(1) };
}

(async () => {
  const browser = await chromium.launch({ executablePath: CHROME });
  const ctx = await browser.newContext({ viewport: { width: 420, height: 760 }, deviceScaleFactor: 2 });
  await ctx.route('**/cloud-sdk.js', r => r.fulfill({ status: 200, contentType: 'application/javascript; charset=utf-8', body: '/* x */' }));
  const page = await ctx.newPage();
  const errs = [];
  page.on('pageerror', e => errs.push(String(e)));
  await page.goto(LIVE, { waitUntil: 'load', timeout: 40000 });
  await page.waitForTimeout(1500);

  /* 注入原句，直接量 DOM 里的选项 */
  const boxes = await page.evaluate((opts) => {
    document.getElementById('__lab__')?.remove();
    const host = document.createElement('div');
    host.id = '__lab__';
    host.style.cssText = 'position:fixed;left:0;top:0;width:390px;z-index:99999;background:#fff;padding:14px';
    const EMO = /[←-㍿\uD83C-\uDBFF\uDC00-\uDFFF️]/g;
    opts.forEach(o => {
      const b = document.createElement('button');
      b.className = 'opt';
      const isTh = /[฀-๿]/.test(o);
      if (isTh) {
        const m = o.match(EMO);
        const t = o.replace(EMO, '').replace(/\s+$/, '');
        b.innerHTML = '<span class="thai">' + t + '</span>' + (m ? '<span class="emo">' + m.join('') + '</span>' : '');
      } else b.textContent = o;
      host.appendChild(b);
    });
    document.body.appendChild(host);
    return Array.from(host.querySelectorAll('.opt')).map(b => {
      const r = b.getBoundingClientRect();
      const th = b.querySelector('.thai');
      const em = b.querySelector('.emo');
      return {
        x: r.x, y: r.y, width: r.width, height: r.height,
        hasEmo: !!em,
        thaiH: th ? +th.getBoundingClientRect().height.toFixed(1) : null,
        /* .thai 相对按钮的 x 范围，扫描时只取这一段（排除 emoji） */
        thaiX0: th ? +(th.getBoundingClientRect().x - r.x).toFixed(1) : null,
        thaiX1: th ? +(th.getBoundingClientRect().right - r.x).toFixed(1) : null,
        emoH: em ? +em.getBoundingClientRect().height.toFixed(1) : null,
        emoFS: em ? getComputedStyle(em).fontSize : null,
      };
    });
  }, OPTS);

  const results = [];
  for (let k = 0; k < boxes.length; k++) {
    const r = boxes[k];
    const shot = await page.screenshot({ clip: { x: r.x, y: r.y, width: r.width, height: r.height } });
    fs.writeFileSync(`tools/shots/fixed-${k + 1}.png`, shot);
    results.push({ ...r, png: shot });
  }

  console.log('=== 修复后：四选项的泰文墨迹位置（逐像素，DPR2 折回 CSS px）===\n');
  const offs = [], hs = [];
  results.forEach((r, i) => {
    const m = measureBox(r, 2, i);
    if (!m) { console.log('  ' + (i + 1) + '. 无墨迹'); return; }
    if (i >= 2) { offs.push(m.centerOffset); hs.push(m.inkH); }
    console.log('  ' + (i + 1) + '. 按钮高=' + String(r.height).padStart(5)
      + ' | 墨迹顶=' + String(m.inkTop).padStart(5)
      + ' 墨迹底=' + String(m.inkBot).padStart(5)
      + ' 墨迹高=' + String(m.inkH).padStart(5)
      + ' | 中心偏移=' + String(m.centerOffset).padStart(6)
      + (r.hasEmo ? '  [含emoji 独立块 高' + r.emoH + ' ' + r.emoFS + ']' : ''));
  });

  const spread = Math.max(...offs) - Math.min(...offs);
  console.log('\n→ 中心偏移极差 = ' + spread.toFixed(1) + 'px   '
    + (spread <= 3 ? '✅ 已改善（修复前 4.5px）' : '⚠️ 与修复前相当'));

  /* 关键判据：带 emoji 的第 3 项，泰文墨迹高度不该再被顶高
     （扫的是 .thai 的 x 范围，emoji 已排除在外） */
  console.log('\n=== 关键：emoji 是否还撑行 ===');
  const emo = results[2], noEmo = results[1];
  const mEmo = measureBox(emo, 2), mNo = measureBox(noEmo, 2);
  console.log('  第2项（无emoji）泰文墨迹高 = ' + mNo.inkH + 'px');
  console.log('  第3项（带emoji） 泰文墨迹高 = ' + mEmo.inkH + 'px');
  const d = Math.abs(mEmo.inkH - mNo.inkH);
  console.log('  差 = ' + d.toFixed(1) + 'px   ' + (d <= 1 ? '✅ emoji 已不再撑高泰文行' : '❌ 仍在撑'));

  /* 结构检查 */
  console.log('\n=== DOM 结构 ===');
  console.log('  .thai 高度: ' + results.map(r => r.thaiH).join(', '));
  console.log('  emoji 独立块: ' + results.map(r => r.hasEmo ? '有(' + r.emoH + 'px)' : '—').join(', '));

  const realErrs = errs.filter(x => x.indexOf('favicon') < 0);
  console.log('\n  页面 JS 错误: ' + (realErrs.length ? realErrs.join(' | ') : '无 ✅'));

  await browser.close();
  process.exit(realErrs.length ? 1 : 0);
})();
