import BetterSqlite3 from 'better-sqlite3'
import { randomUUID } from 'node:crypto'
import type {
  AssetBindingRecord,
  AssetBindingScope,
  AssetRevisionRecord,
  CreateAssetBindingInput,
  CreateAssetRevisionInput,
  CreateFileBlobInput,
  DeleteAssetBindingInput,
  FileBlobRecord,
} from '../types'

type SqlDatabase = BetterSqlite3.Database

type FileBlobRow = Readonly<{
  id: string
  sha256: string
  size_bytes: number
  mime: string | null
  storage_backend: FileBlobRecord['storageBackend']
  storage_uri: string
  created_at: number
}>

type AssetRevisionRow = Readonly<{
  id: string
  asset_id: string
  blob_id: string
  parent_revision_id: string | null
  cause: AssetRevisionRecord['cause']
  derived_from_asset_id: string | null
  created_at: number
}>

type AssetBindingRow = Readonly<{
  id: string
  asset_id: string
  scope: AssetBindingScope
  conversation_id: string | null
  message_id: string | null
  branch_id: string | null
  project_id: string | null
  created_at: number
  deleted_at: number | null
}>

const mapBlobRow = (row: FileBlobRow): FileBlobRecord => ({
  id: row.id,
  sha256: row.sha256,
  sizeBytes: row.size_bytes,
  mime: row.mime ?? null,
  storageBackend: row.storage_backend,
  storageUri: row.storage_uri,
  createdAt: row.created_at,
})

const mapRevisionRow = (row: AssetRevisionRow): AssetRevisionRecord => ({
  id: row.id,
  assetId: row.asset_id,
  blobId: row.blob_id,
  parentRevisionId: row.parent_revision_id ?? null,
  cause: row.cause,
  derivedFromAssetId: row.derived_from_asset_id ?? null,
  createdAt: row.created_at,
})

const mapBindingRow = (row: AssetBindingRow): AssetBindingRecord => ({
  id: row.id,
  assetId: row.asset_id,
  scope: row.scope,
  conversationId: row.conversation_id ?? null,
  messageId: row.message_id ?? null,
  branchId: row.branch_id ?? null,
  projectId: row.project_id ?? null,
  createdAt: row.created_at,
  deletedAt: row.deleted_at ?? null,
})

export class FileAssetStoreRepo {
  private insertBlobStmt: BetterSqlite3.Statement
  private getBlobByIdStmt: BetterSqlite3.Statement
  private getBlobBySha256Stmt: BetterSqlite3.Statement
  private insertRevisionStmt: BetterSqlite3.Statement
  private getCurrentRevisionStmt: BetterSqlite3.Statement
  private insertBindingStmt: BetterSqlite3.Statement
  private listBindingsByAssetStmt: BetterSqlite3.Statement

  constructor(private db: SqlDatabase) {
    this.insertBlobStmt = this.db.prepare(`
      INSERT INTO file_blobs(
        id,
        sha256,
        size_bytes,
        mime,
        storage_backend,
        storage_uri,
        created_at
      )
      VALUES (
        @id,
        @sha256,
        @sizeBytes,
        @mime,
        @storageBackend,
        @storageUri,
        @createdAt
      )
    `)

    this.getBlobByIdStmt = this.db.prepare(`
      SELECT *
      FROM file_blobs
      WHERE id = @id
      LIMIT 1
    `)

    this.getBlobBySha256Stmt = this.db.prepare(`
      SELECT *
      FROM file_blobs
      WHERE sha256 = @sha256
      LIMIT 1
    `)

    this.insertRevisionStmt = this.db.prepare(`
      INSERT INTO file_asset_revisions(
        id,
        asset_id,
        blob_id,
        parent_revision_id,
        cause,
        derived_from_asset_id,
        created_at
      )
      VALUES (
        @id,
        @assetId,
        @blobId,
        @parentRevisionId,
        @cause,
        @derivedFromAssetId,
        @createdAt
      )
    `)

    this.getCurrentRevisionStmt = this.db.prepare(`
      SELECT *
      FROM file_asset_revisions
      WHERE asset_id = @assetId
      ORDER BY created_at DESC, rowid DESC
      LIMIT 1
    `)

    this.insertBindingStmt = this.db.prepare(`
      INSERT INTO file_asset_bindings(
        id,
        asset_id,
        scope,
        conversation_id,
        message_id,
        branch_id,
        project_id,
        created_at,
        deleted_at
      )
      VALUES (
        @id,
        @assetId,
        @scope,
        @conversationId,
        @messageId,
        @branchId,
        @projectId,
        @createdAt,
        NULL
      )
    `)

    this.listBindingsByAssetStmt = this.db.prepare(`
      SELECT *
      FROM file_asset_bindings
      WHERE asset_id = @assetId
      ORDER BY created_at ASC, rowid ASC
    `)
  }

