# 推理挡位扩展为4档

> **⚠️ 历史文档警告**：本文档中提到的 `ChatInputArea.vue` 组件已于 2025-12-06 归档。  
> 现已被 `ModernChatInput.vue` 完全替代。

## 概述

本次更新将推理控制（Reasoning Control）从3档扩展到4档，增加了 **minimal（极简）** 档位，提供更细粒度的推理成本控制。

## 更新内容

### 推理挡位定义（4档）

| 挡位 | 英文标识 | 中文名称 | 计算资源占比 | 适用场景 |
|------|----------|----------|--------------|----------|
| minimal | `'minimal'` | 极简 | ~10% | 基本推理，计算量极小，适合简单查询 |
| low | `'low'` | 低 | ~20% | 对简单问题进行简单的推理 |
| medium | `'medium'` | 中 | ~50% | 中等复杂程度的平衡推理（默认） |
| high | `'high'` | 高 | ~80% | 对复杂问题进行深度推理 |

**特殊值**: `'none'` - 完全禁用推理

### 类型系统更新

#### 核心类型 (`src/types/reasoning.ts`)

```typescript
/**
 * OpenRouter 官方 reasoning effort 档位（4个推理挡位 + 禁用）
 */
export type ReasoningEffort = 'minimal' | 'low' | 'medium' | 'high' | 'none';
```

#### 推理模式 (`src/types/chat.ts`)

```typescript
/**
 * 推理模式（Reasoning Mode）
 * 用于区分预设挡位和自定义MAX_TOKENS，确保两者互斥（4档位）
 */
export type ReasoningMode = 'minimal' | 'low' | 'medium' | 'high' | 'custom';
```

#### 推理层级 (`src/composables/useReasoningTiers.ts`)

```typescript
export type ReasoningTier = 'off' | 'minimal' | 'low' | 'medium' | 'high' | 'custom';

const BUDGET_PRESETS = {
  minimal: 1000,  // 新增
  low: 2000,
  medium: 8000,
  high: 16000,
};
```

### UI 组件更新

#### ReasoningControls.vue

**按钮布局**:
```vue
<!-- 4个推理挡位按钮（横向排列） -->
<div class="grid grid-cols-4 gap-2 mb-3">
  <button>极简</button>
  <button>低</button>
  <button>中</button>
  <button>高</button>
</div>

<!-- 关闭推理按钮（单独一行，右对齐） -->
<div class="flex justify-end mb-3">
  <button>关闭推理</button>
</div>
```

**档位标签映射**:
```typescript
const tierLabel = computed(() => {
  const map: Record<ReasoningTier, string> = {
    off: '关闭',
    minimal: '极简',  // 新增
    low: '低',
    medium: '中',
    high: '高',
    custom: '自定义',
  }
  return map[tier.value]
})
```

#### Event Emits 更新

**ChatInputArea.vue & ChatToolbar.vue**:
```typescript
// 旧: 'select-reasoning-effort': [effort: 'low' | 'medium' | 'high']
// 新: 'select-reasoning-effort': [effort: 'minimal' | 'low' | 'medium' | 'high']
```

### 业务逻辑更新

#### useReasoningTiers.ts

**档位识别逻辑**:
```typescript
const resolvedTier = computed<ReasoningTier>(() => {
  // ... 省略前置检查
  
  // 支持预算模型：根据 token 数量识别档位
  if (supportsBudget.value && typeof preference.value.maxTokens === 'number') {
    const val = preference.value.maxTokens
    if (val === BUDGET_PRESETS.minimal) return 'minimal'  // 新增
    if (val === BUDGET_PRESETS.low) return 'low'
    if (val === BUDGET_PRESETS.medium) return 'medium'
    if (val === BUDGET_PRESETS.high) return 'high'
    return 'custom'
  }
  
  // 支持 effort 模型：直接映射
  const effort = preference.value.effort
  if (effort === 'minimal') return 'minimal'  // 新增
  if (effort === 'low') return 'low'
  if (effort === 'high') return 'high'
  if (effort === 'medium') return 'medium'
  return 'custom'
})
```

