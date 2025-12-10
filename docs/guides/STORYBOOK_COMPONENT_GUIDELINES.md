# Storybook 组件开发规范

## 核心原则：Storybook 作为单一真相源

对于 Starverse 中的**高频使用组件**和**核心交互组件**（如 `ModernChatInput`、`ChatMessageItem`、`MessageBranchController` 等），我们要求在 Storybook 中为其建立覆盖主要状态的 stories，并将 **Storybook 视为这些组件行为与布局的"单一真相源"（Single Source of Truth）**。

> **注意：** `ChatInputArea` 已归档，现已被 `ModernChatInput` 完全替代。

## 什么是"单一真相源"？

将 Storybook 作为单一真相源意味着：

1. **组件的所有可能状态都应在 Storybook 中可视化展示**
2. **组件的行为规范通过 Storybook stories 进行定义和验证**
3. **设计评审、功能测试、视觉回归测试都以 Storybook 为基准**
4. **文档和实现保持同步，避免代码与文档脱节**

## 适用范围

### 必须创建 Storybook Stories 的组件

以下类型的组件**必须**在 Storybook 中建立完整的 story 覆盖：

#### 1. 高频使用组件
- **聊天相关**: `ModernChatInput`, `ChatMessageItem`, `MessageList`, `ChatToolbar`
  - *注：`ChatInputArea` 已归档，由 `ModernChatInput` 替代*
- **导航控件**: `MessageBranchController`, `BranchNavigator`, `ConversationList`
- **输入控件**: `AdvancedModelPickerModal`, `SamplingParameterSlider`, `QuantileSlider`

#### 2. 核心交互组件
- 所有接受用户输入的组件（输入框、按钮、滑块、选择器）
- 所有涉及状态切换的组件（展开/折叠、启用/禁用、加载状态）
- 所有涉及条件渲染的组件（根据不同条件显示不同内容）

#### 3. 原子组件（Atoms）
- `src/components/atoms/` 下的所有可复用基础组件
- 按钮、输入框、标签、图标等基础 UI 元素

### 可选创建 Stories 的组件

以下组件可根据实际需求决定是否创建 stories：

- **页面级组件**（Templates）：如 `ChatView.vue`，通常过于复杂，建议拆分后为子组件创建 stories
- **一次性组件**：仅在单一场景使用且无复用价值的组件
- **纯展示型简单组件**：逻辑极简且状态单一的组件

## Story 覆盖要求

### 最小覆盖集（Minimum Viable Coverage）

每个核心组件必须包含以下 stories：

1. **Default / 默认状态**
   - 组件的标准展示状态
   - 使用真实的典型数据

2. **Empty / 空状态**
   - 无数据或初始状态
   - 占位符展示

3. **Loading / 加载状态**
   - 数据获取中的状态
   - Skeleton 或 Spinner 展示

4. **Error / 错误状态**
   - 出错时的展示
   - 错误提示信息

5. **Disabled / 禁用状态**
   - 不可交互时的视觉反馈

### 扩展覆盖集（Extended Coverage）

根据组件复杂度，可能需要添加：

6. **Interactive / 交互变体**
   - Hover、Focus、Active 等交互状态
   - 使用 Storybook Actions 记录用户操作

7. **Edge Cases / 边缘情况**
   - 超长文本、极小尺寸、极大数据量等极端场景
   - 帮助发现布局破坏和性能问题

8. **Responsive / 响应式状态**
   - 不同屏幕尺寸下的展示
   - 使用 Storybook Viewport 插件测试

9. **Theme Variants / 主题变体**
   - 亮色模式与暗色模式
   - 不同品牌主题（如有）

## Story 编写规范

### 文件结构

```
src/components/
  ├─ atoms/
  │   ├─ AppButton.vue
  │   └─ AppButton.stories.ts    // Stories 文件与组件同级
  ├─ chat/
  │   ├─ input/
  │   │   ├─ ModernChatInput.vue
  │   │   └─ ModernChatInput.stories.ts
  └─ ...
```

### Story 命名规范

```typescript
// ✅ 推荐：清晰的状态描述
export const Default: Story = { ... }
export const WithLongText: Story = { ... }
export const Loading: Story = { ... }
export const Error: Story = { ... }
export const Disabled: Story = { ... }

// ❌ 避免：模糊的命名
export const Test1: Story = { ... }
export const Example: Story = { ... }
export const Temp: Story = { ... }
```

### Args 最佳实践

```typescript
// ✅ 使用 Args 控制组件状态，便于交互式调试
export const Default: Story = {
  args: {
    modelValue: 'Hello World',
    placeholder: 'Type a message...',
    disabled: false,
    loading: false,
  },
}

// ✅ 使用 argTypes 提供控件配置
export default {
  component: ModernChatInput,
  argTypes: {
    modelValue: { control: 'text' },
    disabled: { control: 'boolean' },
    generationStatus: {
      control: 'select',
      options: ['idle', 'sending', 'receiving'],
    },
  },
} satisfies Meta<typeof ModernChatInput>
```

### 使用 Actions 记录事件

```typescript
// ✅ 记录所有用户交互事件
export const Default: Story = {
  args: {
    onSubmit: fn(),           // Storybook 8+ 使用 fn()
    onInput: fn(),
    onFocus: fn(),
    onBlur: fn(),
  },
}
```

