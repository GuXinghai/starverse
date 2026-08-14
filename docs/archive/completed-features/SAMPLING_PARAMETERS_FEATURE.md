# 采样参数配置功能

## 功能概述

为每个对话添加可配置的采样参数（Sampling Parameters），允许用户精细控制 AI 模型的生成行为，包括温度、top-p、频率惩罚等参数。

## 核心设计

### 1. 数据结构

```typescript
export interface SamplingParameterSettings {
  enabled: boolean;              // 是否启用自定义参数
  temperature?: number | null;   // 温度 (0-2)
  top_p?: number | null;        // 核采样阈值 (0-1)
  top_k?: number | null;        // Top-K 截断 (>=0)
  frequency_penalty?: number | null;  // 频率惩罚 (-2到2)
  presence_penalty?: number | null;   // 存在惩罚 (-2到2)
  repetition_penalty?: number | null; // 重复惩罚 (0-2)
  min_p?: number | null;        // 最小概率 (0-1)
  top_a?: number | null;        // Top-A 截断 (0-1)
  max_tokens?: number | null;   // 最大输出长度
  seed?: number | null;         // 随机种子
}
```

### 2. 默认值配置

```typescript
export const DEFAULT_SAMPLING_PARAMETERS = Object.freeze({
  enabled: false,
  temperature: 1,
  top_p: 1,
  top_k: 0,
  frequency_penalty: 0,
  presence_penalty: 0,
  repetition_penalty: 1,
  min_p: 0,
  top_a: 0,
  max_tokens: null,
  seed: null
})
```

## 参数说明

### Temperature (温度)
- **范围**：0-2
- **默认值**：1.0
- **作用**：控制输出的随机性
  - 接近 0：更确定、保守的输出
  - 接近 2：更随机、创造性的输出
- **推荐场景**：
  - 代码生成：0.2-0.5
  - 创意写作：0.8-1.2
  - 随机性任务：1.5-2.0

### Top-P (核采样)
- **范围**：0-1
- **默认值**：1.0
- **作用**：基于累积概率筛选候选词
  - 0.1：只考虑累积概率前 10% 的词
  - 1.0：考虑所有词
- **推荐值**：0.9-0.95

### Top-K
- **范围**：>=0
- **默认值**：0 (不限制)
- **作用**：限制候选词数量
  - 40：只从概率最高的 40 个词中选择
  - 0：不限制

### Frequency Penalty (频率惩罚)
- **范围**：-2 到 2
- **默认值**：0
- **作用**：降低重复词汇的概率
  - 正值：减少重复
  - 负值：鼓励重复

### Presence Penalty (存在惩罚)
- **范围**：-2 到 2
- **默认值**：0
- **作用**：鼓励谈论新话题
  - 正值：更倾向于引入新概念
  - 负值：更倾向于深入当前话题

### Repetition Penalty (重复惩罚)
- **范围**：0-2
- **默认值**：1.0
- **作用**：惩罚已生成的 token
  - 1.0：无惩罚
  - >1.0：减少重复

### Max Tokens (最大长度)
- **范围**：>0 或 null
- **默认值**：null (模型默认)
- **作用**：限制输出长度

### Seed (随机种子)
- **范围**：整数或 null
- **默认值**：null
- **作用**：固定随机性以实现可重现的输出

## 实现细节

### 1. 数据标准化

```javascript
const normalizeSamplingParameters = (input) => {
  const source = input && typeof input === 'object' ? input : {}
  const normalized = { ...DEFAULT_SAMPLING_PARAMETERS }

  // 布尔值标准化
  normalized.enabled = Boolean(source.enabled)

  // 浮点数标准化（带范围限制）
  const assignFloat = (key, min, max) => {
    const raw = source[key]
    if (raw === undefined || raw === null || raw === '') {
      normalized[key] = DEFAULT_SAMPLING_PARAMETERS[key]
      return
    }
    const num = Number(raw)
    if (!Number.isFinite(num)) {
      normalized[key] = DEFAULT_SAMPLING_PARAMETERS[key]
      return
    }
    let clamped = num
    if (typeof min === 'number') clamped = Math.max(min, clamped)
    if (typeof max === 'number') clamped = Math.min(max, clamped)
    normalized[key] = parseFloat(clamped.toFixed(4))
  }

  assignFloat('temperature', 0, 2)
  assignFloat('top_p', 0, 1)
  // ... 其他参数
  
  return normalized
}
```

### 2. Store Actions

**setConversationSamplingParameters**
```javascript
const setConversationSamplingParameters = (conversationId, updates = {}) => {
  const conversation = conversations.value.find(conv => conv.id === conversationId)
  if (!conversation) return false

  const current = normalizeSamplingParameters(conversation.samplingParameters)
  const merged = { ...current, ...updates }
  const normalized = normalizeSamplingParameters(merged)

  // 避免无效更新
  if (JSON.stringify(current) === JSON.stringify(normalized)) {
    return false
  }

  conversation.samplingParameters = normalized
  conversation.updatedAt = Date.now()
  markConversationDirty(conversationId)
  debouncedSaveConversations(800)
  return true
}
```

### 3. OpenRouter 集成

```javascript
// OpenRouterService.js
const OPENROUTER_SAMPLING_KEYS = [
  'temperature',
  'top_p',
  'top_k',
  'frequency_penalty',
  'presence_penalty',
  'repetition_penalty',
  'min_p',
  'top_a',
  'max_tokens',
  'seed'
]

// 提取并附加到请求体
if (samplingParameters) {
  Object.assign(requestBody, samplingParameters)
}
```

### 4. 持久化支持

- 数据库字段：`convo.meta.samplingParameters`
- 序列化：通过 `toConversationSnapshot`
- 反序列化：通过 `fromConversationSnapshot`
- 自动标准化：加载时统一应用默认值

## 使用示例

### 场景 1：代码生成（确定性）
```javascript
{
  enabled: true,
  temperature: 0.3,
  top_p: 0.9,
  frequency_penalty: 0.5,
  max_tokens: 2000
}
```

### 场景 2：创意写作（随机性）
```javascript
{
  enabled: true,
  temperature: 1.2,
  top_p: 0.95,
  presence_penalty: 0.6,
  repetition_penalty: 1.1
}
```

### 场景 3：可重现测试
```javascript
{
  enabled: true,
  temperature: 0.7,
  seed: 42,
  max_tokens: 500
}
```

## 兼容性

### OpenRouter
✅ 完全支持所有参数

### Gemini
⚠️ 部分支持
- 支持：`temperature`, `max_tokens`, `top_p`, `top_k`
- 不支持：惩罚类参数（frequency_penalty 等）

## 性能优化

1. **防抖保存**：800ms 延迟，避免频繁写盘
2. **智能对比**：只在值实际改变时保存
3. **增量持久化**：仅标记变更的对话

## 注意事项

1. **启用控制**：`enabled: false` 时所有参数无效
2. **范围验证**：超出范围的值会被自动钳位
3. **类型安全**：非数字值会回退到默认值
4. **小数精度**：浮点数保留 4 位小数

## 相关文件

- `src/types/chat.ts` - 类型定义和默认值
- `src/stores/chatStore.js` - Store 实现和标准化
- `src/services/chatPersistence.ts` - 持久化支持
- `src/services/aiChatService.js` - 参数传递
- `src/services/providers/OpenRouterService.js` - OpenRouter 集成
- `src/services/IAIProvider.ts` - 接口定义
