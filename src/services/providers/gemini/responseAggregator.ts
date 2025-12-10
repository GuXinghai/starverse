/**
 * Gemini Stream Response Aggregator
 * 
 * **职责**：聚合 Gemini SDK 流中的碎片数据，输出完整的消息元数据
 * 
 * **有状态设计（Stateful Class）**：
 * - 内部维护多个缓冲区（fullContent, images, usage）
 * - 逐块处理 StreamChunk，累积状态
 * - 最终输出符合 MessageMetadata 规范的结构
 * 
 * **处理特点**：
 * - Gemini 通常不产生推理流（与 DeepSeek/OpenAI 不同）
 * - 但结构与 OpenRouter 聚合器完全相同，便于代码复用
 * - 如果未来 Gemini 支持推理，可复用现有的 reasoningText/reasoningDetails 缓冲
 * 
 * **数据对齐**：
 * - 输出严格匹配 `ipcSanitizer.d.ts` 定义的 `MessageMetadata` 接口
 * - 确保"出口"（Aggregator）和"入口"（Sanitizer）完美衔接
 * 
 * @module services/providers/gemini/responseAggregator
 */

import type { StreamChunk, ReasoningConfig } from '@/types/providers'
import type { MessageMetadata } from '@/utils/ipcSanitizer'

// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
// 类型定义
// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

/**
 * 聚合器配置
 */
export interface AggregatorConfig {
  /** 对话 ID（用于日志） */
  conversationId?: string
  /** 模型 ID */
  modelId: string
  /** Provider 名称 */
  provider: string
  /** 推理配置（用于元数据）- 目前 Gemini 不使用 */
  reasoningConfig?: ReasoningConfig | null
  /** 推理偏好（旧版 UI 格式）- 目前 Gemini 不使用 */
  reasoningPreference?: {
    visibility?: 'visible' | 'hidden' | 'off'
    effort?: 'low' | 'medium' | 'high'
    maxTokens?: number | null
  }
}

/**
 * 聚合结果（最终输出）
 */
export interface AggregationResult {
  /** 完整文本内容（不含推理） */
  fullContent: string
  /** 图片 URL 列表 */
  images: string[]
  /** 消息元数据（符合 MessageMetadata 接口） */
  metadata: MessageMetadata
}

// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
// 核心聚合器类
// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

/**
 * Gemini 流式响应聚合器
 * 
 * **使用模式**：
 * ```typescript
 * const aggregator = new GeminiStreamAggregator({
 *   modelId: 'gemini-2.0-flash',
 *   provider: 'Gemini'
 * })
 * 
 * // 逐块处理
 * for await (const chunk of geminiStream) {
 *   aggregator.processChunk(chunk)
 *   
 *   // 实时访问状态
 *   console.log(aggregator.getFullContent())
 * }
 * 
 * // 获取最终结果
 * const result = aggregator.getResult()
 * console.log(result.metadata) // 符合 MessageMetadata 规范
 * ```
 * 
 * **线程安全**：
 * - 单线程环境（JavaScript）下无需加锁
 * - 如果未来引入 Worker，需添加互斥机制
 */
export class GeminiStreamAggregator {
  // ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
  // 私有状态（Buffer 层）
  // ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
  
  /** 完整文本内容 */
  private fullContent: string = ''
  
  /** 图片 URL 列表（去重） */
  private images: Set<string> = new Set()
  
  /** Token 使用量统计 */
  private usage: Record<string, any> | null = null
  
  /** 请求 ID（用于异步查询） */
  private requestId: string | null = null
  
  /** 配置项 */
  private config: AggregatorConfig

  // ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
  // 构造函数
  // ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

  constructor(config: AggregatorConfig) {
    this.config = config
  }

  // ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
  // 核心方法：逐块处理
  // ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

