# Starverse · OpenRouter Reasoning UI 组件改造方案

> **⚠️ 历史文档警告**：本文档编写于 2025 年初，部分组件架构已过时。  
> `ChatInputArea.vue` 已于 2025-12-06 归档，现已被 `ModernChatInput.vue` 完全替代。  
> 文档中的架构图和组件引用仅供历史参考。

本文档说明如何将统一的 Reasoning 适配层集成到 Starverse 的 UI 组件中，包括：
- ChatToolbar（工具栏推理按钮）
- ReasoningControls（推理控制面板）
- ~~ChatInputArea~~（已归档） → ModernChatInput（当前实现）

## 一、改造目标

### 1.1 统一推理体验

**核心原则**：
- 所有推理相关 UI 使用 OpenRouter `reasoning.effort` 枚举（`none|minimal|low|medium|high|xhigh`），并提供 `auto/omit`（不发送 reasoning 字段）
- 区分"官方能力"与"Starverse 策略"
- 为高成本/高延迟档位提供清晰提示
- 对不支持推理的模型优雅降级

**目标用户体验**：
- 简单模式：开关 + 三档预设（轻量/标准/深度）
- 高级模式：精确控制 `effort` 或 `max_tokens`
- 智能提示：根据模型能力自动调整可用选项

### 1.2 现有组件架构

```
ChatInputArea.vue
  └─ ChatToolbar.vue (工具栏)
      └─ ReasoningControls.vue (推理控制面板)
```

**现有 Props/Emits 链**：
```
ChatView -> ChatInputArea -> ChatToolbar -> ReasoningControls
  Props: reasoningPreference, isReasoningAvailable, currentModelId, modelDataMap
  Emits: toggle-reasoning, update:reasoning-preference, select-reasoning-effort
```

## 二、类型迁移路径

### 2.1 旧类型 vs 新类型映射

### 2.0 术语澄清（防止 “hidden” 歧义复活）

- `visibility`：**返回/披露合同**（provider 是否返回、是否允许展示）；只允许三态：`shown | excluded | not_returned`。
- `panelState`：**UI 呈现状态**（折叠/展开）；只允许二态：`collapsed | expanded`。
- 两者不得互相推断；不做任何 `hidden` 兼容映射。

**旧类型（当前）**：
```ts
// src/types/chat.ts
interface ReasoningPreference {
  enabled: boolean;
  effort?: 'low' | 'medium' | 'high'; // 仅三档
  // 旧的二态命名语义已废弃：SSOT v2.1 统一拆轴为 visibility + panelState
  visibility?: 'shown' | 'excluded' | 'not_returned';
  panelState?: 'collapsed' | 'expanded';
  max_tokens?: number; // 未明确语义
}
```

**新类型（目标）**：
```ts
// src/next/state/types.ts
type ReasoningEffort = 'none' | 'minimal' | 'low' | 'medium' | 'high' | 'xhigh'
type RequestedReasoningMode = 'auto' | 'effort'

type RequestedReasoningConfig = {
  requestedReasoningMode: RequestedReasoningMode
  requestedReasoningEffort?: ReasoningEffort // only when mode='effort'
  requestedReasoningExclude?: boolean // only meaningful when mode='effort'
}
```

**迁移策略**：
1. **保留兼容层**：在 `ReasoningControls.vue` 中增加适配逻辑，将旧 `ReasoningPreference` 映射到新 `ReasoningUserConfig`
2. **逐步替换**：先在 composable 中使用新类型，UI 层仍接收旧类型
3. **最终统一**：所有组件统一使用 `ReasoningUserConfig`

## 三、ReasoningControls.vue 改造方案

### 3.1 Props 变更（向后兼容）

**当前 Props**：
```ts
reasoningPreference?: ReasoningPreference // 旧类型
isActive: boolean
activeProvider: 'gemini' | 'openrouter'
currentModelId?: string
modelDataMap: Map<string, any>
show: boolean
```

