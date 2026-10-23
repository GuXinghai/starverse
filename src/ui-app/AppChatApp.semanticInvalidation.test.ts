import BetterSqlite3 from 'better-sqlite3'
import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/vue'
import { mount, type VueWrapper } from '@vue/test-utils'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { defineComponent, getCurrentInstance, h } from 'vue'
import { installGenerationV2TestBridge } from '../../tests/helpers/generationV2Bridge'
import { applyGenerationV2SchemaForTest } from '../../infra/db/v2/testSchemaV2'
import { registerGenerationV2WorkspaceIpc } from '../../electron/ipc/generationV2WorkspaceIpc'
import { registerGenerationV2SourcePriorityConfigIpc } from '../../electron/ipc/generationV2SourcePriorityConfigIpc'
import { registerGenerationV2UserCapabilityRulesIpc } from '../../electron/ipc/generationV2UserCapabilityRulesIpc'
import { createGenerationV2CapabilityResolutionService } from '../../electron/services/generationV2CapabilityResolutionService'
import { ComposerDraftV2Repo } from '../../infra/db/repo/composerDraftV2Repo'
import { ModelCatalogV2Repo } from '../../infra/db/repo/modelCatalogV2Repo'
import { SystemChatTemplateV2Repo } from '../../infra/db/repo/systemChatTemplateV2Repo'
import { SourcePriorityConfigV1Repo } from '../../infra/db/repo/sourcePriorityConfigV1Repo'
import { ConversationGraphV2Repo } from '../../infra/db/repo/conversationGraphV2Repo'
import { GenerationExecutionV2Repo } from '../../infra/db/repo/generationExecutionV2Repo'
import { runGenerationV2AuthorityTransactionOnOwnedConnectionV2 } from '../../infra/db/repo/generationV2AuthorityTransactionInternal'
import { ProviderCatalogAuthorityRegistryV2 } from '@/core/model-catalog/providerCatalogAuthorityRegistryV2'
import { readReviewedOpenRouterChatDefinitionV2 } from '@/core/generation-v2/contracts/providerContractRegistryV2'
import { canonicalizeUnverifiedRuntimeCapabilitySnapshotV2, decodeRuntimeCapabilitySnapshotV2 } from '@/core/generation-v2/capability/runtimeCapabilitySnapshotV2'
import { MODEL_CAPABILITY_SEMANTIC_PATHS_V2 } from '@/core/generation-v2/capability/modelCapabilitySchemaV2'
import { canonicalizeUnverifiedAssistantAnswerGenerationSnapshotV2, decodeAssistantAnswerGenerationSnapshotV2 } from '@/core/generation-v2/domain/assistantAnswerGenerationSnapshotV2'
import { CatalogQueryService } from '@/next/modelCatalog/catalogQueryService'
import { catalogRuntimeStoreV2ForApp, type CatalogRuntimeStoreV2 } from '@/next/modelCatalog/catalogRuntimeStoreV2'
import { resetI18nForTests } from '@/shared/i18n'
import AppChatApp from './AppChatApp.vue'
import ChatAppComposer from './components/ChatAppComposer.vue'

vi.mock('electron', () => ({ session: { defaultSession: { fetch: vi.fn() } } }))

const ok = <T>(value: T) => ({ ok: true as const, value })
const deferred = <T>() => {
  let resolve!: (value: T) => void
  return { promise: new Promise<T>(done => { resolve = done }), resolve }
}

function renderAppWithCatalogRuntime(): { view: ReturnType<typeof render>; catalogStore: CatalogRuntimeStoreV2<any> } {
  let catalogStore: CatalogRuntimeStoreV2<any> | null = null
  const Harness = defineComponent({
    setup() {
      const appIdentity = getCurrentInstance()?.appContext.app
      if (!appIdentity) throw new Error('TEST_APP_CONTEXT_UNAVAILABLE')
      catalogStore = catalogRuntimeStoreV2ForApp(appIdentity)
      return () => h(AppChatApp)
    },
  })
  const view = render(Harness)
  if (!catalogStore) throw new Error('TEST_CATALOG_RUNTIME_UNAVAILABLE')
  return { view, catalogStore }
}

function publishCatalogAuthority(store: CatalogRuntimeStoreV2<any>, input: Readonly<{
  authorityScopeId: string
  authorityRevision: number
  displayedSnapshotDigest: string
}>): void {
  const token = store.beginQuery('openrouter')
  expect(store.acceptAuthority({ token, ...input, pendingSnapshotDigest: null, items: [], stale: false, failure: null })).toBe(true)
}

const credentialScope = `credential-scope-v2:${'b'.repeat(64)}`
const modelA = 'synthetic/model-A'
const modelB = 'synthetic/model-B'

