import { createHash } from 'node:crypto'
import type BetterSqlite3 from 'better-sqlite3'
import { stableSerializeProviderRequestBoundedV2 } from '../../../src/next/generation-v2/compiler/stableSerialize'
import type { ProviderFailureV2 } from '../../../src/shared/provider/providerFailureV2'

const MAX_ITEMS_JSON_BYTES = 32 * 1024 * 1024
const ID_PATTERN = /^[A-Za-z0-9._:/-]{1,512}$/u
const DIGEST_PATTERN = /^[0-9a-f]{64}$/u
const SNAPSHOT_CODEC_VERSION = 1

export type ModelCatalogScopeIdentityV2 = Readonly<{
  providerKey: string
  credentialScopeId: string
  endpointProfileId: string
  operationContractId: string
  category: string
}>

export type ModelCatalogStatusV2 = Readonly<{
  scopeId: string
  authorityRevision: number
  providerKey: string
  syncState: 'idle' | 'syncing' | 'ok' | 'error'
  lastAttemptedAtMs: number | null
  lastSucceededAtMs: number | null
  errorCode: string | null
  modelCount: number
  visibleModelCount: number
  hiddenModelCount: number
  activeSnapshotDigest: string | null
  pendingSnapshotDigest: string | null
  category: string
  lastFailure: ProviderFailureV2 | null
}>

export type ModelCatalogActiveSnapshotV2 = Readonly<{
  status: ModelCatalogStatusV2
  snapshotDigest: string
  codecVersion: number
  completeness: 'complete'
  adapterRevision: string
  aggregateEvidence: ModelCatalogAggregateEvidenceV2
  observedAtMs: number
  items: readonly Readonly<Record<string, unknown>>[]
}>

export type ModelCatalogStoredSnapshotV2 = Readonly<{
  snapshotDigest: string
  codecVersion: number
  completeness: 'complete'
  adapterRevision: string
  aggregateEvidence: ModelCatalogAggregateEvidenceV2
  observedAtMs: number
  modelCount: number
  visibleModelCount: number
  hiddenModelCount: number
  items: readonly Readonly<Record<string, unknown>>[]
}>

export type ModelCatalogAggregateEvidenceV2 = Readonly<{
  schemaVersion: 1
  completeness: 'complete'
  modelCount: number
  visibleModelCount: number
  hiddenModelCount: number
  itemsDigest: string
}>

