# Starverse · next-ui → app-ui 推理组件移植 SSOT

> 本文档是“next-ui 推理相关组件移植到 app-ui”的唯一真相源（SSOT）。
> 适用版本：2026-01-27 当前代码基线。

---

## 0. 执行摘要（必须阅读）

- **迁移优先级**：先解耦推理面板（低风险），再引入推理控制 UI（中风险），最后接入推理模型索引/目录（中-高风险）。
- **破坏性风险**：app-ui 发送链路存在多个入口，若只改一处会导致“UI 状态与实际请求不一致”。
- **唯一闭环标准**：推理请求参数、消息状态、推理面板展示三者必须一致，且在 auto 模式下请求体不包含 reasoning 字段。

---

## 1. 目标与范围

**目标**：将 next-ui 中与推理（reasoning）相关的 UI/数据流能力安全迁移到 app-ui，且不破坏 app-ui 现有代码完整性与稳定性。

**范围**（推理相关能力全量清单）：
- 侧边推理面板（Reasoning Panel）
- 推理请求参数控制（effort/exclude/auto）
- 推理模型索引/模型目录选择（Reasoning Model Index / Model Catalog）
- 推理视图派生与状态管理（ReasoningView、panelState）
- 推理流式请求参数与 SSE 解析路径（OpenRouter stream）
- 推理相关的 DB/IPC 桥接与同步事件

**非目标**（本次迁移不强制覆盖）：
- next-ui 的 demo/fixture 模式
- ui-next 独立运行入口
- 旧 UI（ui-app）与 next-ui 的并存策略

---

## 2. 术语与不变式（必须遵守）

**术语**：
- `ReasoningView`：渲染层推理视图模型（summaryText/reasoningText/visibility/panelState）
- `ReasoningEffort`：推理强度枚举（none/minimal/low/medium/high/xhigh）
- `RequestedReasoningMode`：请求模式（auto/effort）

**不变式**：
1. 当 `requestedReasoningMode === 'auto'` 时，请求体 **不得包含** `reasoning` 字段。
2. `requestedReasoningExclude` 仅在 `requestedReasoningMode === 'effort'` 时生效。
3. `startGeneration` 与 `streamOpenRouterChatAsEvents` 必须接受 **一致的 reasoning 参数**。
4. 推理面板展示必须完全由 `ReasoningView` 驱动，不得自行推断/重写逻辑。

---

## 3. 现状梳理（基于代码）

### 3.1 推理面板链路
- next-ui 入口： [src/ui-next/components/ChatNextReasoningPanel.vue](src/ui-next/components/ChatNextReasoningPanel.vue)
- UI 内核： [src/ui-kit/chat/ChatReasoningPanel.vue](src/ui-kit/chat/ChatReasoningPanel.vue)
- ReasoningView 派生： [src/next/state/selectors.ts](src/next/state/selectors.ts)
- ReasoningView 类型： [src/next/state/types.ts](src/next/state/types.ts)
- 展开/收起： [src/next/state/reducer.ts](src/next/state/reducer.ts)

### 3.2 app-ui 现有接入
- app-ui 当前直接依赖 next-ui 推理面板： [src/ui-app/AppChatApp.vue](src/ui-app/AppChatApp.vue)
- app-ui 发送链路当前固定 `requestedReasoningMode: 'auto'`：
  - `startGeneration` 调用点（2 处）：[src/ui-app/AppChatApp.vue](src/ui-app/AppChatApp.vue)
  - `streamOpenRouterChatAsEvents` 调用点（2 处）：[src/ui-app/AppChatApp.vue](src/ui-app/AppChatApp.vue)
- app-ui 输入区为精简版本： [src/ui-app/components/ChatAppComposer.vue](src/ui-app/components/ChatAppComposer.vue)

### 3.3 next-ui 推理控制入口
- UI 控件： [src/ui-next/components/ChatNextComposer.vue](src/ui-next/components/ChatNextComposer.vue)
- 应用入口与参数拼装： [src/ui-next/AppChatNext.vue](src/ui-next/AppChatNext.vue)
- 运行调度： [src/ui-next/useChatRun.ts](src/ui-next/useChatRun.ts)

### 3.4 推理模型索引与模型目录
- Reasoning Model Index DB/Repo： [infra/db/repo/reasoningModelIndexRepo.ts](infra/db/repo/reasoningModelIndexRepo.ts)
- Reasoning Index Client： [src/next/modelIndex/reasoningModelIndexClient.ts](src/next/modelIndex/reasoningModelIndexClient.ts)
- Reasoning Index Selectors： [src/next/modelIndex/reasoningModelIndexSelectors.ts](src/next/modelIndex/reasoningModelIndexSelectors.ts)
- Model Catalog Client： [src/next/modelCatalog/modelCatalogClient.ts](src/next/modelCatalog/modelCatalogClient.ts)
- Model Catalog Selectors： [src/next/modelCatalog/modelCatalogSelectors.ts](src/next/modelCatalog/modelCatalogSelectors.ts)

