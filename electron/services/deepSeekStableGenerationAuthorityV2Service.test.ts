import BetterSqlite3 from 'better-sqlite3'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { applyGenerationV2SchemaForTest } from '../../infra/db/v2/testSchemaV2'
import { AttachmentAssetV2Repo } from '../../infra/db/repo/attachmentAssetV2Repo'
import { GenerationConfigV2Repo } from '../../infra/db/repo/generationConfigV2Repo'
import { withSynchronousGenerationCommandFactsAuthorityV2 } from '../../infra/db/repo/generationCommandFactsAuthorityV2'
import { runGenerationV2AuthorityTransactionOnOwnedConnectionV2 } from '../../infra/db/repo/generationV2AuthorityTransactionInternal'
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

import { createDeepSeekStableModelEvidenceV2Service } from './deepSeekStableModelEvidenceV2Service'
import {
  isVerifiedDeepSeekStableProviderBindingAuthorityV2,
  isVerifiedDeepSeekStableRuntimeCapabilityAuthorityV2,
  withVerifiedDeepSeekStableGenerationAuthoritiesV2,
  type VerifiedDeepSeekStableProviderBindingAuthorityV2,
  type VerifiedDeepSeekStableRuntimeCapabilityAuthorityV2,
} from './deepSeekStableGenerationAuthorityV2Service'

const profile = readVerifiedDeepSeekStableEndpointProfileV2()
const scope = 'credential-scope-v2:'.concat('a'.repeat(64)) as never
const modelId = GenerationV2Identity.create('model_id', 'deepseek-v4-pro')
const resolvedAt = '2026-07-17T12:00:00.000Z'

function response(): Response {
  const value = new Response(JSON.stringify({
    object: 'list',
    data: [{ id: modelId.value, object: 'model', owned_by: 'deepseek' }],
  }), { status: 200, headers: { 'content-type': 'application/json' } })
  return Object.freeze({
    status: 200,
    url: 'https://api.deepseek.com/models',
    headers: value.headers,
    body: value.body,
  }) as unknown as Response
}

function credentialService() {
  return {
    withCredential: async ({ consume }: { consume: (lease: never) => Promise<unknown> }) => {
      const state = { active: true }
      const lease = Object.freeze({
        trust: 'epoch2_runtime_credential_lease',
        usage: 'provider_transport_only',
        providerKey: 'deepseek',
        credential: 'sk-test',
        revision: 1,
        credentialScopeId: scope,
        assertCurrent: () => { if (!state.active) throw new Error('stale credential') },
      })
      mocks.leases.add(lease)
      try {
        const result = await consume(lease as never)
        lease.assertCurrent()
        return result
      } finally {
        state.active = false
        mocks.leases.delete(lease)
      }
    },
  } as never
}

function database(): BetterSqlite3.Database {
  const db = new BetterSqlite3(':memory:')
  applyGenerationV2SchemaForTest(db, process.cwd())
  db.prepare('INSERT INTO project_v2 VALUES (?, ?, ?, ?)').run('project:1', 'Project', 1, 1)
  db.prepare('INSERT INTO conversation_v2 VALUES (?, ?, ?, ?, ?)')
    .run('conversation:1', 'project:1', 'Conversation', 2, 2)
  return db
}

async function issue<T>(input: Readonly<{
  db: BetterSqlite3.Database
  configRepo: GenerationConfigV2Repo
  attachmentRepo: AttachmentAssetV2Repo
  attachments?: unknown
  operation?: 'text' | 'tool_continue'
  use: (authorities: Readonly<{
    binding: VerifiedDeepSeekStableProviderBindingAuthorityV2
    capability: VerifiedDeepSeekStableRuntimeCapabilityAuthorityV2
  }>) => T
}>): Promise<T> {
  mocks.fetch.mockResolvedValueOnce(response())
  const modelService = createDeepSeekStableModelEvidenceV2Service({
    db: input.db,
    credentialService: credentialService(),
    nowMs: () => 100,
  })
  return modelService.withRefreshedExactModelEvidence({
    expectedCredentialRevision: 1,
    expectedCredentialScopeId: scope,
    endpointProfile: profile,
    modelId,
    consume: (modelEvidence) => runGenerationV2AuthorityTransactionOnOwnedConnectionV2(
      input.db,
      (context) => withSynchronousGenerationCommandFactsAuthorityV2(
        context,
        input.configRepo,
        input.attachmentRepo,
        'conversation:1',
        input.attachments ?? [],
        undefined,
        (commandFacts) => withVerifiedDeepSeekStableGenerationAuthoritiesV2({
          modelEvidence,
          commandFacts,
          operation: input.operation ?? 'text',
          use: input.use as never,
        }),
      ),
    ),
  }) as Promise<T>
}

beforeEach(() => {
  mocks.fetch.mockReset()
  vi.spyOn(Date, 'now').mockReturnValue(Date.parse(resolvedAt))
})

afterEach(() => vi.restoreAllMocks())

