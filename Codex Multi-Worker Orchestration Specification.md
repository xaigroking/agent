# Codex Multi-Worker Orchestration Specification

## Version

**v0.1.0 Trial**

状态：实验性试用版本

目标：

让单个 Codex 主会话具备项目调度能力，通过自动启动多个 Codex CLI Worker 子进程，实现并行开发、测试、审查和问题处理。

---

# 1. 设计目标

## 当前问题

传统单 Codex 工作模式：

```
用户
 |
Codex
 |
分析
 |
写代码
 |
测试
 |
修复
 |
重复
```

存在：

* 单线程开发速度慢
* 一个任务阻塞全部流程
* 错误容易无限循环
* 缺少类似真实开发团队的角色分工

---

## v0.1.0 目标

实现：

```
             Main Codex
          (Orchestrator)

                  |
        Task Planning / Dispatch

                  |

    --------------------------------

    |              |              |

 Worker-1      Worker-2       Worker-3

 Backend       Frontend       Testing

    |              |              |

    --------------------------------

                  |

          Review / Merge

                  |

              Final Result
```

---

# 2. 角色定义

## 2.1 Main Codex（主控制进程）

角色：

Project Manager + Architect

职责：

* 阅读开发文档
* 分析需求
* 创建任务计划
* 分配 Worker
* 管理依赖关系
* 检查 Worker 输出
* 处理异常升级

禁止：

* 自己独占所有编码工作
* 替代所有 Worker
* 无限制执行低价值修复

---

## 2.2 Codex Worker（子进程）

角色：

Developer

职责：

* 接收明确任务
* 修改代码
* 执行测试
* 提交结果
* 返回结构化报告

Worker 不负责：

* 修改整体架构
* 改变项目规范
* 无限尝试失败方案

---

# 3. Worker 启动模型

Main Codex 根据任务生成 Worker：

例如：

```
Task:

开发用户认证模块


拆分：


Worker-A:
数据库模型


Worker-B:
Backend API


Worker-C:
Frontend Login UI


Worker-D:
Tests
```

每个 Worker：

必须拥有：

* 独立 CLI 进程
* 独立工作目录
* 独立 Git Branch

---

# 4. Workspace 隔离规则

禁止：

```
/project

多个 Worker 同时修改
```

原因：

* 文件冲突
* 状态污染
* 无法回滚

要求：

```
/workspace

 main

 worker-db/
 worker-api/
 worker-ui/
 worker-test/
```

---

# 5. Git 工作流

每个 Worker：

创建独立 Branch：

```
worker/api-auth
worker/frontend-login
worker/test-auth
```

完成后：

提交：

```
commit

push

create PR
```

Main Codex：

负责：

* Review
* 合并
* 冲突处理

---

# 6. Task Definition 格式

所有任务必须结构化。

示例：

```yaml
task_id: backend-auth-001

description:
  Implement authentication API

workspace:
  isolated: true

branch:
  worker/backend-auth

requirements:
  - REST API
  - JWT support
  - Unit tests

success_check:
  - tests_pass
  - api_available

retry_limit:
  3
```

---

# 7. Worker 执行规则

## Rule W001

禁止无限循环。

错误：

```
失败

↓

换一句 Prompt

↓

继续失败

↓

继续尝试
```

正确：

```
失败

↓

记录错误

↓

Retry Counter +1

↓

达到限制

↓

创建 Issue
```

---

# 8. Retry Policy

默认：

```
Normal Error:

Retry 3 times


Logic Error:

Retry 2 times


Dangerous Operation:

Retry 0
```

---

# 9. Issue 升级机制

以下情况必须创建 Issue：

* 同一个错误重复出现
* Worker 无法继续
* 环境状态未知
* 需要架构决策
* 需要权限提升

Issue 内容：

```yaml
title:

problem:

environment:

actions_attempted:

error_logs:

retry_count:

worker_analysis:

required_decision:
```

---

# 10. Supervisor Review

高级模型职责：

不是重新写全部代码。

只负责：

## Issue Review

输出：

```
Root Cause:

Reason:

Recommended Solution:

Next Action:
```

---

## PR Review

检查：

* 是否解决 Issue
* 是否符合架构
* 是否引入新问题
* 是否重复错误

发现问题：

直接：

```
PR Comment

Provide Fix Direction

Block Merge
```

---

# 11. 多 Worker 调度原则

允许：

并行：

```
Frontend

Backend

Tests

Documentation
```

禁止：

并行修改：

```
同一个核心文件

同一个数据库迁移

同一个配置文件
```

---

# 12. Main Codex 调度循环

标准流程：

```
Read Requirement

↓

Create Plan

↓

Generate Tasks

↓

Spawn Workers

↓

Monitor Status

↓

Collect Results

↓

Run Tests

↓

Review PR

↓

Merge

↓

Report
```

---

# 13. 状态反馈协议

Worker 返回：

```json
{
 "task_id":"api-auth-001",

 "status":"completed",

 "changes":[
   "auth.go",
   "jwt.go"
 ],

 "tests":{
   "passed":20,
   "failed":0
 },

 "issues":[]
}
```

失败：

```json
{
 "status":"blocked",

 "reason":
 "Database schema conflict",

 "issue_required":true
}
```

---

# 14. 安全限制

Worker 默认：

```
No production access

No destructive command

No secret access
```

危险操作：

需要：

```
Main Codex approval

or

Human approval
```

---

# 15. v0.1.0 实现范围

支持：

* 单 Codex 主控
* 多 CLI Worker
* 并行任务
* Git 分支隔离
* PR Review
* Issue 升级
* Retry 限制

不承诺：

* 自动替代完整软件团队
* 自动完成所有架构决策
* 无人工监督生产部署

---

# 16. 核心原则

```
Main Codex plans.

Workers execute.

Issues escalate.

Retries are limited.

Branches isolate.

Reviews protect quality.

No infinite loops.
```

---

# End

Codex Multi-Worker Orchestration Specification

Version 0.1.0 Trial