### 3.5 推理请求构建路径（OpenRouter）
- 统一入口： [src/next/live/openRouterLiveStream.ts](src/next/live/openRouterLiveStream.ts)

---

## 4. 控件清单（必须完整覆盖）

### 4.1 推理面板控件（ChatReasoningPanel）
来源： [src/ui-kit/chat/ChatReasoningPanel.vue](src/ui-kit/chat/ChatReasoningPanel.vue)

必需展示/交互要素：
- 标题与可选加密标记（`encrypted` badge）
- 可见性标签（shown / excluded / not_returned）
- 展开/收起按钮（Collapse/Expand）
- Summary 段与 Reasoning 段渲染
- 纯空状态提示（无 ReasoningView / 无 payload）
- Debug 面板（可选显示 JSON）

### 4.2 推理面板包装（ChatNextReasoningPanel）
来源： [src/ui-next/components/ChatNextReasoningPanel.vue](src/ui-next/components/ChatNextReasoningPanel.vue)

必须保留的行为：
- 仅取 **最后一条 assistant 消息** 的 `reasoningView`
- `Show debug / Hide debug` 切换
- 触发 `toggle-panel-state` 时，向上层发出 **last assistant messageId**

### 4.3 推理控制控件（ChatNextComposer）
来源： [src/ui-next/components/ChatNextComposer.vue](src/ui-next/components/ChatNextComposer.vue)

推理相关控件清单（不得遗漏）：
- 推理强度选择（Select）：auto / none / minimal / low / medium / high / xhigh
- 排除开关（exclude checkbox），并在 auto 模式下禁用
- 提示文案（非 auto/none 时显示提示）
- 推理模型索引选择器（Reasoning Models 下拉）

说明：以上控件在 app-ui 中可合并/重排，但交互语义必须一致。

---

## 5. 复杂度与影响面分析

| 层级 | 复杂度 | 主要影响 | 典型风险 |
| --- | --- | --- | --- |
| 推理面板组件迁移 | 低 | UI 层 | 依赖解耦不彻底，仍引用 ui-next |
| 推理控制 UI 引入 | 中 | UI + 发送参数 | 状态与请求不一致、遗漏入口 |
| Reasoning Index/Model Catalog | 中-高 | UI + DB/IPC | dbBridge 不可用导致 UI 崩溃 |
| 偏好持久化 | 高 | 数据模型 | 状态同步复杂、回滚困难 |

---

## 6. 完整移植清单（闭环）

### 6.1 UI 组件层
- [x] 迁移/重构 `ChatNextReasoningPanel` 到 app-ui 或 ui-kit
  - 来源： [src/ui-next/components/ChatNextReasoningPanel.vue](src/ui-next/components/ChatNextReasoningPanel.vue)
  - 目标候选：
    - app-ui 本地： [src/ui-app/components/ChatAppReasoningPanel.vue](src/ui-app/components/ChatAppReasoningPanel.vue)
    - 或 ui-kit：在 [src/ui-kit/chat/ChatReasoningPanel.vue](src/ui-kit/chat/ChatReasoningPanel.vue) 外层新增轻封装
- [x] app-ui 替换 import，删除对 next-ui 的直接依赖
  - 入口： [src/ui-app/AppChatApp.vue](src/ui-app/AppChatApp.vue)
- [x] 新增推理控制 UI（Reasoning Controls）
  - 位置建议： [src/ui-app/components/ChatAppComposer.vue](src/ui-app/components/ChatAppComposer.vue) 内或新增独立子组件

### 6.2 UI 状态层
- [x] 在 app-ui 引入 `requestedReasoningEffort` 状态（'auto' | ReasoningEffort）
- [x] 在 app-ui 引入 `requestedReasoningExclude` 状态（boolean）
- [x] 统一转换逻辑（auto → omit reasoning field）
  - 参考： [src/ui-next/AppChatNext.vue](src/ui-next/AppChatNext.vue)

### 6.3 发送链路（必须全部覆盖）
- [x] `startGeneration` 的所有调用点接入 reasoning 参数
  - 入口： [src/ui-app/AppChatApp.vue](src/ui-app/AppChatApp.vue)
- [x] `streamOpenRouterChatAsEvents` 的所有调用点接入 reasoning 参数
  - 入口： [src/ui-app/AppChatApp.vue](src/ui-app/AppChatApp.vue)
- [x] 再生成/重试/分支路径逻辑一致（不得出现某路径忽略 reasoning）

