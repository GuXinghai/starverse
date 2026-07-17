import { createHash } from 'node:crypto'
import { stableSerializeProviderRequestV2 } from '../../compiler/stableSerialize'
import {
  decodeDeepSeekNativeMessageV1,
  type DeepSeekNativeAssistantMessageV1,
} from './nativeMessagesV1'
import {
  isDeepSeekStableStreamResultV1,
  type DeepSeekStableFinishReasonV1,
  type DeepSeekStableStreamResultV1,
  type DeepSeekStableUsageV1,
} from './chatStreamV1'

export const DEEPSEEK_STABLE_TERMINAL_ARTIFACT_KIND_V1 = 'deepseek_stable_terminal_result_v1'
export const DEEPSEEK_STABLE_TERMINAL_ARTIFACT_CODEC_VERSION_V1 = 1

export type DeepSeekStableTerminalArtifactV1 = Readonly<{
  artifactKind: typeof DEEPSEEK_STABLE_TERMINAL_ARTIFACT_KIND_V1
  artifactCodecVersion: typeof DEEPSEEK_STABLE_TERMINAL_ARTIFACT_CODEC_VERSION_V1
  assistantMessage: DeepSeekNativeAssistantMessageV1
  generatedWithThinking: 'enabled' | 'disabled'
  finishReason: DeepSeekStableFinishReasonV1
  usage: DeepSeekStableUsageV1
  responseMetadata: Readonly<{
    id: string
    model: string
    created: number
    systemFingerprint: string
  }>
  artifactHash: string
}>

export class DeepSeekStableTerminalArtifactV1Error extends Error {
  constructor(readonly code: 'GENERATION_V2_DEEPSEEK_TERMINAL_ARTIFACT_INVALID') {
    super(code)
    this.name = 'DeepSeekStableTerminalArtifactV1Error'
  }
}

const artifacts = new WeakSet<object>()
const FINISH_REASONS = new Set<DeepSeekStableFinishReasonV1>([
  'stop', 'length', 'content_filter', 'tool_calls', 'insufficient_system_resource',
])

function invalid(): never {
  throw new DeepSeekStableTerminalArtifactV1Error('GENERATION_V2_DEEPSEEK_TERMINAL_ARTIFACT_INVALID')
}

function record(value: unknown, keys: readonly string[]): Record<string, unknown> {
  if (!value || typeof value !== 'object' || Array.isArray(value) || Object.getPrototypeOf(value) !== Object.prototype ||
      Reflect.ownKeys(value).some((key) => typeof key !== 'string') ||
      Object.keys(value).length !== keys.length || keys.some((key) => !Object.hasOwn(value, key))) invalid()
  const descriptors = Object.getOwnPropertyDescriptors(value)
  if (Object.values(descriptors).some((descriptor) => !descriptor.enumerable || !('value' in descriptor) ||
      descriptor.value === undefined)) invalid()
  return Object.fromEntries(Object.entries(descriptors).map(([key, descriptor]) => [key, descriptor.value]))
}

function integer(value: unknown): number {
  if (!Number.isSafeInteger(value) || (value as number) < 0) invalid()
  return value as number
}

function nonempty(value: unknown, max = 16_384): string {
  if (typeof value !== 'string' || value.length < 1 || value.length > max || /\u0000/u.test(value)) invalid()
  return value
}

function usage(value: unknown): DeepSeekStableUsageV1 {
  if (!value || typeof value !== 'object' || Array.isArray(value)) invalid()
  const input = record(value, Object.keys(value).sort())
  const allowed = new Set([
    'prompt_tokens', 'completion_tokens', 'total_tokens', 'prompt_cache_hit_tokens',
    'prompt_cache_miss_tokens', 'completion_tokens_details',
  ])
  if (Object.keys(input).some((key) => !allowed.has(key)) ||
      !Object.hasOwn(input, 'prompt_tokens') || !Object.hasOwn(input, 'completion_tokens') ||
      !Object.hasOwn(input, 'total_tokens')) invalid()
  const promptTokens = integer(input.prompt_tokens)
  const completionTokens = integer(input.completion_tokens)
  const totalTokens = integer(input.total_tokens)
  if (totalTokens !== promptTokens + completionTokens) invalid()
  const details = input.completion_tokens_details === undefined ? undefined :
    record(input.completion_tokens_details, ['reasoning_tokens'])
  return Object.freeze({
    prompt_tokens: promptTokens,
    completion_tokens: completionTokens,
    total_tokens: totalTokens,
    ...(input.prompt_cache_hit_tokens === undefined ? {} :
      { prompt_cache_hit_tokens: integer(input.prompt_cache_hit_tokens) }),
    ...(input.prompt_cache_miss_tokens === undefined ? {} :
      { prompt_cache_miss_tokens: integer(input.prompt_cache_miss_tokens) }),
    ...(details === undefined ? {} : {
      completion_tokens_details: Object.freeze({ reasoning_tokens: integer(details.reasoning_tokens) }),
    }),
  })
}

