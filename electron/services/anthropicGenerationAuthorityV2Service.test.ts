import BetterSqlite3 from 'better-sqlite3'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { applyGenerationV2SchemaForTest } from '../../infra/db/v2/testSchemaV2'
import { AttachmentAssetV2Repo } from '../../infra/db/repo/attachmentAssetV2Repo'
import { GenerationConfigV2Repo } from '../../infra/db/repo/generationConfigV2Repo'
import { ToolRegistryV2Repo } from '../../infra/db/repo/toolRegistryV2Repo'
import { withSynchronousGenerationCommandFactsAuthorityV2 } from '../../infra/db/repo/generationCommandFactsAuthorityV2'
import { runGenerationV2AuthorityTransactionOnOwnedConnectionV2 } from '../../infra/db/repo/generationV2AuthorityTransactionInternal'
import { GenerationV2Identity } from '../../src/next/generation-v2/domain/identityV2'
import { readVerifiedAnthropicEndpointProfileV2 } from '../../src/next/generation-v2/providers/anthropic/verifiedEndpointProfileV2'

const mocks = vi.hoisted(() => ({ fetch: vi.fn(), leases: new WeakSet<object>() }))
vi.mock('electron', () => ({ session: { defaultSession: { fetch: mocks.fetch } } }))
vi.mock('../credentials/epoch2RuntimeCredentialService', () => ({
  isEpoch2RuntimeCredentialLease: (value: unknown) => Boolean(value && typeof value === 'object' && mocks.leases.has(value)),
}))

import { createAnthropicModelEvidenceV2Service } from './anthropicModelEvidenceV2Service'
import {
  isVerifiedAnthropicProviderBindingAuthorityV2,
  isVerifiedAnthropicRuntimeCapabilityAuthorityV2,
  withVerifiedAnthropicGenerationAuthoritiesV2,
} from './anthropicGenerationAuthorityV2Service'

const profile = readVerifiedAnthropicEndpointProfileV2()
const scope = 'credential-scope-v2:'.concat('a'.repeat(64)) as never
const modelId = GenerationV2Identity.create('model_id', 'claude-opus-4-6')

function database() {
  const db = new BetterSqlite3(':memory:')
  applyGenerationV2SchemaForTest(db, process.cwd())
  db.prepare('INSERT INTO project_v2 VALUES (?, ?, ?, ?)').run('project:1', 'Project', 1, 1)
  db.prepare('INSERT INTO conversation_v2 VALUES (?, ?, ?, ?, ?)').run('conversation:1', 'project:1', 'Conversation', 2, 2)
  const config = new GenerationConfigV2Repo(db)
  const current = config.getScope('project', 'project:1')
  config.compareAndSetScope('project', 'project:1', current.configRevision.value, {
    schemaVersion: 2,
    generation: { maxOutputTokens: 4096 },
    reasoning: { mode: 'enabled', effort: 'high' },
    providerExtension: { kind: 'anthropic_messages', thinkingDisplay: 'summarized', thinkingMode: 'adaptive' },
  })
  return db
}

function credentialService() {
  return { withCredential: async ({ consume }: { consume: (lease: never) => Promise<unknown> }) => {
    const active = { value: true }
    const lease = Object.freeze({ trust: 'epoch2_runtime_credential_lease', usage: 'provider_transport_only', providerKey: 'anthropic', credential: 'secret', revision: 7, credentialScopeId: scope, assertCurrent: () => { if (!active.value) throw new Error('stale') } })
    mocks.leases.add(lease)
    try { return await consume(lease as never) } finally { active.value = false; mocks.leases.delete(lease) }
  } } as never
}

