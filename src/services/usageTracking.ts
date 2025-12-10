import type { UsageLogPayload } from './db/types'
import type { UsageMetrics } from '../types/chat'
import type { ProviderId } from '../constants/providers'

export type NormalizedUsage = UsageMetrics

export type UsageLogBuildOptions = {
  provider: ProviderId
  model: string
  projectId?: string | null
  convoId?: string | null
  startedAt: number
  endedAt: number
  firstTokenAt?: number | null
  status: 'success' | 'error' | 'canceled'
  errorCode?: string | null
  usage?: NormalizedUsage | null
  rawUsage?: Record<string, any> | null
  requestId?: string | null
  attempt?: number
  meta?: Record<string, any> | null
  reconciliation?: {
    status: 'fetched' | 'failed'
    source?: 'generation'
    error?: string
  }
  aborted?: boolean
}

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
 * Normalize usage payloads from OpenRouter / OpenAI compatible responses.
 */
export const normalizeUsagePayload = (payload: any): NormalizedUsage | null => {
  if (!payload || typeof payload !== 'object') {
    return null
  }

  const usage: NormalizedUsage = {
    promptTokens: coerceNumber(payload.prompt_tokens ?? payload.promptTokens ?? payload.input_tokens),
    completionTokens: coerceNumber(payload.completion_tokens ?? payload.completionTokens ?? payload.output_tokens),
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

const safeDiff = (end: number, start: number): number => {
  const delta = end - start
  return delta >= 0 ? delta : 0
}

/**
 * Build a UsageLogPayload ready for persistence.
 */
export const buildUsageLogPayload = (options: UsageLogBuildOptions): UsageLogPayload => {
  const {
    provider,
    model,
    projectId = null,
    convoId = null,
    startedAt,
    endedAt,
    firstTokenAt,
    status,
    errorCode,
    usage,
    rawUsage,
    requestId,
    attempt,
    meta,
    reconciliation,
    aborted
  } = options

  const tokensInput = usage?.promptTokens ?? 0
  const tokensOutput = usage?.completionTokens ?? 0
  const tokensCached = usage?.cachedTokens ?? 0
  const tokensReasoning = usage?.reasoningTokens ?? 0
  const cost = usage?.cost ?? 0

  const payload: UsageLogPayload = {
    project_id: projectId ?? null,
    convo_id: convoId ?? null,
    provider,
    model,
    tokens_input: tokensInput,
    tokens_output: tokensOutput,
    tokens_cached: tokensCached,
    tokens_reasoning: tokensReasoning,
    cost,
    request_id: requestId ?? null,
    attempt: attempt ?? 1,
    duration_ms: safeDiff(endedAt, startedAt),
    ttft_ms: firstTokenAt ? safeDiff(firstTokenAt, startedAt) : null,
    timestamp: startedAt,
    status,
    error_code: errorCode ?? null,
    meta: null
  }

  const metaPayload: Record<string, any> = { ...(meta ?? {}) }
  if (!usage) {
    metaPayload.usage_missing = true
  }
  if (rawUsage) {
    metaPayload.usage_raw = rawUsage
  }
  if (requestId) {
    metaPayload.request_id = requestId
  }
  if (attempt !== undefined) {
    metaPayload.attempt = attempt
  }
  if (reconciliation) {
    metaPayload.usage_reconciliation = reconciliation
  }
  if (aborted !== undefined) {
    metaPayload.aborted = aborted
  }

  if (Object.keys(metaPayload).length > 0) {
    payload.meta = metaPayload
  }

  return payload
}