**新增 Props（Phase 1）**：
```ts
// 模型能力（由父组件通过 modelStore 派生）
modelReasoningCapability?: ModelReasoningCapability

// Starverse 策略配置（可选，用于高级设置）
reasoningStrategy?: StarverseReasoningStrategy
```

**Props 使用优先级**：
```ts
// 1. 优先使用新 capability（若提供）
if (props.modelReasoningCapability) {
  // 使用统一类型系统
} else {
  // 回退到旧逻辑（通过 activeProvider/currentModelId 推断）
}
```

### 3.2 UI 布局重构

**当前布局**：
```
[推理开关] ────────────────┐
│ ⚡ 启用推理              │
└─────────────────────────┘

[推理模式] (互斥单选) ──────┐
│ ○ 低 (Low)               │
│ ● 中 (Medium)            │
│ ○ 高 (High)              │
│ ○ 自定义 MAX_TOKENS       │
│   [输入框: ___]           │
└─────────────────────────┘

[返回选项] ───────────────┐
│ ☑ 返回推理过程细节        │
└─────────────────────────┘
```

**新布局（v2）**：
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
│ │   [预算输入]                        │  │
│ └────────────────────────────────────┘  │
│                                         │
│ [可见性] ────────────────────────────┐  │
│ │ ☑ 显示思考过程 (Show Reasoning)    │  │
│ │   ⚠️ 当前模型可能不返回可见内容      │  │
│ └────────────────────────────────────┘  │
│                                         │
│ [高级设置] (可折叠) ─────────────────┐  │
│ │ 推理预算: [_____] tokens            │  │
│ │ 输出上限: [_____] tokens            │  │
│ │ 策略: [下拉: 自动 | 比例 | 固定]     │  │
│ └────────────────────────────────────┘  │
└─────────────────────────────────────────┘
```

**关键改动**：
1. **effort 五档**：新增 `minimal`（最小推理）
2. **成本标记**：每个档位显示颜色标识与成本提示
3. **模型兼容性提示**：
   - Class C：整个面板置灰，显示"当前模型不支持推理参数"
   - `returnsVisibleReasoning='no'`：在"显示思考过程"旁提示"该模型不会返回可见内容"
4. **自定义模式**：显式区分 `effort` 与 `max_tokens` 控制

### 3.3 差分修改点（代码级）

**Step 1：Props 扩展（保持兼容）**

```ts
// src/components/chat/controls/ReasoningControls.vue
import type { ModelReasoningCapability, StarverseReasoningStrategy } from '../../../types/reasoning'

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

**Step 2：计算属性迁移**

```ts
// 旧：通过 useReasoningControl 判断能力
const { isReasoningControlAvailable } = useReasoningControl({ /* ... */ })

// 新：优先使用 capability
const isReasoningSupported = computed(() => {
  if (props.modelReasoningCapability) {
    return props.modelReasoningCapability.supportsReasoningParam
  }
  // 回退到旧逻辑
  return isReasoningControlAvailable.value
})

const canUseMaxTokens = computed(() => {
  return props.modelReasoningCapability?.supportsMaxReasoningTokens ?? false
})

const reasoningVisibilityWarning = computed(() => {
  if (props.modelReasoningCapability?.returnsVisibleReasoning === 'no') {
    return '该模型不会返回可见的推理内容'
  }
  if (props.modelReasoningCapability?.returnsVisibleReasoning === 'unknown') {
    return '该模型可能不返回推理内容'
  }
  return null
})
```

**Step 3：Effort 五档选项**

