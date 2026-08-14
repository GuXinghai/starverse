import type BetterSqlite3 from 'better-sqlite3'
import type { FileTypeStaticPolicyResult, FileTypeVerdict } from '../../../src/next/file-type/types'
import {
  assertGenerationV2AuthorityTransactionContextV2,
  type GenerationV2AuthorityTransactionContextV2,
} from './generationV2AuthorityTransactionInternal'

export const FILE_TYPE_DETECTOR_CONTRACT_REVISION_V2 = 'file-type-detection-v2.1'

export type FileTypeDetectionWarningV2 = Readonly<{
  code: string
  detail: string | null
}>

export type FileTypeDetectionProjectionV2 = Readonly<{
  assetRevisionId: string
  assetSha256: string
  attemptId: string
  revision: number
  status: 'pending' | 'ready' | 'failed'
  detectorContractRevision: string
  verdict: FileTypeVerdict | null
  staticPolicy: FileTypeStaticPolicyResult | null
  warnings: readonly FileTypeDetectionWarningV2[]
  errorCode: string | null
  errorDetail: string | null
  requestedAtMs: number
  completedAtMs: number | null
}>

export class FileTypeDetectionV2RepoError extends Error {
  constructor(readonly code:
    | 'GENERATION_V2_FILE_DETECTION_INPUT_INVALID'
    | 'GENERATION_V2_FILE_DETECTION_NOT_FOUND'
    | 'GENERATION_V2_FILE_DETECTION_STATE_INVALID'
    | 'GENERATION_V2_FILE_DETECTION_CONFLICT'
    | 'GENERATION_V2_FILE_DETECTION_LOCK_CONFLICT') {
    super(code)
    this.name = 'FileTypeDetectionV2RepoError'
  }
}

type DetectionRow = Readonly<Record<string, unknown>>

function identity(value: unknown): string {
  if (typeof value !== 'string' || value.length < 1 || value.length > 512 || value.trim() !== value) {
    throw new FileTypeDetectionV2RepoError('GENERATION_V2_FILE_DETECTION_INPUT_INVALID')
  }
  return value
}

function digest(value: unknown): string {
  if (typeof value !== 'string' || !/^[0-9a-f]{64}$/u.test(value)) {
    throw new FileTypeDetectionV2RepoError('GENERATION_V2_FILE_DETECTION_INPUT_INVALID')
  }
  return value
}

function safeTime(value: unknown): number {
  if (!Number.isSafeInteger(value) || (value as number) < 0) {
    throw new FileTypeDetectionV2RepoError('GENERATION_V2_FILE_DETECTION_INPUT_INVALID')
  }
  return value as number
}

function parseJson<T>(value: unknown, fallback: T): T {
  if (value === null) return fallback
  if (typeof value !== 'string') throw new FileTypeDetectionV2RepoError('GENERATION_V2_FILE_DETECTION_STATE_INVALID')
  try { return JSON.parse(value) as T } catch {
    throw new FileTypeDetectionV2RepoError('GENERATION_V2_FILE_DETECTION_STATE_INVALID')
  }
}

export class FileTypeDetectionV2Repo {
  constructor(private readonly db: BetterSqlite3.Database, private readonly nowMs: () => number = Date.now) {
    db.pragma('foreign_keys = ON')
  }

  createPendingInAuthorityTransaction(context: GenerationV2AuthorityTransactionContextV2, input: Readonly<{
    assetRevisionId: string
    assetSha256: string
    attemptId: string
  }>): FileTypeDetectionProjectionV2 {
    assertGenerationV2AuthorityTransactionContextV2(context, this.db)
    const assetRevisionId = identity(input.assetRevisionId)
    const assetSha256 = digest(input.assetSha256)
    const attemptId = identity(input.attemptId)
    const now = safeTime(this.nowMs())
    this.db.prepare(`INSERT INTO file_type_detection_v2 (
      asset_revision_id, asset_sha256, attempt_id, revision, status,
      detector_contract_revision, verdict_json, static_policy_json, warning_json,
      error_code, error_detail, requested_at_ms, completed_at_ms
    ) VALUES (?, ?, ?, 1, 'pending', ?, NULL, NULL, '[]', NULL, NULL, ?, NULL)`).run(
      assetRevisionId, assetSha256, attemptId, FILE_TYPE_DETECTOR_CONTRACT_REVISION_V2, now,
    )
    return this.get(assetRevisionId)
  }

  beginRetry(assetRevisionIdValue: string, attemptIdValue: string): FileTypeDetectionProjectionV2 {
    const assetRevisionId = identity(assetRevisionIdValue)
    const attemptId = identity(attemptIdValue)
    const now = safeTime(this.nowMs())
    return this.immediate(this.db.transaction(() => {
      const result = this.db.prepare(`UPDATE file_type_detection_v2 SET
        attempt_id=?, revision=revision+1, status='pending', detector_contract_revision=?,
        verdict_json=NULL, static_policy_json=NULL, warning_json='[]', error_code=NULL,
        error_detail=NULL, requested_at_ms=?, completed_at_ms=NULL
        WHERE asset_revision_id=? AND status='failed'`).run(
        attemptId, FILE_TYPE_DETECTOR_CONTRACT_REVISION_V2, now, assetRevisionId,
      )
      if (result.changes !== 1) {
        const exists = this.db.prepare('SELECT 1 FROM file_type_detection_v2 WHERE asset_revision_id=?').get(assetRevisionId)
        throw new FileTypeDetectionV2RepoError(exists
          ? 'GENERATION_V2_FILE_DETECTION_STATE_INVALID'
          : 'GENERATION_V2_FILE_DETECTION_NOT_FOUND')
      }
      return this.get(assetRevisionId)
    }))
  }

