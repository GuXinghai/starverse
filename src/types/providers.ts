/**
 * AI Provider 接口类型定义
 * 
 * 定义所有 AI 服务提供商（Gemini, OpenRouter）必须实现的统一接口。
 * 确保 aiChatService 可以无缝切换不同的 Provider 实现。
 * 
 * @module types/providers
 */

import type { MessagePart, WebSearchLevel } from './chat'
import type { MessageMetadata } from '../utils/ipcSanitizer'
import type { ModelData } from './store'

/**
 * Provider 标识符
 */
export type AIProvider = 'Gemini' | 'OpenRouter'

/**
 * 历史消息条目（符合 Gemini Content 格式）
 */
export interface HistoryMessage {
  /** 角色：用户或模型 */
  role: 'user' | 'model'
  /** 多模态内容部分数组 */
  parts: MessagePart[]
}

/**
 * 推理控制模式（OpenRouter Reasoning API）
 */
export type ReasoningControlMode = 'disabled' | 'effort' | 'max_tokens'

/**
 * 推理配置（规范化后）
 */
export interface ReasoningConfig {
  /** 控制模式 */
  controlMode: ReasoningControlMode
  /** 努力程度（低/中/高） */
  effort?: 'low' | 'medium' | 'high'
  /** 最大推理 token 数 */
  maxReasoningTokens?: number
  /** 是否在流中显示推理内容（reasoning_content 事件） */
  showReasoningContent?: boolean
}

/**
 * 旧版推理配置（来自 UI legacy payload）
 */
export interface LegacyReasoningPayload {
  /** 最大推理 token 数 */
  max_tokens?: number
  /** 努力程度 */
  effort?: 'low' | 'medium' | 'high'
  /** 是否排除推理内容（与 showReasoningContent 相反） */
  exclude?: boolean
}

/**
 * 旧版推理对象（UI 传入格式）
 */
export interface LegacyReasoning {
  payload?: LegacyReasoningPayload
}

/**
 * 旧版采样参数（UI 传入格式）
 */
export interface LegacySamplingParameters {
  temperature?: number
  top_p?: number
  top_k?: number
  frequency_penalty?: number
  presence_penalty?: number
  repetition_penalty?: number
  min_p?: number
  top_a?: number
  max_tokens?: number
  seed?: number
}

/**
 * 生成配置 - 采样参数
 */
export interface SamplingConfig {
  temperature?: number
  top_p?: number
  top_k?: number
  frequency_penalty?: number
  presence_penalty?: number
  repetition_penalty?: number
  min_p?: number
  top_a?: number
  seed?: number
}

/**
 * 生成配置 - 长度控制
 */
export interface LengthConfig {
  max_tokens?: number
}

/**
 * 统一生成配置（传递给 generationConfigManager）
 */
export interface GenerationConfig {
  /** 采样控制参数 */
  sampling?: SamplingConfig
  /** 长度控制参数 */
  length?: LengthConfig
  /** 推理控制参数 */
  reasoning?: ReasoningConfig
}

/**
 * 流式响应选项
 */
export interface StreamOptions {
  /** 取消信号 */
  signal?: AbortSignal | null
  /** 网络搜索挡位 */
  webSearch?: WebSearchLevel | null
  /** 旧版推理配置（待废弃） */
  legacyReasoning?: LegacyReasoning | null
  /** 旧版采样参数（待废弃） */
  legacyParameters?: LegacySamplingParameters | null
  /** 会话 ID（用于配置查询） */
  conversationId?: string | null
  /** 请求的模态（image, audio等） */
  requestedModalities?: string[] | null
  /** 图像生成配置 */
  imageConfig?: any
  /** PDF 解析引擎 */
  pdfEngine?: string | null
  /** 系统指令 */
  systemInstruction?: string | null
  /** 推理配置选项 */
  reasoning?: any
  /** 生成参数覆盖 */
  parameters?: any
  /** 模型参数信息（OpenRouter 内部使用） */
  modelParameters?: any
  /** 模型能力对象（OpenRouter 内部使用） */
  modelCapability?: any
  /** 生成配置（OpenRouter 内部使用） */
  generationConfig?: any
  /** 解析后的推理配置（OpenRouter 内部使用） */
  resolvedReasoningConfig?: ReasoningConfig | null
}

