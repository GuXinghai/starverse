/**
 * IntegratedPromptBox.stories.ts - IntegratedPromptBox Storybook Stories
 * 
 * 测试整合型功能栏的所有状态：
 * - 不同 chip 组合（推理/搜索/参数/图像生成）
 * - 交互状态（空闲/发送中/接收中）
 * - 发送按钮状态（可发送/禁用/延迟中/撤回）
 * - 响应式布局
 */

import type { Meta, StoryObj } from '@storybook/vue3'
import { ref } from 'vue'
import IntegratedPromptBox from './IntegratedPromptBox.vue'

const meta: Meta<typeof IntegratedPromptBox> = {
  title: 'Chat/Input/IntegratedPromptBox',
  component: IntegratedPromptBox,
  tags: ['autodocs'],
  parameters: {
    layout: 'padded',
    docs: {
      description: {
        component: `
## IntegratedPromptBox - 整合型功能栏

功能按钮平铺展示的聊天输入栏，所有功能一目了然。

### 核心特性
- ✅ 清晰直观：所有功能按钮平铺展示
- ✅ 状态明确：启用/禁用状态用颜色区分
- ✅ 发送便捷：发送按钮固定在右侧
- ✅ 设计令牌：按钮高度使用 CSS variables

### 功能按钮类型
- 上传附件（灰色，始终显示，不可切换）
- Web 搜索（蓝色）
- 推理功能（紫色）
- 图像生成（粉色）
- 采样参数（橙色）
        `
      }
    }
  },
  argTypes: {
    generationStatus: {
      control: 'select',
      options: ['idle', 'sending', 'receiving'],
      description: '当前生成状态'
    },
    webSearchEnabled: {
      control: 'boolean',
      description: 'Web 搜索是否启用'
    },
    reasoningEnabled: {
      control: 'boolean',
      description: '推理功能是否启用'
    },
    imageGenerationEnabled: {
      control: 'boolean',
      description: '图像生成是否启用'
    },
    samplingParametersEnabled: {
      control: 'boolean',
      description: '采样参数是否启用'
    },
    canSend: {
      control: 'boolean',
      description: '是否可以发送消息'
    },
    sendDelayPending: {
      control: 'boolean',
      description: '是否处于发送延迟状态（可撤回）'
    }
  }
}

export default meta
type Story = StoryObj<typeof IntegratedPromptBox>

/**
 * 默认状态 - 所有功能禁用，无法发送
 */
export const Default: Story = {
  args: {
    generationStatus: 'idle',
    webSearchEnabled: false,
    reasoningEnabled: false,
    imageGenerationEnabled: false,
    samplingParametersEnabled: false,
    canSend: false,
    sendDelayPending: false,
    isWebSearchAvailable: true,
    isReasoningAvailable: true,
    canShowImageGenerationButton: true,
    currentModelName: 'Claude 3.5 Sonnet',
    currentProviderName: 'OpenRouter'
  }
}

/**
 * 可发送状态
 */
export const CanSend: Story = {
  args: {
    ...Default.args,
    canSend: true
  },
  parameters: {
    docs: {
      description: {
        story: '输入了内容，发送按钮可点击'
      }
    }
  }
}

/**
 * 单个功能启用 - Web 搜索
 */
export const WithWebSearch: Story = {
  args: {
    ...CanSend.args,
    webSearchEnabled: true,
    webSearchLevelLabel: 'normal'
  },
  parameters: {
    docs: {
      description: {
        story: 'Web 搜索功能启用，按钮显示为蓝色激活状态'
      }
    }
  }
}

/**
 * 单个功能启用 - 推理
 */
export const WithReasoning: Story = {
  args: {
    ...CanSend.args,
    reasoningEnabled: true,
    reasoningEffortLabel: 'medium'
  },
  parameters: {
    docs: {
      description: {
        story: '推理功能启用，按钮显示为紫色激活状态'
      }
    }
  }
}

/**
 * 单个功能启用 - 图像生成
 */
export const WithImageGeneration: Story = {
  args: {
    ...CanSend.args,
    imageGenerationEnabled: true,
    currentAspectRatioLabel: '16:9'
  },
  parameters: {
    docs: {
      description: {
        story: '图像生成功能启用，按钮显示为粉色激活状态'
      }
    }
  }
}

/**
 * 单个功能启用 - 采样参数
 */
export const WithSamplingParameters: Story = {
  args: {
    ...CanSend.args,
    samplingParametersEnabled: true,
    samplingParameters: {
      enabled: true,
      temperature: 0.7,
      top_p: 0.9,
      top_k: 40,
      max_tokens: 2000
    }
  },
  parameters: {
    docs: {
      description: {
        story: '采样参数功能启用，按钮显示为橙色激活状态'
      }
    }
  }
}

/**
 * 多功能组合 - 搜索 + 推理
 */
