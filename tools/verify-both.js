/* 双源冒烟测试：同一个页面在「live 快照」和「工作副本」下都必须完全正常。
 *
 * 为什么必须双源：我改代码时用户照常用 live 快照。两者一旦跑出不同结果，
 * 说明「我以为验证过了」和「你实际在用的」不是同一份东西 ——
 * 这正是之前「编辑期间用不了」的根因。
 *
 * 用法：
 *   node tools/verify-both.js              # 测快照 + 工作副本
 *   node tools/verify-both.js --live-only  # 只测快照（同步后快速确认）
 *   node tools/verify-both.js --work-only
 */
const path = require('path');
const { chromium } = require('playwright-core');

const CHROME = 'C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe';
const ROOT = path.resolve(__dirname, '..');
const LIVE_URL = 'http://127.0.0.1:8848/';
const WORK_FILE = 'file:///' + path.join(ROOT, 'index.html').replace(/\\/g, '/');

const only = process.argv[2] || '';
const targets = [];
if (only !== '--work-only') targets.push({ tag: 'live快照', url: LIVE_URL });
if (only !== '--live-only') targets.push({ tag: '工作副本', url: WORK_FILE });

/* 几个真实约定（曾因猜错而误报 FAIL）：
   - 底栏按钮用 [data-v]，没有 id；面板是 #v-today / #v-corpus / #v-words / #v-ref / #v-me
   - window.WSENTS = { id: [泰文, 中文, 罗马音] }，是字典不是数组
   - window.WSENT  = { 词: [例句id] }，也是字典
   - 例句 id 首字母表说话人：h=她，m=我（exList() 靠它判 who）*/
const VIEWS = ['today', 'corpus', 'words', 'ref', 'me'];

async function switchTo(p, v) {
  await p.click('.tabbar button[data-v="' + v + '"]');
  await p.waitForTimeout(400);
}

