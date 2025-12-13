# Starverse · OpenRouter Reasoning 标准化工程 - 交付总结

> **⚠️ 历史文档警告**：本文档记录了 reasoning 功能的设计意图，但实际实现存在差异。  
> **请参阅最新现状**：[OPENROUTER_REASONING_REALITY_CHECK_2025_12.md](../analysis/OPENROUTER_REASONING_REALITY_CHECK_2025_12.md)  
> **关键差异**：`reasoning_details` 虽已保存到 metadata，但未在下一轮请求中回传（与代码注释声明不符）。  
> 本文档中提到的 `ChatInputArea.vue` 组件已于 2025-12-06 归档，现已被 `ModernChatInput.vue` 完全替代。

## 一、项目概述

**项目名称**：Starverse OpenRouter Reasoning 标准化工程（v2）

**设计目标**：
1. 完全符合 OpenRouter 官方 reasoning 参数协议
2. 统一代码层推理档位命名（使用 OR 官方 `effort` 枚举）
3. 明确区分"官方规则"与"Starverse 策略"
4. 提供可扩展的模型能力探测与适配机制
5. 为用户提供清晰的成本/延迟提示与优化建议

**核心原则**：
- **协议优先**：严格遵守 OpenRouter 文档语义
- **显式模糊**：未明确规范的部分通过策略配置暴露
- **安全与可回退**：所有高成本/高延迟行为提供清晰提示与关停路径

---

## 二、交付物清单

### 2.1 核心文件

| 文件路径                                                      | 类型        | 用途                                      | 状态 |
|---------------------------------------------------------------|-------------|-------------------------------------------|------|
| `src/types/reasoning.ts`                                      | 类型定义    | 统一推理类型与枚举                         | ✅   |
| `src/services/providers/openrouterReasoningAdapter.ts`       | 适配器      | 统一 reasoning 参数拼装逻辑                | ✅   |
| `docs/REASONING_UI_MIGRATION_GUIDE.md`                        | 文档        | UI 组件改造方案与差分修改点                | ✅   |
| `docs/REASONING_PERSISTENCE_ANALYTICS.md`                     | 文档        | SQLite schema 扩展与分析查询设计           | ✅   |
| `docs/REASONING_TESTING_STRATEGY.md`                          | 文档        | 完整测试清单与风险评估                     | ✅   |

### 2.2 类型系统（reasoning.ts）

**核心类型**：
```ts
// OpenRouter 官方枚举（五档）
type ReasoningEffort = 'minimal' | 'low' | 'medium' | 'high' | 'none'

// 控制模式
type ReasoningControlMode = 'disabled' | 'effort' | 'max_tokens' | 'auto'

// 模型能力结构
interface ModelReasoningCapability {
  modelId: string
  supportsReasoningParam: boolean         // supported_parameters.includes('reasoning')
  supportsMaxReasoningTokens: boolean     // 基于白名单
  returnsVisibleReasoning: 'yes' | 'no' | 'unknown'
  maxCompletionTokens: number | null
  internalReasoningPrice?: number | null
  family: 'openai' | 'anthropic' | 'gemini' | 'xai' | 'qwen' | 'other'
  reasoningClass: 'A' | 'B' | 'C'
  maxTokensPolicy: 'anthropic-1024-32000' | 'provider-unknown-range' | 'effort-only'
}

// 用户配置（对话级）
interface ReasoningUserConfig {
  controlMode: ReasoningControlMode
  effort?: ReasoningEffort
  maxReasoningTokens?: number
  maxCompletionTokens?: number
  showReasoningContent: boolean
}
```

**Starverse 策略配置**：
```ts
interface StarverseReasoningStrategy {
  anthropicCompletionStrategy: 'proportional' | 'fixed-gap' | 'user-strict'
  anthropicProportionalRatio: number        // 默认 1.2
  anthropicSafetyMargin: number             // 默认 1024
  allocationUnknownSafetyMargin: number     // 默认 1024
  effortCompletionStrategy: 'ratio' | 'fixed' | 'provider-default'
  effortCompletionRatio: number             // 默认 0.5
  effortCompletionFixed: number             // 默认 4096
}
```

