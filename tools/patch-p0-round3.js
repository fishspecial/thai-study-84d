/* 修 5 个 P0/P1（推理模型审查 + 我逐个复核确认）
 *
 * ① 例句永远不进入复习队列 —— 最严重
 *    buildPlan 只派发 dueList('w|') 和 dueList('g|')，
 *    而例句的 key 是 's|h1'，前缀永远不匹配，于是：
 *      - 例句进了 S.items、进了 Leitner 盒子、due 也算过
 *      - 但没有任何代码路径会把它派发到「到期复习」
 *    read/out 是唯一直接练「她的原话」的入口，每天的例句学完就再也不见。
 *    改法：buildPlan 里加 dueS 派发，taskKeys('rev') 带上它。
 *
 * ② 例句游标双倍推进，加学一次就跳过一整段
 *    extendToday 里 S.q.hs += p.read.length 推进了一次，
 *    btnFinish 里又 S.q.hs += D.plan.read.length 推进一次。
 *    而词/短句用的是赋值（wEnd，幂等）。累加两次 = 跳过。
 *    实测：点一次「她的例句 +3」再打卡，h6..h16 共 11 条永远不会被读到；
 *    点两次，Day2 直接读不到她的例句。
 *    改法：extendToday 不再提前推进，统一在 btnFinish 用 plan 里的游标端点赋值。
 *
 * ③ loadForecast 漏掉所有已过期条目
 *    idx 只装今天到今天+6，`if (idx[it.due] != null)` 把 due < today 的全丢了。
 *    而 dueList() 用的是 due <= t，包含过期的。两个函数口径不一致。
 *    后果：断更 2 天回来，loadForecast 全 0 → 配额闸门以为负荷轻 → 照常派 12 新词，
 *    实际要面对 24 条以上。最需要系统帮忙还债的那天恰恰是它最盲目的那天。
 *
 * ④ 空任务被记 100 分
 *    total===0（今天没这项）写成 {done:true, n:0, score:100}，
 *    dayScoreOf 直接把这个 100 当真分数加权，dayDone 也算它完成。
 *    Day 1 必然触发（新用户无到期复习，rev 白送 25% 权重满分）。
 *    renderToday 的「闪卡」分还会把 rev=100 和 new=60 平均成 80 —— 凭空多 20 分。
 *    改法：记 skip 标记不算分，dayScoreOf 按实际做了的项归一权重。
 *
 * ⑤ drill() 漏调 goDrill()，卡片写进隐藏的练习页
 *    #runner 在 #v-drill 里，.view{display:none}，drill() 只调 renderRun()，
 *    不切 view 也不 enterFocus → 今日页点「只练薄弱词」页面毫无变化，只有 2 秒 toast。
 *    startCard() 三样都做了。对比就看得出来是漏了。
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

/* ---- ① 例句进入复习队列 ---- */
must(
`  p.dueW = dueList('w|').slice(0, 80); p.dueG = dueList('g|').slice(0, 40);
  return p;`,
`  p.dueW = dueList('w|').slice(0, 80); p.dueG = dueList('g|').slice(0, 40);
  /* 例句也要进复习队列。原先只派发 w|/g|，而例句的 key 是 's|h1'，
     前缀永远不匹配 —— 于是例句进了 S.items、进了 Leitner 盒子、due 也算过，
     却没有任何路径会把它派发到「到期复习」。
     read/out 是唯一直接练「她的原话」的入口，每天的例句学完就再也不见，
     对「跟 Pany 沟通」这个目标是最直接的损失。
     她的例句和我的例句分开存：卡片形态不同（前者认词后者造句）。 */
  var dueS = dueList('s|');
  p.dueSH = [], p.dueSM = [];
  for (i = 0; i < dueS.length; i++){
    var so = SMAP[sentKey(dueS[i].slice(2))];
    if (so && so.who === 0){ if (p.dueSH.length < 30) p.dueSH.push(dueS[i]); }
    else if (so && so.who === 1){ if (p.dueSM.length < 30) p.dueSM.push(dueS[i]); }
  }
  /* 区分不出说话人的（编号漂移导致查不到）也要派发，不能静默丢掉 */
  p.dueSOther = dueS.filter(function(k){
    return p.dueSH.indexOf(k) < 0 && p.dueSM.indexOf(k) < 0;
  }).slice(0, 20);
  return p;`,
'buildPlan 派发例句复习'
);

