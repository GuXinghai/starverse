import type { Meta, StoryObj } from '@storybook/vue3'
import IconButton from './IconButton.vue'

const meta = {
  title: 'Atoms/IconButton',
  component: IconButton,
  tags: ['autodocs'],
  argTypes: {
    icon: {
      control: 'text',
      description: '图标内容 (文本或 emoji)'
    },
    iconPosition: {
      control: 'select',
      options: ['left', 'right'],
      description: '图标位置'
    },
    iconOnly: {
      control: 'boolean',
      description: '仅显示图标,文本用于无障碍'
    },
    variant: {
      control: 'select',
      options: ['primary', 'secondary', 'success', 'warning', 'danger', 'outline', 'ghost']
    },
    size: {
      control: 'select',
      options: ['xs', 'sm', 'md', 'lg', 'xl']
    },
    disabled: {
      control: 'boolean'
    },
    loading: {
      control: 'boolean'
    }
  }
} satisfies Meta<typeof IconButton>

export default meta
type Story = StoryObj<typeof meta>

// 默认示例
export const Default: Story = {
  args: {
    icon: '🚀',
    variant: 'primary'
  },
  render: (args) => ({
    components: { IconButton },
    setup() {
      return { args }
    },
    template: '<IconButton v-bind="args">Launch</IconButton>'
  })
}

// 图标位置
export const IconPositions: Story = {
  render: () => ({
    components: { IconButton },
    template: `
      <div class="flex flex-wrap gap-4">
        <IconButton icon="🚀" iconPosition="left">Left Icon</IconButton>
        <IconButton icon="➡️" iconPosition="right">Right Icon</IconButton>
      </div>
    `
  })
}

// 仅图标按钮
export const IconOnly: Story = {
  render: () => ({
    components: { IconButton },
    template: `
      <div class="flex flex-wrap gap-4">
        <IconButton icon="✓" iconOnly>Confirm</IconButton>
        <IconButton icon="✕" iconOnly variant="danger">Cancel</IconButton>
        <IconButton icon="⚙️" iconOnly variant="secondary">Settings</IconButton>
        <IconButton icon="❤️" iconOnly variant="outline">Like</IconButton>
      </div>
    `
  })
}

// 不同尺寸
export const Sizes: Story = {
  render: () => ({
    components: { IconButton },
    template: `
      <div class="flex flex-wrap items-center gap-4">
        <IconButton icon="📧" size="xs">XS Size</IconButton>
        <IconButton icon="📧" size="sm">SM Size</IconButton>
        <IconButton icon="📧" size="md">MD Size</IconButton>
        <IconButton icon="📧" size="lg">LG Size</IconButton>
        <IconButton icon="📧" size="xl">XL Size</IconButton>
      </div>
    `
  })
}

// 仅图标 + 不同尺寸
export const IconOnlySizes: Story = {
  render: () => ({
    components: { IconButton },
    template: `
      <div class="flex flex-wrap items-center gap-4">
        <IconButton icon="⭐" size="xs" iconOnly>XS</IconButton>
        <IconButton icon="⭐" size="sm" iconOnly>SM</IconButton>
        <IconButton icon="⭐" size="md" iconOnly>MD</IconButton>
        <IconButton icon="⭐" size="lg" iconOnly>LG</IconButton>
        <IconButton icon="⭐" size="xl" iconOnly>XL</IconButton>
      </div>
    `
  })
}

// 所有变体
export const Variants: Story = {
  render: () => ({
    components: { IconButton },
    template: `
      <div class="flex flex-wrap gap-4">
        <IconButton icon="✓" variant="primary">Primary</IconButton>
        <IconButton icon="✓" variant="secondary">Secondary</IconButton>
        <IconButton icon="✓" variant="success">Success</IconButton>
        <IconButton icon="⚠️" variant="warning">Warning</IconButton>
        <IconButton icon="✕" variant="danger">Danger</IconButton>
        <IconButton icon="📄" variant="outline">Outline</IconButton>
        <IconButton icon="👻" variant="ghost">Ghost</IconButton>
      </div>
    `
  })
}

