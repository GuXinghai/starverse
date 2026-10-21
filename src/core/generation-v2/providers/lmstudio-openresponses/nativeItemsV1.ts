import {
  generationRequestBodyMaxBytesForContractV1,
  GENERATION_SUCCESS_RESPONSE_MAX_BYTES_V1,
} from '../../capacity/generationCapacityV1'

export const LMSTUDIO_OPENRESPONSES_MAX_REPLAY_ITEMS_V1 = 4_096
export const LMSTUDIO_OPENRESPONSES_MAX_REPLAY_NODES_V1 = 16_384
export const LMSTUDIO_OPENRESPONSES_MAX_ITEM_STRING_BYTES_V1 = 4 * 1_024 * 1_024
export const LMSTUDIO_OPENRESPONSES_MAX_REPLAY_STRING_BYTES_V1 = 24 * 1_024 * 1_024
export const LMSTUDIO_OPENRESPONSES_REQUEST_DECODE_LIMITS_V1 = Object.freeze({
  maxItemStringBytes: generationRequestBodyMaxBytesForContractV1('lmstudio-openresponses'),
  maxReplayStringBytes: generationRequestBodyMaxBytesForContractV1('lmstudio-openresponses'),
})
export const LMSTUDIO_OPENRESPONSES_RESPONSE_DECODE_LIMITS_V1 = Object.freeze({
  maxItemStringBytes: GENERATION_SUCCESS_RESPONSE_MAX_BYTES_V1,
  maxReplayStringBytes: GENERATION_SUCCESS_RESPONSE_MAX_BYTES_V1,
})

export type LmStudioOpenResponsesUserInputItemV1 = Readonly<{
  role: 'user'
  content: readonly Readonly<{ type: 'input_text'; text: string }>[]
}>

export type LmStudioOpenResponsesAssistantMessageItemV1 = Readonly<{
  id: string
  type: 'message'
  role: 'assistant'
  status: 'completed'
  content: readonly Readonly<{
    type: 'output_text'
    text: string
    annotations: readonly []
    logprobs: readonly []
  }>[]
}>

export type LmStudioOpenResponsesReasoningItemV1 = Readonly<{
  id: string
  type: 'reasoning'
  status: 'completed'
  summary: readonly []
  content: readonly Readonly<{ type: 'reasoning_text'; text: string }>[]
}>

export type LmStudioOpenResponsesFunctionCallItemV1 = Readonly<{
  id: string
  call_id: string
  type: 'function_call'
  name: string
  arguments: string
  status: 'completed'
}>

export type LmStudioOpenResponsesTerminalReturnedItemV1 =
  | Readonly<Omit<LmStudioOpenResponsesAssistantMessageItemV1, 'status'> & { status: 'completed' | 'incomplete' }>
  | Readonly<Omit<LmStudioOpenResponsesReasoningItemV1, 'status'> & { status: 'completed' | 'incomplete' }>
  | Readonly<Omit<LmStudioOpenResponsesFunctionCallItemV1, 'status'> & { status: 'completed' | 'incomplete' }>

export type LmStudioOpenResponsesFunctionCallOutputItemV1 = Readonly<{
  type: 'function_call_output'
  call_id: string
  output: string
}>

export type LmStudioOpenResponsesReturnedItemV1 =
  | LmStudioOpenResponsesAssistantMessageItemV1
  | LmStudioOpenResponsesReasoningItemV1
  | LmStudioOpenResponsesFunctionCallItemV1

export type LmStudioOpenResponsesClientItemV1 =
  | LmStudioOpenResponsesUserInputItemV1
  | LmStudioOpenResponsesFunctionCallOutputItemV1

export type LmStudioOpenResponsesReplayItemV1 =
  | LmStudioOpenResponsesReturnedItemV1
  | LmStudioOpenResponsesClientItemV1

