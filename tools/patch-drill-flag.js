/* finishRun / finishQuiz 里补 drillAfterDone 标志。
 * 用 Node 而不是 Edit —— 这两处上下文含泰文，Edit 匹配泰文正则容易对不上字节。 */
const fs = require('fs');
const path = require('path');
const F = path.join(__dirname, '..', 'index.html');
let s = fs.readFileSync(F, 'utf8');
let n = 0;

/* 两处 finish 的共同特征：paintFocusBar() 之后紧跟 drillStarted = true; renderDrillChrome(); */
const pairs = [
  [`  paintFocusBar();
  /* 成绩单要留在屏幕上给用户看，所以这里不能把 runner 清空。
     但外壳得重画 —— 不然 drillList 保持隐藏、focusBar 显示「进行中」，
     用户点「返回今日看板」之后回到练习页会看到一片空白。 */
  drillStarted = true;
  renderDrillChrome();`,
   `  paintFocusBar();
  /* 成绩单要留在屏幕上给用户看，所以这里不能把 runner 清空。
     但外壳得重画 —— 不然 drillList 保持隐藏、focusBar 显示「进行中」，
     用户点「返回今日看板」之后回到练习页会看到一片空白。 */
  drillStarted = true;
  drillAfterDone = true;
  renderDrillChrome();`],
  [`  paintFocusBar();
  drillStarted = true;
  renderDrillChrome();
  onTaskDone();
}`,
   `  paintFocusBar();
  drillStarted = true;
  drillAfterDone = true;
  renderDrillChrome();
  onTaskDone();
}`],
];
for (const [a, b] of pairs) {
  const p = s.indexOf(a);
  if (p < 0) throw new Error('锚点未找到');
  if (p !== s.lastIndexOf(a)) throw new Error('锚点不唯一');
  s = s.slice(0, p) + b + s.slice(p + a.length);
  n++;
}
fs.writeFileSync(F, s, 'utf8');
console.log('✓ 已补 ' + n + ' 处 drillAfterDone');