  /**
   * 处理单个 StreamChunk，更新内部状态
   * 
   * **处理策略**：
   * - `text`: 追加到 fullContent
   * - `image`: 添加到 images Set（去重）
   * - `usage`: 合并到 usage 对象
   * - 其他推理类型（暂时忽略，Gemini 暂不产生）：
   *   - `reasoning_stream_text`, `reasoning_detail`, `reasoning_summary`
   * - `error`: 抛出异常
   * 
   * @param chunk - streamChunkConverter 输出的 StreamChunk
   * @throws {Error} 如果 chunk.type 为 'error'
   */
  public processChunk(chunk: StreamChunk): void {
    switch (chunk.type) {
      case 'text':
        this.fullContent += chunk.content
        break

      case 'image':
        // 图片去重（Set 自动处理）
        this.images.add(chunk.content)
        break

      case 'usage':
        // 合并 usage 数据（允许多次更新）
        this.usage = {
          ...this.usage,
          ...chunk.usage
        }
        
        // 提取 requestId（用于异步查询）
        if (chunk.requestId && !this.requestId) {
          this.requestId = chunk.requestId
        }
        break

      case 'reasoning_stream_text':
        // Gemini 目前不产生推理流，但保留处理逻辑以备未来扩展
        console.warn('[GeminiStreamAggregator] Unexpected reasoning_stream_text from Gemini')
        break

      case 'reasoning_detail':
        console.warn('[GeminiStreamAggregator] Unexpected reasoning_detail from Gemini')
        break

      case 'reasoning_summary':
        console.warn('[GeminiStreamAggregator] Unexpected reasoning_summary from Gemini')
        break

      case 'error':
        // 错误处理：抛出异常
        throw new Error(`Gemini stream error: ${chunk.error.message}`)

      default:
        // 未知类型：忽略（向前兼容）
        console.warn('[GeminiStreamAggregator] Unknown chunk type:', (chunk as any).type)
    }
  }

  /**
   * 批量处理多个 StreamChunk
   * 
   * @param chunks - StreamChunk 数组
   */
  public processChunks(chunks: StreamChunk[]): void {
    for (const chunk of chunks) {
      this.processChunk(chunk)
    }
  }

  // ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
  // 访问器方法（实时状态）
  // ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

  /**
   * 获取当前累积的完整文本内容
   * 
   * @returns 文本内容
   */
  public getFullContent(): string {
    return this.fullContent
  }

  /**
   * 获取图片列表
   * 
   * @returns 图片 URL 数组
   */
  public getImages(): string[] {
    return Array.from(this.images)
  }

  /**
   * 获取 Token 使用量
   * 
   * @returns Usage 对象或 null
   */
  public getUsage(): Record<string, any> | null {
    return this.usage
  }

  // ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
  // 最终结果构建
  // ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

  /**
   * 获取最终聚合结果
   * 
   * **数据对齐**：
   * - `metadata` 严格符合 `MessageMetadata` 接口规范
   * - 可以安全通过 `sanitizeMessageMetadata()` 处理
   * 
   * @returns 完整聚合结果
   */
  public getResult(): AggregationResult {
    return {
      fullContent: this.fullContent,
      images: this.getImages(),
      metadata: this.buildMetadata()
    }
  }

  /**
   * 构建 MessageMetadata 对象
   * 
   * **Gemini 简化版**：
   * - Gemini 目前不产生推理数据
   * - 仅包含 provider, model, usage
   * - 如果未来支持推理，按 OpenRouter 逻辑扩展
   * 
   * @returns 符合 MessageMetadata 规范的元数据对象
   */
  private buildMetadata(): MessageMetadata {
    const metadata: MessageMetadata = {
      provider: this.config.provider,
      model: this.config.modelId
    }

    // Usage 数据
    if (this.usage) {
      metadata.usage = { ...this.usage }
    }

    // 请求 ID（用于异步查询）
    if (this.requestId) {
      metadata.generationId = this.requestId
    }

    return metadata
  }

  // ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
  // 工具方法
  // ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

  /**
   * 重置聚合器状态（用于复用同一实例）
   * 
   * **使用场景**：对象池（Object Pool）优化
   */
  public reset(): void {
    this.fullContent = ''
    this.images.clear()
    this.usage = null
    this.requestId = null
  }
}

// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
// 工厂函数（便捷创建）
// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

/**
 * 创建 Gemini 流聚合器实例
 * 
 * @param config - 聚合器配置
 * @returns 聚合器实例
 * 
 * @example
 * ```typescript
 * const aggregator = createGeminiAggregator({
 *   modelId: 'gemini-2.0-flash',
 *   provider: 'Gemini'
 * })
 * ```
 */
export function createGeminiAggregator(config: AggregatorConfig): GeminiStreamAggregator {
  return new GeminiStreamAggregator(config)
}