### Decorators 使用场景

```typescript
// ✅ 为需要特定上下文的组件提供装饰器
export default {
  component: ChatMessageItem,
  decorators: [
    // 提供 Pinia Store
    (story) => ({
      components: { story },
      template: '<div class="p-4 bg-gray-100 dark:bg-gray-900"><story /></div>',
      setup() {
        const pinia = createPinia()
        return { pinia }
      },
    }),
  ],
} satisfies Meta<typeof ChatMessageItem>
```

## 开发工作流

### 1. 组件开发前：定义 Stories

**TDD 方法**：先写 stories，再实现组件

```bash
# 1. 创建 story 文件，定义预期状态
touch src/components/atoms/NewComponent.stories.ts

# 2. 运行 Storybook
npm run storybook

# 3. 实现组件，直到 stories 中的所有状态都正确展示
```

### 2. 组件开发中：使用 Storybook 调试

- 在 Storybook 中调整 Args，实时查看组件变化
- 使用浏览器 DevTools 检查样式和布局
- 使用 Actions 面板验证事件触发

### 3. 组件开发后：Story Review

**代码审查清单**：

- [ ] 是否包含所有最小覆盖集的 stories？
- [ ] 是否覆盖了组件的所有 props 变体？
- [ ] 是否测试了亮色/暗色主题？
- [ ] 是否使用了 Actions 记录关键事件？
- [ ] 是否添加了必要的 JSDoc 文档？

### 4. 持续维护：保持同步

- 修改组件时，同步更新对应的 stories
- 定期运行 Storybook 构建，检查是否有破坏性变更
- 使用 Chromatic 或类似工具进行视觉回归测试

## 可访问性（Accessibility）测试

利用 Storybook 的 `@storybook/addon-a11y` 插件：

```typescript
// .storybook/main.ts
export default {
  addons: [
    '@storybook/addon-a11y',  // 自动检测可访问性问题
  ],
}
```

每个 story 都会自动进行：
- ARIA 属性检查
- 键盘导航测试
- 颜色对比度检查
- 语义化 HTML 验证

## 集成测试策略

### 单元测试 + Storybook

```typescript
// tests/unit/components/AppButton.test.ts
import { composeStories } from '@storybook/vue3'
import * as stories from '@/components/atoms/AppButton.stories'

const { Default, Disabled, Loading } = composeStories(stories)

describe('AppButton', () => {
  it('renders default state correctly', () => {
    const { container } = render(Default())
    expect(container.querySelector('button')).toBeTruthy()
  })

  it('disables interaction when disabled', async () => {
    const { container } = render(Disabled())
    const button = container.querySelector('button')
    expect(button).toHaveAttribute('disabled')
  })
})
```

**优势**：
- 复用 Storybook 中定义的状态，避免重复 mock 数据
- 测试与文档保持同步

## 常见问题与解决方案

### Q: 组件依赖 Pinia Store，如何在 Storybook 中测试？

```typescript
// ✅ 方案 1: 使用 Decorator 提供 Store
export default {
  component: MyComponent,
  decorators: [
    (story) => ({
      components: { story },
      setup() {
        const pinia = createPinia()
        const store = useMyStore(pinia)
        // 设置测试数据
        store.data = mockData
        return { pinia }
      },
      template: '<Suspense><story /></Suspense>',
    }),
  ],
}

// ✅ 方案 2: Mock Store（适用于简单场景）
vi.mock('@/stores/myStore', () => ({
  useMyStore: () => ({
    data: mockData,
    action: vi.fn(),
  }),
}))
```

### Q: 如何测试依赖 IPC 通信的组件？

```typescript
// ✅ Mock electronBridge
export default {
  component: MyComponent,
  decorators: [
    (story) => ({
      components: { story },
      setup() {
        // Mock IPC 调用
        window.electronBridge = {
          queryDb: vi.fn().mockResolvedValue(mockData),
          invoke: vi.fn(),
        }
      },
      template: '<story />',
    }),
  ],
}
```

### Q: 组件太复杂，难以在 Storybook 中隔离测试？

**这通常是组件拆分不合理的信号**：

1. **检查职责单一性**：组件是否承担了过多职责？
2. **提取子组件**：将复杂组件拆分为多个小组件，分别创建 stories
3. **使用 Composition API**：将逻辑抽取到 Composables，单独测试

## 参考资源

- [Storybook 官方文档](https://storybook.js.org/docs/vue/get-started/introduction)
- [Component Story Format (CSF)](https://storybook.js.org/docs/vue/api/csf)
- [Storybook Testing Best Practices](https://storybook.js.org/docs/vue/writing-tests/introduction)
- 项目内参考: `docs/STORYBOOK_PHASE2_COMPLETE.md`

## 总结

遵循本指南，确保：

✅ **核心组件必有 Stories**：所有高频/核心交互组件都在 Storybook 中有完整覆盖  
✅ **Storybook 即文档**：开发者通过 Storybook 了解组件 API 和用法  
✅ **Storybook 即测试**：视觉回归测试和单元测试都基于 Storybook stories  
✅ **持续同步**：组件变更时立即更新对应的 stories

**Storybook 不是可选项，而是开发流程的核心部分。**
