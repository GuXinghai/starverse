/**
 * ChatView.vue - 聊天对话视图组件
 * 
 * ========== 组件概述 ==========
 * 这是聊天应用的核心组件，负责展示单个对话的完整界面，包括：
 * - 消息列表显示（支持分支树结构）
 * - 输入框和消息发送
 * - AI 流式响应接收
 * - 多模态内容（文本+图片）
 * - 消息编辑和重新生成
 * - 模型选择和配置
 * 
 * ========== 多实例架构 ==========
 * 重要：此组件采用多实例架构，由 TabbedChatView 通过 v-for 创建多个实例
 * - 每个打开的标签页对应一个 ChatView 实例
 * - 实例通过 display:none/flex 控制可见性（不销毁）
 * - 切换标签页不触发 onMounted/onUnmounted
 * - 后台实例的流式生成可以继续运行
 * 
 * ========== 上下文固化原则 ==========
 * 关键设计：在异步操作中使用 "上下文固化" 模式
 * 
 * 问题：props.conversationId 可能在异步执行期间变化（标签页切换）
 * 解决：在异步任务启动时立即捕获 conversationId 到局部常量
 * 
 * 示例：
 *   const targetConversationId = props.conversationId  // 🔒 固化
 *   setTimeout(() => {
 *     // 使用 targetConversationId 而不是 props.conversationId
 *     chatStore.someAction(targetConversationId)
 *   }, 1000)
 * 
 * 所有标记 🔒 的代码块都使用了此模式
 */
<script setup lang="ts">
// ========== Vue 核心 API ==========
import { computed, toRef, onMounted, watch } from 'vue'
import type { WebSearchLevel } from '@/types/chat'

// ========== Composables ==========
import { useMessageEditing } from '../composables/useMessageEditing'
import { useMessageSending } from '../composables/useMessageSending'
import { useMessageOperations } from '../composables/chat/useMessageOperations'
import { useMessageDisplay } from '../composables/chat/useMessageDisplay'
import { useUsageMetrics } from '../composables/chat/useUsageMetrics'
import { useReasoningDisplay } from '../composables/chat/useReasoningDisplay'
import { useCurrentConversation } from '../composables/chat/useCurrentConversation'

// ========== Phase 1 Composables (Business Logic) ==========
import { useWebSearch } from '../composables/useWebSearch'
import { useReasoningControl } from '../composables/useReasoningControl'
import { useSamplingParameters } from '../composables/useSamplingParameters'
import { useImageGeneration } from '../composables/useImageGeneration'
import { useAttachmentManager } from '../composables/useAttachmentManager'

// ========== Phase 6 Composables (UI State & Lifecycle) ==========
import { useUIState } from '../composables/chat/useUIState'
import { useMenuControl } from '../composables/chat/useMenuControl'
import { useConversationMetadata } from '../composables/chat/useConversationMetadata'
import { useMessageRetry } from '../composables/chat/useMessageRetry'
import { useLifecycleHandlers } from '../composables/chat/useLifecycleHandlers'

// ========== Store ==========
// 新的模块化 Stores
import { useConversationStore } from '../stores/conversation'
import { useBranchStore } from '../stores/branch'
import { useModelStore } from '../stores/model'
import { usePersistenceStore } from '../stores/persistence'

import { useAppStore } from '../stores'
import { useProjectWorkspaceStore } from '../stores/projectWorkspaceStore'

// ========== 类型定义和工具函数 ==========
import type { ModelGenerationCapability } from '../types/generation'
import type { ReasoningPreference } from '../types/chat'

// ========== 子组件 ==========
import DeleteConfirmDialog from './DeleteConfirmDialog.vue'  // 删除确认对话框
import ChatScrollContainer from './chat/ChatScrollContainer.vue'  // Stick-to-Bottom 滚动容器
import ChatMessageItem from './chat/ChatMessageItem.vue'  // 单条消息渲染组件
import ModernChatInput from './chat/input/ModernChatInput.vue'  // 聊天输入组件（包含参数面板）

// ========== Props 定义 ==========
/**
 * conversationId: 当前对话的唯一标识符
 * 
 * 重要：此 ID 由父组件（TabbedChatView）传入
 * - 用于从 store 中查找对应的对话数据
 * - 在异步操作中需要固化到局部变量（避免标签切换导致的上下文混淆）
 */
const props = defineProps<{
  conversationId: string
}>()

// ========== Store 实例 ==========
// 新的模块化 Stores
const conversationStore = useConversationStore()
const branchStore = useBranchStore()
const modelStore = useModelStore()
const persistenceStore = usePersistenceStore()

// 其他 Stores
const appStore = useAppStore()  // 应用 store，管理全局配置（API Key、Provider 等）
const projectWorkspaceStore = useProjectWorkspaceStore()

