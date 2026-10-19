import { utf8ByteLength } from '@/shared/encoding/binaryEncoding'
import { stableSerializeProviderRequestV2 } from '../../compiler/stableSerialize'
import { GENERATION_SUCCESS_RESPONSE_MAX_BYTES_V1 } from '../../capacity/generationCapacityV1'
import {
  decodeOpenAIResponsesReturnedItemsV1,
  selectOpenAIResponsesReplayItemsV1,
  OPENAI_RESPONSES_RESPONSE_DECODE_LIMITS_V1,
  type OpenAIResponsesReturnedItemV1,
} from './nativeItemsV1'
import {
  isOpenAIResponsesTerminalResultV1,
  restoreOpenAIResponsesTerminalResultV1,
  type OpenAIResponsesTerminalResultV1,
} from './responsesStreamV1'
import type { InterruptedNativeSnapshotV1 } from '../interruptedReplayV1'

const SNAPSHOT_MAX_BYTES = GENERATION_SUCCESS_RESPONSE_MAX_BYTES_V1 * 2
// This walk counts primitive fields too; the native codec's item/part node count is narrower.
// Every JSON value consumes at least one source byte, so retain the existing wire-size boundary.
const SNAPSHOT_MAX_NODES = GENERATION_SUCCESS_RESPONSE_MAX_BYTES_V1
const SNAPSHOT_MAX_DEPTH = 128

type SnapshotPayloadV1 = Readonly<{
  items: readonly Readonly<Record<string, unknown>>[]
  completeIndexes: readonly number[]
  text: string
  reasoningSummaryText: string
  complete: boolean
}>

export type OpenAIResponsesCompletionReceiptV1 = Readonly<{
  schemaVersion: 1
  kind: 'openai_responses_completion_v1'
  terminalResult: OpenAIResponsesTerminalResultV1
  replayOutput: readonly OpenAIResponsesReturnedItemV1[]
  interruptedSnapshot: SnapshotPayloadV1
}>

const receipts = new WeakSet<object>()
function invalid(): never {
  throw new Error('GENERATION_V2_OPENAI_COMPLETION_RECEIPT_INVALID')
}

function ownRecord(value: unknown, allowedKeys?: readonly string[]): Record<string, unknown> {
  if (!value || typeof value !== 'object' || Array.isArray(value) ||
      (Object.getPrototypeOf(value) !== Object.prototype && Object.getPrototypeOf(value) !== null)) return invalid()
  const descriptors = Object.getOwnPropertyDescriptors(value)
  if (Reflect.ownKeys(value).some(key => typeof key !== 'string') ||
      Object.values(descriptors).some(descriptor => !descriptor.enumerable || !('value' in descriptor) || descriptor.value === undefined) ||
      (allowedKeys && Object.keys(descriptors).some(key => !allowedKeys.includes(key)))) return invalid()
  return Object.fromEntries(Object.entries(descriptors).map(([key, descriptor]) => [key, descriptor.value]))
}

function sameExceptReasoningCipher(left: OpenAIResponsesReturnedItemV1, right: OpenAIResponsesReturnedItemV1): boolean {
  if (stableSerializeProviderRequestV2(left) === stableSerializeProviderRequestV2(right)) return true
  if (left.type !== 'reasoning' || right.type !== 'reasoning' ||
      typeof right.encrypted_content !== 'string' || right.encrypted_content.length === 0) return false
  const { encrypted_content: _leftCipher, ...leftFields } = left
  const { encrypted_content: _rightCipher, ...rightFields } = right
  return stableSerializeProviderRequestV2(leftFields) === stableSerializeProviderRequestV2(rightFields)
}

/** Check the same sole semantic exception accepted by the stream assembler: done-event reasoning ciphertext. */
function validateReplayOutput(
  terminalOutput: readonly OpenAIResponsesReturnedItemV1[],
  replayOutput: readonly OpenAIResponsesReturnedItemV1[],
): void {
  let replayIndex = 0
  for (const item of terminalOutput) {
    const candidate = replayOutput[replayIndex]
    if (item.type === 'reasoning') {
      if (item.status === 'incomplete') continue
      if (!candidate || candidate.type !== 'reasoning' || !sameExceptReasoningCipher(item, candidate)) {
        if (typeof item.encrypted_content !== 'string' || item.encrypted_content.length === 0) continue
        return invalid()
      }
      replayIndex += 1
      continue
    }
    if (!candidate || !sameExceptReasoningCipher(item, candidate)) return invalid()
    replayIndex += 1
  }
  if (replayIndex !== replayOutput.length) return invalid()
  const expected = selectOpenAIResponsesReplayItemsV1(replayOutput)
  if (expected.length !== replayOutput.length) return invalid()
}

