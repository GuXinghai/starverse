# Starverse 文件类型检测工程实现目录

Status: Step 0 completed/frozen; Step 1 completed; Owner decisions before Step 2 completed; Step 2 completed; Stage A~K completed (Phase 1 MVP main loop)
Owner confirmation: confirmed
Current phase: Phase 3 planning (external runtime + security execution layer)
Next phase: 输出 Phase 3 任务包并等待 Owner 审核后进入实现阶段

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
| 10-phase1-mvp-closeout-report.md | Phase 1 MVP 收口报告：A~K 阶段状态、验收汇总、剩余风险与后续建议 |
| 11-phase2-stabilization-gap-review.md | Phase 2 稳定化与缺口复核：回归基线、Group D 处理、风险登记与 Phase 3 门槛 |
| 12-phase3-external-runtime-planning.md | Phase 3 规划文档：真实 runtime 接入边界、外部执行安全层、验收矩阵与延期项 |
| 13-p3a-runtime-safety-task-package.md | P3-A 实施前任务包：外部 runtime 安全底座的代码勘察、缺口分解、最小实施范围与验收口径 |

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
- Step 2 completed（方案转译已验收）
- Stage A~K completed（Phase 1 MVP 主闭环已实现）
- 新增成果文档：`04-step1-repo-survey-binding-map.md`、`05-owner-decisions-before-step2.md`、`06-agent-implementation-appendix.md`、`07-stage-implementation-plan.md`、`08-acceptance-command-matrix.md`、`09-risk-and-decision-register.md`
- Phase 1 MVP closeout report added：`10-phase1-mvp-closeout-report.md`
- Phase 2 stabilization gap review added：`11-phase2-stabilization-gap-review.md`
- Manual smoke test deferred by Owner decision（本轮仅文档口径修正、自动化基线复核、Group D 清理与缺口复核）
- 当 UI 正式接入文件类型识别或外部 runtime 执行层改变用户可见行为时，必须补完整手工烟测
- Phase 2 stabilization / gap review 已完成，进入 Phase 3 planning（非实现阶段）
- 新增 Phase 3 规划文档：`12-phase3-external-runtime-planning.md`
- Phase 3 planning 任务包已压缩为 3 个：P3-A 外部 runtime 安全底座、P3-B Magika runtime 接入与降级闭环、P3-C 验收矩阵与失败降级收口
- 新增 P3-A 实施前任务包：`13-p3a-runtime-safety-task-package.md`（implementation package，非 implementation completed）
- remaining follow-ups listed（legacy message_asset 最终退场、provider_file_ref 延后、真实外部引擎执行与扩展 fixture）
- 本目录为文件类型检测工程实现专属目录
- 下一步：仅执行 Phase 3 任务包规划与审批，不进入实现

## 当前冻结结论

Starverse 文件类型检测体系第一轮落地已完成 Phase 1 MVP 主闭环；外部引擎真实执行、legacy 彻底退场和深度样本矩阵进入后续阶段。

当前不将 A~K 视为全项目最终完成。Phase 2 以稳定化、风险收敛和增量扩展为主，不做无边界重构。
