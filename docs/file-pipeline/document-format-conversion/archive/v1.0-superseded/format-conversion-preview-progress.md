> Status: historical reference only.
> Superseded by: `docs/file-pipeline/document-format-conversion/starverse_format_conversion_preview_v1_2.md`
> Do not implement Hybrid / mixed send strategy / old file-card modal UI from this document.

# Starverse 文档格式转换与预览执行进度

## 0. 当前权威状态快照

- Step 0–Step 5 主线已收官。
- 当前主线不再扩展新转换能力。
- 当前后续工作分为三类：
  - Current replay / Retry-Regenerate-Edit Question 附件重放治理与实施；
  - external converter runtime / sandbox runner 独立任务；
  - BetterSqlite3 ABI、token gate / soft gate 等维护债务。
- 原 `## 1`–`## 6` 的早期状态章节仅保留为历史初始化记录，不再作为当前执行口径。
- 后续执行以最新进度日志、`docs/file-pipeline/format-conversion-preview-implementation-plan.md` 维护态和本节权威快照为准。

## 1. 信源

- 设计基准：format-conversion-preview-final.md
- 适用范围：文件上传、附件转换、转换候选、DerivedAsset、预览、Send Plan、模型兼容性、超大文本 gate、安全沙箱、错误诊断
- 当前阶段：方案固化后，进入代码调研与差距分析

## 2. 当前状态

- 注意：本节为早期初始化状态，已被 `## 0 当前权威状态快照` 与后续收官记录覆盖。
- 最终方案已纳入治理文件：`format-conversion-preview-final.md`
- 尚未开始代码修改
- 下一步：调研现有文件管线、附件草稿、Send Plan、预览资产、模型兼容性 gate 的实现现状

## 3. 代码调研清单

逐项检查并记录现状：

- RawFile / FileAsset 当前模型  
- DraftAttachment 当前模型  
- MessageAttachment 当前模型  
- DerivedAsset 或 derivative asset 当前实现  
- 预览资产生成流程  
- 发送计划 buildCurrentSendPlan 或同类逻辑  
- preflightDraftAttachmentSendGate 或同类 gate  
- 模型能力判断逻辑  
- 当前扩展名 / MIME / modality 判断逻辑  
- 当前 docx、xlsx、csv、html、pdf 的处理路径  
- 当前附件 UI 卡片与详情弹窗  
- 当前历史消息附件展示逻辑  
- 当前错误与 warning 结构  
- 当前测试覆盖

## 4. 差距分析

按最终方案拆分为：

- 数据模型差距  
- 转换候选差距  
- 预览与发送同源差距  
- Send Plan 差距  
- 模型兼容性判断差距  
- 编码检测与手动切换差距  
- 表格转换差距  
- DOCX / HTML / PDF attachment 差距  
- 安全沙箱差距  
- 错误诊断差距  
- UI 暴露差距  
- 测试覆盖差距

## 5. 分阶段落地计划

该章节仅保留历史记录。当前执行计划以 `docs/file-pipeline/format-conversion-preview-implementation-plan.md` 为准；旧 Phase 1-6 仅作为历史设计脉络。

历史记录（已废弃）：

- Phase 1：基础文本、代码与 CSV/TSV
- Phase 2：XLSX / XLS 表格
- Phase 3：DOCX / RTF / DOC 语义路径
- Phase 4：PDF attachment
- Phase 5：HTML 完整路径
- Phase 6：PS/EPS 与 Hybrid

每个 Phase 记录：目标 / 涉及文件 / 实现状态 / 测试状态 / 风险 / 未决问题 / 下一步

## 6. 当前未决问题

- 现有代码中是否已有 DerivedAsset / derivative job 框架可复用
- 当前附件兼容性是否仍直接依赖原始扩展名
- 当前预览资产与发送资产是否同源
- 当前 docx 被 text+image+file 模型误判 incompatible 的具体原因
- OpenRouter file/PDF 能力判断是否已经和 selected conversion option 解耦
- 超大文本 gate 是否已有基础实现
- HTML JavaScript 渲染开关是否需要延后到 Phase 5
- 外部转换器 sandbox runner 是否已有可复用实现

## 7. 进度日志

（按日期倒序追加，初始记录见下）

### 2026-04-29

- 完成：将最终方案文件 `format-conversion-preview-final.md` 添加至 `docs/file-pipeline/`；创建执行进度文件 `format-conversion-preview-progress.md`。
- 修改文件：`docs/file-pipeline/README.md`（追加索引条目）。
- 测试：仅文档级变更，未运行代码测试。
- 风险：无；后续需要代码调研以判定实现差距。
- 下一步：在 `format-conversion-preview-progress.md` 中逐项记录代码调研结果（开始执行代码调研清单）。

### 2026-04-29 历史附件刷新 ids undefined 诊断/修复

- 问题现象：用户发送带附件消息后，UI 报错：
  `listFileAssetsByIds failed (non-fatal): invalid_type expected array received undefined path ["ids"]`，但发送主链（assistant message）仍被标记为 final。
- 根因类型：C（DB contract/schema 不匹配，由调用方传参字段名与 dbBridge 验证字段名不一致）。
- 是否直接修复：是，属于小范围调用参数错误，直接修复客户端参数。
- 修改文件：
  - `src/next/files/fileAssetClient.ts`：将调用由 `{ assetIds: ids }` 规范化为 `{ ids }`，确保不向 db bridge 传递 `ids: undefined`。
  - `src/next/files/fileAssetClient.test.ts`：更新测试断言以匹配调用参数。
- 修复方式要点：
  - 将传入 db 的参数名与 `infra/db/validation.ts` 中的 `ListFileAssetsByIdsSchema` 对齐（使用 `ids` 字段）。
  - 保持 `listFileAssetsByIds` 的调用语义：去重、过滤 falsy、空数组短路返回。
  - 不更改 DB schema、Send Plan 语义或历史附件模型。
- 测试命令与结果（在本地运行后请在 CI/环境复现）：
  - `npx vitest --run src/next/files/fileAssetClient.test.ts` — 期望通过（已修改断言）。
  - 建议运行回归：
    - `npx vitest --run src/ui-app/AppChatApp.attachments.test.ts`
    - `npx vitest --run src/next/openrouter/openRouterSendPreparation.test.ts`
    - `npx vitest --run src/next/openrouter/openRouterSendPlanSerializer.test.ts`
    - 如需额外验证：`npx vitest --run infra/files/sendPlanService.test.ts`（若因 BetterSqlite3 ABI 被 skip，请记录并忽略 ABI 问题）。
- 是否影响发送主链：否。发送流程（OpenRouter usage、assistant message 状态设为 final）不受此次修复影响；本问题为 UI 刷新阶段的调用参数错误，仅导致日志与非阻塞刷新失败。
- 是否影响 Step 0–Step 5 收官状态：无影响，本修复为小范围修护，不改变 sendPlan/send 语义或转换能力实现进度。

---

记录人：自动化修复脚本（由 Copilot 协助）


### 2026-04-29 功能实现路线图规划

#### 1. 本轮目标

本轮目标是“实现路线图规划前置检查”，不是功能实现、不是 Phase 1 开发。

#### 2. 信源完整性检查

阻断结论：`docs/file-pipeline/format-conversion-preview-final.md` 当前不完整，已按治理要求停止后续实现规划。

- 现状：文件仅 87 行，仅覆盖到 `## 5. 数据对象模型` 标题，未包含该节正文与后续章节。
- 已确认存在：1 总体结论、2 目标与边界、3 核心原则、4 总体流程、5 数据对象模型（仅标题）。
- 缺失（按治理要求最少应覆盖）：  
  6 状态机  
  7 编码与解码策略  
  8 转换目标类型  
  9 转换引擎与路径目录  
  10 各格式策略  
  11 默认选择与用户偏好  
  12 预览交互设计  
  13 Send Plan 与模型兼容性判断  
  14 安全规则  
  15 错误、提示与诊断  
  16 缓存与失效规则  
  17 Draft 与 Message 绑定规则  
  18 分阶段落地计划  
  19 验收标准  
  20 测试矩阵  
  21 路径抉择记录  
  22 最终落地原则

处理决定：在 `final` 治理文档补全前，不继续执行“仓库调研、路线图拆分、提交序列与风险分级”。

#### 3. 当前代码现状摘要

未执行。因信源不完整触发阻断，未进入仓库代码调研步骤。

#### 4. 小阶段实现路线图

未执行。因信源不完整触发阻断，未进入实现路线图拆分。

#### 5. 依赖关系图

未执行。待 `final` 文档补全后再产出。

#### 6. 首批建议提交序列

未执行。待 `final` 文档补全后再产出。

#### 7. P0 / P1 风险列表

当前仅识别到一项治理级阻断风险（非代码实现风险）：

| 风险 | 等级 | 触发条件 | 影响 | 建议处理阶段 |
|---|---|---|---|---|
| 治理信源不完整导致路线图失真 | P0 | `final` 文档缺失关键章节 | 后续规划与实现可能偏离治理基线 | 立即处理（补全 `final` 文档） |

#### 8. 不进入首轮实现的内容

未执行。待 `final` 文档补全后再确认首轮边界。

#### 9. 下一步建议

1. 先补全 `docs/file-pipeline/format-conversion-preview-final.md`，至少覆盖治理要求的 22 个主章节。
2. 补全后重新发起本任务；届时再执行指定文件调研、`rg` 搜索、分阶段路线图与提交序列设计。

### 2026-04-29 第一轮项目文件调研

#### 1. 本轮范围

本轮实际检索/阅读（按主题归类）：

- 信源与进度文档
  - `docs/file-pipeline/format-conversion-preview-final.md`
  - `docs/file-pipeline/format-conversion-preview-progress.md`
- 文件模型与分类规则
  - `src/shared/files/fileTypes.ts`
  - `src/shared/files/fileRules.ts`
  - `infra/files/fileIngestionService.ts`
  - `infra/db/types.ts`
  - `src/next/ipc/contracts/dbBridgeContracts.ts`
- 草稿/历史附件与绑定
  - `src/next/files/conversationDraftClient.ts`
  - `src/next/files/fileAssetClient.ts`
  - `src/next/files/messageAttachmentClient.ts`
  - `infra/files/conversationAttachmentService.ts`
- 派生资产与预览
  - `src/next/files/derivativeJobClient.ts`
  - `infra/files/derivativeJobService.ts`
  - `src/next/files/previewClient.ts`
  - `infra/db/worker/handlers/filePipelineHandlers.ts`
  - `infra/files/derivativeJobService.test.ts`
- Send Plan / preflight / OpenRouter 发送准备
  - `src/shared/files/sendPlanTypes.ts`
  - `src/next/files/sendPlanClient.ts`
  - `infra/files/sendPlanService.ts`
  - `infra/files/sendPlanService.test.ts`
  - `src/next/openrouter/openRouterSendPreparation.ts`
  - `src/next/openrouter/openRouterSendPreparation.test.ts`
  - `src/next/openrouter/openRouterSendPlanSerializer.ts`
  - `src/next/openrouter/openRouterSendPlanSerializer.test.ts`
  - `src/ui-app/app/appChatApp.logic.ts`
- UI 附件展示与交互
  - `src/ui-app/AppChatApp.vue`
  - `src/ui-app/components/ChatAppComposer.vue`
  - `src/ui-app/components/DraftAttachmentStrip.vue`
  - `src/ui-app/components/DraftAttachmentCard.vue`
  - `src/ui-kit/chat/MessageAttachmentList.vue`
  - `src/ui-kit/chat/MessageAttachmentCard.vue`
- 测试锚点
  - `src/ui-app/AppChatApp.attachments.test.ts`
  - `src/ui-app/components/ChatAppComposer.attachments.test.ts`
  - `electron/ipc/dialogIpc.test.ts`
- 安全与文件选择入口
  - `electron/ipc/dialogIpc.ts`

说明：你给的 `src/next/openrouter/sendPlanClient.ts` / `src/next/openrouter/sendPlanTypes.ts` / `src/next/files/derivativeJobService.ts` 在仓库中未找到同路径；本轮使用等价落点 `src/next/files/sendPlanClient.ts`、`src/shared/files/sendPlanTypes.ts`、`infra/files/derivativeJobService.ts`。

#### 2. 当前实现摘要

- 文件资产模型
  - 已有 `FileAssetRecord`（`infra/db/types.ts`）+ 前端 `DecodedFileAsset`（`src/next/ipc/contracts/dbBridgeContracts.ts`），包含 `extension/mime/assetKind/sourceKind/storageBackend/storageUri/ingestStatus/previewStatus/sourceMetaJson`。
  - 分类由 `inferFileProfile`（`src/shared/files/fileRules.ts`）完成，核心输出 `aiPayloadKind + processingStatus`；不是最终转换选项模型。

- 草稿附件模型
  - 已有 `DraftAttachmentRecord`，关键字段包括 `aiPayloadKind/processingStatus/includeInNextRequest/preferredSendMode/urlRetentionMode`（`infra/db/types.ts`）。
  - 草稿挂接与迁移通过 `conversationDraft.*`（`infra/files/conversationAttachmentService.ts` + `src/next/files/conversationDraftClient.ts`）。

- 历史消息附件模型
  - 已有 `MessageAttachmentRecord`（`infra/db/types.ts`），由 `commitDraftToUserMessage` / `attachDraftToMessage` 产生（`infra/files/conversationAttachmentService.ts`）。
  - 历史候选快照由 `getCandidateAttachmentSnapshot` 输出 included/excluded（同文件）。

- 派生资产与预览机制
  - 已有 `FileDerivativeRecord` + `DerivativeJobRecord`，`DerivedKind` 包含 `preview_optimized/converted_pdf/send_optimized` 等（`src/shared/files/fileTypes.ts`、`infra/db/types.ts`）。
  - 实际已落地：`preview_optimized`（图片），`ensurePreviewDerivative` 会复用 latest ready，否则创建 job（`infra/files/derivativeJobService.ts`）。
  - `converted_pdf` 明确保留未实现（同文件 `conversion_not_implemented`）。
  - UI 预览链路：`preview.getLatestReady` -> missing 时 `preview.ensure`（`src/ui-app/app/appChatApp.logic.ts` + `src/next/files/previewClient.ts`）。

- Send Plan 机制
  - 统一由 `SendPlanService.buildSendPlan`（`infra/files/sendPlanService.ts`）生成 `status/warnings/blockingReasons/attachmentPlans`。
  - Renderer 通过 `sendPlan.buildCurrent` 拉取计划（`src/next/files/sendPlanClient.ts`）。
  - OpenRouter 发送前可走 `sendPlan.prepareOpenRouter`，由 worker 端串联 sendPlan + serializer（`infra/db/worker/handlers/filePipelineHandlers.ts`）。

- preflight gate 机制
  - UI preflight：`preflightDraftAttachmentSendGate` 在发送前强制重算 `buildCurrentSendPlan`，并基于 `evaluateComposerSendPlanGate` 阻断/警告（`src/ui-app/app/appChatApp.logic.ts` 6310+）。
  - 解析中 gate：`evaluateAttachmentParsingGate` 阻断 pending ingestion（`infra/files/sendPlanService.ts`）。

- 模型兼容性判断机制
  - 当前判断不直接看扩展名，核心看 `aiPayloadKind + processingStatus + model.inputModalities + providerContext`（`infra/files/sendPlanService.ts` 的 `evaluateCompatibilityForAttachment/capabilitySetsForAttachment`）。
  - `pdf` 当前能力集合是 `[['file_in'], ['text_in']]` 且受 `supportsPdfInputs` 开关影响（同文件），意味着 `pdf` 可在 text-only 模型上被视为兼容（策略层面）。

- UI 附件展示机制
  - 草稿：`DraftAttachmentStrip/DraftAttachmentCard` 展示 `displayStatus` 与 warning/blocking 文本。
  - 历史：`MessageAttachmentList/MessageAttachmentCard` 展示历史附件并可标注 history incompatible。
  - Composer 顶部可展示 history incompatible 警告与导航（`ChatAppComposer.vue` + `appChatApp.logic.ts`）。

- 测试覆盖位置
  - SendPlan 服务：`infra/files/sendPlanService.test.ts`（兼容性、模式选择、pending gate、history/draft 去重等）。
  - OpenRouter 序列化：`src/next/openrouter/openRouterSendPlanSerializer.test.ts`（模式回退、storageUri 安全、URL/inline 分支、错误码）。
  - UI 附件流：`src/ui-app/AppChatApp.attachments.test.ts`（send gate、history incompatible、预览、脱敏、移除不删资产）。
  - 文件选择与日志：`electron/ipc/dialogIpc.test.ts`（`dialog:select-file` 不记录本地路径）。

#### 3. 关键代码锚点

