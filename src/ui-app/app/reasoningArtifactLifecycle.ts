import type { ReasoningArtifact } from '@/next/provider/reasoningArtifact'

export type ReasoningArtifactsByMessageId = Readonly<Record<string, readonly ReasoningArtifact[]>>

function normalizeId(value: unknown): string {
  return String(value ?? '').trim()
}

export function replaceReasoningArtifactsForMessage(
  current: ReasoningArtifactsByMessageId,
  messageId: string,
  artifacts: readonly ReasoningArtifact[],
): ReasoningArtifactsByMessageId {
  const id = normalizeId(messageId)
  if (!id) return current

  const next: Record<string, readonly ReasoningArtifact[]> = { ...current }
  if (artifacts.length === 0) delete next[id]
  else next[id] = [...artifacts]
  return next
}

export function removeReasoningArtifactsForMessages(
  current: ReasoningArtifactsByMessageId,
  messageIds: Iterable<string>,
): ReasoningArtifactsByMessageId {
  const remove = new Set(Array.from(messageIds, normalizeId).filter(Boolean))
  if (remove.size === 0) return current

  let changed = false
  const next: Record<string, readonly ReasoningArtifact[]> = { ...current }
  for (const id of remove) {
    if (Object.prototype.hasOwnProperty.call(next, id)) {
      delete next[id]
      changed = true
    }
  }
  return changed ? next : current
}

export function retainReasoningArtifactsForMessages(
  current: ReasoningArtifactsByMessageId,
  messageIds: Iterable<string>,
): ReasoningArtifactsByMessageId {
  const keep = new Set(Array.from(messageIds, normalizeId).filter(Boolean))
  let changed = false
  const next: Record<string, readonly ReasoningArtifact[]> = {}
  for (const [id, artifacts] of Object.entries(current)) {
    if (keep.has(id) && artifacts.length > 0) next[id] = artifacts
    else changed = true
  }
  return changed ? next : current
}
