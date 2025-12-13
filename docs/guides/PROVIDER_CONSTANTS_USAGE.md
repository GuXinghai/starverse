# Provider 常量使用指南

## 概述

`src/constants/providers.ts` 提供了类型安全的 Provider ID 管理系统，用于避免字符串拼写错误（如 `Openrouter` vs `openrouter`）。

## 设计原则

1. **简单直观**：使用 `as const` + 联合类型，避免枚举和复杂抽象
2. **类型安全**：ProviderId 联合类型确保编译时检查
3. **易于扩展**：添加新 Provider 只需修改一个文件

## 核心 API

### 1. PROVIDERS 常量对象

```typescript
import { PROVIDERS } from '@/constants/providers'

// ✅ 正确：使用常量
const providerId = PROVIDERS.OPENROUTER // 'openrouter'

// ❌ 错误：硬编码字符串（容易拼写错误）
const providerId = 'openrouter' // 或者 'Openrouter'?
```

### 2. ProviderId 类型

```typescript
import type { ProviderId } from '@/constants/providers'

// 函数参数类型约束
function sendMessage(provider: ProviderId, message: string) {
  // provider 只能是 'gemini' | 'openrouter' | 'openai' | 'anthropic'
}

// 对象字段类型约束
interface ModelConfig {
  providerId: ProviderId;
  modelName: string;
}
```

### 3. Provider 元数据

```typescript
import { PROVIDER_METADATA, getProviderDisplayName } from '@/constants/providers'

// 获取显示名称
const displayName = getProviderDisplayName(PROVIDERS.OPENROUTER)
// => "OpenRouter"

// 获取环境变量前缀
const envPrefix = PROVIDER_METADATA[PROVIDERS.OPENROUTER].envPrefix
// => "OPENROUTER"
```

## 使用示例

### 示例 1：在 Service 中使用

```typescript
// src/services/providers/modelCapability.ts
import type { ProviderId } from '@/constants/providers'
import { PROVIDERS } from '@/constants/providers'

export interface ModelGenerationCapability {
  modelId: string;
  
  // ✅ 使用 ProviderId 类型约束
  providerId?: ProviderId;
  
  maxTokens: number;
  supportsVision: boolean;
}

export function buildModelCapability(rawModel: any): ModelGenerationCapability {
  // 从模型 ID 中提取 Provider
  const providerId = extractProviderId(rawModel.id)
  
  return {
    modelId: rawModel.id,
    providerId,
    maxTokens: rawModel.context_length || 4096,
    supportsVision: rawModel.vision || false,
  }
}

function extractProviderId(modelId: string): ProviderId | undefined {
  // OpenRouter 模型格式: "provider/model-name"
  const match = modelId.match(/^([^/]+)\//)
  if (!match) return undefined
  
  const prefix = match[1].toLowerCase()
  
  // ✅ 使用常量比较，避免拼写错误
  if (prefix === PROVIDERS.OPENAI) return PROVIDERS.OPENAI
  if (prefix === PROVIDERS.ANTHROPIC) return PROVIDERS.ANTHROPIC
  
  return undefined
}
```

### 示例 2：在 Store 中使用

```typescript
// src/stores/model.ts
import { PROVIDERS, type ProviderId } from '@/constants/providers'

export const useModelStore = defineStore('model', () => {
  
  // 按 Provider 过滤模型
  const getModelsByProvider = (providerId: ProviderId) => {
    return allModels.value.filter(model => {
      return model.id.startsWith(`${providerId}/`)
    })
  }
  
  // ✅ 类型安全的调用
  const openaiModels = getModelsByProvider(PROVIDERS.OPENAI)
  
  // ❌ 编译时错误：类型 'string' 不能赋值给类型 'ProviderId'
  // const models = getModelsByProvider('OpenAI')
  
  return { getModelsByProvider }
})
```

### 示例 3：在组件中使用

```vue
<script setup lang="ts">
import { PROVIDERS, PROVIDER_METADATA, type ProviderId } from '@/constants/providers'
import { useAppStore } from '@/stores'
import { toProviderId } from '@/stores'

const appStore = useAppStore()

// UI 层使用 AIProvider ('Gemini' | 'OpenRouter')
// 运行时使用 ProviderId ('gemini' | 'openrouter')
const currentProviderId = computed<ProviderId>(() => {
  return toProviderId(appStore.activeProvider)
})

// 获取当前 Provider 的显示名称
const providerName = computed(() => {
  return PROVIDER_METADATA[currentProviderId.value].displayName
})

// 获取文档链接
const docsUrl = computed(() => {
  return PROVIDER_METADATA[currentProviderId.value].docsUrl
})
</script>

<template>
  <div>
    <h2>当前提供商：{{ providerName }}</h2>
    <a :href="docsUrl" target="_blank">查看文档</a>
  </div>
</template>
```

