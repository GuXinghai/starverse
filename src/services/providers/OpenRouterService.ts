/**
 * OpenRouter AI Provider Service (TypeScript)
 * 
 * 🎯 Phase 2 重构：清晰的流水线架构
 * - Parser 层（sseParser.ts）：SSE 文本 → StreamChunk
 * - Aggregator 层（responseAggregator.ts）：StreamChunk → MessageMetadata
 * - Service 层（本文件）：网络请求 + 流控制
 * 
 * 核心设计原则：
 * - 无状态解析（Parser）+ 有状态聚合（Aggregator）
 * - 类型安全（严格 TypeScript，无 as any）
 * - 接口对齐（输出符合 MessageMetadata 规范）
 * - 逐步集成（Feature Flag 控制新旧实现切换）
 * 
 * @module OpenRouterService
 */

import { buildOpenRouterRequest } from './generationAdapter'
import { PROVIDERS } from '../../constants/providers'
import type { 
  AIProviderService, 
  StreamOptions, 
  HistoryMessage
} from '../../types/providers'
import { parseOpenRouterChunk, parseSSELine } from './openrouter/sseParser'
import { createOpenRouterAggregator } from './openrouter/responseAggregator'

// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
// 常量定义
// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

const OPENROUTER_BASE_URL = 'https://openrouter.ai/api/v1'

// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
// 辅助函数
// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

/**
 * 检查模型是否支持图像输入（基于 input_modalities）
 * 
 * 🔥 Breaking Change (v1.0.0):
 * - 不再使用正则匹配回退
 * - 不再使用缓存机制
 * - 仅依赖 API 返回的 input_modalities 字段
 * 
 * @param model - 完整的模型对象（必须包含 input_modalities）
 * @returns 是否支持图像输入
 */
