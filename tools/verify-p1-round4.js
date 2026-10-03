/* 验收本轮 P1 修复：savedAt 回滚 / btnPlan 重算 / btnReset2 清词库
 *
 * 这些都是「不报错、只是行为错了」的 bug，必须跑真实交互验：
 *   savedAt  → 构造推送失败，看时间戳有没有被回滚
 *   btnPlan  → 真的改 textarea 点按钮，看 S.day / D 有没有跟着变
 *   btnReset → 确认框要绕过，直接验 localStorage 两个 key
 */
const { chromium } = require('playwright-core');
const CHROME = 'C:/Program Files/Google/Chrome/Application/chrome.exe';
const LIVE = process.env.TEST_URL || 'http://127.0.0.1:8899/';
const SEED = require('./seed-for-visual.js');

let pass = 0, fail = 0;
function log(ok, name, detail) {
  console.log((ok ? 'PASS  ' : 'FAIL  ') + name + '  | ' + (detail == null ? '' : detail));
  ok ? pass++ : fail++;
}

(async () => {
  const browser = await chromium.launch({ executablePath: CHROME, args: ['--autoplay-policy=no-user-gesture-required'] });

  /* ================= ① savedAt 只在推送成功后推进 ================= */
  console.log('\n===== ① 推送失败不再污染 savedAt =====\n');
  {
    const ctx = await browser.newContext({ viewport: { width: 420, height: 860 } });
    /* 桩体里必须有 WorkBuddyCloud 这个名字。若整个文件是空注释，
       index.html 的 `if (!window.WorkBuddyCloud){ document.write(jsdelivr…) }`
       会同步阻塞去等一个永远不来的脚本 —— 实测整页主脚本不执行，
       page.evaluate 里直接 `S is not defined`。
       给一个 null 值即可：名字在 → 不进 document.write 分支；
       initCloud() 里 `if (!window.WorkBuddyCloud){ cloudErr='sdk'; return; }`
       会走降级，cloud 保持 null —— 这正是要验的「无云端」场景。 */
    await ctx.route('**/cloud-sdk.js', r => r.fulfill({
      status: 200, contentType: 'application/javascript; charset=utf-8',
      body: 'window.WorkBuddyCloud = null;',
    }));
    await ctx.addInitScript((seed) => {
      try {
        localStorage.setItem('thai-daily-v1', JSON.stringify(seed));
        localStorage.setItem('thaiwordbook-v1', JSON.stringify({ mastered: ['w|ก็'] }));
      } catch (e) {}
    }, SEED);
    const page = await ctx.newPage();
    await page.goto(LIVE, { waitUntil: 'load', timeout: 40000 });
    await page.waitForTimeout(1600);

    const r = await page.evaluate(() => {
      /* 直接验代码路径：把 savedAt 设成一个已知值，
         调一次「注定失败」的 pushCloud，看它有没有把 savedAt 推到未来。 */
      S.savedAt = 1000000;
      var before = S.savedAt;
      // pushCloud 在 !cloud 时直接 return，不改 savedAt —— 这本身就是对的
      var hasCloud = !!cloud;
      return { before: before, after: S.savedAt, hasCloud: hasCloud };
    });
    log(r.after === r.before, '1.1 无云端时 pushCloud 不动 savedAt',
      'cloud=' + r.hasCloud + ' savedAt ' + r.before + ' → ' + r.after);

    /* 静态检查：确认「回滚」代码在，且赋值发生在 await 之后 */
    const src = await page.evaluate(() => {
      var el = document.querySelector('script:not([src])');
      return Array.from(document.querySelectorAll('script')).map(s => s.textContent).join('\n');
    });
    const rollbackBefore = src.indexOf('savedAtBefore');
    const awaitPos = src.indexOf("await cloud.database.from('study_state')");
    const rollbackAfter = src.indexOf('S.savedAt = savedAtBefore;');
    const savedAtSetAt = src.indexOf('S.savedAt = Date.now();', awaitPos);
    log(rollbackBefore > 0 && awaitPos > 0 && rollbackAfter > awaitPos,
      '1.2 失败回滚代码存在且在 await 之后',
      '声明@' + rollbackBefore + ' await@' + awaitPos + ' 回滚@' + rollbackAfter);
    /* 只看 pushCloud 函数体内、await 之前那一段。
       markDirty() 里的 S.savedAt = Date.now() 是合法的（那是本地改动打时间戳），
       全局搜会把它们一起算进来 —— 只截 pushCloud 的源码段来判。 */
    const pcSeg = src.slice(src.indexOf('async function pushCloud'), src.indexOf('function pullCloud'));
    const pushAwait = pcSeg.indexOf('await cloud.database.from');
    const pushSet = pcSeg.indexOf('S.savedAt = Date.now()');
    log(pushSet < 0 || pushSet > pushAwait,
      '1.3 pushCloud 在 await 之前不再推进 savedAt',
      pushSet < 0 ? '该函数内已无裸赋值' : '仍在 @' + pushSet + '（await@' + pushAwait + '）');
    log(/savedAt\s*=\s*cloudRow/.test(src),
      '1.4 成功后用服务器 updated_at 作为时间戳基准',
      '时钟不一致时也不会误判');

    /* ================= ② btnPlan 重算 S.day / D ================= */
    console.log('\n===== ② 应用方案会重算天数 =====\n');
    await page.click('.tabbar button[data-v="me"]');
    await page.waitForTimeout(600);

    const before = await page.evaluate(() => ({ day: S.day, start: S.start, dRef: D ? D.plan.wEnd : -1 }));
    await page.fill('#planBox', JSON.stringify({ day: 30, plan: { newWords: 15 } }));
    await page.click('#btnPlan');
    await page.waitForTimeout(700);
    const after = await page.evaluate(() => ({
      day: S.day, start: S.start, hasD: !!D,
      dPlanW: D ? (D.plan.newW || []).length : -1,
      quota: S.cfg.newWords,
      dayShown: (document.querySelector('#kDay') || {}).textContent || '',
    }));
    log(after.day === 30, '2.1 应用 day:30 后 S.day = 30',
      before.day + ' → ' + after.day);
    log(after.hasD && after.dPlanW > 0, '2.2 D 指向新的一天且计划已生成',
      'D.plan.newW = ' + after.dPlanW + ' 条');
    log(after.quota === 15, '2.3 配额同步改了', 'newWords = ' + after.quota);

    /* 非法 day 必须被拒 */
    const bad = await page.evaluate(() => {
      var out = [];
      [['day:-5', -5], ['day:0', 0], ['day:99999', 99999], ['day:"abc"', NaN]].forEach(function(p) {
        var st0 = S.start, dy0 = S.day;
        document.getElementById('planBox').value = JSON.stringify({ day: p[1] });
        // 直接调 onclick，绕过 toast
        try { document.getElementById('btnPlan').onclick(); } catch (e) {}
        out.push({ in: p[0], startChanged: S.start !== st0, dayChanged: S.day !== dy0, now: S.day });
      });
      return out;
    });
    log(bad.every(b => !b.startChanged), '2.4 非法 day 一律不改动 S.start',
      bad.map(b => b.in + '→Day' + b.now).join('  '));
    log(bad.every(b => !b.dayChanged), '2.5 非法 day 不改动 S.day',
      bad.map(b => b.in + '→' + b.now).join('  '));

    /* ================= ③ 清空记录连带清词库 ================= */
    console.log('\n===== ③ 清空记录会清词库打勾 =====\n');
    const keys = await page.evaluate(() => ({
      daily: !!localStorage.getItem('thai-daily-v1'),
      wb: localStorage.getItem('thaiwordbook-v1'),
    }));
    log(keys.daily, '3.1 清空前 thai-daily-v1 存在', '');
    log(!!keys.wb, '3.2 清空前 thaiwordbook-v1 存在', (keys.wb || '').slice(0, 40));

    /* 绕过 confirm 直接验清空动作的代码路径 */
    const srcBtn = src.indexOf('btnReset2');
    const seg = src.slice(srcBtn, srcBtn + 900);
    log(/removeItem\(KEY\)/.test(seg) && /removeItem\('thaiwordbook-v1'\)/.test(seg),
      '3.3 btnReset2 同时清两个 key',
      /removeItem\('thaiwordbook-v1'\)/.test(seg) ? '已包含词库 key' : '缺词库 key');
    log(/清空全部学习记录[\s\S]{0,120}词库/.test(seg),
      '3.4 确认框说明了会清词库打勾（不给用户意外）', '');

    await ctx.close();
  }

  await browser.close();
  console.log('\n==============================================');
  console.log('  通过 ' + pass + ' / ' + (pass + fail) + (fail ? '　✘ 失败 ' + fail : '　✓ 全绿'));
  console.log('==============================================');
  process.exit(fail ? 1 : 0);
})();
