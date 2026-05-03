# Step 1 仓库勘察：Starverse 文件类型检测绑定地图

## 1. 勘察范围与限制

本轮仅完成两件事：

1. 文档迁移与整理（源目录到 `docs/file-pipeline/file-type-detection-implementation`）。
2. 仓库只读勘察并产出绑定地图。

明确未做：未实现文件类型检测；未新增 `src/next/file-type` 等正式实现模块；未修改既有文件管线、发送链路、UI 附件业务逻辑、数据库 schema 或 IPC 协议。

## 2. 文档迁移结果

- 源目录：`C:\Users\m1389\Downloads\starverse-file-type-detection-implementation`
- 目标目录：`D:\Starverse\docs\file-pipeline\file-type-detection-implementation`
- 迁移对象（源目录全部文件）：
  - `README.md`
  - `00-project-freeze.md`
  - `01-agent-sync.md`
  - `02-step1-repo-survey-task-package.md`
  - `03-supervisor-review-checklist.md`
  - `starverse_file_type_detection_engineering_final.markdown`
- 冲突处理：
  - 目标目录已存在同名文件。
  - 逐个比对 SHA256 后均一致。
  - 采用保守策略：保留目标文件，删除源重复文件，不做覆盖。
- 迁移后状态：
  - 源目录已清空（空目录保留）。
  - 本目录 `README.md` 已补充 Step 1 状态与成果文档索引。

## 3. 文件资产与上传入口

### 3.1 核心入口与调用链

- 文件入库服务存在：`D:\Starverse\infra\files\fileIngestionService.ts`
  - 关键函数：`ingestLocalFile`、`ingestUrl`
- IPC/worker 入口：`D:\Starverse\infra\db\worker\handlers\filePipelineHandlers.ts`
  - `fileIngestion.ingestLocalFile`
  - `fileIngestion.ingestUrl`
  - `sendPlan.prepareOpenRouter`
- renderer 调用链：
  - 选择文件：`electronAPI.selectLocalFiles`（`D:\Starverse\electron\preload.ts`）-> `dialog:select-local-files`（`D:\Starverse\electron\ipc\dialogIpc.ts`）
  - 拖拽/粘贴：`handleDropFiles`、`handlePasteAttachment` -> `ingestLocalFiles`（`D:\Starverse\src\ui-app\app\appChatApp.logic.ts`）
  - URL 附件：`ingestUrlAttachment`（同文件）

### 3.2 是否已有统一入口

- 上传、拖拽、粘贴、本地选择、URL 导入，最终可收敛到 ingestion 与草稿附件链路。
- 历史附件复用/回放主要走 `conversationAttachmentService` + `message_attachments/draft_attachments` 快照链，不完全等同于 ingestion 单入口。

### 3.3 现有资产字段

- `file_assets`（`D:\Starverse\infra\db\schema.sql`）及 `DecodedFileAsset`（`D:\Starverse\src\next\ipc\contracts\dbBridgeContracts.ts`）包含：
  - `id`
  - `filename`（可映射 displayName）
  - `extension`
  - `mime`
  - `size_bytes`
  - `created_at/updated_at`（可映射 mtime）
  - `storage_backend`
  - `storage_uri`（可映射 path token）
  - `source_meta_json`（可承载 content token/URL probe/retention 信息）

### 3.4 renderer 持有绝对路径与 IPC 引用传递

- `resolveImageRenderUrl` 会按 `assetUrl -> fileUrl -> path` 回退（`D:\Starverse\src\ui-app\app\appChatApp.logic.ts`），存在 renderer 接触路径字符串的路径。
- `dbBridge` 现有日志会输出 `payload.params`（`D:\Starverse\electron\ipc\dbBridge.ts`），若参数包含本地路径，存在日志泄露面。

## 4. FileAccessRef 或等价结构现状

### 4.1 现状结论

- 代码中未发现统一命名 `FileAccessRef`。
- 等价结构分散存在：
  - 发送层引用：`SendPlanAttachmentRef`（`D:\Starverse\src\shared\files\sendPlanTypes.ts`）
  - 存储层引用：`storageBackend + storageUri`（`D:\Starverse\infra\db\types.ts`）
  - 受控路径解析：`resolveManagedStoragePath`（`D:\Starverse\src\shared\files\localStorageResolver.ts`）

