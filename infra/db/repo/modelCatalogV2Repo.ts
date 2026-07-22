import { createHash } from 'node:crypto'
import type BetterSqlite3 from 'better-sqlite3'
import { stableSerializeProviderRequestBoundedV2 } from '../../../src/next/generation-v2/compiler/stableSerialize'

const MAX_ITEMS_JSON_BYTES = 32 * 1024 * 1024
const ID_PATTERN = /^[A-Za-z0-9._:/-]{1,512}$/u
const DIGEST_PATTERN = /^[0-9a-f]{64}$/u

export type ModelCatalogScopeIdentityV2 = Readonly<{
  providerKey: string
  credentialScopeId: string
  endpointProfileId: string
  operationContractId: string
  categoryKey?: string
}>

export type ModelCatalogStatusV2 = Readonly<{
  providerKey: string
  syncState: 'idle' | 'syncing' | 'ok' | 'error'
  lastAttemptAtMs: number | null
  lastSuccessAtMs: number | null
  errorCode: string | null
  modelCount: number
  visibleModelCount: number
  hiddenModelCount: number
  activeSnapshotDigest: string | null
  categoryKey: string
}>

export type ModelCatalogActiveSnapshotV2 = Readonly<{
  status: ModelCatalogStatusV2
  observedAtMs: number
  items: readonly Readonly<Record<string, unknown>>[]
}>

export class ModelCatalogV2RepoError extends Error {
  constructor(readonly code:
    | 'GENERATION_V2_MODEL_CATALOG_INPUT_INVALID'
    | 'GENERATION_V2_MODEL_CATALOG_STALE_ATTEMPT'
    | 'GENERATION_V2_MODEL_CATALOG_STATE_INVALID') {
    super(code)
    this.name = 'ModelCatalogV2RepoError'
  }
}

function text(value: unknown, allowEmpty = false): string {
  const normalized = String(value ?? '').trim()
  if ((!allowEmpty && !normalized) || !ID_PATTERN.test(normalized || 'x')) {
    throw new ModelCatalogV2RepoError('GENERATION_V2_MODEL_CATALOG_INPUT_INVALID')
  }
  return normalized
}

function identity(input: ModelCatalogScopeIdentityV2) {
  const providerKey = text(input.providerKey)
  const credentialScopeId = text(input.credentialScopeId)
  const endpointProfileId = text(input.endpointProfileId)
  const operationContractId = text(input.operationContractId)
  const categoryKey = text(input.categoryKey ?? '', true)
  const scopeId = `catalog-v2:${createHash('sha256').update(
    stableSerializeProviderRequestBoundedV2({ providerKey, credentialScopeId, endpointProfileId, operationContractId, categoryKey }, 4096),
    'utf8',
  ).digest('hex')}`
  return Object.freeze({ providerKey, credentialScopeId, endpointProfileId, operationContractId, categoryKey, scopeId })
}

function safeTime(value: unknown): number {
  if (!Number.isSafeInteger(value) || (value as number) < 0) {
    throw new ModelCatalogV2RepoError('GENERATION_V2_MODEL_CATALOG_INPUT_INVALID')
  }
  return value as number
}

function safeCount(value: unknown): number {
  if (!Number.isSafeInteger(value) || (value as number) < 0) {
    throw new ModelCatalogV2RepoError('GENERATION_V2_MODEL_CATALOG_INPUT_INVALID')
  }
  return value as number
}

function decodeItems(value: string): readonly Readonly<Record<string, unknown>>[] {
  let parsed: unknown
  try { parsed = JSON.parse(value) } catch {
    throw new ModelCatalogV2RepoError('GENERATION_V2_MODEL_CATALOG_STATE_INVALID')
  }
  if (!Array.isArray(parsed) || parsed.some((item) => !item || typeof item !== 'object' || Array.isArray(item))) {
    throw new ModelCatalogV2RepoError('GENERATION_V2_MODEL_CATALOG_STATE_INVALID')
  }
  return Object.freeze(parsed.map((item) => Object.freeze({ ...(item as Record<string, unknown>) })))
}

export class ModelCatalogV2Repo {
  constructor(private readonly db: BetterSqlite3.Database, private readonly nowMs: () => number = Date.now) {}

