# 双模型 Agent 协作治理规范

## Version

**v0.2.0 - Trial**

状态：试用设计稿（v0.1.0 勘误修订版，勘误清单见附录 A）

适用对象：Claude Code、OpenAI Codex CLI、Gemini CLI 以及同类终端编码 Agent（Cursor CLI、GitHub Copilot CLI、Qwen Code、OpenCode 等）。

目标：建立低成本、高可靠性的双模型 Agent 协作机制，通过执行模型与监督模型职责分离，降低无限重试、错误扩散和自动化失控风险。

配套文档：《Codex Multi-Worker Orchestration Specification》（多 Worker 并行调度的具体实现）。

---

# 0. 最重要的一条：规则必须由 Harness 强制，而不是由模型自觉遵守

v0.1.0 把"维护重试计数""禁止无限重试""禁止绕过限制"写成了 Worker 模型的义务。这在实践中不成立：

* LLM 无法可靠地自我计数，换一种写法重试同一件事时它并不认为是"重试"
* 上下文被压缩（compaction）后，计数和约束会丢失
* 模型越想"完成任务"，越倾向于绕过限制（`sudo`、`chmod 777`、`--no-verify`、删掉失败的测试）

因此本规范把每条规则都落到 **三层强制机制** 上，提示词（Prompt / `CLAUDE.md` / `AGENTS.md` / `GEMINI.md`）只作为第四层补充：

| 层 | 作用 | Claude Code | Codex CLI | Gemini CLI |
|---|---|---|---|---|
| 1. 外部编排器（Orchestrator） | 进程级重试计数、超时、预算、Issue 创建、状态校验 | 脚本调用 `claude -p` | 脚本调用 `codex exec` | 脚本调用 `gemini -p` |
| 2. 会话级上限 | 单次会话的轮数 / 花费 / 时长 | `--max-turns`、`--max-budget-usd` | 外部 `timeout`；`[agents] job_max_runtime_seconds`（子代理） | `model.maxSessionTurns`（settings.json） |
| 3. 执行前拦截（权限 / 沙箱 / Hook） | 危险操作在执行**前**被拒绝 | `permissions.deny/ask`、`PreToolUse` Hook（exit 2 拦截）、`--permission-prompts none` | `--sandbox`、execpolicy `.rules`、Hooks（`PreToolUse` 等） | `--approval-mode`、Policy Engine（`--policy`）、`gemini hooks` |
| 4. 提示词 | 告知规则和输出格式 | `CLAUDE.md`、`--append-system-prompt` | `AGENTS.md` | `GEMINI.md` |

> 已核对版本：Claude Code 2.1.287、Codex CLI 0.160.0、Gemini CLI 0.62.0（2026-10）。CLI 参数变化很快，落地前用 `--help` 复核。

---

# 1. 背景

当前 Agent 自动化系统普遍存在以下问题：

* 执行任务失败后无限重复尝试
* 同类错误反复出现但没有升级处理
* 小模型为了完成任务不断修改方案，导致状态污染
* 高级模型被迫承担所有执行成本
* 缺少明确的问题升级和人工介入流程
* 规则只写在提示词里，没有任何机制保证执行

本方案采用：

> Cheap Worker Agent + Advanced Supervisor Agent + 确定性 Orchestrator

核心原则：

* 低成本模型负责执行
* 高能力模型负责问题治理
* **计数、预算、权限、状态校验由确定性程序负责，不交给模型**
* 错误必须升级，不允许无限循环（包括 Worker ↔ Supervisor 之间的循环）
* 所有异常必须形成可追踪 Issue

---

# 2. 系统角色定义

## 2.1 Orchestrator（编排器，确定性程序）

v0.1.0 缺失的角色。它是一个普通脚本 / 服务（Shell、Python、Node、CI Workflow 均可），**不是 LLM**。

职责：

* 启动 Worker / Supervisor 的 CLI 进程，并传入模型、权限、上限参数
* 维护重试计数、超时、预算
* 解析 Worker 的结构化输出（JSON Schema 约束）
* 独立执行状态校验（重新跑测试、探活），不信任 Worker 的自述
* 创建 / 更新 / 关闭 Issue，提交 commit、push、创建 PR（凭据只在这一层）
* 触发 Supervisor，并把 Supervisor 的结论回传给 Worker

