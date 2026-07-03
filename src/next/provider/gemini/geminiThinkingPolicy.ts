export type GeminiThinkingLevel = 'minimal' | 'low' | 'medium' | 'high'
export type GeminiThinkingMode = 'auto' | 'budget' | 'level'

export type GeminiThinkingConfig = Readonly<{
  mode: GeminiThinkingMode
  thinkingBudget?: number
  thinkingLevel?: GeminiThinkingLevel
  includeThoughts?: boolean
}>

export type GeminiThinkingCapability =
  | Readonly<{
      kind: 'budget'
      minBudget: number
      maxBudget: number
      defaultBudget: number
      reason: 'gemini_2_5'
    }>
  | Readonly<{
      kind: 'level'
      levels: readonly GeminiThinkingLevel[]
      defaultLevel: GeminiThinkingLevel
      reason: 'gemini_3'
    }>
  | Readonly<{
      kind: 'unsupported'
      reason:
        | 'empty_model'
        | 'denied_model_family'
        | 'unsupported_generation_method'
        | 'unknown_model_family'
    }>

export type GeminiNativeThinkingConfig = Readonly<{
  thinkingBudget?: number
  thinkingLevel?: GeminiThinkingLevel
  includeThoughts?: boolean
}>

export const GEMINI_THINKING_LEVELS: readonly GeminiThinkingLevel[] = ['minimal', 'low', 'medium', 'high']
export const DEFAULT_GEMINI_THINKING_BUDGET = 8192
export const DEFAULT_GEMINI_THINKING_LEVEL: GeminiThinkingLevel = 'low'
export const DEFAULT_GEMINI_THINKING_CONFIG: GeminiThinkingConfig = {
  mode: 'auto',
  thinkingBudget: DEFAULT_GEMINI_THINKING_BUDGET,
  thinkingLevel: DEFAULT_GEMINI_THINKING_LEVEL,
  includeThoughts: false,
}

const GEMINI_2_5_NON_PRO_MAX_BUDGET = 24576
const GEMINI_2_5_PRO_MAX_BUDGET = 32768
const MIN_THINKING_BUDGET = 1

const DENIED_MODEL_PREFIXES = [
  'embedding',
  'text-embedding',
  'aqa',
  'imagen',
  'veo',
  'tts',
  'gemini-1',
] as const

const BUDGET_MODEL_PREFIXES = ['gemini-2.5-'] as const
const LEVEL_MODEL_PREFIXES = ['gemini-3'] as const

function normalizeModelId(raw: unknown): string {
  const value = String(raw ?? '').trim()
  const withoutPrefix = value.startsWith('models/') ? value.slice('models/'.length) : value
  return withoutPrefix.toLowerCase()
}

function supportsGenerateContent(methods?: readonly string[] | null): boolean {
  if (!methods || methods.length === 0) return true
  return methods.includes('generateContent') || methods.includes('streamGenerateContent')
}

function hasPrefix(value: string, prefixes: readonly string[]): boolean {
  return prefixes.some((prefix) => value.startsWith(prefix))
}

function budgetMaxForModel(modelId: string): number {
  return modelId.startsWith('gemini-2.5-pro') ? GEMINI_2_5_PRO_MAX_BUDGET : GEMINI_2_5_NON_PRO_MAX_BUDGET
}

