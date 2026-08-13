import path from 'node:path'
import BetterSqlite3 from 'better-sqlite3'
import { describe, expect, it, vi } from 'vitest'
import { applyGenerationV2SchemaForTest } from '../../infra/db/v2/testSchemaV2'
import { ModelCatalogV2Repo } from '../../infra/db/repo/modelCatalogV2Repo'
import { createProviderFailureV2 } from '../../src/shared/provider/providerFailureV2'
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

function catalogItem(id: string) {
  return { id, providerKey: 'openai_responses', modelId: id, modelKey: `openai_responses::${id}` }
}

describe('CatalogScopeCoordinatorV2', () => {
  it('publishes automatic snapshots, stages manual snapshots, and applies or discards pending pointers atomically', async () => {
    const db = database()
    let now = 100
    const coordinator = new CatalogScopeCoordinatorV2(new ModelCatalogV2Repo(db, () => now), () => now)
    try {
      const active = await coordinator.sync({ scope, applyMode: 'automatic', retentionMs: 'never',
        failureContext: context, timeoutMs: 1_000,
        execute: async () => ({ ok: true, responseDigest: 'a'.repeat(64), observedAtMs: 90, items: [catalogItem('active')] }) })
      expect(active).toMatchObject({ ok: true, publication: 'active', state: { active: { items: [{ id: 'active' }] }, pending: null } })

      now = 200
      const pending = await coordinator.sync({ scope, applyMode: 'manual', retentionMs: 'never',
        failureContext: context, timeoutMs: 1_000,
        execute: async () => ({ ok: true, responseDigest: 'b'.repeat(64), observedAtMs: 190, items: [catalogItem('pending')] }) })
      expect(pending).toMatchObject({ ok: true, publication: 'pending', state: {
        active: { items: [{ id: 'active' }] }, pending: { items: [{ id: 'pending' }] },
      } })
      expect(coordinator.discardPending({ scope, expectedSnapshotDigest: 'b'.repeat(64) }).pending).toBeNull()

      now = 300
      await coordinator.sync({ scope, applyMode: 'manual', retentionMs: 'never', failureContext: context, timeoutMs: 1_000,
        execute: async () => ({ ok: true, responseDigest: 'c'.repeat(64), observedAtMs: 290, items: [catalogItem('next')] }) })
      expect(coordinator.applyPending({ scope, expectedSnapshotDigest: 'c'.repeat(64) })).toMatchObject({
        active: { items: [{ id: 'next' }] }, pending: null,
      })
    } finally { db.close() }
  })

  it('deduplicates concurrent scope sync and preserves active and pending pointers on raw provider failure', async () => {
    const db = database()
    const coordinator = new CatalogScopeCoordinatorV2(new ModelCatalogV2Repo(db, () => 500), () => 500)
    try {
      await coordinator.sync({ scope, applyMode: 'automatic', retentionMs: 'never', failureContext: context, timeoutMs: 1_000,
        execute: async () => ({ ok: true, responseDigest: 'd'.repeat(64), observedAtMs: 400, items: [catalogItem('active')] }) })
      await coordinator.sync({ scope, applyMode: 'manual', retentionMs: 'never', failureContext: context, timeoutMs: 1_000,
        execute: async () => ({ ok: true, responseDigest: 'e'.repeat(64), observedAtMs: 450, items: [catalogItem('pending')] }) })

      const execute = vi.fn(async () => ({ ok: false as const, providerFailure: createProviderFailureV2({
        context: { ...context, origin: 'http_response', phase: 'response_body' },
        httpStatus: 429, body: { error: { code: 'rate_limit', message: 'slow down' } },
      }) }))
      const request = { scope, applyMode: 'automatic' as const, retentionMs: 'never' as const,
        failureContext: context, timeoutMs: 1_000, execute }
      const leftPromise = coordinator.sync(request)
      const rightPromise = coordinator.sync(request)
      expect(leftPromise).toBe(rightPromise)
      const [left, right] = await Promise.all([leftPromise, rightPromise])
      expect(execute).toHaveBeenCalledTimes(1)
      expect(left).toEqual(right)
      expect(left).toMatchObject({ ok: false, providerFailure: { httpStatus: 429, providerError: { code: 'rate_limit' } },
        state: { active: { items: [{ id: 'active' }] }, pending: { items: [{ id: 'pending' }] } } })
    } finally { db.close() }
  })

  it('serializes differing scope semantics including adapter revision', async () => {
    const db = database()
    const coordinator = new CatalogScopeCoordinatorV2(new ModelCatalogV2Repo(db, () => 500), () => 500)
    const order: string[] = []
    let releaseFirst!: () => void
    const firstGate = new Promise<void>((resolve) => { releaseFirst = resolve })
    try {
      const first = coordinator.sync({ scope, applyMode: 'automatic', retentionMs: 'never', adapterRevision: 'adapter:1',
        failureContext: context, timeoutMs: 1_000, execute: async () => {
          order.push('first:start')
          await firstGate
          order.push('first:end')
          return { ok: true, responseDigest: '1'.repeat(64), items: [catalogItem('first')] }
        } })
      const second = coordinator.sync({ scope, applyMode: 'manual', retentionMs: 100, adapterRevision: 'adapter:2',
        failureContext: context, timeoutMs: 2_000, execute: async () => {
          order.push('second:start')
          return { ok: true, responseDigest: '2'.repeat(64), items: [catalogItem('second')] }
        } })
      await vi.waitFor(() => expect(order).toEqual(['first:start']))
      releaseFirst()
      await Promise.all([first, second])
      expect(order).toEqual(['first:start', 'first:end', 'second:start'])
    } finally { db.close() }
  })

  it('rejects incomplete adapter output and surfaces DB read failures as ProviderFailure', async () => {
    const db = database()
    const coordinator = new CatalogScopeCoordinatorV2(new ModelCatalogV2Repo(db, () => 500), () => 500)
    try {
      const incomplete = await coordinator.sync({ scope, applyMode: 'automatic', retentionMs: 'never',
        failureContext: context, timeoutMs: 1_000,
        execute: async () => ({ ok: true, completeness: 'incomplete', items: [{ id: 'partial' }] }) })
      expect(incomplete).toMatchObject({ ok: false, providerFailure: {
        starverseDiagnosticCode: 'MODEL_CATALOG_SNAPSHOT_INCOMPLETE' }, state: { active: null } })
      expect(coordinator.read(scope).status).toMatchObject({ authorityRevision: 2, syncState: 'error' })
    } finally { db.close() }

    const repo = {
      beginSync: vi.fn(() => { throw new Error('sqlite begin failed') }),
      readStatus: vi.fn(() => { throw new Error('sqlite read failed') }),
      readActive: vi.fn(),
      readPending: vi.fn(),
    } as unknown as ModelCatalogV2Repo
    const failed = await new CatalogScopeCoordinatorV2(repo, () => 500).sync({ scope,
      applyMode: 'automatic', retentionMs: 'never', failureContext: context, timeoutMs: 1_000,
      execute: async () => ({ ok: true, items: [] }) })
    expect(failed).toMatchObject({ ok: false,
      providerFailure: { starverseDiagnosticCode: 'MODEL_CATALOG_SYNC_BEGIN_FAILED' },
      readFailure: { origin: 'database', starverseDiagnosticCode: 'MODEL_CATALOG_STATE_READ_FAILED' } })
  })

  it('keeps the original provider failure authoritative when persisting that failure also fails', async () => {
    const providerFailure = createProviderFailureV2({
      context: { ...context, origin: 'http_response', phase: 'response_body' },
      httpStatus: 503,
      body: { error: { code: 'provider_code', message: 'provider message' } },
    })
    const repo = {
      beginSync: vi.fn(),
      failSync: vi.fn(() => { throw new Error('sqlite write failed') }),
      readStatus: vi.fn(() => null),
      readActive: vi.fn(() => null),
      readPending: vi.fn(() => null),
    } as unknown as ModelCatalogV2Repo
    const result = await new CatalogScopeCoordinatorV2(repo, () => 500).sync({
      scope,
      applyMode: 'automatic',
      retentionMs: 'never',
      failureContext: context,
      timeoutMs: 1_000,
      execute: async () => ({ ok: false, providerFailure }),
    })

    expect(result).toMatchObject({
      ok: false,
      providerFailure: { httpStatus: 503, providerError: { code: 'provider_code', message: 'provider message' } },
      persistenceFailure: {
        origin: 'database',
        phase: 'terminal_persistence',
        starverseDiagnosticCode: 'MODEL_CATALOG_FAILURE_PERSIST_FAILED',
      },
    })
  })
})
