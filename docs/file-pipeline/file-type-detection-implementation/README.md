# Starverse 文件类型检测工程实现目录

Status: Step 0 completed/frozen; Step 1 completed; Owner decisions before Step 2 completed; Step 2 draft completed
Owner confirmation: confirmed
Current phase: Step 2 方案转译（文档草案）已完成
Next phase: Stage A 路径日志最小护栏补丁（待 Owner/监督人批准）

## 目录用途

本目录用于承载 Starverse 文件类型检测体系从项目启动到工程落地的专属实施资料。它面向三类对象：

- Owner：确认目标、边界、优先级、风险取舍
- Supervisor：审查架构一致性、任务边界、验收标准
- Agent：按任务包执行仓库勘察、局部实现、测试补齐与回归验证

## 文件索引

| 文件 | 用途 |
|---|---|
| 00-project-freeze.md | Step 0 冻结稿，定义项目目标、非目标、MVP、工程纪律、验收口径 |
| 01-agent-sync.md | 给 Agent 的同步说明，用于建立上下文和执行约束 |
| 02-step1-repo-survey-task-package.md | Step 1 仓库勘察任务包，要求 Agent 只读分析，不进入实现 |
| 03-supervisor-review-checklist.md | 监督人与 Owner 用于审查 Agent 输出的检查清单 |
| 04-step1-repo-survey-binding-map.md | Step 1 勘察成果：Starverse 绑定地图、风险与 Step 2 输入建议 |
| 05-owner-decisions-before-step2.md | Step 1 后 Owner 决策冻结：进入 Step 2 前置决策与强约束 |
| 06-agent-implementation-appendix.md | Step 2 Agent 实施附录：全局边界、接入地图、替代矩阵、执行模板 |
| 07-stage-implementation-plan.md | Step 2 阶段实施计划：Stage A~K 的目标、边界、验收、回滚、确认要求 |
| 08-acceptance-command-matrix.md | Step 2 验收命令矩阵：各阶段检查命令、口径与禁止项扫描 |
| 09-risk-and-decision-register.md | Step 2 风险与决策登记：五项冻结决策、风险清单与待决策问题 |

## Step 状态

- Step 0 已冻结
- Step 1 仓库勘察已完成
- Owner decisions before Step 2 已完成
- Owner decisions before Step 2 包含五项决策：
  - FileTypeVerdict 独立表
  - sendRouteMapping 旁路渐进并最终替代
  - 旧 message_asset 轨道退场
  - provider_file_ref 不进入 MVP
  - 路径日志泄露先做独立最小护栏修复
- Step 2 draft completed（仅文档转译，未进入代码实现）
- 新增成果文档：`04-step1-repo-survey-binding-map.md`、`05-owner-decisions-before-step2.md`、`06-agent-implementation-appendix.md`、`07-stage-implementation-plan.md`、`08-acceptance-command-matrix.md`、`09-risk-and-decision-register.md`
- 本目录为文件类型检测工程实现专属目录
- 下一步：等待 Owner/监督人审查 Step 2 文档后启动 Stage A

## 当前冻结结论

Starverse 文件类型检测体系第一轮落地只进入 MVP 范围，不实施完整插件体系、完整安全扫描、复杂归档递归扫描、企业策略和高级 polyglot 检测。

Agent 下一步只能执行仓库勘察，不能直接实现文件类型检测。
