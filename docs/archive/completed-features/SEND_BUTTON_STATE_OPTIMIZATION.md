# 发送按钮状态优化实现

## 需求描述

优化消息发送流程的按钮状态控制：

1. **发送前**：用户点击发送按钮后，按钮应处于禁用状态，直到收到流式响应
2. **接收中**：流式响应开始后，显示停止按钮，用户可随时终止 AI 回复
3. **手动终止**：用户手动终止时，应作为警告而非错误，避免显示错误消息

## 实现方案

### 1. 状态机优化

#### 原有设计问题
- `generationStatus` 使用布尔值 (`isGenerating: boolean`)
- 无法区分"发送中等待响应"和"接收流式数据"两种状态
- 导致发送按钮在等待响应期间可能未正确禁用

#### 新设计
扩展 `generationStatus` 为三状态枚举：

```typescript
type GenerationStatus = 'idle' | 'sending' | 'receiving'
```

**状态流转**：
```
idle → (点击发送) → sending → (收到第一个chunk) → receiving → (完成/错误/终止) → idle
```

**按钮映射**：
- `idle`: 显示发送按钮（启用）
- `sending`: 显示加载按钮（禁用）
- `receiving`: 显示停止按钮（启用）

### 2. 代码修改详情

#### 2.1 Store 层修改 (`src/stores/conversation.ts`)

**修改点**：`setGenerationStatus` 方法

```typescript
// 修改前
const setGenerationStatus = (conversationId: string, isGenerating: boolean): boolean => {
  const conversation = conversationMap.value.get(conversationId)
  if (!conversation) return false
  conversation.isGenerating = isGenerating
  return true
}

// 修改后
const setGenerationStatus = (
  conversationId: string, 
  status: 'idle' | 'sending' | 'receiving' | boolean
): boolean => {
  const conversation = conversationMap.value.get(conversationId)
  if (!conversation) return false

  // 向后兼容：boolean 参数转换为状态字符串
  if (typeof status === 'boolean') {
    conversation.generationStatus = status ? 'sending' : 'idle'
    conversation.isGenerating = status
  } else {
    conversation.generationStatus = status
    conversation.isGenerating = status !== 'idle'
  }
  
  return true
}
```

**关键设计**：
- 保持向后兼容，允许传入 `boolean` 参数（自动转换）
- 同时更新 `generationStatus` 和 `isGenerating` 字段，确保数据一致性

#### 2.2 ChatView 组件修改 (`src/components/ChatView.vue`)

**修改点 1**：`prepareSendContext` - 设置初始状态为 'sending'

```typescript
// 修改前
conversationStore.setGenerationStatus(targetConversationId, true)

// 修改后
conversationStore.setGenerationStatus(targetConversationId, 'sending')
```

**修改点 2**：`processStreamResponse` - 收到第一个 chunk 后切换为 'receiving'

```typescript
// 修改前
if (!firstResult.done) {
  conversationStore.setGenerationStatus(targetConversationId, true)
  await processChunk(firstResult.value)
}

// 修改后
if (!firstResult.done) {
  // 更新状态为 'receiving'，表示开始接收流式数据（此时可以点击停止按钮）
  conversationStore.setGenerationStatus(targetConversationId, 'receiving')
  await processChunk(firstResult.value)
}
```

**修改点 3**：`handleSendError` - 优化手动终止处理

```typescript
// 新增日志，明确标记为警告级别
if (wasManualAbort) {
  console.log('ℹ️ [handleSendError] 用户手动中断回复（警告级别，非错误）')
  // ... 后续处理保持不变
}

// 修改注释，强调警告性质
// 用户手动中断作为警告处理，不算真正的错误，清除错误标记
conversationStore.setGenerationError(targetConversationId, null)
```

**修改点 4**：`cleanupAfterSend` - 清理时设置为 'idle'

```typescript
// 修改前
conversationStore.setGenerationStatus(targetConversationId, false)

// 修改后
conversationStore.setGenerationStatus(targetConversationId, 'idle')
```

**修改点 5**：`regenerateAtBranch` - 重新生成时同步状态流转

```typescript
// 发起请求前
conversationStore.setGenerationStatus(targetConversationId, 'sending')

// 收到第一个 chunk
if (!firstResult.done) {
  conversationStore.setGenerationStatus(targetConversationId, 'receiving')
  await processChunk(firstResult.value)
}

// 清理时
conversationStore.setGenerationStatus(targetConversationId, 'idle')
```

#### 2.3 Composable 修改 (`src/composables/useMessageSending.ts`)

虽然此 Composable 可能未被主要代码路径使用，但为保持一致性也进行了同步更新：

```typescript
// 发送时
conversationStore.setGenerationStatus(targetConversationId, 'sending')

// 收到第一个 chunk
conversationStore.setGenerationStatus(targetConversationId, 'receiving')

// 完成/错误/取消时
conversationStore.setGenerationStatus(targetConversationId, 'idle')
```

