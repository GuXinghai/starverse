import BetterSqlite3 from 'better-sqlite3'
import { randomUUID } from 'node:crypto'
import type {
  CreateFileAssetInput,
  FileAssetPhysicalCleanupPlan,
  FileAssetRecord,
  ListFileAssetsByIdsInput,
  SoftDeleteFileAssetInput,
} from '../types'

type SqlDatabase = BetterSqlite3.Database

type FileAssetRow = Readonly<{
  id: string
  sha256: string | null
  filename: string
  extension: string | null
  mime: string | null
  size_bytes: number
  asset_kind: FileAssetRecord['assetKind']
  source_kind: FileAssetRecord['sourceKind']
  storage_backend: FileAssetRecord['storageBackend']
  storage_uri: string
  ingest_status: FileAssetRecord['ingestStatus']
  preview_status: FileAssetRecord['previewStatus']
  source_meta_json: string | null
  created_at: number
  updated_at: number
  deleted_at: number | null
}>

const mapFileAssetRow = (row: FileAssetRow): FileAssetRecord => ({
  id: row.id,
  sha256: row.sha256 ?? null,
  filename: row.filename,
  extension: row.extension ?? null,
  mime: row.mime ?? null,
  sizeBytes: row.size_bytes,
  assetKind: row.asset_kind,
  sourceKind: row.source_kind,
  storageBackend: row.storage_backend,
  storageUri: row.storage_uri,
  ingestStatus: row.ingest_status,
  previewStatus: row.preview_status,
  sourceMetaJson: row.source_meta_json ? safeParseJson(row.source_meta_json) : null,
  createdAt: row.created_at,
  updatedAt: row.updated_at,
  deletedAt: row.deleted_at ?? null,
})

export class FileAssetRepo {
  private insertStmt: BetterSqlite3.Statement
  private getByIdStmt: BetterSqlite3.Statement
  private softDeleteStmt: BetterSqlite3.Statement
  private listDerivativeUrisStmt: BetterSqlite3.Statement

  constructor(private db: SqlDatabase) {
    this.insertStmt = this.db.prepare(`
      INSERT INTO file_assets(
        id,
        sha256,
        filename,
        extension,
        mime,
        size_bytes,
        asset_kind,
        source_kind,
        storage_backend,
        storage_uri,
        ingest_status,
        preview_status,
        source_meta_json,
        created_at,
        updated_at,
        deleted_at
      )
      VALUES (
        @id,
        @sha256,
        @filename,
        @extension,
        @mime,
        @sizeBytes,
        @assetKind,
        @sourceKind,
        @storageBackend,
        @storageUri,
        @ingestStatus,
        @previewStatus,
        @sourceMetaJson,
        @createdAt,
        @updatedAt,
        NULL
      )
    `)

    this.getByIdStmt = this.db.prepare(`
      SELECT *
      FROM file_assets
      WHERE id = @id
      LIMIT 1
    `)

    this.softDeleteStmt = this.db.prepare(`
      UPDATE file_assets
      SET deleted_at = @deletedAt,
          ingest_status = 'deleted',
          updated_at = @deletedAt
      WHERE id = @id
        AND deleted_at IS NULL
    `)

    this.listDerivativeUrisStmt = this.db.prepare(`
      SELECT storage_uri AS storageUri
      FROM file_derivatives
      WHERE parent_asset_id = @assetId
      ORDER BY created_at ASC
    `)
  }

  create(input: CreateFileAssetInput): FileAssetRecord {
    const now = Date.now()
    const createdAt = input.createdAt ?? now
    const updatedAt = input.updatedAt ?? createdAt
    const row: FileAssetRecord = {
      id: input.id ?? randomUUID(),
      sha256: normalizeNullable(input.sha256),
      filename: requireNonEmpty(input.filename, 'filename'),
      extension: normalizeNullable(input.extension),
      mime: normalizeNullable(input.mime),
      sizeBytes: requireNonNegativeInteger(input.sizeBytes, 'sizeBytes'),
      assetKind: input.assetKind,
      sourceKind: input.sourceKind,
      storageBackend: input.storageBackend ?? 'local_fs',
      storageUri: requireNonEmpty(input.storageUri, 'storageUri'),
      ingestStatus: input.ingestStatus ?? 'registered',
      previewStatus: input.previewStatus ?? 'not_requested',
      sourceMetaJson: input.sourceMetaJson ?? null,
      createdAt,
      updatedAt,
      deletedAt: null,
    }

    this.insertStmt.run({
      ...row,
      sourceMetaJson: row.sourceMetaJson ? JSON.stringify(row.sourceMetaJson) : null,
    })
    return row
  }

  getById(id: string): FileAssetRecord | null {
    const normalized = requireNonEmpty(id, 'id')
    const row = this.getByIdStmt.get({ id: normalized }) as FileAssetRow | undefined
    return row ? mapFileAssetRow(row) : null
  }

  listByIds(input: ListFileAssetsByIdsInput): FileAssetRecord[] {
    const ids = normalizeIds(input.ids)
    if (ids.length === 0) return []

    const placeholders = ids.map((_, idx) => `@id${idx}`).join(', ')
    const stmt = this.db.prepare(`
      SELECT *
      FROM file_assets
      WHERE id IN (${placeholders})
      ORDER BY created_at ASC
    `)
    const params = Object.fromEntries(ids.map((id, idx) => [`id${idx}`, id]))
    return (stmt.all(params) as FileAssetRow[]).map(mapFileAssetRow)
  }

  softDelete(input: SoftDeleteFileAssetInput): { ok: true; softDeleted: boolean; physicalCleanupRequired: true } {
    const id = requireNonEmpty(input.id, 'id')
    const result = this.softDeleteStmt.run({ id, deletedAt: input.deletedAt ?? Date.now() })
    return {
      ok: true,
      softDeleted: Number(result.changes ?? 0) > 0,
      physicalCleanupRequired: true,
    }
  }

  planPhysicalCleanup(input: SoftDeleteFileAssetInput): FileAssetPhysicalCleanupPlan {
    const asset = this.getById(input.id)
    if (!asset) {
      return {
        ok: true,
        assetId: input.id,
        storageUris: [],
        physicalDeletePerformed: false,
      }
    }

    const derivativeRows = this.listDerivativeUrisStmt.all({ assetId: asset.id }) as Array<{ storageUri: string }>
    return {
      ok: true,
      assetId: asset.id,
      storageUris: [asset.storageUri, ...derivativeRows.map((row) => row.storageUri)],
      physicalDeletePerformed: false,
    }
  }
}

function requireNonEmpty(value: string | null | undefined, field: string): string {
  const normalized = String(value ?? '').trim()
  if (!normalized) throw new Error(`${field} is required`)
  return normalized
}

function requireNonNegativeInteger(value: number, field: string): number {
  if (!Number.isInteger(value) || value < 0) throw new Error(`${field} must be a non-negative integer`)
  return value
}

function normalizeNullable(value: string | null | undefined): string | null {
  const normalized = String(value ?? '').trim()
  return normalized || null
}

function safeParseJson(value: string): Record<string, unknown> | null {
  try {
    const parsed = JSON.parse(value)
    return parsed && typeof parsed === 'object' && !Array.isArray(parsed) ? parsed as Record<string, unknown> : null
  } catch {
    return null
  }
}

function normalizeIds(ids: ReadonlyArray<string>): string[] {
  return Array.from(new Set(ids.map((id) => String(id ?? '').trim()).filter(Boolean)))
}