| 领域 | 文件 | 关键类型/函数 | 当前职责 | 备注 |
|---|---|---|---|---|
| 文件分类 | `src/shared/files/fileRules.ts` | `inferFileProfile` | 通过扩展名+MIME 产出 `aiPayloadKind/processingStatus` | `docx/xlsx` 默认归 `convertible`，`text/html` MIME 直落 `unsupported(binary)` |
| 文件模型 | `infra/db/types.ts` | `FileAssetRecord` | 资产主模型 | 含 `storageUri`、`previewStatus`、`sourceMetaJson` |
| 草稿附件 | `infra/db/types.ts` | `DraftAttachmentRecord` | 草稿层附件记录 | 含 `preferredSendMode/urlRetentionMode` |
| 历史附件 | `infra/db/types.ts` | `MessageAttachmentRecord` | 历史消息附件记录 | 发送后落库绑定 |
| 草稿-消息绑定 | `infra/files/conversationAttachmentService.ts` | `commitDraftToUserMessage` / `attachDraftToMessage` | 将 draft attachment 绑定到消息 | 未发送预览不会自动入 message attachment |
| Derivative 框架 | `infra/files/derivativeJobService.ts` | `ensurePreviewDerivative` / `runDerivativeJob` | 派生任务统一执行 | `converted_pdf` 保留未实现 |
| 预览读写 | `infra/db/worker/handlers/filePipelineHandlers.ts` | `preview.getLatestReady` / `preview.ensure` | 返回 `DecodedPreviewPayload` | 预览来自 `preview_optimized` derivative |
| SendPlan 核心 | `infra/files/sendPlanService.ts` | `buildSendPlan` | 汇总草稿+历史附件可发送性 | 生成 `status/attachmentPlans/warnings` |
| 兼容性判断 | `infra/files/sendPlanService.ts` | `evaluateCompatibilityForAttachment` | 基于 capability sets 判 compatible | 不是按原始扩展名判 incompatible |
| 模式选择 | `infra/files/sendPlanService.ts` | `selectAttachmentSendModeInternal` | 选 `url_ref/inline_base64` | 看 URL 保留与本地副本 |
| OpenRouter 准备 | `infra/db/worker/handlers/filePipelineHandlers.ts` | `sendPlan.prepareOpenRouter` | sendPlan + serializer 产出 contentParts/plugins | 走同一计划，不是 UI 额外拼装 |
| OpenRouter 序列化 | `src/next/openrouter/openRouterSendPlanSerializer.ts` | `serializeSendPlanForOpenRouter` | 将 included attachments 序列化为 OpenRouter parts | 含 storageUri 安全校验 |
| UI preflight gate | `src/ui-app/app/appChatApp.logic.ts` | `preflightDraftAttachmentSendGate` | 发送前重算 sendPlan 并阻断 | 发送时再次校验，防 stale |
| UI 历史不兼容提示 | `src/ui-app/app/appChatApp.logic.ts` | `refreshHistoryIncompatibleAttachments` | 计算 history incompatible summary | 使用 `buildCurrentSendPlan` 结果 |
| UI 预览链路 | `src/ui-app/app/appChatApp.logic.ts` | `resolveDraftAttachmentPreview` / `resolveHistoryAttachmentPreview` | `getLatestReadyPreview` 缺失时 `ensurePreview` | 仅图片走 preview |
| Compose UI | `src/ui-app/components/ChatAppComposer.vue` | history incompatible block | 展示历史附件不兼容提醒 | 提供 review 与前后导航 |
| 草稿附件 UI | `src/ui-app/components/DraftAttachmentCard.vue` | `displayStatus` 展示 | 呈现 parsing/ready/incompatible 等态 | 不承载转换选项选择 |
| 历史附件 UI | `src/ui-kit/chat/MessageAttachmentCard.vue` | `incompatibilityReason` 展示 | 呈现历史附件状态 | 红色高亮 incompatible |
| 文件选择入口 | `electron/ipc/dialogIpc.ts` | `dialog:select-file` / `dialog:select-local-files` | 文件选择 IPC | `select-file` 返回 dataUrl；`select-local-files` 返回 filePaths |
| 路径/日志测试 | `electron/ipc/dialogIpc.test.ts` | 多用例 | 断言日志不含本地绝对路径 | 仅覆盖日志，不覆盖返回载荷消费方 |

#### 4. 初步差距与风险

| 问题 | 当前实现 | 与最终方案的差距 | 风险等级 | 后续规划意义 |
|---|---|---|---|---|
| incompatible 是否仍按扩展名/MIME 判定 | SendPlan 阶段主要按 `aiPayloadKind + modalities + providerContext`（`infra/files/sendPlanService.ts`） | 设计要求“按 selected conversion option 判”；当前尚无完整 ConversionOption 层 | P1 | 需要先补“转换选项语义层”，再把兼容性从 `aiPayloadKind` 提升到 `selectedOption.targetKind` |
| `.docx` 在 text+image+file 模型下仍可能 incompatible 的根因 | `fileRules` 把 `docx` 归 `convertible + aiPayloadKind=pdf`；`sendPlanService` 对 `processingStatus=convertible` 直接给 `conversion_required_before_send`（不看模型能力） | 设计里 `.docx` 可先转 markdown 后按 text 判兼容；当前缺少“已选择 markdown”的路径状态 | P1 | 需引入转换产物状态（例如 derived text 已ready）后再判兼容 |
| selected conversion option 或等价机制 | 仅有 `preferredSendMode/urlRetentionMode`，无 `selectedOptionId/targetKind/engineChain` | 与最终方案核心对象（ConversionOption/selectedOption）不一致 | P1 | 这是后续全链路改造的主入口，优先级高 |
| 预览与发送是否同源 | 图片 preview 用 `preview_optimized` derivative；发送走 sendPlan/serializer 读取原 asset（`storageUri`） | 对图片尚可近似同源，但文档转换资产（markdown/pdf）尚无“预览=发送同一DerivedAsset”的机制 | P1 | 需建立“send asset id”与 preview 资产绑定规则 |
| DerivedAsset / derivative job 可复用性 | derivative/job 框架完整，支持 `preview_optimized`、`extracted_text` 等；`converted_pdf` 预留未实现 | 框架可复用，但文档转换链还未落地 | P2 | 可直接作为 ConversionOption 执行后端，减少新框架开发 |
| 未发送预览资产污染历史 | message 绑定来自 `commitDraftToUserMessage/attachDraftToMessage` 的 draft attachments；preview 不自动写 messageAttachment | 基本符合“不发送不入历史” | P2 | 后续仅需保证新增 conversion preview 也不反向写 message |
| preflight gate 是否存在 | UI `onSend` 前调用 `preflightDraftAttachmentSendGate` 并重算 sendPlan（`appChatApp.logic.ts`） | 已有，但是 sendPlan 语义，不含 conversion stale/contentHash gate | P2 | 可在现有 preflight 插入 conversion/contentHash 校验 |
| 模型能力判断与 OpenRouter file input | `buildSendPlanModelDescriptor` 使用模型 modalities；providerContext 在 UI 固定 `supportsPdfInputs:true`（`appChatApp.logic.ts` 6163） | 固定 `supportsPdfInputs:true` 可能过于乐观，未体现模型/路由实时差异 | P1 | 后续应从模型目录能力或 provider 能力查询动态注入 |
| `.html` 判定策略 | 扩展名未知时 MIME `text/html` -> `unsupported(binary)`；扩展名 `.html` + MIME 缺失时会走扩展名规则（未定义，fallback） | 与最终方案“html 可 markdown/code/pdf”不一致 | P1 | 需新增 html 专用画像与转换候选生成 |
| docx/xlsx/csv/pdf/html 格式判断粒度 | 仍是 phase5 级别 `native/convertible/unsupported` | 不足以支撑“目标形态 + 引擎链 + 可预览可发送”的治理 | P1 | 后续先扩展规则层输出，再逐步接入转换执行 |
| OpenRouter 序列化安全护栏 | `resolveManagedStoragePath` 校验 storageUri、防越界、错误码覆盖齐（serializer + tests） | 与最终方案安全目标一致度较高 | P2 | 可直接复用，减少安全返工 |
| 本地绝对路径泄漏（日志） | UI `sanitizeSendPlanSummaryMessage` 脱敏；dialog 日志测试覆盖无路径输出 | 大部分日志已防护，但 `dialog:select-local-files` 返回原始 filePaths 给 renderer，后续若误日志仍有泄漏面 | P0 | 后续需审计 filePath 消费链与埋点，避免二次泄漏 |

重点确认结论：

- 当前是否仍按原始扩展名或 MIME 判断 incompatible：
  - 结论：SendPlan 不直接按原始扩展名判 incompatible；但 `inferFileProfile` 先把资产归类到 `aiPayloadKind/processingStatus`，该中间结果会影响 incompatible（`src/shared/files/fileRules.ts` + `infra/files/sendPlanService.ts`）。
- `.docx` 为什么可能在 text+image+file 模型下被判 incompatible：
  - 结论：更准确是先被 `conversion_required_before_send` 排除（`processingStatus=convertible`），不是因为缺少 text/image/file 模态本身（`infra/files/sendPlanService.ts`）。
- 是否已有 selected conversion option 或等价机制：
  - 结论：无。仅有 send mode 偏好，不是 conversion option（`infra/db/types.ts`）。
- 是否已有预览与发送同源机制：
  - 结论：图片预览与发送读取来源接近但未显式同源绑定；文档转换资产同源机制尚未实现（推测基于当前缺少 conversion asset 层）。
- 是否已有 DerivedAsset 或可复用 derivative job 框架：
  - 结论：有，且可复用（`infra/files/derivativeJobService.ts`）。
- 未发送预览资产是否可能污染历史消息：
  - 结论：当前链路下不直接污染，message 仅绑定 draft attachments（`infra/files/conversationAttachmentService.ts`）。
- 是否存在本地绝对路径进入日志的 P0 风险：
  - 结论：日志层已有多处脱敏与测试，但 `dialog:select-local-files` 返回绝对路径本身是高敏数据，若后续调用方误打日志可触发 P0（当前判定为“潜在 P0 风险”）。

#### 5. 给后续实现计划的输入

- 哪些现有模块可复用
  - `DerivativeJobService` + `file_derivatives`/`derivative_jobs` 数据层可直接承载文档转换产物生命周期。
  - `sendPlan.buildCurrent` / `sendPlan.prepareOpenRouter` / `openRouterSendPlanSerializer` 可作为发送前总线，不必重建。
  - `preflightDraftAttachmentSendGate` 可扩展 conversion/contentHash gate。

- 哪些模块必须解耦
  - `fileRules` 的“分类=发送语义”耦合需拆开：分类仅用于候选生成，最终兼容性应转到 selected conversion option。
  - UI 中固定 providerContext（尤其 `supportsPdfInputs:true`）需改为能力查询注入。
  - 预览状态与发送状态需从当前松耦合缓存，升级为“同一 DerivedAsset ID/contentHash 约束”。

- 哪些 P0/P1 风险应优先处理
  - P0：绝对路径在调用方日志二次泄漏风险（围绕 `dialog:select-local-files` 返回值消费链）。
  - P1：缺少 selected conversion option，导致 `.docx/.xlsx/.html` 无法按最终方案实现正确兼容性与预览发送同源。
  - P1：`processingStatus=convertible` 直接排除，阻断“先转换后按目标形态兼容”的主链路。

- 哪些能力适合首批小提交
  - 在不改 UI 行为前提下先引入 conversion option 数据结构与持久化（默认值映射当前行为）。
  - 在 sendPlan 输入中增加“已选目标形态/已就绪 derived asset”字段并保持向后兼容。
  - 扩展 preflight：增加 derived asset stale/contentHash 一致性校验骨架。

- 哪些能力应延后
  - 多引擎高级转换路径 UI（engineChain 选择）可后置。
  - HTML JS 渲染授权、外链策略细化、hybrid 首发可后置到后续 phase。

### 2026-04-29 实施计划重定向与新计划创建

- 完成：新增 `docs/file-pipeline/format-conversion-preview-implementation-plan.md`，作为后续实现的主执行计划。
- 完成：`docs/file-pipeline/format-conversion-preview-final.md` 的原分阶段落地计划章节已标记废弃，并重定向到 implementation plan。
- 完成：`docs/file-pipeline/README.md` 已新增 implementation plan 入口，并明确三者定位：
  - `format-conversion-preview-final.md` 是设计信源
  - `format-conversion-preview-implementation-plan.md` 是当前执行计划
  - `format-conversion-preview-progress.md` 是进度账本
- 下一步：进入 Step 0 风险护栏实施（日志与绝对路径防泄漏、prompt envelope escaping、未发送资产历史绑定防污染、hard gate 不可绕过、外部转换器沙箱前置边界）。

### 2026-04-29 Step 0 风险护栏执行

- 本轮核验范围
  - `electron/ipc/dialogIpc.ts` / `electron/ipc/dialogIpc.test.ts`
  - `src/next/openrouter/openRouterSendPreparation.ts` / `src/next/openrouter/openRouterSendPreparation.test.ts`
  - `src/next/openrouter/openRouterSendPlanSerializer.ts` / `src/next/openrouter/openRouterSendPlanSerializer.test.ts`
  - `infra/files/conversationAttachmentService.ts` / `infra/files/conversationAttachmentService.test.ts`
  - `infra/files/sendPlanService.ts` / `infra/files/sendPlanService.test.ts`
  - `src/ui-app/app/appChatApp.logic.ts` / `src/ui-app/AppChatApp.attachments.test.ts`

- 修改文件
  - `electron/ipc/dialogIpc.ts`
  - `electron/ipc/dialogIpc.test.ts`
  - `src/next/openrouter/openRouterSendPlanSerializer.ts`
  - `src/next/openrouter/openRouterSendPlanSerializer.test.ts`
  - `infra/files/conversationAttachmentService.test.ts`
  - `docs/file-pipeline/format-conversion-preview-progress.md`

- 新增或更新测试
  - `electron/ipc/dialogIpc.test.ts`
    - 新增 `dialog:select-local-files` 异常日志脱敏回归：断言路径与 base64 不泄漏。
  - `src/next/openrouter/openRouterSendPlanSerializer.test.ts`
    - 新增 prompt envelope metadata escaping 回归：文件名与 URL 元数据中的换行/控制字符被规范化。
  - `infra/files/conversationAttachmentService.test.ts`
    - 新增历史绑定防污染回归：`attachDraftToMessage` 仅绑定当前 draft 附件，不引入 preview-only 资产。

- 已落实护栏
  - 本地绝对路径日志防泄漏：`dialogIpc` 异常日志改为脱敏消息输出（路径/base64 redaction）。
  - 文件正文不得进入日志：`dialogIpc` 异常路径增加 base64/data-url redaction，避免正文片段进入日志。
  - prompt envelope metadata escaping：OpenRouter serializer 在文件名与 URL 文本注入点加统一 metadata 文本净化。
  - 未发送预览资产不得进入历史消息：补回归测试，固定仅由 draft 附件集合生成 message attachment。
  - 外部转换器默认关闭：现状核验与既有测试确认 `converted_pdf` 为 `conversion_not_implemented`，未进入 sendable 主路径。

- 未能完全落实但已记录后续事项
  - 超大文本 hard gate：本轮未发现 `maxConvertedText`/等价硬阈值在 `sendPlan/preflight` 的后端强约束实现；需在 Step 1/2 结合 Send Plan 语义层补齐可测试的硬 gate。
  - Renderer 消费侧防误日志：`dialog:select-local-files` 返回 `filePaths` 仍属高敏输入，需继续沿消费链补充“禁止直接日志输出”的约束与测试。

- 测试命令与结果
  - `npx vitest --run electron/ipc/dialogIpc.test.ts`：通过（6/6）。
  - `npx vitest --run src/next/openrouter/openRouterSendPreparation.test.ts`：通过（2/2）。
  - `npx vitest --run src/next/openrouter/openRouterSendPlanSerializer.test.ts`：通过（23/23）。
  - `npx vitest --run infra/files/sendPlanService.test.ts`：跳过（15 skipped；本机 BetterSqlite3 能力门控导致）。
  - `npx vitest --run infra/files/conversationAttachmentService.test.ts`：跳过（11 skipped；本机 BetterSqlite3 能力门控导致）。
  - `npx vitest --run src/ui-app/AppChatApp.attachments.test.ts`：失败（3 个现存 UI 用例，`composer-attach-file/url` 指针交互被 `pointer-events: none` 阻断；与本轮改动无直接耦合）。

- 是否发现实际 P0 泄漏
  - 未发现“已发生”的本地绝对路径/文件正文日志泄漏；发现并加固的是异常日志面的“潜在 P0 泄漏”。

- 下一步是否可以进入 Step 1
  - 可以进入 Step 1，但建议先处理两项前置：
    1. 在可运行 BetterSqlite3 的 CI/环境补跑 `sendPlanService` 与 `conversationAttachmentService`。
    2. 先排查并稳定 `AppChatApp.attachments` 中 3 个 `pointer-events` 失败用例，避免后续阶段回归噪音扩大。

### 2026-04-29 Step 0 收口与测试稳定化

- 本轮核验范围
  - `src/ui-app/AppChatApp.attachments.test.ts` 三个失败用例（`composer-attach-file/url`）。
  - BetterSqlite3 门控测试：`infra/files/sendPlanService.test.ts`、`infra/files/conversationAttachmentService.test.ts`。
  - hard gate 接入点检索：`infra/files/sendPlanService.ts`、`src/ui-app/app/appChatApp.logic.ts`（`hard gate|maxConvertedText|maxPromptContext|estimatedTokens|sizeBytes|blockingReasons|SendPlanStatus|evaluateComposerSendPlanGate`）。

- UI 测试失败原因
  - 根因不是 Step 0 业务逻辑改动，而是测试环境（jsdom）下附件菜单依赖 `getBoundingClientRect`/测量流程，按钮在菜单未就绪时出现 `pointer-events: none` 或菜单关闭，导致早点点击失败。
  - 归类：测试脆弱性（布局测量 mock 缺失），非用户可见功能回归。

- UI 测试修复结果
  - 已在 `src/ui-app/AppChatApp.attachments.test.ts` 对 3 个上传入口用例补充最小布局 mock（`mockAttachmentMenuLayout`），并保持现有 UI 行为不变。
  - 修复后 `AppChatApp.attachments.test.ts` 全量通过（37/37）。

- BetterSqlite3 门控测试状态
  - `infra/files/sendPlanService.test.ts`：15 skipped。
  - `infra/files/conversationAttachmentService.test.ts`：11 skipped。
  - 现环境无法补跑的直接原因：`better-sqlite3` native ABI 不匹配（模块编译目标 `NODE_MODULE_VERSION 139`，当前 Node 需要 `127`）。
  - 当前仓库门控方式是各测试内 `canOpenBetterSqlite()` 探测并 `describe.skip`，未发现可通过环境变量直接绕过/启用的项目约定。
  - 补跑前置条件：在目标环境完成 `better-sqlite3` 与当前 Node ABI 对齐（常见方式：`npm rebuild better-sqlite3` 或按项目标准 Node 版本重装依赖后重跑）。

- hard gate 当前可验证性判断
  - 现状：`SendPlanService` 已有 parsing/incompatible/no_sendable_current_input 等阻断链路，但未检索到 `maxConvertedText`/`maxPromptContext`/`estimatedTokens` 等“超大转换文本硬阈值”后端判定输入与执行点。
  - 结论：Step 0 无法在不引入 Step 1/2 语义层前提下补齐“超大文本 hard gate”完整实现；该项需由 Step 1/2/3（语义层 + 转换资产 + token/bytes 估算）承接。
  - 同时确认：当前未发现 UI 分支可以绕过既有 `sendPlan.status=blocked` 与 `blockingReasons` 的发送阻断。

