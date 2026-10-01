const fs = require('fs');
const path = require('path');

const src = fs.readFileSync(path.join(__dirname, 'index.html'), 'utf8');
const m = src.match(/var DATA = \[([\s\S]*?)\n\];/);
if (!m) { console.log('DATA not found'); process.exit(1); }
const texts = [...m[1].matchAll(/\["([^"]+)","/g)].map(x => x[1]);
console.log('phrases: ' + texts.length);

const outDir = path.join(__dirname, 'audio');
fs.mkdirSync(outDir, { recursive: true });

const UA = 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124 Safari/537.36';
function url(p, t, i) {
  if (i === 0) return 'https://translate.google.com/translate_tts?ie=UTF-8&client=tw-ob&tl=th&q=' + encodeURIComponent(t);
  return 'https://dict.youdao.com/dictvoice?audio=' + encodeURIComponent(t) + '&le=th';
}
const sleep = ms => new Promise(r => setTimeout(r, ms));

(async () => {
  const report = [];
  for (let i = 0; i < texts.length; i++) {
    const t = texts[i];
    const file = path.join(outDir, 'p' + i + '.mp3');
    if (fs.existsSync(file) && fs.statSync(file).size > 2000) { report.push([i, 'cached']); continue; }
    let done = false;
    for (let src2 = 0; src2 < 2 && !done; src2++) {
      try {
        const r = await fetch(url(null, t, src2), { headers: { 'User-Agent': UA, 'Referer': 'https://translate.google.com/' } });
        if (r.ok) {
          const buf = Buffer.from(await r.arrayBuffer());
          if (buf.length > 2000) { fs.writeFileSync(file, buf); report.push([i, (src2 === 0 ? 'google' : 'youdao') + ':' + buf.length]); done = true; }
        }
      } catch (e) { /* try next */ }
      if (!done) await sleep(600);
    }
    if (!done) report.push([i, 'FAILED']);
    await sleep(350);
  }
  const fails = report.filter(r => r[1] === 'FAILED');
  console.log('generated ok: ' + (report.length - fails.length) + ' / ' + report.length);
  if (fails.length) console.log('failed idx: ' + fails.map(f => f[0]).join(','));
  const total = fs.readdirSync(outDir).reduce((a, f) => a + fs.statSync(path.join(outDir, f)).size, 0);
  console.log('audio dir total: ' + (total / 1024).toFixed(0) + ' KB');
  fs.writeFileSync(path.join(__dirname, '_audio_map.json'), JSON.stringify(texts.map((t, i) => [i, t])), 'utf8');
})();
