import { randomUUID } from 'node:crypto'
import type BetterSqlite3 from 'better-sqlite3'
import type {
  JsonObject,
  ProviderFileUploadCacheInvalidateInput,
  ProviderFileUploadCacheKey,
  ProviderFileUploadCacheMarkFailedInput,
  ProviderFileUploadCacheMarkReadyInput,
  ProviderFileUploadCacheRecord,
  ProviderFileUploadCacheReserveInput,
  ProviderFileUploadCacheReserveResult,
} from '../types'

type CacheRow = Readonly<{
  id: string
  provider: string
  endpoint_family: string
  normalized_base_url: string
  credential_fingerprint: string
  asset_id: string
  revision_id: string
  blob_sha256: string
  mime_type: string
  size_bytes: number
  asset_kind: string
  upload_purpose: string
  provider_file_id: string | null
  provider_file_uri: string | null
  provider_file_name: string | null
  status: string
  expires_at_ms: number | null
  upload_started_at_ms: number
  uploaded_at_ms: number | null
  invalidated_at_ms: number | null
  last_error_code: string | null
  last_error_message: string | null
  metadata_json: string | null
  created_at_ms: number
  updated_at_ms: number
}>

export class ProviderFileUploadCacheRepo {
  private readonly getByIdStmt: BetterSqlite3.Statement
  private readonly findByKeyStmt: BetterSqlite3.Statement
  private readonly insertUploadingStmt: BetterSqlite3.Statement
  private readonly resetUploadingStmt: BetterSqlite3.Statement
  private readonly markReadyStmt: BetterSqlite3.Statement
  private readonly markFailedStmt: BetterSqlite3.Statement
  private readonly invalidateStmt: BetterSqlite3.Statement
  private readonly reserveTx: (input: ProviderFileUploadCacheReserveInput) => ProviderFileUploadCacheReserveResult

  constructor(db: BetterSqlite3.Database) {
    this.getByIdStmt = db.prepare(`
      SELECT * FROM provider_file_upload_cache
      WHERE id=@id
      LIMIT 1
    `)
    this.findByKeyStmt = db.prepare(`
      SELECT * FROM provider_file_upload_cache
      WHERE provider=@provider
        AND endpoint_family=@endpointFamily
        AND normalized_base_url=@normalizedBaseUrl
        AND credential_fingerprint=@credentialFingerprint
        AND asset_id=@assetId
        AND revision_id=@revisionId
        AND blob_sha256=@blobSha256
        AND mime_type=@mimeType
        AND size_bytes=@sizeBytes
        AND asset_kind=@assetKind
        AND upload_purpose=@uploadPurpose
      LIMIT 1
    `)
    this.insertUploadingStmt = db.prepare(`
      INSERT INTO provider_file_upload_cache (
        id,
        provider,
        endpoint_family,
        normalized_base_url,
        credential_fingerprint,
        asset_id,
        revision_id,
        blob_sha256,
        mime_type,
        size_bytes,
        asset_kind,
        upload_purpose,
        status,
        upload_started_at_ms,
        created_at_ms,
        updated_at_ms
      ) VALUES (
        @id,
        @provider,
        @endpointFamily,
        @normalizedBaseUrl,
        @credentialFingerprint,
        @assetId,
        @revisionId,
        @blobSha256,
        @mimeType,
        @sizeBytes,
        @assetKind,
        @uploadPurpose,
        'uploading',
        @nowMs,
        @nowMs,
        @nowMs
      )
    `)
    this.resetUploadingStmt = db.prepare(`
      UPDATE provider_file_upload_cache
      SET provider_file_id=NULL,
          provider_file_uri=NULL,
          provider_file_name=NULL,
          status='uploading',
          expires_at_ms=NULL,
          upload_started_at_ms=@nowMs,
          uploaded_at_ms=NULL,
          invalidated_at_ms=NULL,
          last_error_code=NULL,
          last_error_message=NULL,
          metadata_json=NULL,
          updated_at_ms=@nowMs
      WHERE id=@id
    `)
    this.markReadyStmt = db.prepare(`
      UPDATE provider_file_upload_cache
      SET provider_file_id=@providerFileId,
          provider_file_uri=@providerFileUri,
          provider_file_name=@providerFileName,
          status='ready',
          expires_at_ms=@expiresAtMs,
          uploaded_at_ms=@nowMs,
          last_error_code=NULL,
          last_error_message=NULL,
          metadata_json=@metadataJson,
          updated_at_ms=@nowMs
      WHERE id=@id
    `)
    this.markFailedStmt = db.prepare(`
      UPDATE provider_file_upload_cache
      SET status='failed',
          last_error_code=@errorCode,
          last_error_message=@errorMessage,
          updated_at_ms=@nowMs
      WHERE id=@id
    `)
    this.invalidateStmt = db.prepare(`
      UPDATE provider_file_upload_cache
      SET status='invalidated',
          invalidated_at_ms=@nowMs,
          last_error_code=@errorCode,
          last_error_message=@errorMessage,
          updated_at_ms=@nowMs
      WHERE id=@id
    `)

    this.reserveTx = db.transaction((input: ProviderFileUploadCacheReserveInput) => {
      const nowMs = normalizedNow(input.nowMs)
      const existing = this.findByKey(input)
      if (existing) {
        if (isReusable(existing, nowMs)) return { status: 'ready' as const, record: existing }
        if (existing.status === 'uploading' && !isStaleUploading(existing, nowMs)) {
          return { status: 'conflict' as const, record: existing, retryable: true as const }
        }
        const reset = this.resetUploading(existing.id, nowMs)
        return { status: 'reserved' as const, record: reset }
      }

      const id = input.id ?? randomUUID()
      try {
        this.insertUploadingStmt.run({ ...normalizeKey(input), id, nowMs })
      } catch (error: any) {
        if (String(error?.code ?? '') !== 'SQLITE_CONSTRAINT_UNIQUE') throw error
        const raced = this.findByKey(input)
        if (raced && isReusable(raced, nowMs)) return { status: 'ready' as const, record: raced }
        if (raced && (raced.status !== 'uploading' || isStaleUploading(raced, nowMs))) {
          const reset = this.resetUploading(raced.id, nowMs)
          return { status: 'reserved' as const, record: reset }
        }
        return { status: 'conflict' as const, record: raced, retryable: true as const }
      }

      const inserted = this.getById(id)
      if (!inserted) throw new Error('provider file upload cache reservation was not persisted')
      return { status: 'reserved' as const, record: inserted }
    })
  }

