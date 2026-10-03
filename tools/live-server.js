/* 泰语学习 · 稳定预览服务器
 *
 * 存在的理由：我要在 thai-study/index.html 上持续做美化改动，
 * 而用户正在用这个应用。同一份文件被边改边读，刷新就可能撞上半成品。
 *
 * 做法：把「已验证通过」的 index.html 冻结在 live/index.html，
 * 服务器只对这个路径做特殊路由，其余静态资源（音频/图片/词库数据）
 * 仍然直接读项目原目录 —— 所以不必复制几千个音频文件。
 *
 * 同步：node live-sync.js  （只在测试全部通过后手动执行）
 * 用法：node live-server.js [端口]   默认 8848
 */
const http = require('http');
const fs = require('fs');
const path = require('path');

const ROOT = path.resolve(__dirname, '..');   // thai-study/ 资源与数据
const LIVE = path.resolve(__dirname, '..', 'live'); // 冻结的 index.html
const PORT = parseInt(process.argv[2], 10) || 8848;

/* 走 live 快照的路径：页面本体 + 它的入口壳。
   数据文件（word-sent-data.js 等）体积大、迭代少，留在原目录即可。 */
const LIVE_ROUTES = new Set(['/', '/index.html', '/daily.html', '/pany.html', '/wordbook.html']);

const MIME = {
  '.html': 'text/html; charset=utf-8',
  '.js':   'application/javascript; charset=utf-8',
  '.json': 'application/json; charset=utf-8',
  '.css':  'text/css; charset=utf-8',
  '.png':  'image/png',  '.jpg': 'image/jpeg', '.jpeg': 'image/jpeg',
  '.gif':  'image/gif',  '.svg': 'image/svg+xml', '.webp': 'image/webp',
  '.mp3':  'audio/mpeg', '.m4a': 'audio/mp4',  '.ogg': 'audio/ogg',
  '.woff2':'font/woff2', '.ico': 'image/x-icon',
};

function send(res, code, buf, type) {
  res.writeHead(code, {
    'Content-Type': type || 'text/plain; charset=utf-8',
    'Content-Length': buf.length,
    /* 本地开发：绝不缓存，改完刷新就能看到。
       用 no-store 而不是 max-age=0，避免浏览器带条件请求回旧副本。 */
    'Cache-Control': 'no-store, no-cache, must-revalidate',
  });
  res.end(buf);
}

const server = http.createServer(function (req, res) {
  let p;
  try { p = decodeURIComponent(new URL(req.url, 'http://x').pathname); }
  catch (e) { return send(res, 400, Buffer.from('bad url')); }

  /* 阻断路径穿越：解析后必须仍在允许的根目录内 */
  const inLive = LIVE_ROUTES.has(p);
  const base = inLive ? LIVE : ROOT;
  let rel = inLive ? (p === '/' ? '/index.html' : p) : p;
  let file = path.resolve(base, '.' + rel);
  const allow = inLive ? LIVE : ROOT;
  if (file !== allow && !file.startsWith(allow + path.sep)) {
    return send(res, 403, Buffer.from('forbidden'));
  }

  fs.stat(file, function (err, st) {
    if (err || !st.isFile()) {
      return send(res, 404, Buffer.from('404 ' + rel));
    }
    fs.readFile(file, function (e2, buf) {
      if (e2) return send(res, 500, Buffer.from('read error'));
      send(res, 200, buf, MIME[path.extname(file).toLowerCase()]);
    });
  });
});

server.listen(PORT, '127.0.0.1', function () {
  const snap = path.join(LIVE, 'index.html');
  const ok = fs.existsSync(snap);
  console.log('泰语学习 · 预览服务已启动');
  console.log('  地址   http://127.0.0.1:' + PORT + '/');
  console.log('  快照   ' + (ok ? snap : '缺失！先跑 node live-sync.js'));
  if (ok) {
    const d = fs.statSync(snap);
    console.log('  大小   ' + d.size + ' 字节  ' + d.mtime.toLocaleString('zh-CN'));
  }
  console.log('  说明   页面走 live 快照（我改代码不影响你），音频/词库走项目原目录');
});
