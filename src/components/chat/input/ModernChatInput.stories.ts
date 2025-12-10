import type { Meta, StoryObj } from '@storybook/vue3'
import { reactive } from 'vue'
import ModernChatInput from './ModernChatInput.vue'
import type { SamplingParameterSettings, ReasoningPreference } from '../../../types/chat'

// ===== Mock assets =====
const baseImageDataUri =
  'data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNk+M9QDwADhgGAWjR9awAAAABJRU5ErkJggg=='

const defaultSampling: SamplingParameterSettings = {
  enabled: true,
  temperature: 0.7,
  temperature_mode: 'SLIDER',
  top_p: 0.9,
  top_p_mode: 'SLIDER',
  top_k: 40,
  top_k_mode: 'SLIDER',
  max_tokens: 4096,
  max_tokens_mode: 'SLIDER'
}

const defaultReasoningPreference: ReasoningPreference = {
  visibility: 'visible',
  effort: 'medium',
  maxTokens: 2048,
  mode: 'medium'
}

// ===== Story helpers =====
const createInteractiveRender = () => (args: any) => ({
  components: { ModernChatInput },
  setup() {
    const state = reactive({
      input: args.modelValue as string,
      pendingAttachments: [...(args.pendingAttachments || [])] as string[],
      pendingFiles: [...(args.pendingFiles || [])] as Array<{
        name: string
        size: number
        type: string
        pdfEngine?: string
      }>,
      webSearchEnabled: args.webSearchEnabled as boolean,
      reasoningEnabled: args.reasoningEnabled as boolean,
      imageGenerationEnabled: args.imageGenerationEnabled as boolean,
      samplingParametersEnabled: args.samplingParametersEnabled as boolean,
      samplingParameters: { ...(args.samplingParameters || {}) } as SamplingParameterSettings,
      reasoningPreference: { ...(args.reasoningPreference || {}) } as ReasoningPreference | undefined,
      sendDelayPending: args.sendDelayPending as boolean
    })

    const log = (label: string, payload?: unknown) => {
      console.log(`[ModernChatInput story] ${label}`, payload)
    }

    const handleUpdateInput = (value: string) => {
      state.input = value
    }

    const handleClearAttachments = () => {
      state.pendingAttachments.splice(0)
      state.pendingFiles.splice(0)
    }

    const handleRemoveImage = (index: number) => {
      state.pendingAttachments.splice(index, 1)
    }

    const handleRemoveFile = (index: number) => {
      state.pendingFiles.splice(index, 1)
    }

    const handleUpdateFilePdfEngine = (index: number, engine: string) => {
      const target = state.pendingFiles[index]
      if (target) target.pdfEngine = engine
    }

    const handleSelectImage = () => {
      state.pendingAttachments.push(baseImageDataUri)
      log('select-image (mock upload)')
    }

    const handleSelectFile = () => {
      state.pendingFiles.push({
        name: `Attachment-${state.pendingFiles.length + 1}.pdf`,
        size: 120 * 1024,
        type: 'application/pdf',
        pdfEngine: 'pdf-text'
      })
      log('select-file (mock upload)')
    }

    const handleSend = () => {
      state.sendDelayPending = true
      log('send')
    }

    const handleStop = () => log('stop')

    const handleUndoDelay = () => {
      state.sendDelayPending = false
      log('undo-delay')
    }

    const handleUpdateWebSearchEnabled = (value: boolean) => {
      state.webSearchEnabled = value
    }

    const handleToggleReasoning = () => {
      state.reasoningEnabled = !state.reasoningEnabled
    }

    const handleToggleImageGeneration = () => {
      state.imageGenerationEnabled = !state.imageGenerationEnabled
    }

    const handleToggleSampling = () => {
      state.samplingParametersEnabled = !state.samplingParametersEnabled
    }

    const handleUpdateSamplingParameters = (params: SamplingParameterSettings) => {
      state.samplingParameters = { ...state.samplingParameters, ...params }
    }

    const handleOpenModelPicker = () => log('open-model-picker')

    const handleUpdateReasoningPreference = (preference: ReasoningPreference) => {
      state.reasoningPreference = { ...preference }
    }

    return {
      args,
      state,
      handleUpdateInput,
      handleClearAttachments,
      handleRemoveImage,
      handleRemoveFile,
      handleUpdateFilePdfEngine,
      handleSelectImage,
      handleSelectFile,
      handleSend,
      handleStop,
      handleUndoDelay,
      handleUpdateWebSearchEnabled,
      handleToggleReasoning,
      handleToggleImageGeneration,
      handleToggleSampling,
      handleUpdateSamplingParameters,
      handleOpenModelPicker,
      handleUpdateReasoningPreference
    }
  },
  template: `
    <div class="min-h-screen bg-gray-50 dark:bg-gray-900 p-6">
      <div class="max-w-4xl mx-auto">
        <ModernChatInput
          v-bind="args"
          :model-value="state.input"
          :pending-attachments="state.pendingAttachments"
          :pending-files="state.pendingFiles"
          :web-search-enabled="state.webSearchEnabled"
          :reasoning-enabled="state.reasoningEnabled"
          :image-generation-enabled="state.imageGenerationEnabled"
          :sampling-parameters-enabled="state.samplingParametersEnabled"
          :sampling-parameters="state.samplingParameters"
          :reasoning-preference="state.reasoningPreference"
          :send-delay-pending="state.sendDelayPending"
          @update:model-value="handleUpdateInput"
          @send="handleSend"
          @stop="handleStop"
          @undo-delay="handleUndoDelay"
          @clear-attachments="handleClearAttachments"
          @remove-image="handleRemoveImage"
          @remove-file="handleRemoveFile"
          @update:file-pdf-engine="handleUpdateFilePdfEngine"
          @select-image="handleSelectImage"
          @select-file="handleSelectFile"
          @update:web-search-enabled="handleUpdateWebSearchEnabled"
          @toggle-reasoning="handleToggleReasoning"
          @toggle-image-generation="handleToggleImageGeneration"
          @toggle-sampling="handleToggleSampling"
          @update:sampling-parameters="handleUpdateSamplingParameters"
          @open-model-picker="handleOpenModelPicker"
          @update:reasoning-preference="handleUpdateReasoningPreference"
        />
      </div>
    </div>
  `
})

