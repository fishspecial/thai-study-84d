// 计算「对话高频词 TOP 100」：合计两人语料，分别给出她/我 的使用次数
const fs = require('fs');
const https = require('https');
const seg = new Intl.Segmenter('th', { granularity: 'word' });
const THAI = /[\u0E00-\u0E7F]/;

const C = JSON.parse(fs.readFileSync('corpus.json', 'utf8'));
const T = JSON.parse(fs.readFileSync('corpus-trans.json', 'utf8'));
const dict = JSON.parse(fs.readFileSync('manao-words.json', 'utf8'));
const DICT = new Map(dict.map(w => [w.th, w]));
const FUNCDEF = JSON.parse(fs.readFileSync('pany-func.json', 'utf8'));
const FUNCSET = new Set(JSON.parse(fs.readFileSync('func-set.json', 'utf8')));
const PRON = new Set(['ฉัน','คุณ','เธอ','ผม','เรา','เขา','มัน','หนู','พี่','น้อง']);
const ROM = JSON.parse(fs.readFileSync('rom-map.json', 'utf8'));

// 手写虚词表
const FUNCMAP = new Map();
FUNCDEF.forEach(([t, z, e, note]) => FUNCMAP.set(t, { r: (DICT.get(t) ? DICT.get(t).rom : '') || ROM[t] || '', z, e, note }));
// 已有实词翻译
const WORDMAP = new Map();
T.words.forEach(w => { if (w.z) WORDMAP.set(w.w, { r: w.r || '', z: w.z, e: w.e || '', d: w.d ? 1 : 0 }); });

// 分词器会把 เหรอ 切成 เห|รอ，这里合并回来
function tok(s) {
  const a = [...seg.segment(String(s))].filter(x => x.isWordLike).map(x => x.segment);
  const out = [];
  for (let i = 0; i < a.length; i++) {
    if (a[i] === 'เห' && a[i + 1] === 'รอ') { out.push('เหรอ'); i++; continue; }
    out.push(a[i]);
  }
  return out;
}
const words = tok;
const cntH = new Map(), cntM = new Map();
function count(list, map) {
  let total = 0;
  for (const s of list) {
    for (const w of words(s.t)) {
      if (w.length < 2 || !THAI.test(w)) continue;
      map.set(w, (map.get(w) || 0) + 1);
      total++;
    }
  }
  return total;
}
const totH = count(C.her, cntH), totM = count(C.me, cntM);
console.log('token 总数：她 ' + totH + ' / 我 ' + totM + ' / 合计 ' + (totH + totM));

const all = new Set([...cntH.keys(), ...cntM.keys()]);
const ranked = [...all].map(w => ({ w, h: cntH.get(w) || 0, m: cntM.get(w) || 0, c: (cntH.get(w) || 0) + (cntM.get(w) || 0) }))
  .sort((a, b) => b.c - a.c);
const top = ranked.slice(0, 100);
const cov = top.reduce((a, x) => a + x.c, 0);
console.log('TOP100 覆盖率：' + (cov / (totH + totM) * 100).toFixed(1) + '%');
console.log('TOP200 覆盖率：' + (ranked.slice(0, 200).reduce((a, x) => a + x.c, 0) / (totH + totM) * 100).toFixed(1) + '%');

