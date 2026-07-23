import BetterSqlite3 from 'better-sqlite3'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import { applyGenerationV2SchemaForTest } from '../../infra/db/v2/testSchemaV2'
import { GenerationV2Identity } from '../../src/next/generation-v2/domain/identityV2'
import { readVerifiedOpenAIResponsesEndpointProfileV2 } from '../../src/next/generation-v2/providers/openai-responses/verifiedEndpointProfileV2'

const mocks = vi.hoisted(() => ({ fetch: vi.fn(), leases: new WeakSet<object>() }))
vi.mock('electron', () => ({ session: { defaultSession: { fetch: mocks.fetch } } }))
vi.mock('../credentials/epoch2RuntimeCredentialService', () => ({
  isEpoch2RuntimeCredentialLease: (value: unknown) => Boolean(value && typeof value === 'object' && mocks.leases.has(value)),
}))

import {
  createOpenAIResponsesModelEvidenceV2Service,
  isVerifiedOpenAIResponsesModelEvidenceV2,
} from './openAIResponsesModelEvidenceV2Service'

const endpointProfile = readVerifiedOpenAIResponsesEndpointProfileV2()
const scope = 'credential-scope-v2:'.concat('b'.repeat(64)) as never
const modelId = GenerationV2Identity.create('model_id', 'gpt-5.6-sol')

function body(ids = ['gpt-5.6-sol', 'gpt-5.6-terra']): string {
  return JSON.stringify({ object: 'list', data: ids.map((id, index) => ({
    id, object: 'model', created: index + 1, owned_by: 'openai',
  })) })
}

function response(value: string, init: Readonly<{ status?: number; url?: string }> = {}): Response {
  const base = new Response(value, { status: init.status ?? 200, headers: { 'content-type': 'application/json' } })
  return Object.freeze({
    status: init.status ?? 200,
    url: init.url ?? 'https://api.openai.com/v1/models',
    headers: base.headers,
    body: base.body,
  }) as unknown as Response
}

function credentialService() {
  return {
    withCredential: async ({ consume }: { consume: (lease: never) => Promise<unknown> }) => {
      const active = { value: true }
      const lease = Object.freeze({
        trust: 'epoch2_runtime_credential_lease', usage: 'provider_transport_only',
        providerKey: 'openai_responses', credential: 'sk-test', revision: 1,
        credentialScopeId: scope,
        assertCurrent: () => { if (!active.value) throw new Error('stale credential') },
      })
      mocks.leases.add(lease)
      try { return await consume(lease as never) } finally {
        active.value = false
        mocks.leases.delete(lease)
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

describe('OpenAI Responses model evidence V2 service', () => {
  it('persists one exact bodyless Models response and issues a short-lived exact capability authority', async () => {
    const db = database()
    try {
      mocks.fetch.mockResolvedValue(response(body()))
      const service = createOpenAIResponsesModelEvidenceV2Service({ db, credentialService: credentialService(), nowMs: () => 100 })
      let captured: unknown
      await expect(service.withRefreshedExactModelEvidence({
        expectedCredentialRevision: 1, expectedCredentialScopeId: scope,
        endpointProfile, modelId,
        consume: (evidence) => {
          captured = evidence
          expect(isVerifiedOpenAIResponsesModelEvidenceV2(evidence)).toBe(true)
          expect(evidence.modelCapability.capability.reasoningEfforts).toContain('max')
          expect(evidence.modelCapability.capability.maxOutputTokens).toBe(128000)
          evidence.assertCurrent()
          return evidence.rowGeneration
        },
      })).resolves.toBe(1)
      expect(isVerifiedOpenAIResponsesModelEvidenceV2(captured)).toBe(false)
      expect(mocks.fetch).toHaveBeenCalledWith('https://api.openai.com/v1/models', expect.objectContaining({
        method: 'GET', redirect: 'error', credentials: 'omit', cache: 'no-store',
        headers: { Accept: 'application/json', Authorization: 'Bearer sk-test' },
      }))
      expect((mocks.fetch.mock.calls[0]?.[1] as RequestInit).body).toBeUndefined()
      expect(db.prepare('SELECT row_generation, observed_at_ms FROM openai_responses_model_evidence_sets').get())
        .toEqual({ row_generation: 1, observed_at_ms: 100 })
    } finally { db.close() }
  })

  it('accepts Electron session.fetch responses that omit Response.url', async () => {
    const db = database()
    try {
      mocks.fetch.mockResolvedValue(response(body(), { url: '' }))
      const service = createOpenAIResponsesModelEvidenceV2Service({ db, credentialService: credentialService(), nowMs: () => 100 })
      await expect(service.refresh({ expectedCredentialRevision: 1, expectedCredentialScopeId: scope, endpointProfile }))
        .resolves.toMatchObject({ rowGeneration: 1, modelCount: 2 })
    } finally { db.close() }
  })

  it('persists visibility but rejects an exact visible model without official capability evidence', async () => {
    const db = database()
    try {
      mocks.fetch.mockResolvedValue(response(body(['gpt-unknown-visible'])))
      const service = createOpenAIResponsesModelEvidenceV2Service({ db, credentialService: credentialService(), nowMs: () => 100 })
      await expect(service.withRefreshedExactModelEvidence({
        expectedCredentialRevision: 1, expectedCredentialScopeId: scope, endpointProfile,
        modelId: GenerationV2Identity.create('model_id', 'gpt-unknown-visible'), consume: () => undefined,
      })).rejects.toThrow('GENERATION_V2_OPENAI_MODEL_EVIDENCE_CAPABILITY_UNAVAILABLE')
      expect(db.prepare('SELECT row_generation FROM openai_responses_model_evidence_sets').get())
        .toEqual({ row_generation: 1 })
    } finally { db.close() }
  })

  it('retains the last complete evidence generation across malformed and HTTP failures', async () => {
    const db = database()
    try {
      const service = createOpenAIResponsesModelEvidenceV2Service({ db, credentialService: credentialService(), nowMs: () => 100 })
      mocks.fetch.mockResolvedValueOnce(response(body()))
      await service.refresh({ expectedCredentialRevision: 1, expectedCredentialScopeId: scope, endpointProfile })
      const before = db.prepare('SELECT row_generation, response_digest FROM openai_responses_model_evidence_sets').get()
      for (const failed of [response('{}'), response(body(), { status: 401 }), response(body(), { url: 'https://api.openai.com/models' })]) {
        mocks.fetch.mockResolvedValueOnce(failed)
        await expect(service.refresh({ expectedCredentialRevision: 1, expectedCredentialScopeId: scope, endpointProfile })).rejects.toThrow()
        expect(db.prepare('SELECT row_generation, response_digest FROM openai_responses_model_evidence_sets').get()).toEqual(before)
      }
    } finally { db.close() }
  })
})
