import BetterSqlite3 from 'better-sqlite3'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { applyGenerationV2SchemaForTest } from '../../infra/db/v2/testSchemaV2'
import { AttachmentAssetV2Repo } from '../../infra/db/repo/attachmentAssetV2Repo'
import { GenerationConfigV2Repo } from '../../infra/db/repo/generationConfigV2Repo'
import { withSynchronousGenerationCommandFactsAuthorityV2 } from '../../infra/db/repo/generationCommandFactsAuthorityV2'
import { runGenerationV2AuthorityTransactionOnOwnedConnectionV2 } from '../../infra/db/repo/generationV2AuthorityTransactionInternal'
import { RUNTIME_CAPABILITY_SEMANTIC_PATHS_V2 } from '../../src/next/generation-v2/capability/runtimeCapabilitySnapshotV2'
import { GenerationV2Identity } from '../../src/next/generation-v2/domain/identityV2'
import { readVerifiedOpenAIResponsesEndpointProfileV2 } from '../../src/next/generation-v2/providers/openai-responses/verifiedEndpointProfileV2'

const mocks = vi.hoisted(() => ({ fetch: vi.fn(), leases: new WeakSet<object>() }))
vi.mock('electron', () => ({ session: { defaultSession: { fetch: mocks.fetch } } }))
vi.mock('../credentials/epoch2RuntimeCredentialService', () => ({
  isEpoch2RuntimeCredentialLease: (value: unknown) => Boolean(value && typeof value === 'object' && mocks.leases.has(value)),
}))

import { createOpenAIResponsesModelEvidenceV2Service } from './openAIResponsesModelEvidenceV2Service'
import {
  isVerifiedOpenAIResponsesProviderBindingAuthorityV2,
  isVerifiedOpenAIResponsesRuntimeCapabilityAuthorityV2,
  withVerifiedOpenAIResponsesGenerationAuthoritiesV2,
  type VerifiedOpenAIResponsesProviderBindingAuthorityV2,
  type VerifiedOpenAIResponsesRuntimeCapabilityAuthorityV2,
} from './openAIResponsesGenerationAuthorityV2Service'

const endpointProfile = readVerifiedOpenAIResponsesEndpointProfileV2()
const scope = 'credential-scope-v2:'.concat('c'.repeat(64)) as never
const modelId = GenerationV2Identity.create('model_id', 'gpt-5.6-sol')

function response(): Response {
  const value = new Response(JSON.stringify({
    object: 'list', data: [{ id: modelId.value, object: 'model', created: 1, owned_by: 'openai' }],
  }), { status: 200, headers: { 'content-type': 'application/json' } })
  return Object.freeze({ status: 200, url: 'https://api.openai.com/v1/models', headers: value.headers, body: value.body }) as unknown as Response
}

function credentialService() {
  return {
    withCredential: async ({ consume }: { consume: (lease: never) => Promise<unknown> }) => {
      const active = { value: true }
      const lease = Object.freeze({
        trust: 'epoch2_runtime_credential_lease', usage: 'provider_transport_only',
        providerKey: 'openai_responses', credential: 'sk-test', revision: 1, credentialScopeId: scope,
        assertCurrent: () => { if (!active.value) throw new Error('stale credential') },
      })
      mocks.leases.add(lease)
      try { return await consume(lease as never) } finally { active.value = false; mocks.leases.delete(lease) }
    },
  } as never
}

function database() {
  const db = new BetterSqlite3(':memory:')
  applyGenerationV2SchemaForTest(db, process.cwd())
  db.prepare('INSERT INTO project_v2 VALUES (?, ?, ?, ?)').run('project:1', 'Project', 1, 1)
  db.prepare('INSERT INTO conversation_v2 VALUES (?, ?, ?, ?, ?)').run('conversation:1', 'project:1', 'Conversation', 2, 2)
  return db
}

