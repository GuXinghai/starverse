# ChatToolbarButton 原子组件设计文档

## 问题背景

在之前的实现中，工具栏按钮存在以下问题：

1. **高度不统一**：即使设置了相同的 `height`，不同按钮的实际高度仍然不一致
2. **样式分散**：按钮样式散落在各个组件中，缺乏统一的实现来源
3. **Storybook 不一致**：Storybook 中展示的按钮与实际应用中的按钮高度不同

### 根本原因分析

高度不一致的根本原因不是「height 没设对」，而是：

1. **默认样式差异**
   - 不同环境下的 `box-sizing` 可能是 `content-box` 或 `border-box`
   - `line-height` 的继承值不同（有的是 1.5，有的是 1）
   - `padding-block` / `border-width` 不一致

2. **结构不一致**
   - 有的按钮是「图标 + 文本」
   - 有的按钮只有图标
   - 有的按钮还带下拉箭头
   - 内部 DOM 结构不同导致垂直方向布局不同

3. **全局样式不一致**
   - App 中引入了完整的 `style.css` / Tailwind / reset
   - Storybook 中的引入可能顺序不同或缺失某些样式

## 解决方案

### 1. 创建 ChatToolbarButton 原子组件

**核心设计原则**：

```typescript
// ✅ 正确：使用统一的原子组件
<ChatToolbarButton size="md">
  <template #icon>🔍</template>
  搜索
</ChatToolbarButton>

// ❌ 错误：在业务代码中直接写 <button>
<button style="height: 32px">搜索</button>
```

### 2. 关键技术实现

#### 2.1 布局控制

```css
.chat-toolbar-button {
  /* 核心：使用 inline-flex 布局，高度由 CSS 变量控制 */
  display: inline-flex;
  align-items: center;
  justify-content: center;
  
  /* 字体相关 - line-height: 1 防止文字撑开高度 */
  line-height: 1;
  
  /* 尺寸控制 - 高度由 CSS 变量统一管理 */
  height: var(--toolbar-button-height, 32px);
  
  /* 确保 border 不额外增加高度 */
  box-sizing: border-box;
}
```

**关键点**：
- `inline-flex + align-items: center` 保证垂直居中
- `line-height: 1` 避免文字撑开高度
- `box-sizing: border-box` 确保 border 不额外增加高度
- 高度完全由 `--toolbar-button-height` CSS 变量控制，与内容无关

#### 2.2 尺寸系统

```css
/* 通过 CSS 变量实现尺寸标准化 */
.chat-toolbar-button--sm {
  --toolbar-button-height: 28px;
  --toolbar-button-font-size: 13px;
  --toolbar-button-padding-x: 10px;
}

.chat-toolbar-button--md {
  --toolbar-button-height: 32px;
  --toolbar-button-font-size: 14px;
  --toolbar-button-padding-x: 12px;
}

.chat-toolbar-button--lg {
  --toolbar-button-height: 36px;
  --toolbar-button-font-size: 15px;
  --toolbar-button-padding-x: 14px;
}
```

**优势**：
- 尺寸只和 `size` prop 有关
- 内部无论是「纯图标」「图标+文字」「文字+下拉箭头」，都被压到同一高度

#### 2.3 分离关注点

```css
/* 视觉变体只改颜色，不改尺寸相关属性 */
.chat-toolbar-button--primary {
  background: #3b82f6;
  color: white;
  border-color: #3b82f6;
}

.chat-toolbar-button--ghost {
  background: transparent;
  border-color: transparent;
}
```

**原则**：variant（视觉样式）和 size（尺寸）完全分离

### 3. Storybook 集成

#### 3.1 确保样式一致性

`.storybook/preview.ts` 中已经正确引入了全局样式：

```typescript
import '../src/style.css'  // ✅ 引入了 Tailwind + design tokens
```

这确保 Storybook 中的按钮和实际应用使用相同的样式基础。

#### 3.2 Story 编写规范

```typescript
// ✅ 正确：直接使用真实组件，不写自定义 CSS
export const ToolbarButtonGroup: Story = {
  render: () => ({
    components: { ChatToolbarButton },
    template: `
      <div style="display: flex; gap: 8px;">
        <ChatToolbarButton size="md">
          <template #icon>🔍</template>
          搜索
        </ChatToolbarButton>
        <ChatToolbarButton size="md">
          <template #icon>🖥</template>
          推理
        </ChatToolbarButton>
      </div>
    `
  })
}

// ❌ 错误：在 Story 中临时写样式
export const WrongApproach: Story = {
  render: () => ({
    template: `
      <button style="height: 32px; font-size: 14px;">
        搜索
      </button>
    `
  })
}
```

## 组件 API

### Props

```typescript
interface Props {
  /** 按钮尺寸（控制高度和字体大小） */
  size?: 'sm' | 'md' | 'lg'
  
  /** 按钮视觉样式变体 */
  variant?: 'default' | 'primary' | 'ghost' | 'outline'
  
  /** HTML button type 属性 */
  type?: 'button' | 'submit' | 'reset'
  
  /** 禁用状态 */
  disabled?: boolean
  
  /** 激活状态（功能已启用时的高亮） */
  active?: boolean
  
  /** 仅显示图标模式（文本作为无障碍标签） */
  iconOnly?: boolean
}
```

### Slots

```typescript
<ChatToolbarButton>
  <!-- 左侧图标 -->
  <template #icon>🔍</template>
  
  <!-- 文本内容（默认插槽） -->
  搜索
  
  <!-- 右侧尾部（如下拉箭头） -->
  <template #trailing>
    <IconChevronDown />
  </template>
</ChatToolbarButton>
```

### Events

