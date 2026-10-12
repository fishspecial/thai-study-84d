# 泰语学习项目 · 交接文档

面向「接手的 AI」（另一台设备上的 WorkBuddy）。读完这份文档你应该能直接改代码、跑测试、发布。
本机是 Windows；路径里的 `C:\Users\Chuyu Tan\...` 在新机器上按实际工作区路径替换。

---

## 0. 给接手的 AI：先读这 6 条

1. **用户正在用这个应用**。改 `index.html` 之前先起冻结快照服务（第 3 节），别让他刷新撞上半成品。
2. **`git push` ≠ 用户能看到**。正式地址是独立沙箱，必须单独部署，发完要 curl 核对（第 4 节）。
3. **改完必须真浏览器验证**，语法通过证明不了能跑对。本项目连续两次「语法全过、页面完全没反应」。
4. **必跑 `tools/verify-guard.js`** —— 专抓「页面看着正常其实是空壳」这类静默白屏。
5. **不要代替用户做内容取舍**：私密/成人话题也是他要学的，删之前问。用户原话「毕竟是真实对话」。
6. **判断改坏了没有，看第 11 节的血泪清单**，那里每一条都是真踩过的坑。

---

## 1. 这是什么

一个**单文件**的泰语学习 Web App（`thai-study/index.html`，3850 行，无构建步骤，无框架）。
移动端优先，底部 5 个标签：今日 / 练习 / 语料 / 词库 / 参考 / 我的（实际 6 个）。

### 用户是谁、为什么要学

- 用户中国人，在广州工作；女朋友 **Pany（ปังปัง）**，老挝人、苗族，在老挝开牙科诊所，基督徒。
- **学习目标：跟她沟通为主**，在泰国长期生活为次。不是考试、不是旅游、不是商务。
- 起点：认识少量泰语单词，靠音译记忆，**不具备系统拼读能力**。

### 由目标推导出的产品原则（改功能前先对照）

1. **拼读能力优先** —— 会读才能读懂她发来的消息，才能把路牌/菜单/账单变成教材。
2. **一切按「实际会说/会读到多少遍」排序**：语气词 → 情绪词 → 闲聊句型 → 亲昵 → 和好 → 生活事物。低频语法一律砍掉。
3. **听说权重约 50%**；真实语速材料每天 30 分钟以上，优先用她本人的语音消息。
4. **用户明确说过**：「学习不是把所有的知识去累积堆砌，而是能够把这些东西拿来我实际的，我能去用，我能去说。」
   —— 任何新功能，先回答「它让用户多说了一句什么」，答不上来就别做。

---

## 2. 三分钟上手（新机器接入）

```bash
git clone https://github.com/fishspecial/thai-study-84d.git thai-study
cd thai-study
```

仓库完整（6547 个文件，含 120MB 音频和 373 张配图），clone 会慢一点。

```bash
# 起本地服务（工作副本，验收脚本用）
python -m http.server 8899 --bind 127.0.0.1
# Windows 托管 Python：
# C:/Users/<你>/.workbuddy/binaries/python/versions/3.13.12/python.exe -m http.server 8899 --bind 127.0.0.1

# 起冻结快照服务（给用户看的那份）
node tools/live-server.js 8848
```

浏览器打开 `http://127.0.0.1:8899/`。**不要用 `file://`** —— Origin 是 `null`，云服务一律拒绝，同步相关测试会全线假 FAIL。

跑一次全量回归确认环境正常：

```bash
export NODE_PATH="<node workspace>/node_modules"
node tools/verify-multidev.js   # 22 项，多设备合并
node tools/verify-sync.js       # 35 项，云端同步
node tools/verify-guard.js      # 抓静默白屏
node .vt/verify-all.js          # 16 项，全功能冒烟
```

---

## 3. 改代码期间让用户照常能用（本项目已落地，照抄）

用户明确纠正过：「你在编辑这些内容的时候，我就没办法正常使用这个应用。」

| 脚本 | 作用 |
|---|---|
| `tools/live-server.js [端口]` | 页面走**冻结快照** `live/index.html`，静态资源（音频/图片/数据）走项目原目录。只冻结会被改坏的那一个文件 |
| `tools/live-sync.js` | 同步前**语法体检，坏文件拒绝覆盖**，用户继续用旧的 |
| `tools/verify-both.js` | **同一套测试跑「快照」和「工作副本」两个来源，结果必须一致**。不一致 = 我以为验证过的 ≠ 用户实际在用的 |