  get(assetRevisionIdValue: string): FileTypeDetectionProjectionV2 {
    const assetRevisionId = identity(assetRevisionIdValue)
    const row = this.db.prepare(`SELECT asset_revision_id, asset_sha256, attempt_id, revision, status,
      detector_contract_revision, verdict_json, static_policy_json, warning_json,
      error_code, error_detail, requested_at_ms, completed_at_ms
      FROM file_type_detection_v2 WHERE asset_revision_id=?`).get(assetRevisionId) as DetectionRow | undefined
    if (!row) throw new FileTypeDetectionV2RepoError('GENERATION_V2_FILE_DETECTION_NOT_FOUND')
    return this.decode(row)
  }

  listPending(): readonly FileTypeDetectionProjectionV2[] {
    return Object.freeze((this.db.prepare(`SELECT asset_revision_id, asset_sha256, attempt_id, revision, status,
      detector_contract_revision, verdict_json, static_policy_json, warning_json,
      error_code, error_detail, requested_at_ms, completed_at_ms
      FROM file_type_detection_v2 WHERE status='pending' ORDER BY requested_at_ms, asset_revision_id`).all() as DetectionRow[])
      .map((row) => this.decode(row)))
  }

  completeReady(input: Readonly<{
    assetRevisionId: string
    attemptId: string
    revision: number
    verdict: FileTypeVerdict
    staticPolicy: FileTypeStaticPolicyResult
    warnings?: readonly FileTypeDetectionWarningV2[]
  }>): boolean {
    const now = safeTime(this.nowMs())
    const warnings = input.warnings ?? []
    const result = this.db.prepare(`UPDATE file_type_detection_v2 SET
      revision=revision+1, status='ready', verdict_json=?, static_policy_json=?, warning_json=?,
      error_code=NULL, error_detail=NULL, completed_at_ms=?
      WHERE asset_revision_id=? AND attempt_id=? AND revision=? AND status='pending'`).run(
      JSON.stringify(input.verdict), JSON.stringify(input.staticPolicy), JSON.stringify(warnings), now,
      identity(input.assetRevisionId), identity(input.attemptId), safeTime(input.revision),
    )
    return result.changes === 1
  }

  completeFailed(input: Readonly<{
    assetRevisionId: string
    attemptId: string
    revision: number
    errorCode: string
    errorDetail: string | null
  }>): boolean {
    const now = safeTime(this.nowMs())
    const result = this.db.prepare(`UPDATE file_type_detection_v2 SET
      revision=revision+1, status='failed', verdict_json=NULL, static_policy_json=NULL,
      warning_json='[]', error_code=?, error_detail=?, completed_at_ms=?
      WHERE asset_revision_id=? AND attempt_id=? AND revision=? AND status='pending'`).run(
      identity(input.errorCode), input.errorDetail, now,
      identity(input.assetRevisionId), identity(input.attemptId), safeTime(input.revision),
    )
    return result.changes === 1
  }

  private decode(row: DetectionRow): FileTypeDetectionProjectionV2 {
    if (typeof row.asset_revision_id !== 'string' || typeof row.asset_sha256 !== 'string' ||
        typeof row.attempt_id !== 'string' || !Number.isSafeInteger(row.revision) ||
        (row.status !== 'pending' && row.status !== 'ready' && row.status !== 'failed') ||
        typeof row.detector_contract_revision !== 'string' || !Number.isSafeInteger(row.requested_at_ms) ||
        (row.completed_at_ms !== null && !Number.isSafeInteger(row.completed_at_ms)) ||
        (row.error_code !== null && typeof row.error_code !== 'string') ||
        (row.error_detail !== null && typeof row.error_detail !== 'string')) {
      throw new FileTypeDetectionV2RepoError('GENERATION_V2_FILE_DETECTION_STATE_INVALID')
    }
    const warnings = parseJson<unknown>(row.warning_json, [])
    if (!Array.isArray(warnings) || warnings.some((item) => !item || typeof item !== 'object' ||
      typeof (item as Record<string, unknown>).code !== 'string' ||
      ((item as Record<string, unknown>).detail !== null && typeof (item as Record<string, unknown>).detail !== 'string'))) {
      throw new FileTypeDetectionV2RepoError('GENERATION_V2_FILE_DETECTION_STATE_INVALID')
    }
    return Object.freeze({
      assetRevisionId: row.asset_revision_id,
      assetSha256: row.asset_sha256,
      attemptId: row.attempt_id,
      revision: row.revision as number,
      status: row.status,
      detectorContractRevision: row.detector_contract_revision,
      verdict: row.status === 'ready' ? parseJson<FileTypeVerdict>(row.verdict_json, null as never) : null,
      staticPolicy: row.status === 'ready' ? parseJson<FileTypeStaticPolicyResult>(row.static_policy_json, null as never) : null,
      warnings: Object.freeze(warnings as FileTypeDetectionWarningV2[]),
      errorCode: row.error_code as string | null,
      errorDetail: row.error_detail as string | null,
      requestedAtMs: row.requested_at_ms as number,
      completedAtMs: row.completed_at_ms as number | null,
    })
  }

  private immediate<T>(transaction: { immediate(): T }): T {
    try { return transaction.immediate() } catch (error) {
      if (error instanceof FileTypeDetectionV2RepoError) throw error
      const code = (error as { code?: unknown })?.code
      if (code === 'SQLITE_BUSY' || code === 'SQLITE_BUSY_SNAPSHOT' || code === 'SQLITE_LOCKED') {
        throw new FileTypeDetectionV2RepoError('GENERATION_V2_FILE_DETECTION_LOCK_CONFLICT')
      }
      throw error
    }
  }
}
