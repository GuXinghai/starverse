import type { ReasoningDisplayBlock, RootState } from '../types'
import type { EventByType, HandlerContext } from './reducerTypes'
import {
  appendReasoningImagePiece,
  appendReasoningPieces,
  createSeededReasoningMerger,
  inferHasEncrypted,
  updateMessage,
} from './stateUtils'

function getReasoningImage(detail: unknown): Readonly<{ url: string; mimeType?: string }> | null {
  if (!detail || typeof detail !== 'object') return null
  const record = detail as Record<string, unknown>
  if (record.type !== 'thought_image') return null
  const image = record.image
  if (!image || typeof image !== 'object' || Array.isArray(image)) return null
  const imageRecord = image as Record<string, unknown>
  const url = typeof imageRecord.url === 'string' ? imageRecord.url.trim() : ''
  if (!url) return null
  const mimeType = typeof imageRecord.mimeType === 'string' ? imageRecord.mimeType : undefined
  return { url, ...(mimeType ? { mimeType } : {}) }
}

function shouldAppendSummaryAsPiece(detail: unknown): boolean {
  return !!(detail && typeof detail === 'object' && (detail as Record<string, unknown>).__starverseReasoningPiece === true)
}

function normalizeDisplayBlock(block: ReasoningDisplayBlock): ReasoningDisplayBlock | null {
  if (!block || typeof block !== 'object') return null
  const ordinal = Number(block.ordinal)
  if (!Number.isFinite(ordinal) || ordinal < 0) return null
  const blockId = String(block.blockId ?? '').trim()
  if (!blockId) return null
  if (block.type === 'text') {
    const text = typeof block.text === 'string' ? block.text : ''
    if (!text) return null
    return { ...block, blockId, ordinal }
  }
  if (block.type === 'image') {
    const url = typeof block.url === 'string' ? block.url.trim() : ''
    if (!url) return null
    return { ...block, blockId, ordinal, url }
  }
  if (block.type === 'opaque') {
    const label = typeof block.label === 'string' ? block.label.trim() : ''
    if (!label) return null
    return { ...block, blockId, ordinal, label }
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

export function handleMessageDeltaReasoningDetail(ctx: HandlerContext, event: EventByType<'MessageDeltaReasoningDetail'>): RootState {
  return updateMessage(ctx.state, event.messageId, (m) => {
    const nextDetails = [...m.reasoningDetailsRaw, event.detail]
    const nextVersion = m.reasoningVersion + 1
    const hasEncryptedReasoning = m.hasEncryptedReasoning || inferHasEncrypted(event.detail)

    const merger = createSeededReasoningMerger(m.reasoningDetailsRaw)
    const merged = merger.merge(event.detail)
    const deltaText = merged?.deltaText ?? ''
    const deltaSummary = merged?.deltaSummary ?? ''

    let reasoningSummaryText = m.reasoningSummaryText
    const summaryAsPiece = shouldAppendSummaryAsPiece(event.detail)
    if (deltaSummary && !summaryAsPiece) {
      reasoningSummaryText = (reasoningSummaryText ?? '') + deltaSummary
    }

    let reasoningPieces = m.reasoningPieces
    let reasoningLastPieceLen = m.reasoningLastPieceLen
    const reasoningImage = getReasoningImage(event.detail)
    if (deltaText) {
      const nextPieces = appendReasoningPieces(m.reasoningPieces, deltaText)
      reasoningPieces = nextPieces.pieces
      reasoningLastPieceLen = nextPieces.lastLen
    }
    if (deltaSummary && summaryAsPiece) {
      const nextPieces = appendReasoningPieces(reasoningPieces, deltaSummary)
      reasoningPieces = nextPieces.pieces
      reasoningLastPieceLen = nextPieces.lastLen
    }
    if (reasoningImage) {
      const nextPieces = appendReasoningImagePiece(reasoningPieces, reasoningImage)
      reasoningPieces = nextPieces.pieces
      reasoningLastPieceLen = nextPieces.lastLen
    }

    return {
      ...m,
      reasoningDetailsRaw: nextDetails,
      hasEncryptedReasoning,
      reasoningVersion: nextVersion,
      reasoningSummaryText,
      reasoningPieces,
      reasoningLastPieceLen,
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

    const merger = createSeededReasoningMerger(m.reasoningDetailsRaw)
    let reasoningSummaryText = m.reasoningSummaryText
    let reasoningPieces = m.reasoningPieces
    let reasoningLastPieceLen = m.reasoningLastPieceLen

    for (const detail of details) {
      const merged = merger.merge(detail)
      const deltaText = merged?.deltaText ?? ''
      const deltaSummary = merged?.deltaSummary ?? ''
      const reasoningImage = getReasoningImage(detail)

      const summaryAsPiece = shouldAppendSummaryAsPiece(detail)
      if (deltaSummary && !summaryAsPiece) {
        reasoningSummaryText = (reasoningSummaryText ?? '') + deltaSummary
      }
      if (deltaText) {
        const nextPieces = appendReasoningPieces(reasoningPieces, deltaText)
        reasoningPieces = nextPieces.pieces
        reasoningLastPieceLen = nextPieces.lastLen
      }
      if (deltaSummary && summaryAsPiece) {
        const nextPieces = appendReasoningPieces(reasoningPieces, deltaSummary)
        reasoningPieces = nextPieces.pieces
        reasoningLastPieceLen = nextPieces.lastLen
      }
      if (reasoningImage) {
        const nextPieces = appendReasoningImagePiece(reasoningPieces, reasoningImage)
        reasoningPieces = nextPieces.pieces
        reasoningLastPieceLen = nextPieces.lastLen
      }
    }

    return {
      ...m,
      reasoningDetailsRaw: nextDetails,
      hasEncryptedReasoning: m.hasEncryptedReasoning || hasEncrypted,
      reasoningVersion: nextVersion,
      reasoningSummaryText,
      reasoningPieces,
      reasoningLastPieceLen,
    }
  })
}