  getById(id: string): ProviderFileUploadCacheRecord | null {
    const row = this.getByIdStmt.get({ id: normalizeText(id, 'id') }) as CacheRow | undefined
    return row ? mapRow(row) : null
  }

  findByKey(key: ProviderFileUploadCacheKey): ProviderFileUploadCacheRecord | null {
    const row = this.findByKeyStmt.get(normalizeKey(key)) as CacheRow | undefined
    return row ? mapRow(row) : null
  }

  findReusable(key: ProviderFileUploadCacheKey, nowMs = Date.now()): ProviderFileUploadCacheRecord | null {
    const record = this.findByKey(key)
    return record && isReusable(record, nowMs) ? record : null
  }

  reserve(input: ProviderFileUploadCacheReserveInput): ProviderFileUploadCacheReserveResult {
    return this.reserveTx(input)
  }

  private resetUploading(id: string, nowMs: number): ProviderFileUploadCacheRecord {
    this.resetUploadingStmt.run({ id: normalizeText(id, 'id'), nowMs })
    const record = this.getById(id)
    if (!record) throw new Error('provider file upload cache reservation reset was not persisted')
    return record
  }

  markReady(input: ProviderFileUploadCacheMarkReadyInput): ProviderFileUploadCacheRecord | null {
    const nowMs = normalizedNow(input.nowMs)
    this.markReadyStmt.run({
      id: normalizeText(input.id, 'id'),
      providerFileId: normalizeNullable(input.providerFileId),
      providerFileUri: normalizeNullable(input.providerFileUri),
      providerFileName: normalizeNullable(input.providerFileName),
      expiresAtMs: input.expiresAtMs ?? null,
      metadataJson: input.metadataJson ? JSON.stringify(input.metadataJson) : null,
      nowMs,
    })
    return this.getById(input.id)
  }

  markFailed(input: ProviderFileUploadCacheMarkFailedInput): ProviderFileUploadCacheRecord | null {
    const nowMs = normalizedNow(input.nowMs)
    this.markFailedStmt.run({
      id: normalizeText(input.id, 'id'),
      errorCode: normalizeText(input.errorCode, 'errorCode').slice(0, 120),
      errorMessage: normalizeText(input.errorMessage, 'errorMessage').slice(0, 300),
      nowMs,
    })
    return this.getById(input.id)
  }

