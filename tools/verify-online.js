/* 线上验收：直接对正式地址跑一遍关键检查。
 * 本地测试全绿不代表线上是同一份 —— 沙箱部署是独立系统，
 * 曾经出现过「git push 了但线上纹丝不动」的情况。
 * 用法：node tools/verify-online.js
 */
const { chromium } = require('playwright-core');
const CHROME = 'C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe';
const URL = 'https://thai-84day.app.workbuddy.host/';

const CASES = [
  ['页面加载无 JS 报错', async p => {
    const e = p._errs.filter(x => x.indexOf('favicon') < 0);
    return [e.length === 0, e.length ? e.slice(0, 2).join(' ; ') : '0 个错误'];
  }],
  ['例句 5129 句 / 词 1687 条', async p => {
    return await p.evaluate(() => {
      const n = Object.keys(window.WSENTS || {}).length;
      const d = Object.keys(window.WSENT || {}).length;
      return [n === 5129 && d === 1687, 'WSENTS=' + n + ' WSENT=' + d];
    });
  }],
  ['例句全部有罗马音', async p => {
    return await p.evaluate(() => {
      const a = Object.values(window.WSENTS || {});
      const no = a.filter(x => !x || !x[2]).length;
      return [no === 0, no === 0 ? a.length + ' 句全部有' : no + ' 句缺'];
    });
  }],
  ['例句 id 前缀语义正确', async p => {
    return await p.evaluate(() => {
      const k = Object.keys(window.WSENTS || {});
      const bad = k.filter(x => 'hm'.indexOf(x.charAt(0)) < 0).length;
      const h = k.filter(x => x.charAt(0) === 'h').length;
      return [bad === 0 && h === 3067, 'h=' + h + ' 非法前缀=' + bad];
    });
  }],
  ['云端 SDK 已就位（登录依赖它）', async p => {
    return await p.evaluate(() => {
      const c = window.cloud;
      const keys = c ? Object.keys(c).length : 0;
      return [keys > 0, c ? 'cloud 对象就绪（' + keys + ' 个方法）' : 'cloud 未加载，登录会失败'];
    });
  }],
  ['底栏 5 个标签可切换', async p => {
    const out = [];
    for (const v of ['today', 'corpus', 'words', 'ref', 'me']) {
      await p.click('.tabbar button[data-v="' + v + '"]');
      await p.waitForTimeout(380);
      const ok = await p.evaluate(vv => {
        const b = document.querySelector('.tabbar button[data-v="' + vv + '"]');
        const pane = document.getElementById('v-' + vv);
        return !!(b && b.classList.contains('on') && pane && pane.style.display !== 'none'
          && pane.textContent.trim().length > 20);
      }, v);
      out.push(v + (ok ? '✓' : '✗'));
    }
    return [out.every(x => x.endsWith('✓')), out.join(' ')];
  }],
  ['深色模式已上线（真读渲染结果）', async p => {
    /* 只查「规则存在」是不够的 —— 规则在但没生效一样是坏的。
       切成深色上下文重算 body 背景，看是否真的变成深色。
       第一版只遍历 cssRules 找 conditionText，报了假 FAIL：
       规则明明在（media 列表里能看到），是检测方式不对。 */
    const ctx2 = p.context();
    const dark = await ctx2.newPage();
    await dark.emulateMedia({ colorScheme: 'dark' });
    await dark.goto(URL, { waitUntil: 'load', timeout: 45000 });
    await dark.waitForTimeout(2200);
    const r = await dark.evaluate(() => ({
      bg: getComputedStyle(document.body).backgroundColor,
      matches: matchMedia('(prefers-color-scheme: dark)').matches,
      tx: getComputedStyle(document.body).color,
    }));
    await dark.close();
    /* 深色背景应为深灰（亮度 < 80），文字应为浅色 */
    const m = r.bg.match(/\d+/g) || [];
    const lum = m.length >= 3 ? (Number(m[0]) * 0.299 + Number(m[1]) * 0.587 + Number(m[2]) * 0.114) : 999;
    return [r.matches && lum < 80,
      'matches=' + r.matches + ' body背景=' + r.bg + '（亮度 ' + Math.round(lum) + '，应 <80）'];
  }],
  ['语料页正文未被挤成窄柱', async p => {
    await p.click('.tabbar button[data-v="corpus"]'); await p.waitForTimeout(550);
    return await p.evaluate(() => {
      const w = document.querySelector('#v-corpus .w');
      if (!w) return [false, '没有 .w 行'];
      const mn = w.querySelector('.mn');
      const pr = w.getBoundingClientRect(), mr = mn.getBoundingClientRect();
      const r = mr.width / pr.width;
      return [r > 0.6, '正文占行宽 ' + Math.round(r * 100) + '%'];
    });
  }],
  ['参考页分组导航（新版特征）', async p => {
    await p.click('.tabbar button[data-v="ref"]'); await p.waitForTimeout(650);
    return await p.evaluate(() => {
      const bs = document.querySelectorAll('#pGroups .pg');
      const h = document.querySelector('#pList .pgh span');
      return [bs.length === 8 && h && h.textContent.trim().length >= 4,
        bs.length + ' 组按钮，组名「' + (h ? h.textContent.trim() : '无') + '」'];
    });
  }],
  ['例句折叠 + 展开按钮存在', async p => {
    await p.click('.tabbar button[data-v="today"]'); await p.waitForTimeout(500);
    await p.click('[data-run="new"]'); await p.waitForTimeout(700);
    if (await p.$('#cShow')) { await p.click('#cShow'); await p.waitForTimeout(650); }
    return await p.evaluate(() => {
      const exs = document.querySelectorAll('.study .exs');
      const mb = document.querySelector('.study [data-exmore]');
      const head = document.querySelector('.study .exh');
      return [exs.length >= 4 && !!mb,
        exs.length + ' 句' + (mb ? '，有展开按钮' : '，无展开按钮')
        + '，标题「' + (head ? head.textContent.trim() : '-') + '」'];
    });
  }],
  ['图片资源可访问（配图不空）', async p => {
    return await p.evaluate(async () => {
      try {
        const r = await fetch('./img/map.js');
        return [r.ok, 'img/map.js HTTP ' + r.status];
      } catch (e) { return [false, String(e.message).slice(0, 50)]; }
    });
  }],
  ['localStorage 持久化可用（学习记录能存）', async p => {
    return await p.evaluate(() => {
      try {
        localStorage.setItem('__probe__', '1');
        const v = localStorage.getItem('__probe__') === '1';
        localStorage.removeItem('__probe__');
        return [v, v ? '可读写' : '读写异常'];
      } catch (e) { return [false, String(e.message)]; }
    });
  }],
];

(async () => {
  const browser = await chromium.launch({ executablePath: CHROME });
  const ctx = await browser.newContext({ viewport: { width: 390, height: 844 } });
  const page = await ctx.newPage();
  const errs = [];
  page.on('pageerror', e => errs.push('pageerror: ' + e.message));
  page.on('console', m => { if (m.type() === 'error') errs.push('console: ' + m.text()); });
  page._errs = errs;

  console.log('线上验收: ' + URL + '\n' + '='.repeat(60));
  await page.goto(URL, { waitUntil: 'load', timeout: 45000 });
  await page.waitForTimeout(2600);

  let fail = 0;
  for (const c of CASES) {
    let ok = false, d = '';
    try { const r = await c[1](page); ok = r[0]; d = r[1]; }
    catch (e) { d = '异常: ' + String(e.message).split('\n')[0].slice(0, 90); }
    if (!ok) fail++;
    console.log((ok ? 'PASS  ' : 'FAIL  ') + c[0] + (d ? '  | ' + d : ''));
  }
  await browser.close();
  console.log('\n' + (fail === 0 ? '线上全部通过' : '失败 ' + fail + ' 项'));
  process.exit(fail === 0 ? 0 : 1);
})();
