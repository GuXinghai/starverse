# 会话级参数面板集成完成检查清单

## 概述
实现了会话级参数面板，允许用户在聊天界面直接调整采样参数和推理配置，自动保存到会话配置，并在发送消息时使用这些参数。

## 集成流程图

```
FloatingCapsuleInput (参数按钮)
      ↓ emit('toggle-parameters')
ModernChatInput
      ↓ emit('toggle-parameters')
ChatView
      ↓ @toggle-parameters="handleToggleParameterPanel"
      ↓ 切换 showParameterPanel 状态
ConversationParameterPanel
      ↓ 用户调整参数
      ↓ emit('update:samplingParameters')
ChatView.handleParameterPanelUpdateSamplingParams()
      ↓ conversationStore.setSamplingParameters(conversationId, params)
conversationStore (内存中更新)
      ↓ 同时调用 generationConfigManager.setConversationConfig()
generationConfigManager (对话级配置)
      ↓ 发送消息时读取
useMessageSending / aiChatService
      ↓ generationConfigManager.getEffectiveConfig({ conversationId })
      ↓ 获取合并后的配置（Global < Model < Conversation < Request）
OpenRouter API Request
```

## 实现完成项

### 1. ✅ 参数面板组件创建
**文件**: `src/components/chat/controls/ConversationParameterPanel.vue`
- **功能**: 展示和编辑会话级采样参数与推理配置
- **参数**:
  - `temperature` (温度)
  - `top_p` (top-p 采样)
  - `top_k` (top-k 采样)
  - `max_tokens` (最大输出长度)
  - `reasoning` (推理模式/努力)
- **特点**: 基于模型能力过滤显示，自动向 ChatView 发送更新事件
- **大小**: ~340 行 Vue 组件

### 2. ✅ ChatView 集成
**文件**: `src/components/ChatView.vue`
- **导入** (行 81): `import ConversationParameterPanel from './chat/controls/ConversationParameterPanel.vue'`
- **状态** (行 320-360):
  - `showParameterPanel` (computed): 绑定到 `activeMenu === 'parameters'`
  - `parameterPanelAvailable` (computed): 检查 OpenRouter 可用性
  - `handleParameterPanelUpdateSamplingParams()`: 调用 `conversationStore.setSamplingParameters()`
  - `handleParameterPanelUpdateReasoningPreference()`: 调用 `conversationStore.setReasoningPreference()`
  - `handleToggleParameterPanel()`: 切换面板展开/折叠
- **模板** (行 1038-1046): 挂载参数面板组件，传入必要 props 和事件监听
- **事件绑定** (行 1107): ModernChatInput 的 `@toggle-parameters="handleToggleParameterPanel"`

### 3. ✅ 输入组件事件链
**FloatingCapsuleInput** (`src/components/chat/input/FloatingCapsuleInput.vue`):
- 行 113: 添加 `'toggle-parameters'` 到 emits
- 行 330: 修改 `handleToggleFeature()` 中的 'custom' 按钮，emit `'toggle-parameters'` 而非 `'toggle-sampling'`

**ModernChatInput** (`src/components/chat/input/ModernChatInput.vue`):
- 行 126: 添加 `'toggle-parameters': []` 到 emits 定义
- 行 265-268: 添加 `handleToggleParameters()` 处理函数
- 行 320: 在 FloatingCapsuleInput 上添加 `@toggle-parameters="handleToggleParameters"`
- 效果: 参数按钮点击 → FloatingCapsuleInput emit → ModernChatInput 转发 → ChatView 接收

### 4. ✅ 参数持久化流程
**conversationStore** (`src/stores/conversation.ts`):
- 行 22: 导入 `generationConfigManager`
- **setSamplingParameters()**:
  - 保存到 conversationStore 的内存对象
  - **新增**: 同时调用 `generationConfigManager.setConversationConfig()` 以更新生成配置管理器
  - 触发 `persistenceStore.markConversationDirty()` 自动保存