### 3. UI 行为变化

#### 模板中的按钮逻辑（已存在，无需修改）

```vue
<!-- 状态 1: idle - 显示发送按钮 -->
<button
  v-if="currentConversation?.generationStatus === 'idle'"
  @click="sendMessage"
  :disabled="条件判断"
  class="发送按钮样式"
>
  发送图标
</button>

<!-- 状态 2: sending - 显示加载中按钮（禁用） -->
<button
  v-else-if="currentConversation?.generationStatus === 'sending'"
  disabled
  class="加载按钮样式"
>
  旋转图标
</button>

<!-- 状态 3: receiving - 显示停止按钮 -->
<button
  v-else
  @click="stopGeneration"
  class="停止按钮样式"
>
  停止图标
</button>
```

**关键点**：
- 模板逻辑已完美支持三状态，无需修改
- `sending` 状态的按钮强制 `disabled`，确保不可点击
- `receiving` 状态的按钮可点击，调用 `stopGeneration`

### 4. 用户体验提升

#### 4.1 发送流程
1. 用户点击"发送"按钮
2. 按钮立即变为"加载中"状态（旋转图标，灰色，禁用）
3. 发送请求到 AI 服务
4. 收到第一个 token 后，按钮变为"停止"按钮（红色，可点击）
5. 用户可随时点击"停止"按钮终止响应

#### 4.2 终止处理
- **用户手动终止**：
  - 在消息末尾添加 "⏹️ 用户已手动中断回复。"
  - 不显示错误提示
  - 控制台输出 `ℹ️` 级别日志（信息/警告）
  
- **系统原因终止**（如切换标签页）：
  - 如消息为空，添加 "[已停止生成]"
  - 如有内容，不添加任何标记
  - 不显示错误提示

## 测试建议

### 手动测试场景

1. **正常发送流程**
   - 点击发送 → 观察按钮变为加载状态 → 收到响应后变为停止按钮 → 完成后变回发送按钮

2. **快速点击测试**
   - 连续快速点击发送按钮，验证第二次点击被正确阻止

3. **手动终止测试**
   - 发送消息 → 等待流式响应开始 → 点击停止按钮
   - 验证：消息末尾有"⏹️ 用户已手动中断回复。"
   - 验证：不显示错误提示
   - 验证：按钮恢复为发送状态

4. **网络慢速测试**
   - 模拟慢速网络（Chrome DevTools Network Throttling）
   - 验证在等待响应期间（sending 状态）按钮保持禁用

5. **标签页切换测试**
   - 发送消息 → 切换标签页 → 切回
   - 验证状态恢复正确

## 技术亮点

### 1. 向后兼容设计
- `setGenerationStatus` 支持传入 `boolean` 参数
- 避免大范围修改旧代码，降低引入 bug 的风险

### 2. 状态固化模式
- 在异步操作开始时立即捕获 `conversationId`
- 防止标签页快速切换导致的状态混乱

### 3. 状态转换原子性
- 同时更新 `generationStatus` 和 `isGenerating`
- 确保数据一致性，避免中间态

### 4. 日志级别区分
- 手动终止输出 `ℹ️` 级别日志
- 真实错误输出 `❌` 级别日志
- 方便调试和问题定位

## 相关文件

- `src/stores/conversation.ts` - Store 层状态管理
- `src/components/ChatView.vue` - 主聊天视图组件
- `src/composables/useMessageSending.ts` - 消息发送 Composable
- `src/types/store.ts` - 类型定义
- `src/types/chat.ts` - 聊天相关类型

## 提交信息建议

```
feat: 优化发送按钮状态控制，支持三状态流转

- 扩展 generationStatus 为 'idle' | 'sending' | 'receiving'
- 发送中按钮禁用，等待首个 chunk 后才允许停止
- 手动终止作为警告处理，避免显示错误消息
- 保持向后兼容，支持 boolean 参数自动转换

Fixes: #用户反馈的issue号
```

## 后续优化建议

1. **性能监控**
   - 统计 sending → receiving 的平均时延（TTFT - Time To First Token）
   - 用于评估不同 Provider 的响应速度

2. **可访问性增强**
   - 为屏幕阅读器添加 ARIA 属性，实时播报状态变化
   - 例如：`aria-label="正在发送消息"` / `aria-label="正在接收回复"` / `aria-label="停止生成"`

3. **视觉反馈优化**
   - 考虑在 sending 状态添加进度条或脉冲动画
   - 在 receiving 状态添加打字机效果的视觉提示

4. **错误恢复机制**
   - 如果长时间处于 sending 状态（如超过 30 秒），自动转为 idle 并提示超时
   - 避免用户卡在"发送中"状态无法操作

---

**文档版本**: 1.0  
**创建日期**: 2025-11-29  
**作者**: GitHub Copilot  
**关联需求**: 发送按钮状态优化
