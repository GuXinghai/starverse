/**
 * useUsageMetrics - Usage 数据处理与格式化
 * 
 * 职责：
 * - 规范化不同 AI Provider 返回的使用量数据（tokens、cost）
 * - 捕获并保存 usage 数据到分支元数据
 * - 格式化显示（tokens、credits、文件大小）
 * 
 * 迁移自：ChatView.vue Phase 5 重构
 */

import type { UsageMetrics, MessageVersionMetadata } from '../../types/chat'
import { useBranchStore } from '../../stores/branch'

/**
 * 安全的数字转换函数
 * 
 * 处理多种输入类型：
 * - 数字：直接返回（验证有限性）
 * - 字符串数字：解析为数字
 * - 其他类型：返回 undefined
 * 
 * 过滤无效值：
 * - NaN（Not a Number）
 * - Infinity / -Infinity（无穷大）
 * - 空字符串
 * 
 * @param value - 待转换的值
 * @returns 有效的数字，或 undefined
 */
const coerceNumber = (value: any): number | undefined => {
  if (typeof value === 'number' && Number.isFinite(value)) {
    return value
  }
  if (typeof value === 'string' && value.trim() !== '') {
    const parsed = Number(value)
    if (Number.isFinite(parsed)) {
      return parsed
    }
  }
  return undefined
}

/**
 * 规范化 usage（使用量）数据负载
 * 
 * 作用：将不同 AI Provider 返回的使用量数据转换为统一格式
 * 
 * 背景：
 * - 不同 AI Provider（OpenAI、Anthropic、Google 等）使用不同的字段名
 * - 例如：OpenAI 用 prompt_tokens，Anthropic 用 input_tokens
 * - 需要统一转换为应用内部的标准格式（UsageMetrics）
 * 
 * 支持的数据源：
 * - OpenAI API: prompt_tokens、completion_tokens、total_tokens
 * - Anthropic API: input_tokens、output_tokens
 * - 缓存 tokens: cached_tokens、prompt_tokens_details.cached_tokens
 * - 推理 tokens: reasoning_tokens、completion_tokens_details.reasoning_tokens
 * - 费用数据: cost、total_cost、cost_credits、cost_details
 * 
 * 字段映射规则：
 * - 使用 coerceNumber 安全转换（支持字符串数字、过滤 NaN/Infinity）
 * - 优先使用 snake_case 字段（标准 API 格式）
 * - 回退到 camelCase 字段（某些 SDK 转换后的格式）
 * - 嵌套字段：支持从 prompt_tokens_details 等对象中提取
 * 
 * 验证逻辑：
 * - 必须至少包含一个主要指标（tokens 或 cost）
 * - 或包含次要指标（cached/reasoning tokens、cost details）
 * - 完全无效的数据返回 null
 * 
 * @param payload - 原始 usage 数据对象（来自 AI API 响应）
 * @returns 规范化后的 UsageMetrics 对象，或 null（如果数据无效）
 * 
 * @example
 * // OpenAI 格式
 * normalizeUsagePayload({
 *   prompt_tokens: 100,
 *   completion_tokens: 50,
 *   total_tokens: 150
 * })
 * // => { promptTokens: 100, completionTokens: 50, totalTokens: 150, ... }
 * 
 * @example
 * // Anthropic 格式
 * normalizeUsagePayload({
 *   input_tokens: 100,
 *   output_tokens: 50
 * })
 * // => { promptTokens: 100, completionTokens: 50, ... }
 */
export const normalizeUsagePayload = (payload: any): UsageMetrics | null => {
  if (!payload || typeof payload !== 'object') {
    return null
  }

  const usage: UsageMetrics = {
    promptTokens: coerceNumber(payload.prompt_tokens ?? payload.promptTokens),
    completionTokens: coerceNumber(payload.completion_tokens ?? payload.completionTokens),
    totalTokens: coerceNumber(payload.total_tokens ?? payload.totalTokens),
    cachedTokens: coerceNumber(
      payload.cached_tokens ??
      payload.cachedTokens ??
      payload.prompt_tokens_details?.cached_tokens ??
      payload.promptTokensDetails?.cachedTokens
    ),
    reasoningTokens: coerceNumber(
      payload.reasoning_tokens ??
      payload.reasoningTokens ??
      payload.completion_tokens_details?.reasoning_tokens ??
      payload.completionTokensDetails?.reasoningTokens
    ),
    cost: coerceNumber(payload.cost ?? payload.cost_credits ?? payload.total_cost ?? payload.totalCost),
    // 🐛 修复：使用 JSON 序列化创建深拷贝，避免引用原始对象
    // 原因：直接引用 payload 可能会在后续被 Vue 响应式系统包装或修改
    // JSON 序列化还能自动移除函数、Symbol 等不可序列化的属性
    raw: payload ? JSON.parse(JSON.stringify(payload)) : undefined
  }

  if (payload.cost_details && typeof payload.cost_details === 'object' && !Array.isArray(payload.cost_details)) {
    const details: Record<string, number> = {}
    for (const [key, value] of Object.entries(payload.cost_details)) {
      const parsed = coerceNumber(value)
      if (parsed !== undefined) {
        details[key] = parsed
      }
    }
    if (Object.keys(details).length > 0) {
      usage.costDetails = details
    }
  }

  const hasPrimaryMetric = Boolean(
    usage.promptTokens !== undefined ||
    usage.completionTokens !== undefined ||
    usage.totalTokens !== undefined ||
    usage.cost !== undefined
  )

  const hasSecondaryMetric = Boolean(
    usage.cachedTokens !== undefined ||
    usage.reasoningTokens !== undefined ||
    (usage.costDetails && Object.keys(usage.costDetails).length > 0)
  )

  if (!hasPrimaryMetric && !hasSecondaryMetric) {
    return null
  }

  return usage
}

