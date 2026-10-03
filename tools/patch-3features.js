/* 实现用户提的三个需求：
 *   1. 功能模块隔离 —— 做题时隐藏无关区块
 *   2. 每日学习记录查询 —— 今天/过往每天学了哪些词
 *   3. 预计学习时长
 *
 * 上一轮的经验都写进注释里了，不再重复踩。
 */
const fs = require('fs');
const P = 'index.html';
let s = fs.readFileSync(P, 'utf8');
const T = (t) => t.replace(/\n/g, '\r\n');
let n = 0;

function must(oldStr, label) {
  const o = T(oldStr);
  if (s.indexOf(o) < 0) {
    if (s.indexOf(oldStr) >= 0) { s = s.replace(oldStr, label.newStr); n++; return; }
    console.error('✗ ' + label.name + ' 未匹配');
    process.exit(1);
  }
  s = s.replace(o, label.newStr);
  n++;
}

/* ══════════════ 补丁 1：CSS ══════════════ */
must(`/* 词条行 */`, {
  name: 'CSS-专注模式',
  newStr: `/* ---- 专注模式：做题时隐藏无关区块 ----
   用户原话：「我要做测验的时候，你上面的都是一些跟这个测验无关的，对吧？
   每天打卡的内容是一个模块儿，你其他的又是另外一个模块儿。」
   做法：body.focus 时把 hero / board / todayReport / taskList / finishBox 收起来，
   只留 runner。不用 display:none 是因为要保留切换时的滚动位置与动画过渡；
   实际用 max-height 归零 + opacity 归零，退出时能滑回来。
   runner 顶到最上面，让题目从屏幕顶部开始，注意力不被推走。 */
body.focus .hero, body.focus #board, body.focus #todayReport,
body.focus #taskList, body.focus #finishBox{
  max-height:0!important;opacity:0!important;margin:0!important;padding:0!important;
  overflow:hidden!important;pointer-events:none!important;border:0!important}
.hero, #board, #todayReport, #taskList{transition:max-height .22s ease,opacity .22s ease,margin .22s ease}
/* 专注态给个明显的返回条，用户不会以为页面坏了 */
#focusBar{display:none;margin:10px 0 0}
body.focus #focusBar{display:block}
#focusBar .fb{
  display:flex;align-items:center;gap:10px;padding:10px 13px;border-radius:12px;
  background:var(--surface2);border:1px solid var(--line2);font-size:13px;color:var(--tx2)}
#focusBar .fb b{color:var(--tx);font-size:14px}
#focusBar .fb .sp{flex:1 1 auto}

/* ---- 每日记录查询 ---- */
.daypick{display:flex;gap:6px;flex-wrap:wrap;margin:8px 0}
.daypick button{
  font:inherit;font-size:12.5px;padding:7px 11px;border-radius:10px;cursor:pointer;
  border:1px solid var(--line2);background:var(--bg);color:var(--tx2)}
.daypick button.on{background:var(--blue600);border-color:var(--blue600);color:#fff;font-weight:600}
.daypick button.today{box-shadow:inset 0 0 0 1px var(--blue600)}
/* 一条学习记录：泰文 + 中文 + 状态 */
.lrow{display:flex;align-items:center;gap:10px;padding:9px 11px;border-bottom:1px solid var(--line)}
.lrow:last-child{border-bottom:none}
.lrow .lt{flex:1 1 auto;min-width:0}
.lrow .lt .thai{display:block;font-size:15px}
.lrow .lt .sub{display:block;font-size:11.5px;color:var(--tx3);margin-top:1px;
  white-space:nowrap;overflow:hidden;text-overflow:ellipsis}
.lrow .lv{flex:0 0 auto;font-size:11px;padding:2px 7px;border-radius:8px;font-weight:600}
.lv.ok{background:var(--green50);color:var(--green700)}
.lv.half{background:var(--amber50);color:var(--amber700)}
.lv.bad{background:var(--red50);color:var(--red700)}
.lv.new{background:var(--blue50);color:var(--blue700)}

/* 词条行 */`,
});

/* ══════════════ 补丁 2：HTML — 专注返回条 ══════════════ */
must(`    <div id="taskList"></div>
    <div id="runner"></div>`, {
  name: 'HTML-专注条',
  newStr: `    <div id="taskList"></div>
    <div id="focusBar"></div>
    <div id="runner"></div>`,
});

