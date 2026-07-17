import {
  type ImageGenerationIntentV2,
  type ProviderSemanticExtensionV2,
  type ReasoningIntentV2,
  type SamplingIntentV2,
  type ToolPolicyIntentV2,
  type WebSearchIntentV2,
} from '../../domain/generationIntentV2'
import {
  decodeResolvedGenerationIntentV2,
  type ResolvedGenerationIntentV2,
} from '../../domain/resolvedGenerationIntentV2'

export type DeepSeekStableIntentProjectionIssueV1 = Readonly<{
  semanticPath: string
  code:
    | 'DEEPSEEK_UNSUPPORTED_EXPLICIT_FIELD'
    | 'DEEPSEEK_DEPRECATED_FIELD_UNSUPPORTED'
    | 'DEEPSEEK_THINKING_EXPLICIT_SAMPLING_UNSUPPORTED'
    | 'DEEPSEEK_REASONING_EFFORT_UNSUPPORTED'
    | 'DEEPSEEK_FIELD_VALUE_UNSUPPORTED'
    | 'DEEPSEEK_TOOL_DEFINITION_AUTHORITY_REQUIRED'
    | 'DEEPSEEK_THINKING_EXPLICIT_TOOL_CHOICE_UNVERIFIED'
    | 'DEEPSEEK_ATTACHMENT_ENCODING_AUTHORITY_REQUIRED'
  wireKey?: string
}>

export type DeepSeekStableIntentDispositionV1 = Readonly<{
  semanticPath: string
  outcome: 'encoded' | 'accepted_no_wire' | 'rejected'
  wireKey?: string
  value?: string | number | boolean | readonly string[]
  code?: DeepSeekStableIntentProjectionIssueV1['code']
  evidence: string
}>

export type DeepSeekStableNativeSemanticFieldV1 = Readonly<{
  semanticPath: string
  wireKey: string
  value: string | number | boolean | readonly string[]
}>

export type DeepSeekStableIntentProjectionV1 = Readonly<{
  classification: 'deepseek_stable_intent_projection_non_executable'
  executionAuthority: 'none'
  intent: ResolvedGenerationIntentV2
  nativeSemanticFields: readonly DeepSeekStableNativeSemanticFieldV1[]
  dispositions: readonly DeepSeekStableIntentDispositionV1[]
  issues: readonly DeepSeekStableIntentProjectionIssueV1[]
}>

const OFFICIAL_CHAT_EVIDENCE = 'deepseek-create-chat-completion-verified-2026-07-15'
const OFFICIAL_THINKING_EVIDENCE = 'deepseek-thinking-mode-verified-2026-07-15'
const STARVERSE_AUTHORITY_EVIDENCE = 'starverse-generation-v2-authority-boundary-2026-07-15'

export const DEEPSEEK_STABLE_SEMANTIC_INTENT_KEYS_V1 = Object.freeze([
  'generation', 'reasoning', 'web', 'image', 'tools', 'attachments', 'providerExtension',
] as const satisfies readonly Exclude<keyof ResolvedGenerationIntentV2, 'schemaVersion'>[])
const SAMPLING_KEYS = Object.freeze([
  'maxOutputTokens', 'temperature', 'topP', 'topK', 'seed', 'stop', 'candidateCount',
  'frequencyPenalty', 'presencePenalty', 'repetitionPenalty',
] as const satisfies readonly (keyof SamplingIntentV2)[])
const IMAGE_KEYS = Object.freeze([
  'mode', 'aspectRatio', 'resolution', 'size', 'quality', 'format', 'background', 'outputCompression', 'stream',
] as const satisfies readonly (keyof Extract<ImageGenerationIntentV2, { mode: 'generate' }>)[])
const REASONING_MODES = ['disabled', 'enabled'] as const satisfies readonly ReasoningIntentV2['mode'][]
const WEB_MODES = ['disabled', 'provider_search'] as const satisfies readonly WebSearchIntentV2['mode'][]
const TOOL_MODES = ['disabled', 'enabled'] as const satisfies readonly ToolPolicyIntentV2['mode'][]
const PROVIDER_EXTENSION_KINDS = ['none', 'openai_responses'] as const satisfies readonly ProviderSemanticExtensionV2['kind'][]

