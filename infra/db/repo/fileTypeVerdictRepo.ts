import BetterSqlite3 from 'better-sqlite3'
import { randomUUID } from 'node:crypto'
import type {
  DeleteFileTypeVerdictByAssetIdInput,
  FileTypeFingerprintJson,
  FileTypeVerdictRecord,
  GetCurrentFileTypeVerdictByAssetIdInput,
  MarkFileTypeVerdictStaleByAssetIdInput,
  UpsertFileTypeVerdictInput,
} from '../types'

type SqlDatabase = BetterSqlite3.Database

type FileTypeVerdictRow = Readonly<{
  id: string
  asset_id: string
  verdict_json: string
  primary_format_id: FileTypeVerdictRecord['primaryFormatId']
  primary_kind: FileTypeVerdictRecord['primaryKind']
  confidence_level: FileTypeVerdictRecord['confidenceLevel']
  schema_version: string
  taxonomy_version: string
  taxonomy_map_version: string
  magic_table_version: string
  merge_rules_version: string
  container_probe_version: string
  text_probe_version: string
  magika_model_version: string | null
  fingerprint_json: string
  is_current: number
  stale_reason: string | null
  created_at: number
  updated_at: number
}>

const mapRow = (row: FileTypeVerdictRow): FileTypeVerdictRecord => ({
  id: row.id,
  assetId: row.asset_id,
  verdict: safeParseJson(row.verdict_json) as FileTypeVerdictRecord['verdict'],
  primaryFormatId: row.primary_format_id,
  primaryKind: row.primary_kind,
  confidenceLevel: row.confidence_level,
  versionInfo: {
    schemaVersion: row.schema_version,
    taxonomyVersion: row.taxonomy_version,
    taxonomyMapVersion: row.taxonomy_map_version,
    magicTableVersion: row.magic_table_version,
    mergeRulesVersion: row.merge_rules_version,
    containerProbeVersion: row.container_probe_version,
    textProbeVersion: row.text_probe_version,
    magikaModelVersion: row.magika_model_version,
  },
  fingerprintJson: safeParseJson(row.fingerprint_json) as FileTypeFingerprintJson,
  isCurrent: row.is_current === 1,
  staleReason: row.stale_reason ?? null,
  createdAt: row.created_at,
  updatedAt: row.updated_at,
})

export class FileTypeVerdictRepo {
  private readonly markAssetNonCurrentStmt: BetterSqlite3.Statement
  private readonly insertStmt: BetterSqlite3.Statement
  private readonly getCurrentByAssetIdStmt: BetterSqlite3.Statement
  private readonly markStaleByAssetIdStmt: BetterSqlite3.Statement
  private readonly deleteByAssetIdStmt: BetterSqlite3.Statement
  private readonly upsertTx: (input: UpsertFileTypeVerdictInput) => FileTypeVerdictRecord

