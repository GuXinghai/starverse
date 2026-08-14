# Phase 3 迁移指南 - 从旧架构到统一配置

**目标读者**: 维护 Starverse 项目的开发者  
**最后更新**: 2025-12-03

---

## 📋 概述

本指南帮助你将现有的分散配置管理迁移到 Phase 3 的统一 `GenerationConfig` 架构。Phase 3 实现了向后兼容的渐进式升级路径，你可以选择性地启用新特性。

---

## 🎯 迁移目标

### 旧架构的问题

1. **分散管理**
   ```typescript
   // ❌ 旧架构：参数分散在多个地方
   const reasoningPreference = ref<ReasoningPreference>({...})
   const samplingParameters = ref<SamplingParameterSettings>({...})
   const maxTokens = ref<number>(2000)
   // ... 还有其他配置散落各处
   ```

2. **重复逻辑**
   - 每个组件都需要检查模型能力
   - 参数验证逻辑重复
   - 没有统一的 dry-run 检查

3. **可维护性差**
   - 添加新参数需要修改多处
   - 模型能力变更影响范围大
   - 难以追踪配置来源

### 新架构的优势

1. **统一接口**
   ```typescript
   // ✅ 新架构：统一的配置对象
   const config: GenerationConfig = {
     sampling: {...},
     reasoning: {...},
     length: {...}
   }
   ```

2. **自动化检查**
   - 模型能力自动过滤参数
   - Dry-run 预览避免运行时错误
   - 统一的参数验证

3. **可扩展性强**
   - 新增参数只需修改类型定义
   - 模型能力集中管理
   - 清晰的数据流

---

## 🚀 迁移步骤

### Step 1: 引入 Adapter（零侵入）

最简单的方式是在现有组件中添加 adapter，不破坏现有逻辑：

```typescript
// 在 ChatView.vue 或父组件中
import { useGenerationConfigAdapter } from '@/composables/useGenerationConfigAdapter'
import { useModelStore } from '@/stores/model'
import { useConversationStore } from '@/stores/conversation'

const modelStore = useModelStore()
const convoStore = useConversationStore()

// 创建 adapter（不影响现有代码）
const configAdapter = useGenerationConfigAdapter({
  modelId: computed(() => modelStore.currentModelId),
  modelCapability: computed(() => modelStore.currentModelCapability),
  reasoningPreference: computed(() => convoStore.activeConversation?.reasoningPreference || {}),
  samplingParameters: computed(() => convoStore.activeConversation?.samplingParameters)
})

// 现在可以访问统一配置
const unifiedConfig = configAdapter.unifiedConfig
```

此时你的旧代码继续工作，但你可以选择性地使用新功能。

### Step 2: 添加 Dry-run 检查（增强功能）

在发送消息前添加参数预览：

```typescript
async function sendMessage(content: string) {
  // Phase 3: 添加 dry-run 检查
  if (import.meta.env.DEV) {
    const dryRun = configAdapter.performDryRun()
    
    if (dryRun.warnings.length > 0) {
      console.warn('⚠️ 生成配置警告:', dryRun.warnings)
    }
    
    if (dryRun.willClip.length > 0) {
      console.warn('✂️ 参数将被裁剪:', dryRun.willClip)
    }
  }
  
  // 继续使用现有的发送逻辑
  await aiChatService.sendMessage(content, {
    reasoning: reasoningPreference.value,
    parameters: samplingParameters.value
  })
}
```

### Step 3: 集成新 UI 组件（可选）

如果你想使用新的 `GenerationConfigPanel`：

```vue
<script setup lang="ts">
import GenerationConfigPanel from '@/components/chat/controls/GenerationConfigPanel.vue'

const showConfigPanel = ref(false)

// 使用现有的 refs，无需重构
const reasoningPref = computed(() => convoStore.activeConversation?.reasoningPreference)
const samplingParams = computed(() => convoStore.activeConversation?.samplingParameters)
</script>

<template>
  <!-- 添加打开按钮 -->
  <button @click="showConfigPanel = true" title="高级配置">
    <svg>...</svg>
  </button>

  <!-- 新面板（完全独立） -->
  <GenerationConfigPanel
    :modelId="modelStore.currentModelId"
    :modelCapability="modelStore.currentModelCapability"
    :reasoningPreference="reasoningPref"
    :samplingParameters="samplingParams"
    :show="showConfigPanel"
    @update:show="showConfigPanel = $event"
    @update:reasoningPreference="convoStore.updateReasoningPreference"
    @update:samplingParameters="convoStore.updateSamplingParameters"
  />
</template>
```

