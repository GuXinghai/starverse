import type BetterSqlite3 from 'better-sqlite3'
import type {
  EnginePluginHealthStatus,
  EnginePluginInstallRootKind,
  EnginePluginInstallSource,
  EnginePluginInstallState,
  EnginePluginRegistryRecord,
  GetEnginePluginRegistryByEngineIdInput,
  InsertEnginePluginRegistryInput,
  ListEnginePluginRegistryInput,
  MarkEnginePluginFailedInput,
  MarkEnginePluginUninstalledInput,
  SetEnginePluginEnabledInput,
  UpdateEnginePluginHealthInput,
  UpsertEnginePluginRegistryInput,
} from '../types'

type SqlDatabase = BetterSqlite3.Database

type EnginePluginRegistryRow = Readonly<{
  engine_id: string
  display_name: string
  plugin_version: string
  manifest_schema_version: string
  manifest_hash: string
  runtime_kind: string
  model_version: string | null
  install_state: EnginePluginInstallState
  enabled: number
  health_status: EnginePluginHealthStatus
  failure_reason: string | null
  install_source: EnginePluginInstallSource
  install_root_kind: EnginePluginInstallRootKind
  install_ref: string
  installed_at: number | null
  updated_at: number
  last_verified_at: number | null
  last_health_check_at: number | null
  metadata_json: string | null
}>

const DEFAULT_INSTALL_SOURCE: EnginePluginInstallSource = 'official_catalog'
const DEFAULT_INSTALL_STATE: EnginePluginInstallState = 'installed'
const DEFAULT_HEALTH_STATUS: EnginePluginHealthStatus = 'unknown'

const WINDOWS_ABSOLUTE_PATH_RE = /^[a-zA-Z]:[\\/]/u
const WINDOWS_UNC_RE = /^\\\\/u
const UNIX_ABSOLUTE_PATH_RE = /^\//u
const URL_SCHEME_RE = /^[a-z][a-z0-9+.-]*:\/\//iu
const ABSTRACT_INSTALL_REF_RE = /^[a-z0-9][a-z0-9._:-]{1,127}$/iu
const SHA256_HEX_RE = /^[a-f0-9]{64}$/u
const NUL_CHAR_RE = /\u0000/u

export class EnginePluginRegistryRepo {
  private readonly insertStmt: BetterSqlite3.Statement
  private readonly upsertStmt: BetterSqlite3.Statement
  private readonly getByEngineIdStmt: BetterSqlite3.Statement
  private readonly listAllStmt: BetterSqlite3.Statement
  private readonly listInstalledStmt: BetterSqlite3.Statement
  private readonly setEnabledStmt: BetterSqlite3.Statement
  private readonly markFailedStmt: BetterSqlite3.Statement
  private readonly updateHealthStmt: BetterSqlite3.Statement
  private readonly markUninstalledStmt: BetterSqlite3.Statement