  invalidate(input: ProviderFileUploadCacheInvalidateInput): ProviderFileUploadCacheRecord | null {
    const nowMs = normalizedNow(input.nowMs)
    this.invalidateStmt.run({
      id: normalizeText(input.id, 'id'),
      errorCode: normalizeNullable(input.errorCode),
      errorMessage: normalizeNullable(input.errorMessage)?.slice(0, 300) ?? null,
      nowMs,
    })
    return this.getById(input.id)
  }
}

function isReusable(record: ProviderFileUploadCacheRecord, nowMs: number): boolean {
  return record.status === 'ready' && (record.expiresAtMs == null || record.expiresAtMs > nowMs)
}

const STALE_UPLOAD_RESERVATION_MS = 10 * 60 * 1000

function isStaleUploading(record: ProviderFileUploadCacheRecord, nowMs: number): boolean {
  return record.status === 'uploading' && record.uploadStartedAtMs + STALE_UPLOAD_RESERVATION_MS <= nowMs
}

function mapRow(row: CacheRow): ProviderFileUploadCacheRecord {
  return {
    id: row.id,
    provider: row.provider as ProviderFileUploadCacheRecord['provider'],
    endpointFamily: row.endpoint_family,
    normalizedBaseUrl: row.normalized_base_url,
    credentialFingerprint: row.credential_fingerprint,
    assetId: row.asset_id,
    revisionId: row.revision_id,
    blobSha256: row.blob_sha256,
    mimeType: row.mime_type,
    sizeBytes: row.size_bytes,
    assetKind: row.asset_kind as ProviderFileUploadCacheRecord['assetKind'],
    uploadPurpose: row.upload_purpose,
    providerFileId: row.provider_file_id,
    providerFileUri: row.provider_file_uri,
    providerFileName: row.provider_file_name,
    status: row.status as ProviderFileUploadCacheRecord['status'],
    expiresAtMs: row.expires_at_ms,
    uploadStartedAtMs: row.upload_started_at_ms,
    uploadedAtMs: row.uploaded_at_ms,
    invalidatedAtMs: row.invalidated_at_ms,
    lastErrorCode: row.last_error_code,
    lastErrorMessage: row.last_error_message,
    metadataJson: parseJson(row.metadata_json),
    createdAtMs: row.created_at_ms,
    updatedAtMs: row.updated_at_ms,
  }
}

function normalizeKey(key: ProviderFileUploadCacheKey): ProviderFileUploadCacheKey {
  return {
    provider: key.provider,
    endpointFamily: normalizeText(key.endpointFamily, 'endpointFamily'),
    normalizedBaseUrl: normalizeText(key.normalizedBaseUrl, 'normalizedBaseUrl'),
    credentialFingerprint: normalizeSha256(key.credentialFingerprint, 'credentialFingerprint'),
    assetId: normalizeText(key.assetId, 'assetId'),
    revisionId: normalizeText(key.revisionId, 'revisionId'),
    blobSha256: normalizeSha256(key.blobSha256, 'blobSha256'),
    mimeType: normalizeText(key.mimeType, 'mimeType').toLowerCase(),
    sizeBytes: normalizeSize(key.sizeBytes),
    assetKind: key.assetKind,
    uploadPurpose: normalizeText(key.uploadPurpose, 'uploadPurpose'),
  }
}

function normalizeText(value: unknown, label: string): string {
  const text = String(value ?? '').trim()
  if (!text) throw new Error(`${label} is required`)
  return text
}

function normalizeNullable(value: unknown): string | null {
  const text = String(value ?? '').trim()
  return text ? text : null
}

function normalizeSha256(value: unknown, label: string): string {
  const text = normalizeText(value, label).toLowerCase()
  if (!/^[a-f0-9]{64}$/.test(text)) throw new Error(`${label} must be a 64-character sha256 hex digest`)
  return text
}

function normalizeSize(value: unknown): number {
  const size = Number(value)
  if (!Number.isSafeInteger(size) || size < 0) throw new Error('sizeBytes must be a non-negative integer')
  return size
}

function normalizedNow(value: unknown): number {
  const now = Number(value ?? Date.now())
  if (!Number.isFinite(now) || now <= 0) return Date.now()
  return Math.trunc(now)
}

function parseJson(value: string | null): JsonObject | null {
  if (!value) return null
  try {
    const parsed = JSON.parse(value)
    return parsed && typeof parsed === 'object' && !Array.isArray(parsed) ? parsed as JsonObject : null
  } catch {
    return null
  }
}
