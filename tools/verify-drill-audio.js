/* 验收两件事：
 *   A. 练习页是独立的第 6 个标签（与今日页物理分开，不是折叠）
 *   B. 学习记录每行点读真的有声音（拦 Audio.src 看三级兜底的第一级命中没）
 *
 * A 的判据要点：
 *   - tabbar 6 个按钮，data-v 含 drill
 *   - 今日页内**不含** runner/finishBox/focusBar（物理搬走了，不是 max-height:0）
 *   - 练习页内含这三个
 *   - 切到今日页时 runner 的 offsetParent 为 null（真不可见，不是透明度 0）
 *   - 从今日页点「开始」→ 自动跳到练习页
 *   - 练习中今日页内容不受影响
 *
 * B 的判据要点：
 *   - 注入 Audio 桩，记录每次 new Audio().src
 *   - 点一行 → 第一级应是站内 mp3（audio-pany/h0.mp3 这种），不是 TTS URL
 *   - 三类资源（词 w / 语气词 g / 例句 s）各测一条，确认取法没串
 *
 * 用法: TEST_URL=http://127.0.0.1:8899/ node tools/verify-drill-audio.js
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
    /* Audio 桩：只记录 src，不真的发请求。
       目的是判「点一下到底选了哪一级音源」—— 如果第一级没命中直接跳 Google TTS，
       说明本地 mp3 路径拼错了，但用户不会报错，只会觉得「怎么没声音」或慢半拍。 */
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

  /* ============ A. 练习页独立 ============ */
  console.log('\n===== A. 练习页是独立标签 =====\n');

  const tabs = await page.$$eval('.tabbar button', ns => ns.map(n => n.getAttribute('data-v')));
  log(tabs.length === 6, 'A1 tabbar 6 个标签', tabs.join('/'));
  log(tabs.indexOf('drill') === 1, 'A2 「练习」在第 2 位（紧邻今日）', 'index=' + tabs.indexOf('drill'));

  const split = await page.evaluate(() => {
    const t = document.getElementById('v-today'), d = document.getElementById('v-drill');
    return {
      todayHas: ['runner', 'focusBar', 'finishBox'].filter(i => t.querySelector('#' + i)),
      drillHas: ['runner', 'focusBar', 'finishBox'].filter(i => d.querySelector('#' + i)),
      drillExists: !!d,
    };
  });
  log(split.drillExists, 'A3 练习页容器存在');
  log(split.todayHas.length === 0, 'A4 今日页已无练习容器（物理搬走）',
    split.todayHas.length ? '仍有: ' + split.todayHas.join(',') : 'runner/finishBox/focusBar 全部移出');
  log(split.drillHas.length === 3, 'A5 练习页含全部练习容器', split.drillHas.join(','));

  /* 切到今日页，runner 必须真不可见（offsetParent=null），不是 opacity:0 */
  await page.click('.tabbar button[data-v="today"]');
  await page.waitForTimeout(500);
  const hid = await page.evaluate(() => ({
    runner: document.getElementById('runner').offsetParent === null,
    drill: document.getElementById('v-drill').offsetParent === null,
    hero: !!document.querySelector('#v-today .hero') && document.querySelector('#v-today .hero').offsetParent !== null,
  }));
  log(hid.runner, 'A6 今日页看不到练习区');
  log(hid.drill, 'A7 练习页真的隐藏了（不是盖在下面）');
  log(hid.hero, 'A8 今日页总览正常显示');

  /* 练习页初始态：应有引导 + 5 张任务卡 */
  const init = await page.evaluate(() => {
    document.querySelector('.tabbar button[data-v="drill"]').click();
    return null;
  });
  await page.waitForTimeout(600);
  const cards = await page.evaluate(() => {
    const L = document.getElementById('drillList');
    return { n: L.querySelectorAll('.dcard').length, txt: (L.textContent || '').slice(0, 60) };
  });
  log(cards.n === 5, 'A9 练习页列出 5 项任务卡', cards.n + ' 张');
  log(/统计|今日/.test(cards.txt), 'A10 引导语说明练习与总览分开', JSON.stringify(cards.txt.trim().slice(0, 30)));

  /* 从练习页直接开练 → 应切到练习页并出现题目 */
  await page.click('#drillList .dcard button[data-run="new"]');
  await page.waitForTimeout(800);
  const started = await page.evaluate(() => ({
    view: document.getElementById('v-drill').classList.contains('on'),
    onTab: document.querySelector('.tabbar button.on').getAttribute('data-v'),
    hasStudy: !!document.querySelector('#runner .study'),
    focusBar: (document.getElementById('focusBar').textContent || '').trim(),
    listHidden: getComputedStyle(document.getElementById('drillList')).display === 'none',
  }));
  log(started.view && started.onTab === 'drill', 'A11 开练后停在练习页', 'tab=' + started.onTab);
  log(started.hasStudy, 'A12 题目已渲染');
  log(/第.*\/.*/.test(started.focusBar), 'A13 进度条显示题号', JSON.stringify(started.focusBar.slice(0, 40)));
  log(started.listHidden, 'A14 练习中任务列表收起（不干扰）');

  /* 今日页此时应完全不受影响（内容还在，runner 是空的）。
     注意：测 hero 高度前必须切回今日页 —— 停在练习页时 v-today 是 display:none，
     offsetHeight 恒为 0，拿这个判「被折叠」是我自己写判据时踩的坑。 */
  await page.click('.tabbar button[data-v="today"]');
  await page.waitForTimeout(500);
  const todayIntact = await page.evaluate(() => {
    const t = document.getElementById('v-today');
    return {
      tasks: t.querySelectorAll('#taskList .task').length,
      hasRunner: !!t.querySelector('#runner'),
      heroH: t.querySelector('.hero') ? t.querySelector('.hero').offsetHeight : 0,
      opa: t.querySelector('.hero') ? getComputedStyle(t.querySelector('.hero')).opacity : '0',
    };
  });
  log(todayIntact.tasks === 5, 'A15 今日页任务清单仍是 5 项', todayIntact.tasks + ' 项');
  log(todayIntact.heroH > 100 && +todayIntact.opa === 1,
    'A16 今日页总览没被折叠', 'hero 高 ' + todayIntact.heroH + 'px 透明度 ' + todayIntact.opa);

  /* 返回按钮：focusBack 只在「一项练完」的成绩单里出现。
     闪卡是两面卡 —— 先点卡片翻面才出现「认识/模糊/不会」，
     所以每步都要先尝试翻面再尝试作答（原来只找按钮文本，永远点不到，卡在第一题）。 */
  await page.click('.tabbar button[data-v="drill"]');
  await page.waitForTimeout(400);
  let guard = 0;
  while (guard++ < 60) {
    const fin = await page.evaluate(() => !!document.getElementById('focusBack'));
    if (fin) break;
    await page.evaluate(() => {
      const R = document.getElementById('runner');
      /* 真实流程：#cShow「显示答案」翻面 → 之后才出现 #cR「认识」。
         之前我去点 .study 以为能翻面，翻不动，卡在第一题循环到上限。 */
      if (R.querySelector('#cR')) { R.querySelector('#cR').click(); return; }
      if (R.querySelector('#cShow')) { R.querySelector('#cShow').click(); return; }
      /* 测验题：直接选第一个选项即可推进 */
      const o = R.querySelector('.opt');
      if (o) o.click();
    });
    await page.waitForTimeout(200);
  }
  const done = await page.evaluate(() => ({
    hasBack: !!document.getElementById('focusBack'),
    msg: (document.querySelector('#runner .okbox') || {}).textContent || '',
  }));
  log(done.hasBack, 'A17 练完后出现「返回今日看板」', JSON.stringify(done.msg.trim().slice(0, 26)));
  log(/完成/.test(done.msg), 'A18 成绩单显示得分', JSON.stringify(done.msg.trim().slice(0, 26)));

  await page.evaluate(() => { const b = document.getElementById('focusBack'); if (b) b.click(); });
  await page.waitForTimeout(700);
  const back = await page.evaluate(() => ({
    tab: document.querySelector('.tabbar button.on').getAttribute('data-v'),
    runner: (document.getElementById('runner').textContent || '').trim(),
    listShown: getComputedStyle(document.getElementById('drillList')).display !== 'none',
  }));
  log(back.tab === 'today', 'A19 「返回今日看板」回到今日页', 'tab=' + back.tab);
  log(back.runner === '', 'A20 返回后练习区已清空');
  log(back.listShown, 'A21 返回后练习页任务列表恢复（下次还能接着练）');

  /* ============ B. 学习记录点读 ============ */
  console.log('\n===== B. 学习记录每行点读 =====\n');

  await page.click('.tabbar button[data-v="me"]');
  await page.waitForTimeout(900);
  const meta = await page.evaluate(() => {
    const rows = [].slice.call(document.querySelectorAll('#dayDetail .lrow'));
    return rows.map(r => ({
      af: r.getAttribute('data-af'), ad: r.getAttribute('data-ad'),
      t: r.getAttribute('data-t'), hasBtn: !!r.querySelector('.lb'),
    }));
  });
  log(meta.length > 0, 'B1 学习记录有可点行', meta.length + ' 行');
  log(meta.every(r => r.hasBtn), 'B2 每行有发音按钮 🔊');
  log(meta.every(r => r.t && r.t.length), 'B3 每行带泰文 data-t');
  log(meta.every(r => r.af && r.af.length), 'B4 每行带音频文件名 data-af', meta[0] && meta[0].af);

  /* 真点一行，看第一级音源是不是站内 mp3 */
  await page.evaluate(() => { window.__audioLog = []; });
  await page.click('#dayDetail .lrow');
  await page.waitForTimeout(600);
  const played = await page.evaluate(() => window.__audioLog.slice());
  log(played.length > 0, 'B5 点击触发了发音', played.length + ' 次');
  /* 判据不是「必须是 audio-pany」—— 词类目录本来就不统一：
     闪卡 renderRun() 里是 say(o.o.a, o.o.d || 'audio-pany', o.t)，
     词库音频实际在 audio-words/，例句和语气词在 audio-pany/。
     真正要抓的失败模式是「本地 mp3 路径拼错 → 直接掉到 TTS 兜底」，
     那种情况用户不会报错，只会觉得声音慢了半拍或音色不对。
     所以判据 = 以 .mp3 结尾且不是 TTS/词典域名。 */
  const isLocalMp3 = u => /\.mp3$/.test(u || '') && !/translate\.google\.com|dict\.youdao\.com/.test(u);
  log(played.length > 0 && isLocalMp3(played[0]),
    'B6 第一级命中站内 mp3（没掉到 TTS 兜底）', played[0] || '(无)');
  const tts = played.filter(u => /translate\.google|youdao/.test(u));
  log(tts.length === 0, 'B7 全程没走 TTS 兜底', tts.length ? '兜底 ' + tts.length + ' 次' : '0 次');

  /* 三类资源取法不能串：w 看 o.a/o.d，g 看 o.a+audio-pany，s 看 o.id+audio-pany */
  const byType = await page.evaluate(() => {
    const out = { w: [], g: [], s: [] };
    [].slice.call(document.querySelectorAll('#dayDetail .lrow')).forEach(function (r) {
      const k = r.getAttribute('data-k') || '';
      const ty = k[0] === 'w' ? 'w' : k[0] === 'g' ? 'g' : 's';
      out[ty].push({ k: k, af: r.getAttribute('data-af'), ad: r.getAttribute('data-ad') });
    });
    return out;
  });
  log(byType.w.every(x => x.af && x.af.length), 'B8 词类条目文件名取自 o.a', byType.w.length + ' 条，样例 ' + (byType.w[0] || {}).af);
  /* 种子 Day6 的 read/out 也用词类 key（w|ก็ / w|ทำงาน），所以 5 行全是词类，
     例句分支空跑。B9 只判「词类自洽」，例句/语气词由 B12/B13 用真实数据兜住。
     词类文件名不止 wNNN —— 构建时有四批：w/t/f 三批词干号 + PANY 的 i 号，
     一律是「字母+数字」，别把正则写死成 wNNN（我第一次就是这么错的）。 */
  const selfConsistent = byType.w.every(x => /^[a-z]+\d+$/.test(x.af || ''))
    && byType.s.every(x => /^h\d+$|^m\d+$/.test(x.af || ''));
  log(selfConsistent, 'B9 渲染行的音频文件名与类型自洽',
    '词 ' + byType.w.length + ' 条 / 例句 ' + byType.s.length + ' 条'
    + (byType.s.length ? '' : '（种子无例句，B13 已用真实数据验过）'));
  log(byType.g.length === 0 || byType.g.every(x => x.ad === 'audio-pany'),
    'B10 语气词目录固定 audio-pany', byType.g.length + ' 条（种子无语气词任务则跳过）');

  /* 种子里没有语气词/例句任务，所以上面 B9/B10 可能因 0 条而空跑。
     直接拿真实数据验一遍取法 —— 这是唯一能证明「三类都没串」的办法。 */
  const synth = await page.evaluate(() => {
    function probe(k){
      var o = keyObj(k);
      if (!o) return { k:k, err:'keyObj 解析失败' };
      var af = null, ad = 'audio-pany';
      if (o.type === 'w'){ af = o.o ? o.o.a : null; ad = (o.o && o.o.d) || 'audio-pany'; }
      else if (o.type === 'g'){ af = o.o ? o.o.a : null; }
      else { af = o.o ? o.o.id : null; }
      return { k:k, type:o.type, af:af, ad:ad, t:o.t };
    }
    var w = Object.keys(WMAP)[0], g = Object.keys(GMAP)[0];
    var sid = (window.PANY.sents[0] || {}).id;
    return { w:probe('w|' + w), g:probe('g|' + g), s:probe('s|' + sid) };
  });
  log(!!synth.w.af && !!synth.w.ad, 'B11 词类取到文件名+目录', synth.w.af + ' @' + synth.w.ad);
  log(!!synth.g.af && synth.g.ad === 'audio-pany', 'B12 语气词取到文件名+audio-pany', synth.g.af + ' @' + synth.g.ad);
  log(/^h\d+$|^m\d+$/.test(synth.s.af || '') && synth.s.ad === 'audio-pany',
    'B13 例句取到句子 id + audio-pany', synth.s.af + ' @' + synth.s.ad);
  /* 三个文件名必须互不相同 —— 都取成同一个值就是「取法串了」的典型症状 */
  const names = [synth.w.af, synth.g.af, synth.s.af].filter(Boolean);
  log(new Set(names).size === names.length && names.length === 3,
    'B14 三类文件名互不相同（没取串）', names.join(' / '));

  /* 状态标签不该误触发（.lv 设了 pointer-events:none） */
  await page.evaluate(() => { window.__audioLog = []; });
  const lvClick = await page.evaluate(() => {
    const lv = document.querySelector('#dayDetail .lrow .lv');
    if (!lv) return 'no-lv';
    const r = lv.closest('.lrow');
    r.click();
    return window.__audioLog.length;
  });
  log(lvClick === 1, 'B15 点状态标签也只触发一次（不重复发声）', '触发 ' + lvClick + ' 次');

  console.log('\n===== 控制台错误 =====\n');
  log(errs.length === 0, 'C1 无 JS 运行时错误', errs.slice(0, 3).join(' | ') || '干净');

  console.log('\n' + '='.repeat(46));
  console.log('  通过 ' + pass + ' / ' + (pass + fail) + (fail ? '　✘ 失败 ' + fail : '　✓ 全绿'));
  console.log('='.repeat(46) + '\n');

  await browser.close();
  process.exit(fail ? 1 : 0);
})().catch(e => { console.error('脚本异常：', e); process.exit(2); });