  // eslint-disable-next-line max-lines-per-function
  constructor(private readonly db: SqlDatabase) {
    this.insertStmt = this.db.prepare(`
      INSERT INTO engine_plugin_registry (
        engine_id,
        display_name,
        plugin_version,
        manifest_schema_version,
        manifest_hash,
        runtime_kind,
        model_version,
        install_state,
        enabled,
        health_status,
        failure_reason,
        install_source,
        install_root_kind,
        install_ref,
        installed_at,
        updated_at,
        last_verified_at,
        last_health_check_at,
        metadata_json
      )
      VALUES (
        @engineId,
        @displayName,
        @pluginVersion,
        @manifestSchemaVersion,
        @manifestHash,
        @runtimeKind,
        @modelVersion,
        @installState,
        @enabled,
        @healthStatus,
        @failureReason,
        @installSource,
        @installRootKind,
        @installRef,
        @installedAt,
        @updatedAt,
        @lastVerifiedAt,
        @lastHealthCheckAt,
        @metadataJson
      )
    `)

    this.upsertStmt = this.db.prepare(`
      INSERT INTO engine_plugin_registry (
        engine_id,
        display_name,
        plugin_version,
        manifest_schema_version,
        manifest_hash,
        runtime_kind,
        model_version,
        install_state,
        enabled,
        health_status,
        failure_reason,
        install_source,
        install_root_kind,
        install_ref,
        installed_at,
        updated_at,
        last_verified_at,
        last_health_check_at,
        metadata_json
      )
      VALUES (
        @engineId,
        @displayName,
        @pluginVersion,
        @manifestSchemaVersion,
        @manifestHash,
        @runtimeKind,
        @modelVersion,
        @installState,
        @enabled,
        @healthStatus,
        @failureReason,
        @installSource,
        @installRootKind,
        @installRef,
        @installedAt,
        @updatedAt,
        @lastVerifiedAt,
        @lastHealthCheckAt,
        @metadataJson
      )
      ON CONFLICT(engine_id) DO UPDATE SET
        display_name = excluded.display_name,
        plugin_version = excluded.plugin_version,
        manifest_schema_version = excluded.manifest_schema_version,
        manifest_hash = excluded.manifest_hash,
        runtime_kind = excluded.runtime_kind,
        model_version = excluded.model_version,
        install_state = excluded.install_state,
        enabled = excluded.enabled,
        health_status = excluded.health_status,
        failure_reason = excluded.failure_reason,
        install_source = excluded.install_source,
        install_root_kind = excluded.install_root_kind,
        install_ref = excluded.install_ref,
        installed_at = COALESCE(excluded.installed_at, engine_plugin_registry.installed_at),
        updated_at = excluded.updated_at,
        last_verified_at = excluded.last_verified_at,
        last_health_check_at = excluded.last_health_check_at,
        metadata_json = excluded.metadata_json
    `)

    this.getByEngineIdStmt = this.db.prepare(`
      SELECT *
      FROM engine_plugin_registry
      WHERE engine_id = @engineId
      LIMIT 1
    `)

    this.listAllStmt = this.db.prepare(`
      SELECT *
      FROM engine_plugin_registry
      ORDER BY updated_at DESC, engine_id ASC
    `)

    this.listInstalledStmt = this.db.prepare(`
      SELECT *
      FROM engine_plugin_registry
      WHERE install_state <> 'uninstalled'
      ORDER BY updated_at DESC, engine_id ASC
    `)

    this.setEnabledStmt = this.db.prepare(`
      UPDATE engine_plugin_registry
      SET enabled = @enabled,
          install_state = CASE WHEN @enabled = 1 THEN 'installed' ELSE install_state END,
          failure_reason = CASE WHEN @enabled = 1 THEN NULL ELSE failure_reason END,
          updated_at = @updatedAt
      WHERE engine_id = @engineId
    `)

    this.markFailedStmt = this.db.prepare(`
      UPDATE engine_plugin_registry
      SET install_state = 'failed',
          enabled = 0,
          health_status = 'unhealthy',
          failure_reason = @failureReason,
          last_health_check_at = @lastHealthCheckAt,
          updated_at = @updatedAt
      WHERE engine_id = @engineId
    `)

    this.updateHealthStmt = this.db.prepare(`
      UPDATE engine_plugin_registry
      SET health_status = @healthStatus,
          last_health_check_at = @lastHealthCheckAt,
          updated_at = @updatedAt
      WHERE engine_id = @engineId
    `)

    this.markUninstalledStmt = this.db.prepare(`
      UPDATE engine_plugin_registry
      SET install_state = 'uninstalled',
          enabled = 0,
          health_status = 'unknown',
          failure_reason = NULL,
          updated_at = @updatedAt
      WHERE engine_id = @engineId
    `)
  }

  insert(input: InsertEnginePluginRegistryInput): EnginePluginRegistryRecord {
    const payload = normalizePayload(input)
    this.insertStmt.run(payload)
    const record = this.getByEngineId(payload.engineId)
    if (!record) throw new Error('failed to insert engine plugin registry record')
    return record
  }

  upsert(input: UpsertEnginePluginRegistryInput): EnginePluginRegistryRecord {
    const payload = normalizePayload(input)
    this.upsertStmt.run(payload)
    const record = this.getByEngineId(payload.engineId)
    if (!record) throw new Error('failed to upsert engine plugin registry record')
    return record
  }