export class LmStudioOpenResponsesNativeItemsV1Error extends Error {
  constructor(readonly code:
    | 'GENERATION_V2_LMSTUDIO_NATIVE_ITEM_INVALID_SHAPE'
    | 'GENERATION_V2_LMSTUDIO_NATIVE_ITEM_UNKNOWN_FIELD'
    | 'GENERATION_V2_LMSTUDIO_NATIVE_ITEM_INVALID_VALUE'
    | 'GENERATION_V2_LMSTUDIO_NATIVE_ITEM_UNKNOWN_TYPE'
    | 'GENERATION_V2_LMSTUDIO_NATIVE_ITEM_DIRECTION_INVALID'
    | 'GENERATION_V2_LMSTUDIO_NATIVE_ITEM_LIMIT_EXCEEDED') {
    super(code)
    this.name = 'LmStudioOpenResponsesNativeItemsV1Error'
  }
}

type ClosedObject = Readonly<Record<string, unknown>>
export type LmStudioOpenResponsesNativeItemDecodeLimitsV1 = Readonly<{
  maxItemStringBytes?: number
  maxReplayStringBytes?: number
  maxReplayNodes?: number
}>
type Budget = { bytes: number; nodes: number; maxItemStringBytes: number; maxReplayStringBytes: number; maxReplayNodes: number }

function createBudget(limits: LmStudioOpenResponsesNativeItemDecodeLimitsV1 = {}): Budget {
  const budget = {
    bytes: 0,
    nodes: 0,
    maxItemStringBytes: limits.maxItemStringBytes ?? LMSTUDIO_OPENRESPONSES_MAX_ITEM_STRING_BYTES_V1,
    maxReplayStringBytes: limits.maxReplayStringBytes ?? LMSTUDIO_OPENRESPONSES_MAX_REPLAY_STRING_BYTES_V1,
    maxReplayNodes: limits.maxReplayNodes ?? LMSTUDIO_OPENRESPONSES_MAX_REPLAY_NODES_V1,
  }
  if (![budget.maxItemStringBytes, budget.maxReplayStringBytes, budget.maxReplayNodes]
    .every((value) => Number.isSafeInteger(value) && value >= 0)) {
    throw new LmStudioOpenResponsesNativeItemsV1Error('GENERATION_V2_LMSTUDIO_NATIVE_ITEM_LIMIT_EXCEEDED')
  }
  return budget
}

function closedObject(value: unknown, allowed: readonly string[], required = allowed): ClosedObject {
  if (!value || typeof value !== 'object' || Array.isArray(value) || Object.getPrototypeOf(value) !== Object.prototype) {
    throw new LmStudioOpenResponsesNativeItemsV1Error('GENERATION_V2_LMSTUDIO_NATIVE_ITEM_INVALID_SHAPE')
  }
  const descriptors = Object.getOwnPropertyDescriptors(value)
  if (Reflect.ownKeys(value).some((key) => typeof key !== 'string') ||
      Object.values(descriptors).some((descriptor) => !descriptor.enumerable || !('value' in descriptor) || descriptor.value === undefined)) {
    throw new LmStudioOpenResponsesNativeItemsV1Error('GENERATION_V2_LMSTUDIO_NATIVE_ITEM_INVALID_SHAPE')
  }
  const keys = Object.keys(descriptors)
  if (keys.some((key) => !allowed.includes(key))) {
    throw new LmStudioOpenResponsesNativeItemsV1Error('GENERATION_V2_LMSTUDIO_NATIVE_ITEM_UNKNOWN_FIELD')
  }
  if (required.some((key) => !keys.includes(key))) {
    throw new LmStudioOpenResponsesNativeItemsV1Error('GENERATION_V2_LMSTUDIO_NATIVE_ITEM_INVALID_SHAPE')
  }
  return Object.freeze(Object.fromEntries(keys.map((key) => [key, descriptors[key].value])))
}

