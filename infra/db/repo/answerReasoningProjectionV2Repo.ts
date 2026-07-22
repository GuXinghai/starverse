import type BetterSqlite3 from 'better-sqlite3'
import { stableSerializeProviderRequestBoundedV2 } from '../../../src/next/generation-v2/compiler/stableSerialize'
import { ConversationGraphV2Identity } from '../../../src/next/generation-v2/domain/conversationGraphV2'
import {
  assertGenerationV2AuthorityTransactionContextV2,
  type GenerationV2AuthorityTransactionContextV2,
} from './generationV2AuthorityTransactionInternal'

const MAX_DETAILS = 65_536
const MAX_DETAIL_BYTES = 1024 * 1024

export class AnswerReasoningProjectionV2RepoError extends Error {
  constructor(readonly code:
    | 'GENERATION_V2_REASONING_PROJECTION_INPUT_INVALID'
    | 'GENERATION_V2_REASONING_PROJECTION_LIMIT_EXCEEDED'
    | 'GENERATION_V2_REASONING_PROJECTION_STATE_INVALID') {
    super(code)
    this.name = 'AnswerReasoningProjectionV2RepoError'
  }
}

function canonicalDetail(value: unknown): string {
  if (!value || typeof value !== 'object' || Array.isArray(value) || Object.getPrototypeOf(value) !== Object.prototype) {
    throw new AnswerReasoningProjectionV2RepoError('GENERATION_V2_REASONING_PROJECTION_INPUT_INVALID')
  }
  try { return stableSerializeProviderRequestBoundedV2(value, MAX_DETAIL_BYTES) } catch {
    throw new AnswerReasoningProjectionV2RepoError('GENERATION_V2_REASONING_PROJECTION_INPUT_INVALID')
  }
}

function decode(value: unknown): Readonly<Record<string, unknown>> {
  if (typeof value !== 'string') throw new AnswerReasoningProjectionV2RepoError('GENERATION_V2_REASONING_PROJECTION_STATE_INVALID')
  let parsed: unknown
  try { parsed = JSON.parse(value) } catch {
    throw new AnswerReasoningProjectionV2RepoError('GENERATION_V2_REASONING_PROJECTION_STATE_INVALID')
  }
  if (!parsed || typeof parsed !== 'object' || Array.isArray(parsed) ||
      stableSerializeProviderRequestBoundedV2(parsed, MAX_DETAIL_BYTES) !== value) {
    throw new AnswerReasoningProjectionV2RepoError('GENERATION_V2_REASONING_PROJECTION_STATE_INVALID')
  }
  return Object.freeze(parsed as Record<string, unknown>)
}

export class AnswerReasoningProjectionV2Repo {
  constructor(private readonly db: BetterSqlite3.Database, private readonly nowMs: () => number = Date.now) {}

  private insert(answerRootIdValue: string, detail: unknown): number {
    const answerRootId = ConversationGraphV2Identity.create('answer_root_id', answerRootIdValue).value
    const detailJson = canonicalDetail(detail)
    const row = this.db.prepare(`SELECT COALESCE(MAX(detail_index), -1) AS maxIndex,
      COUNT(*) AS count FROM answer_reasoning_detail_v2 WHERE answer_root_id=?`).get(answerRootId) as
      { maxIndex: unknown; count: unknown }
    if (!Number.isSafeInteger(row.maxIndex) || !Number.isSafeInteger(row.count) ||
        (row.count as number) < 0 || (row.count as number) >= MAX_DETAILS) {
      throw new AnswerReasoningProjectionV2RepoError('GENERATION_V2_REASONING_PROJECTION_LIMIT_EXCEEDED')
    }
    const detailIndex = (row.maxIndex as number) + 1
    const at = this.nowMs()
    if (!Number.isSafeInteger(at) || at < 0) throw new AnswerReasoningProjectionV2RepoError('GENERATION_V2_REASONING_PROJECTION_INPUT_INVALID')
    this.db.prepare(`INSERT INTO answer_reasoning_detail_v2
      (answer_root_id,detail_index,detail_json,created_at_ms) VALUES (?,?,?,?)`)
      .run(answerRootId, detailIndex, detailJson, at)
    return detailIndex
  }

  append(answerRootIdValue: string, detail: unknown): number {
    return this.db.transaction(() => this.insert(answerRootIdValue, detail)).immediate()
  }

  appendInAuthorityTransaction(context: GenerationV2AuthorityTransactionContextV2,
    answerRootIdValue: string, detail: unknown): number {
    assertGenerationV2AuthorityTransactionContextV2(context, this.db)
    return this.insert(answerRootIdValue, detail)
  }

  list(answerRootIdValue: string): readonly Readonly<Record<string, unknown>>[] {
    const answerRootId = ConversationGraphV2Identity.create('answer_root_id', answerRootIdValue).value
    const rows = this.db.prepare(`SELECT detail_index AS detailIndex,detail_json AS detailJson
      FROM answer_reasoning_detail_v2 WHERE answer_root_id=? ORDER BY detail_index ASC`).all(answerRootId) as
      Array<{ detailIndex: unknown; detailJson: unknown }>
    if (rows.length > MAX_DETAILS || rows.some((row, index) => row.detailIndex !== index)) {
      throw new AnswerReasoningProjectionV2RepoError('GENERATION_V2_REASONING_PROJECTION_STATE_INVALID')
    }
    return Object.freeze(rows.map((row) => decode(row.detailJson)))
  }
}