- 本轮修改文件
  - `src/ui-app/AppChatApp.attachments.test.ts`

- 测试命令与结果
  - `npx vitest --run src/ui-app/AppChatApp.attachments.test.ts`：通过（37 passed）。
  - `npx vitest --run electron/ipc/dialogIpc.test.ts`：通过（6 passed）。
  - `npx vitest --run src/next/openrouter/openRouterSendPreparation.test.ts`：通过（2 passed）。
  - `npx vitest --run src/next/openrouter/openRouterSendPlanSerializer.test.ts`：通过（23 passed）。
  - `npx vitest --run infra/files/sendPlanService.test.ts`：跳过（15 skipped，BetterSqlite3 ABI 门控）。
  - `npx vitest --run infra/files/conversationAttachmentService.test.ts`：跳过（11 skipped，BetterSqlite3 ABI 门控）。

- Step 0 是否正式闭合
  - 结论：可判定“条件性闭合”。
  - 已闭合：日志与脱敏护栏回归、附件历史污染回归、UI 附件入口失败稳定化。
  - 未闭合但已登记债务：超大文本 hard gate 的后端阈值化实现（需 Step 1/2/3 承接）；BetterSqlite3 门控测试需在 ABI 对齐环境补跑。

- 是否允许进入 Step 1
  - 结论：允许进入 Step 1（语义层建模与 Send Plan 解耦），前提是将“BetterSqlite3 补跑”列为进入 Step 1 期间的并行验证任务。

- 进入 Step 1 前注意事项
  - 不在 Step 1 中绕过或移除 BetterSqlite3 门控；应先补齐 ABI 对齐环境回归。
  - Step 1 改动要继续保持日志白名单与 metadata escaping 入口不回退。
  - Step 1 新增语义字段时，同步设计 hard gate 所需输入字段（converted text bytes/token estimate）但不提前接入真实转换器。

### 2026-04-29 Step 1 第一提交：语义层基线

#### 本轮目标

- 引入最小 selected conversion option / targetKind / sendStrategy 语义层基线。
- 不迁移 Send Plan eligibility 主判定，仅建立旧字段到新语义的兼容映射。
- 保持现有 UI 与 OpenRouter payload 行为不变。

#### 本轮定点核验范围

- 关键词检索：`aiPayloadKind`、`processingStatus`、`preferredSendMode`、`SendPlanAttachment`、`blockingReasons`、`conversion_required_before_send`、`compatible/incompatible`、`file_in/text_in`、`pdf/docx/xlsx/csv/html`。
- 关键落点：
  - `src/shared/files/sendPlanTypes.ts`
  - `infra/files/sendPlanService.ts`
  - `src/next/ipc/contracts/dbBridgeContracts.ts`
  - `src/next/openrouter/openRouterSendPlanSerializer.ts`
  - 相关测试文件

#### 修改文件

- `src/shared/files/sendPlanTypes.ts`
- `infra/files/sendPlanService.ts`
- `src/next/ipc/contracts/dbBridgeContracts.ts`
- `infra/files/sendPlanService.test.ts`
- `src/next/openrouter/openRouterSendPlanSerializer.test.ts`

#### 新增或扩展的类型

- `AttachmentTargetKind`：`plain_text | markdown | code | table_markdown | pdf_attachment | native_file | hybrid | unsupported`
- `AttachmentSendStrategy`：`text_in_prompt | file_attachment | mixed | unsupported`
- `AttachmentSemanticSummary`：`{ targetKind, sendStrategy, mappedFromLegacy: true }`
- `SendPlanAttachment` 新增只读字段：`semantic`

说明：本轮未引入完整 `selectedOption`/`engineChain`/`settingsHash` 结构，仅提供最小语义摘要以支撑后续迁移。

#### 旧字段到新语义映射规则（兼容基线）

当前由 `aiPayloadKind + processingStatus` 归一化映射：

- `processingStatus=unsupported` -> `targetKind=unsupported`，`sendStrategy=unsupported`
- `processingStatus=convertible` -> `targetKind` 按 payload 默认映射（如 `pdf->pdf_attachment`），`sendStrategy=unsupported`
- `processingStatus` 可直接发送时：
  - `text` -> `plain_text + text_in_prompt`
  - `pdf` -> `pdf_attachment + file_attachment`
  - `image/audio/video` -> `native_file + file_attachment`
  - `binary` -> `unsupported + unsupported`

补充：`dbBridgeContracts` 对缺失 `semantic` 的旧返回做兼容填充，避免跨层解码回归。

#### 当前保持不变的行为

- Send Plan eligibility 主链仍基于现有规则，不做主语义迁移。
- `processingStatus=convertible`（例如 `.docx`）仍保持 `conversion_required_before_send` 语义，不会被本轮错误放行。
- OpenRouter serializer 仍按 `aiPayloadKind + selectedSendMode` 产出 payload；新增语义字段不改变实际 content parts。
- UI 附件展示与发送行为未变。

#### 新增/更新测试

- `infra/files/sendPlanService.test.ts`
  - 新增语义摘要输出断言（text/pdf）
  - 新增 convertible 场景保持 blocked 的回归断言
- `src/next/openrouter/openRouterSendPlanSerializer.test.ts`
  - 新增“semantic 与 legacy payload kind 不一致时，序列化 payload 行为保持稳定”测试

#### 测试命令与结果

- `npx vitest --run src/next/openrouter/openRouterSendPreparation.test.ts` -> 通过（2）
- `npx vitest --run src/next/openrouter/openRouterSendPlanSerializer.test.ts` -> 通过（24）
- `npx vitest --run src/ui-app/AppChatApp.attachments.test.ts` -> 通过（37）
- `npx vitest --run electron/ipc/dialogIpc.test.ts` -> 通过（6）
- `npx vitest --run infra/files/sendPlanService.test.ts` -> skipped（17）

#### BetterSqlite3 测试状态

- `infra/files/sendPlanService.test.ts` 仍受 BetterSqlite3 ABI 门控影响，当前环境未执行用例，仅显示 skipped。
- 本轮未改门控策略；后续需在 ABI 匹配环境补跑。

#### 下一步建议

- 可进入 Step 1 第二提交（Send Plan eligibility 迁移准备）。
- 优先把 `semantic.targetKind/sendStrategy` 接入 eligibility 判定入口（先双轨比对，再切主链），并保持 `.docx` 行为在“未选转换产物”阶段不放行。

### 2026-04-29 Step 1 第二提交：Send Plan eligibility 迁移准备

#### 本轮目标

- 梳理 Send Plan compatibility / eligibility 主判定链路，并为后续迁移到 `semantic.targetKind/sendStrategy` 建立结构入口。
- 在不改变默认生产行为的前提下，明确 legacy 与 semantic 判定边界。
- 增加可独立运行（不依赖 BetterSqlite3）的 semantic eligibility 单测。

#### 本轮修改文件

- `infra/files/sendPlanService.ts`
- `infra/files/sendPlanService.test.ts`

#### 新增或整理的 helper

- `evaluateAttachmentCompatibilityByMode(...)`
  - 新增内部模式分发：`legacy | semantic`。
  - 默认生产路径仍固定调用 `legacy`。
- `evaluateCompatibilityFromLegacy(...)`
  - 从原 `evaluateCompatibilityForAttachment` 抽出旧判定主链，逻辑保持不变。
- `evaluateCompatibilityFromSemantic(...)`
  - 新增 semantic 判定 helper：读取 `buildAttachmentSemanticSummary(...)` 并按 `targetKind/sendStrategy` 计算能力集。
- `capabilitySetsForSemantic(...)`
  - 新增 semantic 能力集映射：
    - `text_in_prompt` -> `text_in`
    - `file_attachment + pdf_attachment` -> `file_in` 或 `text_in`（并受 `supportsPdfInputs` 限制）
    - `file_attachment + native_file` -> `file_in`
    - `unsupported` -> 空集
- `semanticCompatibilityMissingReason(...)`
  - 新增 semantic 缺能力原因码映射。
- `__sendPlanEligibilityInternals`
  - 暴露测试专用内部 helper（legacy/semantic 对比与独立验证）；不影响 UI、serializer 与发送链路。

#### legacy 判定与 semantic 判定关系

- 当前默认：`evaluateCompatibilityForAttachment(...)` -> `evaluateAttachmentCompatibilityByMode(..., 'legacy')`。
- semantic 判定已可单独验证，但未切换生产主链。
- 语义迁移策略：先保持双轨结构，再在后续提交把 selected option 接入 semantic，并逐步切主。

#### 当前保持不变的行为

- `processingStatus=convertible`（如 docx 映射场景）仍返回 `conversion_required_before_send`，不会被错误放行。
- 现有 Send Plan status / blockingReasons / included/excluded 结果不因本次重构而扩大可发送范围。
- OpenRouter payload 序列化逻辑未改（仍由 `aiPayloadKind + selectedSendMode` 驱动）。
- UI 附件行为未改。

#### 新增测试

- `infra/files/sendPlanService.test.ts` 新增无 BetterSqlite3 依赖的 `SendPlanService semantic eligibility internals` 组：
  - semantic `text_in_prompt` 在 `text_in` 模型能力下可兼容。
  - semantic `pdf_attachment` 在 `supportsPdfInputs=false` 时阻断。
  - semantic `unsupported` 必阻断。
  - `convertible` 在 semantic 模式下仍阻断（`conversion_required_before_send`）。

#### 测试命令与结果

- `npx vitest --run src/next/openrouter/openRouterSendPreparation.test.ts` -> 通过（2）
- `npx vitest --run src/next/openrouter/openRouterSendPlanSerializer.test.ts` -> 通过（24）
- `npx vitest --run src/ui-app/AppChatApp.attachments.test.ts` -> 通过（37）
- `npx vitest --run electron/ipc/dialogIpc.test.ts` -> 通过（6）
- `npx vitest --run infra/files/sendPlanService.test.ts` -> 通过（4 passed, 17 skipped）

#### BetterSqlite3 状态

- `infra/files/sendPlanService.test.ts` 的数据库集成用例仍因 BetterSqlite3 ABI 门控跳过（17 skipped）。
- 本轮新增 semantic helper 测试为纯单测，可在当前环境直接执行，避免门控导致无验证。

#### 下一步建议

- 可以进入 Step 1 第三提交（selected option 接入准备或 eligibility 切换）。
- 建议下一步先把“selected option 覆盖 semantic mapper”的入口接好，保持 legacy fallback，再做定向用例对齐（docx text/markdown vs pdf_attachment）。

### 2026-04-29 Step 1 第三提交：语义层与 eligibility 解耦收尾

#### 修改文件

- `infra/files/sendPlanService.ts`
- `infra/files/sendPlanService.test.ts`
- `src/shared/files/sendPlanTypes.ts`
- `src/next/ipc/contracts/dbBridgeContracts.ts`

#### 本轮完成内容

- 收敛 `SendPlan` compatibility 主入口：`evaluateCompatibilityForAttachment(...)` 现在统一经过 `resolveEligibilityEvaluationMode(...)` + `evaluateAttachmentCompatibilityByMode(...)`。
- 建立语义优先、legacy 回退结构：
  - attachment 带显式 `semantic` 时走 `semantic` 判定主干。
  - attachment 缺失 `semantic` 时走 `legacy` 回退。
- 新增 `resolveAttachmentSemanticSummary(...)`，用于“显式 semantic 优先；缺失时按 legacy 映射补齐”。
- 将 `SendPlanAttachment.semantic.mappedFromLegacy` 从字面量 `true` 放宽为 `boolean`，并同步 IPC schema，确保后续 selected option 可以表达 `mappedFromLegacy=false`。

#### legacy 与 semantic 当前关系

- 生产主流程已通过统一入口进行 compatibility 判定。
- 当前真实数据路径下（尚未接入 selected option 持久化）大多数 attachment 仍由 legacy 映射得到 semantic；这保证行为兼容。
- semantic 判定链已经可独立测试，并可消费显式 semantic（后续 Step 2/3 可直接接入）。

#### Step 1 验收情况

- 已具备 semantic 摘要类型与 `SendPlanAttachment.semantic` 输出。
- compatibility/eligibility 具备 semantic-aware 统一入口，且保留 legacy 回退。
- 生产行为未扩大可发送范围。
- `convertible/.docx` 在无 ready converted asset 前仍阻断（`conversion_required_before_send`）。
- OpenRouter payload 相关测试保持通过，未发生序列化语义变更。

#### semantic eligibility 当前覆盖

- `plain_text + text_in_prompt`
- `markdown + text_in_prompt`
- `code + text_in_prompt`
- `table_markdown + text_in_prompt`
- `pdf_attachment + file_attachment`
- `native_file + file_attachment`
- `unsupported + unsupported`

说明：以上为判定能力覆盖；未接入真实转换产物前，`convertible` 仍按阻断处理，不会被放行。

#### 保持不变的行为

- 未实现 selected conversion option，不改持久化结构。
- 未迁移 Send Plan 其余主语义与 UI 展示行为。
- 未接入真实转换器（DOCX/XLSX/CSV/HTML/PDF/PS/EPS）。
- 未扩大可发送附件集合。

#### 转入 Step 2/3 的债务

- Step 2：预览资产与发送资产同源约束（contentHash / selected 资产绑定）与历史绑定防污染强化。
- Step 2：selected option 到 semantic 的真实覆盖路径（非 legacy 映射）。
- Step 3：按目标类型推进 eligibility 主迁移（在 ready converted asset 前提下放行）。
- BetterSqlite3 ABI 环境下的服务层全量补跑仍待执行。

#### 测试命令与结果

- `npx vitest --run src/next/openrouter/openRouterSendPreparation.test.ts` -> 通过（2）
- `npx vitest --run src/next/openrouter/openRouterSendPlanSerializer.test.ts` -> 通过（24）
- `npx vitest --run src/ui-app/AppChatApp.attachments.test.ts` -> 通过（37）
- `npx vitest --run electron/ipc/dialogIpc.test.ts` -> 通过（6）
- `npx vitest --run infra/files/sendPlanService.test.ts` -> 通过（8 passed, 17 skipped）

#### BetterSqlite3 状态

- `infra/files/sendPlanService.test.ts` 中依赖 BetterSqlite3 的集成用例仍受 ABI 门控影响，当前为 `17 skipped`。
- 本轮未修改门控逻辑，符合 Step 1 约束。

#### 是否可以进入 Step 2

- 可以进入 Step 2（预览-发送同源与历史绑定强化）。
- 进入 Step 2 时应保持“无 ready converted asset 不放行”的保守策略，避免提前扩大发送范围。

### 2026-04-29 Step 2：预览-发送同源与历史绑定强化

#### 本轮目标

- 建立 preview/send 同源与 stale 最小校验骨架。
- 将 lineage/stale 校验接入 Send Plan（preflight 依赖 Send Plan 自动继承）。
- 强化历史绑定：仅绑定实际发送资产，且禁止 preview-only/derived 资产污染历史。
- 保持 OpenRouter payload 与 UI 功能行为不变。

#### 修改文件

- `src/shared/files/sendPlanTypes.ts`
- `infra/files/sendPlanService.ts`
- `src/next/ipc/contracts/dbBridgeContracts.ts`
- `infra/db/types.ts`
- `infra/db/validation.ts`
- `infra/files/conversationAttachmentService.ts`
- `infra/files/sendPlanService.test.ts`
- `infra/files/conversationAttachmentService.test.ts`
- `src/next/openrouter/openRouterSendPlanSerializer.test.ts`

#### 新增或复用的 lineage/stale helper

- `infra/files/sendPlanService.ts`
  - `evaluateAttachmentLineageSummary(...)`
  - `evaluateAttachmentLineageGuard(...)`
  - `lineageBlockingMessage(...)`
  - `valuePairMismatch(...)`
- `SendPlanAttachment` 新增 `lineage` 摘要字段（`AttachmentLineageSummary`），用于表达：
  - `state`
  - `stale/staleReason`
  - `sourceHash/previewContentHash/sendContentHash/conversionSettingsHash`

#### Send Plan / preflight 接入点

- `buildDraftAttachmentPlan(...)` 与 `buildHistoryAttachmentPlan(...)` 现已在兼容性判定前接入 `lineageGate`。
- 当 lineage state 为以下值时进入阻断：
  - `preview_only_asset_not_sendable`
  - `stale_derived_asset`
  - `preview_send_asset_mismatch`
  - `send_asset_not_ready`
- 由于 UI preflight 依赖 `buildCurrentSendPlan`，上述阻断自动体现在 preflight gate 中。

#### 历史绑定强化点

- `ConversationAttachmentService` 新增 draft 迁移守卫：
  - `resolveDraftAttachmentMigration(...)`
  - `isMessageBindableAsset(...)`
- `commitDraftToUserMessage` 与 `attachDraftToMessage` 支持可选 `sentAssetIds` 白名单。
- 即使未传 `sentAssetIds`，也会过滤不可绑定资产（例如 `sourceKind='derived'` 或 `previewOnly=true`），防止 preview-only 资产进入 `message_attachments`。

#### 当前保持不变的行为

- 未接入真实转换器；`converted_pdf/send_optimized` 仍保持未实现状态。
- `.docx/convertible` 无 ready converted asset 时仍是 `conversion_required_before_send` 阻断。
- OpenRouter serializer/request payload 未改语义。
- UI 功能行为未做扩展性改造。

#### 测试命令与结果

- `npx vitest --run infra/files/derivativeJobService.test.ts` -> skipped（14，BetterSqlite3 ABI 门控）
- `npx vitest --run src/next/openrouter/openRouterSendPreparation.test.ts` -> 通过（2）
- `npx vitest --run src/next/openrouter/openRouterSendPlanSerializer.test.ts` -> 通过（24）
- `npx vitest --run src/ui-app/AppChatApp.attachments.test.ts` -> 通过（37）
- `npx vitest --run electron/ipc/dialogIpc.test.ts` -> 通过（6）
- `npx vitest --run infra/files/sendPlanService.test.ts` -> 通过（10 passed, 18 skipped）
- `npx vitest --run infra/files/conversationAttachmentService.test.ts` -> skipped（12，BetterSqlite3 ABI 门控）

