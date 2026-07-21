import {
  ImmutablePreparedBodyV2,
  StableSerializeV2Error,
  stableSerializeProviderRequestBoundedV2,
} from '../../compiler/stableSerialize'
import type { ResolvedGenerationIntentV2 } from '../../domain/resolvedGenerationIntentV2'
import { projectGenerationIntentLayerV2 } from '../../domain/generationIntentProjectionV2'
import {
  ANTHROPIC_NATIVE_HISTORY_MAX_BLOCKS_V1,
  type AnthropicNativeContentBlockV1,
  type PlainJsonV1,
} from './nativeContentBlocksV1'
import {
  projectAnthropicMessagesIntentV1,
  type AnthropicMessagesIntentDispositionV1,
  type AnthropicMessagesIntentProjectionIssueV1,
} from './messagesIntentProjectionV1'

export const ANTHROPIC_MESSAGES_REQUEST_MAX_BYTES_V1 = 20 * 1_024 * 1_024
export type AnthropicMessagesRequestMessageV1 =
  | Readonly<{ role: 'user'; content: string | readonly AnthropicMessagesToolResultBlockV1[] }>
  | Readonly<{ role: 'assistant'; content: readonly AnthropicNativeContentBlockV1[] }>
export type AnthropicMessagesToolResultBlockV1 = Readonly<{
  type: 'tool_result'
  tool_use_id: string
  content: string
  is_error?: boolean
}>
export type AnthropicMessagesToolDefinitionV1 = Readonly<{
  name: string
  description?: string
  input_schema: PlainJsonV1
}>
export type AnthropicMessagesToolChoiceV1 =
  | Readonly<{ type: 'auto' | 'any' | 'none' }>
  | Readonly<{ type: 'tool'; name: string }>
export type AnthropicMessagesNativeRequestV1 = Readonly<{
  model: string
  messages: readonly AnthropicMessagesRequestMessageV1[]
  system?: string
  max_tokens: number
  stream: true
  temperature?: number
  top_p?: number
  top_k?: number
  stop_sequences?: readonly string[]
  thinking?: Readonly<{
    type: 'disabled' | 'enabled' | 'adaptive'
    budget_tokens?: number
    display?: 'summarized' | 'omitted'
  }>
  output_config?: Readonly<{ effort: 'low' | 'medium' | 'high' | 'xhigh' | 'max' }>
  tools?: readonly AnthropicMessagesToolDefinitionV1[]
  tool_choice?: AnthropicMessagesToolChoiceV1
}>

export type AnthropicMessagesRequestCompilationV1 = Readonly<{
  classification: 'anthropic_messages_request_compilation_non_executable'
  executionAuthority: 'none'
  dispositions: readonly AnthropicMessagesIntentDispositionV1[]
  issues: readonly AnthropicMessagesIntentProjectionIssueV1[]
  nativeRequest?: AnthropicMessagesNativeRequestV1
  preparedBody?: ImmutablePreparedBodyV2
}>

export class AnthropicMessagesRequestV1Error extends Error {
  constructor(readonly code:
    | 'GENERATION_V2_ANTHROPIC_MESSAGES_REQUEST_INVALID_SHAPE'
    | 'GENERATION_V2_ANTHROPIC_MESSAGES_REQUEST_UNKNOWN_FIELD'
    | 'GENERATION_V2_ANTHROPIC_MESSAGES_REQUEST_INVALID_VALUE'
    | 'GENERATION_V2_ANTHROPIC_MESSAGES_REQUEST_LIMIT_EXCEEDED') {
    super(code)
    this.name = 'AnthropicMessagesRequestV1Error'
  }
}

