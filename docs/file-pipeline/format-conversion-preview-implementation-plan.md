# Starverse 文档格式转换与预览实施计划

## 1. 计划定位

本文档是“执行计划主文件”，用于后续工程分阶段落地、任务拆分、验收与回滚。  
`format-conversion-preview-final.md` 保留为设计信源与约束来源，不再作为执行阶段编排依据。  
后续实现默认以本文档阶段定义为准。

## 2. 设计信源与执行边界

- 设计信源：`docs/file-pipeline/format-conversion-preview-final.md`
- 进度账本：`docs/file-pipeline/format-conversion-preview-progress.md`
- 本计划文件：`docs/file-pipeline/format-conversion-preview-implementation-plan.md`

截至 2026-04-29，Step 0–Step 5 主线已完成；后续只保留维护态记录与 external converter runtime / sandbox runner 的独立规划入口，不再把外部转换器继续塞进当前主线。

本计划完整覆盖 final 文档原 Phase 1 至 Phase 6 能力域，并按当前仓库实际结构重组为可执行阶段，不沿用原分期顺序。

## 3. 当前代码基线摘要

- 文件资产与附件模型：已存在 `FileAssetRecord / DraftAttachmentRecord / MessageAttachmentRecord / FileDerivativeRecord`，附件主链可复用。
- 草稿附件：`conversationDraft` 侧已支持草稿关联、迁移、编辑消息克隆。
- 历史消息附件：已支持 message 绑定与 history snapshot；未发送草稿资产默认不进入历史绑定链。
- derivative / preview：`derivativeJobService` 框架成熟；`preview_optimized` 已可用；`converted_pdf` 仍未实现。
- Send Plan 与 preflight：`sendPlanService.buildSendPlan` 为核心；UI 侧已有 preflight gate 与 send 按钮联动。
- 模型兼容性判断：当前主链依据 `aiPayloadKind + processingStatus + modalities + providerContext`；缺少 `selected conversion option / targetKind / sendStrategy` 语义层。
- UI 附件展示：草稿条与历史附件卡片链路完整，可承接状态细化。
- 测试锚点：Send Plan、OpenRouter send preparation、UI attachment、dialog IPC 已有覆盖基础。
- 潜在 P0/P1：本地绝对路径在消费侧误日志风险仍需前置护栏；预览与发送“同源约束”未形成完整强校验；`convertible` 阶段与模型能力判断耦合导致 `.docx` 等易误导。

## 4. 总体实施策略

- 先风险护栏：先封堵 P0/P1 风险，避免后续功能扩展放大安全与历史污染面。
- 先语义解耦：先引入 `selected option / targetKind / sendStrategy`，再迁移 eligibility 判断。
- 先 Send Plan 正确性：确保判断依据从“源文件属性”转向“用户所选发送形态”。
- 先预览与发送同源：先建立 asset identity 约束，再接入复杂转换器。
- 后接真实转换器：CSV/XLSX/DOCX/PDF/HTML/PS-EPS 分批接入，避免一次性高风险合入。
- 后扩展高级 UI：基础正确性稳定后再暴露高级路径和实验能力。
- 后接外部进程与重转换能力：外部 runner 与重转换编排放在后段，降低早期复杂度。

## 5. 阶段总览

