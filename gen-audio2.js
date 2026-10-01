const fs = require('fs');
const path = require('path');

const words = JSON.parse(fs.readFileSync(path.join(__dirname, 'manao-words.json'), 'utf8'));
console.log('words: ' + words.length);

const outDir = path.join(__dirname, 'audio-words');
fs.mkdirSync(outDir, { recursive: true });

const UA = 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124 Safari/537.36';
const sleep = ms => new Promise(r => setTimeout(r, ms));

function url(i, t) {
  if (i === 0) return 'https://translate.google.com/translate_tts?ie=UTF-8&client=tw-ob&tl=th&q=' + encodeURIComponent(t);
  return 'https://dict.youdao.com/dictvoice?audio=' + encodeURIComponent(t) + '&le=th';
}

(async () => {
  let ok = 0, fail = 0;
  const failed = [];
  for (let n = 0; n < words.length; n++) {
    const t = words[n].th;
    const file = path.join(outDir, 'w' + n + '.mp3');
    if (fs.existsSync(file) && fs.statSync(file).size > 1500) { ok++; continue; }
    let done = false;
    for (let s = 0; s < 2 && !done; s++) {
      try {
        const r = await fetch(url(s, t), { headers: { 'User-Agent': UA } });
        if (r.ok) {
          const b = Buffer.from(await r.arrayBuffer());
          if (b.length > 1500) { fs.writeFileSync(file, b); ok++; done = true; }
        }
      } catch (e) { /* next */ }
      if (!done) await sleep(700);
    }
    if (!done) { fail++; failed.push(n); }
    await sleep(260);
    if ((n + 1) % 200 === 0) console.log('  ' + (n + 1) + '/' + words.length + ' ok=' + ok + ' fail=' + fail);
  }
  console.log('DONE ok=' + ok + ' fail=' + fail);
  if (failed.length) console.log('failed: ' + failed.join(','));
  const total = fs.readdirSync(outDir).reduce((a, f) => a + fs.statSync(path.join(outDir, f)).size, 0);
  console.log('total: ' + (total / 1048576).toFixed(1) + ' MB');
})();
