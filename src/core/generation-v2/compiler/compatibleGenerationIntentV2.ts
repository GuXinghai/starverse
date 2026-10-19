import { contains, type ResolvedCapabilityV2 } from '../capability/resolvedCapabilityV2'
import type { ModelCapabilitySemanticPathV2 } from '../capability/modelCapabilitySchemaV2'
import { projectGenerationIntentLayerV2 } from '../domain/generationIntentProjectionV2'
import { decodeResolvedGenerationIntentV2 } from '../domain/resolvedGenerationIntentV2'
import type { GenerationIntentLayerV2 } from '../domain/generationIntentV2'
import { recordRequestAdaptationV2 } from './requestAdaptationV2'
import { supportsGenerationAttachmentTransportV2 } from './generationAttachmentTransportPolicyV2'
import { generationRequestBodyMaxBytesForContractV1, GENERATION_PORTABLE_HISTORY_RESERVED_BYTES_V1 } from '../capacity/generationCapacityV1'
import { resolveAnthropicRequestIntentV2 } from '../providers/anthropic/thinkingPolicyV2'
import { resolveOpenAIResponsesRequestIntentV2 } from '../providers/openai-responses/thinkingPolicyV2'

type JsonObject = Record<string, unknown>
export type RequestAttachmentMetadataV2 = Readonly<{ mime: string; sizeBytes: number; assetKind: string; utf8Valid?: boolean }>
const codecEnvelopes = new WeakMap<object, ResolvedCapabilityV2>()
export function bindRequestProtocolEnvelopeV2(resolved: ResolvedCapabilityV2, baseline: ResolvedCapabilityV2): ResolvedCapabilityV2 {
  codecEnvelopes.set(resolved, baseline)
  return resolved
}