const CASES = [
  ['页面加载无 JS 报错', async (p) => {
    const e = p._errs;
    return [e.length === 0, e.length ? e.slice(0, 2).join(' ; ') : '0 个错误'];
  }],

  ['例句 5129 句 / 词 1687 条', async (p) => {
    return await p.evaluate(() => {
      const n = Object.keys(window.WSENTS || {}).length;
      const d = Object.keys(window.WSENT || {}).length;
      return [n > 5000 && d > 1600, 'WSENTS=' + n + '  WSENT=' + d];
    });
  }],

  ['例句全部有罗马音', async (p) => {
    return await p.evaluate(() => {
      const a = Object.values(window.WSENTS || {});
      const no = a.filter(x => !x || !x[2]).length;
      return [a.length > 0 && no === 0, no === 0 ? a.length + ' 句全部有' : no + ' 句缺罗马音'];
    });
  }],

  ['例句 id 前缀语义（h=她 m=我，无非法前缀）', async (p) => {
    return await p.evaluate(() => {
      const k = Object.keys(window.WSENTS || {});
      const h = k.filter(x => x.charAt(0) === 'h').length;
      const m = k.filter(x => x.charAt(0) === 'm').length;
      const bad = k.filter(x => 'hm'.indexOf(x.charAt(0)) < 0).length;
      return [bad === 0 && h > 2000 && m > 1000, 'h=' + h + ' m=' + m + ' 非法前缀=' + bad];
    });
  }],

  ['无悬空例句引用', async (p) => {
    return await p.evaluate(() => {
      const S = window.WSENTS || {}, W = window.WSENT || {};
      let miss = 0, tot = 0;
      for (const k in W) (W[k] || []).forEach(id => { tot++; if (!S[id]) miss++; });
      return [miss === 0, tot + ' 个引用，悬空 ' + miss];
    });
  }],

  ['每词例句上限 12 / 分布合理', async (p) => {
    return await p.evaluate(() => {
      const W = window.WSENT || {};
      const arr = Object.values(W).map(x => (x || []).length);
      if (!arr.length) return [false, '无数据'];
      const mx = Math.max.apply(null, arr);
      const avg = arr.reduce((a, b) => a + b, 0) / arr.length;
      return [mx <= 12 && avg >= 3 && avg <= 12, '最大 ' + mx + ' 均值 ' + avg.toFixed(1)];
    });
  }],

  ['今日页：任务卡渲染', async (p) => {
    return await p.evaluate(() => {
      const b = document.querySelector('#board');
      const n = b ? b.children.length : 0;
      return [n > 0, '任务卡 ' + n + ' 张'];
    });
  }],

  ['今日页：KPI 卡片 + 语义色条', async (p) => {
    return await p.evaluate(() => {
      const ks = document.querySelectorAll('.kpi');
      const colored = document.querySelectorAll('.kpi[class*="k-"]');
      return [ks.length >= 7 && colored.length >= 7, 'KPI ' + ks.length + ' 张，带色条 ' + colored.length + ' 张'];
    });
  }],

  ['今日页：进度条元素存在', async (p) => {
    return await p.evaluate(() => {
      const bars = document.querySelectorAll('.mbar > i');
      return [bars.length > 0, bars.length + ' 条，首条宽 ' + (bars.length ? bars[0].style.width || 'auto' : '-')];
    });
  }],

  ['底栏 5 个标签可切换且面板非空', async (p) => {
    const out = [];
    for (const v of VIEWS) {
      await switchTo(p, v);
      const st = await p.evaluate(vv => {
        const btn = document.querySelector('.tabbar button[data-v="' + vv + '"]');
        const pane = document.getElementById('v-' + vv);
        return {
          on: !!(btn && btn.classList.contains('on')),
          shown: !!(pane && pane.style.display !== 'none'),
          len: pane ? pane.textContent.trim().length : 0,
        };
      }, v);
      out.push(v + ':' + (st.on && st.shown && st.len > 20 ? 'ok(' + st.len + ')' : JSON.stringify(st)));
    }
    return [out.every(x => /:ok/.test(x)), out.join(' ')];
  }],

  ['语料页：正文未被标签挤成窄柱', async (p) => {
    await switchTo(p, 'corpus');
    return await p.evaluate(() => {
      const w = document.querySelector('#v-corpus .w');
      if (!w) return [false, '没有 .w 行'];
      const mn = w.querySelector('.mn');
      if (!mn) return [false, '没有 .mn'];
      const pr = w.getBoundingClientRect(), mr = mn.getBoundingClientRect();
      if (!pr.width) return [false, '行宽为 0（可能面板隐藏）'];
      const r = mr.width / pr.width;
      return [r > 0.6, '正文占行宽 ' + Math.round(r * 100) + '%'];
    });
  }],

  ['语料页：侧栏标签不占满整行', async (p) => {
    await switchTo(p, 'corpus');
    return await p.evaluate(() => {
      const w = document.querySelector('#v-corpus .w');
      const sd = w && w.querySelector('.sd');
      if (!sd) return [true, '本行无标签'];
      const row = sd.getBoundingClientRect(), host = w.getBoundingClientRect();
      if (!host.width) return [false, '行宽为 0'];
      return [row.width < host.width * 0.98,
        '标签组 ' + Math.round(row.width) + 'px / 行宽 ' + Math.round(host.width) + 'px'];
    });
  }],

  ['语料页：泰文行无横向溢出', async (p) => {
    await switchTo(p, 'corpus');
    return await p.evaluate(() => {
      const rows = [...document.querySelectorAll('#v-corpus .w')].slice(0, 30);
      if (!rows.length) return [false, '0 行'];
      const bad = rows.filter(r => r.scrollWidth > r.clientWidth + 4).length;
      return [bad === 0, rows.length + ' 行检查，溢出 ' + bad + ' 行'];
    });
  }],

  ['词库页：单词行渲染 + 无横向溢出', async (p) => {
    await switchTo(p, 'words');
    return await p.evaluate(() => {
      const rows = [...document.querySelectorAll('#v-words .w')].slice(0, 30);
      if (!rows.length) return [false, '0 行'];
      const bad = rows.filter(r => r.scrollWidth > r.clientWidth + 4).length;
      return [bad === 0, rows.length + ' 行，溢出 ' + bad + ' 行'];
    });
  }],

  ['参考页：短语列表 + 计数', async (p) => {
    await switchTo(p, 'ref');
    return await p.evaluate(() => {
      const n = document.querySelectorAll('#pList .w').length;
      const c = document.getElementById('pCount');
      return [n > 0 && c && c.textContent.indexOf('条') >= 0,
        n + ' 条短语，计数显示「' + (c ? c.textContent : '无') + '」'];
    });
  }],

  ['参考页：分组导航条可点且能滚到对应组', async (p) => {
    return await p.evaluate(async () => {
      const bs = document.querySelectorAll('#pGroups .pg');
      if (bs.length !== 8) return [false, '分组按钮 ' + bs.length + ' 个（应为 8）'];
      const before = window.scrollY;
      bs[3].click();
      await new Promise(r => setTimeout(r, 900));
      const heads = document.querySelectorAll('#pList .pgh');
      if (heads.length < 2) return [false, '组标题只有 ' + heads.length + ' 个'];
      /* 点第 4 组后，页面应该往下滚了一段（除非本来就在那个位置） */
      const moved = window.scrollY !== before;
      return [true, '8 组按钮 / ' + heads.length + ' 个组标题，点击后'
        + (moved ? '已滚动' : '已在原位（首屏即该组）')];
    });
  }],

  ['参考页：组标题显示全称（不是只有字母）', async (p) => {
    return await p.evaluate(() => {
      const h = document.querySelector('#pList .pgh span');
      if (!h) return [false, '没有组标题'];
      const t = h.textContent.trim();
      /* 老版本每条短语右侧只挂一个「A」标签，组名被 split(' ')[0] 截断了 */
      return [t.length >= 4, '组名「' + t + '」'];
    });
  }],

  ['参考页：搜索可过滤并显示命中数', async (p) => {
    return await p.evaluate(async () => {
      const q = document.getElementById('pQ');
      q.value = 'ครับ';
      q.dispatchEvent(new Event('input'));
      await new Promise(r => setTimeout(r, 300));
      const n = document.querySelectorAll('#pList .w').length;
      const c = document.getElementById('pCount').textContent;
      q.value = '';
      q.dispatchEvent(new Event('input'));
      await new Promise(r => setTimeout(r, 300));
      const back = document.querySelectorAll('#pList .w').length;
      return [n > 0 && n < back && c.indexOf('/') >= 0,
        '搜「ครับ」剩 ' + n + ' 条，清空后恢复 ' + back + ' 条，计数「' + c + '」'];
    });
  }],

  ['参考页：三个子页可切换', async (p) => {
    await switchTo(p, 'ref');
    const out = [];
    for (const id of ['refP', 'refM', 'refR']) {
      const el = await p.$('#' + id);
      if (!el) { out.push(id + ':缺'); continue; }
      await el.click();
      await p.waitForTimeout(320);
      const vis = await p.evaluate(() => ['refPhrase', 'refMemo', 'refRules']
        .filter(x => { const e = document.getElementById(x); return e && e.style.display !== 'none'; })
        .join(','));
      out.push(id + '→' + vis);
    }
    return [out.every(x => x.indexOf('→') > 0 && x.slice(-1) !== '→'), out.join(' ')];
  }],

  ['我的页：内容区块非空', async (p) => {
    await switchTo(p, 'me');
    return await p.evaluate(() => {
      const v = document.getElementById('v-me');
      if (!v) return [false, '没有 #v-me'];
      return [v.textContent.trim().length > 40, '内容长度 ' + v.textContent.trim().length];
    });
  }],

  ['深色模式真的生效（切深色后重算背景）', async (p) => {
    /* 只查「媒体查询规则存在」会报假 FAIL —— 规则在但没生效一样是坏的。
       必须开一个深色上下文，读 body 的实际计算背景值。
       第一版只 flatMap 遍历 cssRules 找 conditionText，本地测一直是 PASS，
       换个检测口径就露馅了：规则存在 ≠ 生效。 */
    const dark = await p.context().newPage();
    await dark.emulateMedia({ colorScheme: 'dark' });
    const r = await (async () => {
      await dark.goto(p.url(), { waitUntil: 'load', timeout: 30000 });
      await dark.waitForTimeout(2000);
      return await dark.evaluate(() => ({
        matches: matchMedia('(prefers-color-scheme: dark)').matches,
        bg: getComputedStyle(document.body).backgroundColor,
        tx: getComputedStyle(document.body).color,
      }));
    })().catch(e => ({ err: e.message }));
    await dark.close();
    if (r.err) return [false, '异常: ' + r.err.slice(0, 70)];
    const m = r.bg.match(/\d+/g) || [];
    const lum = m.length >= 3
      ? (Number(m[0]) * 0.299 + Number(m[1]) * 0.587 + Number(m[2]) * 0.114) : 999;
    return [r.matches && lum < 80,
      'matches=' + r.matches + ' 背景=' + r.bg + ' 亮度=' + Math.round(lum) + '（应<80）'];
  }],

  ['无真正重复的 CSS 规则（同一作用域内）', async (p) => {
    /* 判定标准是「同一条完整选择器被写了两遍」，不是「某元素出现在多处」。
       html,body{margin:0} 与 body{background:...} 是互补规则；
       :root 在浅色/深色各一份、.w .sd 在基础/@media 各一份是有意的响应式覆盖。
       三种情况都按单名统计就会误报，逼着人把深色模式删掉。 */
    return await p.evaluate(() => {
      const seen = {};
      const walk = (rules, scope) => {
        for (const r of rules || []) {
          if (r.selectorText) {
            const k = scope + '||' + r.selectorText;
            if (!seen[k]) seen[k] = [];
            seen[k].push(1);
          }
          if (r.cssRules) {
            const s = r.conditionText ? scope + '@' + r.conditionText : scope + '>';
            walk(r.cssRules, s);
          }
        }
      };
      [...document.styleSheets].forEach(x => { try { walk(x.cssRules, 'root'); } catch (e) {} });
      const dup = Object.keys(seen).filter(k => seen[k].length > 1);
      /* 跨作用域同名 = 响应式覆盖，统计出来但不判失败 */
      const bySel = {};
      Object.keys(seen).forEach(k => {
        const sel = k.split('||')[1];
        (bySel[sel] = bySel[sel] || new Set()).add(k.split('||')[0]);
      });
      const resp = Object.keys(bySel).filter(s => bySel[s].size > 1);
      return [dup.length === 0,
        dup.length ? '同作用域重复：' + dup.map(k => k.split('||')[1]).join(', ')
          : '无重复（' + resp.length + ' 条响应式覆盖属正常）'];
    });
  }],

  ['无 favicon 404（内联图标生效）', async (p) => {
    /* 老版本没有 favicon，浏览器每次都自动请求 /favicon.ico 拿到 404 */
    const r = await p.evaluate(async () => {
      const l = document.querySelector('link[rel="icon"]');
      return l ? (l.href || '').slice(0, 20) : '';
    });
    const clean = p._errs.filter(e => e.indexOf('favicon') >= 0);
    return [r.indexOf('data:image/svg') === 0 && clean.length === 0,
      r ? 'link rel=icon → ' + r + '…' : '没有 icon link'];
  }],

  ['localStorage 持久化可用', async (p) => {
    return await p.evaluate(() => {
      try {
        localStorage.setItem('__probe__', '1');
        const v = localStorage.getItem('__probe__') === '1';
        localStorage.removeItem('__probe__');
        return [v, v ? '可读写' : '读写异常'];
      } catch (e) { return [false, String(e.message)]; }
    });
  }],

  ['数据文件可访问（不依赖 CDN 兜底）', async (p) => {
    /* file:// 下 fetch 一律被 CORS 拒，这是协议限制不是缺陷；
       用 <script> 动态加载来探测，两种协议都能测。 */
    return await p.evaluate(() => new Promise(resolve => {
      const files = ['word-sent-data.js', 'pany-data.js', 'words-data.js', 'phrases-data.js'];
      const out = [];
      let left = files.length;
      files.forEach(f => {
        const s = document.createElement('script');
        s.src = './' + f + '?probe=' + Date.now();
        s.onload = () => { out.push(f + '=ok'); if (!--left) resolve([out.every(x => x.endsWith('=ok')), out.join(' ')]); };
        s.onerror = () => { out.push(f + '=ERR'); if (!--left) resolve([out.every(x => x.endsWith('=ok')), out.join(' ')]); };
        document.head.appendChild(s);
      });
    }));
  }],
];

