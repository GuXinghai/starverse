# Starverse UI 组件库重构 - 阶段三：具体实现计划

> **项目管理角色**: 技术项目经理 + 前端架构师  
> **计划日期**: 2025年11月28日  
> **预计总工时**: 80-100 小时  
> **建议团队**: 2-3 名前端工程师  

---

## 目录

1. [整体实施策略](#整体实施策略)
2. [Phase 0: 基础设施搭建](#phase-0-基础设施搭建)
3. [Phase 1: 原子组件实现](#phase-1-原子组件实现)
4. [Phase 2: 分子组件实现](#phase-2-分子组件实现)
5. [Phase 3: 有机体组件重构](#phase-3-有机体组件重构)
6. [Phase 4: 集成与迁移](#phase-4-集成与迁移)
7. [风险管理与质量保证](#风险管理与质量保证)

---

## 整体实施策略

### 原则

1. **自下而上 (Bottom-up)**: 先实现原子组件,再组合成复杂组件
2. **测试驱动 (TDD)**: 先写测试,再写实现
3. **增量迁移**: 新旧组件并存,逐步替换
4. **持续集成**: 每个 Phase 结束后都可以合并主分支

### 分支策略

```
main
├── feature/ui-refactor-phase0-infra      # 基础设施
├── feature/ui-refactor-phase1-atoms      # 原子组件
├── feature/ui-refactor-phase2-molecules  # 分子组件
├── feature/ui-refactor-phase3-organisms  # 有机体组件
└── feature/ui-refactor-phase4-migration  # 迁移旧代码
```

### 时间线

| Phase | 任务 | 工时 | 里程碑 |
|-------|------|------|--------|
| Phase 0 | 基础设施 | 8h | Storybook + 测试框架可用 |
| Phase 1 | 原子组件 | 24h | Button, Dialog, Input 完成 |
| Phase 2 | 分子组件 | 20h | Select, ScrollingText 完成 |
| Phase 3 | 有机体组件 | 32h | ModelPicker 重构完成 |
| Phase 4 | 迁移与清理 | 16h | 旧组件全部替换 |
| **总计** | | **100h** | 2.5 周 (4 人) |

---

## Phase 0: 基础设施搭建

**目标**: 搭建组件开发、测试、文档化的基础设施

**工时**: 8 小时 (1 天)

### Checklist

#### 1. 配置 Storybook (3h)

- [ ] **安装依赖**
  ```bash
  npm install -D @storybook/vue3 @storybook/addon-essentials @storybook/addon-a11y
  ```

- [ ] **创建配置文件**
  ```typescript
  // .storybook/main.ts
  import type { StorybookConfig } from '@storybook/vue3-vite'
  
  const config: StorybookConfig = {
    stories: ['../src/components/**/*.stories.ts'],
    addons: [
      '@storybook/addon-essentials',
      '@storybook/addon-a11y',
      '@storybook/addon-interactions'
    ],
    framework: '@storybook/vue3-vite',
    docs: {
      autodocs: 'tag'
    }
  }
  
  export default config
  ```

- [ ] **配置 Tailwind 支持**
  ```typescript
  // .storybook/preview.ts
  import '../src/assets/main.css'  // Tailwind 样式
  
  export const parameters = {
    controls: {
      matchers: {
        color: /(background|color)$/i,
        date: /Date$/
      }
    }
  }
  ```

- [ ] **添加 npm script**
  ```json
  {
    "scripts": {
      "storybook": "storybook dev -p 6006",
      "build-storybook": "storybook build"
    }
  }
  ```

- [ ] **验证**: 运行 `npm run storybook`,确保能正常启动

---

#### 2. 增强测试配置 (2h)

- [ ] **安装测试依赖**
  ```bash
  npm install -D @testing-library/vue @testing-library/user-event @axe-core/playwright
  ```

- [ ] **创建测试工具函数**
  ```typescript
  // tests/utils/test-utils.ts
  import { render, RenderOptions } from '@testing-library/vue'
  import { axe, toHaveNoViolations } from 'jest-axe'
  
  expect.extend(toHaveNoViolations)
  
  /**
   * 自定义渲染函数,自动注入全局配置
   */
  export function renderWithProviders(
    component: any,
    options?: RenderOptions
  ) {
    return render(component, {
      global: {
        // 注入全局插件
      },
      ...options
    })
  }
  
  /**
   * 无障碍性测试工具
   */
  export async function testAccessibility(container: HTMLElement) {
    const results = await axe(container)
    expect(results).toHaveNoViolations()
  }
  ```

- [ ] **更新 vitest.config.ts**
  ```typescript
  import { defineConfig } from 'vitest/config'
  
  export default defineConfig({
    test: {
      globals: true,
      environment: 'jsdom',
      setupFiles: ['./tests/setup.ts'],
      coverage: {
        provider: 'v8',
        reporter: ['text', 'html', 'lcov'],
        exclude: [
          'node_modules/',
          'tests/',
          '**/*.stories.ts'
        ]
      }
    }
  })
  ```

---

#### 3. 创建组件目录结构 (1h)

- [ ] **创建新的组件目录**
  ```bash
  mkdir -p src/components/atoms
  mkdir -p src/components/molecules
  mkdir -p src/components/organisms
  mkdir -p src/components/templates
  ```

- [ ] **创建索引文件**
  ```typescript
  // src/components/atoms/index.ts
  export * from './Button'
  export * from './Dialog'
  export * from './Input'
  ```

---

#### 4. 配置 Design Tokens (2h)

- [ ] **扩展 Tailwind 配置**
  ```javascript
  // tailwind.config.js
  module.exports = {
    theme: {
      extend: {
        colors: {
          primary: {
            50: '#eff6ff',
            100: '#dbeafe',
            // ... 其他色阶
            900: '#1e3a8a'
          },
          // 定义语义化颜色
          brand: {
            primary: 'var(--color-primary)',
            secondary: 'var(--color-secondary)'
          }
        },
        spacing: {
          // 统一间距系统
        },
        borderRadius: {
          sm: '0.25rem',
          DEFAULT: '0.5rem',
          lg: '0.75rem',
          xl: '1rem'
        },
        fontSize: {
          // 字体大小系统
        }
      }
    },
    plugins: [
      require('@tailwindcss/forms'),
      require('@tailwindcss/typography')
    ]
  }
  ```

- [ ] **创建 CSS 变量**
  ```css
  /* src/assets/design-tokens.css */
  :root {
    /* 颜色 */
    --color-primary: theme('colors.blue.500');
    --color-secondary: theme('colors.gray.500');
    --color-danger: theme('colors.red.500');
    --color-success: theme('colors.green.500');
    
    /* 阴影 */
    --shadow-sm: 0 1px 2px 0 rgb(0 0 0 / 0.05);
    --shadow-md: 0 4px 6px -1px rgb(0 0 0 / 0.1);
    
    /* 过渡 */
    --transition-fast: 150ms cubic-bezier(0.4, 0, 0.2, 1);
    --transition-base: 200ms cubic-bezier(0.4, 0, 0.2, 1);
  }
  ```

---

## Phase 1: 原子组件实现

**目标**: 实现 Button, Dialog, Input 等基础组件

**工时**: 24 小时 (3 天)

### 1. Button 组件 (6h)

#### Step 1: 核心逻辑实现 (2h)

- [ ] **创建类型定义**
  ```typescript
  // src/components/atoms/Button/Button.types.ts
  // (从 Phase 2 API 设计文档复制)
  ```

- [ ] **实现 Composable**
  ```typescript
  // src/components/atoms/Button/useButton.ts
  export function useButton(props: ButtonProps) {
    // 实现逻辑 (从 Phase 2 文档复制)
  }
  ```

- [ ] **编写单元测试**
  ```typescript
  // src/components/atoms/Button/useButton.test.ts
  import { describe, it, expect } from 'vitest'
  import { useButton } from './useButton'
  
  describe('useButton', () => {
    it('should compute correct classes for primary variant', () => {
      const { classes } = useButton({ variant: 'primary' })
      expect(classes.value).toContain('bg-blue-500')
    })
    
    it('should disable button when loading', () => {
      const { isInteractive } = useButton({ loading: true })
      expect(isInteractive.value).toBe(false)
    })
  })
  ```

- [ ] **运行测试**: `npm test useButton`

---

#### Step 2: UI 组件实现 (2h)

- [ ] **创建 Button.vue**
  ```vue
  <!-- src/components/atoms/Button/Button.vue -->
  <script setup lang="ts">
  import { computed } from 'vue'
  import type { ButtonProps, ButtonEmits } from './Button.types'
  import { useButton } from './useButton'
  
  const props = withDefaults(defineProps<ButtonProps>(), {
    variant: 'primary',
    size: 'md',
    type: 'button',
    as: 'button'
  })
  
  const emit = defineEmits<ButtonEmits>()
  
  const { isInteractive, ariaAttrs, classes } = useButton(props)
  
  const handleClick = (e: MouseEvent) => {
    if (isInteractive.value) {
      emit('click', e)
    }
  }
  </script>
  
  <template>
    <component
      :is="as"
      :type="type"
      :class="classes"
      v-bind="ariaAttrs"
      @click="handleClick"
    >
      <!-- 左侧图标 -->
      <slot name="left-icon">
        <component v-if="leftIcon" :is="leftIcon" class="mr-2" />
      </slot>
      
      <!-- 加载中 -->
      <slot v-if="loading" name="loading">
        <svg class="animate-spin h-4 w-4 mr-2" viewBox="0 0 24 24">
          <circle class="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" stroke-width="4" fill="none" />
          <path class="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z" />
        </svg>
      </slot>
      
      <!-- 默认内容 -->
      <slot />
      
      <!-- 右侧图标 -->
      <slot name="right-icon">
        <component v-if="rightIcon" :is="rightIcon" class="ml-2" />
      </slot>
    </component>
  </template>
  ```

- [ ] **编写组件测试**
  ```typescript
  // src/components/atoms/Button/Button.test.ts
  import { describe, it, expect, vi } from 'vitest'
  import { render, screen, fireEvent } from '@testing-library/vue'
  import Button from './Button.vue'
  import { testAccessibility } from '@/tests/utils/test-utils'
  
  describe('Button', () => {
    it('renders with default props', () => {
      render(Button, { slots: { default: 'Click me' } })
      expect(screen.getByText('Click me')).toBeInTheDocument()
    })
    
    it('emits click event when clicked', async () => {
      const onClick = vi.fn()
      render(Button, {
        props: { onClick },
        slots: { default: 'Click me' }
      })
      
      await fireEvent.click(screen.getByText('Click me'))
      expect(onClick).toHaveBeenCalledTimes(1)
    })
    
    it('does not emit click when disabled', async () => {
      const onClick = vi.fn()
      render(Button, {
        props: { disabled: true, onClick },
        slots: { default: 'Click me' }
      })
      
      await fireEvent.click(screen.getByText('Click me'))
      expect(onClick).not.toHaveBeenCalled()
    })
    
    it('passes accessibility check', async () => {
      const { container } = render(Button, {
        slots: { default: 'Accessible button' }
      })
      await testAccessibility(container)
    })
  })
  ```

- [ ] **运行测试**: `npm test Button`

---

#### Step 3: Storybook 文档 (1h)

- [ ] **创建 Stories**
  ```typescript
  // src/components/atoms/Button/Button.stories.ts
  import type { Meta, StoryObj } from '@storybook/vue3'
  import Button from './Button.vue'
  
  const meta: Meta<typeof Button> = {
    title: 'Atoms/Button',
    component: Button,
    tags: ['autodocs'],
    argTypes: {
      variant: {
        control: 'select',
        options: ['primary', 'secondary', 'ghost', 'danger', 'success']
      },
      size: {
        control: 'select',
        options: ['sm', 'md', 'lg']
      }
    }
  }
  
  export default meta
  type Story = StoryObj<typeof Button>
  
  export const Primary: Story = {
    args: {
      variant: 'primary',
      children: 'Primary Button'
    }
  }
  
  export const WithLeftIcon: Story = {
    args: {
      variant: 'primary',
      children: 'Save'
    },
    render: (args) => ({
      components: { Button },
      setup() {
        return { args }
      },
      template: `
        <Button v-bind="args">
          <template #left-icon>
            <svg class="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M5 13l4 4L19 7" />
            </svg>
          </template>
          {{ args.children }}
        </Button>
      `
    })
  }
  
  export const Loading: Story = {
    args: {
      variant: 'primary',
      loading: true,
      children: 'Loading...'
    }
  }
  
  export const AllVariants: Story = {
    render: () => ({
      components: { Button },
      template: `
        <div class="space-y-4">
          <div class="space-x-2">
            <Button variant="primary">Primary</Button>
            <Button variant="secondary">Secondary</Button>
            <Button variant="ghost">Ghost</Button>
            <Button variant="danger">Danger</Button>
            <Button variant="success">Success</Button>
          </div>
          <div class="space-x-2">
            <Button size="sm">Small</Button>
            <Button size="md">Medium</Button>
            <Button size="lg">Large</Button>
          </div>
          <div class="space-x-2">
            <Button disabled>Disabled</Button>
            <Button loading>Loading</Button>
          </div>
        </div>
      `
    })
  }
  ```

- [ ] **查看效果**: `npm run storybook`

---

#### Step 4: 导出与文档 (1h)

- [ ] **创建索引文件**
  ```typescript
  // src/components/atoms/Button/index.ts
  export { default as Button } from './Button.vue'
  export * from './Button.types'
  export { useButton } from './useButton'
  ```

- [ ] **更新主索引**
  ```typescript
  // src/components/atoms/index.ts
  export * from './Button'
  ```

- [ ] **编写 README**
  ```markdown
  <!-- src/components/atoms/Button/README.md -->
  # Button 组件
  
  ## 使用示例
  
  \`\`\`vue
  <Button variant="primary" @click="handleClick">
    Click me
  </Button>
  \`\`\`
  
  ## API
  
  ### Props
  
  | 名称 | 类型 | 默认值 | 说明 |
  |------|------|--------|------|
  | variant | ButtonVariant | 'primary' | 按钮变体 |
  | size | ButtonSize | 'md' | 按钮尺寸 |
  | disabled | boolean | false | 是否禁用 |
  | loading | boolean | false | 是否加载中 |
  
  ### Events
  
  | 名称 | 参数 | 说明 |
  |------|------|------|
  | click | MouseEvent | 点击事件 |
  
  ## 无障碍性
  
  - 自动设置 `aria-disabled`
  - 自动设置 `aria-busy`
  - 支持键盘导航
  ```

---

### 2. Dialog 组件 (10h)

Dialog 是最复杂的原子组件,需要更多时间。

#### Step 1: 核心逻辑 - useDialog (3h)

- [ ] **安装依赖**
  ```bash
  npm install @vueuse/core
  ```

- [ ] **实现 useDialog.ts**
  ```typescript
  // src/components/atoms/Dialog/useDialog.ts
  // (从 Phase 2 API 设计复制并完善)
  ```

- [ ] **编写单元测试**
  ```typescript
  // src/components/atoms/Dialog/useDialog.test.ts
  describe('useDialog', () => {
    it('should handle open/close state', () => {
      const emit = vi.fn()
      const { isOpen, open, close } = useDialog({}, emit)
      
      expect(isOpen.value).toBe(false)
      
      open()
      expect(isOpen.value).toBe(true)
      expect(emit).toHaveBeenCalledWith('update:open', true)
      
      close()
      expect(isOpen.value).toBe(false)
    })
    
    it('should lock body scroll when open', () => {
      const { isOpen } = useDialog({ open: true }, vi.fn())
      expect(document.body.style.overflow).toBe('hidden')
    })
  })
  ```

---

#### Step 2: 子组件实现 (4h)

- [ ] **Dialog.vue (根组件)**
  ```vue
  <script setup lang="ts">
  import { provide } from 'vue'
  import type { DialogProps, DialogEmits } from './Dialog.types'
  import { useDialog } from './useDialog'
  
  const props = withDefaults(defineProps<DialogProps>(), {
    modal: true,
    closeOnOverlayClick: true,
    closeOnEsc: true,
    destroyOnClose: false
  })
  
  const emit = defineEmits<DialogEmits>()
  
  const dialog = useDialog(props, emit)
  
  // 通过 Provide/Inject 共享状态
  provide('dialog', dialog)
  </script>
  
  <template>
    <Teleport to="body">
      <slot v-if="dialog.isOpen.value || !destroyOnClose" :close="dialog.close" />
    </Teleport>
  </template>
  ```

- [ ] **DialogOverlay.vue**
  ```vue
  <script setup lang="ts">
  import { inject } from 'vue'
  import { Transition } from 'vue'
  
  const dialog = inject('dialog')
  
  const handleClick = () => {
    if (dialog.props.closeOnOverlayClick) {
      dialog.close()
    }
  }
  </script>
  
  <template>
    <Transition
      enter-active-class="transition-opacity duration-200"
      enter-from-class="opacity-0"
      leave-active-class="transition-opacity duration-200"
      leave-to-class="opacity-0"
    >
      <div
        v-if="dialog.isOpen.value"
        class="fixed inset-0 bg-black/50 z-40"
        @click="handleClick"
        aria-hidden="true"
      />
    </Transition>
  </template>
  ```

- [ ] **DialogContent.vue**
  ```vue
  <script setup lang="ts">
  import { inject, onMounted } from 'vue'
  
  const dialog = inject('dialog')
  
  onMounted(() => {
    // 设置初始焦点
    dialog.dialogRef.value?.focus()
  })
  </script>
  
  <template>
    <Transition
      enter-active-class="transition-all duration-200"
      enter-from-class="opacity-0 scale-95"
      leave-active-class="transition-all duration-200"
      leave-to-class="opacity-0 scale-95"
    >
      <div
        v-if="dialog.isOpen.value"
        ref="dialog.dialogRef"
        role="dialog"
        aria-modal="true"
        :aria-labelledby="dialog.titleId"
        class="fixed inset-0 z-50 flex items-center justify-center p-4"
        tabindex="-1"
      >
        <div
          class="bg-white rounded-xl shadow-2xl max-w-lg w-full max-h-[90vh] overflow-auto"
          @click.stop
        >
          <slot />
        </div>
      </div>
    </Transition>
  </template>
  ```

- [ ] **DialogHeader.vue, DialogTitle.vue, DialogFooter.vue** (简单布局组件)

---

#### Step 3: 集成测试 (2h)

- [ ] **编写集成测试**
  ```typescript
  // src/components/atoms/Dialog/Dialog.test.ts
  import { describe, it, expect, vi } from 'vitest'
  import { render, screen, fireEvent, waitFor } from '@testing-library/vue'
  import {
    Dialog,
    DialogContent,
    DialogHeader,
    DialogTitle,
    DialogFooter
  } from './index'
  import Button from '../Button/Button.vue'
  
  describe('Dialog', () => {
    it('renders when open', async () => {
      render({
        components: { Dialog, DialogContent, DialogTitle },
        template: `
          <Dialog :open="true">
            <DialogContent>
              <DialogTitle>Test Dialog</DialogTitle>
            </DialogContent>
          </Dialog>
        `
      })
      
      await waitFor(() => {
        expect(screen.getByText('Test Dialog')).toBeInTheDocument()
      })
    })
    
    it('closes when overlay is clicked', async () => {
      const onClose = vi.fn()
      render({
        components: { Dialog, DialogContent },
        setup() {
          return { onClose }
        },
        template: `
          <Dialog :open="true" @update:open="onClose">
            <DialogContent>Content</DialogContent>
          </Dialog>
        `
      })
      
      const overlay = document.querySelector('.bg-black\\/50')
      await fireEvent.click(overlay!)
      
      expect(onClose).toHaveBeenCalledWith(false)
    })
    
    it('closes on ESC key', async () => {
      const onClose = vi.fn()
      render({
        components: { Dialog, DialogContent },
        setup() {
          return { onClose }
        },
        template: `
          <Dialog :open="true" @update:open="onClose">
            <DialogContent>Content</DialogContent>
          </Dialog>
        `
      })
      
      await fireEvent.keyDown(document, { key: 'Escape' })
      expect(onClose).toHaveBeenCalledWith(false)
    })
    
    it('traps focus inside dialog', async () => {
      render({
        components: { Dialog, DialogContent, Button },
        template: `
          <Dialog :open="true">
            <DialogContent>
              <Button id="btn1">Button 1</Button>
              <Button id="btn2">Button 2</Button>
            </DialogContent>
          </Dialog>
        `
      })
      
      const btn1 = screen.getByText('Button 1')
      const btn2 = screen.getByText('Button 2')
      
      btn2.focus()
      await fireEvent.keyDown(document.activeElement!, { key: 'Tab' })
      
      // 应该循环回第一个按钮
      expect(document.activeElement).toBe(btn1)
    })
  })
  ```

---

#### Step 4: Storybook 文档 (1h)

- [ ] **创建 Dialog.stories.ts**
  ```typescript
  export const BasicDialog: Story = {
    render: () => ({
      components: { Dialog, DialogTrigger, DialogContent, DialogTitle, Button },
      setup() {
        const isOpen = ref(false)
        return { isOpen }
      },
      template: `
        <div>
          <Button @click="isOpen = true">Open Dialog</Button>
          
          <Dialog v-model:open="isOpen">
            <DialogContent>
              <DialogTitle>Dialog Title</DialogTitle>
              <p>This is the dialog content.</p>
              <Button @click="isOpen = false">Close</Button>
            </DialogContent>
          </Dialog>
        </div>
      `
    })
  }
  ```

---

### 3. Input 组件 (8h)

实现流程与 Button 类似,包含:
- [ ] Step 1: 核心逻辑 (2h)
- [ ] Step 2: UI 实现 (3h)
- [ ] Step 3: 测试 (2h)
- [ ] Step 4: Storybook (1h)

**特殊注意事项**:
- 需要处理受控/非受控模式
- 验证错误显示
- 左右插槽布局

---

## Phase 2: 分子组件实现

**目标**: 实现 Select, ScrollingText 等复合组件

**工时**: 20 小时 (2.5 天)

### 1. Select 组件 (12h)

Select 是最复杂的分子组件,涉及下拉菜单、键盘导航、搜索等功能。

#### Step 1: 无头逻辑 - useSelect (4h)

- [ ] **实现 useSelect.ts**
  ```typescript
  // src/components/molecules/Select/useSelect.ts
  export function useSelect<T>(props: SelectProps<T>) {
    const isOpen = ref(false)
    const selectedValue = ref<T | undefined>(props.modelValue)
    const searchQuery = ref('')
    const activeIndex = ref(-1)
    
    // 过滤选项
    const filteredOptions = computed(() => {
      if (!props.searchable || !searchQuery.value) {
        return props.options
      }
      return props.options?.filter(opt => 
        opt.label.toLowerCase().includes(searchQuery.value.toLowerCase())
      )
    })
    
    // 键盘导航
    const handleKeydown = (e: KeyboardEvent) => {
      switch (e.key) {
        case 'ArrowDown':
          e.preventDefault()
          activeIndex.value = Math.min(
            activeIndex.value + 1,
            filteredOptions.value.length - 1
          )
          break
        case 'ArrowUp':
          e.preventDefault()
          activeIndex.value = Math.max(activeIndex.value - 1, 0)
          break
        case 'Enter':
          e.preventDefault()
          if (activeIndex.value >= 0) {
            selectOption(filteredOptions.value[activeIndex.value])
          }
          break
        case 'Escape':
          close()
          break
      }
    }
    
    const selectOption = (option: SelectOption<T>) => {
      selectedValue.value = option.value
      emit('update:modelValue', option.value)
      emit('change', option.value)
      close()
    }
    
    return {
      isOpen,
      selectedValue,
      searchQuery,
      activeIndex,
      filteredOptions,
      open: () => isOpen.value = true,
      close: () => isOpen.value = false,
      toggle: () => isOpen.value = !isOpen.value,
      selectOption,
      handleKeydown
    }
  }
  ```

- [ ] **编写测试**
  ```typescript
  describe('useSelect', () => {
    it('should filter options when searchable', () => {
      const options = [
        { value: '1', label: 'Apple' },
        { value: '2', label: 'Banana' }
      ]
      const { searchQuery, filteredOptions } = useSelect({
        searchable: true,
        options
      })
      
      searchQuery.value = 'app'
      expect(filteredOptions.value).toHaveLength(1)
      expect(filteredOptions.value[0].label).toBe('Apple')
    })
    
    it('should navigate with arrow keys', () => {
      const { activeIndex, handleKeydown } = useSelect({ options: [{}, {}] })
      
      handleKeydown(new KeyboardEvent('keydown', { key: 'ArrowDown' }))
      expect(activeIndex.value).toBe(0)
      
      handleKeydown(new KeyboardEvent('keydown', { key: 'ArrowDown' }))
      expect(activeIndex.value).toBe(1)
    })
  })
  ```

---

#### Step 2: 子组件实现 (5h)

- [ ] **SelectTrigger.vue**
  ```vue
  <script setup lang="ts">
  import { inject, computed } from 'vue'
  
  const select = inject('select')
  
  const displayText = computed(() => {
    const selectedOption = select.props.options?.find(
      opt => opt.value === select.selectedValue.value
    )
    return selectedOption?.label || select.props.placeholder || '请选择'
  })
  </script>
  
  <template>
    <button
      type="button"
      :class="[
        'flex items-center justify-between w-full px-4 py-2',
        'bg-white border border-gray-300 rounded-lg',
        'hover:border-blue-500 focus:ring-2 focus:ring-blue-500',
        'transition-colors'
      ]"
      :aria-expanded="select.isOpen.value"
      :aria-haspopup="true"
      @click="select.toggle"
    >
      <slot>
        <span>{{ displayText }}</span>
      </slot>
      
      <svg
        :class="[
          'w-4 h-4 transition-transform',
          { 'rotate-180': select.isOpen.value }
        ]"
        fill="none"
        stroke="currentColor"
        viewBox="0 0 24 24"
      >
        <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M19 9l-7 7-7-7" />
      </svg>
    </button>
  </template>
  ```

- [ ] **SelectContent.vue** (下拉菜单容器)
- [ ] **SelectItem.vue** (选项项)
- [ ] **SelectGroup.vue** (分组)

---

#### Step 3: 集成测试 (2h)

- [ ] **编写 E2E 测试**
  ```typescript
  describe('Select Integration', () => {
    it('should select option on click', async () => {
      const onSelect = vi.fn()
      render({
        components: { Select, SelectTrigger, SelectContent, SelectItem },
        setup() {
          return { onSelect }
        },
        template: `
          <Select @change="onSelect">
            <SelectTrigger />
            <SelectContent>
              <SelectItem value="1">Option 1</SelectItem>
              <SelectItem value="2">Option 2</SelectItem>
            </SelectContent>
          </Select>
        `
      })
      
      await fireEvent.click(screen.getByRole('button'))
      await fireEvent.click(screen.getByText('Option 1'))
      
      expect(onSelect).toHaveBeenCalledWith('1')
    })
  })
  ```

---

#### Step 4: Storybook (1h)

---

### 2. ScrollingText 组件 (8h)

这是重构 `FavoriteModelSelector` 中滚动逻辑的独立组件。

#### Step 1: 核心逻辑 (3h)

- [ ] **实现 useScrollingText.ts**
  ```typescript
  // src/components/molecules/ScrollingText/useScrollingText.ts
  // (从 Phase 2 API 设计复制)
  ```

- [ ] **编写测试**
  ```typescript
  describe('useScrollingText', () => {
    it('should detect text overflow', () => {
      const { detectOverflow, isOverflowing } = useScrollingText({
        text: 'Very long text that will overflow',
        autoDetect: true
      })
      
      // Mock DOM measurements
      vi.spyOn(HTMLElement.prototype, 'offsetWidth', 'get')
        .mockReturnValueOnce(100)  // container
        .mockReturnValueOnce(200)  // text
      
      detectOverflow()
      expect(isOverflowing.value).toBe(true)
    })
  })
  ```

---

#### Step 2: UI 实现 (3h)

- [ ] **ScrollingText.vue**
  ```vue
  <script setup lang="ts">
  import { useScrollingText } from './useScrollingText'
  import type { ScrollingTextProps } from './ScrollingText.types'
  
  const props = withDefaults(defineProps<ScrollingTextProps>(), {
    speed: 50,
    delay: 500,
    gap: 40,
    autoDetect: true,
    forceScroll: false,
    paused: false
  })
  
  const {
    containerRef,
    textRef,
    shouldScroll,
    animationParams,
    isPaused
  } = useScrollingText(props)
  </script>
  
  <template>
    <div ref="containerRef" class="overflow-hidden">
      <!-- 滚动模式 -->
      <div
        v-if="shouldScroll"
        class="inline-flex whitespace-nowrap"
        :class="{ 'animation-paused': isPaused }"
        :style="{
          animation: `marquee ${animationParams.totalTime}ms linear infinite`
        }"
      >
        <span ref="textRef" class="inline-block">{{ text }}</span>
        <span class="inline-block" :style="{ width: `${animationParams.gap}px` }" />
        <span class="inline-block">{{ text }}</span>
      </div>
      
      <!-- 静态模式 -->
      <div v-else class="truncate">
        <span ref="textRef">{{ text }}</span>
      </div>
    </div>
  </template>
  
  <style scoped>
  @keyframes marquee {
    0%, 10% {
      transform: translateX(0);
    }
    90%, 100% {
      transform: translateX(calc(-100% - var(--gap)));
    }
  }
  
  .animation-paused {
    animation-play-state: paused !important;
  }
  </style>
  ```

---

#### Step 3: 测试与文档 (2h)

---

## Phase 3: 有机体组件重构

**目标**: 重构 ModelPicker 和 FavoriteModelSelector

**工时**: 32 小时 (4 天)

### 1. ModelPicker 组件 (20h)

这是重构 `AdvancedModelPickerModal.vue` (1520 行) 的关键阶段。

#### Step 1: 拆分子组件 (8h)

- [ ] **ModelCard.vue** (4h)
  - 单个模型卡片
  - 展开/收起描述
  - 收藏按钮
  - 选中状态

- [ ] **FilterGroup.vue** (2h)
  - 可复用的筛选器组
  - 标签按钮
  - 清除按钮

- [ ] **ModelPickerSearch.vue** (1h)
  - 搜索输入框
  - 清除按钮

- [ ] **ModelPickerFilters.vue** (1h)
  - 筛选器容器
  - 厂商、模态性筛选

---

#### Step 2: 主容器组件 (6h)

- [ ] **ModelPicker.vue**
  ```vue
  <script setup lang="ts">
  import { provide } from 'vue'
  import type { ModelPickerProps, ModelPickerEmits } from './ModelPicker.types'
  import { useModelFiltering } from './useModelFiltering'
  import { Dialog, DialogContent } from '@/components/atoms/Dialog'
  import ModelPickerSearch from './ModelPickerSearch.vue'
  import ModelPickerFilters from './ModelPickerFilters.vue'
  import ModelPickerList from './ModelPickerList.vue'
  
  const props = withDefaults(defineProps<ModelPickerProps>(), {
    virtualScroll: true
  })
  
  const emit = defineEmits<ModelPickerEmits>()
  
  const filtering = useModelFiltering(toRef(props, 'models'))
  
  provide('modelPicker', {
    ...filtering,
    selectModel: (id: string) => emit('select', id),
    toggleFavorite: (id: string) => emit('toggle-favorite', id)
  })
  </script>
  
  <template>
    <Dialog :open="open" @update:open="$emit('update:open', $event)">
      <DialogContent class="max-w-6xl h-[80vh]">
        <div class="flex h-full">
          <!-- 左侧：搜索和筛选 -->
          <div class="w-64 border-r border-gray-200 p-4 overflow-auto">
            <slot name="search">
              <ModelPickerSearch v-model="filtering.searchQuery.value" />
            </slot>
            
            <div class="mt-4">
              <slot name="filters">
                <ModelPickerFilters />
              </slot>
            </div>
          </div>
          
          <!-- 右侧：模型列表 -->
          <div class="flex-1 p-4 overflow-auto">
            <slot name="list">
              <ModelPickerList
                :models="filtering.sortedModels.value"
                :selected-id="selectedModelId"
                :favorite-ids="favoriteModelIds"
              />
            </slot>
          </div>
        </div>
      </DialogContent>
    </Dialog>
  </template>
  ```

---

#### Step 3: 虚拟滚动优化 (4h)

- [ ] **安装依赖**
  ```bash
  npm install @tanstack/vue-virtual
  ```

- [ ] **实现虚拟列表**
  ```vue
  <!-- ModelPickerList.vue -->
  <script setup lang="ts">
  import { useVirtualizer } from '@tanstack/vue-virtual'
  import { ref } from 'vue'
  
  const parentRef = ref<HTMLElement>()
  
  const virtualizer = useVirtualizer({
    count: props.models.length,
    getScrollElement: () => parentRef.value,
    estimateSize: () => 120,  // 预估每项高度
    overscan: 5  // 预渲染 5 项
  })
  </script>
  
  <template>
    <div ref="parentRef" class="h-full overflow-auto">
      <div
        :style="{
          height: `${virtualizer.getTotalSize()}px`,
          position: 'relative'
        }"
      >
        <div
          v-for="item in virtualizer.getVirtualItems()"
          :key="item.key"
          :style="{
            position: 'absolute',
            top: 0,
            left: 0,
            width: '100%',
            height: `${item.size}px`,
            transform: `translateY(${item.start}px)`
          }"
        >
          <ModelCard :model="models[item.index]" />
        </div>
      </div>
    </div>
  </template>
  ```

---

#### Step 4: 测试 (2h)

- [ ] **单元测试**
- [ ] **集成测试**
- [ ] **性能测试** (确保 1000+ 模型流畅滚动)

---

### 2. FavoriteModelSelector 重构 (12h)

使用新的 `ScrollingText` 和 `ModelCard` 组件重构。

#### Step 1: 简化组件结构 (6h)

- [ ] **移除所有 DOM 操作逻辑**
- [ ] **使用 ScrollingText 组件**
- [ ] **重构为声明式 Vue**

**新实现**:
```vue
<script setup lang="ts">
import { ScrollingText } from '@/components/molecules/ScrollingText'
import type { Model } from '@/components/organisms/ModelPicker'

const props = defineProps<{
  models: Model[]
  currentModelId?: string
}>()

const emit = defineEmits<{
  select: [modelId: string]
}>()

const isCurrentModel = (id: string) => id === props.currentModelId
</script>

<template>
  <div class="flex gap-2 overflow-x-auto p-2">
    <button
      v-for="model in models"
      :key="model.id"
      @click="emit('select', model.id)"
      :class="[
        'px-4 py-2 rounded-lg border transition-colors',
        isCurrentModel(model.id)
          ? 'bg-blue-500 text-white border-blue-600'
          : 'bg-white text-gray-700 border-gray-300 hover:border-blue-400'
      ]"
    >
      <ScrollingText
        :text="model.name"
        :speed="50"
        :delay="500"
        class="max-w-[200px]"
      />
      <span class="text-xs text-gray-500">
        {{ formatContextLength(model.context_length) }}
      </span>
    </button>
  </div>
</template>
```

**对比**:
- **旧代码**: 855 行 (包含 300+ 行动画逻辑)
- **新代码**: ~80 行 (使用 ScrollingText 组件)
- **减少**: 90% 代码量

---

#### Step 2: 测试 (4h)

- [ ] **功能测试**
- [ ] **滚动动画测试**
- [ ] **响应式测试**

---

#### Step 3: 迁移旧数据 (2h)

确保新组件与旧 Store 兼容。

---

## Phase 4: 集成与迁移

**目标**: 将新组件集成到实际页面,逐步替换旧组件

**工时**: 16 小时 (2 天)

### 1. 创建兼容层 (4h)

- [ ] **创建 Wrapper 组件**
  ```vue
  <!-- src/components/legacy/DeleteConfirmDialogLegacy.vue -->
  <script setup lang="ts">
  import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/atoms/Dialog'
  import { Button } from '@/components/atoms/Button'
  
  // 保持旧 API,内部使用新组件
  const props = defineProps({
    show: Boolean
  })
  
  const emit = defineEmits(['close', 'delete-current-version', 'delete-all-versions'])
  </script>
  
  <template>
    <Dialog :open="show" @update:open="$emit('close')">
      <DialogContent>
        <DialogHeader>
          <DialogTitle>删除确认</DialogTitle>
        </DialogHeader>
        <!-- ... -->
      </DialogContent>
    </Dialog>
  </template>
  ```

---

### 2. 逐步替换 (8h)

按优先级替换组件:

- [ ] **第 1 天**: 替换所有 `DeleteConfirmDialog` (1h)
- [ ] **第 2 天**: 替换 `ChatInput` 中的按钮 (1h)
- [ ] **第 3 天**: 替换 `FavoriteModelSelector` (3h)
- [ ] **第 4 天**: 替换 `AdvancedModelPickerModal` (3h)

---

### 3. 清理旧代码 (2h)

- [ ] **删除旧组件文件**
- [ ] **更新所有 import 路径**
- [ ] **删除未使用的样式**

---

### 4. 文档更新 (2h)

- [ ] **更新项目 README**
- [ ] **编写迁移指南**
- [ ] **录制演示视频**

---

## 风险管理与质量保证

### 代码审查 Checklist

每个 PR 必须通过以下检查:

- [ ] **测试覆盖率** ≥ 80%
- [ ] **无 TypeScript 错误**
- [ ] **无 ESLint 警告**
- [ ] **Lighthouse 无障碍性评分** ≥ 90
- [ ] **Storybook 文档完整**
- [ ] **性能测试通过** (虚拟滚动 1000+ 项 < 16ms/frame)

### 持续集成

- [ ] **配置 GitHub Actions**
  ```yaml
  # .github/workflows/ui-refactor.yml
  name: UI Components CI
  
  on:
    pull_request:
      paths:
        - 'src/components/atoms/**'
        - 'src/components/molecules/**'
  
  jobs:
    test:
      runs-on: ubuntu-latest
      steps:
        - uses: actions/checkout@v3
        - uses: actions/setup-node@v3
        - run: npm ci
        - run: npm test -- --coverage
        - run: npm run build-storybook
  ```

---

## 总结

### 关键成功因素

1. ✅ **自下而上**: 原子组件稳定后再构建复杂组件
2. ✅ **测试先行**: 每个组件都有完整测试覆盖
3. ✅ **文档驱动**: Storybook 确保 API 易用性
4. ✅ **增量迁移**: 避免"大爆炸"式重构

### 预期成果

- **代码量减少**: 从 ~3000 行减少到 ~1200 行 (60% reduction)
- **可维护性提升**: 组件平均行数从 600 行降到 150 行
- **性能优化**: 虚拟滚动 + 优化动画
- **无障碍性**: 从 40 分提升到 90+ 分

---

**计划制定时间**: 2025-11-28  
**预计开始时间**: 待审核通过  
**预计完成时间**: 开始后 2.5 周
