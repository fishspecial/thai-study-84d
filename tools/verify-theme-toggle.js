const { chromium } = require('playwright-core');
const fs = require('fs'); const path = require('path');
const CHROME = 'C:/Program Files/Google/Chrome/Application/chrome.exe';
const OUT = process.env.SHOT_DIR || path.join(__dirname, 'shots-theme');
fs.mkdirSync(OUT, { recursive: true });
let pass = 0, fail = 0;
const log = (ok, n, d) => { console.log((ok ? 'PASS  ' : 'FAIL  ') + n + (d ? '  | ' + d : '')); ok ? pass++ : fail++; };
(async () => {
  const b = await chromium.launch({ executablePath: CHROME, headless: true });
  const ctx = await b.newContext({ viewport: { width: 400, height: 860 }, colorScheme: 'light' });
  const p = await ctx.newPage();
  await p.goto('http://127.0.0.1:8899/', { waitUntil: 'load' });
  await p.waitForTimeout(1200);

  // 初始：auto + 系统 light → 不应有 data-theme
  log(await p.evaluate(() => !document.documentElement.hasAttribute('data-theme')), '初始 auto 不写 data-theme');

  await p.screenshot({ path: path.join(OUT, '1-light-today.png') });

  // 切到「我的」
  await p.click('.tabbar button[data-v="me"]');
  await p.waitForTimeout(400);
  await p.screenshot({ path: path.join(OUT, '2-light-me.png') });

  // 点「深色」
  await p.click('[data-theme-opt="dark"]');
  await p.waitForTimeout(300);
  const t1 = await p.evaluate(() => document.documentElement.getAttribute('data-theme'));
  log(t1 === 'dark', '点击深色 → data-theme=dark', 'got ' + t1);
  const stored = await p.evaluate(() => localStorage.getItem('theme'));
  log(stored === 'dark', '选择已写入 localStorage', 'got ' + stored);
  const bgDark = await p.evaluate(() => getComputedStyle(document.body).backgroundColor);
  log(/rgb\(17, 19, 24\)/.test(bgDark), '深色下 body 是深底', bgDark);
  await p.screenshot({ path: path.join(OUT, '3-dark-me.png') });

  // 回「今日」看深色主界面
  await p.click('.tabbar button[data-v="today"]');
  await p.waitForTimeout(400);
  await p.screenshot({ path: path.join(OUT, '4-dark-today.png') });

  // 刷新后深色应保持（且不闪：首帧脚本）
  await p.reload({ waitUntil: 'load' });
  await p.waitForTimeout(1000);
  const t2 = await p.evaluate(() => document.documentElement.getAttribute('data-theme'));
  log(t2 === 'dark', '刷新后仍是深色（早绑定生效）', 'got ' + t2);

  // 切回 auto
  await p.click('.tabbar button[data-v="me"]');
  await p.waitForTimeout(300);
  await p.click('[data-theme-opt="auto"]');
  await p.waitForTimeout(300);
  const t3 = await p.evaluate(() => document.documentElement.hasAttribute('data-theme'));
  log(!t3, '切回跟随系统 → 移除 data-theme');
  const st3 = await p.evaluate(() => localStorage.getItem('theme'));
  log(st3 === 'auto', 'auto 已持久化', 'got ' + st3);

  // 手动浅色能压过系统深色（模拟系统 dark）
  await p.emulateMedia({ colorScheme: 'dark' });
  await p.click('[data-theme-opt="light"]');
  await p.waitForTimeout(300);
  const bgLight = await p.evaluate(() => getComputedStyle(document.body).backgroundColor);
  const attr = await p.evaluate(() => document.documentElement.getAttribute('data-theme'));
  log(attr === 'light' && /rgb\(242, 241, 237\)/.test(bgLight), '系统深色时手动选浅色仍生效', attr + ' ' + bgLight);

  await b.close();
  console.log('---'); console.log('通过 ' + pass + ' / ' + (pass + fail) + (fail ? '  ✗ 有失败' : '  ✓ 全绿'));
  process.exit(fail ? 1 : 0);
})().catch(e => { console.error('ERR', e.message); process.exit(1); });