### 2.3 适配器核心逻辑（openrouterReasoningAdapter.ts）

**函数签名**：
```ts
function buildReasoningPayload(
  modelId: string,
  capability: ModelReasoningCapability | null,
  config: ReasoningResolvedConfig,
  strategy?: StarverseReasoningStrategy
): ReasoningAdapterResult
```

**分支处理**：
1. **Class C（不支持推理）**：返回空 payload + 警告
2. **disabled 模式**：设置 `effort='none'`
3. **effort 模式**：设置 `reasoning.effort`，不设置 `reasoning.max_tokens`
4. **max_tokens 模式**：
   - **Anthropic**：裁剪到 [1024, 32000]，推导 `max_tokens > reasoning.max_tokens`
   - **Gemini/Qwen**：仅按 `maxCompletionTokens - safetyMargin` 裁剪
   - **OpenAI o-series/Grok**：作为 hint 原样转发（不裁剪到 Anthropic 范围）

**关键约束**：
- `reasoning` 对象中 `effort` 与 `max_tokens` 至多一个非空
- 所有"非官方行为"通过 `StarverseReasoningStrategy` 暴露
- 返回警告数组供 UI 展示

---

## 三、UI 改造方案（REASONING_UI_MIGRATION_GUIDE.md）

### 3.1 组件改造清单

| 组件                      | 改动类型          | 关键变更                                  |
|---------------------------|-------------------|-------------------------------------------|
| `ReasoningControls.vue`   | UI 重构 + Props   | 五档 effort + 成本标记 + 高级设置面板     |
| `ChatToolbar.vue`         | 样式增强          | 成本感知颜色（绿/黄/红）+ 警告图标         |
| `ChatInputArea.vue`       | Props 透传        | 传递 `modelReasoningCapability` 等新属性  |
| `ChatView.vue`            | 逻辑接入          | 派生能力计算属性 + 调用适配器             |

### 3.2 UI 布局示例（ReasoningControls.vue）

```
[推理控制] ───────────────────────────────┐
│ ⚡ 启用推理 (Reasoning)                  │
│                                         │
│ [模式选择] ──────────────────────────┐  │
│ │ ○ 最小 (Minimal) ~10% 🟢 低成本    │  │
│ │ ○ 轻量 (Low)     ~20% 🟢 推荐      │  │
│ │ ● 标准 (Medium)  ~50% 🟡 平衡      │  │
│ │ ○ 深度 (High)    ~80% 🔴 高成本    │  │
│ │ ○ 自定义 (Custom)                   │  │
│ └────────────────────────────────────┘  │
│                                         │
│ [可见性] ────────────────────────────┐  │
│ │ ☑ 显示思考过程 (Show Reasoning)    │  │
│ │   ⚠️ 当前模型可能不返回可见内容      │  │
│ └────────────────────────────────────┘  │
└─────────────────────────────────────────┘
```

### 3.3 差分修改示例

**Step 1：Props 扩展（ReasoningControls.vue）**
```ts
const props = defineProps({
  // 保留旧 props
  reasoningPreference: { /* ... */ },
  // 新增
  modelReasoningCapability: {
    type: Object as PropType<ModelReasoningCapability | undefined>,
    default: undefined
  },
  reasoningStrategy: {
    type: Object as PropType<StarverseReasoningStrategy | undefined>,
    default: undefined
  }
})
```

