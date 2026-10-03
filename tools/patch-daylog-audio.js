/* 给「每天学了哪些词」的每一条加发音。
 *
 * 用户原话：「学习记录里的这些内容也要能够发音啊」
 * —— 他要在复盘时点着听，而不是只盯着泰文认。
 *
 * 音频规则和闪卡 renderRun() 里完全一致，三类资源三种取法：
 *   w（词）     o.a  + o.d        ← 目录可能是 audio-pany 或 audio-words，不能写死
 *   g（语气词） o.a  + audio-pany
 *   s（例句）   o.id + audio-pany  ← 例句的 key 存的是 h12/m34 这种 id
 *
 * 别把这三类的取法合并成一句：例句对象上没有 a 字段（只有 id），
 * 词条对象上没有 id 字段，写错就是点了没声音 —— 这个坑本项目踩过
 * （测验例句题曾错用 q.o.a，因为例句的对象是 q.sent 不是 q.o）。
 *
 * 另外：整行可点（点泰文或点中文都发音），但要排除点状态标签的情况 ——
 * 那几个色块只是给人看的，点它不该有声音，避免误触。
 */
const fs = require('fs');
const P = 'index.html';
let s = fs.readFileSync(P, 'utf8');
const T = (t) => t.replace(/\n/g, '\r\n');
let n = 0;

function must(oldStr, label) {
  const o = T(oldStr);
  if (s.indexOf(o) >= 0) { s = s.replace(o, T(label.newStr)); n++; return; }
  if (s.indexOf(oldStr) >= 0) { s = s.replace(oldStr, label.newStr); n++; return; }
  console.error('✗ ' + label.name + ' 未匹配');
  process.exit(1);
}

/* ═══ 1. CSS：.lrow 加发音按钮 + 整行可点 ═══ */
must(`.lrow{display:flex;align-items:center;gap:10px;padding:9px 11px;border-bottom:1px solid var(--line)}`,
  {
    name: 'CSS-lrow发音',
    newStr: `/* 整行可点发音：用户说「学习记录里的这些内容也要能够发音」，
   他复盘时是连着点着听的，不该每行还要精确戳那个小按钮。
   但状态标签（.lv）是纯展示，点它不该出声 —— 用 .lv 的 pointer-events 关掉。 */
.lrow{display:flex;align-items:center;gap:10px;padding:9px 11px;border-bottom:1px solid var(--line);
  cursor:pointer;transition:background .12s}
.lrow:active{background:var(--surface2)}
.lrow .lv{pointer-events:none}
/* 发音小圆钮：只是提示「这行能点」，真正的声音走整行 */
.lrow .lb{flex:0 0 auto;width:30px;height:30px;border-radius:50%;border:1px solid var(--line2);
  background:var(--bg);color:var(--tx2);font-size:14px;line-height:1;cursor:pointer;
  display:flex;align-items:center;justify-content:center}
.lrow .lb:active{background:var(--surface2);transform:scale(.94)}`,
  });