### Step 4: 更新 ReasoningControls（推荐）

如果你已经在使用 `ReasoningControls`，它现在会自动发出统一的 `ReasoningConfig`：

```vue
<script setup lang="ts">
// 旧的 emit
emit('update:reasoningPreference', updates)

// 新增：同时发出统一配置
emit('update:reasoningConfig', {
  controlMode: 'effort',
  effort: 'medium',
  showReasoningContent: true
})
</script>

<template>
  <ReasoningControls
    :reasoningPreference="reasoningPref"
    :modelCapability="modelCapability"
    :show="showReasoningMenu"
    @update:reasoningPreference="handleReasoningUpdate"
    @update:reasoningConfig="handleUnifiedConfigUpdate"  <!-- 新增 -->
    @update:show="showReasoningMenu = $event"
  />
</template>
```

然后在父组件中处理：

```typescript
function handleUnifiedConfigUpdate(config: ReasoningConfig | null) {
  // 可选：使用统一配置更新其他系统
  if (config) {
    console.log('统一推理配置:', config)
    // 未来可以直接传递给 Service 层
  }
}
```

---

## 🔄 渐进式迁移路径

### 阶段 1: 观察模式（已完成）

**状态**: Phase 3 已实现此阶段

- ✅ Adapter 创建完成
- ✅ 新 UI 组件可用
- ✅ 旧代码继续工作
- ✅ 开发者可选择性启用新特性

**风险**: 无

### 阶段 2: 双轨运行（推荐下一步）

**目标**: 新旧系统同时工作，逐步切换

```typescript
// 在 Service 层同时支持两种配置
export async function sendMessage(
  message: string,
  legacyOptions?: {
    reasoning?: ReasoningPreference,
    parameters?: SamplingParameterSettings
  },
  unifiedConfig?: GenerationConfig  // 新增
) {
  // 优先使用统一配置
  if (unifiedConfig) {
    return sendWithUnifiedConfig(message, unifiedConfig)
  }
  
  // 回退到旧配置
  return sendWithLegacyConfig(message, legacyOptions)
}
```

**迁移清单**:
- [ ] Service 层支持 `GenerationConfig` 参数
- [ ] 添加配置转换层（`LegacyConfig → GenerationConfig`）
- [ ] 在开发环境中同时记录两种配置，验证一致性
- [ ] 添加 feature flag 控制使用哪种配置

### 阶段 3: 完全切换（长期目标）

**目标**: 移除旧架构，只使用统一配置

**迁移清单**:
- [ ] 所有 UI 组件迁移到 Adapter
- [ ] Store 重构为存储 `GenerationConfig`
- [ ] Service 层移除旧接口
- [ ] 删除 `ReasoningPreference` 和 `SamplingParameterSettings` 类型（或标记为 deprecated）
- [ ] 更新持久化层（数据库 schema）

---

## 📦 组件迁移示例

### 示例 1: 迁移 ChatToolbar

**旧代码**:
```vue
<script setup lang="ts">
const props = defineProps<{
  reasoningEnabled?: boolean
  reasoningEffortLabel?: string
  samplingParametersEnabled?: boolean
}>()

const emit = defineEmits<{
  'toggle-reasoning': []
  'select-reasoning-effort': [effort: string]
}>()
</script>

<template>
  <button @click="emit('toggle-reasoning')">
    {{ reasoningEnabled ? '推理: ' + reasoningEffortLabel : '推理: 关闭' }}
  </button>
</template>
```