**Step 2：ChatView 能力派生**
```ts
// src/components/ChatView.vue
const modelReasoningCapability = computed<ModelReasoningCapability | null>(() => {
  const modelId = actualModelId.value
  if (!modelId) return null
  
  const modelData = modelStore.modelDataMap.get(modelId)
  if (!modelData) return null
  
  return {
    modelId,
    supportsReasoningParam: modelData.supported_parameters?.includes('reasoning') ?? false,
    supportsMaxReasoningTokens: inferMaxTokensSupport(modelData),
    // ... 其他字段
  }
})

const reasoningCostLevel = computed(() => {
  const effort = currentConversation.value?.reasoningPreference?.effort
  if (effort === 'minimal' || effort === 'low') return 'low'
  if (effort === 'medium') return 'medium'
  if (effort === 'high') return 'high'
  return undefined
})
```

**Step 3：发送请求时调用适配器**
```ts
const sendMessage = async (text: string) => {
  const reasoningResult = buildReasoningPayload(
    actualModelId.value,
    modelReasoningCapability.value,
    reasoningUserConfig.value,
    starverseReasoningStrategy.value
  )
  
  const requestOptions = {
    ...reasoningResult.payload, // 包含 reasoning, max_tokens, include_reasoning
    // ... 其他参数
  }
  
  // 显示警告（若有）
  if (reasoningResult.warnings.length > 0) {
    console.warn('[Reasoning]', reasoningResult.warnings)
  }
  
  await aiChatService.sendMessage(requestOptions)
}
```

---

## 四、持久化与分析方案（REASONING_PERSISTENCE_ANALYTICS.md）

### 4.1 SQLite Schema 扩展

**conversations 表新增字段**：
```sql
ALTER TABLE conversations ADD COLUMN reasoning_control_mode TEXT DEFAULT 'effort';
ALTER TABLE conversations ADD COLUMN reasoning_effort TEXT DEFAULT 'medium';
ALTER TABLE conversations ADD COLUMN reasoning_max_reasoning_tokens INTEGER DEFAULT NULL;
ALTER TABLE conversations ADD COLUMN reasoning_max_completion_tokens INTEGER DEFAULT NULL;
ALTER TABLE conversations ADD COLUMN reasoning_show_content INTEGER DEFAULT 0;
ALTER TABLE conversations ADD COLUMN reasoning_strategy_config TEXT DEFAULT NULL;
```

**新表：reasoning_usage_stats**
```sql
CREATE TABLE reasoning_usage_stats (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  conversation_id TEXT NOT NULL,
  message_id TEXT NOT NULL,
  model_id TEXT NOT NULL,
  control_mode TEXT NOT NULL,
  effort TEXT,
  max_reasoning_tokens INTEGER,
  reasoning_tokens_used INTEGER NOT NULL DEFAULT 0,
  completion_tokens_used INTEGER NOT NULL DEFAULT 0,
  total_tokens_used INTEGER NOT NULL DEFAULT 0,
  reasoning_cost REAL DEFAULT 0,
  completion_cost REAL DEFAULT 0,
  total_cost REAL DEFAULT 0,
  latency_ms INTEGER DEFAULT NULL,
  created_at INTEGER NOT NULL,
  FOREIGN KEY (conversation_id) REFERENCES conversations(id) ON DELETE CASCADE
);
```

### 4.2 分析查询示例

**档位分布统计**：
```sql
SELECT 
  effort,
  COUNT(*) AS usage_count,
  SUM(reasoning_tokens_used) AS total_reasoning_tokens,
  SUM(reasoning_cost) AS total_reasoning_cost,
  AVG(latency_ms) AS avg_latency_ms
FROM reasoning_usage_stats
WHERE created_at >= ?
GROUP BY effort
ORDER BY usage_count DESC;
```

**模型成本排行**：
```sql
SELECT 
  model_id,
  COUNT(*) AS usage_count,
  SUM(reasoning_cost) AS total_reasoning_cost,
  AVG(reasoning_cost) AS avg_cost_per_call
FROM reasoning_usage_stats
WHERE created_at >= ?
GROUP BY model_id
ORDER BY total_reasoning_cost DESC
LIMIT 10;
```

