import type { RuntimeProviderKey } from '../provider/runtimeSelection'
import type { GeminiThinkingCapability } from '../provider/gemini/geminiThinkingPolicy'

export type GenerationProviderId = RuntimeProviderKey | 'unset'

export type GenerationParamKey =
  | 'temperature'
  | 'topP'
  | 'topK'
  | 'minP'
  | 'topA'
  | 'frequencyPenalty'
  | 'presencePenalty'
  | 'repetitionPenalty'
  | 'seed'
  | 'maxOutputTokens'
  | 'reasoningEffort'
  | 'reasoningSummary'
  | 'thinkingEnabled'
  | 'thinkingBudget'
  | 'thinkingLevel'
  | 'includeThoughts'
  | 'thoughtSummaryMode'
  | 'stopSequences'
  | 'googleSearch'
  | 'imageSearch'
  | 'verbosity'

export type GenerationParamValue = number | boolean | string | readonly string[]

export type GenerationParamSetting<T = GenerationParamValue> =
  | Readonly<{ mode: 'inherit' }>
  | Readonly<{ mode: 'custom'; value: T }>
  | Readonly<{ mode: 'omit' }>

export type GenerationParamsLayer = Readonly<Partial<Record<GenerationParamKey, GenerationParamSetting | null>>>

export type GenerationParamsLayers = Readonly<{
  conversation?: GenerationParamsLayer | null
  project?: GenerationParamsLayer | null
  global?: GenerationParamsLayer | null
}>

export type GenerationParamSource = 'conversation' | 'project' | 'global'

export type GenerationParamDecisionState =
  | 'sent'
  | 'omitted'
  | 'providerAuto'
  | 'inheritedToAbsent'
  | 'unsupported'
  | 'rejected'
  | 'deprecated'
  | 'noEffect'

export type GenerationParamSeverity = 'warning' | 'error'

export type GenerationParamIssueCode =
  | 'unsupported_param'
  | 'rejected_param'
  | 'no_effect_param'
  | 'deprecated_param'
  | 'invalid_value'
  | 'conflict_group'
  | 'mapper_missing_wire_target'

export type GenerationParamIssue = Readonly<{
  code: GenerationParamIssueCode
  severity: GenerationParamSeverity
  key?: GenerationParamKey
  message: string
}>

export type GenerationParamWarning = GenerationParamIssue & Readonly<{ severity: 'warning' }>
export type GenerationParamError = GenerationParamIssue & Readonly<{ severity: 'error' }>

export type GenerationParamDecision = Readonly<{
  key: GenerationParamKey
  state: GenerationParamDecisionState
  source?: GenerationParamSource
  value?: unknown
  reason?: string
}>

export type ResolvedGenerationParams = Readonly<{
  requestParams: Partial<Record<GenerationParamKey, GenerationParamValue>>
  decisions: Partial<Record<GenerationParamKey, GenerationParamDecision>>
  warnings: GenerationParamWarning[]
  errors: GenerationParamError[]
}>

export type WireProtocol =
  | 'none'
  | 'openrouter-chat'
  | 'gemini-generate-content'
  | 'gemini-interactions-image'
  | 'openai-responses'
  | 'anthropic-messages'
  | 'deepseek-chat'

export type GenerationParamValueType = 'number' | 'integer' | 'boolean' | 'enum' | 'stringArray'

export type GenerationParamCapabilityStatus =
  | 'stable'
  | 'unsupported'
  | 'deprecated'
  | 'rejected'
  | 'noEffect'
  | 'providerSpecific'

export type GenerationParamCapability = Readonly<{
  supported: boolean
  wireKey?: string
  wirePath?: readonly string[]
  wireEncoding?: 'gemini_interactions_google_search_type'
  valueType: GenerationParamValueType
  range?: Readonly<{
    min?: number
    max?: number
    exclusiveMax?: boolean
    integer?: boolean
  }>
  enumValues?: readonly string[]
  specialValues?: readonly number[]
  status?: GenerationParamCapabilityStatus
  ui?: Readonly<{
    visibleByDefault: boolean
    editable: boolean
    warning?: string
    providerAutoHint?: string
    providerAutoHintDocumented?: boolean
  }>
  conflictGroup?: 'temperatureOrTopP'
}>

export type ModelGenerationParamOverride = Readonly<{
  match: Readonly<{
    providerId?: GenerationProviderId
    modelIdPattern?: string
    exactModelIds?: readonly string[]
  }>
  params?: Partial<Record<GenerationParamKey, GenerationParamCapability>>
  notes?: string
}>

export type ProviderGenerationParamProfile = Readonly<{
  providerId: GenerationProviderId
  profileId: string
  wireProtocol: WireProtocol
  params: Partial<Record<GenerationParamKey, GenerationParamCapability>>
  modelOverrides?: readonly ModelGenerationParamOverride[]
}>

export type ResolveGenerationParamsInput = Readonly<{
  profile: ProviderGenerationParamProfile
  modelId?: string | null
  geminiThinkingCapability?: GeminiThinkingCapability
  layers: GenerationParamsLayers
}>

export type MapGenerationParamsInput = Readonly<{
  profile: ProviderGenerationParamProfile
  modelId?: string | null
  geminiThinkingCapability?: GeminiThinkingCapability
  requestParams: Partial<Record<GenerationParamKey, GenerationParamValue>>
}>
