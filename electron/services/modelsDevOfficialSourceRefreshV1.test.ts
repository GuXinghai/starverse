import { describe, expect, it, vi } from 'vitest'
import path from 'node:path'
import BetterSqlite3 from 'better-sqlite3'
import { applyGenerationV2SchemaForTest } from '../../infra/db/v2/testSchemaV2'
import { CanonicalModelFactSourceV1Repo } from '../../infra/db/repo/canonicalModelFactSourceV1Repo'
import { canonicalModelsDevSourceScopeIdV1 } from
  '../../infra/db/services/canonicalModelFactSourceIngestionV1Service'
import {
  MODELS_DEV_OFFICIAL_API_URL_V1,
  MODELS_DEV_OFFICIAL_DISTRIBUTION_CHANNEL_V1,
  MODELS_DEV_OFFICIAL_DISTRIBUTION_ID_V1,
  ModelsDevOfficialSourceRefreshV1,
} from './modelsDevOfficialSourceRefreshV1'

function database() {
  const db = new BetterSqlite3(':memory:')
  applyGenerationV2SchemaForTest(db, path.resolve(process.cwd()))
  return db
}

function sourceScopeId(): string {
  return canonicalModelsDevSourceScopeIdV1({
    distributionId: MODELS_DEV_OFFICIAL_DISTRIBUTION_ID_V1,
    distributionChannel: MODELS_DEV_OFFICIAL_DISTRIBUTION_CHANNEL_V1,
  })
}

