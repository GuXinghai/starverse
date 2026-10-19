import BetterSqlite3 from 'better-sqlite3'
import { describe, expect, it, vi } from 'vitest'
import path from 'node:path'
import { applyGenerationV2SchemaForTest } from '../../infra/db/v2/testSchemaV2'
import { ConversationGraphV2Repo } from '../../infra/db/repo/conversationGraphV2Repo'
import { GenerationConfigV2Repo } from '../../infra/db/repo/generationConfigV2Repo'
import { ModelCatalogV2Repo } from '../../infra/db/repo/modelCatalogV2Repo'
import { OpenRouterNativeHistoryV2Repo } from '../../infra/db/repo/openRouterNativeHistoryV2Repo'
import { GenerationNativeCompletionReceiptV2Repo } from '../../infra/db/repo/generationNativeCompletionReceiptV2Repo'
import { loadNativeArtifactJsonV2 } from '../../infra/db/repo/nativeArtifactStorageV2'
import { runGenerationV2AuthorityTransactionOnOwnedConnectionV2 } from '../../infra/db/repo/generationV2AuthorityTransactionInternal'
import { ProviderCatalogAuthorityRegistryV2 } from '../../src/core/model-catalog/providerCatalogAuthorityRegistryV2'
import { OPENROUTER_NATIVE_HISTORY_ARTIFACT_KIND_V1 } from '../../src/core/generation-v2/providers/openrouter/nativeMessagesV1'
import { OPENROUTER_CHAT_TERMINAL_ARTIFACT_KIND_V1 } from '../../src/core/generation-v2/providers/openrouter/terminalArtifactV1'
import { createOpenRouterChatPlainTextInitialSendCoordinatorV2 } from './openRouterChatPlainTextInitialSendCoordinatorV2'
import { createOpenRouterChatStreamRunnerV2 } from './openRouterChatStreamRunnerV2'
import { recoverPendingGenerationNativeCompletionsV2 } from './generationNativeCompletionV2'

const transportMocks = vi.hoisted(() => ({ leases: new WeakSet<object>() }))
vi.mock('electron', () => ({ session: { defaultSession: { fetch: vi.fn() } } }))
vi.mock('../credentials/epoch2RuntimeCredentialService', () => ({
  isEpoch2RuntimeCredentialLease: (value: unknown) =>
    Boolean(value && typeof value === 'object' && transportMocks.leases.has(value)),
}))

const credentialScopeId = `credential-scope-v2:${'b'.repeat(64)}` as never
const modelId = 'openai/gpt-4.1-mini'

function credentialService() {
  return {
    withCredentialScopeBindingAuthority: async ({ consume }: { consume: (authority: never) => Promise<unknown> }) =>
      consume({ assertCurrent: () => undefined } as never),
    getStatus: async () => ({ configured: true, revision: 1, credentialScopeId }),
    withCredential: async ({ consume }: { consume: (lease: never) => Promise<unknown> }) => {
      const lease = { providerKey: 'openrouter', credentialScopeId, credential: 'test-only', assertCurrent: () => undefined }
      transportMocks.leases.add(lease)
      try { return await consume(lease as never) } finally { transportMocks.leases.delete(lease) }
    },
  } as never
}

