import { projectGenerationIntentLayerV2 } from '../../domain/generationIntentProjectionV2'
import { decodeResolvedGenerationIntentV2, type ResolvedGenerationIntentV2 } from '../../domain/resolvedGenerationIntentV2'
import { requiresProviderFileBindingV2, type AttachmentIntentV2, type ManagedFileAttachmentIntentV2 } from '../../domain/generationIntentV2'
import type { OpenAIResponsesToolV1 } from './responsesRequestV1'

export type OpenAIResponsesIntentIssueV1 = Readonly<{
  semanticPath: string
  code: 'OPENAI_UNSUPPORTED_EXPLICIT_FIELD' | 'OPENAI_CAPABILITY_UNAVAILABLE' | 'OPENAI_FIELD_VALUE_UNSUPPORTED'
  wireKey?: string
}>
export type OpenAIResponsesIntentDispositionV1 = Readonly<{
  semanticPath: string
  outcome: 'encoded' | 'accepted_no_wire' | 'rejected'
  wireKey?: string
  code?: OpenAIResponsesIntentIssueV1['code']
  evidence: string
}>
export type OpenAIResponsesIntentProjectionV1 = Readonly<{
  classification: 'openai_responses_intent_projection_non_executable'
  executionAuthority: 'none'
  intent: ResolvedGenerationIntentV2
  request: Readonly<{
    reasoning?: Readonly<{ effort?: string; summary?: string; mode?: 'standard' | 'pro'; context?: 'auto' | 'current_turn' | 'all_turns' }>
    generation: Readonly<{ maxOutputTokens?: number; verbosity?: string }>
    tools?: readonly OpenAIResponsesToolV1[]
    functionToolChoice?: Readonly<{ mode: 'omitted' | 'auto' | 'none' | 'required' | 'named'; toolId?: string }>
    maxToolCalls?: number
    parallelToolCalls?: boolean
    serviceTier?: string
  }>
  dispositions: readonly OpenAIResponsesIntentDispositionV1[]
  issues: readonly OpenAIResponsesIntentIssueV1[]
}>

const CONTRACT = 'openai-responses-api-contract-20260715'
const MODEL = 'openai-responses-gpt-5.6-capabilities-20260717'

export function isOpenAIResponsesEncodedAttachmentIntentV1(
  attachment: AttachmentIntentV2,
): attachment is ManagedFileAttachmentIntentV2 | Extract<AttachmentIntentV2, { kind: 'url_reference' }> {
  return requiresProviderFileBindingV2(attachment) ||
    (attachment.kind === 'url_reference' && attachment.include && attachment.mediaKind === 'image')
}

