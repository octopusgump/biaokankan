# Codex × Claude Code Git 协作规范

> 适用范围：本仓库中由 Codex、Claude Code 和人工共同完成的开发、审核、文档与发布工作。
>
> 当前集成发布分支：`publish/main-20260820`。下文用 `<publish-branch>` 代指本行配置，执行命令前必须替换为当前值。
>
> **本文件是 Codex 与 Claude Code 共用的 Git 上传、审核、集成和发布规则唯一详细记录。每次新任务、新窗口或新的 Git 操作前都必须重新读取，不得依赖记忆中的旧版本。**

## 一、文档职责

本文档是多 AI Git 协作流程的唯一完整版本，负责说明分支、worktree、审核、集成和发布方法。

- `AGENTS.md`：Codex 的强制入口规则；
- `CLAUDE.md`：Claude Code 的强制入口规则；
- 本文档：两个 AI 共用的详细操作流程。

`AGENTS.md` 和 `CLAUDE.md` 应保留最重要的安全红线，并指向本文档。不要在三个文件中复制整套流程，以免规则逐渐不一致。

### 规则文件位置

仓库内的标准相对路径是：

```text
AGENTS.md
CLAUDE.md
docs/development/AI_GIT_COLLABORATION_WORKFLOW.md
```

AI 进入任意 worktree 后，先定位当前仓库根目录：

```bash
git rev-parse --show-toplevel
```

规则文件按以下顺序读取：

### 1. 当前 worktree

```bash
sed -n '1,260p' AGENTS.md
sed -n '1,420p' docs/development/AI_GIT_COLLABORATION_WORKFLOW.md
```

### 2. 当前克隆中的 `origin/main`

如果当前工作分支尚未包含规则文件，检查克隆时取得的远端默认分支内容：

```bash
git show origin/main:AGENTS.md
git show origin/main:docs/development/AI_GIT_COLLABORATION_WORKFLOW.md
```

此步骤不等于联网获取最新规则。如果任务需要执行 `git fetch`，仍须遵守授权要求。

### 3. 仅本地 Agent 使用的 iCloud 主副本

只有确认运行在用户 Mac 时，才可以读取当前会话环境或用户消息明确提供的 iCloud 仓库绝对路径。公开规则文档不记录个人机器路径。

远程 Linux 容器不得尝试使用这个路径，也不得把它视为可用兜底。

如果当前 worktree 和 `origin/main` 都找不到规则文件：

1. 报告当前 `pwd`、仓库根目录、分支和 Commit SHA；
2. 远程 Agent 明确报告“当前分支和 `origin/main` 尚未包含规则文件”；
3. 远程 Agent 停止 Git 写操作，等待用户提供规则所在分支或 Commit SHA；
4. 本地 Agent 才可继续检查 iCloud 主副本；
5. 不得自行编造、缩减或沿用记忆中的旧规则。

### 每次沟通的必读要求

以下情况必须重新查询本文档，而不是沿用上一轮记忆：

- 新建 Codex 或 Claude Code 对话；
- 切换任务、分支或 worktree；
- 准备 commit、push、PR、merge、cherry-pick 或发布；
- Codex 与 Claude Code 交接 Commit SHA；
- 发生冲突、脏工作区、基线不一致或规则理解分歧；
- 修改 `AGENTS.md`、`CLAUDE.md` 或本文档本身。

每次 Git 上传或集成前，AI 都应在报告中写明：

```text
已读取规则文件：是 / 否
规则文件路径：
规则文件所在 Commit（若已跟踪）：
当前角色：作者 / 审核者 / 集成负责人
当前分支和 worktree：
本次获得的 Git 授权：
```

## 二、核心原则

1. **一个任务对应一个分支、一个 worktree、一个明确负责人。**
2. **一个 worktree 同一时间只有一个写入者。**另一个 AI 可以审核，但不能同时修改同一目录。
3. 功能窗口不直接提交或推送集成发布分支。
4. 审核通过的 Commit SHA 是交付单位，不以未提交工作区作为交付物。
5. 只有集成窗口负责接收 Commit、处理集成、运行完整测试和发布。
6. 不覆盖、暂存、清理或提交其他任务留下的修改。
7. 未经用户明确授权，不执行 commit、push、合并或发布。
8. **Push 即通信。**任何需要另一个 Agent 读取、审核或集成的改动都必须先形成明确 Commit 并 push；未 push 的本地修改对另一个 Agent 等于不存在。

## 三、角色分工

| 角色 | 推荐工具 | 主要职责 | 默认权限 |
|---|---|---|---|
| 功能作者 | Codex 或 Claude Code | 实现单一任务、定向测试、提交功能分支 | 只写自己的 worktree |
| 代码审核者 | Claude Code | 审核正确性、安全、边界、测试和改动范围 | 默认只读 |
| 审核修复者 | 原功能作者 | 根据审核意见修复并重新测试 | 继续写原功能分支 |
| 集成负责人 | 用户或用户指定的人工集成窗口 | 逐个接收 Commit、完整验证、发布 | 独占集成 worktree |