function database(): BetterSqlite3.Database {
  const db = new BetterSqlite3(':memory:')
  applyGenerationV2SchemaForTest(db, path.resolve(process.cwd()))
  runGenerationV2AuthorityTransactionOnOwnedConnectionV2(db, (context) => {
    const graph = new ConversationGraphV2Repo(db)
    graph.createProject(context, { projectId: 'project:test', name: 'Test', createdAtMs: 1 })
    graph.createConversationAndDefaultBranch(context, { projectId: 'project:test', conversationId: 'conversation:test',
      branchId: 'branch:test', title: 'Test', branchName: null, createdAtMs: 2 })
  })

  const registry = ProviderCatalogAuthorityRegistryV2.get('openrouter')!
  const scope = { providerKey: 'openrouter' as const, credentialScopeId, endpointProfileId: registry.endpointProfileId,
    operationContractId: registry.modelsContractId, category: '' }
  const catalog = new ModelCatalogV2Repo(db, () => 100)
  catalog.beginSync(scope, 'attempt:openrouter')
  catalog.commitSync({ scope, attemptId: 'attempt:openrouter', responseDigest: 'c'.repeat(64), observedAtMs: 100,
    applyMode: 'automatic', items: [{
      providerKey: 'openrouter', nativeModelId: modelId, modelId, modelKey: `openrouter::${modelId}`,
      displayName: modelId,
      raw: { schemaVersion: 1, buckets: [{ source: 'models', fetchedAtMs: 100, baseUrl: 'https://openrouter.ai/api/v1',
        payload: { observation: { schemaVersion: 2, providerKey: 'openrouter', nativeModelId: modelId,
          endpointId: registry.endpointProfileId, observedAtMs: 100,
          rawProviderRecord: { id: modelId, architecture: { modality: 'text->text', input_modalities: ['text'], output_modalities: ['text'] },
            supported_parameters: ['max_tokens'] }, facts: {},
          provenance: { sourceKind: 'provider_api', sourceLabel: 'openrouter_models_test', observedAtMs: 100, parserVersion: 2 },
        } },
      }] },
    }] })
  const configRepo = new GenerationConfigV2Repo(db)
  const current = configRepo.getScope('conversation', 'conversation:test')
  configRepo.compareAndSetScope('conversation', 'conversation:test', current.configRevision.value, {
    schemaVersion: 2, generation: { maxOutputTokens: 256 }, reasoning: { mode: 'disabled' }, web: { mode: 'disabled' },
    image: { mode: 'disabled' }, tools: { mode: 'disabled' }, providerExtension: { kind: 'none' },
  })
  return db
}

function streamResponse(): Response {
  const usage = { prompt_tokens: 7, completion_tokens: 9, total_tokens: 16,
    cost: 0.000031, is_byok: true, cost_details: { upstream_inference_cost: 0.000029 } }
  const events = [
    { id: 'gen-receipt', model: modelId, provider: 'OpenAI',
      choices: [{ index: 0, delta: { role: 'assistant', content: 'Saved from the exact request history.' }, finish_reason: null }] },
    { id: 'gen-receipt', model: modelId, provider: 'OpenAI',
      choices: [{ index: 0, delta: { content: '', role: 'assistant' }, finish_reason: 'stop' }], usage },
  ]
  const body = events.map((event) => `data: ${JSON.stringify(event)}\n\n`).join('') + 'data: [DONE]\n\n'
  return new Response(body, { headers: { 'content-type': 'text/event-stream' } })
}