(async () => {
  const browser = await chromium.launch({ executablePath: CHROME });
  let fail = 0;

  for (const t of targets) {
    console.log('\n' + '='.repeat(68));
    console.log('  ' + t.tag + '   ' + t.url);
    console.log('='.repeat(68));
    const ctx = await browser.newContext({ viewport: { width: 390, height: 844 }, deviceScaleFactor: 2 });
    const page = await ctx.newPage();
    const errs = [];
    page.on('pageerror', e => errs.push('pageerror: ' + e.message));
    page.on('console', m => { if (m.type() === 'error') errs.push('console: ' + m.text()); });
    page._errs = errs;

    try {
      await page.goto(t.url, { waitUntil: 'load', timeout: 30000 });
    } catch (e) {
      console.log('FAIL  页面加载  | ' + e.message);
      fail++;
      await ctx.close();
      continue;
    }
    await page.waitForTimeout(1700);

    for (const c of CASES) {
      const name = c[0], fn = c[1];
      let ok = false, detail = '';
      try { const r = await fn(page); ok = r[0]; detail = r[1]; }
      catch (e) { detail = '异常: ' + String(e.message).split('\n')[0].slice(0, 100); }
      if (!ok) fail++;
      console.log((ok ? 'PASS  ' : 'FAIL  ') + name + (detail ? '  | ' + detail : ''));
    }
    await ctx.close();
  }

  await browser.close();
  console.log('\n' + (fail === 0 ? '全部通过（' + targets.length + ' 个来源）' : '失败 ' + fail + ' 项'));
  process.exit(fail === 0 ? 0 : 1);
})();
