// 按 audio-jobs.json 生成全部离线音频（并发 4，Google 优先、有道兜底）
const fs = require('fs');
const path = require('path');

const jobs = JSON.parse(fs.readFileSync(path.join(__dirname, 'audio-jobs.json'), 'utf8'));
const outDir = path.join(__dirname, 'audio-pany');
fs.mkdirSync(outDir, { recursive: true });

const UA = 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124 Safari/537.36';
const sleep = ms => new Promise(r => setTimeout(r, ms));
function url(i, t) {
  if (i === 0) return 'https://translate.google.com/translate_tts?ie=UTF-8&client=tw-ob&tl=th&q=' + encodeURIComponent(t);
  return 'https://dict.youdao.com/dictvoice?audio=' + encodeURIComponent(t) + '&le=th';
}

console.log('待生成：' + jobs.length);
const queue = jobs.slice();
let ok = 0, fail = 0;
const failed = [];

async function worker() {
  while (queue.length) {
    const j = queue.shift();
    const file = path.join(outDir, j.f);
    if (fs.existsSync(file) && fs.statSync(file).size > 1500) { ok++; continue; }
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
    await sleep(120);
    const n = ok + fail;
    if (n % 400 === 0) console.log('  ' + n + '/' + jobs.length + ' ok=' + ok + ' fail=' + fail);
  }
}

(async () => {
  const t0 = Date.now();
  await Promise.all(Array.from({ length: 4 }, worker));
  console.log('DONE ok=' + ok + ' fail=' + fail + ' 用时 ' + ((Date.now() - t0) / 1000).toFixed(0) + 's');
  if (failed.length) console.log('failed: ' + failed.slice(0, 40).join(','));
  const total = fs.readdirSync(outDir).reduce((a, f) => a + fs.statSync(path.join(outDir, f)).size, 0);
  console.log('total: ' + (total / 1048576).toFixed(1) + ' MB');
})();
