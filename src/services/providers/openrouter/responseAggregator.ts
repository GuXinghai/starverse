/**
 * OpenRouter Stream Response Aggregator
 * 
 * **职责**：聚合 SSE 流中的碎片数据，输出完整的消息元数据
 * 
 * **有状态设计（Stateful Class）**：
 * - 内部维护多个缓冲区（fullContent, reasoningText, reasoningDetails, usage）
 * - 逐块处理 StreamChunk，累积状态
 * - 最终输出符合 MessageMetadata 规范的结构
 * 
 * **处理竞态**：
 * - 支持"思考"（Reasoning）与"回答"（Content）交替出现
 * - 多个 buffer 互不干扰，独立累积
 * - 图片数据去重（Set 跟踪已见 URL）
 * 
 * **数据对齐**：
 * - 输出严格匹配 `ipcSanitizer.d.ts` 定义的 `MessageMetadata` 接口
 * - 确保"出口"（Aggregator）和"入口"（Sanitizer）完美衔接
 * 
 * @module services/providers/openrouter/responseAggregator
 */

import type { StreamChunk, ReasoningConfig } from '@/types/providers'
import type { MessageMetadata } from '@/utils/ipcSanitizer'

// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
// 类型定义
// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

/**
 * 推理详情条目（内部存储格式）
 */