// 常见用例
export const CommonUseCases: Story = {
  render: () => ({
    components: { IconButton },
    template: `
      <div class="space-y-6">
        <div>
          <h3 class="text-sm font-medium mb-2">操作按钮</h3>
          <div class="flex gap-2">
            <IconButton icon="✏️" size="sm" variant="outline">编辑</IconButton>
            <IconButton icon="🗑️" size="sm" variant="danger">删除</IconButton>
            <IconButton icon="📋" size="sm" variant="ghost">复制</IconButton>
          </div>
        </div>
        
        <div>
          <h3 class="text-sm font-medium mb-2">导航按钮</h3>
          <div class="flex gap-2">
            <IconButton icon="←" iconOnly variant="outline">Previous</IconButton>
            <IconButton icon="↑" iconOnly variant="outline">Up</IconButton>
            <IconButton icon="↓" iconOnly variant="outline">Down</IconButton>
            <IconButton icon="→" iconOnly variant="outline">Next</IconButton>
          </div>
        </div>
        
        <div>
          <h3 class="text-sm font-medium mb-2">社交按钮</h3>
          <div class="flex gap-2">
            <IconButton icon="❤️" iconOnly variant="danger">Like</IconButton>
            <IconButton icon="⭐" iconOnly variant="warning">Favorite</IconButton>
            <IconButton icon="🔖" iconOnly variant="secondary">Bookmark</IconButton>
            <IconButton icon="📤" iconOnly variant="primary">Share</IconButton>
          </div>
        </div>
      </div>
    `
  })
}

// 禁用状态
export const Disabled: Story = {
  render: () => ({
    components: { IconButton },
    template: `
      <div class="flex flex-wrap gap-4">
        <IconButton icon="🚀" disabled>Disabled</IconButton>
        <IconButton icon="✓" variant="success" disabled>Disabled Success</IconButton>
        <IconButton icon="✕" iconOnly variant="danger" disabled>Disabled Icon</IconButton>
      </div>
    `
  })
}

// 加载状态
export const Loading: Story = {
  render: () => ({
    components: { IconButton },
    template: `
      <div class="flex flex-wrap gap-4">
        <IconButton icon="💾" loading>Saving...</IconButton>
        <IconButton icon="📤" variant="secondary" loading>Uploading...</IconButton>
        <IconButton icon="🔄" iconOnly loading>Refresh</IconButton>
      </div>
    `
  })
}

// 使用自定义 SVG 图标
export const WithSVGIcon: Story = {
  render: () => ({
    components: { IconButton },
    template: `
      <div class="flex flex-wrap gap-4">
        <IconButton variant="primary">
          <template #icon>
            <svg class="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M5 13l4 4L19 7"></path>
            </svg>
          </template>
          Confirm
        </IconButton>
        
        <IconButton variant="danger">
          <template #icon>
            <svg class="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M6 18L18 6M6 6l12 12"></path>
            </svg>
          </template>
          Cancel
        </IconButton>
        
        <IconButton iconOnly variant="outline">
          <template #icon>
            <svg class="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M10.325 4.317c.426-1.756 2.924-1.756 3.35 0a1.724 1.724 0 002.573 1.066c1.543-.94 3.31.826 2.37 2.37a1.724 1.724 0 001.065 2.572c1.756.426 1.756 2.924 0 3.35a1.724 1.724 0 00-1.066 2.573c.94 1.543-.826 3.31-2.37 2.37a1.724 1.724 0 00-2.572 1.065c-.426 1.756-2.924 1.756-3.35 0a1.724 1.724 0 00-2.573-1.066c-1.543.94-3.31-.826-2.37-2.37a1.724 1.724 0 00-1.065-2.572c-1.756-.426-1.756-2.924 0-3.35a1.724 1.724 0 001.066-2.573c-.94-1.543.826-3.31 2.37-2.37.996.608 2.296.07 2.572-1.065z"></path>
              <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M15 12a3 3 0 11-6 0 3 3 0 016 0z"></path>
            </svg>
          </template>
          Settings
        </IconButton>
      </div>
    `
  })
}
