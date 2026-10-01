// 合并三组语料：① 清洗后的她（含恢复的私密句）② docx 中泰对照（她）③ docx 中泰对照（我）
const fs = require('fs');
const seg = new Intl.Segmenter('th', { granularity: 'word' });
const THAI = /[\u0E00-\u0E7F]/;

const clean = JSON.parse(fs.readFileSync('pany-clean.json', 'utf8'));
const trans = JSON.parse(fs.readFileSync('pany-trans.json', 'utf8'));   // 机翻中文
const dPany = JSON.parse(fs.readFileSync('docx-pany.json', 'utf8'));
const dMe = JSON.parse(fs.readFileSync('docx-me.json', 'utf8'));

// 机翻中文（key = 去空格泰文）
const MT = new Map();
trans.sents.forEach(s => { const k = String(s.t).replace(/\s+/g, ''); if (s.z && !MT.has(k)) MT.set(k, s.z); });

const norm = s => String(s || '').replace(/\s+/g, '').trim();
const words = s => [...seg.segment(String(s))].filter(x => x.isWordLike).map(x => x.segment);

// 私密标记：按分词 token 命中
const BLOCK = new Set(['ถุงยาง','อนามัย','ข่มขืน','โสเภณี','ขายตัว','ร่วมเพศ','แข็งตัว','หน้าอก','นม','หอย','อวัยวะ','เพศ']);
const isPriv = s => words(norm(s)).some(w => BLOCK.has(w));

// ---------- 她的语料 ----------
const herMap = new Map();          // key -> {n,t,z,priv}
function addHer(n, t, z, priv) {
  const k = norm(t);
  if (!k || !THAI.test(k)) return;
  if (herMap.has(k)) { if (z && !herMap.get(k).z) herMap.get(k).z = z; return; }
  herMap.set(k, { n, t: t.trim(), z: z || '', priv: priv ? 1 : 0 });
}

clean.sentences.forEach(s => addHer(s.n, s.t, MT.get(norm(s.t)) || '', 0));
clean.blocked.forEach(s => addHer(s.n, s.t, MT.get(norm(s.t)) || '', 1));

const garbageKeys = new Set(clean.garbageKeys);
let fromDocx = 0;
// docx 的中文优先（来自他自己的翻译记录，比机翻准）
dPany.forEach(d => {
  const k = norm(d.t);
  if (garbageKeys.has(k)) return;         // 之前判为乱码的，不因为出现在这里就放回来
  const cur = herMap.get(k);
  if (cur) { if (d.z && d.z !== cur.z) cur.z = d.z; return; }
  addHer(d.n, d.t, d.z || '', isPriv(d.t) ? 1 : 0);
  fromDocx++;
});

// ---------- 我的语料 ----------
const myMap = new Map();
dMe.forEach(d => {
  const k = norm(d.t);
  if (!k || !THAI.test(k)) return;
  if (myMap.has(k)) return;
  myMap.set(k, { n: d.n, t: d.t.trim(), z: d.z || '', priv: isPriv(d.t) ? 1 : 0 });
});

const her = [...herMap.values()].sort((a, b) => a.n - b.n);
const me = [...myMap.values()].sort((a, b) => a.n - b.n);

console.log('她：清洗后 ' + clean.sentences.length + ' + 私密恢复 ' + clean.blocked.length + ' + docx 新增 ' + fromDocx + ' = ' + her.length);
console.log('我：' + me.length);
console.log('她缺中文：' + her.filter(x => !x.z).length + ' | 我缺中文：' + me.filter(x => !x.z).length);
console.log('私密句：她 ' + her.filter(x => x.priv).length + ' | 我 ' + me.filter(x => x.priv).length);