function denseArray(value: unknown, maxLength: number, allowEmpty = false): readonly unknown[] {
  if (!Array.isArray(value) || Object.getPrototypeOf(value) !== Array.prototype ||
      value.length > maxLength || (!allowEmpty && value.length === 0)) {
    throw new LmStudioOpenResponsesNativeItemsV1Error(
      value instanceof Array && value.length > maxLength
        ? 'GENERATION_V2_LMSTUDIO_NATIVE_ITEM_LIMIT_EXCEEDED'
        : 'GENERATION_V2_LMSTUDIO_NATIVE_ITEM_INVALID_SHAPE',
    )
  }
  const expected = [...Array.from({ length: value.length }, (_, index) => String(index)), 'length']
  const keys = Reflect.ownKeys(value)
  if (keys.length !== expected.length || expected.some((key) => !keys.includes(key))) {
    throw new LmStudioOpenResponsesNativeItemsV1Error('GENERATION_V2_LMSTUDIO_NATIVE_ITEM_INVALID_SHAPE')
  }
  return Object.freeze(expected.slice(0, -1).map((key) => {
    const descriptor = Object.getOwnPropertyDescriptor(value, key)
    if (!descriptor || !descriptor.enumerable || !('value' in descriptor) || descriptor.value === undefined) {
      throw new LmStudioOpenResponsesNativeItemsV1Error('GENERATION_V2_LMSTUDIO_NATIVE_ITEM_INVALID_SHAPE')
    }
    return descriptor.value
  }))
}

function emptyArray(value: unknown): readonly [] {
  if (denseArray(value, 0, true).length !== 0) {
    throw new LmStudioOpenResponsesNativeItemsV1Error('GENERATION_V2_LMSTUDIO_NATIVE_ITEM_INVALID_VALUE')
  }
  return Object.freeze([])
}

function stringValue(value: unknown, budget: Budget, identifier = false): string {
  if (typeof value !== 'string' ||
      (identifier && (value.length === 0 || value.trim() !== value || /[\u0000-\u001f\u007f]/u.test(value)))) {
    throw new LmStudioOpenResponsesNativeItemsV1Error('GENERATION_V2_LMSTUDIO_NATIVE_ITEM_INVALID_VALUE')
  }
  const bytes = new TextEncoder().encode(value).byteLength
  if (bytes > budget.maxItemStringBytes || budget.bytes + bytes > budget.maxReplayStringBytes) {
    throw new LmStudioOpenResponsesNativeItemsV1Error('GENERATION_V2_LMSTUDIO_NATIVE_ITEM_LIMIT_EXCEEDED')
  }
  budget.bytes += bytes
  return value
}

function textParts<T extends 'input_text' | 'reasoning_text'>(
  value: unknown,
  type: T,
  budget: Budget,
): readonly Readonly<{ type: T; text: string }>[] {
  const parts = denseArray(value, LMSTUDIO_OPENRESPONSES_MAX_REPLAY_ITEMS_V1)
  budget.nodes += parts.length
  if (budget.nodes > budget.maxReplayNodes) {
    throw new LmStudioOpenResponsesNativeItemsV1Error('GENERATION_V2_LMSTUDIO_NATIVE_ITEM_LIMIT_EXCEEDED')
  }
  return Object.freeze(parts.map((raw) => {
    const part = closedObject(raw, ['type', 'text'])
    if (part.type !== type) {
      throw new LmStudioOpenResponsesNativeItemsV1Error('GENERATION_V2_LMSTUDIO_NATIVE_ITEM_UNKNOWN_TYPE')
    }
    return Object.freeze({ type, text: stringValue(part.text, budget) })
  }))
}

function outputTextParts(value: unknown, budget: Budget): LmStudioOpenResponsesAssistantMessageItemV1['content'] {
  const parts = denseArray(value, LMSTUDIO_OPENRESPONSES_MAX_REPLAY_ITEMS_V1)
  budget.nodes += parts.length
  if (budget.nodes > budget.maxReplayNodes) {
    throw new LmStudioOpenResponsesNativeItemsV1Error('GENERATION_V2_LMSTUDIO_NATIVE_ITEM_LIMIT_EXCEEDED')
  }
  return Object.freeze(parts.map((raw) => {
    const part = closedObject(raw, ['type', 'text', 'annotations', 'logprobs'])
    if (part.type !== 'output_text') {
      throw new LmStudioOpenResponsesNativeItemsV1Error('GENERATION_V2_LMSTUDIO_NATIVE_ITEM_UNKNOWN_TYPE')
    }
    return Object.freeze({
      type: 'output_text' as const,
      text: stringValue(part.text, budget),
      annotations: emptyArray(part.annotations),
      logprobs: emptyArray(part.logprobs),
    })
  }))
}