export class ModelCatalogV2RepoError extends Error {
  constructor(readonly code:
    | 'GENERATION_V2_MODEL_CATALOG_INPUT_INVALID'
    | 'GENERATION_V2_MODEL_CATALOG_SYNC_IN_PROGRESS'
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
  const category = text(input.category, true)
  const scopeId = `catalog-v2:${createHash('sha256').update(
    stableSerializeProviderRequestBoundedV2({ providerKey, credentialScopeId, endpointProfileId, operationContractId, category }, 4096),
    'utf8',
  ).digest('hex')}`
  return Object.freeze({ providerKey, credentialScopeId, endpointProfileId, operationContractId, category, scopeId })
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

function record(value: unknown): Record<string, unknown> | null {
  return value && typeof value === 'object' && !Array.isArray(value) ? value as Record<string, unknown> : null
}

function validateItemIdentity(item: Record<string, unknown>, expectedProviderKey: string): void {
  const providerKey = String(item.providerKey ?? '').trim()
  const modelId = String(item.modelId ?? '').trim()
  const modelKey = String(item.modelKey ?? '').trim()
  if (providerKey !== expectedProviderKey || !modelId || modelKey !== `${providerKey}::${modelId}`) {
    throw new ModelCatalogV2RepoError('GENERATION_V2_MODEL_CATALOG_STATE_INVALID')
  }
  const candidates: Record<string, unknown>[] = []
  const direct = record(item.observation)
  if (direct) candidates.push(direct)
  const buckets = record(item.raw)?.buckets
  if (Array.isArray(buckets)) {
    for (const bucketValue of buckets) {
      const bucket = record(bucketValue)
      const candidate = record(bucket?.observation) ?? record(record(bucket?.payload)?.observation)
      if (candidate) candidates.push(candidate)
    }
  }
  if (candidates.some((observation) => String(observation.providerKey ?? '').trim() !== providerKey ||
      String(observation.nativeModelId ?? '').trim() !== modelId)) {
    throw new ModelCatalogV2RepoError('GENERATION_V2_MODEL_CATALOG_STATE_INVALID')
  }
}

function decodeItems(value: string, expectedProviderKey: string): readonly Readonly<Record<string, unknown>>[] {
  let parsed: unknown
  try { parsed = JSON.parse(value) } catch {
    throw new ModelCatalogV2RepoError('GENERATION_V2_MODEL_CATALOG_STATE_INVALID')
  }
  if (!Array.isArray(parsed) || parsed.some((item) => !item || typeof item !== 'object' || Array.isArray(item))) {
    throw new ModelCatalogV2RepoError('GENERATION_V2_MODEL_CATALOG_STATE_INVALID')
  }
  return Object.freeze(parsed.map((item) => {
    const decoded = { ...(item as Record<string, unknown>) }
    validateItemIdentity(decoded, expectedProviderKey)
    return Object.freeze(decoded)
  }))
}

function itemsDigest(itemsJson: string): string {
  return createHash('sha256').update(itemsJson, 'utf8').digest('hex')
}

function aggregateEvidence(input: Readonly<{
  modelCount: number
  visibleModelCount: number
  hiddenModelCount: number
  itemsJson: string
}>): ModelCatalogAggregateEvidenceV2 {
  return Object.freeze({
    schemaVersion: 1,
    completeness: 'complete',
    modelCount: input.modelCount,
    visibleModelCount: input.visibleModelCount,
    hiddenModelCount: input.hiddenModelCount,
    itemsDigest: itemsDigest(input.itemsJson),
  })
}

function decodeAggregateEvidence(value: unknown, expected: Readonly<{
  modelCount: number
  visibleModelCount: number
  hiddenModelCount: number
  itemsJson: string
}>): ModelCatalogAggregateEvidenceV2 {
  let parsed: unknown
  try { parsed = JSON.parse(String(value)) } catch {
    throw new ModelCatalogV2RepoError('GENERATION_V2_MODEL_CATALOG_STATE_INVALID')
  }
  const evidence = parsed as Partial<ModelCatalogAggregateEvidenceV2> | null
  if (!evidence || evidence.schemaVersion !== 1 || evidence.completeness !== 'complete' ||
      evidence.modelCount !== expected.modelCount || evidence.visibleModelCount !== expected.visibleModelCount ||
      evidence.hiddenModelCount !== expected.hiddenModelCount || evidence.itemsDigest !== itemsDigest(expected.itemsJson)) {
    throw new ModelCatalogV2RepoError('GENERATION_V2_MODEL_CATALOG_STATE_INVALID')
  }
  return Object.freeze({ ...evidence } as ModelCatalogAggregateEvidenceV2)
}

function encodeErrorFact(value: ProviderFailureV2 | null | undefined): string | null {
  if (!value) return null
  let encoded: string
  try { encoded = JSON.stringify(value) } catch {
    throw new ModelCatalogV2RepoError('GENERATION_V2_MODEL_CATALOG_INPUT_INVALID')
  }
  if (!encoded || Buffer.byteLength(encoded, 'utf8') > 1024 * 1024) {
    throw new ModelCatalogV2RepoError('GENERATION_V2_MODEL_CATALOG_INPUT_INVALID')
  }
  return encoded
}

function decodeErrorFact(value: unknown): ProviderFailureV2 | null {
  if (value === null || value === undefined) return null
  try {
    const parsed = JSON.parse(String(value))
    return parsed && typeof parsed === 'object' ? parsed as ProviderFailureV2 : null
  } catch {
    throw new ModelCatalogV2RepoError('GENERATION_V2_MODEL_CATALOG_STATE_INVALID')
  }
}

export class ModelCatalogV2Repo {
  constructor(private readonly db: BetterSqlite3.Database, private readonly nowMs: () => number = Date.now) {}

  beginSync(scopeValue: ModelCatalogScopeIdentityV2, attemptIdValue: string): string {
    const scope = identity(scopeValue)
    const attemptId = text(attemptIdValue)
    const now = safeTime(this.nowMs())
    const changes = this.db.prepare(`INSERT INTO model_catalog_scope_v2
      (scope_id,provider_key,credential_scope_id,endpoint_profile_id,operation_contract_id,category_key,
       authority_revision,sync_state,active_attempt_id,last_attempted_at_ms,created_at_ms,updated_at_ms)
      VALUES (@scopeId,@providerKey,@credentialScopeId,@endpointProfileId,@operationContractId,@category,
       1,'syncing',@attemptId,@now,@now,@now)
      ON CONFLICT(scope_id) DO UPDATE SET sync_state='syncing',active_attempt_id=excluded.active_attempt_id,
       last_attempted_at_ms=excluded.last_attempted_at_ms,updated_at_ms=excluded.updated_at_ms,
       authority_revision=model_catalog_scope_v2.authority_revision+1
       WHERE model_catalog_scope_v2.sync_state!='syncing'`)
      .run({ ...scope, attemptId, now }).changes
    if (changes !== 1) throw new ModelCatalogV2RepoError('GENERATION_V2_MODEL_CATALOG_SYNC_IN_PROGRESS')
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
    applyMode: 'automatic' | 'manual'
    codecVersion?: number
    completeness?: 'complete' | 'incomplete'
    adapterRevision?: string
    retentionCutoffMs?: number
  }>): ModelCatalogActiveSnapshotV2 | ModelCatalogStoredSnapshotV2 {
    const scope = identity(input.scope)
    const attemptId = text(input.attemptId)
    if (!DIGEST_PATTERN.test(input.responseDigest)) throw new ModelCatalogV2RepoError('GENERATION_V2_MODEL_CATALOG_INPUT_INVALID')
    const observedAtMs = safeTime(input.observedAtMs)
    const modelCount = safeCount(input.items.length)
    const visibleModelCount = safeCount(input.visibleModelCount ?? modelCount)
    const hiddenModelCount = safeCount(input.hiddenModelCount ?? 0)
    if (visibleModelCount + hiddenModelCount !== modelCount) {
      throw new ModelCatalogV2RepoError('GENERATION_V2_MODEL_CATALOG_INPUT_INVALID')
    }
    for (const item of input.items) validateItemIdentity({ ...item }, scope.providerKey)
    const itemsJson = stableSerializeProviderRequestBoundedV2(input.items, MAX_ITEMS_JSON_BYTES)
    const codecVersion = safeCount(input.codecVersion ?? SNAPSHOT_CODEC_VERSION)
    if (codecVersion < 1 || codecVersion > 2_147_483_647 || input.completeness === 'incomplete') {
      throw new ModelCatalogV2RepoError('GENERATION_V2_MODEL_CATALOG_INPUT_INVALID')
    }
    const completeness = 'complete' as const
    const adapterRevision = text(input.adapterRevision ?? 'catalog-adapter-v1')
    const evidence = aggregateEvidence({ modelCount, visibleModelCount, hiddenModelCount, itemsJson })
    const evidenceJson = stableSerializeProviderRequestBoundedV2(evidence, 1024 * 1024)
    const now = safeTime(this.nowMs())
    const retentionCutoffMs = input.retentionCutoffMs === undefined
      ? null
      : safeTime(input.retentionCutoffMs)
    const changed = this.db.transaction(() => {
      const current = this.db.prepare('SELECT active_attempt_id FROM model_catalog_scope_v2 WHERE scope_id=?').get(scope.scopeId) as
        { active_attempt_id: string | null } | undefined
      if (!current || current.active_attempt_id !== attemptId) {
        throw new ModelCatalogV2RepoError('GENERATION_V2_MODEL_CATALOG_STALE_ATTEMPT')
      }
      this.db.prepare(`INSERT OR IGNORE INTO model_catalog_snapshot_v2
        (scope_id,category_key,snapshot_digest,observed_at_ms,model_count,visible_model_count,hidden_model_count,
         codec_version,completeness,adapter_revision,aggregate_evidence_json,items_json,created_at_ms)
        VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?)`).run(scope.scopeId, scope.category, input.responseDigest, observedAtMs,
          modelCount, visibleModelCount, hiddenModelCount, codecVersion, completeness, adapterRevision, evidenceJson, itemsJson, now)
      const immutableSnapshot = this.db.prepare(`SELECT model_count,visible_model_count,hidden_model_count,
        codec_version,completeness,adapter_revision,aggregate_evidence_json,items_json
        FROM model_catalog_snapshot_v2 WHERE scope_id=? AND category_key=? AND snapshot_digest=?`)
        .get(scope.scopeId, scope.category, input.responseDigest) as Record<string, unknown> | undefined
      if (!immutableSnapshot || safeCount(immutableSnapshot.model_count) !== modelCount ||
          safeCount(immutableSnapshot.visible_model_count) !== visibleModelCount ||
          safeCount(immutableSnapshot.hidden_model_count) !== hiddenModelCount ||
          safeCount(immutableSnapshot.codec_version) !== codecVersion ||
          immutableSnapshot.completeness !== completeness || immutableSnapshot.adapter_revision !== adapterRevision ||
          String(immutableSnapshot.aggregate_evidence_json) !== evidenceJson ||
          String(immutableSnapshot.items_json) !== itemsJson) {
        throw new ModelCatalogV2RepoError('GENERATION_V2_MODEL_CATALOG_STATE_INVALID')
      }
      let changes: number
      if (input.applyMode === 'manual') {
        changes = this.db.prepare(`UPDATE model_catalog_scope_v2 SET
          pending_snapshot_digest=CASE WHEN active_snapshot_digest=? THEN NULL ELSE ? END,
          sync_state='ok',active_attempt_id=NULL,
          last_succeeded_at_ms=?,last_failure_json=NULL,updated_at_ms=?,authority_revision=authority_revision+1
          WHERE scope_id=? AND active_attempt_id=?`).run(input.responseDigest, input.responseDigest,
            observedAtMs, now, scope.scopeId, attemptId).changes
      } else {
        changes = this.db.prepare(`UPDATE model_catalog_scope_v2 SET active_snapshot_digest=?,pending_snapshot_digest=NULL,
          sync_state='ok',active_attempt_id=NULL,last_succeeded_at_ms=?,last_failure_json=NULL,
          model_count=?,visible_model_count=?,hidden_model_count=?,updated_at_ms=?,authority_revision=authority_revision+1
          WHERE scope_id=? AND active_attempt_id=?`).run(input.responseDigest, observedAtMs, modelCount, visibleModelCount,
            hiddenModelCount, now, scope.scopeId, attemptId).changes
      }
      if (changes !== 1) throw new ModelCatalogV2RepoError('GENERATION_V2_MODEL_CATALOG_STALE_ATTEMPT')
      if (retentionCutoffMs !== null) this.cleanupInactiveSnapshots(input.scope, retentionCutoffMs)
      return changes
    }).immediate()
    if (changed !== 1) throw new ModelCatalogV2RepoError('GENERATION_V2_MODEL_CATALOG_STALE_ATTEMPT')
    if (input.applyMode === 'manual') {
      return Object.freeze({
        snapshotDigest: input.responseDigest,
        codecVersion,
        completeness,
        adapterRevision,
        aggregateEvidence: evidence,
        observedAtMs,
        modelCount,
        visibleModelCount,
        hiddenModelCount,
        items: decodeItems(itemsJson, scope.providerKey),
      })
    }
    const active = this.readActive(input.scope)
    if (!active) throw new ModelCatalogV2RepoError('GENERATION_V2_MODEL_CATALOG_STATE_INVALID')
    return active
  }

  applyPendingSnapshot(scopeValue: ModelCatalogScopeIdentityV2, expectedSnapshotDigestValue: string): ModelCatalogActiveSnapshotV2 {
    const scope = identity(scopeValue)
    const snapshotDigest = text(expectedSnapshotDigestValue)
    if (!DIGEST_PATTERN.test(snapshotDigest)) {
      throw new ModelCatalogV2RepoError('GENERATION_V2_MODEL_CATALOG_INPUT_INVALID')
    }
    const now = safeTime(this.nowMs())
    const changed = this.db.transaction(() => {
      const current = this.db.prepare(`SELECT sync_state,pending_snapshot_digest
        FROM model_catalog_scope_v2 WHERE scope_id=?`).get(scope.scopeId) as
        { sync_state: string; pending_snapshot_digest: string | null } | undefined
      if (!current || current.sync_state === 'syncing' || current.pending_snapshot_digest !== snapshotDigest) {
        throw new ModelCatalogV2RepoError('GENERATION_V2_MODEL_CATALOG_STATE_INVALID')
      }
      const snapshot = this.db.prepare(`SELECT observed_at_ms,model_count,visible_model_count,hidden_model_count
        FROM model_catalog_snapshot_v2 WHERE scope_id=? AND category_key=? AND snapshot_digest=?`)
        .get(scope.scopeId, scope.category, snapshotDigest) as Record<string, unknown> | undefined
      if (!snapshot) throw new ModelCatalogV2RepoError('GENERATION_V2_MODEL_CATALOG_STATE_INVALID')
      return this.db.prepare(`UPDATE model_catalog_scope_v2 SET active_snapshot_digest=?,pending_snapshot_digest=NULL,sync_state='ok',
        last_succeeded_at_ms=?,last_failure_json=NULL,
        model_count=?,visible_model_count=?,hidden_model_count=?,updated_at_ms=?,authority_revision=authority_revision+1 WHERE scope_id=?`)
        .run(snapshotDigest, safeTime(snapshot.observed_at_ms), safeCount(snapshot.model_count),
          safeCount(snapshot.visible_model_count), safeCount(snapshot.hidden_model_count), now, scope.scopeId).changes
    }).immediate()
    if (changed !== 1) throw new ModelCatalogV2RepoError('GENERATION_V2_MODEL_CATALOG_STATE_INVALID')
    const active = this.readActive(scopeValue)
    if (!active) throw new ModelCatalogV2RepoError('GENERATION_V2_MODEL_CATALOG_STATE_INVALID')
    return active
  }

  discardPendingSnapshot(scopeValue: ModelCatalogScopeIdentityV2, expectedSnapshotDigestValue: string): ModelCatalogStatusV2 {
    const scope = identity(scopeValue)
    const snapshotDigest = text(expectedSnapshotDigestValue)
    if (!DIGEST_PATTERN.test(snapshotDigest)) {
      throw new ModelCatalogV2RepoError('GENERATION_V2_MODEL_CATALOG_INPUT_INVALID')
    }
    const changes = this.db.prepare(`UPDATE model_catalog_scope_v2 SET pending_snapshot_digest=NULL,updated_at_ms=?,
      authority_revision=authority_revision+1
      WHERE scope_id=? AND sync_state!='syncing' AND pending_snapshot_digest=?`)
      .run(safeTime(this.nowMs()), scope.scopeId, snapshotDigest).changes
    if (changes !== 1) throw new ModelCatalogV2RepoError('GENERATION_V2_MODEL_CATALOG_STATE_INVALID')
    const status = this.readStatus(scopeValue)
    if (!status) throw new ModelCatalogV2RepoError('GENERATION_V2_MODEL_CATALOG_STATE_INVALID')
    return status
  }

  failSync(
    scopeValue: ModelCatalogScopeIdentityV2,
    attemptIdValue: string,
    error: ProviderFailureV2,
  ): ModelCatalogStatusV2 {
    const scope = identity(scopeValue)
    const attemptId = text(attemptIdValue)
    text(error.starverseDiagnosticCode)
    const errorFact = encodeErrorFact(error)
    const now = safeTime(this.nowMs())
    const changes = this.db.prepare(`UPDATE model_catalog_scope_v2 SET sync_state='error',active_attempt_id=NULL,
      last_failure_json=?,updated_at_ms=?,authority_revision=authority_revision+1 WHERE scope_id=? AND active_attempt_id=?`)
      .run(errorFact, now, scope.scopeId, attemptId).changes
    if (changes !== 1) throw new ModelCatalogV2RepoError('GENERATION_V2_MODEL_CATALOG_STALE_ATTEMPT')
    return this.readStatus(scopeValue)!
  }

  readStatus(scopeValue: ModelCatalogScopeIdentityV2): ModelCatalogStatusV2 | null {
    const scope = identity(scopeValue)
    const row = this.db.prepare(`SELECT scope_id,authority_revision,provider_key,sync_state,last_attempted_at_ms,last_succeeded_at_ms,last_failure_json,
      model_count,visible_model_count,hidden_model_count,active_snapshot_digest,pending_snapshot_digest,category_key
      FROM model_catalog_scope_v2 WHERE scope_id=?`).get(scope.scopeId) as Record<string, unknown> | undefined
    if (!row) return null
    const lastFailure = decodeErrorFact(row.last_failure_json)
    return Object.freeze({ scopeId: String(row.scope_id), authorityRevision: safeCount(row.authority_revision),
      providerKey: String(row.provider_key), syncState: row.sync_state as ModelCatalogStatusV2['syncState'],
      lastAttemptedAtMs: row.last_attempted_at_ms === null ? null : Number(row.last_attempted_at_ms),
      lastSucceededAtMs: row.last_succeeded_at_ms === null ? null : Number(row.last_succeeded_at_ms),
      errorCode: lastFailure?.starverseDiagnosticCode ?? null, lastFailure, modelCount: Number(row.model_count),
      visibleModelCount: Number(row.visible_model_count), hiddenModelCount: Number(row.hidden_model_count),
      activeSnapshotDigest: row.active_snapshot_digest === null ? null : String(row.active_snapshot_digest),
      pendingSnapshotDigest: row.pending_snapshot_digest === null ? null : String(row.pending_snapshot_digest),
      category: String(row.category_key) })
  }

  readActive(scopeValue: ModelCatalogScopeIdentityV2): ModelCatalogActiveSnapshotV2 | null {
    const scope = identity(scopeValue)
    const status = this.readStatus(scopeValue)
    if (!status?.activeSnapshotDigest) return null
    const row = this.db.prepare(`SELECT snapshot_digest,observed_at_ms,model_count,visible_model_count,
      hidden_model_count,codec_version,completeness,adapter_revision,aggregate_evidence_json,items_json
      FROM model_catalog_snapshot_v2
      WHERE scope_id=? AND category_key=? AND snapshot_digest=?`).get(scope.scopeId, scope.category,
        status.activeSnapshotDigest) as Record<string, unknown> | undefined
    if (!row) throw new ModelCatalogV2RepoError('GENERATION_V2_MODEL_CATALOG_STATE_INVALID')
    const snapshot = this.#decodeStoredSnapshot(row, scope.providerKey)
    return Object.freeze({ status, ...snapshot })
  }

  readPending(scopeValue: ModelCatalogScopeIdentityV2): ModelCatalogStoredSnapshotV2 | null {
    const scope = identity(scopeValue)
    const status = this.readStatus(scopeValue)
    if (!status?.pendingSnapshotDigest) return null
    const row = this.db.prepare(`SELECT snapshot_digest,observed_at_ms,model_count,visible_model_count,
      hidden_model_count,codec_version,completeness,adapter_revision,aggregate_evidence_json,items_json FROM model_catalog_snapshot_v2
      WHERE scope_id=? AND category_key=? AND snapshot_digest=?`)
      .get(scope.scopeId, scope.category, status.pendingSnapshotDigest) as Record<string, unknown> | undefined
    if (!row) throw new ModelCatalogV2RepoError('GENERATION_V2_MODEL_CATALOG_STATE_INVALID')
    return this.#decodeStoredSnapshot(row, scope.providerKey)
  }

  #decodeStoredSnapshot(row: Record<string, unknown>, expectedProviderKey: string): ModelCatalogStoredSnapshotV2 {
    const modelCount = safeCount(row.model_count)
    const visibleModelCount = safeCount(row.visible_model_count)
    const hiddenModelCount = safeCount(row.hidden_model_count)
    const itemsJson = String(row.items_json)
    const items = decodeItems(itemsJson, expectedProviderKey)
    if (items.length !== modelCount || visibleModelCount + hiddenModelCount !== modelCount ||
        safeCount(row.codec_version) !== SNAPSHOT_CODEC_VERSION || row.completeness !== 'complete') {
      throw new ModelCatalogV2RepoError('GENERATION_V2_MODEL_CATALOG_STATE_INVALID')
    }
    return Object.freeze({
      snapshotDigest: String(row.snapshot_digest),
      codecVersion: SNAPSHOT_CODEC_VERSION,
      completeness: 'complete',
      adapterRevision: text(row.adapter_revision),
      aggregateEvidence: decodeAggregateEvidence(row.aggregate_evidence_json,
        { modelCount, visibleModelCount, hiddenModelCount, itemsJson }),
      observedAtMs: safeTime(row.observed_at_ms),
      modelCount,
      visibleModelCount,
      hiddenModelCount,
      items,
    })
  }

