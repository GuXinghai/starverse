# Step 1 后 Owner 决策冻结：进入 Step 2 前置决策

## 1. 决策背景

Step 1 已完成仓库勘察。Agent 在勘察中识别出 3 个进入 Step 2 前必须冻结的关键问题：

1. `FileTypeVerdict` 落库方案（独立表 vs metadata JSON）。
2. `sendRouteMapping` 引入策略（旁路渐进边界与最终接管目标）。
3. 旧 `message_asset` 轨道处理（保留兼容 vs 退场）。

本文件记录 Owner 在进入 Step 2 前作出的最终冻结决策，作为 Step 2 方案转译与后续实施附录的强约束。

## 2. FileTypeVerdict 落库方案

### 决策

从 MVP 起采用独立表方案（`file_type_verdicts` 或同等语义命名），不采用仅写入 `source_meta_json` 的临时方案。

### 理由

- 独立表是必经路径，前置落地可避免后续二次迁移。
- 当前无必须保留和迁移的文件资产历史包袱。
- 现有文件资产允许清空，不需要为旧数据兼容牺牲新 schema 清晰性。
- 文件类型识别结果具备独立生命周期、版本、缓存失效、重检、审计需求，适合独立建模。

### 对 Step 2 的影响

Step 2 实施附录必须以独立 verdict 表为基础，并至少覆盖：

- 与 `assetId` 关联
- 当前有效 verdict（或等价 current snapshot）
- `schemaVersion`
- `taxonomyVersion`
- `taxonomyMapVersion`
- `magicTableVersion`
- `mergeRulesVersion`
- `containerProbeVersion`
- `textProbeVersion`
- `magikaModelVersion`
- `fingerprint`
- `createdAt`
- `updatedAt`
- `stale` 或 `is_current`

第一阶段可先保存“当前有效 verdict snapshot”，但表结构不得阻碍未来历史版本、批量重检和审计扩展。

### 对后续 migration 的影响

- 后续实施阶段必须新增 migration 支撑独立表。
- 本轮不执行 migration，不修改数据库 schema。

### 后续仍需设计的问题

- `is_current` 与 `stale` 的并存/二选一策略。
- `fingerprint` 组成与失效触发条件。
- verdict 历史保留策略（是否保留多版本、保留周期）。
- 与 `file_assets` 的关联约束、索引策略与查询口径。

## 3. sendRouteMapping 引入策略

### 决策

采用旁路渐进策略引入 `sendRouteMapping`，但必须以完整替代旧文件类型判断逻辑为目标，不允许长期双轨并行。

### 理由

- 渐进接入可降低一次性替换 `sendPlanService` 风险。
- 历史经验已证明长期双轨会导致判定分叉与维护混乱，必须设置接管边界与退场里程碑。

### 分阶段接管路线

1. 第一阶段：`sendRouteMapping` 以纯函数形式生成 `SendPlanCandidate`，不立即替换真实发送路径。
2. 第二阶段：新增对比测试，校验 `sendRouteMapping` 与现有 `sendPlanService` 在主要附件类型上的一致性/差异。
3. 第三阶段：`sendPlanService` 开始消费 `SendPlanCandidate`，但保留最终发送前 gate。
4. 第四阶段：逐项迁移旧的 extension/MIME/attachment kind 判断。
5. 第五阶段：删除或降级已被 `sendRouteMapping` 接管的旧判断。

### 旧逻辑退场要求

- Step 2 文档必须给出替代矩阵：明确哪些判断迁移到 `sendRouteMapping`，哪些继续保留在 `sendPlanService`。
- 禁止同一种判断长期同时存在于 `sendRouteMapping` 与 `sendPlanService`。

### sendPlanService 最终职责

`sendPlanService` 最终应负责消费 `verdict / candidate / modelCapabilities / userPrefs / override`，并执行最终发送前校验，不再承担文件类型判断主责。

### 禁止长期双轨的约束

`sendRouteMapping` 不得长期停留在“建议层”或“辅助层”；必须按阶段推进接管并完成旧判断退场。

## 4. 旧 message_asset 轨道处理

### 决策

旧 `message_asset` 轨道允许退场，不保留旧数据兼容包袱。

### 理由