  beginSync(scopeValue: ModelCatalogScopeIdentityV2, attemptIdValue: string): string {
    const scope = identity(scopeValue)
    const attemptId = text(attemptIdValue)
    const now = safeTime(this.nowMs())
    this.db.prepare(`INSERT INTO model_catalog_scope_v2
      (scope_id,provider_key,credential_scope_id,endpoint_profile_id,operation_contract_id,active_category_key,
       sync_state,active_attempt_id,last_attempt_at_ms,created_at_ms,updated_at_ms)
      VALUES (@scopeId,@providerKey,@credentialScopeId,@endpointProfileId,@operationContractId,@categoryKey,
       'syncing',@attemptId,@now,@now,@now)
      ON CONFLICT(scope_id) DO UPDATE SET sync_state='syncing',active_attempt_id=excluded.active_attempt_id,
       last_attempt_at_ms=excluded.last_attempt_at_ms,last_error_code=NULL,last_error_message=NULL,updated_at_ms=excluded.updated_at_ms`)
      .run({ ...scope, attemptId, now })
    return scope.scopeId
  }

  commitSync(input: Readonly<{
    scope: ModelCatalogScopeIdentityV2
    attemptId: string
    responseDigest: string
    observedAtMs: number
    items: readonly Readonly<Record<string, unknown>>[]
    visibleModelCount?: number
    hiddenModelCount?: number
  }>): ModelCatalogActiveSnapshotV2 {
    const scope = identity(input.scope)
    const attemptId = text(input.attemptId)
    if (!DIGEST_PATTERN.test(input.responseDigest)) throw new ModelCatalogV2RepoError('GENERATION_V2_MODEL_CATALOG_INPUT_INVALID')
    const observedAtMs = safeTime(input.observedAtMs)
    const modelCount = safeCount(input.items.length)
    const visibleModelCount = safeCount(input.visibleModelCount ?? modelCount)
    const hiddenModelCount = safeCount(input.hiddenModelCount ?? 0)
    const itemsJson = stableSerializeProviderRequestBoundedV2(input.items, MAX_ITEMS_JSON_BYTES)
    const now = safeTime(this.nowMs())
    const changed = this.db.transaction(() => {
      const current = this.db.prepare('SELECT active_attempt_id FROM model_catalog_scope_v2 WHERE scope_id=?').get(scope.scopeId) as
        { active_attempt_id: string | null } | undefined
      if (!current || current.active_attempt_id !== attemptId) {
        throw new ModelCatalogV2RepoError('GENERATION_V2_MODEL_CATALOG_STALE_ATTEMPT')
      }
      this.db.prepare(`INSERT OR IGNORE INTO model_catalog_snapshot_v2
        (scope_id,category_key,snapshot_digest,observed_at_ms,model_count,visible_model_count,hidden_model_count,items_json,created_at_ms)
        VALUES (?,?,?,?,?,?,?,?,?)`).run(scope.scopeId, scope.categoryKey, input.responseDigest, observedAtMs,
          modelCount, visibleModelCount, hiddenModelCount, itemsJson, now)
      return this.db.prepare(`UPDATE model_catalog_scope_v2 SET active_snapshot_digest=?,sync_state='ok',active_attempt_id=NULL,
        last_success_at_ms=?,last_error_code=NULL,last_error_message=NULL,model_count=?,visible_model_count=?,hidden_model_count=?,updated_at_ms=?
        WHERE scope_id=? AND active_attempt_id=?`).run(input.responseDigest, observedAtMs, modelCount, visibleModelCount,
          hiddenModelCount, now, scope.scopeId, attemptId).changes
    }).immediate()
    if (changed !== 1) throw new ModelCatalogV2RepoError('GENERATION_V2_MODEL_CATALOG_STALE_ATTEMPT')
    const active = this.readActive(input.scope)
    if (!active) throw new ModelCatalogV2RepoError('GENERATION_V2_MODEL_CATALOG_STATE_INVALID')
    return active
  }

