import BetterSqlite3 from 'better-sqlite3'
import { defineComponent, h } from 'vue'
import { cleanup, render, waitFor } from '@testing-library/vue'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { installGenerationV2TestBridge } from '../../tests/helpers/generationV2Bridge'
import { applyGenerationV2SchemaForTest } from '../../infra/db/v2/testSchemaV2'
import { GenerationConfigV2Repo } from '../../infra/db/repo/generationConfigV2Repo'
import { ComposerDraftV2Repo } from '../../infra/db/repo/composerDraftV2Repo'
import { ModelCatalogV2Repo } from '../../infra/db/repo/modelCatalogV2Repo'
import { seedMaterializedCapabilityRulesForTestV1 } from '../../infra/db/test-support/materializedCapabilityRuleTestSupport'
import { projectGenerationConfigLayerV2 } from '@/core/generation-v2/config/generationConfigLayerV2'
import { ProviderCatalogAuthorityRegistryV2 } from '@/core/model-catalog/providerCatalogAuthorityRegistryV2'
import { providerAuthorityForExecutionBindingV1 } from '@/core/generation-v2/model-facts/providerAuthorityRegistryV1'
import { createGenerationV2CapabilityResolutionService } from '../../electron/services/generationV2CapabilityResolutionService'
import { createAnthropicPlainTextInitialSendCoordinatorV2 } from '../../electron/services/anthropicPlainTextInitialSendCoordinatorV2'
import { createGeminiPlainTextInitialSendCoordinatorV2 } from '../../electron/services/geminiPlainTextInitialSendCoordinatorV2'
import { createOpenAIResponsesPlainTextInitialSendCoordinatorV2 } from '../../electron/services/openAIResponsesPlainTextInitialSendCoordinatorV2'
import { createOpenRouterChatPlainTextInitialSendCoordinatorV2 } from '../../electron/services/openRouterChatPlainTextInitialSendCoordinatorV2'
import { useAppChatAppLogic } from './app/appChatApp.logic'

vi.mock('electron', () => ({ session: { defaultSession: { fetch: vi.fn() } } }))

const ok = <T>(value: T) => ({ ok: true as const, value })
const scope = `credential-scope-v2:${'b'.repeat(64)}` as never
const models = { anthropic_messages: 'claude-opus-4-6', google_ai_studio: 'gemini-2.5-flash', openai_responses: 'gpt-5', openrouter: 'test/model' }
type Provider = keyof typeof models
let db: BetterSqlite3.Database
afterEach(() => { cleanup(); db?.close(); for (const name of ['openRouter', 'anthropicMessages', 'googleAIStudio', 'openAIResponses']) localStorage.removeItem(`starverse.${name}TextChat.enabled`) })