```ts
// 旧常量（三档）
const REASONING_MODE_OPTIONS = [
  { value: 'low', label: '低' },
  { value: 'medium', label: '中' },
  { value: 'high', label: '高' }
]

// 新常量（六档 + 成本标记）
const REASONING_EFFORT_OPTIONS = [
  { 
    value: 'none', 
    label: '关闭', 
    description: '关闭推理（effort:none）',
    costLevel: 'low',
    icon: '⚪'
  },
  { 
    value: 'minimal', 
    label: '最小', 
    description: '~10% 推理预算',
    costLevel: 'low',
    icon: '🟢'
  },
  { 
    value: 'low', 
    label: '轻量', 
    description: '~20% 推理预算',
    costLevel: 'low',
    icon: '🟢'
  },
  { 
    value: 'medium', 
    label: '标准', 
    description: '~50% 推理预算（推荐）',
    costLevel: 'medium',
    icon: '🟡'
  },
  { 
    value: 'high', 
    label: '深度', 
    description: '~80% 推理预算（高成本）',
    costLevel: 'high',
    icon: '🔴'
  },
  { 
    value: 'xhigh', 
    label: '极限', 
    description: '~95% 推理预算（极高成本）',
    costLevel: 'high',
    icon: '🔴'
  }
] as const
```

**Step 4：事件映射（不做旧兼容）**

```ts
// UI 选择项：auto/omit 或 effort 枚举
emit('select-reasoning-effort', 'auto' | 'none' | 'minimal' | 'low' | 'medium' | 'high' | 'xhigh')

// exclude 独立开关（不是挡位）
emit('toggle-reasoning-exclude', true | false)
```

## 四、ChatToolbar.vue 改造方案

### 4.1 Props 变更（最小化）

**当前 Props**：
```ts
reasoningEnabled: boolean
reasoningEffortLabel: string  // 显示 '低' | '中' | '高'
isReasoningAvailable: boolean
```

**新增 Props**：
```ts
// 推理成本等级（用于按钮颜色）
reasoningCostLevel?: 'low' | 'medium' | 'high'

// 推理可见性警告（若模型不返回内容）
reasoningVisibilityWarning?: string
```

### 4.2 按钮样式改进

**旧样式**：
```html
<button :class="reasoningEnabled ? 'border-purple-300 bg-purple-50' : 'border-gray-200 bg-white'">
  ⚡ 推理 ({{ reasoningEffortLabel }})
</button>
```

**新样式（成本感知）**：
```html
<button 
  :class="[
    baseActionButtonClasses,
    reasoningEnabled && reasoningCostLevel === 'low'
      ? 'border-green-300 bg-green-50 text-green-900'
      : reasoningEnabled && reasoningCostLevel === 'medium'
      ? 'border-yellow-300 bg-yellow-50 text-yellow-900'
      : reasoningEnabled && reasoningCostLevel === 'high'
      ? 'border-red-300 bg-red-50 text-red-900'
      : 'border-gray-200 bg-white text-gray-700'
  ]"
  :title="reasoningVisibilityWarning || '推理控制'"
>
  <!-- 图标根据成本等级变化 -->
  <span v-if="reasoningCostLevel === 'low'">🟢</span>
  <span v-else-if="reasoningCostLevel === 'medium'">🟡</span>
  <span v-else-if="reasoningCostLevel === 'high'">🔴</span>
  <span v-else>⚡</span>
  
  <span>推理</span>
  <span v-if="reasoningEnabled" class="text-sm">
    ({{ reasoningEffortLabel }})
  </span>
  
  <!-- 警告提示 -->
  <svg v-if="reasoningVisibilityWarning" class="w-3.5 h-3.5 text-orange-500" fill="currentColor" viewBox="0 0 20 20">
    <path fill-rule="evenodd" d="M8.257 3.099c.765-1.36 2.722-1.36 3.486 0l5.58 9.92c.75 1.334-.213 2.98-1.742 2.98H4.42c-1.53 0-2.493-1.646-1.743-2.98l5.58-9.92zM11 13a1 1 0 11-2 0 1 1 0 012 0zm-1-8a1 1 0 00-1 1v3a1 1 0 002 0V6a1 1 0 00-1-1z" clip-rule="evenodd" />
  </svg>
</button>
```

### 4.3 事件透传（无变化）

ChatToolbar 仅作为事件透传层，无需改动：
```ts
// 保持现有 emit
emit('toggle-reasoning')
emit('select-reasoning-effort', effort)
emit('update:reasoning-preference', updates)
```

## 五、ChatInputArea.vue 改造方案

### 5.1 Props 变更（接收新计算属性）

