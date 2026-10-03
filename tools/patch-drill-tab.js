/* 把「练习」从今日页拆成独立的第 6 个标签。
 *
 * 用户原话：「练习应该单独一个界面，跟总览数据分开。」
 * 上一轮只做了 body.focus 折叠 —— 治了「做题时被无关内容干扰」，
 * 但没治「练习和总览挤在同一个页面」这件事本身：
 * 今日页里同时塞着 KPI、看板、学习报告、5 个任务卡、练习区，滚很久。
 *
 * 这一版是物理拆分，不是视觉折叠：
 *   今日页 → KPI / 打卡看板 / 今天学了什么 / 任务清单（只做入口，点「开始」跳转）
 *   练习页 → 进度条 + 题目 + 打卡按钮（全部搬过来）
 * 6 个标签在 360px 屏最窄也有 58.7px/个，图标+文字放得下（实测过）。
 *
 * 关键设计：练习页在「没有进行中的练习」时显示引导卡，
 * 列出 5 个任务让用户直接从练习页开练，不必先回今日页。
 */
const fs = require('fs');
const path = require('path');
const F = path.join(__dirname, '..', 'index.html');
let s = fs.readFileSync(F, 'utf8');
const before = s.length;
const CRLF = s.includes('\r\n');
const T = x => CRLF ? x.replace(/\n/g, '\r\n') : x;

let n = 0;
/* index.html 是混合行尾 —— 早期脚本块是 LF，后期补丁块是 CRLF。
   所以每处都先按原样找，找不到再试 CRLF 转换版。两种都找不到才算锚点失效。 */
function must(oldStr, newStr, label) {
  const cands = [[oldStr, newStr]];
  if (CRLF) cands.push([T(oldStr), T(newStr)]);
  for (let i = 0; i < cands.length; i++) {
    const a = cands[i][0], b = cands[i][1];
    const p = s.indexOf(a);
    if (p < 0) continue;
    if (p !== s.lastIndexOf(a)) throw new Error('锚点不唯一：' + label);
    s = s.slice(0, p) + b + s.slice(p + a.length);
    n++;
    return;
  }
  throw new Error('找不到锚点：' + label);
}

/* ---- 1. CSS：今日页移除练习容器，新增练习页样式 ---- */
must(
`#focusBar{display:none;margin:10px 0 0}
body.focus #focusBar{display:block}`,
`#focusBar{display:none;margin:10px 0 0}
body.focus #focusBar{display:block}
/* 练习页已独立，body.focus 不再需要折叠今日页的那些区块。
   留着这条是为了兼容：万一以后又有人调 enterFocus()，页面不会散架。 */
#v-drill{padding-bottom:4px}
.drillHd{display:flex;align-items:baseline;gap:8px;margin:2px 0 10px}
.drillHd h2{margin:0;font-size:17px}
.drillHd .sub{margin:0}
.dcard{background:var(--surface2);border:1px solid var(--line2);border-radius:12px;padding:12px 13px;margin-bottom:8px}
.dcard.done{opacity:.72}
.dcard .nm{font-size:15px;font-weight:600;margin-bottom:2px}
.dcard .dd{font-size:12.5px;color:var(--tx2);line-height:1.5}
.dcard .mbar{margin:8px 0 9px}
.dcard .btn{width:100%}
.dguide{text-align:center;padding:26px 16px;color:var(--tx2)}
.dguide .big{font-size:34px;line-height:1;margin-bottom:10px}
.emptyDrill{color:var(--tx3);font-size:13px;text-align:center;padding:16px 0}`,
'CSS 练习页'
);

/* ---- 2. tabbar 加第 6 个标签 ---- */
must(
`  <button class="on" data-v="today"><span class="ic">◈</span>今日</button>
  <button data-v="corpus"><span class="ic">☰</span>语料</button>`,
`  <button class="on" data-v="today"><span class="ic">◈</span>今日</button>
  <button data-v="drill"><span class="ic">✎</span>练习</button>
  <button data-v="corpus"><span class="ic">☰</span>语料</button>`,
'tabbar 加练习'
);

