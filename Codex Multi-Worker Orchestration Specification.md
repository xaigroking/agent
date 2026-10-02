# Codex Multi-Worker Orchestration Specification

> 多 Worker 编码 Agent 调度规范，适用于 Codex CLI、Claude Code、Gemini CLI 及同类 CLI 工具。
> 文件名沿用 v0.1.0。

## Version

**v0.2.0 Trial**

状态：实验性试用版本（v0.1.0 勘误修订版，勘误清单见附录 A）

目标：

让一个"主控"调度多个编码 Agent Worker 并行开发、测试和审查，同时保证隔离、可控、可回滚。

治理规则（错误分类、重试上限、Issue 升级、Supervisor 规则、权限）以《双模型 Agent 协作治理规范》v0.2.0 为准，本文只描述多 Worker 调度的实现。

> 已核对版本：Codex CLI 0.160.0、Claude Code 2.1.287、Gemini CLI 0.62.0（2026-10）。CLI 参数变化很快，落地前用 `--help` 复核。

---

# 1. 设计目标

## 当前问题

传统单 Agent 工作模式：

```
用户 → Agent → 分析 → 写代码 → 测试 → 修复 → 重复
```

存在：

* 单线程开发速度慢
* 一个任务阻塞全部流程
* 错误容易无限循环
* 缺少类似真实开发团队的角色分工

## v0.2.0 目标

```
                 Orchestrator
       （确定性脚本，或主会话 + 原生子代理）
                      |
          Planner（高级模型）：拆分任务 + 接口契约
                      |
        ---------------------------------
        |               |               |
    Worker-1        Worker-2        Worker-3
  （worktree A）   （worktree B）   （worktree C）
        |               |               |
        ---------------------------------
                      |
        Orchestrator 独立校验（构建 / 测试）
                      |
        集成分支合并 → Reviewer（高级模型，最好跨厂商）
                      |
                  Human Merge
```

---

# 2. 实现模式（v0.1.0 的核心问题在这里）

v0.1.0 设想"主 Codex 会话通过 shell 自动启动多个 Codex CLI 子进程"。**不推荐这样做**，原因：

1. **沙箱冲突**：主会话一般运行在 `workspace-write` 沙箱中，该沙箱默认无网络（`sandbox_workspace_write.network_access = false`），`$CODEX_HOME`（`~/.codex`）也不在可写根内，子进程既调用不了模型 API，也写不了会话文件。要让它跑起来只能给主会话 `danger-full-access`，等于放弃隔离。
2. **无法监控**：shell 工具调用要么阻塞到子进程结束（并受工具超时限制），要么后台运行后没有完成通知，只能让主模型反复轮询，持续消耗 token。
3. **审批无法转发**：`codex exec` 没有交互式审批，需要审批的操作会直接失败并把失败返回给模型。v0.1.0 写的"Main Codex approval"在这个架构里不存在。
4. **计数仍在模型脑子里**：重试次数、预算、并发数由主模型自己记，和单 Agent 一样不可靠。

在 Claude Code 中用 Bash 嵌套调用 `claude -p` 也有同样的问题。

正确做法是二选一：

## 模式 A：原生子代理（交互式、小规模）

由 CLI 内置的多代理能力负责派生、隔离和回收 Worker，适合人在旁边看着的会话。

**Claude Code**

在 `.claude/agents/` 中定义 Worker 子代理，主会话通过 Agent 工具派发，可在后台并行运行：

```markdown
---
name: backend-worker
description: 按任务卡实现后端改动并运行测试，完成后输出结构化报告
tools: Read, Edit, Write, Grep, Glob, Bash
model: sonnet
isolation: worktree
maxTurns: 40
---
你是 Worker。只修改任务卡 owned_paths 内的文件……
```

* `isolation: worktree`：每个子代理在独立 git worktree 中工作
* `model`：Worker 用低成本模型，主会话用高级模型
* 子代理不能再派生子代理，层级天然只有一层
* 权限规则、`PreToolUse` Hook 对子代理同样生效；可用 `SubagentStop` Hook 在子代理结束时做校验
* 另有 `claude --bg`（后台会话，`claude agents` 查看）和实验性的 Agent Teams（`CLAUDE_CODE_EXPERIMENTAL_AGENT_TEAMS`）