// ========== Phase 6: UI State Composable 初始化 ==========
const {
  draftInput,
  chatScrollRef,
  isComponentActive,
  activeMenu,
  conversationTagInput,
  saveTemplateInProgress,
  // 输入区域 Refs（用于菜单控制）
  webSearchControlRef,
  reasoningControlRef,
  parameterControlRef,
  pdfEngineMenuRef
} = useUIState({
  conversationId: toRef(props, 'conversationId'),
  activeTabId: computed(() => conversationStore.activeTabId)
})

// ========== Composable 集成：滚动控制 ==========
// DEPRECATED: 旧的 useScrollControl 已被 ChatScrollContainer 替代
// 现在通过 chatScrollRef.value?.onNewContent() 等方法调用

// ========== Composables 初始化 ==========
// 消息编辑管理
const messageEditingManager = useMessageEditing({
  conversationId: props.conversationId
})

const {
  editingBranchId,
  editingText,
  editingImages,
  editingFiles,
  startEditing,
  cancelEditing,
  addImageToEdit,
  removeImageFromEdit,
  addFileToEdit,
  removeFileFromEdit
} = messageEditingManager

// ========== Reasoning 展示 Composable 初始化 ==========
const {
  captureReasoningForBranch
} = useReasoningDisplay()

// ========== Usage 数据处理 Composable 初始化（仅用于消息重试）==========
const {
  captureUsageForBranch
} = useUsageMetrics()

// ========== 当前对话与模型状态 Composable 初始化 ==========
const {
  currentConversation,
  currentModelSupportsImageOutput
} = useCurrentConversation({
  conversationId: toRef(props, 'conversationId'),
  isActive: isComponentActive,
  pendingAttachments: computed(() => []), // 临时，Phase 2 将替换
  activeProvider: computed(() => appStore.activeProvider),
  appStore
})

// ========== Phase 1: 计算属性 - 从 currentConversation 派生的配置对象 ==========
const webSearchConfig = computed(() => currentConversation.value?.webSearch)
const reasoningPreference = computed(() => {
  const pref = currentConversation.value?.reasoningPreference
  if (!pref) return null
  // 规范化：确保 effort 始终存在
  return {
    visibility: pref.visibility,
    effort: pref.effort || 'medium',
    maxTokens: pref.maxTokens ?? undefined,
    mode: pref.mode
  } as ReasoningPreference
})
const samplingParameters = computed(() => currentConversation.value?.samplingParameters)
const conversationPdfEngine = computed(() => currentConversation.value?.pdfEngine)
const generationStatus = computed(() => currentConversation.value?.generationStatus || 'idle')

// ========== 模型相关计算属性 ==========

/**
 * 解析实际使用的模型ID
 * 
 * 处理 'auto' 的特殊情况：
 * - 如果当前对话有指定模型，使用对话模型
 * - 否则使用全局选中模型
 * - 如果是 'auto' 或 'openrouter/auto'，返回 null（表示无法预先判断能力）
 */
const actualModelId = computed<string | null>(() => {
  const conversationModel = currentConversation.value?.model
  const globalModel = modelStore.selectedModelId
  
  // 优先使用对话级模型，其次使用全局模型
  const modelId = conversationModel || globalModel
  
  // 如果是 'auto' 或 'openrouter/auto'，返回 null
  // 这表示模型由 OpenRouter 动态选择，无法预先判断推理支持
  if (modelId === 'auto' || modelId === 'openrouter/auto') {
    if (import.meta.env.DEV) {
      console.log('[ChatView] actualModelId: auto detected, returning null for capability check')
    }
    return null
  }
  
  return modelId
})

/**
 * 当前模型的能力描述（用于能力感知控件）
 */
const currentModelCapability = computed<ModelGenerationCapability | null>(() => {
  const modelId = actualModelId?.value ?? null
  if (!modelId) return null
  return modelStore.getModelCapability(modelId) || null
})

// ========== Phase 1: 业务逻辑 Composable 初始化 ==========

// Web 搜索管理器
const webSearchManager = useWebSearch({
  webSearchConfig,
  isActive: isComponentActive,
  activeProvider: computed(() => appStore.activeProvider),
  webSearchEngine: computed(() => appStore.webSearchEngine),
  onUpdateEnabled: (enabled: boolean) => {
    conversationStore.setWebSearchEnabled(props.conversationId, enabled)
  },
  onUpdateLevel: (level) => {
    conversationStore.setWebSearchLevel(props.conversationId, level)
  }
})

const { 
  isWebSearchAvailable, 
  buildWebSearchRequestOptions 
} = webSearchManager

// 推理控制管理器
const reasoningManager = useReasoningControl({
  reasoningPreference,
  isActive: isComponentActive,
  activeProvider: computed(() => appStore.activeProvider),
  currentModelId: actualModelId,  // 使用解析后的模型ID
  modelDataMap: computed(() => modelStore.appModelsById),  // 使用新的 AppModel 索引
  onUpdatePreference: (updates) => {
    conversationStore.setReasoningPreference(props.conversationId, updates)
  }
})