```typescript
interface Emits {
  (e: 'click', event: MouseEvent): void
}
```

## 使用示例

### 基础用法

```vue
<template>
  <!-- 图标 + 文字 -->
  <ChatToolbarButton size="md">
    <template #icon>🔍</template>
    搜索
  </ChatToolbarButton>

  <!-- 纯图标（无障碍文本隐藏） -->
  <ChatToolbarButton size="md" icon-only>
    <template #icon>⚙</template>
    设置
  </ChatToolbarButton>

  <!-- 带下拉箭头 -->
  <ChatToolbarButton size="md">
    <template #icon>🖥</template>
    推理
    <template #trailing>
      <IconChevronDown />
    </template>
  </ChatToolbarButton>
</template>
```

### 激活状态

```vue
<template>
  <ChatToolbarButton 
    size="md" 
    :active="reasoningEnabled"
    @click="reasoningEnabled = !reasoningEnabled"
  >
    <template #icon>🖥</template>
    推理
  </ChatToolbarButton>
</template>

<script setup lang="ts">
import { ref } from 'vue'

const reasoningEnabled = ref(false)
</script>
```

### 禁用状态

```vue
<template>
  <ChatToolbarButton 
    size="md" 
    :disabled="isGenerating"
  >
    <template #icon>🔍</template>
    搜索
  </ChatToolbarButton>
</template>
```

## 迁移指南

### 1. 替换现有按钮

**迁移前**：

```vue
<!-- 在 ChatToolbar.vue 中 -->
<button 
  class="toolbar-btn"
  style="height: 32px; font-size: 14px;"
  @click="handleSearch"
>
  🔍 搜索
</button>
```

**迁移后**：

```vue
<ChatToolbarButton 
  size="md" 
  @click="handleSearch"
>
  <template #icon>🔍</template>
  搜索
</ChatToolbarButton>
```

### 2. 更新 Storybook Stories

**迁移前**：

```typescript
// ❌ 在 Story 中临时造按钮
export const Toolbar = {
  render: () => ({
    template: `
      <div>
        <button style="height: 32px;">搜索</button>
        <button style="height: 32px;">推理</button>
      </div>
    `
  })
}
```

**迁移后**：

```typescript
// ✅ 使用真实组件
export const Toolbar = {
  render: () => ({
    components: { ChatToolbarButton },
    template: `
      <div style="display: flex; gap: 8px;">
        <ChatToolbarButton size="md">
          <template #icon>🔍</template>
          搜索
        </ChatToolbarButton>
        <ChatToolbarButton size="md">
          <template #icon>🖥</template>
          推理
        </ChatToolbarButton>
      </div>
    `
  })
}
```

## 验证清单

### 开发验证

- [ ] 所有工具栏按钮使用 `ChatToolbarButton` 组件
- [ ] 业务代码中不存在直接写的 `<button>` 标签（工具栏场景）
- [ ] 同一 `size` 的按钮高度完全一致（测量工具验证）

### Storybook 验证

- [ ] Storybook 中的按钮与应用中的按钮高度一致
- [ ] Story 不包含自定义 CSS 来调整按钮高度
- [ ] 所有 Stories 使用真实的 `ChatToolbarButton` 组件

### 可访问性验证

- [ ] `iconOnly` 模式下的按钮有无障碍文本标签
- [ ] 按钮有正确的 `aria-pressed` 状态（激活时）
- [ ] 键盘导航正常工作（Tab 键、Enter 键）

## 给 AI Agent 的指令模板

如果需要 AI Agent 执行类似的迁移任务，可以使用以下指令：

```
任务：系统化重构工具栏按钮实现

1. 创建 ChatToolbarButton 基础组件
   - 使用 inline-flex 布局，统一尺寸 token（sm/md/lg）
   - 支持图标、文字、下拉箭头等灵活组合
   - 高度完全由 CSS 变量控制，与内容无关

2. 迁移现有组件
   - 将 ChatToolbar 中的所有 <button> 替换为 ChatToolbarButton
   - 删除所有临时的高度/字体样式代码
   - 统一使用 size="md" props

3. 更新 Storybook Stories
   - 为 ChatToolbarButton 创建完整的 Story
   - 更新相关 Stories，移除自定义 CSS
   - 验证 Storybook 中的高度与应用一致

4. 验证
   - 确认 .storybook/preview.ts 已引入全局样式
   - 测量所有按钮高度是否统一
   - 验证无障碍性（屏幕阅读器支持）

原则：
- 禁止在业务代码中直接写原生 <button>
- 禁止在 Story 中写自定义 CSS 调整高度
- 高度问题通过组件封装解决，不通过样式 patch
```

## 技术优势

### 1. 可维护性

- ✅ 单一来源：所有工具栏按钮使用同一个组件
- ✅ 样式集中：样式修改只需改一个文件
- ✅ 类型安全：TypeScript 类型保证 props 正确性

### 2. 一致性

- ✅ 高度统一：物理高度由 CSS 变量控制，与内容无关
- ✅ 视觉统一：所有按钮使用相同的设计语言
- ✅ 环境统一：Storybook 和应用使用同一套样式

### 3. 扩展性

- ✅ 易于扩展：新增尺寸/变体只需修改一个组件
- ✅ 兼容性好：支持暗色模式、响应式设计
- ✅ 无障碍：内置 ARIA 属性和语义化标签

## 相关文档

- [Atomic Design 原则](https://atomicdesign.bradfrost.com/)
- [Tailwind v4 配置指南](../CONFIG_GOVERNANCE.md)
- [组件设计规范](../NAMING_CONVENTION.md)

## 版本历史

- **v1.0.0** (2025-12-06): 初始版本，解决工具栏按钮高度不统一问题