**Codex CLI**

`multi_agent` 特性（0.160.0 中为 stable 且默认开启，用 `codex features list` 确认）为主会话提供 `spawn_agent` / `send_input` / `wait_agent` / `close_agent` 工具。在 `config.toml` 的 `[agents]` 中限制：

```toml
[agents]
max_concurrent_threads_per_session = 3   # 并发 Worker 上限
max_depth = 1                            # 禁止 Worker 再派生 Worker
default_subagent_model = "<低成本模型>"
job_max_runtime_seconds = 1800           # 单个子代理最长运行时间
```

配置项名称以当前版本官方配置文档为准。worktree 隔离可用 `codex --worktree` / `codex exec --worktree`。

**Gemini CLI**

支持 `-w/--worktree` 启动独立 worktree 会话，以及 hooks、Policy Engine。多代理能力仍在演进中，生产使用建议走模式 B。

模式 A 的局限：重试计数、预算汇总、Issue 创建仍依赖主模型自觉，所以只适合有人值守的场景。

## 模式 B：外部确定性编排器（推荐，无人值守 / CI）

Orchestrator 是普通程序，按任务 DAG 为每个 Worker 创建 worktree，然后启动**独立的 CLI 进程**。它负责计数、超时、预算、校验、git 和 Issue，模型只负责"想"和"写代码"。这也是治理规范要求的形态。

Worker 可以混用不同厂商的 CLI，见第 8 节。

---

# 3. 角色定义

## 3.1 Orchestrator（编排器）

模式 B 中是脚本，模式 A 中由主会话兼任。

职责：

* 调用 Planner 生成任务 DAG
* 创建 worktree / 分支，安装依赖
* 按依赖关系和并发上限启动 Worker
* 收集结构化报告，**独立运行** `success_check`
* 在 Worker 分支上提交，合并到集成分支，处理机械冲突
* 创建 Issue / PR，触发 Reviewer
* 维护所有计数器与预算

禁止：

* 自己写业务代码（模式 A 的主会话同样适用）
* 跳过独立校验，直接采信 Worker 报告

## 3.2 Planner（高级模型，一次性调用）

* 阅读需求和代码库
* 输出任务 DAG（`depends_on`）、每个任务的 `owned_paths`
* **先产出接口契约**（API Schema、数据模型、函数签名），再拆分可并行的实现任务

Planner 只读运行（Claude Code `--permission-mode plan`；Codex `--sandbox read-only`），输出受 JSON Schema 约束。

## 3.3 Worker（低成本模型）

职责：

* 接收单个任务卡
* 只修改 `owned_paths` 内的文件
* 在沙箱内运行构建与测试
* 输出结构化报告

Worker 不负责：

* 修改整体架构、接口契约、项目规范
* `git commit` / `push`、创建 PR / Issue
* 修改 `owned_paths` 以外的文件（需要改时报告 `needs_decision`）
* 无限尝试失败方案

## 3.4 Reviewer / Supervisor（高级模型）

即治理规范中的 Supervisor。v0.1.0 第 5 节说"Main Codex 负责 Review"，第 10 节又说"高级模型负责 Review"，职责重叠。v0.2.0 规定：

* Orchestrator 只做**机械检查**（构建、测试、冲突、owned_paths 是否越界）
* Reviewer 做**语义审查**（是否解决问题、是否符合契约、是否引入风险），只读运行
* Reviewer 最好与 Worker 使用不同厂商或不同模型，避免同源偏差

---

# 4. 任务拆分：DAG + 契约优先

v0.1.0 的示例把"数据库模型 / Backend API / Frontend UI / Tests"作为 4 个并行任务。它们彼此依赖：API 依赖数据模型，UI 依赖 API，测试依赖接口。没有契约时并行开发，最后基本都会在集成阶段失败。

修订后的示例：

```
Task: 开发用户认证模块

Phase 0（Planner，串行）
  contract-auth：确定 OpenAPI 片段、User 数据模型、JWT 载荷格式
                 → 产出 docs/contracts/auth.yaml，人工或 Reviewer 确认

Phase 1（并行，依赖 contract-auth）
  Worker-A  db-user-model      owned: migrations/, internal/model/user*
  Worker-B  api-auth           owned: internal/auth/, cmd/api/routes_auth*   （按契约 mock 数据层）
  Worker-C  ui-login           owned: web/src/pages/login/, web/src/api/auth*（按契约 mock API）
  Worker-D  contract-tests     owned: tests/contract/auth/                    （只依赖契约）

Phase 2（串行）
  integrate-auth：Orchestrator 合并到集成分支 → 运行全量测试
  失败时按失败位置派回对应 Worker，或升级 Issue
```

