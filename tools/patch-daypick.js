/* 修 renderDayPick 的双 class 属性 bug。
 *
 * 症状：验收里 dayPick 按钮渲染成「D6 · 6 | D5 今天 · 5」，
 * 但 document.querySelector('#dayPick button.on') 选不中任何按钮。
 *
 * 根因：原来拼字符串时写了两个 class 属性 ——
 *   '<button data-d="5"' + (今天 ? ' class="today"' : '') + (选中 ? ' class="on"' : '') + '>'
 * HTML 解析器遇到第二个 class 时会**丢弃前一个**，只剩 class="on"。
 * 于是「今天」标记（D6 该有）和选中态（D5 刚点过）互相覆盖，
 * 页面上就是「今天那格没标记、选中的那格没高亮」。
 *
 * 修法：class 名合并进一个属性，并且两个标记同时存在时
 * 用顺序而不是丢弃 —— .today 是外框（box-shadow），.on 是填充色，
 * 两个一起上才对：被选中且是今天的那格应该又高亮又有今天的标记。
 */
const fs = require('fs');
const P = 'index.html';
let s = fs.readFileSync(P, 'utf8');

const oldStr = `    return '<button data-d="' + d + '"' + (d === S.day ? ' class="today"' : '')
      + (d === pickDay ? ' class="on"' : '') + '>'
      + 'D' + d + (d === S.day ? ' 今天' : '') + ' · ' + n + '</button>';`;

const newStr = `    /* class 必须合并成一个属性。早先写成
         (今天 ? ' class="today"' : '') + (选中 ? ' class="on"' : '')
       HTML 解析器遇到第二个 class 会丢弃前一个，两个标记互相覆盖 ——
       结果「今天」标记和选中高亮都显示不出来（实测 button.on 选不中任何按钮）。
       现在合成一个 class=""，两个标记能同时生效。 */
    var cls = [];
    if (d === S.day) cls.push('today');
    if (d === pickDay) cls.push('on');
    return '<button data-d="' + d + '"' + (cls.length ? ' class="' + cls.join(' ') + '"' : '') + '>'
      + 'D' + d + (d === S.day ? ' 今天' : '') + ' · ' + n + '</button>';`;

const T = (t) => t.replace(/\n/g, '\r\n');
let hit = false;
if (s.indexOf(T(oldStr)) >= 0) { s = s.replace(T(oldStr), T(newStr)); hit = true; }
else if (s.indexOf(oldStr) >= 0) { s = s.replace(oldStr, newStr); hit = true; }
if (!hit) { console.error('✗ 未匹配'); process.exit(1); }
fs.writeFileSync(P, s);
console.log('✓ 已修 renderDayPick 的双 class 属性问题');