#### BetterSqlite3 状态

- `infra/files/derivativeJobService.test.ts` 与 `infra/files/conversationAttachmentService.test.ts` 仍受 ABI 门控跳过。
- 本轮未修改门控逻辑，符合阶段约束。

#### Step 2 完成情况

- Step 2 目标在当前代码结构下已形成可测试闭环：
  - 有最小 lineage helper；
  - stale/mismatch/preview-only 可阻断发送；
  - 历史绑定新增守卫，避免 preview-only 污染；
  - OpenRouter payload 未被破坏。
- 仅保留一项小补尾：`branch.beginTurn -> attachConversationDraft` 未来可在 Step 3/4 接入 `sentAssetIds` 透传，以实现“严格按本次 sendPlan includedAssets 绑定”的端到端闭环。

#### 转入 Step 3 的债务

- 继续推进 selected option 与真实 converted/send asset 绑定（当前仍以最小 metadata/guard 方式表达 lineage）。
- 文本与结构化转换首批能力（plain_text/markdown/code/table_markdown、CSV/TSV）。
- 若后续引入 send asset 物化，需把 `sendAssetReady/contentHash` 从约定 metadata 收敛为统一来源字段。

### 2026-04-29 Step 3：文本与结构化转换首批能力

#### 本轮目标

- 完成文本类默认目标路径（plain_text / markdown / code / table_markdown）。
- 落地 CSV/TSV -> table_markdown 的首批转换能力。
- 将文本转换结果接入 `preview_and_send` 等价链路，并接入 Step 2 的 lineage/stale 约束。
- 补齐 `sentAssetIds` 在发送链路中的端到端透传。
- 在 Send Plan 层增加 converted text bytes hard gate。

#### 修改文件

- `infra/files/derivativeJobService.ts`
- `infra/files/sendPlanService.ts`
- `infra/db/worker/handlers/filePipelineHandlers.ts`
- `infra/db/worker/handlers/branchContextHandlers.ts`
- `infra/db/types.ts`
- `infra/db/validation.ts`
- `src/next/branch/branchClient.ts`
- `src/next/files/conversationDraftClient.ts`
- `src/next/openrouter/openRouterSendPlanSerializer.ts`
- `src/ui-app/app/appChatApp.logic.ts`

#### 实现的 targetKind / sendStrategy

- `.txt`/`text/plain`：`plain_text + text_in_prompt`
- `.md`/`.markdown`：`markdown + text_in_prompt`
- 常见源码/脚本/配置后缀：`code + text_in_prompt`
- `.csv`/`.tsv`：`table_markdown + text_in_prompt`

说明：`docx/xlsx/pdf/html/ps-eps/hybrid` 不在本轮实现范围，仍保持原阻断策略。

#### 新增或复用的 derivative/send asset 机制

- 复用 `DerivedKind='extracted_text'` 作为文本/结构化转换产物容器，不新增重型持久化模型。
- 在 `sendPlan.buildCurrent` 与 `sendPlan.prepareOpenRouter` 前，按 attachment semantic 自动确保文本派生产物（`ensureTextDerivativesForCollected`）。
- 通过 `file_assets.source_meta_json` 写入最小 `textConversion` + `lineage` 元数据：
  - `usage: preview_and_send`
  - `sendAssetReady`
  - `sendTextStorageUri`
  - `sendTextBytes`
  - `previewContentHash/sendContentHash/sourceHash/conversionSettingsHash`

#### CSV/TSV table_markdown 策略

- 在 `DerivativeJobService.runExtractedTextJob` 中按后缀自动识别表格文本目标。
- 支持：
  - 逗号/制表符分隔
  - 引号字段
  - 双引号转义（`""`）
  - 引号内换行
- 输出完整 markdown table（含表头分隔线），不做默认摘要替代。

#### Send Plan / preflight 接入点

- `SendPlanService.collectCurrentSendInputs` 为 draft/history 附件补默认 semantic（基于文件后缀/MIME）。
- semantic 路径下，`processingStatus=convertible` 在满足“text target + ready converted asset”时可通过 compatibility；否则继续 `conversion_required_before_send`。
- `selectAttachmentSendModeInternal` 支持 “text_in_prompt + ready converted asset” 下选择 `inline_base64`（即使原始本地副本不可用）。
- preflight 复用 `sendPlan.buildCurrent`，自动继承上述阻断与放行结果。

#### hard gate 实现范围

- 新增 converted text bytes hard gate：
  - 阈值：`2 MiB`（`MAX_CONVERTED_TEXT_BYTES_HARD`）
  - 检查位置：`SendPlanService`（draft/history plan 构建时）
  - 超限结果：`blocked`，`exclusionReason=converted_text_hard_limit_exceeded`
- 本轮未实现 token 估算 gate（缺稳定输入），保留给后续阶段。

#### sentAssetIds 透传状态

- 已补齐发送主链路：
  - `ui-app onSend` 从 `prepared.sendPlan.includedAttachments` 生成 `sentAssetIds`
  - `branch.beginTurn` 请求新增可选 `sentAssetIds`
  - worker `branch.beginTurn` 在 `attachConversationDraft` 时传给 `attachDraftToMessage`
  - `conversationAttachmentService` 现有白名单迁移守卫生效
- 结果：历史绑定可按本次实际发送资产收敛，避免预览或未发送资产误绑定。

#### 当前保持不变的行为

- 未接入真实 Office/PDF/HTML/PS-EPS 转换器。
- 未引入 selected conversion option UI/持久化。
- 未改 OpenRouter 多模态主 payload 结构（仅 text attachment 优先读取 converted text 产物）。
- `.docx/convertible` 在无 ready converted asset 前仍不可发送。

#### 测试命令与结果

- `npx vitest --run infra/files/derivativeJobService.test.ts` -> skipped（14，BetterSqlite3 ABI 门控）
- `npx vitest --run infra/files/sendPlanService.test.ts` -> 通过（10 passed, 18 skipped）
- `npx vitest --run infra/files/conversationAttachmentService.test.ts` -> skipped（12，BetterSqlite3 ABI 门控）
- `npx vitest --run src/next/openrouter/openRouterSendPreparation.test.ts` -> 通过（2）
- `npx vitest --run src/next/openrouter/openRouterSendPlanSerializer.test.ts` -> 通过（24）
- `npx vitest --run src/ui-app/AppChatApp.attachments.test.ts` -> 通过（37）
- `npx vitest --run electron/ipc/dialogIpc.test.ts` -> 通过（6）

#### BetterSqlite3 状态

- `infra/files/derivativeJobService.test.ts`、`infra/files/conversationAttachmentService.test.ts` 仍受 ABI 门控跳过。
- 本轮未修改门控逻辑，按阶段要求仅记录状态。

#### Step 3 完成情况

- Step 3 目标已形成单轮闭环：
  - 文本/CSV 默认 semantic 路径落地；
  - 转换产物进入 send asset 元数据链路；
  - Send Plan/preflight 可基于 ready converted text 进行判定；
  - converted text hard gate 已接入；
  - `sentAssetIds` 发送链路透传已闭合。

#### 转入 Step 4 的债务

- Office 与 PDF 主路径（DOCX/RTF/DOC、XLSX/XLS、PDF attachment 深化）。
- selected conversion option 持久化与用户可选路径 UI。
- token 级别 gate、soft gate 与更细粒度 warning 体系。

### 2026-04-29 Step 4：Office 与 PDF 主路径

#### 本轮目标

- 推进 Office 与 PDF 主路径的 Step 4 基线。
- 在不引入新依赖与不接入不受控外部进程前提下，落实可复用语义映射、能力 gate 与受控不可用路径。
- 保持 Step 0/1/2/3 安全与发送范围不回退。

#### 修改文件

- `infra/files/sendPlanService.ts`
- `infra/files/derivativeJobService.ts`
- `infra/db/worker/handlers/filePipelineHandlers.ts`
- `infra/files/sendPlanService.test.ts`
- `docs/file-pipeline/format-conversion-preview-progress.md`

#### XLSX/XLS 实现范围

- 已在 Send Plan 默认 semantic 映射中将 `convertible + .xlsx/.xls` 归入 `table_markdown + text_in_prompt`（为后续 selected option 与真实转换器接入预留主入口）。
- 当前仓库无 SheetJS/同类解析依赖；未实现真实 workbook 解析。
- 对 `.xlsx/.xls` 文本派生请求，当前返回受控 `conversion_not_implemented`，并写入转换失败元数据与 lineage stale 状态，不进入 sendable。

#### DOCX/RTF/DOC 实现范围

- 已在 Send Plan 默认 semantic 映射中将 `convertible + .docx/.doc/.rtf` 归入 `markdown + text_in_prompt`（语义主路径已建立）。
- 当前仓库无 Mammoth/Pandoc/可复用 zip-docx 解析链；未实现真实 markdown 提取。
- 对 `.docx/.doc/.rtf` 文本派生请求，当前返回受控 `conversion_not_implemented`，并写入转换失败元数据与 lineage stale 状态，不进入 sendable。

#### PDF attachment gate 实现范围

- 已收紧 compatibility gate：`pdf_attachment + file_attachment` 仅接受 `file_in`，不再把 `text_in` 视为可满足能力。
- legacy 与 semantic 两条 capability 集均同步收紧。
- `supportsPdfInputs=false` 仍直接阻断。
- 不支持时不回退 text-only 路径。

#### Office -> PDF attachment 是否接入

- 未接入。
- 原因：仓库内未发现已完成的安全 external-process sandbox runner（含禁网、临时目录隔离、超时、脱敏日志）可直接复用；按 Step 0 护栏要求不强接 LibreOffice/soffice。
- Step 4 唯一补尾项：在 sandbox runner policy 完成后，接入 Office->PDF (`converted_pdf`) 主路径并补回归测试。

#### Send Plan / preflight / serializer 接入点

- `SendPlanService.buildDefaultSemanticSummary(...)`：增加 Office 后缀默认语义映射。
- `SendPlanService.capabilitySetsForLegacyAttachment(...)` 与 `capabilitySetsForSemantic(...)`：收紧 PDF gate 为 `file_in`。
- `filePipelineHandlers.ensureTextDerivativesForCollected(...)`：对 non-retryable conversion failure（含 `conversion_not_implemented`）停止重复尝试，避免每次 sendPlan build 重复触发失败作业。
- `writeAssetConversionFailureMeta(...)`：`lineage.staleReason` 记录具体错误码，便于 preflight/诊断输出。

#### lineage/stale/sentAssetIds 状态

- 维持 Step 2/3 闭环：
  - Office 未实现转换不会进入 send asset ready；
  - 通过 lineage stale 阻断发送；
  - 不会绕过 sentAssetIds 历史绑定白名单。

#### 当前保持不变的行为

- 未接入 XLSX/DOCX 的真实解析转换引擎。
- 未接入 Office->PDF 外部转换器。
- 未进入 HTML / PS-EPS / Hybrid。
- 未扩大可发送范围；无 ready converted asset 的 Office 文件仍不可发送。

#### 测试命令与结果

- `npx vitest --run infra/files/derivativeJobService.test.ts` -> skipped（14，BetterSqlite3 ABI 门控）
- `npx vitest --run infra/files/sendPlanService.test.ts` -> 通过（12 passed, 18 skipped）
- `npx vitest --run infra/files/conversationAttachmentService.test.ts` -> skipped（12，BetterSqlite3 ABI 门控）
- `npx vitest --run src/next/openrouter/openRouterSendPreparation.test.ts` -> 通过（2）
- `npx vitest --run src/next/openrouter/openRouterSendPlanSerializer.test.ts` -> 通过（24）
- `npx vitest --run src/ui-app/AppChatApp.attachments.test.ts` -> 通过（37）
- `npx vitest --run electron/ipc/dialogIpc.test.ts` -> 通过（6）

#### BetterSqlite3 状态

- 相关 DB 集成测试仍受 ABI 门控影响而 skipped；本轮仅记录，不改门控。

#### Step 4 完成情况

- Step 4 在“无新增依赖、无安全 runner”约束下已完成主干可落地部分：
  - Office semantic 主路径入口建立；
  - PDF attachment capability gate 收紧并测试覆盖；
  - Office 未实现转换走受控不可用并纳入 lineage/stale 阻断。
- 保留唯一补尾项：sandbox runner 就绪后接入 Office->PDF `converted_pdf`。

#### 转入 Step 5 的债务

- HTML 主路径与安全执行策略。
- PS/EPS 路径与受控外部转换。
- Hybrid strategy 与后段能力整合。
- Step 4 唯一补尾项（Office->PDF on sandbox runner）若未先闭合，需在 Step 5 初期优先补齐。
- 注意：上条为早期阶段性建议，已被后续收官口径覆盖。external converter runtime / sandbox runner 统一作为独立后续任务，不回灌 Step 5 主线。

### 2026-04-29 Step 5：HTML / PS-EPS / Hybrid 与后段能力

#### 本轮目标

- 落地 HTML 安全主路径（不执行 JS、不加载外链）。
- 落地 PS/EPS 安全主路径（代码文本）。
- 建立 Hybrid 最小 Send Plan 支持（仅允许 ready text + ready file/PDF 组合，不自动降级 text-only）。
- 保持 HTML/PS-EPS PDF 路径在无 sandbox runner 时 controlled unavailable。
- 保持 Step 0/1/2/3/4 行为不回退。

#### 修改文件

- `src/shared/files/fileRules.ts`
- `src/shared/files/fileRules.test.ts`
- `infra/files/derivativeJobService.ts`
- `infra/files/derivativeJobService.test.ts`
- `infra/files/sendPlanService.ts`
- `infra/files/sendPlanService.test.ts`
- `docs/file-pipeline/format-conversion-preview-progress.md`

#### HTML 实现范围

- 分类层：
  - 新增 `.html/.htm` 扩展名规则为 `convertible + text`。
  - `text/html` MIME 从 `unsupported` 调整为 `convertible + text`。
- semantic 默认映射：
  - `convertible + html/htm/text/html` 默认映射为 `markdown + text_in_prompt`。
- 转换执行层（安全）：
  - `extracted_text` 增加 HTML 安全抽取路径：移除 `script/style`，不执行 JS，不加载外链。
  - 在 `metaJson.conversionWarnings` 输出诊断：
    - `html_javascript_not_executed`
    - `html_external_resources_not_loaded`
    - `html_script_style_removed_from_markdown`
  - HTML 源码/模板特征（如 `<script`、`{{`、`{%`）优先映射到 `code` 目标；文档型 HTML 映射 `markdown`。
- 仍不实现 HTML -> PDF 渲染（Chromium/Puppeteer 未接入）。

#### PS/EPS 实现范围

- 分类层：
  - 新增 `.ps/.eps` 扩展名规则为 `convertible + text`。
  - 新增 `application/postscript` MIME 为 `convertible + text`。
- semantic 默认映射：
  - `convertible + ps/eps/application/postscript` 默认映射为 `code + text_in_prompt`。
- 转换执行层：
  - 复用 `extracted_text` 文本解码与输出链路，作为 code 文本发送输入。
- PS/EPS -> PDF 仍为 controlled unavailable（未接 Ghostscript/sandbox runner）。

#### Hybrid 实现范围

- 在 Send Plan send-mode 选择链路增加 `semantic.sendStrategy === mixed` 分支：
  - 必须同时满足：
    - ready converted text asset（`lineage.sendAssetReady + sendTextStorageUri`）
    - ready file/PDF send asset（URL retained 或 local stored）
  - `aiPayloadKind=text` 的 mixed 明确阻断，防止自动降级为 text-only。
  - `aiPayloadKind=pdf` 且 `supportsPdfInputs=false` 继续阻断。
  - 满足条件时仅选择 file/PDF 发送模式，不走 text-only 降级路径。
- semantic 兼容性判定层对 mixed 增加 ready 资产校验入口（convertible 下无 ready 资产仍 `conversion_required_before_send`）。

#### HTML PDF / PS-EPS PDF controlled unavailable 状态

- 当前未实现 HTML->PDF、PS/EPS->PDF 实际转换。
- 无 sandbox runner 时两条路径保持不可发送：
  - `conversion_required_before_send`（无 ready converted pdf/text asset）
  - 或 `conversion_not_implemented`（对应转换执行未实现）
- 未引入 Chromium/Puppeteer/Ghostscript。

#### External converter runtime / sandbox runner 后续任务

- 后续统一任务名称：`External converter runtime / sandbox runner`。
- 统一覆盖：LibreOffice、Chromium/Puppeteer、Ghostscript、Pandoc。
- 统一约束：
  - 用户本机安装/手动指定路径优先（不内置 LibreOffice）
  - 默认禁网
  - 隔离临时目录
  - 严格超时与子进程清理
  - 脱敏日志
  - 平台差异处理（Windows/macOS/Linux）
- 当前状态：不纳入 Step 5 主体实现。

#### Send Plan / preflight / serializer 接入点

- `infra/files/sendPlanService.ts`
  - `buildDefaultSemanticSummary(...)` 增加 HTML/PS-EPS 默认语义。
  - `candidateModesForAttachment(...)` 增加 mixed gating（ready text+file/PDF 组合，且禁止 text-only mixed）。
  - `compatibilityReasonFromProcessingStatusForSemantic(...)` 增加 mixed-ready 判断。
- preflight 继续复用 `sendPlan.buildCurrent`，自动继承上述阻断策略。
- `openRouterSendPlanSerializer` 本轮无协议变更，回归测试保持通过。

#### lineage/stale/sentAssetIds 状态

- 维持 Step 2/3 闭环：
  - lineage/stale guard 不变；
  - sentAssetIds 透传链不变；
  - preview-only 资产不进入发送与历史绑定。

#### 当前保持不变的行为

