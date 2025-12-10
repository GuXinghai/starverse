# UI 按钮尺寸统一规范

## 概述

本文档记录了 Starverse 应用中所有输入工具栏按钮的统一尺寸规范，确保视觉一致性和良好的用户体验。

## 统一规范

### 1. 功能按钮（Feature Buttons）

适用于：搜索、推理、绘画、参数、上传附件、上传图片等所有功能切换按钮。

**Tailwind 类名**：
```
px-3 py-1.5 text-sm font-medium rounded-full border
```

**尺寸说明**：
- 水平内边距：`px-3` (12px)
- 垂直内边距：`py-1.5` (6px)
- 字体大小：`text-sm` (14px)
- 字体粗细：`font-medium` (500)
- 计算高度：≈36px (6px + 内容 + 6px)

**应用组件**：
- `ChatToolbar.vue` - 所有工具栏按钮
- `FloatingCapsuleInput.vue` - 功能按钮栏
- `ReasoningControls.vue` - 推理控制按钮

### 2. 主操作按钮（Primary Action Buttons）

适用于：发送、停止、撤回等主要操作按钮。

**Tailwind 类名**：
```
px-5 py-1.5 text-sm font-semibold rounded-lg
```

**尺寸说明**：
- 水平内边距：`px-5` (20px) - 比功能按钮更宽，强调主操作
- 垂直内边距：`py-1.5` (6px) - 与功能按钮保持一致高度
- 字体大小：`text-sm` (14px)
- 字体粗细：`font-semibold` (600)
- 计算高度：≈36px (与功能按钮一致)

**应用组件**：
- `FloatingCapsuleInput.vue` - 发送/停止/撤回按钮

### 3. 圆形辅助按钮（Circular Helper Buttons）

适用于：宽高比切换、展开/折叠等辅助操作按钮。

**Tailwind 类名**：
```
h-9 w-9 text-sm rounded-full
```

**尺寸说明**：
- 固定尺寸：`h-9 w-9` (36px × 36px) - 与其他按钮高度匹配
- 字体大小：`text-sm` (14px)
- 形状：圆形 (`rounded-full`)

**应用组件**：
- `ChatToolbar.vue` - 绘画功能的宽高比切换按钮

## 设计原则

### 1. 高度统一

所有按钮的高度统一为 **36px**，无论是矩形按钮还是圆形按钮，确保：
- 视觉对齐美观
- 点击目标大小一致
- 易于触摸操作（移动端）

### 2. 字体大小统一

所有按钮的字体大小统一为 **14px (`text-sm`)**，确保：
- 文字清晰易读
- 视觉权重平衡
- 不同功能按钮之间无视觉冲突

### 3. 主次区分

通过以下方式区分主操作和次要操作：
- **水平内边距**：主操作 `px-5`，次要操作 `px-3`
- **字体粗细**：主操作 `font-semibold`，次要操作 `font-medium`
- **颜色渐变**：主操作使用渐变背景，次要操作使用单色背景
- **圆角大小**：主操作 `rounded-lg`，次要操作 `rounded-full`

### 4. 响应式适配

在移动端（< 768px）：
- 按钮文字可隐藏，仅显示图标
- 水平内边距缩小（`px-2` 或 `px-3`）
- 高度和字体大小保持不变

```css
@media (max-width: 768px) {
  .button-label,
  .send-button-label {
    @apply hidden;
  }
  
  .feature-button {
    @apply px-2;
  }
  
  .send-button {
    @apply px-3;
  }
}
```

## 实现位置

### ChatToolbar.vue

```typescript
const baseActionButtonClasses =
  'inline-flex items-center gap-2 rounded-full border px-3 py-1.5 text-sm font-medium transition-colors focus:outline-none focus:ring-2 focus:ring-offset-1'
```

**应用按钮**：
- 上传图片
- 上传文件
- 绘画功能（+ 圆形切换按钮 `h-9 w-9`）
- 搜索功能
- 参数控制

### FloatingCapsuleInput.vue

**功能按钮样式**：
```css
.feature-button {
  @apply flex items-center gap-2 px-3 py-1.5 rounded-lg border border-gray-300 dark:border-gray-600 transition-all duration-200 disabled:opacity-50 disabled:cursor-not-allowed text-sm font-medium;
}
```

**发送按钮样式**：
```css
.send-button {
  @apply flex items-center gap-2 px-5 py-1.5 rounded-lg bg-gradient-to-r from-blue-500 to-blue-600 text-white font-medium transition-all duration-200 hover:from-blue-600 hover:to-blue-700 hover:shadow-lg disabled:opacity-50 disabled:cursor-not-allowed disabled:hover:shadow-none;
}

.send-button-label {
  @apply text-sm font-semibold;
}
```

### ReasoningControls.vue

```html
<button
  class="flex items-center gap-2 px-3 py-1.5 rounded-lg border text-sm transition"
  ...
>
```

## Storybook 验证

在 `ModernChatInput.stories.ts` 中添加了专门的 Story 用于验证按钮尺寸统一性：

```typescript
export const AllFeaturesEnabled: Story = {
  name: '所有功能启用（展示按钮尺寸统一）',
  parameters: {
    docs: {
      description: {
        story:
          '此 Story 展示所有功能按钮同时启用的状态，便于检查按钮尺寸的统一性。\n\n' +
          '**验证要点**：\n' +
          '1. 所有功能按钮（搜索、推理、绘画、参数）高度应该一致\n' +
          '2. 字体大小应该统一为 text-sm（14px）\n' +
          '3. 圆形切换按钮（宽高比）高度应与其他按钮对齐\n' +
          '4. 发送按钮可以稍宽（px-5 vs px-3），但高度应该一致'
      }
    }
  }
}
```

## 检查清单

在添加新按钮或修改现有按钮时，请确认：

- [ ] 按钮高度为 36px（使用 `py-1.5` 或 `h-9`）
- [ ] 字体大小为 14px（使用 `text-sm`）
- [ ] 功能按钮使用 `px-3`，主操作按钮使用 `px-5`
- [ ] 功能按钮使用 `font-medium`，主操作按钮使用 `font-semibold`
- [ ] 圆形按钮使用 `h-9 w-9`
- [ ] 在 Storybook 中验证视觉效果
- [ ] 在移动端测试响应式表现

## 更新历史

- **2025-12-06**: 初始版本，记录统一尺寸规范
  - 所有按钮高度统一为 36px
  - 字体大小统一为 14px (text-sm)
  - 明确主次按钮的区分原则
  - 添加 Storybook 验证 Story
