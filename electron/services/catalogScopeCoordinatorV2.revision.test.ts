import path from 'node:path'
import BetterSqlite3 from 'better-sqlite3'
import { describe, expect, it } from 'vitest'
import { applyGenerationV2SchemaForTest } from '../../infra/db/v2/testSchemaV2'
import { ModelCatalogV2Repo } from '../../infra/db/repo/modelCatalogV2Repo'
import { CatalogScopeCoordinatorV2 } from './catalogScopeCoordinatorV2'

const scope = Object.freeze({ providerKey: 'openai_responses', credentialScopeId: 'scope:openai:1',
  endpointProfileId: 'openai-api-v1', operationContractId: 'openai-models-v1', category: '' })
const context = Object.freeze({ origin: 'provider_runtime' as const, phase: 'response_body' as const,
  provider: Object.freeze({ namespace: 'catalog_source' as const, id: 'openai_responses' as const }),
  contractId: 'openai-models-v1', operationId: 'catalog:test', requestSequence: 1 })

function database() {
  const db = new BetterSqlite3(':memory:')
  applyGenerationV2SchemaForTest(db, path.resolve(process.cwd()))
  return db
}

// A catalog item the way a provider source stamps it: the fetch time is repeated at several depths.
function item(id: string, fetchedAtMs: number) {
  return { id, providerKey: 'openai_responses', modelId: id, modelKey: `openai_responses::${id}`,
    firstSeenAtMs: fetchedAtMs, lastSeenAtMs: fetchedAtMs, syncedAtMs: fetchedAtMs,
    raw: { buckets: [{ fetchedAtMs, payload: { id }, observation: { providerKey: 'openai_responses', nativeModelId: id, observedAtMs: fetchedAtMs } }] } }
}

const sync = (coordinator: CatalogScopeCoordinatorV2, applyMode: 'automatic' | 'manual',
  items: ReturnType<typeof item>[], timeoutMs = 1_000) => coordinator.sync({ scope, applyMode, retentionMs: 'never',
  failureContext: context, timeoutMs, execute: async () => ({ ok: true, items }) })

const snapshotRows = (db: BetterSqlite3.Database) =>
  (db.prepare('SELECT COUNT(*) AS n FROM model_catalog_snapshot_v2').get() as { n: number }).n

describe('catalog authority revision and snapshot identity (R4-08)', () => {
  // P3a-02 + P3a-14: a refresh that returns the same models used to look like a new snapshot and moved the
  // revision, so every open send then failed with ACTIVE_CATALOG_CHANGED.
  it('an unchanged catalog keeps its digest, its snapshot and its revision', async () => {
    const db = database()
    let now = 1_000
    const coordinator = new CatalogScopeCoordinatorV2(new ModelCatalogV2Repo(db, () => now), () => now)
    try {
      const first = await sync(coordinator, 'automatic', [item('a', 1_000), item('b', 1_000)])
      expect(first.ok).toBe(true)
      const before = coordinator.read(scope)
      expect(before.status).toMatchObject({ authorityRevision: 2, syncState: 'ok' })

      now = 5_000
      const again = await sync(coordinator, 'automatic', [item('a', 5_000), item('b', 5_000)])
      expect(again.ok).toBe(true)
      const after = coordinator.read(scope)
      expect(after.status).toMatchObject({ authorityRevision: 2, syncState: 'ok',
        activeSnapshotDigest: before.status?.activeSnapshotDigest, lastSucceededAtMs: 5_000 })
      expect(snapshotRows(db)).toBe(1)

      now = 9_000
      await sync(coordinator, 'automatic', [item('a', 9_000), item('c', 9_000)])
      const changed = coordinator.read(scope)
      expect(changed.status?.activeSnapshotDigest).not.toBe(before.status?.activeSnapshotDigest)
      expect(changed.status?.authorityRevision).toBe(3)
      expect(snapshotRows(db)).toBe(2)
    } finally { db.close() }
  })

  it('only a change of the active catalog moves the revision: not a failed or staged refresh, not a discard', async () => {
    const db = database()
    const coordinator = new CatalogScopeCoordinatorV2(new ModelCatalogV2Repo(db, () => 100), () => 100)
    try {
      await sync(coordinator, 'automatic', [item('a', 100)])
      const base = coordinator.read(scope).status!.authorityRevision

      const failed = await coordinator.sync({ scope, applyMode: 'automatic', retentionMs: 'never', failureContext: context,
        timeoutMs: 1_000, execute: async () => { throw new Error('boom') } })
      expect(failed.ok).toBe(false)
      expect(coordinator.read(scope).status).toMatchObject({ syncState: 'error', authorityRevision: base })

      await sync(coordinator, 'manual', [item('a', 200), item('z', 200)])
      const staged = coordinator.read(scope)
      expect(staged.pending).not.toBeNull()
      expect(staged.status!.authorityRevision).toBe(base)

      coordinator.discardPending({ scope, expectedSnapshotDigest: staged.pending!.snapshotDigest })
      expect(coordinator.read(scope).status!.authorityRevision).toBe(base)

      await sync(coordinator, 'manual', [item('a', 300), item('z', 300)])
      coordinator.applyPending({ scope, expectedSnapshotDigest: coordinator.read(scope).pending!.snapshotDigest })
      expect(coordinator.read(scope).status!.authorityRevision).toBe(base + 1)
    } finally { db.close() }
  })

  // P3a-05
  it('an adapter that ignores the abort signal still ends in a failed attempt, and the scope can sync again', async () => {
    const db = database()
    const coordinator = new CatalogScopeCoordinatorV2(new ModelCatalogV2Repo(db, () => 100), () => 100)
    try {
      const hung = await coordinator.sync({ scope, applyMode: 'automatic', retentionMs: 'never', failureContext: context,
        timeoutMs: 20, execute: () => new Promise(() => undefined) })
      expect(hung.ok).toBe(false)
      expect(coordinator.read(scope).status).toMatchObject({ syncState: 'error', errorCode: expect.any(String) })

      const next = await sync(coordinator, 'automatic', [item('a', 100)])
      expect(next.ok).toBe(true)
      expect(coordinator.read(scope).status?.syncState).toBe('ok')
    } finally { db.close() }
  })

  it('a scope left in syncing by a dead process is recovered at startup and accepts a new sync', async () => {
    const db = database()
    try {
      const dead = new ModelCatalogV2Repo(db, () => 100)
      dead.beginSync(scope, 'attempt:dead')
      expect(() => dead.beginSync(scope, 'attempt:next')).toThrow('GENERATION_V2_MODEL_CATALOG_SYNC_IN_PROGRESS')

      const restarted = new ModelCatalogV2Repo(db, () => 200)
      expect(restarted.recoverInterruptedSyncs()).toBe(1)
      expect(restarted.readStatus(scope)).toMatchObject({ syncState: 'idle', authorityRevision: 1 })
      expect(restarted.recoverInterruptedSyncs()).toBe(0)

      const coordinator = new CatalogScopeCoordinatorV2(restarted, () => 200)
      expect((await sync(coordinator, 'automatic', [item('a', 200)])).ok).toBe(true)

      // With a catalog already active the recovered scope is 'ok', not 'idle'.
      restarted.beginSync(scope, 'attempt:dead-again')
      expect(new ModelCatalogV2Repo(db, () => 300).recoverInterruptedSyncs()).toBe(1)
      expect(restarted.readStatus(scope)?.syncState).toBe('ok')
    } finally { db.close() }
  })
})