### 4.2 缺口

- 当前“可访问文件引用”语义未统一为单一结构体，导致 send plan、derivative、serializer 分别维护字段约束。

## 5. 附件、草稿与历史消息 schema

### 5.1 关系模型

- 核心关系：`file_assets` <- `draft_attachments` / `message_attachments`
- 草稿主体：`conversation_drafts`
- 生命周期：`file_attachment_lifecycle`
- 旧轨并存：`attachment/asset/message_asset` 仍在 `schema.sql` 内。

### 5.2 删除语义

- 删除 draft 附件：删 `draft_attachments` 关系并更新生命周期，不直接删底层 asset。
  - 证据：`removeDraftAttachment`（`D:\Starverse\infra\files\conversationAttachmentService.ts`）
  - 测试：`removes draft attachments without deleting the asset`（`D:\Starverse\infra\files\conversationAttachmentService.test.ts`）

### 5.3 历史附件是否只读

- 历史附件 UI 以展示为主：
  - `MessageAttachmentList.vue`
  - `MessageAttachmentCard.vue`
- 具备 `displayStatus/isHistoryIncompatible/incompatibilityReason`，未暴露编辑/解绑入口（历史视图）。

### 5.4 status/send method/retention/compatibility 字段

- 附件状态字段：
  - `processing_status`
  - `include_in_next_request`
  - `excluded_reason`
- 草稿偏好字段：
  - `preferred_send_mode`
  - `url_retention_mode`
- 兼容性结论：
  - 主要由 `sendPlanService` 运行时计算 `AttachmentCompatibilityDescriptor`，未单独落库存储。

## 6. sendPlanService 与模型兼容性现状

### 6.1 路径与职责

- 路径：`D:\Starverse\infra\files\sendPlanService.ts`
- 当前职责：
  - 收集输入：`collectCurrentSendInputs`
  - 兼容性评估：`evaluateAttachmentCompatibility`
  - 生成发送计划：`buildSendPlan`

### 6.2 当前判断依据

- 已使用多维判断：
  - `aiPayloadKind`
  - `processingStatus`
  - `mime/extension`（尤其文本/可转文本链）
  - provider capability/context
- 非单一 extension 或 MIME 判断。

### 6.3 与 OpenRouter request preparation 关系

- worker 先执行 `sendPlan.prepareOpenRouter`（`filePipelineHandlers.ts`），再调用 `serializeSendPlanForOpenRouter`（`D:\Starverse\src\next\openrouter\openRouterSendPlanSerializer.ts`）。
- renderer 通过 `prepareOpenRouterSendFromDraft`（`D:\Starverse\src\next\openrouter\openRouterSendPreparation.ts`）获取序列化结果，`openRouterLiveStream`（`D:\Starverse\src\next\live\openRouterLiveStream.ts`）再建请求体。

### 6.4 后续边界建议（Step 2 输入）

- 适合迁移到 `sendRouteMapping`（新模块）的逻辑：
  - 路由选择矩阵（model x payload x send mode）
  - 首选/回退模式排序策略
- 应保留在 `sendPlanService` 的逻辑：
  - 上下文收集与 lineage gate
  - 发送前硬阻断（缺可发送表示、缺必要衍生物、状态非法）
  - 最终 plan 一致性校验

## 7. derivativeJobService、预览与转换现状

### 7.1 路径与现有能力

- 路径：`D:\Starverse\infra\files\derivativeJobService.ts`
- 已覆盖 derivative kind（含部分可运行）：
  - `preview_optimized`
  - `extracted_text`
  - `transcript`
  - `embedding_vector`
- 已留占位/未完全实现：
  - `converted_pdf`
  - `send_optimized`
  - `thumbnail`
  - `ocr_text`

### 7.2 预览生成与缓存

- 预览查询：`getLatestReadyPreviewDerivative`
- 预览确保：`ensurePreviewDerivative`
- 结果存于 derivative 记录并通过 `storageUri` 受控访问。

