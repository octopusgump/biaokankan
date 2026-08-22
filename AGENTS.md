# Repository working agreements

开始任何任务、切换分支或执行 Git 操作前，必须完整读取：

`docs/development/AI_GIT_COLLABORATION_WORKFLOW.md`

该文件是 Codex 与 Claude Code 共用的 Git 上传、审核、集成和发布规则唯一详细记录。本文件只保留 Codex 必须立即看到的硬规则；发生冲突时停止操作并向用户报告。

## 多窗口 Git 协作

本仓库可能同时有多个 Codex 窗口开发不同功能。所有任务必须遵守以下规则。

### 1. 开始工作前

- 首先检查当前工作目录、Git 分支和 `git status`。
- 确认当前任务位于独立 worktree 和独立功能分支。
- 如果发现其他任务留下的未提交修改，不得覆盖、暂存、提交或清理它们。
- 如果当前窗口与其他窗口共享同一个工作目录，停止 Git 写操作并向用户报告。

### 2. 分支命名

- 所有开发分支统一使用 `<类型>/<任务名称>` 格式。
- 类型必须从下表选择，不得把所有任务都命名为 `feature/*`：

| 类型 | 使用场景 | 示例 |
|---|---|---|
| `feature/` | 新增用户可见功能或交互 | `feature/access-gate-ux` |
| `fix/` | 修复缺陷、安全问题或错误行为 | `fix/access-control` |
| `docs/` | 只修改规则、流程、PRD、设计或非敏感部署文档 | `docs/ai-git-workflow` |
| `refactor/` | 不改变外部行为的代码重构 | `refactor/auth-state` |
| `test/` | 只新增或调整测试 | `test/access-gate` |
| `chore/` | 构建、依赖、脚本或仓库维护 | `chore/pages-build` |
| `hotfix/` | 已发布版本的紧急线上修复 | `hotfix/login-failure` |

- 任务名称只能使用小写英文字母、数字和短横线 `-`，不得使用空格、中文、下划线或大写字母。
- 任务名称应简短且能说明范围，建议使用 2–5 个单词，例如 `access-gate-ux`。
- 一个窗口只能使用一个独立分支；不同窗口不得共用同一个分支名。
- 一个分支只处理一个功能或问题。若任务范围发生实质变化，应新建分支，不得继续向原分支混入无关修改。
- `publish/main-20260820` 是集成发布分支，不使用上述功能前缀，也不得作为日常开发分支。
- `<类型>/claude-*` 由 Claude Code 独占，`<类型>/codex-*` 由 Codex 独占（归属由 `claude` / `codex` 标识决定，与前缀类型无关，例如 `fix/claude-*`、`docs/codex-*` 同样适用）。任一方不得 push、rebase、force push、改写或删除对方分支。

### 3. 功能窗口

- 一个功能窗口只负责一个明确的功能模块。
- 按“分支命名”规则创建独立分支和独立 worktree。
- 只修改和提交当前功能直接相关的文件。
- 不得切换到、合并或直接提交 `publish/main-20260820`。
- 不得直接 push `publish/main-20260820`。
- 未经用户明确要求，不执行 commit 或 push。
- 例外：仓库所有者可对某个 Agent 的自有独占分支给出**常设 push 授权**，并记录在该 Agent 的入口文件（`AGENTS.md` / `CLAUDE.md`）中。常设授权只覆盖 push 自有独占分支与所有者指定的独立文档仓库，不覆盖 merge、cherry-pick、发布、操作他人分支或任何 force 操作。
- 获得提交授权后，完成定向测试并创建单一、清晰的 commit。
- 最终报告必须包含：分支名、测试结果、commit hash、涉及文件和已知限制。
- `docs/README.md`、`docs/prd/README.md` 等共享索引只由集成窗口修改，功能窗口不得触碰。
- 本仓库是 public；代码审核、安全评估、未修复漏洞和复盘材料不得提交，`docs/audit/` 仅用于仓库外本地归档。

### 4. 集成窗口

- `publish/main-20260820` 只允许由用户或用户指定的人工集成窗口操作。
- Codex 与 Claude Code 只交付明确 Commit SHA 和测试报告，不自行合并，除非用户在当次任务中明确改变授权。
- 集成前确认工作区干净，并确认远端分支状态。
- 只接收已经完成测试的明确 commit hash。
- 逐个 cherry-pick 或 merge，不一次性混合无法追踪的工作区修改。
- 每次合入后检查冲突和差异；全部合入后运行完整构建与测试。
- push 前向用户汇报即将推送的 commit 列表、测试结果和目标分支。
- 只有获得用户明确授权后才能 push。

### 5. Git 安全规则

- 不使用 `git reset --hard`、强制 push 或其他破坏性命令。
- 不擅自 stash、删除或还原不属于当前任务的修改。
- 不通过扩大暂存范围解决混杂改动。
- 遇到分支、worktree 或修改归属不明确时，停止并报告。
- 任何需要另一个 Agent 读取、审核或集成的改动都必须先形成明确 Commit 并 push；未 push 的本地修改对另一个 Agent 等于不存在。
- 不修改、rebase、force push 或删除另一 Agent 独占的分支。
