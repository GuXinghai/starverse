import { listMessages } from '@/next/message/messageClient'

export type LoadedReasoningReplaySnapshot = Readonly<{
  replaySnapshot: unknown[] | null
  segmentsCount: number | undefined
}>

const EMPTY_REPLAY_SNAPSHOT: LoadedReasoningReplaySnapshot = {
  replaySnapshot: null,
  segmentsCount: undefined,
}

export async function loadReasoningReplaySnapshotRecord(
  convoId: string,
  assistantMessageId: string,
  assistantSeq: number
): Promise<LoadedReasoningReplaySnapshot> {
  try {
    const rows = await listMessages(convoId, { fromSeq: assistantSeq, limit: 1 })
    const row = rows.find((entry) => entry.id === assistantMessageId) ?? rows[0] ?? null
    const meta = row?.meta && typeof row.meta === 'object' ? (row.meta as Record<string, unknown>) : null
    return {
      replaySnapshot: Array.isArray(meta?.reasoningDetailsRaw) ? meta.reasoningDetailsRaw : null,
      segmentsCount: typeof meta?.reasoningSegmentsCount === 'number' ? meta.reasoningSegmentsCount : undefined,
    }
  } catch (err) {
    console.warn('[reasoning-verify] failed to load db replay snapshot:', err)
    return EMPTY_REPLAY_SNAPSHOT
  }
}