const { 
  isReasoningControlAvailable, 
  buildReasoningRequestOptions,
  isReasoningEnabled,
  toggleReasoningEnabled
} = reasoningManager

// 🐛 调试日志
if (import.meta.env.DEV) {
  console.log('[ChatView] Reasoning Manager - Initial:', {
    conversationId: props.conversationId,
    conversationModel: currentConversation.value?.model,
    globalModelId: modelStore.selectedModelId,
    actualModelId: actualModelId?.value ?? null,
    isReasoningControlAvailable: isReasoningControlAvailable.value,
    isReasoningEnabled: isReasoningEnabled.value,
    activeProvider: appStore.activeProvider,
    reasoningPreference: reasoningPreference?.value ?? null
  })
  
  // 监控实际模型ID变化
  watch(
    actualModelId,
    (newModelId, oldModelId) => {
      console.log('[ChatView] 🔄 Actual Model ID changed:', {
        from: oldModelId,
        to: newModelId,
        isReasoningControlAvailable: isReasoningControlAvailable.value
      })
    }
  )
  
  // 监控 isReasoningControlAvailable 变化
  watch(
    isReasoningControlAvailable,
    (newValue, oldValue) => {
      console.log('[ChatView] 🔄 isReasoningControlAvailable changed:', {
        from: oldValue,
        to: newValue,
        modelId: modelStore.selectedModelId
      })
    }
  )
}

// 采样参数管理器
const samplingManager = useSamplingParameters({
  samplingParameters,
  isActive: isComponentActive,
  activeProvider: computed(() => appStore.activeProvider),
  onUpdateParameters: (updates) => {
    conversationStore.setSamplingParameters(props.conversationId, updates)
  }
})

const { 
  isSamplingEnabled, 
  isSamplingControlAvailable, 
  toggleSamplingParametersEnabled,
  validateAllParameters, 
  buildSamplingParameterOverrides 
} = samplingManager

// ========== 参数面板状态管理 ==========
/**
 * 参数面板展开/折叠状态
 * 
 * 当用户点击"参数"按钮时：
 * - 如果菜单不是 'parameters'，设置为 'parameters'（展开）
 * - 如果菜单已是 'parameters'，设置为 null（折叠）
 */
const showParameterPanel = computed({
  get: () => activeMenu.value === 'parameters',
  set: (value: boolean) => {
    activeMenu.value = value ? 'parameters' : null
  }
})

/**
 * 参数面板是否可用
 * - OpenRouter 提供商且模型能力存在时可用
 */
const parameterPanelAvailable = computed(() => {
  return appStore.activeProvider === 'OpenRouter' && !!currentModelCapability.value
})

/**
 * 处理参数面板的采样参数更新
 * 自动持久化到会话级配置
 */
const handleParameterPanelUpdateSamplingParams = (params: any) => {
  conversationStore.setSamplingParameters(props.conversationId, params)
}

/**
 * 处理参数面板的推理偏好更新
 * 自动持久化到会话级配置
 */
const handleParameterPanelUpdateReasoningPreference = (preference: any) => {
  conversationStore.setReasoningPreference(props.conversationId, preference)
}

/**
 * 切换参数面板展开/折叠
 * 参照推理/绘画面板的逻辑
 */
const handleToggleParameterPanel = () => {
  console.log('[ChatView] handleToggleParameterPanel 调用前:', {
    activeMenu: activeMenu.value,
    parameterPanelAvailable: parameterPanelAvailable.value
  })
  
  if (!parameterPanelAvailable.value) {
    console.warn('[ChatView] 参数面板不可用（仅支持 OpenRouter）')
    return
  }
  
  showParameterPanel.value = !showParameterPanel.value
  
  console.log('[ChatView] handleToggleParameterPanel 调用后:', {
    showParameterPanel: showParameterPanel.value,
    activeMenu: activeMenu.value
  })
}

// 附件管理器
const attachmentManager = useAttachmentManager({
  maxImageSizeMB: 10,
  maxFileSizeMB: 20,
  maxImagesPerMessage: 5,
  maxFilesPerMessage: 3
})

const pendingAttachments = attachmentManager.images
const pendingFiles = attachmentManager.files

// ========== PDF 引擎和附件处理管理器 ==========
// 注意：useAttachmentHandlers 现在需要 PDF 引擎相关的参数
// 这里我们直接从 composable 获取所有附件处理功能，包括 PDF 引擎选择
// PDF 引擎选择逻辑已经集成在 useAttachmentHandlers 中

// 计算 selectedPdfEngine 用于传递给 useMessageSending 和 useMessageRetry
const selectedPdfEngine = computed(() => conversationPdfEngine.value || appStore.lastUsedPdfEngine)

// 占位符函数（仍在使用的其他功能）
const showAttachmentAlert = () => {} // 占位符
const focusInput = () => {} // 占位符
const adjustTextareaHeight = () => {} // 占位符
const focusTextarea = () => {} // 占位符