流程：改 `index.html` → 跑验收（8899 工作副本）→ 全绿后 `node tools/live-sync.js` → 跑 `verify-both.js`。

推论：**任何「我改了 X」的说法，都要先问「用户现在访问的是哪份」。**

---

## 4. 地址与发布

| | 地址 | 说明 |
|---|---|---|
| **正式地址** | https://thai-84day.app.workbuddy.host/ | 用户实际在用。**只有这个域名能登录**（云服务校验 Origin） |
| GitHub Pages 镜像 | https://fishspecial.github.io/thai-study-84d/ | 只读备份，不能登录 |
| 仓库 | https://github.com/fishspecial/thai-study-84d | GitHub 用户名 `fishspecial` |

**`git push origin master` 只更新镜像，正式地址纹丝不动。**

发布命令（`workbuddy_sites_deploy`，链接不变，覆盖同一个沙箱）：

```
{ action:"deploy", directory:"<thai-study 绝对路径>", appName:"泰语学习",
  domainPrefix:"thai-84day", entryHtml:"index.html", language:"static",
  userAskedToPublish:true }
```

注意：`userAskedToPublish` **只认用户最近一条消息的发布意图**，跨轮不延续。用户这轮没说「发布」就不能置 true。

**发完必须核对**（真实踩坑：用户报「三个功能都没生效」，抓线上发现还是 3 天前的老版本）：

```bash
curl -s --noproxy '*' -o /tmp/online.html https://thai-84day.app.workbuddy.host/index.html
cmp /tmp/online.html index.html && echo IDENTICAL
grep -c "本轮新增的函数名" /tmp/online.html
```

**协作纪律（多设备开发时最重要）**：
- **一次只在一台设备上改**。`index.html` 是单文件 3850 行，两边同时改必冲突，HTML 冲突极难合并。
- 开工前 `git pull`，改完立刻 `git push`。
- **发布只在一台机器上做**：两台都部署同一个 `domainPrefix` 会互相覆盖（后发的赢）。

---

## 5. 目录地图

```
thai-study/
├── index.html            主程序（3850 行，单文件，含 CSS + JS）
├── live/index.html       冻结快照（给用户用的那份，由 live-sync 更新）
│
├── cloud-sdk.js          云端 SDK（62KB，已本地化，jsdelivr 仅兜底）
├── pany-data.js          她的语料：5129 句中泰对照 + 罗马音
├── word-sent-data.js     词↔句映射（1.6MB）：WSENT / WSENTS
├── word-sense.js         语境义（100 词 377 义项）：WSENSE
├── words-data.js         词库 2187 词：WORDS5 / WORDS4
├── phrases-data.js       参考页 76 条短语
│
├── audio-pany/           120MB 例句/TOP100 音频
├── audio-words/          24MB 单词本音频
├── img/                  373 张 WebP 配图（2.2MB）+ map.js
│
├── tools/                验收/诊断/截图/补丁脚本（入库）
├── .vt/                  一次性挖掘脚本（已 gitignore，不入库）
├── export/               例句导出物（gitignore，可重建）
└── STYLE.md              前端风格规范（改样式前必读）
```

`pany.html` / `wordbook.html` / `daily.html` 是跳转页，老书签仍可用，不再单独维护。

---

## 6. 应用架构（`index.html` 内部）

单文件里有 **10 个 `<script>` 块**：块 0/2 是 CDN 兜底（各 5 行），带 `src` 的是数据文件，**块 9（约 3000 行）才是主程序**。
⚠️ 语法检查脚本若只取 `blocks[1]` 会检查错块（`tools/diag-syntax.js` 目前就这个毛病）。

### 主要全局

