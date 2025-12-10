# 现代化聊天输入组件

## ⚠️ 重要规范：组件开发与架构要求

### 🚫 禁止事项

1. **禁止直接使用原生 HTML 元素 + Tailwind 类**
   - ❌ 不得在页面层直接写 `<button>` + Tailwind 类
   - ❌ 不得在页面层直接写 `<textarea>` + Tailwind 类
   - ✅ 必须使用本目录下的可复用组件（如 `ChatToolbarButton`）

2. **禁止在组件中使用任意值类 (Arbitrary Values)**
   - ❌ 不得使用 `h-[32px]`、`w-[120px]` 等任意值
   - ✅ 必须使用全局设计令牌（如 `var(--button-height-lg)`）
   - ✅ 或使用 Tailwind 预定义类（如 `h-8`、`w-32`）

3. **禁止外部组件覆盖按钮尺寸**
   - ❌ 不得在父组件中添加 `h-*`、`py-*`、`text-*` 等尺寸类
   - ✅ 尺寸必须由组件的 `size` prop 控制

### ✅ 必须遵循

1. **设计令牌优先**
   - 所有按钮高度使用全局设计令牌：
     - `--button-height-sm`: 28px (7)
     - `--button-height-md`: 32px (8)
     - `--button-height-lg`: 36px (9)
   - 示例：`style="height: var(--button-height-lg)"`

2. **Storybook 驱动开发**
   - 对任何 UI 修改，必须先在 Storybook 中完成并验证
   - 每个组件必须有对应的 `.stories.ts` 文件
   - Stories 必须覆盖所有可见状态（空/输入中/错误/禁用/功能组合）

3. **响应式验证**
   - 在提交前，必须在 Storybook 中验证以下断点：
     - 480px（移动端）
     - 768px（平板）
     - 1280px（桌面）

### 📋 Storybook 开发工作流

1. **启动 Storybook**
   ```bash
   npm run storybook
   ```

2. **创建 Story**
   - 在组件同目录下创建 `*.stories.ts` 文件
   - 参考 `ChatToolbar.stories.ts` 或 `IntegratedPromptBox.stories.ts`

3. **验证清单**
   - [ ] 所有功能状态组合都有对应 story
   - [ ] 在 480px/768px/1280px 下布局正常
   - [ ] 按钮高度一致（使用开发者工具测量）
   - [ ] 无控制台警告或错误
   - [ ] 可访问性测试通过（Storybook a11y addon）

4. **接入应用**
   - 仅在 Storybook 验证通过后，才能在应用页面中使用
   - 应用页面只能消费组件和状态，不得直接写原生元素

---

## 组件概览

本目录包含全新的现代化聊天输入系统，采用行业最佳实践设计（参考 Perplexity、Claude、ChatGPT）。

### 核心组件

#### 1. FloatingCapsuleInput.vue
**悬浮胶囊输入栏** - 主输入组件

**设计特点：**
- 🎨 胶囊形状设计（大圆角 rounded-3xl）
- 💫 悬浮效果（阴影 + 边框）
- 📏 自适应高度（1-10 行自动扩展）
- 🎯 聚焦状态视觉反馈（边框高亮 + 阴影增强）
- 📎 内联附件预览（图片网格 + 文件列表）
- ⚡ 快捷键支持（Ctrl/Cmd + Enter 发送）

**关键功能：**
```vue
<FloatingCapsuleInput
  v-model="input"
  :can-send="true"
  :generation-in-progress="false"
  :pending-attachments="images"
  :pending-files="files"
  @send="handleSend"
  @select-image="selectImage"
  @select-file="selectFile"
/>
```

#### 2. IntegratedPromptBox.vue
**整合型提示框** - 功能控制面板

**设计特点：**
- 🏷️ 功能 Chips 展示（已启用功能可视化）
- ➕ 快速添加功能（点击 + 按钮）
- 🎚️ 模型选择器（下拉 + 快捷显示）
- 📊 参数快速预览（Temperature、Max Tokens）
- 🎭 平滑过渡动画（展开/收起）

