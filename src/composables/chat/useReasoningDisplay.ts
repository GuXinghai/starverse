/**
 * useReasoningDisplay - Reasoning 数据处理与展示
 * 
 * 职责：
 * - 捕获并保存 reasoning 元数据到分支
 * - 提取和格式化推理文本（支持流式展示）
 * - 处理推理细节（details）的显示逻辑
 * - 判断推理内容的显示条件
 * 
 * 迁移自：ChatView.vue Phase 5 重构
 */

import type { MessageReasoningMetadata, MessageVersionMetadata } from '../../types/chat'
import { useBranchStore } from '../../stores/branch'

/**
 * 推理细节展示数据结构
 */
export type ReasoningDetailDisplay = {
  key: string
  title: string
  text: string
  summary: string
}

/**
 * 规范化推理细节类型字符串
 * 
 * 转换规则：
 * - 转小写
 * - 非字母数字字符替换为下划线
 * - 移除首尾下划线
 * 
 * @param type - 原始类型字符串
 * @returns 规范化后的类型字符串
 * 
 * @example
 * normalizeReasoningDetailType('Reasoning Text') // => 'reasoning_text'
 * normalizeReasoningDetailType('Reasoning.Summary') // => 'reasoning_summary'
 */
export const normalizeReasoningDetailType = (type?: string | null): string => {
  if (typeof type !== 'string') {
    return ''
  }
  return type
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '_')
    .replace(/^_+|_+$/g, '')
}

/**
 * 判断推理细节类型是否为文本类型
 * 
 * 文本类型用于流式展示，应在累积文本区域显示而非单独的 detail 块
 * 
 * 识别规则（满足任一）：
 * - 以 'reasoning_text' 开头
 * - 包含 'reasoning_summary'
 * - 包含 'reasoning_stream'
 * 
 * @param type - 推理细节类型
 * @returns true 表示是文本类型
 */
export const isReasoningTextDetailType = (type?: string | null): boolean => {
  const normalized = normalizeReasoningDetailType(type)
  if (!normalized) {
    return false
  }

  if (normalized.startsWith('reasoning_text')) {
    return true
  }

  if (normalized.includes('reasoning_summary')) {
    return true
  }

  if (normalized.includes('reasoning_stream')) {
    return true
  }

  return false
}

/**
 * 获取推理主要文本（reasoning.text）
 * 
 * @param reasoning - 推理元数据
 * @returns 规范化的推理文本
 */
export const getReasoningPrimaryText = (reasoning?: MessageReasoningMetadata | null): string => {
  if (!reasoning || typeof reasoning.text !== 'string') {
    return ''
  }
  const normalized = reasoning.text.replace(/\r\n/g, '\n').trim()
  return normalized
}

/**
 * 获取推理文本（支持流式显示）
 * 
 * ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
 * 显示逻辑（按优先级）：
 * ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
 * 
 * 1️⃣ reasoning.streamText（来自 delta.reasoning，流式过程中实时显示）
 *    - 用途：UI 展示层，实时显示思考过程
 *    - 来源：OpenRouter 的 delta.reasoning 字段
 * 
 * 2️⃣ reasoning.text（来自 reasoning_summary，流结束后的完整文本）
 *    - 用途：最终完整文本，流结束后显示
 *    - 来源：OpenRouter 流结束时的 reasoning_summary.text
 * 
 * 3️⃣ 从 details 重建（向后兼容旧数据）
 *    - 用途：兼容旧版本保存的数据
 *    - 注意：details 是用于回传模型的结构化数据，不是主要展示源
 * 
 * ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
 * 
 * @param reasoning - 推理元数据
 * @returns 格式化的推理文本
 */
export const getReasoningStreamText = (reasoning?: MessageReasoningMetadata | null): string => {
  if (!reasoning) {
    return ''
  }

  // 1️⃣ 优先使用 streamText（流式展示文本）
  if (typeof reasoning.streamText === 'string' && reasoning.streamText) {
    return reasoning.streamText.replace(/\r\n/g, '\n').trim()
  }

  // 2️⃣ 使用 text（最终完整文本）
  if (typeof reasoning.text === 'string' && reasoning.text.trim()) {
    return reasoning.text.replace(/\r\n/g, '\n').trim()
  }

  // 3️⃣ 向后兼容：从 details 重建（仅用于旧数据）
  if (!Array.isArray(reasoning.details) || reasoning.details.length === 0) {
    return ''
  }

  const textParts: string[] = []
  for (const detail of reasoning.details) {
    if (!detail || typeof detail !== 'object') {
      continue
    }

    if (!isReasoningTextDetailType(detail.type)) {
      continue
    }

    const detailText = typeof detail.text === 'string' ? detail.text : ''
    const fallbackSummary = !detailText && typeof detail.summary === 'string' ? detail.summary : ''
    const content = detailText || fallbackSummary

    if (content) {
      textParts.push(content)
    }
  }

  return textParts.join('').replace(/\r\n/g, '\n')
}

/**
 * 检查是否需要显示额外的汇总文本
 * 由于 getReasoningStreamText 已经返回完整文本，总是返回 false
 * 
 * @param _reasoning - 推理元数据（未使用）
 * @returns 始终返回 false
 */