### 6.4 Reasoning Model Index 与 Model Catalog（可选但推荐）
- [x] app-ui 增加 Reasoning Model Index 加载
  - client： [src/next/modelIndex/reasoningModelIndexClient.ts](src/next/modelIndex/reasoningModelIndexClient.ts)
- [x] app-ui 增加 Model Catalog 加载
  - client： [src/next/modelCatalog/modelCatalogClient.ts](src/next/modelCatalog/modelCatalogClient.ts)
- [x] UI 增加 pickers 并处理 hidden/visible 过滤
  - 仅 Dev 显示“隐藏模型”开关（调试用途）
  - selectors：
    - [src/next/modelIndex/reasoningModelIndexSelectors.ts](src/next/modelIndex/reasoningModelIndexSelectors.ts)
    - [src/next/modelCatalog/modelCatalogSelectors.ts](src/next/modelCatalog/modelCatalogSelectors.ts)
- [x] 监听 db 同步事件（如需）
  - 事件来源： [src/ui-next/AppChatNext.vue](src/ui-next/AppChatNext.vue)

### 6.5 持久化策略（需设计）
- [x] 明确推理偏好存储层级：全局 / 项目 / 会话 / 分支
- [x] 若持久化：新增字段、加载逻辑与回写逻辑

### 6.6 错误与降级
- [ ] dbBridge 不可用时 UI 不崩溃，降级到无索引/无目录
- [ ] 请求失败时 Reasoning Panel 仍可展示已生成的 ReasoningView

### 6.7 测试与回归
- [ ] 推理面板展开/收起测试
- [ ] 请求参数正确性验证（auto/effort/exclude）
- [ ] Reasoning Index 缺失/空数组降级测试
- [ ] UI 输入区交互测试（effort/exclude 联动）

---

## 7. 迁移路线图（带复杂度）

### Phase 0 — 基线锁定（低）
- [ ] 记录 app-ui 当前行为（auto-only、面板展示）

### Phase 1 — 解耦推理面板（低）
- [x] 新建 app-ui 推理面板封装组件
- [x] 替换 import 并验证功能一致

### Phase 2 — 推理控制 UI 引入（中）
- [x] 在 app-ui 中实现推理控制控件
- [x] 新增推理状态并绑定到发送链路
- [ ] 全量回归请求参数

### Phase 3 — Reasoning Model Index/Catalog（中-高）
- [x] 接入索引与模型目录加载逻辑
- [x] 增加 UI picker 并支持隐藏模型过滤
- [x] 增加同步事件监听（可选）

### Phase 4 — 持久化与策略（高）
- [x] 设计存储层级与数据迁移
- [x] 回写逻辑与回滚预案

---

## 8. 风险点与缓解措施

- **风险**：只改 startGeneration 或 streamOpenRouterChatAsEvents 的一处，导致请求与 UI 状态不一致。
  - **缓解**：列出所有调用点并统一修改，回归测试覆盖。
- **风险**：Reasoning Index 依赖 dbBridge，不可用时导致 UI 崩溃。
  - **缓解**：与 ui-next 一致采用容错返回空数组。
- **风险**：推理面板仅显示最后一条 assistant，若 app-ui 未来引入“选择态”，可能与预期不符。
  - **缓解**：迁移后保持现有语义，新增行为需单独设计。
- **风险**：样式兼容问题（Tailwind v4 opacity 语法）导致 UI 失效。
  - **缓解**：所有新增样式使用斜杠透明度语法。

---

## 9. 验收标准（闭合定义）

- app-ui 不再依赖 next-ui 组件
- app-ui 推理请求参数可控且链路一致
- auto 模式请求体不包含 reasoning 字段
- effort/exclude 组合行为与 next-ui 保持一致
- 推理面板展示逻辑与 ReasoningView 保持一致

---

## 10. 回滚策略

- Phase 1/2/3 均可独立回退
- 回退路径：恢复 app-ui 固定 `requestedReasoningMode: 'auto'`，并移除推理控件

---

## 11. 参考实现清单（迁移期禁止变更）

- ReasoningView 派生： [src/next/state/selectors.ts](src/next/state/selectors.ts)
- OpenRouter 请求拼装： [src/next/live/openRouterLiveStream.ts](src/next/live/openRouterLiveStream.ts)
- Reasoning Index 同步规则： [infra/db/repo/reasoningModelIndexRepo.ts](infra/db/repo/reasoningModelIndexRepo.ts)

---

## 12. 迁移输出物（必须归档）

- 变更说明与回归记录
- app-ui 推理控制 UI 组件设计稿/截图
- 测试结果（含失败与修复记录）

---

> 更新规则：所有后续变更必须同步更新本文档，否则视为无效变更。
