// 泰文 → RTGS 罗马转写（带声调符号）
// 风格对齐 manao 词库：กา / ม่ / ม้า / หมา / ใหม่ 之类
var INI = {
  'ก':['k','m'], 'ข':['kh','h'], 'ฃ':['kh','h'], 'ค':['kh','l'], 'ฅ':['kh','l'], 'ฆ':['kh','l'],
  'ง':['ng','l'], 'จ':['j','m'], 'ฉ':['ch','h'], 'ช':['ch','l'], 'ซ':['s','l'], 'ฌ':['ch','l'],
  'ญ':['y','l'], 'ฎ':['d','m'], 'ฏ':['t','m'], 'ฐ':['th','h'], 'ฑ':['th','l'], 'ฒ':['th','l'],
  'ณ':['n','l'], 'ด':['d','m'], 'ต':['t','m'], 'ถ':['th','h'], 'ท':['th','l'], 'ธ':['th','l'],
  'น':['n','l'], 'บ':['b','m'], 'ป':['p','m'], 'ผ':['ph','h'], 'ฝ':['f','h'], 'พ':['ph','l'],
  'ฟ':['f','l'], 'ภ':['ph','l'], 'ม':['m','l'], 'ย':['y','l'], 'ร':['r','l'], 'ล':['l','l'],
  'ว':['w','l'], 'ศ':['s','h'], 'ษ':['s','h'], 'ส':['s','h'], 'ห':['h','h'], 'ฬ':['l','l'],
  'อ':['','m'], 'ฮ':['h','l']
};
// ห นำ：ห + 这些字母 → 用后者的发音，但按高辅音规则定调
var HO = { 'ง':'ng','ญ':'y','น':'n','ม':'m','ย':'y','ร':'r','ล':'l','ว':'w','ห':'h' };
var CLUSTER = {
  'กร':'kr','กล':'kl','กว':'kw','ขร':'khr','ขล':'khl','คว':'khw','คร':'khr','คล':'khl','คคว':'khw',
  'ปร':'pr','ปล':'pl','ตร':'tr','พร':'phr','ผล':'phl','ฟร':'fr','ฟล':'fl','สร':'sr','ซร':'sr','ทร':'thr',
  'ขว':'khw','ปล':'pl','หม':'m','หน':'n','หง':'ng','หญ':'y','หร':'r','หล':'l','หว':'w','หย':'y'
};
var FIN = {
  'ก':'k','ข':'k','ค':'k','ฆ':'k','ง':'ng','จ':'t','ช':'t','ซ':'t','ฎ':'t','ฏ':'t','ฐ':'t','ฑ':'t','ฒ':'t',
  'ด':'t','ต':'t','ถ':'t','ท':'t','ธ':'t','ศ':'t','ษ':'t','ส':'t','ณ':'n','น':'n','ญ':'n','ร':'n','ล':'n','ฬ':'n',
  'ม':'m','บ':'p','ป':'p','พ':'p','ฟ':'p','ภ':'p'
};
var VOW = 'ัิีึืุูะาํำ๐ฯๆ๏๚๛';
var MARK = { '่':1, '้':2, '๊':3, '๋':4 };
var TONEDI = { 0:'', 1:'\u0300', 2:'\u0302', 3:'\u0301', 4:'\u030C' }; // 低 降 高 升
// 0 中平 1 低降 2 高降 3 高平 4 升

function isTh(c){ return c >= '฀' && c <= '๿'; }
function isVowSign(c){ return 'ัิีึืุูํ่้๊๋์ะาำ'.indexOf(c) >= 0; }

