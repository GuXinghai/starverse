import path from 'node:path'
import BetterSqlite3 from 'better-sqlite3'
import { describe, expect, it, vi } from 'vitest'
import { applyGenerationV2SchemaForTest } from '../../infra/db/v2/testSchemaV2'
import {
  CLOUD_RULES_RELEASE_ASSET_NAME_V1,
  computeCloudRulesContentRevisionV1,
} from '../../src/next/generation-v2/capability-rules/cloudRulesReleaseV1'
import {
  CLOUD_RULES_GITHUB_RELEASES_LISTING_URL_V1,
  CloudRulesCandidateRefreshV1,
  projectCloudRulesRedirectHeadersV1,
} from './cloudRulesCandidateRefreshV1'

function database(): BetterSqlite3.Database {
  const db = new BetterSqlite3(':memory:')
  applyGenerationV2SchemaForTest(db, path.resolve(process.cwd()))
  return db
}

function packs(priority = 0): readonly Record<string, unknown>[] {
  return [{ schemaVersion: 1, packId: 'pack.reasoning', displayName: 'Reasoning', description: null,
    priority, mode: 'no_control', target: 'enabled', rules: [{
      ruleId: 'rule.reasoning', label: null, description: null, priority: 0, configured: 'default',
      providerAuthorityId: 'openai', endpointProfileId: 'openai-default',
      selector: { kind: 'exact', nativeModelIds: ['gpt-test'] },
      assertion: { path: 'reasoning.support', value: { kind: 'support', value: 'supported' } },
      evidence: null,
    }] }]
}

function document(version: string, priority = 0): Record<string, unknown> {
  const rulePacks = packs(priority)
  return { schemaVersion: 1, releaseVersion: version,
    contentRevision: computeCloudRulesContentRevisionV1(rulePacks), packs: rulePacks }
}

function release(version: string, overrides: Record<string, unknown> = {}): Record<string, unknown> {
  const id = Number(version.replaceAll('.', '')) + 100
  return {
    id, tag_name: `cloud-rules-v${version}`,
    html_url: `https://github.com/GuXinghai/starverse/releases/tag/cloud-rules-v${version}`,
    name: `Cloud Rules ${version}`, body: `notes ${version}`, draft: false, prerelease: false,
    published_at: '2026-09-21T00:00:00.000Z',
    assets: [{ id: id + 100, name: CLOUD_RULES_RELEASE_ASSET_NAME_V1, state: 'uploaded',
      url: `https://api.github.com/repos/GuXinghai/starverse/releases/assets/${id + 100}`,
      browser_download_url: `https://github.com/GuXinghai/starverse/releases/download/cloud-rules-v${version}/${CLOUD_RULES_RELEASE_ASSET_NAME_V1}`,
      size: 100, digest: null }],
    unrelated_future_field: { tolerated: true },
    ...overrides,
  }
}

function jsonResponse(value: unknown, headers: Record<string, string> = {}): Response {
  return new Response(JSON.stringify(value), { status: 200,
    headers: { 'content-type': 'application/json', ...headers } })
}

function assetResponse(value: unknown): Response {
  return new Response(JSON.stringify(value), { status: 200,
    headers: { 'content-type': 'application/octet-stream' } })
}

function listingFetcher(pages: readonly unknown[], docs: readonly unknown[]) {
  let listingIndex = 0
  let assetIndex = 0
  return vi.fn(async (input: string | URL | Request, _init?: RequestInit) => {
    const url = String(input)
    if (url.includes('/releases/assets/')) return assetResponse(docs[assetIndex++] ?? {})
    const page = pages[listingIndex++]
    const link = listingIndex < pages.length
      ? `https://api.github.com/repos/GuXinghai/starverse/releases?per_page=100&page=${listingIndex + 1}`
      : undefined
    return jsonResponse(page, link ? { link: `<${link}>; rel="next"` } : {})
  })
}