/* ---- 3. 今日页移除 runner / focusBar / finishBox，只留任务清单当入口 ---- */
must(
`    <div id="taskList"></div>
    <div id="focusBar"></div>
    <div id="runner"></div>
    <div id="finishBox" style="display:none">
      <div class="okbox" id="finishTxt"></div>
      <div class="btnrow"><button class="btn primary" id="btnFinish">完成今日打卡</button><button class="btn" id="btnRedo">重做</button></div>
    </div>
  </section>`,
`    <div id="taskList"></div>
  </section>

  <!-- ========== 练习（与总览彻底分开） ========== -->
  <section class="view" id="v-drill">
    <div class="drillHd"><h2>练习</h2><span class="sub" id="drillSub">选一项开始</span></div>
    <div id="drillList"></div>
    <div id="focusBar"></div>
    <div id="runner"></div>
    <div id="finishBox" style="display:none">
      <div class="okbox" id="finishTxt"></div>
      <div class="btnrow"><button class="btn primary" id="btnFinish">完成今日打卡</button><button class="btn" id="btnRedo">重做</button></div>
    </div>
  </section>`,
'HTML 拆练习页'
);

/* ---- 4. 导航表加 drill ---- */
must(
`var VH = { today:renderToday, corpus:renderCorpus, words:renderWords, ref:renderPhrases, me:renderMe };`,
`var VH = { today:renderToday, drill:renderDrill, corpus:renderCorpus, words:renderWords, ref:renderPhrases, me:renderMe };
/* 练习中切到别的标签再切回来，题目要还在 ——
   所以切页时不清 runner，只是重画练习页外壳。 */
function goDrill(){
  var btn = document.querySelector('.tabbar button[data-v="drill"]');
  if (!btn) return;
  document.querySelectorAll('.tabbar button').forEach(function(x){ x.classList.remove('on'); });
  btn.classList.add('on');
  document.querySelectorAll('.view').forEach(function(x){ x.classList.remove('on'); });
  $('v-drill').classList.add('on');
  renderDrill();
  window.scrollTo(0, 0);
}`,
'导航表加 drill'
);

/* ---- 5. startCard / startQuiz 改成跳到练习页 ---- */
must(
`  run = { kind:kind, keys:keys, i:0, right:0, half:0, wrong:0, show:false, t0:Date.now() };
  enterFocus(kind);
  renderRun();
}`,
`  run = { kind:kind, keys:keys, i:0, right:0, half:0, wrong:0, show:false, t0:Date.now() };
  enterFocus(kind);
  renderRun();
  drillStarted = true;
  goDrill();
}`,
'startCard 跳页'
);

must(
`  quiz = { qs:qs, i:0, right:0, done:false, t0:Date.now() };
  enterFocus('quiz');
  renderQuiz();
}`,
`  quiz = { qs:qs, i:0, right:0, done:false, t0:Date.now() };
  enterFocus('quiz');
  renderQuiz();
  drillStarted = true;
  goDrill();
}`,
'startQuiz 跳页'
);

