// 生成最终前端数据 pany-data.js（v2）+ 音频任务清单
const fs = require('fs');
const T = JSON.parse(fs.readFileSync('corpus-trans.json', 'utf8'));
const dict = JSON.parse(fs.readFileSync('manao-words.json', 'utf8'));
const DICT = new Map(dict.map(w => [w.th, w]));
const FUNCDEF = JSON.parse(fs.readFileSync('pany-func.json', 'utf8'));

const ROM = {
  'จีน':'jiin','ที่รัก':'thîi-rák','ลาว':'laao','ม้ง':'móng','เวียดนาม':'wíat-naam','ตรวจ':'trùat','ไหร่':'rài',
  'สะใภ้':'sà-phái','มากกว่า':'mâak-kwàa','เข้าไป':'khâo-pai','หุ้น':'hûn','ยางพารา':'yaang-phaa-raa',
  'ฉะนั้น':'chà-nán','ตู้':'tûu','เจ้า':'jâo','ไม่รู้':'mâi-rúu','หน้าตา':'nâa-taa','หุ่น':'hǔn','คิดมาก':'khít-mâak',
  'ลงทุน':'long-thun','สำเร็จ':'sǎm-rét','อยู่ดี':'yùu-dii','พอแล้ว':'phɔɔ-láeo','หมายความ':'mǎai-khwaam',
  'โรง':'roong','สวยๆ':'sǔai-sǔai','ใกล้ๆ':'klâi-klâi','ใครๆ':'khrai-khrai','ตัดสิน':'tàt-sǐn','ขาดใจ':'khàat-jai',
  'ประสบ':'prà-sòp','ดอลลาร์':'dɔn-laa','ที่พัก':'thîi-phák','ทั่วไป':'thûa-pai','สัมพันธ์':'sǎm-phan','ทวง':'thuang',
  'สุข':'sùk','นอกใจ':'nɔ̂ɔk-jai','ควบคุม':'khûap-khum','สไตล์':'sà-taai','มดลูก':'mót-lûuk','ไลฟ์':'láif',
  'ราย':'raai','ประเพณี':'prà-phée-nii','ปัง':'pang','ชั่วโมง':'chûa-moong','หาก':'hàak','หากว่า':'hàak-wâa',
  'พระเจ้า':'phrá-jâo','ทีหลัง':'thii-lǎng','เย็นๆ':'yen-yen','ใบหน้า':'bai-nâa','เสริม':'sǒem','เท่านั้น':'thâo-nán',
  'พรุ่ง':'phrûng','นึง':'nùeng',
  'จ๊ะ':'já','เนาะ':'náw','ไง':'ngai','น่ะ':'nâ','อ่ะ':'à','เมื่อไหร่':'mûa-rài'
};
const HIDE_W = new Set(['เป็นไร','ค่อน','รีย์','เดีย','งบ่อยๆ','ว่าการ','มีหน้า','มันดี','กี้','หมอบ','ลมี']);
const HIDE_G = new Set(['ไม่ใช่เห']);
const ROMX = JSON.parse(fs.readFileSync('rom-extra.json', 'utf8'));

const words = T.words.map((w, i) => ({
  i, t: w.w, r: w.r || ROM[w.w] || '', z: w.z || '', e: w.e || '', c: w.c, df: w.df || 0, h: HIDE_W.has(w.w) ? 1 : 0
}));

const cntMap = new Map();
JSON.parse(fs.readFileSync('corpus.json', 'utf8')).herWords.forEach(w => cntMap.set(w.w, w.c));
const func = FUNCDEF.map(([t, z, e, note], i) => {
  const d = DICT.get(t);
  return { i, t, r: d ? d.rom : (ROM[t] || ''), z, e, note, c: cntMap.get(t) || 0 };
});

const herGrams = T.herGrams.map((g, i) => ({ i, t: g.g, r: ROMX.grams[g.g] || '', z: g.z || '', e: g.e || '', c: g.c, h: HIDE_G.has(g.g) ? 1 : 0 }));
const myGrams = T.grams.map((g, i) => ({ i, t: g.g, r: ROMX.grams[g.g] || '', z: g.z || '', e: g.e || '', c: g.c, h: HIDE_G.has(g.g) ? 1 : 0 }));

// 例句：统一 ID。她 = h{i}，我 = m{i}
const sents = [];
T.her.forEach((s, i) => sents.push({ id: 'h' + i, t: s.t, r: ROMX.sents['h' + i] || '', z: s.z || '', who: 0, priv: s.priv ? 1 : 0, len: s.t.length }));
T.me.forEach((s, i) => sents.push({ id: 'm' + i, t: s.t, r: ROMX.sents['m' + i] || '', z: s.z || '', who: 1, priv: s.priv ? 1 : 0, len: s.t.length }));

const T100 = JSON.parse(fs.readFileSync('top100.json', 'utf8'));
const top100 = T100.list.map((x, i) => ({ i, t: x.w, r: x.r || '', z: x.z || '', e: x.e || '', h: x.h, m: x.m, c: x.c, fn: x.fn ? 1 : 0, note: x.note || '' }));

const out = 'window.PANY=' + JSON.stringify({ words, func, herGrams, myGrams, sents, top100, cov: T100.cov }) + ';';
fs.writeFileSync('pany-data.js', out);
console.log('words=' + words.length + ' func=' + func.length + ' herGrams=' + herGrams.length + ' myGrams=' + myGrams.length + ' sents=' + sents.length + ' top100=' + top100.length + ' 覆盖=' + T100.cov + '%');
console.log('bytes=' + out.length);

// 音频任务
const HER_MAX = 120, ME_MAX = 70;
// 前缀：w 词 / f 虚词 / p 她的短句 / q 我的短句 / h 她的例句 / m 我的例句
const jobs = [];
words.forEach(w => jobs.push({ f: 'w' + w.i + '.mp3', t: w.t }));
func.forEach(x => jobs.push({ f: 'f' + x.i + '.mp3', t: x.t }));
herGrams.forEach(g => jobs.push({ f: 'p' + g.i + '.mp3', t: g.t }));
myGrams.forEach(g => jobs.push({ f: 'q' + g.i + '.mp3', t: g.t }));
sents.forEach(s => {
  const lim = s.who === 0 ? HER_MAX : ME_MAX;
  if (s.len <= lim) jobs.push({ f: s.id + '.mp3', t: s.t });
});
fs.writeFileSync('audio-jobs.json', JSON.stringify(jobs));
console.log('音频任务 ' + jobs.length + '（她≤' + HER_MAX + '字 ' + sents.filter(s => s.who === 0 && s.len <= HER_MAX).length + '/'
  + sents.filter(s => s.who === 0).length + '；我≤' + ME_MAX + '字 ' + sents.filter(s => s.who === 1 && s.len <= ME_MAX).length + '/'
  + sents.filter(s => s.who === 1).length + '）');
console.log('超长走在线兜底：' + sents.filter(s => s.len > (s.who === 0 ? HER_MAX : ME_MAX)).length);
console.log('缺中文例句：' + sents.filter(s => !s.z).length);
