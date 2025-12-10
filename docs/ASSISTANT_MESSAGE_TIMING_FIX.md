# Assistant 消息创建时机修正实施报告

## 实施日期
2025年12月9日

## 变更概述
修正 assistant 消息的创建时机，确保用户在延时结束后立即能看到：用户消息 + 系统消息 + 空 assistant 占位符。

## 核心变更

### 1. 状态名称统一：`connecting` → `requesting`
**文件**: `src/composables/useMessageSending.ts`

- **接口定义**（第 89-101 行）：
  ```typescript
  phase: 'delay' | 'requesting' | 'streaming' | 'completed' | 'cancelled' | 'failed'
  ```
  注释明确语义："已发出 HTTP 请求，尚未收到首个 token（等待响应）"

- **变更原因**: 
  - 保持状态命名一致性
  - 避免混用 `connecting` 和 `requesting` 造成理解困难

### 2. 添加 `assistantMessageId` 字段
**文件**: `src/composables/useMessageSending.ts`（第 105 行）

```typescript
interface PendingSendContext {
  // ... 其他字段
  assistantMessageId?: string  // 延时结束后创建的空 assistant 消息 ID
}
```

### 3. `finishPendingSend` 创建 assistant 占位符
**文件**: `src/composables/useMessageSending.ts`（第 783-795 行）

**修改前**:
```typescript
ctx.state = 'sent'
ctx.phase = 'connecting'
ctx.timings.httpRequestStartedAt = Date.now()
// ... 然后调用 sendMessageCore
```

**修改后**:
```typescript
ctx.state = 'sent'

// 清理延时定时器
if (ctx.timerId != null) {
  clearTimeout(ctx.timerId)
  ctx.timerId = null
}

// ⭐ 创建空的 assistant 消息占位符（延时结束后立即可见）
console.log('[useMessageSending] 创建 assistant 消息占位符')
const assistantMessageId = branchStore.addMessageBranch(
  ctx.conversationId,
  'assistant',
  [{ type: 'text', text: '' }]
)
ctx.assistantMessageId = assistantMessageId
console.log('[useMessageSending] ✅ assistant 占位符已创建:', assistantMessageId)

// ⭐ 阶段转换：delay -> requesting
ctx.phase = 'requesting'
ctx.timings.httpRequestStartedAt = Date.now()

branchStore.updateNoticeMessageText(ctx.conversationId, ctx.noticeMessageId, '消息已发送，等待流式回复……')

// 传入已创建的 assistant ID
const sendPromise = sendMessageCore({
  conversationId: ctx.conversationId,
  userMessageId: ctx.userMessageId,
  assistantMessageId,  // ⭐ 新增参数
  payloadSnapshot: ctx.payloadSnapshot,
  requestOptions: ctx.requestOptions
})
```

### 4. `sendMessageCore` 接受 `assistantMessageId` 参数
**文件**: `src/composables/useMessageSending.ts`（第 339-346 行）

**修改前**:
```typescript
async function sendMessageCore(
  options: {
    conversationId: string
    userMessageId: string
    payloadSnapshot: SendMessagePayload
    requestOptions: SendRequestOptions
  }
): Promise<{ success: boolean; error?: string }>
```

**修改后**:
```typescript
async function sendMessageCore(
  options: {
    conversationId: string
    userMessageId: string
    assistantMessageId: string  // ⭐ 新增：由 finishPendingSend 创建并传入
    payloadSnapshot: SendMessagePayload
    requestOptions: SendRequestOptions
  }
): Promise<{ success: boolean; error?: string }>
```

### 5. 移除 `sendMessageCore` 中的重复创建逻辑
**文件**: `src/composables/useMessageSending.ts`（第 428-435 行）

**修改前**:
```typescript
// 创建 AI 消息分支（占位符，准备接收流式响应）
console.log(`[useMessageSending] 创建 AI 消息分支 [${callId}]`)
const aiBranchId = branchStore.addMessageBranch(
  targetConversationId,
  'assistant',
  [{ type: 'text', text: '' }]
)
console.log(`[useMessageSending] AI 分支已创建 [${callId}]: ${aiBranchId}`)
```