export const shouldShowReasoningSummaryText = (_reasoning?: MessageReasoningMetadata | null): boolean => {
  return false
}

/**
 * 获取汇总文本（保留用于向后兼容）
 * 
 * @param reasoning - 推理元数据
 * @returns 汇总文本
 */
export const getReasoningSummaryText = (reasoning?: MessageReasoningMetadata | null): string => {
  if (!reasoning || typeof reasoning.text !== 'string') {
    return ''
  }
  return reasoning.text.replace(/\r\n/g, '\n').trim()
}

/**
 * 获取用于展示的推理细节列表
 * 
 * 处理逻辑：
 * 1. 过滤掉用于流式展示的文本类型（由 getReasoningStreamText 统一处理）
 * 2. 去重：基于内容指纹而非 title
 * 3. 过滤与主要内容重复的细节
 * 4. 智能处理 title 和 summary 的关系
 * 
 * @param reasoning - 推理元数据
 * @returns 格式化的细节列表
 */
export const getReasoningDetailsForDisplay = (reasoning?: MessageReasoningMetadata | null): ReasoningDetailDisplay[] => {
  if (!reasoning || !Array.isArray(reasoning.details)) {
    return []
  }

  const primaryText = getReasoningPrimaryText(reasoning)
  const normalizedPrimary = primaryText.replace(/\s+/g, '')
  const summaryText = typeof reasoning.summary === 'string' ? reasoning.summary.trim() : ''
  const normalizedSummary = summaryText.replace(/\s+/g, '')
  const seenKeys = new Set<string>()

  return reasoning.details
    .map((detail, index) => {
      if (!detail || typeof detail !== 'object') {
        return null
      }

      // ✅ 过滤掉用于流式展示的类型，统一在累积文本区域显示
      if (isReasoningTextDetailType(detail.type)) {
        return null
      }
      
      // 提取数据
      const detailText = typeof detail.text === 'string' ? detail.text.trim() : ''
      const detailSummary = typeof detail.summary === 'string' ? detail.summary.trim() : ''
      const detailType = typeof detail.type === 'string' ? detail.type.trim() : ''

      // 决定 title：优先使用 type，如果没有则使用 summary，最后使用索引
      const title = detailType || detailSummary || `细节 ${index + 1}`
      
      // 如果 title 来自 summary，则在显示时不再重复显示 summary
      const displaySummary = detailType ? detailSummary : ''

      const normalizedText = detailText.replace(/\s+/g, '')
      const normalizedDetailSummary = detailSummary.replace(/\s+/g, '')

      // 如果 text 与主要内容重复，过滤掉
      if (normalizedText && (normalizedText === normalizedPrimary || normalizedText === normalizedSummary)) {
        return null
      }

      // 如果没有 text，但 summary 与主要内容重复，也过滤掉
      if (!normalizedText && normalizedDetailSummary && 
          (normalizedDetailSummary === normalizedPrimary || normalizedDetailSummary === normalizedSummary)) {
        return null
      }

      // 如果既没有 text 也没有有效的 summary（且 title 只是索引），过滤掉
      if (!detailText && !detailSummary && !detailType) {
        return null
      }

      // 去重检查（基于实际内容而非 title）
      const fingerprint = JSON.stringify([detailText, detailSummary])
      if (seenKeys.has(fingerprint)) {
        return null
      }
      seenKeys.add(fingerprint)

      return {
        key: typeof detail.id === 'string' && detail.id.trim() ? detail.id : `detail-${index}`,
        title,
        text: detailText,
        summary: displaySummary
      }
    })
    .filter((item): item is ReasoningDetailDisplay => Boolean(item))
}

/**
 * 检查是否有可显示的推理内容
 * 
 * 检查条件（满足任一）：
 * - reasoning.excluded 为 true（表示推理已启用但不返回内容）
 * - 有 summary 文本
 * - 有流式文本（getReasoningStreamText）
 * - 有可显示的细节（getReasoningDetailsForDisplay）
 * 
 * @param reasoning - 推理元数据
 * @returns true 表示有内容可显示
 */
export const hasReasoningDisplayContent = (reasoning?: MessageReasoningMetadata | null): boolean => {
  console.log('[useReasoningDisplay] 🔍 hasReasoningDisplayContent called:', {
    hasReasoning: !!reasoning,
    excluded: reasoning?.excluded,
    hasSummary: !!(reasoning?.summary),
    streamText: reasoning?.streamText?.substring(0, 50),
    text: reasoning?.text?.substring(0, 50),
    detailsCount: reasoning?.details?.length || 0
  })

  if (!reasoning) {
    return false
  }

  if (reasoning.excluded) {
    console.log('[useReasoningDisplay] ✅ Has excluded reasoning')
    return true
  }

  if (typeof reasoning.summary === 'string' && reasoning.summary.trim()) {
    console.log('[useReasoningDisplay] ✅ Has summary')
    return true
  }

  // 检查累积的推理文本（包括流式过程中的 details）
  const streamText = getReasoningStreamText(reasoning)
  if (streamText) {
    console.log('[useReasoningDisplay] ✅ Has stream text:', streamText.length, 'chars')
    return true
  }

  // 检查其他类型的细节
  if (getReasoningDetailsForDisplay(reasoning).length > 0) {
    return true
  }

  return false
}