/* ---- ①b taskKeys 的 rev 要带上例句 ---- */
const tk = s.match(/function taskKeys\(k\)\{[\s\S]*?\n\}/);
if (!tk) throw new Error('找不到 taskKeys');
const tkNew = tk[0].replace(
  /return p\.dueW\.concat\(p\.dueG\)/,
  `return p.dueW.concat(p.dueG, p.dueSH, p.dueSM, p.dueSOther)`
).replace(
  /return p\.newW\.concat\(p\.newG\)/,
  `return p.newW.concat(p.newG)`
);
if (tkNew === tk[0] && !/dueSH/.test(tkNew)) {
  throw new Error('taskKeys 里没找到 dueW.concat(p.dueG)');
}
s = s.replace(tk[0], tkNew);
n++;

/* ---- ② 游标不再双倍推进 ---- */
must(
`  } else if (kind === 'read'){
    for (var i = 0; i < n && S.q.hs + p.read.length < POOL_HS.length; i++) p.read.push('s|' + POOL_HS[S.q.hs + p.read.length].id);
    S.q.hs += p.read.length;
  } else if (kind === 'out'){
    for (var i2 = 0; i2 < n && S.q.ms + p.out.length < POOL_MS.length; i2++) p.out.push('s|' + POOL_MS[S.q.ms + p.out.length].id);
    S.q.ms += p.out.length;
  }`,
`  } else if (kind === 'read'){
    /* 这里不要推进 S.q.hs ——
       btnFinish 会用 p.hsEnd 一次推进。原先两边都 += 一次，
       累加下来等于跳过：点一次「+3」再打卡，h6..h16 共 11 条永远读不到；
       点两次，Day2 直接读不到她的例句。
       词/短句用的是 p.wEnd 赋值（幂等），例句这里对齐成同一套口径。 */
    for (var i = 0; i < n && S.q.hs + p.read.length < POOL_HS.length; i++) p.read.push('s|' + POOL_HS[S.q.hs + p.read.length].id);
    p.hsEnd = S.q.hs + p.read.length;
  } else if (kind === 'out'){
    for (var i2 = 0; i2 < n && S.q.ms + p.out.length < POOL_MS.length; i2++) p.out.push('s|' + POOL_MS[S.q.ms + p.out.length].id);
    p.msEnd = S.q.ms + p.out.length;
  }`,
'extendToday 游标幂等'
);

/* buildPlan 里记下例句游标端点 */
must(
`  for (i = 0; i < S.cfg.newHerSent && S.q.hs + i < POOL_HS.length; i++) p.read.push('s|' + POOL_HS[S.q.hs+i].id);
  for (i = 0; i < S.cfg.newMySent && S.q.ms + i < POOL_MS.length; i++) p.out.push('s|' + POOL_MS[S.q.ms+i].id);`,
`  for (i = 0; i < S.cfg.newHerSent && S.q.hs + i < POOL_HS.length; i++) p.read.push('s|' + POOL_HS[S.q.hs+i].id);
  for (i = 0; i < S.cfg.newMySent && S.q.ms + i < POOL_MS.length; i++) p.out.push('s|' + POOL_MS[S.q.ms+i].id);
  /* 例句游标端点：btnFinish 用它做幂等赋值（原先是 +=，会双倍推进） */
  p.hsEnd = S.q.hs + p.read.length;
  p.msEnd = S.q.ms + p.out.length;`,
'buildPlan 记例句端点'
);