## 2.2 Worker Agent（执行模型）

定位：负责具体任务执行的低成本 Agent。

模型选择示例：Claude Code `--model sonnet` / `--model haiku`；Codex `-m <较小模型>` 或 `-c model_reasoning_effort="low"`；Gemini `-m <flash 类模型>`。

职责：

* 阅读代码、修改代码
* 在沙箱内运行构建和测试
* 收集执行结果
* 按 JSON Schema 输出结构化报告（成功 / 阻塞 / 需要决策）

Worker 不负责：

* 制定长期解决策略、判断系统架构方向
* 生产部署、数据库变更、权限变更（v0.1.0 把"执行部署"列为 Worker 职责，与其高风险规则自相矛盾，已移除）
* 创建 Issue / PR、push 代码（需要凭据和网络，交给 Orchestrator）
* 绕过权限或沙箱限制

## 2.3 Supervisor Agent（高级模型）

定位：负责异常分析、方案提供和代码审查。按事件**被触发**运行，不是常驻进程。

模型选择示例：Claude Code `--model opus`；Codex 使用更强模型或 `model_reasoning_effort="high"`；也可以**跨厂商**（Worker 用 Codex，Supervisor 用 Claude Code，反之亦然），以降低"同一模型犯同一类错误又看不出来"的相关性。

职责：

* 分析升级上来的 Issue，给出根因和下一步
* Review Worker 的 PR
* 判断是否需要人工介入
* 确认问题解决后建议关闭 Issue

Supervisor 默认**只读**：只读代码、日志、diff，输出结构化结论；写 Issue 评论、阻止合并等动作由 Orchestrator 根据其结论执行。

Supervisor 不负责：

* 替代 Worker 执行所有命令
* 高频参与正常任务流程
* 直接修改生产环境

## 2.4 Human（人工）

* 审批高风险操作
* 处理 Supervisor 无法解决或循环超限的 Issue
* 最终合并到受保护分支

---

# 3. 总体工作流程

```
User Request
     |
     v
Orchestrator ──启动──> Worker CLI 进程（受限权限 / 沙箱 / 轮数与预算上限）
     |                        |
     |<──── 结构化报告 ────────+
     |
     v
独立状态校验（Orchestrator 自己跑测试 / 探活）
     |
     +── 通过 ──────────────> 提交 / PR ──> Supervisor PR Review ──> Human Merge
     |
     +── 失败 / blocked
             |
             v
       错误分类（见第 4 节）
             |
     +-------+-----------------+
     |                         |
 允许重试且未超限          超限 / 不可重试 / 高风险
     |                         |
 回到 Worker               创建 Issue（含 session_id）
                               |
                               v
                     Supervisor（被事件触发，只读分析）
                               |
              +----------------+----------------+
              |                |                |
       retry_with_guidance   need_human       close
              |                |
   Worker 携带指导重新执行   人工处理
   （Supervisor 回合数 +1，超过上限强制 need_human）
```

---

# 4. 错误分类与重试规则

v0.1.0 的问题：

* "权限错误"被归为可重试的逻辑错误 —— 重试权限错误只会诱导模型去绕过权限，必须立即升级
* "高风险错误（删除资源、生产操作）"不是错误，而是操作；等它"出错"后再建 Issue 已经晚了，必须在**执行前**拦截
* 对确定性错误"重试 3 次相同命令"没有意义，同样的输入只会得到同样的失败

修订后的分类：

| 类别 | 例子 | 处理 | 由谁强制 |
|---|---|---|---|
| E1 瞬时错误 | 网络超时、HTTP 429 / 5xx、依赖源暂不可用 | 指数退避重试，最多 3 次。注意：三家 CLI 自身已对模型 API 错误做重试，此处只针对任务层（如 `npm install` 超时） | Orchestrator |
| E2 确定性错误 | 编译失败、测试失败、参数 / 配置错误 | 允许"修复尝试"，每次必须改变假设；**相同命令 + 相同错误出现 2 次即升级**；总修复尝试 ≤ 3 | Hook 计数 + Orchestrator |
| E3 权限 / 环境错误 | Permission denied、沙箱拒绝、缺凭据、环境版本不匹配 | **0 次重试，立即升级**；禁止 `sudo`、`chmod -R 777`、`--no-verify`、关闭沙箱等绕过手段 | 权限规则 / 沙箱 + Orchestrator |
| E4 状态未知 | 结果与预期不一致、无法判断是否已生效 | 停止，立即升级 | Orchestrator |
| 高风险操作（非错误） | 删除资源、数据库迁移、生产部署、权限提升、`git push --force` | 执行前拦截，需 Human 审批；Worker 默认无此权限 | 权限 deny 规则 / 沙箱 / Hook |

