import BetterSqlite3 from 'better-sqlite3'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { applyGenerationV2SchemaForTest } from '../../infra/db/v2/testSchemaV2'
import { GenerationV2Identity } from '../../src/next/generation-v2/domain/identityV2'
import { readVerifiedDeepSeekStableEndpointProfileV2 } from '../../src/next/generation-v2/providers/deepseek/stableEndpointProfileV2'

const mocks = vi.hoisted(() => ({
  fetch: vi.fn(),
  leases: new WeakSet<object>(),
  scopes: new WeakSet<object>(),
}))

vi.mock('electron', () => ({ session: { defaultSession: { fetch: mocks.fetch } } }))
vi.mock('../credentials/epoch2RuntimeCredentialService', () => ({
  isEpoch2RuntimeCredentialLease: (value: unknown) =>
    Boolean(value && typeof value === 'object' && mocks.leases.has(value)),
  isEpoch2CredentialScopeBindingAuthority: (value: unknown) =>
    Boolean(value && typeof value === 'object' && mocks.scopes.has(value)),
}))

import {
  createDeepSeekStableModelEvidenceV2Service,
  isVerifiedDeepSeekStableModelEvidenceV2,
} from './deepSeekStableModelEvidenceV2Service'

const profile = readVerifiedDeepSeekStableEndpointProfileV2()
const scope = 'credential-scope-v2:'.concat('a'.repeat(64)) as never
const model = GenerationV2Identity.create('model_id', 'deepseek-v4-pro')

function modelResponse(ids = ['deepseek-v4-pro', 'deepseek-v4-flash']): string {
  return JSON.stringify({
    object: 'list',
    data: ids.map((id) => ({ id, object: 'model', owned_by: 'deepseek' })),
  })
}

function response(body: string, init: Readonly<{ status?: number; url?: string; contentType?: string }> = {}): Response {
  const base = new Response(body, {
    status: init.status ?? 200,
    headers: { 'content-type': init.contentType ?? 'application/json' },
  })
  return Object.freeze({
    status: init.status ?? 200,
    url: init.url ?? 'https://api.deepseek.com/models',
    headers: base.headers,
    body: base.body,
  }) as unknown as Response
}

function credentialService(options: Readonly<{ forgedLease?: boolean; failLeaseFenceAfter?: number }> = {}) {
  return {
    withCredential: async ({ consume }: { consume: (lease: never) => Promise<unknown> }) => {
      const active = { value: true }
      let fenceCalls = 0
      const lease = Object.freeze({
        trust: 'epoch2_runtime_credential_lease',
        usage: 'provider_transport_only',
        providerKey: 'deepseek',
        credential: 'sk-test',
        revision: 1,
        credentialScopeId: scope,
        assertCurrent: () => {
          fenceCalls += 1
          if (!active.value || (options.failLeaseFenceAfter !== undefined &&
              fenceCalls > options.failLeaseFenceAfter)) throw new Error('stale credential')
        },
      })
      if (!options.forgedLease) mocks.leases.add(lease)
      try {
        const result = await consume(lease as never)
        lease.assertCurrent()
        return result
      } finally {
        active.value = false
        mocks.leases.delete(lease)
      }
    },
    withCredentialScopeBindingAuthority: async ({ consume, expectedCredentialScopeId }: {
      consume: (authority: never) => Promise<unknown>
      expectedCredentialScopeId: string
    }) => {
      const active = { value: true }
      const authority = Object.freeze({
        trust: 'epoch2_credential_scope_binding_authority',
        usage: 'provider_binding_snapshot_only',
        providerKey: 'deepseek',
        revision: 1,
        credentialScopeId: expectedCredentialScopeId,
        assertCurrent: () => { if (!active.value) throw new Error('stale scope') },
      })
      mocks.scopes.add(authority)
      try {
        const result = await consume(authority as never)
        authority.assertCurrent()
        return result
      } finally {
        active.value = false
        mocks.scopes.delete(authority)
      }
    },
  } as never
}

function database(): BetterSqlite3.Database {
  const db = new BetterSqlite3(':memory:')
  applyGenerationV2SchemaForTest(db, process.cwd())
  return db
}