- 未接入 LibreOffice/Chromium/Puppeteer/Ghostscript。
- 未实现 HTML PDF / PS-EPS PDF 真实转换。
- 未改 UI 功能行为与高级转换路径 UI。
- 未扩大 unsupported 路径的 sendable 范围。
- Step 4 Office/PDF controlled unavailable 行为不回退。

#### 测试命令与结果

- `npx vitest --run src/shared/files/fileRules.test.ts` -> 通过（20）
- `npx vitest --run src/next/openrouter/openRouterSendPreparation.test.ts` -> 通过（2）
- `npx vitest --run src/next/openrouter/openRouterSendPlanSerializer.test.ts` -> 通过（24）
- `npx vitest --run src/ui-app/AppChatApp.attachments.test.ts` -> 通过（37）
- `npx vitest --run electron/ipc/dialogIpc.test.ts` -> 通过（6）
- `npx vitest --run infra/files/sendPlanService.test.ts` -> 通过（15 passed, 18 skipped）
- `npx vitest --run infra/files/derivativeJobService.test.ts` -> skipped（16）
- `npx vitest --run infra/files/conversationAttachmentService.test.ts` -> skipped（12）

#### BetterSqlite3 状态

- `infra/files/derivativeJobService.test.ts` 与 `infra/files/conversationAttachmentService.test.ts` 仍受 BetterSqlite3 ABI 门控跳过。
- 本轮未修改门控逻辑。

#### Step 5 是否完成

- Step 5 主体在“无外部 sandbox runner、无新增高风险依赖”约束下已一次性收尾完成：
  - HTML/PS-EPS 安全文本主路径可用；
  - Hybrid 最小 Send Plan gate 已接入且禁止 text-only 降级；
  - HTML PDF / PS-EPS PDF 保持 controlled unavailable；
  - 既有 Step 0-4 行为未回退。

#### 后续是否进入收官/维护任务

- 可以进入收官/维护任务。
- 后续不再按 Step 5 扩展格式能力，统一转入 external converter runtime / sandbox runner 任务与跨平台稳定性收敛。

### 2026-04-29 Step 0–Step 5 收官与维护入口固化

#### 收官结论

- Step 0–Step 5 主线已全部收官，当前不再继续向当前阶段塞入新的转换能力。
- 现阶段职责转为维护、回归、债务清理，以及 external converter runtime / sandbox runner 的独立规划。
- 文档分工保持不变：`format-conversion-preview-final.md` 是设计信源，`format-conversion-preview-implementation-plan.md` 是执行计划，`format-conversion-preview-progress.md` 是进度账本。

#### Step 0–Step 5 状态

- Step 0：条件性闭合。
- Step 1：闭合。
- Step 2：闭合。
- Step 3：闭合。
- Step 4：闭合；Office / PDF 真实外部转换在当前仓库约束下保持 controlled unavailable。
- Step 5：闭合；HTML / PS-EPS 的安全文本路径已落地，HTML PDF / PS-EPS PDF 保持 controlled unavailable。

#### 能力状态表

| 能力 | 当前状态 | 说明 | 后续入口 |
|---|---|---|---|
| plain_text | implemented | 纯文本目标路径已可用并进入 Send Plan。 | 维护现有文本规则与回归测试 |
| markdown | implemented | Markdown 目标路径已可用。 | 维护现有文本规则与回归测试 |
| code | implemented | 代码/脚本文本目标路径已可用。 | 维护现有文本规则与回归测试 |
| CSV/TSV table_markdown | implemented | CSV/TSV -> table_markdown 已形成可测试闭环。 | 维护现有表格转换与回归测试 |
| HTML markdown/code | implemented | HTML 安全文本路径已落地，JS 默认关闭、外链默认不加载。 | 维护现有 HTML 规则；如需 PDF 渲染，转 external converter runtime |
| PS/EPS code | implemented | PS/EPS 安全文本路径已落地。 | 维护现有 PS/EPS 规则；如需 PDF 渲染，转 external converter runtime |
| XLSX/XLS table_markdown | controlled unavailable | 已有语义入口与受控失败元数据，但真实 workbook 解析未落地。 | external converter runtime / sandbox runner |
| DOCX/RTF/DOC markdown | controlled unavailable | 已有语义入口与受控失败元数据，但真实 markdown 提取未落地。 | external converter runtime / sandbox runner |
| PDF attachment gate | implemented | PDF 发送 gate 已收紧并按 file_in 能力判断。 | 维护现有 gate 与模型能力测试 |
| Office -> PDF | controlled unavailable | 真实 Office 到 PDF 转换未接入，当前受控关闭。 | external converter runtime / sandbox runner |
| HTML -> PDF | controlled unavailable | Chromium/Puppeteer 未接入，当前受控关闭。 | external converter runtime / sandbox runner |
| PS/EPS -> PDF | controlled unavailable | Ghostscript 未接入，当前受控关闭。 | external converter runtime / sandbox runner |
| Hybrid | implemented | 最小 mixed 发送策略已可用，且不自动降级 text-only。 | 维护 mixed gate 与回归测试 |
| lineage/stale guard | implemented | preview/send 同源与 stale 阻断已进入 Send Plan。 | 维护现有 guard 与回归测试 |
| sentAssetIds 历史绑定 | implemented | 历史绑定已按实际发送资产收敛。 | 维护 sentAssetIds 透传与白名单 |
| converted text hard gate | implemented | converted text bytes hard gate 已接入。 | 维护硬阈值与回归测试 |
| token gate / soft gate | deferred | 仅 hard gate 已落地，token/soft gate 仍缺稳定输入与独立方案。 | 后续独立规划 |
| external converter runtime / sandbox runner | deferred | 覆盖 LibreOffice、Chromium/Puppeteer、Ghostscript、Pandoc 的独立维护入口已固化。 | 后续独立规划 |
| BetterSqlite3 ABI 测试债务 | debt | 当前环境仍存在 native ABI 不匹配，DB 集成测试会 skipped。 | ABI 对齐后补跑 |

#### 测试状态表

| 测试命令 | 最近结果 | 备注 |
|---|---|---|
| `npx vitest --run src/shared/files/fileRules.test.ts` | 通过（20 passed） | 覆盖基础文件规则与 HTML/PS-EPS 规则 |
| `npx vitest --run src/next/openrouter/openRouterSendPreparation.test.ts` | 通过（2 passed） | 覆盖 OpenRouter 发送准备 |
| `npx vitest --run src/next/openrouter/openRouterSendPlanSerializer.test.ts` | 通过（24 passed） | 覆盖 Send Plan 序列化与安全约束 |
| `npx vitest --run src/ui-app/AppChatApp.attachments.test.ts` | 通过（37 passed） | 覆盖 UI 附件流与预览/发送联动 |
| `npx vitest --run electron/ipc/dialogIpc.test.ts` | 通过（6 passed） | 覆盖文件选择 IPC 脱敏回归 |
| `npx vitest --run infra/files/sendPlanService.test.ts` | 通过（15 passed, 18 skipped） | skipped 部分受 BetterSqlite3 ABI 门控 |
| `npx vitest --run infra/files/derivativeJobService.test.ts` | skipped（16） | BetterSqlite3 ABI 债务导致跳过 |
| `npx vitest --run infra/files/conversationAttachmentService.test.ts` | skipped（12） | BetterSqlite3 ABI 债务导致跳过 |

#### 主要剩余债务

- BetterSqlite3 ABI 对齐环境未准备好，导致 DB 集成测试仍是 skipped。
- token gate / soft gate 仍未落地，当前仅有 converted text hard gate。
- Office -> PDF、HTML -> PDF、PS/EPS -> PDF 都等待 external converter runtime / sandbox runner。

#### external converter runtime / sandbox runner 后续入口

- 覆盖范围：LibreOffice、Chromium/Puppeteer、Ghostscript、Pandoc。
- 当前策略：优先用户本机安装或手动指定路径，不内置下载或捆绑二进制。
- 安全要求：隔离临时目录、默认禁网或不加载远程资源、超时、日志脱敏、子进程清理、路径白名单、失败返回 controlled unavailable。
- 归属边界：不属于当前 Step 0–Step 5 主线。
- 实现前提：必须先做独立方案与测试计划，再进入代码实现。

#### 下一步建议

1. 新开 external converter runtime / sandbox runner 独立任务，只做方案与测试计划，不回灌当前主线。
2. 在可运行 BetterSqlite3 的环境补跑 DB 集成测试，清理 ABI 债务。
3. 维持当前 Step 0–Step 5 的收官边界，不再扩展本阶段功能代码。

### 2026-04-29 Retry/Regenerate 附件重放诊断

- 问题现象：初次发送带附件的用户消息时，模型能正确读取附件，Send Plan 显示 sendable，OpenRouter payload 正常，assistant 消息最终为 final；但执行 Retry Replace 或 Regenerate 时，只发送了上一条用户消息的文本，没有把该用户消息原本携带的附件一起重放到模型请求中。
- 初次发送链路：`onSend()` -> `buildCurrentSendPlan()` -> `prepareOpenRouterSendFromDraft()` -> `branch.beginTurn()` -> `attachDraftToMessage()` / `sentAssetIds` -> `startStreamingForAssistantTurn()` -> `streamOpenRouterChatAsEvents()`；附件来自 draft attachments，`sentAssetIds` 会生成并传递，OpenRouter 侧通过 `currentUserContentBlocks` 带入附件内容。
- Retry Replace / Regenerate 链路：`onRegenerateFromQuestion()` / `onRetryReplaceAnswer()` 只调用 `buildContextMessagesBeforeQuestion()` 生成文本上下文，然后直接进入 `startStreamingForAssistantTurn()`；这条路径没有调用 `buildCurrentSendPlan()` / `sendPlan.prepareOpenRouter()` / `prepareOpenRouterSendFromDraft()`，也没有把历史用户消息的附件重新编入请求。
- 附件丢失点：丢失发生在 UI 层的重试入口到流式请求之间，不是在 worker 的 `branch.regenerateFromQuestion` / `branch.retryReplaceAnswer` 里。具体是 retry/regenerate 没有把原用户消息的附件从 `message_attachments` / `getCandidateAttachmentSnapshot()` 重新重建为当前发送输入，导致 `streamOpenRouterChatAsEvents()` 只收到文本 `userText` + `contextMessages`。
- 根因分类：B. 历史附件重放模型缺失。当前系统已有历史附件数据和 snapshot 能力，但 retry/regenerate 路径没有现成的“从历史用户消息重建发送输入”环节；这不是单纯漏传一个参数就能完全闭合的调用错误。
- 是否直接修复：本轮不直接修。原因是修复点会触碰重放输入模型，若仅在入口补一个参数，仍不足以保证历史附件、`sentAssetIds`、兼容性 gate 和 OpenRouter content blocks 一致重建。
- 最小修复方案：在 UI 侧抽一个共享的 retry/regenerate 重放准备函数，基于目标 user message 的附件快照重建发送输入，再把附件内容显式传入 `startStreamingForAssistantTurn()`；如果要保持当前 Send Plan 语义不变，优先复用现有 `buildCurrentSendPlan()` / `sendPlan.prepareOpenRouter()` 的历史快照能力，而不是改 OpenRouter payload 结构。
- 建议新增测试：
  - `src/ui-app/AppChatApp.regenRetry.test.ts`：新增“regenerate 重新发送历史附件”和“retry replace 重新发送历史附件”的 UI 级断言。
  - `src/ui-app/AppChatApp.attachments.test.ts`：补一个带历史附件的重试入口回归，断言 `streamOpenRouterChatAsEvents` 收到 `currentUserContentBlocks`，并且重试路径没有只传纯文本。
  - 如需服务层闭合，再补 `infra/files/sendPlanService.test.ts` 或 `infra/files/conversationAttachmentService.test.ts` 的重放语义断言，但现有 service tests 已覆盖 `getResendAttachmentDefaults()` / `getCandidateAttachmentSnapshot()` 基础能力。
- 对 Step 0–Step 5 收官状态的影响：无直接影响。该问题属于 retry/regenerate 的历史附件重放缺口，不改变现有 Step 0–Step 5 的 Send Plan、转换、预览或兼容性主线语义。

### 2026-04-29 Retry/Regenerate 附件重放测试补充

- 本轮只改测试，没有修改 `src/ui-app/app/appChatApp.logic.ts`、OpenRouter payload 构造、Send Plan 逻辑或 DB schema。
- 测试不稳定根因：`src/ui-app/AppChatApp.regenRetry.test.ts` 的挂载基线 mock 不完整，属于 `B + D` 组合问题。
  - `dbBridge` 初始化缺少 `settings.*`、`modelCatalog.*`、`conversationDraft.restore` 等必需返回，导致 `AppChatApp` 的 `onMounted()` 在 transcript 载入前中断。
  - 原测试对 `modelPrefs.recordRecent` 写死断言 `openrouter/auto`，而稳定基线实际会从会话 meta 选中 `openai/gpt-4o`。
  - 附件重放失败并非 UI 挂载问题；在基线稳定后，失败已下沉到 `streamOpenRouterChatAsEvents()` 入参断言。
- 本轮修改文件：
  - [D:\Starverse\src\ui-app\AppChatApp.regenRetry.test.ts](D:\Starverse\src\ui-app\AppChatApp.regenRetry.test.ts)
  - [D:\Starverse\docs\file-pipeline\format-conversion-preview-progress.md](D:\Starverse\docs\file-pipeline\format-conversion-preview-progress.md)
- 基线测试恢复情况：
  - `regenerate creates a new answer root, updates < i/n >, and streams into the new assistant`：已恢复通过。
  - `retry replace hides old candidate (branch-local), selects new candidate, updates < i/n >, and streams`：已恢复通过。
  - `disables regenerate/retry while the selected answer group is streaming`：已恢复通过。
- 新增附件重放测试位置与断言层级：
  - `regenerate replays historical attachments into the OpenRouter request`
  - `retry replace replays historical attachments into the OpenRouter request`
  - 两个用例都直接断言 `streamOpenRouterChatAsEvents()` 最后一次调用入参，要求 payload 含 `userText: 'Q1'`、`contextMessages`，并显式带 `currentUserContentBlocks` 数组。
- 当前测试结果：
  - `npx vitest --run src/ui-app/AppChatApp.regenRetry.test.ts`
  - 结果：`3 passed, 2 failed`
  - 失败用例正是上述两个附件重放测试。
- 当前失败点是否已落到预期位置：是。
  - 失败信息已经从“找不到 `retry-a-a1` / `Q1`”转为 payload 断言失败，明确显示 `streamOpenRouterChatAsEvents()` 调用对象缺少 `currentUserContentBlocks`。
  - 这说明 Retry Replace / Regenerate 当前仍然只重放文本和 `contextMessages`，没有把历史附件重建进请求。
- 下一步最小 runtime 修复方向：
  - 在 retry/regenerate 入口旁增加一个共享的“历史用户消息附件重放准备”步骤。
  - 依据目标 user message 的历史附件快照与现有可发送过滤规则，重建 `currentUserContentBlocks` 后再调用 `startStreamingForAssistantTurn()`。
  - 保持现有约束：至少排除 `preview_only` / stale / `includeInNextRequest=false` 的资产，不改 OpenRouter payload 结构本身。

### 2026-04-29 Retry/Regenerate/Edit Question Current replay 长期方案规划

- 本轮只做方案规划与文档更新，不修改 runtime 代码、不改测试、不改 DB schema。

#### Current replay 决策

- 覆盖入口：Retry Replace / Regenerate / Edit Question。
- 语义统一为 `current replay`：
  - 重放目标是“目标历史 user message”，不是当前 composer draft。
  - 附件来源是该 user message 的历史 `message_attachments` + 对应 `file_assets/sourceMetaJson/lineage`。
  - 重放时按当前模型能力、当前 providerContext、当前 Send Plan、当前资产状态重新准备，不复用历史 payload 快照。
  - 允许复用当前 ready send asset；stale 且可再生时按现链重建；不可再生或受 gate 阻断时返回 blocked/warning。
  - 禁止 silent text-only fallback；禁止把附件正文拼接到 `userText`。
  - 不绕过 lineage/stale/sentAssetIds/metadata escaping/serializer。

#### 推荐架构

- 新增统一服务入口（命名可等价）：
  - `sendPlan.prepareOpenRouterReplayFromMessage({ branchId, userMessageId, model, providerContext, replayMode: 'current', editedUserText?: string })`
- 入口层建议：
  - worker handler：`infra/db/worker/handlers/filePipelineHandlers.ts` 新增 IPC method（与 `sendPlan.prepareOpenRouter` 同层）。
  - service 核心：`infra/files/sendPlanService.ts` 新增 replay collect helper（避免 UI 手工拼附件）。
  - attachment 侧：`infra/files/conversationAttachmentService.ts` 复用 `getResendAttachmentDefaults` / `listMessageAttachments`，补 replay-specific snapshot helper（必要时）。
  - renderer client：`src/next/files/sendPlanClient.ts` 新增 `prepareOpenRouterReplayFromMessage` 客户端封装。
- UI 责任边界：
  - UI 只负责确定 `target userMessageId` 与 `editedUserText`（如有），调用 replay preparation API，并将返回 `contentParts/sentAssetIds/diagnostics` 透传给发送函数。
  - 不在 UI 层自行读取附件并拼 OpenRouter payload。

#### Current replay 数据流

- 统一链路：
  - Retry Replace / Regenerate / Edit Question
  - -> 解析目标 `userMessageId`（Edit Question 另带 `editedUserText`）
  - -> worker replay prepare API
  - -> `conversationAttachmentService` 读取历史 message attachments
  - -> `sendPlanService` 重建 replay attachment inputs（当前规则）
  - -> `ensureTextDerivativesForCollected`（复用现有转换准备）
  - -> `buildSendPlan`（复用现有 eligibility/lineage/stale/hard gate）
  - -> `serializeSendPlanForOpenRouter`（复用现有 content blocks 与 metadata escaping）
  - -> 返回 `currentUserContentBlocks(contentParts) + sentAssetIds + diagnostics`
  - -> `startStreamingForAssistantTurn` / 等价发送路径调用 `streamOpenRouterChatAsEvents`
  - -> `branch.beginTurn` 或编辑分支 attach 路径写入 `sentAssetIds`

