/* 二分定位主脚本的语法错误行 */
const fs = require('fs');
const s = fs.readFileSync(__dirname + '/../index.html', 'utf8');
const blocks = [...s.matchAll(/<script>([\s\S]*?)<\/script>/g)].map(m => m[1]);
const b = blocks[1];
const lines = b.split('\n');
console.log('主脚本 ' + lines.length + ' 行');

/* 逐行累加，找到第一个让解析失败的位置。
   注意：解析失败可能是因为块未闭合（函数体外多一个 }），
   所以每步都补足够的右括号再试。 */
function tryParse(text, pad) {
  try { new Function(text + '\n' + '}'.repeat(pad)); return true; }
  catch (e) { return /Invalid or unexpected token/.test(e.message) ? 'token' : (e instanceof SyntaxError ? 'other' : true); }
}

let lo = 0;
for (let L = 1; L <= lines.length; L++) {
  const r = tryParse(lines.slice(0, L).join('\n'), 3);
  if (r === 'token') {
    console.log('首个出错行: ' + L);
    for (let k = Math.max(0, L - 4); k < Math.min(lines.length, L + 2); k++) {
      console.log((k + 1 === L ? '>>> ' : '    ') + (k + 1) + ': ' + lines[k]);
    }
    break;
  }
}