**新代码（渐进式）**:
```vue
<script setup lang="ts">
import { useGenerationConfigAdapter } from '@/composables/useGenerationConfigAdapter'

const props = defineProps<{
  // 保留旧 props（向后兼容）
  reasoningEnabled?: boolean
  reasoningEffortLabel?: string
  samplingParametersEnabled?: boolean
  
  // 新增：统一配置相关
  modelId?: string | null
  modelCapability?: ModelGenerationCapability | null
  reasoningPreference?: ReasoningPreference
  samplingParameters?: SamplingParameterSettings
}>()

const emit = defineEmits<{
  // 保留旧 emits
  'toggle-reasoning': []
  'select-reasoning-effort': [effort: string]
  
  // 新增：统一配置 emit
  'update:unifiedConfig': [config: PartialGenerationConfig]
}>()

// Phase 3: 创建 adapter（仅当提供了新 props）
const adapter = props.modelId ? useGenerationConfigAdapter({
  modelId: computed(() => props.modelId),
  modelCapability: computed(() => props.modelCapability),
  reasoningPreference: computed(() => props.reasoningPreference || {}),
  samplingParameters: computed(() => props.samplingParameters),
  onUpdate: (config) => emit('update:unifiedConfig', config)
}) : null

// 使用 adapter 时显示警告
const hasWarnings = computed(() => {
  if (!adapter) return false
  const dryRun = adapter.performDryRun()
  return dryRun.warnings.length > 0 || dryRun.willClip.length > 0
})
</script>

<template>
  <!-- 旧 UI（保留） -->
  <button @click="emit('toggle-reasoning')">
    {{ reasoningEnabled ? '推理: ' + reasoningEffortLabel : '推理: 关闭' }}
    
    <!-- Phase 3: 添加警告指示器 -->
    <span v-if="hasWarnings" class="warning-badge">⚠️</span>
  </button>
</template>
```

### 示例 2: 迁移发送消息逻辑

**旧代码**:
```typescript
async function sendMessage(content: string) {
  const message = {
    role: 'user',
    content
  }
  
  // 分散的配置
  const options = {
    reasoning: reasoningPreference.value,
    parameters: samplingParameters.value,
    maxTokens: maxTokensLimit.value
  }
  
  await aiChatService.sendMessage(message, options)
}
```

**新代码（渐进式）**:
```typescript
async function sendMessage(content: string) {
  const message = {
    role: 'user',
    content
  }
  
  // Phase 3: 使用 adapter 构建统一配置
  const unifiedConfig = configAdapter?.unifiedConfig.value
  
  if (unifiedConfig) {
    // 优先使用统一配置
    await aiChatService.sendMessageV2(message, unifiedConfig)
  } else {
    // 回退到旧方式
    const options = {
      reasoning: reasoningPreference.value,
      parameters: samplingParameters.value,
      maxTokens: maxTokensLimit.value
    }
    await aiChatService.sendMessage(message, options)
  }
}
```

---

## ⚠️ 常见陷阱与解决方案

### 陷阱 1: 忘记传递 `modelCapability`

**问题**:
```typescript
const adapter = useGenerationConfigAdapter({
  modelId: computed(() => modelStore.currentModelId),
  modelCapability: computed(() => null),  // ❌ 忘记获取
  ...
})

// 结果：所有参数都会被标记为不支持
```

**解决**:
```typescript
const adapter = useGenerationConfigAdapter({
  modelId: computed(() => modelStore.currentModelId),
  modelCapability: computed(() => {
    const modelId = modelStore.currentModelId
    return modelId ? modelStore.getModelCapability(modelId) : null
  }),
  ...
})
```

### 陷阱 2: 直接修改 `unifiedConfig`

**问题**:
```typescript
// ❌ 直接修改 computed 属性
adapter.unifiedConfig.value.sampling.temperature = 0.5
```

**解决**:
```typescript
// ✅ 通过原始 refs 修改
samplingParameters.value = {
  ...samplingParameters.value,
  temperature: 0.5
}

// 或使用 applyUnifiedConfig
adapter.applyUnifiedConfig({
  sampling: { temperature: 0.5 }
})
```

### 陷阱 3: 在 Service 层混用新旧接口

**问题**:
```typescript
// ❌ 同时传递旧配置和新配置，造成冲突
await service.sendMessage(msg, {
  reasoning: oldReasoningPref,
  unifiedConfig: newConfig
})
```

**解决**:
```typescript
// ✅ 明确优先级
await service.sendMessage(msg, {
  ...(useUnified ? { unifiedConfig: newConfig } : { reasoning: oldReasoningPref })
})
```

---

## 🧪 测试策略

### 单元测试（推荐）