- 当前没有必须保留的旧文件资产。
- 现有文件资产允许清空。
- 继续兼容旧轨会显著增加新体系复杂度。
- 本项目目标是建立干净主轨，避免旧 `message_asset` 与新 `message_attachments/file_assets` 长期并存。

### 新主轨

未来文件类型检测体系以：

- `file_assets`
- `draft_attachments`
- `message_attachments`

为主轨。

### 旧轨退场原则

- 允许规划退场，但需谨慎分阶段执行。
- 不在本轮执行任何退场实现。

### 后续检查项

- 是否仍有旧轨读取路径。
- 是否仍有 UI 依赖。
- 是否仍有测试依赖。
- 是否仍有 repo 依赖。
- 是否仍有历史兼容 adapter。

若后续退场涉及清空现有文件资产或重建测试数据，必须写入后续任务包，禁止 Agent 自行执行。

### 本轮不执行退场实现

本轮仅做决策留档，不删除旧轨代码，不迁移历史数据，不改 schema。

## 5. provider_file_ref 是否进入 MVP

### 决策

`provider_file_ref` 不进入文件类型识别 MVP。

### 理由

- `provider_file_ref` 属于供应商侧/聚合层远端文件引用生命周期问题。
- 文件类型识别 MVP 核心目标是建立本地 `FileTypeVerdict`、`SendPlanCandidate`、预览/转换/发送路线判断基础。
- 过早引入会提前拉入 provider 上传、远端生命周期、失败重试、缓存失效、隐私策略与 OpenRouter File API 绑定，扩大实施面。
- MVP 应先稳定本地资产识别与发送路线决策，后续在 direct_file/provider upload 路线稳定后再扩展。

### 对 Step 2 的影响

- MVP 不新增 `provider_file_ref` 数据模型。
- MVP 不绑定具体 provider 的远端文件生命周期。
- MVP 的 `SendPlanCandidate` 可表达 `direct_file` 或 `requiresJob`，但不得要求 `provider_file_ref` 已存在。
- `provider_file_ref` 作为 P1/P2 扩展项留档。

### 后续扩展条件

若后续引入 `provider_file_ref`，必须单独设计：

- 生命周期状态机
- 缓存失效与重建策略
- 隐私日志与审计边界
- provider 兼容策略
- 失败降级路径

## 6. 路径日志泄露最低限度护栏修复

### 决策

路径日志泄露问题需要先做最低限度护栏修复；该修复必须作为独立护栏补丁执行，不混入文件类型检测实现。

### 理由

- Step 1 勘察已识别 `imageIpc.ts`、`dbBridge.ts` 等位置存在潜在本地路径泄露面。
- 后续文件类型体系会引入更多路径处理点（如 FileAccessRef、sandbox copy、外部引擎、diagnostics），若不先收敛风险会被放大。
- 该修复属于横向安全护栏，不是文件类型检测核心功能；独立执行便于审查与回滚。

### 范围

- 正式文件类型检测实现前，安排一个独立最小护栏任务。
- 只修复已明确的绝对路径日志泄露点。
- 重点检查：`imageIpc.ts`、`dbBridge.ts`，以及 Step 1 勘察文档列出的相关日志点。
- 尽量补充最小日志脱敏测试或 grep 验证。
- 修复完成后需汇报：修改文件、脱敏策略、验证命令、剩余风险。

### 禁止事项

- 不修改文件类型检测业务逻辑。
- 不新增依赖。
- 不重构无关代码。

## 7. 对 Step 2 的强约束

Step 2 方案转译必须满足：

1. 实施附录必须以独立 `file_type_verdicts`（或同等语义）表为基础。
2. 实施附录必须包含 `sendRouteMapping` 替代矩阵。
3. 实施附录必须包含旧 `message_asset` 退场检查项。
4. 实施附录阶段仍禁止在本轮范围内实现代码。
5. 实施附录必须坚持小阶段、硬验收、可回滚原则。

## 8. 本轮未执行事项

- 未实现文件类型检测。
- 未修改数据库 schema。
- 未新增 `file_type_verdicts` 表。
- 未修改 `sendPlanService` 业务逻辑。
- 未删除旧 `message_asset` 代码。
- 未清空任何现有文件资产。
- 未新增依赖。
