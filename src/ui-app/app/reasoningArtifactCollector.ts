import type { DomainEvent } from '@/next/state/types'
import {
  reasoningArtifactFromDetail,
  type ReasoningArtifact,
  type ReasoningArtifactProvider,
} from '@/next/provider/reasoningArtifact'

export type ReasoningArtifactCollectorState = {
  providerKey: ReasoningArtifactProvider
  messageId: string
  streamTurnId?: string
  nextSequence: number
  artifacts: ReasoningArtifact[]
}

export type ReasoningArtifactCollectorInput = Readonly<{
  providerKey: ReasoningArtifactProvider
  messageId: string
  streamTurnId?: string
}>

export function createReasoningArtifactCollector(
  input: ReasoningArtifactCollectorInput,
): ReasoningArtifactCollectorState {
  return {
    providerKey: input.providerKey,
    messageId: input.messageId,
    ...(input.streamTurnId ? { streamTurnId: input.streamTurnId } : {}),
    nextSequence: 0,
    artifacts: [],
  }
}

export function resetReasoningArtifactCollector(
  state: ReasoningArtifactCollectorState,
  input?: Partial<ReasoningArtifactCollectorInput>,
): void {
  if (input?.providerKey) state.providerKey = input.providerKey
  if (input?.messageId) state.messageId = input.messageId
  if (input?.streamTurnId !== undefined) state.streamTurnId = input.streamTurnId
  state.nextSequence = 0
  state.artifacts = []
}

function appendArtifactFromDetail(
  state: ReasoningArtifactCollectorState,
  detail: unknown,
  event: Readonly<{ messageId: string; chunkNo?: number }>,
): ReasoningArtifact | null {
  if (event.messageId !== state.messageId) return null
  const sequence = state.nextSequence
  const artifact = reasoningArtifactFromDetail({
    providerKey: state.providerKey,
    detail,
    sequence,
    messageId: state.messageId,
    streamTurnId: state.streamTurnId,
    createdAtMs: Date.now(),
    chunkNo: event.chunkNo,
  })
  if (!artifact) return null
  state.nextSequence += 1
  state.artifacts = [...state.artifacts, artifact]
  return artifact
}

export function collectReasoningArtifactsFromDomainEvent(
  state: ReasoningArtifactCollectorState,
  event: DomainEvent,
): ReasoningArtifact[] {
  if (event.type === 'MessageDeltaText' || event.type === 'MessageAppendContentBlock') return []

  const created: ReasoningArtifact[] = []
  if (event.type === 'MessageDeltaReasoningDetail') {
    const artifact = appendArtifactFromDetail(state, event.detail, event)
    if (artifact) created.push(artifact)
    return created
  }

  if (event.type === 'MessageDeltaReasoningDetailBatch') {
    if (event.messageId !== state.messageId) return []
    for (const detail of event.details) {
      const artifact = appendArtifactFromDetail(state, detail, event)
      if (artifact) created.push(artifact)
    }
  }

  return created
}