export function resolveGeminiThinkingCapability(input: Readonly<{
  model: string
  supportedGenerationMethods?: readonly string[] | null
}>): GeminiThinkingCapability {
  const modelId = normalizeModelId(input.model)
  if (!modelId) return { kind: 'unsupported', reason: 'empty_model' }
  if (hasPrefix(modelId, DENIED_MODEL_PREFIXES)) {
    return { kind: 'unsupported', reason: 'denied_model_family' }
  }
  if (!supportsGenerateContent(input.supportedGenerationMethods)) {
    return { kind: 'unsupported', reason: 'unsupported_generation_method' }
  }
  if (hasPrefix(modelId, LEVEL_MODEL_PREFIXES)) {
    return {
      kind: 'level',
      levels: GEMINI_THINKING_LEVELS,
      defaultLevel: DEFAULT_GEMINI_THINKING_LEVEL,
      reason: 'gemini_3',
    }
  }
  if (hasPrefix(modelId, BUDGET_MODEL_PREFIXES)) {
    return {
      kind: 'budget',
      minBudget: MIN_THINKING_BUDGET,
      maxBudget: budgetMaxForModel(modelId),
      defaultBudget: DEFAULT_GEMINI_THINKING_BUDGET,
      reason: 'gemini_2_5',
    }
  }
  return { kind: 'unsupported', reason: 'unknown_model_family' }
}

export function isGeminiThinkingLevel(value: unknown): value is GeminiThinkingLevel {
  return typeof value === 'string' && (GEMINI_THINKING_LEVELS as readonly string[]).includes(value)
}

export function clampGeminiThinkingBudget(value: unknown, capability: Extract<GeminiThinkingCapability, { kind: 'budget' }>): number {
  const parsed = typeof value === 'number' ? value : Number(String(value ?? '').trim())
  if (!Number.isFinite(parsed)) return capability.defaultBudget
  const integer = Math.trunc(parsed)
  return Math.min(capability.maxBudget, Math.max(capability.minBudget, integer))
}

export function normalizeGeminiThinkingConfig(input: Readonly<{
  model: string
  config?: GeminiThinkingConfig | null
  supportedGenerationMethods?: readonly string[] | null
}>): GeminiThinkingConfig {
  const current = input.config ?? DEFAULT_GEMINI_THINKING_CONFIG
  const capability = resolveGeminiThinkingCapability({
    model: input.model,
    supportedGenerationMethods: input.supportedGenerationMethods,
  })
  const includeThoughts = current.includeThoughts === true
  if (capability.kind === 'budget') {
    return {
      mode: current.mode === 'budget' ? 'budget' : 'auto',
      thinkingBudget: clampGeminiThinkingBudget(current.thinkingBudget, capability),
      thinkingLevel: DEFAULT_GEMINI_THINKING_LEVEL,
      includeThoughts,
    }
  }
  if (capability.kind === 'level') {
    return {
      mode: current.mode === 'level' ? 'level' : 'auto',
      thinkingBudget: DEFAULT_GEMINI_THINKING_BUDGET,
      thinkingLevel: isGeminiThinkingLevel(current.thinkingLevel) ? current.thinkingLevel : capability.defaultLevel,
      includeThoughts,
    }
  }
  return {
    mode: 'auto',
    thinkingBudget: DEFAULT_GEMINI_THINKING_BUDGET,
    thinkingLevel: DEFAULT_GEMINI_THINKING_LEVEL,
    includeThoughts,
  }
}

export function buildGeminiNativeThinkingConfig(input: Readonly<{
  model: string
  config?: GeminiThinkingConfig | null
  supportedGenerationMethods?: readonly string[] | null
}>): GeminiNativeThinkingConfig | undefined {
  const normalized = normalizeGeminiThinkingConfig(input)
  const capability = resolveGeminiThinkingCapability({
    model: input.model,
    supportedGenerationMethods: input.supportedGenerationMethods,
  })
  if (capability.kind === 'budget' && normalized.mode === 'budget') {
    return {
      thinkingBudget: normalized.thinkingBudget ?? capability.defaultBudget,
      includeThoughts: normalized.includeThoughts === true,
    }
  }
  if (capability.kind === 'level' && normalized.mode === 'level') {
    return {
      thinkingLevel: normalized.thinkingLevel ?? capability.defaultLevel,
      includeThoughts: normalized.includeThoughts === true,
    }
  }
  if (normalized.includeThoughts === true && capability.kind !== 'unsupported') {
    return { includeThoughts: true }
  }
  return undefined
}