// ===== Meta =====
const meta: Meta<typeof ModernChatInput> = {
  title: 'Chat/ModernChatInput',
  component: ModernChatInput,
  tags: ['autodocs'],
  parameters: {
    layout: 'fullscreen',
    docs: {
      description: {
        component:
          '## 现代化聊天输入组件（正式生产版本）\n\n' +
          '### 功能按钮\n' +
          '- 上传附件（灰色，始终显示）\n' +
          '- Web 搜索（蓝色）\n' +
          '- 推理功能（紫色）\n' +
          '- 图像生成（粉色）\n' +
          '- 采样参数（橙色）\n\n' +
          '悬浮胶囊设计的聊天输入界面，集成所有输入功能。已完全替代传统 ChatInputArea，是项目中唯一的聊天输入实现。\n\n' +
          '### 核心功能\n' +
          '- 📝 多行文本输入（自动扩展 1-10 行）\n' +
          '- 📎 附件支持（图片 + PDF/TXT 文件）\n' +
          '- 🔍 Web 搜索集成（快速/普通/深入）\n' +
          '- 🧠 推理控制（低/中/高档，token 预算）\n' +
          '- 🎨 图像生成（多种宽高比）\n' +
          '- ⚙️ 采样参数（temperature, top_p 等）\n' +
          '- ⏱️ 延迟发送（可撤回）\n\n' +
          '### 视觉规范\n' +
          '- 悬浮胶囊：`rounded-3xl shadow-lg`\n' +
          '- 功能按钮：`h-9 px-3 text-sm font-medium rounded-full`\n' +
          '- 主操作按钮：`h-9 px-5 text-sm font-semibold rounded-full`\n' +
          '- 圆形辅助按钮：`h-9 w-9 text-sm rounded-full`\n' +
          '- 所有按钮高度统一 36px，字号 14px\n\n' +
          '### 使用示例\n' +
          '```vue\n' +
          '<ModernChatInput\n' +
          '  v-model="draftInput"\n' +
          '  :generation-status="generationStatus"\n' +
          '  :pending-attachments="attachments"\n' +
          '  :web-search-enabled="webSearchEnabled"\n' +
          '  @send="handleSend"\n' +
          '  @stop="stopGeneration"\n' +
          '/>\n' +
          '```\n\n' +
          '### API 文档\n' +
          '**Props**（23 个，按功能分组）：\n' +
          '- `modelValue` (string): v-model 绑定的输入文本\n' +
          '- `placeholder` (string): 输入框占位符\n' +
          '- `disabled` (boolean): 禁用状态\n' +
          '- `generationStatus` (\'idle\' | \'sending\' | \'receiving\'): 生成状态\n' +
          '- `canSend` (boolean): 是否允许发送\n' +
          '- `sendDelayPending` (boolean): 延迟发送倒计时中\n' +
          '- `sendButtonTitle` (string): 发送按钮标题\n' +
          '- `pendingAttachments` (string[]): 待发送图片 Base64 数组\n' +
          '- `pendingFiles` (object[]): 待发送文件对象数组\n' +
          '- `selectedPdfEngine` (string): PDF 引擎选择\n' +
          '- `attachmentAlert` (string): 附件警告信息\n' +
          '- `webSearchEnabled` (boolean): Web 搜索开关\n' +
          '- `reasoningEnabled` (boolean): 推理功能开关\n' +
          '- `imageGenerationEnabled` (boolean): 图像生成开关\n' +
          '- `samplingParametersEnabled` (boolean): 采样参数开关\n' +
          '- `showSamplingMenu` (boolean): 显示采样菜单\n' +
          '- `webSearchLevelLabel` (string): 搜索级别标签\n' +
          '- `reasoningEffortLabel` (string): 推理档位标签\n' +
          '- `currentAspectRatioLabel` (string): 当前宽高比标签\n' +
          '- `isWebSearchAvailable` (boolean): 搜索功能可用性\n' +
          '- `isReasoningSupported` (boolean): 推理功能支持\n' +
          '- `canShowImageGenerationButton` (boolean): 图像生成按钮显示\n' +
          '- `reasoningPreference` (object): 推理配置对象\n' +
          '- `activeProvider` (string): 当前提供商\n' +
          '- `currentModelId` (string): 当前模型 ID\n' +
          '- `currentModelName` (string): 当前模型名称\n' +
          '- `modelDataMap` (Map): 模型数据映射\n' +
          '- `modelCapability` (object): 模型能力对象\n' +
          '- `samplingParameters` (object): 采样参数对象\n\n' +
          '**Events**（21 个事件）：\n' +
          '- `@update:modelValue(value)`: 更新输入内容\n' +
          '- `@send`: 发送消息\n' +
          '- `@stop`: 停止生成\n' +
          '- `@undo-delay`: 撤回延迟发送\n' +
          '- `@clear-attachments`: 清空所有附件\n' +
          '- `@remove-image(index)`: 移除图片附件\n' +
          '- `@remove-file(index)`: 移除文件附件\n' +
          '- `@update:file-pdf-engine(index, engine)`: 更新文件 PDF 引擎\n' +
          '- `@select-image`: 选择图片附件\n' +
          '- `@select-file`: 选择文件附件\n' +
          '- `@update:web-search-enabled(enabled)`: 更新搜索开关\n' +
          '- `@toggle-reasoning`: 切换推理功能\n' +
          '- `@toggle-image-generation`: 切换图像生成\n' +
          '- `@toggle-sampling`: 切换采样参数\n' +
          '- `@disable-sampling`: 禁用采样参数\n' +
          '- `@select-web-search-level(level)`: 选择搜索级别\n' +
          '- `@select-reasoning-effort(effort)`: 选择推理档位\n' +
          '- `@update:reasoning-preference(preference)`: 更新推理配置\n' +
          '- `@update:image-generation-aspect-ratio(ratio)`: 更新图像宽高比\n' +
          '- `@cycle-aspect-ratio`: 循环切换宽高比\n' +
          '- `@update:sampling-parameters(params)`: 更新采样参数\n' +
          '- `@reset-sampling-parameters`: 重置采样参数\n' +
          '- `@open-model-picker`: 打开模型选择器\n\n' +
          '### 迁移说明\n' +
          '- ✅ 已完全替代 `ChatInputArea.vue`（已归档）\n' +
          '- ✅ ChatView.vue 已移除条件分支，ModernChatInput 成为唯一实现\n' +
          '- ✅ 所有功能已验证：附件、搜索、推理、采样、图像生成、多标签页\n' +
          '- ✅ Tailwind v4 兼容（使用斜杠透明度语法，如 `bg-white/90`）\n' +
          '- 📖 详细文档：`docs/MODERN_CHAT_INPUT_IMPLEMENTATION.md`'
      }
    }
  },
  argTypes: {
    modelValue: { control: 'text' },
    generationStatus: {
      control: 'select',
      options: ['idle', 'sending', 'receiving']
    },
    attachmentAlert: { control: 'text' }
  }
}

