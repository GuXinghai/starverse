import {
  decodeGenerationIntentLayerV2,
  readImageAspectRatioV2,
  type GenerationIntentLayerV2,
  type ImageGenerationIntentV2,
  type ProviderSemanticExtensionV2,
  type ReasoningIntentV2,
  type SamplingIntentV2,
  type ToolPolicyIntentV2,
  type WebSearchIntentV2,
} from '../../domain/generationIntentV2'
import type {
  CanonicalOpenRouterImageDescriptorSetV2,
  CanonicalOpenRouterImageDescriptorV2,
  CanonicalOpenRouterImageParameterRuleV2,
} from './canonicalDescriptorV2'

export type OpenRouterImageCapabilityIssueV2 = Readonly<{
  semanticPath: string
  code: 'UNSUPPORTED_EXPLICIT_FIELD' | 'MISSING_REQUIRED_IMAGE_INTENT' | 'DESCRIPTOR_FIELD_MISSING' |
    'DESCRIPTOR_VALUE_UNSUPPORTED' | 'SIZE_COMBINATION_UNRESOLVED' | 'IMAGE_FIELD_CONFLICT' | 'URL_REFERENCE_ENCODING_UNSUPPORTED'
  wireKey?: string
}>

export type OpenRouterImageIntentDispositionV2 = Readonly<{
  semanticPath: string
  outcome: 'encoded' | 'accepted_no_wire' | 'rejected'
  wireKey?: string
  value?: string | number | boolean
  code?: OpenRouterImageCapabilityIssueV2['code']
}>

export type OpenRouterImageIntentCapabilityProjectionV2 = Readonly<{
  intent: GenerationIntentLayerV2
  wireFields: readonly Readonly<{
    semanticPath: string
    wireKey: string
    value: string | number
  }>[]
  stream: boolean
  dispositions: readonly OpenRouterImageIntentDispositionV2[]
  issues: readonly OpenRouterImageCapabilityIssueV2[]
}>

export type OpenRouterImageCandidateCapabilityV2 = Readonly<{
  providerName: string
  providerTag: string
  providerSlug: string
  descriptorRevision: string
  descriptorDigest: string
  eligible: boolean
  issues: readonly OpenRouterImageCapabilityIssueV2[]
}>

export const OPENROUTER_IMAGE_SEMANTIC_INTENT_KEYS_V2 = Object.freeze([
  'generation', 'reasoning', 'web', 'image', 'tools', 'attachments', 'providerExtension',
] as const satisfies readonly (keyof GenerationIntentLayerV2)[])
export const OPENROUTER_IMAGE_NON_SEMANTIC_INTENT_KEYS_V2 = Object.freeze([
  'schemaVersion',
] as const satisfies readonly (keyof GenerationIntentLayerV2)[])
const SAMPLING_KEYS = [
  'maxOutputTokens', 'temperature', 'topP', 'topK', 'minP', 'topA', 'seed', 'stop', 'candidateCount',
  'frequencyPenalty', 'presencePenalty', 'repetitionPenalty',
] as const satisfies readonly (keyof SamplingIntentV2)[]
const IMAGE_KEYS = [
  'mode', 'outputMode', 'aspectRatio', 'resolution', 'size', 'quality', 'format', 'background', 'outputCompression', 'stream',
] as const satisfies readonly (keyof Extract<ImageGenerationIntentV2, { mode: 'generate' }>)[]
const REASONING_MODES = ['disabled', 'enabled'] as const satisfies readonly ReasoningIntentV2['mode'][]
const WEB_MODES = ['disabled', 'provider_search'] as const satisfies readonly WebSearchIntentV2['mode'][]
const TOOL_MODES = ['disabled', 'enabled'] as const satisfies readonly ToolPolicyIntentV2['mode'][]
const PROVIDER_EXTENSION_KINDS = ['none', 'openrouter_chat', 'openai_responses', 'anthropic_messages', 'gemini_generate_content'] as const satisfies readonly ProviderSemanticExtensionV2['kind'][]
type DeclaredTopLevelKey = typeof OPENROUTER_IMAGE_SEMANTIC_INTENT_KEYS_V2[number] |
  typeof OPENROUTER_IMAGE_NON_SEMANTIC_INTENT_KEYS_V2[number]