工具不是固定角色。Claude Code 也可以开发，Codex 也可以审核；但一次任务中必须明确谁写、谁审，不能同时写同一分支。Codex 和 Claude Code 都不自行扮演最终合并者，除非用户在当次任务中明确改变这一授权。

## 四、分支命名

所有任务分支使用 `<类型>/<任务名称>`：

| 类型 | 场景 | 示例 |
|---|---|---|
| `feature/` | 新增用户可见功能 | `feature/project-export` |
| `fix/` | Bug、安全或错误行为修复 | `fix/access-gate-ux` |
| `docs/` | 只修改文档或规范 | `docs/ai-git-workflow` |
| `refactor/` | 不改变外部行为的重构 | `refactor/auth-state` |
| `test/` | 只新增或调整测试 | `test/access-gate` |
| `chore/` | 构建、依赖和仓库维护 | `chore/pages-build` |
| `hotfix/` | 已发布版本的紧急修复 | `hotfix/login-failure` |
| `integration/` | 多个已审核任务的集成验证 | `integration/publish-20260822` |

任务名称只使用小写英文字母、数字和短横线。一个分支只处理一个明确问题。

### Agent 分支归属

- `feature/claude-*` 由 Claude Code 独占；
- `feature/codex-*` 由 Codex 独占；
- 任一方不得向对方分支 push，不得 rebase、force push、改写或删除对方分支；
- 需要对方修改时，通过审核意见或新的独立修复 Commit 交接；
- 最终合并只由用户或用户指定的人工集成窗口执行。

示例：

```text
feature/claude-deduplicate-projects
feature/codex-access-gate-ux
```

### 共享索引文件

下面这类高冲突共享索引只由集成窗口修改，Codex 与 Claude Code 的功能分支都不得编辑：

```text
docs/README.md
docs/prd/README.md
其他用于汇总多个任务入口的共享目录索引
```

功能分支只新增自己的正文文件，并在交付报告中注明“需要集成窗口补充索引”。

## 五、开始任务

### 1. 先检查环境

```bash
pwd
git branch --show-current
git status --short --branch
git worktree list
```

如果目录中存在其他任务的修改，停止写入，不得通过 stash、清理或扩大暂存范围解决。

### 2. 创建独立功能 worktree

在干净的仓库管理窗口中执行：

```bash
git fetch origin
git worktree add \
  -b fix/example-task \
  ../wt-example-task \
  origin/<publish-branch>
```

创建完成后，功能窗口只打开 `../wt-example-task`。新窗口本身不能提供隔离，必须同时使用独立 worktree。

### 3. 记录任务归属

开始编码前明确：

```text
任务：
作者：Codex / Claude Code / 人工
审核者：
分支：
worktree：
基线 Commit：
预计修改文件：
验收命令：
```

## 六、功能开发与交付

功能作者应遵循以下顺序：

1. 阅读相关文件、调用者、测试和本地规范；
2. 只修改任务直接相关的文件；
3. 运行定向测试；
4. 检查 `git diff` 和 `git diff --check`；
5. 获得授权后，只暂存明确文件；
6. 创建清晰 Commit 并推送功能分支；
7. 向审核者交付 Commit SHA 和报告。

本地完成但尚未 push 的工作不能作为跨 Agent 交付。另一个 Agent 开始审核或集成前，必须能从远端分支或明确 Commit SHA 取得相同内容。

推荐命令：

```bash
git status --short
git diff --check
git diff -- <明确的文件列表>
git add <明确的文件列表>
git commit -m "fix(scope): concise description"
git push -u origin fix/example-task
```

禁止使用 `git add .` 处理混杂工作区。

### 功能交付模板

```text
任务：
分支：
基线 Commit：
交付 Commit：
修改文件：
测试命令与结果：
未执行的验证：
已知限制：
需要审核者重点检查：
```

## 七、Claude Code 审核流程

优先通过 GitHub PR 或明确的 Commit SHA 审核。审核者默认只读，不直接修改作者 worktree。

审核至少覆盖：

- 需求和验收标准是否满足；
- 是否存在无关修改；
- 权限、安全、数据泄漏与失败关闭行为；
- 空数据、异常、超时、重复操作和并发边界；
- 测试是否验证用户意图，而非只匹配代码文本；
- 构建、类型、Lint 和现有行为是否受影响；
- 文档与实现是否一致。

问题统一分级：

