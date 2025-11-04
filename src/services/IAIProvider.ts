/**
 * AI Provider 统一接口定义
 * 所有 AI 服务提供商（Gemini, OpenRouter 等）必须实现此接口
 * 
 * 🔄 多模态支持：
 * - 接受包含 parts 数组的 Message 类型
 * - 支持文本、图像等多种内容类型
 */

import type { Message } from '../types/chat'

/**
 * 模型信息接口
 */
export interface ModelInfo {
  id: string
  name: string
  description?: string
  context_length?: number
  pricing?: {
    prompt?: string
    completion?: string
  }
  input_modalities?: string[]  // 支持的输入模态: ['text', 'image', 'audio', etc.]
  output_modalities?: string[]
  [key: string]: any  // 允许其他提供商特定的属性
}

/**
 * AI Provider 接口
 */
export interface IAIProvider {
  /**
   * 获取可用模型列表
   * @param apiKey - API 密钥
   * @returns 模型信息数组
   */
  listAvailableModels(apiKey: string): Promise<ModelInfo[]>

  /**
   * 流式聊天补全
   * 
   * 🔄 多模态支持：
   * - history 参数现在接受包含 parts 数组的 Message[]
   * - 每个 Message 可以包含文本、图像等多种内容部分
   * 
   * @param apiKey - API 密钥
   * @param history - 对话历史（包含多模态 parts）
   * @param modelName - 模型名称
   * @param userMessage - 用户消息文本（用于简单场景）
   * @param baseUrl - API 基础 URL（可选，OpenRouter 等需要）
   * @param signal - 中止信号（可选）
   * @returns 异步生成器，逐个 yield 文本片段
   */
  streamChatResponse(
    apiKey: string,
    history: Message[],
    modelName: string,
    userMessage: string,
    baseUrl?: string,
    signal?: AbortSignal | null
  ): AsyncGenerator<string, void, unknown>

  /**
   * 检查模型是否支持视觉/图像输入（可选）
   * @param modelId - 模型 ID
   * @returns 是否支持视觉
   */
  supportsVision?(modelId: string): boolean
}