// ========== Phase 2: 附件管理逻辑 ==========
// File input refs
import { ref } from 'vue'
const imageInputRef = ref<HTMLInputElement | null>(null)
const fileInputRef = ref<HTMLInputElement | null>(null)

// 触发文件选择对话框
const handleSelectImage = () => {
  imageInputRef.value?.click()
}

const handleSelectFile = () => {
  fileInputRef.value?.click()
}

// 处理图片文件选择
const handleImageInputChange = async (event: Event) => {
  const input = event.target as HTMLInputElement
  if (!input.files || input.files.length === 0) return
  
  const result = await attachmentManager.addImages(input.files)
  if (!result.success) {
    console.error('[Phase 2] 图片上传失败:', result.error)
    alert(`图片上传失败: ${result.error}`)
  } else {
    console.log('[Phase 2] 图片上传成功,当前图片数:', attachmentManager.images.value.length)
  }
  
  // 清空 input,允许重新选择同一文件
  input.value = ''
}

// 处理普通文件选择
const handleFileInputChange = async (event: Event) => {
  const input = event.target as HTMLInputElement
  if (!input.files || input.files.length === 0) return
  
  const result = await attachmentManager.addFiles(input.files)
  if (!result.success) {
    console.error('[Phase 2] 文件上传失败:', result.error)
    alert(`文件上传失败: ${result.error}`)
  } else {
    console.log('[Phase 2] 文件上传成功,当前文件数:', attachmentManager.files.value.length)
  }
  
  input.value = ''
}


// ========== 高级模型选择器状态 ==========

// ========== 请求中断控制 ==========
// 注意：AbortController 和 Generation Token 机制已迁移到 useMessageSending composable
// 包括：abortController, generationTokenCounter, currentGenerationToken, manualAbortTokens

// ========== 消息编辑状态管理 ==========
/**
 * 消息编辑功能的状态管理
 * 
 * 编辑流程：
 * 1. 用户点击"编辑"按钮 → 设置 editingBranchId
 * 2. 从分支中提取文本和图片 → 填充 editingText 和 editingImages
 * 3. 用户修改内容后保存 → 创建新版本或新分支
 * 4. 清空编辑状态 → 重置所有 ref
 * 
 * 编辑规则：
 * - 只能编辑用户消息（role === 'user'）
 * - 编辑后会创建新版本（保留编辑历史）
 * - 如果内容没有实际变化，不创建新版本（避免冗余）
 * 
 * 🔧 重构说明：编辑状态已集成至 useMessageEditing composable
 */

/**
 * 比较两个消息的 parts 数组是否完全相同
 * 
 * 用途：避免创建冗余的消息版本
 * - 用户编辑消息后，如果内容没有实际变化，不应该创建新版本
 * - 深度比较 parts 数组中的每个元素
 * 
 * 比较策略：
 * - text 类型：比较 text 字段
 * - image_url 类型：比较 image_url.url 字段
 * - 其他类型：JSON 序列化后比较
 * 
 * @param partsA - 第一个 parts 数组
 * @param partsB - 第二个 parts 数组
 * @returns true 表示完全相同，false 表示有差异
 */


// ========== 分支树相关状态 ==========
/**
 * 删除确认对话框的状态管理
 * 
 * 删除流程：
 * 1. 用户点击删除按钮 → 显示确认对话框，记录要删除的分支 ID
 * 2. 用户确认 → 调用删除函数（删除当前版本或全部版本）
 * 3. 重置状态 → 清空 deletingBranchId 和隐藏对话框
 */

// currentConversation 已由 useCurrentConversation composable 提供（见上方初始化部分）

// ========== Phase 6: Conversation Metadata Composable 初始化 ==========
useConversationMetadata({
  conversationId: toRef(props, 'conversationId'),
  draftInput,
  conversationTagInput,
  saveTemplateInProgress,
  currentConversation,
  conversationStore,
  branchStore,
  projectWorkspaceStore
})

// ========== Phase 6.5: 图像生成管理器（依赖 conversationStatus）==========
const imageGenerationManager = useImageGeneration({
  conversationId: toRef(props, 'conversationId'),
  isActive: isComponentActive,
  modelSupportsImageOutput: currentModelSupportsImageOutput,
  activeProvider: computed(() => appStore.activeProvider),
  currentModelId: computed(() => modelStore.selectedModelId),
  // 修复：传入真实的生成状态（isGenerating），而不是对话生命周期状态（conversationStatus）
  // conversationStatus 是 'draft'/'active' 等，会导致 useImageGeneration 误判为非 idle 状态
  generationStatus: computed(() => currentConversation.value?.isGenerating ? 'generating' : 'idle')
})

const { 
  activeRequestedModalities, 
  imageGenerationEnabled,
  activeImageConfig, 
  canShowImageGenerationButton,
  supportsImageAspectRatioConfig,
  toggleImageGeneration,
  cycleAspectRatio,
  cloneImageConfig
} = imageGenerationManager