| 级别 | 含义 | 合并要求 |
|---|---|---|
| P0 | 安全、数据损坏或严重发布风险 | 立即停止集成 |
| P1 | 明确缺陷或验收失败 | 合并前必须修复 |
| P2 | 中等风险或重要改进 | 应修复或记录接受理由 |
| P3 | 非阻塞建议 | 可后续处理 |

### 本地只读审核

如需本地环境，使用 detached worktree：

```bash
git worktree add \
  --detach \
  ../wt-review-example \
  <功能Commit SHA>
```

如果审核者需要亲自修改，必须创建新的审核修复分支和 worktree：

```bash
git worktree add \
  -b review/example-fixes \
  ../wt-review-example-fixes \
  <功能Commit SHA>
```

审核修复以独立 Commit 交回原作者或集成负责人，不直接写入原作者分支。

## 八、审核修复循环

```text
功能作者提交并 push
        ↓
Claude Code 审核 Commit / PR
        ↓
输出 P0–P3 问题
        ↓
原作者在原分支修复并测试
        ↓
审核者只复审新增差异
        ↓
Approved
```

修复后必须更新交付 Commit SHA。集成窗口只接收最终审核通过的 SHA。

## 九、集成窗口

集成工作只由用户或用户指定的人工集成窗口执行，必须使用独立、干净的 worktree。Codex 与 Claude Code 只提供已审核 Commit SHA 和测试报告，不自行合并。推荐先创建临时集成分支，而不是让多个窗口直接写发布分支：

```bash
git fetch origin
git worktree add \
  -b integration/publish-20260822 \
  ../wt-integration-20260822 \
  origin/<publish-branch>
```

逐个接收已审核 Commit：

```bash
git cherry-pick <commit-a>
# 运行任务 A 的定向测试

git cherry-pick <commit-b>
# 运行任务 B 的定向测试
```

每次接收后都检查冲突、差异和定向测试。全部接入后再运行完整构建与测试。

小型、单一 Commit 的代理任务优先使用 `cherry-pick`。需要保留完整 PR 历史时才使用 merge；分支基线不清楚时不得直接 merge 整个分支。

## 十、发布流程

集成完成后：

1. 检查远端发布分支是否发生变化；
2. 检查待发布 Commit 列表；
3. 运行完整 Lint、测试和生产构建；
4. 向用户报告 Commit、测试、目标分支和已知限制；
5. 获得明确授权后推送集成分支；
6. 通过 PR 合入发布分支。

```bash
git status --short --branch
git log --oneline origin/<publish-branch>..HEAD
git diff --check
git push -u origin integration/publish-20260822
```

推荐发布路径：

```text
功能分支 Commit
      ↓ 审核
integration/publish-YYYYMMDD
      ↓ 完整测试 + PR
<publish-branch>
```

## 十一、公开仓库文档披露边界

本仓库是 public。任何 commit、分支、PR、Issue 或构建产物都应按公开信息处理。

允许进入仓库：

```text
规则 / 流程 / PRD / 设计 / 不含凭证的部署文档
```

不得进入仓库：

```text
代码审核报告 / 未修复漏洞描述 / 安全评估 / 事故复盘 / 攻击路径 / 敏感运行信息
```

这类材料由用户下载并在仓库外归档。仓库通过以下规则阻止新增审核材料：

```gitignore
/docs/audit/
```

`.gitignore` 只阻止新增未跟踪文件，不会自动移除已经被 Git 跟踪或已经推送的内容。发现既有公开安全材料时，停止继续传播并向用户报告，由用户决定后续删除、历史清理和披露处置。

## 十二、禁止操作

- 多个窗口共用同一个 worktree 或分支写代码；
- 功能窗口直接 push 集成发布分支；
- 未经授权执行 commit、push、merge 或发布；
- 使用 `git reset --hard`、强制 push 或其他破坏性命令；
- 擅自 stash、删除、还原或提交其他任务的修改；
- 使用 `git add .` 或 `git add -A` 掩盖修改归属不清；
- 未完成审核和测试就向集成窗口交付；
- 用分支名代替明确 Commit SHA 进行高风险集成。
- 修改 `docs/README.md`、`docs/prd/README.md` 等共享索引文件；
- 把审核、安全或复盘材料提交到 public 仓库。

## 十三、修改本规范

Codex、Claude Code 和人工都可以提出修改，但不得同时直接编辑本文档。

规范修改也遵循正常流程：

```text
创建 docs/update-ai-git-workflow 分支
        ↓
一个负责人修改
        ↓
另一个 AI 或人工审核
        ↓
集成窗口合入
```

修改时同步检查 `AGENTS.md` 和 `CLAUDE.md` 中的入口指针，但详细流程仍只维护在本文档中。

## 十四、给 Claude Code 的启动提示词