const samplingKeysAreExhaustive: Exclude<keyof SamplingIntentV2, typeof SAMPLING_KEYS[number]> extends never
  ? true : never = true
const imageKeysAreExhaustive: Exclude<
  keyof Extract<ImageGenerationIntentV2, { mode: 'generate' }>, typeof IMAGE_KEYS[number]
> extends never ? true : never = true
const topLevelKeysAreExhaustive: Exclude<
  keyof ResolvedGenerationIntentV2, typeof DEEPSEEK_STABLE_SEMANTIC_INTENT_KEYS_V1[number] | 'schemaVersion'
> extends never ? true : never = true
const reasoningModesAreExhaustive: Exclude<ReasoningIntentV2['mode'], typeof REASONING_MODES[number]> extends never
  ? true : never = true
const webModesAreExhaustive: Exclude<WebSearchIntentV2['mode'], typeof WEB_MODES[number]> extends never ? true : never = true
const toolModesAreExhaustive: Exclude<ToolPolicyIntentV2['mode'], typeof TOOL_MODES[number]> extends never ? true : never = true
const providerExtensionKindsAreExhaustive: Exclude<
  ProviderSemanticExtensionV2['kind'], typeof PROVIDER_EXTENSION_KINDS[number]
> extends never ? true : never = true
void samplingKeysAreExhaustive
void imageKeysAreExhaustive
void topLevelKeysAreExhaustive
void reasoningModesAreExhaustive
void webModesAreExhaustive
void toolModesAreExhaustive
void providerExtensionKindsAreExhaustive

function compareCodePoints(left: string, right: string): number {
  const a = Array.from(left)
  const b = Array.from(right)
  for (let index = 0; index < Math.min(a.length, b.length); index += 1) {
    const difference = (a[index].codePointAt(0) ?? 0) - (b[index].codePointAt(0) ?? 0)
    if (difference !== 0) return difference
  }
  return a.length - b.length
}