function decodeItem(value: unknown, budget: Budget): LmStudioOpenResponsesReplayItemV1 {
  budget.nodes += 1
  if (budget.nodes > budget.maxReplayNodes) {
    throw new LmStudioOpenResponsesNativeItemsV1Error('GENERATION_V2_LMSTUDIO_NATIVE_ITEM_LIMIT_EXCEEDED')
  }
  const discriminator = closedObject(value, [
    'id', 'type', 'role', 'status', 'content', 'summary', 'call_id', 'name', 'arguments', 'output',
  ], [])
  if (discriminator.role === 'user' && discriminator.type === undefined) {
    const item = closedObject(value, ['role', 'content'])
    return Object.freeze({
      role: 'user',
      content: textParts(item.content, 'input_text', budget),
    })
  }
  if (discriminator.type === 'message') {
    const item = closedObject(value, ['id', 'type', 'role', 'status', 'content'])
    if (item.role !== 'assistant' || item.status !== 'completed') {
      throw new LmStudioOpenResponsesNativeItemsV1Error('GENERATION_V2_LMSTUDIO_NATIVE_ITEM_INVALID_VALUE')
    }
    return Object.freeze({
      id: stringValue(item.id, budget, true), type: 'message', role: 'assistant', status: 'completed',
      content: outputTextParts(item.content, budget),
    })
  }
  if (discriminator.type === 'reasoning') {
    const item = closedObject(value, ['id', 'type', 'status', 'summary', 'content'])
    if (item.status !== 'completed') {
      throw new LmStudioOpenResponsesNativeItemsV1Error('GENERATION_V2_LMSTUDIO_NATIVE_ITEM_INVALID_VALUE')
    }
    return Object.freeze({
      id: stringValue(item.id, budget, true), type: 'reasoning', status: 'completed',
      summary: emptyArray(item.summary), content: textParts(item.content, 'reasoning_text', budget),
    })
  }
  if (discriminator.type === 'function_call') {
    const item = closedObject(value, ['id', 'call_id', 'type', 'name', 'arguments', 'status'])
    if (item.status !== 'completed') {
      throw new LmStudioOpenResponsesNativeItemsV1Error('GENERATION_V2_LMSTUDIO_NATIVE_ITEM_INVALID_VALUE')
    }
    return Object.freeze({
      id: stringValue(item.id, budget, true), call_id: stringValue(item.call_id, budget, true),
      type: 'function_call', name: stringValue(item.name, budget, true),
      arguments: stringValue(item.arguments, budget), status: 'completed',
    })
  }
  if (discriminator.type === 'function_call_output') {
    const item = closedObject(value, ['type', 'call_id', 'output'])
    return Object.freeze({
      type: 'function_call_output', call_id: stringValue(item.call_id, budget, true),
      output: stringValue(item.output, budget),
    })
  }
  throw new LmStudioOpenResponsesNativeItemsV1Error('GENERATION_V2_LMSTUDIO_NATIVE_ITEM_UNKNOWN_TYPE')
}

export function decodeLmStudioOpenResponsesReplayItemV1(
  value: unknown,
  limits?: LmStudioOpenResponsesNativeItemDecodeLimitsV1,
): LmStudioOpenResponsesReplayItemV1 {
  return decodeItem(value, createBudget(limits))
}

export function decodeLmStudioOpenResponsesReplayItemsV1(
  value: unknown,
  limits?: LmStudioOpenResponsesNativeItemDecodeLimitsV1,
): readonly LmStudioOpenResponsesReplayItemV1[] {
  const budget = createBudget(limits)
  return Object.freeze(denseArray(value, LMSTUDIO_OPENRESPONSES_MAX_REPLAY_ITEMS_V1, true)
    .map((item) => decodeItem(item, budget)))
}

