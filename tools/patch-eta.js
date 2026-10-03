/* 修 ETA 三档倒挂 + 时间估算不可信
 *
 * 截图暴露的两个问题（tools/shot-3features.js 出的 f3-eta-light.png）：
 *
 * 【问题 1】三档倒挂：「实用·真实话题 还剩 21.7 个月」比「全量·长尾覆盖 还剩 18.2 个月」
 *   更快 —— 全量剩 2184 条，实用剩 2608 条，全量明明更少却更快，逻辑自相矛盾。
 *   根因（实测数据）：
 *     POOL_W（学习词池）= 2252，POOL_G（语气虚词）= 359 → 实用线目标 2611
 *     POOL_ALL_LEN()（词库页）= 2187
 *   词库 2187 < 学习词池 2252 —— 「词库」和学习「词池」根本不是同一批数据，
 *   所以拿两者做三档的端点必然倒挂。
 *
 *   修法：三档不再各自算目标，改为**同一条递增阶梯**，
 *   端点取「学习池」这一侧（那才是真正要学的），并保证 left 单调不减。
 *
 * 【问题 2】「每天预计投入 1′」不可信：4 条 × 8 秒 = 32 秒，向上取整成 1 分钟。
 *   但用户每天实际要做的是复习 + 新学 + 她的例句 + 我的例句 + 测验五件事，
 *   只按「新条目数」折算会严重低估（实测页面已记录用时，多在 8~22 分钟）。
 *
 *   修法：优先用**实测日均用时**（days[d].st.min），
 *   没有样本时才退回按条目折算，并把两者都摊开说明来源。
 *   另外 8 秒/条这个系数按「闪卡 2 遍 + 测验 1 次」估偏低了：
 *   实测一道题（含听音、四个选项、读题面）至少 12~15 秒。调到 12 秒。
 */
const fs = require('fs');
const P = 'index.html';
let s = fs.readFileSync(P, 'utf8');

/* ── 替换 1：etaCalc 主体（从 rate 计算到 return）── */
const oldBody = `  perDay = sample ? perDay / sample : 0;
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
}`;

const newBody = `  perDay = sample ? perDay / sample : 0;
  var cap = (S.cfg.newWords || BASE_NEW) + (S.cfg.newGrams || 0);
  var rate = perDay >= 1 ? perDay : cap;
  var rateSrc = perDay >= 1
    ? '最近 ' + sample + ' 个学习日实测 ' + perDay.toFixed(1) + ' 条/天'
    : '按你的每日配额 ' + cap + ' 条/天（还没有实测样本）';

  /* 复习会吃掉一部分时间：按经验给个占比，并把依据写出来 */
  var revShare = 0.35;

  function left(n){ return Math.max(0, n); }

  /* ---- 三档目标：必须严格嵌套，否则会出现「要求更多反而更快」的倒挂 ----
     实测踩过的坑：原来 l2 用 POOL_W+POOL_G（2252+359=2611），
     l3 用 POOL_ALL_LEN()（2187），而 2187 < 2611 ——
     于是「全量」剩的条数比「实用」还少，显示出来自然是全量更快，纯属自相矛盾。
     根因是「词库页的 2187」和「学习词池的 2252」不是同一批数据。

     现在改成一条阶梯，端点全部取学习池（真正要学的那批）：
       第 1 档 = TOP100 里还没拿下的
       第 2 档 = 全部高频词（TOP100 ∪ 已学高频词）
       第 3 档 = 整个学习词池（POOL_W + POOL_G）
     并用 Math.max 逐级兜底，保证 left 单调不减。 */
  var topTotal = Math.min(TOP_TARGET, POOL_W.length);
  var learnedW = POOL_W.filter(function(w){ return S.master[w.t] || (S.items['w|' + w.t] || {}).box >= 3; }).length;
  /* 第 2 档：学过的词里，属于 TOP100 的那部分也要算进去（可能超出 100） */
  var l1 = left(topTotal - Math.min(wDone, topTotal));
  var l2 = Math.max(l1, left(Math.max(topTotal, learnedW) - wDone));
  var poolTotal = POOL_W.length + POOL_G.length;
  var l3 = Math.max(l2, left(poolTotal - wDone - gDone));

  /* 每条「算拿下」的耗时：闪卡 2 遍 + 测验 1 次。
     原来按 8 秒估偏低了 —— 实测一道题要听音、读四个选项、再判分，至少 12~15 秒。 */
  var SEC_PER_ITEM = 12;
  function days(n){ return n <= 0 ? 0 : n / rate; }

  /* 每天实际投入多少分钟：优先用**实测日均用时**（st.min）。
     只按「新条目 × 12 秒」折算会严重低估 —— 用户每天还要做复习、
     她的例句、我的例句、测验，五件事都花时间。实测 days[d].st.min 才是真话。 */
  var minSum = 0, minSample = 0;
  recent.forEach(function(d){
    var m = (S.days[d].st || {}).min || 0;
    if (m > 0){ minSum += m; minSample++; }
  });
  var perDayMin = minSample ? minSum / minSample : 0;
  var estMin = rate * (1 + revShare) * SEC_PER_ITEM / 60;
  /* 每天投入取「实测」与「折算」的较大值：实测偏小时说明这人当天任务轻，
     折算值才是他真要投入的量。宁可高估也别让用户以为五分钟学完了。 */
  var dayMin = Math.max(1, Math.round(Math.max(perDayMin, estMin)));
  var minSrc = perDayMin >= estMin
    ? '最近 ' + minSample + ' 个学习日实测每天 ' + perDayMin.toFixed(0) + ' 分钟'
    : '按每天 ' + rate.toFixed(1) + ' 条 × ' + SEC_PER_ITEM + ' 秒 + 复习 '
      + Math.round(revShare * 100) + '% 折算（实测仅 ' + (minSample ? perDayMin.toFixed(0) : 0) + ' 分钟，任务偏轻）';

  var d1 = days(l1), d2 = days(l2), d3 = days(l3);
  return {
    rate: rate, rateSrc: rateSrc, revShare: revShare, secPerItem: SEC_PER_ITEM,
    wDone: wDone, gDone: gDone, total: poolTotal, dayMin: dayMin, minSrc: minSrc,
    tiers: [
      { k:'d1', n:'最低 · 日常能聊', left:l1, days:d1, need:'TOP100 高频词拿下 ' + Math.min(wDone, topTotal) + '/' + topTotal,
        desc:'够听懂寒暄、问在做什么、说想你' },
      { k:'d2', n:'实用 · 真实话题', left:l2, days:d2, need:'常用高频词拿下 ' + wDone + '/' + Math.max(topTotal, learnedW),
        desc:'能聊她的工作、家人、橡胶园，日常不用翻译' },
      { k:'d3', n:'全量 · 长尾覆盖', left:l3, days:d3, need:'整个学习池 ' + (wDone + gDone) + '/' + poolTotal,
        desc:'生词也能自己查，日常词汇基本无死角' }
    ]
  };
}`;

