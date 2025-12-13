# 修复：Assistant 消息空白期显示问题

## 问题描述

**现象**: 用户感知流式回复开始时未能创建 Assistant 消息，直到流式完成才显示完整内容

**根本原因**: Assistant 消息实际已创建，但在首个 chunk 到达前（可能长达 10-30 秒）内容为空字符串，UI 渲染为空白

## 技术分析

### 时间线（来自日志 2025-12-12）

| 时间戳 | 事件 | 状态 |
|--------|------|------|
| 1765475743793 | 创建 Assistant 消息 | `parts: [{ type: 'text', text: '' }]` |
| 1765475744370 | SSE 连接建立 | 开始接收数据流 |
| 1765475757281 | 收到首个 chunk | **延迟 13.5秒** |

### 代码位置

1. **消息创建**（useMessageSending.ts:583-590）:
```typescript
const aiBranchId = branchStore.addMessageBranch(
  targetConversationId,
  'assistant',
  [{ type: 'text', text: '' }],  // ⚠️ 初始为空字符串
  userBranchId
)
```

2. **UI 渲染**（ChatMessageItem.vue:666-676）:
```vue
<!-- 条件满足：parts.length > 0 -->
<div v-if="parts && parts.length > 0" class="space-y-2">
  <div v-if="part.type === 'text'">
    <p v-if="isStreaming && partIndex === parts.length - 1">
      {{ part.text }}  <!-- 空字符串渲染为空白 -->
    </p>
  </div>
</div>
```

### 为什么有延迟？

SSE 日志显示大量 `OPENROUTER PROCESSING` 注释行（1765475744370-1765475757281）:
- 服务器端处理时间（模型推理）
- 网络传输延迟
- 提供商队列等待时间

## 解决方案

### 方案 A：占位符显示（推荐）

**优势**: 用户明确知道正在生成，体验最优

**实现位置**: ChatMessageItem.vue

```vue
<!-- 多模态内容渲染 -->
<div v-if="parts && parts.length > 0" class="space-y-2">
  <template v-for="(part, partIndex) in parts" :key="getPartKey(part, partIndex)">
    <div v-if="part.type === 'text'">
      <!-- ⭐ 新增：空内容且流式中，显示加载占位符 -->
      <div
        v-if="isStreaming && !part.text && partIndex === parts.length - 1"
        class="flex items-center gap-2 text-gray-400"
      >
        <div class="flex gap-1">
          <span class="w-2 h-2 bg-gray-400 rounded-full animate-pulse" style="animation-delay: 0ms"></span>
          <span class="w-2 h-2 bg-gray-400 rounded-full animate-pulse" style="animation-delay: 200ms"></span>
          <span class="w-2 h-2 bg-gray-400 rounded-full animate-pulse" style="animation-delay: 400ms"></span>
        </div>
        <span class="text-sm">正在生成...</span>
      </div>
      
      <!-- 流式传输中：纯文本 -->
      <p
        v-else-if="isStreaming && partIndex === parts.length - 1"
        class="text-sm whitespace-pre-wrap"
      >
        {{ part.text }}
      </p>
      
      <!-- ... 其他渲染逻辑 ... -->
    </div>
  </template>
</div>
```

### 方案 B：延迟创建消息

**风险**: 需要重构消息生命周期，可能引入新 bug

**修改位置**: useMessageSending.ts

```typescript
// ❌ 旧逻辑：提前创建空消息
const aiBranchId = branchStore.addMessageBranch(
  targetConversationId,
  'assistant',
  [{ type: 'text', text: '' }],
  userBranchId
)

// ✅ 新逻辑：收到首个 chunk 时才创建
let aiBranchId: string | null = null

for await (const chunk of stream) {
  if (!aiBranchId && chunk.type === 'text') {
    // 首次创建，带首个 chunk 内容
    aiBranchId = branchStore.addMessageBranch(
      targetConversationId,
      'assistant',
      [{ type: 'text', text: chunk.content }],
      userBranchId
    )
  } else if (aiBranchId) {
    appendToken(chunk.content)
  }
}
```

**缺点**: 
- 需要处理 `aiBranchId` 可能为 `null` 的情况
- 错误处理逻辑需要调整（已创建消息的回滚）
- 取消/中止功能需要特殊处理

### 方案 C：混合策略

1. **正常情况**（< 3秒）: 保持现状
2. **长延迟**（≥ 3秒）: 自动显示占位符

```vue
<script setup lang="ts">
const showPlaceholder = ref(false)
let placeholderTimer: number | null = null

watch(() => isStreaming.value, (streaming) => {
  if (streaming && !parts.value[0]?.text) {
    // 3秒后显示占位符
    placeholderTimer = window.setTimeout(() => {
      showPlaceholder.value = true
    }, 3000)
  } else {
    if (placeholderTimer) clearTimeout(placeholderTimer)
    showPlaceholder.value = false
  }
})
</script>

<template>
  <div v-if="isStreaming && (!part.text || showPlaceholder)">
    <div class="animate-pulse">正在等待服务器响应...</div>
  </div>
</template>
```

## 推荐实施

**阶段 1** (立即): 实施方案 A（占位符显示）
- 改动最小，风险低
- 立即改善用户体验
- 代码变更：仅 ChatMessageItem.vue

**阶段 2** (可选优化): 考虑方案 C
- 避免在快速响应时显示无意义的占位符
- 更智能的 UX

**不推荐**: 方案 B
- 架构变更过大
- 已有的错误处理/中止逻辑依赖消息预创建
- 测试成本高

## 测试要点

### 场景 1: 快速响应（< 1秒）
- [ ] 占位符不应闪烁显示
- [ ] 流式文本正常追加

### 场景 2: 慢速响应（10-30秒）
- [ ] 占位符在适当时机显示
- [ ] 首个 chunk 到达后占位符消失
- [ ] 流式文本正常追加

### 场景 3: 用户中止
- [ ] 占位符消失
- [ ] 显示中止提示（isEmptyRetryableMessage）

### 场景 4: 网络错误
- [ ] 占位符消失
- [ ] 显示错误提示

## 相关文件

- `src/composables/useMessageSending.ts` - 消息发送逻辑
- `src/components/chat/ChatMessageItem.vue` - 消息渲染
- `src/stores/branch.ts` - 分支树状态管理

## 附录：完整日志片段

```
[useMessageSending] ✅ 创建 assistant 消息 [send-1765475743792-o66zw0q1i]: 0ae1a227-d8c3-4af4-866f-c19710e6bcf0
  timestamp: 1765475743793

[OpenRouterService] ✅ fetch 返回响应 {status: 200}
  timestamp: 1765475744370
  elapsed: 575ms

[OpenRouterService][DEBUG] 📥 SSE 解析结果 {line: ': OPENROUTER PROCESSING'}
  (持续 13秒...)

[useMessageSending] ✅ 收到首个 chunk
  timestamp: 1765475757281
  延迟: 13.5秒
```
