/* P1 修复：btnPlan 改了 S.start 不重算 S.day / D；btnReset2 不清词库标记
 *
 * ① btnPlan：`if (o.day) S.start = addDays(today(), 1 - o.day);`
 *    改了起始日却没重算 S.day 和 D。于是：
 *      - 顶栏「第 N 天」还是旧数字
 *      - D 还指着旧的那天，任务卡、进度、打卡全写到错的一天
 *      - 旁边 btnBak 导入存档时做了 `S.day = ...; D = getDay(S.day)`，
 *        同一段代码里两个按钮一个做了一個没做 —— 典型的「改了一处忘了另一处」。
 *
 * ② `o.day` 没有校验：`{"day": -5}` 会把 S.start 推到 5 天后，
 *    diffDays 变负数，被 Math.max(1, ...) 夹到 Day 1，看起来「回到第一天」，
 *    但 S.start 已经在未来，于是之后每一天 diffDays 都是负的 → 永远 Day 1，
 *    用户卡死在 Day 1 且没有任何提示。`{"day": "abc"}` 更糟：addDays 收到 NaN。
 *
 * ③ btnReset2「清空记录」只 localStorage.removeItem(KEY)，
 *    没清 thaiwordbook-v1 —— 词库里手动标记的「已掌握」会复活，
 *    用户清空记录后发现词库的打勾还在，于是新计划里这些词全被跳过。
 */
const fs = require('fs');
const path = require('path');
const F = path.join(__dirname, '..', 'index.html');
let s = fs.readFileSync(F, 'utf8');
let n = 0;
function must(from, to, label) {
  const a = s.includes(from);
  const b = s.includes(from.replace(/\r\n/g, '\n').replace(/\n/g, '\r\n'));
  if (!a && !b) { console.error('✘ 找不到锚点：' + label); process.exit(1); }
  s = s.replace(a ? from : from.replace(/\r\n/g, '\n').replace(/\n/g, '\r\n'), to);
  n++; console.log('  ✓ ' + label);
}

/* ---- ① ② btnPlan ---- */
must(
`  try { var o = JSON.parse(v);
    if (o.plan) for (var k in o.plan) if (k in S.cfg) S.cfg[k] = o.plan[k];
    if (o.focus) S.focus = o.focus;
    if (o.day) S.start = addDays(today(), 1 - o.day);
    save(); renderToday(); renderMe(); toast('方案已应用');
  } catch(e){ toast('JSON 格式不对'); }`,
`  try { var o = JSON.parse(v);
    if (o.plan) for (var k in o.plan) if (k in S.cfg) S.cfg[k] = o.plan[k];
    if (o.focus) S.focus = o.focus;
    /* o.day 必须是正整数。原先只判真值，{"day":-5} 会把 S.start 推到未来，
       diffDays 变负 → 被 Math.max(1,…) 夹住 → 之后永远停在 Day 1 且无任何提示；
       {"day":"abc"} 更是把 NaN 喂给 addDays。 */
    if (o.day != null){
      var nd = Math.floor(Number(o.day));
      if (!isFinite(nd) || nd < 1 || nd > 3650){
        toast('方案里的 day 必须是 1~3650 之间的天数，没应用');
        return;
      }
      S.start = addDays(today(), 1 - nd);
      /* 改了起始日必须重算 S.day 与 D —— 少了这两行，
         顶栏还写旧天数，任务卡/进度/打卡全写到错的那一天。
         btnBak 导入存档时本来就做了这两行，这里对齐。 */
      S.day = Math.max(1, diffDays(S.start, today()) + 1);
      D = getDay(S.day);
    }
    save(); renderToday(); renderMe(); renderDrillChrome();
    toast('方案已应用' + (o.day != null ? ' · 现在是 Day ' + S.day : ''));
  } catch(e){ toast('JSON 格式不对'); }`,
'btnPlan 重算 S.day/D + 校验 day');

/* ---- ③ btnReset2 一并清词库 ---- */
must(
`$('btnReset2').onclick = function(){ if (!confirm('清空全部学习记录？')) return; localStorage.removeItem(KEY); location.reload(); };`,
`$('btnReset2').onclick = function(){
  /* 两个 key 都要清。词库页的「已掌握」打勾存在 thaiwordbook-v1 里，
     只清 thai-daily-v1 的话：学习记录没了，但打勾还在，
     而 buildPlan 会跳过 S.master 里的词 → 用户看到「明明清空了，怎么新计划里
     还是跳过这些词」。这是清空记录后最容易被当成 bug 的现象。 */
  if (!confirm('清空全部学习记录？\n\n包含：学习进度、掌握标记、词库里的「已掌握」打勾。不可撤销。')) return;
  localStorage.removeItem(KEY);
  try { localStorage.removeItem('thaiwordbook-v1'); } catch (e) {}
  location.reload();
};`,
'btnReset2 同时清词库 key');

fs.writeFileSync(F, s);
console.log('\n共应用 ' + n + ' 处');