/* ══════════════ 补丁 3：HTML — 每日记录查询 + 预计时长 ══════════════ */
must(`    <h3>明细</h3>
    <table><thead><tr><th>天</th><th>日期</th><th>新学</th><th>复习</th><th>答题</th><th>阅读</th><th>输出</th><th>分</th></tr></thead><tbody id="rTbl"></tbody></table>`, {
  name: 'HTML-记录查询区',
  newStr: `    <h3>每天学了哪些词</h3>
    <div class="tip">点任意一天，看那天实际碰过的每一个条目和掌握程度。今天的那天会标「今天」。</div>
    <div class="daypick" id="dayPick"></div>
    <div id="dayDetail"></div>

    <h3>预计学多久</h3>
    <div id="etaBox"></div>

    <h3>明细</h3>
    <table><thead><tr><th>天</th><th>日期</th><th>新学</th><th>复习</th><th>答题</th><th>阅读</th><th>输出</th><th>分</th></tr></thead><tbody id="rTbl"></tbody></table>`,
});

/* ══════════════ 补丁 4：新增三个核心函数（放在 renderMe 之前）══════════════ */
must(`function renderMe(){`, {
  name: 'JS-三需求',
  newStr: `/* ==================== 需求 1：功能模块隔离 ====================
   做题（闪卡 run / 测验 quiz）时把无关区块收起来。
   用 body.focus 这个类做开关，CSS 里一条规则搞定显隐，
   JS 这边只负责加类/去类和更新返回条上的进度数字。 */
var focusKind = '';
function enterFocus(kind){
  focusKind = kind;
  document.body.classList.add('focus');
  paintFocusBar();
}
function exitFocus(){
  focusKind = '';
  document.body.classList.remove('focus');
}
/* 返回条要显示「第几题 / 共几题」和当前任务名，
   否则用户会以为「退出」把今天做的东西也一起清了。 */
function paintFocusBar(){
  var bar = $('focusBar');
  if (!bar) return;
  if (!focusKind){ bar.innerHTML = ''; return; }
  var label = '', prog = '';
  if (focusKind === 'quiz' && quiz){
    label = '今日测验';
    prog = '第 ' + Math.min(quiz.i + 1, quiz.qs.length) + ' / ' + quiz.qs.length + ' 题';
  } else if (run){
    label = TNAME[run.kind] || '闪卡';
    prog = '第 ' + Math.min(run.i + 1, run.keys.length) + ' / ' + run.keys.length;
  } else if (quiz){
    label = '今日测验'; prog = '';
  }
  bar.innerHTML = '<div class="fb"><b>' + esc(label) + '</b>'
    + '<span class="sub">' + esc(prog) + '</span>'
    + '<span class="sp"></span>'
    + '<span class="sub">答题时其他内容已收起</span></div>';
}

/* ==================== 需求 2：每日学习记录查询 ====================
   用户原话：「我还可以去查我今天的整体的，我学了哪些词，对吧？每天。
   然后我还可以去查过往的每天学的一些词，每天学的词都有记录，都要看。」

   数据来源有两条，都要用上：
     a) S.days[d].plan —— 那天「计划」学哪些（newW/newG/dueW/dueG/read/out）
     b) S.items[k]    —— 每个条目当前的状态（seen / box / r / w / lg）
   只看 a 会漏掉「计划了但没做完」的，只看 b 会把前几天学的也算进来。
   所以做法是：以当天的 plan 圈出候选集，再按 items 里有没有 seen 过滤，
   这样列出来的就是「那天真的碰过的」。

   为什么要记 lg（lastGood）：条目被复习后 box 会涨，
   光看 box 无法区分「今天新学的」和「今天复习的」。
   items[k].lg 记的是最后一次答对的 Day N，用来判当天是新学还是复习。 */
function dayKeys(d){
  var rec = S.days[d], out = [], seen = {};
  if (!rec) return out;
  var p = rec.plan || {};
  var groups = [
    ['新学', p.newW || []], ['新学', p.newG || []],
    ['复习', p.dueW || []], ['复习', p.dueG || []],
    ['她的例句', p.read || []], ['我的例句', p.out || []]
  ];
  groups.forEach(function(g){
    g[1].forEach(function(k){
      if (seen[k]) return;
      var it = S.items[k];
      if (!it || !it.seen) return;          // 那天计划了但没碰到，不算
      seen[k] = 1;
      var o = keyObj(k);
      if (!o) return;
      var lg = it.lg ? Math.max.apply(null, [].concat(it.lg)) : 0;
      var kind = lg === d ? '新学' : (lg > 0 ? '复习' : g[0]);
      /* 状态标签：优先看当天答对没有 */
      var lv = 'new', lvTx = '看过';
      if (d === lg && it.r > it.w) { lv = 'ok'; lvTx = '记住'; }
      else if (it.w > 0 && it.box <= 1) { lv = 'bad'; lvTx = '答错'; }
      else if (it.box >= 3) { lv = 'ok'; lvTx = '已牢固'; }
      else if (it.box >= 1) { lv = 'half'; lvTx = '还不牢'; }
      out.push({ k:k, t:o.t, z:(o.o && (o.o.z || o.o.e)) || '', kind:kind, lv:lv, lvTx:lvTx, box:it.box, r:it.r, w:it.w });
    });
  });
  out.sort(function(a, b){
    var o = { '新学':0, '复习':1, '她的例句':2, '我的例句':3 };
    return (o[a.kind] - o[b.kind]) || (a.box - b.box);
  });
  return out;
}
function renderDayPick(){
  var box = $('dayPick');
  if (!box) return;
  var ds = Object.keys(S.days).map(Number).sort(function(a, b){ return b - a; }); // 新→旧
  if (!ds.length){ box.innerHTML = ''; return; }
  /* 倒序展示：最近的天在最左边，符合「我刚学的是哪天」的自然顺序 */
  box.innerHTML = ds.map(function(d){
    var n = dayKeys(d).length;
    return '<button data-d="' + d + '"' + (d === S.day ? ' class="today"' : '')
      + (d === pickDay ? ' class="on"' : '') + '>'
      + 'D' + d + (d === S.day ? ' 今天' : '') + ' · ' + n + '</button>';
  }).join('');
  box.querySelectorAll('button').forEach(function(b){
    b.onclick = function(){ pickDay = +b.getAttribute('data-d'); renderDayPick(); renderDayDetail(); };
  });
}
var pickDay = 0;
function renderDayDetail(){
  var box = $('dayDetail');
  if (!box) return;
  if (!pickDay) pickDay = S.day;
  var rec = S.days[pickDay];
  if (!rec){ box.innerHTML = '<p class="sub">这天没有记录。</p>'; return; }
  var st = rec.st || {}, ks = dayKeys(pickDay);
  var mins = st.min || 0;
  var right = (st.quiz && st.quiz.right) || 0, tot = (st.quiz && st.quiz.n) || 0;
  var h = '<div class="kpis" style="margin:8px 0">'
    + '<div class="kpi"><div class="l">Day</div><div class="v">' + pickDay + '</div></div>'
    + '<div class="kpi"><div class="l">日期</div><div class="v" style="font-size:15px">' + dateOf(pickDay) + '</div></div>'
    + '<div class="kpi"><div class="l">条目</div><div class="v">' + ks.length + '</div></div>'
    + '<div class="kpi"><div class="l">答题</div><div class="v">' + (tot ? right + '/' + tot : '—') + '</div></div>'
    + '<div class="kpi"><div class="l">用时</div><div class="v">' + (mins ? mins + '′' : '—') + '</div></div>'
    + '<div class="kpi"><div class="l">总分</div><div class="v">' + (dayDone(pickDay) ? dayScoreOf(pickDay) : '—') + '</div></div>'
    + '</div>';
  if (!ks.length){
    h += '<p class="sub">这天没有实际碰过条目 —— 计划了但没开始，或者不是学习日。</p>';
  } else {
    h += '<div class="list" style="border:1px solid var(--line2);border-radius:12px;overflow:hidden">';
    ks.forEach(function(x){
      var sp = splitEmoji(x.t);
      h += '<div class="lrow"><div class="lt">'
        + '<span class="thai">' + esc(sp.t) + (sp.e ? ' <span style="font-size:13px">' + esc(sp.e) + '</span>' : '') + '</span>'
        + '<span class="sub">' + esc(x.z || '—') + '　盒' + x.box + '　对' + x.r + ' 错' + x.w + '</span>'
        + '</div><span class="lv ' + x.lv + '">' + esc(x.kind + ' · ' + x.lvTx) + '</span></div>';
    });
    h += '</div>';
    /* 按分组给一句小结，省得用户自己数 */
    var byKind = {};
    ks.forEach(function(x){ byKind[x.kind] = (byKind[x.kind] || 0) + 1; });
    h += '<p class="sub" style="margin-top:8px">'
      + Object.keys(byKind).map(function(k2){ return k2 + ' ' + byKind[k2]; }).join('　')
      + '</p>';
  }
  box.innerHTML = h;
}

/* ==================== 需求 3：预计学习时长 ====================
   用户原话：「然后还有预计的一个学习时长。」

   只丢一个数字没用 —— 用户真正想知道的是「按现在的节奏还要多久能沟通」。
   所以给三档，并且把算法摊开让人能核对：
     · 最低要求：把 TOP100 高频词拿下（跟日常寒暄够用）
     · 实用线：TOP100 + 她的常用词 + 语气虚词（能聊真实话题）
     · 全量：词库 2187 词（覆盖长尾，靠查）

   每天能吃下的量不是常数，取 min(当前配额, 未到期复习压力允许的上限)，
   否则复习一压上来，新词进度就停了，估算会严重偏乐观。

   用实际数据校准：最近 7 天平均每天真正新增的条目数（st.new.n + st.rev.n 之和的均值），
   样本够时优先用实测值，样本不足再退回配额估算。 */
function etaCalc(){
  var TOP_TARGET = 100;
  var wDone = POOL_W.filter(function(w){ return S.master[w.t] || (S.items['w|' + w.t] || {}).box >= 3; }).length;
  var gDone = POOL_G.filter(function(w){ return S.master[w.t] || (S.items['g|' + w.t] || {}).box >= 3; }).length;

  /* 每天实际能新增多少：以最近 7 天实测为准，没数据就用配额 */
  var recent = doneDays().slice(-7);
  var perDay = 0, sample = 0;
  recent.forEach(function(d){
    var st = S.days[d].st || {};
    var n = ((st.new && st.new.n) || 0) + ((st.rev && st.rev.n) || 0);
    /* n=0 的空壳日（当天没任务）不算进均值，否则会把节奏算慢 */
    if (n > 0){ perDay += n; sample++; }
  });
  perDay = sample ? perDay / sample : 0;
  var cap = (S.cfg.newWords || BASE_NEW) + (S.cfg.newGrams || 0);
  var rate = perDay >= 1 ? perDay : cap;
  var rateSrc = perDay >= 1
    ? '最近 ' + sample + ' 个学习日实测 ' + perDay.toFixed(1) + ' 条/天'
    : '按你的每日配额 ' + cap + ' 条/天（还没有实测样本）';

  /* 复习会吃掉一部分时间：按经验给个占比，并把依据写出来 */
  var revShare = 0.35;

  function left(n){ return Math.max(0, n); }
  var l1 = left(TOP_TARGET - wDone);
  var l2 = left((POOL_W.length + POOL_G.length) - wDone - gDone);
  var l3 = left(POOL_ALL_LEN() - wDone - gDone);

  /* 每条「算拿下」的耗时：闪卡 2 遍 + 测验 1 次，按每条 8 秒 + 复习摊销。
     这个系数是把一天的量换算成分钟的唯一假设，必须写出来让人能质疑。 */
  var SEC_PER_ITEM = 8;
  function days(n){ return n <= 0 ? 0 : n / rate; }

  var d1 = days(l1), d2 = days(l2), d3 = days(l3);
  return {
    rate: rate, rateSrc: rateSrc, revShare: revShare, secPerItem: SEC_PER_ITEM,
    wDone: wDone, gDone: gDone, total: POOL_ALL_LEN(),
    tiers: [
      { k:'d1', n:'最低 · 日常能聊', left:l1, days:d1, need:'TOP100 高频词拿下 ' + wDone + '/' + TOP_TARGET,
        desc:'够听懂寒暄、问在做什么、说想你' },
      { k:'d2', n:'实用 · 真实话题', left:l2, days:d2, need:'全部高频词与语气虚词拿下 ' + (wDone + gDone) + '/' + (POOL_W.length + POOL_G.length),
        desc:'能聊她的工作、家人、橡胶园，日常不用翻译' },
      { k:'d3', n:'全量 · 长尾覆盖', left:l3, days:d3, need:'整个词库 ' + (wDone + gDone) + '/' + POOL_ALL_LEN(),
        desc:'生词也能自己查，日常词汇基本无死角' }
    ]
  };
}
/* 词库总数：数据文件里是 window.WORDS5（Priority 5）和 window.WORDS4（Priority 4）
   两组，加起来才是词库页说的「2187 词」。
   别写成 WORDS —— 那个全局不存在，会让整个 etaCalc 挂掉。 */
function POOL_ALL_LEN(){
  var a = (typeof WORDS5 !== 'undefined' && WORDS5 && WORDS5.length) ? WORDS5.length : 0;
  var b = (typeof WORDS4 !== 'undefined' && WORDS4 && WORDS4.length) ? WORDS4.length : 0;
  if (a + b) return a + b;
  /* 数据文件没加载上时的兜底：至少给出高频词池的口径，别显示 0 */
  return POOL_W.length + POOL_G.length;
}
function renderEta(){
  var box = $('etaBox');
  if (!box) return;
  var e = etaCalc();
  var todayMin = Math.max(1, Math.round(e.rate * (1 + e.revShare) * e.secPerItem / 60));
  var h = '<div class="kpis" style="margin:8px 0">'
    + '<div class="kpi k-blue"><div class="l">每天预计投入</div><div class="v">' + todayMin + '′</div></div>'
    + '<div class="kpi k-green"><div class="l">当前速度</div><div class="v">' + e.rate.toFixed(1) + '</div></div>'
    + '<div class="kpi k-purple"><div class="l">已拿下</div><div class="v">' + (e.wDone + e.gDone) + '</div></div>'
    + '<div class="kpi k-amber"><div class="l">词库总量</div><div class="v">' + e.total + '</div></div>'
    + '</div>'
    + '<p class="sub">速度口径：' + esc(e.rateSrc) + '。每条算「闪卡 2 遍 + 测验 1 次」，'
    + '按每条 ' + e.secPerItem + ' 秒估；复习额外占 ' + Math.round(e.revShare * 100) + '% 时间。'
    + '按这个节奏：</p>';
  e.tiers.forEach(function(t){
    if (t.left <= 0){
      h += '<div class="card" style="padding:11px 13px;margin:7px 0"><b>' + esc(t.n) + '</b>　✅ 已达成'
        + '<div class="sub">' + esc(t.need) + '</div></div>';
      return;
    }
    /* 不足一周说「还剩 N 天」，超过就按月算 —— 「137 天」不如「4 个多月」有体感 */
    var txt = t.days < 14
      ? '还剩约 ' + Math.ceil(t.days) + ' 天'
      : (t.days < 60 ? '还剩约 ' + Math.round(t.days / 7) + ' 周' : '还剩约 ' + (t.days / 30).toFixed(1) + ' 个月');
    h += '<div class="card" style="padding:11px 13px;margin:7px 0">'
      + '<b>' + esc(t.n) + '</b>　<span style="color:var(--blue600);font-weight:600">' + txt + '</span>'
      + '<div class="sub">' + esc(t.need) + '　还差 ' + t.left + ' 条</div>'
      + '<div class="sub" style="color:var(--tx3)">' + esc(t.desc) + '</div></div>';
  });
  h += '<p class="sub" style="margin-top:8px">这是按当前配额的线性估算。'
    + '想更快就调大下面「每日配额」里的新词数；但复习欠账太多时系统会自动压低新学，'
    + '那时候速度会降下来 —— 这是设计如此，不是坏了。</p>';
  box.innerHTML = h;
}

function renderMe(){`,
});

