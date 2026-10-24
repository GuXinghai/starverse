import BetterSqlite3 from 'better-sqlite3'
import { nextTick } from 'vue'
import { cleanup, fireEvent, render, screen, waitFor, within } from '@testing-library/vue'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { applyGenerationV2SchemaForTest } from '../../infra/db/v2/testSchemaV2'
import { registerGenerationV2WorkspaceIpc } from '../../electron/ipc/generationV2WorkspaceIpc'
import { registerGenerationV2SearchIpc } from '../../electron/ipc/generationV2SearchIpc'
import type { IpcInvokeHandler } from '../../electron/ipc/types'
import { ComposerDraftV2Repo } from '../../infra/db/repo/composerDraftV2Repo'
import { ConversationGraphV2Repo } from '../../infra/db/repo/conversationGraphV2Repo'
import { ConversationWorkspaceV2Repo } from '../../infra/db/repo/conversationWorkspaceV2Repo'
import { ConversationReadV2Repo } from '../../infra/db/repo/conversationReadV2Repo'
import { GenerationExecutionV2Repo } from '../../infra/db/repo/generationExecutionV2Repo'
import { SystemChatTemplateV2Repo } from '../../infra/db/repo/systemChatTemplateV2Repo'
import { runGenerationV2AuthorityTransactionOnOwnedConnectionV2 } from '../../infra/db/repo/generationV2AuthorityTransactionInternal'
import { canonicalizeUnverifiedRuntimeCapabilitySnapshotV2, decodeRuntimeCapabilitySnapshotV2 } from '@/core/generation-v2/capability/runtimeCapabilitySnapshotV2'
import { MODEL_CAPABILITY_SEMANTIC_PATHS_V2 } from '@/core/generation-v2/capability/modelCapabilitySchemaV2'
import { canonicalizeUnverifiedAssistantAnswerGenerationSnapshotV2, decodeAssistantAnswerGenerationSnapshotV2 } from '@/core/generation-v2/domain/assistantAnswerGenerationSnapshotV2'
import { readReviewedDeepSeekStableChatDefinitionV2 } from '@/core/generation-v2/contracts/providerContractRegistryV2'
import { installGenerationV2TestBridge } from '../../tests/helpers/generationV2Bridge'
import { resetI18nForTests, setLocale, t } from '@/shared/i18n'
import type { useAppChatAppLogic } from './app/appChatApp.logic'
import AppChatApp from './AppChatApp.vue'

// Capture the actual root's returned refs; the mounted component still uses the complete production hook.
const captured = vi.hoisted(() => ({ logic: null as ReturnType<typeof useAppChatAppLogic> | null }))
vi.mock('./app/appChatApp.logic', async importOriginal => {
  const actual = await importOriginal<typeof import('./app/appChatApp.logic')>()
  return { ...actual, useAppChatAppLogic: () => (captured.logic = actual.useAppChatAppLogic()) }
})

const ok = <T>(value: T) => ({ ok: true as const, value })
const deferred = <T>() => { let resolve!: (value: T) => void; return { promise: new Promise<T>(done => { resolve = done }), resolve } }
const sourceConvo = 'conversation:search', sourceBranch = 'branch:root', hash = 'a'.repeat(64)
const originalBridge = (globalThis as any).generationV2
const logic = () => captured.logic!