// 单音节转写
function syl(s) {
  var mark = 0, i, ch;
  var chars = s.split('');
  // 1) 抽调号
  var body = [];
  for (i = 0; i < chars.length; i++){
    if (MARK[chars[i]] !== undefined){ mark = MARK[chars[i]]; }
    else body.push(chars[i]);
  }
  s = body.join('');
  // 2) ์ 静音尾：删掉它和前面的辅音（含其元音符号）
  var ti = s.indexOf('์');
  if (ti > 0){
    var cut = ti;
    while (cut > 0 && isVowSign(s[cut-1])) cut--;
    s = s.slice(0, cut - 1) + s.slice(ti + 1);
    s = s.replace(/์/g, '');
  }
  if (!s) return '';
  // 3) 前引元音
  var head = '';
  if ('เแโใไ'.indexOf(s[0]) >= 0){ head = s[0]; s = s.slice(1); }
  if (s[0] === 'ฤ'){ head = 'ฤ'; }
  // 4) 声母
  var ini = '', cls = 'm';
  if (s[0] === 'ห' && HO[s[1]]){ ini = HO[s[1]]; cls = 'h'; s = s.slice(2); }
  else if (s[0] === 'อ' && ('ย' === s[1])){ ini = 'y'; cls = 'm'; s = s.slice(2); }
  else if (CLUSTER[s.slice(0,2)]){ ini = CLUSTER[s.slice(0,2)]; cls = INI[s[0]] ? INI[s[0]][1] : 'm'; s = s.slice(2); }
  else if (INI[s[0]]){ ini = INI[s[0]][0]; cls = INI[s[0]][1]; s = s.slice(1); }
  else if (s[0] === 'ฤ'){ ini = 'r'; cls = 'l'; }
  // 5) 元音 + 韵尾
  var v = 'o', long = false, fin = '', inherent = false;
  var r = s;
  function has(c){ return r.indexOf(c) >= 0; }
  if (head === 'เ'){
    if (has('าะ')){ v = 'o'; long = false; fin = ''; }
    else if (has('า')){ v = 'ao'; long = true; }
    else if (has('ือ')){ v = 'uea'; long = true; }
    else if (has('ีย')){ v = 'ia'; long = true; }
    else if (has('ิ')){ v = 'oe'; long = true; }
    else if (has('อ')){ v = 'oe'; long = true; }
    else if (has('ว')){ v = (r.indexOf('็') >= 0) ? 'eo' : 'ee'; long = true; fin = ''; }
    else if (has('ย')){ v = 'oei'; long = true; fin = ''; }
    else if (has('ะ')){ v = 'e'; long = false; }
    else { v = 'e'; long = true; }
  } else if (head === 'แ'){
    if (has('ว')){ v = 'aeo'; long = true; fin = ''; }
    else if (has('ะ')){ v = 'ae'; long = false; }
    else { v = 'ae'; long = true; }
  } else if (head === 'โ'){
    if (has('ะ')){ v = 'o'; long = false; } else { v = 'o'; long = true; }
  } else if (head === 'ใ' || head === 'ไ'){
    v = 'ai'; long = true;
  } else if (head === 'ฤ'){
    v = 'rue'; long = true;
  } else {
    if (has('ัว')){ v = 'ua'; long = true; }
    else if (has('ัวะ')){ v = 'ua'; long = false; }
    else if (has('ือ')){ v = 'ue'; long = true; }
    else if (has('ือะ')){ v = 'ue'; long = false; }
    else if (has('ำ')){ v = 'aam'; long = true; }
    else if (has('ะ')){ v = 'a'; long = false; }
    else if (has('า')){
      v = 'aa'; long = true;
    }
    else if (has('ั')){ v = 'a'; long = false; }
    else if (has('ิ')){ v = 'i'; long = false; if (has('ว')) v = 'iu'; }
    else if (has('ี')){ v = 'ii'; long = true; }
    else if (has('ึ')){ v = 'ue'; long = false; }
    else if (has('ื')){ v = 'ue'; long = true; }
    else if (has('ุ')){ v = 'u'; long = false; }
    else if (has('ู')){ v = 'uu'; long = true; }
    else if (has('อ')){ v = 'o'; long = true; }
    else { v = 'o'; long = false; inherent = true; }
  }
  // 6) 韵尾：ย / ว 结尾要并入元音，其余按 FIN
  var lastTh = '';
  for (i = s.length - 1; i >= 0; i--){ if (isTh(s[i]) && !isVowSign(s[i])){ lastTh = s[i]; break; } }
  if (fin === ''){
    if (lastTh === 'ย'){
      if (v === 'aa') v = 'aai';
      else if (v === 'ua') v = 'uai';
      else if (v === 'o') v = 'oi';
      else if (v === 'ae') v = 'aei';
      else fin = '';
    } else if (lastTh === 'ว'){
      if (v === 'aa') v = 'aao';
      else if (v === 'i') v = 'iu';
      else if (v === 'ae') v = 'aeo';
      else if (v === 'e') v = 'eo';
      else fin = '';
    } else if (FIN[lastTh]){
      fin = FIN[lastTh];
    }
  }
  // 7) 死音节判定
  var dead = (!long && fin === '') || (fin === 'k' || fin === 'p' || fin === 't');
  // 8) 定调
  var tone;
  if (mark === 1) tone = (cls === 'l') ? 2 : 1;
  else if (mark === 2) tone = (cls === 'l') ? 3 : 2;
  else if (mark === 3) tone = 3;
  else if (mark === 4) tone = 4;
  else {
    if (cls === 'm') tone = dead ? 1 : 0;
    else if (cls === 'h') tone = dead ? 1 : 4;
    else tone = dead ? (long ? 2 : 3) : 0;
  }
  // 9) 统一成与 manao 词库一致的音标式写法
  if (ini === 'ng') ini = 'ŋ';
  if (v === 'ae') v = long ? 'ɛɛ' : 'ɛ';
  else if (v === 'aeo') v = 'ɛɛw';
  else if (v === 'aei') v = 'ɛɛy';
  else if (v === 'o') v = inherent ? 'o' : (long ? 'ɔɔ' : 'ɔ');
  else if (v === 'oi') v = 'ɔɔy';
  else if (v === 'oe') v = 'ə';
  else if (v === 'oei') v = 'əy';
  else if (v === 'ue') v = long ? 'ʉʉ' : 'ʉ';
  else if (v === 'uea') v = 'ʉa';
  else if (v === 'ai') v = 'ay';
  else if (v === 'aai') v = 'aay';
  else if (v === 'ao') v = 'aw';
  else if (v === 'aao') v = 'aaw';
  else if (v === 'uai') v = 'uay';
  else if (v === 'iu') v = 'iw';
  else if (v === 'eo') v = 'ew';
  if (fin === 'ng') fin = 'ŋ';

  // 10) 声调符号落在主要元音上
  var out = ini + v + fin;
  var td = TONEDI[tone];
  if (td){
    // 放在第一个元音字母（a e i o u）之后
    var m = out.match(/[aeiou]/);
    if (m){ var p = m.index + 1; out = out.slice(0, p) + td + out.slice(p); }
    else out += td;
  }
  return out;
}

