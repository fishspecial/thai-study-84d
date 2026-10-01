// 为短句和例句批量生成罗马音：词典优先，未收录的用转写器（并标记 auto）
const fs = require('fs');
const { romWord } = require('./thai-rom.js');
const seg = new Intl.Segmenter('th', { granularity: 'word' });

const P = JSON.parse(fs.readFileSync('pany-data.js', 'utf8').replace('window.PANY=', '').replace(/;$/, ''));
const manao = JSON.parse(fs.readFileSync('manao-words.json', 'utf8'));
const ROM = JSON.parse(fs.readFileSync('rom-map.json', 'utf8'));

// 词典：manao 2187 + 手工表 + 已有词条
const DICT = {};
manao.forEach(w => { if (w.rom) DICT[w.th] = w.rom; });
for (const k in ROM) DICT[k] = ROM[k];
(P.top100 || []).forEach(x => { if (x.r) DICT[x.t] = x.r; });
(P.words || []).forEach(w => { if (w.r) DICT[w.t] = w.r; });
(P.func || []).forEach(f => { if (f.r) DICT[f.t] = f.r; });
console.log('词典条目：' + Object.keys(DICT).length);

const TH = /[\u0E00-\u0E7F]/;
function romText(text) {
  const out = [];
  let auto = 0, total = 0;
  for (const s of seg.segment(text)) {
    let w = s.segment;
    // ๆ 重复符号：拆成两个词再转写（มากๆ → มาก มาก）
    if (w.indexOf('ๆ') >= 0) {
      const base = w.replace(/ๆ/g, '');
      if (base) { w = base + ' ' + base; }
      else w = '';
    }
    if (!s.isWordLike) { if (w.trim()) out.push(w.trim()); continue; }
    if (w.indexOf(' ') >= 0) {
      w.split(' ').forEach(x => {
        total++;
        if (DICT[x]) out.push(DICT[x]); else { auto++; out.push(romWord(x, DICT)); }
      });
      continue;
    }
    if (!TH.test(w)) { out.push(w); continue; }
    total++;
    if (DICT[w]) out.push(DICT[w]);
    else { auto++; out.push(romWord(w, DICT)); }
  }
  return { rom: out.join(' ').replace(/\s+/g, ' ').trim(), auto: auto, total: total };
}

// 短句
const grams = {};
let gAuto = 0;
(P.herGrams || []).concat(P.myGrams || []).forEach(g => {
  const r = romText(g.t);
  grams[g.t] = r.rom;
  if (r.auto > 0) gAuto++;
});
console.log('短句 ' + Object.keys(grams).length + ' 条，含自动转写的 ' + gAuto);

// 例句（限长 45 字，长句罗马音太吵而且误差累积）
const sents = {};
const MAXLEN = 45;
let n = 0, sAuto = 0;
(P.sents || []).forEach(s => {
  if (s.t.length > MAXLEN) return;
  const r = romText(s.t);
  // 质量门：超过一半的词要靠转写器就放弃（宁缺勿错）
  if (r.total && r.auto / r.total > 0.5) return;
  sents[s.id] = r.rom;
  n++;
  if (r.auto > 0) sAuto++;
});
console.log('例句取到罗马音 ' + n + ' / ' + (P.sents || []).length + '（≤' + MAXLEN + ' 字且词典覆盖过半），其中含自动转写 ' + sAuto);

fs.writeFileSync('rom-extra.json', JSON.stringify({ grams, sents }, null, 0));
console.log('写入 rom-extra.json  ' + (fs.statSync('rom-extra.json').size / 1024).toFixed(0) + ' KB');

// 抽查
const gs = Object.keys(grams);
console.log('\n短句抽查：');
gs.slice(0, 6).forEach(g => console.log('  ' + g + '  →  ' + grams[g]));
const ss = Object.keys(sents).slice(0, 6);
console.log('例句抽查：');
ss.forEach(id => {
  const s = (P.sents || []).find(x => x.id === id);
  console.log('  ' + s.t + '  →  ' + sents[id]);
});
