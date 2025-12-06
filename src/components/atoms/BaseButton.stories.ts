import type { Meta, StoryObj } from '@storybook/vue3'
import BaseButton from './BaseButton.vue'

const meta = {
  title: 'Atoms/BaseButton',
  component: BaseButton,
  tags: ['autodocs'],
  argTypes: {
    variant: {
      control: 'select',
      options: ['primary', 'secondary', 'success', 'warning', 'danger', 'outline', 'ghost'],
      description: '按钮视觉样式变体'
    },
    size: {
      control: 'select',
      options: ['xs', 'sm', 'md', 'lg', 'xl'],
      description: '按钮尺寸'
    },
    type: {
      control: 'select',
      options: ['button', 'submit', 'reset'],
      description: 'HTML button type 属性'
    },
    disabled: {
      control: 'boolean',
      description: '禁用状态'
    },
    loading: {
      control: 'boolean',
      description: '加载状态'
    },
    block: {
      control: 'boolean',
      description: '块级按钮 (宽度 100%)'
    },
    rounded: {
      control: 'select',
      options: ['none', 'sm', 'md', 'lg', 'full'],
      description: '圆角样式'
    },
    onClick: {
      action: 'clicked',
      description: '点击事件'
    }
  }
} satisfies Meta<typeof BaseButton>

export default meta
type Story = StoryObj<typeof meta>

// 默认示例
export const Default: Story = {
  args: {
    variant: 'primary',
    size: 'md'
  },
  render: (args) => ({
    components: { BaseButton },
    setup() {
      return { args }
    },
    template: '<BaseButton v-bind="args">Default Button</BaseButton>'
  })
}

// 所有变体
export const Variants: Story = {
  render: () => ({
    components: { BaseButton },
    template: `
      <div class="flex flex-wrap gap-4">
        <BaseButton variant="primary">Primary</BaseButton>
        <BaseButton variant="secondary">Secondary</BaseButton>
        <BaseButton variant="success">Success</BaseButton>
        <BaseButton variant="warning">Warning</BaseButton>
        <BaseButton variant="danger">Danger</BaseButton>
        <BaseButton variant="outline">Outline</BaseButton>
        <BaseButton variant="ghost">Ghost</BaseButton>
      </div>
    `
  })
}

// 所有尺寸
export const Sizes: Story = {
  render: () => ({
    components: { BaseButton },
    template: `
      <div class="flex flex-wrap items-center gap-4">
        <BaseButton size="xs">Extra Small</BaseButton>
        <BaseButton size="sm">Small</BaseButton>
        <BaseButton size="md">Medium</BaseButton>
        <BaseButton size="lg">Large</BaseButton>
        <BaseButton size="xl">Extra Large</BaseButton>
      </div>
    `
  })
}

// 圆角样式
export const Rounded: Story = {
  render: () => ({
    components: { BaseButton },
    template: `
      <div class="flex flex-wrap gap-4">
        <BaseButton rounded="none">None</BaseButton>
        <BaseButton rounded="sm">Small</BaseButton>
        <BaseButton rounded="md">Medium</BaseButton>
        <BaseButton rounded="lg">Large</BaseButton>
        <BaseButton rounded="full">Full</BaseButton>
      </div>
    `
  })
}

// 禁用状态
export const Disabled: Story = {
  render: () => ({
    components: { BaseButton },
    template: `
      <div class="flex flex-wrap gap-4">
        <BaseButton variant="primary" disabled>Primary Disabled</BaseButton>
        <BaseButton variant="secondary" disabled>Secondary Disabled</BaseButton>
        <BaseButton variant="outline" disabled>Outline Disabled</BaseButton>
      </div>
    `
  })
}

// 加载状态
export const Loading: Story = {
  render: () => ({
    components: { BaseButton },
    template: `
      <div class="flex flex-wrap gap-4">
        <BaseButton variant="primary" loading>Loading Primary</BaseButton>
        <BaseButton variant="secondary" loading>Loading Secondary</BaseButton>
        <BaseButton variant="outline" loading>Loading Outline</BaseButton>
      </div>
    `
  })
}

// 块级按钮
export const Block: Story = {
  render: () => ({
    components: { BaseButton },
    template: `
      <div class="space-y-4 max-w-md">
        <BaseButton block variant="primary">Block Primary</BaseButton>
        <BaseButton block variant="secondary">Block Secondary</BaseButton>
        <BaseButton block variant="outline">Block Outline</BaseButton>
      </div>
    `
  })
}

// 变体 + 尺寸组合
export const VariantsWithSizes: Story = {
  render: () => ({
    components: { BaseButton },
    template: `
      <div class="space-y-4">
        <div class="flex flex-wrap items-center gap-4">
          <BaseButton variant="primary" size="xs">XS Primary</BaseButton>
          <BaseButton variant="primary" size="sm">SM Primary</BaseButton>
          <BaseButton variant="primary" size="md">MD Primary</BaseButton>
          <BaseButton variant="primary" size="lg">LG Primary</BaseButton>
          <BaseButton variant="primary" size="xl">XL Primary</BaseButton>
        </div>
        <div class="flex flex-wrap items-center gap-4">
          <BaseButton variant="outline" size="xs">XS Outline</BaseButton>
          <BaseButton variant="outline" size="sm">SM Outline</BaseButton>
          <BaseButton variant="outline" size="md">MD Outline</BaseButton>
          <BaseButton variant="outline" size="lg">LG Outline</BaseButton>
          <BaseButton variant="outline" size="xl">XL Outline</BaseButton>
        </div>
      </div>
    `
  })
}

// 交互示例
export const Interactive: Story = {
  render: () => ({
    components: { BaseButton },
    setup() {
      const handleClick = () => {
        alert('Button clicked!')
      }
      return { handleClick }
    },
    template: `
      <div class="flex flex-wrap gap-4">
        <BaseButton @click="handleClick">Click Me</BaseButton>
        <BaseButton variant="secondary" @click="handleClick">Click Me Too</BaseButton>
        <BaseButton variant="outline" @click="handleClick">Click Me Three</BaseButton>
      </div>
    `
  })
}

// 表单按钮类型
export const FormButtons: Story = {
  render: () => ({
    components: { BaseButton },
    template: `
      <form class="space-y-4 max-w-md p-4 border rounded">
        <div>
          <input type="text" placeholder="Enter text..." class="w-full px-3 py-2 border rounded" />
        </div>
        <div class="flex gap-2">
          <BaseButton type="submit" variant="primary">Submit</BaseButton>
          <BaseButton type="reset" variant="secondary">Reset</BaseButton>
          <BaseButton type="button" variant="outline">Cancel</BaseButton>
        </div>
      </form>
    `
  })
}

// 成功/警告/危险操作
export const SemanticActions: Story = {
  render: () => ({
    components: { BaseButton },
    template: `
      <div class="space-y-4">
        <div class="flex gap-4">
          <BaseButton variant="success">Save Changes</BaseButton>
          <BaseButton variant="success" size="sm">Quick Save</BaseButton>
        </div>
        <div class="flex gap-4">
          <BaseButton variant="warning">Edit Profile</BaseButton>
          <BaseButton variant="warning" size="sm">Quick Edit</BaseButton>
        </div>
        <div class="flex gap-4">
          <BaseButton variant="danger">Delete Account</BaseButton>
          <BaseButton variant="danger" size="sm">Remove</BaseButton>
        </div>
      </div>
    `
  })
}