async function issue<T>(db: BetterSqlite3.Database, use: (value: Readonly<{
  binding: VerifiedOpenAIResponsesProviderBindingAuthorityV2
  capability: VerifiedOpenAIResponsesRuntimeCapabilityAuthorityV2
}>) => T): Promise<T> {
  mocks.fetch.mockResolvedValueOnce(response())
  const modelService = createOpenAIResponsesModelEvidenceV2Service({ db, credentialService: credentialService(), nowMs: () => 100 })
  return modelService.withRefreshedExactModelEvidence({
    expectedCredentialRevision: 1, expectedCredentialScopeId: scope, endpointProfile, modelId,
    consume: (modelEvidence) => runGenerationV2AuthorityTransactionOnOwnedConnectionV2(db, (context) =>
      withSynchronousGenerationCommandFactsAuthorityV2(
        context, new GenerationConfigV2Repo(db), new AttachmentAssetV2Repo(db),
        'conversation:1', [], undefined,
        (commandFacts) => withVerifiedOpenAIResponsesGenerationAuthoritiesV2({
          context, modelEvidence, commandFacts, toolRegistry: null, operation: 'text', use: use as never,
        }),
      )),
  }) as Promise<T>
}

beforeEach(() => {
  mocks.fetch.mockReset()
  vi.spyOn(Date, 'now').mockReturnValue(Date.parse('2026-07-17T12:00:00.000Z'))
})
afterEach(() => vi.restoreAllMocks())

describe('OpenAI Responses generation authority V2', () => {
  it('issues one transaction-scoped exact binding and complete capability snapshot', async () => {
    const db = database()
    try {
      let escaped: VerifiedOpenAIResponsesRuntimeCapabilityAuthorityV2 | undefined
      await expect(issue(db, ({ binding, capability }) => {
        escaped = capability
        expect(isVerifiedOpenAIResponsesProviderBindingAuthorityV2(binding)).toBe(true)
        expect(isVerifiedOpenAIResponsesRuntimeCapabilityAuthorityV2(capability)).toBe(true)
        expect(binding.binding).toMatchObject({
          providerId: { value: 'openai_responses' }, endpointProfileId: { value: 'openai-api-v1' },
          modelId: { value: 'gpt-5.6-sol' }, operation: 'text',
        })
        expect(capability.snapshot.fields).toHaveLength(RUNTIME_CAPABILITY_SEMANTIC_PATHS_V2.length)
        expect(capability.snapshot.continuation).toMatchObject({
          kind: 'client_managed_native_replay', supportsBranchReplay: true, supportsRestartReplay: true,
        })
        const fields = new Map(capability.snapshot.fields.map((field) => [field.path, field]))
        expect(fields.get('generation.maxOutputTokens')).toMatchObject({ state: 'supported', domain: { max: 128000 } })
        expect(fields.get('generation.temperature')).toMatchObject({ state: 'unavailable' })
        expect(fields.get('providerExtension.serviceTier')).toMatchObject({ state: 'supported' })
        return binding.modelEvidenceRevision
      })).resolves.toMatch(/^openai-responses-models-v1:/u)
      expect(isVerifiedOpenAIResponsesRuntimeCapabilityAuthorityV2(escaped)).toBe(false)
      expect(() => escaped?.assertCurrent()).toThrow('GENERATION_V2_OPENAI_GENERATION_AUTHORITY_INVALID')
    } finally { db.close() }
  })

  it('rejects unproven sampling and does not silently omit it', async () => {
    const db = database()
    try {
      const repo = new GenerationConfigV2Repo(db)
      const current = repo.getScope('project', 'project:1')
      repo.compareAndSetScope('project', 'project:1', current.configRevision.value, {
        schemaVersion: 2, generation: { temperature: 0.4 },
      })
      await expect(issue(db, () => undefined)).rejects.toThrow('GENERATION_V2_OPENAI_FIELD_CAPABILITY_UNAVAILABLE')
    } finally { db.close() }
  })

  it('accepts typed OpenAI advanced config and rejects foreign provider extension', async () => {
    const db = database()
    try {
      const repo = new GenerationConfigV2Repo(db)
      let current = repo.getScope('project', 'project:1')
      repo.compareAndSetScope('project', 'project:1', current.configRevision.value, {
        schemaVersion: 2,
        providerExtension: { kind: 'openai_responses', verbosity: 'high', maxToolCalls: 4, parallelToolCalls: false, serviceTier: 'priority' },
      })
      await expect(issue(db, () => 'accepted')).resolves.toBe('accepted')
      current = repo.getScope('project', 'project:1')
      repo.compareAndSetScope('project', 'project:1', current.configRevision.value, {
        schemaVersion: 2, providerExtension: { kind: 'none' },
      })
      await expect(issue(db, () => 'accepted')).resolves.toBe('accepted')
    } finally { db.close() }
  })
})