**关键功能：**
```vue
<IntegratedPromptBox
  :web-search-enabled="true"
  :reasoning-enabled="false"
  :current-model-name="'Claude 3.5 Sonnet'"
  :sampling-parameters="{ temperature: 0.7 }"
  @update:web-search-enabled="toggleWebSearch"
  @open-model-picker="showModelPicker"
/>
```

#### 3. ModernChatInput.vue
**现代化聊天输入** - 智能容器组件

**设计特点：**
- 🧩 整合上述两个组件
- ✅ 完全替代 ChatInputArea（已归档）
- 🎛️ 统一事件路由（50+ 事件）
- 📦 开箱即用（唯一聊天输入实现）

**使用示例：**
```vue
<ModernChatInput
  v-model="draftInput"
  :generation-status="status"
  :web-search-enabled="webSearchEnabled"
  :current-model-name="modelName"
  @send="sendMessage"
  @toggle-reasoning="toggleReasoning"
/>
```

## 集成到 ChatView

### 当前状态：HARD CUTOVER 已完成

**ModernChatInput 现在是唯一的聊天输入实现**，不再需要功能开关。

### 使用方式

在 `ChatView.vue` 中直接使用：

```vue
<!-- 唯一输入组件 -->
<ModernChatInput
  v-if="currentConversation"
  v-model="draftInput"
  :generation-status="generationStatus"
  :web-search-enabled="webSearchConfig?.enabled || false"
  :current-model-name="modelStore.getModelById(actualModelId)?.name || '未选择模型'"
  <!-- 23 个 props 透传 -->
  @send="sendMessage"
  @stop="stopGeneration"
  <!-- 21 个事件处理 -->
/>
```

### 已移除的旧代码

- ❌ `useModernInput` 功能开关
- ❌ `ChatInputArea` 条件分支
- ❌ 所有兼容层代码

所有必要的 props 都已映射：
- ✅ 生成状态（generation-status）
- ✅ 功能启用状态（web-search-enabled, reasoning-enabled 等）
- ✅ 模型信息（current-model-name, active-provider）
- ✅ 附件数据（pending-attachments, pending-files）
- ✅ 采样参数（sampling-parameters）

## 视觉增强

### floating-input-enhancements.css

提供可选的动画和微交互：

**包含效果：**
1. 📝 打字机占位符动画
2. 💧 输入时的波纹效果
3. 💓 发送按钮脉冲动画
4. 🔄 停止按钮旋转动画
5. 🎴 附件卡片悬停效果
6. 🔍 图片预览缩放效果
7. ✨ Chip 弹跳动画
8. 🌟 输入框聚焦光晕
9. 🌈 生成中的边框流光
10. 🔔 撤回按钮摇摆效果

**使用方法：**
```vue
<style scoped>
@import './floating-input-enhancements.css';
</style>
```

**可选类名：**
- `.typing` - 输入中波纹效果
- `.floating-capsule-sticky` - 粘性定位
- `.floating-capsule-gradient-border` - 渐变边框

## 响应式设计

### 断点适配

```css
/* 移动端 */
@media (max-width: 768px) {
  .floating-capsule {
    border-radius: 1.5rem;
  }
  
  .feature-chip {
    font-size: 0.75rem;
  }
}
```

### 暗色模式

所有组件都支持暗色模式：
```css
@media (prefers-color-scheme: dark) {
  .floating-capsule {
    @apply bg-gray-800 border-gray-700;
  }
}
```

## 无障碍支持

### 减少动画

```css
@media (prefers-reduced-motion: reduce) {
  * {
    animation-duration: 0.01ms !important;
    transition-duration: 0.01ms !important;
  }
}
```

### 键盘导航

- ✅ Tab 键可访问所有按钮
- ✅ Enter 键激活按钮
- ✅ Ctrl/Cmd + Enter 发送消息
- ✅ Esc 键取消操作

### ARIA 属性

```vue
<button
  type="button"
  :aria-label="'发送消息'"
  :aria-disabled="!canSend"
  role="button"
>
```

## 性能优化

### 1. 虚拟滚动（附件列表）
考虑使用 `vue-virtual-scroller` 处理大量附件

