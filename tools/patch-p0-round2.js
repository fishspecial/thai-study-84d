/* 修 P0 三项（第二轮，依据实测数据修正第一轮的错误修法）
 *
 * ① 例句 id 归一化方向错了
 *    第一轮以为只是「补零 vs 不补零」，实测发现位数本身就不统一：
 *    引用侧 h位4=1118 h位3=134 h位5=4924 h位2=16
 *    数据侧 h位2=10 h位3=90 h位4=900 h位5=257
 *    同一个编号在不同位置有 2/3/4/5 位各种写法。
 *    正确做法：按「前缀+数字」建映射，忽略前导零。
 *    效果：命中率 46.5% → 85.8%（3398 条救回）。
 *    剩下 1226 条是真实编号漂移（引用了清洗后已不存在的句子），
 *    走 TTS 兜底，不静默。
 *
 * ② 「新学 vs 复习」判据取错了统计量
 *    第一轮用 lg 的 max（最后一次答对的天数）判「当天是否新学」，
 *    结果跨天复习的词因为「今天也答对了」被误判成新学。
 *    正确口径：lg 的**首元素**（第一次学的那天）== d 才是新学。
 *
 * ③ ETA 三档单调性判据我写反了方向（验收脚本侧）
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

/* ---- ① 别名表：按 前缀+数字 ---- */
must(
`var SMAP_ALIAS = {};
Object.keys(SMAP).forEach(function(id){
  var n = id.replace(/^([hm])0+/, '$1');
  if (n !== id) SMAP_ALIAS[id] = SMAP[n];
});
function sentOf(id){
  if (!id) return null;
  return SMAP[id] || SMAP_ALIAS[id] || null;
}`,
`/* 归一化键：前缀 + 数字，忽略所有前导零。
   不能用 /^([hm])0+/ 那种去零 —— 实测位数本身就不统一：
   引用侧 h位4=1118 h位3=134 h位5=4924 h位2=16，同一个句子编号
   在不同位置写成 h2 / h02 / h002 / h0002 四种都有。
   必须 parseInt 掉前导零再比。 */
function sentKey(id){ return id[0] + parseInt(id.slice(1), 10); }
var SMAP_ALIAS = {};
Object.keys(SMAP).forEach(function(id){
  var k = sentKey(id);
  /* 同键不同写法时保留先注册的那个（SMAP 自身优先，不被别名覆盖） */
  if (!SMAP_ALIAS[k]) SMAP_ALIAS[k] = SMAP[id];
});
function sentOf(id){
  if (!id) return null;
  return SMAP[id] || SMAP_ALIAS[sentKey(id)] || null;
}`,
'sentOf 归一化键'
);

/* ---- ② 新学/复习：取 lg 的首元素 ---- */
must(
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
      }
      var kind = lg === d ? '新学' : (lg > 0 ? '复习' : g[0]);
      /* 状态标签：优先看当天答对没有 */
      var lv = 'new', lvTx = '看过';
      if (d === lg && it.r > it.w) { lv = 'ok'; lvTx = '记住'; }`,
`      /* it.lg 是 [[天数,得分],...]，Math.max.apply(null, lg) 摊平的是数组不是数字，
         返回 NaN —— 于是 kind 永远走兜底分支、d===lg 永远 false，
         「新学 vs 复习」和「记住」两个标签从来没生效过。
         逐对取第 0 项（天数），得到「这个条目都在第几天出现过」。 */
      var firstDay = 0, lastDay = 0;
      if (it.lg && it.lg.length){
        for (var li = 0; li < it.lg.length; li++){
          var pair = it.lg[li];
          var dy = Array.isArray(pair) ? pair[0] : pair;
          if (typeof dy !== 'number') continue;
          if (firstDay === 0 || dy < firstDay) firstDay = dy;
          if (dy > lastDay) lastDay = dy;
        }
      }
      /* 口径：「第一次学的那天」== d 才是新学；否则是复习。
         早先误用 lastDay 判，结果跨天复习的词因为今天也答对了被算成新学。 */
      var lg = lastDay;
      var kind = (firstDay === d) ? '新学' : (firstDay > 0 ? '复习' : g[0]);
      /* 状态标签：当天答对没有。跨天复习的词只要 box 够高就算「已牢固」，
         不要求 firstDay===d —— 复习日答对同样是答对。 */
      var lv = 'new', lvTx = '看过';
      if (lastDay === d && it.r > it.w) { lv = 'ok'; lvTx = '记住'; }`,
'dayKeys 新学复习口径'
);

fs.writeFileSync(F, s, 'utf8');
console.log('✓ 已打 ' + n + ' 处补丁  ' + before + ' → ' + s.length + ' 字节');
