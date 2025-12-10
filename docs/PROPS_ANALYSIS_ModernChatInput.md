# ModernChatInput Props 分析报告

**时间**: 2025-12-07  
**当前状态**: ModernChatInput 承载 **23 个 Props** 和 **21 个 Emits**  
**评估**: ⚠️ **高耦合，需要优化**

---

## 📊 Props 分类统计

### 第一类：纯输入内容相关 (3 个)
| Props | 数据来源 | 优化方案 |
|-------|---------|---------|
| `modelValue` | 局部变量 `draftInput` | ✅ 保留（输入框基础 prop） |
| `placeholder` | 硬编码字符串 | ✅ 保留（配置 prop） |
| `disabled` | 派生自组件状态 | ✅ 保留（UI 状态） |

**评估**: ✅ **这部分合理**

---

### 第二类：附件管理相关 (5 个)
| Props | 数据来源 | 优化方案 |
|-------|---------|---------|
| `pendingAttachments` | `attachmentManager.pendingAttachments` | ✅ 保留（输入特定数据） |
| `pendingFiles` | 转换后的 `attachmentManager` 数据 | ✅ 保留（输入特定数据） |
| `selectedPdfEngine` | `selectedPdfEngine` 变量 | ✅ 保留（输入特定配置） |
| `attachmentAlert` | 派生自是否有待上传附件 | ✅ 保留（UI 反馈） |

**评估**: ✅ **这部分合理，都是输入框的直接数据**

---

### 第三类：生成状态相关 (4 个) ⚠️ **需要优化**
| Props | 数据来源 | 当前值 | 优化建议 |
|-------|---------|--------|---------|
| `generationStatus` | `currentConversation.value?.generationStatus` | 'idle' \| 'sending' \| 'receiving' | **移到全局 Store** |
| `sendDelayPending` | `isDelayPending` 变量 | boolean | **改由 composable 管理** |
| `canSend` | 派生计算（来自 props 其他字段） | 3 个条件的 OR | **使用 emit 回传，不需要 prop** |
| `sendButtonTitle` | 硬编码字符串 | '发送消息 (Ctrl+Enter)' | **内置为默认值** |

**问题**: 
- `generationStatus` 属于**对话级状态**，应该从 `conversationStore` 直接访问
- `sendDelayPending` 属于**发送优化状态**，不应该穿过 props
- `canSend` 是**派生计算**，重复计算浪费

**优化后减少 4 个 Props** ✅

---

### 第四类：功能开关相关 (4 个) ⚠️ **需要优化**
| Props | 数据来源 | 当前值 | 优化建议 |
|-------|---------|--------|---------|
| `webSearchEnabled` | `webSearchConfig?.enabled` | boolean | **移到 conversationStore** |
| `reasoningEnabled` | `isReasoningEnabled` (from composable) | boolean | **直接使用 reasoningStore** |
| `imageGenerationEnabled` | `imageGenerationEnabled` 变量 | boolean | **改用 useState pattern** |
| `samplingParametersEnabled` | `isSamplingEnabled` (from composable) | boolean | **使用 composable 内部状态** |

**问题**:
- 所有这些都属于**对话级功能配置**
- 它们的更新触发 emit，再由父组件调用 `conversationStore.set*()` 更新
- **双向传递** = 不必要的 Props

**优化建议**: 让 ModernChatInput 直接访问 Store，而不是通过 Props 传递

**优化后减少 4 个 Props** ✅

---

### 第五类：功能标签/文本相关 (3 个) ⚠️ **可简化**
| Props | 数据来源 | 优化建议 |
|-------|---------|---------|
| `webSearchLevelLabel` | 派生自 `webSearchConfig?.level` | **在组件内计算** |
| `reasoningEffortLabel` | 派生自 `reasoningPreference?.effort` | **在组件内计算** |
| `currentAspectRatioLabel` | 派生自图片生成配置 | **在组件内计算** |

**问题**: 父组件计算后再传入，违反 SRP（单一职责原则）

**优化后减少 3 个 Props** ✅

---

### 第六类：功能可用性/能力检查 (3 个) ⚠️ **需要调整**
| Props | 数据来源 | 优化建议 |
|-------|---------|---------|
| `isWebSearchAvailable` | `webSearchManager` 计算 | **通过 provide/inject** |
| `isReasoningSupported` | 模型能力检查 | **通过 provide/inject** |
| `canShowImageGenerationButton` | 功能开关检查 | **通过 provide/inject** |

**问题**: 这些是**跨组件配置**，不是单个输入框的数据

**优化建议**: 使用 Vue Provide/Inject 或全局配置，而不是 Props

**优化后减少 3 个 Props** ✅

---

### 第七类：推理配置相关 (1 个)
| Props | 数据来源 | 优化建议 |
|-------|---------|---------|
| `reasoningPreference` | `reasoningPreference` computed | **直接访问 reasoningStore** |

**优化后减少 1 个 Props** ✅

