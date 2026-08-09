export type GeminiThinkingLevel = 'minimal' | 'low' | 'medium' | 'high'

export type GeminiThinkingRawType = 'missing' | 'boolean' | 'null' | 'string' | 'number' | 'object' | 'array' | 'undefined'
export type GeminiThinkingSupport = 'supported' | 'unsupported'
export type GeminiThinkingControlKind = 'level' | 'budget' | 'default-only'

type GeminiThinkingRawEvidence = Readonly<{
  thinkingOwnProperty: boolean
  thinkingRawValue: unknown
  thinkingRawType: GeminiThinkingRawType
  modelId: string
  matchedRule: string | null
}>

type GeminiThinkingCapabilityBase = GeminiThinkingRawEvidence & Readonly<{
  thinkingSupported: GeminiThinkingSupport
  allowDynamic: boolean
  allowOff: boolean
}>

export type GeminiThinkingCapability =
  | (GeminiThinkingCapabilityBase & Readonly<{
      thinkingSupported: 'unsupported'
      kind: 'unsupported'
      controlKind: null
      reason: 'empty_model' | 'unsupported_generation_method' | 'thinking_not_true' | 'denied_model_family'
    }>)
  | (GeminiThinkingCapabilityBase & Readonly<{
      thinkingSupported: 'supported'
      kind: 'level'
      controlKind: 'level'
      levels: readonly GeminiThinkingLevel[]
      defaultLevel: GeminiThinkingLevel
      highIsDynamic: true
      reason: 'mapped_level'
    }>)
  | (GeminiThinkingCapabilityBase & Readonly<{
      thinkingSupported: 'supported'
      kind: 'budget'
      controlKind: 'budget'
      minBudget: number
      maxBudget: number
      defaultBudgetMode: 'dynamic' | 'off'
      allowDynamic: true
      allowOff: boolean
      reason: 'mapped_budget'
    }>)
  | (GeminiThinkingCapabilityBase & Readonly<{
      thinkingSupported: 'supported'
      kind: 'default-only'
      controlKind: 'default-only'
      reason: 'supported_unmapped'
    }>)

export const GEMINI_THINKING_LEVELS: readonly GeminiThinkingLevel[] = ['minimal', 'low', 'medium', 'high']

type GeminiLevelRule = Readonly<{
  id: string
  pattern: RegExp
  levels: readonly GeminiThinkingLevel[]
  defaultLevel: GeminiThinkingLevel
}>

type GeminiBudgetRule = Readonly<{
  id: string
  pattern: RegExp
  minBudget: number
  maxBudget: number
  defaultBudgetMode: 'dynamic' | 'off'
  allowOff: boolean
}>

const GEMINI_THINKING_LEVEL_RULES: readonly GeminiLevelRule[] = Object.freeze([
  Object.freeze({ id: 'gemini-3.1-flash-lite-image', pattern: /^gemini-3\.1-flash-lite-image(?:-preview(?:-\d{2}-\d{4})?)?$/u, levels: Object.freeze(['minimal', 'high'] as const), defaultLevel: 'minimal' }),
  Object.freeze({ id: 'gemini-3.6-flash', pattern: /^gemini-3\.6-flash(?:-preview(?:-\d{2}-\d{4})?)?$/u, levels: GEMINI_THINKING_LEVELS, defaultLevel: 'medium' }),
  Object.freeze({ id: 'gemini-3.5-flash', pattern: /^gemini-3\.5-flash(?:-preview(?:-\d{2}-\d{4})?)?$/u, levels: GEMINI_THINKING_LEVELS, defaultLevel: 'medium' }),
  Object.freeze({ id: 'gemini-3.1-pro', pattern: /^gemini-3\.1-pro(?:-preview(?:-\d{2}-\d{4})?)?$/u, levels: Object.freeze(['low', 'medium', 'high'] as const), defaultLevel: 'high' }),
  Object.freeze({ id: 'gemini-3.5-flash-lite', pattern: /^gemini-3\.5-flash-lite(?:-preview(?:-\d{2}-\d{4})?)?$/u, levels: GEMINI_THINKING_LEVELS, defaultLevel: 'minimal' }),
  Object.freeze({ id: 'gemini-3.1-flash-lite', pattern: /^gemini-3\.1-flash-lite(?:-preview(?:-\d{2}-\d{4})?)?$/u, levels: GEMINI_THINKING_LEVELS, defaultLevel: 'minimal' }),
  Object.freeze({ id: 'gemini-3-flash', pattern: /^gemini-3-flash(?:-preview(?:-\d{2}-\d{4})?)?$/u, levels: GEMINI_THINKING_LEVELS, defaultLevel: 'high' }),
])

const GEMINI_THINKING_BUDGET_RULES: readonly GeminiBudgetRule[] = Object.freeze([
  Object.freeze({ id: 'gemini-2.5-pro', pattern: /^gemini-2\.5-pro(?:-preview(?:-\d{2}-\d{4})?)?$/u, minBudget: 128, maxBudget: 32768, defaultBudgetMode: 'dynamic', allowOff: false }),
  Object.freeze({ id: 'gemini-2.5-flash-native-audio', pattern: /^gemini-2\.5-flash-native-audio-preview-(?:09|12)-2025$/u, minBudget: 1, maxBudget: 24576, defaultBudgetMode: 'dynamic', allowOff: true }),
  Object.freeze({ id: 'gemini-2.5-flash', pattern: /^gemini-2\.5-flash(?:-preview(?:-\d{2}-\d{4})?)?$/u, minBudget: 1, maxBudget: 24576, defaultBudgetMode: 'dynamic', allowOff: true }),
  Object.freeze({ id: 'gemini-2.5-flash-lite', pattern: /^gemini-2\.5-flash-lite(?:-preview(?:-\d{2}-\d{4})?)?$/u, minBudget: 512, maxBudget: 24576, defaultBudgetMode: 'off', allowOff: true }),
  Object.freeze({ id: 'gemini-robotics-er-1.6', pattern: /^gemini-robotics-er-1\.6-preview(?:-\d{2}-\d{4})?$/u, minBudget: 1, maxBudget: 24576, defaultBudgetMode: 'dynamic', allowOff: true }),
])

