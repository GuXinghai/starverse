# 修复：消息重复发送问题

## ✅ 问题已解决

**日期**: 2025年12月3日  
**类型**: 时序竞态导致的逻辑重复  
**影响**: 用户发送一次消息，AI 收到两次相同内容

---

## 问题根源

在 `useMessageSending.ts` 中，消息发送流程存在缺陷：

```typescript
// ❌ 错误流程
1. 创建用户消息分支 → 添加到对话树
2. 创建 AI 消息分支（空）
3. 获取 displayMessages（包含刚创建的用户和AI消息）
4. slice(0, -1) 只移除最后的AI消息
5. 将包含用户消息的历史传给 API
6. API 层再次添加 userMessage 参数
7. 结果：用户消息被发送两次 ❌
```

**核心问题**：在构建 API 请求历史时，刚创建的用户消息被错误地包含在内。

---

## 修复方案

### 代码修改

**文件**: `src/composables/useMessageSending.ts` (第 261-275 行)

```typescript
// ✅ 修复前
const displayMessages = branchStore.getDisplayMessages(targetConversationId)
const historyWithoutLastAI = displayMessages.slice(0, -1) // 只移除 AI

// ✅ 修复后
const displayMessages = branchStore.getDisplayMessages(targetConversationId)
const historyWithoutNewMessages = displayMessages.slice(0, -2) // 移除用户+AI

console.log(`[useMessageSending] 构建历史消息 [${callId}]`, {
  totalMessages: displayMessages.length,
  historyLength: historyWithoutNewMessages.length,
  removedMessages: '最后2条（用户+AI）'
})
```

### 修复逻辑

**关键点**: 移除最后 **2** 条消息（用户 + AI），而不是只移除 1 条（AI）

```typescript
// ✅ 正确流程
1. 创建用户消息分支 → 添加到对话树
2. 创建 AI 消息分支（空）
3. 获取 displayMessages（包含刚创建的 2 条消息）
4. slice(0, -2) 移除最后的用户和AI消息
5. 将不包含新消息的历史传给 API
6. API 层添加 userMessage 参数（唯一的用户消息）
7. 结果：用户消息只发送一次 ✅
```

---

## 验证测试

### 测试场景 1: 新对话
```
操作: 新对话中发送 "Hello"
预期:
  - displayMessages.length = 2
  - historyWithoutNewMessages.length = 0
  - AI 收到 1 条消息
```

### 测试场景 2: 有历史
```
操作: 已有 2 轮对话（4条消息）后发送新消息
预期:
  - cleanHistorySnapshot.length = 4 （快照不包含新消息）
  - AI 收到 4 条历史 + 1 条新消息
```

### 测试场景 3: 重新生成
```
操作: 点击重新生成按钮
预期: 不会重复发送用户消息（useMessageRetry.ts 传递空 userMessage）
```

---

## 修复方案：快照模式（Snapshot Pattern）

### 核心原则

采用"先读后写"的快照模式，严格遵守因果律：

```typescript
// ✅ 快照模式流程
1. 📸 读取历史快照   → 纯净的历史状态（修改前）
2. ✍️  写入(User)     → UI 立即更新（乐观更新）
3. ✍️  写入(AI)       → 占位符显示
4. 📤 发送(快照)     → 使用步骤1的快照
```

### 代码实现

**文件**: `src/composables/useMessageSending.ts`

```typescript
// 🎯 第一步：捕获纯净的历史快照（状态修改前）
const cleanHistorySnapshot = branchStore.getDisplayMessages(targetConversationId)

// ✍️ 第二步：状态修改（乐观 UI 更新）
conversationStore.setGenerationStatus(targetConversationId, true)
const userBranchId = branchStore.addMessageBranch(conversationId, 'user', messageParts)
const aiBranchId = branchStore.addMessageBranch(conversationId, 'assistant', [...])

// 📤 第三步：使用快照发送请求
const stream = aiChatService.streamChatResponse(
  appStore,
  cleanHistorySnapshot,  // ← 使用快照，无需任何剔除操作
  model,
  userMessageText,       // ← 当前新消息
  { ... }
)
```

### 优势对比

| 特性 | 旧方案（slice）| 快照模式 |
|------|--------------|----------|
| 魔术数字 | ❌ 依赖 `-2` | ✅ 无魔术数字 |
| 逻辑清晰度 | ❌ 先写后读再剔除 | ✅ 先读后写 |
| 因果律 | ❌ 违反 | ✅ 符合 |
| 易维护性 | ❌ 改动需调整数字 | ✅ 无需调整 |
| 易测试性 | ❌ 依赖时序 | ✅ 独立快照 |

---

## 影响范围

### 已修复
- ✅ 正常发送消息
- ✅ 有历史的对话
- ✅ 分支切换后发送

### 无影响
- ✅ 消息编辑功能
- ✅ 重新生成回复（useMessageRetry.ts 单独处理）
- ✅ 多模态消息（图片/文件）

---

## 相关文件

- `src/composables/useMessageSending.ts` - 核心修复（快照模式）
- `src/services/providers/OpenRouterService.js` - API 层逻辑
- `src/stores/branch.ts` - 分支管理
- `docs/DEBUG_MESSAGE_DUPLICATION.md` - 详细调试记录

---

**状态**: ✅ 已修复（快照模式）  
**修复日期**: 2025年12月3日  
**验证**: 待用户测试确认
