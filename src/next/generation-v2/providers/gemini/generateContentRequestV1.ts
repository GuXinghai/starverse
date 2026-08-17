import { ImmutablePreparedBodyV2, stableSerializeProviderRequestBoundedV2 } from '../../compiler/stableSerialize'
import { GENERATION_INTENT_OPEN_STRING_MAX_LENGTH_V2 } from '../../domain/generationIntentV2'
import {
  decodeGeminiGenerateContentNativeContentV1,
  type GeminiGenerateContentNativeContentV1,
  type GeminiGenerateContentNativeHistoryArtifactV1,
} from './generateContentNativeHistoryV1'

export const GEMINI_GENERATE_CONTENT_REQUEST_MAX_BYTES_V1 = 20 * 1_024 * 1_024

export type GeminiGenerateContentFunctionDeclarationV1 = Readonly<{
  name: string
  description?: string
  parameters?: Readonly<Record<string, unknown>>
}>

export type GeminiGenerateContentRequestV1 = Readonly<{
  contents: readonly GeminiGenerateContentNativeContentV1[]
  systemInstruction?: Readonly<{ parts: readonly Readonly<{ text: string }>[] }>
  generationConfig: Readonly<{
    temperature?: number
    topP?: number
    topK?: number
    maxOutputTokens?: number
    stopSequences?: readonly string[]
    presencePenalty?: number
    frequencyPenalty?: number
    seed?: number
    responseMimeType?: 'text/plain' | 'application/json'
    thinkingConfig?: Readonly<{
      thinkingBudget?: number
      thinkingLevel?: string
      includeThoughts?: boolean
    }>
  }>
  tools?: readonly Readonly<{
    functionDeclarations?: readonly GeminiGenerateContentFunctionDeclarationV1[]
    googleSearch?: Readonly<Record<never, never>>
  }>[]
  toolConfig?: Readonly<{ functionCallingConfig: Readonly<{
    mode: 'AUTO' | 'NONE' | 'ANY'
    allowedFunctionNames?: readonly string[]
  }> }>
}>

export class GeminiGenerateContentRequestV1Error extends Error {
  constructor(readonly code:
    | 'GENERATION_V2_GEMINI_REQUEST_INVALID'
    | 'GENERATION_V2_GEMINI_REQUEST_UNSUPPORTED'
    | 'GENERATION_V2_GEMINI_REQUEST_LIMIT_EXCEEDED') {
    super(code)
    this.name = 'GeminiGenerateContentRequestV1Error'
  }
}

function record(value: unknown): Readonly<Record<string, unknown>> {
  if (!value || typeof value !== 'object' || Array.isArray(value) || Object.getPrototypeOf(value) !== Object.prototype) {
    throw new GeminiGenerateContentRequestV1Error('GENERATION_V2_GEMINI_REQUEST_INVALID')
  }
  return value as Readonly<Record<string, unknown>>
}

function number(value: unknown, min: number, max: number): number {
  if (typeof value !== 'number' || !Number.isFinite(value) || value < min || value > max) {
    throw new GeminiGenerateContentRequestV1Error('GENERATION_V2_GEMINI_REQUEST_INVALID')
  }
  return value
}

function integer(value: unknown, min: number, max = Number.MAX_SAFE_INTEGER): number {
  if (!Number.isSafeInteger(value) || (value as number) < min || (value as number) > max) {
    throw new GeminiGenerateContentRequestV1Error('GENERATION_V2_GEMINI_REQUEST_INVALID')
  }
  return value as number
}

function cloneSchema(value: unknown): Readonly<Record<string, unknown>> {
  try {
    return Object.freeze(JSON.parse(stableSerializeProviderRequestBoundedV2(
      record(value), GEMINI_GENERATE_CONTENT_REQUEST_MAX_BYTES_V1,
    )) as Record<string, unknown>)
  } catch {
    throw new GeminiGenerateContentRequestV1Error('GENERATION_V2_GEMINI_REQUEST_INVALID')
  }
}