type ClosedObject = Readonly<Record<string, unknown>>
function fail(code: AnthropicMessagesRequestV1Error['code']): never {
  throw new AnthropicMessagesRequestV1Error(code)
}
function closedObject(value: unknown, allowed: readonly string[], required: readonly string[]): ClosedObject {
  if (!value || typeof value !== 'object' || Array.isArray(value) || Object.getPrototypeOf(value) !== Object.prototype) {
    return fail('GENERATION_V2_ANTHROPIC_MESSAGES_REQUEST_INVALID_SHAPE')
  }
  const descriptors = Object.getOwnPropertyDescriptors(value)
  if (Reflect.ownKeys(value).some((key) => typeof key !== 'string') || Object.values(descriptors).some((descriptor) =>
    !descriptor.enumerable || !('value' in descriptor) || descriptor.value === undefined)) {
    return fail('GENERATION_V2_ANTHROPIC_MESSAGES_REQUEST_INVALID_SHAPE')
  }
  const keys = Object.keys(descriptors)
  if (keys.some((key) => !allowed.includes(key))) return fail('GENERATION_V2_ANTHROPIC_MESSAGES_REQUEST_UNKNOWN_FIELD')
  if (required.some((key) => !keys.includes(key))) return fail('GENERATION_V2_ANTHROPIC_MESSAGES_REQUEST_INVALID_SHAPE')
  return Object.freeze(Object.fromEntries(keys.map((key) => [key, descriptors[key].value])))
}
function denseArray(value: unknown, max: number): readonly unknown[] {
  if (!Array.isArray(value) || Object.getPrototypeOf(value) !== Array.prototype || value.length === 0 || value.length > max) {
    return fail(Array.isArray(value) && value.length > max
      ? 'GENERATION_V2_ANTHROPIC_MESSAGES_REQUEST_LIMIT_EXCEEDED'
      : 'GENERATION_V2_ANTHROPIC_MESSAGES_REQUEST_INVALID_SHAPE')
  }
  const keys = Reflect.ownKeys(value)
  const expected = [...Array.from({ length: value.length }, (_, index) => String(index)), 'length']
  if (keys.length !== expected.length || expected.some((key) => !keys.includes(key))) {
    return fail('GENERATION_V2_ANTHROPIC_MESSAGES_REQUEST_INVALID_SHAPE')
  }
  return Object.freeze(expected.slice(0, -1).map((key) => {
    const descriptor = Object.getOwnPropertyDescriptor(value, key)
    if (!descriptor?.enumerable || !('value' in descriptor) || descriptor.value === undefined) {
      return fail('GENERATION_V2_ANTHROPIC_MESSAGES_REQUEST_INVALID_SHAPE')
    }
    return descriptor.value
  }))
}
function nonEmptyString(value: unknown): string {
  if (typeof value !== 'string' || value.length === 0) return fail('GENERATION_V2_ANTHROPIC_MESSAGES_REQUEST_INVALID_VALUE')
  return value
}
function clonePlainJson(value: unknown): PlainJsonV1 {
  try {
    const serialized = stableSerializeProviderRequestBoundedV2(value, ANTHROPIC_MESSAGES_REQUEST_MAX_BYTES_V1)
    return deepFreeze(JSON.parse(serialized)) as PlainJsonV1
  } catch (error) {
    if (error instanceof StableSerializeV2Error && error.code === 'GENERATION_V2_JSON_BYTE_LIMIT_EXCEEDED') {
      return fail('GENERATION_V2_ANTHROPIC_MESSAGES_REQUEST_LIMIT_EXCEEDED')
    }
    return fail('GENERATION_V2_ANTHROPIC_MESSAGES_REQUEST_INVALID_VALUE')
  }
}
function deepFreeze(value: unknown): unknown {
  if (Array.isArray(value)) {
    for (const item of value) deepFreeze(item)
    return Object.freeze(value)
  }
  if (value && typeof value === 'object') {
    for (const item of Object.values(value)) deepFreeze(item)
    return Object.freeze(value)
  }
  return value
}
function decodeBlock(value: unknown): AnthropicNativeContentBlockV1 {
  const discriminator = closedObject(value, ['type', 'text', 'citations', 'thinking', 'signature', 'data', 'id', 'name', 'input', 'caller'], ['type'])
  if (discriminator.type === 'text') {
    const block = closedObject(value, ['type', 'text', 'citations'], ['type', 'text', 'citations'])
    if (typeof block.text !== 'string' || block.citations !== null) return fail('GENERATION_V2_ANTHROPIC_MESSAGES_REQUEST_INVALID_VALUE')
    return Object.freeze({ type: 'text', text: block.text, citations: null })
  }
  if (discriminator.type === 'thinking') {
    const block = closedObject(value, ['type', 'thinking', 'signature'], ['type', 'thinking', 'signature'])
    if (typeof block.thinking !== 'string') return fail('GENERATION_V2_ANTHROPIC_MESSAGES_REQUEST_INVALID_VALUE')
    return Object.freeze({ type: 'thinking', thinking: block.thinking, signature: nonEmptyString(block.signature) })
  }
  if (discriminator.type === 'redacted_thinking') {
    const block = closedObject(value, ['type', 'data'], ['type', 'data'])
    return Object.freeze({ type: 'redacted_thinking', data: nonEmptyString(block.data) })
  }
  if (discriminator.type === 'tool_use') {
    const block = closedObject(value, ['type', 'id', 'name', 'input', 'caller'], ['type', 'id', 'name', 'input', 'caller'])
    const caller = closedObject(block.caller, ['type'], ['type'])
    if (caller.type !== 'direct') return fail('GENERATION_V2_ANTHROPIC_MESSAGES_REQUEST_INVALID_VALUE')
    return Object.freeze({
      type: 'tool_use', id: nonEmptyString(block.id), name: nonEmptyString(block.name), input: clonePlainJson(block.input),
      caller: Object.freeze({ type: 'direct' as const }),
    })
  }
  return fail('GENERATION_V2_ANTHROPIC_MESSAGES_REQUEST_INVALID_VALUE')
}
function decodeToolResultBlock(value: unknown): AnthropicMessagesToolResultBlockV1 {
  const block = closedObject(value, ['type', 'tool_use_id', 'content', 'is_error'], ['type', 'tool_use_id', 'content'])
  if (block.type !== 'tool_result' || typeof block.content !== 'string' ||
      (block.is_error !== undefined && typeof block.is_error !== 'boolean')) {
    return fail('GENERATION_V2_ANTHROPIC_MESSAGES_REQUEST_INVALID_VALUE')
  }
  return Object.freeze({
    type: 'tool_result' as const,
    tool_use_id: nonEmptyString(block.tool_use_id),
    content: block.content,
    ...(block.is_error === undefined ? {} : { is_error: block.is_error }),
  })
}
function decodeTools(value: unknown): readonly AnthropicMessagesToolDefinitionV1[] {
  return Object.freeze(denseArray(value, 128).map((raw) => {
    const tool = closedObject(raw, ['name', 'description', 'input_schema'], ['name', 'input_schema'])
    if (tool.description !== undefined && typeof tool.description !== 'string') {
      return fail('GENERATION_V2_ANTHROPIC_MESSAGES_REQUEST_INVALID_VALUE')
    }
    return Object.freeze({
      name: nonEmptyString(tool.name),
      ...(tool.description === undefined ? {} : { description: tool.description }),
      input_schema: clonePlainJson(tool.input_schema),
    })
  }))
}
function decodeToolChoice(value: unknown, names: ReadonlySet<string>): AnthropicMessagesToolChoiceV1 {
  const choice = closedObject(value, ['type', 'name'], ['type'])
  if (choice.type === 'auto' || choice.type === 'any' || choice.type === 'none') {
    if (choice.name !== undefined) return fail('GENERATION_V2_ANTHROPIC_MESSAGES_REQUEST_INVALID_VALUE')
    return Object.freeze({ type: choice.type })
  }
  if (choice.type !== 'tool' || choice.name === undefined) return fail('GENERATION_V2_ANTHROPIC_MESSAGES_REQUEST_INVALID_VALUE')
  const name = nonEmptyString(choice.name)
  if (!names.has(name)) return fail('GENERATION_V2_ANTHROPIC_MESSAGES_REQUEST_INVALID_VALUE')
  return Object.freeze({ type: 'tool' as const, name })
}
function decodeMessages(value: unknown): readonly AnthropicMessagesRequestMessageV1[] {
  return Object.freeze(denseArray(value, ANTHROPIC_NATIVE_HISTORY_MAX_BLOCKS_V1).map((raw) => {
    const message = closedObject(raw, ['role', 'content'], ['role', 'content'])
    if (message.role === 'user') {
      if (typeof message.content === 'string') return Object.freeze({ role: 'user' as const, content: nonEmptyString(message.content) })
      return Object.freeze({
        role: 'user' as const,
        content: Object.freeze(denseArray(message.content, ANTHROPIC_NATIVE_HISTORY_MAX_BLOCKS_V1).map(decodeToolResultBlock)),
      })
    }
    if (message.role === 'assistant') {
      return Object.freeze({
        role: 'assistant' as const,
        content: Object.freeze(denseArray(message.content, ANTHROPIC_NATIVE_HISTORY_MAX_BLOCKS_V1).map(decodeBlock)),
      })
    }
    return fail('GENERATION_V2_ANTHROPIC_MESSAGES_REQUEST_INVALID_VALUE')
  }))
}