// 调试日志：监控 canShowImageGenerationButton 变化
watch(canShowImageGenerationButton, (newValue) => {
  console.log('[ChatView] canShowImageGenerationButton 变化:', {
    newValue,
    conversationId: props.conversationId,
    modelId: modelStore.selectedModelId,
    currentModelSupportsImageOutput: currentModelSupportsImageOutput.value
  })
}, { immediate: true })

// ========== 分支树消息显示 ==========
/**
 * DisplayMessage 类型：UI 渲染用的消息数据结构
 * 
 * 与 Store 中的 MessageBranch/MessageVersion 的区别：
 * - Store: 完整的树形结构，包含所有分支和版本
 * - DisplayMessage: 扁平化的当前路径，只包含当前显示的版本
 * 
 * 字段说明：
 * - id: 版本的唯一 ID（不是分支 ID）
 * - branchId: 所属分支的 ID
 * - role: 消息角色（OpenAI 语义：'user' | 'assistant' | 'tool' | 'system'）
 * - parts: 消息内容（多模态支持，可包含文本和图片）
 * - timestamp: 创建时间戳
 * - currentVersionIndex: 当前显示的版本索引（从 0 开始）
 * - totalVersions: 该分支的总版本数
 * - hasMultipleVersions: 是否有多个版本（用于显示版本切换按钮）
 * - metadata: 元数据（错误信息、用量统计等）
 */



// ========== 发送请求覆盖参数类型 ==========
/**
 * 发送请求时的覆盖参数
 * 
 * 用途：在重新生成或编辑后重发时，可以覆盖默认的请求参数
 * 
 * 字段：
 * - requestedModalities: 请求的输出模态（如 ['image', 'text']）
 * - imageConfig: 图像生成配置（如画面比例）- 从 useImageGeneration 导入
 * 
 * 示例：
 *   performSendMessage('Hello', undefined, {
 *     requestedModalities: ['image', 'text'],
 *     imageConfig: { aspect_ratio: '16:9' }
 *   })
 */


// currentModelMetadata 和 currentModelSupportsImageOutput 已由 useCurrentConversation composable 提供




// ========== 消息发送 Composable 初始化 ==========
  const {
    abortController,
    isDelayPending,
    isAbortable,  // 是否可以中止（requesting/streaming 阶段）
    undoPendingSend,
    performSendMessage: rawPerformSendMessage,
    sendMessage: rawSendMessage,
    stopGeneration
    // handleKeyPress - 已移除: 键盘事件处理现在在 ModernChatInput 组件内部实现
  } = useMessageSending({
  conversationId: toRef(() => props.conversationId),
  draftInput,
  pendingAttachments,                      // ✅ 从 attachmentManager 派生
  pendingFiles,                            // ✅ 从 attachmentManager 派生
  isComponentActive,
  currentConversation,
  chatScrollRef,
  conversationStore,
  branchStore,
  modelStore,
  appStore,
  persistenceStore,
  activeRequestedModalities,               // ✅ 从 imageGenerationManager 解构
  activeImageConfig,                       // ✅ 从 imageGenerationManager 解构
  cloneImageConfig,                        // ✅ 从 imageGenerationManager 解构
  buildWebSearchRequestOptions,            // ✅ 从 webSearchManager 解构
  buildReasoningRequestOptions,            // ✅ 从 reasoningManager 解构
  buildSamplingParameterOverrides,         // ✅ 从 samplingManager 解构
  selectedPdfEngine,                       // ✅ 从 conversationPdfEngine + lastUsedPdfEngine 派生
  isSamplingEnabled,                       // ✅ 从 samplingManager 解构
  isSamplingControlAvailable,              // ✅ 从 samplingManager 解构
  validateAllParameters                    // ✅ 从 samplingManager 解构
})

// 监听 isDelayPending 和 isAbortable 状态变化
watch([isDelayPending, isAbortable], ([delayPending, abortable]) => {
  console.log('[ChatView] 🔍 状态变化:', {
    conversationId: props.conversationId,
    isDelayPending: delayPending,
    isAbortable: abortable,
    generationStatus: generationStatus.value,
    timestamp: Date.now()
  })
})

// ❗ 应该显示什么按钮？
watch(() => ({ delayPending: isDelayPending.value, abortable: isAbortable.value }), (state) => {
  const buttonType = state.delayPending ? '撤回' : state.abortable ? '中止' : '发送'
  console.log(`[ChatView] 🔵 当前应显示按钮: ${buttonType}`, state)
}, { deep: true })

// ⭐⭐⭐ 监听传给 ModernChatInput 的 props
const modernChatInputProps = computed(() => ({
  sendDelayPending: isDelayPending.value,
  isAbortable: isAbortable.value
}))