## Rule W-001：禁止无限重试（Harness 强制）

三道上限同时生效，任意一道触发即停止：

1. **会话内上限**：轮数与预算

   ```bash
   # Claude Code
   claude -p "$TASK" --max-turns 40 --max-budget-usd 3 --output-format json ...
   # Codex（exec 无轮数参数，用外部超时）
   timeout 30m codex exec ...
   # Gemini CLI：在 .gemini/settings.json 中设置 model.maxSessionTurns
   ```

2. **会话内重复命令拦截**：Hook 统计"同一命令签名"的执行次数，超过阈值直接拒绝并告诉模型停止。Claude Code 示例：

   ```json
   // .claude/settings.json
   {
     "hooks": {
       "PreToolUse": [
         {
           "matcher": "Bash",
           "hooks": [
             { "type": "command", "command": "\"$CLAUDE_PROJECT_DIR\"/.claude/hooks/retry-guard.sh" }
           ]
         }
       ]
     }
   }
   ```

   ```bash
   #!/usr/bin/env bash
   # .claude/hooks/retry-guard.sh —— 同一会话内同一命令最多执行 3 次
   input=$(cat)
   sid=$(jq -r '.session_id' <<<"$input")
   cmd=$(jq -r '.tool_input.command' <<<"$input")
   dir="$CLAUDE_PROJECT_DIR/.agent/state/$sid"
   mkdir -p "$dir"
   key=$(printf '%s' "$cmd" | sha256sum | cut -c1-16)
   n=$(( $(cat "$dir/$key" 2>/dev/null || echo 0) + 1 ))
   echo "$n" > "$dir/$key"
   if [ "$n" -gt 3 ]; then
     echo "BLOCKED: '$cmd' 已执行 $((n-1)) 次。停止重试，输出 status=blocked 的报告。" >&2
     exit 2   # exit 2 = 拒绝本次工具调用，stderr 反馈给模型
   fi
   ```

   Codex CLI 与 Gemini CLI 也提供 `PreToolUse` 类 Hook（Codex 需通过 hook trust 信任该 Hook），可用同样思路实现。

3. **进程级上限**：Orchestrator 对同一 Task 启动 Worker 的次数计数（默认 3 次），超限后不再启动，直接建 Issue。

超过限制后，Orchestrator 必须：

* 停止该 Task
* 保存上下文：Worker 报告、日志、`git diff`、**会话 ID**（用于之后 resume）
* 创建 Issue
* 等待 Supervisor / Human

## Rule W-002：结构化输出

Worker 的最终输出必须符合 JSON Schema，由 CLI 强制校验，而不是"请用 JSON 回答"：

* Claude Code：`--output-format json --json-schema "$(cat worker-report.schema.json)"`
* Codex：`codex exec --output-schema worker-report.schema.json -o report.json`
* Gemini CLI：`--output-format json`（Schema 由 Orchestrator 校验）

Schema 至少包含：`task_id`、`status`（`completed` / `blocked` / `needs_decision`）、`error_class`（E1–E4）、`changes`、`verification_claims`、`blocking_reason`、`suggestion`。

---

# 5. Action 执行与状态校验

每个 Action 必须可追溯。不要求模型手写日志，直接使用 CLI 的事件流：

* Claude Code：`--output-format stream-json`（含每次工具调用与结果）+ `PostToolUse` / `PostToolUseFailure` Hook
* Codex：`codex exec --json`（JSONL 事件流）
* Gemini CLI：`--output-format stream-json`

Orchestrator 归档的每条记录包含：