| 名称 | 含义 |
|---|---|
| `S` | 全部学习状态（存档本体），localStorage key `thai-daily-v1` |
| `D` | `getDay(S.day)`，当天记录（含 `plan` 和 `st`） |
| `KEY` / `DEV_KEY` | `thai-daily-v1` / `thai-device-v1`（设备标识，不进主存档） |
| `SCHEMA_V` | 存档迁移版本号，当前 **4** |
| `TASKS` / `MAIN_TASKS` | 任务定义（8 项 / 7 主） |
| `BOX` / `BOXNAME` | Leitner 盒子 `[0,1,2,4,7,15,30]`，7 档 |
| `cloud` / `ME` | 云端 SDK 实例 / 当前登录用户 |

### 任务系统

```js
var TASKS = [
  { k:'revW', n:'复习单词' }, { k:'revS', n:'复习句子' },
  { k:'new',  n:'新学'     }, { k:'read', n:'她的例句' },
  { k:'out',  n:'我的例句' }, { k:'hear', n:'听力'     },
  { k:'quiz', n:'今日测验' },
  { k:'wrong',n:'错题重练', opt:true },   // opt 不计入「今天做完了没」
];
var DEF = { newWords:12, newGrams:3, newHerSent:5, newMySent:4, quizCount:10, hearCount:6 };
```

- `dayDone(d)` 要求 **MAIN_TASKS 7 项全部 done** → 新增任务时必须同步补历史天，否则老存档的打卡天数会一夜清零（第 7 节）。
- 复习句子按说话人定方向：她的话→看泰文猜意思；我的话→看中文自己说泰文。

### 记忆与考核

- `grade(k, ok)`：`ok` 为 1/0.5/0，`box` 用 `Math.min(BOX_TOP, box+1)`（`BOX_TOP` 跟着 `BOX.length` 走，别写死）。
- `lg` = `[[第几天, 得分]]` 轨迹，只留最近 14 次，是留存率的唯一证据。
- **考核口径 = 跨天留存，不看单日分**：`retention(1/3/7)` + `boxDist()`。
  及格线：隔 1 天留存 ≥ 80%、「记住过又忘」< 20%、盒 ≥ 3 持续增加。
- **每日配额是算出来的**：`quotaForDay()` 按「未来 7 天复习负荷 > 80 压量 / 连续两天 < 70 减量 / 连续两天 > 90 且负荷轻才加量」。
  **加学用 `extendToday()`，只扩当天 `D.plan` 并推进游标，绝不碰 `S.cfg`**（那是每日基准，改了会永久抬高）。

### 渲染

`renderToday / renderDrill / renderCorpus / renderWords / renderPhrases / renderMe`，
切换走 `VH` 表 + tabbar 的 `data-v`。**新增列表页记得接配图**：`picTag()` 只在语料页调过，
词库页漏了 → 用户翻遍 2187 词一张图都看不到。

---

## 7. 数据模型与迁移

### `S` 的字段

```
day, start, cfg{...}, cfgAt, q{w,g,hs,ms}, items{key:{box,due,r,w,h,seen,lg,peak}},
days{dayNo:{plan, st, min}}, master{泰文:1}, resume{kind:{d,seen,n,...}},
wrong{key:{n,last,clr}}, focus, savedAt, base, dev, devAt, v
```

- `items[key]` 的 `due` 是 **`'YYYY-MM-DD'` 字符串**，不是天数数字（已踩坑两次）。
- key 前缀：`w|` 单词、`g|` 短句、`s|` 句子、`h<N>`/`m<N>` 例句 id（**首字母 = 说话人，`h` 她 / `m` 我**）。

### `migrate()`（SCHEMA_V = 4，幂等，云端恢复后也会跑一次）

| 版本 | 内容 |
|---|---|
| v1 | 词库「已掌握」从 `thaiwordbook-v1` 并入 `S.master` |
| v2 | `st.rev` 拆成 `revW` / `revS` |
| v3 | 新增 `resume`（断点续传）/ `wrong`（错题本） |
| **v4** | 新增 `base`（多设备合并基准）；**给历史天补 `hear:{done:true,n:0,score:0}`** |

**新增任务时必须加迁移**：`dayDone()` 要求所有主任务都 done，老存档没有新键 →
「已打卡 6 天」一夜变 0、趋势图和逐天明细全空，用户会以为历史被删了。这条已踩两次（revW/revS、hear）。
**今天那条不补** —— 今天没练就标完成等于帮用户骗自己。

---

## 8. 云端同步与多设备合并（2026-10-12 重写，用户最在意的功能）

