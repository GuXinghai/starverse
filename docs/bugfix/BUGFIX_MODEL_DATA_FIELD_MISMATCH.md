# 模型数据字段不匹配问题修复（2025-12-10）

## 问题描述

**症状**：
- 从 OpenRouter API 成功获取 340 个模型
- 但保存到数据库时，模型数量变为 **0 个**
- 日志显示：
  ```
  aiChatService: 模型数量 340
  [model.ts] 💾 开始保存模型列表 {count: 0, sample: undefined}
  ```

**根本原因**：
`OpenRouterService.listAvailableModels()` 只返回**模型 ID 字符串数组**，而不是完整的模型对象：

```typescript
// ❌ 旧实现（只返回 ID）
return data.data.map((model: any) => model.id)
// 返回: ['openai/gpt-4', 'anthropic/claude-3', ...]
```

但在 `main.ts` 中，代码尝试访问 `item.context_length`, `item.pricing` 等字段，这些字段在字符串类型上根本不存在，导致：
- 过滤条件 `.filter((item: any) => item && item.id)` 失败（字符串没有 `.id` 属性）
- 所有模型被过滤掉 → 空数组 → 保存 0 个模型

### 数据流追踪（问题版本）

```
OpenRouter API
  ↓ 返回 [{id: 'openai/gpt-4', context_length: 128000, ...}, ...]
OpenRouterService.listAvailableModels
  ↓ 提取 ID: ['openai/gpt-4', 'anthropic/claude-3', ...]
main.ts (映射)
  ↓ 尝试访问 item.id (undefined，因为 item 是字符串)
  ↓ 过滤条件失败 → 所有项被过滤
  ↓ 结果: []
ModelData 类型
  ↓ 空数组
数据库
  ↓ 保存 0 个模型
```

## 修复方案

### 1. 修复 `OpenRouterService.listAvailableModels`（返回完整对象）

**修改前**：
```typescript
async listAvailableModels(apiKey: string, baseUrl?: string): Promise<string[]> {
  const data = await response.json()
  return data.data.map((model: any) => model.id)  // ❌ 只返回 ID
}
```

**修改后**：
```typescript
async listAvailableModels(apiKey: string, baseUrl?: string): Promise<any[]> {
  const data = await response.json()
  return data.data  // ✅ 返回完整对象数组
}
```

### 2. 修复 `main.ts` 数据映射（处理字符串和对象）

**修改前**：
```typescript
const models = (Array.isArray(modelData) ? modelData : [])
  .filter((item: any) => item && item.id)  // ❌ 字符串没有 .id
  .map((item: any) => ({
    id: String(item.id),  // ❌ undefined
    context_length: item.context_length,  // ❌ undefined
    // ...
  }))
```

**修改后**：
```typescript
const models = (Array.isArray(modelData) ? modelData : [])
  .filter((item: any) => item && (typeof item === 'string' || item.id))
  .map((item: any) => {
    // ✅ 处理字符串（Gemini）
    if (typeof item === 'string') {
      return {
        id: item,
        name: item,
        // ... 其他字段为 undefined
      }
    }
    
    // ✅ 处理对象（OpenRouter）
    return {
      id: String(item.id),
      name: item.name || String(item.id),
      context_length: item.context_length,
      max_output_tokens: item.max_output_tokens,
      pricing: item.pricing,
      architecture: item.architecture,
      input_modalities: item.input_modalities,
      output_modalities: item.output_modalities,
      supportsVision: item.input_modalities?.includes('image'),
      supportsImageOutput: item.output_modalities?.includes('image'),
      supportsReasoning: item.architecture?.reasoning === true
    }
  })
```

### 3. 同步更新 `ModelData` 类型定义

**修改前**：
```typescript
export interface ModelData {
  id: string
  name?: string
  contextWindow?: number       // ❌ 错误
  maxOutputTokens?: number     // ❌ 错误
  // ...
}
```

**修改后**：
```typescript
export interface ModelData {
  id: string
  name?: string
  context_length?: number      // ✅ 正确：匹配 OpenRouter API
  max_output_tokens?: number   // ✅ 正确：匹配 OpenRouter API
  
  architecture?: {             // ✅ 新增：架构信息
    modality?: string
    tokenizer?: string
    instruct_type?: string | null
    reasoning?: boolean
  }
  input_modalities?: string[]  // ✅ 新增：输入模态
  output_modalities?: string[] // ✅ 新增：输出模态
  
  // 辅助字段（用于前端显示）
  supportsVision?: boolean
  supportsImageOutput?: boolean
  supportsReasoning?: boolean
  // ...
}
```

### 3. 同步更新 `ModelData` 类型定义

