/**
 * AppModel - 统一模型数据结构规范
 * 
 * 本文件是 OpenRouter 模型同步规范的核心类型定义。
 * 参考规范文档：/docs/openrouter-model-sync-spec.md
 * 
 * 所有前端/应用层逻辑一律不直接使用原始 API 返回结构，
 * 而是先通过 normalizeModel 规整为 AppModel。
 */

// ============================================================================
// 核心接口定义
// ============================================================================

/**
 * 模型能力映射
 * 
 * 所有能力字段必须且只能从 OpenRouter `/api/v1/models` 返回的字段推导：
 * - hasReasoning: supported_parameters 包含 'reasoning'
 * - hasTools: supported_parameters 包含 'tools'
 * - hasJsonMode: supported_parameters 包含 'structured_outputs' 或 'response_format'
 * - isMultimodal: architecture.input_modalities 或 output_modalities 包含 image/audio/video/file
 * 
 * ⚠️ 禁止基于模型 ID 字符串猜测能力！
 */
export interface ModelCapabilities {
  /** 是否支持推理参数 (supported_parameters 包含 'reasoning') */
  hasReasoning: boolean
  /** 是否支持工具调用 (supported_parameters 包含 'tools') */
  hasTools: boolean
  /** 是否支持 JSON/结构化输出 (supported_parameters 包含 'structured_outputs' 或 'response_format') */
  hasJsonMode: boolean
  /** 是否为多模态模型 (input/output_modalities 包含 image/audio/video/file) */
  isMultimodal: boolean
}

/**
 * 模型价格信息
 * 
 * 所有字段以字符串形式存储，保持与 API 返回一致，避免精度问题。
 * 缺失字段默认为 '0'。
 */
export interface ModelPricing {
  /** 输入 token 价格（USD / token） */
  promptUsdPerToken: string
  /** 输出 token 价格（USD / token） */
  completionUsdPerToken: string
  /** 每次请求固定费用（USD / request） */
  requestUsd: string
  /** 图片处理价格（USD / image） */
  imageUsd: string
  /** 网络搜索价格（USD / request） */
  webSearchUsd: string
  /** 内部推理 token 价格（USD / token） */
  internalReasoningUsdPerToken: string
  /** 输入缓存读取价格（USD / token） */
  inputCacheReadUsdPerToken: string
  /** 输入缓存写入价格（USD / token） */
  inputCacheWriteUsdPerToken: string
}

/**
 * 接入来源类型
 * 
 * 表示模型是通过哪种上游接入方式获取的。
 * 所有对"接入方式"的判断（走哪条 client / 选用哪个 SDK）只能依赖此字段。
 */
export type RouterSource = 'openrouter' | 'openai_api' | 'anthropic_api' | 'gemini_api' | 'local'

/**
 * AppModel - 统一模型数据结构
 * 
 * 这是应用层使用的规范化模型结构，由 normalizeModel 从原始 API 响应转换而来。
 */
export interface AppModel {
  /** OpenRouter 模型 ID (如 'openai/gpt-4o', 'anthropic/claude-3-sonnet') */
  id: string
  
  /** 展示名称，缺失时回退为 id */
  name: string
  
  /** 上下文长度，-1 表示未知 */
  context_length: number
  
  /** 模型能力映射 */
  capabilities: ModelCapabilities
  
  /** 价格信息 */
  pricing: ModelPricing
  
  /** 是否已归档（本地存在但云端缺失时标记为 true） */
  is_archived: boolean
  
  /** 首次在 /models 响应中出现的时间 (ISO8601) */
  first_seen_at?: string
  
  /** 最后一次在 /models 响应中出现的时间 (ISO8601) */
  last_seen_at?: string
  
  /** 接入来源 */
  router_source: RouterSource
  
  /** 模型厂商/品牌 (如 'openai', 'anthropic', 'google', 'deepseek') */
  vendor: string
  
  /** 模型描述 */
  description?: string
  
  /** 最大输出 token 数 */
  max_output_tokens?: number
  
  /** 输入模态列表 (如 ['text', 'image']) */
  input_modalities?: string[]
  
  /** 输出模态列表 (如 ['text']) */
  output_modalities?: string[]
  
  /** 支持的参数列表 (原始 supported_parameters) */
  supported_parameters?: string[]
}

// ============================================================================
// 工厂函数与默认值
// ============================================================================

/**
 * 创建默认的 ModelCapabilities
 */
export function createDefaultCapabilities(): ModelCapabilities {
  return {
    hasReasoning: false,
    hasTools: false,
    hasJsonMode: false,
    isMultimodal: false,
  }
}

/**
 * 创建默认的 ModelPricing
 */
export function createDefaultPricing(): ModelPricing {
  return {
    promptUsdPerToken: '0',
    completionUsdPerToken: '0',
    requestUsd: '0',
    imageUsd: '0',
    webSearchUsd: '0',
    internalReasoningUsdPerToken: '0',
    inputCacheReadUsdPerToken: '0',
    inputCacheWriteUsdPerToken: '0',
  }
}

// ============================================================================
// 类型守卫
// ============================================================================

/**
 * 检查对象是否为有效的 AppModel
 */
export function isValidAppModel(obj: unknown): obj is AppModel {
  if (!obj || typeof obj !== 'object') return false
  const model = obj as Record<string, unknown>
  return (
    typeof model.id === 'string' &&
    model.id.length > 0 &&
    typeof model.name === 'string' &&
    typeof model.context_length === 'number' &&
    typeof model.is_archived === 'boolean' &&
    model.capabilities !== null &&
    typeof model.capabilities === 'object' &&
    model.pricing !== null &&
    typeof model.pricing === 'object' &&
    typeof model.router_source === 'string' &&
    typeof model.vendor === 'string'
  )
}

// ============================================================================
// 导出便捷类型
// ============================================================================

/** AppModel 的部分更新类型 */
export type AppModelUpdate = Partial<Omit<AppModel, 'id'>>

/** AppModel 列表 */
export type AppModelList = AppModel[]

/** 按 ID 索引的 AppModel Map */
export type AppModelMap = Map<string, AppModel>