async function fixture(provider: Provider, persistedWeb?: Record<string, unknown>) {
  db = new BetterSqlite3(':memory:')
  applyGenerationV2SchemaForTest(db, process.cwd())
  db.prepare("INSERT INTO project_v2 VALUES('project:test','Test',1,1)").run()
  db.prepare("INSERT INTO conversation_v2 VALUES('c1','project:test','Test',1,1)").run()
  db.prepare("INSERT INTO branch_v2 VALUES('branch:c1','c1',NULL,NULL,1,1,NULL,NULL)").run()
  const registry = ProviderCatalogAuthorityRegistryV2.get(provider)!
  const modelId = models[provider]
  const catalogScope = { providerKey: provider, credentialScopeId: scope, endpointProfileId: registry.endpointProfileId,
    operationContractId: registry.modelsContractId, category: '' }
  const catalog = new ModelCatalogV2Repo(db, () => 100)
  catalog.beginSync(catalogScope, 'catalog:test')
  const rawProviderRecord = provider === 'google_ai_studio' ? { name: `models/${modelId}`, supportedGenerationMethods: ['generateContent'], outputTokenLimit: 65536 }
    : provider === 'openrouter' ? { id: modelId, architecture: { modality: 'text->text', input_modalities: ['text'], output_modalities: ['text'] }, supported_parameters: ['max_tokens'] }
      : { id: modelId, max_tokens: 65536 }
  catalog.commitSync({ scope: catalogScope, attemptId: 'catalog:test', responseDigest: 'c'.repeat(64), observedAtMs: 100, applyMode: 'automatic',
    items: [{ providerKey: provider, nativeModelId: modelId, modelId, modelKey: `${provider}::${modelId}`, displayName: modelId,
      raw: { schemaVersion: 1, buckets: [{ source: 'models', fetchedAtMs: 100, baseUrl: 'https://example.test', payload: { observation: {
        schemaVersion: 2, providerKey: provider, nativeModelId: modelId, endpointId: registry.endpointProfileId, observedAtMs: 100,
        rawProviderRecord, facts: {}, provenance: { sourceKind: 'provider_api', sourceLabel: 'synthetic_catalog', observedAtMs: 100, parserVersion: 2 },
      } } }] } }] })
  const authority = providerAuthorityForExecutionBindingV1({ implementationProviderId: registry.executionProviderId, endpointProfileKind: registry.endpointProfileId })
  seedMaterializedCapabilityRulesForTestV1(db, { ownershipSnapshots: [{ schemaVersion: 1, ownership: 'cloud', ownerId: 'test:cloud', packs: [{
    schemaVersion: 1, packId: 'pack.test.web-search', displayName: 'Synthetic web', description: null, priority: 0, mode: 'no_control', target: 'enabled',
    rules: [{ ruleId: 'test.web.support', label: null, description: null, priority: 0, configured: 'on', providerAuthorityId: authority.providerAuthorityId,
      endpointProfileId: registry.endpointProfileId, selector: { kind: 'exact', nativeModelIds: [modelId] },
      assertion: { path: 'search.web.support', value: { kind: 'support', value: 'supported' } }, evidence: null }],
  }] }], subjectCandidates: [{ subject: { providerAuthorityId: authority.providerAuthorityId, endpointProfileId: registry.endpointProfileId, nativeModelId: modelId },
    proof: { kind: 'provider_native_catalog', providerKey: provider, scopeId: 'scope:test:web', credentialScopeId: scope, credentialRevision: 1,
      endpointProfileId: registry.endpointProfileId, operationContractId: registry.modelsContractId, catalogCategory: '', activeSnapshotDigest: 'c'.repeat(64) } }] })
  const configs = new GenerationConfigV2Repo(db)
  if (persistedWeb) configs.compareAndSetScope('conversation', 'c1', configs.getScope('conversation', 'c1').configRevision.value,
    { schemaVersion: 2, generation: provider === 'anthropic_messages' ? { maxOutputTokens: 32 } : {}, reasoning: { mode: 'disabled' }, web: persistedWeb,
      image: { mode: 'disabled' }, tools: { mode: 'disabled' }, providerExtension: provider === 'anthropic_messages'
        ? { kind: 'anthropic_messages', thinkingDisplay: 'summarized', thinkingMode: 'model_recommended' } : { kind: 'none' } })
  const composer = new ComposerDraftV2Repo(db, () => 100)
  composer.getOrCreate('c1')
  const credentialService = {
    getStatus: async () => ({ configured: true, revision: 1, credentialScopeId: scope }),
    withCredentialScopeBindingAuthority: async ({ consume }: any) => consume({ assertCurrent: () => undefined }),
  } as never
  const noTransport = vi.fn(async () => { throw new Error('PROVIDER_FETCH_FORBIDDEN') })
  const input = { db, credentialService, fetchImpl: noTransport, nowMs: () => 100 }
  const coordinator = provider === 'anthropic_messages' ? createAnthropicPlainTextInitialSendCoordinatorV2(input)
    : provider === 'google_ai_studio' ? createGeminiPlainTextInitialSendCoordinatorV2(input)
      : provider === 'openai_responses' ? createOpenAIResponsesPlainTextInitialSendCoordinatorV2(input)
        : createOpenRouterChatPlainTextInitialSendCoordinatorV2(input)
  const capabilities = createGenerationV2CapabilityResolutionService({ db, credentialService, openAICompatibleCredentialService: {} as never })
  const bridge: any = installGenerationV2TestBridge()
  const call = async (action: () => any) => { try { return ok(await action()) } catch (error) { return { ok: false, code: (error as Error).message } } }
  const view = (ownerKind: any, ownerId: string) => {
    const current = configs.getScope(ownerKind, ownerId)
    return { ownerKind, ownerId, configRevision: current.configRevision.value, semanticLayer: projectGenerationConfigLayerV2(current.semanticLayer) }
  }
  bridge.workspace.getConfig.mockImplementation(async (kind: any, id: string) => call(() => view(kind, id)))
  bridge.workspace.updateConfig.mockImplementation(async (packet: any) => call(() => {
    configs.compareAndSetScope(packet.ownerKind, packet.ownerId, packet.expectedConfigRevision, packet.semanticLayer)
    return view(packet.ownerKind, packet.ownerId)
  }))
  bridge.workspace.getConversationRoutePreference.mockResolvedValue(ok({ conversationId: 'c1', revision: 1,
    selection: { schemaVersion: 1, kind: 'provider_model', providerId: provider, modelId } }))
  let template: any = (await bridge.workspace.getSystemTemplate()).value!
  if (provider === 'anthropic_messages') template = { ...template, conversation: { ...template.conversation,
    meta: { ...template.conversation.meta, generationParamsOverride: { maxOutputTokens: { mode: 'custom', value: 32 } } } } }
  bridge.workspace.getSystemTemplate.mockImplementation(async () => ok(template))
  bridge.workspace.updateSystemTemplateConfig.mockImplementation(async (packet: any) => {
    template = { ...template, conversation: { ...template.conversation, meta: packet.meta, templateRevision: template.conversation.templateRevision + 1 } }
    return ok(template)
  })
  bridge.composer.get.mockImplementation(async (id: string) => call(() => composer.getOrCreate(id)))
  bridge.composer.updateText.mockImplementation(async (packet: any) => call(() => composer.updateText(packet)))
  bridge.capabilities.resolve.mockImplementation(async (packet: any) => call(() => capabilities.resolve(packet)))
  for (const credentials of Object.values(bridge.credentials) as any[]) credentials.getStatus.mockResolvedValue({ ok: true, status: {
    configured: true, credentialRevision: 1, credentialScopeId: scope, profileId: registry.endpointProfileId,
  } } as never)
  const port = provider === 'anthropic_messages' ? bridge.anthropic : provider === 'google_ai_studio' ? bridge.gemini.generateContent
    : provider === 'openai_responses' ? bridge.openAIResponses : bridge.openRouter.chat
  let prepared: any = null
  port.initial.mockImplementation(async (packet: any) => {
    try {
      prepared = await coordinator.submit({ command: packet.command, expectedCredentialRevision: 1, expectedCredentialScopeId: scope })
      return { ok: false, code: 'FIXTURE_PREPARED_WITHOUT_TRANSPORT' }
    } catch (error) { return { ok: false, code: (error as Error).message } }
  })
  for (const name of ['openRouter', 'anthropicMessages', 'googleAIStudio', 'openAIResponses']) localStorage.setItem(`starverse.${name}TextChat.enabled`, '1')
  let logic!: ReturnType<typeof useAppChatAppLogic>
  render(defineComponent({ setup() { logic = useAppChatAppLogic(); return () => h('div') } }))
  await waitFor(() => expect(logic.isReady.value).toBe(true))
  await waitFor(() => expect(logic.activeSessionCapabilityProjection.value?.binding.providerId).toBe(registry.executionProviderId))
  await waitFor(() => expect(logic.isDraftInteractionLocked.value).toBe(false))
  expect(logic.activeSessionCapabilityProjection.value?.controls['web.mode']).toMatchObject({ state: 'supported' })
  expect(logic.activeSessionCapabilityProjection.value?.controls['web.mode'].domain).toBeUndefined()
  return { logic, bridge, port, configs, coordinator, noTransport, template: () => template, prepared: () => prepared,
    body: () => JSON.parse(prepared.preparedRequest.body.copyUtf8Text()) }
}