用户原话：「我必须手动确认同步。不然的话我只要一刷新这个数据又不见了，我今天的这个单词又得重新去认。」
—— **他曾经不敢刷新页面**，这是本项目最伤的体验。

### 架构

`localStorage`(`thai-daily-v1`) + 云端表 `study_state`（`owner_id` 唯一，upsert，字段 `payload` / `updated_at`）。
真实请求路径 `POST /.cloud/database/rest/study_state?on_conflict=owner_id&select=*`（**不是 supabase 默认的 `/rest/v1`**）。

### 多设备合并（核心）

云端按账号只有**一行**，两台设备都往同一行写。旧规则「谁的时间戳新谁整包赢」会造成：
上午书房学 5 个 → 下午手机学 3 个（把那 5 个盖掉）→ 晚上回书房只剩 3 个。

现在的实现：

- `S.base` = 本地与云端对齐到哪一刻。判据是 `rt > S.base`，不再比 `savedAt`。
- `peekCloud()` 推送前只取 `updated_at`（几十字节），确认被别人写过才 `pullCloud()` 拉全量合并。
- `mergeInto(remote, rt)` —— **合并是加法，任何一边学到的都不能消失**：
  - items：box/peak/r/w/h/seen 取 max；due 按 box 高者，box 相同取更早（宁可早复习）
  - lg 轨迹：concat → 按天排序 → 去相邻重复 → 截最后 14 条
  - days：按天并集，st 内数值取 max、布尔取或
  - master 并集；wrong 并集且 **clr（连续答对）取 min**（宁可多练）
  - resume：`seen` 取并集；**`q` 游标一律取 max**（回退会把学过的词再发一遍）
  - cfg：按 `cfgAt` 较新者整体取胜（在手机上调小配额不该被电脑上的旧值顶回）
  - start 取更早
- `applyMerged()`：`body.focus` 时**只存盘不重渲染**（否则会打断正在答的卡）。
- `reconcile()`：切回前台（`visibilitychange` → visible）自动对账；推送前也会走。
- `restoreFromCloud()` 是**唯一的恢复入口**，登录和启动两条路径共用（抄两份 = 一定只修一处，已踩过）。
- 设备标识 `DEV`（`平台-浏览器-随机`）随 payload 推送；账号面板显示「上次同步来自 XXX · HH:MM」+「与云端对账」按钮。

**合并表达不了「删除」**：真要重置进度，得在每台设备上各清一次。

### 其他同步纪律

- **推送必须节流，不能用纯防抖**：`save()` → `schedulePush()`，`SYNC_MIN_GAP = 4000` + 尾部兜底。
  纯防抖在连续答题时定时器被无限重置，**永远不触发**。
- **推送不能放 `unload`/`pagehide`**：fetch 会被取消。可靠时机是 `visibilitychange`（hidden）。
- **同步标签必须如实**：成功「✓ 已同步 HH:MM」，失败「同步失败·点此重试」并绑 onclick。
  **绝不允许失败时还写「云端已连接」** —— 那是在骗用户，他会以为可以放心刷新。
- **「已登录」≠「云端有数据」**：刚注册的账号 `maybeSingle()` 返回 `data:null`，只有 `res.error` 才算登录态有问题。
- **判断本地有无成果用 `localHasProgress()`**，不能查 `S.days` 是否为空（`getDay()` 在模块加载时就建好了今天那条，该判据恒为 false）。

---

## 9. 发音 / 配图 / 词句映射 / 语境义

### 发音：`say(file, dir, text)` 是全站唯一入口，三级兜底（本地 mp3 → Google TTS → 有道词典）

`file` / `dir` **不能瞎传**，各资源命名规则不同：

| 资源 | 文件名 | 目录 |
|---|---|---|
| 例句（`P.sents`） | 句 id `h<N>` / `m<N>` | `audio-pany` |
| TOP100 | `t<N>` | `audio-pany` |
| 她的常用词 | `w<N>` | `audio-pany` |
| 语气词 | `f<N>` | `audio-pany` |
| 虚词（她的/我的） | `p<N>` / `q<N>` | `audio-pany` |
| 单词本 P5/P4 | `w<N>` | **`audio-words`** |

