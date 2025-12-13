# Provider 常量系统 - 快速参考

## 📦 导入

```typescript
// 常量和类型
import { PROVIDERS, type ProviderId } from '@/constants/providers'

// 元数据和工具函数
import { 
  PROVIDER_METADATA, 
  getProviderDisplayName,
  isValidProviderId 
} from '@/constants/providers'

// Store 转换函数
import { toProviderId, toAIProvider } from '@/stores'
```

## 🎯 核心 API

### 常量对象

```typescript
PROVIDERS.GEMINI       // => 'gemini'
PROVIDERS.OPENROUTER   // => 'openrouter'
PROVIDERS.OPENAI       // => 'openai'
PROVIDERS.ANTHROPIC    // => 'anthropic'
```

### 类型约束

```typescript
// 函数参数
function sendMessage(provider: ProviderId) { }

// 对象字段
interface Config {
  providerId: ProviderId;
}

// 变量声明
const provider: ProviderId = PROVIDERS.OPENROUTER;
```

### 元数据访问

```typescript
// 获取显示名称
const name = getProviderDisplayName(PROVIDERS.OPENROUTER)
// => "OpenRouter"

// 获取完整元数据
const meta = PROVIDER_METADATA[PROVIDERS.OPENROUTER]
// => {
//   id: 'openrouter',
//   displayName: 'OpenRouter',
//   envPrefix: 'OPENROUTER',
//   requiresApiKey: true,
//   docsUrl: 'https://openrouter.ai/docs'
// }

// 验证 Provider ID
isValidProviderId('openrouter')  // => true
isValidProviderId('Openrouter')  // => false
```

## 🔄 UI ↔ Runtime 转换

```typescript
// UI 层 ('Gemini' | 'OpenRouter') → Runtime 层 ('gemini' | 'openrouter')
const runtimeId = toProviderId('OpenRouter')  // => 'openrouter'

// Runtime 层 → UI 层
const uiName = toAIProvider(PROVIDERS.GEMINI)  // => 'Gemini'
```

## 📝 常见场景

### 场景 1: Service 中提取 Provider

```typescript
import { PROVIDERS, type ProviderId } from '@/constants/providers'

function extractProviderId(modelId: string): ProviderId | undefined {
  const match = modelId.match(/^([^/]+)\//)
  if (!match) return undefined
  
  const prefix = match[1].toLowerCase()
  
  if (prefix === PROVIDERS.OPENAI) return PROVIDERS.OPENAI
  if (prefix === PROVIDERS.ANTHROPIC) return PROVIDERS.ANTHROPIC
  
  return undefined
}

extractProviderId('openai/gpt-4o')  // => 'openai'
```

### 场景 2: 条件判断

```typescript
// ✅ 正确
if (provider === PROVIDERS.OPENROUTER) {
  // OpenRouter 特定逻辑
}

// ❌ 错误
if (provider === 'openrouter') {  // 硬编码字符串
if (provider === 'Openrouter') {  // 大小写错误
```

### 场景 3: Store 中按 Provider 过滤

```typescript
import { PROVIDERS, type ProviderId } from '@/constants/providers'

const getModelsByProvider = (providerId: ProviderId) => {
  return allModels.value.filter(model => 
    model.id.startsWith(`${providerId}/`)
  )
}

const openaiModels = getModelsByProvider(PROVIDERS.OPENAI)
```

### 场景 4: 组件中显示 Provider 信息

```vue
<script setup lang="ts">
import { PROVIDER_METADATA, type ProviderId } from '@/constants/providers'
import { toProviderId } from '@/stores'
import { useAppStore } from '@/stores'

const appStore = useAppStore()

const currentProviderId = computed<ProviderId>(() => 
  toProviderId(appStore.activeProvider)
)

const metadata = computed(() => 
  PROVIDER_METADATA[currentProviderId.value]
)
</script>

<template>
  <div>
    <h2>{{ metadata.displayName }}</h2>
    <a :href="metadata.docsUrl">文档</a>
  </div>
</template>
```

## ⚠️ 常见错误

| ❌ 错误写法 | ✅ 正确写法 |
|----------|----------|
| `'openrouter'` | `PROVIDERS.OPENROUTER` |
| `'Openrouter'` | `PROVIDERS.OPENROUTER` |
| `'openRouter'` | `PROVIDERS.OPENROUTER` |
| `provider: string` | `provider: ProviderId` |
| `if (p === 'gemini')` | `if (p === PROVIDERS.GEMINI)` |

## 🚀 添加新 Provider

1. 在 `src/constants/providers.ts` 中添加：

```typescript
export const PROVIDERS = {
  // ... 现有 Provider
  COHERE: 'cohere',
} as const;

export const PROVIDER_METADATA: Record<ProviderId, ProviderMetadata> = {
  // ... 现有元数据
  [PROVIDERS.COHERE]: {
    id: PROVIDERS.COHERE,
    displayName: 'Cohere',
    envPrefix: 'COHERE',
    requiresApiKey: true,
    docsUrl: 'https://docs.cohere.com',
  },
};
```

2. TypeScript 自动更新 `ProviderId` 类型
3. 所有相关代码立即获得新 Provider 支持

## 📚 完整文档

- **使用指南**: `docs/PROVIDER_CONSTANTS_USAGE.md` (300+ 行)
- **实现总结**: `docs/PROVIDER_CONSTANTS_IMPLEMENTATION.md`
- **测试脚本**: `scripts/test-provider-constants.ts`

---

**核心原则**: 使用类型系统在编译时捕获错误，而非运行时崩溃。