```
Action ID / Session ID
Tool & Input（命令、文件）
Working Directory / Branch
Exit Code / Error Message
Attempt Count
Timestamp
```

## Rule V-001：执行成功 ≠ 任务完成

禁止：

```
命令 exit 0
↓
默认认为完成
```

也禁止：

```
Worker 报告 "tests passed: 20"
↓
直接采信
```

必须由 **Orchestrator 独立执行** Task 中定义的 `success_check`：

```
安装服务（错误）：
  apt install nginx      # exit 0 不代表服务可用

安装服务（正确）：
  nginx -t                                   # 配置有效
  curl -fsS http://localhost/ >/dev/null     # 服务可访问
  ss -ltn | grep -q ':80 '                   # 端口在监听
  # 有 systemd 的环境再用 systemctl is-active nginx；容器里通常没有 systemd

修改代码（正确）：
  Orchestrator 在 Worker 的工作目录重新运行构建、lint、测试，以退出码为准
```

---

# 6. Issue 管理规则

## Issue 存储

CLI Agent 没有内置的 Issue 系统，v0.1.0 未说明 Issue 存在哪里、由谁创建。修订为：

* 默认：Orchestrator 写入本地 `.agent/issues/<issue-id>.json`（无需凭据，离线可用）
* 可选：Orchestrator 用自己的凭据同步到 GitHub / GitLab / Jira（如 `gh issue create --label agent-escalation`）
* Worker 不直接创建 Issue（Codex 的 `workspace-write` 沙箱默认无网络，且 Worker 不应持有凭据）

## Issue 创建条件

* 达到第 4 节任意一道上限
* 出现 E3 / E4 类错误
* Worker 报告 `status=blocked` 或 `needs_decision`
* Orchestrator 独立校验失败且无法归类
* 需要执行高风险操作

## Issue 内容要求

```yaml
issue_id:
task_id:
title:
problem:
error_class:          # E1 / E2 / E3 / E4 / high_risk
environment:          # 分支、工作目录、CLI 及版本、模型
steps_executed:       # 来自事件流，不由模型回忆
error_logs:           # 截断后的原始日志
attempt_count:        # 会话内 / 进程级
current_state:        # git diff 摘要、校验结果
expected_state:
worker_suggestion:
worker_session_id:    # 用于 resume
supervisor_rounds: 0  # Supervisor 回合计数
```

---

# 7. Supervisor 工作规则

## Rule S-001：事件触发，只响应异常

CLI Agent 不是常驻服务，"监听 Issue"必须由外部事件触发：

* 本地：Orchestrator 在创建 Issue 后直接调用 Supervisor CLI
* GitHub：Workflow 监听 `issues: [labeled]`、`pull_request`，在 Action 中运行 Supervisor（如 `anthropics/claude-code-action`、`openai/codex-action`，或直接调用 CLI）

只响应：

* Issue Created（escalation）
* PR Review Request
* Security Event

## Rule S-002：只读分析 + 结构化结论

Supervisor 运行在只读模式：

```bash
# Claude Code
claude -p "$(cat issue.json)" --model opus --permission-mode plan \
  --output-format json --json-schema "$(cat supervisor-decision.schema.json)"

# Codex
codex exec --sandbox read-only --output-schema supervisor-decision.schema.json \
  -o decision.json "$(cat issue.json)"
```

输出（Schema 强制）：

```yaml
root_cause:
evidence:             # 引用的日志行 / 文件位置
solution_proposal:
required_action:      # 给 Worker 的具体下一步
risk_level:           # low / medium / high
decision:             # retry_with_guidance / reassign / need_human / close
```

Orchestrator 把结论写成 Issue 评论（对应 v0.1.0 的 S-003 回评格式）。

## Rule S-003：Worker 继续执行的方式

* Worker 上一会话只是信息不足 → resume 原会话并追加指导：
  `claude -p --resume <session_id> "<guidance>"`、`codex exec resume <session_id> "<guidance>"`、`gemini -p ... --resume <index|latest>`
* Worker 上一会话已经反复兜圈（状态污染）→ **开新会话**，只传入 Issue 摘要 + Supervisor 指导，不继承被污染的上下文

## Rule S-004：Supervisor 回合上限

