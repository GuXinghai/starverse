import type { SemanticConsumptionLedgerEntryV2 } from '../../compiler/semanticConsumptionLedgerV2'
import type { ResolvedGenerationIntentV2 } from '../../domain/resolvedGenerationIntentV2'
import type { CompatibleRequestFieldSettings } from '../../../../shared/provider/openai-chat-compatible/request/buildCompatibleChatRequest'
import type { CompatibleJsonValue, CompatibleReasoningControlState } from '../../../../shared/provider/openai-chat-compatible/request/messageTypes'

export class OpenAIChatCompatibleIntentProjectionV2Error extends Error {
  constructor(readonly code: 'GENERATION_V2_OPENAI_COMPATIBLE_EXPLICIT_FIELD_UNSUPPORTED') {
    super(code)
    this.name = 'OpenAIChatCompatibleIntentProjectionV2Error'
  }
}

export type OpenAIChatCompatibleIntentProjectionV2 = Readonly<{
  fields: CompatibleRequestFieldSettings
  reasoningControls: CompatibleReasoningControlState
  ledgerEntries: readonly SemanticConsumptionLedgerEntryV2[]
}>

function encoded(path: string, nativeField: string): SemanticConsumptionLedgerEntryV2 {
  return Object.freeze({ kind: 'consumed', path, disposition: 'encoded', nativeField, evidence: 'openai_chat_compatible' })
}
function accepted(path: string): SemanticConsumptionLedgerEntryV2 {
  return Object.freeze({ kind: 'consumed', path, disposition: 'accepted_no_wire', nativeField: null, evidence: 'openai_chat_compatible' })
}
function unsupported(): never {
  throw new OpenAIChatCompatibleIntentProjectionV2Error('GENERATION_V2_OPENAI_COMPATIBLE_EXPLICIT_FIELD_UNSUPPORTED')
}

/**
 * Converts only reviewed V2 semantics to the compatible builder's owned
 * standard fields and restricted reasoning DSL inputs. Everything else is
 * rejected before a request body can exist.
 */
export function projectOpenAIChatCompatibleIntentV2(
  intent: ResolvedGenerationIntentV2,
  mappedReasoningSourceFields: readonly string[] = [],
): OpenAIChatCompatibleIntentProjectionV2 {
  const fields: CompatibleRequestFieldSettings = {}
  const ledger: SemanticConsumptionLedgerEntryV2[] = []
  const set = <K extends keyof CompatibleRequestFieldSettings>(key: K, path: string, nativeField: string, value: CompatibleJsonValue) => {
    fields[key] = { state: 'explicit', value } as CompatibleRequestFieldSettings[K]
    ledger.push(encoded(path, nativeField))
  }
  const generation = intent.generation
  if (generation.maxOutputTokens !== undefined) set('max_tokens', 'generation.maxOutputTokens', 'max_tokens', generation.maxOutputTokens)
  if (generation.temperature !== undefined) set('temperature', 'generation.temperature', 'temperature', generation.temperature)
  if (generation.topP !== undefined) set('top_p', 'generation.topP', 'top_p', generation.topP)
  if (generation.stop !== undefined) set('stop', 'generation.stop', 'stop', [...generation.stop])
  if (generation.seed !== undefined) set('seed', 'generation.seed', 'seed', generation.seed)
  if (generation.frequencyPenalty !== undefined) set('frequency_penalty', 'generation.frequencyPenalty', 'frequency_penalty', generation.frequencyPenalty)
  if (generation.presencePenalty !== undefined) set('presence_penalty', 'generation.presencePenalty', 'presence_penalty', generation.presencePenalty)
  if (generation.topK !== undefined || generation.minP !== undefined || generation.topA !== undefined ||
      generation.candidateCount !== undefined || generation.repetitionPenalty !== undefined) unsupported()

  let reasoningControls: CompatibleReasoningControlState
  if (intent.reasoning.mode === 'disabled') {
    if (mappedReasoningSourceFields.includes('reasoning_enabled')) {
      reasoningControls = Object.freeze({ reasoning_enabled: { state: 'explicit', value: false } })
      ledger.push(encoded('reasoning.mode', 'request mapping:reasoning_enabled'))
    } else {
      reasoningControls = Object.freeze({})
      ledger.push(accepted('reasoning.mode'))
    }
  } else {
    reasoningControls = Object.freeze({
      reasoning_enabled: { state: 'explicit', value: true },
      ...(intent.reasoning.effort === undefined ? {} : { reasoning_effort: { state: 'explicit' as const, value: intent.reasoning.effort } }),
    })
    ledger.push(encoded('reasoning.mode', 'request mapping:reasoning_enabled'))
    if (intent.reasoning.effort !== undefined) ledger.push(encoded('reasoning.effort', 'request mapping:reasoning_effort'))
    if (intent.reasoning.summary !== undefined || intent.reasoning.exclude !== undefined) unsupported()
  }
  if (intent.web.mode !== 'disabled' || intent.image.mode !== 'disabled' || intent.attachments.length !== 0 ||
      intent.providerExtension.kind !== 'none') unsupported()
  ledger.push(accepted('web.mode'), accepted('image.mode'), accepted('attachments'), accepted('providerExtension.kind'))
  if (intent.tools.mode !== 'disabled') unsupported()
  ledger.push(accepted('tools.mode'))
  return Object.freeze({ fields: Object.freeze(fields), reasoningControls, ledgerEntries: Object.freeze(ledger) })
}