// 整词（可能多音节）：先查词典，再按音节切分转写
function splitSyl(w) {
  var cs = w.split(''), parts = [], cur = '', hasV = false, hasC = false, i, c;
  var VOWCH = 'ัิีึืุูํะาำำๅ็';
  function isV(c){ return VOWCH.indexOf(c) >= 0; }
  for (i = 0; i < cs.length; i++){
    c = cs[i];
    if (!isTh(c)){ if (cur){ parts.push(cur); cur = ''; } hasV = false; hasC = false; continue; }
    if ('เแโใไฤ'.indexOf(c) >= 0){
      if (cur && hasV && hasC){ parts.push(cur); cur = ''; hasV = false; hasC = false; }
      cur += c; hasV = true; continue;
    }
    if (isV(c)){ cur += c; hasV = true; continue; }
    // 辅音：当前音节已有「辅音+元音」、且它后面跟着后置元音符号 → 它是下一个音节的声母
    if (cur && hasV && hasC && i + 1 < cs.length && isV(cs[i+1])){
      parts.push(cur); cur = c; hasV = false; hasC = true; continue;
    }
    cur += c; hasC = true;
  }
  if (cur) parts.push(cur);
  return parts;
}
function romWord(w, dict) {
  if (dict && dict[w]) return dict[w];
  var parts = splitSyl(w);
  var out = '';
  parts.forEach(function(p){
    if (!isTh(p[0])) { out += p; return; }
    out += (out ? '-' : '') + syl(p);
  });
  return out;
}

module.exports = { syl: syl, romWord: romWord, splitSyl: splitSyl };
