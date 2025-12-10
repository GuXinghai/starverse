/**
 * Gemini AI Provider Service (TypeScript)
 * 
 * 🎯 Task 9 重构：清晰的流水线架构
 * - Converter 层（streamChunkConverter.ts）：SDK chunks → StreamChunk
 * - Aggregator 层（responseAggregator.ts）：StreamChunk → MessageMetadata
 * - Service 层（本文件）：SDK 调用 + 流控制
 * 
 * 核心设计原则：
 * - 使用 Google Generative AI SDK（非 HTTP SSE）
 * - 直接调用 `generateContentStream()` 返回的对象
 * - 类型安全（严格 TypeScript，无 as any）
 * - 接口对齐（输出符合 MessageMetadata 规范）
 * - 逐步集成（Feature Flag 控制新旧实现切换）
 * 
 * @module GeminiService
 */

import { GoogleGenerativeAI } from '@google/generative-ai'
import type { 
  AIProviderService, 
  StreamOptions, 
  HistoryMessage
} from '@/types/providers'
import { convertGeminiChunk } from './gemini/streamChunkConverter'
import { createGeminiAggregator } from './gemini/responseAggregator'

// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
// 常量定义
// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

/**
 * Feature Flag - 启用新实现（Converter + Aggregator）
 */
const USE_NEW_IMPLEMENTATION = false

/**
 * 已知支持视觉/图像输入的 Gemini 模型
 */
// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
// 辅助函数
// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

/**
 * 检查模型是否支持图像输入（基于 input_modalities）
 * 
 * 🔥 Breaking Change (v1.0.0):
 * - 不再使用正则匹配
 * - 仅依赖 API 返回的 input_modalities 字段
 * 
 * @param model - 完整的模型对象（必须包含 input_modalities）
 * @returns 是否支持图像输入
 */
function supportsImage(model: import('./../../types/store').ModelData): boolean {
  if (!model || !model.input_modalities || !Array.isArray(model.input_modalities)) {
    if (model && !model.input_modalities) {
      console.warn('[GeminiService] 模型缺少 input_modalities 字段:', model?.id)
    }
    return false
  }
  
  const modalities = model.input_modalities.map(m => String(m).toLowerCase())
  return modalities.includes('image') || 
         modalities.includes('vision') || 
         modalities.includes('multimodal')
}

/**
 * 检查模型是否支持文件输入（基于 input_modalities）
 * 
 * @param model - 完整的模型对象
 * @returns 是否支持文件/文档输入
 */
function supportsFileInput(model: import('./../../types/store').ModelData): boolean {
  if (!model || !model.input_modalities || !Array.isArray(model.input_modalities)) {
    return false
  }
  
  const modalities = model.input_modalities.map(m => String(m).toLowerCase())
  return modalities.includes('file') || 
         modalities.includes('document') || 
         modalities.includes('pdf')
}

/**
 * 将应用内消息格式转换为 Google SDK 格式
 */
function convertMessagesToGeminiFormat(history: HistoryMessage[]): any[] {
  return (history || []).map(msg => {
    const parts: any[] = []
    
    if (msg.parts && Array.isArray(msg.parts) && msg.parts.length > 0) {
      // 逐个转换 part
      for (const part of msg.parts) {
        if (part.type === 'text') {
          parts.push({ text: part.text })
        } else if (part.type === 'image_url') {
          // 将 data URI 转换为 inlineData 格式
          const dataUri = part.image_url.url
          const matches = dataUri.match(/^data:(image\/[a-z+]+);base64,(.+)$/i)
          
          if (matches) {
            parts.push({
              inlineData: {
                mimeType: matches[1],
                data: matches[2]
              }
            })
          }
        }
      }
    } else {
      // 回退：纯文本消息（提取第一个文本 part 或空字符串）
      const textPart = msg.parts?.find(p => p.type === 'text')
      const text = textPart?.text || ''
      parts.push({ text })
    }
    
    return {
      role: msg.role === 'model' ? 'model' : 'user',
      parts
    }
  })
}

// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
// 新实现：使用 Converter + Aggregator 流水线
// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

/**
 * 新实现：流式聊天响应
 * 
 * 架构：generateContentStream() → Converter → Aggregator → 逐 chunk yield
 */
