/* 临时静态服务：直接伺服工作副本 index.html（不做 live 冻结）。
 * 用途：验收脚本需要在 http:// 下跑 —— file:// 的 Origin 是 null，
 * 云服务一律拒（cloud=null），同步相关测试会全线假 FAIL。
 * 8848 不能复用：那个是给用户用的冻结快照（live/index.html）。
 * 用法：node tools/tmp-serve.js [端口]   默认 8899
 */
const http = require('http');
const fs = require('fs');
const path = require('path');

const ROOT = path.resolve(__dirname, '..');
const PORT = parseInt(process.argv[2], 10) || 8899;

const MIME = {
  '.html': 'text/html; charset=utf-8',
  '.js': 'application/javascript; charset=utf-8',
  '.json': 'application/json; charset=utf-8',
  '.css': 'text/css; charset=utf-8',
  '.png': 'image/png', '.jpg': 'image/jpeg', '.svg': 'image/svg+xml', '.webp': 'image/webp',
  '.mp3': 'audio/mpeg', '.m4a': 'audio/mp4', '.ogg': 'audio/ogg',
  '.woff2': 'font/woff2', '.ico': 'image/x-icon',
};

http.createServer(function (req, res) {
  let p;
  try { p = decodeURIComponent(new URL(req.url, 'http://x').pathname); }
  catch (e) { res.writeHead(400); return res.end('bad url'); }
  const rel = p === '/' ? '/index.html' : p;
  const file = path.resolve(ROOT, '.' + rel);
  if (!file.startsWith(ROOT + path.sep) && file !== ROOT) { res.writeHead(403); return res.end('forbidden'); }
  fs.readFile(file, function (err, buf) {
    if (err) { res.writeHead(404); return res.end('404 ' + rel); }
    res.writeHead(200, {
      'Content-Type': MIME[path.extname(file).toLowerCase()] || 'application/octet-stream',
      'Content-Length': buf.length,
      'Cache-Control': 'no-store',
    });
    res.end(buf);
  });
}).listen(PORT, '127.0.0.1', function () {
  console.log('临时服务 http://127.0.0.1:' + PORT + '/  (直接伺服工作副本)');
});