beforeEach(() => {
  mocks.fetch.mockReset()
  vi.spyOn(Date, 'now').mockReturnValue(Date.parse('2026-07-18T12:00:00.000Z'))
  const response = new Response(JSON.stringify({
    id: modelId.value, type: 'model', display_name: 'Claude Opus 4.6', created_at: '2026-02-05T00:00:00Z',
    max_input_tokens: 1_000_000, max_tokens: 128_000,
    capabilities: {
      batch: { supported: true }, citations: { supported: true }, code_execution: { supported: true },
      context_management: { clear_thinking_20251015: { supported: true }, clear_tool_uses_20250919: { supported: true }, compact_20260112: { supported: true }, supported: true },
      effort: { high: { supported: true }, low: { supported: true }, max: { supported: true }, medium: { supported: true }, supported: true, xhigh: { supported: false } },
      image_input: { supported: true }, pdf_input: { supported: true }, structured_outputs: { supported: true },
      thinking: { supported: true, types: { adaptive: { supported: true }, enabled: { supported: true } } },
    },
  }), { status: 200, headers: { 'content-type': 'application/json' } })
  mocks.fetch.mockResolvedValue(Object.freeze({ status: 200, url: `https://api.anthropic.com/v1/models/${modelId.value}`, headers: response.headers, body: response.body }))
})
afterEach(() => vi.restoreAllMocks())

