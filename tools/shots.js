/* 截图：浅色 + 深色 × 7 个页面，用来肉眼验收 UI 改动。
 *
 * 两个必须记住的前提（第一版都踩了）：
 * 1) 全新账号第一张卡是「到期复习·今日无」，点进去什么也没有。
 *    想截闪卡/例句区，必须先走一遍真实的新学流程产生学习数据。
 * 2) 手写 S.items 造「到期条目」是无效的：计划重算时会把 seen>0 且未掌握的
 *    条目当成「已学过的词」而排除（实测 dueList 有 14 条但 plan.dueW=0）。
 *    正确做法是点 [data-run="new"] 走真实流程，状态由 ensure()/save() 自己写。
 *
 * 用法：node tools/shots.js [输出目录]
 */
const path = require('path');
const fs = require('fs');
const { chromium } = require('playwright-core');

const CHROME = 'C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe';
const URL = 'http://127.0.0.1:8848/';
const OUT = process.argv[2] || path.resolve(__dirname, '..', '.vt', 'shots');

const PAGES = [
  { name: '1-today', go: async page => {} },

  { name: '2-today-card', go: async page => {
      /* 进闪卡、翻到释义那一面，截例句区。
         .study 只在学习态出现；按钮靠 [data-run] 定位，中文文本匹配会漏。 */
      const btn = await page.$('[data-run="new"]');
      if (btn) { await btn.click(); await page.waitForTimeout(800); }
      /* 截「翻面后」那一屏：正面只给 1 句例句，看不到折叠/展开的实际效果。
         正面已经显示时再点 .t1 会翻回去，所以先判状态。
      /* 翻到背面：正面有 #cShow（显示答案），背面换成 #cR/#cH/#cW 三个评分键。
         用稳定 id 判断，别用按钮文案 —— 文案会随 run.kind 变
         （新学说「认识/模糊/不会」，阅读说「看懂了/半懂/看不懂」）。 */
      const needFlip = await page.evaluate(() => !!document.querySelector('#cShow'));
      if (needFlip) {
        await page.click('#cShow');
        await page.waitForTimeout(700);
      }
      const info = await page.evaluate(() => {
        const el = document.querySelector('.study');
        if (!el) return '没有 .study';
        el.scrollIntoView({ block: 'start' });
        return '例句 ' + document.querySelectorAll('.study .exs').length + ' 句'
          + '，展开按钮 ' + document.querySelectorAll('.study [data-exmore]').length + ' 个'
          + '，例句标题「' + (document.querySelector('.study .exh') || {}).textContent.trim() + '」';
      });
      await page.waitForTimeout(500);
      console.log('  2-today-card: ' + info);
    } },

  { name: '3-corpus', go: async page => {
      await page.click('.tabbar button[data-v="corpus"]'); await page.waitForTimeout(650);
    } },
  { name: '4-words', go: async page => {
      await page.click('.tabbar button[data-v="words"]'); await page.waitForTimeout(650);
    } },
  { name: '5-ref', go: async page => {
      await page.click('.tabbar button[data-v="ref"]'); await page.waitForTimeout(750);
    } },
  { name: '6-ref-memo', go: async page => {
      await page.click('.tabbar button[data-v="ref"]'); await page.waitForTimeout(550);
      await page.click('#refM'); await page.waitForTimeout(750);
    } },
  { name: '7-me', go: async page => {
      await page.click('.tabbar button[data-v="me"]'); await page.waitForTimeout(750);
    } },
];

const MODES = [
  { tag: 'light', scheme: 'light' },
  { tag: 'dark', scheme: 'dark' },
];

(async () => {
  fs.mkdirSync(OUT, { recursive: true });
  const browser = await chromium.launch({ executablePath: CHROME });
  const made = [];

  for (const m of MODES) {
    const ctx = await browser.newContext({
      viewport: { width: 390, height: 844 },
      deviceScaleFactor: 2,
      colorScheme: m.scheme,
    });
    const page = await ctx.newPage();
    await page.goto(URL, { waitUntil: 'load' });
    await page.waitForTimeout(1700);

    /* 先真实学 4 张卡，让今日页 / 我的页 / 趋势图有内容可截。
       全程用稳定 id（#cShow / #cR），不用按钮文案 —— 文案随 run.kind 变。 */
    await page.click('[data-run="new"]');
    await page.waitForTimeout(800);
    let flip = 0, grade = 0;
    for (let i = 0; i < 4; i++) {
      if (await page.$('#cShow')) { await page.click('#cShow'); await page.waitForTimeout(450); flip++; }
      if (await page.$('#cR')) { await page.click('#cR'); await page.waitForTimeout(580); grade++; continue; }
      if (await page.$('#cQuit')) { await page.click('#cQuit'); break; }
      break;
    }
    console.log('  [' + m.tag + '] 新学流程：翻面 ' + flip + ' 次，评分 ' + grade + ' 次');
    await page.click('.tabbar button[data-v="today"]');
    await page.waitForTimeout(850);

    for (const pg of PAGES) {
      try { await pg.go(page); }
      catch (e) { console.log('  ' + pg.name + ' 准备失败: ' + String(e.message).split('\n')[0]); }
      const f = path.join(OUT, m.tag + '-' + pg.name + '.png');
      await page.screenshot({ path: f });
      made.push(m.tag + '-' + pg.name + '.png');
      /* 截完回到顶部，避免上一屏的滚动位置污染下一张 */
      await page.evaluate(() => window.scrollTo(0, 0));
      await page.waitForTimeout(160);
    }
    await ctx.close();
  }
  await browser.close();
  console.log('共 ' + made.length + ' 张 → ' + OUT);
})();
