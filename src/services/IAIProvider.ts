/**
 * AI 提供商抽象接口
 * 
 * 定义所有 AI 提供商必须实现的统一 API
 * 遵循策略模式（Strategy Pattern），支持多提供商无缝切换
 */

/**
 * AI 模型信息
 */
export interface AIModel {
  id: string          // 模型唯一标识符（如 'models/gemini-pro', 'openai/gpt-4'）
  name: string        // 模型显示名称
  provider: string    // 提供商名称
  description?: string // 模型描述
}

/**
 * 聊天消息接口
 */
export interface AIChatMessage {
  role: 'user' | 'model' | 'assistant' | 'system'
  text: string
  parts?: Array<{ text: string }>  // 兼容 Gemini 格式
}

/**
 * 聊天会话配置
 */
export interface ChatConfig {
  history: AIChatMessage[]
  maxOutputTokens?: number
  temperature?: number
  topP?: number
  topK?: number
}

/**
 * 聊天会话接口
 * 封装不同提供商的会话对象
 */
export interface AIChatSession {
  sendMessage(prompt: string): Promise<string>
  sendMessageStream(prompt: string): Promise<AsyncGenerator<string, void, unknown>>
}

/**
 * AI 提供商接口
 * 所有 AI 提供商（Gemini, OpenRouter 等）必须实现此接口
 */
export interface IAIProvider {
  /**
   * 提供商名称
   */
  readonly name: string

  /**
   * 获取可用的模型列表
   * @param apiKey - API 密钥
   * @returns 模型列表
   */
  listAvailableModels(apiKey: string): Promise<AIModel[]>

  /**
   * 创建聊天会话
   * @param apiKey - API 密钥
   * @param modelId - 模型 ID
   * @param config - 会话配置
   * @returns 聊天会话对象
   */
  createChatSession(
    apiKey: string,
    modelId: string,
    config: ChatConfig
  ): Promise<AIChatSession>

  /**
   * 验证 API Key 是否有效
   * @param apiKey - API 密钥
   * @returns 是否有效
   */
  validateApiKey(apiKey: string): Promise<boolean>
}

/**
 * 提供商工厂配置
 */
export interface ProviderConfig {
  apiKey: string
  baseUrl?: string  // 可选的基础 URL（用于 OpenRouter 等）
  [key: string]: any
}