export function compileAnthropicMessagesRequestV1(value: unknown): AnthropicMessagesRequestCompilationV1 {
  const input = closedObject(value, ['modelId', 'intent', 'messages', 'system', 'tools', 'toolChoice'], ['modelId', 'intent', 'messages'])
  if (typeof input.modelId !== 'string' || input.modelId.length === 0) {
    return fail('GENERATION_V2_ANTHROPIC_MESSAGES_REQUEST_INVALID_VALUE')
  }
  const messages = decodeMessages(input.messages)
  const system = input.system === undefined ? undefined : nonEmptyString(input.system)
  const tools = input.tools === undefined ? undefined : decodeTools(input.tools)
  if (tools !== undefined && new Set(tools.map((tool) => tool.name)).size !== tools.length) {
    return fail('GENERATION_V2_ANTHROPIC_MESSAGES_REQUEST_INVALID_VALUE')
  }
  if (input.toolChoice !== undefined && tools === undefined) return fail('GENERATION_V2_ANTHROPIC_MESSAGES_REQUEST_INVALID_VALUE')
  const toolChoice = input.toolChoice === undefined ? undefined : decodeToolChoice(input.toolChoice, new Set(tools!.map((tool) => tool.name)))
  const projection = projectAnthropicMessagesIntentV1(projectGenerationIntentLayerV2(input.intent as ResolvedGenerationIntentV2), input.modelId)
  const base = {
    classification: 'anthropic_messages_request_compilation_non_executable' as const,
    executionAuthority: 'none' as const,
    dispositions: projection.dispositions,
    issues: projection.issues,
  }
  if (projection.issues.length > 0) return Object.freeze(base)
  const request = projection.request
  if (request.maxTokens === undefined) throw new Error('GENERATION_V2_ANTHROPIC_MESSAGES_MAX_TOKENS_INVARIANT')
  const nativeRequest: AnthropicMessagesNativeRequestV1 = Object.freeze({
    model: input.modelId,
    messages,
    ...(system === undefined ? {} : { system }),
    max_tokens: request.maxTokens,
    stream: true,
    ...(request.temperature === undefined ? {} : { temperature: request.temperature }),
    ...(request.topP === undefined ? {} : { top_p: request.topP }),
    ...(request.topK === undefined ? {} : { top_k: request.topK }),
    ...(request.stopSequences === undefined ? {} : { stop_sequences: request.stopSequences }),
    ...(request.thinking === undefined ? {} : { thinking: Object.freeze({
      type: request.thinking.type,
      ...(request.thinking.budgetTokens === undefined ? {} : { budget_tokens: request.thinking.budgetTokens }),
      ...(request.thinking.display === undefined ? {} : { display: request.thinking.display }),
    }) }),
    ...(request.effort === undefined ? {} : { output_config: Object.freeze({ effort: request.effort }) }),
    ...(tools === undefined ? {} : { tools }),
    ...(toolChoice === undefined ? {} : { tool_choice: toolChoice }),
  })
  let preparedBody: ImmutablePreparedBodyV2
  try {
    preparedBody = ImmutablePreparedBodyV2.fromNativeRequestWithMaxBytes(nativeRequest, ANTHROPIC_MESSAGES_REQUEST_MAX_BYTES_V1)
  } catch (error) {
    if (error instanceof StableSerializeV2Error && error.code === 'GENERATION_V2_JSON_BYTE_LIMIT_EXCEEDED') {
      return fail('GENERATION_V2_ANTHROPIC_MESSAGES_REQUEST_LIMIT_EXCEEDED')
    }
    throw error
  }
  return Object.freeze({ ...base, nativeRequest, preparedBody })
}
