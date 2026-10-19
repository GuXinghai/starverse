import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/vue'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import BetterSqlite3 from 'better-sqlite3'
import { applyGenerationV2SchemaForTest } from '../../infra/db/v2/testSchemaV2'
import { registerGenerationV2WorkspaceIpc } from '../../electron/ipc/generationV2WorkspaceIpc'
import type { IpcInvokeHandler } from '../../electron/ipc/types'
import { ComposerDraftV2Repo } from '../../infra/db/repo/composerDraftV2Repo'
import { SystemChatTemplateV2Repo } from '../../infra/db/repo/systemChatTemplateV2Repo'
import { runGenerationV2AuthorityTransactionOnOwnedConnectionV2 } from '../../infra/db/repo/generationV2AuthorityTransactionInternal'
import { ConversationGraphV2Repo } from '../../infra/db/repo/conversationGraphV2Repo'
import { GenerationExecutionV2Repo } from '../../infra/db/repo/generationExecutionV2Repo'
import { canonicalizeUnverifiedRuntimeCapabilitySnapshotV2, decodeRuntimeCapabilitySnapshotV2 } from '@/core/generation-v2/capability/runtimeCapabilitySnapshotV2'
import { MODEL_CAPABILITY_SEMANTIC_PATHS_V2 } from '@/core/generation-v2/capability/modelCapabilitySchemaV2'
import { canonicalizeUnverifiedAssistantAnswerGenerationSnapshotV2, decodeAssistantAnswerGenerationSnapshotV2 } from '@/core/generation-v2/domain/assistantAnswerGenerationSnapshotV2'
import { readReviewedDeepSeekStableChatDefinitionV2 } from '@/core/generation-v2/contracts/providerContractRegistryV2'
import { installGenerationV2TestBridge } from '../../tests/helpers/generationV2Bridge'
import { resetI18nForTests, t } from '@/shared/i18n'
import AppChatApp from './AppChatApp.vue'

const ok = <T>(value: T) => ({ ok: true as const, value })
const deferred = <T>() => {
  let resolve!: (value: T) => void
  return { promise: new Promise<T>(done => { resolve = done }), resolve: (value: T) => resolve(value) }
}
const originalBridge = (globalThis as any).generationV2