---

# 5. Workspace 隔离

禁止多个 Worker 同时修改同一个工作目录。

使用 **git worktree**（比完整 clone 节省磁盘，且共享对象库）：

```bash
git fetch origin
git worktree add -b worker/api-auth   .worktrees/api-auth   origin/main
git worktree add -b worker/ui-login   .worktrees/ui-login   origin/main
```

```
repo/
  .worktrees/
    db-user-model/
    api-auth/
    ui-login/
    contract-tests/
```

注意事项（v0.1.0 未提及）：

* 把 `.worktrees/` 加入 `.gitignore`，避免主工作区把它当成未跟踪文件
* 同一分支不能同时检出到两个 worktree
* 每个 worktree 需要各自安装依赖（`node_modules`、venv 等）。Worker 沙箱通常没有网络，应由 Orchestrator 在启动 Worker **之前**安装好
* 并行测试会争用资源：给每个 Worker 分配独立的端口、数据库名、容器名（通过环境变量传入，如 `PORT=31xx`、`DB_NAME=test_api_auth`）
* worktree 的 git 元数据位于主仓库的 `.git/worktrees/<name>`，在 worktree 之外。Codex `workspace-write` 等沙箱内执行 `git commit` 可能因不可写而失败，这也是 Worker 不做 git 写操作的原因之一
* 完成后由 Orchestrator 执行 `git worktree remove` 清理

---

# 6. Git 工作流

```
Worker 修改文件（不提交）
   ↓
Orchestrator 独立校验通过
   ↓
Orchestrator 在 worker/<task> 分支提交（commit message 引用 task_id）
   ↓
Orchestrator 合并到 integration/<feature> 集成分支，运行全量测试
   ↓
Orchestrator 推送并创建 PR（integration → main）
   ↓
Reviewer 审查 → Human 合并
```

规则：

* Worker 不持有 push 凭据，也不需要网络
* Orchestrator 只自动处理"互不重叠文件"的合并；出现文本冲突时不让模型猜，派回相关 Worker 或升级 Issue
* `main` / 受保护分支只由 Human 合并

---

# 7. Task Definition 格式

```yaml
task_id: api-auth-001
phase: 1
depends_on: [contract-auth]

description: |
  按 docs/contracts/auth.yaml 实现 /login、/refresh 接口，数据层使用接口 mock。

contract_refs:
  - docs/contracts/auth.yaml

workspace:
  worktree: .worktrees/api-auth
  branch: worker/api-auth
  env:
    PORT: "3102"
    DB_NAME: test_api_auth

owned_paths:            # 只允许修改这些路径；Orchestrator 校验 diff 是否越界
  - internal/auth/**
  - cmd/api/routes_auth.go

worker:
  cli: codex            # codex / claude / gemini
  model: <低成本模型>

requirements:
  - REST API
  - JWT support
  - Unit tests

success_check:          # 由 Orchestrator 在 worktree 中执行，以退出码为准
  - go build ./...
  - go test ./internal/auth/...
  - go vet ./internal/auth/...

limits:                 # 与治理规范第 4 节对应
  max_attempts: 3       # 进程级：最多启动 Worker 3 次
  max_turns: 40         # 会话级（支持的 CLI）
  timeout_minutes: 30
  max_budget_usd: 3
  same_error_limit: 2   # 相同错误签名出现 2 次即升级
```

v0.1.0 的单一 `retry_limit` 与第 8 节分类重试策略互相矛盾；v0.2.0 统一按错误类别执行（见第 9 节），`limits` 只是上限。

---

# 8. Worker 启动方式（模式 B）

同一份任务卡、同一个报告 Schema，可以交给不同 CLI 执行。

**Codex CLI**

```bash
timeout 30m codex exec \
  --cd .worktrees/api-auth \
  --sandbox workspace-write \
  -m "<低成本模型>" \
  --output-schema schemas/worker-report.schema.json \
  -o runs/api-auth-001/report.json \
  --json \
  "$(cat tasks/api-auth-001.md)" > runs/api-auth-001/events.jsonl
```