每次让 Claude Code 参与本仓库的开发或审核时，可以将下面的提示词作为任务开头。填写方括号中的任务信息后再发送。

```text
你正在参与「标看看」仓库的多 AI Git 协作任务。

本次角色：[代码审核者 / 功能作者 / 审核修复者]
本次任务：[一句话说明任务]
目标分支：[分支名；只读审核时填写被审核分支]
目标 Commit：[明确 SHA；开发任务可以填写基线 SHA]
允许修改的文件：[只读审核填写“无”]
验收命令：[本任务需要执行的测试]

开始任何分析、编辑或 Git 操作前，必须完整阅读：

1. 仓库根目录的 `CLAUDE.md`（如果存在）；
2. 仓库根目录的 `AGENTS.md`；
3. `docs/development/AI_GIT_COLLABORATION_WORKFLOW.md`。

如果当前 worktree 找不到后两项，先用 `git show origin/main:<路径>` 检查当前克隆中的默认远端分支。只有运行在用户 Mac 时，才允许使用当前会话明确提供的 iCloud 路径。远程 Linux 容器如果仍找不到，必须报告“当前分支和 origin/main 尚未包含规则文件”并停止 Git 写操作。

读取后先执行并报告：

- `pwd`
- `git branch --show-current`
- `git status --short --branch`
- `git worktree list`
- 当前任务是否位于独立 worktree 和独立分支

必须遵守以下规则：

1. 一个任务对应一个分支、一个 worktree、一个明确写入者；
2. 不得与 Codex 或其他窗口同时写入同一个 worktree 或分支；
3. 不得覆盖、暂存、提交、还原、stash 或清理其他任务的修改；
4. 未经用户明确授权，不执行 commit、push、merge、cherry-pick 或发布；
5. 不直接修改或 push 当前集成发布分支；
6. 不使用 `git reset --hard`、强制 push、`git add .` 或其他扩大修改范围的操作；
7. 如果工作区不独立、存在不明修改、基线不一致或规则冲突，立即停止写操作并报告；
8. 只修改任务明确授权的文件，并在交付前运行定向测试和 `git diff --check`。
9. 需要另一个 Agent 知道的改动必须先 commit 并 push；未 push 的本地改动对另一个 Agent 等于不存在；
10. 不得 push、rebase、force push、改写或删除另一 Agent 独占的分支；
11. 不修改 `docs/README.md`、`docs/prd/README.md` 等共享索引；
12. 不把审核、安全或复盘材料提交到 public 仓库。

如果本次角色是“代码审核者”，默认只读：

- 以目标 Commit SHA 或 PR diff 为审核范围；
- 不直接修改被审核者的 worktree；
- 检查需求符合度、正确性、安全、异常边界、回归风险、测试有效性和无关修改；
- 问题按 P0、P1、P2、P3 分级；
- 每个问题给出文件、位置、证据、影响和最小修复建议；
- 没有阻塞问题时明确写“Approved”，不要为了凑数量制造问题。

如果本次角色是“功能作者”或“审核修复者”：

- 先阅读相关实现、调用者和测试，再进行外科手术式修改；
- 保留无关代码和用户现有工作；
- 测试必须验证任务意图，而不只是代码文本；
- 交付时报告分支、基线 SHA、最终 Commit SHA、修改文件、测试结果和已知限制。

先复述本次角色、范围和完成标准，再开始工作。
```

### Claude Code 纯审核简版提示词

当功能分支已经完成，只需要 Claude Code 审核时，可以使用下面的短版本：

```text
请以只读代码审核者身份审核 Commit `[COMMIT_SHA]`。

开始前完整阅读 `AGENTS.md` 和
`docs/development/AI_GIT_COLLABORATION_WORKFLOW.md`，然后检查 `pwd`、当前分支、
`git status --short --branch` 和 `git worktree list`。

如果当前 worktree 中没有规则文件，先执行 `git show origin/main:AGENTS.md` 和
`git show origin/main:docs/development/AI_GIT_COLLABORATION_WORKFLOW.md`。
远程容器仍找不到时，报告“当前分支和 origin/main 尚未包含规则文件”并停止 Git 写操作；
只有本地 Mac Agent 才能使用 iCloud 绝对路径兜底。不要自行改用旧规则。

本次不要修改文件，不要执行 commit、push、merge、cherry-pick、stash、reset 或清理操作。
只审核该 Commit 相对其父 Commit 的差异，重点检查：

1. 是否满足需求和验收标准；
2. 正确性、安全、权限、错误处理和边界条件；
3. 是否存在无关修改或回归风险；
4. 测试是否验证真实意图；
5. 文档与实现是否一致。

发现按 P0–P3 分级输出，每条包含文件、位置、证据、影响和最小修复建议。
没有阻塞问题时明确写 `Approved`，并列出仍未覆盖的验证。
```