词条对象的 `o.a` 存文件名、`o.d` 存目录。**改发音前先确认对象上真有这个字段**
（测验例句题曾错用 `q.o.a`，例句的对象其实是 `q.sent`，点了没声音）。

测验四种题型的发音策略：`th2zh`/`sent`/`audio` 进入即自动播 + 常驻按钮；
**`zh2th`（看中文选泰文）作答前必须不给发音** —— 考的就是这个，提前播等于剧透；
答完立刻补「正确读音」按钮并自动播。

### 配图

`img/` 373 张 WebP（2.2MB，平均 6KB，TOP100 覆盖 100/100；P4 低频 1247 词用户明确先不画）
+ `img/map.js` 提供 `window.IMG` = 泰文 → `i<N>`。`picOf(t)` 取路径（无图返回 null 静默降级）、
`picTag(t)` 34px 缩略图、`picBlock(t)` 闪卡大图（226px）。

加图流水线：`.vt/queue.js` 排频次 → `.vt/art-list.js` 手工描述表 → ImageGen **主线程串行**
（约 16 秒/张；**委派子代理实测零产出，别试**）→ `.vt/img2/pack.py` 压缩（幂等）→ 更新 map.js。
几何/符号类用 `.vt/draw-geom.py` 手绘省积分。虚词也要配图（TOP100 里 64 个最高频是虚词，
不画的话用户一打开看到 0 张图）。

### 词↔句映射

`word-sent-data.js`：`WSENT` = 词 → 句 id 数组（1687 词有例句，每词 ≤12 句）；
`WSENTS` = 句 id → `[泰文, 中文, 罗马音]`（5129 句：她 3067 / 我 2062，**全部有罗马音**）。
新增语料后重跑映射即可扩展，不用改页面。

例句区 `exBlock()` 三条约束：① 标题按实际构成动态显示（全她/全我/混合+双方计数），
写死「她在用」会误导语感判断；② 翻面最多摊开 `EX_CAP = 4` 句，多的带 `hidden`，
展开只解除这些的 `hidden`（**不能切全部，否则前 4 句也消失**）；③ 只切 hidden，**不重跑 exBlock**，否则丢滚动位置。

### 语境义

`word-sense.js`：`WSENSE[泰文] = [[短义, "句id 句id…", 说明], ...]`，100 词 377 义项。
翻面后 chips 展示，正面不显示。源数据 `.vt/sense/batch*.json` → `.vt/sense-build.js` 合并校验。

---

## 10. 开发环境与脚本

### 路径（Windows 本机，新机器按实际替换）

```
Node:     C:/Users/Chuyu Tan/.workbuddy/binaries/node/versions/22.22.2-6/node.exe
NODE_PATH: C:/Users/Chuyu Tan/.workbuddy/binaries/node/workspace/node_modules
Chrome:   C:/Program Files/Google/Chrome/Application/chrome.exe
Python:   C:/Users/Chuyu Tan/.workbuddy/binaries/python/versions/3.13.12/python.exe
```

Playwright（**agent-browser / npm -g 在本机均不可用**，唯一走通的方案）：

```bash
cd "<node workspace>" && npm install playwright-core     # 一次性，不要 npm -g
NODE_PATH="<node workspace>/node_modules" node yourtest.js
# 里面：chromium.launch({ executablePath:'<系统 Chrome 路径>', headless:true })
```

必挂两个监听：`page.on('pageerror', …)` 和 `page.on('response', r => r.status() >= 400)`。

### 验收脚本（全绿才算改完）

| 脚本 | 项数 | 验什么 |
|---|---|---|
| `tools/verify-guard.js` | 6 | **静默白屏 / CSS 解析被截断**，必跑 |
| `tools/verify-sync.js` | 35 | 云端同步（登录态、节流、失败重试、换设备恢复） |
| `tools/verify-multidev.js` | 22 | **多设备合并**（两个 context + Node 端共享云端） |
| `tools/verify-resume.js` | 21 | 断点续传、复习分家、罗马音、错题本 |
| `tools/verify-hear.js` | 18 | 听力任务、句子方向、BOX 第 7 档、迁移 |
| `tools/verify-sense.js` | 19 | 语境义 |
| `tools/verify-3features.js` | 41 | 专注态、ETA、我的页回归 |
| `tools/verify-p0-round3.js` / `verify-p1-round4.js` | 23 / 13 | P0/P1 修复项 |
| `tools/verify-drill-audio.js` / `verify-quiz-audio.js` | 37 / 8 | 发音 |
| `tools/verify-css-guard.js` | 11 | 重复 CSS / 悬空变量 |
| `tools/verify-online.js` | 17 | **线上验收**（发布后跑） |
| `tools/verify-both.js` | — | 快照与工作副本结果必须一致 |
| `.vt/verify-all.js` | 16 | 全功能冒烟（5 个 tab） |

