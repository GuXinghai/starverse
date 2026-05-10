# Starverse 文件类型检测工程实现目录

Status: Step 0 completed/frozen; Step 1 completed; Owner decisions before Step 2 completed; Step 2 completed; Stage A~K completed (Phase 1 MVP main loop)
Owner confirmation: confirmed
Current phase: Post-P5 user-level roadmap complete; P5 scaffold work through E4 completed; real runtime distribution, production plugin lifecycle move to P6
Next phase: P6-A minimal plugin lifecycle state / registration boundary (recommended); real runtime pilot (Pandoc) in P6-C

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
| 14-p3a-runtime-safety-audit.md | P3-A 实现后审计：边界复核、风险分级、P0/P1 修复建议与 P3-B 进入门槛 |
| 15-p3b-magika-runtime-task-package.md | P3-B 实施前任务包：Magika runtime 接入边界、降级闭环、version/caching 联动与 Owner 待确认项 |
| 16-p3b2-real-magika-runtime-assessment.md | P3-B2 评估报告：真实 Magika NPM runtime、模型供应链、兼容性与最小集成准入结论 |
| 17-p3b2-magika-managed-plugin-plan.md | P3-B2 修正规划：Magika 从主包依赖路线切换到 managed engine plugin 路线 |
| 18-phase3-final-acceptance-and-closeout.md | Phase 3 收口验收：失败降级矩阵、禁止项扫描、阶段结论与后续 follow-ups |
| 19-phase4-planning.md | Phase 4 规划：插件生命周期、真实 runtime 与深度转换任务包与验收草案 |
| 20-p4a-official-plugin-marketplace-closeout.md | P4-A 收口：官方限定插件市场、trusted roots、lifecycle test、settings UI 最小闭环 |
| 21-p4b-magika-official-managed-plugin-planning.md | P4-B planning: Magika official managed plugin 真实包与 classify call 规划 |
| 22-p4b1-magika-package-spec-and-distribution.md | P4-B1: Magika package specification + trusted root / catalog distribution hardening |
| 23-p4b2-managed-root-registration.md | P4-B2: Managed root / official pre-staged package registration replacement |
| 24-p4b3-magika-classify-runner-contract.md | P4-B3: Magika classify runner contract + fake runtime tests |
| 25-p4b4-detectfull-gated-runtime.md | P4-B4: detectFull integration + gated real-runtime test scaffold |
| 26-p4b-magika-official-managed-plugin-closeout.md | P4-B closeout: P4-B completed with follow-ups |
| 27-p4c-external-conversion-engines-planning.md | P4-C planning: Tika/LibreOffice/ffprobe/Pandoc 优先级与深度转换闭环规划 |
| 28-p4c1-conversion-engine-spec-extension.md | P4-C1: external conversion engine manifest/package spec extension |
| 29-p4c2-tika-fake-runner-contract.md | P4-C2: Tika fake runner contract implementation |
| 30-p4c3-libreoffice-conversion-contract.md | P4-C3: LibreOffice conversion contract |
| 31-p4c4-ffprobe-metadata-contract.md | P4-C4: ffprobe metadata probe contract |
| 32-p4c5-pandoc-conversion-contract.md | P4-C5: Pandoc document conversion contract |
| 33-p4c6-route-conversion-candidate-integration.md | P4-C6: route mapping / conversion candidate integration |
| 34-p4c-external-conversion-engines-closeout.md | P4-C closeout: completed with follow-ups |
| 35-p4d-final-acceptance-planning.md | P4-D final acceptance planning |
| 36-p4d1-baseline-verification-ledger.md | P4-D1 baseline verification and known-issue ledger |
| 37-p4d2-manual-smoke-execution-package.md | P4-D2 manual smoke checklist execution package |
| 38-p4d3-security-privacy-followup-audit.md | P4-D3 security/privacy/follow-up audit package |
| 39-p4d4-provider-legacy-decision-package.md | P4-D4 provider_file_ref / legacy message_asset decision package |
| 40-phase4-final-closeout-report.md | Phase 4 final closeout report |
| 41-phase4-owner-decision-record.md | Phase 4 Owner decision record |
| 42-phase5-bl06-bl07-security-planning.md | Phase 5 BL-06/BL-07 security planning |
| 43-phase5-batch1-security-closeout.md | Phase 5 batch 1 P5-A/P5-B/P5-C closeout |
| 44-phase5-batch1-external-audit-record.md | Phase 5 batch 1 external audit record (Gemini CLI) |
| 45-phase5-batch2-trust-runtime-planning.md | Phase 5 batch 2 P5-D/P5-E trust & runtime packaging joint planning |
| 46-phase5-p5d-trust-signing-closeout.md | Phase 5 P5-D trust & signing closeout |
| 47-phase5-p5e1-p5e2-runtime-package-scaffold-closeout.md | Phase 5 P5-E1/P5-E2 runtime package scaffold closeout |
| 48-phase5-p5e3-first-runtime-pilot-closeout.md | Phase 5 P5-E3 first runtime pilot scaffold closeout |
| 49-phase5-p5e4-packaging-regression-smoke-closeout.md | Phase 5 P5-E4 packaging regression / smoke scaffold closeout |
| 50-post-p5-user-level-roadmap.md | Post-P5 user-level roadmap (Phase 6, Phase 7, scope control, lean acceptance) |

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
- P3-A implementation 已完成最小闭环（external process policy/runner、health check runner 接入、availability 降级与测试），未进入 P3-B/P3-C
- P3-A post-implementation audit 已完成并记录：`14-p3a-runtime-safety-audit.md`（结论：pass with follow-ups，进入 P3-B 前需先修 P0）
- P3-A audit P0 fix 已完成（解释器跳板阻断 + kill 后有界收口），P3-B entry status 更新为 allowed
- 新增 P3-B 实施前任务包：`15-p3b-magika-runtime-task-package.md`（implementation package）
- P3-B implementation 已完成首轮闭环：Magika runtime loader interface + mock/unavailable fallback + modelVersion provenance + cache boundary（未接入真实模型打包）
- 新增 P3-B2 评估文档：`16-p3b2-real-magika-runtime-assessment.md`（主包依赖结论：assessment_only）
- 新增 P3-B2 修正规划：`17-p3b2-magika-managed-plugin-plan.md`（结论：proceed_to_plugin_integration_planning）
- P3-B2 implementation 已完成 managed plugin 最小闭环（manifest/discovery/integrity/health/availability/loader fallback），未完成完整插件生命周期与真实模型打包
- P3-B2 audit P0 fix 已完成（路径穿越防护 + 核心文件 integrity 强制覆盖），P3-C entry status：allowed
- P3-B2 当前口径：不把 Magika 绑定进 Starverse 主包，不代表真实 runtime 完整完成
- Phase 3 external runtime stabilization 已完成收口（见 `18-phase3-final-acceptance-and-closeout.md`），并进入 Phase 4 planning
- 新增 Phase 4 规划文档：`19-phase4-planning.md`
- remaining follow-ups listed（legacy message_asset 最终退场、provider_file_ref 延后、真实外部引擎执行与扩展 fixture）
- 本目录为文件类型检测工程实现专属目录
- Phase 4 closeout accepted by Owner decision（见 `41-phase4-owner-decision-record.md`）
- Phase 4 implementation package accepted with documented blockers; Phase 4 remains NOT completed in the strict production sense
- Phase 5 planning: BL-06/BL-07 security planning（见 `42-phase5-bl06-bl07-security-planning.md`）
- Phase 5 batch 1 completed: P5-A (BL-06 dev-mode guard), P5-B (BL-07 messageAsset IPC sanitization), P5-C (security closeout)（见 `43-phase5-batch1-security-closeout.md`）
- Phase 5 batch 1 external audit completed: Gemini CLI PASS（见 `44-phase5-batch1-external-audit-record.md`）
- Phase 5 remains open for P5-D (trusted root / signing) and P5-E (real runtime packaging)
- Phase 5 Batch 2 planning: P5-D/P5-E joint planning package created（见 `45-phase5-batch2-trust-runtime-planning.md`）— planning only, no implementation
- Phase 5 P5-D implementation: trust contracts, production verification gate, root rotation/revocation scaffold implemented（见 `46-phase5-p5d-trust-signing-closeout.md`）
- Phase 5 P5-E1/P5-E2 scaffold completed: runtime package inventory contract + fake Magika pre-stage scaffold（见 `47-phase5-p5e1-p5e2-runtime-package-scaffold-closeout.md`）
- Phase 5 P5-E3 first runtime pilot scaffold completed: Pandoc conversion runtime pilot scaffold（见 `48-phase5-p5e3-first-runtime-pilot-closeout.md`）
- Phase 5 P5-E4 packaging regression / smoke scaffold completed（见 `49-phase5-p5e4-packaging-regression-smoke-closeout.md`）
- P5-E real runtime packaging / model pre-stage remains future scope
- Post-P5 user-level roadmap created: Phase 6 (lifecycle, UI, first real pilot) + Phase 7 (expansion, conversion integration)（见 `50-post-p5-user-level-roadmap.md`）
- Recommended next step: P6-A minimal plugin lifecycle implementation

## 当前冻结结论

Starverse 文件类型检测体系第一轮落地已完成 Phase 1 MVP 主闭环；外部引擎真实执行、legacy 彻底退场和深度样本矩阵进入后续阶段。

当前不将 A~K 视为全项目收口完成。Phase 2 以稳定化、风险收敛和增量扩展为主，不做无边界重构。