| 阶段 | 名称 | 覆盖能力域 | 主要目标 | 前置依赖 | 完成标志 |
|---|---|---|---|---|---|
| Step 0 | 风险护栏与执行基线冻结 | P0/P1 安全与日志护栏、历史污染防护、超大文本硬限制、外部沙箱前置边界 | 在不改功能语义前提下建立不可退让护栏与测试底线 | 无 | 风险护栏测试与文档约束落地，可作为后续阶段前置门槛 |
| Step 1 | 语义层建模与 Send Plan 解耦 | selected conversion option / targetKind / sendStrategy、eligibility 迁移、preflight 与 UI 状态联动 | 建立新语义层并完成 Send Plan 判定迁移主干 | Step 0 | `.docx/.html/.csv` 等兼容性依据切换为“所选目标形态” |
| Step 2 | 预览-发送同源与历史绑定强化 | preview/send asset 同源、stale 检测、历史消息绑定防污染、错误诊断与 warning 主干 | 建立可验证的资产同源约束和发送前一致性检查 | Step 1 | 发送前必校验同源；未发送资产不入历史；stale 不可发送 |
| Step 3 | 文本与结构化转换首批能力 | plain_text / markdown / code / table_markdown、CSV/TSV、超大文本 soft gate | 先打通低风险高收益格式转换主路径 | Step 2 | 文本类与 CSV/TSV 完整可预览可发送并具诊断 |
| Step 4 | Office 与 PDF 主路径 | XLSX/XLS、DOCX/RTF/DOC、PDF attachment、模型能力 gate | 落地业务核心文档能力与 PDF 附件策略 | Step 3 | Office 主格式可用；PDF 发送 gate 与模型能力判断一致 |
| Step 5 | HTML / PS-EPS / Hybrid 与后段能力 | HTML markdown/code/PDF、PS/EPS、Hybrid、高级 UI、外部进程扩展 | 收敛高复杂度能力并完成文档与测试闭环 | Step 4 | 高级路径受控上线，测试矩阵闭合，执行计划转维护态 |

## 6. 阶段详细实施方案

### 阶段 Step 0：风险护栏与执行基线冻结

#### 目标

先建立安全、日志、历史绑定与容量硬限制底线，防止后续阶段引入不可逆风险。

#### 范围

- 本地绝对路径不得进入日志（含 renderer 消费侧）
- 文件正文不得进入日志
- 文件名/元数据进入 prompt envelope 前统一 escaping 约束
- 未发送预览资产不得进入历史消息
- 超大文本 hard gate 不可绕过
- 外部转换器接入前沙箱边界与禁用默认联网约束
- 定点核验 `dialog:select-local-files`（`electron/ipc/dialogIpc.ts`、`electron/ipc/dialogIpc.test.ts`）

#### 不包含

- 不引入真实格式转换器
- 不改 UI 功能行为
- 不做 Send Plan 语义迁移

#### 涉及文件

- `electron/ipc/dialogIpc.ts`
- `electron/ipc/dialogIpc.test.ts`
- `src/next/openrouter/openRouterSendPreparation.ts`
- `src/next/openrouter/openRouterSendPlanSerializer.ts`
- `src/ui-app/app/appChatApp.logic.ts`
- `infra/files/conversationAttachmentService.ts`
- `infra/files/sendPlanService.ts`
- 相关测试文件（见测试计划）

#### 数据模型与类型变更

- 仅允许最小增量字段或错误码扩展（待确认）
- 不做大模型重构

#### 核心实现路径

1. 梳理并冻结“可写日志面”与“可入 prompt envelope 面”的字段白名单。
2. 在 send preparation 与 serializer 链路增加 metadata escaping 统一入口（若已有则收敛调用点）。
3. 在历史绑定入口追加“仅 used assets 可绑定”的一致性断言与失败诊断。
4. 在 preflight/send plan 层确认 hard gate 执行顺序不可被 UI 跳过。
5. 外部转换器相关能力全部挂到 sandbox policy feature flag，默认关闭。

#### 测试计划

- `electron/ipc/dialogIpc.test.ts`：补充消费侧误日志回归用例。
- `src/next/openrouter/openRouterSendPreparation.test.ts`：metadata escaping、正文不入日志。
- `src/next/openrouter/openRouterSendPlanSerializer.test.ts`：路径与 metadata 安全约束。
- `infra/files/sendPlanService.test.ts`：hard gate 不可绕过。
- `src/ui-app/AppChatApp.attachments.test.ts`：未发送资产不进历史（若现有覆盖不足则补足）。

#### 验收标准

- 任何日志中不出现本地绝对路径与文件正文。
- prompt envelope 元数据经 escaping 后进入下游。
- stale/unused preview 资产无法被历史消息绑定。
- 超大文本超过硬限制时无论 UI 分支均阻断发送。
- 外部转换器默认不可用且需显式安全开关。

#### 风险与回滚

