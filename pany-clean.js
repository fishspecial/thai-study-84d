// 清洗 Pany 的聊天语料：去噪 -> 去垃圾输入 -> 去重 -> 分词 -> 词频/短句频次
const fs = require('fs');
const seg = new Intl.Segmenter('th', { granularity: 'word' });

const SRC = 'C:/Users/Chuyu Tan/WorkBuddy/2026-10-02-02-33-02/outputs/pany说的_泰语原文.txt';
const DICT_PATH = 'C:/Users/Chuyu Tan/WorkBuddy/2026-10-01-23-41-19/thai-study/manao-words.json';

const THAI = /[\u0E00-\u0E7F]/;
const CJK = /[\u4E00-\u9FFF]/;

// 1) 读取并初步清洗
function readLines() {
  const raw = fs.readFileSync(SRC, 'utf8').split(/\r?\n/);
  const out = [];
  for (const line of raw) {
    const m = line.match(/^\s*(\d+)\.\s*(.*)$/);
    if (!m) continue;
    let t = m[2].trim();
    if (!t) continue;
    // 去掉 emoji / 符号
    t = t.replace(/[\u{1F300}-\u{1FAFF}\u{2600}-\u{27BF}\uFE0F\u200D]/gu, '');
    // 去掉中文说明前缀（如「图中的泰语文字为：」）
    if (CJK.test(t)) {
      const parts = t.split(/[：:]/);
      const thaiPart = parts.filter(p => THAI.test(p)).pop();
      t = thaiPart ? thaiPart.trim() : '';
    }
    // 只保留泰文 + 数字 + 空格 + 少量标点
    t = t.replace(/[^\u0E00-\u0E7F0-9\s.?!'",ฯๆ]/g, ' ');
    t = t.replace(/\s+/g, ' ').trim();
    if (!THAI.test(t)) continue;
    out.push({ n: +m[1], t });
  }
  return out;
}

// 2) 分词
function words(s) {
  return [...seg.segment(s)].filter(x => x.isWordLike).map(x => x.segment);
}

// 3) 敏感/成人内容过滤（按分词 token 匹配，避免无空格泰文的子串误伤）
const BLOCK = new Set(['ถุงยาง', 'อนามัย', 'ข่มขืน', 'โสเภณี', 'ขายตัว', 'ร่วมเพศ', 'แข็งตัว', 'หน้าอก', 'นม', 'หอย', 'อวัยวะ', 'เพศ', 'ข่มขืน']);
function blocked(s) {
  return words(s.replace(/\s/g, '')).some(w => BLOCK.has(w));
}

// 4) 打分：分词后「已知词」覆盖率，用来剔除乱敲/错字
function buildKnown(lines) {
  const cnt = new Map();
  for (const l of lines) for (const w of words(l.t.replace(/\s/g, ''))) {
    if (w.length >= 2) cnt.set(w, (cnt.get(w) || 0) + 1);
  }
  const dict = new Set(JSON.parse(fs.readFileSync(DICT_PATH, 'utf8')).map(w => w.th));
  return { cnt, dict };
}

const FUNC = new Set(['ฉัน','คุณ','เธอ','ผม','เรา','เขา','ที่','นี้','นั้น','นี่','นั่น','แล้ว','ก็','จะ','ไม่','ได้','ไหม','หรอ','เหรอ','นะ','ครับ','ค่ะ','จ๊ะ','เนาะ','นะคะ','เป็น','อยู่','มี','ไป','มา','ให้','ต้อง','ว่า','อะไร','ใคร','ทำไม','ยัง','มาก','น้อย','ด้วย','แต่','และ','หรือ','เพราะ','ถ้า','ถึง','ตอน','วัน','คน','อย่าง','แบบ','ทั้ง','ทุก','หลาย','บ้าง','เลย','อีก','ต่อ','ไว้','เอา','เพื่อ','กัน','เอง','ใช่','ไม่เป็นไร','โอเค','หน่อย','เถอะ','สิ','น่ะ','แล้วก็','สำหรับ','จริง','จริงๆ','ขนาด','ไง','ล่ะ','เนี่ย','อ่ะ','แหละ','เหมือน','ตอนนี้','พรุ่งนี้','เมื่อไหร่','ยังไง','แบบนี้','แบบนั้น','อย่างนี้','อย่างนั้น','นิด','หน่อย','มากๆ','เยอะ','ที','ครั้ง','เดี๋ยว','พอ','เสมอ','บ่อย','ตรง','ข้าง','ใน','นอก','บน','ล่าง','ของ','จาก','กับ','ต่อไป','ตอนนี้','ขณะนี้','ส่วน','เรื่อง','อย่าง','เช่น','แบบว่า','คือ','ใช่ไหม','ได้ไหม','เป็นไหม','หรือยัง','หรือเปล่า','หรอก','แน่','แน่นอน','คง','อาจ','น่า','ต้องการ','อยาก','รู้สึก','คิด','บอก','ถาม','ตอบ','รอ','ดู','ฟัง','พูด','คุย','เจอ','พบ','รู้','เข้าใจ','จำ','ลืม','เปลี่ยน','ช่วย','ทำ','กิน','นอน','ตื่น','ไป','มา','กลับ','อยู่','ได้','เอา','ซื้อ','ขาย','ให้','ส่ง','รับ','โทร','ใช้','เปิด','ปิด','นั่ง','ยืน','เดิน','ขับ','ขึ้น','ลง','เข้า','ออก','เจ็บ','ปวด','เหนื่อย','หิว','ร้อน','หนาว','ดี','แย่','สวย','หล่อ','น่ารัก','เก่ง','โกรธ','งอน','ดีใจ','เสียใจ','คิดถึง','รัก','ห่วง','กลัว','เบื่อ','สนใจ','เข้าใจ','สำคัญ','จำเป็น','ยาก','ง่าย','เร็ว','ช้า','ใหม่','เก่า','ใหญ่','เล็ก','ยาว','สั้น','ถูก','แพง','เรียบร้อย','ปลอดภัย','สบาย','พร้อม','ว่าง','ยุ่ง','โชคดี','ผิด','ถูกต้อง','แน่ใจ','สงสัย']);

function coverage(s, known) {
  const ws = words(s).filter(w => w.length >= 2);
  if (!ws.length) return { score: 0, n: 0 };
  let hit = 0, total = 0;
  for (const w of ws) {
    total += w.length;
    if ((known.cnt.get(w) || 0) >= 2 || known.dict.has(w) || FUNC.has(w)) hit += w.length;
  }
  return { score: hit / total, n: ws.length };
}

// ---- main ----
const lines = readLines();
console.log('原始条目:', lines.length);

const known = buildKnown(lines);

const kept = [], dropGarbage = [], dropBlock = [], dropShort = [];
for (const l of lines) {
  if (blocked(l.t)) { dropBlock.push({ ...l, priv: 1 }); continue; }
  const ns = l.t.replace(/\s/g, '');
  if ([...ns].filter(c => THAI.test(c)).length < 3) { dropShort.push(l); continue; }
  const a = coverage(l.t, known), b = coverage(ns, known);
  const better = b.score >= a.score ? ns : l.t;
  const sc = Math.max(a.score, b.score);
  if (sc < 0.55) { dropGarbage.push({ ...l, score: +sc.toFixed(2) }); continue; }
  kept.push({ n: l.n, t: better, score: +sc.toFixed(2) });
}

// 去重（去空格后完全相同；以及被更长句子包含的短句）
const seen = new Map();
for (const k of kept) {
  const key = k.t.replace(/\s/g, '');
  if (!seen.has(key) || seen.get(key).t.length < k.t.length) seen.set(key, k);
}
let uniq = [...seen.values()].sort((a, b) => a.n - b.n);
const keys = uniq.map(u => u.t.replace(/\s/g, ''));
const final = uniq.filter(u => {
  const k = u.t.replace(/\s/g, '');
  return !keys.some(o => o !== k && o.includes(k) && o.length > k.length + 2);
});

console.log('敏感过滤:', dropBlock.length, '| 过短:', dropShort.length, '| 乱码/错字:', dropGarbage.length);
console.log('去重后:', uniq.length, '| 去掉被包含的子句后:', final.length);

// ---- 词频 ----
const wc = new Map(), wdf = new Map();
for (const l of final) {
  const ws = words(l.t).filter(w => w.length >= 2 && THAI.test(w));
  for (const w of ws) wc.set(w, (wc.get(w) || 0) + 1);
  for (const w of new Set(ws)) wdf.set(w, (wdf.get(w) || 0) + 1);
}

// ---- n-gram 短句（带首尾约束，剔除「ฉันจะ / ของฉัน」这类碎片）----
const PRON = new Set(['ฉัน', 'คุณ', 'เธอ', 'ผม', 'เรา', 'เขา', 'มัน', 'หนู', 'พี่', 'น้อง']);
const HEAD_BAD = new Set(['จะ','ได้','แล้ว','ก็','และ','แต่','หรือ','เพราะ','ว่า','ของ','ให้','ไป','มา','ที่','อยู่','เป็น','มี','ไหม','หรอ','เหรอ','นะ','ครับ','ค่ะ','สิ','เลย','หน่อย','เถอะ','เนาะ','ด้วย','นั้น','นี้','นั่น','น่ะ','อ่ะ','แหละ','เนี่ย','ล่ะ','ไง','จัง','คือ','เคย','คง','ยัง','อีก','ต่อ','ไว้','เอา','ต้อง','แล้วก็','ก็เลย','จึง','ส่วน','เรื่อง','อย่าง','เช่น','แบบ','แบบว่า','ถ้า','ถึง','ตอน','เมื่อ','เพื่อ','สำหรับ','กว่า','มาก','น้อย','สุด','เสมอ','บ่อย','พอ','ค่อย','เพิ่ง','กำลัง','กัน','เอง','ที','ครั้ง','นี้','กับ','ทำไม','เดี๋ยว','หมด','เสร็จ','พอ','เพียง','ส่วนใหญ่','ถ้าหาก','เนื่องจาก','หลังจาก','ก่อนที่','ตอนที่','เพราะว่า','อย่างที่','ถึงแม้']);
const TAIL_BAD = new Set(['จะ','ได้','แล้ว','ก็','และ','แต่','หรือ','เพราะ','ว่า','ของ','ให้','ไป','มา','ที่','อยู่','เป็น','มี','ไหม','หรอ','เหรอ','นะ','ครับ','ค่ะ','สิ','เลย','หน่อย','เถอะ','เนาะ','ด้วย','นั้น','นี้','นั่น','น่ะ','อ่ะ','แหละ','เนี่ย','ล่ะ','ไง','จัง','คือ','เคย','คง','ยัง','อีก','ต่อ','ไว้','เอา','ต้อง','แล้วก็','ส่วน','เรื่อง','อย่าง','เช่น','แบบ','แบบว่า','ถ้า','ถึง','ตอน','เมื่อ','เพื่อ','สำหรับ','กว่า','มาก','น้อย','สุด','กัน','เอง','ที','ครั้ง','นี้','มัน','เรา','เขา','ใช่ไหม','หรือยัง','หรือเปล่า','ได้ไหม','เป็นไร','ไม่','ไม่ได้','อยาก','แค่','ค่อย','เพิ่ง','กำลัง','คิด','บอก','รู้สึก','ถาม','คน','ก็ได้','รอ','พา','รู้','เห็น','ทำ','เริ่ม','จบ','เลิก','ชอบ','ใช่','หมด','เสร็จ','พอ','เกิน']);
// 及物动词：后面接代词时不算完整搭配（รอฉัน / พาคุณ / ให้คุณ）
const TRANS = new Set(['ให้','พา','รอ','บอก','ถาม','โทร','ส่ง','ซื้อ','เอา','หา','เรียก','สอน','ขอ','ตอบ','ช่วย','ดู','ฟัง','คุย','เปลี่ยน','ปล่อย','ทิ้ง','ห้าม','ตาม','เชิญ','เลี้ยง','เตือน','ขัด','บังคับ','กอด','จูบ']);

const gc = new Map(), gex = new Map();
for (const l of final) {
  const ws = words(l.t).filter(w => w.length >= 2 && THAI.test(w));
  for (let size = 2; size <= 4; size++) {
    for (let i = 0; i + size <= ws.length; i++) {
      const toks = ws.slice(i, i + size);
      const g = toks.join('');
      if (g.length < 5) continue;
      if (HEAD_BAD.has(toks[0])) continue;
      // 双token 且以代词开头 → 「ฉันไม่ / คุณไป」这类碎片，丢弃
      if (toks.length === 2 && PRON.has(toks[0])) continue;
      const tail = toks[toks.length - 1];
      const tailOk = PRON.has(tail)
        ? (!FUNC.has(toks[0]) && !TRANS.has(toks[0]))
        : !TAIL_BAD.has(tail);
      if (!tailOk) continue;
      gc.set(g, (gc.get(g) || 0) + 1);
      if (!gex.has(g)) gex.set(g, l.n);
    }
  }
}
// 去掉被更高频长句包含的碎片
const gramsRaw = [...gc.entries()].sort((a, b) => b[1] - a[1]);
const keptG = [];
for (const [g, c] of gramsRaw) {
  if (keptG.some(k => k.g.includes(g))) continue;
  keptG.push({ g, c, ex: gex.get(g) });
  if (keptG.length >= 220) break;
}

function isFunc(w) { return FUNC.has(w) || PRON.has(w) || w.length <= 2; }
const wordList = [...wc.entries()]
  .map(([w, c]) => ({ w, c, df: wdf.get(w) || 0, func: isFunc(w) }))
  .sort((a, b) => b.c - a.c);

// 给每个词附一个例句编号
const wEx = new Map();
for (const l of final) {
  const ws = words(l.t).filter(w => w.length >= 2 && THAI.test(w));
  for (const w of ws) if (!wEx.has(w)) wEx.set(w, l.n);
}
for (const w of wordList) w.ex = wEx.get(w.w);

fs.writeFileSync('func-set.json', JSON.stringify([...FUNC]));
fs.writeFileSync('pany-clean.json', JSON.stringify({
  sentences: final,
  words: wordList,
  grams: keptG,
  blocked: dropBlock.map(l => ({ n: l.n, t: l.t, priv: 1 })),
  garbageKeys: dropGarbage.map(l => l.t.replace(/\s/g, '')),
  dropped: { block: dropBlock.length, short: dropShort.length, garbage: dropGarbage.length, garbageSample: dropGarbage.slice(0, 40) }
}, null, 1));

console.log('\n--- 高频实词 TOP 40 ---');
wordList.filter(x => !x.func).slice(0, 40).forEach((x, i) => console.log((i + 1) + '. ' + x.w + '  ×' + x.c + '  (' + x.df + ' 句)'));
console.log('\n--- 高频虚词/语气 TOP 15 ---');
wordList.filter(x => x.func).slice(0, 15).forEach((x, i) => console.log((i + 1) + '. ' + x.w + '  ×' + x.c));
console.log('\n--- 高频短句 TOP 40 ---');
keptG.slice(0, 40).forEach((x, i) => console.log((i + 1) + '. ' + x.g + '  ×' + x.c));