// ---------- 我的高频短句（n-gram）----------
const PRON = new Set(['ฉัน','คุณ','เธอ','ผม','เรา','เขา','มัน','หนู','พี่','น้อง']);
const HEAD_BAD = new Set(['จะ','ได้','แล้ว','ก็','และ','แต่','หรือ','เพราะ','ว่า','ของ','ให้','ไป','มา','ที่','อยู่','เป็น','มี','ไหม','หรอ','เหรอ','นะ','ครับ','ค่ะ','สิ','เลย','หน่อย','เถอะ','เนาะ','ด้วย','นั้น','นี้','นั่น','น่ะ','อ่ะ','แหละ','เนี่ย','ล่ะ','ไง','จัง','คือ','เคย','คง','ยัง','อีก','ต่อ','ไว้','เอา','ต้อง','แล้วก็','ก็เลย','จึง','ส่วน','เรื่อง','อย่าง','เช่น','แบบ','ถ้า','ถึง','ตอน','เมื่อ','เพื่อ','สำหรับ','กว่า','มาก','น้อย','สุด','กัน','เอง','ที','ครั้ง','กับ','ทำไม','เดี๋ยว','หมด','เสร็จ','พอ']);
const TAIL_BAD = new Set(['จะ','ได้','แล้ว','ก็','และ','แต่','หรือ','เพราะ','ว่า','ของ','ให้','ไป','มา','ที่','อยู่','เป็น','มี','ไหม','หรอ','เหรอ','นะ','ครับ','ค่ะ','สิ','เลย','หน่อย','เถอะ','เนาะ','ด้วย','นั้น','นี้','นั่น','น่ะ','อ่ะ','แหละ','เนี่ย','ล่ะ','ไง','จัง','คือ','เคย','คง','ยัง','อีก','ต่อ','ไว้','เอา','ต้อง','แล้วก็','ส่วน','เรื่อง','อย่าง','แบบ','ถ้า','ถึง','ตอน','เมื่อ','เพื่อ','สำหรับ','กว่า','มาก','น้อย','สุด','กัน','เอง','ที','ครั้ง','นี้','มัน','เรา','เขา','ไม่','ไม่ได้','อยาก','แค่','ค่อย','เพิ่ง','กำลัง','คิด','บอก','รู้สึก','ถาม','คน','ก็ได้','รอ','พา','รู้','เห็น','ทำ','เริ่ม','จบ','เลิก','ชอบ','ใช่','หมด','เสร็จ','พอ','เกิน']);
const TRANS = new Set(['ให้','พา','รอ','บอก','ถาม','โทร','ส่ง','ซื้อ','เอา','หา','เรียก','สอน','ขอ','ตอบ','ช่วย','ดู','ฟัง','คุย','เปลี่ยน','ปล่อย','ทิ้ง','ห้าม','ตาม','เชิญ','เลี้ยง','เตือน','ขัด','บังคับ','กอด','จูบ']);
const FUNC = new Set(['ที่','และ','แต่','หรือ','เพราะ','ถ้า','ก็','ยัง','อีก','ต่อ','ไว้','เอา','ต้อง','แล้ว','ได้','เป็น','อยู่','มี','ไป','มา','ให้','ของ','ว่า','นะ','ครับ','ค่ะ','สิ','เลย','หน่อย','เถอะ','ไหม','นี้','นั้น','นี่','นั่น','ไหน','ทำไม','ยังไง','เมื่อไหร่','เท่าไหร่','กี่','จริง','มาก','น้อย','หมด','เดี๋ยว','ช่วง','ทุก','ทั้ง','หลาย','บ้าง','กัน','เอง','ด้วย','แบบ','อย่าง','ตอน','ก่อน','หลัง','เมื่อ','กว่า','เกิน','แค่','ค่อย','เพิ่ง','กำลัง','เคย','คง','ใช่','ไม่','ไม่ได้','ไม่มี','อยาก','รู้สึก','คิด','บอก','ถาม','ตอบ','รอ','ดู','ฟัง','พูด','คุย','เจอ','พบ','รู้','เข้าใจ','จำ','ลืม','เปลี่ยน','ช่วย']);

function extractGrams(list, limit, minCount) {
  const gc = new Map(), gex = new Map();
  for (const s of list) {
    const ws = words(s.t).filter(w => w.length >= 2 && THAI.test(w));
    for (let size = 2; size <= 4; size++) {
      for (let i = 0; i + size <= ws.length; i++) {
        const toks = ws.slice(i, i + size);
        const g = toks.join('');
        if (g.length < 5) continue;
        if (HEAD_BAD.has(toks[0])) continue;
        if (toks.length === 2 && PRON.has(toks[0])) continue;
        const tail = toks[toks.length - 1];
        const tailOk = PRON.has(tail) ? (!FUNC.has(toks[0]) && !TRANS.has(toks[0])) : !TAIL_BAD.has(tail);
        if (!tailOk) continue;
        gc.set(g, (gc.get(g) || 0) + 1);
        if (!gex.has(g)) gex.set(g, s.n);
      }
    }
  }
  const out = [];
  for (const [g, c] of [...gc.entries()].sort((a, b) => b[1] - a[1])) {
    if (out.some(k => k.g.includes(g))) continue;
    if (c < minCount) continue;
    out.push({ g, c, ex: gex.get(g) });
    if (out.length >= limit) break;
  }
  return out;
}
const myGrams = extractGrams(me, 160, 3);
const herGrams = extractGrams(her, 200, 3);
console.log('我的高频短句：' + myGrams.length + '（TOP5: ' + myGrams.slice(0, 5).map(x => x.g + '×' + x.c).join(', ') + '）');
console.log('她的高频短句：' + herGrams.length + '（TOP5: ' + herGrams.slice(0, 5).map(x => x.g + '×' + x.c).join(', ') + '）');

// ---------- 她的词频重算（含恢复的私密句）----------
const wc = new Map(), wdf = new Map();
for (const l of her) {
  const ws = words(l.t).filter(w => w.length >= 2 && THAI.test(w));
  for (const w of ws) wc.set(w, (wc.get(w) || 0) + 1);
  for (const w of new Set(ws)) wdf.set(w, (wdf.get(w) || 0) + 1);
}
console.log('她的 token 总数：' + [...wc.values()].reduce((a, b) => a + b, 0));

fs.writeFileSync('corpus.json', JSON.stringify({ her, me, myGrams, herGrams, herWords: [...wc.entries()].map(([w, c]) => ({ w, c, df: wdf.get(w) || 0 })).sort((a, b) => b.c - a.c) }, null, 1));
console.log('已写入 corpus.json');