// 词典释义太长，这里换成短释义（手写虚词表的保持不变，它带用法说明）
const GLOSS = {
  'คน':['人；…的人（人的量词）','person; people; classifier for persons'],
  'ทำ':['做；干','to do; to make'],'อย่าง':['样子；…地（副词化）','manner; -ly'],
  'ตัว':['身体；个（衣服/动物量词）','body; classifier'],'ใช้':['用；使用','to use'],
  'ขึ้น':['上；上升；变得…','to rise; increase'],'ออก':['出；出去','to exit; out'],
  'ดู':['看；看起来','to look; seem'],'ดี':['好','good'],'เงิน':['钱','money'],'วัน':['天；日子','day'],
  'แบบ':['样式；类型；像…那样','style; type; like'],'เรื่อง':['事；关于','matter; about'],
  'ความ':['（抽象名词前缀，把动词/形容词变名词）','abstract-noun prefix (-ness)'],
  'หนึ่ง':['一','one'],'ซื้อ':['买','to buy'],'ภาษา':['语言','language'],
  'ทำงาน':['工作','to work'],'รัก':['爱','to love'],'ส่ง':['送；寄','to send'],
  'หา':['找','to look for'],'ร้าน':['店','shop'],'บ้าน':['家；房子','home; house'],
  'เวลา':['时间','time'],'ชอบ':['喜欢','to like'],'รู้สึก':['感觉','to feel'],
  'ช่วย':['帮；帮忙','to help'],'กลับ':['回','to return'],'ถึง':['到；至于','to reach; as for'],
  'ใน':['在…里','in'],'จาก':['从','from'],'พูด':['说','to speak'],'เห็น':['看见','to see'],
  'ใส่':['穿；放进去','to wear; to put in'],'เอา':['拿；要','to take'],
  'ใช่':['是的；对','yes; correct'],'จริง':['真的','really'],'พอ':['够；还算','enough'],
  'เพื่อน':['朋友','friend'],'ทุก':['每','every'],'ครั้ง':['次','time (occasion)'],
  'เคย':['曾经','ever'],'อย่า':['别…（祈使否定）',"don't"],'ไม่ใช่':['不是','is not'],
  'ไม่มี':['没有','there is no'],'อะไร':['什么','what'],'หรือ':['还是；或者','or'],
  'นั้น':['那','that'],'บอก':['告诉','to tell'],'กิน':['吃','to eat'],'รอ':['等','to wait'],
  'เรา':['我们（亲密对话中也指我）','we; also "I"'],'เขา':['他 / 她','he/she'],
  'แค่':['只是','just; only'],'อีก':['再；又','again; more'],'ด้วย':['也；一起','also; with'],
  'กัน':['一起；互相','together; each other'],'ยัง':['还；仍然','still; yet'],
  'ไหม':['吗（是非问句）','question particle'],'ตอน':['…的时候','when; period'],
  'แต่':['但是','but'],'ถ้า':['如果','if'],'กับ':['跟；和','with; and'],
  'เลย':['干脆；完全；立刻','so; completely'],'มาก':['很；非常','very'],
  'อยู่':['在；正在','to be at; -ing'],'ต้อง':['必须','must'],'มา':['来','to come'],
  'มี':['有','to have'],'ของ':['的；东西','of; thing'],'เป็น':['是','to be'],
  'ให้':['给；让','to give; to let'],'ก็':['也；就；那么','also; then'],
  'ว่า':['说；引导从句','that; to say'],'ไป':['去','to go'],'แล้ว':['了；然后','already; then'],
  'ได้':['可以；得到','can; to get'],'นี้':['这','this'],'ที่':['的；那个；地方','that; which; place'],
  'จะ':['将要','will'],'ไม่':['不；没','not'],'จีน':['中国','China'],
  'เหรอ':['吗？（惊讶 / 反问）','really? (surprised)'],'ทำไม':['为什么','why'],
  'นี่':['这个（近指）','this (here)'],'เอง':['自己；亲自','-self'],'ต่อ':['继续；接着','continue'],
  'ออกจาก':['离开','to leave'],'รักคุณ':['爱你','love you']
};

// 补全释义
const need = [];
top.forEach(x => {
  const f = FUNCMAP.get(x.w), wm = WORDMAP.get(x.w), d = DICT.get(x.w);
  if (f) { x.r = f.r; x.z = f.z; x.e = f.e; x.note = f.note; x.fn = 1; return; }
  if (wm) {
    x.r = wm.r || ROM[x.w] || ''; x.z = wm.z; x.e = wm.e;
    x.fn = (FUNCSET.has(x.w) || PRON.has(x.w) || x.w.length <= 2) ? 1 : 0;
    if (!f && GLOSS[x.w]) { x.z = GLOSS[x.w][0]; x.e = GLOSS[x.w][1]; }
    return;
  }
  if (d) { x.r = d.rom; x.z = d.zh; x.e = d.en; x.fn = 0; }
  else { x.r = ROM[x.w] || ''; x.z = ''; x.e = ''; x.fn = (FUNCSET.has(x.w) || PRON.has(x.w) || x.w.length <= 2) ? 1 : 0; need.push(x); }
  if (!x.r) x.r = ROM[x.w] || '';
  // 短释义覆盖（手写虚词表保留，它带用法说明）
  if (!f && GLOSS[x.w]) { x.z = GLOSS[x.w][0]; x.e = GLOSS[x.w][1]; }
});
console.log('需要翻译：' + need.length + ' 个 → ' + need.map(x => x.w).join(' '));

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

(async () => {
  const jobs = [];
  need.forEach(x => { jobs.push({ x, tl: 'zh-CN', f: 'z' }); jobs.push({ x, tl: 'en', f: 'e' }); });
  const q = jobs.slice();
  async function wk() { while (q.length) { const j = q.shift(); j.x[j.f] = await tr(j.x.w, j.tl); } }
  await Promise.all(Array.from({ length: 5 }, wk));
  top.forEach((x, i) => { x.i = i; });
  fs.writeFileSync('top100.json', JSON.stringify({ list: top, cov: +(cov / (totH + totM) * 100).toFixed(1), totH, totM }, null, 1));
  console.log('缺中文：' + top.filter(x => !x.z).length + ' | 缺转写：' + top.filter(x => !x.r).length);
  console.log('\nTOP 30：');
  top.slice(0, 30).forEach((x, i) => console.log((i + 1) + '. ' + x.w + '  合计×' + x.c + '（她' + x.h + '/我' + x.m + '） ' + x.z));
})();
