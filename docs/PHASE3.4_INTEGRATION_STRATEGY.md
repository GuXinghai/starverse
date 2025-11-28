# Phase 3.4 集成进展报告

## 📅 当前时间
2025-11-25

## ✅ 已完成工作

### 1. Composables 集成（部分完成）

**已完成：**
- ✅ 在 ChatView.vue 中导入 `useAttachmentManager` 和 `useScrollControl`
- ✅ 初始化 composables 实例
- ✅ 创建别名变量以兼容现有代码（`pendingAttachments`, `pendingFiles`）

**代码变更：**
```typescript
// 添加导入
import { useAttachmentManager } from '../composables/useAttachmentManager'
import { useScrollControl } from '../composables/useScrollControl'

// 初始化 composables
const attachmentManager = useAttachmentManager({
  maxImageSizeMB: 10,
  maxFileSizeMB: 20,
  maxImagesPerMessage: 5,
  maxFilesPerMessage: 3
})

const scrollControl = useScrollControl(chatContainer, {
  autoScroll: true
})

// 创建别名以兼容现有代码
const pendingAttachments = attachmentManager.images
const pendingFiles = attachmentManager.files
```

---

## 🔍 当前挑战

### 问题：ChatView.vue 文件过大（5704行）

**困难：**
1. 单个文件包含所有逻辑，难以一次性重构
2. 新旧代码需要并存过渡期
3. 大量函数和状态相互依赖

**解决方案：**
采用**渐进式集成策略**

---

## 🎯 渐进式集成策略

### 策略 A：保守重构（推荐）

**思路：**
1. 新旧代码共存
2. 新功能使用新 API
3. 旧功能保持不变
4. 逐步迁移关键函数

**优点：**
- 风险低，不影响现有功能
- 可以随时验证
- 易于回滚

**缺点：**
- 代码冗余
- 迁移周期长

### 策略 B：激进重构

**思路：**
1. 直接使用新子组件替换整个模板区域
2. 一次性迁移所有逻辑到 composables
3. 删除所有旧代码

**优点：**
- 一次到位
- 代码清爽

**缺点：**
- 风险高，可能引入 Bug
- 难以验证每个功能
- 调试困难

---

## 💡 建议方案：**混合策略**

### Phase 3.4 重构步骤

#### Step 1: 集成新 Stores（优先）✅
**目标：** 替换 `useChatStore()` 为新的模块化 Stores

**原因：**
- 数据层变更影响最小
- 不涉及 UI 模板修改
- 易于验证

**行动：**
```typescript
// 旧代码
import { useChatStore } from '../stores/chatStore'
const chatStore = useChatStore()

// 新代码
import { useConversationStore } from '../stores/conversation'
import { useBranchStore } from '../stores/branch'
import { useModelStore } from '../stores/model'
import { usePersistenceStore } from '../stores/persistence'

const conversationStore = useConversationStore()
const branchStore = useBranchStore()
const modelStore = useModelStore()
const persistenceStore = usePersistenceStore()
```

#### Step 2: 集成 Composables（当前）⏳
**已完成：**
- ✅ `useAttachmentManager` - 附件管理逻辑
- ✅ `useScrollControl` - 滚动控制

**待完成：**
- [ ] `useMessageSending` - 发送消息逻辑
- [ ] `useMessageEditing` - 编辑消息逻辑
- [ ] `useBranchNavigation` - 分支导航

#### Step 3: 逐步替换函数调用
**目标：** 将关键函数迁移到 composables

**示例：**
```typescript
// 旧代码：直接操作 ref
const handleSelectImage = async () => {
  if (pendingAttachments.value.length >= MAX_IMAGES_PER_MESSAGE) {
    alert('...')
    return
  }
  // ... 大量逻辑
}

// 新代码：使用 composable
const handleSelectImage = async () => {
  const result = await attachmentManager.addImages(/* ... */)
  if (!result.success) {
    alert(result.error)
  }
}
```

#### Step 4: 集成子组件（最后）
**目标：** 替换模板中的大块 UI

**行动：**
- 用 `<ChatInput />` 替换输入框区域
- 用 `<MessageList />` 替换消息列表区域
- 用 `<MessageItem />` 替换单条消息渲染

---

## 📊 当前进度

| 步骤 | 状态 | 进度 | 备注 |
|-----|------|------|------|
| Step 1: 集成新 Stores | 未开始 | 0% | 数据层重构 |
| Step 2: 集成 Composables | 进行中 | 40% | 已完成 2/5 |
| Step 3: 替换函数调用 | 未开始 | 0% | 逐步迁移 |
| Step 4: 集成子组件 | 未开始 | 0% | UI 层重构 |

---

## 🤔 需要决策

### 问题：如何继续 Phase 3.4？

#### 选项 A：继续完成 Step 2（Composables）
- 集成 `useMessageSending`
- 集成 `useMessageEditing`
- 集成 `useBranchNavigation`

**工作量：** 中等  
**风险：** 低  
**收益：** 可以快速看到 composables 的价值

#### 选项 B：转向 Step 1（新 Stores）
- 替换 `chatStore` 调用为新 Stores
- 修改所有 `chatStore.xxx` 为 `conversationStore.xxx` 等
- 删除对旧 chatStore 的依赖

**工作量：** 大  
**风险：** 中  
**收益：** 数据层完全迁移，为后续工作奠定基础

#### 选项 C：直接跳到 Step 4（子组件）
- 用 `<ChatInput />` 替换输入框 HTML
- 用 `<MessageList />` 替换消息列表 HTML
- 快速看到 UI 改进效果

**工作量：** 中等  
**风险：** 中（需要调整事件处理）  
**收益：** 快速减少 ChatView 文件行数

#### 选项 D：暂停集成，先完成 Phase 3.3
- 迁移 `aiChatService.js` 到 TypeScript
- 消除类型警告
- 为 Phase 3.4 提供完整类型支持

**工作量：** 中等  
**风险：** 低  
**收益：** 类型安全，更好的 IDE 支持

---

## 💬 建议

**我的建议：选项 B（集成新 Stores）**

**理由：**
1. **数据层是基础** - 先迁移数据层，UI 层自然跟随
2. **影响范围可控** - 数据操作的 API 变更相对简单
3. **易于回滚** - 新旧 Stores 可以共存
4. **为后续铺路** - 完成后，Step 3/4 会更顺畅

**具体行动：**
1. 在 ChatView.vue 中导入新 Stores
2. 创建别名变量（`const conversations = conversationStore.conversations`）
3. 逐个替换 `chatStore` 调用：
   - `chatStore.currentConversation` → `conversationStore.conversations.find(...)`
   - `chatStore.addMessageBranch` → `branchStore.addMessageBranch`
   - `chatStore.switchBranchVersion` → `branchStore.switchBranchVersion`
4. 验证功能正常
5. 删除对 `useChatStore` 的引用

---

## 📝 下一步行动

**请选择：**
- A. 继续 Composables 集成
- B. 开始 Store 迁移（推荐）
- C. 集成子组件
- D. 先完成 AI 服务 TypeScript 迁移

**或者提出你的想法！**
