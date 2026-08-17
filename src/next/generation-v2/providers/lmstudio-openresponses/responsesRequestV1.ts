import { ImmutablePreparedBodyV2, stableSerializeProviderRequestBoundedV2 } from '../../compiler/stableSerialize'
import { GENERATION_INTENT_OPEN_STRING_MAX_LENGTH_V2 } from '../../domain/generationIntentV2'
import { buildLmStudioOpenResponsesReplayInputV1, type LmStudioOpenResponsesContinuationArtifactV1 } from './continuationArtifactV1'
import { decodeLmStudioOpenResponsesReplayItemsV1,
  type LmStudioOpenResponsesClientItemV1, type LmStudioOpenResponsesReplayItemV1 } from './nativeItemsV1'

const MAX_REQUEST_BYTES = 24 * 1_024 * 1_024
export type LmStudioOpenResponsesFunctionToolV1 = Readonly<{
  type: 'function'; name: string; description?: string; parameters: Readonly<Record<string, unknown>>; strict: true
}>
export type LmStudioOpenResponsesToolChoiceV1 = 'none' | 'required'
export type LmStudioOpenResponsesRequestV1 = Readonly<{
  model: string
  input: readonly LmStudioOpenResponsesReplayItemV1[]
  stream: true
  store: false
  temperature?: number
  top_p?: number
  max_output_tokens?: number
  frequency_penalty?: number
  presence_penalty?: number
  reasoning?: Readonly<{ effort: string }>
  tools?: readonly LmStudioOpenResponsesFunctionToolV1[]
  tool_choice?: LmStudioOpenResponsesToolChoiceV1
}>
export type LmStudioOpenResponsesRequestCompilationV1 = Readonly<{
  nativeRequest: LmStudioOpenResponsesRequestV1
  preparedBody: ImmutablePreparedBodyV2
}>
export class LmStudioOpenResponsesRequestV1Error extends Error {
  constructor(readonly code:
    | 'GENERATION_V2_LMSTUDIO_REQUEST_INVALID_VALUE'
    | 'GENERATION_V2_LMSTUDIO_REQUEST_UNSUPPORTED_EXPLICIT_FIELD') {
    super(code); this.name = 'LmStudioOpenResponsesRequestV1Error'
  }
}
function fail(code: LmStudioOpenResponsesRequestV1Error['code']): never { throw new LmStudioOpenResponsesRequestV1Error(code) }
function finite(value: unknown, min: number, max: number): number | undefined {
  if (value === undefined) return undefined
  if (typeof value !== 'number' || !Number.isFinite(value) || value < min || value > max) return fail('GENERATION_V2_LMSTUDIO_REQUEST_INVALID_VALUE')
  return value
}
function schema(value: unknown): Readonly<Record<string, unknown>> {
  if (!value || typeof value !== 'object' || Array.isArray(value)) return fail('GENERATION_V2_LMSTUDIO_REQUEST_INVALID_VALUE')
  return Object.freeze(JSON.parse(stableSerializeProviderRequestBoundedV2(value, 1024 * 1024)) as Record<string, unknown>)
}
function tools(value: unknown): readonly LmStudioOpenResponsesFunctionToolV1[] | undefined {
  if (value === undefined) return undefined
  if (!Array.isArray(value) || value.length < 1 || value.length > 128) return fail('GENERATION_V2_LMSTUDIO_REQUEST_INVALID_VALUE')
  const names = new Set<string>()
  return Object.freeze(value.map((raw) => {
    if (!raw || typeof raw !== 'object' || Array.isArray(raw) || Object.getPrototypeOf(raw) !== Object.prototype) return fail('GENERATION_V2_LMSTUDIO_REQUEST_INVALID_VALUE')
    const item = raw as Record<string, unknown>
    if (Object.keys(item).some((key) => !['type', 'name', 'description', 'parameters', 'strict'].includes(key)) ||
        item.type !== 'function' || typeof item.name !== 'string' || !/^[A-Za-z0-9_-]{1,64}$/u.test(item.name) || names.has(item.name) ||
        (item.description !== undefined && typeof item.description !== 'string') || item.strict !== true) return fail('GENERATION_V2_LMSTUDIO_REQUEST_INVALID_VALUE')
    names.add(item.name)
    return Object.freeze({ type: 'function' as const, name: item.name,
      ...(item.description === undefined ? {} : { description: item.description }), parameters: schema(item.parameters), strict: true })
  }))
}