诊断脚本 `tools/diag-*.js`（20 个）、截图 `tools/shot-*.js`、历史补丁 `tools/patch-*.js`（已应用，仅供参考）。
**先写诊断脚本再改代码**：把中间状态摊开打印，比反复猜条件快一个数量级。

---

## 11. 工程纪律（血泪清单）

### 会让人以为「功能凭空消失」的坑

- **一个缺失 id 就会让整页 JS 静默死掉**：`$('x').textContent` 抛 TypeError，后续所有渲染函数都不执行，
  页面看着正常其实是空壳。已翻车两次。改完做一次全量比对：
  ```bash
  grep -o 'id="[^"]*"' index.html | sed 's/id="//;s/"//' | sort > h.txt
  grep -o "\$('[a-zA-Z0-9_]*')" index.html | sed "s/\$('//;s/')//" | sort -u > c.txt
  comm -13 h.txt c.txt
  ```
- **`var` 提升 ≠ 初始化提前**：`var TASKS` 声明在 `renderToday` 之前，而 `var D = getDay(S.day)` →
  `buildPlan()` → `dayDone()` 会读 `TASKS.length`，此刻还是 `undefined` → 整个 `<script>` 块中断。
  触发条件是「本地有历史天数 + 跨天」，即**第二天以后打开页面的每一个用户**。
  排查手法：预置一份有历史的 localStorage 再打开页面。
- **语法检查必须拆块 + `vm.Script`**：`spawnSync(node, ['--check'])` 在 Windows 撞 EBUSY。
  `tools/diag-syntax.js` 目前只检查 `blocks[1]`，**那是错的**（主程序是块 9），要用「所有无属性 `<script>` 块」。
- **`confirm('...\n...')` 里的 `\n` 被写成真换行** → 单引号字符串跨行 → SyntaxError → 整页全白且无报错。
- **补丁脚本吃掉 `:root` 的闭合大括号** → `@media` 之后整段 CSS 没解析 → 深色模式整体失效，浅色环境下肉眼发现不了。
- **`index.html` 是混合行尾（CRLF/LF）**：脚本做字符串替换时，锚点要「先按原样找，找不到再试 CRLF 版」。

### 测试与验收

- **验收脚本不能打冻结快照（8848），也不能用 `file://`**：8848 服务的是旧快照，会误判「刚加的函数未定义」；
  `file://` 的 Origin 为 null 会让云服务全拒，同步专项假 FAIL 17 项。用 8899 工作副本。
- **测试桩持有生产对象引用 = 通过是假的**：假云端必须 `JSON.parse(JSON.stringify(x))` 深拷贝。
- **`page.evaluate` 里用 `window.S` 显式取全局**，直接写 `S` 可能拿到错误作用域的副本。
- **`D.plan` 是 `getDay()` 的缓存快照**，`buildPlan()` 返回新对象。涉及 plan 的验证必须先 `D.plan = buildPlan()`。
- **预置种子数据要满足 `dayDone()` 的完整条件**（7 项全 done），否则「我的」页明细/趋势/打卡天数全空，看着像页面坏了。
- **截图与验收共用同一份种子**（`tools/seed-for-visual.js`）。本项目两次真 bug（ETA 倒挂、每天 1′ 的荒谬时长）
  都是靠看截图发现的，测试全绿也没抓到。
- **线上验收必须覆盖「本轮修了什么」**，只验内容与界面等于没验。
- **验证图片有没有显示必须查真实 DOM**：`new Image()` 绕过渲染路径会给出假阳性；
  要查 `naturalWidth > 0` **和** `getBoundingClientRect().width > 0`。
  `loading="lazy"` 对 `display:none` 祖先里的图片不触发加载且不报错 —— **单页应用的列表缩略图千万别加 lazy**。