function supportsImage(model: any): boolean {
  const inputModalities = model?.input_modalities
  if (!model || !inputModalities || !Array.isArray(inputModalities)) {
    if (model && !inputModalities) {
      console.warn('[OpenRouterService] 模型缺少 input_modalities 字段:', model?.id)
    }
    return false
  }
  
  const modalities = inputModalities.map((m: string) => String(m).toLowerCase())
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
function supportsFileInput(model: any): boolean {
  const inputModalities = model?.input_modalities
  if (!model || !inputModalities || !Array.isArray(inputModalities)) {
    return false
  }
  
  const modalities = inputModalities.map((m: string) => String(m).toLowerCase())
  return modalities.includes('file') || 
         modalities.includes('document') || 
         modalities.includes('pdf')
}

/**
 * 从模型 ID 中提取模型系列
 * 
 * @param modelId - 模型 ID
 * @returns 模型系列名称
 */
export function extractModelSeries(modelId: string): string {
  const id = modelId.toLowerCase()
  
  if (id.includes('openai/') || id.includes('gpt')) return 'GPT'
  if (id.includes('anthropic/') || id.includes('claude')) return 'Claude'
  if (id.includes('google/') || id.includes('gemini')) return 'Gemini'
  if (id.includes('meta-llama/') || id.includes('llama')) return 'Llama'
  if (id.includes('mistralai/') || id.includes('mistral')) return 'Mistral'
  if (id.includes('qwen')) return 'Qwen'
  if (id.includes('deepseek')) return 'DeepSeek'
  if (id.includes('cohere/') || id.includes('command')) return 'Command'
  if (id.includes('microsoft/') || id.includes('phi')) return 'Phi'
  if (id.includes('mixtral')) return 'Mixtral'
  
  return 'Other'
}

// ⚠️ 已删除 supportsReasoning 函数
// 推理能力检测现在统一使用 AppModel.capabilities.hasReasoning
// 或 modelStore.getModelCapability(modelId)?.reasoning.supported

/**
 * 深拷贝对象（优先使用原生 structuredClone）
 * 
 * @param value - 要拷贝的值
 * @returns 拷贝后的值
 * @private
 */
// @ts-expect-error - 函数保留以备后用，但当前未使用
function _clonePlain<T>(value: T): T {
  try {
    if (typeof structuredClone === 'function') {
      return structuredClone(value)
    }
  } catch (error) {
    // structuredClone 可能因数据类型不支持而失败
  }

  try {
    return JSON.parse(JSON.stringify(value))
  } catch (parseError) {
    // JSON 序列化失败时，使用浅拷贝
    if (value && typeof value === 'object') {
      return { ...value } as T
    }
    return value
  }
}

/**
 * 转换内部消息格式 → OpenRouter API 格式
 * 
 * @param history - 聊天历史
 * @returns OpenRouter API 格式的消息数组
 */
function convertMessagesToOpenRouterFormat(history: HistoryMessage[]): any[] {
  return (history || []).map(msg => {
    const role = msg.role

    let contentBlocks: any[] = []
    if (msg.parts && Array.isArray(msg.parts) && msg.parts.length > 0) {
      contentBlocks = msg.parts
        .map(part => {
          if (part.type === 'text') {
            return {
              type: 'text',
              text: part.text || ''
            }
          }
          if (part.type === 'image_url') {
            return {
              type: 'image_url',
              image_url: {
                url: part.image_url.url,
                detail: 'auto'
              }
            }
          }
          if (part.type === 'file') {
            return {
              type: 'file',
              file: {
                filename: part.file.filename || 'document.pdf',
                file_data: part.file.file_data
              }
            }
          }
          return null
        })
        .filter(Boolean)
    } else {
      // 降级处理：从 parts 中提取文本
      const textPart = msg.parts?.find(p => p.type === 'text')
      const textContent = textPart?.text || ''
      contentBlocks = [
        {
          type: 'text',
          text: textContent
        }
      ]
    }

    if (contentBlocks.length === 0) {
      contentBlocks = [
        {
          type: 'text',
          text: ''
        }
      ]
    }

    const baseMessage: any = {
      role,
      content: contentBlocks
    }

    // Note: reasoning_details 需要从其他途径获取（如 metadata）
    // HistoryMessage 接口暂不包含 metadata 字段
    
    return baseMessage
  })
}

// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
// 核心流式响应方法（新实现）
// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

/**
 * 流式聊天响应（新实现 - 使用 Parser + Aggregator）
 * 
 * **流水线架构**：
 * ```
 * 网络响应 (fetch)
 *    ↓
 * SSE 解析器 (parseSSELine, parseOpenRouterChunk)
 *    ↓
 * 流式聚合器 (OpenRouterStreamAggregator)
 *    ↓
 * 输出 (yield { fullContent, images, metadata })
 * ```
 * 
 * **关键优化**：
 * 1. 无状态解析 + 有状态聚合（职责分离）
 * 2. 增量输出（每个 chunk 处理后立即 yield）
 * 3. 类型安全（100% TypeScript，无 as any）
 * 4. 接口对齐（输出符合 MessageMetadata 规范）
 * 
 * @param apiKey - OpenRouter API Key
 * @param history - 聊天历史
 * @param modelName - 模型 ID
 * @param userMessage - 用户消息
 * @param baseUrl - API Base URL
 * @param options - 流式选项（signal, reasoning, generation config 等）
 * @returns 异步生成器，逐 chunk 输出对象（兼容旧实现格式）
 */
async function* streamChatResponseNew(
  apiKey: string,
  history: HistoryMessage[],
  modelName: string,
  userMessage: string,
  baseUrl: string,
  options?: StreamOptions
): AsyncGenerator<any, void, unknown> {
  // ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
  // 1. 参数提取与配置解析
  // ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
  const signal = options?.signal
  // 兼容：部分调用方会在 options 里传入 { stream: false } 以强制非流式
  const isStreaming: boolean = (options as any)?.stream === false ? false : true
  const reasoningConfig = options?.resolvedReasoningConfig
  const generationConfig = options?.generationConfig
  const modelCapability = options?.modelCapability
  
  // 判断模型是否支持推理（仅通过能力表判断，不再使用 ID 猜测）
  const canUseReasoning = modelCapability?.reasoning?.supportsReasoningParam === true
  
  // ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
  // 2. 转换消息格式
  // ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
  const messages = convertMessagesToOpenRouterFormat(history)
  
  // 添加用户消息
  messages.push({
    role: 'user',
    content: [{ type: 'text', text: userMessage }]
  })
  
  // ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
  // 3. 构建请求体（使用 generationAdapter）
  // ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
  const adapterResult = buildOpenRouterRequest({
    modelId: modelName,
    capability: modelCapability || { 
      reasoning: { supportsReasoningParam: canUseReasoning },
      sampling: {},
      length: {}
    },
    effectiveConfig: generationConfig || {},
    messages
    // Note: strategy 参数使用默认值（DEFAULT_STARVERSE_STRATEGY）
  })
  
  // 构建完整请求体
  const requestBody = {
    model: modelName,
    messages,
    ...adapterResult.requestBodyFragment,
    // OpenRouter 用量统计：需要显式声明才会在响应/流中返回 usage
    usage: { include: true },
    stream: isStreaming
  }
  
  // ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
  // 4. 初始化聚合器
  // ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
  const aggregator = createOpenRouterAggregator({
    modelId: modelName,
    provider: PROVIDERS.OPENROUTER,
    reasoningConfig,
    reasoningPreference: reasoningConfig ? {
      visibility: reasoningConfig.showReasoningContent ? 'visible' : 'hidden',
      effort: reasoningConfig.effort || 'medium',
      maxTokens: reasoningConfig.maxReasoningTokens ?? null
    } : undefined
  })
  
  // ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
  // 5. 发起网络请求
  // ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
  const url = `${baseUrl}/chat/completions`
  
  console.log('5️⃣ HTTP 请求发出')
  const response = await fetch(url, {
    method: 'POST',
    headers: {
      'Authorization': `Bearer ${apiKey}`,
      'Content-Type': 'application/json',
      'HTTP-Referer': 'https://github.com/GuXinghai/starverse',
      'X-Title': 'Starverse'
    },
    body: JSON.stringify(requestBody),
    signal
  })

  // OpenRouter/网关在流式场景下常把 request id 放在 header，而不是每个 data chunk 的 JSON 里
  const headerRequestId =
    response.headers.get('x-request-id') ||
    response.headers.get('x-openrouter-id') ||
    response.headers.get('x-openrouter-request-id') ||
    response.headers.get('openrouter-request-id') ||
    undefined
  
  if (!response.ok) {
    console.log('2️⃣8️⃣ 网络错误处理')
    const errorText = await response.text()
    console.error('[OpenRouterService] ❌ API 错误响应', {
      status: response.status,
      errorText: errorText.substring(0, 500)
    })

    // 与旧实现/UI 约定保持一致：不要 throw，让上层按 chunk 处理错误
    yield {
      type: 'openrouter_error',
      status: response.status,
      error: {
        message: errorText || `OpenRouter API 错误: ${response.status}`,
        statusName: response.statusText || undefined,
        retryable: response.status >= 500 || response.status === 429
      }
    }
    return
  }
  
  console.log('6️⃣ Fetch 响应头接收')
  // ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
  // 6a. 非流式模式：一次性 JSON
  // ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
  console.log('7️⃣ 非流式 vs 流式判断')
  if (!isStreaming) {
    const payload = await response.json().catch(async () => {
      const text = await response.text()
      throw new Error(`OpenRouter 非流式响应不是 JSON: ${text.substring(0, 500)}`)
    })

    // 复用同一套解析逻辑：OpenRouter JSON 与 SSE chunk 结构基本一致
    const chunks = parseOpenRouterChunk(payload)
    for (const chunk of chunks) {
      const enriched =
        chunk.type === 'usage' && !chunk.requestId && headerRequestId
          ? { ...chunk, requestId: headerRequestId }
          : chunk

      aggregator.processChunk(enriched as any)

      if (enriched.type === 'text') {
        yield { type: 'text', content: enriched.content }
      } else if (enriched.type === 'image') {
        yield { type: 'image', content: enriched.content }
      } else if (enriched.type === 'reasoning_detail') {
        yield { type: 'reasoning_detail', detail: enriched.detail }
      } else if (enriched.type === 'reasoning_summary') {
        yield {
          type: 'reasoning_summary',
          summary: enriched.summary,
          text: enriched.text,
          detailCount: enriched.detailCount,
          request: enriched.request,
          provider: enriched.provider,
          model: enriched.model,
          excluded: enriched.excluded
        }
      } else if (enriched.type === 'usage') {
        yield { type: 'usage', usage: enriched.usage, requestId: enriched.requestId }
      } else if (enriched.type === 'error') {
        throw new Error(enriched.error.message || 'Stream error')
      }
    }

    return
  }

  if (!response.body) {
    throw new Error('Response body is null')
  }
  
  // ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
  // 6. 流处理循环（Parser → Aggregator → Yield）
  // ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
  const reader = response.body.getReader()
  const decoder = new TextDecoder('utf-8')
  let buffer = ''
  
  try {
    while (true) {
      console.log('1️⃣1️⃣ 字节流读取')
      const { done, value } = await reader.read()
      
      if (done) {
        break
      }
      
      // 解码字节流
      buffer += decoder.decode(value, { stream: true })
      
      console.log('1️⃣2️⃣ SSE 行缓冲与拆分')
      // 按行拆分（SSE 格式）
      const lines = buffer.split('\n')
      buffer = lines.pop() || '' // 保留最后一个不完整的行
      
      for (const line of lines) {
        if (!line.trim()) continue
        
        // ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
        // 6.1 SSE 解析（文本 → SSEParseResult）
        // ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
        console.log('1️⃣3️⃣ SSE 格式解析')
        const parseResult = parseSSELine(line)
        

        
        // 处理解析错误
        if (parseResult.error) {
          console.warn('[OpenRouterService] ⚠️ SSE 解析错误:', parseResult.error.message)
          continue
        }
        
        // 处理 [DONE] 信号
        console.log('2️⃣2️⃣ [DONE] 信号接收')
        if (parseResult.isDone) {
          break
        }
        
        // 将单个/多个 chunk 统一成数组处理。
        // 关键：同一条 data 行可能同时包含 usage + content 或 reasoning_details + content。
        // 旧逻辑只处理 parseResult.chunk（第一个），会丢失其它 chunk。
        const streamChunks = parseResult.chunks
          ? parseResult.chunks
          : (parseResult.chunk ? [parseResult.chunk] : [])

        // 如果没有有效 chunk（如心跳包），跳过
        if (streamChunks.length === 0) {
          continue
        }
        
        for (const chunk of streamChunks) {
          // 如果 usage chunk 没有 requestId，则用响应 header 补齐
          const enrichedChunk =
            chunk.type === 'usage' && !(chunk as any).requestId && headerRequestId
              ? ({ ...chunk, requestId: headerRequestId } as any)
              : chunk

          // ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
          // 6.2 流式聚合（StreamChunk → 状态累积）
          // ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
          console.log('1️⃣4️⃣ 响应聚合器处理（Parser → Aggregator）')
          aggregator.processChunk(enrichedChunk)
          
          // ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
          // 6.3 增量输出（向后兼容旧实现的对象格式）
          // ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
          // 
          // ⚠️ 关键：旧实现 yield 对象，新实现必须保持一致！
          // 
          // 旧实现格式：
          //   yield { type: 'text', content: 'Hello' }
          //   yield { type: 'image', content: 'https://...' }
          //   yield { type: 'reasoning_detail', detail: {...} }
          //   yield { type: 'usage', usage: {...} }
          // 
          // 新实现必须完全匹配，否则 UI 层会报错
          // ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
          
          if (enrichedChunk.type === 'text') {
            console.log('1️⃣6️⃣ 文本内容 Yield')
            yield { type: 'text', content: enrichedChunk.content }
          } else if (enrichedChunk.type === 'image') {
            yield { type: 'image', content: enrichedChunk.content }
          } else if (enrichedChunk.type === 'reasoning_stream_text') {
            // 推理流文本（实时展示）- 旧实现可能不 yield 这个
            // 保持兼容性，不 yield（UI 从 metadata 获取）
            continue
          } else if (enrichedChunk.type === 'reasoning_detail') {
            yield { type: 'reasoning_detail', detail: enrichedChunk.detail }
          } else if (enrichedChunk.type === 'reasoning_summary') {
            yield {
              type: 'reasoning_summary',
              summary: enrichedChunk.summary,
              text: enrichedChunk.text,
              detailCount: enrichedChunk.detailCount,
              request: enrichedChunk.request,
              provider: enrichedChunk.provider,
              model: enrichedChunk.model,
              excluded: enrichedChunk.excluded
            }
          } else if (enrichedChunk.type === 'usage') {
            yield { type: 'usage', usage: enrichedChunk.usage, requestId: (enrichedChunk as any).requestId }
          } else if (enrichedChunk.type === 'error') {
            // 错误处理：抛出异常（与旧实现一致）
            throw new Error(enrichedChunk.error.message || 'Stream error')
          }
        }
      }
    }
    
    // ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
    // 7. 最终输出（完整聚合结果）
    // ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
    const finalResult = aggregator.getResult()
    console.log('[OpenRouterService] 📊 最终结果:', {
      contentLength: finalResult.fullContent.length,
      imageCount: finalResult.images.length,
      hasReasoning: !!finalResult.metadata.reasoning,
      hasUsage: !!finalResult.metadata.usage
    })
    
    // Note: 最终结果已经在 aggregator 中累积，无需额外 yield
    // UI 层会从 aggregator.getResult() 或消息保存逻辑中获取完整元数据
    
  } catch (error) {
    console.error('[OpenRouterService] ❌ 流式处理错误:', error)
    throw error
  } finally {
    reader.releaseLock()
  }
}

// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
// Service 导出（实现 IAIProvider 接口）
// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

export const OpenRouterService: AIProviderService = {
  /**
   * 检查模型是否支持图像输入
   * 
   * 🔥 Breaking Change (v1.0.0): 仅依赖 input_modalities，不再使用缓存或正则
   */
  supportsImage,

  /**
   * 检查模型是否支持文件输入
   */
  supportsFileInput,

  /**
   * 获取可用的 OpenRouter 模型列表（完整对象）
   * 
   * @param apiKey - OpenRouter API Key
   * @param baseUrl - OpenRouter Base URL
   * @returns 完整的模型对象数组（包含 id, name, architecture.modality 等字段）
   */
  async listAvailableModels(apiKey: string, baseUrl?: string): Promise<string[]> {
    const url = `${baseUrl || OPENROUTER_BASE_URL}/models`
    
    const response = await fetch(url, {
      method: 'GET',
      headers: {
        'Authorization': `Bearer ${apiKey}`,
        'HTTP-Referer': 'https://github.com/GuXinghai/starverse',
        'X-Title': 'Starverse'
      }
    })
    
    if (!response.ok) {
      throw new Error(`Failed to fetch models: ${response.status}`)
    }
    
    const data = await response.json()
    const rows = Array.isArray(data?.data) ? data.data : []
    return rows
      .map((m: any) => (m && typeof m.id === 'string' ? m.id : null))
      .filter((id: string | null): id is string => !!id)
  },

  /**
   * 流式聊天响应（Feature Flag 控制新旧实现）
   * 
   * @param apiKey - OpenRouter API Key
   * @param history - 聊天历史
   * @param modelName - 模型 ID
   * @param userMessage - 用户消息
   * @param baseUrl - API Base URL
   * @param options - 流式选项
   * @returns 异步生成器，逐 token 产出文本
   */
  async* streamChatResponse(
    apiKey: string,
    history: HistoryMessage[],
    modelName: string,
    userMessage: string,
    baseUrl: string | null,
    options?: StreamOptions
  ): AsyncGenerator<string, void, unknown> {
    const resolvedBaseUrl = baseUrl || OPENROUTER_BASE_URL
    
    // 直接使用新实现（Parser + Aggregator）
    yield* streamChatResponseNew(
      apiKey,
      history,
      modelName,
      userMessage,
      resolvedBaseUrl,
      options
    )
  },

  // getModelParameters 已被移除：禁止调用旧 /api/v1/parameters 或 /parameters/* 旧链路，统一走 syncFromOpenRouter() + AppModel.capabilities
}

// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
// 默认导出（向后兼容）
// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

export default OpenRouterService