**修改后**:
```typescript
// ⭐ 使用已创建的 assistant 消息 ID（由 finishPendingSend 创建）
const aiBranchId = options.assistantMessageId
console.log(`[useMessageSending] 使用已创建的 assistant 消息 [${callId}]: ${aiBranchId}`)
```

## 验证结果

### 测试通过情况
✅ **`useMessageSending.phaseStateMachine.test.ts`**: 12/12 测试全部通过

关键测试覆盖：
1. ✅ 延时期间处于 `delay` 阶段
2. ✅ 延时结束后转换到 `requesting` 阶段
3. ✅ 在 `requesting` 阶段拒绝撤回
4. ✅ Requesting 阶段中止（创建空消息壳并标记可重试）
5. ✅ Streaming 阶段中止（保留已生成内容）
6. ✅ 原子性与竞态条件保护
7. ✅ 边界条件处理（零延时、空消息、定时器清理）

### 日志验证
从测试输出可见核心流程正确：

```
[useMessageSending] 创建 assistant 消息占位符
[useMessageSending] ✅ assistant 占位符已创建: branch-1765295080922
[useMessageSending] 🚀 准备调用 sendMessageCore {
  conversationId: 'test-conversation',
  userMessageId: 'branch-1765295077922',
  assistantMessageId: 'branch-1765295080922',  // ⭐ 已传入
  ...
}
[useMessageSending] 使用已创建的 assistant 消息 [send-...]: branch-1765295080922
[useMessageSending] 📍 阶段转换: requesting -> streaming  // ⭐ 首 chunk 到达
```

## UX 改进

### 修改前
- 延时结束 → HTTP 请求发出 → **首 chunk 到达** → 创建 assistant 消息
- 用户在 requesting 阶段看不到 assistant 占位符

### 修改后
- 延时结束 → **立即创建空 assistant 占位符** → HTTP 请求发出 → 首 chunk 到达 → 追加内容
- 用户在 requesting 阶段就能看到完整历史：
  - ✅ 用户消息
  - ✅ 系统提示消息（"消息已发送，等待流式回复……"）
  - ✅ 空 assistant 回复占位符

## 架构对齐

本次修改完全符合之前讨论的状态机设计原则：

1. **保持 7 状态设计**：未修改 enum，只调整了行为实现
2. **明确阶段职责**：
   - `delay`: 只能【撤销】
   - `requesting`/`streaming`: 只能【中止】
3. **历史一致性**：assistant 消息在 requesting 阶段就存在，避免流式过程中"突然出现"

## 后续建议

### 手动验收清单
- [ ] 设置 `sendDelayMs = 3000`
- [ ] 发送消息，观察倒计时结束瞬间：
  - [ ] 用户消息已存在 ✓
  - [ ] 系统提示消息显示"消息已发送，等待流式回复……" ✓
  - [ ] **空 assistant 消息占位符可见** ✓（核心验收点）
- [ ] 在 requesting 阶段点击中止：
  - [ ] 空 assistant 消息保留 ✓
  - [ ] 标记为可重试 ✓
- [ ] 在 streaming 阶段点击中止：
  - [ ] 已生成内容保留 ✓
  - [ ] 标记为已中止 ✓

### 潜在优化点
1. **UI 反馈增强**：
   - 可考虑为空 assistant 占位符添加"等待中"动画
   - requesting 阶段显示网络请求指示器

2. **性能监控**：
   - 利用 `SendTiming` 接口收集 TTFB 数据
   - 分析 requesting 阶段平均耗时

3. **错误处理**：
   - 如果 requesting 超时，确保空 assistant 消息有明确的错误标记

## 文件变更清单
- ✅ `src/composables/useMessageSending.ts`（1275 行，核心修改）
- ✅ `tests/unit/composables/useMessageSending.phaseStateMachine.test.ts`（无需修改，现有测试全部通过）

## 结论
✅ **修改已完成并通过测试**

本次实施成功将 assistant 消息创建时机前移至 `finishPendingSend`，满足了以下关键需求：
1. 延时结束后用户立即看到完整对话历史
2. requesting 阶段只能中止，不能撤回
3. 避免重复创建 assistant 消息
4. 代码逻辑清晰，状态转换明确

修改范围控制在合理粒度内，对现有架构无破坏性影响。