export function decodeLmStudioOpenResponsesReturnedItemsV1(
  value: unknown,
  limits?: LmStudioOpenResponsesNativeItemDecodeLimitsV1,
): readonly LmStudioOpenResponsesReturnedItemV1[] {
  return Object.freeze(decodeLmStudioOpenResponsesReplayItemsV1(value, limits).map((item) => {
    if (!('type' in item) || item.type === 'function_call_output') {
      throw new LmStudioOpenResponsesNativeItemsV1Error('GENERATION_V2_LMSTUDIO_NATIVE_ITEM_DIRECTION_INVALID')
    }
    return item
  }))
}

/** Terminal-only decoder: a provider may end output items in the incomplete state. */
export function decodeLmStudioOpenResponsesTerminalReturnedItemsV1(
  value: unknown,
  limits?: LmStudioOpenResponsesNativeItemDecodeLimitsV1,
): readonly LmStudioOpenResponsesTerminalReturnedItemV1[] {
  const budget = createBudget(limits)
  const items = denseArray(value, LMSTUDIO_OPENRESPONSES_MAX_REPLAY_ITEMS_V1, true).map((raw) => {
    budget.nodes += 1
    if (budget.nodes > budget.maxReplayNodes) {
      throw new LmStudioOpenResponsesNativeItemsV1Error('GENERATION_V2_LMSTUDIO_NATIVE_ITEM_LIMIT_EXCEEDED')
    }
    const discriminator = closedObject(raw, [
      'id', 'type', 'role', 'status', 'content', 'summary', 'call_id', 'name', 'arguments',
    ], [])
    const status = discriminator.status
    if (status !== 'completed' && status !== 'incomplete') {
      throw new LmStudioOpenResponsesNativeItemsV1Error('GENERATION_V2_LMSTUDIO_NATIVE_ITEM_INVALID_VALUE')
    }
    if (discriminator.type === 'message') {
      const item = closedObject(raw, ['id', 'type', 'role', 'status', 'content'])
      if (item.role !== 'assistant') {
        throw new LmStudioOpenResponsesNativeItemsV1Error('GENERATION_V2_LMSTUDIO_NATIVE_ITEM_INVALID_VALUE')
      }
      return Object.freeze({ id: stringValue(item.id, budget, true), type: 'message' as const,
        role: 'assistant' as const, status, content: outputTextParts(item.content, budget) })
    }
    if (discriminator.type === 'reasoning') {
      const item = closedObject(raw, ['id', 'type', 'status', 'summary', 'content'])
      return Object.freeze({ id: stringValue(item.id, budget, true), type: 'reasoning' as const, status,
        summary: emptyArray(item.summary), content: textParts(item.content, 'reasoning_text', budget) })
    }
    if (discriminator.type === 'function_call') {
      const item = closedObject(raw, ['id', 'call_id', 'type', 'name', 'arguments', 'status'])
      return Object.freeze({ id: stringValue(item.id, budget, true), call_id: stringValue(item.call_id, budget, true),
        type: 'function_call' as const, name: stringValue(item.name, budget, true),
        arguments: stringValue(item.arguments, budget), status })
    }
    throw new LmStudioOpenResponsesNativeItemsV1Error('GENERATION_V2_LMSTUDIO_NATIVE_ITEM_UNKNOWN_TYPE')
  })
  return Object.freeze(items)
}

export function decodeLmStudioOpenResponsesClientItemsV1(
  value: unknown,
  limits?: LmStudioOpenResponsesNativeItemDecodeLimitsV1,
): readonly LmStudioOpenResponsesClientItemV1[] {
  return Object.freeze(decodeLmStudioOpenResponsesReplayItemsV1(value, limits).map((item) => {
    const isUser = 'role' in item && item.role === 'user'
    const isFunctionOutput = 'type' in item && item.type === 'function_call_output'
    if (!isUser && !isFunctionOutput) {
      throw new LmStudioOpenResponsesNativeItemsV1Error('GENERATION_V2_LMSTUDIO_NATIVE_ITEM_DIRECTION_INVALID')
    }
    return item as LmStudioOpenResponsesClientItemV1
  }))
}