function validateSnapshotJsonNode(value: unknown, state: { nodes: number; stringBytes: number }, depth: number): void {
  state.nodes += 1
  if (state.nodes > SNAPSHOT_MAX_NODES || depth > SNAPSHOT_MAX_DEPTH) return invalid()
  if (value === null || typeof value === 'boolean') return
  if (typeof value === 'string') {
    state.stringBytes += utf8ByteLength(value)
    if (state.stringBytes > SNAPSHOT_MAX_BYTES) return invalid()
    return
  }
  if (typeof value === 'number') {
    if (!Number.isFinite(value)) return invalid()
    return
  }
  if (!value || typeof value !== 'object') return invalid()
  if (Array.isArray(value)) {
    if (Object.getPrototypeOf(value) !== Array.prototype || Reflect.ownKeys(value).length !== value.length + 1) return invalid()
    for (let index = 0; index < value.length; index += 1) {
      const descriptor = Object.getOwnPropertyDescriptor(value, String(index))
      if (!descriptor || !descriptor.enumerable || !('value' in descriptor)) return invalid()
      validateSnapshotJsonNode(descriptor.value, state, depth + 1)
    }
    return
  }
  if (Object.getPrototypeOf(value) !== Object.prototype && Object.getPrototypeOf(value) !== null) return invalid()
  const descriptors = Object.getOwnPropertyDescriptors(value)
  if (Reflect.ownKeys(value).some(key => typeof key !== 'string') ||
      Object.values(descriptors).some(descriptor => !descriptor.enumerable || !('value' in descriptor) || descriptor.value === undefined)) return invalid()
  for (const descriptor of Object.values(descriptors)) validateSnapshotJsonNode(descriptor.value, state, depth + 1)
}

function decodeSnapshot(value: unknown, terminal: OpenAIResponsesTerminalResultV1,
  replayOutput: readonly OpenAIResponsesReturnedItemV1[]): SnapshotPayloadV1 {
  const input = ownRecord(value, ['items', 'completeIndexes', 'text', 'reasoningSummaryText', 'complete'])
  if (Object.keys(input).length !== 5 || !Array.isArray(input.items) || input.items.length > 4_096 ||
      !Array.isArray(input.completeIndexes) || input.completeIndexes.length > input.items.length ||
      typeof input.text !== 'string' || typeof input.reasoningSummaryText !== 'string' || typeof input.complete !== 'boolean') return invalid()
  const state = { nodes: 0, stringBytes: 0 }
  validateSnapshotJsonNode(input.items, state, 0)
  const items = input.items.map((item) => {
    const record = ownRecord(item)
    if (typeof record.type !== 'string' || ![
      'message', 'reasoning', 'function_call', 'web_search_call', 'image_generation_call',
    ].includes(record.type)) return invalid()
    if (record.type === 'message' && record.role !== undefined && record.role !== 'assistant') return invalid()
    if (record.status !== undefined && typeof record.status !== 'string') return invalid()
    return Object.freeze(record)
  })
  let previous = -1
  const completeIndexes = input.completeIndexes.map((index) => {
    if (!Number.isSafeInteger(index) || (index as number) <= previous || (index as number) >= items.length) return invalid()
    previous = index as number
    return index as number
  })
  for (const text of [input.text, input.reasoningSummaryText]) {
    if (utf8ByteLength(text) > GENERATION_SUCCESS_RESPONSE_MAX_BYTES_V1) return invalid()
  }
  const complete = input.complete
  if (complete !== (terminal.terminalKind === 'completed')) return invalid()
  if (complete) {
    if (items.length !== terminal.output.length || completeIndexes.length !== terminal.output.length ||
        completeIndexes.some((index, offset) => index !== offset) || input.text !== terminal.visibleText ||
        input.reasoningSummaryText !== terminal.reasoningSummaryText) return invalid()
    const snapshotItems = decodeOpenAIResponsesReturnedItemsV1(items, OPENAI_RESPONSES_RESPONSE_DECODE_LIMITS_V1)
    for (let index = 0; index < snapshotItems.length; index += 1) {
      if (!sameExceptReasoningCipher(terminal.output[index]!, snapshotItems[index]!)) return invalid()
    }
    if (stableSerializeProviderRequestV2(selectOpenAIResponsesReplayItemsV1(snapshotItems)) !==
        stableSerializeProviderRequestV2(replayOutput)) return invalid()
  }
  return Object.freeze({ items: Object.freeze(items), completeIndexes: Object.freeze(completeIndexes),
    text: input.text, reasoningSummaryText: input.reasoningSummaryText, complete })
}