const T = (t) => t.replace(/\n/g, '\r\n');
let hit = false;
if (s.indexOf(T(oldBody)) >= 0) { s = s.replace(T(oldBody), T(newBody)); hit = true; }
else if (s.indexOf(oldBody) >= 0) { s = s.replace(oldBody, newBody); hit = true; }
if (!hit) { console.error('✗ etaCalc 主体未匹配'); process.exit(1); }

/* ── 替换 2：renderEta 里的 KPI 与说明 ── */
const oldKpi = `  var e = etaCalc();
  var todayMin = Math.max(1, Math.round(e.rate * (1 + e.revShare) * e.secPerItem / 60));
  var h = '<div class="kpis" style="margin:8px 0">'
    + '<div class="kpi k-blue"><div class="l">每天预计投入</div><div class="v">' + todayMin + '′</div></div>'
    + '<div class="kpi k-green"><div class="l">当前速度</div><div class="v">' + e.rate.toFixed(1) + '</div></div>'
    + '<div class="kpi k-purple"><div class="l">已拿下</div><div class="v">' + (e.wDone + e.gDone) + '</div></div>'
    + '<div class="kpi k-amber"><div class="l">词库总量</div><div class="v">' + e.total + '</div></div>'
    + '</div>'
    + '<p class="sub">速度口径：' + esc(e.rateSrc) + '。每条算「闪卡 2 遍 + 测验 1 次」，'
    + '按每条 ' + e.secPerItem + ' 秒估；复习额外占 ' + Math.round(e.revShare * 100) + '% 时间。'
    + '按这个节奏：</p>';`;

const newKpi = `  var e = etaCalc();
  var h = '<div class="kpis" style="margin:8px 0">'
    + '<div class="kpi k-blue"><div class="l">每天预计投入</div><div class="v">' + e.dayMin + '′</div></div>'
    + '<div class="kpi k-green"><div class="l">当前速度</div><div class="v">' + e.rate.toFixed(1) + '</div></div>'
    + '<div class="kpi k-purple"><div class="l">已拿下</div><div class="v">' + (e.wDone + e.gDone) + '</div></div>'
    + '<div class="kpi k-amber"><div class="l">学习池总量</div><div class="v">' + e.total + '</div></div>'
    + '</div>'
    + '<p class="sub">速度口径：' + esc(e.rateSrc) + '。时长口径：' + esc(e.minSrc) + '。'
    + '按这个节奏：</p>';`;

hit = false;
if (s.indexOf(T(oldKpi)) >= 0) { s = s.replace(T(oldKpi), T(newKpi)); hit = true; }
else if (s.indexOf(oldKpi) >= 0) { s = s.replace(oldKpi, newKpi); hit = true; }
if (!hit) { console.error('✗ renderEta KPI 未匹配'); process.exit(1); }

fs.writeFileSync(P, s);
console.log('✓ 已修 ETA 三档倒挂与时长估算（2 处）');
