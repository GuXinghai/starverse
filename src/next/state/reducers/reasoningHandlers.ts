import type { RootState } from '../types'
import type { EventByType, HandlerContext } from './reducerTypes'
import {
  appendReasoningPieces,
  createSeededReasoningMerger,
  inferHasEncrypted,
  updateMessage,
} from './stateUtils'

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
    if (deltaSummary) {
      reasoningSummaryText = (reasoningSummaryText ?? '') + deltaSummary
    }

    let reasoningPieces = m.reasoningPieces
    let reasoningLastPieceLen = m.reasoningLastPieceLen
    if (deltaText) {
      const nextPieces = appendReasoningPieces(m.reasoningPieces, deltaText)
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

      if (deltaSummary) {
        reasoningSummaryText = (reasoningSummaryText ?? '') + deltaSummary
      }
      if (deltaText) {
        const nextPieces = appendReasoningPieces(reasoningPieces, deltaText)
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
