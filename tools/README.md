# tools/ — 开发与预览工具

这个目录解决一个具体问题：**改代码的时候你还能正常使用应用。**

## 为什么需要它

以前我直接编辑 `thai-study/index.html`，而你正在用的也正是这一份。
一改，你刷新就可能撞上半成品甚至白屏。

现在的做法是：把已验证通过的版本冻结在 `live/index.html`，
你始终访问那个地址；我改的是工作副本，改完跑完测试才同步过去。

## 用法

### 启动预览服务（你已经开着，也可以双击 `start-live.cmd`）

```
node tools/live-server.js        # 默认 8848
node tools/live-server.js 8850   # 换端口
```

打开 **http://127.0.0.1:8848/**

### 开机自动启动

把 `tools/start-live.cmd` 复制到 `shell:startup` 文件夹：
`Win + R` → 输入 `shell:startup` → 回车，把文件丢进去即可。
脚本会先查端口，已在跑就退出，不会重复起进程。

### 我这边的标准流程

```bash
# 1. 改 index.html（你照常用 8848，完全不受影响）
# 2. 查重复 CSS（同作用域内写了两遍的）
node tools/css-dup.js
# 3. 同步到快照 —— 语法体检不通过会拒绝覆盖，你继续用旧的
node tools/live-sync.js
# 4. 双源回归：快照和工作副本必须结果一致
NODE_PATH=".../node/workspace/node_modules" node tools/verify-both.js
# 5. 截图验收
NODE_PATH="..." node tools/shots.js
```

`verify-both.js` 支持 `--live-only` / `--work-only` 单独测一个来源。

## 各脚本

| 文件 | 作用 |
|---|---|
| `live-server.js` | 本地服务。页面走 `live/` 快照，音频/图片/词库走项目原目录（不必复制 6000+ 音频文件） |
| `live-sync.js` | 同步工作副本 → 快照。同步前用 `vm` 编译逐个检查内联脚本，语法坏掉就中止 |
| `verify-both.js` | 25 项冒烟测试 × 2 个来源（快照 / 工作副本） |
| `shots.js` | 深浅两色 × 7 页截图 |
| `css-dup.js` | 找同作用域内被写了两遍的 CSS 选择器 |
| `start-live.cmd` | 双击启动，端口已占用则退出 |

## 踩过的坑（都写在代码注释里了）

- **`vm.Script` 代替 `node --check`**：早先用 `execFileSync` + `--check`，
  Windows 上反复 spawn 同一个 exe 会撞 `EBUSY`，而且慢得多。
- **`:has-text` 是 Playwright 语法**，浏览器里 `querySelector` 会报
  "is not a valid selector"。找元素用稳定 id（`#cShow` / `#cR`），
  别用按钮文案 —— 文案会随 `run.kind` 变（新学说「认识」，阅读说「看懂了」）。
- **不能手写 `S.items` 造学习数据**：计划重算时会把 `seen>0` 且未掌握的
  条目当成「已学过的词」而排除（实测 `dueList` 有 14 条但 `plan.dueW=0`）。
  正确做法是点 `[data-run="new"]` 走真实流程。
- **「重复 CSS」的判定**：按单名统计会把 `html,body` + `body`、
  `:root` 浅色 + 深色、`.w .sd` 基础 + `@media` 全算成重复，
  逼着人把深色模式删掉。要按**同作用域 + 完整选择器**判。
- **词库全局叫 `WORDS5`**，不是 `WORDS`。