### 7.3 job framework 与 parser validation 迹象

- 已有 job 记录与状态推进（repo + worker + service）。
- 存在局部解析校验（如 PDF annotation parse fail），但尚未见独立 parser validation 框架模块。
- `detectFull` 仅在设计文档中出现，仓库代码未落地实现。

## 8. UI 附件组件与状态展示现状

### 8.1 组件路径

- Draft 区：
  - `D:\Starverse\src\ui-app\components\DraftAttachmentStrip.vue`
  - `D:\Starverse\src\ui-app\components\DraftAttachmentCard.vue`
  - `D:\Starverse\src\ui-app\components\DraftAttachmentDetailsDialog.vue`
- Message 区：
  - `D:\Starverse\src\ui-kit\chat\MessageAttachmentList.vue`
  - `D:\Starverse\src\ui-kit\chat\MessageAttachmentCard.vue`
  - `D:\Starverse\src\ui-kit\chat\types.ts`

### 8.2 状态与提示来源

- 主要在 app 层统一计算：`D:\Starverse\src\ui-app\app\appChatApp.logic.ts`
  - `normalizeDraftAttachmentDisplayStatus`
  - `resolveHistoryAttachmentDisplayStatus`
  - `getDraftAttachmentWarningReason`
  - `getDraftAttachmentBlockingReason`
  - `evaluateComposerSendPlanGate`
  - `applyComposerSendPlanGateState`
- 卡片组件以展示为主，不应内嵌类型兼容业务判定。

### 8.3 最小 UI 接入建议

- Step 2+ 最小接入点：
  - app 层 ViewModel 组装函数
  - Details Dialog 的新增字段展示
- 不建议直接接入点：
  - `DraftAttachmentCard.vue` / `MessageAttachmentCard.vue` 内部做类型判定分支。

## 9. 数据库、repo 与 migration 现状

### 9.1 路径与组织

- 主 schema：`D:\Starverse\infra\db\schema.sql`
- repo：`D:\Starverse\infra\db\repo\*.ts`
- migration：`D:\Starverse\infra\db\migrations\*.ts`
- worker 启动：`D:\Starverse\infra\db\worker\runtime.ts`
- SQLite 文件：`app.getPath('userData')/chat.db`（`D:\Starverse\electron\main.ts`）

### 9.2 migration 风格

- `schema.sql` 基础建表 + `ensure*Schema` 幂等补偿（`CREATE IF NOT EXISTS`、按需 `ALTER`、个别重建表）。

### 9.3 betterSqliteGate / helper

- 存在测试 helper：`D:\Starverse\infra\testUtils\betterSqliteGate.ts`

### 9.4 FileTypeVerdict 未来存储候选

- 候选 A（短期最小变更）：`file_assets.source_meta_json` 扩展 verdict 子对象。
- 候选 B（中期清晰边界）：新增 `file_type_verdicts` 独立表（按 `asset_id` + version/updated_at 管理）。
- 结合现状建议：Step 2 先出两案并评估 migration 风险，不在 Step 1 决策落地。

### 9.5 兼容注意

- 旧轨 `message_asset` 与新轨 `message_attachments` 并存，禁止贸然删旧表。
- 注意 `urlRetentionMode` 契约边界：schema/类型/前端默认值存在不一致风险（见第 15 节）。

## 10. 测试体系与 fixture 现状

### 10.1 测试组织

- 采用混合布局：
  - 根级 `tests/`
  - 模块就近 `*.test.ts`
- 全局配置：`D:\Starverse\vitest.config.ts`
- 通用 setup：`D:\Starverse\tests\setup.ts`

### 10.2 文件管线相关测试

- `D:\Starverse\infra\db\worker.filePipeline.test.ts`
- `D:\Starverse\infra\db\repo\filePipelineRepo.test.ts`
- `D:\Starverse\infra\files\sendPlanService.test.ts`
- `D:\Starverse\src\ui-app\AppChatApp.attachments.test.ts`
- `D:\Starverse\src\next\openrouter\openRouterSendPlanSerializer.test.ts`