* 会话 ID 从 JSONL 事件流中读取；继续执行用 `codex exec resume <SESSION_ID> "<指导>"`
* `workspace-write` 默认无网络、可写范围仅限 `--cd` 目录（另需可写目录用 `--add-dir`）

**Claude Code**

```bash
cd .worktrees/api-auth && timeout 30m claude -p "$(cat ../../tasks/api-auth-001.md)" \
  --model sonnet \
  --permission-mode acceptEdits \
  --permission-prompts none \
  --allowedTools "Bash(go build *) Bash(go test *) Bash(go vet *) Bash(git diff *) Bash(git status)" \
  --disallowedTools "Bash(git push *) Bash(git commit *) Bash(rm -rf *)" \
  --max-turns 40 --max-budget-usd 3 \
  --output-format json \
  --json-schema "$(cat ../../schemas/worker-report.schema.json)" \
  > ../../runs/api-auth-001/result.json
```

* `--permission-prompts none`：无人值守时，需要确认的操作直接拒绝，不会挂起
* JSON 结果中包含 `session_id`；继续执行用 `claude -p --resume <session_id> "<指导>"`
* 也可以直接用 `claude -w <name>` 让 Claude Code 自己创建 worktree

**Gemini CLI**

```bash
cd .worktrees/api-auth && timeout 30m gemini -p "$(cat ../../tasks/api-auth-001.md)" \
  -m "<flash 类模型>" \
  --approval-mode auto_edit \
  --sandbox \
  --policy policies/worker.toml \
  --output-format json > ../../runs/api-auth-001/result.json
```

* 报告 Schema 由 Orchestrator 自行校验
* 会话轮数上限在 `.gemini/settings.json` 的 `model.maxSessionTurns` 中设置

**禁止**在 Worker 上使用 `--dangerously-bypass-approvals-and-sandbox`、`--dangerously-skip-permissions`、`--yolo`，除非整台机器 / 容器本身就是一次性外部沙箱且没有凭据。

---

# 9. Worker 执行规则与重试策略

## Rule W001：禁止无限循环（由 Harness 强制）

```
失败
↓
Orchestrator 记录错误签名（命令 + 归一化错误信息）
↓
按错误类别决定：重试 / 带指导重试 / 升级
↓
达到任一上限（attempts / turns / timeout / budget / same_error）
↓
停止，创建 Issue
```

"换一句 Prompt 继续试"同样计入 `max_attempts`。

## Retry Policy

| 类别 | 例子 | 进程级重试 |
|---|---|---|
| E1 瞬时 | 依赖源超时、429、5xx | 指数退避，最多 3 次 |
| E2 确定性 | 编译 / 测试失败、配置错误 | 带上次错误摘要重试，最多 2 次；相同错误签名出现 2 次即升级 |
| E3 权限 / 环境 | 沙箱拒绝、Permission denied、缺凭据 | 0 次，立即升级 |
| E4 状态未知 | 校验结果与报告不一致 | 0 次，立即升级 |
| 高风险操作 | 迁移生产库、删除资源、部署 | 不由 Worker 执行；执行前即被权限 / 沙箱拒绝 |

会话内的重复命令拦截（Hook）见治理规范 W-001。

---

# 10. 状态反馈协议

Worker 报告必须符合 Schema（由 `--output-schema` / `--json-schema` 强制）。成功和失败用**同一个 Schema**（v0.1.0 的失败示例缺少 `task_id`，无法关联任务）。

`schemas/worker-report.schema.json`：

```json
{
  "type": "object",
  "additionalProperties": false,
  "required": ["task_id", "status", "changes", "verification_claims", "blocking_reason", "error_class", "suggestion"],
  "properties": {
    "task_id":   { "type": "string" },
    "status":    { "type": "string", "enum": ["completed", "blocked", "needs_decision"] },
    "changes":   { "type": "array", "items": { "type": "string" } },
    "verification_claims": {
      "type": "array",
      "items": { "type": "string" },
      "description": "Worker 声称已运行的检查，仅供参考，Orchestrator 会重新执行"
    },
    "blocking_reason": { "type": ["string", "null"] },
    "error_class":     { "type": ["string", "null"], "enum": ["E1", "E2", "E3", "E4", "high_risk", null] },
    "suggestion":      { "type": ["string", "null"] }
  }
}
```

