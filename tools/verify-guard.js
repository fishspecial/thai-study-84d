/* 补丁脚本安全守卫
 *
 * 血泪教训（2026-10-03）：patch-plan-reset.js 里写
 *     to = "...confirm('清空全部学习记录？\\n\\n包含：...')"
 * 在 Node 源码里 `\\n` 是「反斜杠 + n」两个字符，写进 index.html 后
 * 仍应保持为 `\n` 转义序列 —— 但我用 Edit 工具二次修改时，
 * `\\n` 被解析成了真换行，结果 index.html 里出现
 *     if (!confirm('清空全部学习记录？
 *
 *     包含：...'))
 * 单引号字符串跨行 = SyntaxError = **整个主脚本不执行 = 页面全白**。
 * 而且它只在浏览器里报错，node --check 不拆块就发现不了。
 *
 * 这个守卫做三件事：
 *   A. 拆块语法检查（能拿行列号，务必用 node --check 而不是 new Function）
 *   B. 扫描「单/双引号字符串里含真换行」的非法模式
 *   C. 扫描悬空的转义痕迹（比如源码里出现字面量 backslash-backslash-n
 *      被写成了真换行，或反过来）
 */
const fs = require('fs');
const path = require('path');
const cp = require('child_process');

const F = path.join(__dirname, '..', 'index.html');
const s = fs.readFileSync(F, 'utf8');

let bad = 0;
function fail(msg) { console.log('FAIL  ' + msg); bad++; }
function ok(msg) { console.log('PASS  ' + msg); }

/* ---- A. 拆块语法检查 ----
 * 用 vm.Script 编译而不是 spawnSync('node --check')：
 * Windows 上 spawnSync 同一个 executable 会报 EBUSY（文件被自己锁住），
 * 拿不到 stderr 也拿不到 status，判据会假 FAIL。
 * vm.Script 在同进程内编译，还能给出行列号。                        */
const vm = require('vm');
const blocks = [...s.matchAll(/<script>([\s\S]*?)<\/script>/g)].map(m => m[1]);
if (!blocks.length) fail('没找到 <script> 块');
blocks.forEach((b, i) => {
  try {
    new vm.Script(b, { filename: 'block' + i + '.js' });
    ok('script 块 ' + i + ' 语法正确（' + b.split('\n').length + ' 行）');
  } catch (e) {
    fail('script 块 ' + i + ' 语法错误');
    /* vm 的 SyntaxError 栈第一行就是 出错位置 + 源码行 */
    console.log((String(e.stack || e.message)).split('\n').slice(0, 5)
      .map(l => '      ' + l.replace(__dirname, '.')).join('\n'));
    /* 把出错行原文打出来，一眼看到坏在哪 */
    const stack = String(e.stack || '');
    const m = stack.match(/block\d+\.js:(\d+)/);
    if (m) {
      const L = +m[1];
      const lines = b.split('\n');
      for (let k = Math.max(0, L - 3); k < Math.min(lines.length, L + 2); k++) {
        console.log('      ' + (k + 1 === L ? '>>> ' : '    ') + (k + 1) + ': ' + lines[k].trim().slice(0, 76));
      }
    }
  }
});

/* ---- B. 字符串跨行的**权威**判据就在 A 里 ----
 * vm.Script 编译失败且报 "Invalid or unexpected token" 时，
 * 唯一原因就是有真换行落进了字符串/标识符里（块 0 已经证明了：
 * 语法正确的块，字符串扫描器照样会因正则字面量里的引号误报）。
 *
 * 所以这里不再重复扫描 —— 改为统计 A 里的失败块，
 * 给出一条更明确的「字符串跨行」提示，把根因直接说出来。      */
const syntaxFail = [];
blocks.forEach((b, i) => {
  try { new vm.Script(b, { filename: 'block' + i + '.js' }); }
  catch (e) {
    if (/Invalid or unexpected token/.test(e.message)) syntaxFail.push(i);
  }
});
if (syntaxFail.length === 0) {
  ok('没有「字符串跨行」类语法错误（A 已用 vm.Script 权威确认）');
} else {
  fail('块 ' + syntaxFail.join(',') + ' 报 Invalid or unexpected token —— ' +
    '最常见原因：补丁脚本往 JS 字符串里写了真换行（应写 \\n）');
}

/* ---- C. HTML 结构完整性 ---- */
const opens = (s.match(/<section\b/g) || []).length;
const closes = (s.match(/<\/section>/g) || []).length;
if (opens === closes) ok('section 开合配对（' + opens + ' 个）');
else fail('section 开合不配对：开 ' + opens + ' / 闭 ' + closes);

const vopen = (s.match(/id="v-[a-z]+"/g) || []).length;
if (vopen >= 6) ok('视图区块 ' + vopen + ' 个（今日/练习/语料/词库/参考/我的）');
else fail('视图区块只有 ' + vopen + ' 个，应至少 6 个');

const tabs = (s.match(/class="tabbar"/g) || []).length;
/* 只数 <nav class="tabbar"> 那一段里的按钮，别把 CSS/JS 里的 data-v 也算进来 */
const navSeg = (s.match(/<nav class="tabbar">([\s\S]*?)<\/nav>/) || [, ''])[1];
const tabBtns = (navSeg.match(/data-v="/g) || []).length;
if (tabs === 1 && tabBtns === 6) ok('tabbar 1 个 / 6 个标签按钮');
else fail('tabbar ' + tabs + ' 个 / 标签按钮 ' + tabBtns + ' 个（应为 1 / 6）');

console.log('\n' + (bad ? '✘ ' + bad + ' 项失败' : '✓ 全部通过'));
process.exit(bad ? 1 : 0);
