export type OpenAIResponsesReasoningEffort =
  | 'none'
  | 'minimal'
  | 'low'
  | 'medium'
  | 'high'
  | 'xhigh'
  | 'max'

export type OpenAIResponsesReasoningEffortSetting = 'auto' | OpenAIResponsesReasoningEffort
export type OpenAIResponsesReasoningSummarySetting = 'off' | 'auto' | 'concise' | 'detailed'

export const OPENAI_RESPONSES_REASONING_SUMMARY_OPTIONS: readonly OpenAIResponsesReasoningSummarySetting[] = [
  'off',
  'auto',
  'concise',
  'detailed',
]

export type OpenAIResponsesReasoningSpec = Readonly<{
  efforts: readonly OpenAIResponsesReasoningEffort[]
  providerAutoHint?: OpenAIResponsesReasoningEffort
  providerAutoHintDocumented: boolean
}>

type ReasoningRule = Readonly<{
  modelIdPattern: string
  regex: RegExp
  spec: OpenAIResponsesReasoningSpec
}>

function rule(modelIdPattern: string, spec: OpenAIResponsesReasoningSpec): ReasoningRule {
  return {
    modelIdPattern,
    regex: new RegExp(modelIdPattern, 'i'),
    spec,
  }
}

export const OPENAI_RESPONSES_REASONING_RULES: readonly ReasoningRule[] = [
  rule('^gpt-5\\.5-pro(?:-|$)', {
    efforts: ['medium', 'high', 'xhigh'],
    providerAutoHint: 'high',
    providerAutoHintDocumented: true,
  }),
  rule('^gpt-5\\.5(?!(?:-pro))(?:-|$)', {
    efforts: ['none', 'low', 'medium', 'high', 'xhigh'],
    providerAutoHint: 'medium',
    providerAutoHintDocumented: true,
  }),
  rule('^gpt-5\\.4-pro(?:-|$)', {
    efforts: ['medium', 'high', 'xhigh'],
    providerAutoHint: 'medium',
    providerAutoHintDocumented: true,
  }),
  rule('^gpt-5\\.4(?!(?:-pro))(?:-|$)', {
    efforts: ['none', 'low', 'medium', 'high', 'xhigh'],
    providerAutoHint: 'none',
    providerAutoHintDocumented: true,
  }),
  rule('^gpt-5\\.3-codex(?:-|$)', {
    efforts: ['low', 'medium', 'high', 'xhigh'],
    providerAutoHintDocumented: false,
  }),
  rule('^gpt-5\\.2-pro(?:-|$)', {
    efforts: ['medium', 'high', 'xhigh'],
    providerAutoHintDocumented: false,
  }),
  rule('^gpt-5\\.2-codex(?:-|$)', {
    efforts: ['low', 'medium', 'high', 'xhigh'],
    providerAutoHintDocumented: false,
  }),
  rule('^gpt-5\\.2(?!(?:-pro|-codex))(?:-|$)', {
    efforts: ['none', 'low', 'medium', 'high', 'xhigh'],
    providerAutoHint: 'none',
    providerAutoHintDocumented: true,
  }),
  rule('^gpt-5\\.1(?!(?:-codex))(?:-|$)', {
    efforts: ['none', 'low', 'medium', 'high'],
    providerAutoHint: 'none',
    providerAutoHintDocumented: true,
  }),
  rule('^gpt-5-pro(?:-|$)', {
    efforts: ['high'],
    providerAutoHint: 'high',
    providerAutoHintDocumented: true,
  }),
  rule('^gpt-5(?!-pro)(?:-|$)', {
    efforts: ['minimal', 'low', 'medium', 'high'],
    providerAutoHintDocumented: false,
  }),
  rule('^o\\d(?:-|$)', {
    efforts: ['low', 'medium', 'high'],
    providerAutoHintDocumented: false,
  }),
]

export const OPENAI_RESPONSES_NON_REASONING_MODEL_ID_PATTERNS: readonly string[] = [
  '^gpt-4\\.1(?:-|$)',
  '^gpt-image(?:-|$)',
  '^dall-e(?:-|$)',
  '^text-embedding(?:-|$)',
  '^text-moderation(?:-|$)',
  '^omni-moderation(?:-|$)',
  '^tts(?:-|$)',
  '^whisper(?:-|$)',
  '^babbage(?:-|$)',
  '^davinci(?:-|$)',
]
const OPENAI_RESPONSES_NON_REASONING_MODEL_PATTERNS = OPENAI_RESPONSES_NON_REASONING_MODEL_ID_PATTERNS
  .map((pattern) => new RegExp(pattern))

export function normalizeOpenAIResponsesReasoningModelId(modelId: string | null | undefined): string {
  return String(modelId ?? '')
    .trim()
    .replace(/^models\//i, '')
}

export function getOpenAIResponsesReasoningSpec(modelId: string | null | undefined): OpenAIResponsesReasoningSpec | null {
  const normalized = normalizeOpenAIResponsesReasoningModelId(modelId)
  if (!normalized) return null
  return OPENAI_RESPONSES_REASONING_RULES.find((entry) => entry.regex.test(normalized))?.spec ?? null
}

export function supportsOpenAIResponsesReasoningEffort(
  modelId: string | null | undefined,
  effort: OpenAIResponsesReasoningEffortSetting,
): boolean {
  if (effort === 'auto') return true
  const spec = getOpenAIResponsesReasoningSpec(modelId)
  if (spec) return spec.efforts.includes(effort)
  return effort === 'max' && !isKnownOpenAIResponsesNonReasoningModel(modelId)
}

export function isKnownOpenAIResponsesNonReasoningModel(modelId: string | null | undefined): boolean {
  const normalized = normalizeOpenAIResponsesReasoningModelId(modelId)
  return OPENAI_RESPONSES_NON_REASONING_MODEL_PATTERNS.some((pattern) => pattern.test(normalized))
}

export function formatOpenAIResponsesAutoReasoningLabel(
  modelId: string | null | undefined,
  fallback = 'Auto',
): string {
  const spec = getOpenAIResponsesReasoningSpec(modelId)
  if (!spec?.providerAutoHintDocumented || !spec.providerAutoHint) return fallback
  return `${fallback} (${spec.providerAutoHint})`
}

export function getOpenAIResponsesReasoningEffortOptions(
  modelId: string | null | undefined,
): readonly OpenAIResponsesReasoningEffortSetting[] {
  const spec = getOpenAIResponsesReasoningSpec(modelId)
  if (spec) return ['auto', ...spec.efforts]
  return isKnownOpenAIResponsesNonReasoningModel(modelId) ? ['auto'] : ['auto', 'max']
}

export function hasExplicitOpenAIResponsesReasoningEffort(modelId: string | null | undefined): boolean {
  return getOpenAIResponsesReasoningSpec(modelId) !== null || !isKnownOpenAIResponsesNonReasoningModel(modelId)
}