### 示例 4：环境变量处理

```typescript
import { PROVIDERS, PROVIDER_METADATA } from '@/constants/providers'

function getApiKey(providerId: ProviderId): string | undefined {
  const envPrefix = PROVIDER_METADATA[providerId].envPrefix
  
  // ✅ 动态构建环境变量名
  const envKey = `${envPrefix}_API_KEY`
  
  // 例如：OPENROUTER_API_KEY, GEMINI_API_KEY
  return import.meta.env[envKey]
}

// 使用
const apiKey = getApiKey(PROVIDERS.OPENROUTER)
```

## 与现有代码的兼容性

### AIProvider vs ProviderId

项目中有两种 Provider 表示方式：

1. **UI 层（AIProvider）**：`'Gemini' | 'OpenRouter'` - 大写开头，用于用户界面
2. **运行时层（ProviderId）**：`'gemini' | 'openrouter'` - 小写，用于 API 调用

转换函数：

```typescript
import { toProviderId, toAIProvider } from '@/stores'

// UI -> Runtime
const runtimeId = toProviderId('Gemini') // => 'gemini'

// Runtime -> UI
const uiName = toAIProvider(PROVIDERS.GEMINI) // => 'Gemini'
```

### 迁移策略

**阶段 1：添加类型约束（当前）**
- ✅ 在新代码中使用 `ProviderId` 类型
- ✅ 保留现有的字符串比较逻辑

**阶段 2：渐进式重构（未来）**
- 将 `if (provider === 'Gemini')` 替换为 `if (toProviderId(provider) === PROVIDERS.GEMINI)`
- 将所有字符串字面量替换为 `PROVIDERS.*` 常量

**阶段 3：统一类型（可选）**
- 考虑将 `AIProvider` 类型改为 `ProviderId`
- 在 UI 层使用 `getProviderDisplayName()` 获取显示名称

## 常见错误与解决方案

### ❌ 错误 1：大小写不一致

```typescript
// 错误
if (provider === 'Openrouter') { } // 大写 O
if (provider === 'openRouter') { } // 驼峰式

// 正确
import { PROVIDERS } from '@/constants/providers'
if (provider === PROVIDERS.OPENROUTER) { }
```

### ❌ 错误 2：硬编码字符串

```typescript
// 错误
const config = {
  provider: 'openrouter' // 魔法字符串
}

// 正确
import { PROVIDERS } from '@/constants/providers'
const config = {
  provider: PROVIDERS.OPENROUTER
}
```

### ❌ 错误 3：跳过类型检查

```typescript
// 错误
function sendMessage(provider: string) { } // 过于宽松

// 正确
import type { ProviderId } from '@/constants/providers'
function sendMessage(provider: ProviderId) { }
```

## 扩展新 Provider

添加新 Provider（如 Cohere）只需修改 `src/constants/providers.ts`：

```typescript
export const PROVIDERS = {
  GEMINI: 'gemini',
  OPENROUTER: 'openrouter',
  OPENAI: 'openai',
  ANTHROPIC: 'anthropic',
  COHERE: 'cohere', // ✅ 新增
} as const;

export const PROVIDER_METADATA: Record<ProviderId, ProviderMetadata> = {
  // ... 现有 Provider
  
  [PROVIDERS.COHERE]: {
    id: PROVIDERS.COHERE,
    displayName: 'Cohere',
    envPrefix: 'COHERE',
    requiresApiKey: true,
    docsUrl: 'https://docs.cohere.com',
  },
};
```

TypeScript 会自动更新 `ProviderId` 类型，所有使用该类型的代码都会获得新的 Provider 支持。

## 总结

| 场景 | 使用方式 |
|------|---------|
| 字符串常量 | `PROVIDERS.OPENROUTER` |
| 类型约束 | `ProviderId` |
| 显示名称 | `getProviderDisplayName()` |
| 元数据 | `PROVIDER_METADATA[providerId]` |
| UI ↔ Runtime | `toProviderId()` / `toAIProvider()` |

**核心理念**：通过类型系统在编译时捕获错误，而非运行时崩溃。