#### 历史附件映射规则

- 从 `MessageAttachmentRecord` 重建输入时：
  - 首选 `assetId` 对应 raw/source asset，按当前规则决定 send mode。
  - `includeInNextRequest=false` 直接排除，不重放。
  - `sourceMetaJson.previewOnly=true` 或 derived-only 资产不可重放（blocked/excluded with reason）。
  - `deleted/missing` 资产 -> blocked（`asset_record_missing`/`asset_soft_deleted`）。
  - `controlled unavailable`（如 Office/PDF/HTML/PS-EPS 当前未实现路径）保持受控失败 reason（例如 `conversion_not_implemented` / `conversion_required_before_send`）。
  - `stale` 且可再生成 -> 触发当前转换链再准备；`stale` 且不可再生成 -> blocked。
  - `lineage` 不一致 -> blocked（复用 `evaluateAttachmentLineageGuard`）。
  - converted text hard gate 继续硬阻断；token gate/soft gate 保持后续债务，不在本次最小修复扩展。

#### Send Plan 与 serializer 复用策略

- 不新增 payload 分叉协议，优先复用：
  - `sendPlanService.collectCurrentSendInputs/buildSendPlan`
  - `sendPlan.prepareOpenRouter` 等价处理与 `serializeSendPlanForOpenRouter`
- 建议新增 replay-specific collect input（轻量）：
  - 允许“以历史 message attachments 作为 draft-equivalent 输入”+ 可选 `editedUserText`。
  - 但最终仍产出同一个 `SendPlan` 和同一个 serializer 输出结构。
- `currentUserContentBlocks` 来源：
  - 统一来自 serializer 的 `contentParts`。
- `sentAssetIds` 来源：
  - 统一来自 `sendPlan.includedAttachments.assetId` 去重结果，并传回 `branch.beginTurn`/`attachDraftToMessage` 等后续写入路径。
- 必须复用现有：
  - metadata escaping
  - lineage/stale guard
  - local storage path 安全校验

#### 三个入口接入点

- Regenerate
  - 目标 questionId 已知（`onRegenerateFromQuestion`），即目标 user message id。
  - 在 `branch.regenerateFromQuestion` 成功后、`startStreamingForAssistantTurn` 前调用 replay preparation。
  - 将返回 `contentParts` 作为 `currentUserContentBlocks` 传给流式请求。
  - 若 replay blocked：中止本次流式启动并给出可见错误（不 silent fallback）。

- Retry Replace
  - 目标 questionId 已知（`onRetryReplaceAnswer(questionId, currentAnswerRootId)`），questionId 即目标 user message id。
  - 在 `branch.retryReplaceAnswer` 成功后、启动流式前调用 replay preparation。
  - 若 replay blocked：建议“保留旧回答可见 + 新 candidate 标记失败并提示”，避免静默替换成功但内容退化。

- Edit Question
  - 入口在 `openQuestionEdit` / `submitQuestionEdit`（`src/ui-app/app/appChatApp.logic.ts`）。
  - 当前行为：优先 `conversationDraft.cloneFromMessage` 恢复历史附件到编辑草稿，提交后 `conversationDraft.attachToMessage` 挂到新问题消息。
  - 长期语义：
    - 默认保留从历史问题恢复的附件，且在 UI 中可见、可移除。
    - `editedUserText` 进入 replay preparation 的 `userText` 输入。
    - 若用户移除恢复附件，则按移除后的集合发送。
    - 若用户新增附件，仅包含“本次编辑草稿中可见且确认保留”的集合；不能混入无关 composer 草稿历史。
  - blocked 策略：默认阻止编辑发送；是否允许“用户显式确认仅文本发送”作为后续交互债务，不在最小修复首步实现。

#### 失败策略

- 必须策略（本次修复最小必须）：
  - 全部可 replay：正常发送，写入 sentAssetIds。
  - 部分可 replay：返回 `partially_sendable` + 明确 excluded diagnostics；默认可按现 gate 决定是否继续。
  - 全部不可 replay：blocked，禁止发送。
  - 文件缺失 / 软删除：blocked。
  - stale 可再生：先再生再计划；失败则 blocked。
  - stale 不可再生：blocked。
  - 当前模型不支持：blocked 或 partially_sendable（取决于是否仍有 included）。
  - controlled unavailable：blocked。
  - hard gate blocked：blocked。
- 后续 UI 诊断债务（可后补）：
  - 更细粒度的用户提示文案、附件级操作建议、仅文本确认弹窗策略。
  - token gate/soft gate 交互。

#### 测试计划

- `src/ui-app/AppChatApp.regenRetry.test.ts`
  - Regenerate 历史附件进入 `currentUserContentBlocks`。
  - Retry Replace 历史附件进入 `currentUserContentBlocks`。
  - Retry/Regenerate 不读取无关当前 composer draft 附件。

- `src/ui-app/AppChatApp.questionBranching.test.ts`
  - Edit Question 编辑后重发仍带历史恢复附件。
  - Edit Question 用户移除恢复附件后不发送该附件。
  - Edit Question 新增附件与恢复附件组合发送范围正确（不串入无关 draft）。

- `src/ui-app/AppChatApp.attachments.test.ts`
  - preview_only 不重放。
  - controlled unavailable/hard gate/stale blocked 的 UI gate 行为。
  - 初次发送附件链路不回退。

- `infra/files/sendPlanService.test.ts`
  - replay collect 下的 include/exclude/blocked 决策。
  - current model capability gate 生效。
  - `sentAssetIds` 仅包含实际 included replay 资产。

- `infra/files/conversationAttachmentService.test.ts`
  - `getResendAttachmentDefaults/listMessageAttachments` 的重放快照正确性。
  - deleted/missing/includeInNextRequest=false 映射行为。

- `src/next/openrouter/openRouterSendPreparation.test.ts`
  - replay preparation API 输出与初次发送 preparation 输出结构一致。
  - 不分叉 payload 契约。

- `src/next/openrouter/openRouterSendPlanSerializer.test.ts`
  - replay 场景 serializer 行为与普通发送一致。
  - metadata escaping / lineage guard 继续生效。

#### 实施阶段建议（最多两步）

- 第一步（必须）：
  - 落地服务层 replay preparation API（worker handler + sendPlan/conversationAttachment helper + client）。
  - 一次性接入 Retry Replace / Regenerate / Edit Question 三入口。
  - 打通 `currentUserContentBlocks` 与 `sentAssetIds` 透传，启用 blocked 失败策略（禁止 silent text-only）。

- 第二步（补尾）：
  - 完成测试矩阵补齐与诊断文案收敛。
  - 补充边缘阻断与可观测性（分场景错误码、UI 提示一致性）。

#### DB schema 判断

- 当前判断：不需要 DB schema 变更。
- 依据：
  - 现有 `MessageAttachmentRecord` + `FileAssetRecord.sourceMetaJson(lineage/textConversion/stale)` + `sentAssetIds` 已可支撑 current replay。
  - replay 缺口在“入口编排与服务复用”，不是存储字段缺失。
- 仅当后续要做“附件级用户确认审计轨迹”时，才可能引入新增字段；该需求不属于本次最小修复。

#### 对 Step 0-5 收官状态影响

- 不影响 Step 0-5 收官边界。
- 本方案属于“既有附件链路在 Retry/Regenerate/Edit Question 入口的编排补齐”，不扩展转换能力，不引入 external converter runtime，不改变主线收官判定。

### 2026-04-29 Current replay 绑定、确认与回放治理完整修订

#### 1. 修订背景

- 本修订用于消除语义漂移，并把 Retry Replace / Regenerate / Edit Question 的 replay 语义、绑定模型、确认规则和治理边界固化为后续实施约束来源。
- 本轮仅文档修订，不修改 runtime 代码，不改测试，不改 DB schema，不实现功能。
- 与现有结论保持一致：当前问题是 replay 入口未重放历史附件，不是 UI 展示问题；Step 0-5 收官边界不变。

### Current replay 口径覆盖声明

- 后续实施口径以 `2026-04-29 Current replay 绑定、确认与回放治理完整修订` 为准。
- 该节覆盖早期 `2026-04-29 Retry/Regenerate/Edit Question Current replay 长期方案规划` 中关于 partial replay、Edit Question、manifest、用户确认的较早表述。
- 最新硬规则：
  - 禁止 silent text-only fallback。
  - 部分附件不可纳入时，默认 `blocked` 或 `needs_confirmation`。
  - 用户未确认 `exclude` 前不得继续发送。
  - `User message` 与 `Assistant run/candidate` 采用两层绑定。
  - `Assistant run/candidate` 层记录权威模型能力快照与轻量 send manifest。

#### 2. Current replay 决策（权威语义）

- Retry Replace / Regenerate / Edit Question 默认采用 `Current replay`。
- Current replay 含义：
  - 重放目标是某条历史 user message。
  - 附件来源是该历史 user message 的附件记录（message attachment 链）。
  - 重放时按当前转换规则、当前模型能力、当前 Send Plan、当前资产状态重新准备。
  - 可复用 ready converted/send asset 时复用。
  - stale 且可再生时，走当前转换链再生成。
  - 资产缺失、模型不支持、controlled unavailable、hard gate blocked、安全阻断时，必须 blocked 或进入用户确认。
  - 禁止 silent text-only fallback。
  - 默认不读取当前 composer draft 作为替代输入。
  - 禁止把附件正文拼入 `userText`。
  - 禁止绕过 lineage/stale/sentAssetIds/metadata escaping/OpenRouter serializer。
- Current replay 默认目标：
  - 用当前规则重建请求，避免附件静默丢失。
  - 支持后续 replay 差异提示能力。
  - 不要求默认保存完整历史 payload，不要求默认 exact replay。
- Exact replay 定位：
  - 不是当前默认语义。
  - 不以完整 payload 快照为默认来源。
  - 但保留轻量 manifest 能力，为审计、差异检测、未来精确回放扩展预留基础。

#### 3. 两层绑定模型（硬约束）

- 第一层：`User message` 绑定（输入来源与用户意图）
  - 记录/规划字段：`userMessageId`、用户文本、`rawFileId`、`fileAssetId`、`messageAttachmentId`、消息附件显示状态、用户 include/exclude/remove 决策、初次发送模型摘要（便利快照）、当前 replay 可用性状态。
  - 职责：历史显示、Edit Question 恢复附件、Current replay 附件来源。
  - 非职责：不能作为“某个 assistant candidate 实际收到什么”的唯一权威。
- 第二层：`Assistant run/candidate` 绑定（实际发送清单）
  - 记录/规划字段：`runId/candidateId`、`assistantMessageId`、`sourceUserMessageId`、`replayMode`、`modelId/provider/providerRoute`、`modelCapabilitySnapshot`、included/excluded/blocked 附件、`sentAssetIds`、`targetKind`、`sendStrategy`、`contentHash/sourceHash/settingsHash`、`bytes/estimatedBytes`、`warningsAtSendTime`、attachment decision snapshot、diagnostics/blockingReasons。
  - 职责：记录每次回答实际发送清单、差异诊断、候选比较、未来 exact replay 扩展基础。
- 原则：
  - 同一 user message 可生成多个 assistant candidate。
  - 不同 candidate 可有不同模型、能力快照、replay 结果、included attachments。
  - 模型与能力快照权威记录必须绑定 run/candidate 层。
  - user message 层可保留初次发送便利快照，但不能替代 run-level manifest。

#### 4. 轻量 send manifest 决策

- 采用轻量 send manifest，不默认保存完整 payload snapshot。
- 目标：
  - 控制长历史存储成本。
  - 不存完整附件正文/完整 converted text/完整 PDF 或 binary payload。
  - 只存审计、差异检测、回放准备、用户解释所需的身份信息和摘要。
- 建议字段（命名按仓库风格调整）：
  - `runId/candidateId`
  - `assistantMessageId`
  - `sourceUserMessageId`
  - `replayMode`（`draft_initial` 或 `current`）
  - `modelId/provider/providerRoute/modelCapabilitySnapshot`
  - `attachments[]`（`messageAttachmentId/rawFileId/fileAssetId/sentAssetId/targetKind/sendStrategy/statusAtSend/reasonCode/contentHash/sourceHash/settingsHash/bytes|estimatedBytes/warningCodes`）
  - `warningsAtSendTime`
  - `createdAt`
- 与 Current replay 的关系：
  - manifest 不是强制 payload 来源。
  - Current replay 仍按当前规则重建 Send Plan。
  - manifest 主要用于审计、解释、差异检测和追溯。
- 当前阶段过渡限制：
  - 若暂未实现完整 manifest，允许先用 `sentAssetIds + MessageAttachment + FileAsset.sourceMetaJson + message metadata` 过渡。
  - 必须在后续实施中标注 provenance 不完整限制。

#### 5. 新上传文件与资产记录规则

- 新上传文件必须保留完整原始资产记录；派生资产可按需生成，但原始记录与消息绑定必须可靠。
- 至少记录/规划：
  - `rawFileId/fileAssetId/filename/extension/mime/detectedMime/size/hash/storageUri/sourceKind/ingestStatus/previewStatus/sourceMetaJson`
  - derived lineage
  - draft attachment 绑定
  - message attachment 绑定
- 清理边界：
  - 原始资产不得因单个回答候选删除而立即删除。
  - 派生资产可按缓存策略清理。
  - message-bound 或 run-used 资产不得误删。

#### 6. 删除消息、分支、候选时的附件清理规则（硬约束）

- 删除同级用户消息、删除分支、删除 assistant candidate、删除历史回答时，禁止直接删除底层资产。
- 必须执行引用计数或可达性扫描。
- 只要被任一对象引用，就不得清理：
  - draft attachment
  - message attachment
  - assistant run manifest
  - sentAssetIds
  - 被其他 user message 引用的 `rawFileId/fileAssetId`
  - derived lineage
  - pending conversion job
  - retention 期内 preview cache
  - message-bound asset
  - run-used asset
  - 用户当前会话可访问的历史节点
- 规则强调：
  - 删除分支问题不等于删除文件资产。
  - 删除某 candidate 不等于删除其 run-used 资产。
  - preview 临时资产可按过期策略清理。
  - 真删前必须通过可达性检查。

#### 7. 模型与模型能力快照规则

- 每次 assistant run/candidate 必须记录本次实际模型与能力快照。
- 至少包括：
  - `modelId/provider/providerRoute`
  - `supportsTextInput/supportsFileInput/supportsPdfInput`
  - `supportsImageInput`（相关时）
  - `supportsAudioVideoInput`（相关时）
  - `contextWindow/maxOutput`（可用时）
  - `providerContext`
  - `routing/plugin/tool constraints`（相关时）
  - `timestamp`
- 用途：
  - 历史诊断、replay 差异检测、候选比较、模型切换可解释性、future exact replay 准备。
- 原则：
  - user message 层模型摘要不是 run-level 权威记录。

#### 8. 附件无法纳入时的用户确认规则（硬约束）

- 核心：禁止 silent text-only fallback。
- 历史附件无法纳入（模型不支持、capability 不满足、missing/deleted、stale 不可再生、conversion_not_implemented、controlled unavailable、hard gate、metadata/safety gate、lineage mismatch、preview_only、send asset not ready）时：
  - 系统必须显式提示“该附件将被排除”。
  - 用户确认后才允许继续。
  - 未确认不得继续发送。
  - run manifest 记录 excluded attachment 与 reasonCode。
- 当前发送消息附件不支持时：
  - 必须逐项可处理：`include` / `exclude` / `remove`。
  - 系统不得自动删除附件。
  - 系统不得自动排除后继续发送。
  - 部分附件不可发送默认阻断；用户确认 exclude 后可继续。
  - 全部不可发送时阻断并展示原因。
  - 确认行为进入 attachment decision snapshot。
- 历史上下文多消息场景：
  - 必须告知哪些历史附件会被排除。
  - 需用户确认后才能继续。
  - 禁止 UI 造成“历史可见即已入模”的误导。

#### 9. Edit Question 统一纳入 Current replay

- Edit Question 与 Retry/Regenerate 同类，必须走统一 Current replay 治理。
- 模式 A：编辑草稿模式
  - 恢复历史附件为可见 draft attachments。
  - 用户可 include/exclude/remove，可新增附件。
  - 发送走普通 draft Send Plan。
  - 不混入无关 composer draft 附件。
  - 区分恢复附件与新增附件来源。
  - run manifest 记录最终决策。
- 模式 B：直接 edit-and-resend
  - 输入 `targetUserMessageId + editedUserText`。
  - 附件来源仅目标历史 user message。
  - 不读取当前 composer draft。
  - 调 replay preparation API。
  - blocked/needs_confirmation 时不发送。
  - run manifest 记录最终清单。
- 当前 Starverse 状态（基于现有逻辑）：
  - 主流程偏“编辑草稿模式”：`cloneFromMessage -> 编辑 -> attachToMessage -> 发送`。
  - 同时存在文本回退分支（clone 失败时）。
  - 风险：混合语义可能导致确认边界不清。
  - 收敛方向：统一以“可见附件决策 + 统一发送准备层”为准。

#### 10. Replay preparation API 边界

- 推荐统一入口（命名可等价）：
  - `prepareOpenRouterReplayFromMessage({ branchId, userMessageId, model, providerContext, replayMode: 'current', editedUserText?, attachmentDecisions? })`
- 返回建议：
  - `status: sendable | blocked | needs_confirmation | partially_blocked`
  - `currentUserContentBlocks`
  - `sentAssetIds`
  - `diagnostics/blockingReasons/warnings`
  - `includedAttachments/excludedAttachments/attachmentDecisions`
  - `modelCapabilitySnapshot`
  - `sendManifest` 或 `manifestDraft`
- 职责约束：
  - 读取历史 message attachments。
  - 按当前规则重建 Send Plan。
  - 复用 ready asset；stale 可再生则再生。
  - 复用 Send Plan/serializer/metadata escaping/lineage/stale/hard gate。
  - 生成 `currentUserContentBlocks + sentAssetIds + manifestDraft`。
  - 不手工拼 `userText`。
  - 不读取当前 composer draft 作为替代。
  - 不 silent text-only fallback。