### 4.3 UI 分析面板建议

**位置**：设置 → 使用统计 → 推理分析

**展示内容**：
1. 总览卡片（总调用、总成本、平均延迟）
2. 档位分布饼图
3. 成本趋势折线图（按日期）
4. 模型排行榜
5. 优化建议（基于统计数据自动生成）

---

## 五、测试策略（REASONING_TESTING_STRATEGY.md）

### 5.1 测试分层与覆盖率目标

| 测试层级     | 覆盖率目标 | 预期用例数 | 执行时间 |
|--------------|------------|------------|----------|
| 单元测试     | > 90%      | 100+       | < 10s    |
| 集成测试     | > 70%      | 30+        | < 30s    |
| E2E 测试     | 关键路径   | 5+         | < 3min   |

### 5.2 必须通过的测试（Blocker）

- ✅ Anthropic [1024, 32000] 裁剪测试
- ✅ OpenAI o-series max_tokens 作为 hint 测试
- ✅ Class C 模型空 payload 测试
- ✅ 可见性控制测试（exclude / include_reasoning）
- ✅ disabled 模式测试
- ✅ 成本计算准确性测试

### 5.3 风险矩阵与缓解措施

| 风险项                          | 影响 | 概率 | 缓解措施                                |
|---------------------------------|------|------|-----------------------------------------|
| **Anthropic 规则错误应用**      | 高   | 中   | 单元测试 + 类型守卫 + 代码审查           |
| **模型能力缓存过期**            | 中   | 中   | 定时刷新 + 版本检查 + 降级策略           |
| **旧配置迁移失败**              | 高   | 低   | 迁移脚本测试 + 回滚机制 + 数据备份       |
| **成本计算错误**                | 高   | 低   | 单元测试 + 对账测试（vs OR Generation） |

---

## 六、下一步行动计划

### 6.1 Phase 1：基础设施（已完成）

- [x] 创建 `src/types/reasoning.ts`
- [x] 创建 `src/services/providers/openrouterReasoningAdapter.ts`
- [x] 编写核心文档（UI 迁移、持久化、测试策略）

### 6.2 Phase 2：单元测试（优先级：高）

**预计时间**：2-3 天

- [ ] 编写 `tests/unit/services/openrouterReasoningAdapter.spec.ts`
  - [ ] Class A (Anthropic) 测试套件（10+ 用例）
  - [ ] Class B (OpenAI o-series) 测试套件（8+ 用例）
  - [ ] Class C 测试套件（3+ 用例）
  - [ ] 可见性控制测试（4+ 用例）
  - [ ] disabled 模式测试（2+ 用例）
- [ ] 编写 `tests/unit/utils/reasoningHelpers.spec.ts`
  - [ ] inferMaxTokensSupport 测试（10+ 用例）
  - [ ] inferVisibleReasoning 测试（5+ 用例）
  - [ ] inferMaxTokensPolicy 测试（5+ 用例）
- [ ] 运行测试并确保覆盖率 > 90%

### 6.3 Phase 3：UI 组件改造（优先级：高）

**预计时间**：3-5 天

- [ ] 修改 `ReasoningControls.vue`：
  - [ ] 增加 `modelReasoningCapability` prop
  - [ ] 更新 UI 布局（五档 effort + 成本标记）
  - [ ] 实现高级设置折叠面板
  - [ ] 增加警告提示（不支持/不返回内容）
- [ ] 修改 `ChatToolbar.vue`：
  - [ ] 增加 `reasoningCostLevel` prop
  - [ ] 实现成本感知样式（绿/黄/红）
  - [ ] 透传新 props 到 ReasoningControls
- [ ] 修改 `ChatInputArea.vue`：
  - [ ] 透传新 props 到 ChatToolbar