/** Resolve the request, never edit the user's saved settings or original attachment references. */
export function compatibleGenerationIntentV2(operationId: string, requested: GenerationIntentLayerV2,
  capability: ResolvedCapabilityV2, attachmentMetadata?: ReadonlyMap<string, RequestAttachmentMetadataV2>): ReturnType<typeof decodeResolvedGenerationIntentV2> {
  const original = projectGenerationIntentLayerV2(requested)
  const result = structuredClone(original) as JsonObject
  const binding = capability.executionContext.binding
  const protocol = binding.protocolContractId.value
  const fields = new Map(capability.modelFacts.fields.map(field => [field.path, field]))
  const coverage = new Set(capability.executionContext.encodingCoverage.semanticPaths)
  const codecFields = new Map(codecEnvelopes.get(capability)?.modelFacts.fields.map(field => [field.path, field]) ?? [])
  const allowed = (path: string, value: unknown) => {
    const field = fields.get(path as ModelCapabilitySemanticPathV2)
    if (value === 'disabled' && path.endsWith('.mode') && field?.state === 'unsupported') return true
    const localReasoning = ['ollama-chat-v1', 'openai_chat_compatible'].includes(protocol) && path.startsWith('reasoning.')
    const codecField = localReasoning ? codecFields.get(path as ModelCapabilitySemanticPathV2) : undefined
    if (codecField && (['unsupported', 'missing', 'conflict'].includes(codecField.state) ||
      codecField.domain && !contains(codecField.domain, value))) return value === 'disabled' && path.endsWith('.mode')
    return Boolean(field && coverage.has(path as ModelCapabilitySemanticPathV2) &&
      !['unsupported', 'conflict', 'missing'].includes(field.state) &&
      (field.state === 'unknown' || field.domain === undefined || contains(field.domain, value)))
  }
  const changed = (path: string, source: unknown, reason: string) =>
    recordRequestAdaptationV2(operationId, { path: `settings.${path}`, outcome: 'converted', reason, source })
  const extension = result.providerExtension as JsonObject
  const expectedExtension = protocol.startsWith('anthropic-messages') ? 'anthropic_messages'
    : protocol.startsWith('gemini-generate-content') ? 'gemini_generate_content'
      : protocol === 'gemini-interactions-v1beta' ? 'gemini_interactions'
      : protocol.startsWith('openai-responses') ? 'openai_responses'
        : protocol.startsWith('openrouter-chat') && extension?.kind === 'openrouter_chat' ? 'openrouter_chat' : 'none'
  if (extension?.kind !== expectedExtension) {
    changed('providerExtension', extension, 'target_protocol_extension')
    result.providerExtension = expectedExtension === 'anthropic_messages'
      ? { kind: expectedExtension, thinkingDisplay: 'summarized', thinkingMode: 'model_recommended' }
      : expectedExtension === 'gemini_generate_content'
        ? { kind: expectedExtension, thinkingMode: 'default', includeThoughts: 'provider_default' }
        : { kind: expectedExtension }
  }
  for (const group of ['generation', 'reasoning', 'web', 'image', 'tools', 'providerExtension']) {
    const value = result[group] as JsonObject | undefined
    if (!value) continue
    for (const key of Object.keys(value)) {
      // Native Gemini controls need a known target domain, handled together below.
      if (group === 'providerExtension' && ['gemini_generate_content', 'anthropic_messages'].includes(value.kind as string)) continue
      const path = `${group}.${key}`
      if (allowed(path, value[key])) continue
      if (key === 'mode' && ['reasoning', 'web', 'image', 'tools'].includes(group)) {
        const field = fields.get(path as ModelCapabilitySemanticPathV2)
        const mode = field?.domain?.kind === 'enum' && !field.domain.values.includes('disabled')
          ? field.domain.values[0] : 'disabled'
        changed(path, value[key], 'target_control_unavailable')
        result[group] = { mode }
        break
      }
      if (key === 'kind') continue
      changed(path, value[key], 'target_parameter_unavailable')
      delete value[key]
    }
  }
  const ext = result.providerExtension as JsonObject
  if (ext.kind === 'gemini_interactions') {
    const field = fields.get('providerExtension.thinkingLevel')
    const source = ext.thinkingLevel ?? (requested.reasoning?.mode === 'enabled' ? requested.reasoning.effort : undefined)
    if (field?.state === 'supported' && field.domain && contains(field.domain, source)) ext.thinkingLevel = source
    else { if (source !== undefined) changed('providerExtension.thinkingLevel', source, 'target_native_thinking_control_provider_default'); delete ext.thinkingLevel }
    const reasoning = result.reasoning as JsonObject
    reasoning.mode = 'enabled'; delete reasoning.effort
  }
  if (ext.kind === 'anthropic_messages') {
    const resolved = resolveAnthropicRequestIntentV2(decodeResolvedGenerationIntentV2({ ...result,
      reasoning: { ...(result.reasoning as JsonObject),
        mode: requested.reasoning?.mode ?? (result.reasoning as JsonObject).mode,
        ...(requested.reasoning?.mode === 'disabled' && requested.reasoning.effort !== undefined
          ? {effort: requested.reasoning.effort} : {}),
      } }).value, capability)
    result.reasoning = structuredClone(resolved.reasoning)
    result.providerExtension = structuredClone(resolved.providerExtension)
    result.generation = structuredClone(resolved.generation)
    for (const decision of resolved.decisions) recordRequestAdaptationV2(operationId,
      {...decision, path: `settings.${decision.path}`})
  } else if (ext.kind === 'openai_responses') {
    const resolved = resolveOpenAIResponsesRequestIntentV2(decodeResolvedGenerationIntentV2({ ...result,
      reasoning: { ...(result.reasoning as JsonObject),
        ...(requested.reasoning?.mode === 'disabled' ? requested.reasoning : {}),
      } }).value, capability)
    result.reasoning = structuredClone(resolved.reasoning)
    result.providerExtension = structuredClone(resolved.providerExtension)
    result.generation = structuredClone(resolved.generation)
    for (const decision of resolved.decisions) recordRequestAdaptationV2(operationId,
      { ...decision, path: `settings.${decision.path}` })
  } else if (requested.reasoning?.mode === 'disabled' && requested.reasoning.effort !== undefined) {
    changed('reasoning.effort', requested.reasoning.effort, 'target_disabled_effort_preference_deferred')
    delete (result.reasoning as JsonObject).effort
  }
  if (ext.kind === 'gemini_generate_content') {
    ext.includeThoughts ??= 'provider_default'
    const mode = fields.get('reasoning.mode')
    const budget = fields.get('providerExtension.thinkingBudget')
    const level = fields.get('providerExtension.thinkingLevel')
    const known = (field: typeof budget, value: unknown) => field?.state === 'supported' && field.domain !== undefined && contains(field.domain, value)
    const required = mode?.state === 'supported' && mode.domain?.kind === 'enum' &&
      mode.domain.values.includes('enabled') && !mode.domain.values.includes('disabled')
    const sourceReasoning = requested.reasoning
    const off = sourceReasoning?.mode === 'disabled' || ext.thinkingMode === 'budget' && ext.thinkingBudget === 0
    if (mode?.state === 'unsupported') {
      changed('reasoning', sourceReasoning, 'target_thinking_unsupported')
      result.reasoning = { mode: 'disabled' }
      ext.thinkingMode = 'default'; ext.includeThoughts = 'provider_default'
      delete ext.thinkingBudget; delete ext.thinkingLevel
    } else if (off && !required && known(budget, 0)) {
      result.reasoning = { mode: 'disabled' }
      ext.thinkingMode = 'budget'; ext.thinkingBudget = 0; delete ext.thinkingLevel
    } else {
      result.reasoning = { mode: 'enabled' }
      if (off) changed('reasoning.mode', sourceReasoning, required ? 'target_thinking_required' : 'target_off_control_unknown_provider_default')
      const legalBudget = ext.thinkingMode === 'budget' && known(budget, ext.thinkingBudget) && ext.thinkingBudget !== 0
      const legalLevel = ext.thinkingMode === 'level' && known(level, ext.thinkingLevel)
      if (!legalBudget && !legalLevel) {
        if (ext.thinkingMode !== 'default') changed('providerExtension', ext, 'target_native_thinking_control_provider_default')
        ext.thinkingMode = 'default'; delete ext.thinkingBudget; delete ext.thinkingLevel
        // Common effort has no defined numeric Budget equivalence. Only a documented Level domain is usable.
        if (!off && known(level, sourceReasoning?.mode === 'enabled' ? sourceReasoning.effort : undefined)) {
          ext.thinkingMode = 'level'; ext.thinkingLevel = (sourceReasoning as JsonObject).effort
          changed('reasoning.effort', sourceReasoning, 'target_documented_native_level')
        } else if (sourceReasoning?.mode === 'enabled' && sourceReasoning.effort !== undefined) {
          changed('reasoning.effort', sourceReasoning, 'target_has_no_equivalent_effort_provider_default')
        }
      }
    }
  }
  // Protocol codecs can have a narrower envelope than an unknown model field.
  if (['deepseek-stable-chat-v1', 'ollama-chat-v1', 'openai_chat_compatible', 'generic-local-openai-chat-completions', 'lmstudio-openresponses'].includes(protocol)) {
    for (const group of ['web', 'image']) {
      if ((result[group] as JsonObject).mode !== 'disabled') changed(group, result[group], 'target_codec_has_no_control')
      result[group] = { mode: 'disabled' }
    }
  }
  if (['generic-local-openai-chat-completions', 'ollama-chat-v1', 'openai_chat_compatible'].includes(protocol)) {
    if ((result.tools as JsonObject).mode !== 'disabled') changed('tools', result.tools, 'target_codec_has_no_tools')
    result.tools = { mode: 'disabled' }
  }
  if (protocol === 'generic-local-openai-chat-completions') result.reasoning = { mode: 'disabled' }
  if (!['openai-responses-v1', 'openrouter-images-v1', 'gemini-interactions-v1beta'].includes(protocol)) result.image = { mode: 'disabled' }
  if (['anthropic-messages-2023-06-01', 'gemini-generate-content-v1beta'].includes(protocol) && (result.web as JsonObject).mode === 'provider_search') {
    const web = result.web as JsonObject
    if (!(web.types as unknown[] | undefined)?.includes('web')) result.web = { mode: 'disabled' }
    else web.types = ['web']
  }
  if (protocol === 'anthropic-messages-2023-06-01' && (result.reasoning as JsonObject).mode === 'enabled') {
    const tools = result.tools as JsonObject
    if (tools.mode === 'enabled' && ['required', 'named'].includes((tools.toolChoice as JsonObject)?.mode as string)) {
      changed('tools.toolChoice', tools.toolChoice, 'target_thinking_requires_auto_tools')
      tools.toolChoice = { mode: 'auto' }
    }
  }
  if (protocol === 'openai-responses-v1') {
    // This codec represents text as input_text, not as a provider file reference.
    // Existing extracted text is inserted by the history authority after adaptation.
    const list = result.attachments as JsonObject[]
    result.attachments = list.filter((attachment, index) => {
      if (!attachment.include || attachment.sendAs !== 'inline_text') return true
      recordRequestAdaptationV2(operationId, { path: `attachments[${index}]`, outcome: 'converted', reason: 'target_inline_text_fallback', source: attachment })
      return false
    })
  }
  if (protocol === 'ollama-chat-v1' && (result.reasoning as JsonObject).mode === 'enabled' &&
    (result.reasoning as JsonObject).effort === undefined && allowed('reasoning.effort', 'medium')) {
    (result.reasoning as JsonObject).effort = 'medium'
  }
  if ((result.web as JsonObject).mode !== 'disabled' && !Array.isArray((result.web as JsonObject).types)) result.web = { mode: 'disabled' }
  if ((result.tools as JsonObject).mode !== 'disabled' && !Array.isArray((result.tools as JsonObject).allowedToolIds)) result.tools = { mode: 'disabled' }
  // Apply dependent domains after all groups have been projected onto the target.
  for (const group of ['generation', 'reasoning', 'web', 'image', 'tools', 'providerExtension']) {
    const value = result[group] as JsonObject
    for (const key of Object.keys(value)) {
      const field = fields.get(`${group}.${key}` as ModelCapabilitySemanticPathV2)
      const matches = field?.constraints.every(constraint => {
        const [otherGroup, otherKey] = constraint.path.split('.')
        const other = (result[otherGroup] as JsonObject | undefined)?.[otherKey]
        const included = constraint.values.includes(other as never)
        return constraint.kind === 'requires_value' ? included : !included
      }) ?? true
      if (matches || key === 'kind' || key === 'mode') continue
      changed(`${group}.${key}`, value[key], 'target_dependent_control_unavailable')
      delete value[key]
    }
  }
  const attachments = (result.attachments ?? []) as JsonObject[]
  let inlineWireBytes = 0
  result.attachments = attachments.filter((attachment, index) => {
    if (!attachment.include) return true
    const transportSupported = supportsGenerationAttachmentTransportV2({ protocolContractId: protocol,
      operation: binding.operation, attachmentKind: attachment.kind as 'managed_file' | 'url_reference',
      mediaKind: attachment.mediaKind as string | undefined })
    const metadata = attachmentMetadata?.get(attachment.assetRevisionId as string)
    if (metadata && transportSupported && !protocol.startsWith('openai-responses')) {
      const inlineTarget = protocol.startsWith('openrouter-chat') || protocol.startsWith('gemini-generate-content')
      const nextSendAs = inlineTarget && metadata.mime.startsWith('text/') ? 'inline_text'
        : inlineTarget && metadata.assetKind === 'image' && metadata.mime.startsWith('image/') && attachment.conversion === 'none' ? 'image_reference'
          : attachment.sendAs === 'converted_document' && attachment.conversion === 'plain_text' ? 'inline_text' : attachment.sendAs
      if (nextSendAs !== attachment.sendAs) {
        recordRequestAdaptationV2(operationId, { path: `attachments[${index}].sendAs`, outcome: 'converted', reason: 'target_inline_revision_encoding', source: attachment.sendAs })
        attachment.sendAs = nextSendAs
      }
    }
    const nativeShape = !metadata || (protocol.startsWith('openai-responses')
      ? attachment.sendAs !== 'image_reference' || metadata.assetKind === 'image' && ['image/png', 'image/jpeg', 'image/webp', 'image/gif'].includes(metadata.mime)
      : protocol.startsWith('anthropic-messages')
        ? attachment.sendAs === 'provider_file' || attachment.conversion === 'pdf' || attachment.sendAs === 'inline_text' && metadata.mime.startsWith('text/') || attachment.sendAs === 'image_reference' && metadata.assetKind === 'image' && ['image/png', 'image/jpeg', 'image/webp', 'image/gif'].includes(metadata.mime)
        : protocol.startsWith('openrouter-chat') || protocol.startsWith('gemini-generate-content')
          ? attachment.sendAs === 'inline_text' && metadata.mime.startsWith('text/') || attachment.sendAs === 'image_reference' && metadata.assetKind === 'image' && metadata.mime.startsWith('image/') || metadata.mime === 'application/pdf' || protocol.startsWith('gemini-generate-content') && /^(audio|video)\//u.test(metadata.mime) && metadata.sizeBytes <= 4 * 1024 * 1024
          : true)
    const inline = metadata && (protocol.startsWith('openrouter-chat') || protocol.startsWith('gemini-generate-content') || attachment.sendAs === 'image_reference' || attachment.sendAs === 'inline_text')
    const inlineLimit = protocol.startsWith('openai-responses') ? Math.floor((4 * 1024 * 1024 - 256) * 3 / 4)
      : protocol.startsWith('gemini-generate-content') ? 4 * 1024 * 1024 : 12 * 1024 * 1024
    const encodedBytes = inline ? Math.ceil(metadata!.sizeBytes / 3) * 4 + 256 : 0
    const fits = !inline || metadata!.utf8Valid !== false && metadata!.sizeBytes <= inlineLimit &&
      inlineWireBytes + encodedBytes <= generationRequestBodyMaxBytesForContractV1(protocol) - GENERATION_PORTABLE_HISTORY_RESERVED_BYTES_V1
    const canEncode = transportSupported && nativeShape && fits
      && Object.entries(attachment).every(([key, value]) => !attachment.include || allowed(`attachments[].${key}`, value))
    if (canEncode) { inlineWireBytes += encodedBytes; return true }
    recordRequestAdaptationV2(operationId, { path: `attachments[${index}]`, outcome: 'deferred',
      reason: 'target_attachment_encoding_unavailable', source: attachment })
    return false
  })
  const effective = decodeResolvedGenerationIntentV2(result)
  if (JSON.stringify(original) !== JSON.stringify(projectGenerationIntentLayerV2(effective.value))) {
    recordRequestAdaptationV2(operationId, { path: 'requestedIntent', outcome: 'preserved',
      reason: 'original_user_intent_retained_for_replay', source: original })
  }
  return effective
}