export function normalizeGeminiThinkingModelId(raw: unknown): string {
  const value = String(raw ?? '').trim()
  return value.startsWith('models/') ? value.slice('models/'.length) : value
}

function rawType(value: unknown, ownProperty: boolean): GeminiThinkingRawType {
  if (!ownProperty) return 'missing'
  if (value === undefined) return 'undefined'
  if (value === null) return 'null'
  if (Array.isArray(value)) return 'array'
  if (typeof value === 'object') return 'object'
  if (typeof value === 'boolean') return 'boolean'
  if (typeof value === 'string') return 'string'
  return 'number'
}

function base(input: Readonly<{
  modelId: string
  thinking: unknown
  thinkingOwnProperty: boolean
  matchedRule: string | null
  thinkingSupported: GeminiThinkingSupport
  kind: 'unsupported' | GeminiThinkingControlKind
  controlKind: GeminiThinkingControlKind | null
  reason: GeminiThinkingCapability['reason']
  allowDynamic: boolean
  allowOff: boolean
}>): GeminiThinkingCapabilityBase & Readonly<Record<string, unknown>> {
  return Object.freeze({
    modelId: input.modelId,
    thinkingOwnProperty: input.thinkingOwnProperty,
    thinkingRawValue: input.thinking,
    thinkingRawType: rawType(input.thinking, input.thinkingOwnProperty),
    thinkingSupported: input.thinkingSupported,
    matchedRule: input.matchedRule,
    kind: input.kind,
    controlKind: input.controlKind,
    reason: input.reason,
    allowDynamic: input.allowDynamic,
    allowOff: input.allowOff,
  })
}

export function resolveGeminiThinkingCapability(input: Readonly<{
  model: string
  thinking?: unknown
  thinkingOwnProperty?: boolean
  supportedGenerationMethods?: readonly string[] | null
}>): GeminiThinkingCapability {
  const modelId = normalizeGeminiThinkingModelId(input.model)
  const thinkingOwnProperty = input.thinkingOwnProperty ?? Object.prototype.hasOwnProperty.call(input, 'thinking')
  if (!modelId) return base({ modelId, thinking: input.thinking, thinkingOwnProperty, matchedRule: null,
    thinkingSupported: 'unsupported', kind: 'unsupported', controlKind: null, reason: 'empty_model', allowDynamic: false, allowOff: false }) as GeminiThinkingCapability
  if (!input.supportedGenerationMethods?.includes('generateContent')) {
    return base({ modelId, thinking: input.thinking, thinkingOwnProperty, matchedRule: null,
      thinkingSupported: 'unsupported', kind: 'unsupported', controlKind: null, reason: 'unsupported_generation_method', allowDynamic: false, allowOff: false }) as GeminiThinkingCapability
  }
  if (input.thinking !== true) {
    return base({ modelId, thinking: input.thinking, thinkingOwnProperty, matchedRule: null,
      thinkingSupported: 'unsupported', kind: 'unsupported', controlKind: null, reason: 'thinking_not_true', allowDynamic: false, allowOff: false }) as GeminiThinkingCapability
  }

  const level = GEMINI_THINKING_LEVEL_RULES.find((rule) => rule.pattern.test(modelId))
  if (level) return Object.freeze({ ...base({ modelId, thinking: input.thinking, thinkingOwnProperty, matchedRule: level.id,
    thinkingSupported: 'supported', kind: 'level', controlKind: 'level', reason: 'mapped_level', allowDynamic: false, allowOff: false }),
    levels: level.levels, defaultLevel: level.defaultLevel, highIsDynamic: true }) as GeminiThinkingCapability
  const budget = GEMINI_THINKING_BUDGET_RULES.find((rule) => rule.pattern.test(modelId))
  if (budget) return Object.freeze({ ...base({ modelId, thinking: input.thinking, thinkingOwnProperty, matchedRule: budget.id,
    thinkingSupported: 'supported', kind: 'budget', controlKind: 'budget', reason: 'mapped_budget', allowDynamic: true, allowOff: budget.allowOff }),
    minBudget: budget.minBudget, maxBudget: budget.maxBudget, defaultBudgetMode: budget.defaultBudgetMode }) as GeminiThinkingCapability
  return Object.freeze({ ...base({ modelId, thinking: input.thinking, thinkingOwnProperty, matchedRule: null,
    thinkingSupported: 'supported', kind: 'default-only', controlKind: 'default-only', reason: 'supported_unmapped', allowDynamic: false, allowOff: false }) }) as GeminiThinkingCapability
}

export function isGeminiThinkingLevel(value: unknown): value is GeminiThinkingLevel {
  return typeof value === 'string' && (GEMINI_THINKING_LEVELS as readonly string[]).includes(value)
}

export function isGeminiThinkingBudgetValid(capability: GeminiThinkingCapability, value: unknown): value is number {
  if (capability.kind !== 'budget' || typeof value !== 'number' || !Number.isSafeInteger(value)) return false
  if (value === -1) return capability.allowDynamic
  if (value === 0) return capability.allowOff
  return value >= capability.minBudget && value <= capability.maxBudget
}