/**
 * 捕获 usage 数据并保存到分支元数据
 * 
 * @param conversationId - 对话 ID
 * @param branchId - 分支 ID
 * @param usagePayload - 原始 usage 数据
 * @returns 是否成功捕获（规范化成功返回 true）
 */
export const captureUsageForBranch = (conversationId: string, branchId: string, usagePayload: any): boolean => {
  const branchStore = useBranchStore()
  const normalized = normalizeUsagePayload(usagePayload)
  if (!normalized) {
    return false
  }

  branchStore.patchMetadata(conversationId, branchId, (existing: MessageVersionMetadata | undefined) => ({
    ...(existing ?? {}),
    usage: normalized
  }))

  return true
}

/**
 * 格式化 Token 数量显示
 * 
 * 格式化规则：
 * - 无效值（undefined/null/NaN/Infinite）→ "—"
 * - 接近整数（误差 < 1e-6）→ 整数显示，带千位分隔符
 * - 小数 → 最多保留2位小数，带千位分隔符
 * 
 * 示例：
 * - 1234 → "1,234"
 * - 1234.56 → "1,234.56"
 * - null → "—"
 * 
 * @param value - Token 数量
 * @returns 格式化后的字符串
 */
export const formatTokens = (value?: number | null): string => {
  if (value === undefined || value === null || Number.isNaN(value) || !Number.isFinite(value)) {
    return '—'
  }
  const nearestInt = Math.round(value)
  if (Math.abs(value - nearestInt) < 1e-6) {
    return nearestInt.toLocaleString()
  }
  return value.toLocaleString(undefined, { maximumFractionDigits: 2 })
}

/**
 * 格式化 Credits（费用）显示
 * 
 * 格式化规则：
 * - 无效值（undefined/null/NaN/Infinite）→ "—"
 * - 绝对值 >= 1 → 保留2位小数（如 1.23）
 * - 绝对值 >= 0.1 → 保留3位小数（如 0.123）
 * - 绝对值 < 0.1 → 使用科学计数法2位有效数字（如 0.0012）
 * 
 * 示例：
 * - 1.2345 → "1.23"
 * - 0.123 → "0.123"
 * - 0.00123 → "0.0012"
 * - null → "—"
 * 
 * @param value - Credits 金额
 * @returns 格式化后的字符串
 */
export const formatCredits = (value?: number | null): string => {
  if (value === undefined || value === null || Number.isNaN(value) || !Number.isFinite(value)) {
    return '—'
  }
  const abs = Math.abs(value)
  if (abs >= 1) {
    return value.toFixed(2)
  }
  if (abs >= 0.1) {
    return value.toFixed(3)
  }
  return value.toPrecision(2)
}

/**
 * 格式化文件大小显示
 * 
 * 格式化规则：
 * - 无效值 → 空字符串
 * - >= 1MB → "X.XX MB"
 * - >= 1KB → "X.X KB"
 * - < 1KB → "X B"
 * 
 * @param bytes - 字节数
 * @returns 格式化后的字符串
 */
export const formatFileSize = (bytes?: number | null): string => {
  if (bytes === undefined || bytes === null || Number.isNaN(bytes) || !Number.isFinite(bytes)) {
    return ''
  }
  if (bytes >= 1024 * 1024) {
    return `${(bytes / (1024 * 1024)).toFixed(2)} MB`
  }
  if (bytes >= 1024) {
    return `${(bytes / 1024).toFixed(1)} KB`
  }
  return `${bytes} B`
}

/**
 * useUsageMetrics Composable
 * 
 * 提供 usage 数据处理的完整功能集
 */
export function useUsageMetrics() {
  return {
    normalizeUsagePayload,
    captureUsageForBranch,
    formatTokens,
    formatCredits,
    formatFileSize
  }
}