#### 11. Draft initial send 与 Historical current replay 的统一发送准备层

- 两种输入模式共用同一发送准备层：
  - 模式 1：`Draft initial send`
    - 来源：composer draft + draft attachments + 用户文本 + 当前附件决策。
    - 路径：draft input -> Send Plan -> OpenRouter preparation -> serializer -> sentAssetIds -> run manifest。
  - 模式 2：`Historical current replay`
    - 来源：target user message + historical attachments + editedUserText（可选）+ attachmentDecisions（可选）。
    - 路径：replay input -> Send Plan -> OpenRouter preparation -> serializer -> sentAssetIds -> run manifest。
- 共同原则：
  - OpenRouter payload 不分叉。
  - metadata escaping 不分叉。
  - lineage/stale guard 不分叉。
  - file/PDF/model capability gate 不分叉。
  - sentAssetIds/run manifest 不分叉。

#### 12. Retry/Regenerate/Edit Question 接入时序（前置约束）

- 破坏性操作必须发生在 replay 可发送性确认之后。
- Regenerate：
  - 先确定 `userMessageId`。
  - 先 replay preparation。
  - sendable/确认后才创建新 candidate 并开流。
  - blocked 时不创建空 candidate，不改当前候选状态。
- Retry Replace：
  - 从当前 answer 定位对应 `userMessageId`。
  - 先 replay preparation。
  - sendable/确认后再执行 replace。
  - blocked 时保留旧回答，不隐藏不替换。
- Edit Question：
  - 先判定交互模式（草稿编辑或直接重发）。
  - 草稿模式先恢复附件为可见 draft attachments。
  - 直接重发模式先 replay preparation。
  - blocked/needs_confirmation 时不提交编辑发送。
  - 不混入无关 composer 附件。

#### 13. 失败策略（统一状态机）

- 建议状态：
  - `sendable`：required attachments 可纳入。
  - `needs_confirmation`：部分不可纳入，但可确认 exclude。
  - `blocked`：未确认或存在不可继续硬阻断。
  - `partially_blocked`：内部诊断态，不默认继续。
- 场景策略：
  - 全可 replay：发送，manifest 记 included。
  - 部分不可 replay：needs_confirmation/blocked；未确认不发送；确认后发送并记 excluded+reasonCode。
  - 全不可 replay：blocked；禁止纯文本自动发送。
  - missing/deleted：blocked 或 needs_confirmation（按策略）。
  - stale 可再生：先再生再重算；失败后 blocked/needs_confirmation。
  - stale 不可再生：blocked/needs_confirmation。
  - 模型不支持 file/PDF：blocked/needs_confirmation；不自动 text-only。
  - controlled unavailable：blocked/needs_confirmation，原因可见。
  - hard gate：blocked，禁止绕过。
  - Edit remove：本次不发送该附件，manifest 记 remove。
  - Edit exclude：UI 保留但不发送，manifest 记 exclude。
  - Edit 新增附件：按 draft 规则进入 Send Plan，并区分来源。

#### 14. 测试计划（完整矩阵）

- UI/App Logic：
  - Regenerate 历史附件进入 `currentUserContentBlocks`。
  - Retry Replace 历史附件进入 `currentUserContentBlocks`。
  - Edit Question 重发时附件进入 `currentUserContentBlocks`。
  - 三入口不读取无关 composer draft。
  - Retry blocked 时不替换旧回答。
  - Regenerate blocked 时不创建空 candidate。
  - Edit blocked 时不提交发送。
  - Edit remove/exclude 行为与发送内容一致且需确认。
  - 部分不可纳入必须确认。
- 服务层：
  - replay collect 从 MessageAttachment 重建。
  - `preview_only` 不 replay。
  - stale blocked 或再生后重算。
  - controlled unavailable blocked。
  - hard gate blocked。
  - model capability gate 生效。
  - sentAssetIds 仅含 included。
  - decision snapshot 正确。
  - manifestDraft 正确。
- OpenRouter preparation/serializer：
  - replay 与 draft send payload 结构一致。
  - metadata escaping 复用。
  - file/PDF gate 不分叉。
  - 不拼附件正文到 `userText`。
  - `currentUserContentBlocks` 正确。
  - serializer payload 不分叉。
- 历史与清理：
  - 删除同级 user message 不误删仍被引用资产。
  - 删除 candidate 不误删 run-used 资产。
  - 可达性规则覆盖 message attachment、run manifest、sentAssetIds、derived lineage。
- 建议测试文件：
  - `src/ui-app/AppChatApp.regenRetry.test.ts`
  - `src/ui-app/AppChatApp.questionBranching.test.ts`
  - `src/ui-app/AppChatApp.attachments.test.ts`
  - `infra/files/sendPlanService.test.ts`
  - `infra/files/conversationAttachmentService.test.ts`
  - `src/next/openrouter/openRouterSendPreparation.test.ts`
  - `src/next/openrouter/openRouterSendPlanSerializer.test.ts`

#### 15. DB schema 初步判断（仅规划，不实施）

- 优先结论：当前阶段优先不改 schema。
- 现有结构可支撑过渡：
  - `MessageAttachmentRecord`（来源绑定）
  - `FileAssetRecord.sourceMetaJson`（lineage/textConversion/stale 等）
  - `sentAssetIds`（已发送资产集合）
  - message metadata（可临时承载部分 run-level 摘要）
- 是否足够记录完整 run-level manifest：
  - 现状不足以“结构化、可查询地完整承载”长期 run manifest。
  - 但可用 message metadata/sourceMetaJson 作为过渡承载（接受 provenance 不完整限制）。
- `candidateId/assistantMessageId` 与 `sentAssetIds` 关联：
  - 当前可通过 assistant message 及其生成流程关联。
  - 过渡期建议在 run 完成时把 sentAssetIds 与关键诊断写入 assistant 侧 metadata。
- 是否需要独立 `run_manifest` 表：
  - 长期建议“可能需要”，但本阶段不决策、不迁移、不实施。
  - 若后续落地，需单独评估迁移风险（历史回填、一致性、查询成本、清理策略）。
- 当前阶段可接受项：
  - 接受不完整 provenance 作为过渡限制，但必须在文档中持续标注。
- 过渡期 `manifestDraft` 持久化策略要求（实施前必须明确选择，禁止含糊）：
  - A：写入 assistant message metadata。
  - B：写入现有 candidate/message meta。
  - C：本轮不持久化，仅作为 replay preparation 返回值，并显式标注 `provenance incomplete`。
- 推荐优先级：
  - 优先 A（assistant run/candidate 层才是实际发送记录的权威位置）。
  - `FileAsset.sourceMetaJson` 仅用于资产 lineage，不作为 run manifest 主要容器。

#### 16. 对 Step 0-5 收官状态影响

- 不影响 Step 0-5 收官结论与能力边界。
- 本修订是 replay 治理语义与后续实施约束补强，不扩展转换能力，不接 external converter runtime，不改变 controlled unavailable 判定。

#### 17. 下一步建议

1. 先进入“实施规划稿”而非直接编码：
   - 把 replay preparation API、三入口时序、确认交互、manifest 过渡写成可执行任务清单与验收门槛。
2. 再进入实现：
   - 第一批实现仅限统一发送准备层接入与阻断策略，不在同批引入 schema 迁移。
3. 文档备份建议：
   - 建议对本节建立固定锚点与版本备份（例如同目录镜像快照或变更日志索引），防止后续语义漂移。

### 2026-04-29 Current replay 实施规划稿

#### 实施总原则

- 仅实现 Current replay，不实现默认 exact replay。
- 不保存完整 payload snapshot，仅走 lightweight manifest 过渡。
- 禁止 silent text-only fallback；附件不可纳入时必须 `blocked` 或 `needs_confirmation`。
- 禁止在 UI 层手工拼 payload；必须复用 Send Plan 与 OpenRouter preparation/serializer。
- 禁止读取无关 composer draft 作为历史 replay 附件来源。
- 禁止绕过 lineage / stale / hard gate / metadata escaping。
- 本轮不改 DB schema，不接 external converter runtime，不扩展转换能力。
- 不破坏 Step 0-5 收官状态与既有能力边界。

#### 两步实施计划

- Step A：服务层 replay preparation + Retry/Regenerate/Edit 主路径接入（必须完成）
  - 新增统一入口 `prepareOpenRouterReplayFromMessage(...)`（命名可按仓库风格微调）。
  - 从 `userMessageId` 读取历史 `MessageAttachment + FileAsset.sourceMetaJson`，按 Current replay 重建 Send Plan。
  - 复用现有 OpenRouter serializer，输出 `currentUserContentBlocks + sentAssetIds + diagnostics + blockingReasons + manifestDraft`。
  - Regenerate / Retry Replace / Edit Question 三入口都改为“先 prepare，后执行发送”。
  - `blocked` 或 `needs_confirmation`（无确认 UI 时）禁止执行破坏性动作与流式发送。
  - 不允许 partial silent send。
- Step B：确认流骨架 + manifest 过渡 + 测试补尾（必须完成）
  - 增加附件不可纳入时的 `needs_confirmation` 决策骨架（最小可先 `blocked + diagnostic`）。
  - 增加 run-level lightweight manifest 过渡记录点（不改 schema）。
  - 固化 model capability snapshot 记录点。
  - 完成 Edit Question 的恢复附件 / remove / exclude / 新增附件边界测试。
  - 为附件清理的引用计数/可达性扫描留明确入口与 TODO（不在本阶段实现清理器）。
  - 闭合 replay 相关测试矩阵，确保失败只允许在预期 gate/blocked 处。

#### 详细任务清单

| 步骤 | 任务 | 涉及文件 | 关键函数/新增函数 | 验收标准 |
|---|---|---|---|---|
| Step A | 新增历史消息 replay preparation 统一入口 | `infra/files/sendPlanService.ts`, `infra/db/worker/handlers/filePipelineHandlers.ts`, `src/next/files/sendPlanClient.ts`, `src/next/openrouter/openRouterSendPreparation.ts` | `prepareOpenRouterReplayFromMessage`（新增）；复用 `sendPlan.prepareOpenRouter` 调用链 | 可输入 `branchId/userMessageId/model/providerContext`，返回 `status/currentUserContentBlocks/sentAssetIds/diagnostics` |
| Step A | 从历史 user message 附件重建 Current replay 输入 | `infra/files/conversationAttachmentService.ts`, `src/next/files/messageAttachmentClient.ts`, `infra/files/sendPlanService.ts` | 复用 `listMessageAttachments`/`getResendAttachmentDefaults`，新增 replay collect helper | 不读取无关 composer draft；历史附件进入 plan 输入；`preview_only`/lineage/stale/hard gate 可拦截 |
| Step A | Regenerate 接入 replay prepare 前置 | `src/ui-app/app/appChatApp.logic.ts`, `src/next/branch/branchClient.ts` | `onRegenerateFromQuestion`, `startStreamingForAssistantTurn`（入参扩展为可接收 prepare 结果） | `blocked` 时不创建空 candidate；`sendable` 时 stream 调用包含 `currentUserContentBlocks` |
| Step A | Retry Replace 接入 replay prepare 前置 | `src/ui-app/app/appChatApp.logic.ts`, `src/next/branch/branchClient.ts` | `onRetryReplaceAnswer` | replay `blocked` 时保留旧 answer，不删不换；`sendable` 后再进入 replace+stream |
| Step A | Edit Question 主路径接入 replay prepare | `src/ui-app/app/appChatApp.logic.ts`, `infra/files/conversationAttachmentService.ts` | `openQuestionEdit`, `submitQuestionEdit`, `cloneMessageToDraft`, `attachConversationDraftToMessage` | 明确模式为“编辑草稿主路径 + 文本回退分支”；主路径附件可见且走统一发送准备；blocked 时不提交发送 |
| Step B | needs_confirmation / exclude 决策骨架 | `infra/files/sendPlanService.ts`, `src/ui-app/app/appChatApp.logic.ts` | replay prepare 返回 `needs_confirmation`；UI 先最小支持 `blocked + diagnostic` | 无确认 UI 时绝不 silent send；有确认后可带 `attachmentDecisions` 重试 |
| Step B | run-level lightweight manifest 过渡记录 | `src/ui-app/app/appChatApp.logic.ts`, `infra/db/worker/handlers/branchContextHandlers.ts` | 在 beginTurn/stream 完成路径记录 `manifestDraft` 到现有 metadata（过渡） | 可关联 `assistantMessageId/candidateId/sentAssetIds/modelCapabilitySnapshot` |
| Step B | 回归与新增测试闭合 | `src/ui-app/AppChatApp.regenRetry.test.ts`, `src/ui-app/AppChatApp.questionBranching.test.ts`, `src/ui-app/AppChatApp.attachments.test.ts`, `infra/files/sendPlanService.test.ts`, `infra/files/conversationAttachmentService.test.ts`, `src/next/openrouter/openRouterSendPreparation.test.ts`, `src/next/openrouter/openRouterSendPlanSerializer.test.ts` | 新增 replay 场景用例与阻断时序断言 | 三入口附件 replay 可观测到 payload 层；blocked 行为正确；serializer 结构不分叉 |

#### Replay preparation API（实施版）

- 建议签名：
  - `prepareOpenRouterReplayFromMessage({ branchId, userMessageId, model, providerContext, replayMode: 'current', editedUserText?, attachmentDecisions? })`
- 输入：
  - `branchId`
  - `userMessageId`
  - `model`
  - `providerContext`
  - `replayMode: 'current'`
  - `editedUserText?`
  - `attachmentDecisions?`
- 输出：
  - `status: 'sendable' | 'blocked' | 'needs_confirmation'`
  - `currentUserContentBlocks`
  - `sentAssetIds`
  - `includedAttachments`
  - `excludedAttachments`
  - `blockingReasons`
  - `diagnostics`
  - `modelCapabilitySnapshot`
  - `manifestDraft`
- 内部复用链路：
  - 读取 message attachments：`conversationAttachmentService` / `messageAttachmentClient`。
  - send plan build：`sendPlan.prepareOpenRouter`（现有入口）。
  - derivative ensure/reuse：沿现有 `filePipelineHandlers` + `sendPlanService` 规则，不新增转换能力。
  - lineage/stale/hard gate：复用 `sendPlanService` 现有 gate。
  - serializer + metadata escaping：复用 `openRouterSendPreparation` / `openRouterSendPlanSerializer`。

#### 三入口接入方案

- Regenerate
  - `userMessageId`：直接使用 `questionId`（当前实现 `onRegenerateFromQuestion(questionId)`）。
  - 时序：先 replay prepare，后执行 `branch.regenerateFromQuestion` 与 stream。
  - blocked：不创建新 candidate，不改 chosen，不开流。
  - sendable：`streamOpenRouterChatAsEvents` 携带 `currentUserContentBlocks` 与 `contextMessages`。
- Retry Replace
  - `userMessageId`：由 `questionId` 直传（当前 `onRetryReplaceAnswer(questionId, currentAnswerRootId)` 已可用）。
  - 时序：replay prepare 必须先于 `branch.retryReplaceAnswer`（避免先删/先换旧答案）。
  - blocked：保留旧 answer，保持当前候选可见。
  - sendable：再执行 replace，并用 prepare 结果开流。
- Edit Question
  - 当前实现判定：主路径是编辑草稿模式（`openQuestionEdit -> cloneFromMessage`，`submitQuestionEdit` 时 `attachToMessage`）；同时存在 clone 失败时文本回退分支。
  - 接入方案：
    - 草稿路径：恢复附件为可见 draft attachments，用户可 `remove/exclude`，发送前统一走 replay/draft send preparation，不混入无关 composer draft。
    - 文本回退分支：进入 replay prepare（`editedUserText`）并显式标记无附件恢复能力限制；默认 `blocked + diagnostic`，避免 silent send。
  - blocked：不提交 edit resend，不创建新 assistant candidate。

#### 确认策略与 partial replay

- 本阶段禁止 partial silent send。
- 部分附件不可纳入时返回 `needs_confirmation` 或 `blocked`。
- 若确认 UI 尚未到位，统一执行 `blocked + diagnostic`。
- 用户确认 `exclude` 后才允许继续，并在 manifest 中记录 `excluded attachment + reasonCode`。
- 对当前消息附件不支持场景，必须提供 `include/exclude/remove` 决策，不得系统自动排除后继续。

#### 轻量 manifest 过渡方案

- 本轮不改 schema，`manifestDraft` 采用过渡承载：
  - 优先挂载到 assistant message metadata（run 完成或 beginTurn 关联时写入摘要）。
  - 持续复用现有 `sentAssetIds` 作为“实际发送资产”主索引。
  - 附件来源与 lineage 通过 `MessageAttachmentRecord + FileAsset.sourceMetaJson` 回查。
- 本轮不要求持久化“完整结构化 manifest 表”。
- 即便暂不持久化完整 manifest，测试仍需覆盖：
  - `currentUserContentBlocks` 正确；
  - `sentAssetIds` 仅 included；
  - `modelCapabilitySnapshot` 在 prepare 输出中可见。
- 长期触发 `run_manifest` 独立表条件（仅记录，不决策）：
  - 多候选 run 审计需求显著增加；
  - 需要跨会话可查询差异报告；
  - metadata 体积/查询复杂度逼近维护阈值。

#### 测试计划（实施导向）

- `src/ui-app/AppChatApp.regenRetry.test.ts`
  - `Regenerate` 历史附件进入 `currentUserContentBlocks`。
  - `Retry Replace` 历史附件进入 `currentUserContentBlocks`。
  - `blocked` Regenerate 不创建空 candidate。
  - `blocked` Retry Replace 不删除旧 answer。
- `src/ui-app/AppChatApp.questionBranching.test.ts`
  - Edit Question（草稿恢复附件）重发进入 `currentUserContentBlocks`。
  - Edit blocked 时不提交发送。
  - 不读取无关 composer draft。
- `src/ui-app/AppChatApp.attachments.test.ts`
  - preview_only 不 replay。
  - stale / controlled unavailable / hard gate blocked。
  - partial replay 默认 `needs_confirmation/blocked`。