export function projectDeepSeekStableIntentV1(
  rawIntent: unknown,
  hasToolDefinitionAuthority = false,
): DeepSeekStableIntentProjectionV1 {
  const intent = decodeResolvedGenerationIntentV2(rawIntent).value
  const nativeSemanticFields: DeepSeekStableNativeSemanticFieldV1[] = []
  const dispositions: DeepSeekStableIntentDispositionV1[] = []
  const issues: DeepSeekStableIntentProjectionIssueV1[] = []
  const encode = (
    semanticPath: string,
    wireKey: string,
    value: DeepSeekStableNativeSemanticFieldV1['value'],
    evidence = OFFICIAL_CHAT_EVIDENCE,
  ) => {
    const stableValue = Array.isArray(value) ? Object.freeze([...value]) : value
    nativeSemanticFields.push(Object.freeze({ semanticPath, wireKey, value: stableValue }))
    dispositions.push(Object.freeze({ semanticPath, outcome: 'encoded', wireKey, value: stableValue, evidence }))
  }
  const acceptNoWire = (semanticPath: string, evidence = STARVERSE_AUTHORITY_EVIDENCE) => {
    dispositions.push(Object.freeze({ semanticPath, outcome: 'accepted_no_wire', evidence }))
  }
  const encodeByAuthority = (semanticPath: string, wireKey: string, evidence = OFFICIAL_CHAT_EVIDENCE) => {
    dispositions.push(Object.freeze({ semanticPath, outcome: 'encoded', wireKey, evidence }))
  }
  const reject = (
    semanticPath: string,
    code: DeepSeekStableIntentProjectionIssueV1['code'],
    wireKey?: string,
    evidence = OFFICIAL_CHAT_EVIDENCE,
  ) => {
    issues.push(Object.freeze({ semanticPath, code, ...(wireKey ? { wireKey } : {}) }))
    dispositions.push(Object.freeze({
      semanticPath, outcome: 'rejected', ...(wireKey ? { wireKey } : {}), code, evidence,
    }))
  }

  for (const key of SAMPLING_KEYS) {
    const value = intent.generation[key]
    if (value === undefined) continue
    const path = `generation.${key}`
    if (key === 'maxOutputTokens') encode(path, 'max_tokens', value as number)
    else if (key === 'stop') {
      if ((value as readonly string[]).length > 16) {
        reject(path, 'DEEPSEEK_FIELD_VALUE_UNSUPPORTED', 'stop')
      } else {
        encode(path, 'stop', value as readonly string[])
      }
    }
    else if (key === 'temperature' || key === 'topP') {
      if (key === 'temperature' && (value as number) > 2) {
        reject(path, 'DEEPSEEK_FIELD_VALUE_UNSUPPORTED', 'temperature')
      } else if (intent.reasoning.mode === 'enabled') {
        reject(path, 'DEEPSEEK_THINKING_EXPLICIT_SAMPLING_UNSUPPORTED', key === 'topP' ? 'top_p' : key,
          OFFICIAL_THINKING_EVIDENCE)
      } else {
        encode(path, key === 'topP' ? 'top_p' : key, value as number)
      }
    } else if (key === 'frequencyPenalty' || key === 'presencePenalty') {
      const wireKey = key === 'frequencyPenalty' ? 'frequency_penalty' : 'presence_penalty'
      if ((value as number) < -2 || (value as number) > 2) {
        reject(path, 'DEEPSEEK_FIELD_VALUE_UNSUPPORTED', wireKey)
      } else if (intent.reasoning.mode === 'enabled') {
        reject(path, 'DEEPSEEK_THINKING_EXPLICIT_SAMPLING_UNSUPPORTED', wireKey,
          OFFICIAL_THINKING_EVIDENCE)
      } else {
        reject(path, 'DEEPSEEK_DEPRECATED_FIELD_UNSUPPORTED', wireKey)
      }
    } else {
      reject(path, 'DEEPSEEK_UNSUPPORTED_EXPLICIT_FIELD')
    }
  }

  encode('reasoning.mode', 'thinking.type', intent.reasoning.mode, OFFICIAL_THINKING_EVIDENCE)
  if (intent.reasoning.mode === 'enabled') {
    if (intent.reasoning.effort !== undefined) {
      if (intent.reasoning.effort === 'minimal') {
        reject('reasoning.effort', 'DEEPSEEK_REASONING_EFFORT_UNSUPPORTED', 'reasoning_effort',
          OFFICIAL_THINKING_EVIDENCE)
      } else {
        const effort = intent.reasoning.effort === 'xhigh' || intent.reasoning.effort === 'max' ? 'max' : 'high'
        encode('reasoning.effort', 'reasoning_effort', effort, OFFICIAL_THINKING_EVIDENCE)
      }
    }
    if (intent.reasoning.summary !== undefined) {
      reject('reasoning.summary', 'DEEPSEEK_UNSUPPORTED_EXPLICIT_FIELD', undefined, OFFICIAL_THINKING_EVIDENCE)
    }
  }

  if (intent.web.mode === 'disabled') acceptNoWire('web.mode')
  else {
    reject('web.mode', 'DEEPSEEK_UNSUPPORTED_EXPLICIT_FIELD')
    reject('web.types', 'DEEPSEEK_UNSUPPORTED_EXPLICIT_FIELD')
  }

  if (intent.image.mode === 'disabled') acceptNoWire('image.mode')
  else {
    for (const key of IMAGE_KEYS) {
      if (key === 'mode' || intent.image[key] !== undefined) {
        reject(`image.${key}`, 'DEEPSEEK_UNSUPPORTED_EXPLICIT_FIELD')
      }
    }
  }

  if (intent.tools.mode === 'disabled') acceptNoWire('tools.mode')
  else if (!hasToolDefinitionAuthority) {
    reject('tools.mode', 'DEEPSEEK_TOOL_DEFINITION_AUTHORITY_REQUIRED', 'tools')
    reject('tools.allowedToolIds', 'DEEPSEEK_TOOL_DEFINITION_AUTHORITY_REQUIRED', 'tools')
    reject('tools.toolChoice', 'DEEPSEEK_TOOL_DEFINITION_AUTHORITY_REQUIRED', 'tool_choice')
    acceptNoWire('tools.sideEffectConfirmation')
  } else {
    acceptNoWire('tools.mode')
    encodeByAuthority('tools.allowedToolIds', 'tools')
    if (intent.tools.toolChoice.mode === 'omitted') acceptNoWire('tools.toolChoice', OFFICIAL_THINKING_EVIDENCE)
    else if (intent.reasoning.mode === 'enabled') {
      reject('tools.toolChoice', 'DEEPSEEK_THINKING_EXPLICIT_TOOL_CHOICE_UNVERIFIED', 'tool_choice',
        OFFICIAL_THINKING_EVIDENCE)
    } else {
      encodeByAuthority('tools.toolChoice', 'tool_choice', OFFICIAL_THINKING_EVIDENCE)
    }
    acceptNoWire('tools.sideEffectConfirmation')
  }

  for (const [index, attachment] of intent.attachments.entries()) {
    const base = `attachments[${index}]`
    acceptNoWire(`${base}.assetId`)
    acceptNoWire(`${base}.assetRevisionId`)
    acceptNoWire(`${base}.assetSha256`)
    if (attachment.include) {
      reject(`${base}.include`, 'DEEPSEEK_ATTACHMENT_ENCODING_AUTHORITY_REQUIRED')
      reject(`${base}.sendAs`, 'DEEPSEEK_ATTACHMENT_ENCODING_AUTHORITY_REQUIRED')
      reject(`${base}.conversion`, 'DEEPSEEK_ATTACHMENT_ENCODING_AUTHORITY_REQUIRED')
    } else {
      acceptNoWire(`${base}.include`)
      acceptNoWire(`${base}.sendAs`)
      acceptNoWire(`${base}.conversion`)
    }
  }
  if (intent.providerExtension.kind === 'none') acceptNoWire('providerExtension.kind')
  else {
    reject('providerExtension.kind', 'DEEPSEEK_UNSUPPORTED_EXPLICIT_FIELD')
    if (intent.providerExtension.maxToolCalls !== undefined) reject('providerExtension.maxToolCalls', 'DEEPSEEK_UNSUPPORTED_EXPLICIT_FIELD')
    if (intent.providerExtension.parallelToolCalls !== undefined) reject('providerExtension.parallelToolCalls', 'DEEPSEEK_UNSUPPORTED_EXPLICIT_FIELD')
    if (intent.providerExtension.serviceTier !== undefined) reject('providerExtension.serviceTier', 'DEEPSEEK_UNSUPPORTED_EXPLICIT_FIELD')
    if (intent.providerExtension.verbosity !== undefined) reject('providerExtension.verbosity', 'DEEPSEEK_UNSUPPORTED_EXPLICIT_FIELD')
  }

  nativeSemanticFields.sort((left, right) => compareCodePoints(left.wireKey, right.wireKey) ||
    compareCodePoints(left.semanticPath, right.semanticPath))
  dispositions.sort((left, right) => compareCodePoints(left.semanticPath, right.semanticPath))
  issues.sort((left, right) => compareCodePoints(`${left.semanticPath}\0${left.code}`, `${right.semanticPath}\0${right.code}`))
  if (new Set(dispositions.map((entry) => entry.semanticPath)).size !== dispositions.length) {
    throw new Error('GENERATION_V2_DEEPSEEK_DUPLICATE_SEMANTIC_PATH')
  }
  return Object.freeze({
    classification: 'deepseek_stable_intent_projection_non_executable',
    executionAuthority: 'none',
    intent,
    nativeSemanticFields: Object.freeze(nativeSemanticFields),
    dispositions: Object.freeze(dispositions),
    issues: Object.freeze(issues),
  })
}
