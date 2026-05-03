# Step 2 阶段实施计划

本文把后续落地拆分为 Stage A~K。  
约束：本文件只定义实施计划，不给出具体代码实现。

## Stage A：路径日志最小护栏补丁

- 阶段目标：修复明确的绝对路径日志泄露点，不实现 file-type 功能。
- 允许修改范围：日志与脱敏相关模块（重点 `imageIpc.ts`、`dbBridge.ts` 及直接关联测试）。
- 禁止事项：不改 file-type 业务逻辑；不改 sendPlanService；不新增依赖；不重构无关模块。
- 前置条件：Step 2 文档经 Owner/监督人确认可进入 Stage A。
- 主要任务：定位泄露日志；最小脱敏；补最小测试或 grep 验证。
- 验收命令：见 `08-acceptance-command-matrix.md` 的 Stage A。
- 完成后汇报格式：沿用 `06` 第 11 节模板。
- 回滚风险：低（集中在日志输出与测试）。
- 是否需要 Owner 确认：需要（进入 Stage B 前确认）。

## Stage B：类型体系与 taxonomy 静态表

- 阶段目标：建立类型定义、taxonomy、taxonomyMap、reasonCode/errorCode/labelCode 初版。
- 允许修改范围：类型定义与静态描述文件、对应单测。
- 禁止事项：不做 migration；不建 verdict 表；不接 UI；不接 sendPlanService。
- 前置条件：Stage A 完成并通过验收。
- 主要任务：定义 `FileFormatId`、descriptor、映射与校验规则。
- 验收命令：见 Stage B 验收矩阵。
- 完成后汇报格式：固定模板。
- 回滚风险：低。
- 是否需要 Owner 确认：建议确认（进入 Stage C 前）。

## Stage C：独立表 migration 与 repo 最小骨架

- 阶段目标：新增 `file_type_verdicts` 独立表 migration 与 repo 最小读写骨架。
- 允许修改范围：migration、repo、相关 contract/test。
- 禁止事项：不提前并入 Stage B；不实现完整 detector；不接 UI。
- 前置条件：Stage B 完成，Owner 确认独立表字段边界。
- 主要任务：最小字段落库、幂等升级、repo 最小读写接口。
- 验收命令：见 Stage C 验收矩阵。
- 完成后汇报格式：固定模板。
- 回滚风险：中（涉及 schema 变更）。
- 是否需要 Owner 确认：需要。

## Stage D：轻量检测核心

- 阶段目标：实现 `magicDetector`、`textProbe`、`containerProbe` 最小版、`magika adapter`、`evidenceMerge`、`fileTypeStaticPolicy`。
- 允许修改范围：检测域模块与测试。
- 禁止事项：不接 UI；不改 sendPlanService 主逻辑；不引入 provider_file_ref。
- 前置条件：Stage C 完成。
- 主要任务：保证 detector 只产 evidence、merge 只产 primary/conflicts/flags。
- 验收命令：见 Stage D 验收矩阵。
- 完成后汇报格式：固定模板。
- 回滚风险：中。
- 是否需要 Owner 确认：建议确认。

## Stage E：FileTypeService 与异步状态机

- 阶段目标：接入 `detectBasic/detectFull`，落地 jobId/currentJobId/fingerprint/stale/cancelled/failed，写回独立表并支持失效。
- 允许修改范围：file type service、repo 接口、状态机测试。
- 禁止事项：不接 UI 复杂展示；不改 provider_file_ref 生命周期。
- 前置条件：Stage D 完成。
- 主要任务：状态流、缓存失效、失败恢复最小闭环。
- 验收命令：见 Stage E 验收矩阵。
- 完成后汇报格式：固定模板。
- 回滚风险：中高。
- 是否需要 Owner 确认：需要。

## Stage F：sendRouteMapping 旁路生成

- 阶段目标：实现 `SendPlanCandidate` 生成，不替代 sendPlanService 主路径。
- 允许修改范围：route mapping 模块、candidate 契约、对照测试。
- 禁止事项：不删除旧判断；不改变发送主链路行为。
- 前置条件：Stage E 完成。
- 主要任务：按替代矩阵覆盖主要格式与策略输入。
- 验收命令：见 Stage F/G 验收矩阵。
- 完成后汇报格式：固定模板。
- 回滚风险：中。
- 是否需要 Owner 确认：建议确认（进入 Stage G 前）。

## Stage G：sendPlanService 渐进接入与旧判断退场

- 阶段目标：sendPlanService 消费 `SendPlanCandidate`，逐项迁移旧判断并保留最终 gate。
- 允许修改范围：sendPlanService 接入层、对照测试、gate 校验测试。
- 禁止事项：禁止长期双轨；禁止移除最终安全 gate。
- 前置条件：Stage F 完成且对照测试通过。
- 主要任务：按替代矩阵逐项接管，标记已迁移项与保留项。
- 验收命令：见 Stage F/G 验收矩阵。
- 完成后汇报格式：固定模板。
- 回滚风险：高。
- 是否需要 Owner 确认：需要。

## Stage H：最小 UI 接入

- 阶段目标：附件卡片/详情展示类型、置信度、路线、冲突、warning/blocked。
- 允许修改范围：app 层 VM、附件展示组件（展示层）。
- 禁止事项：UI 不直接判断文件类型；不在 UI 层做 extension/MIME 判定。
- 前置条件：Stage G 完成。
- 主要任务：读模型输出、渲染状态、保持路径隐私边界。
- 验收命令：见 Stage H 验收矩阵。
- 完成后汇报格式：固定模板。
- 回滚风险：中。
- 是否需要 Owner 确认：建议确认。

## Stage I：fixture 与回归测试矩阵

- 阶段目标：建立 file-type fixtures + `expected.json` 黄金样本，覆盖关键格式与 adversarial 样本。
- 允许修改范围：fixtures、测试、测试工具。
- 禁止事项：不引入不必要大体积样本；不泄露敏感路径。
- 前置条件：Stage H 完成。
- 主要任务：样本分层、基线校验、回归门禁。
- 验收命令：见 Stage I 验收矩阵。
- 完成后汇报格式：固定模板。
- 回滚风险：中（仓库体积与CI耗时）。
- 是否需要 Owner 确认：建议确认。

## Stage J：旧 message_asset 退场

- 阶段目标：清理旧轨依赖；必要时清空旧文件资产；删除或降级旧 `message_asset` 路径。
- 允许修改范围：退场任务包明确后的范围。
- 禁止事项：未获 Owner 明确确认不得执行清空或删除动作。
- 前置条件：Stage I 完成，退场检查项全通过并获批准。
- 主要任务：依赖清点、分批退场、回滚方案演练。
- 验收命令：见 Stage J 对应验收补充（在执行前补充）。
- 完成后汇报格式：固定模板。
- 回滚风险：高。
- 是否需要 Owner 确认：必须。

## Stage K：插件与外部引擎扩展

- 阶段目标：Tika、LibreOffice、ffprobe、Pandoc 等扩展进入 P1/P2，不进入 MVP 主闭环。
- 允许修改范围：插件接口、引擎适配、扩展测试。
- 禁止事项：不反向污染 MVP 主链路稳定性。
- 前置条件：MVP 主闭环稳定。
- 主要任务：引擎接入、能力探测、失败降级、隔离策略。
- 验收命令：执行前补充扩展验收矩阵。
- 完成后汇报格式：固定模板。
- 回滚风险：中高。
- 是否需要 Owner 确认：需要。