describe('actual App indexed message search navigation', () => {
  let db: BetterSqlite3.Database, bridge: any, drafts: ComposerDraftV2Repo
  let handlers: Map<string, IpcInvokeHandler>, graph: ConversationGraphV2Repo, workspace: ConversationWorkspaceV2Repo
  let inboxId: string, serial: number, clock: number
  let runtimeCapability: ReturnType<typeof decodeRuntimeCapabilitySnapshotV2> | null
  const invoke = (channel: string, payload?: unknown) => handlers.get(channel)!({}, payload)
  const authority = <T>(action: Parameters<typeof runGenerationV2AuthorityTransactionOnOwnedConnectionV2<T>>[1]) =>
    runGenerationV2AuthorityTransactionOnOwnedConnectionV2(db, action)
  const call = <T>(action: () => T) => { try { return ok(action()) } catch (error) { return { ok: false as const, code: (error as Error).message } } }
  function createConvo(id: string, branchId: string, projectId = inboxId) {
    authority(context => graph.createConversationAndDefaultBranch(context, { projectId, conversationId: id,
      branchId, title: id, branchName: null, createdAtMs: ++clock }))
    drafts.getOrCreate(id)
  }
  function turn(branchId = sourceBranch, conversationId = sourceConvo) {
    const index = ++serial, at = clock += 10, questionId = `search:question:${index}`, answerRootId = `search:answer:${index}`, operationId = `search:operation:${index}`
    const contract = readReviewedDeepSeekStableChatDefinitionV2()
    const binding = { credentialScopeId: 'credential:synthetic', providerId: 'deepseek', endpointProfileId: 'profile:deepseek',
      endpointBinding: { kind: 'provider_managed_set', endpointSetRevision: 'endpoint-set:1', descriptors: [{ endpointId: 'endpoint:deepseek', descriptorRevision: 'descriptor:1' }] },
      protocolContractId: contract.protocolContractId.value, contractRevision: contract.contractRevision.value,
      contractDefinitionDigest: contract.definitionDigest.value, registryRevision: contract.registryRevision.value, modelId: 'deepseek-chat', operation: 'text' }
    // All turns share this immutable capability; operation/answer snapshots remain distinct.
    const capability = runtimeCapability ??= decodeRuntimeCapabilitySnapshotV2(canonicalizeUnverifiedRuntimeCapabilitySnapshotV2({ schemaVersion: 2,
      resolvedAt: '2026-10-03T00:00:00.000Z', binding, evidence: [{ evidenceId: 'test.search', kind: 'official_documentation', effect: 'supports',
        sourceRef: 'https://api-docs.deepseek.com/api/create-chat-completion', verifiedAt: '2026-10-03T00:00:00.000Z', contentDigest: hash }],
      fields: MODEL_CAPABILITY_SEMANTIC_PATHS_V2.map(path => ({ path, state: 'missing', constraints: [], evidenceIds: [] })),
      tools: [], continuation: { kind: 'none', evidenceIds: ['test.search'] } }))
    db.prepare('INSERT OR IGNORE INTO runtime_capability_snapshot_v2 VALUES(?,?,2,?,?,?,1)').run(capability.snapshotHash.value,
      capability.revision.value, capability.canonicalJson, capability.evidenceDigest.value, capability.semanticFieldsDigest.value)
    const project = db.prepare('SELECT project_id AS id FROM conversation_v2 WHERE conversation_id=?').get(conversationId) as { id: string }
    const head = db.prepare('SELECT head_message_id AS id FROM branch_v2 WHERE branch_id=?').get(branchId) as { id: string | null }
    const snapshot = decodeAssistantAnswerGenerationSnapshotV2(canonicalizeUnverifiedAssistantAnswerGenerationSnapshotV2({ schemaVersion: 2, answerRootId, operationId,
      semanticIntent: { schemaVersion: 2, generation: {}, reasoning: { mode: 'disabled' }, web: { mode: 'disabled' }, image: { mode: 'disabled' },
        tools: { mode: 'disabled' }, attachments: [], providerExtension: { kind: 'none' } },
      resolvedConfigRevisions: [{ ownerKind: 'global', ownerId: 'global', revision: 'config:global:1' },
        { ownerKind: 'project', ownerId: project.id, revision: 'config:project:1' }, { ownerKind: 'conversation', ownerId: conversationId, revision: 'config:conversation:1' }], providerBinding: binding,
      capabilityBinding: { capabilityRevision: capability.revision.value, evidenceDigest: capability.evidenceDigest.value,
        semanticFieldsDigest: capability.semanticFieldsDigest.value, snapshotHash: capability.snapshotHash.value }, attachmentProviderFileBindings: [], toolAuthority: { kind: 'none' } }))
    authority(context => {
      const execution = new GenerationExecutionV2Repo(db)
      const pending = graph.beginInitialTurn(context, { operationId, branchId, expectedHeadMessageId: head.id, questionId, answerRootId,
        userBody: `searchneedle${index} searchable question`, createdAtMs: at })
      const committed = execution.insertOperationAndSnapshot(context, { operationId, actionKind: 'initial_send', branchId, conversationId,
        questionId, sourceAnswerId: null, targetAnswerId: answerRootId, snapshot: snapshot.canonicalJson, commandFingerprint: hash, createdAtMs: at })
      graph.commitInitialTurnProjection(context, pending)
      // Persisted synthetic request facts satisfy the actual transcript projection without invoking a provider.
      db.prepare(`INSERT INTO generation_request_v2(operation_id,request_sequence,answer_root_id,snapshot_hash,provider_id,endpoint_profile_id,
        credential_scope_id,contract_id,model_id,effective_endpoint_id,capability_revision,compiler_ledger_json,compiler_ledger_hash,
        prepared_body_sha256,prepared_body_byte_length,state,created_at_ms,updated_at_ms)
        VALUES(?,1,?,?,'deepseek','profile:deepseek','credential:synthetic','deepseek-stable-chat-v1','deepseek-chat','endpoint:deepseek',?,'[]',?,?,2,'prepared',?,?)`)
        .run(operationId, answerRootId, snapshot.snapshotHash.value, capability.revision.value, hash, hash, at, at)
      graph.terminalizeAssistantMessage(context, answerRootId, 'completed', `answerneedle${index} searchable answer`, at + 1)
      db.prepare(`UPDATE generation_request_v2 SET state='cancelled',updated_at_ms=?,terminal_at_ms=? WHERE operation_id=?`).run(at + 1, at + 1, operationId)
      execution.terminalizeOperation(context, committed.bundle, { state: 'cancelled', errorCode: 'GENERATION_V2_CANCELLED', errorMessage: 'Synthetic transport absent' }, at + 1)
    })
    return { questionId, answerRootId }
  }
  function fork(branchId: string, headMessageId: string, sourceBranchId = sourceBranch) {
    authority(context => workspace.forkBranch(context, { sourceBranchId, branchId, headMessageId, name: branchId, createdAtMs: ++clock }))
  }
  async function mount() {
    render(AppChatApp)
    await waitFor(() => expect(logic()?.isReady.value).toBe(true))
    await waitFor(() => expect(logic().activeConvoId.value).toBe(sourceConvo))
    await waitFor(() => expect(screen.getByTestId('composer-draft')).toBeEnabled())
  }
  async function search(query: string) {
    logic().openSearchModal()
    const input = await screen.findByPlaceholderText('Search...')
    const form = input.closest('form')!
    if (screen.getByTestId('search-filters-toggle').getAttribute('aria-expanded') !== 'true') await fireEvent.click(screen.getByTestId('search-filters-toggle'))
    if (screen.getByTestId('search-scope-toggle').getAttribute('aria-expanded') !== 'true') await fireEvent.click(screen.getByTestId('search-scope-toggle'))
    const selects = within(form).getAllByRole('combobox')
    await fireEvent.update(selects[1], '')
    await fireEvent.update(selects[2], '')
    await fireEvent.update(input, query)
    await fireEvent.keyDown(input, { key: 'Enter' })
    await waitFor(() => expect(bridge.search.query).toHaveBeenCalled())
    await waitFor(() => expect(screen.getByTestId('search-result-toolbar')).toBeInTheDocument())
    await waitFor(() => expect(screen.queryByText('Searching...')).toBeNull())
  }
  async function clickHit(id: string) { await fireEvent.click(await screen.findByTestId(`search-hit-${id}`)) }
  async function focused(id: string) {
    await waitFor(() => expect(document.activeElement).toBe(screen.getByTestId(`msg-wrap-${id}`)))
    expect(logic().activeCursorMessageId.value).toBe(id)
    expect(screen.getByRole('search')).toBeInTheDocument()
    expect(screen.getByPlaceholderText('Search...')).toBeInTheDocument()
  }

  beforeEach(async () => {
    resetI18nForTests(); setLocale('en-US'); captured.logic = null; serial = 0; clock = 20
    runtimeCapability = null
    bridge = installGenerationV2TestBridge()
    db = new BetterSqlite3(':memory:'); applyGenerationV2SchemaForTest(db, process.cwd())
    drafts = new ComposerDraftV2Repo(db, () => 10000); graph = new ConversationGraphV2Repo(db); workspace = new ConversationWorkspaceV2Repo(db)
    handlers = new Map()
    const quiesce = async (...args: any[]) => args.at(-1)()
    registerGenerationV2WorkspaceIpc({ db, nowMs: () => 10000, registerInvoke: (channel, handler) => handlers.set(channel, handler),
      runtimeRegistry: { runWithBranchQuiesced: quiesce, runWithConversationQuiesced: quiesce, runWithProjectQuiesced: quiesce } })
    registerGenerationV2SearchIpc({ db, registerInvoke: (channel, handler) => handlers.set(channel, handler) })
    const w = bridge.workspace
    w.ensureDefault = vi.fn(() => invoke('generation-v2:workspace:ensure-default'))
    w.getSystemTemplate = vi.fn(() => invoke('generation-v2:workspace:get-system-template'))
    w.resetSystemTemplate = vi.fn((payload: unknown) => invoke('generation-v2:workspace:reset-system-template', payload))
    w.listProjects = vi.fn(() => invoke('generation-v2:workspace:list-projects'))
    w.listConversations = vi.fn((projectId: string, cursor: unknown = null, limit = 50) => invoke('generation-v2:workspace:list-conversations', { projectId, cursor, limit }))
    w.listBranches = vi.fn((conversationId: string, cursor: unknown = null, limit = 50) => invoke('generation-v2:workspace:list-branches', { conversationId, cursor, limit }))
    w.readBranch = vi.fn((branchId: string, beforeMessageId: string | null = null, limit = 50) => invoke('generation-v2:workspace:read-branch', { branchId, beforeMessageId, limit }))
    w.readSearchTarget = vi.fn((packet: unknown) => invoke('generation-v2:workspace:read-search-target', packet))
    w.getConfig = vi.fn((ownerKind: string, ownerId: string) => invoke('generation-v2:config:get', { ownerKind, ownerId }))
    w.getConversationRoutePreference = vi.fn((conversationId: string) => invoke('generation-v2:workspace:get-conversation-route-preference', { conversationId }))
    w.getLastFormalConversation = vi.fn(() => invoke('generation-v2:workspace:get-last-formal-conversation'))
    w.setLastFormalConversation = vi.fn((conversationId: string) => invoke('generation-v2:workspace:set-last-formal-conversation', { conversationId }))
    w.getMessageCandidateNavigation = vi.fn((branchId: string, messageId: string) => invoke('generation-v2:workspace:get-message-candidate-navigation', { branchId, messageId }))
    bridge.search = { query: vi.fn((packet: unknown) => invoke('generation-v2:search:query', packet)), rebuild: vi.fn(() => invoke('generation-v2:search:rebuild')) }
    bridge.composer.get = vi.fn(async (id: string) => call(() => drafts.getOrCreate(id)))
    bridge.composer.updateText = vi.fn(async (packet: any) => call(() => drafts.updateText(packet)))
    bridge.composer.replaceFromAnswerSnapshot = vi.fn(async (packet: any) => call(() => drafts.openEdit({ ...packet, attachments: [] })))
    bridge.composer.cancelEditSession = vi.fn(async (packet: any) => call(() => drafts.cancelEdit(packet)))
    await w.ensureDefault()
    const template = new SystemChatTemplateV2Repo(db).get(); inboxId = template.conversation.projectId
    createConvo(sourceConvo, sourceBranch)
    await w.setLastFormalConversation(sourceConvo)
    authority(context => new SystemChatTemplateV2Repo(db, () => 10000).setLifecycleSettings(context, {
      startupNavigation: 'restore_last_formal', startupTemplateReset: { modelConfig: false, draftAttachments: false }, postSendTemplateReset: 'reset_all' }))
    vi.stubGlobal('scrollTo', vi.fn())
    Object.defineProperty(HTMLElement.prototype, 'scrollIntoView', { configurable: true, value: vi.fn() })
  })
  afterEach(async () => { cleanup(); await nextTick(); await new Promise(resolve => setTimeout(resolve, 0)); db.close(); vi.restoreAllMocks(); vi.unstubAllGlobals(); (globalThis as any).generationV2 = originalBridge })

  it('opens an indexed old question beyond 50 turns and focuses before cursor publication and modal close', async () => {
    for (let index = 0; index < 55; index++) turn()
    await mount()
    expect(screen.queryByTestId('msg-wrap-search:question:1')).toBeNull()
    const order: string[] = [], originalFocus = HTMLElement.prototype.focus
    vi.spyOn(HTMLElement.prototype, 'focus').mockImplementation(function (this: HTMLElement, options) {
      if (this.dataset.testid === 'msg-wrap-search:question:1') {
        expect(logic().searchModalOpen.value).toBe(true)
        expect(logic().activeCursorMessageId.value).not.toBe('search:question:1')
        order.push('focus'); originalFocus.call(this, options)
      } else originalFocus.call(this, options)
    })
    await search('searchneedle1')
    await clickHit('search:question:1'); await focused('search:question:1')
    expect(order).toEqual(['focus'])
    expect(bridge.workspace.readSearchTarget).toHaveBeenCalledTimes(2)
    expect(logic().activeBranch.value?.id).toBe(sourceBranch)
    expect(db.pragma('foreign_key_check')).toEqual([])
  })

  it('opens a sole eligible inherited branch beyond the first 50 summaries and keeps branch actions usable', async () => {
    const first = turn(), second = turn()
    fork('branch:zz-target', second.answerRootId)
    for (let index = 0; index < 52; index++) fork(`branch:empty:${index}`, first.answerRootId)
    authority(context => workspace.deleteBranch(context, { branchId: sourceBranch, deletedAtMs: 20000 }))
    expect(new ConversationReadV2Repo(db).listBranchPage(sourceConvo).items.map(item => item.branchId)).not.toContain('branch:zz-target')
    await mount(); await search('searchneedle2'); await clickHit(second.questionId); await focused(second.questionId)
    expect(screen.getByTestId('branch-selector')).toHaveValue('branch:zz-target')
    expect(within(screen.getByTestId('branch-selector')).getByRole('option', { name: /branch:zz-target/ })).toBeInTheDocument()
    expect(logic().activeBranch.value).toMatchObject({ id: 'branch:zz-target', headMessageId: second.answerRootId })
    await logic().openQuestionEdit(second.questionId)
    expect(drafts.read(sourceConvo).editSession?.branchId).toBe('branch:zz-target')
    await logic().closeQuestionEdit()
  })

  it('uses current persisted project ownership for a previously indexed answer hit after relocation', async () => {
    const first = turn(); turn()
    authority(context => graph.createProject(context, { projectId: 'project:destination', name: 'Destination', createdAtMs: 20000 }))
    await mount(); await search('answerneedle1')
    expect(screen.getByTestId(`search-hit-${first.answerRootId}`)).toBeInTheDocument()
    authority(context => workspace.moveConversation(context, { conversationId: sourceConvo, projectId: 'project:destination', updatedAtMs: 20001 }))
    await clickHit(first.answerRootId); await focused(first.answerRootId)
    expect(logic().activeProjectId.value).toBe('project:destination')
    expect(logic().activeConvoId.value).toBe(sourceConvo)
    expect(bridge.workspace.readSearchTarget).toHaveBeenCalledTimes(2)
  })

  it('keeps the modal open and does not publish the searched target cursor when its exact DOM node cannot acquire focus', async () => {
    const first = turn(); turn(); await mount(); await search('searchneedle1')
    const originalFocus = HTMLElement.prototype.focus
    bridge.workspace.setLastFormalConversation.mockClear()
    vi.spyOn(HTMLElement.prototype, 'focus').mockImplementation(function (this: HTMLElement, options) {
      if (this.dataset.testid !== `msg-wrap-${first.questionId}`) originalFocus.call(this, options)
    })
    await clickHit(first.questionId)
    expect(await screen.findByTestId('search-target-error')).toHaveTextContent(t('search.errors.openFailed'))
    expect(screen.getByTestId(`search-hit-${first.questionId}`)).toBeEnabled()
    expect(logic().activeCursorMessageId.value).not.toBe(first.questionId)
    expect(document.activeElement).not.toBe(screen.getByTestId(`msg-wrap-${first.questionId}`))
    expect(bridge.workspace.setLastFormalConversation).not.toHaveBeenCalled()
  })

  it.each(['hidden', 'moved'] as const)('rejects a target %s between the initial read and final publication', async change => {
    turn(); createConvo('conversation:target', 'branch:target'); const target = turn('branch:target', 'conversation:target')
    if (change === 'hidden') turn('branch:target', 'conversation:target')
    await mount(); await search('searchneedle2')
    const gate = deferred<void>(), actualRead = bridge.workspace.readSearchTarget.getMockImplementation()!
    bridge.workspace.readSearchTarget.mockImplementationOnce(async (packet: unknown) => { const result = await actualRead(packet); await gate.promise; return result })
    await clickHit(target.questionId)
    await waitFor(() => expect(bridge.workspace.readSearchTarget).toHaveBeenCalledTimes(1))
    if (change === 'hidden') db.prepare('INSERT INTO branch_question_hide_v2 VALUES(?,?,?,?)').run('branch:target', 'conversation:target', target.questionId, 20000)
    else authority(context => { graph.createProject(context, { projectId: 'project:destination', name: 'Destination', createdAtMs: 20000 });
      workspace.moveConversation(context, { conversationId: 'conversation:target', projectId: 'project:destination', updatedAtMs: 20001 }) })
    gate.resolve()
    expect(await screen.findByTestId('search-target-error')).toHaveTextContent(t('search.errors.openFailed'))
    expect(screen.getByTestId(`search-hit-${target.questionId}`)).toBeEnabled()
    expect(document.activeElement).not.toBe(screen.queryByTestId(`msg-wrap-${target.questionId}`))
    expect(logic().activeCursorMessageId.value).not.toBe(target.questionId)
    expect(bridge.workspace.readSearchTarget).toHaveBeenCalledTimes(2)
  })

  it('preserves the suspended edit in the destination before switching to an alternate branch', async () => {
    const source = turn(); createConvo('conversation:target', 'branch:target'); const target = turn('branch:target', 'conversation:target')
    fork('branch:target:alternate', target.answerRootId, 'branch:target')
    const alternate = turn('branch:target:alternate', 'conversation:target')
    const previous = drafts.getOrCreate('conversation:target')
    const compose = drafts.updateText({ conversationId: 'conversation:target', expectedRevision: previous.revision, draftText: 'destination compose retained',
      draftMode: 'compose', editingSourceQuestionId: null, editSessionIdentity: null })
    drafts.openEdit({ conversationId: 'conversation:target', branchId: 'branch:target', expectedRevision: compose.revision, questionId: target.questionId,
      answerRootId: target.answerRootId, draftText: 'destination suspended edit', attachments: [] })
    await mount(); await logic().openQuestionEdit(source.questionId)
    const sourceBefore = drafts.read(sourceConvo)
    await search('searchneedle3'); await clickHit(alternate.questionId); await focused(alternate.questionId)
    expect(drafts.read(sourceConvo)).toEqual(sourceBefore)
    expect(drafts.read('conversation:target')).toMatchObject({ draftText: 'destination compose retained', draftMode: 'compose', editSession: null })
    expect(bridge.composer.cancelEditSession).toHaveBeenCalledTimes(1)
    expect(bridge.composer.cancelEditSession.mock.calls[0][0].conversationId).toBe('conversation:target')
  })

  it('keeps hits and unsaved text actionable when an outgoing CAS conflict is cancelled', async () => {
    const first = turn(); turn(); await mount(); await search('searchneedle1')
    const current = drafts.read(sourceConvo)
    drafts.updateText({ conversationId: sourceConvo, expectedRevision: current.revision, draftText: 'external saved text', draftMode: 'compose', editingSourceQuestionId: null, editSessionIdentity: null })
    await fireEvent.update(screen.getByTestId('composer-draft'), 'unsaved search conflict text')
    await clickHit(first.questionId)
    const panel = await screen.findByTestId('draft-conflict')
    expect(await screen.findByTestId('search-target-error')).toBeInTheDocument()
    expect(screen.getByTestId('draft-conflict-retained-text')).toHaveValue('unsaved search conflict text')
    await fireEvent.click(within(panel).getByRole('button', { name: t('errors.draftConflict.reload') }))
    const confirmation = await screen.findByTestId('draft-conflict-confirmation')
    await fireEvent.click(within(confirmation).getByRole('button', { name: t('common.cancel') }))
    expect(screen.getByTestId(`search-hit-${first.questionId}`)).toBeInTheDocument()
    expect(screen.getByTestId('draft-conflict-retained-text')).toHaveValue('unsaved search conflict text')
    expect(drafts.read(sourceConvo).draftText).toBe('external saved text')
    expect(logic().activeConvoId.value).toBe(sourceConvo)
  })

  it('lets a competing hit win and drops an old callback after modal close and reopen', async () => {
    // Hits in one conversation resolve to its first match, so competing hits live in separate conversations.
    createConvo('conversation:other', 'branch:other')
    const first = turn(), second = turn('branch:other', 'conversation:other'); await mount(); await search('searchneedle')
    const gate = deferred<void>(), actualRead = bridge.workspace.readSearchTarget.getMockImplementation()!
    let gated = false
    bridge.workspace.readSearchTarget.mockImplementation(async (packet: unknown) => {
      const result = await actualRead(packet)
      if (!gated && JSON.stringify(packet).includes(first.questionId)) { gated = true; await gate.promise }
      return result
    })
    await clickHit(first.questionId); await clickHit(second.questionId); await focused(second.questionId)
    gate.resolve(); await nextTick(); await new Promise(resolve => setTimeout(resolve, 0))
    expect(logic().activeCursorMessageId.value).toBe(second.questionId)
    const reopenGate = deferred<void>()
    await search('searchneedle1')
    bridge.workspace.readSearchTarget.mockImplementation(async (packet: unknown) => {
      const result = await actualRead(packet)
      if (JSON.stringify(packet).includes(first.questionId)) await reopenGate.promise
      return result
    })
    await clickHit(first.questionId)
    await fireEvent.click(screen.getByRole('button', { name: /^Close$/ }))
    await search('searchneedle2')
    reopenGate.resolve(); await nextTick(); await new Promise(resolve => setTimeout(resolve, 0))
    expect(screen.getByPlaceholderText('Search...')).toBeInTheDocument()
    expect(screen.getByTestId(`search-hit-${second.questionId}`)).toBeInTheDocument()
    expect(logic().activeCursorMessageId.value).toBe(second.questionId)
    expect(screen.queryByTestId('search-target-error')).toBeNull()
  })

  it('selects the first matching message, shows cyclic 1/n navigation, and wraps in both directions', async () => {
    const first = turn(), second = turn()
    await mount(); await search('searchable')
    await clickHit(second.answerRootId)
    await waitFor(() => expect(screen.getByTestId('search-match-nav-index')).toHaveTextContent('1/4'))
    await focused(first.questionId)
    await fireEvent.click(screen.getByTestId('search-match-nav-prev'))
    await focused(second.answerRootId)
    await waitFor(() => expect(screen.getByTestId('search-match-nav-index')).toHaveTextContent('4/4'))
    await fireEvent.click(screen.getByTestId('search-match-nav-next'))
    await focused(first.questionId)
    await waitFor(() => expect(screen.getByTestId('search-match-nav-index')).toHaveTextContent('1/4'))
    await fireEvent.click(screen.getByTestId('search-match-nav-next'))
    await focused(first.answerRootId)
    await waitFor(() => expect(screen.getByTestId('search-match-nav-index')).toHaveTextContent('2/4'))
  })

  it('limits navigation to the selected message scopes and never treats a title match as a message match', async () => {
    turn(); await mount()
    logic().openSearchModal()
    const input = await screen.findByPlaceholderText('Search...')
    await fireEvent.update(input, 'conversation')
    await fireEvent.click(screen.getByTestId('search-scope-project'))
    await fireEvent.click(screen.getByTestId('search-scope-convo'))
    await fireEvent.keyDown(input, { key: 'Enter' })
    await waitFor(() => expect(screen.getByText('No results.')).toBeInTheDocument())
    await fireEvent.click(screen.getByTestId('search-scope-project'))
    await fireEvent.click(screen.getByTestId('search-scope-convo'))
    await fireEvent.click(screen.getByTestId('search-scope-user'))
    await fireEvent.click(screen.getByTestId('search-scope-assistant'))
    await fireEvent.keyDown(input, { key: 'Enter' })
    await clickHit(sourceConvo)
    expect(screen.getByRole('search')).toBeInTheDocument()
    expect(screen.getByPlaceholderText('Search...')).toBeInTheDocument()
    expect(screen.queryByTestId('search-match-nav')).toBeNull()
    await fireEvent.click(screen.getByTestId('search-close'))
    expect(screen.getByTestId(`convo-title-match-${sourceConvo}`)).toBeVisible()
  })

  // R5-01 (P6a-09): selecting something that cannot be read hands the view back instead of leaving dead state.
  it('restores the open conversation when the selected one cannot be read', async () => {
    createConvo('conversation:unreadable', 'branch:unreadable')
    await mount()
    const real = bridge.workspace.readBranch.getMockImplementation()!
    bridge.workspace.readBranch.mockImplementation((branchId: string, ...rest: unknown[]) =>
      branchId === 'branch:unreadable' ? Promise.resolve({ ok: false, code: 'GENERATION_V2_BRANCH_NOT_FOUND' }) : real(branchId, ...rest))
    await logic().onSelectConvo('conversation:unreadable')
    expect(logic().activeConvoId.value).toBe(sourceConvo)
    expect(logic().activeBranch.value?.id).toBe(sourceBranch)
    expect(logic().loadError.value).toBeTruthy()
  })

  it('does not select a project that a stale search hit names but that no longer exists', async () => {
    await mount()
    logic().openSearchModal()
    await waitFor(() => expect(logic().searchModalOpen.value).toBe(true))
    const before = logic().activeProjectId.value
    const selected = await logic().onSelectSearchHit({ entityType: 'project', entityId: 'project:deleted' } as never)
    expect(selected).toBe(false)
    expect(logic().activeProjectId.value).toBe(before)
  })
})