### 2. 防抖输入
自动高度调整使用 `nextTick` 优化

### 3. CSS 变量
可考虑提取主题色到 CSS 变量：

```css
:root {
  --capsule-border-color: rgba(59, 130, 246, 0.5);
  --capsule-shadow: 0 10px 25px rgba(0, 0, 0, 0.1);
}
```

## 自定义配置

### 修改颜色方案

在 `IntegratedPromptBox.vue` 中修改 `getChipColorClasses`：

```typescript
const colorMap = {
  blue: { ... },
  purple: { ... },
  pink: { ... },
  amber: { ... }
}
```

### 调整动画速度

在 `floating-input-enhancements.css` 中修改：

```css
@keyframes focus-glow {
  /* 修改动画持续时间 */
  animation: focus-glow 3s ease-in-out infinite; /* 改为 3s */
}
```

### 更改边框圆角

在 `FloatingCapsuleInput.vue` 中：

```css
.floating-capsule {
  @apply rounded-3xl; /* 改为 rounded-2xl 或其他值 */
}
```

## 测试建议

### 单元测试

```typescript
import { mount } from '@vue/test-utils'
import FloatingCapsuleInput from './FloatingCapsuleInput.vue'

test('自动调整高度', async () => {
  const wrapper = mount(FloatingCapsuleInput, {
    props: { modelValue: '' }
  })
  
  await wrapper.find('textarea').setValue('长文本...')
  // 验证高度变化
})
```

### 集成测试

```typescript
test('发送消息流程', async () => {
  const wrapper = mount(ModernChatInput, {
    props: { canSend: true }
  })
  
  await wrapper.find('textarea').setValue('测试消息')
  await wrapper.find('.send-btn').trigger('click')
  
  expect(wrapper.emitted('send')).toBeTruthy()
})
```

## 故障排查

### 问题：输入框不自动调整高度
**原因：** textareaRef 未正确绑定  
**解决：** 检查 `ref="textareaRef"` 是否存在

### 问题：附件预览不显示
**原因：** pendingAttachments 格式错误  
**解决：** 确保传入的是 Base64 DataURI 数组

### 问题：Chips 不显示
**原因：** 功能未启用或不可用  
**解决：** 检查 `*-enabled` 和 `is-*-available` props

### 问题：暗色模式样式错乱
**原因：** Tailwind dark: 前缀未生效  
**解决：** 确认 `tailwind.config.js` 配置了 `darkMode: 'media'`

## 浏览器兼容性

| 浏览器 | 版本要求 | 支持状态 |
|--------|----------|----------|
| Chrome | 90+ | ✅ 完全支持 |
| Firefox | 88+ | ✅ 完全支持 |
| Safari | 14+ | ✅ 完全支持 |
| Edge | 90+ | ✅ 完全支持 |
| Opera | 76+ | ✅ 完全支持 |

**注意事项：**
- CSS `@layer` 指令需要 PostCSS 8+
- CSS 变量需要现代浏览器
- 动画效果在 IE11 中不可用

## 未来优化方向

1. **📱 移动端手势支持**
   - 上滑发送
   - 左滑删除附件
   - 长按打开菜单

2. **🎙️ 语音输入**
   - 集成 Web Speech API
   - 实时转文本

3. **🖼️ 拖拽上传优化**
   - 拖拽区域高亮
   - 拖拽预览

4. **💾 草稿自动保存**
   - LocalStorage 持久化
   - 跨标签页同步

5. **🤖 智能建议**
   - 输入提示
   - 快捷命令（/help, /search 等）

## 参考资料

- [Perplexity AI 输入设计](https://www.perplexity.ai/)
- [Claude Anthropic 界面](https://claude.ai/)
- [ChatGPT 输入体验](https://chat.openai.com/)
- [Tailwind CSS 文档](https://tailwindcss.com/)
- [Vue 3 Composition API](https://vuejs.org/api/composition-api-setup.html)

## 许可证

MIT License - 与主项目保持一致

---

**最后更新：** 2025-12-06  
**维护者：** Starverse Team  
**版本：** 1.0.0
