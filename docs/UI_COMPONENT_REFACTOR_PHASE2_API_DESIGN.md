# Starverse UI 组件库重构 - 阶段二：API 设计与契约定义

> **设计专家角色**: API 架构师 (Design Systems 专家)  
> **设计日期**: 2025年11月28日  
> **设计原则**: Headless + Composition + Type Safety  

---

## 目录

1. [设计原则](#设计原则)
2. [原子组件 API](#原子组件-api)
3. [分子组件 API](#分子组件-api)
4. [有机体组件 API](#有机体组件-api)
5. [Breaking Changes 清单](#breaking-changes-清单)
6. [迁移指南](#迁移指南)

---

## 设计原则

### 1. **Headless First (无头优先)**
逻辑与样式完全分离,所有核心功能通过 Composables 提供:

```typescript
// ✅ 好的设计
const dialog = useDialog({ defaultOpen: false })
<Dialog v-bind="dialog.props" v-slot="{ close }">
  <!-- 完全自定义样式 -->
</Dialog>

// ❌ 避免的设计
<Dialog type="warning" size="large" color="blue">
  <!-- 样式耦合在组件内部 -->
</Dialog>
```

### 2. **Compound Components (复合组件)**
避免 Props 爆炸,使用组合式 API:

```typescript
// ✅ 好的设计
<Select>
  <SelectTrigger>选择模型</SelectTrigger>
  <SelectContent>
    <SelectItem value="gpt-4">GPT-4</SelectItem>
  </SelectContent>
</Select>

// ❌ 避免的设计
<Select 
  trigger="选择模型"
  items={[{ value: 'gpt-4', label: 'GPT-4' }]}
  placeholder="..."
  icon="..."
/>
```

### 3. **Type Safety (类型安全)**
严格的 TypeScript 泛型和联合类型:

```typescript
// ✅ 好的设计
interface ButtonProps {
  variant: 'primary' | 'secondary' | 'ghost'
  size: 'sm' | 'md' | 'lg'
  disabled?: boolean
}

// ❌ 避免的设计
interface ButtonProps {
  type?: string  // 太宽泛
  className?: string  // 绕过类型检查
}
```

---

## 原子组件 API

### 1. Button 组件

#### 1.1 TypeScript 接口定义

```typescript
// src/components/atoms/Button/Button.types.ts

import type { Component } from 'vue'

/**
 * 按钮变体
 */
export type ButtonVariant = 
  | 'primary'      // 主按钮 (蓝色背景)
  | 'secondary'    // 次按钮 (灰色背景)
  | 'ghost'        // 幽灵按钮 (透明背景)
  | 'danger'       // 危险按钮 (红色背景)
  | 'success'      // 成功按钮 (绿色背景)

/**
 * 按钮尺寸
 */
export type ButtonSize = 'sm' | 'md' | 'lg'

/**
 * 按钮 Props
 */
export interface ButtonProps {
  /**
   * 按钮变体
   * @default 'primary'
   */
  variant?: ButtonVariant
  
  /**
   * 按钮尺寸
   * @default 'md'
   */
  size?: ButtonSize
  
  /**
   * 是否禁用
   * @default false
   */
  disabled?: boolean
  
  /**
   * 是否加载中
   * @default false
   */
  loading?: boolean
  
  /**
   * 是否全宽
   * @default false
   */
  fullWidth?: boolean
  
  /**
   * HTML 按钮类型
   * @default 'button'
   */
  type?: 'button' | 'submit' | 'reset'
  
  /**
   * 多态 as 属性,允许渲染为其他元素
   * @default 'button'
   * @example
   * <Button as="a" href="/home">链接按钮</Button>
   */
  as?: string | Component
  
  /**
   * 左侧图标
   */
  leftIcon?: Component
  
  /**
   * 右侧图标
   */
  rightIcon?: Component
}

/**
 * 按钮 Emits
 */
export interface ButtonEmits {
  /**
   * 点击事件
   * @param event - 鼠标事件
   */
  (e: 'click', event: MouseEvent): void
}

/**
 * 按钮 Slots
 */
export interface ButtonSlots {
  /**
   * 默认插槽 - 按钮内容
   */
  default(): any
  
  /**
   * 左侧图标插槽
   */
  'left-icon'(): any
  
  /**
   * 右侧图标插槽
   */
  'right-icon'(): any
  
  /**
   * 加载中插槽
   */
  loading(): any
}
```

#### 1.2 使用示例

```vue
<!-- 示例 1: 基础用法 -->
<Button variant="primary" size="md" @click="handleSave">
  保存
</Button>

<!-- 示例 2: 加载状态 -->
<Button :loading="isSubmitting" :disabled="isSubmitting">
  <template #loading>
    <Spinner class="mr-2" />
  </template>
  提交中...
</Button>

<!-- 示例 3: 带图标 -->
<Button variant="ghost" left-icon="TrashIcon" @click="handleDelete">
  删除
</Button>

<!-- 示例 4: 多态 - 渲染为链接 -->
<Button as="a" href="https://example.com" target="_blank">
  外部链接
</Button>

<!-- 示例 5: 自定义样式覆盖 -->
<Button 
  variant="primary" 
  class="custom-shadow hover:scale-105 transition-transform"
>
  自定义样式
</Button>
```

#### 1.3 Headless Composable

```typescript
// src/components/atoms/Button/useButton.ts

import { computed } from 'vue'
import type { ButtonProps } from './Button.types'

/**
 * 按钮无头逻辑
 */
export function useButton(props: ButtonProps) {
  // 计算是否可交互
  const isInteractive = computed(() => {
    return !props.disabled && !props.loading
  })
  
  // 计算 ARIA 属性
  const ariaAttrs = computed(() => ({
    'aria-disabled': props.disabled || props.loading,
    'aria-busy': props.loading,
    'role': props.as === 'button' ? 'button' : undefined
  }))
  
  // 计算 Tailwind 类名
  const classes = computed(() => {
    const base = 'inline-flex items-center justify-center font-medium rounded-lg transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-offset-2'
    
    // 尺寸
    const sizeClasses = {
      sm: 'px-3 py-1.5 text-sm',
      md: 'px-4 py-2 text-base',
      lg: 'px-6 py-3 text-lg'
    }
    
    // 变体
    const variantClasses = {
      primary: 'bg-blue-500 text-white hover:bg-blue-600 focus-visible:ring-blue-500 disabled:bg-blue-300',
      secondary: 'bg-gray-200 text-gray-900 hover:bg-gray-300 focus-visible:ring-gray-500 disabled:bg-gray-100',
      ghost: 'bg-transparent hover:bg-gray-100 focus-visible:ring-gray-500',
      danger: 'bg-red-500 text-white hover:bg-red-600 focus-visible:ring-red-500 disabled:bg-red-300',
      success: 'bg-green-500 text-white hover:bg-green-600 focus-visible:ring-green-500 disabled:bg-green-300'
    }
    
    // 状态
    const stateClasses = (props.disabled || props.loading) 
      ? 'cursor-not-allowed opacity-60' 
      : 'cursor-pointer'
    
    const widthClass = props.fullWidth ? 'w-full' : ''
    
    return [
      base,
      sizeClasses[props.size || 'md'],
      variantClasses[props.variant || 'primary'],
      stateClasses,
      widthClass
    ].join(' ')
  })
  
  return {
    isInteractive,
    ariaAttrs,
    classes
  }
}
```

---

### 2. Dialog 组件 (模态框)

#### 2.1 TypeScript 接口定义

```typescript
// src/components/atoms/Dialog/Dialog.types.ts

/**
 * Dialog Props
 */
export interface DialogProps {
  /**
   * 是否打开
   */
  open?: boolean
  
  /**
   * 默认是否打开 (非受控模式)
   */
  defaultOpen?: boolean
  
  /**
   * 是否模态 (阻止背景交互)
   * @default true
   */
  modal?: boolean
  
  /**
   * 点击遮罩是否关闭
   * @default true
   */
  closeOnOverlayClick?: boolean
  
  /**
   * 按 ESC 是否关闭
   * @default true
   */
  closeOnEsc?: boolean
  
  /**
   * 关闭时是否销毁内容
   * @default false
   */
  destroyOnClose?: boolean
}

/**
 * Dialog Emits
 */
export interface DialogEmits {
  /**
   * 打开状态变化
   */
  (e: 'update:open', value: boolean): void
  
  /**
   * 打开后回调
   */
  (e: 'opened'): void
  
  /**
   * 关闭后回调
   */
  (e: 'closed'): void
}

/**
 * Dialog Slots
 */
export interface DialogSlots {
  /**
   * 默认内容
   */
  default(props: { close: () => void }): any
  
  /**
   * 触发器 (用于非受控模式)
   */
  trigger(): any
}

/**
 * DialogHeader Props
 */
export interface DialogHeaderProps {
  /**
   * 是否显示关闭按钮
   * @default true
   */
  showClose?: boolean
}

/**
 * DialogTitle Props
 */
export interface DialogTitleProps {
  /**
   * 标题 ID (用于 aria-labelledby)
   * @default 自动生成
   */
  id?: string
}
```

#### 2.2 复合组件结构

```typescript
// src/components/atoms/Dialog/index.ts

export { default as Dialog } from './Dialog.vue'
export { default as DialogTrigger } from './DialogTrigger.vue'
export { default as DialogOverlay } from './DialogOverlay.vue'
export { default as DialogContent } from './DialogContent.vue'
export { default as DialogHeader } from './DialogHeader.vue'
export { default as DialogTitle } from './DialogTitle.vue'
export { default as DialogDescription } from './DialogDescription.vue'
export { default as DialogFooter } from './DialogFooter.vue'
export { default as DialogClose } from './DialogClose.vue'

export * from './Dialog.types'
export * from './useDialog'
```

#### 2.3 使用示例

```vue
<script setup lang="ts">
import { ref } from 'vue'
import {
  Dialog,
  DialogTrigger,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
  DialogFooter,
  DialogClose
} from '@/components/atoms/Dialog'
import { Button } from '@/components/atoms/Button'

const isOpen = ref(false)

const handleConfirm = () => {
  // 执行删除逻辑
  isOpen.value = false
}
</script>

<template>
  <!-- 示例 1: 受控模式 -->
  <Dialog v-model:open="isOpen">
    <DialogContent>
      <DialogHeader>
        <DialogTitle>删除确认</DialogTitle>
        <DialogDescription>
          此操作不可撤销,确定要删除吗?
        </DialogDescription>
      </DialogHeader>
      
      <DialogFooter>
        <DialogClose as-child>
          <Button variant="secondary">取消</Button>
        </DialogClose>
        <Button variant="danger" @click="handleConfirm">
          确认删除
        </Button>
      </DialogFooter>
    </DialogContent>
  </Dialog>
  
  <!-- 示例 2: 非受控模式 + 触发器 -->
  <Dialog default-open>
    <DialogTrigger as-child>
      <Button>打开对话框</Button>
    </DialogTrigger>
    
    <DialogContent v-slot="{ close }">
      <DialogHeader>
        <DialogTitle>提示</DialogTitle>
      </DialogHeader>
      
      <p>这是非受控模式的对话框</p>
      
      <DialogFooter>
        <Button @click="close">关闭</Button>
      </DialogFooter>
    </DialogContent>
  </Dialog>
  
  <!-- 示例 3: 完全自定义样式 -->
  <Dialog v-model:open="isOpen">
    <DialogContent 
      class="max-w-2xl bg-gradient-to-br from-purple-50 to-blue-50"
      :close-on-overlay-click="false"
    >
      <div class="custom-dialog-content">
        <!-- 完全自定义内容 -->
      </div>
    </DialogContent>
  </Dialog>
</template>
```

#### 2.4 Headless Composable

```typescript
// src/components/atoms/Dialog/useDialog.ts

import { ref, computed, watch, onMounted, onUnmounted } from 'vue'
import { useFocusTrap } from '@vueuse/core'
import type { DialogProps } from './Dialog.types'

/**
 * Dialog 无头逻辑
 */
export function useDialog(props: DialogProps, emit: any) {
  const isOpen = ref(props.defaultOpen || false)
  const dialogRef = ref<HTMLElement>()
  const titleId = ref(`dialog-title-${Math.random().toString(36).substr(2, 9)}`)
  
  // 焦点陷阱
  const { activate, deactivate } = useFocusTrap(dialogRef, {
    immediate: false,
    allowOutsideClick: true
  })
  
  // 计算最终的 open 状态 (受控 vs 非受控)
  const finalOpen = computed({
    get: () => props.open !== undefined ? props.open : isOpen.value,
    set: (value) => {
      if (props.open !== undefined) {
        emit('update:open', value)
      } else {
        isOpen.value = value
      }
    }
  })
  
  // 打开对话框
  const open = () => {
    finalOpen.value = true
  }
  
  // 关闭对话框
  const close = () => {
    finalOpen.value = false
  }
  
  // 切换对话框
  const toggle = () => {
    finalOpen.value = !finalOpen.value
  }
  
  // 监听 open 状态变化
  watch(finalOpen, (newValue, oldValue) => {
    if (newValue && !oldValue) {
      // 打开
      emit('opened')
      activate()
      
      // 锁定 body 滚动
      document.body.style.overflow = 'hidden'
    } else if (!newValue && oldValue) {
      // 关闭
      emit('closed')
      deactivate()
      
      // 恢复 body 滚动
      document.body.style.overflow = ''
    }
  }, { immediate: true })
  
  // ESC 键处理
  const handleKeydown = (e: KeyboardEvent) => {
    if (e.key === 'Escape' && props.closeOnEsc !== false && finalOpen.value) {
      close()
    }
  }
  
  onMounted(() => {
    document.addEventListener('keydown', handleKeydown)
  })
  
  onUnmounted(() => {
    document.removeEventListener('keydown', handleKeydown)
    document.body.style.overflow = ''
  })
  
  return {
    dialogRef,
    titleId,
    isOpen: finalOpen,
    open,
    close,
    toggle
  }
}
```

---

### 3. Input 组件

#### 3.1 TypeScript 接口定义

```typescript
// src/components/atoms/Input/Input.types.ts

/**
 * Input 变体
 */
export type InputVariant = 'outline' | 'filled' | 'ghost'

/**
 * Input 尺寸
 */
export type InputSize = 'sm' | 'md' | 'lg'

/**
 * Input Props
 */
export interface InputProps {
  /**
   * 输入值 (v-model)
   */
  modelValue?: string | number
  
  /**
   * 输入类型
   */
  type?: 'text' | 'email' | 'password' | 'number' | 'tel' | 'url'
  
  /**
   * 占位符
   */
  placeholder?: string
  
  /**
   * 是否禁用
   */
  disabled?: boolean
  
  /**
   * 是否只读
   */
  readonly?: boolean
  
  /**
   * 是否必填
   */
  required?: boolean
  
  /**
   * 变体
   */
  variant?: InputVariant
  
  /**
   * 尺寸
   */
  size?: InputSize
  
  /**
   * 是否有错误
   */
  invalid?: boolean
  
  /**
   * 错误消息
   */
  errorMessage?: string
  
  /**
   * 帮助文本
   */
  helperText?: string
  
  /**
   * 左侧插槽内容
   */
  leftElement?: any
  
  /**
   * 右侧插槽内容
   */
  rightElement?: any
}

/**
 * Input Emits
 */
export interface InputEmits {
  (e: 'update:modelValue', value: string | number): void
  (e: 'blur', event: FocusEvent): void
  (e: 'focus', event: FocusEvent): void
  (e: 'input', event: Event): void
  (e: 'change', event: Event): void
}
```

#### 3.2 使用示例

```vue
<!-- 示例 1: 基础输入 -->
<Input 
  v-model="username" 
  placeholder="请输入用户名"
  :required="true"
/>

<!-- 示例 2: 带验证 -->
<Input 
  v-model="email" 
  type="email"
  :invalid="!!emailError"
  :error-message="emailError"
  helper-text="我们不会泄露您的邮箱"
/>

<!-- 示例 3: 带左右插槽 -->
<Input v-model="searchQuery">
  <template #left>
    <SearchIcon class="w-4 h-4 text-gray-400" />
  </template>
  <template #right>
    <Button variant="ghost" size="sm" @click="handleSearch">
      搜索
    </Button>
  </template>
</Input>

<!-- 示例 4: 密码输入 -->
<Input 
  v-model="password" 
  :type="showPassword ? 'text' : 'password'"
>
  <template #right>
    <button @click="showPassword = !showPassword">
      <EyeIcon v-if="!showPassword" />
      <EyeOffIcon v-else />
    </button>
  </template>
</Input>
```

---

## 分子组件 API

### 4. Select 组件 (选择器)

#### 4.1 TypeScript 接口定义

```typescript
// src/components/molecules/Select/Select.types.ts

/**
 * Select Props
 */
export interface SelectProps<T = any> {
  /**
   * 选中的值
   */
  modelValue?: T
  
  /**
   * 默认选中值 (非受控)
   */
  defaultValue?: T
  
  /**
   * 选项列表
   */
  options?: SelectOption<T>[]
  
  /**
   * 是否禁用
   */
  disabled?: boolean
  
  /**
   * 占位符
   */
  placeholder?: string
  
  /**
   * 是否多选
   */
  multiple?: boolean
  
  /**
   * 是否可搜索
   */
  searchable?: boolean
  
  /**
   * 是否允许清空
   */
  clearable?: boolean
  
  /**
   * 选项的唯一键
   */
  valueKey?: string
  
  /**
   * 选项的显示键
   */
  labelKey?: string
}

/**
 * Select Option
 */
export interface SelectOption<T = any> {
  value: T
  label: string
  disabled?: boolean
  icon?: any
}

/**
 * Select Emits
 */
export interface SelectEmits<T = any> {
  (e: 'update:modelValue', value: T): void
  (e: 'change', value: T): void
  (e: 'search', query: string): void
}
```

#### 4.2 复合组件结构

```typescript
// src/components/molecules/Select/index.ts

export { default as Select } from './Select.vue'
export { default as SelectTrigger } from './SelectTrigger.vue'
export { default as SelectContent } from './SelectContent.vue'
export { default as SelectItem } from './SelectItem.vue'
export { default as SelectGroup } from './SelectGroup.vue'
export { default as SelectLabel } from './SelectLabel.vue'
export { default as SelectSeparator } from './SelectSeparator.vue'

export * from './Select.types'
```

#### 4.3 使用示例

```vue
<script setup lang="ts">
import { ref } from 'vue'
import {
  Select,
  SelectTrigger,
  SelectContent,
  SelectItem
} from '@/components/molecules/Select'

const selectedModel = ref('gpt-4')
</script>

<template>
  <!-- 示例 1: 简单选择器 -->
  <Select v-model="selectedModel">
    <SelectTrigger>
      {{ selectedModel || '选择模型' }}
    </SelectTrigger>
    
    <SelectContent>
      <SelectItem value="gpt-4">GPT-4</SelectItem>
      <SelectItem value="gpt-3.5">GPT-3.5</SelectItem>
      <SelectItem value="claude-3">Claude 3</SelectItem>
    </SelectContent>
  </Select>
  
  <!-- 示例 2: 分组选择器 -->
  <Select v-model="selectedModel">
    <SelectTrigger />
    
    <SelectContent>
      <SelectGroup>
        <SelectLabel>OpenAI</SelectLabel>
        <SelectItem value="gpt-4">GPT-4 Turbo</SelectItem>
        <SelectItem value="gpt-3.5">GPT-3.5 Turbo</SelectItem>
      </SelectGroup>
      
      <SelectSeparator />
      
      <SelectGroup>
        <SelectLabel>Anthropic</SelectLabel>
        <SelectItem value="claude-3-opus">Claude 3 Opus</SelectItem>
        <SelectItem value="claude-3-sonnet">Claude 3 Sonnet</SelectItem>
      </SelectGroup>
    </SelectContent>
  </Select>
  
  <!-- 示例 3: 可搜索选择器 -->
  <Select 
    v-model="selectedModel" 
    searchable 
    @search="handleSearch"
  >
    <SelectTrigger />
    <SelectContent>
      <SelectItem 
        v-for="model in filteredModels" 
        :key="model.id"
        :value="model.id"
      >
        <div class="flex items-center gap-2">
          <span>{{ model.name }}</span>
          <span class="text-xs text-gray-500">{{ model.context }}</span>
        </div>
      </SelectItem>
    </SelectContent>
  </Select>
</template>
```

---

### 5. ScrollingText 组件 (滚动文本)

#### 5.1 TypeScript 接口定义

```typescript
// src/components/molecules/ScrollingText/ScrollingText.types.ts

/**
 * ScrollingText Props
 */
export interface ScrollingTextProps {
  /**
   * 文本内容
   */
  text: string
  
  /**
   * 滚动速度 (px/s)
   * @default 50
   */
  speed?: number
  
  /**
   * 开始滚动前的延迟 (ms)
   * @default 500
   */
  delay?: number
  
  /**
   * 间隔宽度 (px)
   * @default 40
   */
  gap?: number
  
  /**
   * 是否暂停滚动
   * @default false
   */
  paused?: boolean
  
  /**
   * 是否自动检测溢出
   * @default true
   */
  autoDetect?: boolean
  
  /**
   * 强制滚动 (即使没有溢出)
   * @default false
   */
  forceScroll?: boolean
}

/**
 * ScrollingText Emits
 */
export interface ScrollingTextEmits {
  /**
   * 溢出检测完成
   */
  (e: 'overflow-detected', isOverflowing: boolean): void
}
```

#### 5.2 使用示例

```vue
<script setup lang="ts">
import { ScrollingText } from '@/components/molecules/ScrollingText'
</script>

<template>
  <!-- 示例 1: 自动检测 -->
  <div class="w-48">
    <ScrollingText 
      text="这是一段很长的文本，会自动检测是否需要滚动"
      :speed="50"
      :delay="500"
    />
  </div>
  
  <!-- 示例 2: 强制滚动 -->
  <ScrollingText 
    text="短文本"
    :force-scroll="true"
  />
  
  <!-- 示例 3: 悬停暂停 -->
  <ScrollingText 
    v-slot="{ paused, pause, resume }"
    text="悬停时暂停滚动"
  >
    <div 
      @mouseenter="pause"
      @mouseleave="resume"
    >
      {{ text }}
    </div>
  </ScrollingText>
</template>
```

#### 5.3 Headless Composable

```typescript
// src/components/molecules/ScrollingText/useScrollingText.ts

import { ref, computed, watch, onMounted, onUnmounted } from 'vue'
import type { ScrollingTextProps } from './ScrollingText.types'

/**
 * 滚动文本无头逻辑
 */
export function useScrollingText(props: ScrollingTextProps) {
  const containerRef = ref<HTMLElement>()
  const textRef = ref<HTMLElement>()
  const isOverflowing = ref(false)
  const isPaused = ref(props.paused || false)
  
  // 检测文本是否溢出
  const detectOverflow = () => {
    if (!containerRef.value || !textRef.value) return
    
    const containerWidth = containerRef.value.offsetWidth
    const textWidth = textRef.value.offsetWidth
    
    isOverflowing.value = textWidth > containerWidth + 5
    return isOverflowing.value
  }
  
  // 计算动画参数
  const animationParams = computed(() => {
    if (!textRef.value) return null
    
    const textWidth = textRef.value.offsetWidth
    const gap = props.gap || 40
    const speed = props.speed || 50
    const delay = props.delay || 500
    
    const totalWidth = textWidth + gap
    const scrollTime = (textWidth / speed) * 1000
    const totalTime = delay + scrollTime + (scrollTime * 0.25)
    
    return {
      textWidth,
      gap,
      totalWidth,
      totalTime,
      delayPercent: (delay / totalTime) * 100,
      scrollPercent: ((delay + scrollTime) / totalTime) * 100
    }
  })
  
  // 计算是否需要滚动
  const shouldScroll = computed(() => {
    return props.forceScroll || (props.autoDetect && isOverflowing.value)
  })
  
  // 暂停/恢复
  const pause = () => {
    isPaused.value = true
  }
  
  const resume = () => {
    isPaused.value = false
  }
  
  // 监听文本变化，重新检测
  watch(() => props.text, () => {
    if (props.autoDetect) {
      setTimeout(detectOverflow, 0)
    }
  })
  
  onMounted(() => {
    if (props.autoDetect) {
      detectOverflow()
    }
  })
  
  return {
    containerRef,
    textRef,
    isOverflowing,
    isPaused,
    shouldScroll,
    animationParams,
    detectOverflow,
    pause,
    resume
  }
}
```

---

## 有机体组件 API

### 6. ModelPicker 组件 (模型选择器)

这是重构 `AdvancedModelPickerModal.vue` 的新设计。

#### 6.1 TypeScript 接口定义

```typescript
// src/components/organisms/ModelPicker/ModelPicker.types.ts

/**
 * Model 接口
 */
export interface Model {
  id: string
  name: string
  series: string
  description?: string
  context_length: number
  pricing: {
    prompt: number
    completion: number
  }
  input_modalities: string[]
  output_modalities: string[]
  provider?: string
}

/**
 * ModelPicker Props
 */
export interface ModelPickerProps {
  /**
   * 是否打开
   */
  open?: boolean
  
  /**
   * 可用模型列表
   */
  models: Model[]
  
  /**
   * 当前选中的模型 ID
   */
  selectedModelId?: string
  
  /**
   * 收藏的模型 ID 列表
   */
  favoriteModelIds?: string[]
  
  /**
   * 是否启用虚拟滚动
   * @default true
   */
  virtualScroll?: boolean
  
  /**
   * 初始筛选器状态
   */
  defaultFilters?: ModelFilters
}

/**
 * 模型筛选器
 */
export interface ModelFilters {
  providers: Set<string>
  inputModalities: Set<string>
  outputModalities: Set<string>
}

/**
 * ModelPicker Emits
 */
export interface ModelPickerEmits {
  (e: 'update:open', value: boolean): void
  (e: 'select', modelId: string): void
  (e: 'toggle-favorite', modelId: string): void
  (e: 'close'): void
}
```

#### 6.2 复合组件结构

```typescript
// src/components/organisms/ModelPicker/index.ts

export { default as ModelPicker } from './ModelPicker.vue'
export { default as ModelPickerSearch } from './ModelPickerSearch.vue'
export { default as ModelPickerFilters } from './ModelPickerFilters.vue'
export { default as ModelPickerList } from './ModelPickerList.vue'
export { default as ModelCard } from './ModelCard.vue'
export { default as FilterGroup } from './FilterGroup.vue'

export * from './ModelPicker.types'
export { useModelFiltering } from './useModelFiltering'
```

#### 6.3 使用示例

```vue
<script setup lang="ts">
import { ref } from 'vue'
import {
  ModelPicker,
  ModelPickerSearch,
  ModelPickerFilters,
  ModelPickerList,
  useModelFiltering
} from '@/components/organisms/ModelPicker'
import { Dialog, DialogContent } from '@/components/atoms/Dialog'

const isOpen = ref(false)
const models = ref<Model[]>([])
const selectedModelId = ref('gpt-4')
const favoriteIds = ref<string[]>(['gpt-4', 'claude-3'])

// 使用无头筛选逻辑
const {
  searchQuery,
  filters,
  filteredModels,
  clearFilters,
  toggleFilter
} = useModelFiltering(models)

const handleSelect = (modelId: string) => {
  selectedModelId.value = modelId
  isOpen.value = false
}
</script>

<template>
  <!-- 示例 1: 完整的模型选择器 -->
  <Dialog v-model:open="isOpen">
    <DialogContent class="max-w-6xl h-[80vh]">
      <ModelPicker
        :models="models"
        :selected-model-id="selectedModelId"
        :favorite-model-ids="favoriteIds"
        @select="handleSelect"
        @toggle-favorite="handleToggleFavorite"
      >
        <!-- 完全自定义布局 -->
        <template #header>
          <h2>选择模型</h2>
        </template>
        
        <template #search>
          <ModelPickerSearch v-model="searchQuery" />
        </template>
        
        <template #filters>
          <ModelPickerFilters
            :filters="filters"
            @toggle="toggleFilter"
            @clear="clearFilters"
          />
        </template>
        
        <template #list>
          <ModelPickerList
            :models="filteredModels"
            :selected-id="selectedModelId"
            :favorite-ids="favoriteIds"
            @select="handleSelect"
          />
        </template>
      </ModelPicker>
    </DialogContent>
  </Dialog>
  
  <!-- 示例 2: 使用默认布局 -->
  <ModelPicker
    v-model:open="isOpen"
    :models="models"
    :selected-model-id="selectedModelId"
    @select="handleSelect"
  />
</template>
```

#### 6.4 Headless Composable

```typescript
// src/components/organisms/ModelPicker/useModelFiltering.ts

import { ref, computed } from 'vue'
import type { Model, ModelFilters } from './ModelPicker.types'

/**
 * 模型筛选无头逻辑
 */
export function useModelFiltering(models: Ref<Model[]>) {
  const searchQuery = ref('')
  const filters = ref<ModelFilters>({
    providers: new Set(),
    inputModalities: new Set(),
    outputModalities: new Set()
  })
  
  const sortBy = ref<'name' | 'context' | 'price'>('name')
  
  // 筛选后的模型
  const filteredModels = computed(() => {
    let result = models.value
    
    // 搜索过滤
    if (searchQuery.value) {
      const query = searchQuery.value.toLowerCase()
      result = result.filter(m => 
        m.id.toLowerCase().includes(query) ||
        m.name.toLowerCase().includes(query) ||
        m.series.toLowerCase().includes(query)
      )
    }
    
    // 厂商过滤
    if (filters.value.providers.size > 0) {
      result = result.filter(m => 
        m.provider && filters.value.providers.has(m.provider)
      )
    }
    
    // 输入模态过滤
    if (filters.value.inputModalities.size > 0) {
      result = result.filter(m =>
        m.input_modalities.some(mod => 
          filters.value.inputModalities.has(mod)
        )
      )
    }
    
    // 输出模态过滤
    if (filters.value.outputModalities.size > 0) {
      result = result.filter(m =>
        m.output_modalities.some(mod => 
          filters.value.outputModalities.has(mod)
        )
      )
    }
    
    return result
  })
  
  // 排序后的模型
  const sortedModels = computed(() => {
    const sorted = [...filteredModels.value]
    
    switch (sortBy.value) {
      case 'name':
        sorted.sort((a, b) => a.name.localeCompare(b.name))
        break
      case 'context':
        sorted.sort((a, b) => b.context_length - a.context_length)
        break
      case 'price':
        sorted.sort((a, b) => a.pricing.prompt - b.pricing.prompt)
        break
    }
    
    return sorted
  })
  
  // 切换筛选器
  const toggleFilter = (category: keyof ModelFilters, value: string) => {
    const set = filters.value[category]
    if (set.has(value)) {
      set.delete(value)
    } else {
      set.add(value)
    }
  }
  
  // 清除所有筛选器
  const clearFilters = () => {
    filters.value = {
      providers: new Set(),
      inputModalities: new Set(),
      outputModalities: new Set()
    }
    searchQuery.value = ''
  }
  
  // 获取可用的筛选选项
  const availableProviders = computed(() => {
    const providers = new Set<string>()
    models.value.forEach(m => {
      if (m.provider) providers.add(m.provider)
    })
    return Array.from(providers).sort()
  })
  
  return {
    searchQuery,
    filters,
    sortBy,
    filteredModels,
    sortedModels,
    availableProviders,
    toggleFilter,
    clearFilters
  }
}
```

---

### 7. FavoriteModelSelector 组件

重构后的收藏模型选择器。

#### 7.1 TypeScript 接口定义

```typescript
// src/components/organisms/FavoriteModelSelector/FavoriteModelSelector.types.ts

import type { Model } from '../ModelPicker/ModelPicker.types'

/**
 * FavoriteModelSelector Props
 */
export interface FavoriteModelSelectorProps {
  /**
   * 收藏的模型列表
   */
  models: Model[]
  
  /**
   * 当前选中的模型 ID
   */
  currentModelId?: string
  
  /**
   * 是否启用滚动动画
   * @default true
   */
  enableScrolling?: boolean
  
  /**
   * 显示方向
   * @default 'horizontal'
   */
  direction?: 'horizontal' | 'vertical'
}

/**
 * FavoriteModelSelector Emits
 */
export interface FavoriteModelSelectorEmits {
  (e: 'select', modelId: string): void
}
```

#### 7.2 使用示例

```vue
<script setup lang="ts">
import { computed } from 'vue'
import { FavoriteModelSelector } from '@/components/organisms/FavoriteModelSelector'
import { useModelStore } from '@/stores/model'
import { useConversationStore } from '@/stores/conversation'

const modelStore = useModelStore()
const conversationStore = useConversationStore()

const favoriteModels = computed(() => modelStore.favoriteModels)
const currentModelId = computed(() => conversationStore.currentConversation?.model)

const handleSelectModel = (modelId: string) => {
  conversationStore.updateConversationModel(modelId)
}
</script>

<template>
  <!-- 示例 1: 水平滚动 -->
  <FavoriteModelSelector
    :models="favoriteModels"
    :current-model-id="currentModelId"
    direction="horizontal"
    @select="handleSelectModel"
  />
  
  <!-- 示例 2: 垂直列表 -->
  <FavoriteModelSelector
    :models="favoriteModels"
    :current-model-id="currentModelId"
    direction="vertical"
    :enable-scrolling="false"
    @select="handleSelectModel"
  >
    <!-- 自定义模型项 -->
    <template #model="{ model, isActive }">
      <div :class="{ 'bg-blue-50': isActive }">
        <span>{{ model.name }}</span>
        <span class="text-xs text-gray-500">{{ model.context }}</span>
      </div>
    </template>
  </FavoriteModelSelector>
</template>
```

---

## Breaking Changes 清单

### 删除的 API

| 旧组件 | 删除的 API | 替代方案 |
|--------|-----------|---------|
| `DeleteConfirmDialog` | `show` prop | `Dialog` 的 `open` prop |
| `DeleteConfirmDialog` | `@close` event | `Dialog` 的 `@update:open` |
| `FavoriteModelSelector` | 内部动画逻辑 | 使用 `ScrollingText` 组件 |
| `AdvancedModelPickerModal` | `isOpen` prop | `ModelPicker` 的 `open` prop |

### 重命名的 API

| 旧名称 | 新名称 | 原因 |
|--------|--------|------|
| `show` | `open` | 统一命名规范 |
| `conversationId` | 通过 Context 注入 | 避免 Props Drilling |
| `isGenerating` | 通过 Context 注入 | 避免 Props Drilling |

### 新增的 API

所有组件现在支持:
- ✅ `as` prop (多态组件)
- ✅ TypeScript 泛型支持
- ✅ Headless Composables
- ✅ 完整的 ARIA 属性
- ✅ 焦点管理

---

## 迁移指南

### 1. 从旧 `DeleteConfirmDialog` 迁移到新 `Dialog`

**旧代码**:
```vue
<DeleteConfirmDialog
  :show="showDialog"
  @close="showDialog = false"
  @delete-current-version="handleDeleteCurrent"
  @delete-all-versions="handleDeleteAll"
/>
```

**新代码**:
```vue
<Dialog v-model:open="showDialog">
  <DialogContent>
    <DialogHeader>
      <DialogTitle>删除确认</DialogTitle>
      <DialogDescription>请选择删除方式：</DialogDescription>
    </DialogHeader>
    
    <DialogFooter>
      <Button variant="secondary" @click="handleDeleteCurrent">
        删除当前分支
      </Button>
      <Button variant="primary" @click="handleDeleteAll">
        删除所有分支
      </Button>
    </DialogFooter>
  </DialogContent>
</Dialog>
```

**迁移步骤**:
1. 替换 `:show` 为 `v-model:open`
2. 使用复合组件结构
3. 自定义按钮布局

---

### 2. 从旧 `FavoriteModelSelector` 迁移

**旧代码**:
```vue
<FavoriteModelSelector :conversation-id="conversationId" />
```

**新代码**:
```vue
<script setup>
import { provide } from 'vue'

// 提供 Context
provide('conversationContext', {
  conversationId,
  onModelSelect: handleModelSelect
})
</script>

<template>
  <FavoriteModelSelector
    :models="favoriteModels"
    :current-model-id="currentModelId"
    @select="handleModelSelect"
  />
</template>
```

---

### 3. 从旧 `AdvancedModelPickerModal` 迁移

**旧代码**:
```vue
<AdvancedModelPickerModal
  :is-open="isOpen"
  @close="isOpen = false"
  @select-model="handleSelectModel"
/>
```

**新代码**:
```vue
<ModelPicker
  v-model:open="isOpen"
  :models="models"
  :selected-model-id="selectedModelId"
  :favorite-model-ids="favoriteIds"
  @select="handleSelectModel"
/>
```

---

## 总结

### 设计亮点

1. **完全类型安全**: 所有组件都有严格的 TypeScript 定义
2. **Headless 优先**: 逻辑与样式分离,极高的可定制性
3. **复合组件模式**: 避免 Props 爆炸,API 更清晰
4. **无障碍性**: 内置 ARIA 属性和焦点管理
5. **性能优化**: 虚拟滚动、懒加载、Memo 优化

### 下一步行动

- ✅ **阶段二完成**: API 设计与契约定义
- ⏭️ **进入阶段三**: 制定详细的实现计划
- 📝 **需要审核**: 请技术负责人审核 API 设计

---

**设计完成时间**: 2025-11-28  
**API 设计文档版本**: 1.0  
**兼容性**: 向后不兼容,需要迁移
