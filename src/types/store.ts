/**
 * Store 模块共享类型定义
 */

import type { 
  MessagePart, 
  WebSearchLevel, 
  ReasoningPreference, 
  SamplingParameterSettings,
  MessageBranch,
  ConversationTree,
  MessageVersionMetadata,
  PdfEngineType
} from './chat'
import type { ConversationStatus } from './conversation'

// 重新导出 chat.ts 中的类型，避免重复定义
export type {
  MessageBranch,
  ConversationTree,
  MessageVersionMetadata as VersionMetadata
} from './chat'

/**
 * 错误信息
 */
export interface ErrorInfo {
  code?: string
  message: string
  details?: any
}

/**
 * 对话数据结构（扩展自 chat.ts 的 Conversation）
 */
export interface Conversation {
  id: string
  title: string
  draft: string
  tree: ConversationTree
  model: string
  createdAt: number
  updatedAt: number
  projectId: string | null
  status: ConversationStatus
  tags: string[]
  
  // Web 搜索配置
  webSearchEnabled?: boolean
  webSearchLevel?: WebSearchLevel
  webSearch?: {
    enabled: boolean
    level: WebSearchLevel
  }
  
  // 推理配置
  reasoningPreference?: ReasoningPreference
  
  // 采样参数
  samplingParameters?: SamplingParameterSettings
  
  // PDF 引擎选择
  pdfEngine?: PdfEngineType
  
  // 生成状态（运行时字段）
  generationStatus?: 'idle' | 'sending' | 'receiving'
  isGenerating?: boolean
  generationError?: ErrorInfo | null
  
  // 自定义指令
  customInstructions?: string
  
  // 滚动位置（运行时字段，不持久化）
  scrollPosition?: number
}

/**
 * 对话快照（序列化格式）
 */
export interface ConversationSnapshot {
  id: string
  title: string
  draft: string
  treeSnapshot: {
    branches: Array<[string, MessageBranch]>
    rootBranchIds: string[]
    currentPath: string[]
  }
  model: string
  createdAt: number
  updatedAt: number
  projectId: string | null
  status: ConversationStatus
  tags: string[]
  webSearch?: {
    enabled: boolean
    level: WebSearchLevel
  }
  reasoningPreference?: ReasoningPreference
  samplingParameters?: SamplingParameterSettings
}

/**
 * 项目数据结构
 */
export interface Project {
  id: string
  name: string
  conversationIds: string[]
  createdAt: number
  updatedAt: number
  meta?: ProjectMeta
}

/**
 * 项目元数据
 */
export interface ProjectMeta {
  overview?: ProjectOverview
  homepage?: ProjectHomepage
  promptTemplates?: ProjectPromptTemplate[]
  [key: string]: any
}

/**
 * 项目概览
 */
export interface ProjectOverview {
  goal?: string
  status?: string
  tags?: string[]
  [key: string]: any
}

/**
 * 项目主页配置
 */
export interface ProjectHomepage {
  quickStartPromptIds?: string[]
  [key: string]: any
}

/**
 * 项目提示词模板
 */
export interface ProjectPromptTemplate {
  id: string
  layer: 'base' | 'mode'
  name?: string
  content: string
  parameters?: Array<{
    name: string
    type: string
    defaultValue?: any
  }>
  baseTemplateIds?: string[]
  useCount?: number
  lastUsedAt?: number
  [key: string]: any
}

/**
 * 模型数据
 */
export interface ModelData {
  id: string
  name?: string
  description?: string
  context_length?: number  // 🔧 修复：使用下划线命名（匹配 OpenRouter API）
  max_output_tokens?: number  // 🔧 修复：使用下划线命名（匹配 OpenRouter API）
  pricing?: {
    prompt?: number
    completion?: number
    image?: number  // 🔧 添加：图片输入定价
  }
  architecture?: {
    modality?: string
    tokenizer?: string
    instruct_type?: string | null
    reasoning?: boolean  // 🔧 添加：推理能力标志
    input_modalities?: string[]  // 🔧 添加：输入模态（架构层面）
    output_modalities?: string[]  // 🔧 添加：输出模态（架构层面）
  }
  series?: string  // 🔧 添加：模型系列（如 'Anthropic', 'OpenAI', 'Google'）
  input_modalities?: string[]  // 🔧 添加：输入模态（如 'text', 'image'）
  output_modalities?: string[]  // 🔧 添加：输出模态（如 'text', 'image'）
  
  // 🔧 辅助字段（用于前端显示，基于上述字段计算）
  supportsVision?: boolean
  supportsImageOutput?: boolean
  supportsReasoning?: boolean
  
  [key: string]: any
}

/**
 * 模型参数支持信息
 */
export interface ModelParameterSupport {
  temperature?: boolean
  top_p?: boolean
  top_k?: boolean
  max_tokens?: boolean
  frequency_penalty?: boolean
  presence_penalty?: boolean
  [key: string]: boolean | undefined
}

/**
 * 显示消息（用于渲染）
 */
export interface DisplayMessage {
  id: string  // 🔧 添加 - 版本 ID（用于 v-for key）
  branchId: string
  versionIndex: number
  role: 'user' | 'assistant' | 'tool' | 'notice' | 'openrouter'
  parts: MessagePart[]
  timestamp: number  // 🔧 添加 - 消息时间戳
  currentVersionIndex: number  // 🔧 添加 - 当前版本索引
  totalVersions: number  // 🔧 添加 - 总版本数
  hasMultipleVersions: boolean  // 🔧 添加 - 是否有多个版本
  metadata?: MessageVersionMetadata
  modelUsed?: string
  generatedAt?: number
}