- 风险：过严护栏导致诊断信息不足。  
- 回滚：仅回滚新增护栏分支，不回滚已有安全约束。  
- 影响：回滚后恢复旧行为，但会重新暴露已识别 P0/P1 面。

#### 文档更新

- `format-conversion-preview-progress.md` 记录护栏落实与测试结果。
- `format-conversion-preview-final.md` 如需补充“执行层安全解释”，仅做注记，不改设计结论。

### 阶段 Step 1：语义层建模与 Send Plan 解耦

#### 目标

引入 `selected conversion option / targetKind / sendStrategy` 语义层，替换以 `processingStatus` 为中心的兼容性主判断。

#### 范围

- 新语义类型定义与草稿绑定
- Send Plan eligibility 判断迁移
- preflight gate 与 UI 状态联动同步迁移
- OpenRouter send preparation 与 serializer 对新语义适配

#### 不包含

- 不接入复杂格式真实转换结果
- 不做高级转换 UI

#### 涉及文件

- `src/shared/files/sendPlanTypes.ts`
- `infra/files/sendPlanService.ts`
- `src/next/files/sendPlanClient.ts`
- `src/next/openrouter/openRouterSendPreparation.ts`
- `src/next/openrouter/openRouterSendPlanSerializer.ts`
- `src/ui-app/app/appChatApp.logic.ts`
- `src/ui-app/components/DraftAttachmentCard.vue`
- 相关测试文件

#### 数据模型与类型变更

- 新增或扩展：`selectedOption/targetKind/sendStrategy`（草稿与 plan 输出层）
- 旧字段兼容策略：保留 `processingStatus` 作为迁移期回退依据（待确认）

#### 核心实现路径

1. 在 shared types 定义新语义并建立最小可迁移映射。
2. Send Plan 先双轨计算（旧链+新链），测试通过后切主。
3. preflight 与 composer gate 改为消费新 plan 字段。
4. OpenRouter preparation/serializer 仅接受规范化 sendStrategy，拒绝模糊推断。
5. 迁移期输出诊断中标记“来自旧链/新链”用于灰度对比。

#### 测试计划

- `infra/files/sendPlanService.test.ts`：`.docx` 选 text/markdown 不因扩展名 incompatible；选 PDF 才走 file gate。
- `src/ui-app/components/ChatAppComposer.attachments.test.ts`：selected option 改变后 plan 重算。
- `src/next/openrouter/openRouterSendPreparation.test.ts`：新 sendStrategy 序列化一致性。

#### 验收标准

- Send Plan 主判定不再直接依赖原始扩展名。
- 选项切换可稳定触发 re-evaluate 与 UI 更新。
- `.docx` 在不同 targetKind 下的兼容性结果符合预期。

#### 风险与回滚

- 风险：迁移期判定分歧导致用户可见波动。  
- 回滚：保留旧链兜底开关，可快速切回。  
- 影响：回滚仅影响新语义判定，不影响附件基础链路。

#### 文档更新

- `format-conversion-preview-progress.md` 记录语义迁移差异清单与切换点。

### 阶段 Step 2：预览-发送同源与历史绑定强化

#### 目标

建立“预览资产=发送资产（或 contentHash 等价）”的强约束，完成 stale 识别与历史绑定治理。

#### 范围

- DerivedAsset 身份与版本约束
- preview/send 同源校验
- stale asset 发送阻断
- 历史消息绑定最小化（仅 used assets）
- 错误诊断与 warning 结构补齐

#### 不包含

- 不扩展新的格式转换器
- 不做高级预览 UI 重设计

#### 涉及文件

- `infra/files/derivativeJobService.ts`
- `src/next/files/derivativeJobClient.ts`
- `src/next/files/previewClient.ts`
- `infra/files/conversationAttachmentService.ts`
- `infra/files/sendPlanService.ts`
- `src/ui-app/app/appChatApp.logic.ts`
- 相关测试文件

#### 数据模型与类型变更

- 可能新增：`selectedSendAssetId/contentHashSnapshot/staleReason`（待确认）
- 需定义 preview 与 send 的引用一致性字段

#### 核心实现路径