describe('CloudRulesCandidateRefreshV1', () => {
  it('paginates the fixed authority and selects the highest valid stable Cloud release', async () => {
    const db = database()
    const fetchImpl = listingFetcher([
      [release('1.2.3'), { tag_name: 'v99.0.0' }, { tag_name: 'cloud-rules-v2.0.0', draft: true }],
      [release('1.10.0'), release('1.9.99'), { tag_name: 'cloud-rules-v1.0', assets: [] }],
    ], [document('1.10.0')])
    try {
      const result = await new CloudRulesCandidateRefreshV1({ db, fetchImpl }).refreshIfDue()
      expect(result).toMatchObject({ ok: true, status: 'refreshed' })
      expect(result.ok && result.state.latestObserved?.releaseVersion).toBe('1.10.0')
      expect(fetchImpl.mock.calls.map(([url]) => String(url))).toEqual([
        CLOUD_RULES_GITHUB_RELEASES_LISTING_URL_V1,
        'https://api.github.com/repos/GuXinghai/starverse/releases?per_page=100&page=2',
        'https://api.github.com/repos/GuXinghai/starverse/releases/assets/1300',
      ])
    } finally { db.close() }
  })

  it('keeps checking freshness while a local version pin suppresses update candidates', async () => {
    const db = database()
    const current = document('1.0.0')
    db.prepare(`INSERT INTO cloud_rules_application_policy_v1 (
      singleton_id, policy_revision, history_limit, pinned_release_version,
      pinned_content_revision, updated_at_ms
    ) VALUES (1, 1, 4, ?, ?, 1)`).run('1.0.0', current.contentRevision)
    const fetchImpl = listingFetcher([[release('2.0.0')]], [document('2.0.0', 1)])
    try {
      const result = await new CloudRulesCandidateRefreshV1({ db, fetchImpl }).refreshIfDue()
      expect(result).toMatchObject({ ok: true, status: 'refreshed' })
      expect(result.ok && result.state.candidate).toBeNull()
      expect(result.ok && result.state.latestObserved?.releaseVersion).toBe('2.0.0')
      expect(result.ok && result.state.lastSuccessfulCheckAtMs).not.toBeNull()
    } finally { db.close() }
  })

  it('fails the highest release without falling down to an older release', async () => {
    const db = database()
    const fetchImpl = listingFetcher([[release('1.0.0'), release('2.0.0', { assets: [] })]], [])
    try {
      const result = await new CloudRulesCandidateRefreshV1({ db, fetchImpl }).refreshIfDue()
      expect(result).toEqual({ ok: false, status: 'failed', code: 'CLOUD_RULES_ASSET_INVALID' })
      expect(fetchImpl).toHaveBeenCalledTimes(1)
      expect(new (await import('../../infra/db/repo/cloudRulesDistributionV1Repo')).CloudRulesDistributionV1Repo(db).readState()).toMatchObject({
        candidate: null, lastSuccessfulCheckAtMs: null, lastFailureCode: 'CLOUD_RULES_ASSET_INVALID',
      })
    } finally { db.close() }
  })

  it.each([
    ['http', 'http://api.github.com/repos/GuXinghai/starverse/releases?per_page=100&page=1', 'CLOUD_RULES_REDIRECT_SCHEME_INVALID'],
    ['host', 'https://evil.example.test/repos/GuXinghai/starverse/releases?per_page=100&page=1', 'CLOUD_RULES_REDIRECT_HOST_INVALID'],
    ['suffix', 'https://evilgithubusercontent.com/releases', 'CLOUD_RULES_REDIRECT_HOST_INVALID'],
    ['userinfo', 'https://user:pass@api.github.com/repos/GuXinghai/starverse/releases?per_page=100&page=1', 'CLOUD_RULES_REDIRECT_USERINFO_INVALID'],
  ] as const)('rejects an unsafe %s redirect', async (_label, location, code) => {
    const db = database()
    const fetchImpl = vi.fn(async () => new Response(null, { status: 302, headers: { location } }))
    try {
      await expect(new CloudRulesCandidateRefreshV1({ db, fetchImpl }).refreshIfDue())
        .resolves.toEqual({ ok: false, status: 'failed', code })
      expect(fetchImpl).toHaveBeenCalledTimes(1)
    } finally { db.close() }
  })

  it('detects redirect loops and strips sensitive headers on allowed cross-host hops', async () => {
    expect(projectCloudRulesRedirectHeadersV1({
      headers: { authorization: 'secret', Cookie: 'secret', 'Proxy-Authorization': 'secret',
        accept: 'application/json' },
      fromHostname: 'api.github.com',
      toHostname: 'objects.githubusercontent.com',
    })).toEqual({ accept: 'application/json' })
    expect(projectCloudRulesRedirectHeadersV1({
      headers: { authorization: 'same-host', accept: 'application/json' },
      fromHostname: 'api.github.com',
      toHostname: 'API.GITHUB.COM',
    })).toEqual({ authorization: 'same-host', accept: 'application/json' })
    const db = database()
    const fetchImpl = vi.fn()
      .mockResolvedValueOnce(new Response(null, { status: 302,
        headers: { location: 'https://objects.githubusercontent.com/cloud-rules' } }))
      .mockResolvedValueOnce(jsonResponse([]))
    try {
      const result = await new CloudRulesCandidateRefreshV1({ db, fetchImpl }).refreshIfDue()
      expect(result).toMatchObject({ ok: true, status: 'refreshed' })
      const headers = fetchImpl.mock.calls[1]?.[1]?.headers as Record<string, string>
      expect(headers).not.toHaveProperty('authorization')
      expect(headers).not.toHaveProperty('cookie')
      expect(headers).not.toHaveProperty('proxy-authorization')
    } finally { db.close() }

    const loopDb = database()
    const loopFetcher = vi.fn()
      .mockResolvedValueOnce(new Response(null, { status: 302,
        headers: { location: 'https://github.com/starverse-redirect' } }))
      .mockResolvedValueOnce(new Response(null, { status: 302,
        headers: { location: CLOUD_RULES_GITHUB_RELEASES_LISTING_URL_V1 } }))
    try {
      await expect(new CloudRulesCandidateRefreshV1({ db: loopDb, fetchImpl: loopFetcher }).refreshIfDue())
        .resolves.toEqual({ ok: false, status: 'failed', code: 'CLOUD_RULES_REDIRECT_LOOP' })
      expect(loopFetcher).toHaveBeenCalledTimes(2)
    } finally { loopDb.close() }
  })

  it('requires the exact uploaded asset and validates the closed document before publishing', async () => {
    const db = database()
    const noAsset = release('1.0.0', { assets: [] })
    const fetchImpl = listingFetcher([[noAsset]], [])
    try {
      await expect(new CloudRulesCandidateRefreshV1({ db, fetchImpl }).refreshIfDue())
        .resolves.toEqual({ ok: false, status: 'failed', code: 'CLOUD_RULES_ASSET_INVALID' })
    } finally { db.close() }

    const foreignDb = database()
    const foreign = release('1.0.0')
    const foreignAsset = (foreign.assets as Array<Record<string, unknown>>)[0]!
    foreignAsset.url = `https://api.github.com/repos/other/project/releases/assets/${foreignAsset.id}`
    const foreignFetcher = listingFetcher([[foreign]], [document('1.0.0')])
    try {
      await expect(new CloudRulesCandidateRefreshV1({ db: foreignDb, fetchImpl: foreignFetcher }).refreshIfDue())
        .resolves.toEqual({ ok: false, status: 'failed', code: 'CLOUD_RULES_ASSET_INVALID' })
      expect(foreignFetcher).toHaveBeenCalledTimes(1)
    } finally { foreignDb.close() }

    const invalidDb = database()
    const invalidDocument = { ...document('1.0.0'), unknown: true }
    const invalidFetcher = listingFetcher([[release('1.0.0')]], [invalidDocument])
    try {
      await expect(new CloudRulesCandidateRefreshV1({ db: invalidDb, fetchImpl: invalidFetcher }).refreshIfDue())
        .resolves.toEqual({ ok: false, status: 'failed', code: 'CLOUD_RULES_DOCUMENT_INVALID' })
    } finally { invalidDb.close() }
  })

  it('preserves prior candidate and freshness on version drift or failed checks', async () => {
    const db = database()
    let now = 1_000
    const fetchImpl = listingFetcher([[release('1.0.0')]], [document('1.0.0')])
    const refresher = new CloudRulesCandidateRefreshV1({ db, fetchImpl, nowMs: () => now, refreshCadenceMs: 1 })
    try {
      const first = await refresher.refreshIfDue()
      expect(first.ok).toBe(true)
      const before = first.ok ? first.state : null

      now = 2_000
      const driftFetcher = listingFetcher([[release('1.0.0')]], [document('1.0.0', 1)])
      const drift = await new CloudRulesCandidateRefreshV1({ db, fetchImpl: driftFetcher,
        nowMs: () => now, refreshCadenceMs: 1 }).refreshIfDue()
      expect(drift).toEqual({ ok: false, status: 'failed', code: 'CLOUD_RULES_RELEASE_VERSION_DRIFT' })
      const afterDrift = new (await import('../../infra/db/repo/cloudRulesDistributionV1Repo')).CloudRulesDistributionV1Repo(db).readState()
      expect(afterDrift.candidate).toEqual(before && before.candidate)
      expect(afterDrift.lastSuccessfulCheckAtMs).toBe(before && before.lastSuccessfulCheckAtMs)

      now = 3_000
      const failedFetcher = vi.fn(async () => new Response('no', { status: 503 }))
      const failed = await new CloudRulesCandidateRefreshV1({ db, fetchImpl: failedFetcher,
        nowMs: () => now, refreshCadenceMs: 1 }).refreshIfDue()
      expect(failed).toEqual({ ok: false, status: 'failed', code: 'CLOUD_RULES_HTTP_INVALID' })
      const afterFailure = new (await import('../../infra/db/repo/cloudRulesDistributionV1Repo')).CloudRulesDistributionV1Repo(db).readState()
      expect(afterFailure.candidate).toEqual(afterDrift.candidate)
      expect(afterFailure.lastSuccessfulCheckAtMs).toBe(afterDrift.lastSuccessfulCheckAtMs)
    } finally { db.close() }
  })

  it('withdraws a candidate only after a successful complete empty listing', async () => {
    const db = database()
    let now = 1_000
    try {
      const first = new CloudRulesCandidateRefreshV1({ db,
        fetchImpl: listingFetcher([[release('1.0.0')]], [document('1.0.0')]), nowMs: () => now, refreshCadenceMs: 1 })
      await first.refreshIfDue()
      now = 2_000
      const second = new CloudRulesCandidateRefreshV1({ db,
        fetchImpl: listingFetcher([[]], []), nowMs: () => now, refreshCadenceMs: 1 })
      const result = await second.refreshIfDue()
      expect(result).toMatchObject({ ok: true, status: 'refreshed' })
      expect(result.ok && result.state.candidate).toBeNull()
      expect(result.ok && result.state.latestObserved).toBeNull()
    } finally { db.close() }
  })

  it('coalesces concurrent refreshes, honors timeout, and stops scheduled work on dispose', async () => {
    const db = database()
    const pending = {} as { resolve?: (response: Response) => void }
    const pendingFetcher = vi.fn(() => new Promise<Response>((resolve) => { pending.resolve = resolve }))
    try {
      const refresher = new CloudRulesCandidateRefreshV1({ db, fetchImpl: pendingFetcher, timeoutMs: 50 })
      const first = refresher.refreshIfDue()
      const second = refresher.refreshIfDue()
      expect(first).toBe(second)
      pending.resolve?.(jsonResponse([]))
      await expect(first).resolves.toMatchObject({ ok: true, status: 'refreshed' })
      await refresher.dispose()
    } finally { db.close() }

    const timeoutDb = database()
    const timeoutFetcher = vi.fn((_input: string | URL | Request, init?: RequestInit) =>
      new Promise<Response>((_resolve, reject) => {
        init?.signal?.addEventListener('abort', () => reject(new DOMException('aborted', 'AbortError')), { once: true })
      }))
    try {
      await expect(new CloudRulesCandidateRefreshV1({ db: timeoutDb, fetchImpl: timeoutFetcher,
        timeoutMs: 5 }).refreshIfDue()).resolves.toEqual({ ok: false, status: 'failed',
        code: 'CLOUD_RULES_TIMEOUT' })
    } finally { timeoutDb.close() }

    vi.useFakeTimers()
    const scheduledDb = database()
    const scheduledFetcher = vi.fn(async () => jsonResponse([]))
    try {
      const scheduled = new CloudRulesCandidateRefreshV1({ db: scheduledDb, fetchImpl: scheduledFetcher,
        refreshCadenceMs: 100, timeoutMs: 1_000 })
      await scheduled.start()
      expect(scheduledFetcher).toHaveBeenCalledTimes(1)
      await vi.advanceTimersByTimeAsync(100)
      expect(scheduledFetcher).toHaveBeenCalledTimes(2)
      await scheduled.dispose()
      await vi.advanceTimersByTimeAsync(500)
      expect(scheduledFetcher).toHaveBeenCalledTimes(2)
    } finally {
      scheduledDb.close()
      vi.useRealTimers()
    }
  })
})
