import BetterSqlite3 from 'better-sqlite3'
import { nextTick } from 'vue'
import { cleanup, fireEvent, render, screen, waitFor, within } from '@testing-library/vue'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { applyGenerationV2SchemaForTest } from '../../infra/db/v2/testSchemaV2'
import { registerGenerationV2WorkspaceIpc } from '../../electron/ipc/generationV2WorkspaceIpc'
import type { IpcInvokeHandler } from '../../electron/ipc/types'
import { ComposerDraftV2Repo } from '../../infra/db/repo/composerDraftV2Repo'
import { ConversationGraphV2Repo } from '../../infra/db/repo/conversationGraphV2Repo'
import { ConversationWorkspaceV2Repo } from '../../infra/db/repo/conversationWorkspaceV2Repo'
import { GenerationExecutionV2Repo } from '../../infra/db/repo/generationExecutionV2Repo'
import { SystemChatTemplateV2Repo } from '../../infra/db/repo/systemChatTemplateV2Repo'
import { runGenerationV2AuthorityTransactionOnOwnedConnectionV2 } from '../../infra/db/repo/generationV2AuthorityTransactionInternal'
import { canonicalizeUnverifiedRuntimeCapabilitySnapshotV2, decodeRuntimeCapabilitySnapshotV2 } from '@/core/generation-v2/capability/runtimeCapabilitySnapshotV2'
import { MODEL_CAPABILITY_SEMANTIC_PATHS_V2 } from '@/core/generation-v2/capability/modelCapabilitySchemaV2'
import { canonicalizeUnverifiedAssistantAnswerGenerationSnapshotV2, decodeAssistantAnswerGenerationSnapshotV2 } from '@/core/generation-v2/domain/assistantAnswerGenerationSnapshotV2'
import { readReviewedDeepSeekStableChatDefinitionV2 } from '@/core/generation-v2/contracts/providerContractRegistryV2'
import { installGenerationV2TestBridge } from '../../tests/helpers/generationV2Bridge'
import { resetI18nForTests } from '@/shared/i18n'
import type { useAppChatAppLogic } from './app/appChatApp.logic'
import AppChatApp from './AppChatApp.vue'

// Capture the actual root's returned refs; the mounted component still uses the complete production hook.
const captured = vi.hoisted(() => ({ logic: null as ReturnType<typeof useAppChatAppLogic> | null }))
vi.mock('./app/appChatApp.logic', async importOriginal => {
  const actual = await importOriginal<typeof import('./app/appChatApp.logic')>()
  return { ...actual, useAppChatAppLogic: () => (captured.logic = actual.useAppChatAppLogic()) }
})

const ok = <T>(value: T) => ({ ok: true as const, value })
const sourceConvo = 'conversation:search', sourceBranch = 'branch:root', hash = 'a'.repeat(64)
const originalBridge = (globalThis as any).generationV2
const logic = () => captured.logic!