describe('actual App current semantic invalidation', () => {
  let db: BetterSqlite3.Database
  let bridge: any
  let conversationA: string
  let conversationB: string
  let handlers: Map<string, any>
  let listeners: Set<(event: any) => void>
  let resolveCurrent: (packet: any) => Promise<any>
  let latest: any
  let unsubscribe: () => void
  const originalBridge = window.generationV2
  const originalElectronStore = (globalThis as any).electronStore
  const invoke = (channel: string, payload?: unknown) => handlers.get(channel)!({}, payload)
  const call = async (read: () => any) => {
    try { return ok(await read()) } catch (error) { return { ok: false as const, code: (error as Error).message } }
  }
  const priority = async (native: number, rules: number) => {
    const current = new SourcePriorityConfigV1Repo(db).get().config.sourcePriorityConfigRevision
    return invoke('generation-v2:model-facts:source-priority:update', { expectedConfigRevision: current,
      priorities: { provider_native: native, models_dev: 2, capability_rule: rules } })
  }
  const readyDraft = async () => {
    const input = await screen.findByTestId('composer-draft')
    await waitFor(() => expect(input).toBeEnabled())
    await fireEvent.update(input, 'Synthetic current send')
    await waitFor(() => expect(screen.getByTestId('composer-send')).toBeEnabled())
  }
  const seedFrozenAnswer = () => {
    const branchId = (db.prepare('SELECT branch_id FROM branch_v2 WHERE conversation_id=?').get(conversationA) as any).branch_id
    const projectId = (db.prepare('SELECT project_id FROM conversation_v2 WHERE conversation_id=?').get(conversationA) as any).project_id
    const hash = 'a'.repeat(64)
    const contract = readReviewedOpenRouterChatDefinitionV2()
    const binding = { credentialScopeId: credentialScope, providerId: 'openrouter', endpointProfileId: 'openrouter-first-party-v1',
      endpointBinding: { kind: 'provider_managed_set', endpointSetRevision: 'endpoint-set:historical',
        descriptors: [{ endpointId: 'endpoint:openrouter', descriptorRevision: 'descriptor:historical' }] },
      protocolContractId: contract.protocolContractId.value, contractRevision: contract.contractRevision.value,
      contractDefinitionDigest: contract.definitionDigest.value, registryRevision: contract.registryRevision.value,
      modelId: modelA, operation: 'text' }
    const capability = decodeRuntimeCapabilitySnapshotV2(canonicalizeUnverifiedRuntimeCapabilitySnapshotV2({ schemaVersion: 2,
      resolvedAt: '2026-10-03T00:00:00.000Z', binding, evidence: [{ evidenceId: 'test.frozen', kind: 'official_documentation',
        effect: 'supports', sourceRef: 'https://example.test/synthetic', verifiedAt: '2026-10-03T00:00:00.000Z', contentDigest: hash }],
      fields: MODEL_CAPABILITY_SEMANTIC_PATHS_V2.map(path => ({ path, state: 'missing', constraints: [], evidenceIds: [] })),
      tools: [], continuation: { kind: 'none', evidenceIds: ['test.frozen'] } }))
    db.prepare('INSERT INTO runtime_capability_snapshot_v2 VALUES(?,?,2,?,?,?,1)').run(capability.snapshotHash.value,
      capability.revision.value, capability.canonicalJson, capability.evidenceDigest.value, capability.semanticFieldsDigest.value)
    const questionId = 'semantic:question:frozen'
    const answerRootId = 'semantic:answer:frozen'
    const operationId = 'semantic:operation:frozen'
    const snapshot = decodeAssistantAnswerGenerationSnapshotV2(canonicalizeUnverifiedAssistantAnswerGenerationSnapshotV2({ schemaVersion: 2,
      answerRootId, operationId, semanticIntent: { schemaVersion: 2, generation: {}, reasoning: { mode: 'disabled' }, web: { mode: 'disabled' },
        image: { mode: 'disabled' }, tools: { mode: 'disabled' }, attachments: [], providerExtension: { kind: 'none' } },
      resolvedConfigRevisions: [{ ownerKind: 'global', ownerId: 'global', revision: 'config:global:historical' },
        { ownerKind: 'project', ownerId: projectId, revision: 'config:project:historical' },
        { ownerKind: 'conversation', ownerId: conversationA, revision: 'config:conversation:historical' }], providerBinding: binding,
      capabilityBinding: { capabilityRevision: capability.revision.value, evidenceDigest: capability.evidenceDigest.value,
        semanticFieldsDigest: capability.semanticFieldsDigest.value, snapshotHash: capability.snapshotHash.value },
      attachmentProviderFileBindings: [], toolAuthority: { kind: 'none' } }))
    const graph = new ConversationGraphV2Repo(db)
    const execution = new GenerationExecutionV2Repo(db)
    runGenerationV2AuthorityTransactionOnOwnedConnectionV2(db, context => {
      const pending = graph.beginInitialTurn(context, { operationId, branchId, expectedHeadMessageId: null, questionId,
        answerRootId, userBody: 'Frozen question', createdAtMs: 110 })
      const committed = execution.insertOperationAndSnapshot(context, { operationId, actionKind: 'initial_send', branchId,
        conversationId: conversationA, questionId, sourceAnswerId: null, targetAnswerId: answerRootId,
        snapshot: snapshot.canonicalJson, commandFingerprint: hash, createdAtMs: 110 })
      graph.commitInitialTurnProjection(context, pending)
      db.prepare(`INSERT INTO generation_request_v2(operation_id,request_sequence,answer_root_id,snapshot_hash,provider_id,endpoint_profile_id,
        credential_scope_id,contract_id,model_id,effective_endpoint_id,capability_revision,compiler_ledger_json,compiler_ledger_hash,
        prepared_body_sha256,prepared_body_byte_length,state,created_at_ms,updated_at_ms)
        VALUES(?,1,?,?,'openrouter','openrouter-first-party-v1',?,'openrouter-chat-completions-v1',?,'endpoint:openrouter',?,'[]',?,?,2,'prepared',110,110)`)
        .run(operationId, answerRootId, snapshot.snapshotHash.value, credentialScope, modelA, capability.revision.value, hash, hash)
      graph.compareAndSetStreamingAssistantBody(context, answerRootId, '', 'Frozen failed answer', 111)
      graph.terminalizeAssistantMessage(context, answerRootId, 'failed', null, 111)
      db.prepare(`UPDATE generation_request_v2 SET state='cancelled',updated_at_ms=111,terminal_at_ms=111 WHERE operation_id=?`).run(operationId)
      execution.terminalizeOperation(context, committed.bundle, { state: 'cancelled', errorCode: 'GENERATION_V2_CANCELLED',
        errorMessage: 'Synthetic transport absent' }, 111)
    })
    return { answerRootId, capabilityRevision: capability.revision.value }
  }

  beforeEach(async () => {
    resetI18nForTests()
    localStorage.setItem('starverse.openRouterTextChat.enabled', '1')
    db = new BetterSqlite3(':memory:')
    applyGenerationV2SchemaForTest(db, process.cwd())
    bridge = installGenerationV2TestBridge()
    handlers = new Map()
    listeners = new Set()
    unsubscribe = vi.fn()
    bridge.onModelFactsSemanticInvalidated = vi.fn((listener: (event: any) => void) => {
      listeners.add(listener)
      return () => { listeners.delete(listener); unsubscribe() }
    })
    const registerInvoke = (channel: string, handler: any) => handlers.set(channel, handler)
    const quiesce = async <T>(_ownerId: string, action: () => T | Promise<T>): Promise<T> => action()
    registerGenerationV2WorkspaceIpc({ db, registerInvoke, nowMs: () => 100,
      runtimeRegistry: { runWithBranchQuiesced: quiesce, runWithConversationQuiesced: quiesce, runWithProjectQuiesced: quiesce } })
    const notifyModelFactsSemanticInvalidated = (event: any) => { for (const listener of listeners) listener(event) }
    const credentialService = { getStatus: async (providerKey: string) => ({ providerKey, configured: providerKey === 'openrouter',
      revision: 1, ...(providerKey === 'openrouter' ? { credentialScopeId: credentialScope } : {}) }),
    withCredentialScopeBindingAuthority: async ({ consume }: any) => consume({ assertCurrent: () => undefined }) } as never
    registerGenerationV2SourcePriorityConfigIpc({ db, registerInvoke, notifyModelFactsSemanticInvalidated })
    registerGenerationV2UserCapabilityRulesIpc({ db, registerInvoke, credentialService,
      openAICompatibleCredentialService: {} as never, notifyModelFactsSemanticInvalidated })
    const workspace = bridge.workspace
    for (const [method, channel] of [['ensureDefault', 'ensure-default'], ['getSystemTemplate', 'get-system-template'],
      ['getLastFormalConversation', 'get-last-formal-conversation'], ['listProjects', 'list-projects']] as const) {
      workspace[method] = vi.fn(() => invoke(`generation-v2:workspace:${channel}`))
    }
    workspace.listConversations = vi.fn((projectId: string, cursor: unknown = null, limit = 50) =>
      invoke('generation-v2:workspace:list-conversations', { projectId, cursor, limit }))
    workspace.listBranches = vi.fn((conversationId: string, cursor: unknown = null, limit = 50) =>
      invoke('generation-v2:workspace:list-branches', { conversationId, cursor, limit }))
    workspace.readBranch = vi.fn((branchId: string, beforeMessageId: string | null = null, limit = 50) =>
      invoke('generation-v2:workspace:read-branch', { branchId, beforeMessageId, limit }))
    workspace.getConfig = vi.fn((ownerKind: string, ownerId: string) => invoke('generation-v2:config:get', { ownerKind, ownerId }))
    workspace.updateConfig = vi.fn((packet: unknown) => invoke('generation-v2:config:update', packet))
    const initial = await workspace.ensureDefault()
    conversationA = (await invoke('generation-v2:workspace:create-conversation', { projectId: initial.value.projectId, title: 'Semantic A' })).value.conversationId
    conversationB = (await invoke('generation-v2:workspace:create-conversation', { projectId: initial.value.projectId, title: 'Semantic B' })).value.conversationId
    workspace.getConversationRoutePreference = vi.fn(async (conversationId: string) => ok({ conversationId, revision: 1,
      selection: { schemaVersion: 1, kind: 'provider_model', providerId: 'openrouter', modelId: conversationId === conversationB ? modelB : modelA } }))
    runGenerationV2AuthorityTransactionOnOwnedConnectionV2(db, context => {
      const template = new SystemChatTemplateV2Repo(db, () => 100)
      template.setLifecycleSettings(context, { startupNavigation: 'restore_last_formal',
        startupTemplateReset: { modelConfig: false, draftAttachments: false }, postSendTemplateReset: 'reset_all' })
      template.setLastFormalConversationId(context, conversationA)
    })
    const drafts = new ComposerDraftV2Repo(db, () => 100)
    bridge.composer.get = vi.fn((id: string) => call(() => drafts.getOrCreate(id)))
    bridge.composer.updateText = vi.fn((packet: any) => call(() => drafts.updateText(packet)))
    const registry = ProviderCatalogAuthorityRegistryV2.get('openrouter')!
    const scope = { providerKey: 'openrouter' as const, credentialScopeId: credentialScope, endpointProfileId: registry.endpointProfileId,
      operationContractId: registry.modelsContractId, category: '' }
    const catalog = new ModelCatalogV2Repo(db, () => 100)
    catalog.beginSync(scope, 'synthetic:catalog')
    catalog.commitSync({ scope, attemptId: 'synthetic:catalog', responseDigest: 'c'.repeat(64), observedAtMs: 100, applyMode: 'automatic',
      items: [modelA, modelB].map(modelId => ({ providerKey: 'openrouter', nativeModelId: modelId, modelId,
        modelKey: `openrouter::${modelId}`, displayName: modelId, raw: { schemaVersion: 1, buckets: [{ source: 'models', fetchedAtMs: 100,
          baseUrl: 'https://example.test', payload: { observation: { schemaVersion: 2, providerKey: 'openrouter', nativeModelId: modelId,
            endpointId: registry.endpointProfileId, observedAtMs: 100, rawProviderRecord: { id: modelId,
              architecture: { modality: 'text->text', input_modalities: ['text'], output_modalities: ['text'] }, supported_parameters: ['max_tokens'] },
            facts: {}, provenance: { sourceKind: 'provider_api', sourceLabel: 'synthetic_catalog', observedAtMs: 100, parserVersion: 2 } } } }] } })) })
    for (const credentials of Object.values(bridge.credentials) as any[]) credentials.getStatus.mockResolvedValue({ ok: true, status: {
      apiKeyConfigured: true, credentialRevision: 1, credentialScopeId: credentialScope, profileId: registry.endpointProfileId } })
    const service = createGenerationV2CapabilityResolutionService({ db, credentialService, openAICompatibleCredentialService: {} as never })
    resolveCurrent = async packet => {
      const result = await call(() => service.resolve(packet))
      if (result.ok && packet.modelId === modelA) latest = result.value
      return result
    }
    bridge.capabilities.resolve.mockImplementation(resolveCurrent)
    bridge.openRouter.chat.initial.mockResolvedValue({ ok: false, code: 'SYNTHETIC_NO_TRANSPORT' })
    latest = null
    vi.clearAllMocks()
  })
  afterEach(async () => {
    cleanup()
    await Promise.resolve()
    db.close()
    ;(window as any).generationV2 = originalBridge
    ;(globalThis as any).electronStore = originalElectronStore
    localStorage.removeItem('starverse.openRouterTextChat.enabled')
  })

  it('persists an inherited global search prompt in the first V2 semantic config', async () => {
    ;(globalThis as any).electronStore = {
      get: vi.fn(async (key: string) => key === 'generationV2UiPreferences' ? {
        webSearchDefaults: { searchMode: 'disable', searchPrompt: { mode: 'customText', text: 'global inherited search prompt' } },
      } : undefined),
      set: vi.fn(async () => true),
    }
    render(AppChatApp)
    await readyDraft()
    await fireEvent.click(screen.getByTestId('composer-send'))
    await waitFor(() => expect(bridge.workspace.updateConfig).toHaveBeenCalledWith(expect.objectContaining({
      ownerKind: 'conversation', ownerId: conversationA,
      semanticLayer: expect.objectContaining({ web: expect.objectContaining({ searchPrompt: 'global inherited search prompt' }) }),
    })))
    const persisted = await bridge.workspace.getConfig('conversation', conversationA)
    expect(persisted.semanticLayer?.web?.searchPrompt ?? persisted.value?.semanticLayer?.web?.searchPrompt)
      .toBe('global inherited search prompt')
  })

  it('preserves raw requested parameter values and source when another setting force-saves the semantic layer', async () => {
    const initial = await bridge.workspace.getConfig('conversation', conversationA)
    const seeded = await bridge.workspace.updateConfig({
      ownerKind: 'conversation', ownerId: conversationA,
      expectedConfigRevision: initial.value.configRevision,
      semanticLayer: {
        schemaVersion: 2,
        generation: {},
        reasoning: { mode: 'disabled' },
        web: { mode: 'disabled' },
        image: { mode: 'disabled' },
        tools: { mode: 'disabled' },
        providerExtension: { kind: 'none' },
        requestedParameters: {
          temperature: { mode: 'custom', value: 0.4, source: 'conversation' },
          thinkingEnabled: { mode: 'custom', value: false, source: 'conversation' },
          topP: { mode: 'omit', source: 'conversation' },
        },
      },
    })
    expect(seeded).toMatchObject({ ok: true })
    bridge.workspace.updateConfig.mockClear()

    const host = document.createElement('div')
    document.body.append(host)
    const wrapper: VueWrapper = mount(AppChatApp, { attachTo: host })
    try {
      await readyDraft()
      wrapper.findComponent(ChatAppComposer).vm.$emit('updateWebSearchEnabled', true)

      await waitFor(() => expect(bridge.workspace.updateConfig).toHaveBeenCalledOnce())
      expect(bridge.workspace.updateConfig).toHaveBeenCalledWith(expect.objectContaining({
        ownerKind: 'conversation', ownerId: conversationA,
        semanticLayer: expect.objectContaining({
          requestedParameters: expect.objectContaining({
            temperature: { mode: 'custom', value: 0.4, source: 'conversation' },
            thinkingEnabled: { mode: 'custom', value: false, source: 'conversation' },
            topP: { mode: 'omit', source: 'conversation' },
          }),
        }),
      }))
      const forceSave = await bridge.workspace.updateConfig.mock.results[0]?.value
      expect(forceSave?.ok).toBe(true)

      const persisted = await bridge.workspace.getConfig('conversation', conversationA)
      expect(persisted.value.configRevision).not.toBe(seeded.value.configRevision)
      expect(persisted.value.semanticLayer.web).toMatchObject({ mode: 'provider_search', types: ['web'] })
      expect(persisted.value.semanticLayer.requestedParameters).toMatchObject({
        temperature: { mode: 'custom', value: 0.4, source: 'conversation' },
        thinkingEnabled: { mode: 'custom', value: false, source: 'conversation' },
        topP: { mode: 'omit', source: 'conversation' },
      })
    } finally {
      wrapper.unmount()
      host.remove()
    }
  })

  it('refreshes an unchanged selection after a real priority commit and blocks submission until the current response arrives', async () => {
    const view = render(AppChatApp)
    await readyDraft()
    const oldRevision = latest.controlsProjection.capabilityRevision
    const gate = deferred<void>()
    let held: any
    bridge.capabilities.resolve.mockImplementationOnce(async (packet: any) => { held = await resolveCurrent(packet); await gate.promise; return held })
    await priority(1, 3)
    await waitFor(() => expect(held?.ok).toBe(true))
    expect(screen.getByTestId('composer-send')).toBeDisabled()
    await fireEvent.click(screen.getByTestId('composer-send'))
    expect(bridge.openRouter.chat.initial).not.toHaveBeenCalled()
    expect(held.value.controlsProjection.capabilityRevision).not.toBe(oldRevision)
    gate.resolve()
    await waitFor(() => expect(screen.getByTestId('composer-send')).toBeEnabled())
    await fireEvent.click(screen.getByTestId('composer-send'))
    await waitFor(() => expect(bridge.openRouter.chat.initial).toHaveBeenCalledOnce())
    expect(bridge.openRouter.chat.initial.mock.calls[0][0].expectedCapabilityRevision).toBe(held.value.controlsProjection.capabilityRevision)
    view.unmount()
    expect(unsubscribe).toHaveBeenCalledOnce()
  })

  it('R4-02: re-derives the capability projection after a models.dev source publication event', async () => {
    render(AppChatApp)
    await readyDraft()
    const before = bridge.capabilities.resolve.mock.calls.length
    for (const listener of listeners) listener({ kind: 'model_facts_source', sourceKind: 'models_dev', canonicalSourceRevision: 'latest' })
    await new Promise(resolve => setTimeout(resolve, 0))
    expect(bridge.capabilities.resolve).toHaveBeenCalledTimes(before)
    for (const listener of listeners) listener({ kind: 'model_facts_source', sourceKind: 'models_dev',
      canonicalSourceRevision: `canonical-source-v1:${'c'.repeat(64)}` })
    await waitFor(() => expect(bridge.capabilities.resolve.mock.calls.length).toBeGreaterThan(before))
    await waitFor(() => expect(screen.getByTestId('composer-send')).toBeEnabled())
  })

  it('refreshes unchanged selection after a valid credential event, blocks send while pending, and removes its listener', async () => {
    const view = render(AppChatApp)
    await readyDraft()
    const invalidate = vi.spyOn(CatalogQueryService, 'invalidateProviderRuntimeCache').mockImplementation(() => undefined)
    const baselineResolveCount = bridge.capabilities.resolve.mock.calls.length
    window.dispatchEvent(new CustomEvent('settings:providerCredentialUpdated', { detail: { providerKey: 'not-a-provider' } }))
    await new Promise(resolve => setTimeout(resolve, 0))
    expect(invalidate).not.toHaveBeenCalled()
    expect(bridge.capabilities.resolve).toHaveBeenCalledTimes(baselineResolveCount)

    const gate = deferred<void>()
    let held: any
    bridge.capabilities.resolve.mockImplementationOnce(async (packet: any) => {
      held = await resolveCurrent(packet)
      await gate.promise
      return held
    })
    window.dispatchEvent(new CustomEvent('settings:providerCredentialUpdated', { detail: { providerKey: 'openrouter' } }))
    await waitFor(() => expect(held?.ok).toBe(true))
    expect(invalidate).toHaveBeenCalledWith('openrouter')
    expect(invalidate).toHaveBeenCalledWith('openrouter')
    expect(screen.getByTestId('composer-send')).toBeDisabled()
    await fireEvent.click(screen.getByTestId('composer-send'))
    expect(bridge.openRouter.chat.initial).not.toHaveBeenCalled()

    gate.resolve()
    await waitFor(() => expect(screen.getByTestId('composer-send')).toBeEnabled())
    view.unmount()
    invalidate.mockClear()
    const unmountedResolveCount = bridge.capabilities.resolve.mock.calls.length
    window.dispatchEvent(new CustomEvent('settings:providerCredentialUpdated', { detail: { providerKey: 'openrouter' } }))
    await new Promise(resolve => setTimeout(resolve, 0))
    expect(invalidate).not.toHaveBeenCalled()
    expect(bridge.capabilities.resolve).toHaveBeenCalledTimes(unmountedResolveCount)
    invalidate.mockRestore()
  })

  it('blocks send while the selected catalog authority changes and current capability is pending', async () => {
    const { catalogStore } = renderAppWithCatalogRuntime()
    await readyDraft()
    const baselineCount = bridge.capabilities.resolve.mock.calls.length
    publishCatalogAuthority(catalogStore, {
      authorityScopeId: 'catalog-authority:baseline', authorityRevision: 10, displayedSnapshotDigest: 'a'.repeat(64),
    })
    await waitFor(() => expect(bridge.capabilities.resolve.mock.calls.length).toBeGreaterThan(baselineCount))
    await waitFor(() => expect(screen.getByTestId('composer-send')).toBeEnabled())

    const gate = deferred<void>()
    let held: any
    bridge.capabilities.resolve.mockImplementationOnce(async (packet: any) => {
      held = await resolveCurrent(packet)
      await gate.promise
      return held
    })
    publishCatalogAuthority(catalogStore, {
      authorityScopeId: 'catalog-authority:current', authorityRevision: 11, displayedSnapshotDigest: 'b'.repeat(64),
    })
    await waitFor(() => expect(held?.ok).toBe(true))
    expect(screen.getByTestId('composer-send')).toBeDisabled()
    await fireEvent.click(screen.getByTestId('composer-send'))
    expect(bridge.openRouter.chat.initial).not.toHaveBeenCalled()

    gate.resolve()
    await waitFor(() => expect(screen.getByTestId('composer-send')).toBeEnabled())
  })

  it('ignores catalog sync, query-token, and policy-only changes for capability refresh', async () => {
    const { catalogStore } = renderAppWithCatalogRuntime()
    await readyDraft()
    const baselineCount = bridge.capabilities.resolve.mock.calls.length
    publishCatalogAuthority(catalogStore, {
      authorityScopeId: 'catalog-authority:baseline', authorityRevision: 20, displayedSnapshotDigest: 'c'.repeat(64),
    })
    await waitFor(() => expect(bridge.capabilities.resolve.mock.calls.length).toBeGreaterThan(baselineCount))
    await waitFor(() => expect(screen.getByTestId('composer-send')).toBeEnabled())

    const resolveCount = bridge.capabilities.resolve.mock.calls.length
    catalogStore.beginQuery('openrouter')
    catalogStore.beginMutation('openrouter')
    catalogStore.setPolicy({
      routeKey: 'openrouter',
      effectivePolicy: { startupSyncPolicy: 'never', pickerOpenSyncPolicy: 'never', listApplyMode: 'manual',
        freshnessMs: null, retentionMs: 'never' },
      policySource: 'global',
    })
    await new Promise(resolve => setTimeout(resolve, 0))

    expect(catalogStore.read('openrouter').syncState).toBe('syncing')
    expect(catalogStore.read('openrouter').queryRequestToken).toBeGreaterThan(0)
    expect(catalogStore.read('openrouter').policySource).toBe('global')
    expect(bridge.capabilities.resolve).toHaveBeenCalledTimes(resolveCount)
    expect(screen.getByTestId('composer-send')).toBeEnabled()
  })

  it('fences an older response and finally when two committed revisions arrive out of order', async () => {
    render(AppChatApp)
    await readyDraft()
    const old = deferred<void>()
    const current = deferred<void>()
    let oldValue: any
    let currentValue: any
    bridge.capabilities.resolve.mockImplementationOnce(async (packet: any) => { oldValue = await resolveCurrent(packet); await old.promise; return oldValue })
      .mockImplementationOnce(async (packet: any) => { currentValue = await resolveCurrent(packet); await current.promise; return currentValue })
    await priority(1, 3)
    await waitFor(() => expect(oldValue?.ok).toBe(true))
    await priority(4, 1)
    await waitFor(() => expect(currentValue?.ok).toBe(true))
    old.resolve()
    await Promise.resolve()
    expect(screen.getByTestId('composer-send')).toBeDisabled()
    expect(bridge.openRouter.chat.initial).not.toHaveBeenCalled()
    current.resolve()
    await waitFor(() => expect(screen.getByTestId('composer-send')).toBeEnabled())
    await fireEvent.click(screen.getByTestId('composer-send'))
    await waitFor(() => expect(bridge.openRouter.chat.initial).toHaveBeenCalledOnce())
    expect(bridge.openRouter.chat.initial.mock.calls[0][0].expectedCapabilityRevision).toBe(currentValue.value.controlsProjection.capabilityRevision)
    expect(currentValue.value.controlsProjection.capabilityRevision).not.toBe(oldValue.value.controlsProjection.capabilityRevision)
  })

  it('refreshes after an actual User Rules save and keeps failed current resolution closed without automatic submission', async () => {
    render(AppChatApp)
    await readyDraft()
    const oldRevision = latest.controlsProjection.capabilityRevision
    const opened = await invoke('generation-v2:capability-rules:user:open-draft')
    const changed = await invoke('generation-v2:capability-rules:user:add-rule', { sessionId: opened.sessionId, expectedDraftRevision: opened.draftRevision,
      targetPackId: null, firstPack: { packId: 'pack.synthetic', displayName: 'Synthetic Rules' }, note: null,
      rule: { ruleId: 'rule.web', label: null, description: null, priority: 0, configured: 'on', providerAuthorityId: 'openrouter',
        endpointProfileId: 'openrouter-first-party-v1', selector: { kind: 'exact', nativeModelIds: [modelA] }, evidence: null,
        assertion: { path: 'search.web.support', value: { kind: 'support', value: 'supported' } } } })
    const before = bridge.capabilities.resolve.mock.calls.length
    await invoke('generation-v2:capability-rules:user:save-draft', { sessionId: changed.sessionId, expectedDraftRevision: changed.draftRevision })
    await waitFor(() => expect(bridge.capabilities.resolve.mock.calls.length).toBeGreaterThan(before))
    await waitFor(() => expect(latest.controlsProjection.capabilityRevision).not.toBe(oldRevision))
    await waitFor(() => expect(screen.getByTestId('composer-send')).toBeEnabled())
    expect(latest.controlsProjection.controls['web.mode']).toMatchObject({ state: 'supported' })
    expect(bridge.openRouter.chat.initial).not.toHaveBeenCalled()
    bridge.capabilities.resolve.mockResolvedValueOnce({ ok: false, code: 'SYNTHETIC_CURRENT_FAILURE' })
    await priority(5, 1)
    await waitFor(() => expect(screen.getByTestId('composer-send')).toBeDisabled())
    await fireEvent.click(screen.getByTestId('composer-send'))
    expect(bridge.openRouter.chat.initial).not.toHaveBeenCalled()
  })

  it('does not let a late model-A response enable model-B while its current resolution is pending', async () => {
    render(AppChatApp)
    await readyDraft()
    const older = deferred<void>()
    const newer = deferred<void>()
    let heldA: any
    let heldB: any
    let capturedA = false
    bridge.capabilities.resolve.mockImplementation(async (packet: any) => {
      const result = await resolveCurrent(packet)
      if (packet.modelId === modelA && !capturedA) { capturedA = true; heldA = result; await older.promise }
      if (packet.modelId === modelB) { heldB = result; await newer.promise }
      return result
    })
    await priority(1, 3)
    await waitFor(() => expect(heldA?.ok).toBe(true))
    await fireEvent.click(await screen.findByText('Semantic B'))
    await waitFor(() => expect(heldB?.ok).toBe(true))
    await fireEvent.update(screen.getByTestId('composer-draft'), 'Synthetic selected B send')
    older.resolve()
    await Promise.resolve()
    expect(screen.getByTestId('composer-send')).toBeDisabled()
    expect(bridge.openRouter.chat.initial).not.toHaveBeenCalled()
    newer.resolve()
    await waitFor(() => expect(screen.getByTestId('composer-send')).toBeEnabled())
    expect(screen.getByTestId('current-model-pill')).toHaveTextContent(modelB)
    expect(heldB.value.controlsProjection.binding.modelId).toBe(modelB)
    expect(bridge.openRouter.chat.initial).not.toHaveBeenCalled()
    await waitFor(() => expect(bridge.workspace.setLastFormalConversation).toHaveBeenCalledWith(conversationB))
  })

  // R4-04 (D-6): this test used to require the user to click Send again after a committed rule
  // invalidated a send in progress. The send now waits for the current projection and is
  // re-prepared once; it still never authors config or submits under the old authority.
  it('R4-04: re-prepares an already-started send under the new authority after a committed rule invalidates it', async () => {
    render(AppChatApp)
    await readyDraft()
    const previousRevision = latest.controlsProjection.capabilityRevision
    const beforeConfig = db.prepare('SELECT * FROM generation_config_v2 ORDER BY owner_kind,owner_id').all()
    bridge.workspace.updateConfig.mockClear()
    const flushGate = deferred<void>()
    const resolutionGate = deferred<void>()
    let flushing = false
    let held: any
    const updateText = bridge.composer.updateText.getMockImplementation()!
    bridge.composer.updateText.mockImplementationOnce(async (packet: any) => {
      flushing = true
      await flushGate.promise
      return updateText(packet)
    })
    await fireEvent.click(screen.getByTestId('composer-send'))
    await waitFor(() => expect(flushing).toBe(true))
    bridge.capabilities.resolve.mockImplementationOnce(async (packet: any) => {
      held = await resolveCurrent(packet)
      await resolutionGate.promise
      return held
    })
    const opened = await invoke('generation-v2:capability-rules:user:open-draft')
    const changed = await invoke('generation-v2:capability-rules:user:add-rule', {
      sessionId: opened.sessionId, expectedDraftRevision: opened.draftRevision, targetPackId: null,
      firstPack: { packId: 'pack.send-boundary', displayName: 'Synthetic Send Boundary' }, note: null,
      rule: { ruleId: 'rule.send-boundary', label: null, description: null, priority: 0, configured: 'on',
        providerAuthorityId: 'openrouter', endpointProfileId: 'openrouter-first-party-v1',
        selector: { kind: 'exact', nativeModelIds: [modelA] }, evidence: null,
        assertion: { path: 'search.web.support', value: { kind: 'support', value: 'supported' } } },
    })
    await invoke('generation-v2:capability-rules:user:save-draft', {
      sessionId: changed.sessionId, expectedDraftRevision: changed.draftRevision,
    })
    await waitFor(() => expect(held?.ok).toBe(true))
    expect(screen.getByTestId('composer-send')).toBeDisabled()
    flushGate.resolve()
    await new Promise(resolve => setTimeout(resolve, 50))
    expect(bridge.workspace.updateConfig).not.toHaveBeenCalled()
    expect(db.prepare('SELECT * FROM generation_config_v2 ORDER BY owner_kind,owner_id').all()).toEqual(beforeConfig)
    expect(bridge.openRouter.chat.initial).not.toHaveBeenCalled()
    resolutionGate.resolve()
    await waitFor(() => expect(bridge.openRouter.chat.initial).toHaveBeenCalledOnce())
    expect(screen.queryByText('GENERATION_V2_CAPABILITY_PROJECTION_STALE')).toBeNull()
    expect(bridge.openRouter.chat.initial.mock.calls[0][0].expectedCapabilityRevision).toBe(held.value.controlsProjection.capabilityRevision)
    expect(held.value.controlsProjection.capabilityRevision).not.toBe(previousRevision)
    const authored = db.prepare("SELECT semantic_json FROM generation_config_v2 WHERE owner_kind='conversation' AND owner_id=?").get(conversationA) as { semantic_json: string }
    expect(JSON.parse(authored.semantic_json)).toMatchObject({ reasoning: { mode: 'enabled' }, web: { mode: 'disabled' } })
  })

  it('ignores an old failed resolution after a newer committed revision has become ready', async () => {
    render(AppChatApp)
    await readyDraft()
    const oldGate = deferred<void>()
    let oldStarted = false
    bridge.capabilities.resolve.mockImplementationOnce(async () => {
      oldStarted = true
      await oldGate.promise
      return { ok: false, code: 'SYNTHETIC_OLD_RESOLUTION_FAILURE' }
    })
    await priority(1, 3)
    await waitFor(() => expect(oldStarted).toBe(true))
    await priority(4, 1)
    await waitFor(() => expect(screen.getByTestId('composer-send')).toBeEnabled())
    const currentRevision = latest.controlsProjection.capabilityRevision
    oldGate.resolve()
    await Promise.resolve()
    await waitFor(() => expect(screen.getByTestId('composer-send')).toBeEnabled())
    expect(screen.queryByText('SYNTHETIC_OLD_RESOLUTION_FAILURE')).toBeNull()
    await fireEvent.click(screen.getByTestId('composer-send'))
    await waitFor(() => expect(bridge.openRouter.chat.initial).toHaveBeenCalledOnce())
    expect(bridge.openRouter.chat.initial.mock.calls[0][0].expectedCapabilityRevision).toBe(currentRevision)
  })

  it('keeps a real persisted frozen retry bound to its original revision during a current semantic refresh', async () => {
    const frozen = seedFrozenAnswer()
    bridge.openRouter.chat.retry.mockResolvedValue({ ok: false, code: 'SYNTHETIC_NO_TRANSPORT' })
    render(AppChatApp)
    await screen.findByText('Frozen failed answer')
    await readyDraft()
    const gate = deferred<void>()
    let held: any
    bridge.capabilities.resolve.mockImplementationOnce(async (packet: any) => { held = await resolveCurrent(packet); await gate.promise; return held })
    await priority(1, 3)
    await waitFor(() => expect(held?.ok).toBe(true))
    expect(screen.getByTestId('composer-send')).toBeDisabled()
    const retry = screen.getByTestId(`retry-a-${frozen.answerRootId}`)
    expect(retry).toBeEnabled()
    await fireEvent.click(retry)
    await waitFor(() => expect(bridge.openRouter.chat.retry).toHaveBeenCalledOnce())
    expect(bridge.openRouter.chat.retry.mock.calls[0][0]).toMatchObject({ expectedCapabilityRevision: frozen.capabilityRevision,
      command: { sourceAnswerId: frozen.answerRootId } })
    expect(bridge.openRouter.chat.initial).not.toHaveBeenCalled()
    gate.resolve()
  })
})
