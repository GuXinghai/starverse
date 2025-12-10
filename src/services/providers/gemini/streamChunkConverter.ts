/**
 * Gemini Stream Chunk Converter
 * 
 * **职责**：将 Google Generative AI SDK 返回的 ContentStreamPart 对象转换为统一的 StreamChunk 格式
 * 
 * **关键差异**（相比 OpenRouter）：
 * - OpenRouter: HTTP SSE 流需要手动解析 (`data: {...}` → JSON → StreamChunk)
 * - Gemini: 官方 SDK 直接返回对象 (ContentStreamPart → StreamChunk)
 * - 因此无需 SSE 解析，直接做数据结构转换
 * 
 * **Gemini SDK 数据结构**：
 * ```typescript
 * // 来自 generateContentStream() 的 chunk
 * {
 *   candidates?: Array<{
 *     index: number
 *     content: {
 *       role: string
 *       parts: Array<
 *         | { text: string }                          // 文本
 *         | { inlineData: { mimeType, data } }        // 图片
 *         | { functionCall: { name, args } }          // 函数调用
 *       >
 *     }
 *     finishReason?: string
 *     safetyRatings?: Array<{ category, probability }>
 *   }>
 *   usageMetadata?: {
 *     promptTokenCount: number
 *     candidatesTokenCount: number
 *     totalTokenCount: number
 *   }
 * }
 * ```
 * 
 * **处理策略**：
 * - 文本 part 直接映射到 TextChunk
 * - 图片 part（inlineData）映射到 ImageChunk（转为 Data URI）
 * - 推理 part（如果支持）映射到相应的推理 chunk
 * - 流结束时 usageMetadata 映射到 UsageChunk
 * 
 * @module services/providers/gemini/streamChunkConverter
 */

import type { StreamChunk } from '@/types/providers'

// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
// 类型定义
// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

/**
 * Google Generative AI SDK 返回的原始 chunk 类型
 */
export interface GeminiContentStreamPart {
  candidates?: Array<{
    index: number
    content: {
      role: string
      parts: Array<GeminiPart>
    }
    finishReason?: string
    safetyRatings?: Array<{
      category: string
      probability: string
    }>
  }>
  usageMetadata?: {
    promptTokenCount: number
    candidatesTokenCount: number
    totalTokenCount: number
  }
}

/**
 * Gemini 中的 Part 类型
 */
export type GeminiPart =
  | { text: string }
  | { inlineData: { mimeType: string; data: string } }
  | { functionCall: { name: string; args: any } }
  | Record<string, any>

/**
 * Chunk 转换结果
 */
export interface ConversionResult {
  /** 转换成功的 StreamChunk 数组（一个原始 chunk 可能产生多个 StreamChunk） */
  chunks: StreamChunk[]
  /** 是否达到流末尾 */
  isFinished: boolean
  /** 转换错误（如果有） */
  error?: Error
}

// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
// 主函数
// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

/**
 * 将 Gemini SDK 的原始 chunk 转换为统一的 StreamChunk 格式
 * 
 * @param rawChunk - 来自 generateContentStream() 的原始 chunk
 * @returns 转换结果，包含零个或多个 StreamChunk
 */
export function convertGeminiChunk(rawChunk: GeminiContentStreamPart): ConversionResult {
  const chunks: StreamChunk[] = []
  let isFinished = false

  try {
    // 处理候选项（通常只有一个）
    if (rawChunk.candidates && Array.isArray(rawChunk.candidates)) {
      for (const candidate of rawChunk.candidates) {
        // 检查是否完成
        if (candidate.finishReason) {
          isFinished = true
        }

        // 处理 content 中的 parts
        if (candidate.content?.parts && Array.isArray(candidate.content.parts)) {
          for (const part of candidate.content.parts) {
            const partChunks = convertGeminiPart(part)
            chunks.push(...partChunks)
          }
        }
      }
    }

    // 处理 usage 数据（流结束时出现）
    if (rawChunk.usageMetadata) {
      chunks.push(convertGeminiUsage(rawChunk.usageMetadata))
    }

    return {
      chunks,
      isFinished,
      error: undefined
    }
  } catch (error) {
    return {
      chunks: [],
      isFinished: false,
      error: error instanceof Error ? error : new Error(String(error))
    }
  }
}

// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
// 辅助函数
// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

/**
 * 转换单个 Part 为 StreamChunk 数组
 * 一个 part 通常转换为一个 chunk，但也可能产生多个
 */
function convertGeminiPart(part: GeminiPart): StreamChunk[] {
  const result: StreamChunk[] = []

  try {
    // 文本 part
    if ('text' in part && typeof part.text === 'string') {
      if (part.text) {
        result.push({
          type: 'text',
          content: part.text
        })
      }
      return result
    }

    // 图片 part（inlineData）
    if ('inlineData' in part && part.inlineData) {
      const { mimeType, data } = part.inlineData
      if (mimeType && data) {
        const dataUri = `data:${mimeType};base64,${data}`
        result.push({
          type: 'image',
          content: dataUri
        })
      }
      return result
    }

    // 函数调用 part（暂不支持）
    if ('functionCall' in part) {
      console.warn('GeminiStreamChunkConverter: 暂不支持函数调用 part')
      return result
    }

    // 其他未知 part 类型
    console.warn('GeminiStreamChunkConverter: 遇到未知 part 类型', Object.keys(part))
    return result
  } catch (error) {
    console.error('GeminiStreamChunkConverter: Part 转换失败', error, part)
    return result
  }
}

/**
 * 转换 Gemini usage metadata 为 UsageChunk
 */
function convertGeminiUsage(usageMetadata: {
  promptTokenCount: number
  candidatesTokenCount: number
  totalTokenCount: number
}): StreamChunk {
  return {
    type: 'usage',
    usage: {
      promptTokens: usageMetadata.promptTokenCount,
      completionTokens: usageMetadata.candidatesTokenCount,
      totalTokens: usageMetadata.totalTokenCount
    }
  }
}

// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
// 批量处理工具
// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

/**
 * 批量转换多个 chunks（用于测试和调试）
 */
export function convertGeminiChunksBatch(
  rawChunks: GeminiContentStreamPart[]
): ConversionResult {
  const allChunks: StreamChunk[] = []
  let anyFinished = false
  const errors: Error[] = []

  for (const chunk of rawChunks) {
    const result = convertGeminiChunk(chunk)
    allChunks.push(...result.chunks)
    if (result.isFinished) anyFinished = true
    if (result.error) errors.push(result.error)
  }

  return {
    chunks: allChunks,
    isFinished: anyFinished,
    error: errors.length > 0 ? errors[0] : undefined
  }
}