1. 在 derivative 层统一内容哈希与参数哈希对齐规则。
2. 在 send plan 生成时加入同源校验结果并输出 blocking reason。
3. 在 message 绑定时校验“used asset 属于当前 send transaction”。
4. stale 检测触发后，引导重新生成并重算 plan。

#### 测试计划

- `infra/files/derivativeJobService.test.ts`：同源/失效规则。
- `infra/files/sendPlanService.test.ts`：stale 不可发送。
- `src/ui-app/AppChatApp.attachments.test.ts`：切换选项后旧预览不可直接发送。
- `infra/files/conversationAttachmentService` 对应测试：未发送资产不入历史。

#### 验收标准

- preview asset 与 send asset 必须同源或 contentHash 一致。
- stale asset 在 preflight 阶段必阻断。
- 历史消息只绑定实际发送资产。

#### 风险与回滚

- 风险：同源校验过严造成误阻断。  
- 回滚：可回退至 warning 模式，但保留日志与诊断。  
- 影响：回滚会降低一致性保证等级。

#### 文档更新

- `format-conversion-preview-progress.md` 记录同源校验策略与已知边界。

### 阶段 Step 3：文本与结构化转换首批能力

#### 目标

先落地低风险转换主路径，形成可用的文本/代码/表格 markdown 体验与 gating 规则。

#### 范围

- `plain_text / markdown / code / table_markdown`
- `CSV/TSV`
- 超大文本 soft gate（在 Step 0 hard gate 基础上）
- 基础 warning 与错误诊断

#### 不包含

- 不包含 XLSX/XLS 与 DOCX 深度语义
- 不包含 PDF attachment 真实转换

#### 涉及文件

- `src/shared/files/fileRules.ts`
- `infra/files/fileIngestionService.ts`
- `infra/files/derivativeJobService.ts`
- `infra/files/sendPlanService.ts`
- `src/ui-app/components/DraftAttachmentCard.vue`
- 相关测试文件

#### 数据模型与类型变更

- 可能扩展 conversion option 诊断字段（待确认）

#### 核心实现路径

1. 构建文本类 option 生成与默认推荐策略。
2. CSV/TSV 转 `table_markdown` 的 send/preview 统一产物。
3. 将 soft gate 与 warning 串入 preflight 与 UI 展示。
4. 输出转换损失与截断诊断结构。

#### 测试计划

- `infra/files/sendPlanService.test.ts`：CSV/TSV 兼容与 gating。
- 新增或扩展转换测试：table markdown 结构正确性。
- UI 测试：soft gate 提示与继续发送流程。

#### 验收标准

- 文本与 CSV/TSV 路径可预览、可发送、可诊断。
- soft gate 与 hard gate 分层清晰且行为稳定。

#### 风险与回滚

- 风险：表格解析差异影响 token 估算。  
- 回滚：保留 plain_text/code 兜底策略。  
- 影响：回滚时可能降级表格体验。

#### 文档更新

- progress 增加 CSV/TSV 与 text 路径验证结果。

### 阶段 Step 4：Office 与 PDF 主路径

#### 目标

建立业务核心文档能力：XLSX/XLS、DOCX/RTF/DOC、PDF attachment 与模型能力 gate。

#### 范围

- XLSX/XLS（多 sheet、公式/隐藏 warning）
- DOCX/RTF/DOC（markdown 主路径与 fallback）
- PDF attachment（仅 attachment 路径，不做 PDF 解析）
- 模型 `file/pdf` 能力 gate 对齐

#### 不包含

- HTML Chromium PDF
- PS/EPS Ghostscript
- Hybrid 高级组合 UI

#### 涉及文件

- `src/shared/files/fileRules.ts`
- `infra/files/derivativeJobService.ts`
- `infra/files/sendPlanService.ts`
- `src/next/openrouter/openRouterSendPreparation.ts`
- `src/next/openrouter/openRouterSendPlanSerializer.ts`
- `src/ui-app/app/appChatApp.logic.ts`
- 相关测试文件

#### 数据模型与类型变更