**当前 Props**：
```ts
reasoningEnabled: boolean
reasoningEffortLabel: string
isReasoningSupported: boolean
```

**新增 Props（从 ChatView 传入）**：
```ts
// 模型推理能力
modelReasoningCapability?: ModelReasoningCapability

// 成本等级（派生属性）
reasoningCostLevel?: 'low' | 'medium' | 'high'

// 可见性警告
reasoningVisibilityWarning?: string
```

### 5.2 透传到 ChatToolbar

```vue
<ChatToolbar
  :reasoning-enabled="reasoningEnabled"
  :reasoning-effort-label="reasoningEffortLabel"
  :reasoning-cost-level="reasoningCostLevel"
  :reasoning-visibility-warning="reasoningVisibilityWarning"
  :is-reasoning-available="modelReasoningCapability?.supportsReasoningParam ?? false"
  @toggle-reasoning="emit('toggle-reasoning')"
  @select-reasoning-effort="emit('select-reasoning-effort', $event)"
  @update:reasoning-preference="emit('update:reasoning-preference', $event)"
/>
```

## 六、ChatView.vue 接入适配层

### 6.1 数据流改造

**旧数据流**：
```
useReasoningControl(composable)
  ↓ 推断能力（基于 provider + modelId）
  ↓ buildReasoningRequestOptions
ChatView (发送请求时拼装参数)
```

**新数据流**：
```
modelStore.modelDataMap
  ↓ 派生 ModelReasoningCapability
buildReasoningPayload(adapter)
  ↓ 统一适配层
ChatView (使用 payload)
```

### 6.2 计算属性新增

```ts
// src/components/ChatView.vue
import { buildReasoningPayload } from '../services/providers/openrouterReasoningAdapter'
import type { ModelReasoningCapability, ReasoningUserConfig } from '../types/reasoning'

// 1. 模型能力派生
const modelReasoningCapability = computed<ModelReasoningCapability | null>(() => {
  const modelId = actualModelId.value
  if (!modelId) return null
  
  // 从 modelStore.modelDataMap 中查询
  const modelData = modelStore.modelDataMap.get(modelId)
  if (!modelData) return null
  
  // 构建 ModelReasoningCapability
  return {
    modelId,
    supportsReasoningParam: modelData.supported_parameters?.includes('reasoning') ?? false,
    supportsIncludeReasoning: modelData.supported_parameters?.includes('include_reasoning') ?? false,
    supportsMaxReasoningTokens: inferMaxTokensSupport(modelData), // 辅助函数
    returnsVisibleReasoning: inferVisibleReasoning(modelData),
    maxCompletionTokens: modelData.top_provider?.max_completion_tokens ?? null,
    internalReasoningPrice: modelData.pricing?.internal_reasoning ?? null,
    family: inferModelFamily(modelId),
    reasoningClass: inferReasoningClass(modelData),
    maxTokensPolicy: inferMaxTokensPolicy(modelData)
  }
})

// 2. 成本等级派生
const reasoningCostLevel = computed(() => {
  const effort = currentConversation.value?.reasoningPreference?.effort
  if (!effort) return undefined
  
  if (effort === 'minimal' || effort === 'low') return 'low'
  if (effort === 'medium') return 'medium'
  if (effort === 'high') return 'high'
  return undefined
})

// 3. 可见性警告
const reasoningVisibilityWarning = computed(() => {
  if (!modelReasoningCapability.value) return undefined
  
  const capability = modelReasoningCapability.value
  if (capability.returnsVisibleReasoning === 'no') {
    return '该模型不会返回可见的推理内容'
  }
  if (capability.returnsVisibleReasoning === 'unknown') {
    return '该模型可能不返回推理内容（未经实测）'
  }
  return undefined
})
```

### 6.3 发送请求时调用适配器