describe('DeepSeek stable generation authority V2 service', () => {
  it('composes one exact text binding and capability graph only inside both authority callbacks', async () => {
    const db = database()
    try {
      const configRepo = new GenerationConfigV2Repo(db)
      const attachmentRepo = new AttachmentAssetV2Repo(db)
      let escapedBinding: VerifiedDeepSeekStableProviderBindingAuthorityV2 | undefined
      let escapedCapability: VerifiedDeepSeekStableRuntimeCapabilityAuthorityV2 | undefined
      const result = await issue({ db, configRepo, attachmentRepo, use: ({ binding, capability }) => {
        escapedBinding = binding
        escapedCapability = capability
        expect(isVerifiedDeepSeekStableProviderBindingAuthorityV2(binding)).toBe(true)
        expect(isVerifiedDeepSeekStableRuntimeCapabilityAuthorityV2(capability)).toBe(true)
        expect(binding).toMatchObject({
          trust: 'verified_deepseek_stable_provider_binding',
          usage: 'runtime_capability_and_snapshot_input_only',
          executionAuthority: 'none',
          credentialRevision: 1,
          binding: {
            credentialScopeId: { value: scope },
            providerId: { value: 'deepseek' },
            endpointProfileId: { value: 'deepseek-stable-api-v1' },
            modelId: { value: modelId.value },
            operation: 'text',
          },
        })
        expect(capability).toMatchObject({
          trust: 'verified_deepseek_stable_runtime_capability',
          usage: 'snapshot_commit_input_only',
          executionAuthority: 'none',
          snapshot: { trust: 'decoded_unverified', executionAuthority: 'none' },
        })
        expect(capability.snapshot.fields).toHaveLength(35)
        expect(capability.snapshot.tools).toEqual([])
        expect(capability.snapshot.evidence).toContainEqual(expect.objectContaining({
          kind: 'live_probe', effect: 'supports',
          sourceRef: binding.modelEvidenceRevision,
        }))
        expect(capability.snapshot.continuation).toMatchObject({
          kind: 'client_managed_native_replay',
          supportsBranchReplay: true,
          supportsRestartReplay: true,
          evidenceIds: ['starverse.deepseek.stable.policy.2026-07-17.supports'],
        })
        const evidence = new Map(capability.snapshot.evidence.map((entry) => [entry.evidenceId, entry]))
        for (const field of capability.snapshot.fields) {
          const expectedEffect = field.state === 'supported'
            ? 'supports'
            : field.state === 'unsupported'
              ? 'rejects'
              : field.state === 'requires_confirmation'
                ? 'requires_confirmation'
                : undefined
          if (!expectedEffect) {
            expect(field.evidenceIds).toEqual([])
            continue
          }
          expect(field.evidenceIds.length).toBeGreaterThan(0)
          for (const evidenceId of field.evidenceIds) {
            expect(evidence.get(evidenceId)?.effect).toBe(expectedEffect)
          }
        }
        const fields = new Map(capability.snapshot.fields.map((field) => [field.path, field]))
        expect(fields.get('generation.maxOutputTokens')).toMatchObject({ state: 'unavailable', evidenceIds: [] })
        expect(fields.get('generation.temperature')).toMatchObject({
          state: 'supported', constraints: [{ kind: 'requires_value', path: 'reasoning.mode', values: ['disabled'] }],
        })
        expect(fields.get('tools.mode')).toMatchObject({
          state: 'supported', domain: { kind: 'enum', values: ['disabled'] },
        })
        expect(fields.get('tools.toolChoice')).toMatchObject({ state: 'unavailable', evidenceIds: [] })
        return 'ok'
      } })
      expect(result).toBe('ok')
      expect(isVerifiedDeepSeekStableProviderBindingAuthorityV2(escapedBinding)).toBe(false)
      expect(isVerifiedDeepSeekStableRuntimeCapabilityAuthorityV2(escapedCapability)).toBe(false)
      expect(() => escapedCapability?.assertCurrent())
        .toThrow('GENERATION_V2_DEEPSEEK_GENERATION_AUTHORITY_INVALID')
    } finally { db.close() }
  })

  it('blocks unproven operations, tool registries, attachment codecs and field capabilities', async () => {
    const db = database()
    try {
      const configRepo = new GenerationConfigV2Repo(db, () => 20)
      const attachmentRepo = new AttachmentAssetV2Repo(db)
      await expect(issue({ db, configRepo, attachmentRepo, operation: 'tool_continue', use: () => undefined }))
        .rejects.toThrow('GENERATION_V2_DEEPSEEK_OPERATION_AUTHORITY_REQUIRED')

      const project = configRepo.getScope('project', 'project:1')
      configRepo.compareAndSetScope('project', 'project:1', project.configRevision.value, {
        schemaVersion: 2,
        tools: {
          mode: 'enabled', allowedToolIds: ['tool:weather'], toolChoice: { mode: 'omitted' },
          sideEffectConfirmation: 'required_each_retry',
        },
      })
      await expect(issue({ db, configRepo, attachmentRepo, use: () => undefined }))
        .rejects.toThrow('GENERATION_V2_DEEPSEEK_TOOL_REGISTRY_AUTHORITY_REQUIRED')

      const withTools = configRepo.getScope('project', 'project:1')
      configRepo.compareAndSetScope('project', 'project:1', withTools.configRevision.value, {
        schemaVersion: 2,
        tools: { mode: 'disabled' },
        generation: { maxOutputTokens: 32 },
      })
      await expect(issue({ db, configRepo, attachmentRepo, use: () => undefined }))
        .rejects.toThrow('GENERATION_V2_DEEPSEEK_FIELD_CAPABILITY_UNAVAILABLE')

      const blob = attachmentRepo.recordBlobFromBytes(new Uint8Array([1]), 'text/plain')
      attachmentRepo.createAsset({ assetId: 'asset:1', assetKind: 'file', filename: 'a.txt', sourceKind: 'user_import' })
      attachmentRepo.appendSourceRevision({ assetId: 'asset:1', assetRevisionId: 'revision:1', blob })
      const afterTokens = configRepo.getScope('project', 'project:1')
      configRepo.compareAndSetScope('project', 'project:1', afterTokens.configRevision.value, {
        schemaVersion: 2, generation: {},
      })
      await expect(issue({
        db, configRepo, attachmentRepo,
        attachments: [{
          assetId: 'asset:1', assetRevisionId: 'revision:1', assetSha256: blob.sha256.value,
          include: false, sendAs: 'inline_text', conversion: 'none',
        }],
        use: () => undefined,
      })).rejects.toThrow('GENERATION_V2_DEEPSEEK_ATTACHMENT_CAPABILITY_UNAVAILABLE')
    } finally { db.close() }
  })

  it('rejects thinking sampling, unsupported effort and asynchronous authority escape', async () => {
    const db = database()
    try {
      const configRepo = new GenerationConfigV2Repo(db, () => 20)
      const attachmentRepo = new AttachmentAssetV2Repo(db)
      const project = configRepo.getScope('project', 'project:1')
      configRepo.compareAndSetScope('project', 'project:1', project.configRevision.value, {
        schemaVersion: 2,
        generation: { temperature: 0.4 },
        reasoning: { mode: 'enabled', effort: 'high' },
      })
      await expect(issue({ db, configRepo, attachmentRepo, use: () => undefined }))
        .rejects.toThrow('DEEPSEEK_THINKING_EXPLICIT_SAMPLING_UNSUPPORTED')

      const thinking = configRepo.getScope('project', 'project:1')
      configRepo.compareAndSetScope('project', 'project:1', thinking.configRevision.value, {
        schemaVersion: 2, generation: {}, reasoning: { mode: 'enabled', effort: 'minimal' },
      })
      await expect(issue({ db, configRepo, attachmentRepo, use: () => undefined }))
        .rejects.toThrow('DEEPSEEK_REASONING_EFFORT_UNSUPPORTED')

      const minimal = configRepo.getScope('project', 'project:1')
      configRepo.compareAndSetScope('project', 'project:1', minimal.configRevision.value, {
        schemaVersion: 2, reasoning: { mode: 'disabled' },
      })
      await expect(issue({
        db, configRepo, attachmentRepo,
        use: (async () => undefined) as never,
      })).rejects.toThrow('GENERATION_V2_DEEPSEEK_GENERATION_AUTHORITY_INVALID')
    } finally { db.close() }
  })

  it('rejects explicit values outside the resolved field domains', async () => {
    const db = database()
    try {
      const configRepo = new GenerationConfigV2Repo(db, () => 20)
      const attachmentRepo = new AttachmentAssetV2Repo(db)
      const project = configRepo.getScope('project', 'project:1')
      configRepo.compareAndSetScope('project', 'project:1', project.configRevision.value, {
        schemaVersion: 2,
        generation: { temperature: 100 },
      })
      await expect(issue({ db, configRepo, attachmentRepo, use: () => undefined }))
        .rejects.toThrow('GENERATION_V2_DEEPSEEK_FIELD_VALUE_UNSUPPORTED')
    } finally { db.close() }
  })

  it('rejects a main-process clock that predates the policy or model evidence', async () => {
    vi.mocked(Date.now).mockReturnValue(Date.parse('2026-07-16T23:59:59.999Z'))
    const db = database()
    try {
      await expect(issue({
        db,
        configRepo: new GenerationConfigV2Repo(db),
        attachmentRepo: new AttachmentAssetV2Repo(db),
        use: () => undefined,
      })).rejects.toThrow('GENERATION_V2_DEEPSEEK_GENERATION_AUTHORITY_INVALID')
    } finally { db.close() }
  })

  it('rejects copied or caller-authored model and command facts before composing records', () => {
    expect(() => withVerifiedDeepSeekStableGenerationAuthoritiesV2({
      modelEvidence: {} as never,
      commandFacts: {} as never,
      operation: 'text',
      use: () => undefined,
    })).toThrow('GENERATION_V2_DEEPSEEK_GENERATION_AUTHORITY_INVALID')
  })
})
