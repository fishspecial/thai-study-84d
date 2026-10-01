// 生成前端数据 pany-data.js
const fs = require('fs');
const tr = JSON.parse(fs.readFileSync('pany-trans.json', 'utf8'));
const dict = JSON.parse(fs.readFileSync('manao-words.json', 'utf8'));
const DICT = new Map(dict.map(w => [w.th, w]));
const FUNC = JSON.parse(fs.readFileSync('pany-func.json', 'utf8'));

const cntMap = new Map();
tr.words.forEach(w => cntMap.set(w.w, w.c));
JSON.parse(fs.readFileSync('pany-clean.json', 'utf8')).words.forEach(w => cntMap.set(w.w, w.c));

// 词典里没有的手工转写
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
  // 虚词
  'จ๊ะ':'já','เนาะ':'náw','ไง':'ngai','น่ะ':'nâ','อ่ะ':'à','เมื่อไหร่':'mûa-rài'
};
// 分词产生的碎片（不是真正的词），页面隐藏
const HIDE = new Set(['เป็นไร','ค่อน','รีย์','เดีย','งบ่อยๆ','ว่าการ','มีหน้า','มันดี','กี้','หมอบ']);

const words = tr.words.map((w, i) => ({
  i, t: w.w, r: w.r || ROM[w.w] || '', z: w.z || '', e: w.e || '', c: w.c, df: w.df, ex: w.ex,
  d: w.fromDict ? 1 : 0, h: HIDE.has(w.w) ? 1 : 0
}));

const func = FUNC.map(([t, z, e, note], i) => {
  const d = DICT.get(t);
  return { i, t, r: d ? d.rom : (ROM[t] || ''), z, e, note, c: cntMap.get(t) || 0 };
});

const grams = tr.grams.map((g, i) => ({ i, t: g.g, z: g.z || '', e: g.e || '', c: g.c, ex: g.ex }));
const sents = tr.sents.map(s => ({ n: s.n, t: s.t, z: s.z || '' }));

const out = 'window.PANY=' + JSON.stringify({ words, func, grams, sents }) + ';';
fs.writeFileSync('pany-data.js', out);
console.log('words=' + words.length + ' func=' + func.length + ' grams=' + grams.length + ' sents=' + sents.length);
console.log('bytes=' + out.length);
const missR = func.filter(f => !f.r).map(f => f.t);
console.log('虚词缺转写(' + missR.length + '):', missR.join(' '));
console.log('词缺中文:', words.filter(w => !w.z).length, '| 短句缺中文:', grams.filter(g => !g.z).length, '| 例句缺中文:', sents.filter(s => !s.z).length);
console.log('无转写的实词:', words.filter(w => !w.r).length, '/', words.length);