  constructor(private readonly db: SqlDatabase) {
    this.markAssetNonCurrentStmt = this.db.prepare(`
      UPDATE file_type_verdicts
      SET is_current = 0,
          stale_reason = COALESCE(stale_reason, 'superseded'),
          updated_at = @updatedAt
      WHERE asset_id = @assetId
        AND is_current = 1
    `)

    this.insertStmt = this.db.prepare(`
      INSERT INTO file_type_verdicts (
        id,
        asset_id,
        verdict_json,
        primary_format_id,
        primary_kind,
        confidence_level,
        schema_version,
        taxonomy_version,
        taxonomy_map_version,
        magic_table_version,
        merge_rules_version,
        container_probe_version,
        text_probe_version,
        magika_model_version,
        fingerprint_json,
        is_current,
        stale_reason,
        created_at,
        updated_at
      )
      VALUES (
        @id,
        @assetId,
        @verdictJson,
        @primaryFormatId,
        @primaryKind,
        @confidenceLevel,
        @schemaVersion,
        @taxonomyVersion,
        @taxonomyMapVersion,
        @magicTableVersion,
        @mergeRulesVersion,
        @containerProbeVersion,
        @textProbeVersion,
        @magikaModelVersion,
        @fingerprintJson,
        1,
        NULL,
        @createdAt,
        @updatedAt
      )
    `)

    this.getCurrentByAssetIdStmt = this.db.prepare(`
      SELECT *
      FROM file_type_verdicts
      WHERE asset_id = @assetId
        AND is_current = 1
      ORDER BY updated_at DESC
      LIMIT 1
    `)

    this.markStaleByAssetIdStmt = this.db.prepare(`
      UPDATE file_type_verdicts
      SET is_current = 0,
          stale_reason = @staleReason,
          updated_at = @updatedAt
      WHERE asset_id = @assetId
        AND is_current = 1
    `)

    this.deleteByAssetIdStmt = this.db.prepare(`
      DELETE FROM file_type_verdicts
      WHERE asset_id = @assetId
    `)

    this.upsertTx = this.db.transaction((input: UpsertFileTypeVerdictInput): FileTypeVerdictRecord => {
      const now = Date.now()
      const createdAt = input.createdAt ?? now
      const updatedAt = input.updatedAt ?? createdAt
      const id = requireNonEmpty(input.id ?? randomUUID(), 'id')
      const assetId = requireNonEmpty(input.assetId, 'assetId')

      this.markAssetNonCurrentStmt.run({ assetId, updatedAt })
      this.insertStmt.run({
        id,
        assetId,
        verdictJson: JSON.stringify(input.verdict),
        primaryFormatId: input.primaryFormatId,
        primaryKind: input.primaryKind,
        confidenceLevel: input.confidenceLevel,
        schemaVersion: requireNonEmpty(input.versionInfo.schemaVersion, 'schemaVersion'),
        taxonomyVersion: requireNonEmpty(input.versionInfo.taxonomyVersion, 'taxonomyVersion'),
        taxonomyMapVersion: requireNonEmpty(input.versionInfo.taxonomyMapVersion, 'taxonomyMapVersion'),
        magicTableVersion: requireNonEmpty(input.versionInfo.magicTableVersion, 'magicTableVersion'),
        mergeRulesVersion: requireNonEmpty(input.versionInfo.mergeRulesVersion, 'mergeRulesVersion'),
        containerProbeVersion: requireNonEmpty(input.versionInfo.containerProbeVersion, 'containerProbeVersion'),
        textProbeVersion: requireNonEmpty(input.versionInfo.textProbeVersion, 'textProbeVersion'),
        magikaModelVersion: normalizeNullable(input.versionInfo.magikaModelVersion),
        fingerprintJson: JSON.stringify(input.fingerprintJson),
        createdAt,
        updatedAt,
      })
      const current = this.getCurrentByAssetId(assetId)
      if (!current) throw new Error('failed to upsert current verdict')
      return current
    })
  }

  upsertCurrent(input: UpsertFileTypeVerdictInput): FileTypeVerdictRecord {
    return this.upsertTx(input)
  }

  getCurrentByAssetId(input: GetCurrentFileTypeVerdictByAssetIdInput | string): FileTypeVerdictRecord | null {
    const assetId = typeof input === 'string' ? input : input.assetId
    const normalized = requireNonEmpty(assetId, 'assetId')
    const row = this.getCurrentByAssetIdStmt.get({ assetId: normalized }) as FileTypeVerdictRow | undefined
    return row ? mapRow(row) : null
  }

  markStaleByAssetId(input: MarkFileTypeVerdictStaleByAssetIdInput): { ok: true; updated: number } {
    const assetId = requireNonEmpty(input.assetId, 'assetId')
    const staleReason = requireNonEmpty(input.staleReason, 'staleReason')
    const updatedAt = input.updatedAt ?? Date.now()
    const result = this.markStaleByAssetIdStmt.run({ assetId, staleReason, updatedAt })
    return { ok: true, updated: Number(result.changes ?? 0) }
  }

  deleteByAssetId(input: DeleteFileTypeVerdictByAssetIdInput | string): { ok: true; deleted: number } {
    const assetId = typeof input === 'string' ? input : input.assetId
    const normalized = requireNonEmpty(assetId, 'assetId')
    const result = this.deleteByAssetIdStmt.run({ assetId: normalized })
    return { ok: true, deleted: Number(result.changes ?? 0) }
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

function safeParseJson(value: string): unknown {
  try {
    return JSON.parse(value)
  } catch {
    return null
  }
}