watch(modernChatInputProps, (props) => {
  console.log('[ChatView] 📤 传给 ModernChatInput 的 props:', props)
}, { deep: true })

// ⭐⭐⭐ 追踪 sendMessage 调用
const sendMessageTraced = async (...args: any[]) => {
  console.log('[ChatView] 🚀 sendMessage 被调用 (来自 @send 事件)', {
    conversationId: props.conversationId,
    args,
    timestamp: Date.now(),
    stackTrace: new Error().stack?.split('\n').slice(2, 5).join('\n')
  })
  return rawSendMessage(...args)
}

// ========== 包装 sendMessage 以添加调试日志 ==========
const sendMessage = sendMessageTraced

const performSendMessage = async (...args: any[]) => {
  console.log('[ChatView] performSendMessage 被调用', {
    conversationId: props.conversationId,
    args,
    timestamp: Date.now(),
    stackTrace: new Error().stack?.split('\n').slice(2, 5).join('\n')
  })
  return rawPerformSendMessage(...args)
}

// 推理 Effort 和 Visibility 选项列表（从 composable 导出）
// 注：现已集成到 ModernChatInput 组件

// ========== 消息操作 Composable 初始化 ==========
const {
  handleEditMessage,      // 移除 new 前缀
  handleCancelEdit,       // 移除 new 前缀
  handleSaveEdit,         // 移除 new 前缀
  handleRemoveEditingImage,
  handleAddImageToEdit,
  handleRemoveEditingFile,
  handleAddFileToEdit,
  handleSwitchVersion,
  handleDeleteClick,
  handleDeleteCurrentVersion,
  handleDeleteAllVersions,
  deleteDialogShow
} = useMessageOperations({
  conversationId: toRef(() => props.conversationId),
  performSendMessage,
  conversationStore,
  branchStore,
  editingText,
  editingImages,
  editingFiles,
  startEditing,
  cancelEditing,
  removeImageFromEdit,
  addImageToEdit,
  removeFileFromEdit,
  addFileToEdit,
  showAttachmentAlert,
  attachmentManager
})

// ========== 消息展示 Composable 初始化 ==========
const {
  displayBranchIds,  // ✅ 重构：只返回 ID 列表
  isMessageStreaming
} = useMessageDisplay({
  currentConversation,
  isComponentActive
})

// ========== Phase 6: 分支生成偏好设置 ==========
const branchGenerationPreferences: Map<string, any> = new Map()

// ========== Phase 6: Menu Control Composable 初始化 ==========
// 注意：菜单切换函数已集成到 ModernChatInput
const {
  handleGlobalClick,
  handleGlobalKeyDown
} = useMenuControl({
  activeMenu,
  conversationId: toRef(props, 'conversationId'),
  isComponentActive,
  webSearchControlRef,
  reasoningControlRef,
  parameterControlRef,
  pdfEngineMenuRef,
  isWebSearchAvailable,
  isReasoningControlAvailable,
  isReasoningEnabled,
  isSamplingControlAvailable,
  isSamplingEnabled,
  currentConversation,
  validateAllParameters,
  handleSelectImage,
  handleSelectFile,
  focusInput
})

// 注：toggleWebSearchMenu 等菜单切换函数现已集成到 ModernChatInput

// ========== 采样参数菜单状态 ==========
const showSamplingMenu = computed(() => {
  const result = activeMenu.value === 'sampling'
  console.log('[ChatView] showSamplingMenu computed:', {
    activeMenu: activeMenu.value,
    result: result
  })
  return result
})

/**
 * 切换采样参数启用/禁用状态
 * 
 * 修正后的逻辑：
 * 1. 如果当前未启用，则启用功能并打开菜单
 * 2. 如果已启用，则切换菜单显示状态（不改变功能启用状态）
 */
const handleToggleSampling = () => {
  console.log('[ChatView] handleToggleSampling 调用前:', {
    isSamplingEnabledBefore: isSamplingEnabled.value,
    isSamplingControlAvailable: isSamplingControlAvailable.value,
    activeMenuBefore: activeMenu.value,
    activeProvider: appStore.activeProvider,
    samplingParameters: samplingParameters.value
  })
  
  if (!isSamplingEnabled.value) {
    // 情况1：功能未启用 -> 启用功能并打开菜单
    console.log('[ChatView] 功能未启用，执行：启用 + 打开菜单')
    toggleSamplingParametersEnabled()
    activeMenu.value = 'sampling'
  } else {
    // 情况2：功能已启用 -> 切换菜单显示状态
    console.log('[ChatView] 功能已启用，执行：切换菜单显示')
    if (activeMenu.value === 'sampling') {
      // 菜单已打开 -> 关闭菜单（但保持功能启用）
      activeMenu.value = null
      console.log('[ChatView] 关闭菜单（功能保持启用）')
    } else {
      // 菜单已关闭 -> 打开菜单
      activeMenu.value = 'sampling'
      console.log('[ChatView] 打开菜单')
    }
  }
  
  console.log('[ChatView] handleToggleSampling 调用后:', {
    isSamplingEnabledAfter: isSamplingEnabled.value,
    activeMenuAfter: activeMenu.value
  })
}