async function* streamChatResponseNew(
  apiKey: string,
  history: HistoryMessage[],
  modelName: string,
  userMessage: string,
  options?: StreamOptions
): AsyncGenerator<any, void, unknown> {
  console.log('GeminiService: 开始流式聊天，使用模型:', modelName)
  const signal = options?.signal

  try {
    // 初始化 SDK
    const genAI = new GoogleGenerativeAI(apiKey)
    const model = genAI.getGenerativeModel({ model: modelName })

    // 转换消息历史
    const formattedHistory = convertMessagesToGeminiFormat(history)
    console.log('GeminiService: 原始消息', history?.length || 0, '条，已转换')

    // 构建请求内容
    let contents: any[]
    if (userMessage && userMessage.trim()) {
      contents = [
        ...formattedHistory,
        {
          role: 'user',
          parts: [{ text: userMessage }]
        }
      ]
      console.log('GeminiService: 添加新用户消息（文本）:', userMessage.substring(0, 50))
    } else {
      contents = formattedHistory
      console.log('GeminiService: 未添加新用户消息（使用历史记录）')
    }

    console.log('GeminiService: 最终消息历史长度:', contents.length)

    // 发起流式请求
    let result
    if (signal) {
      result = await model.generateContentStream({ contents }, { signal })
    } else {
      result = await model.generateContentStream({ contents })
    }

    console.log('GeminiService: ✓ 收到响应，开始处理流式数据')

    // 创建聚合器
    const aggregator = createGeminiAggregator({
      modelId: modelName,
      provider: 'Gemini'
    })

    // 逐块处理 SDK 返回的流
    for await (const chunk of result.stream) {
      // 转换 SDK chunk 为标准 StreamChunk 格式
      const conversion = convertGeminiChunk(chunk)

      // 处理转换结果
      if (conversion.error) {
        console.error('GeminiService: 转换失败', conversion.error)
        continue
      }

      // 逐个处理转换后的 chunks
      for (const streamChunk of conversion.chunks) {
        aggregator.processChunk(streamChunk)
        
        // 实时 yield（允许 UI 逐块显示）
        yield streamChunk
      }

      // 检查是否结束
      if (conversion.isFinished) {
        console.log('GeminiService: 收到流结束标记')
      }
    }

    // 流结束，获取最终聚合结果（用于元数据）
    const finalResult = aggregator.getResult()
    
    // 最终元数据作为特殊 chunk yield（兼容旧实现）
    if (finalResult.metadata) {
      yield finalResult.metadata
    }

    console.log('GeminiService: 流式输出完成')
  } catch (error) {
    // 错误处理
    if (error instanceof Error) {
      if (error.name === 'AbortError') {
        console.log('GeminiService: 流式请求已被用户中止')
      } else {
        console.error('GeminiService: 流式聊天出错！', error)
        throw error
      }
    } else {
      console.error('GeminiService: 未知错误', error)
      throw new Error(String(error))
    }
  }
}

// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
// 服务对象导出
// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

export const GeminiService: AIProviderService = {
  /**
   * 检查模型是否支持图像输入
   * 
   * 🔥 Breaking Change (v1.0.0): 仅依赖 input_modalities，不再使用正则
   */
  supportsImage,

  /**
   * 检查模型是否支持文件输入
   */
  supportsFileInput,

  /**
   * 获取可用的 Gemini 模型列表
   * 
   * @param apiKey - Google AI Studio API Key
   * @returns 模型 ID 数组
   */
  async listAvailableModels(apiKey: string): Promise<string[]> {
    const url = 'https://generativelanguage.googleapis.com/v1beta/models'
    
    const response = await fetch(`${url}?key=${apiKey}`)
    
    if (!response.ok) {
      const errorText = await response.text()
      throw new Error(`Failed to fetch Gemini models: ${response.status} - ${errorText}`)
    }
    
    const data = await response.json()
    
    if (!data.models || !Array.isArray(data.models)) {
      throw new Error('Invalid response format from Gemini models API')
    }

    // 筛选支持 generateContent 的模型
    return data.models
      .filter((m: any) => m.supportedGenerationMethods?.includes('generateContent'))
      .map((m: any) => {
        // 移除 'models/' 前缀，保持简洁名称
        const name = m.name || ''
        return name.startsWith('models/') ? name.substring(7) : name
      })
  },

  /**
   * 流式聊天响应（Feature Flag 控制新旧实现）
   * 
   * @param apiKey - Google AI Studio API Key
   * @param history - 聊天历史
   * @param modelName - 模型 ID
   * @param userMessage - 用户消息
   * @param _baseUrl - 忽略（Gemini 使用官方 SDK，不使用自定义 baseUrl）
   * @param options - 流式选项
   * @returns 异步生成器，逐 token 产出文本
   */
  async* streamChatResponse(
    apiKey: string,
    history: HistoryMessage[],
    modelName: string,
    userMessage: string,
    _baseUrl: string | null,
    options?: StreamOptions
  ): AsyncGenerator<any, void, unknown> {
    if (USE_NEW_IMPLEMENTATION) {
      // 使用新实现（Converter + Aggregator）
      yield* streamChatResponseNew(
        apiKey,
        history,
        modelName,
        userMessage,
        options
      )
    } else {
      // 使用旧实现（降级到 JS 文件）
      console.log('[GeminiService] 🔄 降级到旧实现（GeminiService.js）')
      const { GeminiService: LegacyService } = await import('./GeminiService.js')
      yield* LegacyService.streamChatResponse(
        apiKey,
        history,
        modelName,
        userMessage,
        _baseUrl,
        options
      )
    }
  }
}

// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
// 默认导出（向后兼容）
// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

export default GeminiService