  getByEngineId(input: GetEnginePluginRegistryByEngineIdInput | string): EnginePluginRegistryRecord | null {
    const engineId = typeof input === 'string' ? input : input.engineId
    const normalized = requireNonEmpty(engineId, 'engineId')
    const row = this.getByEngineIdStmt.get({ engineId: normalized }) as EnginePluginRegistryRow | undefined
    return row ? mapRow(row) : null
  }

  list(input: ListEnginePluginRegistryInput = {}): EnginePluginRegistryRecord[] {
    const includeUninstalled = input.includeUninstalled !== false
    const rows = (includeUninstalled ? this.listAllStmt.all() : this.listInstalledStmt.all()) as EnginePluginRegistryRow[]
    return rows.map(mapRow)
  }

  setEnabled(input: SetEnginePluginEnabledInput): { ok: true; updated: number } {
    const engineId = requireNonEmpty(input.engineId, 'engineId')
    const updatedAt = input.updatedAt ?? Date.now()
    const result = this.setEnabledStmt.run({
      engineId,
      enabled: input.enabled ? 1 : 0,
      updatedAt,
    })
    return { ok: true, updated: Number(result.changes ?? 0) }
  }

  enable(engineId: string, updatedAt?: number): { ok: true; updated: number } {
    return this.setEnabled({ engineId, enabled: true, updatedAt })
  }

  disable(engineId: string, updatedAt?: number): { ok: true; updated: number } {
    return this.setEnabled({ engineId, enabled: false, updatedAt })
  }

  markFailed(input: MarkEnginePluginFailedInput): { ok: true; updated: number } {
    const engineId = requireNonEmpty(input.engineId, 'engineId')
    const failureReason = requireNonEmpty(input.failureReason, 'failureReason')
    const result = this.markFailedStmt.run({
      engineId,
      failureReason,
      lastHealthCheckAt: input.lastHealthCheckAt ?? Date.now(),
      updatedAt: input.updatedAt ?? Date.now(),
    })
    return { ok: true, updated: Number(result.changes ?? 0) }
  }

  updateHealth(input: UpdateEnginePluginHealthInput): { ok: true; updated: number } {
    const engineId = requireNonEmpty(input.engineId, 'engineId')
    const result = this.updateHealthStmt.run({
      engineId,
      healthStatus: input.healthStatus,
      lastHealthCheckAt: input.lastHealthCheckAt ?? Date.now(),
      updatedAt: input.updatedAt ?? Date.now(),
    })
    return { ok: true, updated: Number(result.changes ?? 0) }
  }

  markUninstalled(input: MarkEnginePluginUninstalledInput): { ok: true; updated: number } {
    const engineId = requireNonEmpty(input.engineId, 'engineId')
    const result = this.markUninstalledStmt.run({
      engineId,
      updatedAt: input.updatedAt ?? Date.now(),
    })
    return { ok: true, updated: Number(result.changes ?? 0) }
  }
}

type NormalizedPayload = Readonly<{
  engineId: string
  displayName: string
  pluginVersion: string
  manifestSchemaVersion: string
  manifestHash: string
  runtimeKind: string
  modelVersion: string | null
  installState: EnginePluginInstallState
  enabled: number
  healthStatus: EnginePluginHealthStatus
  failureReason: string | null
  installSource: EnginePluginInstallSource
  installRootKind: EnginePluginInstallRootKind
  installRef: string
  installedAt: number | null
  updatedAt: number
  lastVerifiedAt: number | null
  lastHealthCheckAt: number | null
  metadataJson: string | null
}>

