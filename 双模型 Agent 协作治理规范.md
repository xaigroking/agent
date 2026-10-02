# 双模型 Agent 协作治理规范

## Version

**v0.1.0 - Trial**

状态：试用设计稿

目标：建立低成本、高可靠性的双模型 Agent 协作机制，通过执行模型与监督模型职责分离，降低无限重试、错误扩散和自动化失控风险。

---

# 1. 背景

当前 Agent 自动化系统普遍存在以下问题：

* 执行任务失败后无限重复尝试
* 同类错误反复出现但没有升级处理
* 小模型为了完成任务不断修改方案，导致状态污染
* 高级模型被迫承担所有执行成本
* 缺少明确的问题升级和人工介入流程

本方案采用：

> Cheap Worker Agent + Advanced Supervisor Agent

双模型架构。

核心原则：

* 低成本模型负责执行
* 高能力模型负责问题治理
* 错误必须升级，不允许无限循环
* 所有异常必须形成可追踪 Issue

---

# 2. 系统角色定义

## 2.1 Worker Agent（执行模型）

定位：

> 负责具体任务执行的低成本 Agent。

职责：

* 执行 Action
* 调用工具
* 修改代码
* 执行部署
* 收集执行结果
* 更新任务状态

Worker Agent 不负责：

* 制定长期解决策略
* 判断系统架构方向
* 无限尝试修复
* 绕过失败限制

---

## 2.2 Supervisor Agent（高级模型）

定位：

> 负责 Issue 管理、异常分析和解决方案提供。

职责：

* 监听 Issue
* 创建工单
* 分析失败原因
* 提供解决方案
* Review Worker Action
* Review Pull Request
* 阻止错误循环
* 推动问题关闭

Supervisor Agent 不负责：

* 替代 Worker 执行所有命令
* 高频参与正常任务流程
* 重复执行低价值操作

---

# 3. 总体工作流程

```
User Request

      |
      v

Worker Agent

      |
      |
      +---- Action Success
      |
      |
      +---- Action Failed
                 |
                 v

          Error Counter

                 |
        ----------------
        |              |
        v              v

   Retry Allowed     Escalate

                        |
                        v

               Create Issue

                        |
                        v

              Supervisor Agent

                        |
                        v

             Solution / Review

                        |
                        v

              Worker Continue

```

---

# 4. Worker Agent 强制规则

## Rule W-001：禁止无限重试

Worker Agent 必须维护 Action Retry Counter。

示例：

```
Action:
install dependency

Retry:
1/3
2/3
3/3

STOP
```

超过限制后：

必须：

* 停止 Action
* 保存上下文
* 创建 Issue
* 等待 Supervisor 处理

禁止：

* 自动改变方向无限尝试
* 重复执行相同失败命令
* 隐藏失败状态

---

## Rule W-002：错误必须分类

错误类型：

### 可恢复错误

例如：

* 网络超时
* 临时服务不可用
* API rate limit

处理：

允许有限重试。

---

### 逻辑错误

例如：

* 配置错误
* 参数错误
* 权限错误
* 环境不匹配

处理：

达到阈值后必须升级。

---

### 高风险错误

例如：

* 删除资源
* 数据库修改
* 生产环境操作
* 权限提升

处理：

立即创建 Issue。

---

# 5. Action 执行规则

每个 Action 必须记录：

```
Action ID

Input

Command

Environment

Expected Result

Actual Result

Error Message

Retry Count

Timestamp

```

禁止：

```
执行成功
↓

默认认为完成
```

必须进行：

```
State Verification
```

例如：

安装服务：

错误：

```
apt install nginx
exit 0
```

正确：

```
systemctl status nginx

curl localhost

check service port
```

---

# 6. Issue 管理规则

## Issue 创建条件

以下情况必须创建 Issue：

* Action 重复失败达到阈值
* Worker 无法判断下一步
* 状态与预期不一致
* 出现高风险操作
* 环境异常

---

## Issue 内容要求

必须包含：

```
Title

Problem Description

Environment

Steps Executed

Error Logs

Attempt Count

Current State

Expected State

Worker Suggestion

```

---

# 7. Supervisor Agent 工作规则

## Rule S-001：只关注异常事件

Supervisor 不监听所有普通 Action。

只响应：

* Issue Created
* PR Review Request
* Action Failure Escalation
* Security Event

---

## Rule S-002：Issue 分析

Supervisor 必须：

1. 阅读完整上下文
2. 判断失败原因
3. 提供解决方案
4. 指导 Worker 下一步

输出：

```
Root Cause

Solution Proposal

Required Action

Risk Level

```

---

## Rule S-003：Issue 回评

Supervisor 必须在 Issue 中回复：

```
Analysis:

Root Cause:

Recommended Fix:

Next Action:

```

---

## Rule S-004：问题解决后提醒关闭

当验证问题解决：

Supervisor 创建：

```
Resolution Comment
```

提醒：

```
Issue can be closed.
```

禁止：

问题解决后长期保持 Open 状态。

---

# 8. Pull Request Review 规则

当 Worker 创建 PR：

Supervisor 必须检查：

* 是否解决原 Issue
* 是否引入重复错误
* 是否符合方案
* 是否存在风险

如果发现：

```
same mistake repeated
```

必须：

* PR Comment
* 提供解决方案
* 禁止继续错误循环

---

# 9. 成本控制原则

默认：

```
80-90%

Worker Agent


10-20%

Supervisor Agent
```

Supervisor 只处理：

高价值判断。

避免：

```
高级模型 = 永久在线执行机器人
```

---

# 10. 安全原则

## 最小权限

Worker：

```
execute permission
```

Supervisor：

```
review permission
```

Human：

```
break glass permission
```

---

## 状态保护

所有危险 Action：

必须：

* 保存状态
* 记录日志
* 可回滚

---

# 11. Metrics

系统需要统计：

## Worker Metrics

```
Task Success Rate

Average Retry Count

Escalation Count

Repeated Error Count

```

## Supervisor Metrics

```
Issue Resolution Time

Solution Accuracy

PR Review Quality

False Escalation Rate

```

---

# 12. v0.1.0 限制

当前版本：

支持：

* 双模型分工
* Issue 升级
* Retry 控制
* PR Review
* 解决提醒

暂不支持：

* 自动架构重设计
* 自动权限调整
* 完全无人生产部署

---

# 13. 核心原则总结

```
Worker executes.

Supervisor judges.

Errors escalate.

Retries are limited.

Issues are traceable.

Solutions require verification.

No infinite loops.
```

End.
