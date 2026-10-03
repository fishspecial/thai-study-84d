/* 截图与验收共用的种子存档。
 * 单独抽出来是因为两个脚本要用完全一致的数据 ——
 * 验收里造一份、截图里造另一份，会导致「测过的」和「看到的」不是同一个页面。
 *
 * 数据形态刻意做得贴近真实：6 天历史、每项任务都有完成记录、
 * 有答错的条目也有已牢固的、复习欠账存在（这样 ETA 才不会显示得过于乐观）。
 */
function mkDay(newN, newSc, revN, revSc, readSc, outSc, qRight, qN, qSc, min) {
  return {
    new:  { done: true, n: newN, score: newSc },
    rev:  { done: true, n: revN, score: revSc },
    read: { done: true, n: 2, score: readSc },
    out:  { done: true, n: 2, score: outSc },
    quiz: { done: true, n: qN, right: qRight, score: qSc },
    min: min,
  };
}

const SEED = {
  v: 1,
  /* start 往前推 5 天 → 页面算出的今天是 Day 6，与 days 里最后一条对齐 */
  start: '2026-09-29',
  day: 6,
  savedAt: Date.now(),
  cfg: { newWords: 12, newGrams: 3, newHerSent: 2, newMySent: 2, quizCount: 10 },
  q: { w: 60, g: 10, hs: 4, ms: 2 },
  master: {},
  items: {
    'w|ก็':       { box: 4, r: 5, w: 0, seen: 1, lg: [[7, 1]] },
    'w|ครับ':     { box: 2, r: 3, w: 1, seen: 1, lg: [[7, 1]] },
    'w|รัก':      { box: 1, r: 1, w: 3, seen: 1, lg: [[6, 0]] },
    'w|ทำงาน':    { box: 5, r: 6, w: 0, seen: 1, lg: [[5, 1]] },
    'w|ข้าว':     { box: 3, r: 2, w: 0, seen: 1, lg: [[7, 1]] },
    'w|ยิ้ม':     { box: 0, r: 0, w: 2, seen: 1, lg: [[7, 0]] },
    'g|ไม่เป็นไร':     { box: 3, r: 3, w: 0, seen: 1, lg: [[7, 1]] },
  },
  days: {
    1: { plan: { newW: ['w|ก็'], dueW: [], newG: [], dueG: [], read: ['w|ก็'], out: ['w|รัก'] },
         st: mkDay(1, 100, 2, 90, 100, 100, 4, 5, 80, 12) },
    2: { plan: { newW: ['w|ครับ'], dueW: ['w|ก็'], newG: [], dueG: [], read: ['w|รัก'], out: ['w|ก็'] },
         st: mkDay(1, 80, 3, 70, 80, 90, 4, 6, 67, 15) },
    3: { plan: { newW: [], dueW: ['w|ครับ','w|รัก'], newG: [], dueG: [], read: ['w|ทำงาน'], out: ['w|รัก'] },
         st: mkDay(0, 100, 2, 50, 60, 70, 2, 4, 50, 8) },
    4: { plan: { newW: ['w|ทำงาน'], dueW: [], newG: [], dueG: ['g|ไม่เป็นไร'], read: ['w|ก็'], out: ['w|ครับ'] },
         st: mkDay(1, 100, 4, 75, 90, 85, 6, 8, 75, 18) },
    5: { plan: { newW: ['w|ข้าว','w|ยิ้ม'], dueW: ['w|ทำงาน'], newG: [], dueG: [], read: ['w|ก็'], out: ['w|รัก'] },
         st: mkDay(2, 60, 5, 60, 70, 75, 5, 10, 50, 22) },
    6: { plan: { newW: ['w|ครับ'], dueW: ['w|ยิ้ม','w|รัก'], newG: ['g|ไม่เป็นไร'], dueG: [], read: ['w|ก็'], out: ['w|ทำงาน'] },
         st: mkDay(1, 100, 2, 50, 100, 100, 7, 8, 88, 16) },
  },
};

module.exports = SEED;
