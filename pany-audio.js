// 为 Pany 语料生成离线音频：词 w{n}.mp3 / 短句 g{n}.mp3 / 例句 s{n}.mp3
const fs = require('fs');
const path = require('path');

const data = JSON.parse(fs.readFileSync(path.join(__dirname, 'pany-trans.json'), 'utf8'));
const outDir = path.join(__dirname, 'audio-pany');
fs.mkdirSync(outDir, { recursive: true });

const UA = 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124 Safari/537.36';
const sleep = ms => new Promise(r => setTimeout(r, ms));

function url(i, t) {
  if (i === 0) return 'https://translate.google.com/translate_tts?ie=UTF-8&client=tw-ob&tl=th&q=' + encodeURIComponent(t);
  return 'https://dict.youdao.com/dictvoice?audio=' + encodeURIComponent(t) + '&le=th';
}

// 任务：词 + 短句 + 例句（例句限长 110 字符，超长的走在线兜底）
const jobs = [];
data.words.forEach((w, i) => jobs.push({ f: 'w' + i + '.mp3', t: w.w }));
data.funcWords.forEach((w, i) => jobs.push({ f: 'f' + i + '.mp3', t: w.w }));
data.grams.forEach((g, i) => jobs.push({ f: 'g' + i + '.mp3', t: g.g }));
data.sents.forEach(s => { if (s.t.length <= 110) jobs.push({ f: 's' + s.n + '.mp3', t: s.t }); });

console.log('待生成音频：' + jobs.length);
const queue = jobs.slice();
let ok = 0, fail = 0, skip = 0;
const failed = [];

async function worker() {
  while (queue.length) {
    const j = queue.shift();
    const file = path.join(outDir, j.f);
    if (fs.existsSync(file) && fs.statSync(file).size > 1500) { skip++; ok++; continue; }
    let done = false;
    for (let s = 0; s < 2 && !done; s++) {
      try {
        const r = await fetch(url(s, j.t), { headers: { 'User-Agent': UA } });
        if (r.ok) {
          const b = Buffer.from(await r.arrayBuffer());
          if (b.length > 1500) { fs.writeFileSync(file, b); done = true; }
        }
      } catch (e) { /* next */ }
      if (!done) await sleep(700);
    }
    if (done) ok++; else { fail++; failed.push(j.f); }
    await sleep(180);
  }
}

(async () => {
  const t0 = Date.now();
  await Promise.all(Array.from({ length: 3 }, worker));
  console.log('DONE ok=' + ok + ' fail=' + fail + ' 用时 ' + ((Date.now() - t0) / 1000).toFixed(0) + 's');
  if (failed.length) console.log('failed: ' + failed.slice(0, 30).join(','));
  const total = fs.readdirSync(outDir).reduce((a, f) => a + fs.statSync(path.join(outDir, f)).size, 0);
  console.log('total: ' + (total / 1048576).toFixed(1) + ' MB');
})();
