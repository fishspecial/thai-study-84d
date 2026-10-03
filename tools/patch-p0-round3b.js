/* 第二批：dayScoreOf 权重归一 + drill() 补 goDrill + 闪卡分只算真做过的 */
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

/* ---- dayScoreOf：只对真做过的项计分，权重归一 ---- */
must(
`function dayScoreOf(d){
  var a = S.days[d].st;
  var card = (((a.rev && a.rev.score) || 0) + ((a.new && a.new.score) || 0)) / (((a.rev?1:0)+(a.new?1:0)) || 1);
  return Math.round(0.25*card + 0.35*((a.quiz && a.quiz.score)||0) + 0.20*((a.read&&a.read.score)||0) + 0.20*((a.out&&a.out.score)||0));
}`,
`function dayScoreOf(d){
  var a = S.days[d].st;
  /* 只对真正做过的项计分，权重按实际项数归一。
     原式用固定权重 0.25/0.35/0.20/0.20，缺项时：
       - skip 标记的项（今天没这项内容）score 已被置 null，||0 会算成 0 分
       - 缺项的项同样算 0 分，等于凭空扣分
     两种都会让分数失真：Day 1 因 rev 空壳（曾经记 100 分）虚高，
     现在改成 skip 后又变成偏低。归一之后「做了几项就按几项算」。 */
  function sc(k){
    var t = a[k];
    if (!t || t.skip || !(t.n > 0)) return null;   // 空壳 / 没做 → 不计
    return (t.score || 0);
  }
  var parts = [];
  var cards = [sc('rev'), sc('new')].filter(function(x){ return x !== null; });
  if (cards.length) parts.push([0.25, cards.reduce(function(a2, b){ return a2 + b; }, 0) / cards.length]);
  [['quiz',0.35],['read',0.20],['out',0.20]].forEach(function(p){
    var v = sc(p[0]);
    if (v !== null) parts.push([p[1], v]);
  });
  if (!parts.length) return 0;
  var sum = parts.reduce(function(a2, p){ return a2 + p[0] * p[1]; }, 0);
  var wsum = parts.reduce(function(a2, p){ return a2 + p[0]; }, 0);
  return wsum ? Math.round(sum / wsum) : 0;
}
/* 今天做了哪几项 —— 给「闪卡分」显示用：只平均真做过的两项，
   别把空壳的 0 分和真做的 80 分平均成 40。 */
function cardScoreOf(d){
  var a = S.days[d].st, got = [];
  ['rev','new'].forEach(function(k){
    var t = a[k];
    if (t && !t.skip && t.n > 0) got.push(t.score || 0);
  });
  return got.length ? Math.round(got.reduce(function(x, y){ return x + y; }, 0) / got.length) : 0;
}`,
'dayScoreOf 权重归一'
);

/* ---- drill() 补 goDrill + enterFocus ---- */
must(
`function drill(keys, label){
  if (!keys || !keys.length){ toast('没有可练的条目'); return; }
  run = { kind: 'rev', keys: keys.slice(0, 60), i: 0, right: 0, half: 0, wrong: 0, show: false, t0: Date.now() };
  renderRun();
  toast(label + '：' + keys.length + ' 条');
  $('runner').scrollIntoView({ behavior: 'smooth', block: 'start' });
}`,
`/* 从今日页的「今天学了什么」触发的定向练习。
   必须和 startCard() 一样补上 enterFocus + goDrill ——
   #runner 在 #v-drill 里，而 .view{display:none}，不切 view 的话
   卡片写进隐藏容器，用户看到的是「点了完全没反应」，只有一句 2 秒 toast。 */
function drill(keys, label){
  if (!keys || !keys.length){ toast('没有可练的条目'); return; }
  run = { kind: 'rev', keys: keys.slice(0, 60), i: 0, right: 0, half: 0, wrong: 0, show: false, t0: Date.now() };
  enterFocus('rev');
  renderRun();
  drillStarted = true;
  goDrill();
  toast(label + '：' + Math.min(keys.length, 60) + ' 条');
}`,
'drill 补 goDrill'
);

fs.writeFileSync(F, s, 'utf8');
console.log('✓ 已打 ' + n + ' 处补丁  ' + before + ' → ' + s.length + ' 字节');