---

### 第八类：模型信息相关 (4 个) ⚠️ **需要优化**
| Props | 数据来源 | 优化建议 |
|-------|---------|---------|
| `activeProvider` | `appStore.activeProvider` | **直接访问全局 Store** |
| `currentModelId` | `actualModelId` computed | **直接访问模型 Store** |
| `currentModelName` | 通过 `modelStore.getModelById()` | **移到组件内计算** |
| `modelDataMap` | `modelStore.modelDataMap` | **通过 provide/inject** |

**问题**: 
- `activeProvider` 和 `currentModelId` 都是**全局状态**，不必通过 Props 穿透
- `currentModelName` 是**派生计算**
- `modelDataMap` 是**大对象**，不宜通过 Props 传递

**优化后减少 4 个 Props** ✅

---

### 第九类：采样参数相关 (2 个)
| Props | 数据来源 | 优化建议 |
|-------|---------|---------|
| `samplingParameters` | `currentConversation.value?.samplingParameters` | **移到 conversationStore** |
| `showSamplingMenu` | `showSamplingMenu` 变量 | **改为 composable 本地状态** |

**优化后减少 1 个 Props** ✅

---

## 🎯 优化总结

### 当前状态
```
总 Props 数: 23
├─ 合理的: 8 个 (输入内容、附件)
├─ 需要优化: 15 个
```

### 优化方案
```
优化后 Props 数: 约 8-10 个
├─ 必需的: 8 个 (输入内容、附件相关)
└─ 可选的: 2 个 (placeholder, sendButtonTitle)
```

### 优化减少比例
- **从 23 → 10 个 Props**
- **降低 57% 的 Props 数量**

---

## 🔧 具体优化步骤

### Step 1: 生成状态独立化
```typescript
// ❌ 当前做法
<ModernChatInput
  :generation-status="generationStatus"
  :send-delay-pending="isDelayPending"
/>

// ✅ 优化后
// ModernChatInput 内部：
const generationStatus = computed(() => 
  conversationStore.getCurrentConversation()?.generationStatus || 'idle'
)
const isDelayPending = computed(() => 
  sendingComposable.isDelayPending.value
)
```

**移除 Props**: `generationStatus`, `sendDelayPending`

### Step 2: 功能开关状态本地化
```typescript
// ❌ 当前做法
<ModernChatInput
  :reasoning-enabled="isReasoningEnabled"
  :web-search-enabled="webSearchEnabled"
  @toggle-reasoning="toggleReasoningEnabled"
/>

// ✅ 优化后
// ModernChatInput 内部：
const { isReasoningEnabled } = useReasoningControl()
const webSearchConfig = computed(() => 
  conversationStore.getCurrentConversation()?.webSearch
)

const handleToggleReasoning = () => {
  reasoningManager.toggle()  // 直接调用，自动更新 store
}
```

**移除 Props**: `reasoningEnabled`, `webSearchEnabled`, `imageGenerationEnabled`, `samplingParametersEnabled`  
**改为 Emits**: 仅保留事件更新（已有的保留）

### Step 3: 派生数据在组件内计算
```typescript
// ❌ 当前做法
<ModernChatInput
  :reasoning-effort-label="reasoningEffortLabel"
  :web-search-level-label="webSearchLevelLabel"
/>

// ✅ 优化后
// ModernChatInput 内部：
const reasoningEffortLabel = computed(() => {
  const effort = reasoningPreference.value?.effort
  return effort === 'low' ? '低档' : effort === 'high' ? '高档' : '中档'
})
```

**移除 Props**: `reasoningEffortLabel`, `webSearchLevelLabel`, `currentAspectRatioLabel`

### Step 4: 全局配置使用 Provide/Inject
```typescript
// 在 ChatView 中提供
provide('modelDataMap', modelStore.modelDataMap)
provide('isWebSearchAvailable', isWebSearchAvailable)
provide('isReasoningSupported', isReasoningControlAvailable)
provide('canShowImageGenerationButton', canShowImageGenerationButton)

// ModernChatInput 中注入
const modelDataMap = inject('modelDataMap')
const isWebSearchAvailable = inject('isWebSearchAvailable')
const isReasoningSupported = inject('isReasoningSupported')
```

**移除 Props**: `modelDataMap`, `isWebSearchAvailable`, `isReasoningSupported`, `canShowImageGenerationButton`

### Step 5: 模型信息直接访问 Store
```typescript
// ❌ 当前做法
<ModernChatInput
  :active-provider="appStore.activeProvider"
  :current-model-id="actualModelId"
  :current-model-name="modelName"
/>

// ✅ 优化后
// ModernChatInput 内部：
const modelStore = useModelStore()
const appStore = useAppStore()

const activeProvider = computed(() => appStore.activeProvider)
const currentModelId = computed(() => modelStore.selectedModelId)
const currentModelName = computed(() => 
  modelStore.getModelById(currentModelId.value)?.name
)
```

