import BetterSqlite3 from 'better-sqlite3'
import { describe, expect, it, vi } from 'vitest'
import { applyGenerationV2SchemaForTest } from '../../infra/db/v2/testSchemaV2'
import { ConversationGraphV2Repo } from '../../infra/db/repo/conversationGraphV2Repo'
import { GenerationConfigV2Repo } from '../../infra/db/repo/generationConfigV2Repo'
import { ModelCatalogV2Repo } from '../../infra/db/repo/modelCatalogV2Repo'
import { runGenerationV2AuthorityTransactionOnOwnedConnectionV2 } from '../../infra/db/repo/generationV2AuthorityTransactionInternal'
import { buildAuthoritativeModelSubjectSetV1 } from '../../src/core/generation-v2/model-facts/authoritativeModelSubjectSetV1'
import { initializeBundledGeminiThinkingRulesV2 } from './bundledGeminiThinkingRulesV2'
import { createGeminiPlainTextInitialSendCoordinatorV2 } from './geminiPlainTextInitialSendCoordinatorV2'
import { UserCapabilityRulesV2Service } from './userCapabilityRulesV2Service'
import { createReviewedRequestRulePacksV2 } from '../../scripts/rules/reviewedRequestRulePacksV2'
import { ToolRegistryV2Repo } from '../../infra/db/repo/toolRegistryV2Repo'

vi.mock('electron', () => ({ session: {} }))
const scope = `credential-scope-v2:${'a'.repeat(64)}` as never

async function fixture(modelId: string, reasoning: object, providerExtension: object, options: { rulesV2?: boolean; web?: boolean; tools?: boolean } = {}) {
  const db = new BetterSqlite3(':memory:')
  applyGenerationV2SchemaForTest(db, process.cwd())
  const graph = new ConversationGraphV2Repo(db)
  runGenerationV2AuthorityTransactionOnOwnedConnectionV2(db, context => {
    graph.createProject(context, { projectId: 'project:1', name: 'Test', createdAtMs: 1 })
    graph.createConversationAndDefaultBranch(context, { projectId: 'project:1', conversationId: 'conversation:1', branchId: 'branch:1', title: 'Test', branchName: 'Main', createdAtMs: 2 })
  })
  const configs = new GenerationConfigV2Repo(db)
  if (options.tools) new ToolRegistryV2Repo(db).installAndSelect({ schemaVersion: 2, definitions: [{
    toolId: 'tool:weather', kind: 'function', function: { name: 'weather', parameters: { type: 'object' } }, sideEffectPolicy: 'none',
  }] }, null)
  configs.compareAndSetScope('conversation', 'conversation:1', configs.getScope('conversation', 'conversation:1').configRevision.value,
    { schemaVersion: 2, generation: {}, reasoning, providerExtension,
      web: options.web ? { mode: 'provider_search', types: ['web'] } : { mode: 'disabled' },
      tools: options.tools ? { mode: 'enabled', allowedToolIds: ['tool:weather'], toolChoice: { mode: 'auto' }, sideEffectConfirmation: 'required_each_retry' }
        : { mode: 'disabled' }, image: { mode: 'disabled' } })
  const catalog = new ModelCatalogV2Repo(db, () => 10)
  const catalogScope = { providerKey: 'google_ai_studio' as const, credentialScopeId: scope, endpointProfileId: 'gemini-developer-api-v1beta', operationContractId: 'gemini-models-v1beta', category: '' }
  const observation = { schemaVersion: 2, providerKey: 'google_ai_studio', endpointId: 'google-ai-studio-official', nativeModelId: modelId, observedAtMs: 10,
    rawProviderRecord: { name: `models/${modelId}`, supportedGenerationMethods: ['generateContent'], thinking: true },
    facts: {
      textChat: { providerPath: 'supportedGenerationMethods', ownProperty: true, presence: 'present', value: true, rawValue: true },
      reasoning: { providerPath: 'thinking', ownProperty: true, presence: 'present', value: true, rawValue: true },
      ...Object.fromEntries(['tools', 'structuredOutputs', 'vision'].map(key => [key, { providerPath: key, ownProperty: false, presence: 'missing' }])),
    }, provenance: { sourceKind: 'provider_api', sourceLabel: 'gemini_models_api', observedAtMs: 10, parserVersion: 2 } }
  catalog.beginSync(catalogScope, 'attempt:thinking')
  catalog.commitSync({ scope: catalogScope, attemptId: 'attempt:thinking', responseDigest: 'a'.repeat(64), observedAtMs: 10, applyMode: 'automatic', items: [
    { providerKey: 'google_ai_studio', nativeModelId: modelId, modelId, modelKey: `google_ai_studio::${modelId}`, displayName: modelId,
      raw: { schemaVersion: 1, buckets: [{ source: 'models', fetchedAtMs: 10, baseUrl: 'https://generativelanguage.googleapis.com/v1beta', payload: { observation } }] } },
  ] })
  const subjects = buildAuthoritativeModelSubjectSetV1([{ subject: { providerAuthorityId: 'google-ai-studio', endpointProfileId: catalogScope.endpointProfileId, nativeModelId: modelId },
    proof: { kind: 'provider_native_catalog', providerKey: 'google_ai_studio', scopeId: 'scope:test', credentialScopeId: scope, credentialRevision: 1,
      endpointProfileId: catalogScope.endpointProfileId, operationContractId: catalogScope.operationContractId, catalogCategory: '', activeSnapshotDigest: 'a'.repeat(64) } }])
  await initializeBundledGeminiThinkingRulesV2(db, { readCurrent: async () => subjects })
  if (options.rulesV2) {
    const service = new UserCapabilityRulesV2Service(db, { readCurrent: async () => subjects })
    let draft = service.openDraft({ sessionId: 'test:v2-import' })
    for (const transfer of createReviewedRequestRulePacksV2()) draft = service.importPack({ sessionId: draft.sessionId,
      expectedDraftRevision: draft.draftRevision, transfer })
    await service.saveDraft({ sessionId: draft.sessionId, expectedDraftRevision: draft.draftRevision })
  }
  const credentialService = {
    getStatus: async () => ({ configured: true, revision: 1, credentialScopeId: scope }),
    withCredential: async ({ consume }: { consume: (lease: never) => Promise<unknown> }) => consume({ credential: 'test-key', assertCurrent: () => undefined } as never),
    withCredentialScopeBindingAuthority: async ({ consume }: { consume: (authority: never) => Promise<unknown> }) => consume({ assertCurrent: () => undefined } as never),
  } as never
  return { db, coordinator: createGeminiPlainTextInitialSendCoordinatorV2({ db, credentialService }) }
}

