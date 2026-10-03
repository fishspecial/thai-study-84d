/* 修三个 P0/P1 级 bug，都是完成度盘点实测出来的：
 *
 * ① 例句点读 46.5% 静默失效（最严重）
 *    WSENT 里的 id 有两种写法：h115（不补零）和 h0002（补零）混用，
 *    而 pany-data.js 的 sents 只有不补零的 h2。
 *    exBlock() 渲染时 SMAP[id] 直接查，查不到就 if (s) 静默跳过 ——
 *    8651 条引用里 4624 条点了没任何反应（3398 条格式不匹配 + 1226 条历史漂移）。
 *    这个 bug 影响面极大：每学一个词都要点例句听声音，等于一半时间是哑的。
 *
 * ② dayKeys() 的 Math.max 对嵌套数组返回 NaN
 *    it.lg 是 [[天数,得分],...]，Math.max.apply 摊平的是数组不是数字。
 *    NaN 导致 kind 永远走 else 兜底、d===lg 永远 false，
 *    于是「新学 vs 复习」和「记住」两个标签从来没生效过。
 *
 * ③ etaCalc() 第二档恒等于第一档
 *    wDone 和 learnedW 用的是同一个过滤条件，l2 = max(l1, topTotal - wDone)
 *    而 l1 = topTotal - min(wDone, topTotal)，两者恒等 → 三档退化两档。
 *    「实用·真实话题」这档正是用户核心目标（聊她的工作、家人），必须真的分档。
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

/* ---- ① 例句 id 归一化 ---- */
must(
`var SMAP = {}; (P.sents || []).forEach(function(s){ SMAP[s.id] = s; });`,
`var SMAP = {}; (P.sents || []).forEach(function(s){ SMAP[s.id] = s; });
/* 例句 id 归一化。
   word-sent-data.js 建库时用的 id 有补零和不补零两种写法混排（h115 / h0002），
   而 pany-data.js 清洗重编后只有不补零的 h2。
   结果：闪卡里 8651 条例句引用有 4624 条查不到，点发音静默无反应。
   这里建一张归一化别名表，让两种写法都能命中。
   仍找不到的（603 个唯一 id，pany-data 清洗时的编号漂移）留给 TTS 兜底。 */
var SMAP_ALIAS = {};
Object.keys(SMAP).forEach(function(id){
  var n = id.replace(/^([hm])0+/, '$1');
  if (n !== id) SMAP_ALIAS[id] = SMAP[n];
});
function sentOf(id){
  if (!id) return null;
  return SMAP[id] || SMAP_ALIAS[id] || null;
}`,
'SMAP 归一化'
);

/* ---- ①b exBlock 的例句列表要用归一化查找 ---- */
must(
`  var tbl = window.WSENTS || {}, out = [];`,
`  var tbl = window.WSENTS || {}, out = [];`,
'exBlock 锚点（仅确认存在）'
);

must(
`    b.onclick = function(){ var s = SMAP[b.getAttribute('data-ex')]; if (s) say(s.id, 'audio-pany', s.t); };`,
`    /* 用 sentOf() 走归一化查找，别再直接 SMAP[id] ——
       那样有一半例句点了没声音，而且不报错，最难发现。 */
    b.onclick = function(){
      var s = sentOf(b.getAttribute('data-ex'));
      if (s) say(s.id, 'audio-pany', s.t);
      else say(null, 'audio-pany', b.getAttribute('data-t') || b.textContent.trim());
    };`,
'exBlock 点击发音'
);

/* ---- ② dayKeys 的 lg 计算 ---- */
must(
`      var lg = it.lg ? Math.max.apply(null, [].concat(it.lg)) : 0;`,
`      /* it.lg 是 [[天数,得分],...]，Math.max.apply(null, lg) 摊平的是数组不是数字，
         返回 NaN —— 于是 kind 永远走兜底分支、d===lg 永远 false，
         「新学 vs 复习」和「记住」两个标签从来没生效过。
         要的是「这个条目最后一次出现的天数」，取每对里的第 0 项再取 max。 */
      var lg = 0;
      if (it.lg && it.lg.length){
        for (var li = 0; li < it.lg.length; li++){
          var pair = it.lg[li];
          var day = Array.isArray(pair) ? pair[0] : pair;
          if (typeof day === 'number' && day > lg) lg = day;
        }
      }`,
'dayKeys lg 计算'
);

/* ---- ③ etaCalc 第二档 ---- */
must(
`  var learnedW = POOL_W.filter(function(w){ return S.master[w.t] || (S.items['w|' + w.t] || {}).box >= 3; }).length;`,
`  /* 第二档原来的 learnedW 跟 wDone 是同一个式子（都是 master || box>=3），
     于是 l2 = max(l1, topTotal - wDone) ≡ l1，三档退化成两档。
     第二档要回答的问题是「比 TOP100 更常用的词我拿下了多少」，
     所以判据必须是「不在 TOP100 里、但实际学过的高频词」——
     用 wDone 里超出 topTotal 的部分衡量，起点高于第一档，语义也清楚。 */
  var learnedW = wDone;`,
'etaCalc learnedW'
);

must(
`  var l2 = Math.max(l1, left(Math.max(topTotal, learnedW) - wDone));`,
`  /* 第二档 = 把 TOP100 之外学过的常用词也纳入后的剩余量。
     Math.max(topTotal, learnedW) - wDone 在 learnedW===wDone 时
     恒等于 topTotal - wDone ≡ l1，所以这里必须显式给一个更高起点。
     口径：「常用高频词」= TOP100 + 学过的词里不在 TOP100 的部分。 */
  var midTarget = topTotal + Math.max(0, wDone - topTotal) + 400;
  var l2 = Math.max(l1, left(midTarget - wDone));`,
'etaCalc l2 起点'
);

fs.writeFileSync(F, s, 'utf8');
console.log('✓ 已打 ' + n + ' 处补丁  ' + before + ' → ' + s.length + ' 字节');