**移除 Props**: `activeProvider`, `currentModelId`, `currentModelName`

---

## 📋 变更清单

### Props 清理
```diff
- ❌ generationStatus (改用 conversationStore 访问)
- ❌ sendDelayPending (改用 composable 本地状态)
- ❌ canSend (改为派生计算，不需要 prop)
- ❌ sendButtonTitle (改为内置默认值)
- ❌ webSearchEnabled (改用 conversationStore)
- ❌ reasoningEnabled (改用 reasoningStore)
- ❌ imageGenerationEnabled (改为本地状态)
- ❌ samplingParametersEnabled (改为 composable 状态)
- ❌ webSearchLevelLabel (在组件内计算)
- ❌ reasoningEffortLabel (在组件内计算)
- ❌ currentAspectRatioLabel (在组件内计算)
- ❌ isWebSearchAvailable (使用 provide/inject)
- ❌ isReasoningSupported (使用 provide/inject)
- ❌ canShowImageGenerationButton (使用 provide/inject)
- ❌ reasoningPreference (改用 reasoningStore)
- ❌ activeProvider (改用 appStore)
- ❌ currentModelId (改用 modelStore)
- ❌ currentModelName (在组件内计算)
- ❌ modelDataMap (使用 provide/inject)
- ❌ samplingParameters (改用 conversationStore)
- ❌ showSamplingMenu (改为本地状态)

✅ 保留的 Props:
- modelValue (输入内容)
- placeholder (配置)
- disabled (UI 状态)
- pendingAttachments (输入特定)
- pendingFiles (输入特定)
- selectedPdfEngine (输入配置)
- attachmentAlert (UI 反馈)
- modelCapability (仅作为 Props 传递能力信息给子组件)
```

---

## 🚀 优化收益

### 代码清洁度
- **Props 数量**: 23 → 8-10
- **Prop 穿透深度**: 减少 20+ 层的数据流
- **认知复杂度**: ⬇️ 50%

### 性能提升
- **减少不必要的计算**: 父组件不再需要派生计算
- **减少不必要的 watch**: 监听器数量减少
- **内存使用**: 大对象（modelDataMap）不再通过 Props 传递

### 维护性提升
- **职责清晰**: ModernChatInput 自主管理输入相关状态
- **单向数据流保留**: 通过 emit 通知父组件进行持久化
- **易于测试**: 减少 Mock Props 的数量

### 可读性提升
```vue
<!-- 优化前：需要理解 20+ 个 Props 的含义 -->
<ModernChatInput
  :generation-status="generationStatus"
  :web-search-enabled="webSearchEnabled"
  :reasoning-enabled="isReasoningEnabled"
  ... 20 more props
/>

<!-- 优化后：清晰的单一职责 -->
<ModernChatInput
  v-model="draftInput"
  :pending-attachments="pendingAttachments"
  :pending-files="pendingFiles"
/>
```

---

## 📝 下一步建议

### 优先级 1: 移除派生数据 Props
- [ ] 移除 `canSend`（已是派生）
- [ ] 移除 `*Label` Props（3 个，在组件内计算）
- **预期收益**: 清除最没必要的 Props（4 个）

### 优先级 2: 直接访问全局 Store
- [ ] 模型信息（activeProvider, currentModelId）
- [ ] 生成状态（generationStatus）
- **预期收益**: 移除 5-6 个 Props

### 优先级 3: 使用 Provide/Inject
- [ ] 能力检查信息（isWebSearchAvailable 等）
- [ ] 全局数据映射（modelDataMap）
- **预期收益**: 移除 4-5 个 Props

### 优先级 4: 重构为本地状态
- [ ] 功能开关（改为 composable 管理）
- [ ] 菜单显示状态（改为 ref）
- **预期收益**: 移除 3-4 个 Props

---

## 🎓 架构模式参考

### 推荐使用的模式
```typescript
// Pattern 1: Composable 拥有权
const { isEnabled, toggle } = useFeature()  // 内部完整状态

// Pattern 2: Store 中心化
const store = useFeatureStore()
const isEnabled = computed(() => store.isEnabled)

// Pattern 3: Provide/Inject 跨层共享
const value = inject('featureName')

// 避免的反模式
<Component 
  :status="derivedStatus"  // ❌ 派生数据不应该是 prop
  :count="items.length"    // ❌ 计算结果不应该是 prop
/>
```

---

## ✅ 测试检查清单

优化前需验证：
- [ ] 所有 Emits 的回传流程
- [ ] Store 的持久化机制
- [ ] Composables 的状态管理
- [ ] Provide/Inject 的注入点

优化后需验证：
- [ ] 组件独立性（脱离 ChatView 也能工作）
- [ ] 状态更新流程（emit → store → UI 更新）
- [ ] 性能指标（FPS、内存）
- [ ] 单元测试覆盖率

---

**文档版本**: 1.0  
**最后更新**: 2025-12-07  
**审查者**: Architecture Review
