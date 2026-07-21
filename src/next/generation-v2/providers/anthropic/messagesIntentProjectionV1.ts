import type {
  ImageGenerationIntentV2,
  SamplingIntentV2,
} from '../../domain/generationIntentV2'
import {
  decodeResolvedGenerationIntentV2,
  type ResolvedGenerationIntentV2,
} from '../../domain/resolvedGenerationIntentV2'
import { resolveAnthropicModelThinkingRuleV1 } from './modelThinkingRulesV1'
import {
  projectAnthropicThinkingDisplayIntentV1,
  type AnthropicThinkingDisplayIntentProjectionIssueV1,
} from './thinkingDisplayIntentProjectionV1'

export type AnthropicMessagesIntentProjectionIssueV1 = Readonly<{
  semanticPath: string
  code:
    | AnthropicThinkingDisplayIntentProjectionIssueV1['code']
    | 'ANTHROPIC_MAX_OUTPUT_TOKENS_REQUIRED'
    | 'ANTHROPIC_MANUAL_THINKING_BUDGET_BELOW_MINIMUM'
    | 'ANTHROPIC_MANUAL_THINKING_BUDGET_NOT_BELOW_MAX_TOKENS'
    | 'ANTHROPIC_EXPLICIT_SAMPLING_REJECTED_BY_MODEL'
    | 'ANTHROPIC_EFFORT_UNSUPPORTED_BY_MODEL'
    | 'ANTHROPIC_UNSUPPORTED_EXPLICIT_FIELD'
    | 'ANTHROPIC_FIELD_VALUE_UNSUPPORTED'
  wireKey?: string
}>

export type AnthropicMessagesIntentDispositionV1 = Readonly<{
  semanticPath: string
  outcome: 'encoded' | 'accepted_no_wire' | 'rejected'
  wireKey?: string
  value?: unknown
  code?: AnthropicMessagesIntentProjectionIssueV1['code']
  evidence: string
}>

export type AnthropicMessagesRequestIntentV1 = Readonly<{
  maxTokens?: number
  temperature?: number
  topP?: number
  topK?: number
  stopSequences?: readonly string[]
  thinking?: Readonly<{
    type: 'disabled' | 'enabled' | 'adaptive'
    budgetTokens?: number
    display?: 'summarized' | 'omitted'
  }>
  effort?: 'low' | 'medium' | 'high' | 'xhigh' | 'max'
}>

export type AnthropicMessagesIntentProjectionV1 = Readonly<{
  classification: 'anthropic_messages_intent_projection_non_executable'
  executionAuthority: 'none'
  intent: ResolvedGenerationIntentV2
  modelId: string
  request: AnthropicMessagesRequestIntentV1
  dispositions: readonly AnthropicMessagesIntentDispositionV1[]
  issues: readonly AnthropicMessagesIntentProjectionIssueV1[]
}>

const CONTRACT = 'anthropic-standard-messages-contract-verified-2026-07-18'
const MODEL_RULE = 'anthropic-exact-model-thinking-rule-v1-2026-07-18'
const STARVERSE = 'starverse-generation-v2-authority-boundary-2026-07-18'
const SAMPLING_KEYS = Object.freeze([
  'maxOutputTokens', 'temperature', 'topP', 'topK', 'seed', 'stop', 'candidateCount',
  'frequencyPenalty', 'presencePenalty', 'repetitionPenalty',
] as const satisfies readonly (keyof SamplingIntentV2)[])
const IMAGE_KEYS = Object.freeze([
  'mode', 'aspectRatio', 'resolution', 'size', 'quality', 'format', 'background', 'outputCompression', 'stream',
] as const satisfies readonly (keyof Extract<ImageGenerationIntentV2, { mode: 'generate' }>)[])
const samplingKeysAreExhaustive: Exclude<keyof SamplingIntentV2, typeof SAMPLING_KEYS[number]> extends never ? true : never = true
const imageKeysAreExhaustive: Exclude<keyof Extract<ImageGenerationIntentV2, { mode: 'generate' }>, typeof IMAGE_KEYS[number]> extends never ? true : never = true
void samplingKeysAreExhaustive
void imageKeysAreExhaustive

function compare(left: string, right: string): number {
  const a = Array.from(left)
  const b = Array.from(right)
  for (let index = 0; index < Math.min(a.length, b.length); index += 1) {
    const difference = (a[index].codePointAt(0) ?? 0) - (b[index].codePointAt(0) ?? 0)
    if (difference !== 0) return difference
  }
  return a.length - b.length
}

