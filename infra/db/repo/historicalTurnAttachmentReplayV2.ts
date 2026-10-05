import type BetterSqlite3 from 'better-sqlite3'
import {
  decodeAssistantAnswerGenerationSnapshotV2,
  type DecodedAssistantAnswerGenerationSnapshotV2,
} from '../../../src/next/generation-v2/domain/assistantAnswerGenerationSnapshotV2'
import type { AttachmentIntentV2 } from '../../../src/next/generation-v2/domain/generationIntentV2'

/**
 * Attachment facts of an earlier turn, read from that turn's immutable
 * generation snapshot (never from live composer state or message attachment rows).
 * `replayIndex` addresses the user message/content that starts the turn inside
 * the provider history the owning repository rebuilt.
 */
export type HistoricalTurnAttachmentReplayV2 = Readonly<{
  replayIndex: number
  answerRootId: string
  operationId: string
  snapshotHash: string
  /** Included attachments only; excluded ones stay excluded and are never replayed. */
  attachments: readonly AttachmentIntentV2[]
  providerFileBindings: DecodedAssistantAnswerGenerationSnapshotV2['attachmentProviderFileBindings']
}>

export function loadHistoricalTurnAttachmentReplayV2(
  db: BetterSqlite3.Database,
  input: Readonly<{ answerRootId: string; operationId: string; providerId: string; replayIndex: number }>,
  fail: () => never,
): HistoricalTurnAttachmentReplayV2 | null {
  const row = db.prepare(`SELECT snapshot.canonical_json AS canonicalJson, snapshot.snapshot_hash AS snapshotHash
    FROM assistant_generation_snapshot_v2 AS snapshot
    JOIN generation_operation_v2 AS operation ON operation.operation_id=snapshot.operation_id
      AND operation.target_answer_id=snapshot.answer_root_id
    WHERE snapshot.operation_id=? AND snapshot.answer_root_id=?`).get(input.operationId, input.answerRootId) as
    Readonly<Record<string, unknown>> | undefined
  if (!row || typeof row.canonicalJson !== 'string' || typeof row.snapshotHash !== 'string') return fail()
  let snapshot: DecodedAssistantAnswerGenerationSnapshotV2
  try { snapshot = decodeAssistantAnswerGenerationSnapshotV2(JSON.parse(row.canonicalJson)) } catch { return fail() }
  if (snapshot.operationId.value !== input.operationId || snapshot.answerRootId.value !== input.answerRootId ||
      snapshot.snapshotHash.value !== row.snapshotHash ||
      snapshot.providerBinding.providerId.value !== input.providerId) return fail()
  const attachments = snapshot.semanticIntent.attachments.filter((attachment) => attachment.include)
  if (attachments.length === 0) return null
  return Object.freeze({
    replayIndex: input.replayIndex,
    answerRootId: input.answerRootId,
    operationId: input.operationId,
    snapshotHash: snapshot.snapshotHash.value,
    attachments: Object.freeze(attachments),
    providerFileBindings: snapshot.attachmentProviderFileBindings,
  })
}