export function projectOpenAIResponsesIntentV1(raw: unknown): OpenAIResponsesIntentProjectionV1 {
  const intent = decodeResolvedGenerationIntentV2(raw).value
  const dispositions: OpenAIResponsesIntentDispositionV1[] = []
  const issues: OpenAIResponsesIntentIssueV1[] = []
  const accept = (semanticPath: string, evidence = CONTRACT) => dispositions.push(Object.freeze({
    semanticPath, outcome: 'accepted_no_wire' as const, evidence,
  }))
  const encode = (semanticPath: string, wireKey: string, evidence = CONTRACT) => dispositions.push(Object.freeze({
    semanticPath, outcome: 'encoded' as const, wireKey, evidence,
  }))
  const reject = (semanticPath: string, code: OpenAIResponsesIntentIssueV1['code'], wireKey?: string) => {
    const issue = Object.freeze({ semanticPath, code, ...(wireKey ? { wireKey } : {}) })
    issues.push(issue)
    dispositions.push(Object.freeze({ semanticPath, outcome: 'rejected' as const, ...(wireKey ? { wireKey } : {}), code, evidence: CONTRACT }))
  }

  const generation: { maxOutputTokens?: number; verbosity?: string } = {}
  for (const [key, value] of Object.entries(intent.generation)) {
    if (value === undefined) continue
    if (key === 'maxOutputTokens') { generation.maxOutputTokens = value as number; encode('generation.maxOutputTokens', 'max_output_tokens', MODEL) }
    else if (key === 'temperature' || key === 'topP') reject(`generation.${key}`, 'OPENAI_CAPABILITY_UNAVAILABLE')
    else reject(`generation.${key}`, 'OPENAI_UNSUPPORTED_EXPLICIT_FIELD')
  }
  let reasoning: { effort?: string; summary?: string; mode?: 'standard' | 'pro'; context?: 'auto' | 'current_turn' | 'all_turns' } | undefined
  if (intent.reasoning.mode === 'disabled') accept('reasoning.mode', MODEL)
  else {
    encode('reasoning.mode', 'reasoning.mode', MODEL)
    reasoning = { mode: intent.providerExtension.kind === 'openai_responses'
      ? (intent.providerExtension.reasoningMode ?? 'standard') : 'standard' }
    if (intent.reasoning.effort !== undefined) { reasoning.effort = intent.reasoning.effort; encode('reasoning.effort', 'reasoning.effort', MODEL) }
    if (intent.reasoning.summary !== undefined) { reasoning.summary = intent.reasoning.summary; encode('reasoning.summary', 'reasoning.summary') }
    if (intent.reasoning.exclude !== undefined) reject('reasoning.exclude', 'OPENAI_UNSUPPORTED_EXPLICIT_FIELD')
  }

  const tools: OpenAIResponsesToolV1[] = []
  if (intent.web.mode === 'disabled') accept('web.mode', MODEL)
  else {
    if (intent.web.types.length !== 1 || intent.web.types[0] !== 'web') reject('web.types', 'OPENAI_FIELD_VALUE_UNSUPPORTED')
    else {
      accept('web.types', MODEL)
      encode('web.mode', 'tools[].type', MODEL)
      const webTool: { type: 'web_search'; searchContextSize?: 'low' | 'medium' | 'high'; allowedDomains?: readonly string[] } = { type: 'web_search' }
      for (const [key, value] of Object.entries(intent.web)) {
        if (key === 'mode' || key === 'types' || value === undefined) continue
        if (key === 'searchContextSize') {
          webTool.searchContextSize = value as 'low' | 'medium' | 'high'
          encode('web.searchContextSize', 'tools[].search_context_size', MODEL)
        } else if (key === 'allowedDomains') {
          webTool.allowedDomains = value as readonly string[]
          encode('web.allowedDomains', 'tools[].filters.allowed_domains', MODEL)
        } else reject(`web.${key}`, 'OPENAI_UNSUPPORTED_EXPLICIT_FIELD')
      }
      tools.push(Object.freeze(webTool))
    }
  }
  if (intent.image.mode === 'disabled') accept('image.mode', MODEL)
  else {
    const image: Record<string, unknown> = { type: 'image_generation', action: 'generate' }
    encode('image.mode', 'tools[].type', MODEL)
    for (const [key, value] of Object.entries(intent.image)) {
      if (key === 'mode' || value === undefined) continue
      const wire = key === 'format' ? 'outputFormat' : key
      if (key === 'size') {
        const size = value as { width: number; height: number }
        image.size = `${size.width}x${size.height}`
        encode('image.size', 'tools[].size', MODEL)
      } else if (key === 'quality' || key === 'format' || key === 'background') {
        image[wire] = value
        encode(`image.${key}`, `tools[].${key === 'format' ? 'output_format' : key}`, MODEL)
      } else reject(`image.${key}`, 'OPENAI_UNSUPPORTED_EXPLICIT_FIELD')
    }
    tools.push(Object.freeze(image) as OpenAIResponsesToolV1)
  }
  let functionToolChoice: OpenAIResponsesIntentProjectionV1['request']['functionToolChoice']
  if (intent.tools.mode === 'disabled') accept('tools.mode')
  else {
    encode('tools.mode', 'tools')
    encode('tools.allowedToolIds', 'tools')
    accept('tools.sideEffectConfirmation')
    encode('tools.toolChoice', 'tool_choice')
    functionToolChoice = Object.freeze({
      mode: intent.tools.toolChoice.mode,
      ...(intent.tools.toolChoice.mode === 'named' ? { toolId: intent.tools.toolChoice.toolId.value } : {}),
    })
  }
  if (intent.attachments.length > 0) {
    // The immutable descriptor binding is resolved by the history repository;
    // the wire request receives only the resulting input_file identifier.
    accept('attachments[].assetId', MODEL)
    accept('attachments[].assetRevisionId', MODEL)
    accept('attachments[].assetSha256', MODEL)
    const included = intent.attachments.filter((attachment) => attachment.include)
    if (included.length === 0) {
      accept('attachments[].include', MODEL)
      accept('attachments[].sendAs', MODEL)
      accept('attachments[].conversion', MODEL)
    } else if (included.every(isOpenAIResponsesEncodedAttachmentIntentV1)) {
      encode('attachments[].include', 'input[].content[].input_file|input_image', MODEL)
      encode('attachments[].sendAs', 'input[].content[].input_file|input_image', MODEL)
      encode('attachments[].conversion', 'input[].content[].input_file|input_image', MODEL)
    } else {
      reject('attachments[].include', 'OPENAI_FIELD_VALUE_UNSUPPORTED', 'input[].content[].input_file|input_image')
      reject('attachments[].sendAs', 'OPENAI_FIELD_VALUE_UNSUPPORTED', 'input[].content[].input_file|input_image')
      reject('attachments[].conversion', 'OPENAI_FIELD_VALUE_UNSUPPORTED', 'input[].content[].input_file|input_image')
    }
  }

  let maxToolCalls: number | undefined
  let parallelToolCalls: boolean | undefined
  let serviceTier: string | undefined
  if (intent.providerExtension.kind === 'none') accept('providerExtension.kind')
  else if (intent.providerExtension.kind === 'openai_responses') {
    accept('providerExtension.kind')
    if (intent.providerExtension.verbosity !== undefined) {
      generation.verbosity = intent.providerExtension.verbosity
      encode('providerExtension.verbosity', 'text.verbosity', MODEL)
    }
    if (intent.providerExtension.maxToolCalls !== undefined) {
      maxToolCalls = intent.providerExtension.maxToolCalls
      encode('providerExtension.maxToolCalls', 'max_tool_calls')
    }
    if (intent.providerExtension.parallelToolCalls !== undefined) {
      parallelToolCalls = intent.providerExtension.parallelToolCalls
      encode('providerExtension.parallelToolCalls', 'parallel_tool_calls')
    }
    if (intent.providerExtension.serviceTier !== undefined) {
      serviceTier = intent.providerExtension.serviceTier
      encode('providerExtension.serviceTier', 'service_tier')
    }
    if (intent.providerExtension.reasoningMode !== undefined) {
      if (intent.reasoning.mode === 'disabled') reject('providerExtension.reasoningMode', 'OPENAI_UNSUPPORTED_EXPLICIT_FIELD', 'reasoning.mode')
      else {
        if (reasoning) reasoning.mode = intent.providerExtension.reasoningMode
        encode('providerExtension.reasoningMode', 'reasoning.mode', MODEL)
      }
    }
    if (intent.providerExtension.reasoningContext !== undefined) {
      if (intent.reasoning.mode === 'disabled') reject('providerExtension.reasoningContext', 'OPENAI_UNSUPPORTED_EXPLICIT_FIELD', 'reasoning.context')
      else {
        if (reasoning) reasoning.context = intent.providerExtension.reasoningContext
        encode('providerExtension.reasoningContext', 'reasoning.context', MODEL)
      }
    }
  } else if (intent.providerExtension.kind === 'anthropic_messages') {
    reject('providerExtension.kind', 'OPENAI_UNSUPPORTED_EXPLICIT_FIELD')
    if (intent.providerExtension.manualThinkingBudgetTokens !== undefined) {
      reject('providerExtension.manualThinkingBudgetTokens', 'OPENAI_UNSUPPORTED_EXPLICIT_FIELD')
    }
    reject('providerExtension.thinkingDisplay', 'OPENAI_UNSUPPORTED_EXPLICIT_FIELD')
    reject('providerExtension.thinkingMode', 'OPENAI_UNSUPPORTED_EXPLICIT_FIELD')
  } else if (intent.providerExtension.kind === 'gemini_generate_content') {
    reject('providerExtension.kind', 'OPENAI_UNSUPPORTED_EXPLICIT_FIELD')
    reject('providerExtension.thinkingMode', 'OPENAI_UNSUPPORTED_EXPLICIT_FIELD')
    if ('thinkingLevel' in intent.providerExtension && intent.providerExtension.thinkingLevel !== undefined) reject('providerExtension.thinkingLevel', 'OPENAI_UNSUPPORTED_EXPLICIT_FIELD')
    if ('thinkingBudget' in intent.providerExtension && intent.providerExtension.thinkingBudget !== undefined) reject('providerExtension.thinkingBudget', 'OPENAI_UNSUPPORTED_EXPLICIT_FIELD')
    reject('providerExtension.includeThoughts', 'OPENAI_UNSUPPORTED_EXPLICIT_FIELD')
  }
  dispositions.sort((a, b) => a.semanticPath < b.semanticPath ? -1 : a.semanticPath > b.semanticPath ? 1 : 0)
  issues.sort((a, b) => a.semanticPath < b.semanticPath ? -1 : a.semanticPath > b.semanticPath ? 1 : 0)
  if (new Set(dispositions.map((value) => value.semanticPath)).size !== dispositions.length) {
    throw new Error('GENERATION_V2_OPENAI_DUPLICATE_SEMANTIC_PATH')
  }
  return Object.freeze({
    classification: 'openai_responses_intent_projection_non_executable', executionAuthority: 'none', intent,
    request: Object.freeze({
      ...(reasoning === undefined ? {} : { reasoning: Object.freeze(reasoning) }),
      generation: Object.freeze(generation), ...(tools.length === 0 ? {} : { tools: Object.freeze(tools) }),
      ...(functionToolChoice === undefined ? {} : { functionToolChoice }),
      ...(maxToolCalls === undefined ? {} : { maxToolCalls }),
      ...(parallelToolCalls === undefined ? {} : { parallelToolCalls }),
      ...(serviceTier === undefined ? {} : { serviceTier }),
    }),
    dispositions: Object.freeze(dispositions), issues: Object.freeze(issues),
  })
}

export function projectOpenAIResponsesIntentForPersistenceV1(value: ResolvedGenerationIntentV2) {
  return projectGenerationIntentLayerV2(value)
}
