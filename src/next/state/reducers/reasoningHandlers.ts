import type { ReasoningDisplayBlock, RootState } from '../types'
import type { EventByType, HandlerContext } from './reducerTypes'
import {
  inferHasEncrypted,
  updateMessage,
} from './stateUtils'

function normalizeDisplayBlock(block: ReasoningDisplayBlock): ReasoningDisplayBlock | null {
  if (!block || typeof block !== 'object') return null
  const ordinal = Number(block.ordinal)
  if (!Number.isFinite(ordinal) || ordinal < 0) return null
  const blockId = String(block.blockId ?? '').trim()
  if (!blockId) return null
  const providerKey = String(block.providerKey ?? '').trim()
  if (!providerKey) return null
  if (block.type === 'text') {
    const text = typeof block.text === 'string' ? block.text : ''
    if (!text) return null
    return { ...block, blockId, ordinal, providerKey }
  }
  if (block.type === 'image') {
    const url = typeof block.url === 'string' ? block.url.trim() : ''
    if (!url) return null
    return { ...block, blockId, ordinal, providerKey, url }
  }
  if (block.type === 'opaque') {
    const label = typeof block.label === 'string' ? block.label.trim() : ''
    if (!label) return null
    return { ...block, blockId, ordinal, providerKey, label }
  }
  return null
}

export function handleMessageAppendReasoningDisplayBlock(
  ctx: HandlerContext,
  event: EventByType<'MessageAppendReasoningDisplayBlock'>
): RootState {
  const block = normalizeDisplayBlock(event.block)
  if (!block) return ctx.state
  return updateMessage(ctx.state, event.messageId, (m) => {
    const prev = Array.isArray(m.reasoningDisplayBlocks) ? m.reasoningDisplayBlocks : []
    if (prev.some((item) => item.blockId === block.blockId || item.ordinal === block.ordinal)) return m
    const nextBlocks = [...prev, block].sort((a, b) => a.ordinal - b.ordinal)
    return {
      ...m,
      reasoningDisplayBlocks: nextBlocks,
      reasoningVersion: m.reasoningVersion + 1,
    }
  })
}

export function handleMessageUpsertReasoningDisplayBlock(
  ctx: HandlerContext,
  event: EventByType<'MessageUpsertReasoningDisplayBlock'>
): RootState {
  const block = normalizeDisplayBlock(event.block)
  if (!block) return ctx.state
  return updateMessage(ctx.state, event.messageId, (m) => {
    const prev = Array.isArray(m.reasoningDisplayBlocks) ? m.reasoningDisplayBlocks : []
    const existingIndex = prev.findIndex((item) => item.blockId === block.blockId)
    const nextBlocks = existingIndex >= 0
      ? prev.map((item, index) => index === existingIndex ? block : item)
      : [...prev, block]
    nextBlocks.sort((a, b) => a.ordinal - b.ordinal || a.blockId.localeCompare(b.blockId))
    return {
      ...m,
      reasoningDisplayBlocks: nextBlocks,
      reasoningVersion: m.reasoningVersion + 1,
    }
  })
}

export function handleMessageDeltaReasoningDetail(ctx: HandlerContext, event: EventByType<'MessageDeltaReasoningDetail'>): RootState {
  return updateMessage(ctx.state, event.messageId, (m) => {
    const nextDetails = [...m.reasoningDetailsRaw, event.detail]
    const nextVersion = m.reasoningVersion + 1
    const hasEncryptedReasoning = m.hasEncryptedReasoning || inferHasEncrypted(event.detail)

    return {
      ...m,
      reasoningDetailsRaw: nextDetails,
      hasEncryptedReasoning,
      reasoningVersion: nextVersion,
    }
  })
}

export function handleMessageDeltaReasoningDetailBatch(ctx: HandlerContext, event: EventByType<'MessageDeltaReasoningDetailBatch'>): RootState {
  const details = Array.isArray(event.details) ? event.details : []
  if (details.length === 0) return ctx.state
  const hasEncrypted = details.some((detail) => inferHasEncrypted(detail))
  return updateMessage(ctx.state, event.messageId, (m) => {
    const nextDetails = [...m.reasoningDetailsRaw, ...details]
    const nextVersion = m.reasoningVersion + 1

    return {
      ...m,
      reasoningDetailsRaw: nextDetails,
      hasEncryptedReasoning: m.hasEncryptedReasoning || hasEncrypted,
      reasoningVersion: nextVersion,
    }
  })
}