```ts
// src/composables/chat/useMessageSending.ts (或 ChatView.vue)
const sendMessage = async (text: string, attachments: any[]) => {
  // 旧逻辑：直接拼装
  const requestOptions = {
    reasoning: currentConversation.value?.reasoningPreference?.enabled
      ? { effort: currentConversation.value.reasoningPreference.effort }
      : undefined
  }
  
  // 新逻辑：使用适配器
  const reasoningUserConfig: ReasoningUserConfig = {
    controlMode: currentConversation.value?.reasoningPreference?.enabled ? 'effort' : 'disabled',
    effort: currentConversation.value?.reasoningPreference?.effort ?? 'medium',
    showReasoningContent:
      currentConversation.value?.reasoningView?.visibility === 'shown' &&
      currentConversation.value?.reasoningView?.panelState === 'expanded'
  }
  
  const reasoningResult = buildReasoningPayload(
    actualModelId.value,
    modelReasoningCapability.value,
    reasoningUserConfig,
    starverseReasoningStrategy.value // 从设置中读取
  )
  
  // 合并到请求体
  const requestOptions = {
    ...reasoningResult.payload,
    // ... 其他参数
  }
  
  // 显示警告（若有）
  if (reasoningResult.warnings.length > 0) {
    console.warn('[Reasoning] 适配器警告:', reasoningResult.warnings)
    // 可选：在 UI 中显示 toast 提示
  }
  
  // 发送请求
  await aiChatService.sendMessage(requestOptions)
}
```

## 七、迁移步骤与回滚点

### 7.1 分阶段迁移

**Phase 1：类型与适配层引入**（已完成）
- ✅ 创建 `src/types/reasoning.ts`
- ✅ 创建 `src/services/providers/openrouterReasoningAdapter.ts`

**Phase 2：UI 组件适配（本阶段）**
- [ ] 修改 `ReasoningControls.vue`：
  - 增加新 props（`modelReasoningCapability`、`reasoningStrategy`）
  - 更新 UI 布局（五档 effort + 成本标记）
  - 实现新旧事件兼容
- [ ] 修改 `ChatToolbar.vue`：
  - 增加成本等级样式
  - 透传新 props
- [ ] 修改 `ChatInputArea.vue`：
  - 透传新 props 到 ChatToolbar

**Phase 3：ChatView 接入**
- [ ] 在 `ChatView.vue` 中：
  - 派生 `modelReasoningCapability` 计算属性
  - 替换 `buildReasoningRequestOptions` 为 `buildReasoningPayload`
  - 传递新 props 到 `ChatInputArea`

**Phase 4：旧逻辑清理**
- [ ] 移除 `useReasoningControl` 中的重复逻辑
- [ ] 统一使用 `ReasoningUserConfig` 替代 `ReasoningPreference`
- [ ] 删除旧类型定义

### 7.2 回滚点

每个阶段完成后提供回滚路径：

**Phase 2 回滚**：
```ts
// 在 ReasoningControls.vue 中保留兼容开关
const USE_NEW_REASONING_SYSTEM = ref(false) // 可通过环境变量控制

if (USE_NEW_REASONING_SYSTEM.value && props.modelReasoningCapability) {
  // 使用新系统
} else {
  // 回退到旧系统
}
```

**Phase 3 回滚**：
```ts
// 在 ChatView.vue 中保留旧适配器
const reasoningPayload = import.meta.env.VITE_USE_NEW_REASONING
  ? buildReasoningPayload(/* 新参数 */)
  : buildReasoningRequestOptions(/* 旧参数 */)
```

## 八、测试策略

### 8.1 单元测试（Vitest）

**测试覆盖**：
- [ ] `buildReasoningPayload` 函数：
  - Class A/B/C 模型的分支逻辑
  - Anthropic [1024, 32000] 裁剪
  - effort 五档映射
  - 警告信息生成
- [ ] `ReasoningControls.vue` 组件：
  - Props 兼容性（旧 -> 新）
  - Effort 选项禁用逻辑
  - 事件 emit 格式
- [ ] `ChatView.vue` 计算属性：
  - `modelReasoningCapability` 派生正确性
  - `reasoningCostLevel` 映射

### 8.2 集成测试

