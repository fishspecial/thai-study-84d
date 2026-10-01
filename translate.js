const fs = require('fs');
const path = require('path');

const words = JSON.parse(fs.readFileSync(path.join(__dirname, 'manao-words.json'), 'utf8'));
const UA = 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 Chrome/124 Safari/537.36';
const sleep = ms => new Promise(r => setTimeout(r, ms));

function dedupe(s) {
  const parts = s.split(/[,，]/).map(x => x.trim()).filter(Boolean);
  const seen = new Set(), out = [];
  for (const p of parts) { if (!seen.has(p)) { seen.add(p); out.push(p); } }
  return out.join('、');
}

async function tr(text) {
  const u = 'https://translate.googleapis.com/translate_a/single?client=gtx&sl=en&tl=zh-CN&dt=t&q=' + encodeURIComponent(text);
  for (let i = 0; i < 3; i++) {
    try {
      const r = await fetch(u, { headers: { 'User-Agent': UA } });
      if (r.ok) {
        const j = await r.json();
        if (Array.isArray(j) && Array.isArray(j[0])) {
          return j[0].map(x => x && x[0] ? x[0] : '').join('').trim();
        }
      }
    } catch (e) { /* retry */ }
    await sleep(500);
  }
  return '';
}

(async () => {
  let done = 0, failed = 0;
  for (let i = 0; i < words.length; i++) {
    const w = words[i];
    if (w.zh) { done++; continue; }
    let zh = await tr(w.en);
    if (zh) { zh = dedupe(zh.replace(/[;；]\s*$/, '')); w.zh = zh; done++; }
    else failed++;
    await sleep(140);
    if ((i + 1) % 200 === 0) {
      console.log('  ' + (i + 1) + '/' + words.length + ' ok=' + done + ' fail=' + failed);
      fs.writeFileSync(path.join(__dirname, 'manao-words.json'), JSON.stringify(words, null, 1), 'utf8');
    }
  }
  fs.writeFileSync(path.join(__dirname, 'manao-words.json'), JSON.stringify(words, null, 1), 'utf8');
  console.log('DONE ok=' + done + ' fail=' + failed);
  console.log(JSON.stringify(words.slice(0, 3), null, 1));
})();
