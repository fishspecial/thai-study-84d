/* P1：存档里的失效 key 会渲染成「有泰文、没释义、没音频」的僵尸行。
 *
 * 起因：B4 验收发现种子里的 'g|ครับ' 在 POOL_G（359 个语气词）里根本不存在，
 * GMAP[t] 查不到 → keyObj 返回 { type:'g', t:'ครับ', o:undefined }，
 * 而 dayKeys 的守卫只有 `if (!o) return;`（挡 keyObj 整体为 null），
 * 挡不住 `o.o` 为 undefined —— 于是这行照样进列表，泰文在、盒数在，
 * 释义是「—」、点读没站内音频只能掉 TTS。
 *
 * 真实场景：语料更新后某个词/语气词被删，旧存档里的 key 就成了孤儿。
 * 所以这是真 bug，不是测试造出来的假象。
 *
 * 修法：keyObj 里查不到对象时显式标 orphan，dayKeys 跳过 orphan。
 * 保留渲染（而不是静默丢）会让用户以为今天学过，其实没有 —— 更糟。
 */
const fs = require('fs');
const path = require('path');
const F = path.join(__dirname, '..', 'index.html');
let s = fs.readFileSync(F, 'utf8');
let n = 0;

function must(from, to, label) {
  const a = s.includes(from);
  const b = s.includes(from.replace(/\r\n/g, '\n').replace(/\n/g, '\r\n'));
  if (!a && !b) { console.error('✘ 找不到锚点：' + label); process.exit(1); }
  const src = a ? from : from.replace(/\r\n/g, '\n').replace(/\n/g, '\r\n');
  s = s.replace(src, to); n++;
  console.log('  ✓ ' + label);
}

/* ---- 1. keyObj 三类都标 orphan ---- */
must(
`function keyObj(k){
  var p = k.split('|'), t = p[1];
  if (p[0] === 'w') return { type:'w', t:t, o:WMAP[t] };
  if (p[0] === 'g') return { type:'g', t:t, o:GMAP[t] };
  // 句子的 key 存的是 id（h12 / m34），展示要用泰文原句
  var s = SMAP[t];
  return { type:'s', id:t, t:(s ? s.t : t), o:s };
}`,
`function keyObj(k){
  var p = k.split('|'), t = p[1];
  if (p[0] === 'w') return { type:'w', t:t, o:WMAP[t], orphan:!WMAP[t] };
  if (p[0] === 'g') return { type:'g', t:t, o:GMAP[t], orphan:!GMAP[t] };
  /* 句子的 key 存的是 id（h12 / m34），展示要用泰文原句。
     这里必须走 sentOf 而不是 SMAP[t] —— 例句 id 的位数不统一
     （同一个编号有 h2/h02/h002/h0002 四种写法），直查只能命中 46.5%。 */
  var s = sentOf(t);
  return { type:'s', id:t, t:(s ? s.t : t), o:s, orphan:!s };
}`,
'keyObj 三类标 orphan + 例句走 sentOf');

/* ---- 2. dayKeys 跳过 orphan ---- */
must(
`      var o = keyObj(k);
      if (!o) return;`,
`      var o = keyObj(k);
      if (!o) return;
      /* 语料更新后旧存档会留下查不到对象的孤儿 key（词被删、语气词被删、
         例句编号漂移）。它们照样有 box/r/w，照样进列表，
         渲染出「有泰文、没释义、点读只能掉 TTS」的空壳行 —— 比不显示更误导，
         因为用户会以为那天真的学过这个词。直接跳过。 */
      if (o.orphan) return;`,
'dayKeys 跳过 orphan key');

fs.writeFileSync(F, s);
console.log('\n共应用 ' + n + ' 处');