### 10.3 fixture 与二进制样本

- 现有 fixture 目录：
  - `D:\Starverse\tests\fixtures\model-catalog`
  - `D:\Starverse\src\next\openrouter\sse\fixtures`
- 二进制样本多为测试内联（`Uint8Array`/临时文件写入）。
- 未发现统一“二进制 fixture 管理规范”文档。

### 10.4 Step 2 最小测试切片可复用项

- `tests/setup.ts`（桥接 mock 基线）
- `infra/testUtils/betterSqliteGate.ts`
- `openRouterSendPlanSerializer` 相关断言样式
- `AppChatApp.attachments.test.ts` 的 UI 门禁断言样式

## 11. 日志、隐私与路径脱敏现状

### 11.1 现有脱敏能力

- `D:\Starverse\src\next\transport\openrouterFetch.ts`
  - `createRequestSummary`
  - `sanitizeHeadersForLog`
  - `sanitizeBodyForLog`
- `D:\Starverse\src\next\ipc\sanitizeForIpc.ts`
- `D:\Starverse\electron\ipc\dialogIpc.ts` 的 `sanitizeDialogErrorMessage`
- `D:\Starverse\infra\files\derivativeJobService.ts` 的 `sanitizeDerivativeErrorMessage`

### 11.2 风险点

- `D:\Starverse\electron\ipc\imageIpc.ts` 存在多处 `console.log` 直接打印本地路径。
- `D:\Starverse\electron\ipc\dbBridge.ts` 打印 `payload.params`，路径参数可能外泄。
- 诊断导出链路（`src/next/netExp/*`）需持续检查原始错误与参数输出。

## 12. Starverse 绑定地图

| 目标能力 | 应接入的现有模块 | 建议新增模块 | 不应修改或不应重写的模块 | 风险等级 | 备注 |
|---|---|---|---|---|---|
| 基础类型判定结果挂接 | `infra/files/fileIngestionService.ts`、`infra/db/repo/fileAssetRepo.ts` | `src/next/file-type/*`（Step 2+） | 现有 ingestion 主流程重写 | 中 | Step 1 仅定位，不实现 |
| 发送路由映射 | `infra/files/sendPlanService.ts`、`src/next/openrouter/openRouterSendPlanSerializer.ts` | `sendRouteMapping`（规划） | 直接重写 sendPlanService 核心逻辑 | 高 | 建议先旁路接入再收敛 |
| 预览/转换协同 | `infra/files/derivativeJobService.ts`、`fileDerivativeRepo` | detectFull/parser validation 协作层 | 重写 derivative job framework | 中 | 现有 job 框架可复用 |
| 草稿与历史附件类型呈现 | `src/ui-app/app/appChatApp.logic.ts`、Draft/Message 附件组件 | 类型 verdict -> VM 适配层 | 在 card 组件内直接做类型判定 | 高 | 防止 UI 与 send plan 双轨 |
| verdict 持久化 | `infra/db/schema.sql`、`ensureFilePipelineSchema.ts` | verdict 独立表或 `source_meta_json` 扩展 | 破坏既有 migration 顺序 | 高 | 需 Owner 决策存储形态 |
| 日志与隐私 | `openrouterFetch.ts`、`sanitizeForIpc.ts`、`dialogIpc.ts` | file-type 专用日志脱敏 helper | 放宽现有日志脱敏规则 | 高 | 路径泄露需优先治理 |

## 13. 可修改文件清单

以下为后续阶段（Step 2+）可考虑修改范围（本轮未修改）：

- `D:\Starverse\infra\files\sendPlanService.ts`：接入新的路由映射调用点（保留现有 gate）。
- `D:\Starverse\infra\db\worker\handlers\filePipelineHandlers.ts`：将新判定结果并入 prepare/build payload。
- `D:\Starverse\src\ui-app\app\appChatApp.logic.ts`：扩展附件 VM 字段与状态映射。
- `D:\Starverse\src\next\openrouter\openRouterSendPlanSerializer.ts`：消费新 route/verdict 字段（不改协议边界）。
- `D:\Starverse\infra\db\migrations\ensureFilePipelineSchema.ts`：若落库 verdict，需要增量 migration。
- `D:\Starverse\infra\db\repo\fileAssetRepo.ts`（及关联 repo）：读写 verdict 持久化字段。
- `D:\Starverse\infra\files\derivativeJobService.ts`：在需要时接入 parser validation 触发点。