describe('Gemini documented thinking through command authority and prepared request', () => {
  it('proves actual V2 function declarations and search in the same native tools array', async () => {
    const modelId = 'gemini-3.1-pro-preview'
    const { db, coordinator } = await fixture(modelId, { mode: 'enabled' },
      { kind: 'gemini_generate_content', thinkingMode: 'level', thinkingLevel: 'high', includeThoughts: 'provider_default' },
      { rulesV2: true, tools: true, web: true })
    try {
      const result = await coordinator.submit({ expectedCredentialRevision: 1, expectedCredentialScopeId: scope,
        command: { operationId: 'operation:v2-functions', branchId: 'branch:1', expectedHeadMessageId: null,
          modelId, userBody: 'Describe the weather.', commandAttachments: [] } })
      const body = JSON.parse(result.preparedRequest.body.copyUtf8Text())
      expect(body.tools).toContainEqual({ googleSearch: {} })
      expect(body.tools).toContainEqual({ functionDeclarations: [expect.objectContaining({ name: 'weather', parameters: { type: 'object' } })] })
      expect(result.preparedRequest.ledger.entries).toContainEqual(expect.objectContaining({ path: 'tools.mode', nativeField: 'tools[].functionDeclarations', disposition: 'encoded' }))
      expect(result.preparedRequest.ledger.entries).toContainEqual(expect.objectContaining({ path: 'web.mode', nativeField: 'tools[].googleSearch', disposition: 'encoded' }))
      expect(result.preparedRequest.wireEncodingProof).toBeDefined()
    } finally { db.close() }
  })
  it('prepares V2 default thinking with native search and proves the actual tools array field', async () => {
    const modelId = 'gemini-3.1-pro-preview'
    const { db, coordinator } = await fixture(modelId, { mode: 'disabled' },
      { kind: 'gemini_generate_content', thinkingMode: 'default', includeThoughts: 'provider_default' }, { rulesV2: true, web: true })
    try {
      const result = await coordinator.submit({ expectedCredentialRevision: 1, expectedCredentialScopeId: scope,
        command: { operationId: 'operation:v2-search', branchId: 'branch:1', expectedHeadMessageId: null,
          modelId, userBody: 'Read the prior source.', commandAttachments: [] } })
      const body = JSON.parse(result.preparedRequest.body.copyUtf8Text())
      expect(body.tools).toContainEqual({ googleSearch: {} })
      expect(result.preparedRequest.ledger.entries).toContainEqual(expect.objectContaining({ path: 'web.mode', nativeField: 'tools[].googleSearch', disposition: 'encoded' }))
      expect(result.preparedRequest.wireEncodingProof).toBeDefined()
      const snapshot = JSON.parse((db.prepare('SELECT canonical_json FROM assistant_generation_snapshot_v2').get() as { canonical_json: string }).canonical_json)
      expect(snapshot.requestPlan.schemaVersion).toBe(2)
      expect(snapshot.requestPlan.requestedIntent.reasoning.mode).toBe('disabled')
      expect(snapshot.semanticIntent.reasoning.mode).toBe('enabled')
    } finally { db.close() }
  })
  it.each([
    ['gemini-2.5-flash', { mode: 'disabled' }, { thinkingMode: 'budget', thinkingBudget: 0 }, { thinkingBudget: 0 }],
    ['gemini-2.5-flash', { mode: 'enabled' }, { thinkingMode: 'budget', thinkingBudget: -1 }, { thinkingBudget: -1 }],
    ['gemini-2.5-pro', { mode: 'enabled' }, { thinkingMode: 'budget', thinkingBudget: 128 }, { thinkingBudget: 128 }],
    ['gemini-3.1-pro-preview', { mode: 'enabled' }, { thinkingMode: 'level', thinkingLevel: 'high' }, { thinkingLevel: 'high' }],
  ])('prepares %s with %j and %j', async (model, reasoning, native, expected) => {
    const { db, coordinator } = await fixture(model as string, reasoning as object, { kind: 'gemini_generate_content', includeThoughts: 'provider_default', ...native as object })
    try {
      const result = await coordinator.submit({ expectedCredentialRevision: 1, expectedCredentialScopeId: scope,
        command: { operationId: 'operation:thinking', branchId: 'branch:1', expectedHeadMessageId: null, modelId: model, userBody: 'Hello', commandAttachments: [] } })
      expect(result.kind).toBe('created')
      const json = JSON.parse(new TextDecoder().decode(result.preparedRequest.body.copyBytes()))
      expect(json.generationConfig.thinkingConfig).toEqual(expected)
    } finally { db.close() }
  })
})
