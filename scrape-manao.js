const fs = require('fs');
const path = require('path');

const UA = 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0 Safari/537.36';
const sleep = ms => new Promise(r => setTimeout(r, ms));

function tag(html, re) { const m = html.match(re); return m ? m[1].trim() : ''; }

function parsePage(html) {
  const out = [];
  const lis = html.split('<li>').slice(1);
  for (const raw of lis) {
    if (raw.indexOf('dict-essential-word') === -1) continue;
    const th = tag(raw, /<span lang="th"[^>]*>([\s\S]*?)<\/span>/);
    if (!th) continue;
    const rom = tag(raw, /<span class="pronunciation">([\s\S]*?)<\/span>/);
    const senses = [...raw.matchAll(/<span class="min-w-0 leading-6">([\s\S]*?)<\/span>/g)]
      .map(m => m[1].replace(/<[^>]+>/g, '').trim())
      .filter(Boolean);
    out.push({ th, rom, en: senses.join('; ') });
  }
  return out;
}

async function get(url) {
  for (let i = 0; i < 3; i++) {
    try {
      const r = await fetch(url, { headers: { 'User-Agent': UA, 'Accept-Language': 'en' } });
      if (r.ok) return await r.text();
    } catch (e) { /* retry */ }
    await sleep(1200);
  }
  return '';
}

async function fetchList(slug) {
  const base = 'https://manao-thai.com/en/word-lists/' + slug;
  const first = await get(base);
  if (!first) { console.log('FAILED ' + slug); return []; }
  const totalM = first.match(/of\s+([\d,]+)\s+words/);
  const total = totalM ? parseInt(totalM[1].replace(/,/g, ''), 10) : 0;
  const pages = Math.max(1, Math.ceil(total / 40));
  console.log(slug + ': ' + total + ' words, ' + pages + ' pages');
  let all = parsePage(first);
  for (let p = 2; p <= pages; p++) {
    const h = await get(base + '/page/' + p);
    if (h) all = all.concat(parsePage(h));
    await sleep(250);
    if (p % 5 === 0) process.stdout.write('  ..' + p + '(' + all.length + ')');
  }
  console.log('\n' + slug + ' parsed: ' + all.length);
  return all;
}

(async () => {
  const p5 = await fetchList('essential');
  await sleep(800);
  const p4 = await fetchList('essential-4');
  const seen = new Set();
  const merged = [];
  for (const it of p5.concat(p4)) {
    if (!it.th || seen.has(it.th)) continue;
    seen.add(it.th);
    merged.push({ ...it, pri: p5.indexOf(it) >= 0 ? 5 : 4 });
  }
  fs.writeFileSync(path.join(__dirname, 'manao-words.json'), JSON.stringify(merged, null, 1), 'utf8');
  console.log('total unique: ' + merged.length);
  const noRom = merged.filter(x => !x.rom).length, noEn = merged.filter(x => !x.en).length;
  console.log('missing rom: ' + noRom + ' | missing en: ' + noEn);
  console.log('sample: ' + JSON.stringify(merged.slice(0, 3)));
  console.log('last: ' + JSON.stringify(merged.slice(-2)));
})();
