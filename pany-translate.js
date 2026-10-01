// 批量翻译：例句(中) + 高频词(中/英) + 高频短句(中/英)
const fs = require('fs');
const https = require('https');

const clean = JSON.parse(fs.readFileSync('pany-clean.json', 'utf8'));
const dict = JSON.parse(fs.readFileSync('manao-words.json', 'utf8'));
const DICT = new Map(dict.map(w => [w.th, w]));

const WORD_N = 320, GRAM_N = 180;

const words = clean.words.filter(w => !w.func).slice(0, WORD_N);
const grams = clean.grams.slice(0, GRAM_N);
const sents = clean.sentences;

let dictHit = 0;
words.forEach(w => { if (DICT.has(w.w)) dictHit++; });
console.log('实词 TOP' + WORD_N + ' 中，已有词典释义的：' + dictHit + ' / ' + WORD_N);

function tr(text, tl, tries = 3) {
  return new Promise((resolve) => {
    const u = 'https://translate.googleapis.com/translate_a/single?client=gtx&sl=th&tl=' + tl + '&dt=t&q=' + encodeURIComponent(text);
    const go = (k) => {
      const req = https.get(u, { headers: { 'User-Agent': 'Mozilla/5.0' } }, r => {
        let d = '';
        r.on('data', c => d += c);
        r.on('end', () => {
          try { resolve(JSON.parse(d)[0].map(x => x[0]).join('')); }
          catch (e) { if (k < tries) setTimeout(() => go(k + 1), 800); else resolve(''); }
        });
      });
      req.on('error', () => { if (k < tries) setTimeout(() => go(k + 1), 800); else resolve(''); });
      req.setTimeout(15000, () => { req.destroy(); if (k < tries) go(k + 1); else resolve(''); });
    };
    go(1);
  });
}

// 任务队列
const jobs = [];
for (const s of sents) jobs.push({ kind: 's', ref: s, text: s.t, tl: 'zh-CN', field: 'z' });
for (const w of words) {
  if (DICT.has(w.w)) continue;
  jobs.push({ kind: 'w', ref: w, text: w.w, tl: 'zh-CN', field: 'z' });
  jobs.push({ kind: 'w', ref: w, text: w.w, tl: 'en', field: 'e' });
}
for (const g of grams) {
  jobs.push({ kind: 'g', ref: g, text: g.g, tl: 'zh-CN', field: 'z' });
  jobs.push({ kind: 'g', ref: g, text: g.g, tl: 'en', field: 'e' });
}
console.log('待翻译请求数：', jobs.length);

const CONC = 5;
let done = 0, fail = 0;
const t0 = Date.now();
async function worker(queue) {
  while (queue.length) {
    const j = queue.shift();
    const out = await tr(j.text, j.tl);
    j.ref[j.field] = out || '';
    if (!out) fail++;
    done++;
    if (done % 50 === 0) {
      const el = ((Date.now() - t0) / 1000).toFixed(0);
      console.log('  ' + done + '/' + jobs.length + '  用时 ' + el + 's  失败 ' + fail);
    }
  }
}

(async () => {
  const q = jobs.slice();
  await Promise.all(Array.from({ length: CONC }, () => worker(q)));
  console.log('完成：' + done + '，失败：' + fail + '，用时 ' + ((Date.now() - t0) / 1000).toFixed(0) + 's');

  // 词典补全
  for (const w of words) {
    const d = DICT.get(w.w);
    if (d) { w.r = d.rom; w.e = d.en; w.z = d.zh; w.fromDict = 1; }
  }
  fs.writeFileSync('pany-trans.json', JSON.stringify({ words, grams, sents, funcWords: clean.words.filter(w => w.func).slice(0, 60) }, null, 1));
  const missS = sents.filter(s => !s.z).length, missW = words.filter(w => !w.z).length, missG = grams.filter(g => !g.z).length;
  console.log('缺中文：例句 ' + missS + ' / 词 ' + missW + ' / 短句 ' + missG);
})();
