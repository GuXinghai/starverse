import type { StarverseStreamEvent } from '@/next/provider/providerTypes'
import {
  ANTHROPIC_ASSISTANT_SNAPSHOT_KEY,
  ANTHROPIC_MESSAGES_SOURCE_API,
  ANTHROPIC_PROVIDER_NATIVE_PROVIDER_KEY,
  normalizeAnthropicProviderNativeSnapshot,
  type AnthropicProviderNativeSnapshot,
  type AnthropicProviderNativeStatus,
} from '@/next/provider/anthropic/anthropicProviderNativeContent'
import { clonePlainJsonObject, clonePlainJsonValue } from '@/next/provider/providerNativeContent'

export type AnthropicMessagesNativeContentAccumulator = Readonly<{
  ingestEvent: (event: unknown) => StarverseStreamEvent[]
  finalize: (status: AnthropicProviderNativeStatus) => StarverseStreamEvent[]
  snapshot: (status?: AnthropicProviderNativeStatus) => AnthropicProviderNativeSnapshot | null
}>

type BlockState = {
  index: number
  block: Record<string, unknown>
  stopped: boolean
  inputJsonPartial?: string
  parseError?: string
}

type Diagnostic = Record<string, unknown>

export function createAnthropicMessagesNativeContentAccumulator(input: Readonly<{
  messageId: string
}>): AnthropicMessagesNativeContentAccumulator {
  const messageId = String(input.messageId ?? '').trim()
  const blocks = new Map<number, BlockState>()
  const diagnostics: Diagnostic[] = []
  let model: string | undefined
  let stopReason: string | undefined
  let stopSequence: string | null | undefined
  let usage: unknown

  function ingestEvent(event: unknown): StarverseStreamEvent[] {
    const record = asRecord(event)
    if (!record || !messageId) return []
    switch (record.type) {
      case 'message_start':
        ingestMessageStart(record)
        return upsert('streaming')
      case 'content_block_start':
        ingestContentBlockStart(record)
        return upsert('streaming')
      case 'content_block_delta':
        ingestContentBlockDelta(record)
        return upsert('streaming')
      case 'content_block_stop':
        ingestContentBlockStop(record)
        return upsert('streaming')
      case 'message_delta':
        ingestMessageDelta(record)
        return upsert('streaming')
      case 'message_stop':
        return finalize(canFinalize() ? 'final' : 'error')
      default:
        return []
    }
  }

  function finalize(status: AnthropicProviderNativeStatus): StarverseStreamEvent[] {
    const snap = snapshot(status === 'final' && !canFinalize() ? 'error' : status)
    if (!snap) return []
    return [{
      type: 'message.provider_native_content_upsert',
      messageId,
      choiceIndex: 0,
      snapshot: snap,
    }]
  }

  function snapshot(status: AnthropicProviderNativeStatus = 'streaming'): AnthropicProviderNativeSnapshot | null {
    if (!messageId || blocks.size === 0) return null
    const content = orderedBlocks().map((state) => clonePlainJsonObject(state.block, `$.content[${state.index}]`))
    return normalizeAnthropicProviderNativeSnapshot({
      providerKey: ANTHROPIC_PROVIDER_NATIVE_PROVIDER_KEY,
      sourceApi: ANTHROPIC_MESSAGES_SOURCE_API,
      snapshotKey: ANTHROPIC_ASSISTANT_SNAPSHOT_KEY,
      role: 'assistant',
      status,
      content,
      ...(model ? { model } : {}),
      ...(stopReason ? { stopReason } : {}),
      ...(stopSequence !== undefined ? { stopSequence } : {}),
      ...(usage !== undefined ? { usage } : {}),
      ...(diagnostics.length > 0 ? { diagnostics: diagnostics.map((item) => clonePlainJsonObject(item, '$.diagnostics[]')) } : {}),
    })
  }

  function upsert(status: AnthropicProviderNativeStatus): StarverseStreamEvent[] {
    const snap = snapshot(status)
    if (!snap) return []
    return [{
      type: 'message.provider_native_content_upsert',
      messageId,
      choiceIndex: 0,
      snapshot: snap,
    }]
  }

  function ingestMessageStart(record: Record<string, unknown>) {
    const message = asRecord(record.message)
    if (!message) return
    if (typeof message.model === 'string' && message.model.trim()) model = message.model.trim()
    if (message.usage !== undefined) usage = clonePlainJsonValue(message.usage, '$.message.usage')
  }

  function ingestContentBlockStart(record: Record<string, unknown>) {
    const index = parseIndex(record.index)
    if (index === null) {
      diagnostics.push({ type: 'invalid_content_block_start_index' })
      return
    }
    const contentBlock = asRecord(record.content_block)
    const block = contentBlock
      ? clonePlainJsonObject(contentBlock, `$.content_block_start[${index}].content_block`)
      : { type: 'unknown' }
    blocks.set(index, { index, block, stopped: false })
  }

  function ingestContentBlockDelta(record: Record<string, unknown>) {
    const index = parseIndex(record.index)
    const delta = asRecord(record.delta)
    if (index === null || !delta) {
      diagnostics.push({ type: 'invalid_content_block_delta' })
      return
    }
    const state = ensureBlock(index)
    switch (delta.type) {
      case 'text_delta':
        appendStringField(state.block, 'text', delta.text)
        break
      case 'thinking_delta':
        appendStringField(state.block, 'thinking', delta.thinking)
        if (typeof state.block.type !== 'string') state.block.type = 'thinking'
        break
      case 'signature_delta':
        if (typeof delta.signature === 'string') state.block.signature = delta.signature
        if (typeof state.block.type !== 'string') state.block.type = 'thinking'
        break
      case 'input_json_delta':
        if (typeof delta.partial_json === 'string') {
          state.inputJsonPartial = `${state.inputJsonPartial ?? ''}${delta.partial_json}`
        }
        break
      default:
        diagnostics.push({
          type: 'unknown_content_block_delta',
          index,
          delta: clonePlainJsonObject(delta, '$.content_block_delta.delta'),
        })
        break
    }
  }

  function ingestContentBlockStop(record: Record<string, unknown>) {
    const index = parseIndex(record.index)
    if (index === null) {
      diagnostics.push({ type: 'invalid_content_block_stop_index' })
      return
    }
    const state = blocks.get(index)
    if (!state) {
      diagnostics.push({ type: 'content_block_stop_without_start', index })
      return
    }
    finalizeInputJson(state)
    state.stopped = true
  }

  function ingestMessageDelta(record: Record<string, unknown>) {
    const delta = asRecord(record.delta)
    if (delta) {
      if (typeof delta.stop_reason === 'string' && delta.stop_reason.trim()) stopReason = delta.stop_reason.trim()
      if (delta.stop_sequence === null || typeof delta.stop_sequence === 'string') stopSequence = delta.stop_sequence
    }
    if (record.usage !== undefined) usage = clonePlainJsonValue(record.usage, '$.message_delta.usage')
  }

  function ensureBlock(index: number): BlockState {
    const existing = blocks.get(index)
    if (existing) return existing
    const created: BlockState = {
      index,
      block: { type: 'unknown' },
      stopped: false,
    }
    blocks.set(index, created)
    diagnostics.push({ type: 'content_block_delta_without_start', index })
    return created
  }

  function finalizeInputJson(state: BlockState) {
    if (state.inputJsonPartial === undefined) return
    try {
      state.block.input = JSON.parse(state.inputJsonPartial)
    } catch (err) {
      state.block.input_json_partial = state.inputJsonPartial
      state.parseError = err instanceof Error ? err.message : 'input_json_parse_failed'
      diagnostics.push({
        type: 'input_json_parse_failed',
        index: state.index,
        message: state.parseError,
      })
    }
  }

  function canFinalize(): boolean {
    if (blocks.size === 0) return false
    const ordered = orderedBlocks()
    for (let expected = 0; expected < ordered.length; expected++) {
      const state = ordered[expected]
      if (!state || state.index !== expected) {
        diagnostics.push({ type: 'content_block_index_hole', expected })
        return false
      }
      if (!state.stopped) {
        diagnostics.push({ type: 'content_block_not_stopped', index: state.index })
        return false
      }
      if (state.parseError) return false
    }
    return true
  }

  function orderedBlocks(): BlockState[] {
    return [...blocks.values()].sort((a, b) => a.index - b.index)
  }

  return { ingestEvent, finalize, snapshot }
}

function appendStringField(block: Record<string, unknown>, key: string, value: unknown) {
  if (typeof value !== 'string' || value.length === 0) return
  block[key] = `${typeof block[key] === 'string' ? block[key] : ''}${value}`
}

function parseIndex(value: unknown): number | null {
  if (typeof value !== 'number' || !Number.isInteger(value) || value < 0) return null
  return value
}

function asRecord(value: unknown): Record<string, unknown> | null {
  if (!value || typeof value !== 'object' || Array.isArray(value)) return null
  return value as Record<string, unknown>
}
