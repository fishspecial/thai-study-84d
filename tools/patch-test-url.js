/* 把验收脚本的入口 URL 改成读环境变量，方便在「工作副本」和「线上」之间切。
 * 用法: node tools/patch-test-url.js
 */
const fs = require('fs');
const OLD = "const LIVE = 'file:///' + require('path').resolve(__dirname, '..', 'index.html').replace(/\\\\/g, '/');";
const NEW = "const LIVE = process.env.TEST_URL || ('http://127.0.0.1:' + (process.env.TEST_PORT || 8899) + '/');";

for (const f of ['tools/verify-sync.js', 'tools/verify-quiz-audio.js', 'tools/verify-opt-fix.js']) {
  let s = fs.readFileSync(f, 'utf8');
  if (s.indexOf(OLD) < 0) { console.log(f + ': ' + (s.indexOf('TEST_URL') >= 0 ? '已改过，跳过' : '✗ 未匹配')); continue; }
  fs.writeFileSync(f, s.replace(OLD, NEW));
  console.log(f + ': ✓ 已改为读 TEST_URL（默认 8899 临时服务）');
}