/**
 * 禁用采样参数功能并关闭菜单
 */
const handleDisableSampling = () => {
  console.log('[ChatView] handleDisableSampling 调用')
  if (isSamplingEnabled.value) {
    toggleSamplingParametersEnabled()
  }
  if (activeMenu.value === 'sampling') {
    activeMenu.value = null
  }
}

// ========== Phase 6: Message Retry Composable 初始化 ==========
const {
  handleRetryMessage
} = useMessageRetry({
  conversationId: toRef(props, 'conversationId'),
  isComponentActive,
  chatScrollRef,
  abortController,
  currentConversation,
  conversationStore,
  branchStore,
  modelStore,
  appStore,
  persistenceStore,
  activeRequestedModalities,
  activeImageConfig,
  canShowImageGenerationButton,
  supportsImageAspectRatioConfig,
  cloneImageConfig,
  selectedPdfEngine,
  buildWebSearchRequestOptions,
  buildReasoningRequestOptions,
  buildSamplingParameterOverrides,
  captureUsageForBranch,
  captureReasoningForBranch,
  branchGenerationPreferences
})

// ========== OpenRouter 错误重试处理 ==========
/**
 * 处理 OpenRouter 错误消息的重试
 *
 * 策略：
 * 1. 删除错误消息分支
 * 2. 找到错误消息的父分支（用户消息）
 * 3. 调用 handleRetryMessage 重新生成回复
 */

// ========== Phase 6: Lifecycle Handlers Composable 初始化 ==========
useLifecycleHandlers({
  conversationId: toRef(props, 'conversationId'),
  draftInput,
  isComponentActive,
  currentConversation,
  abortController,
  chatScrollRef,
  conversationStore,
  handleGlobalClick,
  handleGlobalKeyDown,
  adjustTextareaHeight,
  focusTextarea
})

// ========== Phase 1: Verification - Composable Initialization Log ==========
onMounted(() => {
  console.log('✅ [Phase 1] Composables Initialized:', {
    conversationId: props.conversationId,
    webSearch: {
      available: isWebSearchAvailable.value,
      enabled: webSearchManager.webSearchEnabled.value,
      level: webSearchManager.webSearchLevel.value
    },
    reasoning: {
      available: isReasoningControlAvailable.value,
      enabled: isReasoningEnabled.value,
      effort: reasoningManager.reasoningEffortLabel.value
    },
    sampling: {
      enabled: isSamplingEnabled.value,
      available: isSamplingControlAvailable.value
    },
    imageGeneration: {
      enabled: imageGenerationManager.imageGenerationEnabled.value,
      aspectRatio: imageGenerationManager.currentAspectRatioLabel.value
    },
    attachments: {
      hasImages: attachmentManager.images.value.length > 0,
      hasFiles: attachmentManager.files.value.length > 0
    }
  })
})


</script>