**测试场景**：
- [ ] Class A 模型（Anthropic）：
  - 选择 high effort → 请求体包含 `reasoning.effort='high'`
  - 自定义 max_tokens 8000 → 裁剪到 [1024, 32000] → `reasoning.max_tokens=8000`
  - 验证 `max_tokens > reasoning.max_tokens`
- [ ] Class B 模型（OpenAI o-series）：
  - 选择 max_tokens 模式 → 作为 hint 转发
  - 验证不同 effort 档位的响应差异
- [ ] Class C 模型：
  - UI 推理控件置灰
  - 请求体不包含 `reasoning` 字段

### 8.3 E2E 测试（可选）

**用户流程**：
1. 切换模型：Anthropic → OpenAI → Gemini
2. 观察推理控件可用性变化
3. 调整 effort 档位
4. 发送消息并观察响应

## 九、成本提示与警示文案

### 9.1 UI 文案标准

**Effort 档位文案**：
```ts
const EFFORT_DESCRIPTIONS = {
  minimal: {
    title: '最小推理',
    description: '约 10% 推理预算，适合简单任务',
    cost: '🟢 低成本',
    latency: '⚡ 快速响应'
  },
  low: {
    title: '轻量推理',
    description: '约 20% 推理预算，日常使用推荐',
    cost: '🟢 低成本',
    latency: '⚡ 较快响应'
  },
  medium: {
    title: '标准推理',
    description: '约 50% 推理预算，平衡性能与成本',
    cost: '🟡 中等成本',
    latency: '⏱️ 正常响应'
  },
  high: {
    title: '深度推理',
    description: '约 80% 推理预算，复杂任务适用',
    cost: '🔴 高成本',
    latency: '🐢 较慢响应'
  }
}
```

**警告文案**：
```ts
// 模型不支持
const WARNING_UNSUPPORTED = '当前模型不支持显式推理参数'

// 不返回可见内容
const WARNING_NO_VISIBLE = '该模型不会返回可见的推理内容（即使开启推理）'

// 自动调整
const WARNING_AUTO_ADJUSTED = (from: number, to: number) => 
  `推理预算已自动调整：${from} → ${to} tokens`

// 成本提示
const WARNING_HIGH_COST = (effort: string, price: number) => 
  `当前档位 (${effort}) 可能产生较高成本（约 $${price.toFixed(4)}/1K tokens）`
```

### 9.2 Tooltip 提示

**按钮 Hover**：
```html
<!-- 推理按钮 -->
<button :title="`推理控制 - 当前: ${reasoningEffortLabel} (${costDescription})`">
  ...
</button>

<!-- 自定义预算输入 -->
<input 
  type="number" 
  :title="`对 ${modelFamily} 模型，此值将被裁剪到 [1024, 32000] 范围`"
/>
```
> TODO: Restrict the `[1024, 32000]` clamp tooltip to Anthropic reasoning models only; other providers should expose their own ranges (or none) instead of reusing this range.

**警告标记**：
```html
<!-- 高成本档位 -->
<div v-if="effort === 'high'" class="text-xs text-orange-600 mt-1">
  ⚠️ 此档位可能显著增加延迟和费用
</div>

<!-- 模型不返回内容 -->
<div v-if="!returnsVisibleReasoning" class="text-xs text-gray-500 mt-1">
  ℹ️ 该模型不会在响应中包含推理过程细节
</div>
```

## 十、总结

### 10.1 关键修改点

| 组件                  | 修改类型          | 核心变更                                  |
|-----------------------|-------------------|-------------------------------------------|
| `reasoning.ts`        | 新增文件          | 统一类型定义（effort 五档、能力结构）     |
| `openrouterReasoningAdapter.ts` | 新增文件 | 适配器实现（Class A/B/C 分支）            |
| `ReasoningControls.vue` | UI 重构        | 五档选项、成本标记、高级设置               |
| `ChatToolbar.vue`     | 样式增强          | 成本感知颜色、警告图标                     |
| `ChatInputArea.vue`   | Props 透传       | 传递新计算属性                             |
| `ChatView.vue`        | 逻辑接入          | 派生能力、调用适配器                       |

