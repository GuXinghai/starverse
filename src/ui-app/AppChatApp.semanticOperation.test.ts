import BetterSqlite3 from 'better-sqlite3'
import { flushPromises, mount, type VueWrapper } from '@vue/test-utils'
import { fireEvent, screen, waitFor } from '@testing-library/vue'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { installGenerationV2TestBridge } from '../../tests/helpers/generationV2Bridge'
import { applyGenerationV2SchemaForTest } from '../../infra/db/v2/testSchemaV2'
import { registerGenerationV2WorkspaceIpc } from '../../electron/ipc/generationV2WorkspaceIpc'
import { registerGenerationV2SourcePriorityConfigIpc } from '../../electron/ipc/generationV2SourcePriorityConfigIpc'
import { ComposerDraftV2Repo } from '../../infra/db/repo/composerDraftV2Repo'
import { SystemChatTemplateV2Repo } from '../../infra/db/repo/systemChatTemplateV2Repo'
import { SourcePriorityConfigV1Repo } from '../../infra/db/repo/sourcePriorityConfigV1Repo'
import { runGenerationV2AuthorityTransactionOnOwnedConnectionV2 } from '../../infra/db/repo/generationV2AuthorityTransactionInternal'
import { listReviewedProviderContractDefinitionsV2 } from '@/core/generation-v2/contracts/providerContractRegistryV2'
import { canonicalizeResolvedCapabilityV2 } from '@/core/generation-v2/capability/resolvedCapabilityV2'
import { projectGenerationCapabilityResolutionV2 } from '@/core/generation-v2/capability/capabilityResolutionV2'
import { MODEL_CAPABILITY_SEMANTIC_PATHS_V2 } from '@/core/generation-v2/capability/modelCapabilitySchemaV2'
import { decodeGenerationIntentLayerV2 } from '@/core/generation-v2/domain/generationIntentV2'
import { resetI18nForTests } from '@/shared/i18n'
import AppChatApp from './AppChatApp.vue'
import ChatAppComposer from './components/ChatAppComposer.vue'

const ok = <T>(value: T) => ({ ok: true as const, value })
const deferred = () => {
  let resolve!: () => void
  return { promise: new Promise<void>(done => { resolve = done }), resolve }
}
const credentialScope = `credential-scope-v2:${'b'.repeat(64)}`
const modelId = 'synthetic/formal-image-model'

// These are validated capability boundary stubs, not live image authority.
// Workspace, composer, config persistence and invalidation commits use real repos.
function capabilityBoundary(request: any) {
  const contract = listReviewedProviderContractDefinitionsV2().find(definition => definition.protocolContractId.value === request.protocolId)!
  const image = request.operation === 'image_generate'
  // OR's current image encoder does not cover image.outputMode.
  const domains: Record<string, readonly string[]> = {
    'reasoning.mode': ['disabled', 'enabled'], 'web.mode': ['disabled'],
    'image.mode': image ? ['disabled', 'generate'] : ['disabled'],
    ...(image ? { 'image.aspectRatio': ['auto', '1:1', '16:9'], 'image.resolution': ['1K', '2K'],
      ...(request.providerId === 'google_ai_studio' ? { 'image.outputMode': ['image_only', 'image_and_text'] } : {}) } : {}),
  }
  const capability = canonicalizeResolvedCapabilityV2({
    binding: { credentialScopeId: request.credentialScopeId, providerId: request.providerId,
      endpointProfileId: request.endpointProfileId, endpointBinding: image && request.providerId === 'openrouter'
        ? { kind: 'pinned', selector: { kind: 'openrouter_images_v1', providerTag: 'synthetic', providerSlug: 'synthetic',
          descriptorRevision: 'descriptor:synthetic', descriptorDigest: 'c'.repeat(64), selectedBy: 'sole_eligible', selectedAt: '2026-10-03T00:00:00.000Z' } }
        : { kind: 'provider_managed_set', endpointSetRevision: 'endpoint-set:synthetic',
          descriptors: [{ endpointId: 'endpoint:synthetic', descriptorRevision: 'descriptor:synthetic' }] },
      protocolContractId: request.protocolId, contractRevision: contract.contractRevision.value,
      contractDefinitionDigest: contract.definitionDigest.value, registryRevision: contract.registryRevision.value,
      modelId: request.modelId, operation: request.operation },
    evidence: [{ evidenceId: 'test.image-boundary', kind: 'official_documentation', effect: 'supports',
      sourceRef: 'https://example.test/synthetic', verifiedAt: '2026-10-03T00:00:00.000Z', contentDigest: 'a'.repeat(64) }],
    fields: MODEL_CAPABILITY_SEMANTIC_PATHS_V2.map(path => domains[path]
      ? { path, state: 'supported', domain: { kind: 'enum', values: domains[path] }, constraints: [], evidenceIds: ['test.image-boundary'] }
      : { path, state: 'missing', constraints: [], evidenceIds: [] }),
    continuation: { kind: 'none', evidenceIds: ['test.image-boundary'] },
  })
  return ok(projectGenerationCapabilityResolutionV2(capability))
}