## 14. 禁止重写文件清单

以下模块建议明确禁止“整段重写”，仅允许最小增量接入：

- `D:\Starverse\infra\files\sendPlanService.ts`（发送计划核心，回归风险高）
- `D:\Starverse\infra\db\worker\handlers\filePipelineHandlers.ts`（IPC/worker 主入口）
- `D:\Starverse\src\ui-app\app\appChatApp.logic.ts`（前端核心状态机）
- `D:\Starverse\infra\db\schema.sql`（历史兼容面广）
- `D:\Starverse\infra\db\migrations\ensureFilePipelineSchema.ts`（线上升级路径）
- `D:\Starverse\electron\preload.ts` 与 `D:\Starverse\electron\ipc\*.ts`（安全边界与 IPC 协议）

## 15. 潜在冲突点与待决策问题

### 15.1 潜在冲突点

1. **并行体系风险**：若新建 route mapping 同时保留旧 sendPlan 内部矩阵且长期并行，可能出现双重判定分叉。
2. **旧逻辑残留风险**：`message_asset` 旧轨与 `message_attachments` 新轨并存，迁移边界不清会产生读写口径差异。
3. **UI 越界判断风险**：若在 `DraftAttachmentCard/MessageAttachmentCard` 直接加类型判定，会与 app 层 gate 冲突。
4. **数据库兼容风险**：`urlRetentionMode` 在不同层的枚举约束存在不一致风险，需要统一策略。
5. **日志隐私风险**：`imageIpc.ts` 与 `dbBridge.ts` 现有日志点可能泄露本地路径。
6. **OpenRouter 路径风险**：`provider_file_ref` 在类型中存在但序列化阶段明确拒绝，后续接入需先定义策略。

### 15.2 Step 1 后已冻结决策（摘要）

1. `FileTypeVerdict` 持久化：采用独立表方案（不采用仅写入 `source_meta_json` 的临时方案）。
2. `sendRouteMapping` 引入节奏：采用旁路渐进，但必须最终完整替代旧判断。
3. 旧 `message_asset` 轨道：允许退场，不保留旧数据兼容包袱。
4. 其余如 `provider_file_ref` MVP 策略、路径日志治理优先级，纳入 Step 2 实施附录细化。
5. 详细冻结内容见 `05-owner-decisions-before-step2.md`。

## 16. Step 2 输入建议

1. 先产出“路由边界设计稿”：
   - sendRouteMapping 输入/输出契约
   - sendPlanService 保留职责清单
2. 先定 verdict 持久化方案（A/B 两案二选一）并附 migration 风险评审。
3. 明确 UI 只读/可编辑边界：
   - verdict 显示在 app-layer VM 计算
   - 卡片组件只消费结果，不做判定
4. 补一组最小测试切片清单（repo、sendPlan、serializer、AppChatApp.attachments）。
5. 将路径日志脱敏列入 Step 2 同步检查项，避免新链路带入绝对路径。

## 17. Step 1 后 Owner 决策

- `FileTypeVerdict` 将采用独立表方案（从 MVP 起落地），不采用仅写入 metadata JSON 的临时方案。
- `sendRouteMapping` 采用旁路渐进引入，但必须最终完整替代旧文件类型判断，禁止长期双轨并行。
- 旧 `message_asset` 轨道允许退场，不保留旧数据兼容包袱；未来以 `file_assets + draft_attachments + message_attachments` 为主轨。
- `provider_file_ref` 不进入 MVP，后续作为 P1/P2 扩展项单独设计生命周期与兼容策略。
- 路径日志泄露需先做最低限度独立护栏修复，不混入文件类型检测实现。
- 详细决策与 Step 2 强约束见：`05-owner-decisions-before-step2.md`。
