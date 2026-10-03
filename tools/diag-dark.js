/* 深色模式为什么 matches=true 但 body 还是白底 */
const { chromium } = require('playwright-core');
const CHROME = 'C:/Program Files/Google/Chrome/Application/chrome.exe';
const LIVE = process.env.TEST_URL || 'http://127.0.0.1:8899/';

(async () => {
  const browser = await chromium.launch({ executablePath: CHROME });
  const ctx = await browser.newContext({ viewport: { width: 390, height: 844 }, colorScheme: 'dark' });
  const page = await ctx.newPage();
  await page.goto(LIVE, { waitUntil: 'load' });
  await page.waitForTimeout(1500);
  const r = await page.evaluate(() => {
    var out = {};
    out.matches = matchMedia('(prefers-color-scheme: dark)').matches;
    out.bodyBg = getComputedStyle(document.body).backgroundColor;
    out.rootBg = getComputedStyle(document.documentElement).getPropertyValue('--bg').trim();
    // 逐个 media rule 看是否被解析
    var rules = [];
    for (var i = 0; i < document.styleSheets.length; i++) {
      var ss = document.styleSheets[i];
      try {
        var cr = ss.cssRules;
        for (var j = 0; j < cr.length; j++) {
          if (cr[j].type === 4 /* media */) {
            rules.push({ cond: cr[j].conditionText || cr[j].media.mediaText, n: cr[j].cssRules.length });
          }
        }
      } catch (e) { out.err = e.message; }
    }
    out.mediaRules = rules;
    return out;
  });
  console.log(JSON.stringify(r, null, 2));
  await browser.close();
})();