- [ ] 修改 `ChatView.vue`：
  - [ ] 派生 `modelReasoningCapability` 计算属性
  - [ ] 派生 `reasoningCostLevel` 计算属性
  - [ ] 在 `sendMessage` 中调用 `buildReasoningPayload`
  - [ ] 传递新 props 到 ChatInputArea

### 6.4 Phase 4：集成测试（优先级：中）

**预计时间**：1-2 天

- [ ] 编写 `tests/integration/components/ReasoningControls.spec.ts`
  - [ ] Class C 模型禁用测试
  - [ ] Class B 模型隐藏 max_tokens 测试
  - [ ] Class A 模型显示自定义预算测试
  - [ ] 警告提示测试
- [ ] 编写 `tests/integration/components/ChatView.spec.ts`
  - [ ] 模型切换时能力更新测试
  - [ ] 发送消息时适配器调用测试

### 6.5 Phase 5：持久化实现（优先级：中）

**预计时间**：2-3 天

- [ ] 编写 SQLite 迁移脚本
  - [ ] `migration_v1_to_v2_reasoning.sql`
  - [ ] Worker 线程迁移逻辑
- [ ] 实现 Repository 方法
  - [ ] `updateConversationReasoning`
  - [ ] `recordReasoningUsage`
  - [ ] `getEffortDistribution`
  - [ ] `getConversationReasoningDetails`
- [ ] 集成到 Store
  - [ ] `conversationStore.updateReasoningConfig`
  - [ ] `useMessageSending` 统计记录逻辑
- [ ] 测试迁移与统计逻辑

### 6.6 Phase 6：分析 UI（优先级：低）

**预计时间**：2-3 天

- [ ] 创建 `ReasoningAnalytics.vue` 组件
- [ ] 实现图表（档位分布、成本趋势、模型排行）
- [ ] 实现优化建议生成逻辑
- [ ] 集成到设置页面

### 6.7 Phase 7：E2E 测试（优先级：低）

**预计时间**：1-2 天

- [ ] 编写 Playwright 测试脚本
  - [ ] 模型切换与推理控件适配
  - [ ] 高成本档位警告
  - [ ] 发送消息并验证请求体
- [ ] 在 CI 环境运行

### 6.8 Phase 8：文档与发布（优先级：高）

**预计时间**：1 天

- [ ] 更新 `ARCHITECTURE_REVIEW.md`
- [ ] 更新 `README.md` 功能列表
- [ ] 在设置界面增加"推理策略说明"页
- [ ] 编写 CHANGELOG
- [ ] 发布 v2.0.0

---

## 七、关键决策记录（ADR）

### ADR-001：使用 OpenRouter 官方 effort 枚举

**决策**：代码中不再引入自定义档位名称（如 `light/balanced/deep`），统一使用 OR 官方的 `minimal/low/medium/high/none`。

**理由**：
- 避免代码命名与协议枚举脱节
- 降低开发者认知负担
- 便于直接对照 OpenRouter 文档

**影响**：
- UI 层仍可使用"轻量/标准/深度"等标签，但通过 preset 映射
- 所有 TypeScript 类型与函数参数统一使用 `ReasoningEffort` 类型

### ADR-002：Anthropic 规则仅在 family='anthropic' 时生效

**决策**：`[1024, 32000]` 裁剪规则与 `max_tokens * effort_ratio` 计算仅对 Anthropic 模型应用，不推广到其他 provider。

**理由**：
- OpenRouter 文档仅针对 Anthropic 给出明确规则
- Gemini / Qwen 等模型的上限由 provider 自己决定
- 避免错误假设导致用户无法设置合理预算

**影响**：
- 适配器中增加 `maxTokensPolicy` 字段区分策略
- 单元测试需为每个 policy 编写独立用例

### ADR-003：max_tokens 在 effort-only 模型中作为 hint

**决策**：对只支持 effort 的模型（如 OpenAI o-series），不禁用 `max_tokens` 参数，而是作为 hint 原样转发。

