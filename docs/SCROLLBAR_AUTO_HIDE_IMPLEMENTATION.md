# 滚动条自动隐藏功能实现

## 概述

为提升 UI 美观性，实现了滚动条自动隐藏功能。在非活动状态时滚动条默认隐藏，仅在以下情况显示：
- 鼠标悬停在滚动容器上
- 正在滚动时
- 滚动停止后 1 秒内

## 实现方案

### 1. 全局样式 (`src/style.css`)

添加了 `.scrollbar-auto-hide` 工具类，支持：
- **Firefox**: 使用 `scrollbar-width` 和 `scrollbar-color`
- **Webkit 浏览器** (Chrome, Safari, Edge): 使用 `::-webkit-scrollbar-*` 伪元素

#### 样式特性
- 默认状态：完全透明
- 悬停/滚动状态：半透明灰色 (rgba(156, 163, 175, 0.5))
- 滚动条轨道悬停：更深的灰色 (rgba(107, 114, 128, 0.7))
- 平滑过渡动画：0.3s ease

### 2. JavaScript 滚动事件处理

为需要自动隐藏的滚动容器添加事件监听：

```javascript
const handleScroll = () => {
  if (!container.value) return
  
  // 添加 .scrolling 类名显示滚动条
  container.value.classList.add('scrolling')
  
  // 清除之前的定时器
  if (scrollTimer !== null) {
    clearTimeout(scrollTimer)
  }
  
  // 1秒后移除 .scrolling 类名
  scrollTimer = window.setTimeout(() => {
    container.value?.classList.remove('scrolling')
  }, 1000)
}

// 在 onMounted 中注册
onMounted(() => {
  if (container.value) {
    container.value.addEventListener('scroll', handleScroll)
  }
})

// 在 onUnmounted 中清理
onUnmounted(() => {
  if (container.value) {
    container.value.removeEventListener('scroll', handleScroll)
  }
  if (scrollTimer !== null) {
    clearTimeout(scrollTimer)
  }
})
```

### 3. 已应用的组件

#### 主要容器
1. **ConversationList.vue** - 对话列表容器
   - 添加 `conversationListContainer` ref
   - 实现滚动事件处理
   - 应用 `.scrollbar-auto-hide` 类

2. **ChatView.vue** - 聊天消息容器
   - 使用现有的 `chatContainer` ref
   - 添加 `chatScrollTimer` 变量
   - 实现滚动事件处理
   - 应用 `.scrollbar-auto-hide` 类

3. **SettingsView.vue** - 设置页面容器
   - 添加 `settingsContainer` ref
   - 实现滚动事件处理
   - 应用 `.scrollbar-auto-hide` 类

4. **ProjectHome.vue** - 项目主页容器
   - 添加 `projectContainer` ref
   - 实现滚动事件处理
   - 应用 `.scrollbar-auto-hide` 类

5. **FavoriteModelSelector.vue** - 收藏模型选择器（水平滚动）
   - 添加 `favoritesListContainer` ref
   - 实现水平滚动事件处理
   - 移除原有自定义滚动条样式
   - 应用 `.scrollbar-auto-hide` 类

#### 弹出菜单和对话框
1. **ConversationList.vue**
   - 右键上下文菜单 (z-index: 1300)
   - 项目选择子菜单 (z-index: 1310)

2. **ChatView.vue**
   - 采样参数控制菜单

3. **ProjectHome.vue**
   - 快速启动参数表单模态框

4. **AdvancedModelPickerModal.vue** - 高级模型选择器
   - 左侧筛选器区域（垂直滚动）
   - 右侧模型列表（垂直滚动）
   - 模型系列标签区域（水平滚动）
   - 使用 `watch` 监听模态框开关，动态添加/移除事件监听器

## 技术细节

### 滚动条宽度
- 设置为 8px，在现代 UI 中提供良好的视觉平衡
- 水平和垂直滚动条均为 8px

### 颜色选择
- 使用 Tailwind 的 gray-400 (rgba(156, 163, 175, 0.5)) 作为默认颜色
- 悬停时使用 gray-500 (rgba(107, 114, 128, 0.7))
- 与应用整体配色方案保持一致

### 过渡动画
- 使用 CSS `transition` 实现平滑显示/隐藏
- 持续时间：0.3s
- 缓动函数：ease

### 兼容性
- ✅ Chrome/Edge (Webkit)
- ✅ Firefox
- ✅ Safari (Webkit)
- ⚠️ IE11 不支持（但应用本身也不支持 IE11）

## 用户体验改进

1. **视觉清爽**：默认隐藏滚动条，界面更简洁
2. **智能显示**：
   - 鼠标悬停时显示，方便用户了解滚动位置
   - 滚动时立即显示，提供视觉反馈
   - 停止滚动后延迟 1 秒隐藏，避免频繁闪烁
3. **平滑过渡**：CSS 动画让显示/隐藏更自然

## 性能考虑

- 使用 `setTimeout` 延迟隐藏，避免频繁操作 DOM
- 正确清理定时器，防止内存泄漏
- 仅在需要的容器上添加事件监听
- CSS 过渡由浏览器优化，性能开销小

## 维护建议

1. **新增滚动容器时**：
   - 添加 `.scrollbar-auto-hide` 类
   - 如果需要滚动状态指示，添加滚动事件处理
   - 记得在 `onUnmounted` 中清理

2. **样式定制**：
   - 如需调整滚动条宽度，修改 `style.css` 中的 width/height
   - 如需调整颜色，修改 rgba 值
   - 如需调整延迟时间，修改 JavaScript 中的 timeout 值

3. **问题排查**：
   - 检查 `.scrollbar-auto-hide` 类是否正确应用
   - 检查容器是否有 `overflow-y-auto` 或 `overflow-auto`
   - 验证滚动事件监听器是否正确注册
   - 使用浏览器开发工具检查 `.scrolling` 类是否正确添加/移除

## 相关文件

- `src/style.css` - 全局样式定义
- `src/components/ConversationList.vue` - 对话列表
- `src/components/ChatView.vue` - 聊天视图
- `src/components/SettingsView.vue` - 设置视图
- `src/components/ProjectHome.vue` - 项目主页
- `src/components/AdvancedModelPickerModal.vue` - 高级模型选择器
- `src/components/FavoriteModelSelector.vue` - 收藏模型选择器

## 更新日期

2025年11月23日