- **setReasoningPreference()**:
  - 保存到 conversationStore 的内存对象
  - **新增**: 同时调用 `generationConfigManager.setConversationConfig()` 以更新生成配置管理器
  - 触发持久化标记

**generationConfigManager** (`src/services/providers/generationConfigManager.ts`):
- 方法 `setConversationConfig(conversationId, config)`: 更新对话级配置并持久化到 electron-store
- 方法 `getEffectiveConfig({ conversationId })`: 返回合并后的配置（4层叠加）
  - 优先级: DEFAULT < Global < Model < Conversation < Request

### 5. 参数流向后端（验证中）
**useMessageSending** / **aiChatService**:
- `aiChatService.buildAirlockedGenerationConfig()` (行 158):
  ```typescript
  const effectiveConfig = generationConfigManager.getEffectiveConfig({
    modelId,
    conversationId: conversationId || undefined,
    requestOverride,
  })
  ```
  - 正确调用了会话级配置读取
  - 返回的 `effectiveConfig` 包含合并后的所有 4 层配置

- **OpenRouter 请求体构建** (`OpenRouterService.buildOpenRouterRequest()`):
  - 从 `generationConfig` 的 `sampling` 字段读取 temperature, top_p, top_k
  - 从 `generationConfig` 的 `length` 字段读取 max_tokens
  - 直接包含在请求体中

## 数据流验证

### 用户交互路径
1. **打开参数面板**:
   - 用户点击 FloatingCapsuleInput 中的"参数"按钮
   - 触发 `emit('toggle-parameters')`
   - ModernChatInput 接收并转发给 ChatView
   - ChatView 的 `handleToggleParameterPanel()` 切换 `showParameterPanel`
   - ConversationParameterPanel 展开/折叠

2. **调整参数**:
   - 用户移动滑块调整参数值（如温度从 0.7 改为 0.9）
   - ConversationParameterPanel 立即在本地更新状态并 emit `update:samplingParameters`
   - ChatView 的 `handleParameterPanelUpdateSamplingParams()` 处理事件

3. **保存参数**:
   - 调用 `conversationStore.setSamplingParameters(conversationId, newParams)`
   - conversationStore 保存到内存中的 Conversation 对象
   - **关键**: 同时调用 `generationConfigManager.setConversationConfig(conversationId, config)`
   - generationConfigManager 保存到内存 Map，并通过 `saveConversationConfigs()` 持久化到 electron-store
   - persistenceStore 标记为脏数据，触发自动保存
   - 用户刷新/重启后参数仍然存在

4. **发送消息**:
   - 用户点击发送按钮
   - `sendMessage()` 调用 `useMessageSending.sendMessage()`
   - `useMessageSending` 调用 `aiChatService.sendMessage()`
   - `aiChatService` 调用 `buildAirlockedGenerationConfig()`:
     ```typescript
     const effectiveConfig = generationConfigManager.getEffectiveConfig({
       modelId,
       conversationId,  // 传入会话 ID
       requestOverride  // 如果有请求级覆盖
     })
     ```
   - `generationConfigManager` 返回合并后的配置，包含会话级参数
   - `OpenRouterService.buildOpenRouterRequest()` 从 `effectiveConfig` 提取 sampling/length 参数
   - OpenRouter API 请求体包含正确的参数值

## 关键设计决策

### 1. 为什么需要同时更新 generationConfigManager？
- **原因**: conversationStore 存储的是业务级的参数配置（用于 UI 展示和持久化），而 generationConfigManager 是服务层的配置管理器
- **问题**: 如果只更新 conversationStore，而 aiChatService 调用 `generationConfigManager.getEffectiveConfig()` 时无法读取到最新参数
- **解决**: setSamplingParameters 和 setReasoningPreference 修改后，同时调用 `generationConfigManager.setConversationConfig()` 以保持两层状态同步

