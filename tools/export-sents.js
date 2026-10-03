/* 把 PANY.sents 的 3331 条真实例句导出成两份交付物。
 *
 * 为什么要两份：
 *   HTML —— 站内可搜索、可点读、能按说话人/关键词筛。3331 条按编号翻是没法用的，
 *           必须能搜「ใจ」和「工作」这类词。
 *   TXT  —— 用户明确要「能直接投喂给 ChatGPT 的纯文本、带编号、分批次」。
 *           纯文本里不带任何 HTML 标签，模型读得干净。
 *
 * 音频：audio-pany 覆盖 2877/3331。缺失的标 [无音频]，
 *       避免用户点了一堆才发现没声音 —— 提前说清楚比事后解释省事。
 *
 * 字段说明：
 *   who 0 = Pany（她说的）  1 = 我（用户说的）
 *   priv 1 = 私密语境（成人话题等），单独标出。用户原话「毕竟是真实对话」，
 *           不替他做道德过滤，只做标记，让他自己决定要不要看。
 */
const fs = require('fs');
const path = require('path');

const ROOT = path.join(__dirname, '..');
const outDir = path.join(ROOT, 'export');
if (!fs.existsSync(outDir)) fs.mkdirSync(outDir, { recursive: true });
global.window = {};
require(path.join(ROOT, 'pany-data.js'));
const S = window.PANY.sents;

const AUDIO_DIR = path.join(ROOT, 'audio-pany');
const hasAudio = {};
try { fs.readdirSync(AUDIO_DIR).forEach(f => { hasAudio[f.replace(/\.mp3$/, '')] = 1; }); }
catch (e) { console.warn('读不到 audio-pany：', e.message); }

/* ---------- 分组：她的在前、我在后，各自内部按原顺序（= 聊天时间顺序） ---------- */
const hers = S.filter(s => s.who === 0);
const mine = S.filter(s => s.who === 1);

function lineTxt(s, n, total) {
  const flags = [];
  if (s.priv) flags.push('私密');
  if (!hasAudio[s.id]) flags.push('无音频');
  const meta = flags.length ? '  [' + flags.join('/') + ']' : '';
  return n + '. ' + s.t + meta + '\n   罗马音: ' + (s.r || '—') + '\n   中文: ' + s.z;
}

/* ================= TXT 版 ================= */
let txt = '';
txt += '# 真实例句全集 ' + S.length + ' 条\n\n';
txt += '来源：与 Pany 的真实聊天记录（Google 翻译历史导出后重译）\n';
txt += '构成：她说的 ' + hers.length + ' 条 / 我说的 ' + mine.length + ' 条\n';
txt += '每条含：泰文原文、罗马音、中文译文。带 [私密] 的是成人语境。\n';
txt += '带 [无音频] 的是没有预录音频的句子（站内仍可用 TTS 朗读）。\n';
txt += '音频覆盖率：' + S.filter(s => hasAudio[s.id]).length + '/' + S.length + '\n\n';
txt += '字段：who=0 是她说的，who=1 是我说的；priv=1 表示私密语境。\n';
txt += '注意：' + S.filter(s => !s.r).length + ' 条没有罗马音（原始翻译数据缺失），这些条目的「罗马音」显示为 —。\n';
txt += '      需要带罗马音的句子请用 HTML 版的「有罗马音」筛选，只剩 ' + S.filter(s => s.r).length + ' 条。\n\n';
txt += '='.repeat(60) + '\n\n';

[['一、她说的（' + hers.length + ' 条）', hers],
 ['二、我说的（' + mine.length + ' 条）', mine]].forEach(function(gp, gi) {
  txt += '\n' + gp[0] + '\n' + '-'.repeat(40) + '\n\n';
  gp[1].forEach(function(s, i) { txt += lineTxt(s, i + 1, gp[1].length) + '\n\n'; });
  if (gi === 0) txt += '\n' + '='.repeat(60) + '\n\n';
});
fs.writeFileSync(path.join(__dirname, '..', 'export', 'pany-sents.txt'), txt, 'utf8');