- `infra/files/sendPlanService.test.ts`
  - replay collect + lineage/stale/hard gate + included/excluded 判定。
- `infra/files/conversationAttachmentService.test.ts`
  - 历史附件恢复与 `includeInNextRequest` 默认行为。
- `src/next/openrouter/openRouterSendPreparation.test.ts`
  - replay prepare 输出映射到 `currentUserContentBlocks/sentAssetIds`。
- `src/next/openrouter/openRouterSendPlanSerializer.test.ts`
  - replay 与 draft payload 结构不分叉；metadata escaping 复用。

#### 风险与回滚

- 最大风险
  - 破坏性操作时序错误（先 replace/regenerate 再判定 blocked）。
  - UI 临时兜底走 text-only 造成 silent fallback。
  - Edit 模式混合导致附件来源污染（混入 composer 其他附件）。
- 规避策略
  - 强制“先 prepare、后破坏性操作”。
  - stream 入参只接受 prepare 输出，不接受 UI 手工拼附件块。
  - 无确认 UI 时统一 `blocked + diagnostic`。
  - 清理路径继续遵守“仅规划入口，不提前删除资产”。
- 回滚策略
  - 若接入异常，回滚到“现有发送主链 + 禁止新 replay 入口启用”状态。
  - 保持 Step 0-5 已收官能力不变；不引入 schema 变更回滚负担。

#### 是否需要 DB schema

- 本实施稿结论：本轮不需要 DB schema 修改。
- 采用 `MessageAttachmentRecord + FileAsset.sourceMetaJson + sentAssetIds + message metadata` 过渡承载。
- 独立 `run_manifest` 表仅作为后续条件触发项，不在本轮决策与实施。

#### 是否建议下一轮直接实施

- 建议下一轮直接实施 Step A + Step B（两步内完成）。
- 若 UI confirmation 无法同轮落地，允许 Step B 先交付 `blocked + diagnostic`，但禁止任何 silent send。

### 2026-04-29 Current replay Step A 实施

- 本轮范围
  - 仅实现 runtime Step A 主路径。
  - 未实现完整 confirmation UI（Step B）。
  - 未改 DB schema，未扩展转换能力，未接 external converter runtime。

- 修改文件
  - `infra/db/types.ts`
  - `infra/db/validation.ts`
  - `infra/db/worker/handlers/filePipelineHandlers.ts`
  - `src/next/files/sendPlanClient.ts`
  - `src/next/openrouter/openRouterSendPreparation.ts`
  - `src/ui-app/app/appChatApp.logic.ts`
  - `src/ui-app/AppChatApp.regenRetry.test.ts`
  - `src/ui-app/AppChatApp.questionBranching.test.ts`
  - `src/ui-app/AppChatApp.attachments.test.ts`（测试桩参数兼容修复）

- Replay preparation API 落点
  - renderer client：`sendPlan.prepareOpenRouterReplayFromMessage`（`src/next/files/sendPlanClient.ts`）
  - worker handler：`filePipelineHandlers` 新增对应 handler
  - validation/types：新增 replay prepare 输入输出 contract
  - OpenRouter prep adapter：`prepareOpenRouterReplayFromMessage(...)`（`src/next/openrouter/openRouterSendPreparation.ts`）

- Regenerate 接入方式
  - `onRegenerateFromQuestion` 先调用 replay prepare（source=`questionId` 对应 userMessageId）。
  - `status !== sendable` 时直接阻断，不启动流，不进入后续破坏性发送步骤。
  - `sendable` 时才继续 regenerate 主路径，并把 `currentUserContentBlocks` 传入 `streamOpenRouterChatAsEvents`。

- Retry Replace 接入方式
  - `onRetryReplaceAnswer` 先做 replay prepare（source=`questionId` 对应 userMessageId）。
  - `blocked/needs_confirmation` 直接返回，保留旧 answer，不执行 replace。
  - `sendable` 时才执行 retry replace，并把 `currentUserContentBlocks` 传入流式请求。

- Edit Question 接入方式
  - 编辑草稿主路径：保留 `cloneFromMessage -> attachToMessage -> send`，并在发送前执行 replay prepare 防护。
  - 文本回退分支：本轮改为 `blocked + diagnostic`，禁止 silent text-only resend。
  - 不读取无关 composer draft 作为 Retry/Regenerate 历史附件来源。

- blocked / needs_confirmation 策略
  - Step A 无完整 confirmation UI：`needs_confirmation` 与 `blocked` 均按阻断处理。
  - 不允许 partial silent send，不允许 silent text-only fallback。
  - 破坏性操作（replace/regenerate 候选变更）必须在 replay prepare `sendable` 后执行。

- manifestDraft 过渡状态
  - 本轮由 replay API 返回 `manifestDraft`（含 run-level 摘要草案）。
  - 未新增 schema 持久化；仅作为返回值/诊断链路透传。
  - 过渡限制：当前 provenance 仍属 incomplete（未落库为独立 run manifest 结构）。

- 测试命令与结果
  - `npx vitest --run src/ui-app/AppChatApp.regenRetry.test.ts`：通过（5/5）
  - `npx vitest --run src/ui-app/AppChatApp.questionBranching.test.ts`：通过（5/5）
  - `npx vitest --run src/ui-app/AppChatApp.attachments.test.ts`：通过（37/37）
  - `npx vitest --run src/next/openrouter/openRouterSendPreparation.test.ts`：通过（2/2）
  - `npx vitest --run src/next/openrouter/openRouterSendPlanSerializer.test.ts`：通过（24/24）
  - `npx vitest --run infra/files/sendPlanService.test.ts`：通过（15 passed / 18 skipped）

- BetterSqlite3 状态
  - 本轮运行的用例未出现 BetterSqlite3 ABI 阻断；未做 ABI 处理。

- Step 0- Step 5 收官状态
  - 维持不变；本轮仅补 replay 主路径，不改主线能力边界。

- Step B 剩余事项
  - confirmation UI（exclude 明确确认）与 `needs_confirmation` 交互闭环。
  - manifestDraft 过渡持久化策略二选一落地（推荐 assistant message metadata）。
  - Edit Question 的 remove/exclude/新增附件全量交互与测试矩阵补齐。

### 2026-04-29 Current replay Step B 收尾

- 修改文件
  - `src/ui-app/app/appChatApp.logic.ts`
  - `infra/db/worker/handlers/filePipelineHandlers.ts`
  - `src/ui-app/AppChatApp.regenRetry.test.ts`
  - `src/ui-app/AppChatApp.questionBranching.test.ts`

- needs_confirmation 当前策略
  - 在无完整确认 UI 条件下，`needs_confirmation` 一律按阻断处理（`blocked + diagnostic`）。
  - Retry Replace / Regenerate / Edit Question 均要求 replay prepare `status=sendable` 才可继续。
  - 明确禁止 partial silent send 与 silent text-only fallback。

- manifestDraft 持久化状态
  - 本轮采用过渡持久化（不改 schema）：
    - 通过既有 `message.setStatus(metaPatch)` 写入 assistant message metadata。
    - 键位：`metaPatch.currentReplayManifestDraft`（仅 replay 场景写入）。
  - 未引入 `run_manifest` 表；未把 manifest 写入 `FileAsset.sourceMetaJson`。

- provenance 状态
  - 仍为过渡期，整体 provenance 仍标注 `incomplete`：
    - 已有 run 级摘要写入点；
    - 仍缺少独立结构化、可查询的 run_manifest 存储模型。

- 新增边缘阻断测试覆盖
  - `regenRetry` 新增：
    - replay `needs_confirmation` 时 Regenerate 阻断，不创建新 candidate。
    - replay `blocked` 时 Retry Replace 阻断，保留旧 answer。
  - `questionBranching` 新增：
    - Edit Question replay `needs_confirmation` 时阻断，不提交流式发送。
    - Edit fallback 分支继续验证 `blocked + diagnostic`（无静默 text-only）。
  - 既有 `attachments/sendPlanService` 用例继续覆盖 preview_only / stale / history excluded 等 gate。

- Edit Question remove/exclude/新增附件边界
  - 已补测试：
    - 恢复附件后 `remove`：重发 `currentUserContentBlocks` 不含该附件块。
    - 恢复附件后 `exclude`：UI 条目保留，重发不含该附件块。
    - 恢复附件 + 新增附件：重发输入能同时包含两者，来源不混淆。
    - 不读取无关 composer draft：Edit replay 不混入 unrelated compose 附件。

- 测试命令与结果
  - `npx vitest --run src/ui-app/AppChatApp.regenRetry.test.ts`：通过（7/7）
  - `npx vitest --run src/ui-app/AppChatApp.questionBranching.test.ts`：通过（10/10）
  - `npx vitest --run src/ui-app/AppChatApp.attachments.test.ts`：通过（37/37）
  - `npx vitest --run src/next/openrouter/openRouterSendPreparation.test.ts`：通过（2/2）
  - `npx vitest --run src/next/openrouter/openRouterSendPlanSerializer.test.ts`：通过（24/24）
  - `npx vitest --run infra/files/sendPlanService.test.ts`：通过（15 passed / 18 skipped）
  - `npx vitest --run infra/files/conversationAttachmentService.test.ts`：文件整体 skipped（12 skipped）

- BetterSqlite3 状态
  - 本轮未处理 ABI；`sendPlanService` 与 `conversationAttachmentService` 中 DB 相关用例维持 skipped 状态。

- 初次发送链路影响
  - 无回退。初次发送链路保持不变。

- Current replay 收尾判断
  - Step B 范围内（确认流最小策略、manifest 过渡、边缘阻断、Edit 边界）已收尾。
  - 未实现完整 confirmation UI（按本轮约束保留）。

- 剩余长期债务
  - `needs_confirmation` 的完整交互式确认 UI 与用户逐项 exclude 决策流程。
  - 独立 run_manifest 可查询存储（是否建表待后续决策）。
  - provenance 完整性提升（跨候选对比、审计查询能力）。

### 2026-04-29 Current replay 完整确认 UI

- 修改文件
  - `src/ui-app/app/appChatApp.logic.ts`
  - `src/ui-app/AppChatApp.vue`
  - `src/ui-app/AppChatApp.regenRetry.test.ts`
  - `src/ui-app/AppChatApp.questionBranching.test.ts`
  - `src/ui-app/AppChatApp.attachments.test.ts`
  - `src/next/files/sendPlanClient.ts`
  - `src/next/openrouter/openRouterSendPreparation.ts`
  - `infra/db/worker/handlers/filePipelineHandlers.ts`
  - `infra/db/types.ts`
  - `infra/db/validation.ts`

- UI 形态
  - 新增统一附件确认面板（overlay/panel），支持收起、恢复、取消发送、确认继续。
  - 面板收起后显示“打开面板”横幅；仍保持会话与 staged decisions。
  - 历史附件定位模式使用输入框上方定位条（打开面板/关闭定位/上一个/下一个/序号）。

- 双类目结构
  - 类目 1：`不受支持的历史消息附件`（history only）。
  - 类目 2：`当前不受支持的用户消息附件`（draft/edit_restored）。
  - 两类 UI、决策规则、按钮布局完全分离，不混列。

- 历史附件批量 exclude-only
  - 历史类目仅提供“所有附件 exclude 勾选项”，不提供逐项 exclude。
  - 单项历史行仅保留展示、预览、定位。
  - 未勾选“所有附件 exclude”时，确认按钮逻辑阻断并给出校验提示。
  - 确认后为历史不受支持附件逐项生成 `decision=exclude`。

- 历史附件定位模式与定位条
  - 支持从“所有附件定位”跳到首个历史不受支持附件。
  - 支持从单项“定位”跳到对应历史附件上下文并记录序号。
  - 定位条支持前后循环（首尾循环），并实时更新 `i/n`。
  - 定位时可收起面板且保留 staged decisions；可通过“打开面板”回到确认面板。

- 当前附件 exclude/remove 互斥
  - 当前类目每条附件支持 `exclude` 或 `remove`，二者互斥。
  - 支持 `exclude 全选/全不选` 与 `remove 全选/全不选`。
  - 任一当前不受支持附件未决策时不可确认，并聚焦/提示未决状态。

- staged decisions 与取消恢复
  - decisions 在确认前只做 staged，不立即落地。
  - “取消发送”销毁确认会话，清空 staged decisions，恢复原草稿/原编辑状态。
  - “确认并继续”后才应用 `exclude/remove` 并重跑 preflight / replay prepare。

- 草稿锁定规则
  - 只要确认会话存在（展开或收起），即锁定草稿交互：
    - 禁止编辑输入；
    - 禁止普通附件增删；
    - 禁止会影响 Send Plan 的模型切换；
    - 禁止新发送/regen/retry/edit submit 并发触发。

- 四类入口接入
  - 当前 composer 首次发送：检测到需确认时先弹面板，确认后重算 Send Plan，再发送。
  - Regenerate：`prepareOpenRouterReplayFromMessage` 返回 `needs_confirmation` 时先确认，再 replay prepare，再创建 candidate+stream。
  - Retry Replace：同上，且确认前不执行 replace，不隐藏/删除旧答案。
  - Edit Question：基于编辑草稿附件走同一确认链路；恢复附件与新增附件来源分离，避免混入无关 composer draft。

- attachmentDecisions 传递
  - 结构：`{ attachmentId, source, decision, reasonCode? }`。
  - `history` 仅 `exclude`；`draft/edit_restored` 支持 `exclude/remove`。
  - decisions 传入普通 draft preflight 与 replay prepare。

- manifestDraft 记录
  - 不改 DB schema、不增 `run_manifest` 表。
  - 通过现有 `manifestDraft` 与 assistant message metadata 过渡记录 decisions。

- 测试命令与结果
  - `npx vitest --run src/ui-app/AppChatApp.regenRetry.test.ts`：通过
  - `npx vitest --run src/ui-app/AppChatApp.questionBranching.test.ts`：通过
  - `npx vitest --run src/ui-app/AppChatApp.attachments.test.ts`：通过
  - `npx vitest --run src/next/openrouter/openRouterSendPreparation.test.ts`：通过
  - `npx vitest --run src/next/openrouter/openRouterSendPlanSerializer.test.ts`：通过
  - `npx vitest --run infra/files/sendPlanService.test.ts`：通过（15 passed / 18 skipped）
  - `npx vitest --run infra/files/conversationAttachmentService.test.ts`：文件级 skipped（12 skipped）

- BetterSqlite3 状态
  - 本轮仅记录 skip 状态；未处理 ABI。

- 对初次发送链路影响
  - 无回退；仅新增“需确认时的显式阻断与确认继续”分支。

- Step 0-5 边界状态
  - 保持 Step 0–Step 5 收官边界不变；未引入 schema 变更、未接 external converter runtime、未扩展转换能力。

- 剩余债务
  - 历史附件定位体验可继续增强（更明确的 message 锚点高亮）。
  - confirmation UI 细节样式与可访问性仍可继续打磨（不影响当前规则闭环）。
### 2026-04-29 Edit Question composer edit mode 收敛

- 问题现象:
  - 点击历史用户消息 `Edit` 后同时出现 text-only 二级编辑弹窗与背景 composer 草稿恢复，形成双编辑通道。
  - 同一附件在“历史附件”和“当前草稿附件”同时出现，触发 `higher-priority input` 去重后，历史卡片被标记为 `EXCLUDED FROM CURRENT CONTEXT`，并触发 composer 历史附件告警 banner。
- 根因:
  - `openQuestionEdit` 已调用 `conversationDraft.cloneFromMessage` 将文本+附件恢复到 composer draft。
  - 同时 `AppChatApp.vue` 仍渲染 `questionEditDialog` text-only modal，形成混用。
  - `refreshHistoryIncompatibleAttachments` 未区分 edit mode 目标消息附件，仍按普通 history 参与 excluded 汇总与 UI 告警。
- 是否存在 modal-edit 与 composer-edit 混用:
  - 是，已确认并收敛。
- 最终产品语义:
  - Edit Question 仅使用 composer edit mode。
  - 不再弹 text-only modal。
  - 编辑控制（取消/新建问题/替换问题）在 composer 区呈现。
  - 取消时恢复进入编辑前 draft（文本、附件、draftMode/editingSourceMessageId）。
- 修改文件:
  - `src/ui-app/app/appChatApp.logic.ts`
  - `src/ui-app/AppChatApp.vue`
  - `src/ui-app/AppChatApp.questionBranching.test.ts`
- history incompatible / higher-priority input 处理:
  - 在 edit mode 下，`refreshHistoryIncompatibleAttachments` 过滤正在编辑目标消息及其已恢复附件（`editingSourceMessageId` / `editRestoredDraftAttachmentAssetIds`），避免把这些附件作为普通历史附件告警。
  - `higher-priority input` 去重仍保留在 send-plan 内部语义，但不再对编辑目标附件输出误导性 history banner/红色历史状态。
- edit_restored 附件归类:
  - 维持现有 `buildCurrentConfirmationItemsFromSendPlan` 逻辑：通过 `editRestoredDraftAttachmentAssetIds` 将当前附件标记为 `source = edit_restored`，进入“当前不受支持的用户消息附件”分组，而非历史分组。
- 测试命令与结果:
  - `npx vitest --run src/ui-app/AppChatApp.questionBranching.test.ts` ✅
  - `npx vitest --run src/ui-app/AppChatApp.attachments.test.ts` ✅
  - `npx vitest --run src/ui-app/AppChatApp.regenRetry.test.ts` ✅
  - `npx vitest --run src/next/openrouter/openRouterSendPreparation.test.ts` ✅
  - `npx vitest --run src/next/openrouter/openRouterSendPlanSerializer.test.ts` ✅
- 是否影响初次发送:
  - 不影响；普通 composer send 流程未改，仅在 `isQuestionEditMode` 时禁用普通 send 以避免冲突。
- 是否影响 Retry/Regenerate:
  - 不影响；相关回归测试通过。
- 剩余债务:
  - edit mode 的“冲突操作锁定”目前以禁用普通 send + 继续允许草稿编辑为主，后续可进一步细化 model/side actions 的锁定策略（不涉及 schema/runtime 变更）。
