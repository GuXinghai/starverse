# Step 2 Agent 实施附录

## 1. 文档目的与适用范围

本文件用于把 Step 0/Step 1 与 Owner 冻结决策转译为后续 Agent 可执行的工程实施规则。  
本文件不包含代码实现，不包含 migration 代码，不直接改动运行时逻辑。

## 2. 权威输入文档

- `starverse_file_type_detection_engineering_final.markdown`
- `00-project-freeze.md`
- `04-step1-repo-survey-binding-map.md`
- `05-owner-decisions-before-step2.md`

若与其他文档冲突，优先级遵循：`05 > 00 > final.markdown > 04 > README`。

## 3. 全局实施边界

后续所有阶段必须遵守：

1. detector 只产生 evidence，不直接决定发送路线。
2. evidenceMerge 只生成 `primary / conflicts / flags`。
3. fileTypeStaticPolicy 只基于文件内容与静态规则。
4. sendRouteMapping 基于 `verdict + modelCapabilities + userPrefs + engineAvailability + override` 生成 `SendPlanCandidate`。
5. sendPlanService 仅保留最终发送前 gate（安全校验、模型能力最终确认、请求构造前一致性检查）。
6. UI 不自行判断文件类型，只消费上游状态与候选路线。
7. 用户 override 不修改 evidence、primary verdict、cached verdict。
8. detection cache 不缓存 SendPlanCandidate。
9. renderer 不持有真实绝对路径、contentToken 原文、外部命令参数。
10. blocked 文案不得表达“恶意判定”，仅表达兼容性/安全策略限制。

## 4. Starverse 主接入地图

| 模块 | 当前职责 | 未来接入方式 | 允许修改范围 | 禁止重写事项 | 风险等级 |
|---|---|---|---|---|---|
| `infra/files/fileIngestionService.ts` | 本地文件/URL 入库、资产初始信息落库 | 接入 detect 触发点与 fingerprint 输入来源 | ingestion 后置挂接点 | 不重写 ingestion 主流程 | 中 |
| `file_assets` | 文件资产主表 | 通过 `asset_id` 关联 verdict 表 | 新增 verdict 关联查询能力（后续阶段） | 不改现有资产语义 | 中 |
| `draft_attachments` | 草稿附件关系与偏好 | 承载 candidate 展示输入 | 增量字段消费 | 不破坏草稿关系语义 | 中 |
| `message_attachments` | 消息附件关系与发送状态 | 承载最终路线结果映射 | 增量读取/标记 | 不重写历史附件链路 | 中 |
| `infra/files/sendPlanService.ts` | 现有发送规划与最终 gate | 渐进消费 SendPlanCandidate，收敛至最终 gate | 按阶段替换类型判断分支 | 不整体重写 | 高 |
| `infra/files/derivativeJobService.ts` | 预览/转换/文本提取作业 | 作为 requiresJob 的执行层 | 新增最小调度对接 | 不重写 job framework | 中 |
| `src/next/files/conversationDraftClient.ts` | 草稿附件读写 IPC client | 增量透传 verdict/candidate 相关读取结果 | DTO/契约增量扩展 | 不改业务语义 | 低 |
| `src/ui-app/app/appChatApp.logic.ts` | UI 层状态组装与门禁视图模型 | 展示 verdict/candidate，不做类型判断 | VM 映射层增量 | 不把类型规则下沉到组件 | 高 |
| `DraftAttachmentCard`/`MessageAttachmentCard` | 附件卡片展示 | 展示新增字段（类型/路线/冲突） | 纯展示层 | 不做 extension/MIME 规则判断 | 高 |
| SQLite repo/migrations | 持久化与升级 | Stage C 引入独立 verdict 表与 repo 最小骨架 | 新增独立 repo/migration | 不破坏既有迁移链 | 高 |
| tests/fixtures | 回归与样本验证 | 引入 file-type fixtures 与 expected 基线 | 按阶段新增测试 | 不混入无关重构 | 中 |
| logging/privacy | 脱敏与诊断 | Stage A 先补最小路径护栏 | 仅最小脱敏补丁 | 不混入 file-type 主实现 | 高 |

## 5. FileTypeVerdict 独立表设计方向

### 5.1 冻结结论

- MVP 采用独立表。
- 不采用仅写入 `source_meta_json` 的临时方案。
- Step 2 仅设计，不执行 migration。

### 5.2 最小表语义

- 一条 verdict 记录绑定一个 `asset_id`。
- MVP 可只保存“当前有效 snapshot”。
- 设计需支持未来历史版本、批量重检、审计追踪。

### 5.3 最小字段草案（非 SQL）

| 字段 | 说明 |
|---|---|
| `id` | verdict 记录主键 |
| `asset_id` | 关联 `file_assets.id` |
| `verdict_json` | 结构化 verdict 快照 |
| `primary_format_id` | primary 格式标识 |
| `primary_kind` | 主类目（text/image/pdf/...） |
| `confidence_level` | 置信等级 |
| `schema_version` | verdict schema 版本 |
| `taxonomy_version` | taxonomy 版本 |
| `taxonomy_map_version` | map 版本 |
| `magic_table_version` | magic 规则版本 |
| `merge_rules_version` | evidence merge 规则版本 |
| `container_probe_version` | 容器探针版本 |
| `text_probe_version` | 文本探针版本 |
| `magika_model_version` | Magika 模型版本 |
| `fingerprint_json` | 指纹快照 |
| `is_current` 或 `stale_state` | 当前有效或失效状态 |
| `created_at` | 创建时间 |
| `updated_at` | 更新时间 |

### 5.4 与 `file_assets` 的关系