const samplingKeysAreExhaustive: Exclude<keyof SamplingIntentV2, typeof SAMPLING_KEYS[number]> extends never ? true : never = true
const imageKeysAreExhaustive: Exclude<keyof Extract<ImageGenerationIntentV2, { mode: 'generate' }>, typeof IMAGE_KEYS[number]> extends never ? true : never = true
const topLevelKeysAreExhaustive: Exclude<keyof GenerationIntentLayerV2, DeclaredTopLevelKey> extends never ? true : never = true
const topLevelKeysAreKnown: Exclude<DeclaredTopLevelKey, keyof GenerationIntentLayerV2> extends never ? true : never = true
const topLevelGroupsDoNotOverlap: Extract<
  typeof OPENROUTER_IMAGE_SEMANTIC_INTENT_KEYS_V2[number],
  typeof OPENROUTER_IMAGE_NON_SEMANTIC_INTENT_KEYS_V2[number]
> extends never ? true : never = true
const reasoningModesAreExhaustive: Exclude<ReasoningIntentV2['mode'], typeof REASONING_MODES[number]> extends never ? true : never = true
const webModesAreExhaustive: Exclude<WebSearchIntentV2['mode'], typeof WEB_MODES[number]> extends never ? true : never = true
const toolModesAreExhaustive: Exclude<ToolPolicyIntentV2['mode'], typeof TOOL_MODES[number]> extends never ? true : never = true
const providerExtensionKindsAreExhaustive: Exclude<ProviderSemanticExtensionV2['kind'], typeof PROVIDER_EXTENSION_KINDS[number]> extends never ? true : never = true
void samplingKeysAreExhaustive
void imageKeysAreExhaustive
void topLevelKeysAreExhaustive
void topLevelKeysAreKnown
void topLevelGroupsDoNotOverlap
void reasoningModesAreExhaustive
void webModesAreExhaustive
void toolModesAreExhaustive
void providerExtensionKindsAreExhaustive

function issue(
  semanticPath: string,
  code: OpenRouterImageCapabilityIssueV2['code'],
  wireKey?: string,
): OpenRouterImageCapabilityIssueV2 {
  return Object.freeze({ semanticPath, code, ...(wireKey ? { wireKey } : {}) })
}

function compareCodePoints(left: string, right: string): number {
  const a = Array.from(left)
  const b = Array.from(right)
  for (let index = 0; index < Math.min(a.length, b.length); index += 1) {
    const difference = (a[index].codePointAt(0) ?? 0) - (b[index].codePointAt(0) ?? 0)
    if (difference !== 0) return difference
  }
  return a.length - b.length
}

