# 🎨 现代化输入组件快速启用指南

## 一键切换

在 `src/components/ChatView.vue` 的第 107 行，找到功能开关：

```typescript
// ========== 功能开关：使用现代化输入组件 ==========
// 设置为 true 启用悬浮胶囊输入栏，false 使用传统输入组件
const useModernInput = ref(true)  // 👈 修改这里
```

### 启用新版（推荐）
```typescript
const useModernInput = ref(true)
```

### 保留旧版
```typescript
const useModernInput = ref(false)
```

## 特性对比

> **注意**：`ChatInputArea` 已于 2025-12-06 归档。`ModernChatInput` 现在是唯一的聊天输入实现。

| 功能 | 传统输入 (已归档) | 现代输入 (当前使用) |
|------|------------------|---------------------|
| 胶囊形状设计 | ❌ 方形 | ✅ 圆角胶囊 |
| 悬浮阴影效果 | ❌ 无 | ✅ 立体阴影 |
| 自动高度调整 | ✅ 支持 | ✅ 增强版 |
| 功能 Chips | ❌ 无 | ✅ 可视化 Chips |
| 模型快速选择 | ❌ 隐藏 | ✅ 顶部栏显示 |
| 参数快速预览 | ❌ 无 | ✅ 内联显示 |
| 附件内联预览 | ✅ 支持 | ✅ 增强版 |
| 动画过渡 | ⚠️ 基础 | ✅ 丰富 |
| 聚焦视觉反馈 | ⚠️ 基础 | ✅ 光晕效果 |
| 暗色模式 | ✅ 支持 | ✅ 优化 |

## 视觉效果对比

### 传统输入（旧版）
```
┌─────────────────────────────────────┐
│ ┌─────────────────────────────────┐ │
│ │ textarea (方形, 灰色边框)       │ │
│ └─────────────────────────────────┘ │
│ [附件1] [附件2]                     │
│ [+] [📷] [📁]          [发送按钮]  │
└─────────────────────────────────────┘
```

### 现代输入（新版）
```
┌─────────────────────────────────────┐
│ [模型: Claude 3.5] [T: 0.7] [Max: 4096] │
├─────────────────────────────────────┤
│ 🔍 Web ×  🧠 Reasoning ×  + 更多    │
└─────────────────────────────────────┘

     ╭─────────────────────────────╮
     │ [📷] [📁] textarea (胶囊)  [➤] │ 🔄 自动高度
     │    [附件1] [附件2]          │
     ╰─────────────────────────────╯
         ↑ 悬浮阴影 + 圆角
```

## 开发体验

### 热重载测试
修改 `useModernInput` 后，保存文件即可看到效果：

1. 保存 `ChatView.vue`
2. 浏览器自动刷新
3. 立即看到新界面

### 控制台调试
打开浏览器 DevTools (F12)，查看：

```javascript
// 检查组件是否正确渲染
document.querySelector('.modern-chat-input')  // 新版
document.querySelector('.chat-input-area')     // 旧版
```

## 可选增强

### 启用动画特效
在 `FloatingCapsuleInput.vue` 中添加：

```vue
<style scoped>
@import './floating-input-enhancements.css';
</style>
```

### 启用粘性定位
在 `ModernChatInput.vue` 的 `.modern-chat-input` 类添加：

```css
.modern-chat-input {
  @apply sticky bottom-0 z-50;
}
```

### 启用渐变边框
在模板中添加类：

```vue
<div class="floating-capsule floating-capsule-gradient-border">
```

## 常见问题

### Q: 切换后样式错乱？
A: 清除浏览器缓存或硬刷新 (Ctrl+Shift+R)

### Q: 功能按钮不显示？
A: 检查 `is-*-available` props 是否为 true

### Q: 发送按钮禁用？
A: 确保 `can-send` prop 计算正确

### Q: 附件预览不显示？
A: 确认 `pending-attachments` 格式为 Base64 DataURI

## 性能监控

### 渲染性能
```javascript
// 在浏览器控制台运行
performance.measure('input-render')
```

### 内存使用
```javascript
// 检查内存占用
console.memory.usedJSHeapSize / 1024 / 1024 + ' MB'
```

## 反馈与优化

如遇到问题或有优化建议，请：

1. 截图界面
2. 打开 DevTools Console
3. 复制错误信息
4. 记录操作步骤
5. 提交 Issue 或联系团队

---

**快速链接：**
- [完整文档](./README.md)
- [组件源码](./ModernChatInput.vue)
- [样式增强](./floating-input-enhancements.css)

**测试建议：**
1. ✅ 发送消息
2. ✅ 上传图片
3. ✅ 启用功能（Web Search、Reasoning）
4. ✅ 切换模型
5. ✅ 暗色模式
6. ✅ 移动端适配

**享受现代化的输入体验！** 🚀