/**
 * Provider 上下文（包含服务实现与凭据）
 */
export interface ProviderContext {
  /** Provider 服务实现 */
  service: AIProviderService
  /** API Key */
  apiKey: string
  /** 自定义 API 基础 URL（仅 OpenRouter） */
  baseUrl: string | null
}

/**
 * 流式响应 Delta（增量文本块）
 */
export interface StreamDelta {
  /** 增量文本内容 */
  text: string
  /** 是否为流结束标志 */
  done?: boolean
  /** 元数据（Usage 等） */
  metadata?: MessageMetadata
}

/**
 * AI Provider 服务接口
 * 
 * 所有 Provider 实现（GeminiService, OpenRouterService）必须实现此接口。
 */
export interface AIProviderService {
  /**
   * 检查模型是否支持图像输入（基于 input_modalities）
   * 
   * 🔥 Breaking Change (v1.0.0): 不再接受 modelId 字符串，必须传入完整模型对象
   * 
   * @param model - 完整的模型对象（必须包含 input_modalities 字段）
   * @returns 是否支持图像输入
   */
  supportsImage(model: ModelData): boolean

  /**
   * 检查模型是否支持文件输入（基于 input_modalities）
   * 
   * @param model - 完整的模型对象
   * @returns 是否支持文件/文档输入
   */
  supportsFileInput(model: ModelData): boolean

  /**
   * 列出可用模型列表
   * @param apiKey - API 密钥
   * @param baseUrl - 自定义 API 基础 URL（可选，OpenRouter 使用）
   * @returns 模型 ID 数组
   */
  listAvailableModels(apiKey: string, baseUrl?: string): Promise<string[]>

  /**
   * 获取模型参数支持信息（仅 OpenRouter）
   * @param apiKey - API 密钥
   * @param modelId - 模型 ID
   * @param baseUrl - 自定义 API 基础 URL（可选）
   * @param provider - 可选的 provider 参数
   * @returns 模型参数支持信息
   */
  getModelParameters?(
    apiKey: string,
    modelId: string,
    baseUrl?: string,
    provider?: string | null
  ): Promise<{ model: string; supported_parameters: string[] }>

  /**
   * 流式生成聊天响应
   * 
   * @param apiKey - API 密钥
   * @param history - 历史消息数组
   * @param modelName - 模型名称或 ID
   * @param userMessage - 用户输入消息
   * @param baseUrl - 自定义 API 基础 URL（可选，OpenRouter 使用）
   * @param options - 流式响应选项（包含推理配置、采样参数等）
   * @returns 异步生成器，逐 token 产出文本
   * 
   * @example
   * ```typescript
   * const stream = service.streamChatResponse(
   *   apiKey, 
   *   history, 
   *   'gemini-2.0-flash-exp', 
   *   'Hello', 
   *   null, 
   *   { signal: abortController.signal }
   * )
   * for await (const chunk of stream) {
   *   console.log(chunk) // 增量文本
   * }
   * ```
   */
  streamChatResponse(
    apiKey: string,
    history: HistoryMessage[],
    modelName: string,
    userMessage: string,
    baseUrl: string | null,
    options?: StreamOptions
  ): AsyncGenerator<string, void, unknown>
}

/**
 * OpenRouter 特定 - Generation Usage 查询结果
 */
export interface OpenRouterGenerationUsage {
  prompt_tokens?: number
  completion_tokens?: number
  total_tokens?: number
  cost_details?: {
    prompt_cost?: number
    completion_cost?: number
    total_cost?: number
  }
}

/**
 * OpenRouter 服务扩展接口（包含 Generation Usage 查询）
 */
