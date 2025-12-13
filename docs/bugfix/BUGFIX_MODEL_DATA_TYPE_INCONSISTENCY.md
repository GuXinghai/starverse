# 🐛 Bug 修复: 模型数据类型不一致导致的保存失败

## 问题描述

在应用启动时，尝试保存可用模型列表到数据库时发生错误：

```
❌ 保存可用模型列表失败: TypeError: modelId.split is not a function
    at extractProvider (modelDataClient.ts:103:25)
```

## 根本原因

**类型不一致问题**：

1. **Gemini Provider** 的 `listAvailableModels()` 返回 **字符串数组**：
   ```javascript
   ['models/gemini-2.0-flash-exp', 'models/gemini-1.5-pro', ...]
   ```

2. **OpenRouter Provider** 的 `listAvailableModels()` 返回 **对象数组**：
   ```javascript
   [
     {
       id: 'openai/gpt-4-turbo',
       name: 'GPT-4 Turbo',
       context_length: 128000,
       pricing: { ... },
       architecture: { ... },
       ...
     },
     ...
   ]
   ```

3. **问题链路**：
   - `main.ts:116` 假设 `modelIds` 是字符串数组，直接将返回值作为 `id` 使用
   - 当使用 OpenRouter 时，`id` 实际上是完整的对象
   - `modelDataClient.ts:103` 的 `extractProvider()` 调用 `modelId.split('/')` 时失败
   - 因为 `modelId` 是对象而不是字符串

## 修复方案

### 1. 规范化 `main.ts` 中的数据处理 ✅

**文件**: `src/main.ts:114-139`

**修改内容**：
- 将返回值统一规范化为标准 `ModelData` 格式
- 支持字符串数组（Gemini）和对象数组（OpenRouter）
- 确保 `id` 字段始终是字符串类型
- 正确提取模型的完整元数据（上下文窗口、定价、模态支持等）

```typescript
const modelData = await aiChatService.listAvailableModels(appStore)

// 规范化处理：支持字符串数组（Gemini）和对象数组（OpenRouter）
const models = modelData.map(item => {
  // 如果是对象，提取完整元数据
  if (typeof item === 'object' && item !== null && 'id' in item) {
    const baseModel = {
      id: String(item.id), // 确保 id 是字符串
      name: item.name || String(item.id),
      description: item.description,
      contextWindow: item.context_length,
      maxOutputTokens: item.max_output_tokens,
      pricing: item.pricing,
      supportsVision: item.input_modalities?.includes('image'),
      supportsImageOutput: item.output_modalities?.includes('image'),
      supportsReasoning: item.architecture?.reasoning === true
    }
    // 保留其他字段，但确保 id 是字符串（使用正确的展开顺序）
    return { ...item, ...baseModel }
  }
  // 如果是字符串，转换为对象
  return {
    id: String(item),
    name: String(item),
    // ... 其他字段为 undefined
  }
})
```

**关键改进**：
- ✅ 对象展开顺序：`{ ...item, ...baseModel }` 确保 `baseModel` 的字段覆盖原始 `item`
- ✅ 类型安全：使用 `String()` 确保 `id` 始终是字符串
- ✅ 完整元数据：保留 OpenRouter 返回的所有字段

### 2. 增强 `modelDataClient.ts` 的类型安全 ✅

**文件**: `src/services/db/modelDataClient.ts`

#### 2.1 `extractProvider()` 函数类型检查

```typescript
function extractProvider(modelId: string): string {
  // 类型安全检查：确保 modelId 是字符串
  if (typeof modelId !== 'string') {
    console.error('extractProvider: modelId 不是字符串类型:', typeof modelId, modelId)
    return 'unknown'
  }
  
  const parts = modelId.split('/')
  return parts[0] || 'unknown'
}
```

#### 2.2 `saveModels()` 函数数据清理

```typescript
export async function saveModels(models: ModelData[]): Promise<void> {
  const inputs: SaveModelDataInput[] = models.map(model => {
    // 确保 id 是字符串类型
    const modelId = String(model.id)
    return {
      id: modelId,
      provider: extractProvider(modelId),
      // ... 其他字段
    }
  })
  await query('model.saveMany', { models: inputs })
}
```

#### 2.3 `replaceModelsByProvider()` 函数同步修改

同样的修改应用到 `replaceModelsByProvider()` 函数。

### 3. 加固 Store 层的类型安全 ✅

**文件**: `src/stores/model.ts:89-102`

```typescript
const setAvailableModels = (models: ModelData[]): void => {
  const ids: string[] = []
  const map = new Map<string, ModelData>()

  for (const model of models) {
    if (model && model.id) {
      // 确保 id 是字符串类型
      const modelId = String(model.id)
      ids.push(modelId)
      // 规范化模型对象，确保 id 是字符串
      map.set(modelId, { ...model, id: modelId })
    }
  }

  availableModelIds.value = ids
  modelDataMap.value = map
}
```