### 2. 参数映射关系
```typescript
// ConversationStore 的 SamplingParameterSettings
{
  temperature: 0.8,
  top_p: 0.9,
  top_k: 40,
  max_tokens: 2000
}

// ↓ 转换为 GenerationConfig 的对话级覆盖

// GenerationConfigManager 的对话级配置
{
  sampling: {
    temperature: 0.8,
    top_p: 0.9,
    top_k: 40
  },
  length: {
    max_tokens: 2000
  }
}

// ↓ 在 getEffectiveConfig() 中与全局/模型配置合并

// 最终的 GenerationConfig（发送给 OpenRouter）
{
  sampling: { temperature: 0.8, top_p: 0.9, top_k: 40 },
  length: { max_tokens: 2000 },
  // 其他字段从全局或模型配置继承
}
```

### 3. 自动持久化机制
```
用户调整参数
  ↓
conversationStore.setSamplingParameters()
  ↓
  ├─ 更新内存: conversation.samplingParameters
  ├─ 更新管理器: generationConfigManager.setConversationConfig()
  └─ 标记脏: persistenceStore.markConversationDirty()
  ↓
persistenceStore (下一个周期)
  ↓
数据库/electron-store 保存
  ↓
用户刷新/重启后参数仍存在
```

## 现已支持但待验证

1. ✅ **UI 层**: 参数面板完整集成，用户可点击按钮展开/折叠
2. ✅ **状态管理**: 参数修改自动保存到 conversationStore 和 generationConfigManager
3. ✅ **持久化**: 配置同时保存到 electron-store
4. ❌ **端到端**: 需要验证 OpenRouter 请求体是否真的包含参数值
5. ❌ **Gemini 支持**: 当前 Gemini 使用 JS 实现，参数可能被忽略（需专项处理）

## 待办事项

### Phase 1: 验证与测试
- [ ] 启动开发服务器
- [ ] 打开聊天，点击参数按钮，调整滑块
- [ ] 检查 conversationStore 状态是否更新
- [ ] 发送消息，用浏览器 DevTools 检查 OpenRouter API 请求体
- [ ] 刷新页面，验证参数是否持久化存在
- [ ] 测试多个对话，确认配置隔离正确

### Phase 2: 后端集成优化
- [ ] 清理 useMessageSending 中的 legacyParameters 构建逻辑
- [ ] 验证 Gemini 提供商是否正确读取会话级配置
- [ ] 为 Gemini 添加参数支持（如果需要）

### Phase 3: UI 优化
- [ ] 参数面板实时验证（如确保 top_p 在 0-1 之间）
- [ ] 添加"重置为默认"按钮
- [ ] 参数面板中显示当前模型的支持情况
- [ ] 考虑添加预设配置（创意/精确/均衡）

## 代码统计

- **新建文件**: ConversationParameterPanel.vue (~340 行)
- **修改文件**: ChatView.vue (3 处), FloatingCapsuleInput.vue (2 处), ModernChatInput.vue (2 处), conversation.ts (2 处)
- **总修改量**: ~50 行有效代码 + ~340 行新组件 = ~390 行

## 常见问题排查

### Q: 参数面板不显示
A: 检查 `parameterPanelAvailable` computed 是否返回 true（需要 OpenRouter 提供商）

### Q: 调整参数后发送消息，OpenRouter 请求体不包含参数
A: 检查:
1. conversationStore 中参数是否已更新（DevTools console）
2. generationConfigManager 是否收到 setConversationConfig 调用
3. aiChatService 是否传递了 conversationId 给 getEffectiveConfig

### Q: 参数不持久化（刷新后消失）
A: 检查:
1. persistenceStore 是否标记了脏数据
2. electron-store 是否正确保存了配置
3. 应用启动时是否正确加载了 generationConfigManager 配置

## 参考文档
- `/docs/CONFIG_GOVERNANCE.md` - 配置管理治理文档
- `/src/types/generation.ts` - GenerationConfig 类型定义
- `/src/services/providers/generationConfigManager.ts` - 配置管理器实现
- `/src/services/aiChatService.ts` - AI 服务集成点