type OpenAIResponsesAssemblerSnapshotV1 = InterruptedNativeSnapshotV1 & Readonly<{ reasoningSummaryText?: string }>

function snapshotPayload(snapshot: OpenAIResponsesAssemblerSnapshotV1): SnapshotPayloadV1 {
  return Object.freeze({ items: snapshot.items, completeIndexes: snapshot.completeIndexes,
    text: snapshot.text, reasoningSummaryText: snapshot.reasoningSummaryText ?? '', complete: snapshot.complete })
}

function mark(value: OpenAIResponsesCompletionReceiptV1): OpenAIResponsesCompletionReceiptV1 {
  receipts.add(value)
  return value
}

export function isOpenAIResponsesCompletionReceiptV1(value: unknown): value is OpenAIResponsesCompletionReceiptV1 {
  return Boolean(value && typeof value === 'object' && receipts.has(value))
}

export function createOpenAIResponsesCompletionReceiptV1(input: Readonly<{
  terminalResult: OpenAIResponsesTerminalResultV1
  replayOutput: readonly OpenAIResponsesReturnedItemV1[]
  interruptedSnapshot: OpenAIResponsesAssemblerSnapshotV1
}>): OpenAIResponsesCompletionReceiptV1 {
  if (!isOpenAIResponsesTerminalResultV1(input.terminalResult)) return invalid()
  return restoreOpenAIResponsesCompletionReceiptV1({
    schemaVersion: 1,
    kind: 'openai_responses_completion_v1',
    terminalResult: input.terminalResult,
    replayOutput: input.replayOutput,
    interruptedSnapshot: snapshotPayload(input.interruptedSnapshot),
  })
}

/** Re-issues a versioned receipt, while retaining read support for legacy terminal-only rows. */
export function restoreOpenAIResponsesCompletionReceiptV1(value: unknown): OpenAIResponsesCompletionReceiptV1 {
  const record = ownRecord(value)
  if (record.kind !== undefined) {
    const input = ownRecord(value, ['schemaVersion', 'kind', 'terminalResult', 'replayOutput', 'interruptedSnapshot'])
    if (Object.keys(input).length !== 5 || input.schemaVersion !== 1 || input.kind !== 'openai_responses_completion_v1' ||
        !Array.isArray(input.replayOutput)) return invalid()
    const terminalResult = restoreOpenAIResponsesTerminalResultV1(input.terminalResult)
    const replayOutput = decodeOpenAIResponsesReturnedItemsV1(input.replayOutput, OPENAI_RESPONSES_RESPONSE_DECODE_LIMITS_V1)
    validateReplayOutput(terminalResult.output, replayOutput)
    const interruptedSnapshot = decodeSnapshot(input.interruptedSnapshot, terminalResult, replayOutput)
    return mark(Object.freeze({ schemaVersion: 1, kind: 'openai_responses_completion_v1',
      terminalResult, replayOutput, interruptedSnapshot }))
  }

  const terminalResult = restoreOpenAIResponsesTerminalResultV1(record)
  const replayOutput = selectOpenAIResponsesReplayItemsV1(terminalResult.output)
  const legacySnapshot: SnapshotPayloadV1 = Object.freeze({
    items: terminalResult.output as readonly Readonly<Record<string, unknown>>[],
    completeIndexes: Object.freeze(terminalResult.output.flatMap((item, index) =>
      terminalResult.terminalKind === 'completed' || 'status' in item && item.status === 'completed' ? [index] : [])),
    text: terminalResult.visibleText,
    reasoningSummaryText: terminalResult.reasoningSummaryText,
    complete: terminalResult.terminalKind === 'completed',
  })
  return mark(Object.freeze({ schemaVersion: 1, kind: 'openai_responses_completion_v1',
    terminalResult, replayOutput, interruptedSnapshot: legacySnapshot }))
}