v0.1.0 只限制了 Worker 重试，没有限制 Worker ↔ Supervisor 之间的往返，无限循环只是被移到了更高一层。

* 同一 Issue 的 `supervisor_rounds` 上限默认为 2
* 超限后 Orchestrator 强制 `decision=need_human`

## Rule S-005：基于证据关闭

Supervisor 只有在 Orchestrator 的独立校验通过（测试 / CI 绿、探活成功）后才能给出 `decision=close`。Orchestrator 关闭 Issue 并附上校验证据，禁止问题解决后长期保持 Open。

## Rule S-006：输入不可信

Issue 正文、PR 评论、日志均可能包含提示词注入内容（尤其是公开仓库）。Supervisor 只把它们当作数据；在 CI 中运行时只授予只读工具，且不把写权限 Token 暴露给 Agent 进程。

---

# 8. Pull Request Review 规则

Worker 完成且 Orchestrator 校验通过后，由 Orchestrator 提交并创建 PR（Worker 不持有 push 凭据）。

Supervisor 检查：

* 是否解决原 Issue
* 是否重复了 Issue 中已记录的错误
* 是否符合方案与架构
* 是否删除或弱化了测试、断言、类型检查来"变绿"
* 是否存在安全风险

可用工具：

* Codex：`codex exec review --base <base-branch>`
* Claude Code：`claude -p "Review the diff against <base>..." --permission-mode plan`，或在 GitHub 上用 `claude-code-action`
* 建议 Worker 与 Reviewer 使用不同厂商 / 不同模型

发现 `same mistake repeated`：

* Orchestrator 以 Supervisor 结论发 PR Comment，并设置阻止合并（Request changes / 必需检查失败）
* Issue 的 `supervisor_rounds` +1，适用 S-004 上限

合并到受保护分支由 Human 执行。

---

# 9. 成本控制原则

目标（按**花费**而不是调用次数统计）：

```
Worker      80–90% 的 token / 费用
Supervisor  10–20% 的 token / 费用
```

这是监控目标而非可保证的比例，靠以下手段实现：

* 每次 Worker 调用设置预算上限（Claude Code `--max-budget-usd`；其他 CLI 用超时 + 轮数）
* Supervisor 只在异常和 PR 时触发
* 汇总 CLI 输出中的用量字段（Claude Code JSON 结果中的费用 / 轮数；Codex JSONL 中的 token usage）

避免：

```
高级模型 = 永久在线执行机器人
```

---

# 10. 安全原则

## 最小权限

| 角色 | 文件 | 命令 | 网络 | 凭据 |
|---|---|---|---|---|
| Worker | 仅自己的工作目录可写 | 白名单（构建、测试、只读 git） | 默认关闭，按需放开包管理源 | 无 |
| Supervisor | 只读 | 只读 | 仅模型 API | 无 |
| Orchestrator | 仓库 | git / gh | 是 | Issue / PR 所需最小 Token |
| Human | — | break glass | — | 生产凭据 |

对应配置示例：

```json
// Claude Code：.claude/settings.json（Worker）
{
  "permissions": {
    "allow": ["Bash(npm test *)", "Bash(npm run build *)", "Bash(git diff *)", "Bash(git status)"],
    "deny":  ["Bash(git push *)", "Bash(rm -rf *)", "Bash(sudo *)", "Read(./.env)", "Read(./.env.*)", "Read(./secrets/**)"]
  }
}
```

无人值守运行时加 `--permission-prompts none`，使所有需要确认的操作被自动拒绝而不是挂起。

```bash
# Codex：Worker 用 workspace-write 沙箱（默认无网络）；Supervisor 用 read-only
codex exec --sandbox workspace-write ...
codex exec --sandbox read-only ...
```

禁止在非外部隔离环境中使用：`--dangerously-skip-permissions`（Claude Code）、`--dangerously-bypass-approvals-and-sandbox`（Codex）、`--yolo` / `--approval-mode yolo`（Gemini CLI）。

## 状态保护

所有修改都在独立分支 / git worktree 中进行，Worker 不直接改主分支；高风险操作必须：

* 事先审批
* 保存状态（快照、备份、迁移回滚脚本）
* 记录日志
* 可回滚

---

# 11. Metrics

