import type BetterSqlite3 from 'better-sqlite3'
import { GenerationExecutionV2Repo } from '../../infra/db/repo/generationExecutionV2Repo'
import { runGenerationV2AuthorityTransactionOnOwnedConnectionV2,
  type GenerationV2AuthorityTransactionContextV2 } from '../../infra/db/repo/generationV2AuthorityTransactionInternal'
import type { AttachmentIntentV2 } from '../../src/next/generation-v2/domain/generationIntentV2'

/** Regenerate resolves current settings, but the question keeps its frozen attachments. */
export function readRegenerateSourceAttachmentsV2(input: Readonly<{
  db: BetterSqlite3.Database
  context?: GenerationV2AuthorityTransactionContextV2
  sourceAnswerId: string
  questionId: string
  sourceBranchId: string
}>): readonly AttachmentIntentV2[] {
  const read = (context: GenerationV2AuthorityTransactionContextV2) => {
    const row = input.db.prepare(`SELECT snapshot.operation_id AS operationId
      FROM assistant_generation_snapshot_v2 AS snapshot
      JOIN message_v2 AS answer ON answer.message_id=snapshot.answer_root_id
      JOIN branch_v2 AS branch ON branch.conversation_id=answer.conversation_id
      WHERE snapshot.answer_root_id=? AND answer.question_id=? AND branch.branch_id=?`)
      .get(input.sourceAnswerId, input.questionId, input.sourceBranchId) as { operationId: unknown } | undefined
    if (!row || typeof row.operationId !== 'string') throw new Error('GENERATION_V2_REGENERATE_SOURCE_INVALID')
    const source = new GenerationExecutionV2Repo(input.db).findOperationInTransaction(context, row.operationId)
    if (!source || source.operation.targetAnswerId.value !== input.sourceAnswerId ||
        source.operation.questionId.value !== input.questionId) throw new Error('GENERATION_V2_REGENERATE_SOURCE_INVALID')
    return source.snapshot.semanticIntent.attachments
  }
  return input.context ? read(input.context) : runGenerationV2AuthorityTransactionOnOwnedConnectionV2(input.db, read)
}