/* ══════════════ 补丁 5：renderMe 里挂上新渲染 ══════════════ */
must(`  $('storeInfo').textContent = '存档约 ' + Math.round(JSON.stringify(S).length/1024) + ' KB';`, {
  name: 'JS-renderMe挂载',
  newStr: `  $('storeInfo').textContent = '存档约 ' + Math.round(JSON.stringify(S).length/1024) + ' KB';
  /* 三个新模块 */
  if (!pickDay) pickDay = S.day;
  renderDayPick(); renderDayDetail(); renderEta();`,
});

/* ══════════════ 补丁 6：startCard / startQuiz 进入专注态 ══════════════ */
must(`  run = { kind:kind, keys:keys, i:0, right:0, half:0, wrong:0, show:false, t0:Date.now() };
  renderRun();
  document.getElementById('runner').scrollIntoView({ behavior:'smooth', block:'start' });`, {
  name: 'JS-startCard进专注',
  newStr: `  run = { kind:kind, keys:keys, i:0, right:0, half:0, wrong:0, show:false, t0:Date.now() };
  enterFocus(kind);
  renderRun();`,
});

must(`  quiz = { qs:qs, i:0, right:0, done:false, t0:Date.now() };
  renderQuiz();
  $('runner').scrollIntoView({ behavior:'smooth', block:'start' });`, {
  name: 'JS-startQuiz进专注',
  newStr: `  quiz = { qs:qs, i:0, right:0, done:false, t0:Date.now() };
  enterFocus('quiz');
  renderQuiz();`,
});