interface ReasoningDetailEntry {
  id: string | null
  type: string
  text: string
  summary: string
  data: any
  format: string
  index?: number
}

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
  /** 推理配置（用于元数据） */
  reasoningConfig?: ReasoningConfig | null
  /** 推理偏好（旧版 UI 格式） */
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
 * OpenRouter 流式响应聚合器
 * 
 * **使用模式**：
 * ```typescript
 * const aggregator = new OpenRouterStreamAggregator({
 *   modelId: 'anthropic/claude-3-opus',
 *   provider: 'OpenRouter'
 * })
 * 
 * // 逐块处理
 * for await (const chunk of sseStream) {
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
export class OpenRouterStreamAggregator {
  // ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
  // 私有状态（Buffer 层）
  // ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
  
  /** 完整文本内容（不含推理） */
  private fullContent: string = ''
  
  /** 推理文本流（用于实时展示） */
  private reasoningText: string = ''
  
  /** 推理详情列表（结构化数据，用于回传模型） */
  private reasoningDetails: ReasoningDetailEntry[] = []
  
  /** 推理详情去重集合（通过 id 或内容指纹） */
  private reasoningDetailIds: Set<string> = new Set()
  
  /** 推理摘要（流结束时设置） */
  private reasoningSummary: string = ''
  
  /** 图片 URL 列表（去重） */
  private images: Set<string> = new Set()
  
  /** Token 使用量统计 */
  private usage: Record<string, any> | null = null
  
  /** 请求 ID（用于异步 Usage 查询） */
  private requestId: string | null = null
  
  /** 配置项 */
  private config: AggregatorConfig
  
  /** 是否已接收推理数据（用于可见性判断） */
  private hasReceivedReasoning: boolean = false

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
   * - `reasoning_stream_text`: 追加到 reasoningText
   * - `reasoning_detail`: 去重后添加到 reasoningDetails
   * - `reasoning_summary`: 设置 reasoningSummary（覆盖）
   * - `usage`: 合并到 usage 对象
   * - `error`: 抛出异常（或记录，取决于业务逻辑）
   * 
   * @param chunk - SSE 解析器输出的 StreamChunk
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

      case 'reasoning_stream_text':
        this.reasoningText += chunk.text
        this.hasReceivedReasoning = true
        break

      case 'reasoning_detail':
        // 去重：使用 id 或内容指纹
        const detail = chunk.detail
        const detailId = detail.id || this.createDetailFingerprint(detail)
        
        if (!this.reasoningDetailIds.has(detailId)) {
          this.reasoningDetailIds.add(detailId)
          this.reasoningDetails.push(detail)
          this.hasReceivedReasoning = true
        }
        break

      case 'reasoning_summary':
        // 覆盖式更新（最后一个 summary 为准）
        this.reasoningSummary = chunk.summary
        this.hasReceivedReasoning = true
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

      case 'error':
        // 错误处理：可以选择抛出异常或记录到元数据
        throw new Error(`OpenRouter stream error: ${chunk.error.message}`)

      default:
        // 未知类型：忽略（向前兼容）
        console.warn('[OpenRouterStreamAggregator] Unknown chunk type:', (chunk as any).type)
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
   * @returns 文本内容（不含推理）
   */
  public getFullContent(): string {
    return this.fullContent
  }

  /**
   * 获取当前累积的推理文本
   * 
   * @returns 推理文本（用于实时展示）
   */
  public getReasoningText(): string {
    return this.reasoningText
  }

  /**
   * 获取推理详情数量
   * 
   * @returns 详情条目数
   */
  public getReasoningDetailCount(): number {
    return this.reasoningDetails.length
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
   * - `metadata.reasoning` 结构匹配 `ipcSanitizer.d.ts` 定义
   * - 确保可以安全通过 `sanitizeMessageMetadata()` 处理
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
   * **推理可见性逻辑**：
   * 1. 优先使用 reasoningConfig 的 showReasoningContent
   * 2. 其次使用 reasoningPreference.visibility
   * 3. 如果收到推理数据但配置为 'off'，自动提升为 'visible'
   * 
   * @returns 符合 MessageMetadata 规范的元数据对象
   */
  private buildMetadata(): MessageMetadata {
    const metadata: MessageMetadata = {
      provider: this.config.provider,
      model: this.config.modelId
    }

    // ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
    // 1. Usage 数据
    // ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
    if (this.usage) {
      metadata.usage = { ...this.usage }
    }

    // ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
    // 2. 请求 ID（用于异步 Usage 查询）
    // ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
    if (this.requestId) {
      metadata.generationId = this.requestId
    }

    // ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
    // 3. 推理数据（仅当收到推理内容时才添加）
    // ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
    if (this.hasReceivedReasoning) {
      const reasoningVisibility = this.resolveReasoningVisibility()
      
      // 只有在需要显示推理时才构建完整的 reasoning 对象
      if (reasoningVisibility !== 'off') {
        metadata.reasoning = {
          // 摘要（优先级高）
          summary: this.reasoningSummary || this.generateAutoSummary(),
          
          // 详情列表（转换为 MessageMetadata 格式）
          details: this.reasoningDetails.map(detail => ({
            type: detail.type,
            content: detail.text || detail.summary
          }))
        }
      }
    }

    return metadata
  }

  // ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
  // 辅助方法
  // ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

  /**
   * 创建推理详情指纹（用于去重）
   * 
   * @param detail - 推理详情对象
   * @returns 唯一指纹字符串
   */
  private createDetailFingerprint(detail: ReasoningDetailEntry): string {
    return JSON.stringify([
      detail.type,
      detail.text,
      detail.summary
    ])
  }

  /**
   * 解析推理可见性配置
   * 
   * **优先级**：
   * 1. reasoningConfig.showReasoningContent（新版配置）
   * 2. reasoningPreference.visibility（旧版 UI）
   * 3. 自动提升：如果收到推理数据但配置为 'off'，提升为 'visible'
   * 
   * @returns 'visible' | 'hidden' | 'off'
   */
  private resolveReasoningVisibility(): 'visible' | 'hidden' | 'off' {
    // 优先使用新版配置
    if (this.config.reasoningConfig) {
      // showReasoningContent: false → 'off'（完全不添加 reasoning 字段）
      // showReasoningContent: true → 'visible'（添加并显示）
      return this.config.reasoningConfig.showReasoningContent ? 'visible' : 'off'
    }

    // 其次使用旧版 UI 配置
    if (this.config.reasoningPreference?.visibility) {
      return this.config.reasoningPreference.visibility
    }

    // 默认：如果收到推理数据，自动设为 visible
    return this.hasReceivedReasoning ? 'visible' : 'off'
  }

  /**
   * 生成自动推理摘要（当模型未提供 summary 时）
   * 
   * **策略**：
   * - 优先使用 reasoningText 的前 200 字符
   * - 其次使用第一个 reasoning detail 的内容
   * - 最后使用固定模板
   * 
   * @returns 自动生成的摘要字符串
   */
  private generateAutoSummary(): string {
    if (this.reasoningText) {
      // 截取前 200 字符，添加省略号
      const trimmed = this.reasoningText.trim()
      return trimmed.length > 200
        ? trimmed.substring(0, 200) + '...'
        : trimmed
    }

    if (this.reasoningDetails.length > 0) {
      const firstDetail = this.reasoningDetails[0]
      return firstDetail.summary || firstDetail.text || 'Reasoning process'
    }

    return `Processed with reasoning (${this.reasoningDetails.length} steps)`
  }

  /**
   * 重置聚合器状态（用于复用同一实例）
   * 
   * **使用场景**：对象池（Object Pool）优化
   */
  public reset(): void {
    this.fullContent = ''
    this.reasoningText = ''
    this.reasoningDetails = []
    this.reasoningDetailIds.clear()
    this.reasoningSummary = ''
    this.images.clear()
    this.usage = null
    this.requestId = null
    this.hasReceivedReasoning = false
  }
}

// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
// 工厂函数（便捷创建）
// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

/**
 * 创建 OpenRouter 流聚合器实例
 * 
 * @param config - 聚合器配置
 * @returns 聚合器实例
 * 
 * @example
 * ```typescript
 * const aggregator = createOpenRouterAggregator({
 *   modelId: 'anthropic/claude-3-opus',
 *   provider: 'OpenRouter'
 * })
 * ```
 */
export function createOpenRouterAggregator(config: AggregatorConfig): OpenRouterStreamAggregator {
  return new OpenRouterStreamAggregator(config)
}