- **测深色模式必须新开 `colorScheme:'dark'` 的 context**，同 context 里 `emulateMedia` 后 `goto` 会被重置。
- **headless Chrome 默认禁止自动播放**，`audio.play()` 会被 reject。加
  `args:['--autoplay-policy=no-user-gesture-required']` —— **别把环境限制当成产品 bug 去改**。
- **`new Event('visibilitychange')` 默认不冒泡**，事件到不了 `window` 上的监听器 → 误判「合并没生效」。必须 `{bubbles:true}`。
- **后台起静态服务时命令末尾不能带 `sleep`**，任务一结束进程就被杀（下次 goto 直接 ERR_CONNECTION_REFUSED）。

### 产品/交互

- **过滤逻辑要在消费端也做一次**：`buildPlan` 分配时跳过了 `S.master`，但 `taskKeys()` 没过滤 →
  用户标记掌握的词照样翻出来。**凡是用户可随时改状态的（已掌握/收藏/已读），渲染取数那层必须自己再过滤。**
- **不要用「云端不可用」一句话打发用户**：任何降级分支都要给可点击的下一步。
- **UI 默认状态别自作主张折叠**，默认折叠会让人「点了没反应」。
- **`renderXxx` 的状态分支不要写 `ME && cloud` 这类与条件**，要用本质条件 `if (ME)`，次要能力单独降级。
- **同一段逻辑别在两处各写一份**。改「设置类」按钮时，先看隔壁同类按钮有没有做全。
- **排版类问题直接扫截图像素**（`tools/diag-user-shot.js`），别靠 DOM 推断 ——
  `getClientRects()` 量的是行盒不是墨迹。emoji 混在泰文里会把整行基线撑歪（墨迹 22px → 27px）。
  泰文有上标元音/声调，字形自身高度差 3~4px 属正常，不要试图用 CSS 消除。

### 前端风格（`STYLE.md`）

- Design token：`--fs-xs..--fs-3xl`、`--s1..--s4`、`--r/--r-sm/--r-xs/--r-pill`、
  `--lh`(1.65) / `--lh-loose`(1.9，泰文专用)、`--t-instant/--t-fast/--t/--t-slow`、`--tap:44px`、`--tabbar-h:58px`；色阶 50/200/600/700/800。
- **悬空 CSS 变量是最容易长期没人发现的 bug**：`.lv.ok/.half/.bad` 曾引用从未定义的 `--green700` 等四个，
  标签底色还在所以「看上去有颜色」，浅色深色都看不出来。**改完样式跑 `tools/report-style.js`。**
- 色阶要有 700 档（600 在浅底上小字对比度不够，800 太深）；深色下的 700 要比浅色更亮。
- `--tabbar-h` 这类布局常量必须共用（以前 body 写 66px、tabbar 写 58px，改一处忘另一处，内容被底栏盖住）。

---

## 12. 用户协作偏好

- 偏好「高频优先 + 阶段化 + 可勾选打卡 + 明确自检标准」的计划形式，**不喜欢只给方向不落细节**。
- 计划类交付默认做成**可交互 HTML 页面**，不要纯文本。
- **释义默认中文 + 英文同时给**（光有中文不够）。
- **不要代替用户做道德/内容取舍**，删内容前问。
- 交付结果要能直接投喂给 ChatGPT 使用（纯文本、带编号、分批次），不要只给表格。

---

## 13. 当前状态与待办

**已完成并上线**（最新提交见 `git log`）：拼读/语料/词库/配图/发音、复习改造（单词句子分家 + 断点续传 + 错题本）、
听力任务、语境义、教育侧优化、**多设备合并同步**。

**待办 / 未决**

1. **对话配对式「接话练习」**（用户想要，做不了）：需要**双方完整的聊天记录**。
   现有 `corpus.json` 1257 条**全是她的话**（相邻对 h2m=0），做不出对话配对。
   需要用户导出包含双方发言的完整记录。
2. `retention()` 首次接触日被 14 条轨迹截断（P1）。
3. `analyze()` 与 `quotaForDay()` 口径不一致（P2）。
4. P4 低频 1247 词配图 —— 用户明确说先不画。