示例：

```json
{
  "task_id": "api-auth-001",
  "status": "completed",
  "changes": ["internal/auth/handler.go", "internal/auth/jwt.go"],
  "verification_claims": ["go test ./internal/auth/... passed"],
  "blocking_reason": null,
  "error_class": null,
  "suggestion": null
}
```

```json
{
  "task_id": "db-user-model-001",
  "status": "blocked",
  "changes": [],
  "verification_claims": [],
  "blocking_reason": "契约中 users.email 要求唯一，但现有迁移 0007 已有重复数据",
  "error_class": "E4",
  "suggestion": "需要决策：清洗数据或放宽约束"
}
```

v0.1.0 中 `"tests": {"passed": 20}` 这类由 Worker 自报的结果不作为判定依据。Orchestrator 以自己运行 `success_check` 的退出码为准，并检查：

* `git diff --name-only` 是否全部落在 `owned_paths` 内
* `changes` 与实际 diff 是否一致
* 是否删除 / 跳过了测试

---

# 11. Issue 升级机制

以下情况由 Orchestrator 创建 Issue（Worker 只在报告中提出）：

* 达到任一上限
* 同一错误签名重复出现
* `status = blocked / needs_decision`
* 独立校验结果与 Worker 报告不一致
* 需要修改 `owned_paths` 之外的文件或接口契约
* 需要架构决策或权限提升

Issue 内容：

```yaml
issue_id:
task_id:
title:
problem:
error_class:
environment:          # worktree、分支、CLI 及版本、模型
actions_attempted:    # 来自事件流
error_logs:
attempt_count:
worker_report:        # 原始结构化报告
worker_session_id:
diff_summary:
required_decision:
supervisor_rounds: 0
```

后续处理（Supervisor 分析、回合上限、resume 或新会话）按治理规范第 7 节执行。

---

# 12. Review

## Orchestrator 机械检查

* 构建、测试、lint 通过
* diff 不越过 `owned_paths`
* 没有删除测试或降低检查门槛
* 集成分支全量测试通过

## Reviewer 语义审查

只读运行，输出结构化结论：

```
Root Cause / Findings:
Evidence:            # 文件与行号
Recommended Fix:
Next Action:
Decision:            # approve / request_changes / need_human
```

检查：

* 是否解决 Issue / 满足任务卡
* 是否符合接口契约和架构
* 是否引入新问题或安全风险
* 是否重复了 Issue 中记录的错误

可用工具：`codex exec review --base main`；Claude Code `claude -p "<review prompt>" --permission-mode plan`；GitHub 上可用 `openai/codex-action`、`anthropics/claude-code-action` 在 PR 事件上触发。

发现问题时，Orchestrator 根据结论：

```
PR Comment（附 Reviewer 结论）
Provide Fix Direction（派回对应 Worker，回合数 +1）
Block Merge（Request changes / 必需检查失败）
```

---

# 13. 多 Worker 调度原则

允许并行（前提：契约已确定、`owned_paths` 不重叠）：

```
Frontend
Backend
Tests
Documentation
```

禁止并行修改：

```
同一个文件（以 owned_paths 冲突检测强制，而不是靠约定）
同一个数据库迁移序列（迁移编号会冲突，集中到一个任务）
同一个全局配置文件
依赖清单与锁文件（package.json / package-lock.json / go.mod / go.sum 等，集中由一个任务或 Orchestrator 修改）
接口契约文件（只能由 Planner 修改）
```

并发上限：

* 默认同时运行 3 个 Worker，受模型 API 限流、本机 CPU / 内存、费用预算约束
* 模式 A 中用 `[agents] max_concurrent_threads_per_session`（Codex）等配置限制

---

# 14. 调度循环

```
Read Requirement
↓
Planner：契约 + 任务 DAG + owned_paths
↓
人工 / Reviewer 确认契约
↓
为就绪任务创建 worktree、安装依赖
↓
Spawn Workers（≤ 并发上限）
↓
等待进程退出（超时即终止）
↓
解析报告 → 独立校验 → 越界检查
↓
  通过：提交到 worker 分支，标记完成，解锁下游任务
  失败：按 Retry Policy 重试或创建 Issue
↓
全部完成：合并到集成分支 → 全量测试
↓
创建 PR → Reviewer → Human Merge
↓
清理 worktree，输出报告（任务结果、尝试次数、费用、Issue 列表）
```

