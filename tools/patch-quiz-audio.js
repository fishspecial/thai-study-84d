/* 精确替换 renderQuiz() 的题面渲染与发音绑定。
 * 为什么要用脚本而不是 Edit：题面里有一行泰文 Unicode 范围正则，
 * 终端显示的字节和文件实际内容对不上，Edit 反复匹配失败。
 * 用「锚点 + 切片」的方式，不碰那行正则。
 */
const fs = require('fs');
const path = require('path');

const F = path.resolve(__dirname, '..', 'index.html');
let s = fs.readFileSync(F, 'utf8');

/* ⚠️ index.html 是 CRLF 行尾。模板字符串必须同样用 \r\n，
   否则第一处匹配就会失败（写这脚本时在这上面卡了一次）。
   统一在这里做转换，模板里仍按 \n 书写。 */
const T = (t) => t.replace(/\n/g, '\r\n');

/* ---- 1. 题面：给四种题型都加发音入口 ---- */
const oldFace = `  var q = quiz.qs[quiz.i], h = '<div class="study"><div class="hint" style="margin-top:0">第 ' + (quiz.i+1) + ' / ' + quiz.qs.length + ' 题</div>';
  if (q.ty === 'th2zh') h += '<div class="q thai">' + esc(q.o.t) + '</div>'
    + (q.o.r ? '<div class="rom">' + esc(q.o.r) + '</div>' : '') + '<div class="hint">什么意思？</div>';
  else if (q.ty === 'zh2th') h += '<div class="a" style="margin-top:6px">' + esc(q.o.z || q.o.e || '') + '</div><div class="hint">泰文怎么说？</div>';
  else if (q.ty === 'audio') h += '<div class="q" style="font-size:26px">🔊</div><div class="hint"><button class="mini" id="qPlay">再播一次</button></div>';
  else h += '<div class="a sm" style="margin-top:6px;font-size:16px">' + esc(q.sent.z) + '</div><div class="hint">泰文是？</div>';`;

const newFace = `  var q = quiz.qs[quiz.i], h = '<div class="study"><div class="hint" style="margin-top:0">第 ' + (quiz.i+1) + ' / ' + quiz.qs.length + ' 题</div>';
  /* 四种题型的发音入口。
     原来只有 audio 题型渲染 #qPlay，另外三种（th2zh / zh2th / sent）
     一个可点读元素都没有 —— 诊断实测「可点读元素」计数全是 0。
     音频文件其实全都在：抽查 t8 / t9 / t6 / m1807 都是 HTTP 200，
     纯粹是页面没给入口。用户原话：「你测验里面的那些句子都没有发音的。」

     zh2th（「泰文怎么说」）作答前不该剧透答案，播放按钮答完才出现；
     th2zh / sent 的泰文本来就在题面上，随时可听。 */
  var playBtn = '<button class="mini" id="qPlay">🔊 发音</button>';
  if (q.ty === 'th2zh') h += '<div class="q thai">' + esc(q.o.t) + '</div>'
    + (q.o.r ? '<div class="rom">' + esc(q.o.r) + '</div>' : '') + '<div class="hint">什么意思？</div>'
    + '<div class="btnrow">' + playBtn + '</div>';
  else if (q.ty === 'zh2th') h += '<div class="a" style="margin-top:6px">' + esc(q.o.z || q.o.e || '') + '</div><div class="hint">泰文怎么说？</div>';
  else if (q.ty === 'audio') h += '<div class="q" style="font-size:26px">🔊</div><div class="hint">' + playBtn + '</div>';
  else h += '<div class="a sm" style="margin-top:6px;font-size:16px">' + esc(q.sent.z) + '</div><div class="hint">泰文是？</div>'
    + '<div class="btnrow">' + playBtn + '</div>';`;

if (s.indexOf(T(oldFace)) < 0) { console.error('✗ 第 1 处未匹配'); process.exit(1); }
s = s.replace(T(oldFace), T(newFace));
console.log('✓ 第 1 处：题面发音入口');

/* ---- 2. 选项区尾部：加 #qAfter 容器（zh2th 答完补按钮用） ---- */
const oldTail = `  h += '</div><div class="btnrow"><button class="mini" id="qQuit">退出</button></div></div>';
  R.innerHTML = h;
  if (q.ty === 'audio') setTimeout(function(){ say(q.o.a, 'audio-pany', q.o.t); }, 200);
  if ($('qPlay')) $('qPlay').onclick = function(){ say(q.o.a, 'audio-pany', q.o.t); };
  $('qQuit').onclick = function(){ quiz = null; renderToday(); R.innerHTML = ''; };`;

const newTail = `  /* #qAfter 是答完后补按钮的容器（zh2th 要等作答完才放发音） */
  h += '</div><div class="btnrow" id="qAfter"></div><div class="btnrow"><button class="mini" id="qQuit">退出</button></div></div>';
  R.innerHTML = h;
  /* 发音目标：例句题用句子的 id，词与虚词用词条自带的 a（目录可能不同） */
  var qFile = (q.ty === 'sent') ? (q.sent ? q.sent.id : null) : (q.o ? q.o.a : null);
  var qDir  = (q.ty === 'sent') ? 'audio-pany' : (q.o ? (q.o.d || 'audio-pany') : 'audio-pany');
  var qText = (q.ty === 'sent') ? (q.sent ? q.sent.t : '') : (q.o ? q.o.t : '');
  var playQ = function(){ say(qFile, qDir, qText); };
  if ($('qPlay')) $('qPlay').onclick = playQ;
  if (q.ty === 'audio') setTimeout(playQ, 200);
  /* th2zh / sent 一进来就自动播一次：这两类题考「认不认识」，
     先听一遍音是做题的前提，不然得先手动点一下才看得下去。 */
  else if (q.ty === 'th2zh' || q.ty === 'sent') setTimeout(playQ, 260);
  $('qQuit').onclick = function(){ quiz = null; renderToday(); R.innerHTML = ''; };`;

if (s.indexOf(T(oldTail)) < 0) { console.error('✗ 第 2 处未匹配'); process.exit(1); }
s = s.replace(T(oldTail), T(newTail));
console.log('✓ 第 2 处：发音绑定与自动播放');

/* ---- 3. 选项点击：zh2th 答完后补播放按钮 ---- */
const oldClick = `      if (v === q.ans){ quiz.right++; if (q.ty !== 'sent') grade(q.key, 1); }
      else { grade((q.ty === 'sent') ? ('s|' + q.sent.id) : q.key, 0); }`;

const newClick = `      /* zh2th 答完立刻补一个播放按钮并自动播一遍。
         选错的人尤其需要听到正确读音 —— 否则这题只留下「我选了个什么」，
         不知道该记住的是哪个音。 */
      if (q.ty === 'zh2th'){
        var ab = $('qAfter');
        if (ab) ab.innerHTML = '<span class="sub" style="align-self:center">正确读音</span>' + playBtn;
        var nb = $('qPlay');
        if (nb) nb.onclick = playQ;
        setTimeout(playQ, 150);
      }
      if (v === q.ans){ quiz.right++; if (q.ty !== 'sent') grade(q.key, 1); }
      else { grade((q.ty === 'sent') ? ('s|' + q.sent.id) : q.key, 0); }`;

if (s.indexOf(T(oldClick)) < 0) { console.error('✗ 第 3 处未匹配'); process.exit(1); }
s = s.replace(T(oldClick), T(newClick));
console.log('✓ 第 3 处：zh2th 答完补发音按钮');

fs.writeFileSync(F, s, 'utf8');
console.log('\n已写入 ' + F + '（' + s.length + ' 字节）');