export function compileGeminiGenerateContentRequestV1(inputValue: unknown): Readonly<{
  classification: 'gemini_generate_content_v1beta_request_compilation_non_executable'
  executionAuthority: 'none'
  nativeRequest: GeminiGenerateContentRequestV1
  preparedBody: ImmutablePreparedBodyV2
}> {
  const input = record(inputValue)
  const allowedInput = ['priorArtifact', 'clientContents', 'replayContents', 'systemInstruction', 'generation', 'reasoning', 'webSearch', 'tools', 'toolChoice']
  const hasReplay = input.replayContents !== undefined
  if (Object.keys(input).some((key) => !allowedInput.includes(key)) ||
      (!hasReplay && !Array.isArray(input.clientContents)) ||
      (hasReplay && (!Array.isArray(input.replayContents) || input.priorArtifact !== undefined || input.clientContents !== undefined))) {
    throw new GeminiGenerateContentRequestV1Error('GENERATION_V2_GEMINI_REQUEST_INVALID')
  }
  const replayContents = hasReplay ? input.replayContents as readonly unknown[] : null
  const clientInputContents = hasReplay ? null : input.clientContents as readonly unknown[]
  const prior = hasReplay ? null : input.priorArtifact as GeminiGenerateContentNativeHistoryArtifactV1 | null
  const clientContents = hasReplay
    ? replayContents!.map(decodeGeminiGenerateContentNativeContentV1)
    : clientInputContents!.map(decodeGeminiGenerateContentNativeContentV1)
  const contents = Object.freeze(hasReplay ? clientContents : [...(prior?.orderedContents ?? []), ...clientContents])
  if (contents.length === 0) throw new GeminiGenerateContentRequestV1Error('GENERATION_V2_GEMINI_REQUEST_INVALID')

  const generation = input.generation === undefined ? {} : record(input.generation)
  const allowedGeneration = ['temperature', 'topP', 'topK', 'maxOutputTokens', 'stopSequences', 'presencePenalty', 'frequencyPenalty', 'seed', 'responseMimeType']
  if (Object.keys(generation).some((key) => !allowedGeneration.includes(key))) {
    throw new GeminiGenerateContentRequestV1Error('GENERATION_V2_GEMINI_REQUEST_UNSUPPORTED')
  }
  const stopSequences = generation.stopSequences === undefined ? undefined : (() => {
    if (!Array.isArray(generation.stopSequences) || generation.stopSequences.length > 5 ||
        generation.stopSequences.some((item) => typeof item !== 'string' || item.length === 0)) {
      throw new GeminiGenerateContentRequestV1Error('GENERATION_V2_GEMINI_REQUEST_INVALID')
    }
    return Object.freeze([...generation.stopSequences] as string[])
  })()
  if (generation.responseMimeType !== undefined &&
      generation.responseMimeType !== 'text/plain' && generation.responseMimeType !== 'application/json') {
    throw new GeminiGenerateContentRequestV1Error('GENERATION_V2_GEMINI_REQUEST_INVALID')
  }

  const reasoning: Readonly<Record<string, unknown>> = input.reasoning === undefined
    ? Object.freeze({ mode: 'disabled' }) : record(input.reasoning)
  if (reasoning.mode !== 'disabled' && reasoning.mode !== 'enabled') {
    throw new GeminiGenerateContentRequestV1Error('GENERATION_V2_GEMINI_REQUEST_INVALID')
  }
  if (reasoning.mode === 'disabled' && Object.keys(reasoning).some((key) => key !== 'mode')) {
    throw new GeminiGenerateContentRequestV1Error('GENERATION_V2_GEMINI_REQUEST_INVALID')
  }
  if (reasoning.mode === 'enabled' && Object.keys(reasoning).some((key) =>
    !['mode', 'thinkingBudget', 'thinkingLevel', 'includeThoughts'].includes(key))) {
    throw new GeminiGenerateContentRequestV1Error('GENERATION_V2_GEMINI_REQUEST_UNSUPPORTED')
  }
  if (reasoning.thinkingBudget !== undefined && reasoning.thinkingLevel !== undefined) {
    throw new GeminiGenerateContentRequestV1Error('GENERATION_V2_GEMINI_REQUEST_INVALID')
  }
  if (reasoning.thinkingLevel !== undefined &&
      (typeof reasoning.thinkingLevel !== 'string' || reasoning.thinkingLevel.length === 0 || reasoning.thinkingLevel.length > GENERATION_INTENT_OPEN_STRING_MAX_LENGTH_V2)) {
    throw new GeminiGenerateContentRequestV1Error('GENERATION_V2_GEMINI_REQUEST_INVALID')
  }
  if (reasoning.includeThoughts !== undefined && typeof reasoning.includeThoughts !== 'boolean') {
    throw new GeminiGenerateContentRequestV1Error('GENERATION_V2_GEMINI_REQUEST_INVALID')
  }

  const tools = input.tools === undefined ? undefined : (() => {
    if (!Array.isArray(input.tools) || input.tools.length === 0 || input.tools.length > 128) {
      throw new GeminiGenerateContentRequestV1Error('GENERATION_V2_GEMINI_REQUEST_INVALID')
    }
    const names = new Set<string>()
    return Object.freeze(input.tools.map((raw) => {
      const tool = record(raw)
      if (Object.keys(tool).some((key) => !['name', 'description', 'parameters'].includes(key)) ||
          typeof tool.name !== 'string' || !/^[A-Za-z_][A-Za-z0-9_.:-]{0,63}$/u.test(tool.name) ||
          names.has(tool.name) || (tool.description !== undefined && typeof tool.description !== 'string')) {
        throw new GeminiGenerateContentRequestV1Error('GENERATION_V2_GEMINI_REQUEST_INVALID')
      }
      names.add(tool.name)
      return Object.freeze({ name: tool.name, ...(tool.description === undefined ? {} : { description: tool.description }),
        ...(tool.parameters === undefined ? {} : { parameters: cloneSchema(tool.parameters) }) })
    }))
  })()

  const toolChoice: Readonly<Record<string, unknown>> = input.toolChoice === undefined
    ? Object.freeze({ mode: 'provider_default' }) : record(input.toolChoice)
  if (!['provider_default', 'auto', 'none', 'required', 'named'].includes(String(toolChoice.mode)) ||
      Object.keys(toolChoice).some((key) => !['mode', 'name'].includes(key))) {
    throw new GeminiGenerateContentRequestV1Error('GENERATION_V2_GEMINI_REQUEST_INVALID')
  }
  if (toolChoice.mode !== 'provider_default' && !tools) {
    throw new GeminiGenerateContentRequestV1Error('GENERATION_V2_GEMINI_REQUEST_INVALID')
  }
  if (toolChoice.mode === 'named' &&
      (typeof toolChoice.name !== 'string' || !tools?.some((tool) => tool.name === toolChoice.name))) {
    throw new GeminiGenerateContentRequestV1Error('GENERATION_V2_GEMINI_REQUEST_INVALID')
  }
  if (toolChoice.mode !== 'named' && toolChoice.name !== undefined) {
    throw new GeminiGenerateContentRequestV1Error('GENERATION_V2_GEMINI_REQUEST_INVALID')
  }

  const thinkingConfig = reasoning.mode === 'enabled' ? Object.freeze({
    ...(reasoning.thinkingBudget === undefined ? {} : { thinkingBudget: integer(reasoning.thinkingBudget, -1) }),
    ...(reasoning.thinkingLevel === undefined ? {} : { thinkingLevel: reasoning.thinkingLevel as string }),
    ...(reasoning.includeThoughts === undefined ? {} : { includeThoughts: reasoning.includeThoughts as boolean }),
  }) : null
  const generationConfig = Object.freeze({
    ...(generation.temperature === undefined ? {} : { temperature: number(generation.temperature, 0, 2) }),
    ...(generation.topP === undefined ? {} : { topP: number(generation.topP, 0, 1) }),
    ...(generation.topK === undefined ? {} : { topK: integer(generation.topK, 1) }),
    ...(generation.maxOutputTokens === undefined ? {} : { maxOutputTokens: integer(generation.maxOutputTokens, 1) }),
    ...(stopSequences ? { stopSequences } : {}),
    ...(generation.presencePenalty === undefined ? {} : { presencePenalty: number(generation.presencePenalty, -2, 1.999999999) }),
    ...(generation.frequencyPenalty === undefined ? {} : { frequencyPenalty: number(generation.frequencyPenalty, -2, 1.999999999) }),
    ...(generation.seed === undefined ? {} : { seed: integer(generation.seed, 0) }),
    ...(generation.responseMimeType === undefined ? {} : { responseMimeType: generation.responseMimeType as 'text/plain' | 'application/json' }),
    ...(thinkingConfig && Object.keys(thinkingConfig).length > 0 ? { thinkingConfig } : {}),
  })
  const nativeTools = Object.freeze([
    ...(tools ? [Object.freeze({ functionDeclarations: tools })] : []),
    ...(input.webSearch === true ? [Object.freeze({ googleSearch: Object.freeze({}) })] : []),
  ])
  if (input.webSearch !== undefined && typeof input.webSearch !== 'boolean') {
    throw new GeminiGenerateContentRequestV1Error('GENERATION_V2_GEMINI_REQUEST_INVALID')
  }
  const mode = toolChoice.mode === 'auto' ? 'AUTO' : toolChoice.mode === 'none' ? 'NONE' :
    toolChoice.mode === 'required' || toolChoice.mode === 'named' ? 'ANY' : null
  const nativeRequest: GeminiGenerateContentRequestV1 = Object.freeze({
    contents,
    ...(typeof input.systemInstruction === 'string' && input.systemInstruction.length > 0
      ? { systemInstruction: Object.freeze({ parts: Object.freeze([Object.freeze({ text: input.systemInstruction })]) }) }
      : input.systemInstruction === undefined ? {} : (() => { throw new GeminiGenerateContentRequestV1Error('GENERATION_V2_GEMINI_REQUEST_INVALID') })()),
    generationConfig,
    ...(nativeTools.length > 0 ? { tools: nativeTools } : {}),
    ...(mode ? { toolConfig: Object.freeze({ functionCallingConfig: Object.freeze({
      mode,
      ...(toolChoice.mode === 'named' ? { allowedFunctionNames: Object.freeze([toolChoice.name as string]) } : {}),
    }) }) } : {}),
  })
  let preparedBody: ImmutablePreparedBodyV2
  try {
    preparedBody = ImmutablePreparedBodyV2.fromNativeRequestWithMaxBytes(
      nativeRequest, GEMINI_GENERATE_CONTENT_REQUEST_MAX_BYTES_V1,
    )
  } catch {
    throw new GeminiGenerateContentRequestV1Error('GENERATION_V2_GEMINI_REQUEST_LIMIT_EXCEEDED')
  }
  return Object.freeze({
    classification: 'gemini_generate_content_v1beta_request_compilation_non_executable',
    executionAuthority: 'none',
    nativeRequest,
    preparedBody,
  })
}
