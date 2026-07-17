import { sha256PreparedBytesV2, stableSerializeProviderRequestV2 } from '../../compiler/stableSerialize'
import { decodeOpenAIResponsesReturnedItemsV1 } from './nativeItemsV1'
import {
  isOpenAIResponsesTerminalResultV1,
  type OpenAIResponsesTerminalResultV1,
} from './responsesStreamV1'

export const OPENAI_RESPONSES_TERMINAL_ARTIFACT_KIND_V1 = 'openai_responses_terminal_v1' as const

export type OpenAIResponsesTerminalArtifactV1 = Readonly<{
  schemaVersion: 1
  kind: typeof OPENAI_RESPONSES_TERMINAL_ARTIFACT_KIND_V1
  terminalKind: 'completed' | 'failed' | 'incomplete'
  responseId: string
  model: string
  createdAt: number
  completedAt: number | null
  output: OpenAIResponsesTerminalResultV1['output']
  visibleText: string
  reasoningSummaryText: string
  usage: OpenAIResponsesTerminalResultV1['usage']
  error: OpenAIResponsesTerminalResultV1['error']
  incompleteReason: string | null
  artifactHash: string
  canonicalJson: string
}>

export class OpenAIResponsesTerminalArtifactV1Error extends Error {
  constructor(readonly code: 'GENERATION_V2_OPENAI_TERMINAL_ARTIFACT_INVALID') {
    super(code)
    this.name = 'OpenAIResponsesTerminalArtifactV1Error'
  }
}

const artifacts = new WeakSet<object>()
function invalid(): never { throw new OpenAIResponsesTerminalArtifactV1Error('GENERATION_V2_OPENAI_TERMINAL_ARTIFACT_INVALID') }

function exactObject(value: unknown, keys: readonly string[]): Readonly<Record<string, unknown>> {
  if (!value || typeof value !== 'object' || Array.isArray(value) || Object.getPrototypeOf(value) !== Object.prototype ||
      Reflect.ownKeys(value).some((key) => typeof key !== 'string') ||
      Object.keys(value).sort().join('\0') !== [...keys].sort().join('\0')) return invalid()
  const descriptors = Object.getOwnPropertyDescriptors(value)
  if (Object.values(descriptors).some((descriptor) => !descriptor.enumerable || !('value' in descriptor) || descriptor.value === undefined)) {
    return invalid()
  }
  return Object.freeze(Object.fromEntries(Object.entries(descriptors).map(([key, descriptor]) => [key, descriptor.value])))
}

function boundedString(value: unknown, allowEmpty = false): string {
  if (typeof value !== 'string' || (!allowEmpty && value.length === 0) || value.length > 4 * 1024 * 1024 || /\u0000/u.test(value)) {
    return invalid()
  }
  return value
}

function nonnegativeInteger(value: unknown): number {
  if (!Number.isSafeInteger(value) || (value as number) < 0) return invalid()
  return value as number
}

function nullableNonnegativeInteger(value: unknown): number | null {
  return value === null ? null : nonnegativeInteger(value)
}

function decodeUsage(value: unknown): OpenAIResponsesTerminalResultV1['usage'] {
  if (value === null) return null
  const input = exactObject(value, [
    'inputTokens', 'outputTokens', 'totalTokens', 'cachedInputTokens', 'reasoningTokens',
  ])
  return Object.freeze({
    inputTokens: nonnegativeInteger(input.inputTokens),
    outputTokens: nonnegativeInteger(input.outputTokens),
    totalTokens: nonnegativeInteger(input.totalTokens),
    cachedInputTokens: nullableNonnegativeInteger(input.cachedInputTokens),
    reasoningTokens: nullableNonnegativeInteger(input.reasoningTokens),
  })
}

function decodeError(value: unknown): OpenAIResponsesTerminalResultV1['error'] {
  if (value === null) return null
  const input = exactObject(value, ['code', 'message'])
  return Object.freeze({ code: boundedString(input.code), message: boundedString(input.message) })
}

function projection(result: OpenAIResponsesTerminalResultV1) {
  return Object.freeze({
    schemaVersion: 1 as const,
    kind: OPENAI_RESPONSES_TERMINAL_ARTIFACT_KIND_V1,
    terminalKind: result.terminalKind,
    responseId: result.responseId,
    model: result.model,
    createdAt: result.createdAt,
    completedAt: result.completedAt,
    output: result.output,
    visibleText: result.visibleText,
    reasoningSummaryText: result.reasoningSummaryText,
    usage: result.usage,
    error: result.error,
    incompleteReason: result.incompleteReason,
  })
}