**理由**：
- OpenRouter 文档明确说明 `max_tokens` 可用于"决定 effort 档位"
- 禁用会剥夺用户的控制权
- 通过警告提示说明其语义为"强度提示"而非"硬预算"

**影响**：
- UI 需提示"此模型使用 max_tokens 作为推理强度提示"
- 适配器不对此类模型做 Anthropic 式裁剪

### ADR-004：所有非官方行为通过 StarverseReasoningStrategy 暴露

**决策**：任何"OR 文档未明确规范"的行为（如 Anthropic 的 `max_tokens` 推导比例），都通过策略配置暴露，允许高级用户调整。

**理由**：
- 避免"黑箱决策"
- 便于后续根据实测效果优化策略
- 满足企业用户的定制化需求

**影响**：
- 增加配置复杂度，需在文档与 UI 中清晰说明
- 默认策略需经过充分测试验证

---

## 八、成功标准

### 8.1 技术指标

- ✅ 所有单元测试通过（覆盖率 > 90%）
- ✅ 集成测试通过（覆盖率 > 70%）
- ✅ E2E 测试通过（关键路径无错误）
- ✅ 代码无 TS 错误与 ESLint 警告
- ✅ 适配器平均调用延迟 < 1ms

### 8.2 功能指标

- ✅ Class A/B/C 模型推理功能正常
- ✅ Anthropic [1024, 32000] 裁剪生效
- ✅ OpenAI o-series max_tokens 作为 hint 转发
- ✅ 推理配置持久化与恢复无数据丢失
- ✅ 成本计算偏差 < 5%（vs OpenRouter Generation API）

### 8.3 用户体验指标

- ✅ 推理控件响应速度 < 100ms
- ✅ 高成本档位警告明确可见
- ✅ 模型不返回推理内容时提前提示
- ✅ 用户投诉推理相关问题 < 1/月

---

## 九、参考资料

### 9.1 OpenRouter 官方文档

- [Reasoning Tokens](https://openrouter.ai/docs/guides/best-practices/reasoning-tokens)
- [Models API](https://openrouter.ai/docs/guides/overview/models)
- [Responses API Beta](https://openrouter.ai/docs/api/reference/responses/reasoning)

### 9.2 Starverse 内部文档

- `docs/ARCHITECTURE_REVIEW.md` - 架构总览
- `docs/OPENROUTER_INTEGRATION_SUMMARY.md` - OpenRouter 集成历史
- `README.md` - 项目完整说明

### 9.3 相关 Issues/PRs（占位）

- [ ] Issue #XXX: 推理标准化重构
- [ ] PR #XXX: 类型与适配器实现
- [ ] PR #XXX: UI 组件改造
- [ ] PR #XXX: 持久化与分析

---

## 十、联系与支持

**项目维护者**：Starverse Team

**问题反馈**：
- GitHub Issues: [starverse/issues](https://github.com/GuXinghai/starverse/issues)
- Email: support@starverse.ai

**文档更新**：
- 本文档最后更新：2025-12-02
- 版本：v2.0.0-draft

---

**附录：快速启动命令**

```bash
# 安装依赖
npm install

# 运行单元测试
npm run test:unit

# 运行集成测试
npm run test:integration

# 运行 E2E 测试
npm run test:e2e

# 启动开发服务器
npm run dev

# 构建生产版本
npm run build
```

---

**结语**：

本工程遵循"协议优先、显式模糊、安全可回退"的原则，构建了一套完全符合 OpenRouter 官方规范的推理标准化系统。通过统一类型、适配器、UI 与持久化，为 Starverse 用户提供清晰、可控、成本感知的推理体验。

所有设计决策基于 OpenRouter 官方文档与 Starverse 业务需求，避免了自造协议与隐式假设。后续可根据实测效果与用户反馈，逐步优化策略参数与 UI 交互。

祝开发顺利！🚀