export function projectAnthropicMessagesIntentV1(
  rawIntent: unknown,
  modelId: string,
): AnthropicMessagesIntentProjectionV1 {
  const intent = decodeResolvedGenerationIntentV2(rawIntent).value
  const rule = resolveAnthropicModelThinkingRuleV1(modelId)
  const request: {
    maxTokens?: number
    temperature?: number
    topP?: number
    topK?: number
    stopSequences?: readonly string[]
    thinking?: AnthropicMessagesRequestIntentV1['thinking']
    effort?: AnthropicMessagesRequestIntentV1['effort']
  } = {}
  const dispositions: AnthropicMessagesIntentDispositionV1[] = []
  const issues: AnthropicMessagesIntentProjectionIssueV1[] = []
  const encoded = (semanticPath: string, wireKey: string, value?: AnthropicMessagesIntentDispositionV1['value'], evidence = CONTRACT) => {
    dispositions.push(Object.freeze({ semanticPath, outcome: 'encoded' as const, wireKey, ...(value === undefined ? {} : { value }), evidence }))
  }
  const accepted = (semanticPath: string, evidence = STARVERSE) => {
    dispositions.push(Object.freeze({ semanticPath, outcome: 'accepted_no_wire' as const, evidence }))
  }
  const rejected = (semanticPath: string, code: AnthropicMessagesIntentProjectionIssueV1['code'], wireKey?: string, evidence = CONTRACT) => {
    issues.push(Object.freeze({ semanticPath, code, ...(wireKey === undefined ? {} : { wireKey }) }))
    dispositions.push(Object.freeze({ semanticPath, outcome: 'rejected' as const, ...(wireKey === undefined ? {} : { wireKey }), code, evidence }))
  }

  if (rule) encoded('modelId', 'model', modelId, MODEL_RULE)

  for (const key of SAMPLING_KEYS) {
    const value = intent.generation[key]
    const path = `generation.${key}`
    if (key === 'maxOutputTokens') {
      if (value === undefined) rejected(path, 'ANTHROPIC_MAX_OUTPUT_TOKENS_REQUIRED', 'max_tokens')
      else { request.maxTokens = value as number; encoded(path, 'max_tokens', value as number) }
    } else if (value === undefined) {
      continue
    } else if (key === 'temperature' || key === 'topP' || key === 'topK') {
      const wireKey = key === 'topP' ? 'top_p' : key === 'topK' ? 'top_k' : 'temperature'
      if (!rule) rejected(path, 'ANTHROPIC_MODEL_RULE_UNAVAILABLE', wireKey, MODEL_RULE)
      else if (rule.rejectsExplicitSampling) rejected(path, 'ANTHROPIC_EXPLICIT_SAMPLING_REJECTED_BY_MODEL', wireKey, MODEL_RULE)
      else if ((key === 'temperature' && (value as number) > 1) || (key === 'topK' && !Number.isSafeInteger(value))) {
        rejected(path, 'ANTHROPIC_FIELD_VALUE_UNSUPPORTED', wireKey)
      } else {
        if (key === 'temperature') request.temperature = value as number
        else if (key === 'topP') request.topP = value as number
        else request.topK = value as number
        encoded(path, wireKey, value as number)
      }
    } else if (key === 'stop') {
      const stops = value as readonly string[]
      if (stops.length > 4) rejected(path, 'ANTHROPIC_FIELD_VALUE_UNSUPPORTED', 'stop_sequences')
      else {
        request.stopSequences = Object.freeze([...stops])
        encoded(path, 'stop_sequences', request.stopSequences)
      }
    } else {
      rejected(path, 'ANTHROPIC_UNSUPPORTED_EXPLICIT_FIELD')
    }
  }

  const thinkingProjection = projectAnthropicThinkingDisplayIntentV1(intent, modelId)
  for (const entry of thinkingProjection.dispositions) {
    if (dispositions.some((candidate) => candidate.semanticPath === entry.semanticPath)) continue
    dispositions.push(Object.freeze({ ...entry, evidence: MODEL_RULE }))
  }
  for (const issue of thinkingProjection.issues) {
    if (!issues.some((candidate) => candidate.semanticPath === issue.semanticPath && candidate.code === issue.code)) {
      issues.push(Object.freeze(issue))
    }
  }
  if (!dispositions.some((entry) => entry.semanticPath === 'reasoning.mode')) {
    if (thinkingProjection.issues.some((issue) => issue.semanticPath === 'modelId')) {
      rejected('reasoning.mode', 'ANTHROPIC_MODEL_RULE_UNAVAILABLE', 'thinking.type', MODEL_RULE)
    } else if (intent.reasoning.mode === 'enabled') {
      accepted('reasoning.mode', MODEL_RULE)
    } else {
      encoded('reasoning.mode', 'thinking.type', 'disabled', MODEL_RULE)
    }
  }
  if (thinkingProjection.thinking) request.thinking = thinkingProjection.thinking

  if (intent.reasoning.mode === 'enabled') {
    if (intent.reasoning.effort !== undefined) {
      if (!rule || intent.reasoning.effort === 'minimal' || !rule.supportedEfforts.includes(intent.reasoning.effort)) {
        rejected('reasoning.effort', 'ANTHROPIC_EFFORT_UNSUPPORTED_BY_MODEL', 'output_config.effort', MODEL_RULE)
      } else {
        request.effort = intent.reasoning.effort
        encoded('reasoning.effort', 'output_config.effort', request.effort, MODEL_RULE)
      }
    }
    if (intent.reasoning.summary !== undefined) {
      rejected('reasoning.summary', 'ANTHROPIC_UNSUPPORTED_EXPLICIT_FIELD')
    }
    if (intent.reasoning.exclude !== undefined) {
      rejected('reasoning.exclude', 'ANTHROPIC_UNSUPPORTED_EXPLICIT_FIELD')
    }
  }
  if (request.thinking?.type === 'enabled' && request.thinking.budgetTokens !== undefined &&
      request.thinking.budgetTokens < 1_024) {
    const path = 'providerExtension.manualThinkingBudgetTokens'
    const existing = dispositions.findIndex((entry) => entry.semanticPath === path)
    if (existing >= 0) dispositions.splice(existing, 1)
    rejected(path, 'ANTHROPIC_MANUAL_THINKING_BUDGET_BELOW_MINIMUM', 'thinking.budget_tokens')
    delete request.thinking
  } else if (request.thinking?.type === 'enabled' && request.thinking.budgetTokens !== undefined &&
      request.maxTokens !== undefined && request.thinking.budgetTokens >= request.maxTokens) {
    const path = 'providerExtension.manualThinkingBudgetTokens'
    const existing = dispositions.findIndex((entry) => entry.semanticPath === path)
    if (existing >= 0) dispositions.splice(existing, 1)
    rejected(path, 'ANTHROPIC_MANUAL_THINKING_BUDGET_NOT_BELOW_MAX_TOKENS', 'thinking.budget_tokens')
    delete request.thinking
  }

  if (intent.web.mode === 'disabled') accepted('web.mode')
  else {
    rejected('web.mode', 'ANTHROPIC_UNSUPPORTED_EXPLICIT_FIELD')
    rejected('web.types', 'ANTHROPIC_UNSUPPORTED_EXPLICIT_FIELD')
  }
  if (intent.image.mode === 'disabled') accepted('image.mode')
  else {
    for (const key of IMAGE_KEYS) {
      if (key === 'mode' || intent.image[key] !== undefined) rejected(`image.${key}`, 'ANTHROPIC_UNSUPPORTED_EXPLICIT_FIELD')
    }
  }
  if (intent.tools.mode === 'disabled') accepted('tools.mode')
  else {
    // Definitions are deliberately resolved from the persisted registry by the
    // prepared-request compiler.  This projection records the exact wire
    // fields; it must never pretend an enabled tool intent is no-wire.
    encoded('tools.mode', 'tools', true)
    encoded('tools.allowedToolIds', 'tools', intent.tools.allowedToolIds.map((toolId) => toolId.value))
    encoded('tools.toolChoice', 'tool_choice', intent.tools.toolChoice.mode === 'named'
      ? Object.freeze({ mode: 'named' as const, toolId: intent.tools.toolChoice.toolId.value })
      : Object.freeze({ mode: intent.tools.toolChoice.mode }))
    accepted('tools.sideEffectConfirmation')
  }
  for (const [index, attachment] of intent.attachments.entries()) {
    const base = `attachments[${index}]`
    accepted(`${base}.assetId`)
    accepted(`${base}.assetRevisionId`)
    accepted(`${base}.assetSha256`)
    if (attachment.include) {
      rejected(`${base}.include`, 'ANTHROPIC_UNSUPPORTED_EXPLICIT_FIELD')
      rejected(`${base}.sendAs`, 'ANTHROPIC_UNSUPPORTED_EXPLICIT_FIELD')
      rejected(`${base}.conversion`, 'ANTHROPIC_UNSUPPORTED_EXPLICIT_FIELD')
    } else {
      accepted(`${base}.include`)
      accepted(`${base}.sendAs`)
      accepted(`${base}.conversion`)
    }
  }

  dispositions.sort((a, b) => compare(a.semanticPath, b.semanticPath))
  issues.sort((a, b) => compare(`${a.semanticPath}\0${a.code}`, `${b.semanticPath}\0${b.code}`))
  if (new Set(dispositions.map((entry) => entry.semanticPath)).size !== dispositions.length) {
    throw new Error('GENERATION_V2_ANTHROPIC_MESSAGES_DUPLICATE_SEMANTIC_PATH')
  }
  return Object.freeze({
    classification: 'anthropic_messages_intent_projection_non_executable',
    executionAuthority: 'none',
    intent,
    modelId,
    request: Object.freeze(request),
    dispositions: Object.freeze(dispositions),
    issues: Object.freeze(issues),
  })
}
