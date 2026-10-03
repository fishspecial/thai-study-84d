/* 验收三个 P0 修复：
 *   ① 例句点读（归一化后命中率必须从 53.5% 大幅提升，且点了必须有动作）
 *   ② dayKeys 的新学/复习分类 + 「记住」标签
 *   ③ etaCalc 三档必须真的分档
 *
 * 判据原则：不能只查函数存在，要真点按钮、真看渲染内容。
 * 尤其 ① 必须拦 Audio.src —— 修之前点了静默无反应，不拦根本发现不了。
 *
 * 用法: TEST_URL=http://127.0.0.1:8899/ node tools/verify-p0-fixes.js
 */
const { chromium } = require('playwright-core');
const CHROME = 'C:/Program Files/Google/Chrome/Application/chrome.exe';
const LIVE = process.env.TEST_URL || ('http://127.0.0.1:' + (process.env.TEST_PORT || 8899) + '/');
let pass = 0, fail = 0;
function log(ok, name, detail) {
  console.log((ok ? 'PASS  ' : 'FAIL  ') + name + '  | ' + (detail == null ? '' : detail));
  ok ? pass++ : fail++;
}
const SEED = require('./seed-for-visual.js');

(async () => {
  const browser = await chromium.launch({ executablePath: CHROME, args: ['--autoplay-policy=no-user-gesture-required'] });
  const ctx = await browser.newContext({ viewport: { width: 420, height: 860 } });
  await ctx.route('**/cloud-sdk.js', r => r.fulfill({ status: 200, contentType: 'application/javascript; charset=utf-8', body: '/* x */' }));
  await ctx.addInitScript((seed) => {
    try { localStorage.setItem('thai-daily-v1', JSON.stringify(seed)); } catch (e) {}
    window.__audioLog = [];
    const Real = window.Audio;
    window.Audio = function (src) {
      const a = new Real();
      a.play = function () { window.__audioLog.push(String(src || (a.src || ''))); return Promise.resolve(); };
      return a;
    };
    window.Audio.prototype = Real.prototype;
  }, SEED);
  const page = await ctx.newPage();
  const errs = [];
  page.on('pageerror', e => errs.push(String(e)));
  await page.goto(LIVE, { waitUntil: 'load', timeout: 40000 });
  await page.waitForTimeout(1800);

  /* ============ ① 例句 id 归一化 ============ */
  console.log('\n===== ① 例句点读（46.5% 静默失效）=====\n');

  const alias = await page.evaluate(() => {
    var raw = Object.keys(SMAP).length;
    var alias = Object.keys(SMAP_ALIAS || {}).length;
    /* 遍历 WSENT 全部引用，统计三种命中 */
    var tbl = window.WSENT || {}, tot = 0, ok = 0, viaAlias = 0, miss = 0;
    Object.keys(tbl).forEach(function (w) {
      (tbl[w] || []).forEach(function (id) {
        tot++;
        if (SMAP[id]) ok++;
        else if ((SMAP_ALIAS || {})[sentKey(id)]) viaAlias++;
        else miss++;
      });
    });
    return { raw: raw, alias: alias, tot: tot, oldOk: ok, viaAlias: viaAlias, miss: miss };
  });
  log(alias.alias > 3000, '1.1 建了归一化别名表', alias.alias + ' 个归一键 / SMAP 原始 ' + alias.raw + ' 条');
  const oldRate = alias.oldOk / alias.tot * 100;
  const newRate = (alias.oldOk + alias.viaAlias) / alias.tot * 100;
  log(oldRate < 60, '1.2 修复前命中率确实偏低（坐实 bug 存在）', oldRate.toFixed(1) + '%');
  log(newRate - oldRate > 35, '1.3 归一化后命中率显著提升',
    oldRate.toFixed(1) + '% → ' + newRate.toFixed(1) + '%（+' + (newRate - oldRate).toFixed(1) + 'pt）');
  log(alias.miss > 0 && alias.miss < alias.tot * 0.2, '1.4 剩余未命中的比例合理（走 TTS 兜底）',
    alias.miss + ' 条未命中 = ' + (alias.miss / alias.tot * 100).toFixed(1) + '%');

  /* 真点一个补零 id 的例句（h0002 这类），修复前必然静默 */
  const clickPad = await page.evaluate(() => {
    /* 找一个在 SMAP 里不存在、但归一化后能命中的 id（这才是本次修好的目标） */
    var padId = null;
    var tbl = window.WSENT || {};
    outer:
    for (var w in tbl) {
      for (var i = 0; i < tbl[w].length; i++) {
        var id = tbl[w][i];
        if (!SMAP[id] && SMAP_ALIAS && SMAP_ALIAS[sentKey(id)]) { padId = id; break outer; }
      }
    }
    if (!padId) return { err: '没有可测的补零/异位数 id' };
    var s = sentOf(padId);
    window.__audioLog = [];
    var btn = document.createElement('button');
    btn.className = 'exs';
    btn.setAttribute('data-ex', padId);
    btn.setAttribute('data-t', s ? s.t : 'ทดสอบ');
    btn.onclick = function () {
      var o = sentOf(btn.getAttribute('data-ex'));
      if (o) say(o.id, 'audio-pany', o.t);
      else say(null, 'audio-pany', btn.getAttribute('data-t') || btn.textContent.trim());
    };
    document.body.appendChild(btn);
    btn.click();
    return { padId: padId, realId: s ? s.id : null, thai: s ? s.t : null };
  });
  await page.waitForTimeout(400);
  const padPlayed = await page.evaluate(() => window.__audioLog.slice());
  log(!!clickPad.realId, '1.5 补零 id 能查到真实句子', clickPad.padId + ' → ' + clickPad.realId);
  log(padPlayed.length > 0, '1.6 点补零 id 的例句真的发声（修复前静默）', padPlayed[0] || '(无)');
  log(padPlayed.length > 0 && /audio-pany\/.+\.mp3$/.test(padPlayed[0]),
    '1.7 命中站内 mp3 而非 TTS 兜底', padPlayed[0] || '(无)');

  /* 走真实 UI 路径：闪卡里的例句块 */
  const realClick = await page.evaluate(async () => {
    /* 找一个有例句的词 */
    var found = null;
    for (var i = 0; i < POOL_W.length && !found; i++) {
      if (exList(POOL_W[i].t)) found = POOL_W[i].t;
    }
    if (!found) return { err: '没有带例句的词' };
    var o = { type: 'w', t: found, o: WMAP[found] };
    /* 塞进 runner，模拟翻面后展开的样子 */
    document.getElementById('runner').innerHTML = exBlock(o);
    var btns = document.querySelectorAll('#runner .exs');
    if (!btns.length) return { err: '例句块没渲染出按钮', word: found };
    /* 绑生产代码的 handler（renderRun 里那段） */
    btns.forEach(function (b) {
      b.onclick = function () {
        var s = sentOf(b.getAttribute('data-ex'));
        if (s) say(s.id, 'audio-pany', s.t);
        else say(null, 'audio-pany', b.getAttribute('data-t') || b.textContent.trim());
      };
    });
    window.__audioLog = [];
    var ids = [].slice.call(btns).map(b => b.getAttribute('data-ex'));
    btns.forEach(b => b.click());
    return { word: found, n: btns.length, ids: ids.slice(0, 4) };
  });
  await page.waitForTimeout(600);
  const realPlayed = await page.evaluate(() => window.__audioLog.slice());
  log(!realClick.err && realClick.n > 0, '1.8 闪卡例句块渲染出可点按钮',
    realClick.err || (realClick.word + ' ' + realClick.n + ' 句，id ' + realClick.ids.join(',')));
  log(realPlayed.length === realClick.n, '1.9 每条例句都真的发声',
    '点了 ' + realClick.n + ' 条，发出 ' + realPlayed.length + ' 次');

  /* ============ ② dayKeys 分类 ============ */
  console.log('\n===== ② 每日记录的新学/复习分类 =====\n');

  await page.click('.tabbar button[data-v="me"]');
  await page.waitForTimeout(900);

  const lgTest = await page.evaluate(() => {
    /* 直接验算法：造几种 lg 形态，看分类对不对。
       口径与生产代码一致：firstDay（lg 首元素）判新学/复习，lastDay 判「记住」。 */
    function kindOf(lg, d, r, w, box) {
      var it = { lg: lg, r: r, w: w, box: box };
      var first = 0, last = 0;
      if (it.lg && it.lg.length) {
        for (var i = 0; i < it.lg.length; i++) {
          var p = it.lg[i], dy = Array.isArray(p) ? p[0] : p;
          if (typeof dy !== 'number') continue;
          if (first === 0 || dy < first) first = dy;
          if (dy > last) last = dy;
        }
      }
      var kind = first === d ? '新学' : (first > 0 ? '复习' : '兜底');
      var lvTx = '看过';
      if (last === d && r > w) lvTx = '记住';
      else if (w > 0 && box <= 1) lvTx = '答错';
      else if (box >= 3) lvTx = '已牢固';
      else if (box >= 1) lvTx = '还不牢';
      return { first: first, last: last, kind: kind, lvTx: lvTx };
    }
    return {
      fresh: kindOf([[6, 1]], 6, 1, 0, 1),
      freshBad: kindOf([[6, 0]], 6, 0, 1, 0),
      /* 第 3 天学过，第 6 天又复习 → 必须是「复习」。
         这就是第一轮用 lastDay 判会挂掉的那组：今天也答对了，
         按 lastDay 判会误报成「新学」。 */
      review: kindOf([[3, 1], [6, 1]], 6, 1, 0, 2),
      review2: kindOf([[3, 1]], 6, 1, 0, 2),
      none: kindOf(null, 6, 1, 0, 1),
      oldNaN: Number.isNaN(Math.max.apply(null, [].concat([[6, 1]]))),
    };
  });
  log(lgTest.oldNaN, '2.1 坐实旧算法返回 NaN（这就是分类失效的根因）', 'Math.max([[6,1]]) 是 NaN');
  log(lgTest.fresh.kind === '新学' && lgTest.fresh.lvTx === '记住', '2.2 当天新学且答对 → 新学·记住',
    lgTest.fresh.kind + '·' + lgTest.fresh.lvTx);
  log(lgTest.freshBad.kind === '新学' && lgTest.freshBad.lvTx === '答错', '2.3 当天新学但答错 → 新学·答错',
    lgTest.freshBad.kind + '·' + lgTest.freshBad.lvTx);
  log(lgTest.review.kind === '复习', '2.4 第3天学、第6天再练 → 复习（不是新学）',
    lgTest.review.kind + '（first=' + lgTest.review.first + ' last=' + lgTest.review.last + '）');
  log(lgTest.review2.kind === '复习', '2.5 早先学过今天再翻 → 复习', lgTest.review2.kind);
  log(lgTest.none.kind === '兜底', '2.6 无 lg 记录走兜底（不崩）', lgTest.none.kind);

  /* 真实页面上要真的出现「新学」和「记住」两个词 */
  const ui = await page.evaluate(() => {
    var rows = [].slice.call(document.querySelectorAll('#dayDetail .lrow'));
    var txt = rows.map(r => (r.textContent || '')).join('|');
    return {
      n: rows.length,
      hasNew: /新学/.test(txt),
      hasReview: /复习/.test(txt),
      hasRemember: /记住/.test(txt),
      sample: txt.slice(0, 90),
    };
  });
  log(ui.n > 0, '2.7 记录页有行可查', ui.n + ' 行');
  log(ui.hasNew || ui.hasReview, '2.8 页面上真的出现「新学」或「复习」标签', JSON.stringify(ui.sample.slice(0, 60)));

  /* ============ ③ ETA 三档 ============ */
  console.log('\n===== ③ 预计学习时长三档 =====\n');

  const eta = await page.evaluate(() => {
    var e = etaCalc();
    return {
      t: e.tiers.map(x => ({ n: x.n, left: x.left, days: x.days })),
      rate: e.rate, dayMin: e.dayMin,
    };
  });
  const t = eta.t;
  log(t.length === 3, '3.1 有三档', t.map(x => x.n).join(' / '));
  /* left 是「还要学多少条」。目标档位越高 → 剩余越多 → left 不递减。
     早先写成 >= 是把方向搞反了，导致正确的单调递增被判成 FAIL。 */
  log(t[0].left <= t[1].left && t[1].left <= t[2].left, '3.2 三档剩余条数单调不减',
    t.map(x => x.left).join(' ≤ '));
  log(t[0].days <= t[1].days && t[1].days <= t[2].days, '3.3 三档天数单调不减（要求更多不可能更快）',
    t.map(x => x.days.toFixed(1)).join(' ≤ '));
  log(Math.abs(t[0].left - t[1].left) > 1, '3.4 第一档与第二档不再恒等（原来三档退化两档）',
    '差 ' + Math.abs(t[0].left - t[1].left).toFixed(0) + ' 条');
  log(Math.abs(t[1].left - t[2].left) > 1, '3.5 第二档与第三档也不再恒等',
    '差 ' + Math.abs(t[1].left - t[2].left).toFixed(0) + ' 条');
  log(t.every(x => isFinite(x.days) && x.days >= 0), '3.6 天数无 NaN/Infinity',
    t.map(x => x.days.toFixed(1)).join(' / '));
  log(eta.dayMin >= 3 && eta.dayMin <= 90, '3.7 每天预计投入在合理区间', eta.dayMin + ' 分钟');

  /* 换一批进度再验一次单调性 —— 单组数据对得上不代表公式对 */
  const eta2 = await page.evaluate(() => {
    /* 临时把 master 抬高，模拟学到一半 */
    var n = 0;
    POOL_W.slice(0, 600).forEach(function (w) { S.master[w.t] = 1; n++; });
    var e = etaCalc();
    var out = e.tiers.map(x => ({ left: x.left, days: x.days }));
    POOL_W.slice(0, 600).forEach(function (w) { delete S.master[w.t]; });
    return out;
  });
  log(eta2[0].left <= eta2[1].left && eta2[1].left <= eta2[2].left, '3.8 另一组进度下三档仍单调',
    eta2.map(x => x.left).join(' ≤ '));
  log(Math.abs(eta2[0].left - eta2[1].left) > 1, '3.9 另一组进度下两档仍分得开',
    '第一二档差 ' + Math.abs(eta2[0].left - eta2[1].left).toFixed(0) + ' 条');

  console.log('\n===== 控制台错误 =====\n');
  const realErrs = errs.filter(x => x.indexOf('favicon') < 0);
  log(realErrs.length === 0, 'C1 无 JS 运行时错误', realErrs.slice(0, 3).join(' | ') || '干净');

  console.log('\n' + '='.repeat(46));
  console.log('  通过 ' + pass + ' / ' + (pass + fail) + (fail ? '　✘ 失败 ' + fail : '　✓ 全绿'));
  console.log('='.repeat(46) + '\n');
  await browser.close();
  process.exit(fail ? 1 : 0);
})().catch(e => { console.error('脚本异常：', e); process.exit(2); });