/* ================= HTML 版 ================= */
function esc(s) {
  return String(s == null ? '' : s)
    .replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
}
function row(s, n) {
  const priv = s.priv ? '<span class="tag pv">私密</span>' : '';
  const noAu = hasAudio[s.id] ? '' : '<span class="tag na">无音频</span>';
  return '<div class="r' + (s.priv ? ' ispv' : '') + '" data-t="' + esc(s.t) + ' ' + esc(s.z) + ' ' + esc(s.r) + '"'
    + ' data-w="' + s.who + '" data-len="' + s.len + '">'
    + '<div class="hd"><span class="no">' + n + '</span>'
    + '<button class="pl" data-a="' + esc(s.id) + '" title="发音">▶</button>'
    + priv + noAu + '</div>'
    + '<div class="th">' + esc(s.t) + '</div>'
    + (s.r ? '<div class="rm">' + esc(s.r) + '</div>' : '')
    + '<div class="zh">' + esc(s.z) + '</div>'
    + '</div>';
}
function section(title, arr, from) {
  return '<h2 class="sec">' + esc(title) + '<span class="n">' + arr.length + ' 条</span></h2>'
    + arr.map(function(s, i) { return row(s, from + i + 1); }).join('');
}

const html = `<!doctype html>
<html lang="zh"><head><meta charset="utf-8">
<meta name="viewport" content="width=device-width,initial-scale=1">
<title>Pany 真实例句全集 ${S.length} 条</title>
<style>
:root{--bg:#f6f7f9;--card:#fff;--line:#e6e8ec;--line2:#d7dae0;--tx:#1c1f24;--tx2:#5b6270;--tx3:#8b93a1;
--blue:#2563eb;--pink:#d6336c;--green:#0f9d58}
*{box-sizing:border-box}
body{margin:0;background:var(--bg);color:var(--tx);
font:15px/1.6 -apple-system,BlinkMacSystemFont,"Segoe UI","Noto Sans Thai","Microsoft YaHei",sans-serif}
header{position:sticky;top:0;z-index:10;background:var(--card);border-bottom:1px solid var(--line);
padding:10px 12px;box-shadow:0 1px 3px rgba(0,0,0,.04)}
h1{margin:0 0 8px;font-size:17px}
.meta{color:var(--tx2);font-size:12.5px;margin-bottom:8px}
.ctl{display:flex;gap:6px;flex-wrap:wrap;align-items:center}
#q{flex:1 1 180px;min-width:140px;padding:8px 10px;border:1px solid var(--line2);border-radius:8px;
font:inherit;font-size:14px;background:var(--bg);color:var(--tx)}
#q:focus{outline:2px solid var(--blue);outline-offset:-1px}
.fb{padding:6px 11px;border:1px solid var(--line2);border-radius:999px;background:var(--bg);
font-size:13px;cursor:pointer;color:var(--tx2);user-select:none}
.fb.on{background:var(--blue);border-color:var(--blue);color:#fff;font-weight:600}
#cnt{color:var(--tx2);font-size:12.5px;margin-top:7px}
main{max-width:860px;margin:0 auto;padding:12px 12px 60px}
h2.sec{font-size:14px;color:var(--tx2);margin:20px 0 8px;display:flex;align-items:baseline;gap:8px;
padding-bottom:6px;border-bottom:2px solid var(--line2)}
h2.sec .n{font-size:12px;color:var(--tx3);font-weight:400}
.r{background:var(--card);border:1px solid var(--line);border-radius:10px;padding:9px 11px;margin-bottom:7px}
.r.ispv{border-left:3px solid var(--pink)}
.hd{display:flex;align-items:center;gap:6px;margin-bottom:3px}
.no{font-size:11.5px;color:var(--tx3);font-variant-numeric:tabular-nums;min-width:34px}
.pl{width:26px;height:26px;border-radius:50%;border:1px solid var(--line2);background:var(--bg);
color:var(--blue);cursor:pointer;font-size:11px;line-height:1;padding:0}
.pl:hover{background:var(--blue);color:#fff;border-color:var(--blue)}
.tag{font-size:10.5px;padding:1px 6px;border-radius:999px;line-height:1.6}
.tag.pv{background:#fce7f0;color:#a61e54}
.tag.na{background:#f1f3f5;color:var(--tx3)}
.th{font-size:19px;line-height:1.5;color:var(--tx)}
.rm{font-size:12.5px;color:var(--tx3);font-style:italic;margin-top:1px}
.zh{font-size:14px;color:var(--tx2);margin-top:2px}
.hide{display:none!important}
.empty{color:var(--tx3);text-align:center;padding:30px 0;font-size:14px}
footer{color:var(--tx3);font-size:12px;text-align:center;padding:20px 12px 40px}
</style></head><body>
<header>
<h1>Pany 真实例句全集</h1>
<div class="meta">共 ${S.length} 条 · 她 ${hers.length} / 我 ${mine.length} · 音频 ${S.filter(s => hasAudio[s.id]).length} 条可直接点读，其余用 TTS 朗读</div>
<div class="meta" style="color:#a33">注意：${S.filter(s => !s.r).length} 条缺罗马音（原始数据缺失）。想先靠罗马音学拼读，请点下面「有罗马音」筛选，只剩 ${S.filter(s => s.r).length} 条。</div>
<div class="ctl">
<input id="q" placeholder="搜索泰文 / 中文 / 罗马音…" autocomplete="off">
<span class="fb on" data-f="a">全部</span>
<span class="fb" data-f="0">她说的</span>
<span class="fb" data-f="1">我说的</span>
<span class="fb" data-f="p">私密</span>
<span class="fb" data-f="s">短句(≤12字)</span>
<span class="fb" data-f="r">有罗马音</span>
</div>
<div id="cnt"></div>
</header>
<main>
${section('一、她说的', hers, 0)}
${section('二、我说的', mine, 0)}
<p class="empty hide" id="noHit">没有匹配的句子。</p>
</main>
<footer>由真实聊天记录导出 · 编号沿用站内例句 ID（audio-pany/&lt;ID&gt;.mp3）</footer>
<script>
var rows = [].slice.call(document.querySelectorAll('.r'));
var q = document.getElementById('q'), cnt = document.getElementById('cnt');
var f = 'a';
function apply(){
  var kw = q.value.trim().toLowerCase(), n = 0;
  rows.forEach(function(r){
    var ok = true;
    if (f === '0' || f === '1') ok = r.getAttribute('data-w') === f;
    else if (f === 'p') ok = r.classList.contains('ispv');
    else if (f === 's') ok = (+r.getAttribute('data-len')) <= 12;
    else if (f === 'r') ok = !!r.querySelector('.rm');
    if (ok && kw) ok = r.getAttribute('data-t').toLowerCase().indexOf(kw) >= 0;
    r.classList.toggle('hide', !ok);
    if (ok) n++;
  });
  cnt.textContent = '筛出 ' + n + ' / ' + rows.length + ' 条';
  document.getElementById('noHit').classList.toggle('hide', n > 0);
}
q.oninput = apply;
[].slice.call(document.querySelectorAll('.fb')).forEach(function(b){
  b.onclick = function(){
    f = b.getAttribute('data-f');
    [].slice.call(document.querySelectorAll('.fb')).forEach(function(x){ x.classList.remove('on'); });
    b.classList.add('on');
    apply();
  };
});
apply();
/* 点读：先试站内 mp3，失败自动退到 Google TTS 再退到有道 —— 与站内 say() 同一套兜底。
   单独抽成函数是因为这份文档要能脱离 index.html 独立打开。 */
var AU = null, I = 0, U = [];
function play(id, text, btn){
  if (AU){ try { AU.pause(); } catch(e){} }
  I = 0;
  U = ['audio-pany/' + id + '.mp3',
       'https://translate.google.com/translate_tts?ie=UTF-8&client=tw-ob&tl=th&q=' + encodeURIComponent(text),
       'https://dict.youdao.com/dictvoice?audio=' + encodeURIComponent(text) + '&le=th'];
  btn.textContent = '❚❚';
  nx(btn);
}
function nx(btn){
  if (I >= U.length){ if (btn) btn.textContent = '▶'; return; }
  var a = new Audio(); AU = a;
  a.onerror = function(){ I++; nx(btn); };
  a.onended = function(){ if (btn) btn.textContent = '▶'; };
  a.src = U[I++];
  var pr = a.play(); if (pr && pr.catch) pr.catch(function(){ a.onerror(); });
}
document.addEventListener('click', function(e){
  var b = e.target.closest('.pl'); if (!b) return;
  var r = b.closest('.r');
  play(b.getAttribute('data-a'), r.querySelector('.th').textContent, b);
});
</script>
</body></html>`;

const outDir2 = outDir;
fs.writeFileSync(path.join(outDir2, 'pany-sents.html'), html, 'utf8');

/* 顺手导一份 JSON，给以后做批量处理用 */
fs.writeFileSync(path.join(outDir, 'pany-sents.json'), JSON.stringify(S, null, 1), 'utf8');

console.log('✓ 导出完成');
console.log('  export/pany-sents.html  ' + (html.length / 1024).toFixed(0) + ' KB');
console.log('  export/pany-sents.txt   ' + (txt.length / 1024).toFixed(0) + ' KB  ' + S.length + ' 条');
console.log('  export/pany-sents.json  ' + (JSON.stringify(S).length / 1024).toFixed(0) + ' KB');
console.log('  音频覆盖 ' + S.filter(s => hasAudio[s.id]).length + '/' + S.length);
console.log('  私密语境 ' + S.filter(s => s.priv).length + ' 条（已标记，未过滤）');
