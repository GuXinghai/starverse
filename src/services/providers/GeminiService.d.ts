/**
 * GeminiService.d.ts - 类型声明文件
 * 为 GeminiService.js 提供类型定义，待 Task 6 迁移后将替换为 .ts 实现
 */

import type {
  AIProviderService,
  ProviderContext,
  StreamOptions,
  StreamChunk
} from '@/types/providers'

/**
 * Google Gemini AI 服务实现
 * 
 * 提供 Gemini 模型的流式对话能力
 */
export declare class GeminiService implements AIProviderService {
  /**
   * 发起流式聊天响应
   * 
   * @param context - Provider 上下文（包含 API Key、模型信息等）
   * @param history - 对话历史（不含当前用户输入）
   * @param userMessage - 当前用户输入消息
   * @param options - 流式请求选项
   * @returns 异步迭代器，产生 StreamChunk 对象
   * 
   * @example
   * ```typescript
   * const service = new GeminiService()
   * const stream = service.streamChatResponse(context, history, 'Hello', {})
   * for await (const chunk of stream) {
   *   if (chunk.type === 'text') console.log(chunk.content)
   * }
   * ```
   */
  streamChatResponse(
    context: ProviderContext,
    history: any[],
    userMessage: string,
    options: StreamOptions
  ): AsyncGenerator<StreamChunk, void, unknown>

  /**
   * 获取可用模型列表
   * 
   * @param apiKey - Google AI API Key
   * @returns Promise<string[]> - 模型 ID 数组（如 ['gemini-2.0-flash-exp']）
   */
  listAvailableModels(apiKey: string): Promise<string[]>
}

/**
 * 单例导出 - 全局共享的 GeminiService 实例
 */
export declare const geminiService: GeminiService