指标必须可由 Orchestrator 从日志计算，不依赖主观评价：

## Worker Metrics

```
Task Success Rate         = 一次通过独立校验的 Task / 全部 Task
Average Attempt Count     = 平均进程级尝试次数
Escalation Rate           = 升级 Issue 数 / Task 数
Repeated Error Count      = 相同错误签名重复出现次数
Guard Block Count         = 被 Hook / 权限 / 沙箱拒绝的次数
Cost per Task
```

## Supervisor Metrics

```
Issue Resolution Time
Fix-after-Guidance Rate   = 按 Supervisor 指导后一次通过校验的比例（替代 v0.1.0 不可度量的 "Solution Accuracy"）
Human Escalation Rate     = need_human / 全部 Issue
Review Escape Rate        = 已通过 Review 但合并后被回滚 / 发现缺陷的 PR 比例（替代 "PR Review Quality"）
False Escalation Rate     = Supervisor 判定"无需升级"的 Issue 比例
```

---

# 12. v0.2.0 范围与限制

支持：

* Orchestrator + 双模型分工
* 三层强制的重试 / 预算 / 权限控制
* 结构化输出与独立状态校验
* Issue 升级与 Supervisor 回合上限
* PR Review 与基于证据的关闭

暂不支持：

* 自动架构重设计
* 自动权限调整
* 完全无人值守的生产部署

---

# 13. 核心原则总结

```
Orchestrator enforces.

Worker executes.

Supervisor judges.

Errors escalate.

Retries are limited — by the harness, not by promises.

Dangerous actions are blocked before they run.

Success is verified independently.

Issues are traceable.

No infinite loops — at any level.
```

---

# 附录 A：v0.1.0 勘误

| # | v0.1.0 内容 | 问题 | v0.2.0 修订 |
|---|---|---|---|
| 1 | Worker"必须维护 Retry Counter"、"禁止无限重试" | 只靠模型自觉，不可靠；上下文压缩后丢失 | 第 0 节三层强制；W-001 用 `--max-turns` / 预算 / 超时 + Hook + 进程级计数 |
| 2 | 权限错误归为"逻辑错误"，达到阈值才升级 | 重试权限错误会诱导绕过权限 | 归入 E3，0 次重试立即升级，明确禁止绕过手段 |
| 3 | 高风险操作作为"错误"，出错后建 Issue | 破坏性操作执行后再处理已经太晚 | 改为执行前拦截（deny 规则 / 沙箱 / Hook）+ 人工审批 |
| 4 | 重试 = 重复执行（`Retry 1/3 2/3 3/3`） | 确定性错误重复执行无意义 | E1 退避重试；E2 每次必须改变假设，相同命令 + 相同错误 2 次即升级 |
| 5 | Worker 职责包含"执行部署" | 与高风险规则矛盾 | 部署移出 Worker 职责 |
| 6 | Supervisor"监听 Issue" | CLI Agent 不是常驻服务，未说明触发方式 | S-001：Orchestrator 直接调用或 CI 事件触发 |
| 7 | Worker / Supervisor 创建 Issue、写评论 | 与"最小权限"冲突；沙箱默认无网络 | Issue / PR / 评论由 Orchestrator 执行；Agent 只输出结构化结论 |
| 8 | 只限制 Worker 重试 | Worker ↔ Supervisor 之间仍可无限往返 | S-004 Supervisor 回合上限，超限转人工 |
| 9 | "保存上下文"未定义 | 无法恢复执行 | 保存 session_id，按情况 resume 或开新会话 |
| 10 | 状态校验由 Worker 自己做 | 自述不可信 | V-001 由 Orchestrator 独立校验 |
| 11 | `systemctl status nginx` 作为校验 | 容器常无 systemd；`status` 不是可判定的断言 | 使用 `nginx -t`、`curl -f`、端口检查 |
| 12 | 未考虑提示词注入 | Issue / PR 文本可被外部控制 | S-006 输入不可信、Supervisor 只读 |
| 13 | Solution Accuracy / PR Review Quality 指标 | 无法度量 | 改为可从日志计算的指标 |
| 14 | 成本比例按"调用"表述 | 不可控、不可测 | 按费用统计，并设置预算上限 |

End.
