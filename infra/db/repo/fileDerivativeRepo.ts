import BetterSqlite3 from 'better-sqlite3'
import { randomUUID } from 'node:crypto'
import type {
  CreateFileDerivativeInput,
  FileDerivativeRecord,
  GetLatestReadyFileDerivativeInput,
  UpdateFileDerivativeInput,
  ListFileDerivativesByParentAssetIdInput,
} from '../types'

type SqlDatabase = BetterSqlite3.Database

type FileDerivativeRow = Readonly<{
  id: string
  parent_asset_id: string
  derived_kind: FileDerivativeRecord['derivedKind']
  mime: string | null
  storage_uri: string
  generator: string
  status: FileDerivativeRecord['status']
  meta_json: string | null
  created_at: number
  updated_at: number
  deleted_at: number | null
}>

const mapFileDerivativeRow = (row: FileDerivativeRow): FileDerivativeRecord => ({
  id: row.id,
  parentAssetId: row.parent_asset_id,
  derivedKind: row.derived_kind,
  mime: row.mime ?? null,
  storageUri: row.storage_uri,
  generator: row.generator,
  status: row.status,
  metaJson: row.meta_json ? safeParseJson(row.meta_json) : null,
  createdAt: row.created_at,
  updatedAt: row.updated_at,
  deletedAt: row.deleted_at ?? null,
})

export class FileDerivativeRepo {
  private insertStmt: BetterSqlite3.Statement
  private getByIdStmt: BetterSqlite3.Statement
  private listByParentStmt: BetterSqlite3.Statement
  private latestReadyStmt: BetterSqlite3.Statement
  private updateStmt: BetterSqlite3.Statement

  constructor(private db: SqlDatabase) {
    this.insertStmt = this.db.prepare(`
      INSERT INTO file_derivatives(
        id,
        parent_asset_id,
        derived_kind,
        mime,
        storage_uri,
        generator,
        status,
        meta_json,
        created_at,
        updated_at,
        deleted_at
      )
      VALUES (
        @id,
        @parentAssetId,
        @derivedKind,
        @mime,
        @storageUri,
        @generator,
        @status,
        @metaJson,
        @createdAt,
        @updatedAt,
        NULL
      )
    `)

    this.getByIdStmt = this.db.prepare(`
      SELECT *
      FROM file_derivatives
      WHERE id = @id
      LIMIT 1
    `)

    this.listByParentStmt = this.db.prepare(`
      SELECT *
      FROM file_derivatives
      WHERE parent_asset_id = @parentAssetId
      ORDER BY created_at ASC
    `)

    this.latestReadyStmt = this.db.prepare(`
      SELECT *
      FROM file_derivatives
      WHERE parent_asset_id = @parentAssetId
        AND derived_kind = @derivedKind
        AND status = 'ready'
        AND deleted_at IS NULL
      ORDER BY created_at DESC, rowid DESC
      LIMIT 1
    `)

    this.updateStmt = this.db.prepare(`
      UPDATE file_derivatives
      SET mime = @mime,
          storage_uri = @storageUri,
          generator = @generator,
          status = @status,
          meta_json = @metaJson,
          updated_at = @updatedAt,
          deleted_at = @deletedAt
      WHERE id = @id
    `)
  }

  create(input: CreateFileDerivativeInput): FileDerivativeRecord {
    const now = Date.now()
    const createdAt = input.createdAt ?? now
    const updatedAt = input.updatedAt ?? createdAt
    const row: FileDerivativeRecord = {
      id: input.id ?? randomUUID(),
      parentAssetId: requireNonEmpty(input.parentAssetId, 'parentAssetId'),
      derivedKind: input.derivedKind,
      mime: normalizeNullable(input.mime),
      storageUri: requireNonEmpty(input.storageUri, 'storageUri'),
      generator: requireNonEmpty(input.generator, 'generator'),
      status: input.status ?? 'pending',
      metaJson: input.metaJson ?? null,
      createdAt,
      updatedAt,
      deletedAt: null,
    }

    this.insertStmt.run({
      ...row,
      metaJson: row.metaJson ? JSON.stringify(row.metaJson) : null,
    })
    return row
  }

  getById(id: string): FileDerivativeRecord | null {
    const normalized = requireNonEmpty(id, 'id')
    const row = this.getByIdStmt.get({ id: normalized }) as FileDerivativeRow | undefined
    return row ? mapFileDerivativeRow(row) : null
  }

  listByParentAssetId(input: ListFileDerivativesByParentAssetIdInput): FileDerivativeRecord[] {
    const parentAssetId = requireNonEmpty(input.parentAssetId, 'parentAssetId')
    return (this.listByParentStmt.all({ parentAssetId }) as FileDerivativeRow[]).map(mapFileDerivativeRow)
  }

  getLatestReady(input: GetLatestReadyFileDerivativeInput): FileDerivativeRecord | null {
    const row = this.latestReadyStmt.get({
      parentAssetId: requireNonEmpty(input.parentAssetId, 'parentAssetId'),
      derivedKind: input.derivedKind,
    }) as FileDerivativeRow | undefined
    return row ? mapFileDerivativeRow(row) : null
  }

  update(input: UpdateFileDerivativeInput): FileDerivativeRecord {
    const existing = this.getById(input.id)
    if (!existing) throw new Error(`file derivative not found: ${input.id}`)
    const updated: FileDerivativeRecord = {
      ...existing,
      mime: input.mime !== undefined ? normalizeNullable(input.mime) : existing.mime,
      storageUri: input.storageUri !== undefined ? requireNonEmpty(input.storageUri, 'storageUri') : existing.storageUri,
      generator: input.generator !== undefined ? requireNonEmpty(input.generator, 'generator') : existing.generator,
      status: input.status ?? existing.status,
      metaJson: input.metaJson !== undefined ? input.metaJson ?? null : existing.metaJson,
      updatedAt: input.updatedAt ?? Date.now(),
      deletedAt: input.deletedAt !== undefined ? input.deletedAt ?? null : existing.deletedAt,
    }
    this.updateStmt.run({
      ...updated,
      metaJson: updated.metaJson ? JSON.stringify(updated.metaJson) : null,
    })
    return updated
  }
}

function safeParseJson(value: string): Record<string, unknown> | null {
  try {
    const parsed = JSON.parse(value)
    return parsed && typeof parsed === 'object' && !Array.isArray(parsed) ? parsed as Record<string, unknown> : null
  } catch {
    return null
  }
}

function requireNonEmpty(value: string | null | undefined, field: string): string {
  const normalized = String(value ?? '').trim()
  if (!normalized) throw new Error(`${field} is required`)
  return normalized
}

function normalizeNullable(value: string | null | undefined): string | null {
  const normalized = String(value ?? '').trim()
  return normalized || null
}