```typescript
import { describe, it, expect } from 'vitest'
import { useGenerationConfigAdapter } from '@/composables/useGenerationConfigAdapter'
import { ref, computed } from 'vue'

describe('useGenerationConfigAdapter', () => {
  it('should filter unsupported parameters', () => {
    const adapter = useGenerationConfigAdapter({
      modelId: computed(() => 'test-model'),
      modelCapability: computed(() => ({
        supports: {
          temperature: true,
          top_p: true,
          top_k: false  // 不支持
        }
      })),
      reasoningPreference: ref({}),
      samplingParameters: ref({
        temperature: 0.7,
        top_k: 10  // 应该被过滤
      })
    })
    
    const config = adapter.unifiedConfig.value
    expect(config.sampling).toHaveProperty('temperature')
    expect(config.sampling).not.toHaveProperty('top_k')
  })
  
  it('should detect clipped parameters', () => {
    const adapter = useGenerationConfigAdapter({
      // ... setup
      samplingParameters: ref({
        temperature: 3.0  // 超出范围
      })
    })
    
    const dryRun = adapter.performDryRun()
    expect(dryRun.willClip).toHaveLength(1)
    expect(dryRun.willClip[0].param).toBe('temperature')
    expect(dryRun.willClip[0].clipped).toBe(2.0)
  })
})
```

### 集成测试（手动）

1. **测试预设应用**
   - 打开 `GenerationConfigPanel`
   - 选择每个预设
   - 验证参数立即更新

2. **测试模型切换**
   - 切换到不同能力的模型
   - 验证参数可见性正确变化
   - 验证警告正确显示

3. **测试 Dry-run**
   - 设置超出范围的参数
   - 打开 Dry-run 面板
   - 验证裁剪信息正确

---

## 📊 迁移进度追踪

### 组件迁移清单

- [x] `ReasoningControls` - 已更新（发出统一配置）
- [ ] `ChatToolbar` - 待增强（添加警告指示器）
- [ ] `SamplingControls` - 待增强（添加能力检查）
- [x] `ModernChatInput` - 已集成（替代 ChatInputArea）
- [ ] `SettingsView` - 待集成（可选）

### Service 层迁移清单

- [ ] `aiChatService.js` - 支持 `GenerationConfig` 参数
- [ ] `OpenRouterService` - 统一配置适配器
- [ ] `GeminiService` - 统一配置适配器

### Store 层迁移清单

- [ ] `conversationStore` - 存储 `GenerationConfig`（可选）
- [ ] `modelStore` - 提供 `ModelGenerationCapability`（已部分完成）

---

## 🎓 学习资源

1. **代码示例**
   - `src/composables/useGenerationConfigAdapter.ts` - Adapter 实现
   - `src/components/chat/controls/GenerationConfigPanel.vue` - UI 组件
   - `docs/PHASE_3_UI_CONFIG_INTEGRATION.md` - 完整文档

2. **类型定义**
   - `src/types/generation.ts` - 统一配置类型
   - `src/types/reasoning.ts` - 推理类型

3. **官方文档**
   - [OpenRouter Reasoning Tokens](https://openrouter.ai/docs/guides/best-practices/reasoning-tokens)
   - [OpenRouter API Parameters](https://openrouter.ai/docs/api/reference/parameters)

---

## 💡 最佳实践

1. **渐进式迁移**
   - 不要一次性重写所有组件
   - 从低风险的增强功能开始
   - 保持旧代码工作，直到新系统稳定

2. **明确边界**
   - UI 层负责用户交互
   - Adapter 负责配置转换
   - Service 层负责 API 调用

3. **充分测试**
   - 添加单元测试覆盖 Adapter
   - 手动测试所有模型类型
   - 监控生产环境日志

4. **文档先行**
   - 更新组件注释
   - 记录迁移决策
   - 保持 README 最新

---

## 🆘 获取帮助

如果在迁移过程中遇到问题：

1. 查看 `docs/PHASE_3_UI_CONFIG_INTEGRATION.md` 的详细 API 文档
2. 参考现有组件的实现（如 `ReasoningControls`）
3. 在开发模式下启用详细日志（已内置 `import.meta.env.DEV` 检查）
4. 使用 Dry-run 检查器诊断参数问题

---

**最后更新**: 2025-12-03  
**维护者**: GitHub Copilot + Starverse Team