function normalizePayload(input: InsertEnginePluginRegistryInput | UpsertEnginePluginRegistryInput): NormalizedPayload {
  const now = Date.now()
  const installedAt = input.installedAt ?? now
  const updatedAt = input.updatedAt ?? now
  return {
    engineId: requireNonEmpty(input.engineId, 'engineId'),
    displayName: requireNonEmpty(input.displayName, 'displayName'),
    pluginVersion: requireNonEmpty(input.pluginVersion, 'pluginVersion'),
    manifestSchemaVersion: requireNonEmpty(input.manifestSchemaVersion, 'manifestSchemaVersion'),
    manifestHash: normalizeManifestHash(input.manifestHash),
    runtimeKind: requireNonEmpty(input.runtimeKind, 'runtimeKind'),
    modelVersion: normalizeNullable(input.modelVersion),
    installState: input.installState ?? DEFAULT_INSTALL_STATE,
    enabled: input.enabled === false ? 0 : 1,
    healthStatus: input.healthStatus ?? DEFAULT_HEALTH_STATUS,
    failureReason: normalizeNullable(input.failureReason),
    installSource: input.installSource ?? DEFAULT_INSTALL_SOURCE,
    installRootKind: input.installRootKind,
    installRef: normalizeInstallRef(input.installRef),
    installedAt: installedAt ?? null,
    updatedAt,
    lastVerifiedAt: input.lastVerifiedAt ?? null,
    lastHealthCheckAt: input.lastHealthCheckAt ?? null,
    metadataJson: input.metadataJson ? JSON.stringify(input.metadataJson) : null,
  }
}

function mapRow(row: EnginePluginRegistryRow): EnginePluginRegistryRecord {
  return {
    engineId: row.engine_id,
    displayName: row.display_name,
    pluginVersion: row.plugin_version,
    manifestSchemaVersion: row.manifest_schema_version,
    manifestHash: row.manifest_hash,
    runtimeKind: row.runtime_kind,
    modelVersion: row.model_version,
    installState: row.install_state,
    enabled: row.enabled === 1,
    healthStatus: row.health_status,
    failureReason: row.failure_reason,
    installSource: row.install_source,
    installRootKind: row.install_root_kind,
    installRef: row.install_ref,
    installedAt: row.installed_at,
    updatedAt: row.updated_at,
    lastVerifiedAt: row.last_verified_at,
    lastHealthCheckAt: row.last_health_check_at,
    metadataJson: safeParseJsonObject(row.metadata_json),
  }
}

function requireNonEmpty(value: string | null | undefined, field: string): string {
  const normalized = String(value ?? '').trim()
  if (!normalized) throw new Error(`${field} is required`)
  if (NUL_CHAR_RE.test(normalized)) throw new Error(`${field} must not include NUL`)
  return normalized
}

function normalizeNullable(value: string | null | undefined): string | null {
  const normalized = String(value ?? '').trim()
  if (!normalized) return null
  if (NUL_CHAR_RE.test(normalized)) throw new Error('nullable string must not include NUL')
  return normalized
}

function normalizeInstallRef(value: string): string {
  const normalized = requireNonEmpty(value, 'installRef')
  if (normalized.includes('..')) {
    throw new Error('installRef must not contain traversal segments')
  }
  if (normalized.includes('\\')) {
    throw new Error('installRef must not contain backslashes')
  }
  if (WINDOWS_ABSOLUTE_PATH_RE.test(normalized) || WINDOWS_UNC_RE.test(normalized) || UNIX_ABSOLUTE_PATH_RE.test(normalized)) {
    throw new Error('installRef must be an abstract reference, not an absolute path')
  }
  if (URL_SCHEME_RE.test(normalized)) {
    throw new Error('installRef must not include URL scheme')
  }
  if (!ABSTRACT_INSTALL_REF_RE.test(normalized)) {
    throw new Error('installRef must be an abstract reference token')
  }
  return normalized
}

function normalizeManifestHash(value: string): string {
  const normalized = requireNonEmpty(value, 'manifestHash').toLowerCase()
  if (!SHA256_HEX_RE.test(normalized)) {
    throw new Error('manifestHash must be a 64-char sha256 hex string')
  }
  return normalized
}

function safeParseJsonObject(value: string | null): Record<string, unknown> | null {
  if (!value) return null
  try {
    const parsed = JSON.parse(value) as unknown
    if (!parsed || typeof parsed !== 'object' || Array.isArray(parsed)) return null
    return parsed as Record<string, unknown>
  } catch {
    return null
  }
}