export function compileLmStudioOpenResponsesRequestV1(input: Readonly<{
  model: unknown
  priorArtifact?: LmStudioOpenResponsesContinuationArtifactV1 | null
  clientItems?: readonly LmStudioOpenResponsesClientItemV1[]
  replayItems?: readonly LmStudioOpenResponsesReplayItemV1[]
  generation?: Readonly<{ temperature?: number; topP?: number; maxOutputTokens?: number;
    frequencyPenalty?: number; presencePenalty?: number }>
  reasoningEffort?: string
  tools?: unknown
  toolChoice?: LmStudioOpenResponsesToolChoiceV1
}>): LmStudioOpenResponsesRequestCompilationV1 {
  if (typeof input.model !== 'string' || input.model.length < 1 || input.model.length > 512 || input.model.trim() !== input.model) {
    return fail('GENERATION_V2_LMSTUDIO_REQUEST_INVALID_VALUE')
  }
  const generation = input.generation ?? {}
  const temperature = finite(generation.temperature, 0, 2)
  const topP = finite(generation.topP, 0, 1)
  const frequencyPenalty = finite(generation.frequencyPenalty, -2, 2)
  const presencePenalty = finite(generation.presencePenalty, -2, 2)
  if (generation.maxOutputTokens !== undefined && (!Number.isSafeInteger(generation.maxOutputTokens) || generation.maxOutputTokens < 1)) {
    return fail('GENERATION_V2_LMSTUDIO_REQUEST_INVALID_VALUE')
  }
  const explicitReplay = input.replayItems !== undefined
  if (explicitReplay && (input.priorArtifact !== undefined || input.clientItems !== undefined)) {
    return fail('GENERATION_V2_LMSTUDIO_REQUEST_INVALID_VALUE')
  }
  if (!explicitReplay && (!Array.isArray(input.clientItems) || input.priorArtifact === undefined)) {
    return fail('GENERATION_V2_LMSTUDIO_REQUEST_INVALID_VALUE')
  }
  const replay = explicitReplay
    ? decodeLmStudioOpenResponsesReplayItemsV1(input.replayItems)
    : buildLmStudioOpenResponsesReplayInputV1({ priorArtifact: input.priorArtifact!, clientItems: input.clientItems! })
  const functionTools = tools(input.tools)
  if (input.reasoningEffort !== undefined && (typeof input.reasoningEffort !== 'string' || input.reasoningEffort.length === 0 || input.reasoningEffort.length > GENERATION_INTENT_OPEN_STRING_MAX_LENGTH_V2)) {
    return fail('GENERATION_V2_LMSTUDIO_REQUEST_INVALID_VALUE')
  }
  if (input.toolChoice !== undefined && input.toolChoice !== 'none' && input.toolChoice !== 'required') {
    return fail('GENERATION_V2_LMSTUDIO_REQUEST_UNSUPPORTED_EXPLICIT_FIELD')
  }
  if (input.toolChoice !== undefined && functionTools === undefined) return fail('GENERATION_V2_LMSTUDIO_REQUEST_INVALID_VALUE')
  const nativeRequest: LmStudioOpenResponsesRequestV1 = Object.freeze({
    model: input.model, input: replay, stream: true, store: false,
    ...(temperature === undefined ? {} : { temperature }), ...(topP === undefined ? {} : { top_p: topP }),
    ...(generation.maxOutputTokens === undefined ? {} : { max_output_tokens: generation.maxOutputTokens }),
    ...(frequencyPenalty === undefined ? {} : { frequency_penalty: frequencyPenalty }),
    ...(presencePenalty === undefined ? {} : { presence_penalty: presencePenalty }),
    ...(input.reasoningEffort === undefined ? {} : { reasoning: Object.freeze({ effort: input.reasoningEffort }) }),
    ...(functionTools === undefined ? {} : { tools: functionTools }),
    ...(input.toolChoice === undefined ? {} : { tool_choice: input.toolChoice }),
  })
  return Object.freeze({ nativeRequest,
    preparedBody: ImmutablePreparedBodyV2.fromNativeRequestWithMaxBytes(nativeRequest, MAX_REQUEST_BYTES) })
}