function issue(result: OpenAIResponsesTerminalResultV1): OpenAIResponsesTerminalArtifactV1 {
  const value = projection(result)
  const canonicalWithoutHash = stableSerializeProviderRequestV2(value)
  const artifactHash = sha256PreparedBytesV2(new TextEncoder().encode(canonicalWithoutHash))
  const canonicalJson = stableSerializeProviderRequestV2({ ...value, artifactHash })
  const artifact = Object.freeze({ ...value, artifactHash, canonicalJson })
  artifacts.add(artifact)
  return artifact
}

export function createOpenAIResponsesTerminalArtifactV1(
  result: OpenAIResponsesTerminalResultV1,
): OpenAIResponsesTerminalArtifactV1 {
  if (!isOpenAIResponsesTerminalResultV1(result)) return invalid()
  return issue(result)
}

export function isOpenAIResponsesTerminalArtifactV1(value: unknown): value is OpenAIResponsesTerminalArtifactV1 {
  return Boolean(value && typeof value === 'object' && artifacts.has(value))
}

export function decodeOpenAIResponsesTerminalArtifactV1(canonicalJson: string): OpenAIResponsesTerminalArtifactV1 {
  if (typeof canonicalJson !== 'string' || canonicalJson.length === 0 || Buffer.byteLength(canonicalJson, 'utf8') > 64 * 1024 * 1024) {
    return invalid()
  }
  let raw: Record<string, unknown>
  try { raw = JSON.parse(canonicalJson) as Record<string, unknown> } catch { return invalid() }
  raw = exactObject(raw, [
    'artifactHash', 'completedAt', 'createdAt', 'error', 'incompleteReason', 'kind', 'model', 'output',
    'reasoningSummaryText', 'responseId', 'schemaVersion', 'terminalKind', 'usage', 'visibleText',
  ]) as Record<string, unknown>
  let output
  try { output = decodeOpenAIResponsesReturnedItemsV1(raw.output) } catch { return invalid() }
  const terminalKind = raw.terminalKind
  const error = decodeError(raw.error)
  const usage = decodeUsage(raw.usage)
  const incompleteReason = raw.incompleteReason === null ? null : boundedString(raw.incompleteReason)
  const responseId = boundedString(raw.responseId)
  const model = boundedString(raw.model)
  const visibleText = boundedString(raw.visibleText, true)
  const reasoningSummaryText = boundedString(raw.reasoningSummaryText, true)
  const artifactHash = boundedString(raw.artifactHash)
  if (raw.schemaVersion !== 1 || raw.kind !== OPENAI_RESPONSES_TERMINAL_ARTIFACT_KIND_V1 ||
      (terminalKind !== 'completed' && terminalKind !== 'failed' && terminalKind !== 'incomplete') ||
      !/^[a-f0-9]{64}$/u.test(artifactHash) ||
      (terminalKind === 'failed') !== Boolean(error) ||
      (terminalKind === 'incomplete') !== Boolean(incompleteReason)) return invalid()
  const projectedVisibleText = output.flatMap((item) => item.type === 'message'
    ? item.content.map((part) => part.type === 'output_text' ? part.text : part.refusal) : []).join('')
  const projectedReasoningSummaryText = output.flatMap((item) => item.type === 'reasoning'
    ? item.summary.map((part) => part.text) : []).join('')
  if (visibleText !== projectedVisibleText || reasoningSummaryText !== projectedReasoningSummaryText) return invalid()
  const synthetic = Object.freeze({
    terminalKind, responseId, model, createdAt: nonnegativeInteger(raw.createdAt),
    completedAt: nullableNonnegativeInteger(raw.completedAt), output, visibleText,
    reasoningSummaryText, usage,
    error, incompleteReason,
  }) as OpenAIResponsesTerminalResultV1
  const value = projection(synthetic)
  const expectedHash = sha256PreparedBytesV2(new TextEncoder().encode(stableSerializeProviderRequestV2(value)))
  if (artifactHash !== expectedHash || stableSerializeProviderRequestV2({ ...value, artifactHash: expectedHash }) !== canonicalJson) {
    return invalid()
  }
  const artifact = Object.freeze({ ...value, artifactHash: expectedHash, canonicalJson })
  artifacts.add(artifact)
  return artifact
}