function unsigned(artifact: Omit<DeepSeekStableTerminalArtifactV1, 'artifactHash'>): string {
  return stableSerializeProviderRequestV2(artifact)
}

function hash(artifact: Omit<DeepSeekStableTerminalArtifactV1, 'artifactHash'>): string {
  return createHash('sha256').update(unsigned(artifact), 'utf8').digest('hex')
}

function issue(input: Omit<DeepSeekStableTerminalArtifactV1, 'artifactHash'>): DeepSeekStableTerminalArtifactV1 {
  const artifact = Object.freeze({ ...input, artifactHash: hash(input) })
  artifacts.add(artifact)
  return artifact
}

export function createDeepSeekStableTerminalArtifactV1(
  result: DeepSeekStableStreamResultV1,
): DeepSeekStableTerminalArtifactV1 {
  if (!isDeepSeekStableStreamResultV1(result) || !result.usage) invalid()
  return issue(Object.freeze({
    artifactKind: DEEPSEEK_STABLE_TERMINAL_ARTIFACT_KIND_V1,
    artifactCodecVersion: DEEPSEEK_STABLE_TERMINAL_ARTIFACT_CODEC_VERSION_V1,
    assistantMessage: result.assistantMessage,
    generatedWithThinking: result.generatedWithThinking,
    finishReason: result.finishReason,
    usage: result.usage,
    responseMetadata: result.responseMetadata,
  }))
}

export function decodeDeepSeekStableTerminalArtifactV1(value: unknown): DeepSeekStableTerminalArtifactV1 {
  const input = record(value, [
    'artifactKind', 'artifactCodecVersion', 'assistantMessage', 'generatedWithThinking',
    'finishReason', 'usage', 'responseMetadata', 'artifactHash',
  ])
  if (input.artifactKind !== DEEPSEEK_STABLE_TERMINAL_ARTIFACT_KIND_V1 ||
      input.artifactCodecVersion !== DEEPSEEK_STABLE_TERMINAL_ARTIFACT_CODEC_VERSION_V1 ||
      (input.generatedWithThinking !== 'enabled' && input.generatedWithThinking !== 'disabled') ||
      typeof input.finishReason !== 'string' || !FINISH_REASONS.has(input.finishReason as DeepSeekStableFinishReasonV1) ||
      typeof input.artifactHash !== 'string' || !/^[0-9a-f]{64}$/u.test(input.artifactHash)) invalid()
  const message = decodeDeepSeekNativeMessageV1(input.assistantMessage)
  if (message.role !== 'assistant') invalid()
  const metadata = record(input.responseMetadata, ['id', 'model', 'created', 'systemFingerprint'])
  const unsignedArtifact = Object.freeze({
    artifactKind: DEEPSEEK_STABLE_TERMINAL_ARTIFACT_KIND_V1,
    artifactCodecVersion: DEEPSEEK_STABLE_TERMINAL_ARTIFACT_CODEC_VERSION_V1,
    assistantMessage: message,
    generatedWithThinking: input.generatedWithThinking as 'enabled' | 'disabled',
    finishReason: input.finishReason as DeepSeekStableFinishReasonV1,
    usage: usage(input.usage),
    responseMetadata: Object.freeze({
      id: nonempty(metadata.id),
      model: nonempty(metadata.model),
      created: integer(metadata.created),
      systemFingerprint: nonempty(metadata.systemFingerprint),
    }),
  })
  if (hash(unsignedArtifact) !== input.artifactHash) invalid()
  return issue(unsignedArtifact)
}

export function isDeepSeekStableTerminalArtifactV1(
  value: unknown,
): value is DeepSeekStableTerminalArtifactV1 {
  return Boolean(value && typeof value === 'object' && artifacts.has(value))
}

export function serializeDeepSeekStableTerminalArtifactV1(
  artifact: DeepSeekStableTerminalArtifactV1,
): string {
  if (!isDeepSeekStableTerminalArtifactV1(artifact)) invalid()
  return stableSerializeProviderRequestV2(artifact)
}