export default meta
type Story = StoryObj<typeof meta>

// ===== Stories =====
export const Playground: Story = {
  args: {
    modelValue: 'Draft a release note for v0.9 that highlights the new chat UI.',
    placeholder: 'Type a message... (Ctrl/Cmd + Enter to send)',
    generationStatus: 'idle',
    sendButtonTitle: 'Send message',
    webSearchEnabled: true,
    reasoningEnabled: false,
    imageGenerationEnabled: false,
    samplingParametersEnabled: false,
    samplingParameters: defaultSampling,
    reasoningPreference: defaultReasoningPreference,
    pendingAttachments: [],
    pendingFiles: []
  },
  render: createInteractiveRender()
}

export const WithAttachmentsAndControls: Story = {
  args: {
    modelValue: 'Summarize these documents and keep the tone friendly.',
    placeholder: 'Share context, attach files, or drop images here...',
    generationStatus: 'receiving',
    sendDelayPending: false,
    sendButtonTitle: 'Sending...',
    webSearchEnabled: true,
    reasoningEnabled: true,
    imageGenerationEnabled: true,
    samplingParametersEnabled: true,
    samplingParameters: {
      ...defaultSampling,
      temperature: 0.5,
      max_tokens: 2048
    },
    reasoningPreference: {
      ...defaultReasoningPreference,
      effort: 'high',
      maxTokens: 3072,
      mode: 'high'
    },
    attachmentAlert: 'Mock limit: 5 attachments max.',
    pendingAttachments: [baseImageDataUri, baseImageDataUri],
    pendingFiles: [
      {
        name: 'Product-Spec.pdf',
        size: 320 * 1024,
        type: 'application/pdf',
        pdfEngine: 'pdf-text'
      },
      {
        name: 'Architecture.png',
        size: 140 * 1024,
        type: 'image/png'
      }
    ]
  },
  render: createInteractiveRender()
}

export const AllFeaturesEnabled: Story = {
  name: '所有功能启用（展示按钮尺寸统一）',
  args: {
    modelValue: '检查所有功能按钮的高度和字体大小是否统一',
    placeholder: 'Type a message...',
    generationStatus: 'idle',
    sendButtonTitle: 'Send',
    webSearchEnabled: true,
    reasoningEnabled: true,
    imageGenerationEnabled: true,
    samplingParametersEnabled: true,
    isWebSearchAvailable: true,
    isReasoningSupported: true,
    canShowImageGenerationButton: true,
    samplingParameters: defaultSampling,
    reasoningPreference: defaultReasoningPreference,
    pendingAttachments: [],
    pendingFiles: []
  },
  render: createInteractiveRender(),
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