- `file_assets` 继续作为资产事实主表；
- verdict 表承载“可重算、可失效、可审计”的识别结果层；
- 路线候选不入 verdict 表（防止模型偏好污染静态识别层）。

### 5.5 迁移阶段安排

- migration 与 repo 骨架在 Stage C 规划与执行；
- Stage B 不提前合并 migration 或 repo。

## 6. sendRouteMapping 替代矩阵

| 当前判断类型 | 当前可能所在模块 | 未来归属 | 迁移阶段 | sendPlanService 是否保留 | 验收方式 | 风险 |
|---|---|---|---|---|---|---|
| 文本 `direct_text` | `sendPlanService` | `sendRouteMapping` | F/G | 保留最终 gate | candidate 对照测试 | 中 |
| 图片 `direct_image` | `sendPlanService` | `sendRouteMapping` | F/G | 保留最终 gate | 模型能力对照测试 | 中 |
| PDF `direct_file/converted_markdown` | `sendPlanService` + derivative | `sendRouteMapping` 决策，derivative 执行 | F/G | 保留最终 gate | requiresJob 分支测试 | 高 |
| Office `converted_markdown` | `sendPlanService` | `sendRouteMapping` | F/G | 保留最终 gate | 转换前置条件测试 | 高 |
| 表格 `converted_markdown/converted_csv` | `sendPlanService` | `sendRouteMapping` | F/G | 保留最终 gate | candidate 与 job 对照 | 中 |
| PPT `converted_markdown/rendered_images` | `sendPlanService` + derivative | `sendRouteMapping` + derivative | F/G | 保留最终 gate | 路线+衍生物联测 | 高 |
| HTML/SVG 安全处理 | `sendPlanService`/静态规则 | `fileTypeStaticPolicy + sendRouteMapping` | D/F | 保留最终 gate | 安全样本回归 | 高 |
| archive `ask_user` | 现有状态判断 | `sendRouteMapping` | F | 保留最终 gate | ask_user 文案检查 | 中 |
| executable `blocked` | 现有状态判断 | `fileTypeStaticPolicy + sendRouteMapping` | D/F | 保留最终 gate | blocked reasonCode 测试 | 高 |
| `unknown_binary` `ask_user/blocked` | 现有状态判断 | `sendRouteMapping` | F | 保留最终 gate | 对照测试 | 中 |
| 模型能力过滤 | `sendPlanService` | `sendRouteMapping` 主判 + sendPlan 最终确认 | F/G | 保留（最终确认） | 模型切换回归 | 高 |
| 文件大小限制 | 分散在发送前逻辑 | `sendRouteMapping` 主判 + sendPlan 最终确认 | F/G | 保留（最终确认） | 边界值测试 | 中 |
| 用户 override | UI + sendPlan | `sendRouteMapping` 消费 override | F/G | 保留一致性 gate | override 不污染 verdict 测试 | 高 |
| engine availability | derivative/sendPlan | `sendRouteMapping` 消费能力态 | F/G | 保留最终 gate | 引擎不可用回退测试 | 高 |

约束：同一种文件类型判断不得长期同时留在 `sendRouteMapping` 与旧 sendPlan 判断分支。

## 7. 旧 message_asset 退场检查项

### 7.1 主轨冻结

新主轨：`file_assets + draft_attachments + message_attachments`。  
旧 `message_asset` 不再作为未来文件类型检测体系主接入对象。

### 7.2 Step 2 边界

- Step 2 不删除旧代码。
- Step 2 不清空数据库或文件资产。

### 7.3 退场前检查清单

1. repo 层仍有哪些读写 `message_asset`。
2. UI 层是否仍依赖旧轨字段。
3. 测试是否仍依赖旧轨 fixture/断言。
4. 历史附件展示是否仍走旧轨。
5. OpenRouter 发送路径是否仍读取旧轨。
6. 是否需要清空现有文件资产（由后续任务包明确，不由 Agent 自行执行）。
7. 清空动作与数据重建由哪个后续任务包执行。
8. 回滚策略（保留开关、回滚脚本、数据恢复口径）。

## 8. provider_file_ref 延后说明

- `provider_file_ref` 不进入 MVP。
- MVP 不创建其数据模型，不绑定 provider 远端生命周期。
- `SendPlanCandidate` 仅需表达 `direct_file`、`requiresJob`、以及 future provider upload need（占位语义）。
- 作为 P1/P2 扩展项，后续单独设计：
  - 生命周期状态机
  - 缓存失效
  - 隐私日志策略
  - provider 兼容矩阵
  - 失败降级策略

## 9. 路径日志最小护栏任务

- 该任务应先于正式 file-type 实现执行（Stage A）。
- 仅修复明确绝对路径泄露点。
- 重点检查：`imageIpc.ts`、`dbBridge.ts` 及 Step 1 勘察列出的相关日志点。
- 不混入文件类型检测实现。
- 建议验收：
  - 脱敏规则测试（最小新增）
  - grep 扫描绝对路径模式
  - 变更范围审计（仅护栏文件）
- Step 2 本轮只规划，不执行修复。

## 10. 分阶段实施原则

1. 小阶段推进：每阶段边界清晰、可独立验收。
2. 硬验收：每阶段必须执行约定命令并给出结果。
3. 可回滚：每阶段明确回滚点与风险。
4. 先计划后执行：先出任务包，再落代码。
5. 每阶段汇报：改动文件、命令、结果、风险、后续建议。
6. 禁止顺手重构无关代码。

## 11. 完成后汇报模板

```text
1) 阶段名称与目标达成情况
2) 实际修改文件清单（绝对路径）
3) 验收命令与结果摘要
4) 与本阶段禁止项的符合性声明
5) 风险与遗留问题
6) 是否满足进入下一阶段条件
7) 需要 Owner/监督人确认的事项
```

