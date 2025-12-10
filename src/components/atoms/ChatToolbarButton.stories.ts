/**
 * ChatToolbarButton.stories.ts
 * 
 * 展示聊天工具栏按钮的所有变体和用法
 * 
 * 设计验证点：
 * 1. 所有按钮高度完全一致（无论内容是图标/文字/混合）
 * 2. Storybook 中的高度与实际应用中完全一致（共享组件+样式）
 * 3. 不在 Story 中写自定义 CSS，只演示组件本身的能力
 */

import type { Meta, StoryObj } from '@storybook/vue3'
import { ref } from 'vue'
import ChatToolbarButton from './ChatToolbarButton.vue'

const meta: Meta<typeof ChatToolbarButton> = {
  title: 'Atoms/ChatToolbarButton',
  component: ChatToolbarButton,
  tags: ['autodocs'],
  argTypes: {
    size: {
      control: 'select',
      options: ['sm', 'md', 'lg'],
      description: '按钮尺寸（控制高度和字体大小）'
    },
    variant: {
      control: 'select',
      options: ['default', 'primary', 'ghost', 'outline'],
      description: '按钮视觉样式变体'
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
    active: {
      control: 'boolean',
      description: '激活状态（功能已启用时的高亮）'
    },
    iconOnly: {
      control: 'boolean',
      description: '仅显示图标模式（文本作为无障碍标签）'
    }
  }
}

export default meta
type Story = StoryObj<typeof ChatToolbarButton>

/**
 * 默认按钮 - 基础样式
 */
export const Default: Story = {
  args: {
    size: 'md',
    variant: 'default',
    disabled: false,
    active: false,
    iconOnly: false
  },
  render: (args) => ({
    components: { ChatToolbarButton },
    setup() {
      return { args }
    },
    template: `
      <ChatToolbarButton v-bind="args">
        <template #icon>🔍</template>
        搜索
      </ChatToolbarButton>
    `
  })
}

/**
 * 所有尺寸对比 - 验证高度统一性
 * 
 * 关键验证点：
 * - sm/md/lg 的高度分别是 28px / 32px / 36px
 * - 即使内容不同（纯图标、图标+文字），同尺寸的高度也完全一致
 */
export const AllSizes: Story = {
  render: () => ({
    components: { ChatToolbarButton },
    template: `
      <div style="display: flex; flex-direction: column; gap: 16px; padding: 16px; background: #f5f5f7;">
        <div>
          <h3 style="margin: 0 0 8px 0; font-size: 14px; font-weight: 600; color: #666;">Small (28px)</h3>
          <div style="display: flex; gap: 8px; align-items: center;">
            <ChatToolbarButton size="sm">
              <template #icon>📎</template>
              附件
            </ChatToolbarButton>
            <ChatToolbarButton size="sm">
              <template #icon>🔍</template>
              搜索
            </ChatToolbarButton>
            <ChatToolbarButton size="sm">
              <template #icon>🖥</template>
              推理
            </ChatToolbarButton>
            <ChatToolbarButton size="sm" icon-only>
              <template #icon>⚙</template>
              设置
            </ChatToolbarButton>
          </div>
        </div>

        <div>
          <h3 style="margin: 0 0 8px 0; font-size: 14px; font-weight: 600; color: #666;">Medium (32px) - 默认尺寸</h3>
          <div style="display: flex; gap: 8px; align-items: center;">
            <ChatToolbarButton size="md">
              <template #icon>📎</template>
              附件
            </ChatToolbarButton>
            <ChatToolbarButton size="md">
              <template #icon>🔍</template>
              搜索
            </ChatToolbarButton>
            <ChatToolbarButton size="md">
              <template #icon>🖥</template>
              推理
            </ChatToolbarButton>
            <ChatToolbarButton size="md" icon-only>
              <template #icon>⚙</template>
              设置
            </ChatToolbarButton>
          </div>
        </div>

        <div>
          <h3 style="margin: 0 0 8px 0; font-size: 14px; font-weight: 600; color: #666;">Large (36px)</h3>
          <div style="display: flex; gap: 8px; align-items: center;">
            <ChatToolbarButton size="lg">
              <template #icon>📎</template>
              附件
            </ChatToolbarButton>
            <ChatToolbarButton size="lg">
              <template #icon>🔍</template>
              搜索
            </ChatToolbarButton>
            <ChatToolbarButton size="lg">
              <template #icon>🖥</template>
              推理
            </ChatToolbarButton>
            <ChatToolbarButton size="lg" icon-only>
              <template #icon>⚙</template>
              设置
            </ChatToolbarButton>
          </div>
        </div>
      </div>
    `
  })
}

/**
 * 所有变体对比 - 视觉样式不影响尺寸
 * 
 * 关键验证点：
 * - default/primary/ghost/outline 的高度完全一致
 * - 变体只改变颜色、背景、边框，不改变布局相关属性
 */
export const AllVariants: Story = {
  render: () => ({
    components: { ChatToolbarButton },
    template: `
      <div style="display: flex; flex-direction: column; gap: 16px; padding: 16px; background: #f5f5f7;">
        <div style="display: flex; gap: 8px; align-items: center;">
          <ChatToolbarButton variant="default">
            <template #icon>🔍</template>
            Default
          </ChatToolbarButton>
          <ChatToolbarButton variant="primary">
            <template #icon>🚀</template>
            Primary
          </ChatToolbarButton>
          <ChatToolbarButton variant="ghost">
            <template #icon>👻</template>
            Ghost
          </ChatToolbarButton>
          <ChatToolbarButton variant="outline">
            <template #icon>📝</template>
            Outline
          </ChatToolbarButton>
        </div>
      </div>
    `
  })
}

/**
 * 激活状态 - 功能已启用时的视觉反馈
 */
export const ActiveState: Story = {
  render: () => ({
    components: { ChatToolbarButton },
    template: `
      <div style="display: flex; gap: 8px; padding: 16px; background: #f5f5f7;">
        <ChatToolbarButton :active="false">
          <template #icon>🔍</template>
          搜索（未激活）
        </ChatToolbarButton>
        <ChatToolbarButton :active="true">
          <template #icon>🖥</template>
          推理（已激活）
        </ChatToolbarButton>
        <ChatToolbarButton :active="true">
          <template #icon>🎨</template>
          绘图（已激活）
        </ChatToolbarButton>
      </div>
    `
  })
}

/**
 * 真实场景模拟 - ChatToolbar 按钮组
 * 
 * 这是最接近实际应用的场景，包含：
 * - 图标按钮
 * - 图标+文字按钮
 * - 下拉按钮（带尾部箭头）
 * - 激活/未激活状态
 * 
 * 关键验证点：所有按钮高度完全一致（32px）
 */
export const ToolbarButtonGroup: Story = {
  render: () => ({
    components: { ChatToolbarButton },
    setup() {
      const webSearchEnabled = ref(false)
      const reasoningEnabled = ref(true)
      const imageGenerationEnabled = ref(false)

      return {
        webSearchEnabled,
        reasoningEnabled,
        imageGenerationEnabled
      }
    },
    template: `
      <div style="display: flex; gap: 8px; padding: 16px; background: #f5f5f7; border-radius: 8px;">
        <!-- Plus 按钮 -->
        <ChatToolbarButton size="md" variant="ghost" icon-only>
          <template #icon>
            <svg width="16" height="16" viewBox="0 0 16 16" fill="currentColor">
              <path d="M8 3.5a.5.5 0 0 1 .5.5v3.5H12a.5.5 0 0 1 0 1H8.5V12a.5.5 0 0 1-1 0V8.5H4a.5.5 0 0 1 0-1h3.5V4a.5.5 0 0 1 .5-.5z"/>
            </svg>
          </template>
          打开功能菜单
        </ChatToolbarButton>

        <!-- 搜索按钮 -->
        <ChatToolbarButton 
          size="md" 
          :active="webSearchEnabled"
          @click="webSearchEnabled = !webSearchEnabled"
        >
          <template #icon>🔍</template>
          搜索
        </ChatToolbarButton>

        <!-- 推理按钮（已激活） -->
        <ChatToolbarButton 
          size="md" 
          :active="reasoningEnabled"
          @click="reasoningEnabled = !reasoningEnabled"
        >
          <template #icon>🖥</template>
          推理
          <template #trailing>
            <svg width="12" height="12" viewBox="0 0 12 12" fill="currentColor" style="opacity: 0.6;">
              <path d="M2 4l4 4 4-4H2z"/>
            </svg>
          </template>
        </ChatToolbarButton>

        <!-- 绘图按钮 -->
        <ChatToolbarButton 
          size="md" 
          :active="imageGenerationEnabled"
          @click="imageGenerationEnabled = !imageGenerationEnabled"
        >
          <template #icon>🎨</template>
          绘图
          <template #trailing>
            <svg width="12" height="12" viewBox="0 0 12 12" fill="currentColor" style="opacity: 0.6;">
              <path d="M2 4l4 4 4-4H2z"/>
            </svg>
          </template>
        </ChatToolbarButton>

        <!-- 参数按钮 -->
        <ChatToolbarButton size="md" icon-only>
          <template #icon>⚙</template>
          参数设置
        </ChatToolbarButton>
      </div>
    `
  })
}

/**
 * 交互式演示 - 所有状态组合
 */
export const Interactive: Story = {
  render: () => ({
    components: { ChatToolbarButton },
    setup() {
      const isActive = ref(false)
      const isDisabled = ref(false)
      const clickCount = ref(0)

      const handleClick = () => {
        clickCount.value++
      }

      return {
        isActive,
        isDisabled,
        clickCount,
        handleClick
      }
    },
    template: `
      <div style="display: flex; flex-direction: column; gap: 16px; padding: 16px; background: #f5f5f7;">
        <div style="display: flex; gap: 8px;">
          <label style="display: flex; align-items: center; gap: 4px; font-size: 14px;">
            <input type="checkbox" v-model="isActive" />
            激活状态
          </label>
          <label style="display: flex; align-items: center; gap: 4px; font-size: 14px;">
            <input type="checkbox" v-model="isDisabled" />
            禁用状态
          </label>
        </div>

        <ChatToolbarButton 
          :active="isActive"
          :disabled="isDisabled"
          @click="handleClick"
        >
          <template #icon>🚀</template>
          点击测试
        </ChatToolbarButton>

        <div style="font-size: 14px; color: #666;">
          点击次数: {{ clickCount }}
        </div>
      </div>
    `
  })
}

/**
 * 无障碍测试 - 纯图标模式
 * 
 * 验证点：
 * - iconOnly 模式下，文本被隐藏但仍可被屏幕阅读器读取
 * - 按钮保持正方形（aspect-ratio: 1）
 */
export const IconOnlyMode: Story = {
  render: () => ({
    components: { ChatToolbarButton },
    template: `
      <div style="display: flex; gap: 8px; padding: 16px; background: #f5f5f7;">
        <ChatToolbarButton size="sm" icon-only>
          <template #icon>🔍</template>
          搜索
        </ChatToolbarButton>
        <ChatToolbarButton size="md" icon-only>
          <template #icon>🖥</template>
          推理
        </ChatToolbarButton>
        <ChatToolbarButton size="lg" icon-only>
          <template #icon>🎨</template>
          绘图
        </ChatToolbarButton>
      </div>
    `
  })
}

/**
 * 禁用状态
 */
export const DisabledState: Story = {
  render: () => ({
    components: { ChatToolbarButton },
    template: `
      <div style="display: flex; gap: 8px; padding: 16px; background: #f5f5f7;">
        <ChatToolbarButton disabled>
          <template #icon>🔍</template>
          搜索（禁用）
        </ChatToolbarButton>
        <ChatToolbarButton disabled variant="primary">
          <template #icon>🚀</template>
          发送（禁用）
        </ChatToolbarButton>
        <ChatToolbarButton disabled :active="true">
          <template #icon>🖥</template>
          推理（禁用+激活）
        </ChatToolbarButton>
      </div>
    `
  })
}

/**
 * 暗色模式预览
 * 
 * 注意：需要在 Storybook 工具栏切换背景色才能完整测试暗色模式
 */
export const DarkMode: Story = {
  render: () => ({
    components: { ChatToolbarButton },
    template: `
      <div style="display: flex; gap: 8px; padding: 16px; background: #1a1a1a; border-radius: 8px;">
        <ChatToolbarButton>
          <template #icon>🔍</template>
          搜索
        </ChatToolbarButton>
        <ChatToolbarButton variant="primary">
          <template #icon>🚀</template>
          Primary
        </ChatToolbarButton>
        <ChatToolbarButton :active="true">
          <template #icon>🖥</template>
          推理（激活）
        </ChatToolbarButton>
        <ChatToolbarButton variant="ghost">
          <template #icon>👻</template>
          Ghost
        </ChatToolbarButton>
      </div>
    `
  })
}