describe('OpenRouter native completion receipt recovery', () => {
  it('validates and replays completion against the persisted nonempty prepared history without refetching', async () => {
    let db = database()
    let fetchCount = 0
    const fetchImpl = async () => { fetchCount += 1; return streamResponse() }
    try {
      const command = await createOpenRouterChatPlainTextInitialSendCoordinatorV2({ db,
        credentialService: credentialService(), nowMs: () => 200, createGraphId: (kind) => `${kind}:source` }).submit({
        expectedCredentialRevision: 1, expectedCredentialScopeId: credentialScopeId,
        command: { operationId: 'operation:source', branchId: 'branch:test', expectedHeadMessageId: null,
          userBody: 'Original request body', modelId, commandAttachments: [] },
      })
      const prepared = JSON.parse(command.preparedRequest.body.copyUtf8Text()) as { messages?: unknown[] }
      expect(prepared.messages).toEqual([expect.objectContaining({ role: 'user', content: 'Original request body' })])

      const runner = createOpenRouterChatStreamRunnerV2({ db, credentialService: credentialService(), nowMs: () => 300, fetchImpl })
      const historySpy = vi.spyOn(OpenRouterNativeHistoryV2Repo.prototype, 'loadPersistedRequestHistory')
        .mockImplementationOnce(() => { throw new Error('injected local request-history read failure') })
      await expect(runner.run(command)).rejects.toMatchObject({
        code: 'GENERATION_V2_NATIVE_COMPLETION_MATERIALIZATION_PENDING', receiptPersisted: true,
      })
      expect(historySpy).toHaveBeenCalledTimes(1)
      historySpy.mockRestore()

      expect(fetchCount).toBe(1)
      expect(new GenerationNativeCompletionReceiptV2Repo(db).listPending()).toHaveLength(1)
      expect(db.prepare('SELECT state FROM generation_request_v2 WHERE operation_id=?').get('operation:source'))
        .toEqual({ state: 'streaming' })

      const image = db.serialize()
      db.close()
      db = new BetterSqlite3(image)
      createOpenRouterChatStreamRunnerV2({ db, credentialService: credentialService(), nowMs: () => 400,
        fetchImpl: async () => { throw new Error('RECOVERY_MUST_NOT_FETCH') } })
      expect(recoverPendingGenerationNativeCompletionsV2(db, () => 400)).toEqual({ recovered: 1, pending: 0, unavailable: 0 })
      expect(fetchCount).toBe(1)
      expect(new GenerationNativeCompletionReceiptV2Repo(db).listPending()).toHaveLength(0)
      expect(db.prepare('SELECT state FROM generation_request_v2 WHERE operation_id=?').get('operation:source'))
        .toEqual({ state: 'completed' })
      const row = db.prepare(`SELECT operation_id AS operationId, answer_root_id AS answerRootId,
        request_sequence AS requestSequence, artifact_kind AS artifactKind, codec_version AS codecVersion,
        artifact_json AS artifactJson, artifact_hash AS artifactHash
        FROM generation_native_artifact_v2 WHERE operation_id=? AND artifact_kind=?`).get(
        'operation:source', OPENROUTER_NATIVE_HISTORY_ARTIFACT_KIND_V1,
      ) as { operationId: string; answerRootId: string; requestSequence: number; artifactKind: string;
        codecVersion: number; artifactJson: string; artifactHash: string } | undefined
      expect(row).toBeDefined()
      const artifactJson = runGenerationV2AuthorityTransactionOnOwnedConnectionV2(db, () =>
        loadNativeArtifactJsonV2(db, row!, row!.artifactJson, {
          artifactCodecVersion: row!.codecVersion, artifactHash: row!.artifactHash,
        }))
      expect(JSON.parse(artifactJson).orderedMessages).toEqual([
        expect.objectContaining({ role: 'user', content: 'Original request body' }),
        expect.objectContaining({ role: 'assistant', content: 'Saved from the exact request history.' }),
      ])
      const terminalRow = db.prepare(`SELECT operation_id AS operationId, answer_root_id AS answerRootId,
        request_sequence AS requestSequence, artifact_kind AS artifactKind, codec_version AS codecVersion,
        artifact_json AS artifactJson, artifact_hash AS artifactHash
        FROM generation_native_artifact_v2 WHERE operation_id=? AND artifact_kind=?`).get(
        'operation:source', OPENROUTER_CHAT_TERMINAL_ARTIFACT_KIND_V1,
      ) as { operationId: string; answerRootId: string; requestSequence: number; artifactKind: string;
        codecVersion: number; artifactJson: string; artifactHash: string } | undefined
      expect(terminalRow).toBeDefined()
      const terminalJson = runGenerationV2AuthorityTransactionOnOwnedConnectionV2(db, () =>
        loadNativeArtifactJsonV2(db, terminalRow!, terminalRow!.artifactJson, {
          artifactCodecVersion: terminalRow!.codecVersion, artifactHash: terminalRow!.artifactHash,
        }))
      expect(JSON.parse(terminalJson).usage).toMatchObject({ cost: 0.000031, is_byok: true,
        cost_details: { upstream_inference_cost: 0.000029 } })
    } finally { if (db.open) db.close() }
  })
})