  createBlob(input: CreateFileBlobInput): FileBlobRecord {
    const sha256 = normalizeSha256(input.sha256)
    const existing = this.getBlobBySha256(sha256)
    if (existing) return existing

    const row: FileBlobRecord = {
      id: normalizeOptional(input.id) ?? randomUUID(),
      sha256,
      sizeBytes: requireNonNegativeInteger(input.sizeBytes, 'sizeBytes'),
      mime: normalizeOptional(input.mime),
      storageBackend: input.storageBackend ?? 'local_fs',
      storageUri: requireNonEmpty(input.storageUri, 'storageUri'),
      createdAt: input.createdAt ?? Date.now(),
    }

    try {
      this.insertBlobStmt.run(row)
      return row
    } catch (error) {
      const raced = this.getBlobBySha256(sha256)
      if (raced) return raced
      throw error
    }
  }

  getBlobById(id: string): FileBlobRecord | null {
    const row = this.getBlobByIdStmt.get({ id: requireNonEmpty(id, 'id') }) as FileBlobRow | undefined
    return row ? mapBlobRow(row) : null
  }

  getBlobBySha256(sha256: string): FileBlobRecord | null {
    const row = this.getBlobBySha256Stmt.get({ sha256: normalizeSha256(sha256) }) as FileBlobRow | undefined
    return row ? mapBlobRow(row) : null
  }

  createRevision(input: CreateAssetRevisionInput): AssetRevisionRecord {
    const row: AssetRevisionRecord = {
      id: normalizeOptional(input.id) ?? randomUUID(),
      assetId: requireNonEmpty(input.assetId, 'assetId'),
      blobId: requireNonEmpty(input.blobId, 'blobId'),
      parentRevisionId: normalizeOptional(input.parentRevisionId),
      cause: input.cause,
      derivedFromAssetId: normalizeOptional(input.derivedFromAssetId),
      createdAt: input.createdAt ?? Date.now(),
    }
    this.insertRevisionStmt.run(row)
    return row
  }

  getCurrentRevision(assetId: string): AssetRevisionRecord | null {
    const row = this.getCurrentRevisionStmt.get({ assetId: requireNonEmpty(assetId, 'assetId') }) as AssetRevisionRow | undefined
    return row ? mapRevisionRow(row) : null
  }

  bindAsset(input: CreateAssetBindingInput): AssetBindingRecord {
    const row = normalizeBinding({
      id: normalizeOptional(input.id) ?? randomUUID(),
      assetId: requireNonEmpty(input.assetId, 'assetId'),
      scope: input.scope,
      conversationId: normalizeOptional(input.conversationId),
      messageId: normalizeOptional(input.messageId),
      branchId: normalizeOptional(input.branchId),
      projectId: normalizeOptional(input.projectId),
      createdAt: input.createdAt ?? Date.now(),
      deletedAt: null,
    })
    this.insertBindingStmt.run(row)
    return row
  }

  markBindingDeleted(input: DeleteAssetBindingInput): number {
    const normalized = normalizeBinding({
      id: 'delete-filter',
      assetId: requireNonEmpty(input.assetId, 'assetId'),
      scope: input.scope,
      conversationId: normalizeOptional(input.conversationId),
      messageId: normalizeOptional(input.messageId),
      branchId: normalizeOptional(input.branchId),
      projectId: normalizeOptional(input.projectId),
      createdAt: 0,
      deletedAt: null,
    })
    const result = this.db.prepare(`
      UPDATE file_asset_bindings
      SET deleted_at = @deletedAt
      WHERE asset_id = @assetId
        AND scope = @scope
        AND deleted_at IS NULL
        AND (@conversationId IS NULL OR conversation_id = @conversationId)
        AND (@messageId IS NULL OR message_id = @messageId)
        AND (@branchId IS NULL OR branch_id = @branchId)
        AND (@projectId IS NULL OR project_id = @projectId)
    `).run({
      assetId: normalized.assetId,
      scope: normalized.scope,
      conversationId: normalized.conversationId,
      messageId: normalized.messageId,
      branchId: normalized.branchId,
      projectId: normalized.projectId,
      deletedAt: input.deletedAt ?? Date.now(),
    })
    return Number(result.changes ?? 0)
  }

  listBindingsByAssetId(assetId: string): AssetBindingRecord[] {
    return (this.listBindingsByAssetStmt.all({ assetId: requireNonEmpty(assetId, 'assetId') }) as AssetBindingRow[])
      .map(mapBindingRow)
  }
}

function normalizeBinding(row: AssetBindingRecord): AssetBindingRecord {
  const scopeFields = {
    conversation: row.conversationId,
    message: row.messageId,
    branch: row.branchId,
    project: row.projectId,
  } satisfies Record<AssetBindingScope, string | null>
  if (!scopeFields[row.scope]) throw new Error(`${row.scope} binding requires matching scope id`)
  return row
}

function requireNonEmpty(value: string | null | undefined, field: string): string {
  const normalized = String(value ?? '').trim()
  if (!normalized) throw new Error(`${field} is required`)
  return normalized
}

function normalizeOptional(value: string | null | undefined): string | null {
  const normalized = String(value ?? '').trim()
  return normalized || null
}

function normalizeSha256(value: string): string {
  const normalized = requireNonEmpty(value, 'sha256').toLowerCase()
  if (!/^[a-f0-9]{64}$/.test(normalized)) throw new Error('sha256 must be a 64-character hex digest')
  return normalized
}

function requireNonNegativeInteger(value: number, field: string): number {
  if (!Number.isInteger(value) || value < 0) throw new Error(`${field} must be a non-negative integer`)
  return value
}