<template>
  <!-- ChatView 根元素：直接作为 flex 列布局，因为父组件已经用 absolute 定位 -->
  <div class="flex flex-col h-full w-full bg-gray-50" data-test-id="chat-view">
    <!-- ✅ 新滚动容器：使用 ChatScrollContainer 组件 -->
    <ChatScrollContainer ref="chatScrollRef" class="flex-1 min-h-0">
      <div class="px-4 sm:px-6 py-4 w-full">
        <div class="space-y-4 max-w-5xl mx-auto">

          <!-- 空态提示 -->
          <div
            v-if="displayBranchIds.length === 0"
            class="text-center py-12"
          >
            <div class="inline-flex items-center justify-center w-16 h-16 bg-blue-100 rounded-full mb-4">
              <svg class="w-8 h-8 text-blue-500" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M8 12h.01M12 12h.01M16 12h.01M21 12c0 4.418-4.03 8-9 8a9.863 9.863 0 01-4.255-.949L3 20l1.395-3.72C3.512 15.042 3 13.574 3 12c0-4.418 4.03-8 9-8s9 3.582 9 8z"></path>
              </svg>
            </div>
            <h3 class="text-lg font-semibold text-gray-800 mb-2">开始与 AI 对话</h3>
            <p class="text-gray-600">发送消息开始聊天</p>
          </div>

        <!-- ✅ 消息列表（重构：只传递 ID） -->
        <ChatMessageItem
          v-for="branchId in displayBranchIds"
          :key="branchId"
          :branch-id="branchId"
          :conversation-id="props.conversationId"
          :is-editing="editingBranchId === branchId"
          :is-generating="currentConversation?.generationStatus !== 'idle'"
          :is-streaming="isMessageStreaming(branchId)"
          :editing-text="editingText"
          :editing-images="editingImages"
          :editing-files="editingFiles"
          @edit="(branchId) => handleEditMessage(branchId)"
          @cancel-edit="handleCancelEdit"
          @save-edit="handleSaveEdit"
          @retry="handleRetryMessage"
          @delete="handleDeleteClick"
          @switch-version="handleSwitchVersion"
          @add-image-to-edit="handleAddImageToEdit"
          @remove-editing-image="handleRemoveEditingImage"
          @add-file-to-edit="handleAddFileToEdit"
          @remove-editing-file="handleRemoveEditingFile"
          @update:editing-text="(val) => editingText = val"
        />

        </div>
      </div>
    </ChatScrollContainer>

      <!-- 输入区 - 现代化胶囊输入栏（包含参数面板） -->
      <ModernChatInput
        v-if="currentConversation"
        v-model="draftInput"
        :generation-status="generationStatus"
        :send-delay-pending="isDelayPending"
        :is-abortable="isAbortable"
        :send-button-title="'发送消息 (Ctrl+Enter)'"
        :web-search-enabled="webSearchConfig?.enabled || false"
        :is-web-search-available="isWebSearchAvailable"
        :reasoning-enabled="isReasoningEnabled"
        :is-reasoning-supported="isReasoningControlAvailable"
        :reasoning-preference="reasoningPreference"
        :image-generation-enabled="imageGenerationEnabled"
        :can-show-image-generation-button="canShowImageGenerationButton"
        :sampling-parameters-enabled="isSamplingEnabled"
        :sampling-parameters="samplingParameters"
        :show-sampling-menu="showSamplingMenu"
        :model-capability="currentModelCapability"
        :show-parameter-panel="showParameterPanel"
        :parameter-panel-available="parameterPanelAvailable"
        :model-id="actualModelId ?? null"
        :pending-attachments="pendingAttachments"
        :pending-files="pendingFiles.map(f => ({ name: f.name, size: f.size, type: f.mimeType || 'application/octet-stream', pdfEngine: f.pdfEngine }))"
        :selected-pdf-engine="selectedPdfEngine"
        :attachment-alert="pendingAttachments.length > 0 ? '⚠️ 请确认当前模型支持图片' : ''"
        @send="sendMessage"
        @stop="stopGeneration"
        @undo-delay="undoPendingSend"
        @select-image="handleSelectImage"
        @select-file="handleSelectFile"
        @clear-attachments="() => { attachmentManager.clearAll() }"
        @remove-image="(index) => attachmentManager.removeImage(index)"
        @remove-file="(index) => attachmentManager.removeFile(pendingFiles[index].id)"
        @update:file-pdf-engine="(index, engine) => {
          const file = pendingFiles[index]
          if (file) {
            file.pdfEngine = engine as 'pdf-text' | 'mistral-ocr' | 'native'
          }
        }"
        @update:web-search-enabled="(enabled) => conversationStore.setWebSearchEnabled(props.conversationId, enabled)"
        @select-web-search-level="(level) => conversationStore.setWebSearchLevel(props.conversationId, level as WebSearchLevel)"
        @toggle-reasoning="toggleReasoningEnabled"
        @select-reasoning-effort="(effort) => conversationStore.setReasoningPreference(props.conversationId, { effort: effort as 'low' | 'medium' | 'high' })"
        @update:reasoning-preference="(updates) => conversationStore.setReasoningPreference(props.conversationId, updates)"
        @toggle-image-generation="toggleImageGeneration"
        @update:image-generation-aspect-ratio="(ratio) => { console.log('Update aspect ratio:', ratio) }"
        @cycle-aspect-ratio="cycleAspectRatio"
        @toggle-sampling="handleToggleSampling"
        @toggle-parameters="handleToggleParameterPanel"
        @update:show-parameter-panel="showParameterPanel = $event"
        @update:sampling-parameters-from-panel="handleParameterPanelUpdateSamplingParams"
        @update:reasoning-preference-from-panel="handleParameterPanelUpdateReasoningPreference"
        @disable-sampling="handleDisableSampling"
        @update:sampling-parameters="(updates) => conversationStore.setSamplingParameters(props.conversationId, updates)"
        @reset-sampling-parameters="samplingManager.resetSamplingParameters"
        @open-model-picker="() => { /* TODO: 打开模型选择器 */ }"
      />


      
      <!-- 删除确认对话框 -->
      <DeleteConfirmDialog
        :show="deleteDialogShow"
        @close="deleteDialogShow = false"
        @delete-current-version="handleDeleteCurrentVersion"
        @delete-all-versions="handleDeleteAllVersions"
      />
      
      <!-- Phase 2: 隐藏的文件上传控件 -->
      <input 
        ref="imageInputRef" 
        type="file" 
        accept="image/*" 
        multiple 
        style="display: none" 
        @change="handleImageInputChange"
      />
      <input 
        ref="fileInputRef" 
        type="file" 
        multiple 
        style="display: none" 
        @change="handleFileInputChange"
      />
  </div>
</template>