export const SearchAndReasoning: Story = {
  args: {
    ...CanSend.args,
    webSearchEnabled: true,
    reasoningEnabled: true,
    webSearchLevelLabel: 'deep',
    reasoningEffortLabel: 'high'
  },
  parameters: {
    docs: {
      description: {
        story: '搜索和推理功能同时启用，测试按钮间距和对齐'
      }
    }
  }
}

/**
 * 全功能启用
 */
export const AllFeaturesEnabled: Story = {
  args: {
    ...CanSend.args,
    webSearchEnabled: true,
    reasoningEnabled: true,
    imageGenerationEnabled: true,
    samplingParametersEnabled: true,
    webSearchLevelLabel: 'deep',
    reasoningEffortLabel: 'high',
    currentAspectRatioLabel: '1:1'
  },
  parameters: {
    docs: {
      description: {
        story: '所有功能同时启用，测试多按钮换行布局和高度一致性'
      }
    }
  }
}

/**
 * 发送延迟状态（可撤回）
 */
export const SendDelayPending: Story = {
  args: {
    ...Default.args,
    canSend: true,
    sendDelayPending: true
  },
  parameters: {
    docs: {
      description: {
        story: '发送延迟中，显示「撤回」按钮（琥珀色）'
      }
    }
  }
}

/**
 * 发送中状态
 */
export const Sending: Story = {
  args: {
    ...AllFeaturesEnabled.args,
    generationStatus: 'sending',
    canSend: false
  },
  parameters: {
    docs: {
      description: {
        story: '消息发送中，所有功能按钮禁用'
      }
    }
  }
}

/**
 * 接收中状态（显示停止按钮）
 */
export const Receiving: Story = {
  args: {
    ...AllFeaturesEnabled.args,
    generationStatus: 'receiving',
    canSend: false
  },
  parameters: {
    docs: {
      description: {
        story: 'AI 回复中，显示「停止」按钮（红色），可中断生成'
      }
    }
  }
}

/**
 * 功能不可用状态
 */
export const FeaturesUnavailable: Story = {
  args: {
    ...Default.args,
    isWebSearchAvailable: false,
    isReasoningAvailable: false,
    canShowImageGenerationButton: false
  },
  parameters: {
    docs: {
      description: {
        story: '所有高级功能不可用（如 Gemini 只有上传和参数），只显示上传附件按钮'
      }
    }
  }
}

/**
 * 交互演示 - 带状态管理
 */
export const Interactive: Story = {
  render: (args) => ({
    components: { IntegratedPromptBox },
    setup() {
      const webSearchEnabled = ref(false)
      const reasoningEnabled = ref(false)
      const imageGenerationEnabled = ref(false)
      const samplingParametersEnabled = ref(false)
      const canSend = ref(true)
      const generationStatus = ref<'idle' | 'sending' | 'receiving'>('idle')

      const handleToggleWebSearch = (value: boolean) => {
        webSearchEnabled.value = value
        console.log('[Story] 切换搜索:', value)
      }

      const handleToggleReasoning = () => {
        reasoningEnabled.value = !reasoningEnabled.value
        console.log('[Story] 切换推理:', reasoningEnabled.value)
      }

      const handleToggleImageGeneration = () => {
        imageGenerationEnabled.value = !imageGenerationEnabled.value
        console.log('[Story] 切换图像生成:', imageGenerationEnabled.value)
      }

      const handleToggleSampling = () => {
        samplingParametersEnabled.value = !samplingParametersEnabled.value
        console.log('[Story] 切换参数:', samplingParametersEnabled.value)
      }

      const handleSend = () => {
        console.log('[Story] 发送消息')
        generationStatus.value = 'sending'
        setTimeout(() => {
          generationStatus.value = 'receiving'
        }, 500)
        setTimeout(() => {
          generationStatus.value = 'idle'
        }, 3000)
      }

      const handleStop = () => {
        console.log('[Story] 停止生成')
        generationStatus.value = 'idle'
      }

      return {
        args,
        webSearchEnabled,
        reasoningEnabled,
        imageGenerationEnabled,
        samplingParametersEnabled,
        canSend,
        generationStatus,
        handleToggleWebSearch,
        handleToggleReasoning,
        handleToggleImageGeneration,
        handleToggleSampling,
        handleSend,
        handleStop
      }
    },
    template: `
      <div>
        <div class="mb-4 p-4 bg-gray-100 rounded">
          <h3 class="font-bold mb-2">当前状态</h3>
          <div class="text-sm space-y-1">
            <div>Web 搜索: <strong>{{ webSearchEnabled ? '启用' : '禁用' }}</strong></div>
            <div>推理功能: <strong>{{ reasoningEnabled ? '启用' : '禁用' }}</strong></div>
            <div>图像生成: <strong>{{ imageGenerationEnabled ? '启用' : '禁用' }}</strong></div>
            <div>采样参数: <strong>{{ samplingParametersEnabled ? '启用' : '禁用' }}</strong></div>
            <div>生成状态: <strong>{{ generationStatus }}</strong></div>
          </div>
        </div>

        <IntegratedPromptBox
          v-bind="args"
          :generation-status="generationStatus"
          :web-search-enabled="webSearchEnabled"
          :reasoning-enabled="reasoningEnabled"
          :image-generation-enabled="imageGenerationEnabled"
          :sampling-parameters-enabled="samplingParametersEnabled"
          :can-send="canSend"
          @update:web-search-enabled="handleToggleWebSearch"
          @toggle-reasoning="handleToggleReasoning"
          @toggle-image-generation="handleToggleImageGeneration"
          @toggle-sampling="handleToggleSampling"
          @send="handleSend"
          @stop="handleStop"
        />
      </div>
    `
  }),
  args: {
    ...Default.args,
    canSend: true
  },
  parameters: {
    docs: {
      description: {
        story: '完整交互演示，点击功能按钮切换状态，点击发送模拟生成流程'
      }
    }
  }
}