/* ═══ 2. dayKeys：每条带上音频信息 ═══ */
must(`      var lv = 'new', lvTx = '看过';
      if (d === lg && it.r > it.w) { lv = 'ok'; lvTx = '记住'; }
      else if (it.w > 0 && it.box <= 1) { lv = 'bad'; lvTx = '答错'; }
      else if (it.box >= 3) { lv = 'ok'; lvTx = '已牢固'; }
      else if (it.box >= 1) { lv = 'half'; lvTx = '还不牢'; }
      out.push({ k:k, t:o.t, z:(o.o && (o.o.z || o.o.e)) || '', kind:kind, lv:lv, lvTx:lvTx, box:it.box, r:it.r, w:it.w });`,
  {
    name: 'dayKeys带音频',
    newStr: `      var lv = 'new', lvTx = '看过';
      if (d === lg && it.r > it.w) { lv = 'ok'; lvTx = '记住'; }
      else if (it.w > 0 && it.box <= 1) { lv = 'bad'; lvTx = '答错'; }
      else if (it.box >= 3) { lv = 'ok'; lvTx = '已牢固'; }
      else if (it.box >= 1) { lv = 'half'; lvTx = '还不牢'; }
      /* 音频三要素：文件名、目录、要读的泰文。
         取法必须按 type 分开 —— 词看 o.a/o.d，语气词看 o.a + audio-pany，
         例句看 o.id + audio-pany（例句对象上没有 a，词条对象上没有 id）。
         这正是闪卡 renderRun() 里 play 的那三段，抄一份一致的，别自己发挥。 */
      var af = null, ad = 'audio-pany';
      if (o.type === 'w'){ af = o.o ? o.o.a : null; ad = (o.o && o.o.d) || 'audio-pany'; }
      else if (o.type === 'g'){ af = o.o ? o.o.a : null; }
      else { af = o.o ? o.o.id : null; }
      out.push({ k:k, t:o.t, z:(o.o && (o.o.z || o.o.e)) || '', kind:kind, lv:lv, lvTx:lvTx,
        box:it.box, r:it.r, w:it.w, af:af, ad:ad, type:o.type });`,
  });

/* ═══ 3. 渲染：加 🔊 圆钮 + data-k 供事件绑定 ═══ */
must(`    h += '<div class="list" style="border:1px solid var(--line2);border-radius:12px;overflow:hidden">';
    ks.forEach(function(x){
      var sp = splitEmoji(x.t);
      h += '<div class="lrow"><div class="lt">'
        + '<span class="thai">' + esc(sp.t) + (sp.e ? ' <span style="font-size:13px">' + esc(sp.e) + '</span>' : '') + '</span>'
        + '<span class="sub">' + esc(x.z || '—') + '　盒' + x.box + '　对' + x.r + ' 错' + x.w + '</span>'
        + '</div><span class="lv ' + x.lv + '">' + esc(x.kind + ' · ' + x.lvTx) + '</span></div>';
    });
    h += '</div>';`,
  {
    name: '渲染lrow发音钮',
    newStr: `    h += '<div class="list" style="border:1px solid var(--line2);border-radius:12px;overflow:hidden">';
    ks.forEach(function(x){
      var sp = splitEmoji(x.t);
      h += '<div class="lrow" data-k="' + esc(x.k) + '" data-af="' + esc(x.af || '') + '" data-ad="' + esc(x.ad) + '" data-t="' + esc(x.t) + '">'
        + '<button class="lb" title="发音">🔊</button>'
        + '<div class="lt">'
        + '<span class="thai">' + esc(sp.t) + (sp.e ? ' <span style="font-size:13px">' + esc(sp.e) + '</span>' : '') + '</span>'
        + '<span class="sub">' + esc(x.z || '—') + '　盒' + x.box + '　对' + x.r + ' 错' + x.w + '</span>'
        + '</div><span class="lv ' + x.lv + '">' + esc(x.kind + ' · ' + x.lvTx) + '</span></div>';
    });
    h += '</div>';`,
  });

/* ═══ 4. 事件绑定 ═══ */
must(`  box.innerHTML = h;
}

/* ==================== 需求 3：预计学习时长 ====================`,
  {
    name: '绑定lrow发音',
    newStr: `  box.innerHTML = h;
  /* 整行可点发音。data-* 已经把文件名/目录/泰文带在元素上了，
     不用回头查 keyObj —— 那样每次点击都要重新解析一遍 key。
     .lv 已设 pointer-events:none，所以点状态标签不会误触发。 */
  box.querySelectorAll('.lrow').forEach(function(r){
    r.onclick = function(){
      say(r.getAttribute('data-af') || null, r.getAttribute('data-ad') || 'audio-pany', r.getAttribute('data-t'));
    };
  });
}

/* ==================== 需求 3：预计学习时长 ====================`,
  });

fs.writeFileSync(P, s);
console.log('✓ 已打 ' + n + ' 处补丁');