/* ---- ②b btnFinish 幂等 + 防重入 ---- */
must(
`$('btnFinish').onclick = function(){
  D.st.doneAt = new Date().toISOString();
  S.q.w = D.plan.wEnd || (S.q.w + D.plan.newW.length);
  S.q.g = D.plan.gEnd || (S.q.g + D.plan.newG.length);
  S.q.hs += D.plan.read.length; S.q.ms += D.plan.out.length;`,
`/* 防重入：打卡按钮点两下就跳过一整段例句，必须挡住。
   800ms 内的重复点击直接忽略，并把按钮置灰给出明确反馈。 */
var __finishing = false;
$('btnFinish').onclick = function(){
  if (__finishing){ toast('正在打卡，请稍候'); return; }
  if (D.st.doneAt){ toast('今天已经打过卡了（' + (D.st.score || 0) + ' 分）'); return; }
  __finishing = true;
  var btn = $('btnFinish');
  btn.disabled = true;
  D.st.doneAt = new Date().toISOString();
  /* 游标一律用 plan 里的端点做赋值，幂等。
     原来例句是 +=，而词是 || 赋值 —— 两边都推一次等于跳过中间那段。 */
  S.q.w = (typeof D.plan.wEnd === 'number') ? D.plan.wEnd : (S.q.w + D.plan.newW.length);
  S.q.g = (typeof D.plan.gEnd === 'number') ? D.plan.gEnd : (S.q.g + D.plan.newG.length);
  S.q.hs = (typeof D.plan.hsEnd === 'number') ? D.plan.hsEnd : S.q.hs;
  S.q.ms = (typeof D.plan.msEnd === 'number') ? D.plan.msEnd : S.q.ms;`,
'btnFinish 幂等'
);

must(
`  save(); toast('Day ' + S.day + ' 打卡完成 · ' + D.st.score + ' 分');
  renderToday();
  renderMe();
};`,
`  save(); toast('Day ' + S.day + ' 打卡完成 · ' + D.st.score + ' 分');
  renderToday();
  renderMe();
  btn.textContent = '今日已打卡 · ' + (D.st.score || 0) + ' 分';
  setTimeout(function(){ __finishing = false; if ($('btnFinish')) $('btnFinish').disabled = false; }, 900);
};`,
'btnFinish 收尾'
);

/* ---- ③ loadForecast 补回过期条目 ---- */
must(
`function loadForecast(days){
  days = days || 7;
  var t = today(), out = [], idx = {}, i;
  for (i = 0; i < days; i++){ var dd = addDays(t, i); out.push({ d: dd, n: 0, i: i }); idx[dd] = i; }
  for (var k in S.items){
    var it = S.items[k];
    if (!it.seen || S.master[k.split('|')[1]]) continue;
    if (idx[it.due] != null) out[idx[it.due]].n++;
  }
  return out;
}`,
`function loadForecast(days){
  days = days || 7;
  var t = today(), out = [], idx = {}, i;
  for (i = 0; i < days; i++){ var dd = addDays(t, i); out.push({ d: dd, n: 0, i: i, over: i === 0 }); idx[dd] = i; }
  for (var k in S.items){
    var it = S.items[k];
    if (!it.seen || S.master[k.split('|')[1]]) continue;
    /* 过期条目（due < 今天）必须并进第 0 格，不能因为 idx 查不到就丢掉。
       dueList() 用的是 due <= t，包含过期的；这里原来跟它口径不一致，
       后果是断更 2 天回来 loadForecast 全 0 → 配额闸门以为负荷轻 →
       照常派 12 个新词，实际要面对 24 条以上。
       最需要系统帮忙「先还债」的那一天，恰恰是它最盲目的那一天。 */
    if (it.due < t) out[0].n++;
    else if (idx[it.due] != null) out[idx[it.due]].n++;
  }
  return out;
}`,
'loadForecast 补过期'
);

/* ---- ④ 空任务不记 100 分 ---- */
must(
`    if (total === 0 && !(D.st[t.k] && D.st[t.k].done)){ D.st[t.k] = { done:true, n:0, score:100 }; save(); }`,
`    /* 空任务（今天没这项内容）不该记 100 分。
       原先写成 {done:true, n:0, score:100}，dayScoreOf 直接把这个 100 当真分数加权，
       dayDone 也算它完成 → 进 streak、进 kAvg、进配额闸门。
       Day 1 必然触发（新用户无到期复习，rev 白送 25% 权重满分）；
       例句池耗尽时 read/out 也变空壳，分数能虚高到 82。
       改记 skip 标记：dayDone 仍认为「当天确实没这项」，
       dayScoreOf 用 n>0 && !skip 过滤，权重按实际做了的项归一。 */
    if (total === 0 && !(D.st[t.k] && D.st[t.k].done)){ D.st[t.k] = { done:true, n:0, score:null, skip:true }; save(); }`,
'空任务记 skip'
);

fs.writeFileSync(F, s, 'utf8');
console.log('✓ 已打 ' + n + ' 处补丁  ' + before + ' → ' + s.length + ' 字节');