/**
 * 检查推理内容是否被加密/隐藏（应显示占位符而非实际内容）
 * 
 * 加密的判断条件：
 * - reasoning.excluded === true（用户配置为 hidden）
 * - 且没有实际的文本内容（text/streamText/details）
 * 
 * @param reasoning - 推理元数据
 * @returns true 表示应显示加密占位符
 */
export const isReasoningEncrypted = (reasoning?: MessageReasoningMetadata | null): boolean => {
  if (!reasoning || !reasoning.excluded) {
    return false
  }

  // 如果有实际内容，则不认为是加密的
  const hasActualContent = Boolean(
    getReasoningStreamText(reasoning) ||
    getReasoningDetailsForDisplay(reasoning).length > 0
  )

  return !hasActualContent
}

/**
 * 检查推理文本是否较长（应默认折叠）
 * 
 * 判断标准：超过 500 字符或 10 行
 * 
 * @param text - 推理文本
 * @returns true 表示应默认折叠
 */
export const shouldCollapseReasoningText = (text?: string): boolean => {
  if (!text) {
    return false
  }

  // 超过 500 字符
  if (text.length > 500) {
    return true
  }

  // 超过 10 行
  const lineCount = text.split('\n').length
  if (lineCount > 10) {
    return true
  }

  return false
}

/**
 * 获取推理请求配置的显示标签
 * 
 * @param reasoning - 推理元数据
 * @returns 配置标签数组
 */
export const getReasoningConfigBadges = (reasoning?: MessageReasoningMetadata | null): Array<{ label: string; value: string; color: string }> => {
  if (!reasoning?.request) {
    return []
  }

  const badges: Array<{ label: string; value: string; color: string }> = []

  // Effort 挡位
  if (reasoning.request.effort) {
    const effortLabels: Record<string, string> = {
      low: '低挡',
      medium: '中挡',
      high: '高挡'
    }
    const effortColors: Record<string, string> = {
      low: 'blue',
      medium: 'yellow',
      high: 'red'
    }
    badges.push({
      label: '推理强度',
      value: effortLabels[reasoning.request.effort] || reasoning.request.effort,
      color: effortColors[reasoning.request.effort] || 'gray'
    })
  }

  // Max Tokens
  if (reasoning.request.maxTokens !== null && reasoning.request.maxTokens !== undefined) {
    badges.push({
      label: 'Token 预算',
      value: `${reasoning.request.maxTokens.toLocaleString()}`,
      color: 'purple'
    })
  }

  // Visibility
  const visibilityLabels: Record<string, string> = {
    visible: '可见',
    hidden: '隐藏',
    off: '关闭'
  }
  if (reasoning.request.visibility && reasoning.request.visibility !== 'visible') {
    badges.push({
      label: '可见性',
      value: visibilityLabels[reasoning.request.visibility] || reasoning.request.visibility,
      color: 'gray'
    })
  }

  return badges
}

/**
 * 捕获 reasoning 数据并保存到分支元数据
 * 
 * @param conversationId - 对话 ID
 * @param branchId - 分支 ID
 * @param reasoning - 推理元数据
 * @returns 是否成功捕获
 */
export const captureReasoningForBranch = (
  conversationId: string,
  branchId: string,
  reasoning: MessageReasoningMetadata | null | undefined
): boolean => {
  if (!reasoning) {
    return false
  }

  const branchStore = useBranchStore()

  let sanitized: MessageReasoningMetadata
  try {
    sanitized = JSON.parse(JSON.stringify(reasoning))
  } catch (error) {
    console.warn('useReasoningDisplay: 无法序列化推理元数据，使用浅拷贝处理', error)
    sanitized = {
      ...reasoning,
      details: reasoning.details ? reasoning.details.map((detail) => ({ ...detail })) : reasoning.details,
      rawDetails: reasoning.rawDetails ? reasoning.rawDetails.map((detail) => ({ ...detail })) : reasoning.rawDetails,
      request: reasoning.request ? { ...reasoning.request } : reasoning.request
    }
  }

  branchStore.patchMetadata(conversationId, branchId, (existing: MessageVersionMetadata | undefined) => ({
    ...(existing ?? {}),
    reasoning: sanitized
  }))

  return true
}

/**
 * useReasoningDisplay Composable
 * 
 * 提供 reasoning 数据处理的完整功能集
 */
export function useReasoningDisplay() {
  return {
    normalizeReasoningDetailType,
    isReasoningTextDetailType,
    getReasoningPrimaryText,
    getReasoningStreamText,
    shouldShowReasoningSummaryText,
    getReasoningSummaryText,
    getReasoningDetailsForDisplay,
    hasReasoningDisplayContent,
    isReasoningEncrypted,
    shouldCollapseReasoningText,
    getReasoningConfigBadges,
    captureReasoningForBranch
  }
}