**修改前**：
```typescript
export interface ModelData {
  id: string
  name?: string
  contextWindow?: number       // ❌ 错误
  maxOutputTokens?: number     // ❌ 错误
  // ...
}
```

**修改后**：
```typescript
export interface ModelData {
  id: string
  name?: string
  context_length?: number      // ✅ 正确：匹配 OpenRouter API
  max_output_tokens?: number   // ✅ 正确：匹配 OpenRouter API
  
  architecture?: {             // ✅ 新增：架构信息
    modality?: string
    tokenizer?: string
    instruct_type?: string | null
    reasoning?: boolean
  }
  input_modalities?: string[]  // ✅ 新增：输入模态
  output_modalities?: string[] // ✅ 新增：输出模态
  
  // 辅助字段（用于前端显示）
  supportsVision?: boolean
  supportsImageOutput?: boolean
  supportsReasoning?: boolean
  // ...
}
```

### 4. 更新测试文件

- ✅ `tests/unit/services/modelDataClient.test.ts` - 已更新
- ✅ `tests/unit/services/modelDataNormalization.test.ts` - 已更新

所有测试通过，验证修复正确性。

## 设计原则

### 为什么 OpenRouterService 需要返回完整对象？

**原因**：
1. **减少 API 调用**：一次请求获取所有模型信息，避免后续逐个查询
2. **数据完整性**：保留 `context_length`, `pricing`, `architecture` 等关键字段
3. **前端能力判断**：`supportsVision`, `supportsImageOutput` 等需要完整数据计算

### 为什么使用下划线命名？

1. **API 一致性**：OpenRouter API 使用下划线命名 (`context_length`)
2. **数据库一致性**：SQLite 表结构使用驼峰命名，但仅在 Repository 层转换
3. **减少转换**：避免多次字段名转换，降低出错概率

### 数据流简化（修复后）

```
OpenRouter API
  ↓ {id, name, context_length, pricing, ...}
OpenRouterService
  ↓ 返回完整对象数组
main.ts
  ↓ 直接映射字段（类型判断处理字符串/对象）
ModelData
  ↓ {id, name, context_length, ...}
modelDataClient
  ↓ contextLength: model.context_length (数据库层转换)
SQLite
  ↓ contextLength 列
```

## 验证清单

- [x] `OpenRouterService.listAvailableModels` 返回完整对象数组
- [x] `aiChatService.listAvailableModels` 注释更新
- [x] `main.ts` 数据映射同时支持字符串和对象
- [x] `main.ts` 添加调试日志以追踪数据转换
- [x] `ModelData` 类型定义使用下划线命名
- [x] `modelDataClient.ts` 正确映射字段到数据库
- [x] 测试文件已同步更新（字段名修正）
- [x] 无生产代码使用旧字段名（已通过 `grep_search` 验证）
- [x] 单元测试全部通过

## 影响范围

**修改文件**：
- `src/services/providers/OpenRouterService.ts` - ⭐ 核心修复：返回完整对象
- `src/services/aiChatService.js` - 更新注释
- `src/main.ts` - 数据映射逻辑（增强版本）
- `src/types/store.ts` - 类型定义
- `tests/unit/services/modelDataClient.test.ts` - 测试文件
- `tests/unit/services/modelDataNormalization.test.ts` - 测试文件

**影响功能**：
- ✅ OpenRouter 模型列表加载（主要修复）
- ✅ Gemini 模型列表加载（向后兼容）
- ✅ 模型数据数据库持久化
- ✅ 模型搜索和筛选（依赖数据库数据）
- ✅ 模型能力表构建（依赖完整模型信息）
- ✅ 模型参数批量获取（依赖完整模型信息）

## 回归测试建议

**手动测试步骤**：
1. 清空应用数据 (`clear-all-data.bat`)
2. 重新启动应用
3. 等待 OpenRouter 模型列表加载
4. 验证控制台日志：
   - `✓ 模型列表加载成功: 340 个模型` (或其他数字)
   - `✅ 可用模型列表已保存到数据库: 340 个模型`
5. 打开模型选择器，验证模型列表显示正常
6. 搜索模型（如 "gpt-4"），验证搜索功能正常

**自动化测试**：
```bash
npm run test -- tests/unit/services/modelDataClient.test.ts
npm run test -- tests/unit/services/modelDataNormalization.test.ts
```

## 相关文档

- `README.md` - 项目架构说明
- `docs/ARCHITECTURE_REVIEW.md` - 三层架构详解
- `docs/MODEL_PERSISTENCE_MIGRATION.md` - 模型持久化迁移指南
- `infra/db/schema.sql` - 数据库 Schema

---

**修复时间**：2025-12-10  
**修复人**：AI Assistant  
**问题等级**：🔴 Critical（导致核心功能失效）  
**修复耗时**：~30 分钟