export function projectOpenRouterImageIntentCapabilityV2(
  rawIntent: unknown,
): OpenRouterImageIntentCapabilityProjectionV2 {
  const intent = decodeGenerationIntentLayerV2(rawIntent)
  const fields: Array<{ semanticPath: string; wireKey: string; value: string | number }> = []
  const dispositions: OpenRouterImageIntentDispositionV2[] = []
  const issues: OpenRouterImageCapabilityIssueV2[] = []
  const reject = (semanticPath: string, code: OpenRouterImageCapabilityIssueV2['code'], wireKey?: string) => {
    issues.push(issue(semanticPath, code, wireKey))
    dispositions.push(Object.freeze({ semanticPath, outcome: 'rejected', ...(wireKey ? { wireKey } : {}), code }))
  }
  const encode = (semanticPath: string, wireKey: string, value: string | number) => {
    fields.push(Object.freeze({ semanticPath, wireKey, value }))
    dispositions.push(Object.freeze({ semanticPath, outcome: 'encoded', wireKey, value }))
  }
  const acceptNoWire = (semanticPath: string) => {
    dispositions.push(Object.freeze({ semanticPath, outcome: 'accepted_no_wire' }))
  }

  const sampling = intent.generation
  if (sampling) {
    for (const key of SAMPLING_KEYS.filter((candidate) => candidate !== 'seed' && candidate !== 'candidateCount')) {
      if (sampling[key] !== undefined) reject(`generation.${key}`, 'UNSUPPORTED_EXPLICIT_FIELD')
    }
    if (sampling.seed !== undefined) encode('generation.seed', 'seed', sampling.seed)
    if (sampling.candidateCount !== undefined) {
      if (sampling.candidateCount > 10) reject('generation.candidateCount', 'DESCRIPTOR_VALUE_UNSUPPORTED', 'n')
      else encode('generation.candidateCount', 'n', sampling.candidateCount)
    }
  }

  if (intent.reasoning?.mode === 'enabled') reject('reasoning', 'UNSUPPORTED_EXPLICIT_FIELD')
  else if (intent.reasoning) acceptNoWire('reasoning.mode')
  if (intent.web?.mode === 'provider_search') reject('web', 'UNSUPPORTED_EXPLICIT_FIELD')
  else if (intent.web) acceptNoWire('web.mode')
  if (intent.tools?.mode === 'enabled') reject('tools', 'UNSUPPORTED_EXPLICIT_FIELD')
  else if (intent.tools) acceptNoWire('tools.mode')
  if (intent.providerExtension) {
    if (intent.providerExtension.kind === 'none') acceptNoWire('providerExtension.kind')
    else if (intent.providerExtension.kind === 'openrouter_chat') {
      reject('providerExtension.kind', 'UNSUPPORTED_EXPLICIT_FIELD')
      if (intent.providerExtension.verbosity !== undefined) reject('providerExtension.verbosity', 'UNSUPPORTED_EXPLICIT_FIELD')
      if (intent.providerExtension.parallelToolCalls !== undefined) reject('providerExtension.parallelToolCalls', 'UNSUPPORTED_EXPLICIT_FIELD')
      if (intent.providerExtension.responseFormat !== undefined) reject('providerExtension.responseFormat', 'UNSUPPORTED_EXPLICIT_FIELD')
    } else {
      reject('providerExtension.kind', 'UNSUPPORTED_EXPLICIT_FIELD')
      if (intent.providerExtension.kind === 'openai_responses') {
        if (intent.providerExtension.maxToolCalls !== undefined) reject('providerExtension.maxToolCalls', 'UNSUPPORTED_EXPLICIT_FIELD')
        if (intent.providerExtension.parallelToolCalls !== undefined) reject('providerExtension.parallelToolCalls', 'UNSUPPORTED_EXPLICIT_FIELD')
        if (intent.providerExtension.serviceTier !== undefined) reject('providerExtension.serviceTier', 'UNSUPPORTED_EXPLICIT_FIELD')
        if (intent.providerExtension.verbosity !== undefined) reject('providerExtension.verbosity', 'UNSUPPORTED_EXPLICIT_FIELD')
      } else if (intent.providerExtension.kind === 'anthropic_messages') {
        if (intent.providerExtension.manualThinkingBudgetTokens !== undefined) reject('providerExtension.manualThinkingBudgetTokens', 'UNSUPPORTED_EXPLICIT_FIELD')
        reject('providerExtension.thinkingDisplay', 'UNSUPPORTED_EXPLICIT_FIELD')
        reject('providerExtension.thinkingMode', 'UNSUPPORTED_EXPLICIT_FIELD')
      } else {
        reject('providerExtension.thinkingMode', 'UNSUPPORTED_EXPLICIT_FIELD')
        if ('thinkingLevel' in intent.providerExtension && intent.providerExtension.thinkingLevel !== undefined) reject('providerExtension.thinkingLevel', 'UNSUPPORTED_EXPLICIT_FIELD')
        if ('thinkingBudget' in intent.providerExtension && intent.providerExtension.thinkingBudget !== undefined) reject('providerExtension.thinkingBudget', 'UNSUPPORTED_EXPLICIT_FIELD')
        reject('providerExtension.includeThoughts', 'UNSUPPORTED_EXPLICIT_FIELD')
      }
    }
  }

  const image = intent.image
  if (!image || image.mode !== 'generate') {
    reject('image.mode', 'MISSING_REQUIRED_IMAGE_INTENT')
  } else {
    acceptNoWire('image.mode')
    const aspectRatio = image.aspectRatio ? readImageAspectRatioV2(image.aspectRatio) : undefined
    if (image.size && (image.resolution !== undefined || aspectRatio !== undefined)) {
      reject('image.size', 'SIZE_COMBINATION_UNRESOLVED', 'size')
    } else if (image.size) {
      encode('image.size', 'size', `${image.size.width}x${image.size.height}`)
    }
    if (aspectRatio !== undefined) encode('image.aspectRatio', 'aspect_ratio', aspectRatio)
    if (image.resolution !== undefined) encode('image.resolution', 'resolution', image.resolution)
    if (image.quality !== undefined) encode('image.quality', 'quality', image.quality)
    if (image.format !== undefined) encode('image.format', 'output_format', image.format)
    if (image.background === 'transparent' && image.format !== 'png' && image.format !== 'webp') {
      reject('image.background', 'IMAGE_FIELD_CONFLICT', 'background')
    } else if (image.background !== undefined) encode('image.background', 'background', image.background)
    if (image.outputCompression !== undefined) {
      if (image.format !== 'jpeg' && image.format !== 'webp') {
        reject('image.outputCompression', 'IMAGE_FIELD_CONFLICT', 'output_compression')
      } else {
        encode('image.outputCompression', 'output_compression', image.outputCompression)
      }
    }
    if (image.stream !== undefined) {
      dispositions.push(Object.freeze({
        semanticPath: 'image.stream', outcome: 'encoded', wireKey: 'stream', value: image.stream,
      }))
    }
  }

  const included = intent.attachments?.filter((attachment) => attachment.include) ?? []
  for (const attachment of intent.attachments ?? []) {
    const attachmentPath = attachment.kind === 'managed_file'
      ? `attachments.${attachment.assetId.value}@${attachment.assetRevisionId.value}`
      : `attachments.${attachment.referenceId.value}@${attachment.referenceRevision.value}`
    if (!attachment.include) acceptNoWire(attachmentPath)
    else if (attachment.kind === 'url_reference') {
      if (attachment.mediaKind !== 'image' || attachment.sendAs !== 'url_reference' || attachment.conversion !== 'none') {
        reject(attachmentPath, 'URL_REFERENCE_ENCODING_UNSUPPORTED', 'input_references')
      } else {
        acceptNoWire(attachmentPath)
      }
    }
    else if (attachment.sendAs !== 'image_reference' || attachment.conversion !== 'none') {
      reject(attachmentPath, 'UNSUPPORTED_EXPLICIT_FIELD', 'input_references')
    } else {
      acceptNoWire(attachmentPath)
    }
  }
  const imageReferences = included.filter((attachment) =>
    attachment.kind === 'url_reference'
      ? attachment.mediaKind === 'image' && attachment.sendAs === 'url_reference' && attachment.conversion === 'none'
      : attachment.sendAs === 'image_reference' && attachment.conversion === 'none')
  if (imageReferences.length > 0) encode('attachments', 'input_references', imageReferences.length)

  fields.sort((left, right) => compareCodePoints(left.wireKey, right.wireKey))
  dispositions.sort((left, right) => compareCodePoints(left.semanticPath, right.semanticPath))
  issues.sort((left, right) => compareCodePoints(`${left.semanticPath}\0${left.code}`, `${right.semanticPath}\0${right.code}`))
  return Object.freeze({
    intent,
    wireFields: Object.freeze(fields),
    stream: image?.mode === 'generate' && image.stream === true,
    dispositions: Object.freeze(dispositions),
    issues: Object.freeze(issues),
  })
}