### 10.2 预期效果

**技术层面**：
- ✅ 完全符合 OpenRouter 官方协议
- ✅ 代码档位与文档枚举一致
- ✅ 区分官方规则与 Starverse 策略
- ✅ 可扩展的能力探测与映射

**用户体验**：
- ✅ 清晰的成本/延迟提示
- ✅ 智能的模型兼容性处理
- ✅ 简单模式 + 高级设置的平衡
- ✅ 无感的旧配置兼容

### 10.3 下一步行动

1. **实施 Phase 2**：修改 `ReasoningControls.vue` UI 布局
2. **编写单元测试**：覆盖适配器核心逻辑
3. **集成测试**：验证多模型切换场景
4. **文档完善**：在设置界面增加"推理策略说明"页
5. **监控部署**：在 analytics 中记录 effort 分布与成本

---

**附录：辅助函数示例**

```ts
// src/utils/reasoningHelpers.ts
import type { ModelReasoningCapability } from '../types/reasoning'

/**
 * 推断模型是否支持 max_tokens（基于白名单）
 */
export function inferMaxTokensSupport(modelData: any): boolean {
  const modelId = modelData.id as string
  
  // Anthropic reasoning models
  if (modelId.includes('anthropic') && modelId.includes('reasoning')) {
    return true
  }
  
  // Gemini thinking models
  if (modelId.includes('gemini') && (modelId.includes('thinking') || modelId.includes('reasoning'))) {
    return true
  }
  
  // Qwen thinking models
  if (modelId.includes('qwen') && modelId.includes('thinking')) {
    return true
  }
  
  // OpenAI o-series（作为 hint）
  if (modelId.includes('openai/o-') || modelId.includes('openai/o1') || modelId.includes('openai/o3')) {
    return true
  }
  
  return false
}

/**
 * 推断模型是否返回可见 reasoning
 */
export function inferVisibleReasoning(modelData: any): 'yes' | 'no' | 'unknown' {
  const modelId = modelData.id as string
  
  // 确认不返回
  if (modelId.includes('gemini-flash-thinking')) {
    return 'no'
  }
  if (modelId.includes('openai/o-') && !modelId.includes('preview')) {
    return 'no'
  }
  
  // 确认返回
  if (modelId.includes('anthropic') && modelId.includes('reasoning')) {
    return 'yes'
  }
  if (modelId.includes('gemini-thinking') && !modelId.includes('flash')) {
    return 'yes'
  }
  
  return 'unknown'
}

/**
 * 推断 maxTokensPolicy
 */
export function inferMaxTokensPolicy(modelData: any): ModelReasoningCapability['maxTokensPolicy'] {
  const modelId = modelData.id as string
  const family = inferModelFamily(modelId)
  
  if (family === 'anthropic' && modelId.includes('reasoning')) {
    return 'anthropic-1024-32000'
  }
  
  if (family === 'gemini' || family === 'qwen') {
    return 'provider-unknown-range'
  }
  
  if (family === 'openai' || family === 'xai') {
    return 'effort-only'
  }
  
  return 'effort-only' // 默认
}

/**
 * 推断模型家族
 */
export function inferModelFamily(modelId: string): ModelReasoningCapability['family'] {
  if (modelId.includes('anthropic')) return 'anthropic'
  if (modelId.includes('openai')) return 'openai'
  if (modelId.includes('gemini') || modelId.includes('google')) return 'gemini'
  if (modelId.includes('grok') || modelId.includes('xai')) return 'xai'
  if (modelId.includes('qwen')) return 'qwen'
  return 'other'
}

/**
 * 推断 reasoningClass
 */
export function inferReasoningClass(modelData: any): 'A' | 'B' | 'C' {
  const supportsReasoning = modelData.supported_parameters?.includes('reasoning') ?? false
  if (!supportsReasoning) return 'C'
  
  const supportsMaxTokens = inferMaxTokensSupport(modelData)
  return supportsMaxTokens ? 'A' : 'B'
}
```
