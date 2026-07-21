import BetterSqlite3 from 'better-sqlite3'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import { applyGenerationV2SchemaForTest } from '../../infra/db/v2/testSchemaV2'
import { GenerationV2Identity } from '../../src/next/generation-v2/domain/identityV2'
import { readVerifiedAnthropicEndpointProfileV2 } from '../../src/next/generation-v2/providers/anthropic/verifiedEndpointProfileV2'

const mocks = vi.hoisted(() => ({ fetch: vi.fn(), leases: new WeakSet<object>() }))
vi.mock('electron', () => ({ session: { defaultSession: { fetch: mocks.fetch } } }))
vi.mock('../credentials/epoch2RuntimeCredentialService', () => ({
  isEpoch2RuntimeCredentialLease: (value: unknown) => Boolean(value && typeof value === 'object' && mocks.leases.has(value)),
}))

import {
  createAnthropicModelEvidenceV2Service,
  isVerifiedAnthropicModelEvidenceV2,
} from './anthropicModelEvidenceV2Service'

const endpointProfile = readVerifiedAnthropicEndpointProfileV2()
const scope = 'credential-scope-v2:'.concat('a'.repeat(64)) as never
const modelId = GenerationV2Identity.create('model_id', 'claude-opus-4-6')
const url = 'https://api.anthropic.com/v1/models/claude-opus-4-6'

function body(id = modelId.value): string {
  return JSON.stringify({
    id,
    type: 'model',
    display_name: 'Claude Opus 4.6',
    created_at: '2026-02-04T00:00:00Z',
    max_input_tokens: 1_000_000,
    max_tokens: 128_000,
    capabilities: {
      batch: { supported: true },
      citations: { supported: true },
      code_execution: { supported: true },
      context_management: {
        clear_thinking_20251015: { supported: true },
        clear_tool_uses_20250919: { supported: true },
        compact_20260112: { supported: true },
        supported: true,
      },
      effort: {
        high: { supported: true },
        low: { supported: true },
        max: { supported: false },
        medium: { supported: true },
        supported: true,
        xhigh: { supported: false },
      },
      image_input: { supported: true },
      pdf_input: { supported: true },
      structured_outputs: { supported: true },
      thinking: {
        supported: true,
        types: {
          adaptive: { supported: true },
          enabled: { supported: true },
        },
      },
    },
  })
}

function response(value: string, init: Readonly<{ status?: number; url?: string }> = {}): Response {
  const base = new Response(value, {
    status: init.status ?? 200,
    headers: { 'content-type': 'application/json' },
  })
  return Object.freeze({
    status: init.status ?? 200,
    url: init.url ?? url,
    headers: base.headers,
    body: base.body,
  }) as unknown as Response
}