  failSync(scopeValue: ModelCatalogScopeIdentityV2, attemptIdValue: string, errorCodeValue: string): ModelCatalogStatusV2 {
    const scope = identity(scopeValue)
    const attemptId = text(attemptIdValue)
    const errorCode = text(errorCodeValue)
    const now = safeTime(this.nowMs())
    const changes = this.db.prepare(`UPDATE model_catalog_scope_v2 SET sync_state='error',active_attempt_id=NULL,
      last_error_code=?,last_error_message=NULL,updated_at_ms=? WHERE scope_id=? AND active_attempt_id=?`)
      .run(errorCode, now, scope.scopeId, attemptId).changes
    if (changes !== 1) throw new ModelCatalogV2RepoError('GENERATION_V2_MODEL_CATALOG_STALE_ATTEMPT')
    return this.readStatus(scopeValue)!
  }

  readStatus(scopeValue: ModelCatalogScopeIdentityV2): ModelCatalogStatusV2 | null {
    const scope = identity(scopeValue)
    const row = this.db.prepare(`SELECT provider_key,sync_state,last_attempt_at_ms,last_success_at_ms,last_error_code,
      model_count,visible_model_count,hidden_model_count,active_snapshot_digest,active_category_key
      FROM model_catalog_scope_v2 WHERE scope_id=?`).get(scope.scopeId) as Record<string, unknown> | undefined
    if (!row) return null
    return Object.freeze({ providerKey: String(row.provider_key), syncState: row.sync_state as ModelCatalogStatusV2['syncState'],
      lastAttemptAtMs: row.last_attempt_at_ms === null ? null : Number(row.last_attempt_at_ms),
      lastSuccessAtMs: row.last_success_at_ms === null ? null : Number(row.last_success_at_ms),
      errorCode: row.last_error_code === null ? null : String(row.last_error_code), modelCount: Number(row.model_count),
      visibleModelCount: Number(row.visible_model_count), hiddenModelCount: Number(row.hidden_model_count),
      activeSnapshotDigest: row.active_snapshot_digest === null ? null : String(row.active_snapshot_digest),
      categoryKey: String(row.active_category_key) })
  }

  readActive(scopeValue: ModelCatalogScopeIdentityV2): ModelCatalogActiveSnapshotV2 | null {
    const scope = identity(scopeValue)
    const status = this.readStatus(scopeValue)
    if (!status?.activeSnapshotDigest) return null
    const row = this.db.prepare(`SELECT observed_at_ms,items_json FROM model_catalog_snapshot_v2
      WHERE scope_id=? AND category_key=? AND snapshot_digest=?`).get(scope.scopeId, scope.categoryKey,
        status.activeSnapshotDigest) as { observed_at_ms: number; items_json: string } | undefined
    if (!row) throw new ModelCatalogV2RepoError('GENERATION_V2_MODEL_CATALOG_STATE_INVALID')
    return Object.freeze({ status, observedAtMs: Number(row.observed_at_ms), items: decodeItems(row.items_json) })
  }

  clearCurrent(scopeValue: ModelCatalogScopeIdentityV2): number {
    const scope = identity(scopeValue)
    return this.db.prepare('DELETE FROM model_catalog_scope_v2 WHERE scope_id=?').run(scope.scopeId).changes
  }

  clearCurrentCredentialScopes(scopeValue: ModelCatalogScopeIdentityV2): number {
    const scope = identity(scopeValue)
    return this.db.prepare(`DELETE FROM model_catalog_scope_v2
      WHERE provider_key=? AND credential_scope_id=? AND endpoint_profile_id=? AND operation_contract_id=?`)
      .run(scope.providerKey, scope.credentialScopeId, scope.endpointProfileId, scope.operationContractId).changes
  }

  clearAllScopes(providerKeyValue: string): number {
    return this.db.prepare('DELETE FROM model_catalog_scope_v2 WHERE provider_key=?').run(text(providerKeyValue)).changes
  }

  cleanupInactiveSnapshots(retainAfterMsValue: number): number {
    const retainAfterMs = safeTime(retainAfterMsValue)
    return this.db.prepare(`DELETE FROM model_catalog_snapshot_v2 AS snapshot
      WHERE snapshot.created_at_ms < ? AND snapshot.snapshot_digest != (
        SELECT scope.active_snapshot_digest FROM model_catalog_scope_v2 AS scope WHERE scope.scope_id=snapshot.scope_id
      )`).run(retainAfterMs).changes
  }
}
