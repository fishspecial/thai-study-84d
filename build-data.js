const fs = require('fs');
const path = require('path');
const words = JSON.parse(fs.readFileSync(path.join(__dirname, 'manao-words.json'), 'utf8'));

function esc(s) { return String(s == null ? '' : s).replace(/\\/g, '\\\\').replace(/"/g, '\\"'); }
function emit(arr) {
  return '[' + arr.map(w =>
    '{n:' + w.n + ',t:"' + esc(w.th) + '",r:"' + esc(w.rom) + '",z:"' + esc(w.zh || '') + '",e:"' + esc(w.en) + '",p:' + w.pri + '}'
  ).join(',\n') + ']';
}
const w5 = [], w4 = [];
words.forEach((w, i) => {
  w.n = i;
  (w.pri === 5 ? w5 : w4).push(w);
});
const out = 'window.WORDS5=' + emit(w5) + ';\nwindow.WORDS4=' + emit(w4) + ';\n';
fs.writeFileSync(path.join(__dirname, 'words-data.js'), out, 'utf8');
console.log('p5=' + w5.length + ' p4=' + w4.length + ' bytes=' + out.length);
const noZh = words.filter(w => !w.zh).length;
console.log('missing zh: ' + noZh);