beforeEach(() => mocks.fetch.mockReset())
afterEach(() => vi.useRealTimers())

describe('DeepSeek stable model evidence V2 service', () => {
  it('commits only an exact bodyless stable Models 200 response under a live credential lease', async () => {
    const db = database()
    try {
      mocks.fetch.mockResolvedValue(response(modelResponse()))
      const service = createDeepSeekStableModelEvidenceV2Service({
        db, credentialService: credentialService(), nowMs: () => 100,
      })
      expect(Object.keys(service).sort()).toEqual(['refresh', 'withRefreshedExactModelEvidence'])
      await expect(service.refresh({
        expectedCredentialRevision: 1, expectedCredentialScopeId: scope, endpointProfile: profile,
      })).resolves.toEqual({ rowGeneration: 1, observedAtMs: 100, modelCount: 2 })
      expect(mocks.fetch).toHaveBeenCalledWith('https://api.deepseek.com/models', expect.objectContaining({
        method: 'GET', redirect: 'error', credentials: 'omit', cache: 'no-store',
        headers: { Accept: 'application/json', Authorization: 'Bearer sk-test' },
      }))
      const init = mocks.fetch.mock.calls[0]?.[1] as RequestInit
      expect(init.body).toBeUndefined()
      expect(db.prepare('SELECT row_generation, observed_at_ms FROM deepseek_stable_model_evidence_sets').get())
        .toEqual({ row_generation: 1, observed_at_ms: 100 })
    } finally { db.close() }
  })

  it('accepts Electron session.fetch responses that omit Response.url', async () => {
    const db = database()
    try {
      mocks.fetch.mockResolvedValue(response(modelResponse(), { url: '' }))
      const service = createDeepSeekStableModelEvidenceV2Service({ db, credentialService: credentialService(), nowMs: () => 100 })
      await expect(service.refresh({ expectedCredentialRevision: 1, expectedCredentialScopeId: scope, endpointProfile: profile }))
        .resolves.toMatchObject({ rowGeneration: 1, modelCount: 2 })
    } finally { db.close() }
  })

  it('preserves the last complete success across HTTP, endpoint, decode and premature-body failures', async () => {
    const db = database()
    try {
      const service = createDeepSeekStableModelEvidenceV2Service({
        db, credentialService: credentialService(), nowMs: () => 100,
      })
      mocks.fetch.mockResolvedValueOnce(response(modelResponse()))
      await service.refresh({ expectedCredentialRevision: 1, expectedCredentialScopeId: scope, endpointProfile: profile })
      const before = db.prepare('SELECT row_generation, response_digest FROM deepseek_stable_model_evidence_sets').get()

      for (const failed of [
        response('{}', { status: 401 }),
        response(modelResponse(), { url: 'https://api.deepseek.com/v1/models' }),
        response('{'),
        response(modelResponse(), { contentType: 'text/plain' }),
      ]) {
        mocks.fetch.mockResolvedValueOnce(failed)
        await expect(service.refresh({
          expectedCredentialRevision: 1, expectedCredentialScopeId: scope, endpointProfile: profile,
        })).rejects.toThrow()
        expect(db.prepare('SELECT row_generation, response_digest FROM deepseek_stable_model_evidence_sets').get())
          .toEqual(before)
      }

      const stream = new ReadableStream<Uint8Array>({
        start(controller) {
          controller.enqueue(new TextEncoder().encode('{"object":"list",'))
          controller.error(new Error('premature eof'))
        },
      })
      mocks.fetch.mockResolvedValueOnce(Object.freeze({
        status: 200,
        url: 'https://api.deepseek.com/models',
        headers: new Headers({ 'content-type': 'application/json' }),
        body: stream,
      }))
      await expect(service.refresh({
        expectedCredentialRevision: 1, expectedCredentialScopeId: scope, endpointProfile: profile,
      })).rejects.toThrow('GENERATION_V2_DEEPSEEK_MODEL_EVIDENCE_RESPONSE_INCOMPLETE')
      expect(db.prepare('SELECT row_generation, response_digest FROM deepseek_stable_model_evidence_sets').get())
        .toEqual(before)

      const compressed = response(modelResponse()) as unknown as {
        status: number; url: string; headers: Headers; body: ReadableStream<Uint8Array>
      }
      compressed.headers.set('content-encoding', 'gzip')
      compressed.headers.set('content-length', '7')
      mocks.fetch.mockResolvedValueOnce(compressed)
      await expect(service.refresh({
        expectedCredentialRevision: 1, expectedCredentialScopeId: scope, endpointProfile: profile,
      })).resolves.toMatchObject({ rowGeneration: 2 })
      const afterCompressed = db.prepare(
        'SELECT row_generation, response_digest FROM deepseek_stable_model_evidence_sets',
      ).get()

      const short = response(modelResponse()) as unknown as {
        status: number; url: string; headers: Headers; body: ReadableStream<Uint8Array>
      }
      short.headers.set('content-length', String(modelResponse().length + 1))
      mocks.fetch.mockResolvedValueOnce(short)
      await expect(service.refresh({
        expectedCredentialRevision: 1, expectedCredentialScopeId: scope, endpointProfile: profile,
      })).rejects.toThrow('GENERATION_V2_DEEPSEEK_MODEL_EVIDENCE_RESPONSE_INCOMPLETE')
      expect(db.prepare('SELECT row_generation, response_digest FROM deepseek_stable_model_evidence_sets').get())
        .toEqual(afterCompressed)
    } finally { db.close() }
  })

  it('issues short-lived exact-model evidence only from the response refreshed in the same credential lease', async () => {
    const db = database()
    try {
      mocks.fetch.mockImplementation(async () => response(modelResponse()))
      const service = createDeepSeekStableModelEvidenceV2Service({
        db, credentialService: credentialService(), nowMs: () => 100,
      })
      let captured: unknown
      await expect(service.withRefreshedExactModelEvidence({
        expectedCredentialRevision: 1,
        expectedCredentialScopeId: scope,
        endpointProfile: profile,
        modelId: model,
        consume: (evidence) => {
          captured = evidence
          expect(isVerifiedDeepSeekStableModelEvidenceV2(evidence)).toBe(true)
          expect(evidence.credentialScopeId.value).toBe(scope)
          expect(evidence.modelId.value).toBe('deepseek-v4-pro')
          expect(evidence.executionAuthority).toBe('none')
          evidence.assertCurrent()
          return evidence.rowGeneration
        },
      })).resolves.toBe(1)
      expect(isVerifiedDeepSeekStableModelEvidenceV2(captured)).toBe(false)
      expect(() => (captured as { assertCurrent(): void }).assertCurrent())
        .toThrow('GENERATION_V2_DEEPSEEK_MODEL_EVIDENCE_CAS_CONFLICT')

      mocks.fetch.mockResolvedValueOnce(response(modelResponse([])))
      await expect(service.withRefreshedExactModelEvidence({
        expectedCredentialRevision: 1, expectedCredentialScopeId: scope,
        endpointProfile: profile, modelId: model, consume: () => undefined,
      })).rejects.toThrow('GENERATION_V2_DEEPSEEK_MODEL_EVIDENCE_MODEL_MISSING')
      expect(db.prepare('SELECT row_generation FROM deepseek_stable_model_evidence_sets').get())
        .toEqual({ row_generation: 2 })
    } finally { db.close() }
  })

  it('rejects a forged credential lease before network or database mutation', async () => {
    const db = database()
    try {
      const service = createDeepSeekStableModelEvidenceV2Service({
        db, credentialService: credentialService({ forgedLease: true }), nowMs: () => 100,
      })
      await expect(service.refresh({
        expectedCredentialRevision: 1, expectedCredentialScopeId: scope, endpointProfile: profile,
      })).rejects.toThrow('GENERATION_V2_DEEPSEEK_MODEL_EVIDENCE_INPUT_INVALID')
      expect(mocks.fetch).not.toHaveBeenCalled()
      expect(db.prepare('SELECT count(*) AS count FROM deepseek_stable_model_evidence_sets').get())
        .toEqual({ count: 0 })
    } finally { db.close() }
  })

  it('rolls back row and generation clock when the credential fence expires inside commit', async () => {
    const db = database()
    try {
      mocks.fetch.mockResolvedValue(response(modelResponse()))
      const service = createDeepSeekStableModelEvidenceV2Service({
        db,
        credentialService: credentialService({ failLeaseFenceAfter: 2 }),
        nowMs: () => 100,
      })
      await expect(service.refresh({
        expectedCredentialRevision: 1, expectedCredentialScopeId: scope, endpointProfile: profile,
      })).rejects.toThrow('stale credential')
      expect(db.prepare('SELECT count(*) AS count FROM deepseek_stable_model_evidence_sets').get())
        .toEqual({ count: 0 })
      expect(db.prepare('SELECT count(*) AS count FROM deepseek_stable_model_evidence_generation_clock').get())
        .toEqual({ count: 0 })
    } finally { db.close() }
  })

  it('enforces an internal deadline for fetch and body stalls and releases the credential callback', async () => {
    vi.useFakeTimers()
    const db = database()
    try {
      const service = createDeepSeekStableModelEvidenceV2Service({
        db, credentialService: credentialService(), nowMs: () => 100,
      })
      mocks.fetch.mockImplementationOnce((_url: string, init: RequestInit) => new Promise((_resolve, reject) => {
        init.signal?.addEventListener('abort', () => reject(new Error('aborted')), { once: true })
      }))
      const fetchStall = service.refresh({
        expectedCredentialRevision: 1, expectedCredentialScopeId: scope, endpointProfile: profile,
      })
      const fetchStallAssertion = expect(fetchStall)
        .rejects.toThrow('GENERATION_V2_DEEPSEEK_MODEL_EVIDENCE_TRANSPORT_FAILED')
      await vi.advanceTimersByTimeAsync(30_000)
      await fetchStallAssertion

      let bodyCancelled = false
      const hangingBody = new ReadableStream<Uint8Array>({
        cancel() { bodyCancelled = true },
      })
      mocks.fetch.mockResolvedValueOnce(Object.freeze({
        status: 200,
        url: 'https://api.deepseek.com/models',
        headers: new Headers({ 'content-type': 'application/json' }),
        body: hangingBody,
      }))
      const bodyStall = service.refresh({
        expectedCredentialRevision: 1, expectedCredentialScopeId: scope, endpointProfile: profile,
      })
      const bodyStallAssertion = expect(bodyStall)
        .rejects.toThrow('GENERATION_V2_DEEPSEEK_MODEL_EVIDENCE_TRANSPORT_FAILED')
      await vi.advanceTimersByTimeAsync(30_000)
      await bodyStallAssertion
      expect(bodyCancelled).toBe(true)
      expect(db.prepare('SELECT count(*) AS count FROM deepseek_stable_model_evidence_sets').get())
        .toEqual({ count: 0 })
    } finally { db.close() }
  })

  it('stores a complete empty list and refuses to repair corrupt current provenance', async () => {
    const db = database()
    let now = 100
    try {
      const service = createDeepSeekStableModelEvidenceV2Service({
        db, credentialService: credentialService(), nowMs: () => now,
      })
      mocks.fetch.mockResolvedValueOnce(response(modelResponse()))
      await service.refresh({ expectedCredentialRevision: 1, expectedCredentialScopeId: scope, endpointProfile: profile })
      db.prepare("UPDATE deepseek_stable_model_evidence_sets SET endpoint_set_revision = 'corrupt'").run()
      now = 200
      mocks.fetch.mockResolvedValueOnce(response(modelResponse([])))
      await expect(service.refresh({
        expectedCredentialRevision: 1, expectedCredentialScopeId: scope, endpointProfile: profile,
      })).rejects.toThrow('GENERATION_V2_DEEPSEEK_MODEL_EVIDENCE_STATE_INVALID')
      expect(db.prepare('SELECT endpoint_set_revision, row_generation FROM deepseek_stable_model_evidence_sets').get())
        .toEqual({ endpoint_set_revision: 'corrupt', row_generation: 1 })
    } finally { db.close() }
  })
})
