/* 把已验证通过的工作副本同步到 live 快照。
 *
 * 纪律：只在测试全绿之后跑这个脚本。跑之前先自动做语法体检，
 * 语法坏掉的 index.html 不会覆盖正在给你用的那份好文件 ——
 * 这是「编辑期间你照常用」的最后一道保险。
 */
const fs = require('fs');
const path = require('path');
const vm = require('vm');

const ROOT = path.resolve(__dirname, '..');
const SRC = path.join(ROOT, 'index.html');
const LIVE_DIR = path.join(ROOT, 'live');
const DST = path.join(LIVE_DIR, 'index.html');

/* 抽出所有内联 <script> 块逐个 node --check。
   少一个 } 就会让整个脚本 SyntaxError、页面上所有功能静默消失。 */
function inlineScripts(html) {
  const out = [];
  const re = /<script(?![^>]*\bsrc=)[^>]*>([\s\S]*?)<\/script>/gi;
  let m;
  while ((m = re.exec(html))) {
    const code = m[1].trim();
    if (code) out.push({ at: m.index, code });
  }
  return out;
}

function checkSyntax(html) {
  const blocks = inlineScripts(html);
  if (!blocks.length) return { ok: true, n: 0, bad: [] };
  const bad = [];
  blocks.forEach(function (b, i) {
    /* 进程内编译，不起子进程。
       早先版本用 execFileSync + node --check，在 Windows 上会撞 EBUSY
       （同一个 exe 反复被 spawn/回收），而且慢得多。 */
    try {
      new vm.Script(b.code, { filename: 'inline-' + (i + 1) + '.js' });
    } catch (e) {
      bad.push({ i: i + 1, at: b.at, msg: String(e.message).split('\n')[0] });
    }
  });
  return { ok: bad.length === 0, n: blocks.length, bad: bad };
}

const html = fs.readFileSync(SRC, 'utf8');
const r = checkSyntax(html);

if (!r.ok) {
  console.error('✗ 语法检查未通过，已中止同步（live 快照保持原样）');
  r.bad.forEach(function (b) {
    const line = html.slice(0, b.at).split('\n').length;
    console.error('  第 ' + b.i + ' 个内联脚本（index.html 约第 ' + line + ' 行）: ' + b.msg);
  });
  process.exit(1);
}

fs.writeFileSync(DST, html, 'utf8');
const d = fs.statSync(DST);
console.log('✓ 已同步 ' + r.n + ' 个内联脚本，语法全部通过');
console.log('  ' + DST);
console.log('  ' + d.size + ' 字节  ' + d.mtime.toLocaleString('zh-CN'));
console.log('  刷新 http://127.0.0.1:8848/ 即可看到新版');