- 补齐 `converted_pdf` 与 Office 转换相关派生状态字段（待确认）

#### 核心实现路径

1. 先实现 option 层与 gating 层，再逐步接入转换执行层。
2. XLSX 与 DOCX 路径分别输出结构化 warning（公式、隐藏、修订痕迹等）。
3. PDF attachment 仅在选中该 targetKind 时触发 `file/pdf` 能力校验。
4. 失败路径必须提供 fallback（如 markdown 失败回退 PDF 或 code）。

#### 测试计划

- `infra/files/sendPlanService.test.ts`：DOCX markdown vs PDF attachment 分支。
- `src/next/openrouter/openRouterSendPreparation.test.ts`：PDF gate 与 payload 形成。
- 新增 Office 转换测试：XLSX 多 sheet/公式 warning、DOCX markdown 语义。

#### 验收标准

- `.docx` 选 markdown 不因原始扩展名阻断。
- `.docx` 选 PDF attachment 时才要求 file/PDF input。
- XLSX warning、PDF gate、fallback 均可见且可测。

#### 风险与回滚

- 风险：转换器行为不稳定导致结果抖动。  
- 回滚：保留 option 级降级路径与禁用开关。  
- 影响：可能临时关闭特定格式高级路径。

#### 文档更新

- progress 记录 Office/PDF 路径能力覆盖与已知限制。

### 阶段 Step 5：HTML / PS-EPS / Hybrid 与后段能力

#### 目标

收敛高复杂度路径，补齐 HTML、PS/EPS、Hybrid、高级 UI 与外部进程能力。

#### 范围

- HTML：markdown/code/PDF（JS 默认关闭）
- PS/EPS：code/PDF
- Hybrid：text + file 组合 sendPlan
- 错误诊断与 warning 完整化
- 测试矩阵收口与文档闭环

#### 不包含

- 自动摘要默认开启（仅评估，不默认启用）

#### 涉及文件

- `src/shared/files/fileRules.ts`
- `infra/files/derivativeJobService.ts`
- `infra/files/sendPlanService.ts`
- `src/next/openrouter/openRouterSendPlanSerializer.ts`
- `src/ui-app/components/DraftAttachmentStrip.vue`
- `src/ui-app/components/DraftAttachmentCard.vue`
- `src/ui-app/components/ChatAppComposer.vue`
- 相关测试文件

#### 数据模型与类型变更

- 可能扩展 HTML/PS-EPS 特定 warning 与 sandbox 执行元数据（待确认）

#### 核心实现路径

1. 在 Step 0 沙箱边界上接入 HTML/PS-EPS 外部能力。
2. 先保证默认安全策略（JS off、外链 off），再暴露可选开关。
3. Hybrid sendStrategy 进入 send plan 与 serializer，避免 request 组装歧义。
4. 完成高级 UI 暴露但不破坏基础流程。

#### 测试计划

- HTML：JS 默认关闭、外链默认关闭、PDF/markdown/code 分支。
- PS/EPS：code/PDF 分支与错误诊断。
- Hybrid：text+file 组合发送与模型能力 gate。
- 全链路回归：history 绑定、stale、日志护栏。

#### 验收标准

- HTML/PS-EPS/Hybrid 路径在安全边界内可用。
- 高级路径失败不影响基础路径发送。
- 测试矩阵关键项全部通过。

#### 风险与回滚

- 风险：外部进程能力导致平台差异。  
- 回滚：可按 capability flag 逐项关闭高风险路径。  
- 影响：回滚仅影响高级能力，不影响主链发送。

#### 文档更新

- final/progress/README 同步完成“设计-执行-进度”闭环状态。

## 7. Step 0 风险护栏

Step 0 为确定执行项，不是建议项。按以下顺序执行：

1. 核验并加固 `dialog:select-local-files` 路径：确认主进程不记录本地绝对路径；补充 renderer 消费侧误日志测试/文档护栏。
2. 建立日志字段白名单：文件正文与原始路径禁止进入日志；错误诊断只保留脱敏摘要。
3. 建立 prompt envelope escaping 入口：文件名、URL、元数据在进入模型请求前统一 escaping。
4. 增加历史绑定守卫：仅“本次发送所用资产”可进入 `MessageAttachment`。
5. 确认 hard gate 前置：超大文本硬限制在 preflight/send plan 必阻断，不可被 UI 分支绕过。
6. 外部转换器接入前置约束：未完成 sandbox policy 前，相关能力默认关闭且不可被普通配置开启。