/* ---- 6. 新增 renderDrill：练习页外壳 ---- */
must(
`/* ==================== 需求 1：功能模块隔离 ====================`,
`/* ==================== 练习页外壳 ====================
   练习进行中 → 只显示进度条和题目，任务列表藏起来（跟原来的 body.focus 一个意图，
   但现在作用范围只在练习页内部，不会再影响今日页）。
   没在练 → 显示 5 张任务卡，让用户可以直接在这一页开练。
   drillStarted 标记「用户主动开过练习」：之前用 body.hasClass('focus') 判断，
   但 finishRun 之后 run 被置空、focus 也退掉了，页面会误判成「没开始」而闪回列表。 */
var drillStarted = false;
function renderDrill(){
  var busy = !!(run || quiz);
  var L = $('drillList');
  $('drillSub').textContent = busy ? '进行中' : '选一项开始';
  if (busy){
    L.innerHTML = '';
    L.style.display = 'none';
    paintFocusBar();
    return;
  }
  L.style.display = '';
  /* 做完了还停在这一页：给个明确的落点，不然用户以为页面空了 */
  if (drillStarted){
    var all = TASKS.every(function(t){ return D.st[t.k] && D.st[t.k].done; });
    L.innerHTML = all
      ? '<div class="dguide"><div class="big">✓</div><div>今天五项都做完了</div>'
        + '<div class="btnrow" style="justify-content:center;margin-top:12px">'
        + '<button class="btn primary" id="dGoToday">回今日看板打卡</button>'
        + '<button class="btn" id="dRedoAll">再练一轮</button></div></div>'
      : '<div class="dguide"><div class="big">✓</div><div>刚练完一项</div>'
        + '<p class="sub">继续挑下面任意一项，或回今日看板看总览。</p>'
        + '<div class="btnrow" style="justify-content:center;margin-top:10px">'
        + '<button class="btn" id="dGoToday">回今日看板</button></div></div>';
    var gt = $('dGoToday');
    if (gt) gt.onclick = function(){
      drillStarted = false;
      var b = document.querySelector('.tabbar button[data-v="today"]');
      b.onclick.call(b);
    };
    var ra = $('dRedoAll');
    if (ra) ra.onclick = function(){ drillStarted = false; renderDrill(); renderToday(); };
  } else {
    L.innerHTML = '<div class="dguide"><div class="big">✎</div>'
      + '<div>这里只放练习，统计数据在「今日」页</div>'
      + '<p class="sub">选一项开始，做完会记住进度。</p></div>';
  }
  if (drillStarted) return;
  var h = '';
  TASKS.forEach(function(t){
    var keys = dropMaster(taskKeys(t.k));
    var total = t.k === 'quiz' ? S.cfg.quizCount : keys.length;
    var st = D.st[t.k] || {}, done = !!st.done;
    var pct = total ? Math.round((st.n || 0) / total * 100) : 0;
    if (done) pct = 100;
    h += '<div class="dcard' + (done ? ' done' : '') + '">'
      + '<div class="nm">' + t.n + (done ? ' <span class="sub">· ' + st.score + ' 分</span>' : '')
      + ' <span class="sub">' + (total ? total + ' 项' : '今日无') + '</span></div>'
      + '<div class="dd">' + t.d + '</div>'
      + '<div class="mbar"><i style="width:' + pct + '%"></i></div>'
      + '<button class="btn wide' + (done ? '' : ' primary') + '" data-run="' + t.k + '">'
      + (done ? '重做' : (st.n ? '继续' : '开始')) + '</button></div>';
  });
  L.innerHTML += h;
  L.querySelectorAll('button[data-run]').forEach(function(b){
    b.onclick = function(){
      var k = b.getAttribute('data-run');
      if (k === 'quiz') startQuiz(); else startCard(k);
    };
  });
}
/* ==================== 功能模块隔离 ====================`,
'renderDrill'
);

/* ---- 7. finishRun / finishQuiz 后刷新练习页外壳 ---- */
must(
`  var msg = '<div class="okbox">' + TNAME[run.kind] + '完成：<b>' + sc + ' 分</b>　✔ ' + run.right + '　~ ' + run.half + '　✘ ' + run.wrong + '</div>';`,
`  paintFocusBar();
  var msg = '<div class="okbox">' + TNAME[run.kind] + '完成：<b>' + sc + ' 分</b>　✔ ' + run.right + '　~ ' + run.half + '　✘ ' + run.wrong + '</div>';`,
'finishRun 刷新'
);

/* ---- 8. 返回按钮改为回今日页 ---- */
must(
`  b.onclick = function(){
    exitFocus();
    $('runner').innerHTML = '';
    renderToday();
    window.scrollTo({ top:0, behavior:'smooth' });
  };`,
`  b.onclick = function(){
    exitFocus();
    $('runner').innerHTML = '';
    run = null; quiz = null;
    drillStarted = false;
    renderToday();
    var tb = document.querySelector('.tabbar button[data-v="today"]');
    if (tb) tb.onclick.call(tb);
  };`,
'返回按钮'
);

/* ---- 9. 首屏也渲染一次练习页（否则直接切过去是空的） ---- */
must(
`safeRun(function(){ renderToday(); }, 'renderToday');`,
`safeRun(function(){ renderToday(); }, 'renderToday');
safeRun(function(){ renderDrill(); }, 'renderDrill');`,
'首屏渲染练习页'
);

fs.writeFileSync(F, s, 'utf8');
console.log('✓ 已打 ' + n + ' 处补丁  ' + before + ' → ' + s.length + ' 字节');
