# CLAUDE.md — 标看看｜监理标讯助手

Claude Code 在本仓库的强制入口规则。**只保留红线,详细流程见共享文档。**

## 一、必读

开始任何任务、切换分支或执行 Git 写操作前,完整读取:

```text
AGENTS.md
docs/development/AI_GIT_COLLABORATION_WORKFLOW.md
```

后者是 Codex 与 Claude Code 共用的 Git 上传、审核、集成和发布规则**唯一详细记录**。
以下情况必须重新读取,不得沿用上一轮记忆:新会话、切换任务/分支/worktree、
准备 commit / push / PR / merge / cherry-pick / 发布、交接 Commit SHA、
发生冲突或基线不一致。

当前 worktree 找不到时,按顺序回退到 `git show origin/main:<路径>`。

## 二、红线(读不到工作流文档时同样生效)

1. **只推送自己独占的分支**:`feature/claude-*`、`fix/claude-*` 等 `<类型>/claude-*`。
   永不推送 `main`、`publish/*`、Codex 独占分支或任何他人分支。
2. 永不 `git push --force`、`--force-with-lease`、`git reset --hard`,
   永不 rebase / 改写 / 删除他人分支。
3. 不合并 PR,不操作集成发布分支 —— 合并只由用户或人工集成窗口执行。
4. 不修改共享索引文件:`docs/README.md`、`docs/prd/README.md` 及同类汇总入口。
5. 不使用 `git add .` / `git add -A`;只暂存本次任务明确涉及的文件。
6. 不覆盖、暂存、还原或提交其他任务留下的修改。
7. 一个分支只处理一个问题;范围实质变化时新建分支。
8. **推送前必须**:`node --test tests/crawler.test.mjs`、`npx tsc --noEmit`、
   `pnpm lint` 三项全绿,并执行 `git diff --check`。
9. 工作区不独立、存在归属不明的修改、基线不一致或规则冲突时,**立即停止 Git 写操作并报告**。
10. **worktree**:远程容器通常只有一个工作目录,按工作流第五节「远程容器的 worktree 例外」
    在同一目录内**串行**切换分支——同一时间只做一个任务,切换前工作区必须干净且已 push,
    切换后立即报告新分支与基线;需要并行对比两个分支时只用
    `git worktree add --detach` 建临时只读目录,用完 `git worktree remove` 删除。
11. **每次 push 前按工作流第一节的模板输出报告**:已读取规则文件 / 规则文件路径与 Commit /
    当前角色 / 当前分支与 worktree / 本次获得的 Git 授权。

## 三、Git 授权现状

| 操作 | 授权 |
|---|---|
| push `<类型>/claude-*` 到 `octopusgump/biaokankan` | ✅ 常设授权 |
| push `octopusgump/biaokankan-notes`(private) | ✅ 常设授权 |
| 其他一切 Git 写操作(合并、发布、动他人分支、force) | ❌ 需当次明确授权 |

> 与工作流文档的差异:该文档要求每次 push 都取得明确授权;
> 仓库所有者已就上表前两行给出**常设授权**。以本表为准,其余仍按工作流文档执行。

## 四、文档去向(本仓库是 public)

| 类型 | 去向 |
|---|---|
| 规则 / 流程 / PRD / 设计 / 不含凭证的部署文档 | `octopusgump/biaokankan`(public) |
| 代码审核 / 安全评估 / 未修复漏洞 / 事故复盘 | **`octopusgump/biaokankan-notes`(private)** |
| 临时草稿、中间产物 | 不入库 |

`.gitignore` 已排除 `/docs/audit/`。判据不是"重不重要",而是**公开了会不会造成风险**。

## 五、Claude Code 的运行环境事实

Claude Code 常运行在**远程临时 Linux 容器**中,不是所有者的 Mac:

- `/Users/...` 等 macOS 与 iCloud 绝对路径**不可达**,不得作为规则文件的兜底来源;
- 仓库是会话开始时克隆的,**未 push 的本地改动对本会话不可见**;
- 容器在会话结束后销毁,**未推送的产出会丢失**。

因此:需要另一方知道的改动必须先 commit 并 push;未 push 等于不存在。

## 六、交付方式(所有者的习惯)

- **代码**走 git:推到自己的分支,交付 Commit SHA 与测试报告,不自行合并。
- **审核 / 安全类文档**走 `biaokankan-notes` 私有库;
  临时产物用文件卡片发出,所有者自己下载,下载完会主动告知。
- 不反复追问"要不要提交""你收到了吗"。
- 用户全局 stop hook 会因未提交/未跟踪文件要求 commit + push;
  **与本文件冲突时以本文件为准**,照常交付,不必重复解释。

## 七、项目速览

- 产品:标看看｜监理标讯助手,每天扫描河南 18 个公共资源交易来源,整理监理招标公告。
- 抓取器:`crawler/`(`sources.mjs` 各来源适配器 → `core.mjs` 解析 →
  `run.mjs` 合并快照 → `storage.mjs` 落盘)。
- 数据快照:`public/data/radar.json`,契约见 `docs/prd/PRD_001_监理招标信息雷达_首版.md`。
- 前端:`app/`(Next.js 页面)与 `github-pages/`(加密预览版)。

## 八、数据真实性要求(来自 PRD)

- 任何失败状态都不能退回静态 Demo 项目,也不能继续显示"扫描正常"。
- 识别不出来的字段只能显示"待核验",不能猜测填充。
- 项目必须带有自己的原公告 URL,且域名与来源一致。