  readSnapshot(scopeValue: ModelCatalogScopeIdentityV2, snapshotDigestValue: string): ModelCatalogStoredSnapshotV2 | null {
    const scope = identity(scopeValue)
    const snapshotDigest = text(snapshotDigestValue)
    if (!DIGEST_PATTERN.test(snapshotDigest)) {
      throw new ModelCatalogV2RepoError('GENERATION_V2_MODEL_CATALOG_INPUT_INVALID')
    }
    const row = this.db.prepare(`SELECT snapshot_digest,observed_at_ms,model_count,visible_model_count,
      hidden_model_count,codec_version,completeness,adapter_revision,aggregate_evidence_json,items_json FROM model_catalog_snapshot_v2
      WHERE scope_id=? AND category_key=? AND snapshot_digest=?`)
      .get(scope.scopeId, scope.category, snapshotDigest) as Record<string, unknown> | undefined
    if (!row) return null
    return this.#decodeStoredSnapshot(row, scope.providerKey)
  }

  clearCurrent(scopeValue: ModelCatalogScopeIdentityV2): number {
    const scope = identity(scopeValue)
    return this.#clearWhere('scope_id=?', [scope.scopeId])
  }

  clearCurrentCredentialScopes(scopeValue: ModelCatalogScopeIdentityV2): number {
    const scope = identity(scopeValue)
    return this.#clearWhere(`provider_key=? AND credential_scope_id=? AND endpoint_profile_id=? AND operation_contract_id=?`,
      [scope.providerKey, scope.credentialScopeId, scope.endpointProfileId, scope.operationContractId])
  }

  clearAllScopes(providerKeyValue: string): number {
    return this.#clearWhere('provider_key=?', [text(providerKeyValue)])
  }

  #clearWhere(whereSql: string, parameters: readonly unknown[]): number {
    return this.db.transaction(() => {
      const scopeRows = this.db.prepare(`SELECT scope_id FROM model_catalog_scope_v2 WHERE ${whereSql}`).all(...parameters) as
        Array<{ scope_id: string }>
      if (scopeRows.length === 0) return 0
      const update = this.db.prepare(`UPDATE model_catalog_scope_v2 SET active_snapshot_digest=NULL,pending_snapshot_digest=NULL,
        sync_state='idle',active_attempt_id=NULL,last_succeeded_at_ms=NULL,last_failure_json=NULL,
        model_count=0,visible_model_count=0,hidden_model_count=0,updated_at_ms=?,authority_revision=authority_revision+1
        WHERE scope_id=?`)
      const removeSnapshots = this.db.prepare('DELETE FROM model_catalog_snapshot_v2 WHERE scope_id=?')
      const now = safeTime(this.nowMs())
      for (const row of scopeRows) {
        if (update.run(now, row.scope_id).changes !== 1) {
          throw new ModelCatalogV2RepoError('GENERATION_V2_MODEL_CATALOG_STATE_INVALID')
        }
        removeSnapshots.run(row.scope_id)
      }
      return scopeRows.length
    }).immediate()
  }

  cleanupInactiveSnapshots(scopeValue: ModelCatalogScopeIdentityV2, retainAfterMsValue: number): number {
    const scope = identity(scopeValue)
    const retainAfterMs = safeTime(retainAfterMsValue)
    return this.db.prepare(`DELETE FROM model_catalog_snapshot_v2 AS snapshot
      WHERE snapshot.scope_id=? AND snapshot.category_key=? AND snapshot.created_at_ms < ?
        AND snapshot.snapshot_digest != COALESCE(
          (SELECT active_snapshot_digest FROM model_catalog_scope_v2 WHERE scope_id=?), '')
        AND snapshot.snapshot_digest != COALESCE(
          (SELECT pending_snapshot_digest FROM model_catalog_scope_v2 WHERE scope_id=?), '')`)
      .run(scope.scopeId, scope.category, retainAfterMs, scope.scopeId, scope.scopeId).changes
  }
}
