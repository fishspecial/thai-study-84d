/* 找出 index.html 里重复定义的 CSS 选择器。
 *
 * 为什么要查：同一条规则写两遍，后写的会覆盖先写的。
 * 值相同 → 功能无害，但一旦以后只改其中一处，就会出现「改了没效果」的灵异事件。
 * 这轮美化把 CSS 拆成好几段插进已有样式表，很容易留下重复。
 *
 * 用法：node tools/css-dup.js
 */
const fs = require('fs');
const path = require('path');

const html = fs.readFileSync(path.resolve(__dirname, '..', 'index.html'), 'utf8');

/* 取出所有 <style> 块 */
const blocks = [];
const re = /<style[^>]*>([\s\S]*?)<\/style>/gi;
let m;
while ((m = re.exec(html))) {
  blocks.push({ at: m.index, css: m[1], startLine: html.slice(0, m.index).split('\n').length });
}
console.log('<style> 块数: ' + blocks.length + '\n');

/* 极简 CSS 解析：够用来数选择器出现次数，不追求完整标准 */
function scan(css, offsetLine, out, scope) {
  const clean = css.replace(/\/\*[\s\S]*?\*\//g, '');
  let i = 0;
  while (i < clean.length) {
    const open = clean.indexOf('{', i);
    if (open < 0) break;
    let sel = clean.slice(i, open);
    /* 回溯到上一个 } 或块首，去掉声明残留 */
    const cut = Math.max(sel.lastIndexOf('}'), sel.lastIndexOf(';'));
    if (cut >= 0) sel = sel.slice(cut + 1);
    sel = sel.replace(/\s+/g, ' ').trim();
    const line = offsetLine + clean.slice(0, open).split('\n').length;
    let nextScope = scope;

    /* at-rule：先记下媒体查询条件，递归进去时换作用域。
       不区分作用域就会把「:root 浅色一份 + 深色一份」报成重复，
       然后逼着人把深色模式删掉 —— 第一版就踩了这个坑。 */
    const at = sel.match(/^@([a-z-]+)\s*(.*)$/i);
    if (at) {
      const cond = (at[2] || '(default)').trim();
      nextScope = scope + '@' + at[1].toLowerCase() + '(' + cond + ')';
      /* 找到配对的 } */
      let d = 1, j = open + 1;
      while (j < clean.length && d > 0) {
        if (clean[j] === '{') d++;
        else if (clean[j] === '}') d--;
        j++;
      }
      const body = clean.slice(open + 1, j - 1);
      /* 嵌套 at-rule（如 @media 里的 @supports）递归 */
      scan(body, line, out, nextScope);
      i = j;
      continue;
    }

    /* 关键：以「完整选择器串」为 key，而不是拆开的单个选择器。
       `html,body{margin:0}` 和 `body{background:...}` 是两条互补规则，
       body 出现在两处完全正常 —— 按单名统计会误报。
       真正要抓的是同一条完整选择器被写了两遍（后写的覆盖先写的）。 */
    const key = scope + '||' + sel;
    if (!out[key]) out[key] = [];
    out[key].push({ scope: scope, line: line, full: sel });

    /* 跳到配对的 } —— 用计数，应对可能存在的嵌套 */
    let depth = 1, j = open + 1;
    while (j < clean.length && depth > 0) {
      if (clean[j] === '{') depth++;
      else if (clean[j] === '}') depth--;
      j++;
    }
    i = j;
  }
}

const map = {};
blocks.forEach(b => scan(b.css, b.startLine, map, 'root'));

const dups = Object.keys(map).filter(k => map[k].length > 1)
  .map(k => ({ key: k, sel: k.split('||')[1], hits: map[k] }))
  .sort((a, b) => b.hits.length - a.hits.length);

if (!dups.length) {
  console.log('没有同作用域重复的选择器。');
  process.exit(0);
}

console.log('同作用域重复的选择器: ' + dups.length + ' 条\n');
dups.forEach(d => {
  console.log('  ' + d.sel + '   出现 ' + d.hits.length + ' 次   [作用域: ' + d.hits[0].scope + ']');
  d.hits.forEach(h => console.log('    行 ' + h.line + '   完整选择器: ' + h.full));
});
console.log('\n注意：不同 @media 下的同名选择器是有意的响应式覆盖，不算重复。');
console.log('\n注：@media 内的同名规则如果值不同是有意的（响应式覆盖），');
console.log('    只有在值完全相同时才是冗余。逐条对照后再删。');
