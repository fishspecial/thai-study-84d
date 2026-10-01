// 合并语料的补全翻译：她的实词 TOP320 / 我的高频短句 160 / 缺中文的例句
const fs = require('fs');
const https = require('https');

const C = JSON.parse(fs.readFileSync('corpus.json', 'utf8'));
const dict = JSON.parse(fs.readFileSync('manao-words.json', 'utf8'));
const DICT = new Map(dict.map(w => [w.th, w]));
const oldTrans = JSON.parse(fs.readFileSync('pany-trans.json', 'utf8'));
const FUNC = new Set(JSON.parse(fs.readFileSync('func-set.json', 'utf8')));
const PRON = new Set(['ฉัน','คุณ','เธอ','ผม','เรา','เขา','มัน','หนู','พี่','น้อง']);

const OLD = new Map();
oldTrans.words.forEach(w => OLD.set(w.w, w));
oldTrans.grams.forEach(g => OLD.set(g.g, g));

const WORD_N = 320;
const isFunc = w => FUNC.has(w) || PRON.has(w) || w.length <= 2;
const words = C.herWords.filter(w => !isFunc(w.w)).slice(0, WORD_N);
const grams = C.myGrams;
const herGrams = C.herGrams;
const needSent = C.her.filter(s => !s.z);

console.log('她的实词 TOP' + WORD_N + ' | 我的短句 ' + grams.length + ' | 缺中文例句 ' + needSent.length);

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

const jobs = [];
for (const s of needSent) jobs.push({ ref: s, text: s.t, tl: 'zh-CN', field: 'z' });
for (const w of words) {
  if (DICT.has(w.w)) continue;
  if (OLD.has(w.w) && OLD.get(w.w).z) continue;
  jobs.push({ ref: w, text: w.w, tl: 'zh-CN', field: 'z' });
  jobs.push({ ref: w, text: w.w, tl: 'en', field: 'e' });
}
for (const g of grams) {
  jobs.push({ ref: g, text: g.g, tl: 'zh-CN', field: 'z' });
  jobs.push({ ref: g, text: g.g, tl: 'en', field: 'e' });
}
for (const g of herGrams) {
  if (OLD.has(g.g) && OLD.get(g.g).z) { g.z = OLD.get(g.g).z; g.e = OLD.get(g.g).e || ''; continue; }
  jobs.push({ ref: g, text: g.g, tl: 'zh-CN', field: 'z' });
  jobs.push({ ref: g, text: g.g, tl: 'en', field: 'e' });
}
console.log('待翻译请求数：' + jobs.length);

const CONC = 5;
let done = 0, fail = 0;
const t0 = Date.now();
async function worker(q) {
  while (q.length) {
    const j = q.shift();
    const out = await tr(j.text, j.tl);
    j.ref[j.field] = out || '';
    if (!out) fail++;
    done++;
    if (done % 100 === 0) console.log('  ' + done + '/' + jobs.length + '  ' + ((Date.now() - t0) / 1000).toFixed(0) + 's');
  }
}

(async () => {
  const q = jobs.slice();
  await Promise.all(Array.from({ length: CONC }, () => worker(q)));
  console.log('完成 ' + done + '，失败 ' + fail + '，用时 ' + ((Date.now() - t0) / 1000).toFixed(0) + 's');

  // 词典 / 旧翻译补全
  let hitD = 0, hitO = 0;
  for (const w of words) {
    const d = DICT.get(w.w);
    if (d) { w.r = d.rom; w.e = d.en; w.z = d.zh; w.d = 1; hitD++; continue; }
    const o = OLD.get(w.w);
    if (o && o.z) { w.r = o.r || ''; w.e = o.e || ''; w.z = o.z; hitO++; }
  }
  fs.writeFileSync('corpus-trans.json', JSON.stringify({ words, grams, herGrams, her: C.her, me: C.me }, null, 1));
  console.log('词典命中 ' + hitD + '，复用旧翻译 ' + hitO);
  console.log('缺中文：词 ' + words.filter(w => !w.z).length + ' / 我的短句 ' + grams.filter(g => !g.z).length + ' / 她的短句 ' + herGrams.filter(g => !g.z).length + ' / 例句 ' + C.her.filter(s => !s.z).length);
})();