describe('ModelsDevOfficialSourceRefreshV1', () => {
  it('fetches only the fixed official API and publishes one enumerable source snapshot', async () => {
    const db = database()
    let now = 1_700_000_000_000
    const fetchImpl = vi.fn(async (_input: string | URL | Request, _init?: RequestInit) => new Response(JSON.stringify({
      openai: { id: 'openai', models: { 'gpt-test': {
        id: 'gpt-test', name: 'GPT Test', tool_call: true,
        limit: { context: 8_192, output: 1_024 }, modalities: { input: ['text'], output: ['text'] },
      } } },
      google: { id: 'google', models: { 'gemini-test': {
        id: 'gemini-test', name: 'Gemini Test', reasoning: true,
      } } },
    }), { status: 200, headers: { 'content-type': 'application/json' } }))
    try {
      const refresher = new ModelsDevOfficialSourceRefreshV1({ db, fetchImpl: fetchImpl as typeof fetch,
        nowMs: () => now, refreshCadenceMs: 60_000 })
      const first = await refresher.refreshIfDue()
      expect(first).toMatchObject({ ok: true, status: 'refreshed' })
      expect(fetchImpl).toHaveBeenCalledTimes(1)
      expect(fetchImpl.mock.calls[0]?.[0]).toBe(MODELS_DEV_OFFICIAL_API_URL_V1)
      expect(fetchImpl.mock.calls[0]?.[1]).toMatchObject({ method: 'GET', redirect: 'error', cache: 'no-store' })

      const repo = new CanonicalModelFactSourceV1Repo(db, () => now)
      const state = repo.readSourceState('models_dev', sourceScopeId())
      expect(state?.currentSourceRevision).toBe(first.ok ? first.canonicalSourceRevision : null)
      const source = repo.readSourceRevision(state!.currentSourceRevision!)
      expect(source).toMatchObject({ subjectIndexMode: 'complete', subjectFactCount: 2 })
      expect(repo.readSubjectFact({ canonicalSourceRevision: state!.currentSourceRevision!, subject: {
        providerAuthorityId: 'openai', endpointProfileId: 'openai-api-v1', nativeModelId: 'gpt-test',
      } })?.payload.outcomes).toEqual(expect.arrayContaining([
        expect.objectContaining({ path: 'tools.calling.support' }),
        expect.objectContaining({ path: 'limits.contextWindow.maxTokens' }),
      ]))

      now += 1_000
      const notDue = await refresher.refreshIfDue()
      expect(notDue).toMatchObject({ ok: true, status: 'not_due',
        canonicalSourceRevision: state?.currentSourceRevision })
      expect(fetchImpl).toHaveBeenCalledTimes(1)
    } finally { db.close() }
  })

  it('retains the current LKG and records a bounded failure reason', async () => {
    const db = database()
    let now = 1_700_000_000_000
    const fetchImpl = vi.fn()
      .mockResolvedValueOnce(new Response(JSON.stringify({
        openai: { id: 'openai', models: { 'gpt-test': { id: 'gpt-test', name: 'GPT Test' } } },
      }), { status: 200, headers: { 'content-type': 'application/json' } }))
      .mockResolvedValueOnce(new Response('<html>not json</html>', {
        status: 200, headers: { 'content-type': 'text/html' },
      }))
    try {
      const refresher = new ModelsDevOfficialSourceRefreshV1({ db, fetchImpl: fetchImpl as typeof fetch,
        nowMs: () => now, refreshCadenceMs: 1_000 })
      const first = await refresher.refreshIfDue()
      expect(first.ok).toBe(true)
      const firstRevision = first.ok ? first.canonicalSourceRevision : null

      now += 1_001
      await expect(refresher.refreshIfDue()).resolves.toEqual({ ok: false, status: 'failed',
        code: 'MODELS_DEV_OFFICIAL_CONTENT_TYPE_INVALID' })
      const state = new CanonicalModelFactSourceV1Repo(db, () => now)
        .readSourceState('models_dev', sourceScopeId())
      expect(state).toMatchObject({ currentSourceRevision: firstRevision,
        staleReason: 'MODELS_DEV_OFFICIAL_CONTENT_TYPE_INVALID', lastAttemptedAtMs: now })
    } finally { db.close() }
  })

  it('P3a-06: rejects a truncated snapshot with a stable code and keeps the LKG', async () => {
    const db = database()
    let now = 1_700_000_000_000
    const body = (count: number) => new Response(JSON.stringify({ openai: { id: 'openai', models: Object.fromEntries(
      Array.from({ length: count }, (_, index) => [`gpt-${index}`, { id: `gpt-${index}`, name: `GPT ${index}` }])) } }),
    { status: 200, headers: { 'content-type': 'application/json' } })
    const fetchImpl = vi.fn().mockResolvedValueOnce(body(80)).mockResolvedValueOnce(body(3))
    try {
      const refresher = new ModelsDevOfficialSourceRefreshV1({ db, fetchImpl: fetchImpl as typeof fetch,
        nowMs: () => now, refreshCadenceMs: 1_000 })
      const first = await refresher.refreshIfDue()
      const firstRevision = first.ok ? first.canonicalSourceRevision : null
      expect(firstRevision).not.toBeNull()

      now += 1_001
      await expect(refresher.refreshIfDue()).resolves.toEqual({ ok: false, status: 'failed',
        code: 'MODELS_DEV_OFFICIAL_SNAPSHOT_SHRINK_REJECTED' })
      expect(new CanonicalModelFactSourceV1Repo(db, () => now).readSourceState('models_dev', sourceScopeId()))
        .toMatchObject({ currentSourceRevision: firstRevision, staleReason: 'MODELS_DEV_OFFICIAL_SNAPSHOT_SHRINK_REJECTED' })
    } finally { db.close() }
  })

  it('R4-02: notifies only when a refresh moves the current models.dev revision', async () => {
    const db = database()
    let now = 1_700_000_000_000
    const body = (name: string) => new Response(JSON.stringify({ openai: { id: 'openai', models: {
      'gpt-test': { id: 'gpt-test', name } } } }), { status: 200, headers: { 'content-type': 'application/json' } })
    const fetchImpl = vi.fn().mockResolvedValueOnce(body('A')).mockResolvedValueOnce(body('A'))
      .mockResolvedValueOnce(body('B'))
    const onPublished = vi.fn()
    try {
      const refresher = new ModelsDevOfficialSourceRefreshV1({ db, fetchImpl: fetchImpl as typeof fetch,
        nowMs: () => now, refreshCadenceMs: 1_000, onPublished })
      const first = await refresher.refreshIfDue()
      expect(onPublished).toHaveBeenCalledExactlyOnceWith(first.ok ? first.canonicalSourceRevision : null)
      now += 1_001
      await refresher.refreshIfDue()
      expect(onPublished).toHaveBeenCalledTimes(1)
      now += 1_001
      const third = await refresher.refreshIfDue()
      expect(onPublished).toHaveBeenCalledTimes(2)
      expect(onPublished).toHaveBeenLastCalledWith(third.ok ? third.canonicalSourceRevision : null)
    } finally { db.close() }
  })

  it('refreshes again while the app remains running and dispose cancels future work', async () => {
    vi.useFakeTimers()
    vi.setSystemTime(1_700_000_000_000)
    const db = database()
    const fetchImpl = vi.fn(async () => new Response(JSON.stringify({
      openai: { id: 'openai', models: { 'gpt-test': { id: 'gpt-test', name: 'GPT Test' } } },
    }), { status: 200, headers: { 'content-type': 'application/json' } }))
    try {
      const refresher = new ModelsDevOfficialSourceRefreshV1({ db, fetchImpl: fetchImpl as typeof fetch,
        nowMs: Date.now, refreshCadenceMs: 1_000 })
      await expect(refresher.start()).resolves.toMatchObject({ ok: true, status: 'refreshed' })
      expect(fetchImpl).toHaveBeenCalledTimes(1)

      await vi.advanceTimersByTimeAsync(1_000)
      expect(fetchImpl).toHaveBeenCalledTimes(2)
      await refresher.dispose()
      await vi.advanceTimersByTimeAsync(2_000)
      expect(fetchImpl).toHaveBeenCalledTimes(2)
    } finally {
      db.close()
      vi.useRealTimers()
    }
  })
})