## 8. 提交组织

建议每阶段拆分为 2-4 个提交，避免跨域大提交：

1. `step0-log-guardrails-and-envelope-escaping`
- 目的：建立日志与 envelope 安全底线
- 涉及文件：`dialogIpc`、OpenRouter preparation/serializer、相关测试
- 测试：日志脱敏、escaping、路径泄漏回归
- 回滚影响：回滚后恢复旧日志行为，安全风险回升

2. `step0-history-binding-and-hard-gate-assertions`
- 目的：历史污染防护 + hard gate 断言
- 涉及文件：`conversationAttachmentService`、`sendPlanService`、UI preflight 测试
- 测试：未发送资产不入历史、硬限制阻断
- 回滚影响：历史与容量风险回升

3. `step1-sendplan-semantic-layer`
- 目的：引入 selected option / targetKind / sendStrategy
- 涉及文件：shared types、send plan service/client、OpenRouter preparation
- 测试：选项切换重算、docx 兼容性分支
- 回滚影响：回退到旧判定链

4. `step2-asset-lineage-and-stale-gate`
- 目的：预览发送同源与 stale 阻断
- 涉及文件：derivative job、preview client、send plan、message binding
- 测试：contentHash 一致性、stale 不可发送
- 回滚影响：一致性约束降低

5. `step3-text-and-csv-tsv-paths`
- 目的：文本/代码/CSV-TSV 主路径
- 涉及文件：file rules、ingestion、send plan、UI 提示、测试
- 测试：table markdown、soft/hard gate
- 回滚影响：表格路径降级

6. `step4-office-and-pdf-attachment`
- 目的：XLSX/DOCX/PDF 主路径
- 涉及文件：conversion/derivative、send plan、OpenRouter serializer、测试
- 测试：docx markdown vs pdf gate、xlsx warning
- 回滚影响：Office 高级路径可按开关回退

7. `step5-html-ps-eps-hybrid-and-closeout`
- 目的：高复杂度路径与收口
- 涉及文件：HTML/PS-EPS/Hybrid 相关模块、UI 高级入口、测试与文档
- 测试：HTML JS off、PS/EPS、Hybrid
- 回滚影响：仅高级能力回退

## 9. 测试矩阵

- `.docx` 选择 text/markdown 后不因原始扩展名被判 incompatible
- `.docx` 选择 PDF attachment 时才要求 file/PDF input
- `selectedOption` 改变后 Send Plan 重新计算
- stale asset 不可发送
- preview asset 与 send asset `contentHash` 一致
- CSV/TSV `table_markdown` 路径正确
- XLSX 多 sheet 与公式 warning 正确
- DOCX markdown 语义路径正确
- PDF attachment 模型能力 gate 正确
- HTML JavaScript 默认关闭
- 未发送资产不进入历史消息
- 本地绝对路径不进入日志
- 超大文本 soft gate 与 hard gate 分层生效

## 10. 延后能力

以下能力明确延后到后期阶段，不提前混入基础阶段：

- HTML Chromium PDF
- Ghostscript PS/EPS
- Hybrid
- 完整高级转换路径 UI
- 外部进程 sandbox runner 完整能力
- 自动摘要

## 11. 后续接续方式

后续新会话 Agent 进入实现前，先按以下顺序阅读：

1. `docs/file-pipeline/format-conversion-preview-final.md`（设计信源）
2. `docs/file-pipeline/format-conversion-preview-implementation-plan.md`（执行计划主文件）
3. `docs/file-pipeline/format-conversion-preview-progress.md`（进度账本与阶段记录）

执行中如发现与设计信源冲突，以 final 的设计约束为准；如发现与执行阶段冲突，以 implementation plan 阶段边界为准并回写 progress 说明。