**档位选择逻辑**:
```typescript
const selectTier = (tier: ReasoningTier) => {
  // ... 省略前置检查
  
  if (supportsBudget.value) {
    // 预算模型：映射到 token 数量
    const value =
      tier === 'minimal' ? BUDGET_PRESETS.minimal :  // 新增
      tier === 'low' ? BUDGET_PRESETS.low :
      tier === 'high' ? BUDGET_PRESETS.high :
      BUDGET_PRESETS.medium
    // ...
  } else {
    // Effort 模型：直接映射 effort 值
    const effort =
      tier === 'minimal' ? 'minimal' :  // 新增
      tier === 'low' ? 'low' :
      tier === 'high' ? 'high' :
      'medium'
    // ...
  }
}
```

## 默认值

- **默认推理档位**: `medium`（保持不变）
- **minimal 预算**: 1000 tokens
- **显示优先级**: minimal > low > medium > high（从左到右）

## 向后兼容性

✅ **完全兼容**: 
- 现有对话的 `low` / `medium` / `high` 配置无需迁移
- 默认值保持为 `medium`，不影响现有用户体验
- 类型系统扩展而非替换，所有现有代码继续有效

## 涉及文件清单

### 核心类型
- `src/types/reasoning.ts` - ReasoningEffort 类型及文档
- `src/types/chat.ts` - ReasoningMode 类型
- `src/types/generation.ts` - 无需修改（自动继承 ReasoningEffort）

### Composables
- `src/composables/useReasoningTiers.ts` - 档位逻辑核心

### UI 组件
- `src/components/chat/controls/ReasoningControls.vue` - 推理控制 UI
- `src/components/chat/input/ChatInputArea.vue` - 事件类型
- `src/components/chat/input/ChatToolbar.vue` - 事件类型

### 测试
- `tests/unit/types/compat/generation-legacy.spec.ts` - 无需修改（测试已覆盖）

## 测试建议

1. **UI 测试**:
   - 验证4个推理档位按钮正确显示
   - 点击 `极简` 按钮，确认档位切换为 `minimal`
   - 验证 `极简` 标签在工具栏正确显示

2. **功能测试**:
   - 选择 `minimal` 档位发送消息，验证 AI 响应
   - 切换不同档位，观察推理质量差异
   - 验证 `minimal` 预算（1000 tokens）在预算模型中正确应用

3. **持久化测试**:
   - 设置 `minimal` 档位，刷新页面，验证配置保持
   - 创建新对话，验证默认值仍为 `medium`

## 性能优化建议

**成本控制**:
- 对于简单查询（如定义、翻译），推荐使用 `minimal` 档位
- 对于代码生成、数学问题，推荐使用 `medium` 或 `high` 档位
- 根据模型响应质量动态调整档位

**UI 引导**:
- 考虑在首次使用时提示4档位的区别
- 在档位选择器中添加 tooltip 说明各档位适用场景

## 未来扩展

1. **智能档位推荐**: 根据用户输入内容（长度、复杂度、关键词）自动推荐合适档位
2. **档位历史分析**: 统计不同档位的使用频率和响应质量，优化默认配置
3. **模型差异化**: 为不同模型系列提供差异化的档位建议（如 o1 系列 vs Claude）

## 参考文档

- OpenRouter Reasoning API: https://openrouter.ai/docs/guides/best-practices/reasoning-tokens
- 项目架构文档: `docs/ARCHITECTURE_REVIEW.md`
- 推理统一类型: `src/types/reasoning.ts`

---

**更新日期**: 2025年12月3日  
**版本**: v1.0  
**影响范围**: 推理控制模块（类型系统 + UI + 业务逻辑）