describe('mounted composer web semantics through real prepared coordinators', () => {
  it.each(['anthropic_messages', 'google_ai_studio', 'openai_responses', 'openrouter'] as const)('keeps disabled native search disabled for %s', async provider => {
    const f = await fixture(provider)
    await f.logic.onUpdateWebSearchEnabled(false)
    f.logic.draft.value = 'Synthetic text without search'
    await f.logic.onSend()
    expect(f.logic.loadError.value).toBe('FIXTURE_PREPARED_WITHOUT_TRANSPORT')
    expect((f.configs.getScope('conversation', 'c1').semanticLayer as any).web).toEqual({ mode: 'disabled' })
    expect(f.body().tools?.some((tool: any) => tool.type === 'web_search' || tool.type === 'web_search_20250305' || tool.googleSearch)).not.toBe(true)
    expect(f.noTransport).not.toHaveBeenCalled()
  })
  it.each(['anthropic_messages', 'google_ai_studio', 'openai_responses', 'openrouter'] as const)('compiles mode-only template settings for %s without unavailable defaults', async provider => {
    const f = await fixture(provider)
    await f.logic.onUpdateWebSearchEnabled(true)
    if (provider !== 'openrouter') expect(f.template().conversation.meta?.webSearchOverride).toEqual({ searchMode: 'enable' })
    f.logic.draft.value = 'Search a synthetic topic'
    await f.logic.onSend()
    expect(f.logic.loadError.value).toBe('FIXTURE_PREPARED_WITHOUT_TRANSPORT')
    expect(f.port.initial).toHaveBeenCalledTimes(1)
    expect(f.noTransport).not.toHaveBeenCalled()
    const web = (f.configs.getScope('conversation', 'c1').semanticLayer as any).web
    if (provider === 'anthropic_messages') { expect(web).toEqual({ mode: 'provider_search', types: ['web'], maxResults: 5 }); expect(f.body().tools[0].max_uses).toBe(5) }
    if (provider === 'google_ai_studio') { expect(web).toEqual({ mode: 'provider_search', types: ['web'] }); expect(f.body().tools).toEqual([{ googleSearch: {} }]) }
    if (provider === 'openai_responses') { expect(web).toEqual({ mode: 'provider_search', types: ['web'], searchContextSize: 'medium' }); expect(f.body().tools[0].search_context_size).toBe('medium') }
    if (provider === 'openrouter') expect(web).toMatchObject({ mode: 'provider_search', maxResults: 8, searchContextSize: 'high' })
  })

  it('keeps Anthropic20 through actual UI save, metadata reload and prepared request', async () => {
    const f = await fixture('anthropic_messages')
    await f.logic.onComposerUpdateWebSearchLayer({ searchMode: 'enable', searchDepth: 'custom', maxResults: 20 })
    expect(f.template().conversation.meta?.webSearchOverride?.maxResults).toBe(20)
    f.bridge.workspace.getSystemTemplate.mockClear()
    await f.logic.onCreateConvo()
    expect(f.bridge.workspace.getSystemTemplate).toHaveBeenCalledTimes(1)
    expect(f.logic.activeSessionWebSearchResolved.value.effectiveMaxResults).toBe(20)
    f.logic.draft.value = 'Synthetic search'
    await f.logic.onSend()
    expect(f.body().tools[0].max_uses).toBe(20)
    expect(f.noTransport).not.toHaveBeenCalled()
  })

  it.each([{ searchContextSize: 'high' }, { engine: 'exa' }])('preserves unsupported authoritative rows on Send (%j)', async unsupported => {
    const f = await fixture('anthropic_messages', { mode: 'provider_search', types: ['web'], maxResults: 5, ...unsupported })
    const before = f.configs.getScope('conversation', 'c1').canonicalJson
    f.logic.draft.value = 'Synthetic search'
    await f.logic.onSend()
    expect(f.bridge.workspace.updateConfig).not.toHaveBeenCalled()
    expect(f.configs.getScope('conversation', 'c1').canonicalJson).toBe(before)
    expect(f.port.initial).toHaveBeenCalledTimes(1)
    expect(f.prepared()).toBeNull()
    expect(f.logic.loadError.value).not.toBeNull()
    expect(f.noTransport).not.toHaveBeenCalled()
    expect(db.prepare('SELECT count(*) AS count FROM generation_operation_v2').get()).toEqual({ count: 0 })
  })
})