## 测试覆盖

创建了全面的单元测试：`tests/unit/services/modelDataNormalization.test.ts`

### 测试场景

✅ **Gemini 字符串数组处理**
```typescript
['models/gemini-2.0-flash-exp', 'models/gemini-1.5-pro', ...]
→ 转换为标准 ModelData 对象
```

✅ **OpenRouter 对象数组处理**
```typescript
[{ id: 'openai/gpt-4', name: 'GPT-4', context_length: 8192, ... }]
→ 保留完整元数据，确保 id 是字符串
```

✅ **混合格式处理**
```typescript
['models/gemini-1.5-pro', { id: 'openai/gpt-4', ... }]
→ 统一规范化
```

✅ **非法数据处理**
```typescript
[null, undefined, 'valid-id', { id: 123 }, { name: 'No ID' }]
→ 过滤 null/undefined，转换数字 ID 为字符串
```

✅ **extractProvider 边界情况**
- 正常路径：`'openai/gpt-4'` → `'openai'`
- 无斜杠：`'gpt-4'` → `'gpt-4'`
- 空字符串：`''` → `'unknown'`
- 非字符串：`123`, `null`, `undefined`, `{}` → `'unknown'`

### 测试结果

```
✓ tests/unit/services/modelDataNormalization.test.ts (9)
  ✓ 模型数据规范化处理 (4)
    ✓ 应该正确处理 Gemini 字符串数组
    ✓ 应该正确处理 OpenRouter 对象数组
    ✓ 应该正确处理混合格式数组
    ✓ 应该处理非法数据（null, undefined, number）
  ✓ extractProvider 函数测试 (5)
    ✓ 应该正确提取 OpenRouter 提供商
    ✓ 应该正确提取 Gemini 提供商
    ✓ 应该处理没有斜杠的模型 ID
    ✓ 应该处理空字符串
    ✓ 应该处理非字符串类型

Test Files  1 passed (1)
Tests  9 passed (9)
```

## 修改文件清单

| 文件 | 修改类型 | 说明 |
|------|---------|------|
| `src/main.ts` | 🔧 修复 | 规范化模型数据处理逻辑 |
| `src/services/db/modelDataClient.ts` | 🔧 修复 | 添加类型检查和数据清理 |
| `src/stores/model.ts` | 🔧 修复 | 加固 Store 层类型安全 |
| `tests/unit/services/modelDataNormalization.test.ts` | ✨ 新增 | 全面的单元测试 |

## 影响范围

### ✅ 已修复的问题

1. **模型保存失败** - `modelId.split is not a function` 错误
2. **数据类型不一致** - Gemini vs OpenRouter 返回值差异
3. **元数据丢失** - OpenRouter 的完整模型信息现在被正确保留
4. **类型安全** - 多层防御确保 `id` 始终是字符串

### 📊 性能影响

- **无负面影响**：数据规范化开销可忽略不计（单次启动，小数据量）
- **代码健壮性提升**：多处类型检查增强稳定性

### 🔄 向后兼容性

- ✅ **完全兼容**：支持旧的字符串数组格式（Gemini）
- ✅ **完全兼容**：支持新的对象数组格式（OpenRouter）
- ✅ **自动迁移**：旧数据会自动规范化

## 后续建议

### 1. API 层统一规范 (可选)

考虑在 `aiChatService.js` 中统一返回格式，避免调用方处理两种格式：

```javascript
async listAvailableModels(appStore) {
  const models = await service.listAvailableModels(...)
  
  // 统一规范化为对象数组
  return models.map(item => 
    typeof item === 'string' 
      ? { id: item, name: item } 
      : item
  )
}
```

### 2. TypeScript 类型定义增强 (可选)

在 `types/store.ts` 中明确 `ModelData.id` 必须是 `string`：

```typescript
export interface ModelData {
  id: string  // 已经是 string，但可以添加 JSDoc 注释
  // ... 其他字段
}
```

### 3. 数据验证工具 (可选)

考虑使用 `zod` 或类似库在运行时验证数据结构：

```typescript
import { z } from 'zod'

const ModelDataSchema = z.object({
  id: z.string(),
  name: z.string().optional(),
  // ... 其他字段
})
```

## 总结

本次修复通过**三层防御**策略确保数据类型安全：

1. **数据源层** (`main.ts`): 规范化不同 Provider 的返回值
2. **服务层** (`modelDataClient.ts`): 类型检查和数据清理
3. **状态层** (`model.ts` Store): 最终类型保障

所有修改均有**完整的单元测试覆盖**，确保修复的正确性和稳定性。

---

**修复完成时间**: 2025年12月8日  
**影响范围**: 模型数据加载和持久化流程  
**测试状态**: ✅ 全部通过 (9/9)