describe.each(['openrouter', 'google_ai_studio'] as const)('formal %s operation transition with canonical capability boundary stubs', providerId => {
  let db: BetterSqlite3.Database
  let bridge: any
  let conversationId: string
  let wrapper: VueWrapper | null
  let host: HTMLElement
  let handlers: Map<string, any>
  let listeners: Set<(event: any) => void>
  let pendingGates: ReturnType<typeof deferred>[]
  const originalBridge = window.generationV2
  const invoke = (channel: string, payload?: unknown) => handlers.get(channel)!({}, payload)
  const gate = () => { const value = deferred(); pendingGates.push(value); return value }
  const configRows = () => db.prepare('SELECT * FROM generation_config_v2 ORDER BY owner_kind,owner_id').all()
  const conversationSemantics = () => {
    const row = db.prepare("SELECT semantic_json FROM generation_config_v2 WHERE owner_kind='conversation' AND owner_id=?").get(conversationId) as { semantic_json: string }
    return JSON.parse(row.semantic_json)
  }
  const composer = () => wrapper!.findComponent(ChatAppComposer)
  const ready = async (operation: 'text' | 'image_generate') => {
    await waitFor(() => expect(screen.getByTestId('composer-draft')).toBeEnabled())
    await waitFor(() => expect(composer().props('capabilityProjection')?.binding.operation).toBe(operation))
  }
  const emit = async (event: 'updateImageGenerationEnabled' | 'updateImageGenerationResolution' | 'updateImageGenerationAspectRatio', value: unknown) => {
    // This tests mounted root handlers; Google's text-back is not a visible chip action.
    composer().vm.$emit(event, value)
    await Promise.resolve()
  }
  const invalidate = async () => {
    const revision = new SourcePriorityConfigV1Repo(db).get().config.sourcePriorityConfigRevision
    return invoke('generation-v2:model-facts:source-priority:update', { expectedConfigRevision: revision,
      priorities: { provider_native: 1, models_dev: 2, capability_rule: 3 } })
  }
  const seedImageIntent = async () => {
    const current = await bridge.workspace.getConfig('conversation', conversationId)
    await bridge.workspace.updateConfig({ ownerKind: 'conversation', ownerId: conversationId,
      expectedConfigRevision: current.value.configRevision, semanticLayer: { schemaVersion: 2,
        image: { mode: 'generate', outputMode: 'image_only', resolution: '2K', aspectRatio: '16:9', format: 'png', quality: 'high', stream: false } } })
  }

  beforeEach(async () => {
    resetI18nForTests()
    localStorage.setItem('starverse.openRouterTextChat.enabled', '1')
    db = new BetterSqlite3(':memory:')
    applyGenerationV2SchemaForTest(db, process.cwd())
    bridge = installGenerationV2TestBridge()
    handlers = new Map()
    listeners = new Set()
    pendingGates = []
    wrapper = null
    host = document.createElement('div')
    document.body.append(host)
    bridge.onModelFactsSemanticInvalidated = vi.fn((listener: (event: any) => void) => {
      listeners.add(listener)
      return () => listeners.delete(listener)
    })
    const registerInvoke = (channel: string, handler: any) => handlers.set(channel, handler)
    const quiesce = async <T>(_ownerId: string, action: () => T | Promise<T>): Promise<T> => action()
    registerGenerationV2WorkspaceIpc({ db, registerInvoke, nowMs: () => 100,
      runtimeRegistry: { runWithBranchQuiesced: quiesce, runWithConversationQuiesced: quiesce, runWithProjectQuiesced: quiesce } })
    registerGenerationV2SourcePriorityConfigIpc({ db, registerInvoke,
      notifyModelFactsSemanticInvalidated: event => { for (const listener of listeners) listener(event) } })
    const workspace = bridge.workspace
    for (const [method, channel] of [['ensureDefault', 'ensure-default'], ['getSystemTemplate', 'get-system-template'],
      ['getLastFormalConversation', 'get-last-formal-conversation'], ['listProjects', 'list-projects']] as const) {
      workspace[method] = vi.fn(() => invoke(`generation-v2:workspace:${channel}`))
    }
    workspace.listConversations = vi.fn((projectId: string, cursor: unknown = null, limit = 50) => invoke('generation-v2:workspace:list-conversations', { projectId, cursor, limit }))
    workspace.listBranches = vi.fn((id: string, cursor: unknown = null, limit = 50) => invoke('generation-v2:workspace:list-branches', { conversationId: id, cursor, limit }))
    workspace.readBranch = vi.fn((branchId: string, beforeMessageId: string | null = null, limit = 50) => invoke('generation-v2:workspace:read-branch', { branchId, beforeMessageId, limit }))
    workspace.getConfig = vi.fn((ownerKind: string, ownerId: string) => invoke('generation-v2:config:get', { ownerKind, ownerId }))
    workspace.updateConfig = vi.fn((packet: unknown) => invoke('generation-v2:config:update', packet))
    const initial = await workspace.ensureDefault()
    conversationId = (await invoke('generation-v2:workspace:create-conversation', { projectId: initial.value.projectId, title: 'Formal Operation' })).value.conversationId
    workspace.getConversationRoutePreference = vi.fn(async (id: string) => ok({ conversationId: id, revision: 1,
      selection: { schemaVersion: 1, kind: 'provider_model', providerId, modelId } }))
    runGenerationV2AuthorityTransactionOnOwnedConnectionV2(db, context => {
      const template = new SystemChatTemplateV2Repo(db, () => 100)
      template.setLifecycleSettings(context, { startupNavigation: 'restore_last_formal',
        startupTemplateReset: { modelConfig: false, draftAttachments: false }, postSendTemplateReset: 'reset_all' })
      template.setLastFormalConversationId(context, conversationId)
    })
    const drafts = new ComposerDraftV2Repo(db, () => 100)
    const draft = drafts.getOrCreate(conversationId)
    drafts.addUrlReference({ conversationId, expectedRevision: draft.revision, referenceId: 'url:operation',
      referenceRevision: 'url-revision:operation', originalUrl: 'https://example.test/preserved', mediaKind: 'other', declaredMediaType: null })
    bridge.composer.get = vi.fn(async (id: string) => ok(drafts.getOrCreate(id)))
    bridge.composer.updateText = vi.fn(async (packet: any) => ok(drafts.updateText(packet)))
    bridge.credentials.openRouter.getStatus.mockResolvedValue({ ok: true, status: { configured: true,
      credentialRevision: 1, credentialScopeId: credentialScope, profileId: 'openrouter-first-party-v1' } })
    bridge.credentials.googleAIStudio.getStatus.mockResolvedValue({ ok: true, status: { configured: true,
      credentialRevision: 1, credentialScopeId: credentialScope, profileId: 'gemini-developer-api-v1beta' } })
    bridge.capabilities.resolve.mockImplementation(async (request: any) => capabilityBoundary(request))
    bridge.openRouter.images.getEndpointSelection = vi.fn(async (request: any) => {
      decodeGenerationIntentLayerV2(request.semanticIntent)
      return ok({ modelId, credentialScopeId: credentialScope,
      descriptorRowGeneration: 1, endpointSetRevision: 'endpoint-set:synthetic', fetchedAtMs: 100,
      settings: { refreshAfterMs: 100, hardExpireAfterMs: 200, revision: 1 },
      binding: { providerTag: 'synthetic', providerSlug: 'synthetic', selectedBy: 'sole_eligible', bindingGeneration: 1 },
      decision: 'bound', candidates: [] })
    })
    vi.clearAllMocks()
  })

  afterEach(async () => {
    wrapper?.unmount()
    for (const pending of pendingGates) pending.resolve()
    await flushPromises()
    host.remove()
    db.close()
    ;(window as any).generationV2 = originalBridge
    localStorage.removeItem('starverse.openRouterTextChat.enabled')
  })

  it('writes both target operations privately and publishes readiness through the ordinary current watcher', async () => {
    wrapper = mount(AppChatApp, { attachTo: host })
    await ready('text')
    await emit('updateImageGenerationResolution', '2K')
    await waitFor(() => expect(conversationSemantics().image).toMatchObject({ mode: 'generate', resolution: '2K' }))
    await ready('image_generate')
    await emit('updateImageGenerationAspectRatio', '16:9')
    await waitFor(() => expect(conversationSemantics().image.aspectRatio).toBe('16:9'))
    await waitFor(() => expect(composer().props('sessionConfig')?.imageGeneration.aspectRatio).toBe('16:9'))
    await emit('updateImageGenerationEnabled', false)
    await waitFor(() => expect(conversationSemantics().image).toEqual({ mode: 'disabled' }))
    await ready('text')
    bridge.capabilities.resolve.mockClear()
    bridge.openRouter.images.getEndpointSelection.mockClear()
    await emit('updateImageGenerationResolution', '2K')
    await waitFor(() => expect(conversationSemantics().image).toMatchObject({ mode: 'generate', resolution: '2K' }))
    await ready('image_generate')
    await emit('updateImageGenerationAspectRatio', '16:9')
    await waitFor(() => expect(conversationSemantics().image.aspectRatio).toBe('16:9'))
    await waitFor(() => expect(composer().props('sessionConfig')?.imageGeneration.aspectRatio).toBe('16:9'))
    expect(bridge.capabilities.resolve.mock.calls.some(([request]: any[]) => request.operation === 'image_generate' && request.modelId === modelId)).toBe(true)
    if (providerId === 'openrouter') {
      await invalidate()
      await ready('image_generate')
      expect(bridge.openRouter.images.getEndpointSelection).toHaveBeenCalledWith(expect.objectContaining({ modelId,
        semanticIntent: expect.objectContaining({ image: expect.objectContaining({ mode: 'generate', resolution: '2K', aspectRatio: '16:9' }),
          attachments: expect.arrayContaining([expect.objectContaining({ kind: 'url_reference', referenceId: 'url:operation' })]) }) }))
    }
  })

  if (providerId === 'openrouter') it('preserves unexposed persisted image intent and attachments when rebinding a branch during a held normal refresh', async () => {
    await seedImageIntent()
    const secondBranchId = 'branch:synthetic:operation-rebind'
    db.prepare(`INSERT INTO branch_v2(branch_id,conversation_id,head_message_id,name,created_at_ms,updated_at_ms,deleted_at_ms,parent_branch_id)
      VALUES(?,?,NULL,'Second Branch',100,100,NULL,NULL)`).run(secondBranchId, conversationId)
    bridge.workspace.updateConfig.mockClear()
    wrapper = mount(AppChatApp, { attachTo: host })
    await ready('image_generate')
    expect(bridge.openRouter.images.getEndpointSelection).toHaveBeenCalledWith(expect.objectContaining({ modelId,
      semanticIntent: expect.objectContaining({ image: expect.objectContaining({ outputMode: 'image_only', format: 'png', quality: 'high', stream: false,
        aspectRatio: '16:9', resolution: '2K' }),
        attachments: expect.arrayContaining([expect.objectContaining({ kind: 'url_reference', referenceId: 'url:operation' })]) }) }))
    const initialBranchId = (screen.getByTestId('branch-selector') as HTMLSelectElement).value
    const reboundBranchId = initialBranchId === secondBranchId
      ? (db.prepare('SELECT branch_id FROM branch_v2 WHERE conversation_id=? AND branch_id<>?').get(conversationId, secondBranchId) as { branch_id: string }).branch_id
      : secondBranchId
    const oldGate = gate()
    const replacementGate = gate()
    let heldOld = false
    let heldReplacement = false
    let replacement: any
    bridge.capabilities.resolve.mockImplementationOnce(async (request: any) => {
      heldOld = true
      const result = capabilityBoundary(request)
      await oldGate.promise
      return result
    })
    bridge.capabilities.resolve.mockImplementationOnce(async (request: any) => {
      heldReplacement = true
      replacement = capabilityBoundary(request)
      await replacementGate.promise
      return replacement
    })
    await invalidate()
    await waitFor(() => expect(heldOld).toBe(true))
    expect(composer().props('capabilityProjection')).toBeNull()
    await fireEvent.update(screen.getByTestId('branch-selector'), reboundBranchId)
    await waitFor(() => expect(heldReplacement).toBe(true))
    replacementGate.resolve()
    await ready('image_generate')
    const current = composer().props('capabilityProjection')!
    expect(current.capabilityRevision).toBe(replacement.value.controlsProjection.capabilityRevision)
    oldGate.resolve()
    await Promise.resolve()
    await ready('image_generate')
    expect(composer().props('capabilityProjection')).toBe(current)
    expect(bridge.workspace.updateConfig).not.toHaveBeenCalled()
    expect(bridge.openRouter.images.initial).not.toHaveBeenCalled()
  })

  it('keeps current text authority and persisted config intact while target resolution waits, then rejects invalidated target work', async () => {
    wrapper = mount(AppChatApp, { attachTo: host })
    await ready('text')
    const before = configRows()
    const currentRevision = composer().props('capabilityProjection')!.capabilityRevision
    const targetGate = gate()
    let targetRequest: any
    bridge.capabilities.resolve.mockImplementation(async (request: any) => {
      const result = capabilityBoundary(request)
      if (request.operation === 'image_generate') { targetRequest = request; await targetGate.promise }
      return result
    })
    await emit('updateImageGenerationResolution', '2K')
    await waitFor(() => expect(targetRequest?.operation).toBe('image_generate'))
    expect(configRows()).toEqual(before)
    expect(composer().props('capabilityProjection')!.binding.operation).toBe('text')
    expect(composer().props('capabilityProjection')!.capabilityRevision).toBe(currentRevision)
    expect(composer().props('sessionConfig')?.imageGeneration.enabled).toBe(false)
    await invalidate()
    targetGate.resolve()
    await waitFor(() => expect(screen.getByText('GENERATION_V2_CAPABILITY_PROJECTION_STALE')).toBeInTheDocument())
    expect(configRows()).toEqual(before)
    expect(bridge.workspace.updateConfig).not.toHaveBeenCalled()
    await ready('text')
  })
})
