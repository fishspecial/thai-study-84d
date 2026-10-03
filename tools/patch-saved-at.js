/* P1 修复：pushCloud 在推送失败时也推进 savedAt → 双向丢数据
 *
 * 机制：
 *   pushCloud() 开头无条件 `S.savedAt = Date.now()`，然后才 await 推送。
 *   推送失败（断网 / 云服务抽风）时，这行已经执行了 —— 本地时间戳跑到未来，
 *   云端 row 却还是旧的。
 *   下次进页面 pullCloud 的判据是 `rt > lt + 5000`（云端比本地新 5 秒才提示），
 *   这时 rt（旧的）< lt（新的）→ 判定 'kept-local'，永远保留本地。
 *   看起来"安全"，但方向反了：本地这些改动**再也推不上去**，
 *   而用户以为已经同步了（标签写着"同步失败·点此重试"，但重试推的也是同一份）。
 *
 *   反过来更糟的场景：用户在 A 设备学了一堆 → 推送失败 → savedAt 是新的。
 *   换到 B 设备登录 → 拉到旧的云端数据，本地没有成果 → 直接用云端（旧的）。
 *   A 设备上的学习凭空消失，且 A 设备再也推不上去。
 *
 * 修法：savedAt 只在推送成功后更新；失败时把它回滚，
 * 让「本地比云端新」这个事实如实反映出来，下次任何一次 push 都能把改动带走。
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
  s = s.replace(a ? from : from.replace(/\r\n/g, '\n').replace(/\n/g, '\r\n'), to);
  n++; console.log('  ✓ ' + label);
}

/* ---- 1. pushCloud：失败回滚 savedAt ---- */
must(
`  syncing = true;
  try {
    S.savedAt = Date.now();
    var res = await cloud.database.from('study_state')
      .upsert({ payload: S, updated_at: new Date().toISOString() }, { onConflict: 'owner_id' })
      .select();
    if (res.error) { pushOk = false; setSync('同步失败·点此重试', 'r'); }
    else {
      cloudRow = res.data && res.data[0];
      pushOk = true;`,
`  syncing = true;
  /* savedAt 必须在推送**成功后**才前进。
     原先在 await 之前无条件推进，推送失败时本地时间戳跑到未来，
     而云端 row 还是旧的 —— pullCloud 的 \`rt > lt + 5005\` 判据于是永远不成立，
     本地被当成「已是最新」，这些改动再也推不上去（换设备就等于丢了）。
     这里先记下旧值，失败时回滚，让「本地比云端新」如实反映。 */
  var savedAtBefore = S.savedAt || 0;
  try {
    var res = await cloud.database.from('study_state')
      .upsert({ payload: S, updated_at: new Date().toISOString() }, { onConflict: 'owner_id' })
      .select();
    if (res.error) {
      pushOk = false;
      S.savedAt = savedAtBefore;   /* 回滚：本地确实比云端新，别装作已同步 */
      setSync('同步失败·改动仍在这台设备', 'r');
    }
    else {
      cloudRow = res.data && res.data[0];
      pushOk = true;
      /* 成功才推进时间戳。用 res 里的 updated_at 而不是本地 Date.now()：
         服务器时间才是下一次比较的基准，两边时钟不一致时也不会误判。 */
      S.savedAt = cloudRow && cloudRow.updated_at
        ? new Date(cloudRow.updated_at).getTime() : Date.now();`,
'pushCloud 失败回滚 savedAt');

/* ---- 2. catch 分支也要回滚 ---- */
must(
`  } catch (e) { pushOk = false; setSync('同步失败·点此重试', 'r'); }
  syncing = false;`,
`  } catch (e) {
    pushOk = false;
    S.savedAt = savedAtBefore;
    setSync('同步失败·改动仍在这台设备', 'r');
  }
  syncing = false;`,
'catch 分支回滚 savedAt');

/* ---- 3. 失败标签要说明改动没丢，别让用户以为白学了 ---- */
must(
`      setSync('✓ 已同步 ' + mm + ':' + ss, 'g');`,
`      setSync('✓ 已同步 ' + mm + ':' + ss, 'g');`,
'成功标签（确认文案已明确）');

fs.writeFileSync(F, s);
console.log('\n共应用 ' + n + ' 处');