function credentialService() {
  return {
    withCredential: async ({
      providerKey, expectedRevision, expectedCredentialScopeId, consume,
    }: {
      providerKey: string
      expectedRevision: number
      expectedCredentialScopeId: string
      consume: (lease: never) => Promise<unknown>
    }) => {
      expect(providerKey).toBe('anthropic')
      expect(expectedRevision).toBe(7)
      expect(expectedCredentialScopeId).toBe(scope)
      const active = { value: true }
      const lease = Object.freeze({
        trust: 'epoch2_runtime_credential_lease',
        usage: 'provider_transport_only',
        providerKey: 'anthropic',
        credential: 'sk-ant-test',
        revision: 7,
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

describe('Anthropic exact model evidence V2 service', () => {
  it('GETs the exact reviewed endpoint with native auth/version headers and exposes short-lived evidence', async () => {
    const db = database()
    try {
      mocks.fetch.mockResolvedValue(response(body()))
      const service = createAnthropicModelEvidenceV2Service({ db, credentialService: credentialService(), nowMs: () => 100 })
      let captured: unknown
      await expect(service.withRefreshedExactModelEvidence({
        expectedCredentialRevision: 7,
        expectedCredentialScopeId: scope,
        endpointProfile,
        modelId,
        consume: (evidence) => {
          captured = evidence
          expect(isVerifiedAnthropicModelEvidenceV2(evidence)).toBe(true)
          expect(evidence).toMatchObject({
            credentialRevision: 7,
            displayName: 'Claude Opus 4.6',
            createdAt: '2026-02-04T00:00:00Z',
            maxInputTokens: 1_000_000,
            maxTokens: 128_000,
            supportedThinkingTypes: ['adaptive', 'enabled'],
            supportedEfforts: ['low', 'medium', 'high'],
            rowGeneration: 1,
          })
          expect(evidence.capabilities.context_management.compact_20260112.supported).toBe(true)
          evidence.assertCurrent()
          return evidence.modelId.value
        },
      })).resolves.toBe(modelId.value)
      expect(isVerifiedAnthropicModelEvidenceV2(captured)).toBe(false)
      expect(mocks.fetch).toHaveBeenCalledWith(url, expect.objectContaining({
        method: 'GET',
        redirect: 'error',
        credentials: 'omit',
        cache: 'no-store',
        headers: {
          Accept: 'application/json',
          'x-api-key': 'sk-ant-test',
          'anthropic-version': '2023-06-01',
        },
      }))
      expect((mocks.fetch.mock.calls[0]?.[1] as RequestInit).body).toBeUndefined()
      expect(db.prepare(`SELECT model_id, row_generation, observed_at_ms
        FROM anthropic_model_evidence_sets`).get()).toEqual({
        model_id: modelId.value,
        row_generation: 1,
        observed_at_ms: 100,
      })
    } finally { db.close() }
  })

  it('rejects a non-exact model response without persisting evidence or a clock', async () => {
    const db = database()
    try {
      mocks.fetch.mockResolvedValue(response(body('claude-sonnet-4-6')))
      const service = createAnthropicModelEvidenceV2Service({ db, credentialService: credentialService(), nowMs: () => 100 })
      await expect(service.withRefreshedExactModelEvidence({
        expectedCredentialRevision: 7,
        expectedCredentialScopeId: scope,
        endpointProfile,
        modelId,
        consume: () => undefined,
      })).rejects.toThrow('GENERATION_V2_ANTHROPIC_MODEL_EVIDENCE_MODEL_MISMATCH')
      expect(db.prepare('SELECT count(*) AS count FROM anthropic_model_evidence_sets').get()).toEqual({ count: 0 })
      expect(db.prepare('SELECT count(*) AS count FROM anthropic_model_evidence_generation_clock').get()).toEqual({ count: 0 })
    } finally { db.close() }
  })

  it('retains the previous complete generation across malformed, redirect and HTTP failures', async () => {
    const db = database()
    try {
      const service = createAnthropicModelEvidenceV2Service({ db, credentialService: credentialService(), nowMs: () => 100 })
      mocks.fetch.mockResolvedValueOnce(response(body()))
      await service.withRefreshedExactModelEvidence({
        expectedCredentialRevision: 7,
        expectedCredentialScopeId: scope,
        endpointProfile,
        modelId,
        consume: () => undefined,
      })
      const before = db.prepare(`SELECT row_generation, response_digest
        FROM anthropic_model_evidence_sets`).get()
      const failures = [
        response('{}'),
        response(body(), { status: 401 }),
        response(body(), { url: 'https://api.anthropic.com/v1/models/other' }),
      ]
      for (const failed of failures) {
        mocks.fetch.mockResolvedValueOnce(failed)
        await expect(service.withRefreshedExactModelEvidence({
          expectedCredentialRevision: 7,
          expectedCredentialScopeId: scope,
          endpointProfile,
          modelId,
          consume: () => undefined,
        })).rejects.toThrow()
        expect(db.prepare(`SELECT row_generation, response_digest
          FROM anthropic_model_evidence_sets`).get()).toEqual(before)
      }
    } finally { db.close() }
  })
})