export interface OpenRouterService extends AIProviderService {
  /**
   * 查询 Generation 的 Usage 数据（通过 generation ID）
   * @param apiKey - API 密钥
   * @param generationId - 生成 ID
   * @param baseUrl - 自定义 API 基础 URL
   * @returns Usage 数据（token 数量和成本）
   */
  fetchGenerationUsage(
    apiKey: string,
    generationId: string,
    baseUrl: string
  ): Promise<OpenRouterGenerationUsage>
}

/**
 * 模型能力查询结果（来自 modelCapability.js）
 */
export interface ModelCapability {
  /** 模型 ID */
  modelId: string
  /** 是否支持视觉输入 */
  supportsVision: boolean
  /** 支持的输入模态 */
  inputModalities?: string[]
  /** 支持的输出模态 */
  outputModalities?: string[]
}

/**
 * aiChatService 构建的 "密封" GenerationConfig 结果
 */
export interface AirlockedGenerationConfigResult {
  /** 有效的生成配置（经过 generationConfigManager 处理） */
  effectiveConfig: GenerationConfig
  /** 解析后的推理配置（规范化） */
  resolvedReasoning: ReasoningConfig | null
}

// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
// 流式响应数据块类型（StreamChunk）
// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

/**
 * 流式响应数据块（统一所有 Provider 的输出格式）
 * 
 * **类型变体**：
 * - `text`: 文本增量内容（最常见）
 * - `image`: 图片 URL 或 Data URI
 * - `reasoning_stream_text`: 推理过程文本流（实时展示）
 * - `reasoning_detail`: 推理详情（结构化数据，用于回传模型）
 * - `reasoning_summary`: 推理总结（流结束时发送）
 * - `usage`: Token 使用量统计
 * - `error`: 错误信息
 * 
 * **推理兼容性**：
 * - DeepSeek 风格：`delta.reasoning` → `reasoning_stream_text`
 * - OpenAI 风格：`delta.reasoning_content` → `reasoning_stream_text`
 * - 结构化数据：`delta.reasoning_details` → `reasoning_detail`
 */
export type StreamChunk =
  | TextChunk
  | ImageChunk
  | ReasoningStreamTextChunk
  | ReasoningDetailChunk
  | ReasoningSummaryChunk
  | UsageChunk
  | ErrorChunk

/**
 * 文本内容块
 */
export interface TextChunk {
  type: 'text'
  /** 增量文本内容 */
  content: string
}

/**
 * 图片内容块
 */
export interface ImageChunk {
  type: 'image'
  /** 图片 URL 或 Data URI */
  content: string
}

/**
 * 推理文本流块（实时展示）
 */
export interface ReasoningStreamTextChunk {
  type: 'reasoning_stream_text'
  /** 推理文本内容 */
  text: string
}

/**
 * 推理详情块（结构化数据，用于回传模型）
 */
export interface ReasoningDetailChunk {
  type: 'reasoning_detail'
  /** 详情数据 */
  detail: {
    id: string | null
    type: string
    text: string
    summary: string
    data: any
    format: string
    index?: number
  }
}

/**
 * 推理总结块（流结束时发送）
 */
export interface ReasoningSummaryChunk {
  type: 'reasoning_summary'
  /** 推理摘要 */
  summary: string
  /** 完整推理文本 */
  text: string
  /** 推理详情数量 */
  detailCount: number
  /** 请求配置 */
  request: {
    visibility: string
    effort: string
    maxTokens: number | null
    payload: Record<string, any>
  }
  /** Provider 名称 */
  provider: string
  /** 模型名称 */
  model: string
  /** 是否被排除 */
  excluded: boolean
}

/**
 * Usage 统计块
 */
export interface UsageChunk {
  type: 'usage'
  /** Token 使用量 */
  usage: Record<string, any>
  /** 请求 ID（可选） */
  requestId?: string
}

/**
 * 错误块
 */
export interface ErrorChunk {
  type: 'error'
  /** 错误信息 */
  error: {
    message: string
    code: string
    details?: any
  }
}