describe('AppChatApp startup recovery with persisted workspace authorities', () => {
  let db: BetterSqlite3.Database
  let bridge: any
  let drafts: ComposerDraftV2Repo
  let template: ReturnType<SystemChatTemplateV2Repo['get']>
  let handlers: Map<string, IpcInvokeHandler>
  const invoke = (channel: string, payload?: unknown) => handlers.get(channel)!({}, payload)
  const settings = (navigation: 'open_new' | 'restore_last_formal' | 'projects_only', resetAttachments = false) => {
    runGenerationV2AuthorityTransactionOnOwnedConnectionV2(db, context => new SystemChatTemplateV2Repo(db, () => 10).setLifecycleSettings(context, {
      startupNavigation: navigation, startupTemplateReset: { modelConfig: false, draftAttachments: resetAttachments },
      postSendTemplateReset: 'reset_all',
    }))
  }
  const ready = async () => {
    await waitFor(() => expect(screen.queryByTestId('workspace-startup-loading')).toBeNull())
    expect(screen.queryByTestId('workspace-startup-error')).toBeNull()
  }
  const persistTurn = (conversationId: string, branchId: string, suffix = 'edit') => {
    const hash = 'a'.repeat(64)
    const contract = readReviewedDeepSeekStableChatDefinitionV2()
    const binding = { credentialScopeId: 'credential:synthetic', providerId: 'deepseek', endpointProfileId: 'profile:deepseek',
      endpointBinding: { kind: 'provider_managed_set', endpointSetRevision: 'endpoint-set:1',
        descriptors: [{ endpointId: 'endpoint:deepseek', descriptorRevision: 'descriptor:1' }] },
      protocolContractId: contract.protocolContractId.value, contractRevision: contract.contractRevision.value,
      contractDefinitionDigest: contract.definitionDigest.value, registryRevision: contract.registryRevision.value,
      modelId: 'deepseek-chat', operation: 'text' }
    const capability = decodeRuntimeCapabilitySnapshotV2(canonicalizeUnverifiedRuntimeCapabilitySnapshotV2({ schemaVersion: 2,
      resolvedAt: '2026-10-03T00:00:00.000Z', binding, evidence: [{ evidenceId: 'test.startup', kind: 'official_documentation',
        effect: 'supports', sourceRef: 'https://api-docs.deepseek.com/api/create-chat-completion',
        verifiedAt: '2026-10-03T00:00:00.000Z', contentDigest: hash }],
      fields: MODEL_CAPABILITY_SEMANTIC_PATHS_V2.map(path => ({ path, state: 'missing', constraints: [], evidenceIds: [] })),
      tools: [], continuation: { kind: 'none', evidenceIds: ['test.startup'] } }))
    db.prepare('INSERT OR IGNORE INTO runtime_capability_snapshot_v2 VALUES(?,?,2,?,?,?,1)').run(capability.snapshotHash.value,
      capability.revision.value, capability.canonicalJson, capability.evidenceDigest.value, capability.semanticFieldsDigest.value)
    const questionId = `startup:question:${suffix}`
    const answerRootId = `startup:answer:${suffix}`
    const operationId = `startup:operation:${suffix}`
    const snapshot = decodeAssistantAnswerGenerationSnapshotV2(canonicalizeUnverifiedAssistantAnswerGenerationSnapshotV2({ schemaVersion: 2,
      answerRootId, operationId, semanticIntent: { schemaVersion: 2, generation: {}, reasoning: { mode: 'disabled' },
        web: { mode: 'disabled' }, image: { mode: 'disabled' }, tools: { mode: 'disabled' }, attachments: [], providerExtension: { kind: 'none' } },
      resolvedConfigRevisions: [{ ownerKind: 'global', ownerId: 'global', revision: 'config:global:1' },
        { ownerKind: 'project', ownerId: template.conversation.projectId, revision: 'config:project:1' },
        { ownerKind: 'conversation', ownerId: conversationId, revision: 'config:conversation:1' }], providerBinding: binding,
      capabilityBinding: { capabilityRevision: capability.revision.value, evidenceDigest: capability.evidenceDigest.value,
        semanticFieldsDigest: capability.semanticFieldsDigest.value, snapshotHash: capability.snapshotHash.value },
      attachmentProviderFileBindings: [], toolAuthority: { kind: 'none' } }))
    const graph = new ConversationGraphV2Repo(db)
    const execution = new GenerationExecutionV2Repo(db)
    runGenerationV2AuthorityTransactionOnOwnedConnectionV2(db, context => {
      const pending = graph.beginInitialTurn(context, { operationId, branchId, expectedHeadMessageId: null, questionId,
        answerRootId, userBody: `Persisted startup question ${suffix}`, createdAtMs: 11 })
      const committed = execution.insertOperationAndSnapshot(context, { operationId, actionKind: 'initial_send', branchId,
        conversationId, questionId, sourceAnswerId: null, targetAnswerId: answerRootId, snapshot: snapshot.canonicalJson,
        commandFingerprint: hash, createdAtMs: 11 })
      graph.commitInitialTurnProjection(context, pending)
      db.prepare(`INSERT INTO generation_request_v2(operation_id,request_sequence,answer_root_id,snapshot_hash,provider_id,endpoint_profile_id,
        credential_scope_id,contract_id,model_id,effective_endpoint_id,capability_revision,compiler_ledger_json,compiler_ledger_hash,
        prepared_body_sha256,prepared_body_byte_length,state,created_at_ms,updated_at_ms)
        VALUES(?,1,?,?,'deepseek','profile:deepseek','credential:synthetic','deepseek-stable-chat-v1','deepseek-chat','endpoint:deepseek',?,'[]',?,?,2,'prepared',11,11)`)
        .run(operationId, answerRootId, snapshot.snapshotHash.value, capability.revision.value, hash, hash)
      graph.terminalizeAssistantMessage(context, answerRootId, 'completed', 'Persisted startup answer', 12)
      db.prepare(`UPDATE generation_request_v2 SET state='cancelled',updated_at_ms=12,terminal_at_ms=12 WHERE operation_id=?`).run(operationId)
      execution.terminalizeOperation(context, committed.bundle, { state: 'cancelled', errorCode: 'GENERATION_V2_CANCELLED',
        errorMessage: 'Synthetic transport absent' }, 12)
    })
    return { questionId, answerRootId }
  }

  beforeEach(async () => {
    resetI18nForTests()
    bridge = installGenerationV2TestBridge()
    db = new BetterSqlite3(':memory:')
    applyGenerationV2SchemaForTest(db, process.cwd())
    drafts = new ComposerDraftV2Repo(db, () => 10)
    handlers = new Map()
    const quiesce = async (...args: any[]) => args.at(-1)()
    registerGenerationV2WorkspaceIpc({ db, nowMs: () => 10, registerInvoke: (channel, handler) => handlers.set(channel, handler),
      runtimeRegistry: { runWithBranchQuiesced: quiesce, runWithConversationQuiesced: quiesce, runWithProjectQuiesced: quiesce } })
    const workspace = bridge.workspace
    workspace.ensureDefault = vi.fn(() => invoke('generation-v2:workspace:ensure-default'))
    workspace.getSystemTemplate = vi.fn(() => invoke('generation-v2:workspace:get-system-template'))
    workspace.resetSystemTemplate = vi.fn((payload: unknown) => invoke('generation-v2:workspace:reset-system-template', payload))
    workspace.listProjects = vi.fn(() => invoke('generation-v2:workspace:list-projects'))
    workspace.listConversations = vi.fn((projectId: string, cursor: unknown = null, limit = 50) =>
      invoke('generation-v2:workspace:list-conversations', { projectId, cursor, limit }))
    workspace.listBranches = vi.fn((conversationId: string, cursor: unknown = null, limit = 50) =>
      invoke('generation-v2:workspace:list-branches', { conversationId, cursor, limit }))
    workspace.readBranch = vi.fn((branchId: string, beforeMessageId: string | null = null, limit = 50) =>
      invoke('generation-v2:workspace:read-branch', { branchId, beforeMessageId, limit }))
    workspace.getConfig = vi.fn((ownerKind: string, ownerId: string) => invoke('generation-v2:config:get', { ownerKind, ownerId }))
    workspace.getConversationRoutePreference = vi.fn((conversationId: string) =>
      invoke('generation-v2:workspace:get-conversation-route-preference', { conversationId }))
    workspace.getLastFormalConversation = vi.fn(() => invoke('generation-v2:workspace:get-last-formal-conversation'))
    workspace.createConversation = vi.fn((projectId: string, title: string) =>
      invoke('generation-v2:workspace:create-conversation', { projectId, title }))
    workspace.deleteConversation = vi.fn((conversationId: string) => invoke('generation-v2:workspace:delete-conversation', { conversationId }))
    bridge.composer.get = vi.fn(async (conversationId: string) => ok(drafts.getOrCreate(conversationId)))
    bridge.composer.updateText = vi.fn(async (input: any) => ok(drafts.updateText(input)))
    await workspace.ensureDefault()
    template = new SystemChatTemplateV2Repo(db).get()
    drafts.updateText({ conversationId: template.conversation.id, expectedRevision: template.draft.revision,
      draftText: 'persisted startup draft', draftMode: 'compose', editingSourceQuestionId: null, editSessionIdentity: null })
    settings('open_new')
    vi.clearAllMocks()
  })

  afterEach(async () => {
    cleanup()
    await new Promise(resolve => setTimeout(resolve, 0))
    db.close()
    ;(globalThis as any).generationV2 = originalBridge
  })

  it.each(['ensureDefault', 'getSystemTemplate', 'listProjects', 'listConversations', 'readBranch', 'composer'] as const)(
    'shows a recoverable error for %s failure and re-reads persisted state on retry', async point => {
      const method = point === 'composer' ? bridge.composer.get : bridge.workspace[point]
      const implementation = method.getMockImplementation()!
      method.mockResolvedValue({ ok: false, code: 'STARTUP_TEST_FAILURE AUDIT_DUMMY_NATIVE_DETAIL' })
      const view = render(AppChatApp)
      expect(await screen.findByTestId('workspace-startup-error')).toHaveTextContent(t('errors.startup.failed'))
      expect(view.container.textContent).not.toContain('AUDIT_DUMMY_NATIVE_DETAIL')
      expect(screen.getByTestId('workspace-startup-settings')).toBeEnabled()
      const input = screen.queryByTestId('composer-draft')
      if (input) expect(input).toBeDisabled()
      method.mockImplementation(implementation)
      await fireEvent.click(screen.getByTestId('workspace-startup-retry'))
      await ready()
      expect(await screen.findByTestId('composer-draft')).toHaveValue('persisted startup draft')
      expect(screen.getByTestId('composer-draft')).toBeEnabled()
      expect(drafts.read(template.conversation.id).draftText).toBe('persisted startup draft')
    },
  )

  it('centers an empty chat and opens all settings from the persistent workspace menu', async () => {
    render(AppChatApp)
    await ready()
    await screen.findByTestId('composer-draft')
    expect(screen.getByTestId('new-chat-welcome')).toBeInTheDocument()
    expect(document.querySelector('[data-composer-position]')).toHaveAttribute('data-composer-position', 'center')
    await fireEvent.click(screen.getByTestId('workspace-menu-trigger'))
    await fireEvent.click(screen.getByTestId('workspace-open-settings'))
    expect(await screen.findByTestId('settings-modal-categorized')).toBeInTheDocument()
    expect(screen.getAllByRole('tab')).toHaveLength(8)
  })

  it('shows missing bridge recovery and opens Settings while workspace actions remain unavailable', async () => {
    delete (globalThis as any).generationV2
    const mountedError = vi.fn()
    render(AppChatApp, { global: { config: { errorHandler: mountedError } } })
    expect(await screen.findByTestId('workspace-startup-error')).toHaveTextContent(t('errors.startup.bridgeUnavailable'))
    await fireEvent.click(screen.getByTestId('workspace-startup-settings'))
    expect(await screen.findByTestId('settings-modal-categorized')).toBeInTheDocument()
    expect(screen.queryByTestId('composer-draft')).toBeNull()
    expect(screen.queryByText(/npm run electron|Missing Generation Compiler/)).toBeNull()
    expect(mountedError).not.toHaveBeenCalled()
  })

  it('coalesces duplicate retry clicks into one initialization attempt', async () => {
    bridge.workspace.ensureDefault.mockResolvedValueOnce({ ok: false, code: 'STARTUP_TEST_FAILURE' })
    render(AppChatApp)
    await screen.findByTestId('workspace-startup-error')
    const gate = deferred<any>()
    bridge.workspace.ensureDefault.mockImplementationOnce(() => gate.promise)
    const button = screen.getByTestId('workspace-startup-retry')
    await Promise.all([fireEvent.click(button), fireEvent.click(button)])
    await waitFor(() => expect(bridge.workspace.ensureDefault).toHaveBeenCalledTimes(2))
    gate.resolve(ok({ projectId: template.conversation.projectId, conversationId: template.conversation.id,
      branchId: template.conversation.branchId, created: false }))
    await ready()
    // refreshProjects may make its existing idempotent ensure call; there was only one retry pipeline.
    expect(bridge.workspace.getSystemTemplate).toHaveBeenCalledTimes(1)
  })

  it('does not repeat an acknowledged startup reset after a later read fails', async () => {
    settings('open_new', true)
    const list = bridge.workspace.listProjects.getMockImplementation()!
    bridge.workspace.listProjects.mockResolvedValue({ ok: false, code: 'STARTUP_PROJECTS_FAILED' })
    render(AppChatApp)
    await screen.findByTestId('workspace-startup-error')
    expect(bridge.workspace.resetSystemTemplate).toHaveBeenCalledTimes(1)
    const afterReset = new SystemChatTemplateV2Repo(db).get()
    expect(afterReset.draft.draftText).toBe('')
    const changed = drafts.updateText({ conversationId: afterReset.conversation.id, expectedRevision: afterReset.draft.revision,
      draftText: 'changed after accepted reset', draftMode: 'compose', editingSourceQuestionId: null, editSessionIdentity: null })
    drafts.addUrlReference({ conversationId: changed.conversationId, expectedRevision: changed.revision,
      referenceId: 'url:post-reset', referenceRevision: 'url-revision:post-reset', originalUrl: 'https://example.test/kept',
      mediaKind: 'other', declaredMediaType: null })
    bridge.workspace.listProjects.mockImplementation(list)
    await fireEvent.click(screen.getByTestId('workspace-startup-retry'))
    await ready()
    expect(bridge.workspace.resetSystemTemplate).toHaveBeenCalledTimes(1)
    expect(new SystemChatTemplateV2Repo(db).get().conversation.templateRevision).toBe(afterReset.conversation.templateRevision)
    expect(drafts.read(changed.conversationId)).toMatchObject({ draftText: 'changed after accepted reset', attachments: [{ kind: 'url_reference' }] })
    expect(screen.getByTestId('composer-draft')).toHaveValue('changed after accepted reset')
  })

  it('keeps a template reset CAS conflict recoverable without recording a false acknowledgement', async () => {
    settings('open_new', true)
    const reset = bridge.workspace.resetSystemTemplate.getMockImplementation()!
    bridge.workspace.resetSystemTemplate.mockImplementationOnce(async (input: any) => {
      runGenerationV2AuthorityTransactionOnOwnedConnectionV2(db, context => new SystemChatTemplateV2Repo(db).updateConfig(context, {
        templateConversationId: input.templateConversationId, expectedTemplateRevision: input.expectedTemplateRevision, meta: null,
      }))
      return reset(input)
    })
    render(AppChatApp)
    await screen.findByTestId('workspace-startup-error')
    expect(drafts.read(template.conversation.id).draftText).toBe('persisted startup draft')
    await fireEvent.click(screen.getByTestId('workspace-startup-retry'))
    await ready()
    expect(bridge.workspace.resetSystemTemplate).toHaveBeenCalledTimes(2)
    expect(drafts.read(template.conversation.id).draftText).toBe('')
  })

  it('distinguishes an intentionally empty projects-only workspace from failure', async () => {
    settings('projects_only')
    render(AppChatApp)
    await ready()
    expect(screen.getByTestId('workspace-startup-empty')).toHaveTextContent(t('errors.startup.empty'))
    expect(screen.queryByTestId('composer-draft')).toBeNull()
    expect(screen.getByTestId('workspace-startup-settings')).toBeEnabled()
    expect(bridge.composer.updateText).not.toHaveBeenCalled()
  })

  it('fences a delayed transcript completion after unmount', async () => {
    const gate = deferred<any>()
    const read = bridge.workspace.readBranch.getMockImplementation()!
    let pending = false
    bridge.workspace.readBranch.mockImplementationOnce(async (...args: any[]) => { pending = true; await gate.promise; return read(...args) })
    const view = render(AppChatApp)
    await waitFor(() => expect(pending).toBe(true))
    view.unmount()
    gate.resolve(null)
    await new Promise(resolve => setTimeout(resolve, 0))
    expect(view.container.textContent).toBe('')
    expect(drafts.read(template.conversation.id).draftText).toBe('persisted startup draft')
  })

  it('waits for the exact persisted edit branch and its draft before becoming ready', async () => {
    settings('restore_last_formal')
    const created = await bridge.workspace.createConversation(template.conversation.projectId, 'Formal edit')
    expect(created.ok).toBe(true)
    const { conversationId, branchId } = created.value
    const editBranchId = `${branchId}:edit`
    const turn = persistTurn(conversationId, branchId)
    db.prepare(`INSERT INTO branch_v2(branch_id,conversation_id,head_message_id,name,created_at_ms,updated_at_ms,deleted_at_ms,parent_branch_id)
      VALUES(?,?,?,'Edit branch',13,13,NULL,?)`).run(editBranchId, conversationId, turn.answerRootId, branchId)
    const current = drafts.getOrCreate(conversationId)
    const edit = drafts.openEdit({ conversationId, branchId: editBranchId, expectedRevision: current.revision,
      questionId: turn.questionId, answerRootId: turn.answerRootId, draftText: 'persisted exact edit draft', attachments: [] })
    runGenerationV2AuthorityTransactionOnOwnedConnectionV2(db, context => new SystemChatTemplateV2Repo(db).setLastFormalConversationId(context, conversationId))
    const gate = deferred<void>()
    const get = bridge.composer.get.getMockImplementation()!
    const read = bridge.workspace.readBranch.getMockImplementation()!
    let transcriptRead = false
    bridge.workspace.readBranch.mockImplementation(async (...args: any[]) => {
      const result = await read(...args)
      if (args[0] === editBranchId && result.ok) transcriptRead = true
      return result
    })
    let waiting = false
    bridge.composer.get.mockImplementation(async (id: string) => {
      if (id === conversationId && transcriptRead) { waiting = true; await gate.promise }
      return get(id)
    })
    render(AppChatApp)
    await waitFor(() => expect(waiting).toBe(true))
    expect(screen.getByTestId('workspace-startup-loading')).toBeInTheDocument()
    const input = screen.queryByTestId('composer-draft')
    if (input) expect(input).toBeDisabled()
    gate.resolve()
    await ready()
    expect(screen.getByTestId('composer-draft')).toHaveValue('persisted exact edit draft')
    expect(screen.getByTestId('branch-selector')).toHaveValue(editBranchId)
    expect(drafts.read(conversationId).editSession).toEqual(edit.editSession)
    expect(bridge.workspace.readBranch).toHaveBeenCalledWith(editBranchId, null, 50)
  })

  it('does not become ready when a conversation is deleted during draft hydration, then retries current authority', async () => {
    settings('restore_last_formal')
    const created = await bridge.workspace.createConversation(template.conversation.projectId, 'Deleted during startup')
    expect(created.ok).toBe(true)
    const { conversationId } = created.value
    runGenerationV2AuthorityTransactionOnOwnedConnectionV2(db, context => new SystemChatTemplateV2Repo(db).setLastFormalConversationId(context, conversationId))
    const gate = deferred<void>()
    const get = bridge.composer.get.getMockImplementation()!
    const read = bridge.workspace.readBranch.getMockImplementation()!
    let transcriptRead = false
    bridge.workspace.readBranch.mockImplementation(async (...args: any[]) => {
      const result = await read(...args)
      if (args[0] === created.value.branchId && result.ok) transcriptRead = true
      return result
    })
    let waiting = false
    bridge.composer.get.mockImplementation(async (id: string) => {
      if (id === conversationId && transcriptRead) { waiting = true; await gate.promise }
      return get(id)
    })
    render(AppChatApp)
    await waitFor(() => expect(waiting).toBe(true))
    expect(await bridge.workspace.deleteConversation(conversationId)).toMatchObject({ ok: true })
    gate.resolve()
    await screen.findByTestId('workspace-startup-error')
    const input = screen.queryByTestId('composer-draft')
    if (input) expect(input).toBeDisabled()
    await fireEvent.click(screen.getByTestId('workspace-startup-retry'))
    await ready()
    expect(screen.getByTestId('composer-draft')).toHaveValue('persisted startup draft')
    expect(db.prepare('SELECT conversation_id FROM conversation_v2 WHERE conversation_id=?').get(conversationId)).toBeUndefined()
  })

  it('blocks retained transcript mutations and navigation when the final draft read fails', async () => {
    settings('restore_last_formal')
    const created = await bridge.workspace.createConversation(template.conversation.projectId, 'Retained transcript')
    expect(created.ok).toBe(true)
    const { conversationId, branchId } = created.value
    const turn = persistTurn(conversationId, branchId, 'retained')
    runGenerationV2AuthorityTransactionOnOwnedConnectionV2(db, context => new SystemChatTemplateV2Repo(db).setLastFormalConversationId(context, conversationId))
    const read = bridge.workspace.readBranch.getMockImplementation()!
    const get = bridge.composer.get.getMockImplementation()!
    let transcriptRead = false
    bridge.workspace.readBranch.mockImplementation(async (...args: any[]) => {
      const result = await read(...args)
      if (args[0] === branchId && result.ok) {
        expect(result.value.turns[0].questionId).toBe(turn.questionId)
        expect(result.value.turns[0].questionBody).toBe('Persisted startup question retained')
        transcriptRead = true
      }
      return result
    })
    bridge.composer.get.mockImplementation(async (id: string) => id === conversationId && transcriptRead
      ? { ok: false, code: 'SYNTHETIC_FINAL_DRAFT_FAILURE' } : get(id))
    render(AppChatApp)
    await screen.findByTestId('workspace-startup-error')
    expect(transcriptRead).toBe(true)
    for (const action of ['toggle-q', 'delete-q', 'confirm-delete-q', 'edit-q', 'regen-q']) {
      const control = screen.queryByTestId(`${action}-${turn.questionId}`)
      if (control) expect(control).toBeDisabled()
    }
    expect(screen.queryByTestId('branch-selector')).toBeNull()
    for (const mutation of [bridge.workspace.setContextFilter, bridge.workspace.clearContextFilter,
      bridge.workspace.truncateFromQuestion, bridge.workspace.forkBranch, bridge.composer.replaceFromAnswerSnapshot]) {
      expect(mutation).not.toHaveBeenCalled()
    }
    for (const candidate of Object.values(bridge) as any[]) {
      if (candidate && typeof candidate.retry === 'function') {
        expect(candidate.retry).not.toHaveBeenCalled()
        expect(candidate.regenerate).not.toHaveBeenCalled()
        expect(candidate.editResend).not.toHaveBeenCalled()
      }
    }
    bridge.composer.get.mockImplementation(get)
    await fireEvent.click(screen.getByTestId('workspace-startup-retry'))
    await ready()
    expect(await screen.findByText('Persisted startup question retained')).toBeInTheDocument()
    expect(screen.getByTestId(`toggle-q-${turn.questionId}`)).toBeEnabled()
    expect(db.prepare('SELECT deleted_at_ms FROM branch_v2 WHERE branch_id=?').get(branchId)).toEqual({ deleted_at_ms: null })
  })

  it('requires manual retry when an edit branch changes between transcript and strict draft reads', async () => {
    settings('restore_last_formal')
    const created = await bridge.workspace.createConversation(template.conversation.projectId, 'Edit branch changed')
    expect(created.ok).toBe(true)
    const { conversationId, branchId } = created.value
    const turn = persistTurn(conversationId, branchId, 'changed')
    const firstBranch = `${branchId}:edit-A`
    const secondBranch = `${branchId}:edit-B`
    for (const child of [firstBranch, secondBranch]) db.prepare(`INSERT INTO branch_v2(branch_id,conversation_id,head_message_id,name,
      created_at_ms,updated_at_ms,deleted_at_ms,parent_branch_id) VALUES(?,?,?,'Edit branch',13,13,NULL,?)`)
      .run(child, conversationId, turn.answerRootId, branchId)
    const initial = drafts.getOrCreate(conversationId)
    const first = drafts.openEdit({ conversationId, branchId: firstBranch, expectedRevision: initial.revision,
      questionId: turn.questionId, answerRootId: turn.answerRootId, draftText: 'edit incarnation A', attachments: [] })
    runGenerationV2AuthorityTransactionOnOwnedConnectionV2(db, context => new SystemChatTemplateV2Repo(db).setLastFormalConversationId(context, conversationId))
    const read = bridge.workspace.readBranch.getMockImplementation()!
    const get = bridge.composer.get.getMockImplementation()!
    const gate = deferred<void>()
    let firstEditTranscript = false
    let waiting = false
    bridge.workspace.readBranch.mockImplementation(async (...args: any[]) => {
      const result = await read(...args)
      if (args[0] === firstBranch && result.ok) firstEditTranscript = true
      return result
    })
    bridge.composer.get.mockImplementation(async (id: string) => {
      if (id === conversationId && firstEditTranscript) { waiting = true; await gate.promise }
      return get(id)
    })
    render(AppChatApp)
    await waitFor(() => expect(waiting).toBe(true))
    const session = first.editSession!
    const restored = drafts.cancelEdit({ conversationId, expectedRevision: first.revision, branchId: session.branchId,
      questionId: session.questionId, answerRootId: session.answerRootId, openedDraftRevision: session.openedDraftRevision })
    const second = drafts.openEdit({ conversationId, branchId: secondBranch, expectedRevision: restored.revision,
      questionId: turn.questionId, answerRootId: turn.answerRootId, draftText: 'edit incarnation B', attachments: [] })
    gate.resolve()
    const error = await screen.findByTestId('workspace-startup-error')
    expect(error).toHaveTextContent(t('errors.startup.interrupted'))
    expect(screen.getByTestId('composer-draft')).toBeDisabled()
    bridge.composer.get.mockImplementation(get)
    await fireEvent.click(screen.getByTestId('workspace-startup-retry'))
    await ready()
    expect(screen.getByTestId('composer-draft')).toHaveValue('edit incarnation B')
    expect(screen.getByTestId('branch-selector')).toHaveValue(secondBranch)
    expect(drafts.read(conversationId).editSession).toEqual(second.editSession)
    expect(bridge.workspace.readBranch).toHaveBeenCalledWith(secondBranch, null, 50)
  })
})
