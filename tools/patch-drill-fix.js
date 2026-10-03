/* 修两处：
 *   1) body.focus 的折叠规则已经失效且有害 —— 元素都搬到练习页了，
 *      这条规则让「今日」页在练习进行中被无谓折叠（实测 hero 高 0px、透明度 0）。
 *      练习页独立后，专注态由「切到练习页 + 隐藏 drillList」实现，不再需要这个 class。
 *      保留 enterFocus/exitFocus 函数（大量调用点），只让它们不再影响今日页。
 *   2) finishRun / finishQuiz 完成后要重画练习页外壳，
 *      否则返回按钮点了没反应（drillList 一直是隐藏状态）。
 */
const fs = require('fs');
const path = require('path');
const F = path.join(__dirname, '..', 'index.html');
let s = fs.readFileSync(F, 'utf8');
const before = s.length;
const CRLF = s.includes('\r\n');
const T = x => CRLF ? x.replace(/\n/g, '\r\n') : x;
let n = 0;
function must(o, w, label) {
  const cands = [[o, w]];
  if (CRLF) cands.push([T(o), T(w)]);
  for (const [a, b] of cands) {
    const p = s.indexOf(a);
    if (p < 0) continue;
    if (p !== s.lastIndexOf(a)) throw new Error('锚点不唯一：' + label);
    s = s.slice(0, p) + b + s.slice(p + a.length); n++; return;
  }
  throw new Error('找不到锚点：' + label);
}

/* ---- 1. 折叠规则改为「只对练习页内部生效」 ---- */
must(
`body.focus .hero, body.focus #board, body.focus #todayReport,
body.focus #taskList, body.focus #finishBox{
  max-height:0!important;opacity:0!important;margin:0!important;padding:0!important;
  overflow:hidden!important;pointer-events:none!important;border:0!important}
.hero, #board, #todayReport, #taskList{transition:max-height .22s ease,opacity .22s ease,margin .22s ease}`,
`/* 专注态原来靠折叠今日页实现（body.focus → hero/board/taskList 归零）。
   练习拆成独立标签后这条路走不通了：那些元素在今日页，
   折叠它们等于「用户只是切去练习，今日页就变空白」—— 实测 hero 高度掉到 0。
   现在专注态只作用于练习页内部：题目区显示、任务列表隐藏，由 renderDrill 控制。
   这两条规则保留给练习页内可能出现的同类区块。 */
body.focus #drillList{
  max-height:0!important;opacity:0!important;margin:0!important;padding:0!important;
  overflow:hidden!important;pointer-events:none!important;border:0!important}
.hero, #board, #todayReport, #taskList{transition:max-height .22s ease,opacity .22s ease,margin .22s ease}`,
'折叠规则收敛到练习页'
);

/* ---- 2. 完成一项后重画练习页外壳 ---- */
must(
`  $('runner').innerHTML = msg + focusBackBtn();
  renderToday();
  paintFocusBar();
  onTaskDone();
}`,
`  $('runner').innerHTML = msg + focusBackBtn();
  renderToday();
  paintFocusBar();
  /* 成绩单要留在屏幕上给用户看，所以这里不能把 runner 清空。
     但外壳得重画 —— 不然 drillList 保持隐藏、focusBar 显示「进行中」，
     用户点「返回今日看板」之后回到练习页会看到一片空白。 */
  drillStarted = true;
  renderDrillChrome();
  onTaskDone();
}`,
'finishRun 重画外壳'
);

must(
`function bindFocusBack(){
  var b = $('focusBack');
  if (!b) return;
  b.onclick = function(){
    exitFocus();
    $('runner').innerHTML = '';
    run = null; quiz = null;
    drillStarted = false;
    renderToday();
    var tb = document.querySelector('.tabbar button[data-v="today"]');
    if (tb) tb.onclick.call(tb);
  };
}`,
`function bindFocusBack(){
  var b = $('focusBack');
  if (!b) return;
  b.onclick = function(){
    exitFocus();
    $('runner').innerHTML = '';
    run = null; quiz = null;
    drillStarted = false;
    renderToday();
    var tb = document.querySelector('.tabbar button[data-v="today"]');
    if (tb) tb.onclick.call(tb);
  };
}
/* 只重画练习页外壳（任务卡/完成提示），**不动 runner**。
   成绩单阶段必须保留 runner 里的内容，否则用户刚做完就看到空白，
   会以为白做了 —— 这是拆分时最容易踩的一步。 */
function renderDrillChrome(){
  var L = $('drillList');
  if (!L) return;
  if (run || quiz) return;
  var wasHidden = L.style.display === 'none';
  L.style.display = wasHidden ? 'none' : '';
  if (!wasHidden) return;
  /* 列表原本是隐藏的（练习中），现在练习结束 → 展开并显示完成提示 */
  L.style.display = '';
  drillStarted = true;
  renderDrill();
  var sb = $('drillSub');
  if (sb) sb.textContent = '继续练';
}`,
'新增 renderDrillChrome'
);

/* ---- 3. finishQuiz 同样要重画外壳（漏了会导致测验做完后返回按钮失效） ---- */
must(
`  $('runner').innerHTML = '<div class="okbox">测验完成：<b>' + D.st.quiz.score + ' 分</b>（' + D.st.quiz.right + ' / ' + D.st.quiz.n + '）</div>' + focusBackBtn();
  renderToday();
  paintFocusBar();
  onTaskDone();
}`,
`  $('runner').innerHTML = '<div class="okbox">测验完成：<b>' + D.st.quiz.score + ' 分</b>（' + D.st.quiz.right + ' / ' + D.st.quiz.n + '）</div>' + focusBackBtn();
  renderToday();
  paintFocusBar();
  drillStarted = true;
  renderDrillChrome();
  onTaskDone();
}`,
'finishQuiz 重画外壳'
);

fs.writeFileSync(F, s, 'utf8');
console.log('✓ 已打 ' + n + ' 处补丁  ' + before + ' → ' + s.length + ' 字节');