/**
 * 移动端视图 (480px)
 */
export const MobileView: Story = {
  args: {
    ...AllFeaturesEnabled.args
  },
  parameters: {
    viewport: {
      defaultViewport: 'mobile1'
    },
    docs: {
      description: {
        story: '移动端视口，按钮文字隐藏，只显示图标'
      }
    }
  }
}

/**
 * 平板视图 (768px)
 */
export const TabletView: Story = {
  args: {
    ...AllFeaturesEnabled.args
  },
  parameters: {
    viewport: {
      defaultViewport: 'tablet'
    },
    docs: {
      description: {
        story: '平板视口，按钮正常显示'
      }
    }
  }
}

/**
 * 桌面视图 (1280px)
 */
export const DesktopView: Story = {
  args: {
    ...AllFeaturesEnabled.args
  },
  parameters: {
    viewport: {
      defaultViewport: 'desktop'
    },
    docs: {
      description: {
        story: '桌面视口，所有功能按钮和发送按钮在一行'
      }
    }
  }
}

/**
 * 按钮颜色和状态对比
 */
export const ButtonColorStates: Story = {
  render: () => ({
    template: `
      <div class="space-y-6">
        <h3 class="font-bold">功能按钮颜色状态对比</h3>
        
        <div class="space-y-4">
          <div>
            <h4 class="text-sm font-semibold mb-2">Web 搜索（蓝色）</h4>
            <div class="flex gap-2">
              <button class="flex items-center gap-2 px-4 py-2 rounded-lg border border-gray-300 bg-gray-100 text-gray-700">
                禁用状态
              </button>
              <button class="flex items-center gap-2 px-4 py-2 rounded-lg border border-blue-300 bg-blue-100 text-blue-700">
                启用状态
              </button>
            </div>
          </div>

          <div>
            <h4 class="text-sm font-semibold mb-2">推理功能（紫色）</h4>
            <div class="flex gap-2">
              <button class="flex items-center gap-2 px-4 py-2 rounded-lg border border-gray-300 bg-gray-100 text-gray-700">
                禁用状态
              </button>
              <button class="flex items-center gap-2 px-4 py-2 rounded-lg border border-purple-300 bg-purple-100 text-purple-700">
                启用状态
              </button>
            </div>
          </div>

          <div>
            <h4 class="text-sm font-semibold mb-2">图像生成（粉色）</h4>
            <div class="flex gap-2">
              <button class="flex items-center gap-2 px-4 py-2 rounded-lg border border-gray-300 bg-gray-100 text-gray-700">
                禁用状态
              </button>
              <button class="flex items-center gap-2 px-4 py-2 rounded-lg border border-pink-300 bg-pink-100 text-pink-700">
                启用状态
              </button>
            </div>
          </div>

          <div>
            <h4 class="text-sm font-semibold mb-2">采样参数（橙色）</h4>
            <div class="flex gap-2">
              <button class="flex items-center gap-2 px-4 py-2 rounded-lg border border-gray-300 bg-gray-100 text-gray-700">
                禁用状态
              </button>
              <button class="flex items-center gap-2 px-4 py-2 rounded-lg border border-orange-300 bg-orange-100 text-orange-700">
                启用状态
              </button>
            </div>
          </div>

          <div>
            <h4 class="text-sm font-semibold mb-2">发送按钮状态</h4>
            <div class="flex gap-2">
              <button class="flex items-center gap-2 px-6 py-2 rounded-lg bg-gradient-to-r from-blue-500 to-blue-600 text-white">
                发送
              </button>
              <button class="flex items-center gap-2 px-6 py-2 rounded-lg bg-gradient-to-r from-amber-500 to-amber-600 text-white">
                撤回
              </button>
              <button class="flex items-center gap-2 px-6 py-2 rounded-lg bg-gradient-to-r from-red-500 to-red-600 text-white">
                停止
              </button>
            </div>
          </div>
        </div>
      </div>
    `
  }),
  parameters: {
    docs: {
      description: {
        story: '展示所有功能按钮的颜色主题和状态变化'
      }
    }
  }
}