---

# 15. 安全限制

Worker 默认：

```
仅 worktree 可写
无网络（依赖由 Orchestrator 预装）
无凭据、无生产访问
不能执行 git push / commit
不能执行破坏性命令（权限 deny 规则 / 沙箱 / Hook 在执行前拦截）
```

危险操作：

```
不由 Worker 执行。
Worker 报告 needs_decision → Orchestrator 创建 Issue → Human 审批后，
由 Human 或专门的受控流程执行。
```

（v0.1.0 中的"Main Codex approval"在 `codex exec` 子进程架构下没有对应机制，已删除。）

Issue / PR 文本可能含提示词注入，Reviewer 与 Planner 仅以只读权限处理。

---

# 16. v0.2.0 实现范围

支持：

* 模式 A：原生子代理（Claude Code 子代理 / Codex multi_agent）
* 模式 B：外部编排器 + 多 CLI Worker（Codex / Claude Code / Gemini CLI 可混用）
* git worktree 隔离、owned_paths 冲突控制
* 契约优先的任务 DAG
* 结构化报告与独立校验
* 分类重试与 Issue 升级
* 集成分支 + PR Review

不承诺：

* 自动替代完整软件团队
* 自动完成所有架构决策
* 无人工监督的生产部署

---

# 17. 核心原则

```
Orchestrator enforces.

Planner defines contracts.

Workers execute in isolation.

Success is verified, not reported.

Issues escalate.

Retries are limited by the harness.

Worktrees isolate; owned paths prevent collisions.

Reviews protect quality.

No infinite loops.
```

---

# 附录 A：v0.1.0 勘误

| # | v0.1.0 内容 | 问题 | v0.2.0 修订 |
|---|---|---|---|
| 1 | 主 Codex 会话通过 shell 启动多个 Codex CLI 子进程 | 沙箱默认无网络、`$CODEX_HOME` 不可写；无法监控子进程；审批不能转发；计数依赖模型 | 第 2 节：模式 A 原生子代理 或 模式 B 外部编排器 |
| 2 | 只针对 Codex | 用户需要支持多家 CLI | 第 2、8 节给出 Codex / Claude Code / Gemini CLI 的对应做法 |
| 3 | DB / API / UI / Tests 四个任务直接并行 | 任务间有依赖，无契约并行必然集成失败 | 第 4 节：契约优先 + DAG `depends_on` |
| 4 | "独立工作目录"未说明实现 | clone 浪费且难同步；未考虑依赖、端口、DB 冲突 | 第 5 节：git worktree + 依赖预装 + 资源隔离 |
| 5 | Worker 自行 commit / push / 创建 PR | 需要凭据和网络，违背第 14 节安全限制；worktree 元数据在沙箱外 | 第 6 节：由 Orchestrator 完成 git 写操作 |
| 6 | Main Codex 与 Supervisor 都负责 Review | 职责重叠 | 第 3 节：Orchestrator 机械检查，Reviewer 语义审查 |
| 7 | `retry_limit: 3` 与分类重试策略并存 | 互相矛盾 | 第 7、9 节：`limits` 为上限，按类别执行 |
| 8 | 失败 JSON 缺 `task_id`，成功 / 失败格式不同 | 无法关联、无法校验 | 第 10 节：统一 JSON Schema，由 CLI 强制 |
| 9 | Worker 自报 `tests.passed` | 自述不可信 | Orchestrator 独立运行 `success_check` 并检查越界 |
| 10 | "Main Codex approval"处理危险操作 | `codex exec` 无交互式审批，该机制不存在 | 危险操作执行前拦截，Human 审批 |
| 11 | 并行禁止规则靠约定 | 无法强制；遗漏锁文件、契约文件 | `owned_paths` 冲突检测；锁文件、迁移、契约集中修改 |
| 12 | 未设置并发上限 | 触发限流、费用失控 | 默认 3 个并发，可配置 |

# End

Codex Multi-Worker Orchestration Specification

Version 0.2.0 Trial