function supports(rule: CanonicalOpenRouterImageParameterRuleV2, value: string | number): boolean {
  if (rule.kind === 'presence') return true
  if (rule.kind === 'range') return typeof value === 'number' && value >= rule.min && value <= rule.max
  return rule.values.some((candidate) => candidate === value)
}

function evaluateDescriptor(
  descriptor: CanonicalOpenRouterImageDescriptorV2,
  projection: OpenRouterImageIntentCapabilityProjectionV2,
): OpenRouterImageCandidateCapabilityV2 {
  const issues = [...projection.issues]
  if (projection.stream && !descriptor.supportsStreaming) {
    issues.push(issue('image.stream', 'DESCRIPTOR_VALUE_UNSUPPORTED', 'stream'))
  }
  for (const field of projection.wireFields) {
    const parameter = descriptor.parameters.find((candidate) => candidate.name === field.wireKey)
    if (!parameter) issues.push(issue(field.semanticPath, 'DESCRIPTOR_FIELD_MISSING', field.wireKey))
    else if (!supports(parameter.rule, field.value)) {
      issues.push(issue(field.semanticPath, 'DESCRIPTOR_VALUE_UNSUPPORTED', field.wireKey))
    }
  }
  issues.sort((left, right) => compareCodePoints(`${left.semanticPath}\0${left.code}`, `${right.semanticPath}\0${right.code}`))
  return Object.freeze({
    providerName: descriptor.providerName,
    providerTag: descriptor.providerTag.value,
    providerSlug: descriptor.providerSlug.value,
    descriptorRevision: descriptor.descriptorRevision.value,
    descriptorDigest: descriptor.descriptorDigest.value,
    eligible: issues.length === 0,
    issues: Object.freeze(issues),
  })
}

export function projectOpenRouterImageCandidatesV2(input: Readonly<{
  descriptorSet: CanonicalOpenRouterImageDescriptorSetV2
  projection: OpenRouterImageIntentCapabilityProjectionV2
  boundProviderTag: string | null
}>): readonly OpenRouterImageCandidateCapabilityV2[] {
  const candidates = input.descriptorSet.descriptors.map((descriptor) => evaluateDescriptor(descriptor, input.projection))
  candidates.sort((left, right) => {
    if (left.providerTag === input.boundProviderTag) return -1
    if (right.providerTag === input.boundProviderTag) return 1
    return compareCodePoints(left.providerTag, right.providerTag)
  })
  return Object.freeze(candidates)
}