describe('Anthropic generation authority V2', () => {
  it('brands exact binding/capability, including native replay and reviewed thinking fields, only in the transaction', async () => {
    const db = database()
    try {
      let escaped: unknown
      const service = createAnthropicModelEvidenceV2Service({ db, credentialService: credentialService(), nowMs: () => 100 })
      const result = await service.withRefreshedExactModelEvidence({
        expectedCredentialRevision: 7, expectedCredentialScopeId: scope, endpointProfile: profile, modelId,
        consume: (modelEvidence) => runGenerationV2AuthorityTransactionOnOwnedConnectionV2(db, (context) =>
          withSynchronousGenerationCommandFactsAuthorityV2(context, new GenerationConfigV2Repo(db), new AttachmentAssetV2Repo(db), 'conversation:1', [], undefined, (commandFacts) =>
            withVerifiedAnthropicGenerationAuthoritiesV2({ context, modelEvidence, commandFacts, operation: 'text', use: ({ binding, capability }) => {
              escaped = capability
              expect(isVerifiedAnthropicProviderBindingAuthorityV2(binding)).toBe(true)
              expect(isVerifiedAnthropicRuntimeCapabilityAuthorityV2(capability)).toBe(true)
              expect(binding.binding).toMatchObject({ providerId: { value: 'anthropic' }, endpointProfileId: { value: 'anthropic-developer-api-2023-06-01' }, modelId: { value: modelId.value }, operation: 'text' })
              expect(capability.snapshot.continuation).toEqual(expect.objectContaining({ kind: 'client_managed_native_replay', artifactKind: 'anthropic_messages_native_history_v1', supportsBranchReplay: true, supportsRestartReplay: true }))
              const fields = new Map(capability.snapshot.fields.map((field) => [field.path, field]))
              expect(fields.get('providerExtension.thinkingDisplay')).toMatchObject({ state: 'supported', domain: { values: ['omitted', 'provider_default', 'summarized'] } })
              expect(fields.get('providerExtension.thinkingMode')).toMatchObject({ state: 'supported', domain: { values: ['adaptive', 'manual'] } })
              expect(fields.get('providerExtension.manualThinkingBudgetTokens')).toMatchObject({ state: 'supported', domain: { min: 1024 } })
              expect(fields.get('generation.maxOutputTokens')).toMatchObject({ state: 'supported', domain: { min: 1, max: 128_000 } })
              expect(fields.get('tools.mode')).toMatchObject({ state: 'supported', domain: { values: ['disabled'] } })
              expect(capability.snapshot.tools).toEqual([])
              return 'ok'
            } }),
          )),
      })
      expect(result).toBe('ok')
      expect(isVerifiedAnthropicRuntimeCapabilityAuthorityV2(escaped)).toBe(false)
    } finally { db.close() }
  })

  it('rejects enabled tools before issuing a capability', async () => {
    const db = database()
    try {
      const config = new GenerationConfigV2Repo(db)
      const current = config.getScope('project', 'project:1')
      config.compareAndSetScope('project', 'project:1', current.configRevision.value, { schemaVersion: 2, generation: { maxOutputTokens: 4096 }, reasoning: { mode: 'enabled' }, tools: { mode: 'enabled', allowedToolIds: ['tool:1'], toolChoice: { mode: 'omitted' }, sideEffectConfirmation: 'required_each_retry' }, providerExtension: { kind: 'anthropic_messages', thinkingDisplay: 'summarized', thinkingMode: 'adaptive' } })
      const service = createAnthropicModelEvidenceV2Service({ db, credentialService: credentialService(), nowMs: () => 100 })
      await expect(service.withRefreshedExactModelEvidence({ expectedCredentialRevision: 7, expectedCredentialScopeId: scope, endpointProfile: profile, modelId, consume: (modelEvidence) => runGenerationV2AuthorityTransactionOnOwnedConnectionV2(db, (context) => withSynchronousGenerationCommandFactsAuthorityV2(context, config, new AttachmentAssetV2Repo(db), 'conversation:1', [], undefined, (commandFacts) => withVerifiedAnthropicGenerationAuthoritiesV2({ context, modelEvidence, commandFacts, operation: 'text', use: () => undefined }))) })).rejects.toThrow('GENERATION_V2_ANTHROPIC_INTENT_UNSUPPORTED')
    } finally { db.close() }
  })

  it('binds selected tool definitions and side-effect confirmation into the same capability revision', async () => {
    const db = database()
    try {
      const config = new GenerationConfigV2Repo(db)
      const current = config.getScope('project', 'project:1')
      config.compareAndSetScope('project', 'project:1', current.configRevision.value, { schemaVersion: 2,
        generation: { maxOutputTokens: 4096 }, reasoning: { mode: 'enabled' },
        tools: { mode: 'enabled', allowedToolIds: ['tool:1'], toolChoice: { mode: 'omitted' }, sideEffectConfirmation: 'required_each_retry' },
        providerExtension: { kind: 'anthropic_messages', thinkingDisplay: 'summarized', thinkingMode: 'adaptive' } })
      const tools = new ToolRegistryV2Repo(db, () => 90)
      tools.installAndSelect({ schemaVersion: 2, definitions: [{ toolId: 'tool:1', kind: 'function',
        sideEffectPolicy: 'confirmation_required_each_execution', function: { name: 'lookup', parameters: { type: 'object' } } }] }, null)
      const service = createAnthropicModelEvidenceV2Service({ db, credentialService: credentialService(), nowMs: () => 100 })
      await service.withRefreshedExactModelEvidence({
        expectedCredentialRevision: 7, expectedCredentialScopeId: scope, endpointProfile: profile, modelId,
        consume: (modelEvidence) => runGenerationV2AuthorityTransactionOnOwnedConnectionV2(db, (context) =>
          withSynchronousGenerationCommandFactsAuthorityV2(
            context, config, new AttachmentAssetV2Repo(db), 'conversation:1', [], undefined,
            (commandFacts) => {
              const toolRegistry = tools.resolveCurrentForTools(context, ['tool:1'])
              return withVerifiedAnthropicGenerationAuthoritiesV2({
                context, modelEvidence, commandFacts, operation: 'text', toolRegistry,
                use: ({ capability }) => {
                  const fields = new Map(capability.snapshot.fields.map((field) => [field.path, field]))
                  expect(fields.get('tools.mode')).toMatchObject({ state: 'supported', domain: { values: ['disabled', 'enabled'] } })
                  expect(fields.get('tools.sideEffectConfirmation')).toMatchObject({ state: 'requires_confirmation' })
                  expect(capability.snapshot.tools).toEqual([expect.objectContaining({ toolId: 'tool:1',
                    state: 'requires_confirmation', sideEffectPolicy: 'confirmation_required_each_execution' })])
                },
              })
            },
          )),
      })
    } finally { db.close() }
  })
})
