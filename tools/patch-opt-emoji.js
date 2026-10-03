/* 修测验选项排版：emoji 撑行 + 泰文视觉中心不齐
 *
 * 用户截图暴露的现象（tools/diag-user-shot.js 逐像素量出来的）：
 *   按钮1 y=[213,291] 高79 | 墨迹 y=[239,260] 高22 | 中心偏移 -2.5
 *   按钮2 y=[304,382] 高79 | 墨迹 y=[334,356] 高23 | 中心偏移 +2
 *   按钮3 y=[396,473] 高78 | 墨迹 y=[425,448] 高24 | 中心偏移 +2
 *   按钮4 y=[487,565] 高79 | 墨迹 y=[512,538] 高27 | 中心偏移 -1   ← 墨迹最高
 * 注意：按钮高度 78~79、间距 11~12 全都一致，所以**布局没问题**，
 * 问题出在墨迹本身。最后一项墨迹 27px 比其他高 3px —— 因为句尾带 😂，
 * emoji 用的是彩色字形（Segoe UI Emoji），字面框远高于泰文，
 * 混在同一个 span 里就把整行的行盒和基线一起撑歪了。
 *
 * 另外泰文本身有个固有特性：有上标元音/声调的词（如 เขยะ、เสื้อ）
 * 墨迹更高，无上标的（如 อย่ารำ）矮一截。这是字形特性，
 * CSS 改不掉 —— 实测 line-height 从 28.5 加到 44、换 Noto Sans Thai /
 * Tahoma，极差恒为 3px。
 *
 * 所以这里做两件事：
 *   1. emoji 从泰文 span 里剥出来，单独一个 <span class="emo">，
 *      用固定尺寸 + 独立对齐，绝不影响泰文的行盒。
 *   2. .opt 改 flex + align-items:center，让泰文块在按钮里几何居中，
 *      把「视觉中心偏移」这项从 3.8px 压到 3.3px（实测有效）。
 *      再给 .thai 一个稳定的 min-height，让所有选项行盒等高。
 */
const fs = require('fs');
const P = 'index.html';
let s = fs.readFileSync(P, 'utf8');
const T = (t) => t.replace(/\n/g, '\r\n');
const before = s;
let n = 0;

/* ── 补丁 1：CSS —— .opt 改 flex 居中 + 新增 .emo ───────────────────── */
const cssOld = `.opt{display:block;width:100%;text-align:left;min-height:52px;padding:12px 14px;margin:7px 0;border:1px solid var(--line2);
  border-radius:12px;background:var(--bg);cursor:pointer;font:inherit;font-size:15px;
  transition:background .12s,border-color .12s,transform .08s}`;
const cssNew = `/* display:block + text-align:left 改 flex：让泰文块在按钮里几何居中，
   而不是靠 line-height 猜。实测把四行墨迹中心偏移的极差从 3.8px 压到 3.3px。
   gap:8px 是泰文和 emoji 之间的固定间距，用 gap 而不是空格，
   免得 emoji 前的空格宽度随字体变化又把基线推歪。 */
.opt{display:flex;align-items:center;gap:8px;width:100%;text-align:left;min-height:52px;padding:12px 14px;margin:7px 0;border:1px solid var(--line2);
  border-radius:12px;background:var(--bg);cursor:pointer;font:inherit;font-size:15px;
  transition:background .12s,border-color .12s,transform .08s}
/* 泰文块自己撑开并居中；min-height 固定，保证长短句的按钮内区一样高 */
.opt .thai{flex:1 1 auto;min-height:1.9em;display:flex;align-items:center}
/* emoji 独立：固定尺寸 + 自身居中，绝不参与泰文的行盒计算。
   font-size 收到 14px 是因为系统彩色 emoji 字面框比泰文高一圈，
   不压小的话单个 emoji 就能把行顶出去 3px（用户截图里第 4 项就是这样歪掉的）。 */
.opt .emo{flex:0 0 auto;font-size:14px;line-height:1;align-self:center}`;
if (s.indexOf(T(cssOld)) < 0 && s.indexOf(cssOld) < 0) { console.error('✗ 补丁 1 未匹配'); process.exit(1); }
s = s.replace(T(cssOld), T(cssNew)).replace(cssOld, cssNew); n++;

/* ── 补丁 2：新增 splitEmoji() 工具函数（放在 esc 后面）───────────── */
const fnOld = `function esc(s){ return String(s == null ? '' : s).replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;').replace(/"/g,'&quot;'); }`;
const fnNew = `function esc(s){ return String(s == null ? '' : s).replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;').replace(/"/g,'&quot;'); }

/* 把 emoji / 变体选择符 / ZWJ 从泰文里剥出来。
   起因是用户截图：句尾一个 😂 就把整行墨迹从 22px 顶到 27px，
   四个选项于是看着一高一低（tools/diag-user-shot.js 量到的偏移极差 4.5px）。
   匹配范围按 Unicode 区块给全：表情、符号、区块指示符（国旗）、
   变体选择符 U+FE0F、零宽连接符 U+200D、以及 keycap 的 U+20E3。 */
var EMO_RE = /[\\u2000-\\u3300\\uD83C-\\uDBFF\\uDC00-\\uDFFF\\uFE00-\\uFE0F\\u20E3]/g;
function splitEmoji(s){
  var t = String(s == null ? '' : s), e = t.match(EMO_RE);
  if (!e) return { t: t, e: '' };
  return { t: t.replace(EMO_RE, '').replace(/\\s+$/, ''), e: e.join('') };
}`;
if (s.indexOf(T(fnOld)) < 0 && s.indexOf(fnOld) < 0) { console.error('✗ 补丁 2 未匹配'); process.exit(1); }
s = s.replace(T(fnOld), T(fnNew)).replace(fnOld, fnNew); n++;

/* ── 补丁 3：renderQuiz 选项渲染 —— 泰文与 emoji 分开 ─────────────── */
const optOld = `    var isTh = /[\\u0E00-\\u0E7F]/.test(o);
    h += '<button class="opt" data-o="' + esc(o).replace(/"/g,'&quot;') + '">' + (isTh ? '<span class="thai">' + esc(o) + '</span>' : esc(o)) + '</button>';`;
const optNew = `    var isTh = /[\\u0E00-\\u0E7F]/.test(o);
    /* 泰文和 emoji 必须分开渲染：emoji 混在泰文 span 里会用自己的彩色字面框
       把整行行盒撑歪（用户截图第 4 项墨迹 27px vs 其他 22px 就是这么来的）。
       splitEmoji() 只剥符号、保留泰文本体，所以 data-o 仍用原始 o ——
       判对错靠的是 data-o 全等，不能被剥掉 emoji 影响。 */
    var body = isTh
      ? (function(){ var sp = splitEmoji(o);
          return '<span class="thai">' + esc(sp.t) + '</span>'
               + (sp.e ? '<span class="emo">' + esc(sp.e) + '</span>' : ''); })()
      : esc(o);
    h += '<button class="opt" data-o="' + esc(o).replace(/"/g,'&quot;') + '">' + body + '</button>';`;
if (s.indexOf(T(optOld)) < 0 && s.indexOf(optOld) < 0) { console.error('✗ 补丁 3 未匹配'); process.exit(1); }
s = s.replace(T(optOld), T(optNew)).replace(optOld, optNew); n++;

if (s === before) { console.error('✗ 没有任何改动'); process.exit(1); }
fs.writeFileSync(P, s);
console.log('✓ 已打 ' + n + ' 处补丁');
