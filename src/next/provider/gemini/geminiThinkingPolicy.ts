export type GeminiThinkingLevel = 'minimal' | 'low' | 'medium' | 'high'

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

export const GEMINI_THINKING_LEVELS: readonly GeminiThinkingLevel[] = ['minimal', 'low', 'medium', 'high']
export const DEFAULT_GEMINI_THINKING_BUDGET = 8192
export const DEFAULT_GEMINI_THINKING_LEVEL: GeminiThinkingLevel = 'low'

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