/* ══════════════ 补丁 7：退出 / 完成时离开专注态 ══════════════ */
must(`  $('qQuit').onclick = function(){ quiz = null; renderToday(); R.innerHTML = ''; };`, {
  name: 'JS-退出测验',
  newStr: `  $('qQuit').onclick = function(){ quiz = null; exitFocus(); renderToday(); R.innerHTML = ''; };
  paintFocusBar();`,
});

/* renderRun 每题重绘时刷新返回条上的进度 */
must(`  var bp = $('cPlay'); if (bp) bp.onclick = play;`, {
  name: 'JS-renderRun刷新条',
  newStr: `  paintFocusBar();
  var bp = $('cPlay'); if (bp) bp.onclick = play;`,
});

/* ══════════════ 补丁 8：完成后留成绩 + 一键返回 ══════════════
   完成后不能直接 exitFocus()：runner 里是成绩单，一收走就白做了。
   正确做法是保持专注态，同时给一个显眼的「返回今日看板」按钮。 */
must(`  save(); run = null;
  $('runner').innerHTML = msg;
  renderToday();
  onTaskDone();`, {
  name: 'JS-finishRun加返回',
  newStr: `  save(); run = null;
  $('runner').innerHTML = msg + focusBackBtn();
  renderToday();
  paintFocusBar();
  onTaskDone();`,
});