describe('actual App branch fork, rename and delete controls', () => {
  let db: BetterSqlite3.Database, bridge: any, drafts: ComposerDraftV2Repo
  let handlers: Map<string, IpcInvokeHandler>, graph: ConversationGraphV2Repo, workspace: ConversationWorkspaceV2Repo
  let inboxId: string, serial: number, clock: number
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
    const capability = decodeRuntimeCapabilitySnapshotV2(canonicalizeUnverifiedRuntimeCapabilitySnapshotV2({ schemaVersion: 2,
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

  beforeEach(async () => {
    resetI18nForTests(); captured.logic = null; serial = 0; clock = 20
    bridge = installGenerationV2TestBridge()
    db = new BetterSqlite3(':memory:'); applyGenerationV2SchemaForTest(db, process.cwd())
    drafts = new ComposerDraftV2Repo(db, () => 10000); graph = new ConversationGraphV2Repo(db); workspace = new ConversationWorkspaceV2Repo(db)
    handlers = new Map()
    const quiesce = async (...args: any[]) => args.at(-1)()
    registerGenerationV2WorkspaceIpc({ db, nowMs: () => 10000, registerInvoke: (channel, handler) => handlers.set(channel, handler),
      runtimeRegistry: { runWithBranchQuiesced: quiesce, runWithConversationQuiesced: quiesce, runWithProjectQuiesced: quiesce } })
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
    w.forkBranch = vi.fn((sourceBranchId: string, headMessageId: string, name: string | null) => invoke('generation-v2:workspace:fork-branch', { sourceBranchId, headMessageId, name }))
    w.renameBranch = vi.fn((branchId: string, name: string | null) => invoke('generation-v2:workspace:rename-branch', { branchId, name }))
    w.deleteBranch = vi.fn((branchId: string) => invoke('generation-v2:workspace:delete-branch', { branchId }))
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

  const branchRows = () => (db.prepare('SELECT branch_id AS id,name,parent_branch_id AS parent FROM branch_v2 WHERE conversation_id=? AND deleted_at_ms IS NULL ORDER BY branch_id').all(sourceConvo) as any[])
  const options = () => within(screen.getByTestId('branch-selector')).getAllByRole('option').map(option => (option as HTMLOptionElement).value)

  it('forks from the head, activates the new branch and exposes the selector', async () => {
    turn(); await mount()
    expect(screen.queryByTestId('branch-selector')).toBeNull()
    await fireEvent.click(screen.getByTestId('branch-fork'))
    await waitFor(() => expect(options()).toHaveLength(2))
    const rows = branchRows(), created = rows.find(row => row.id !== sourceBranch)!
    expect(created.parent).toBe(sourceBranch)
    await waitFor(() => expect(logic().activeBranchId.value).toBe(created.id))
    expect(screen.getByTestId('branch-selector')).toHaveValue(created.id)
  })

  it('disables fork on an empty branch and delete on the last branch', async () => {
    await mount()
    expect(screen.getByTestId('branch-fork')).toBeDisabled()
    expect(screen.getByTestId('branch-delete')).toBeDisabled()
  })

  it('renames the active branch and keeps the name on cancel', async () => {
    turn(); await mount()
    await fireEvent.click(screen.getByTestId('branch-rename'))
    await fireEvent.update(screen.getByTestId('branch-rename-input'), 'discarded')
    await fireEvent.click(screen.getByTestId('branch-rename-cancel'))
    expect(screen.queryByTestId('branch-rename-form')).toBeNull()
    expect(bridge.workspace.renameBranch).not.toHaveBeenCalled()
    await fireEvent.click(screen.getByTestId('branch-rename'))
    await fireEvent.update(screen.getByTestId('branch-rename-input'), '  Renamed branch  ')
    await fireEvent.click(screen.getByTestId('branch-rename-save'))
    await waitFor(() => expect(screen.queryByTestId('branch-rename-form')).toBeNull())
    expect(bridge.workspace.renameBranch).toHaveBeenCalledWith(sourceBranch, 'Renamed branch')
    expect(branchRows()[0].name).toBe('Renamed branch')
    expect(logic().activeBranch.value?.name).toBe('Renamed branch')
  })

  it('keeps the rename form open and shows the real error when the backend rejects the name', async () => {
    turn(); await mount()
    await fireEvent.click(screen.getByTestId('branch-rename'))
    await fireEvent.update(screen.getByTestId('branch-rename-input'), 'x'.repeat(4097))
    await fireEvent.click(screen.getByTestId('branch-rename-save'))
    await waitFor(() => expect(logic().loadError.value).toBeTruthy())
    expect(screen.getByTestId('branch-rename-form')).toBeInTheDocument()
    expect(branchRows()[0].name).toBeNull()
  })

  it('requires confirmation, supports cancel, and lands on a valid branch after delete', async () => {
    const first = turn(); fork('branch:other', first.answerRootId)
    await mount()
    expect(options()).toContain('branch:other')
    await fireEvent.click(screen.getByTestId('branch-delete'))
    expect(bridge.workspace.deleteBranch).not.toHaveBeenCalled()
    await fireEvent.click(screen.getByTestId('branch-delete-cancel'))
    expect(screen.queryByTestId('branch-delete-confirmation')).toBeNull()
    expect(bridge.workspace.deleteBranch).not.toHaveBeenCalled()
    expect(branchRows()).toHaveLength(2)
    const doomed = logic().activeBranchId.value!
    await fireEvent.click(screen.getByTestId('branch-delete'))
    await fireEvent.click(screen.getByTestId('branch-delete-confirm'))
    await waitFor(() => expect(bridge.workspace.deleteBranch).toHaveBeenCalledWith(doomed))
    const survivor = branchRows().map(row => row.id)
    expect(survivor).toHaveLength(1)
    expect(survivor[0]).not.toBe(doomed)
    await waitFor(() => expect(logic().activeBranchId.value).toBe(survivor[0]))
    expect(screen.queryByTestId('branch-selector')).toBeNull()
    expect(screen.getByTestId('branch-delete')).toBeDisabled()
  })

  it('surfaces a backend delete rejection and keeps the branch active', async () => {
    const first = turn(); fork('branch:other', first.answerRootId)
    await mount()
    bridge.workspace.deleteBranch.mockResolvedValueOnce({ ok: false, code: 'GENERATION_V2_WORKSPACE_BRANCH_HAS_ACTIVE_EDIT' })
    const active = logic().activeBranchId.value
    await fireEvent.click(screen.getByTestId('branch-delete'))
    await fireEvent.click(screen.getByTestId('branch-delete-confirm'))
    await waitFor(() => expect(logic().loadError.value).toContain('BRANCH_HAS_ACTIVE_EDIT'))
    expect(logic().activeBranchId.value).toBe(active)
    expect(branchRows()).toHaveLength(2)
  })
})