must(`  $('runner').innerHTML = '<div class="okbox">测验完成：<b>' + D.st.quiz.score + ' 分</b>（' + D.st.quiz.right + ' / ' + D.st.quiz.n + '）</div>';
  renderToday();
  onTaskDone();`, {
  name: 'JS-finishQuiz加返回',
  newStr: `  $('runner').innerHTML = '<div class="okbox">测验完成：<b>' + D.st.quiz.score + ' 分</b>（' + D.st.quiz.right + ' / ' + D.st.quiz.n + '）</div>' + focusBackBtn();
  renderToday();
  paintFocusBar();
  onTaskDone();`,
});

/* ══════════════ 补丁 9：focusBackBtn / 绑定 ══════════════ */
must(`function paintFocusBar(){`, {
  name: 'JS-focusBackBtn',
  newStr: `/* 完成后的返回按钮。放在 runner 里而不是顶栏 ——
   顶栏在专注态下可能被滚动出视野，放在成绩单下面视线正好落在那。 */
function focusBackBtn(){
  return '<div class="btnrow"><button class="btn primary" id="focusBack">返回今日看板</button></div>';
}
function bindFocusBack(){
  var b = $('focusBack');
  if (!b) return;
  b.onclick = function(){
    exitFocus();
    $('runner').innerHTML = '';
    renderToday();
    window.scrollTo({ top:0, behavior:'smooth' });
  };
}
/* 每次渲染完 runner 都重绑一次（runner 是整块 innerHTML 覆盖的） */
function paintFocusBar(){`,
});

/* renderToday 末尾顺带重绑返回按钮 —— renderToday 会在答题过程中被反复调用，
   放在这里能保证按钮任何时候都在。 */
must(`  topbar();
}
/* ==================== 今日总览：今天学了什么、错在哪、系统怎么看 ==================== */`, {
  name: 'JS-renderToday重绑',
  newStr: `  bindFocusBack();
  topbar();
}
/* ==================== 今日总览：今天学了什么、错在哪、系统怎么看 ==================== */`,
});

fs.writeFileSync(P, s);
console.log('✓ 已打 ' + n + ' 处补丁');
