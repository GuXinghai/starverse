import { defineComponent, h, nextTick } from 'vue'
import { render, waitFor, cleanup, screen, fireEvent, within } from '@testing-library/vue'
import userEvent from '@testing-library/user-event'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import BetterSqlite3 from 'better-sqlite3'
import { applyGenerationV2SchemaForTest } from '../../infra/db/v2/testSchemaV2'
import { ComposerDraftV2Repo } from '../../infra/db/repo/composerDraftV2Repo'
import { AttachmentAssetV2Repo } from '../../infra/db/repo/attachmentAssetV2Repo'
import { installGenerationV2TestBridge } from '../../tests/helpers/generationV2Bridge'
import { useAppChatAppLogic } from './app/appChatApp.logic'
import { DEFAULT_OPENROUTER_TEST_MODEL } from '@/next/openrouter/openRouterTestModels'
import AppChatApp from './AppChatApp.vue'
import { t } from '@/shared/i18n'

const ok = <T>(value: T) => ({ ok: true as const, value })
const deferred = <T>() => {
  let resolve!: (value: T) => void
  const promise = new Promise<T>(done => { resolve = done })
  return { promise, resolve }
}

describe('workspace composer scope ownership', () => {
  let bridge: any
  let db: BetterSqlite3.Database
  let logic: ReturnType<typeof useAppChatAppLogic>
  let existing: Set<string>
  const originalElectronApi = (globalThis as any).electronAPI
  const branchFor = (id: string) => `branch:${id}`
  const viewFor = (branchId: string) => {
    const conversationId = branchId.includes('template') ? 'template' : branchId.includes('B') ? 'B' : 'A'
    return { branchId, conversationId, projectId: 'inbox', title: conversationId, branchName: null,
      headMessageId: conversationId === 'template' ? null : `answer:${conversationId}`,
      beforeMessageId: null, hasMoreTurns: false, turns: conversationId === 'template' ? [] : [{
        questionId: `question:${conversationId}`, questionBody: `question body ${conversationId}`, questionCreatedAtMs: 1,
        chosenAnswerRootId: `answer:${conversationId}`,
        contextFilter: { questionMode: 'include', answerMode: 'include', effectiveMode: 'include', lockedByQuestionExclude: false },
        answers: [{ answerRootId: `answer:${conversationId}`, status: 'completed', body: `answer body ${conversationId}`,
          updatedAtMs: 2, chosen: true, operationId: `operation:${conversationId}`, actionKind: 'initial',
          modelId: DEFAULT_OPENROUTER_TEST_MODEL, providerId: 'openrouter', errorCode: null, errorMessage: null,
          endpointProfileId: 'openrouter-first-party-v1', protocolContractId: 'openrouter-chat-completions-v1',
          capabilityRevision: 'capability-v2:test', reasoningDetails: [], attachments: [], images: [] }],
      }] }
  }
  const readDraft = async (id: string) => (await bridge.composer.get(id)).value!
  const editIdentityFor = (session: any) => ({ branchId: session.branchId, questionId: session.questionId,
    answerRootId: session.answerRootId, openedDraftRevision: session.openedDraftRevision })
  const mountLogic = async () => {
    const mounted = render(defineComponent({ setup() { logic = useAppChatAppLogic(); return () => h('div') } }))
    await waitFor(() => expect(logic.isReady.value).toBe(true))
    await waitFor(() => expect(logic.draft.value).not.toBe(''))
    return mounted
  }
  const select = async (id: string) => {
    await logic.onSelectConvo(id)
    await waitFor(() => expect(logic.activeConvoId.value).toBe(id))
    await waitFor(() => expect(!logic.isDraftInteractionLocked.value || logic.activeDraftConflict.value !== null).toBe(true))
  }

  beforeEach(async () => {
    bridge = installGenerationV2TestBridge()
    db = new BetterSqlite3(':memory:')
    applyGenerationV2SchemaForTest(db, process.cwd())
    db.prepare("INSERT INTO project_v2 VALUES('inbox','Inbox',1,1)").run()
    for (const id of ['A', 'B', 'template']) {
      db.prepare('INSERT INTO conversation_v2 VALUES(?,?,?,1,1)').run(id, 'inbox', id)
      db.prepare('INSERT INTO branch_v2 VALUES(?,?,NULL,NULL,1,1,NULL,NULL)').run(branchFor(id), id)
      if (id !== 'template') {
        db.prepare(`INSERT INTO message_v2(message_id,conversation_id,introduced_in_branch_id,role,status,parent_message_id,
          question_id,answer_root_id,ordinal,created_at_ms,updated_at_ms)
          VALUES(?,?,?,'user','completed',NULL,NULL,NULL,1,2,2)`).run(`question:${id}`, id, branchFor(id))
        db.prepare(`INSERT INTO message_v2(message_id,conversation_id,introduced_in_branch_id,role,status,parent_message_id,
          question_id,answer_root_id,ordinal,created_at_ms,updated_at_ms)
          VALUES(?,?,?,'assistant','completed',?,?,?,2,3,3)`).run(`answer:${id}`, id, branchFor(id), `question:${id}`, `question:${id}`, `answer:${id}`)
        db.prepare('UPDATE branch_v2 SET head_message_id=? WHERE branch_id=?').run(`answer:${id}`, branchFor(id))
      }
      db.prepare('INSERT INTO branch_v2 VALUES(?,?,?,NULL,1,1,NULL,?)').run(`${branchFor(id)}:other`, id,
        id === 'template' ? null : `answer:${id}`, branchFor(id))
    }
    const composer = new ComposerDraftV2Repo(db, () => 10)
    for (const id of ['A', 'B', 'template']) composer.getOrCreate(id)
    const call = <T>(action: () => T) => {
      try { return ok(action()) } catch (error) { return { ok: false as const, code: (error as Error).message } }
    }
    bridge.composer.get = vi.fn(async (id: string) => call(() => composer.getOrCreate(id)))
    bridge.composer.updateText = vi.fn(async (input: any) => call(() => composer.updateText(input)))
    bridge.composer.replaceFromAnswerSnapshot = vi.fn(async (input: any) => call(() => composer.openEdit({ ...input, attachments: [] })))
    bridge.composer.cancelEditSession = vi.fn(async (input: any) => call(() => composer.cancelEdit(input)))
    bridge.composer.clearCommitted = vi.fn(async (input: any) => call(() => composer.clearCommitted(input)))
    const assets = new AttachmentAssetV2Repo(db, () => 10)
    let attachmentSequence = 0
    bridge.composer.importLocal = vi.fn(async (input: any) => call(() => {
      const attachmentId = ++attachmentSequence
      const blob = assets.recordBlobFromBytes(new TextEncoder().encode(`fixture ${attachmentId}`), 'text/plain')
      assets.createAsset({ assetId: `asset:${attachmentId}`, assetKind: 'file', filename: `fixture-${attachmentId}.txt`, sourceKind: 'user_import' })
      const source = assets.appendSourceRevision({ assetId: `asset:${attachmentId}`, assetRevisionId: `revision:${attachmentId}`, blob })
      return composer.addAttachment({ conversationId: input.conversationId, expectedRevision: input.expectedRevision,
        attachment: { kind: 'managed_file', assetId: source.assetId.value, assetRevisionId: source.assetRevisionId.value,
          assetSha256: source.blob.sha256.value, include: true, sendAs: 'provider_file', conversion: 'none' } })
    }))
    existing = new Set(['A', 'B'])
    localStorage.setItem('starverse.openRouterTextChat.enabled', '1')
    const baseTemplate = bridge.workspace.getSystemTemplate.getMockImplementation()!
    bridge.workspace.getSystemTemplate.mockImplementation(async () => {
      const result = await baseTemplate()
      return ok({ ...result.value, conversation: { ...result.value.conversation, id: 'template',
        projectId: 'inbox', branchId: branchFor('template') }, draft: await readDraft('template'),
        settings: { ...result.value.settings, startupNavigation: 'restore_last_formal' as const } })
    })
    bridge.workspace.ensureDefault.mockResolvedValue(ok({ projectId: 'inbox', conversationId: 'template',
      branchId: branchFor('template'), created: false }))
    bridge.workspace.listProjects.mockResolvedValue(ok([{ projectId: 'inbox', name: 'Inbox', createdAtMs: 1, updatedAtMs: 1 }]))
    bridge.workspace.getLastFormalConversation.mockResolvedValue(ok({ conversationId: 'A' }))
    bridge.workspace.listConversations.mockImplementation(async () => ok({ items: [...existing].map(id => ({
      conversationId: id, projectId: 'inbox', title: id, updatedAtMs: id === 'A' ? 2 : 3,
      branches: [{ branchId: branchFor(id), name: null, headMessageId: `answer:${id}`, updatedAtMs: 2 }], branchesHasMore: false,
    })), nextCursor: null, totalCount: existing.size }))
    bridge.workspace.listBranches.mockImplementation(async (id: string) => ok({ items: [branchFor(id), `${branchFor(id)}:other`].map(branchId => ({
      branchId, name: null, headMessageId: `answer:${id}`, updatedAtMs: 2,
    })), nextCursor: null, totalCount: 2 }))
    bridge.workspace.readBranch.mockImplementation(async (branchId: string) => ok(viewFor(branchId)))
    bridge.workspace.getConversationRoutePreference.mockImplementation(async (id: string) => ok({
      conversationId: id, revision: 1, selection: { schemaVersion: 1, kind: 'provider_model',
        providerId: 'openrouter', modelId: DEFAULT_OPENROUTER_TEST_MODEL },
    }))
    bridge.workspace.deleteConversation.mockImplementation(async (id: string) => { existing.delete(id); return ok({}) })
    for (const id of ['A', 'B', 'template']) await bridge.composer.updateText({ conversationId: id,
      expectedRevision: 0, draftText: `draft ${id}`, draftMode: 'compose', editingSourceQuestionId: null, editSessionIdentity: null })
  })
  afterEach(async () => { cleanup(); await new Promise(resolve => setTimeout(resolve, 0)); db.close(); localStorage.removeItem('starverse.openRouterTextChat.enabled'); (globalThis as any).electronAPI = originalElectronApi })

  const selectedFiles = (count = 1) => ({ filePaths: Array.from({ length: count }, (_, i) => `C:/fixtures/file-${i}.txt`),
    fileGrants: Array.from({ length: count }, (_, i) => ({ filePath: `C:/fixtures/file-${i}.txt`, token: `grant:${i}`, expiresAtMs: 9999 })) })

  it.each(['initial', 'regenerate', 'retry', 'editResend'] as const)('owns delayed %s errors across A-B-A navigation', async kind => {
    await mountLogic()
    if (kind === 'editResend') await logic.openQuestionEdit('question:A')
    const gate = deferred<any>()
    bridge.openRouter.chat[kind].mockImplementationOnce(() => gate.promise)
    const action = kind === 'initial' ? logic.onSend() : kind === 'regenerate' ? logic.onRegenerateFromQuestion('question:A')
      : kind === 'retry' ? logic.onRetryReplaceAnswer('question:A', 'answer:A') : logic.submitQuestionEdit()
    await waitFor(() => expect(bridge.openRouter.chat[kind]).toHaveBeenCalled())
    await select('B')
    await logic.onSelectConvo('A')
    await waitFor(() => expect(logic.activeConvoId.value).toBe('A'))
    gate.resolve({ ok: false, code: 'OLD_CHAT_FAILURE' })
    await action
    expect(logic.loadError.value).toBeNull()
  })

  it('keeps subscription failures global across chat navigation', async () => {
    bridge.runtime.subscribe.mockRejectedValueOnce(new Error('WORKSPACE_CONNECTION_FAILURE'))
    await mountLogic()
    await waitFor(() => expect(logic.loadError.value).toBe('WORKSPACE_CONNECTION_FAILURE'))
    await select('B')
    expect(logic.loadError.value).toBe('WORKSPACE_CONNECTION_FAILURE')
  })

  it('does not show a background operation synchronization error in another chat', async () => {
    bridge.runtime.subscribe.mockResolvedValueOnce(ok([{ binding: { operationId: 'operation:A', conversationId: 'A',
      branchId: branchFor('A'), targetAnswerId: 'answer:A', sourceAnswerId: null, snapshotHash: 'a'.repeat(64),
      providerId: 'openrouter', contractId: 'openrouter-chat-completions-v1' }, status: 'completed', body: 'answer body A',
      reasoning: [], images: [], lastSequence: 1, errorFact: null, updatedAtMs: 2 }]))
    await mountLogic()
    await select('B')
    const receive = bridge.runtime.onEvent.mock.calls[0][0]
    receive({ operationId: 'operation:A', sequence: 3, payload: { type: 'assistant_body', content: 'gap' } })
    await waitFor(() => expect(bridge.runtime.snapshot).toHaveBeenCalledWith('operation:A'))
    await new Promise(resolve => setTimeout(resolve, 0))
    expect(logic.loadError.value).toBeNull()
    await select('A')
    receive({ operationId: 'operation:A', sequence: 4, payload: { type: 'assistant_body', content: 'gap again' } })
    await waitFor(() => expect(logic.loadError.value).toBe('GENERATION_V2_RUNTIME_EVENT_SEQUENCE_GAP'))
    await select('B')
    expect(logic.loadError.value).toBeNull()
  })

  it('clears a current chat error on another branch and when starting a new send', async () => {
    await mountLogic()
    bridge.openRouter.chat.initial.mockResolvedValueOnce({ ok: false, code: 'FIRST_FAILURE' })
    await logic.onSend()
    expect(logic.loadError.value).toBe('FIRST_FAILURE')
    await logic.onSelectBranch('branch:A:other')
    expect(logic.loadError.value).toBeNull()
    bridge.openRouter.chat.initial.mockResolvedValueOnce({ ok: false, code: 'SECOND_FAILURE' })
    await logic.onSend()
    expect(logic.loadError.value).toBe('SECOND_FAILURE')
    const gate = deferred<any>()
    bridge.openRouter.chat.initial.mockImplementationOnce(() => gate.promise)
    const sending = logic.onSend()
    await waitFor(() => expect(logic.loadError.value).toBeNull())
    gate.resolve({ ok: false, code: 'NEW_FAILURE' })
    await sending
  })

  // P4b-01 (R3-07): this test used to submit a second same-page regenerate
  // while the first was in flight, which is the reported defect. The second
  // click is now ignored, so the only failure shown is the first one.
  it('P4b-01: ignores a second same-page regenerate while the first is in flight and reports the first failure', async () => {
    await mountLogic()
    const first = deferred<any>()
    bridge.openRouter.chat.regenerate.mockImplementationOnce(() => first.promise)
    const a = logic.onRegenerateFromQuestion('question:A')
    await waitFor(() => expect(bridge.openRouter.chat.regenerate).toHaveBeenCalledTimes(1))
    await logic.onRegenerateFromQuestion('question:A')
    expect(bridge.openRouter.chat.regenerate).toHaveBeenCalledTimes(1)
    first.resolve({ ok: false, code: 'FIRST_FAILURE' }); await a
    expect(logic.loadError.value).toBe('FIRST_FAILURE')
  })

  it('R4-04: re-prepares a stale edit-resend once with a fresh operation and surfaces a second stale result', async () => {
    await mountLogic()
    await logic.openQuestionEdit('question:A')
    bridge.openRouter.chat.editResend.mockResolvedValue({ ok: false, code: 'STALE_CAPABILITY_REVISION' })
    await logic.submitQuestionEdit()
    expect(bridge.openRouter.chat.editResend).toHaveBeenCalledTimes(2)
    const [first, second] = bridge.openRouter.chat.editResend.mock.calls.map(([packet]: any[]) => packet)
    expect(second.command.operationId).not.toBe(first.command.operationId)
    expect(logic.loadError.value).toBe('STALE_CAPABILITY_REVISION')
  })

  it('drops a delayed compose picker after A-B-A and a compose-edit-compose round trip', async () => {
    await mountLogic()
    const gate = deferred<any>()
    ;(globalThis as any).electronAPI = { selectLocalFiles: vi.fn(() => gate.promise) }
    const picking = logic.onAttachFilesRequested()
    await waitFor(() => expect((globalThis as any).electronAPI.selectLocalFiles).toHaveBeenCalled())
    await select('B')
    await select('A')
    await logic.openQuestionEdit('question:A')
    await logic.closeQuestionEdit()
    gate.resolve(selectedFiles())
    await picking
    expect(bridge.composer.importLocal).not.toHaveBeenCalled()
    expect((await readDraft('A')).attachments).toEqual([])
    expect((await readDraft('B')).attachments).toEqual([])
  })

  it('drops the remaining batch after file one when its edit is cancelled', async () => {
    await mountLogic()
    await logic.openQuestionEdit('question:A')
    const oldSession = logic.questionEditSession.value!
    const gate = deferred<void>()
    const importLocal = bridge.composer.importLocal.getMockImplementation()!
    bridge.composer.importLocal.mockImplementationOnce(async (input: any) => { await gate.promise; return importLocal(input) })
    ;(globalThis as any).electronAPI = { selectLocalFiles: vi.fn(async () => selectedFiles(2)) }
    const picking = logic.onAttachFilesRequested()
    await waitFor(() => expect(bridge.composer.importLocal).toHaveBeenCalledTimes(1))
    const cancelling = logic.closeQuestionEdit()
    gate.resolve()
    await cancelling
    await logic.openQuestionEdit('question:A')
    await picking
    expect(logic.questionEditSession.value!.openedDraftRevision).toBeGreaterThan(oldSession.openedDraftRevision)
    expect(bridge.composer.importLocal).toHaveBeenCalledTimes(1)
    expect((await readDraft('A')).attachments).toEqual([])
  })

  it('drops file two after reading a reopened edit instance before the deferred file-one response', async () => {
    await mountLogic()
    await logic.openQuestionEdit('question:A')
    const oldSession = logic.questionEditSession.value!
    const gate = deferred<void>()
    const importLocal = bridge.composer.importLocal.getMockImplementation()!
    let fileOneAccepted = false
    bridge.composer.importLocal.mockImplementationOnce(async (input: any) => {
      const accepted = await importLocal(input)
      fileOneAccepted = true
      await gate.promise
      return accepted
    })
    ;(globalThis as any).electronAPI = { selectLocalFiles: vi.fn(async () => selectedFiles(2)) }
    const picking = logic.onAttachFilesRequested()
    await waitFor(() => expect(fileOneAccepted).toBe(true))
    const composer = new ComposerDraftV2Repo(db, () => 20)
    const editingOne = composer.read('A')
    expect(editingOne.attachments).toHaveLength(1)
    const restored = composer.cancelEdit({ conversationId: 'A', expectedRevision: editingOne.revision, ...editIdentityFor(oldSession) })
    const reopened = composer.openEdit({ conversationId: 'A', branchId: branchFor('A'), expectedRevision: restored.revision,
      questionId: 'question:A', answerRootId: 'answer:A', draftText: 'edit instance two', attachments: [] })
    const leaving = logic.onSelectConvo('B')
    await waitFor(() => expect(logic.activeConvoId.value).toBe('B'))
    const returning = logic.onSelectConvo('A')
    await waitFor(() => expect(logic.activeConvoId.value).toBe('A'))
    await new Promise(resolve => setTimeout(resolve, 0))
    gate.resolve()
    await Promise.all([picking, leaving, returning])
    expect(bridge.composer.importLocal).toHaveBeenCalledTimes(1)
    expect(composer.read('A').editSession?.openedDraftRevision).toBe(reopened.editSession!.openedDraftRevision)
    expect(composer.read('A').attachments).toEqual([])
    expect(logic.questionEditSession.value?.openedDraftRevision).toBe(reopened.editSession!.openedDraftRevision)
    expect(logic.draft.value).toBe('edit instance two')
    expect((await readDraft('B')).attachments).toEqual([])
  })

  it.each(['branch', 'chat_roundtrip'] as const)('keeps an unchanged compose attachment action valid across %s navigation', async navigationKind => {
    await mountLogic()
    const before = await readDraft('A')
    const gate = deferred<any>()
    ;(globalThis as any).electronAPI = { selectLocalFiles: vi.fn(() => gate.promise) }
    const picking = logic.onAttachFilesRequested()
    await waitFor(() => expect((globalThis as any).electronAPI.selectLocalFiles).toHaveBeenCalled())
    if (navigationKind === 'branch') await logic.onSelectBranch(`${branchFor('A')}:other`)
    else { await select('B'); await select('A') }
    expect((await readDraft('A')).revision).toBe(before.revision)
    gate.resolve(selectedFiles())
    await picking
    expect(bridge.composer.importLocal).toHaveBeenCalledTimes(1)
    expect((await readDraft('A')).attachments).toHaveLength(1)
    expect(logic.draft.value).toBe('draft A')
    expect(logic.activeBranchId.value).toBe(navigationKind === 'branch' ? `${branchFor('A')}:other` : branchFor('A'))
    expect(logic.questionEditSession.value).toBeNull()
    expect((await readDraft('B')).attachments).toEqual([])
  })

  it('advances attachment acknowledgement only through its own captured text flush and import', async () => {
    await mountLogic()
    const before = await readDraft('A')
    logic.draft.value = 'text flushed by this attachment action'
    ;(globalThis as any).electronAPI = { selectLocalFiles: vi.fn(async () => selectedFiles()) }
    await logic.onAttachFilesRequested()
    const after = await readDraft('A')
    expect(after.draftText).toBe('text flushed by this attachment action')
    expect(after.revision).toBe(before.revision + 2)
    expect(after.attachments).toHaveLength(1)
    expect(bridge.composer.importLocal).toHaveBeenCalledWith(expect.objectContaining({ expectedRevision: before.revision + 1 }))
  })

  it('keeps an unrelated composer attachment while text regeneration uses the source question snapshot', async () => {
    await mountLogic()
    ;(globalThis as any).electronAPI = { selectLocalFiles: vi.fn(async () => selectedFiles()) }
    await logic.onAttachFilesRequested()
    const before = await readDraft('A')
    expect(before.attachments).toHaveLength(1)

    const regenerate = bridge.openRouter.chat.regenerate
    regenerate.mockResolvedValueOnce({ ok: false, code: 'EXPECTED_TEST_STOP' })
    await logic.onRegenerateFromQuestion('question:A')

    expect(regenerate).toHaveBeenCalledWith(expect.objectContaining({
      command: expect.objectContaining({
        sourceBranchId: branchFor('A'),
        questionId: 'question:A',
        sourceAnswerId: 'answer:A',
        commandAttachments: [],
      }),
    }))
    expect(regenerate.mock.calls[0]?.[0].command).not.toHaveProperty('draftText')
    const after = await readDraft('A')
    expect(after.attachments).toEqual(before.attachments)
    expect(after.draftText).toBe(before.draftText)
  })

  it('keeps normal T2 autosave scheduled when T1 makes attachment preparation stale', async () => {
    await mountLogic()
    const gate = deferred<void>()
    const update = bridge.composer.updateText.getMockImplementation()!
    bridge.composer.updateText.mockImplementationOnce(async (input: any) => { await gate.promise; return update(input) })
    logic.draft.value = 'T1 in flight'
    await waitFor(() => expect(bridge.composer.updateText).toHaveBeenCalledWith(expect.objectContaining({ draftText: 'T1 in flight' })))
    logic.draft.value = 'T2 must remain scheduled'
    await nextTick()
    ;(globalThis as any).electronAPI = { selectLocalFiles: vi.fn(async () => selectedFiles()) }
    const picking = logic.onAttachFilesRequested()
    gate.resolve()
    await picking
    await waitFor(() => expect(new ComposerDraftV2Repo(db, () => 20).read('A').draftText).toBe('T2 must remain scheduled'))
    expect((globalThis as any).electronAPI.selectLocalFiles).not.toHaveBeenCalled()
    expect(bridge.composer.importLocal).not.toHaveBeenCalled()
    expect(logic.draft.value).toBe('T2 must remain scheduled')
    expect(logic.activeDraftConflict.value).toBeNull()
  })

  it('does not cancel newer T2 autosave when a preceding read keeps attachment CAS unchanged', async () => {
    await mountLogic()
    const gate = deferred<void>()
    const get = bridge.composer.get.getMockImplementation()!
    let readBlocked = false
    bridge.composer.get.mockImplementationOnce(async (id: string) => { readBlocked = true; await gate.promise; return get(id) })
    const reading = logic.handleRemoveDraftAttachment('missing fixture asset')
    await waitFor(() => expect(readBlocked).toBe(true))
    logic.draft.value = 'T1 captured by attachment action'
    await nextTick()
    ;(globalThis as any).electronAPI = { selectLocalFiles: vi.fn(async () => selectedFiles()) }
    const picking = logic.onAttachFilesRequested()
    logic.draft.value = 'T2 entered while action waited'
    await nextTick()
    gate.resolve()
    await Promise.all([reading, picking])
    await waitFor(() => expect(new ComposerDraftV2Repo(db, () => 20).read('A').draftText).toBe('T2 entered while action waited'))
    expect(bridge.composer.importLocal).toHaveBeenCalledTimes(1)
    expect((await readDraft('A')).attachments).toHaveLength(1)
    expect(logic.draft.value).toBe('T2 entered while action waited')
    expect(logic.activeDraftConflict.value).toBeNull()
  })

  it('preserves distinct A/B drafts and captured rapid navigation writes', async () => {
    await mountLogic()
    logic.draft.value = 'changed A'
    const gate = deferred<void>()
    const update = bridge.composer.updateText.getMockImplementation()!
    bridge.composer.updateText.mockImplementationOnce(async (input: any) => { await gate.promise; return update(input) })
    const toB = logic.onSelectConvo('B')
    await waitFor(() => expect(logic.activeConvoId.value).toBe('B'))
    const toA = logic.onSelectConvo('A')
    gate.resolve()
    await Promise.all([toB, toA])
    await waitFor(() => expect(logic.draft.value).toBe('changed A'))
    expect((await readDraft('B')).draftText).toBe('draft B')
    expect(bridge.composer.updateText.mock.calls.every(([input]: any[]) =>
      input.draftText !== 'changed A' || input.conversationId === 'A')).toBe(true)
    await select('B')
    expect(logic.draft.value).toBe('draft B')
  })

  it('does not publish a late B read into a new A binding', async () => {
    await mountLogic()
    const gate = deferred<void>()
    const get = bridge.composer.get.getMockImplementation()!
    let blocked = false
    bridge.composer.get.mockImplementation(async (id: string) => {
      if (id === 'B' && !blocked) { blocked = true; await gate.promise }
      return get(id)
    })
    const toB = logic.onSelectConvo('B')
    await waitFor(() => expect(blocked).toBe(true))
    await select('A')
    logic.draft.value = 'new A binding text'
    gate.resolve()
    await toB
    expect(logic.activeConvoId.value).toBe('A')
    expect(logic.draft.value).toBe('new A binding text')
  })

  it('suspends edit A while B cancel/submit are inert, then cancels A to its exact saved compose draft', async () => {
    await mountLogic()
    await logic.openQuestionEdit('question:A')
    expect(logic.questionEditSession.value?.conversationId).toBe('A')
    logic.draft.value = 'edited A'
    await select('B')
    await logic.closeQuestionEdit()
    await logic.submitQuestionEdit()
    expect(logic.draft.value).toBe('draft B')
    expect(bridge.openRouter.chat.editResend).not.toHaveBeenCalled()
    await select('A')
    expect(logic.draft.value).toBe('edited A')
    expect(logic.activeBranchId.value).toBe(branchFor('A'))
    await logic.closeQuestionEdit()
    expect(logic.draft.value).toBe('draft A')
    expect((await readDraft('A')).editSession).toBeNull()
  })

  it('persists a late edit-open result only under A, then resumes it on return', async () => {
    await mountLogic()
    const gate = deferred<void>()
    const open = bridge.composer.replaceFromAnswerSnapshot.getMockImplementation()!
    bridge.composer.replaceFromAnswerSnapshot.mockImplementationOnce(async (input: any) => { await gate.promise; return open(input) })
    const opening = logic.openQuestionEdit('question:A')
    await waitFor(() => expect(bridge.composer.replaceFromAnswerSnapshot).toHaveBeenCalled())
    const leaving = logic.onSelectConvo('B')
    gate.resolve()
    await Promise.all([opening, leaving])
    expect(logic.draft.value).toBe('draft B')
    expect(logic.questionEditSession.value).toBeNull()
    await select('A')
    expect(logic.questionEditSession.value?.questionId).toBe('question:A')
  })

  it('does not publish a delayed cancel response into B', async () => {
    await mountLogic()
    await logic.openQuestionEdit('question:A')
    const gate = deferred<void>()
    const cancel = bridge.composer.cancelEditSession.getMockImplementation()!
    bridge.composer.cancelEditSession.mockImplementationOnce(async (input: any) => { await gate.promise; return cancel(input) })
    const cancelling = logic.closeQuestionEdit()
    await waitFor(() => expect(bridge.composer.cancelEditSession).toHaveBeenCalled())
    const leaving = logic.onSelectConvo('B')
    gate.resolve()
    await Promise.all([cancelling, leaving])
    expect(logic.draft.value).toBe('draft B')
    expect((await readDraft('A')).draftText).toBe('draft A')
  })

  it('rehydrates exact edit branch after restart and restores original compose text on cancel', async () => {
    const mounted = await mountLogic()
    await logic.onSelectBranch(`${branchFor('A')}:other`)
    await logic.openQuestionEdit('question:A')
    logic.draft.value = 'persisted edit'
    await select('B')
    mounted.unmount()
    await mountLogic()
    await waitFor(() => expect(logic.activeBranchId.value).toBe(`${branchFor('A')}:other`))
    expect(logic.draft.value).toBe('persisted edit')
    await logic.closeQuestionEdit()
    expect(logic.draft.value).toBe('draft A')
  })

  it('submits durable edit source IDs after restart when the source is outside the loaded page', async () => {
    const mounted = await mountLogic()
    await logic.openQuestionEdit('question:A')
    logic.draft.value = 'historical question edit'
    await select('B')
    mounted.unmount()
    db.prepare(`INSERT INTO message_v2(message_id,conversation_id,introduced_in_branch_id,role,status,parent_message_id,
      question_id,answer_root_id,ordinal,created_at_ms,updated_at_ms)
      VALUES('question:latest','A',?,'user','completed','answer:A',NULL,NULL,3,4,4)`).run(branchFor('A'))
    db.prepare(`INSERT INTO message_v2(message_id,conversation_id,introduced_in_branch_id,role,status,parent_message_id,
      question_id,answer_root_id,ordinal,created_at_ms,updated_at_ms)
      VALUES('answer:latest','A',?,'assistant','completed','question:latest','question:latest','answer:latest',4,5,5)`).run(branchFor('A'))
    db.prepare("UPDATE branch_v2 SET head_message_id='answer:latest' WHERE branch_id=?").run(branchFor('A'))
    bridge.workspace.readBranch.mockImplementation(async (branchId: string) => {
      const view = viewFor(branchId)
      if (view.conversationId !== 'A') return ok(view)
      const latest = view.turns[0]!
      return ok({ ...view, headMessageId: 'answer:latest', hasMoreTurns: true, turns: [{ ...latest,
        questionId: 'question:latest', chosenAnswerRootId: 'answer:latest',
        answers: latest.answers.map(answer => ({ ...answer, answerRootId: 'answer:latest' })) }] })
    })
    bridge.openRouter.chat.editResend.mockResolvedValue({ ok: true, kind: 'created', operationId: 'operation:edit',
      answerRootId: 'answer:latest', actionKind: 'edit_resend', branch: { branchId: branchFor('A'), conversationId: 'A',
        questionId: 'question:latest', headMessageId: 'answer:latest', chosenAnswerRootId: 'answer:latest', deletedAtMs: null } })
    await mountLogic()
    expect(logic.transcriptMessageIds.value).not.toContain('question:A')
    await logic.submitQuestionEdit()
    expect(bridge.openRouter.chat.editResend).toHaveBeenCalledWith(expect.objectContaining({ command: expect.objectContaining({
      sourceQuestionId: 'question:A', sourceAnswerRootId: 'answer:A', expectedHeadMessageId: 'answer:latest',
      userBody: 'historical question edit' }) }))
    expect((await readDraft('A')).editSession).toBeNull()
  })

  it('rejects a deferred packet from an edit instance cancelled and reopened on the same target', async () => {
    await mountLogic()
    await logic.openQuestionEdit('question:A')
    const oldSession = logic.questionEditSession.value!
    const gate = deferred<void>()
    const update = bridge.composer.updateText.getMockImplementation()!
    bridge.composer.updateText.mockImplementationOnce(async (input: any) => { await gate.promise; return update(input) })
    logic.draft.value = 'old edit instance text'
    await waitFor(() => expect(bridge.composer.updateText).toHaveBeenCalledWith(expect.objectContaining({
      draftText: 'old edit instance text', editSessionIdentity: editIdentityFor(oldSession) })))
    const composer = new ComposerDraftV2Repo(db, () => 20)
    const beforeCancel = composer.read('A')
    const restored = composer.cancelEdit({ conversationId: 'A', expectedRevision: beforeCancel.revision,
      ...editIdentityFor(oldSession) })
    const reopened = composer.openEdit({ conversationId: 'A', branchId: branchFor('A'), expectedRevision: restored.revision,
      questionId: 'question:A', answerRootId: 'answer:A', draftText: 'new edit instance text', attachments: [] })
    expect(reopened.editSession!.openedDraftRevision).toBeGreaterThan(oldSession.openedDraftRevision)
    const leaving = logic.onSelectConvo('B')
    gate.resolve()
    await leaving
    await select('A')
    expect(composer.read('A').draftText).toBe('new edit instance text')
    expect(logic.activeDraftConflict.value?.captured.editIdentity?.openedDraftRevision).toBe(oldSession.openedDraftRevision)
    await logic.onRefreshWorkspace()
    await logic.confirmDraftConflictReload()
    expect(logic.draft.value).toBe('new edit instance text')
    expect(logic.questionEditSession.value?.openedDraftRevision).toBe(reopened.editSession!.openedDraftRevision)
    const calls = bridge.composer.updateText.mock.calls.length
    await new Promise(resolve => setTimeout(resolve, 300))
    expect(bridge.composer.updateText.mock.calls.length).toBe(calls)
    expect(composer.read('A').draftText).toBe('new edit instance text')
  })

  it('explicit same-chat branch navigation atomically cancels edit before binding the selected branch', async () => {
    await mountLogic()
    await logic.openQuestionEdit('question:A')
    await logic.onSelectBranch(`${branchFor('A')}:other`)
    expect(logic.activeBranchId.value).toBe(`${branchFor('A')}:other`)
    expect(logic.draft.value).toBe('draft A')
    expect((await readDraft('A')).editSession).toBeNull()
  })

  it('clears accepted edit only under its source after navigating to B', async () => {
    await mountLogic()
    await logic.openQuestionEdit('question:A')
    logic.draft.value = 'submitted A'
    const gate = deferred<any>()
    bridge.openRouter.chat.editResend.mockImplementationOnce(() => gate.promise)
    const submitting = logic.submitQuestionEdit()
    await waitFor(() => expect(bridge.openRouter.chat.editResend).toHaveBeenCalledTimes(1))
    await select('B')
    gate.resolve({ ok: true, kind: 'created', operationId: 'operation:edit', answerRootId: 'new-answer',
      actionKind: 'edit_resend', branch: { branchId: 'branch:A:new', conversationId: 'A', questionId: 'new-question',
        headMessageId: 'new-answer', chosenAnswerRootId: 'new-answer', deletedAtMs: null } })
    await submitting
    expect(logic.activeConvoId.value).toBe('B')
    expect(logic.draft.value).toBe('draft B')
    expect((await readDraft('A')).editSession).toBeNull()
    expect(bridge.openRouter.chat.editResend).toHaveBeenCalledWith(expect.objectContaining({ command:
      expect.objectContaining({ sourceBranchId: branchFor('A'), sourceQuestionId: 'question:A', userBody: 'submitted A' }) }))
  })

  it.each(['initial', 'editResend'] as const)('publishes accepted %s clear to the locked owner after A-B-A navigation', async commandKind => {
    await mountLogic()
    if (commandKind === 'editResend') await logic.openQuestionEdit('question:A')
    logic.draft.value = 'submitted owner packet'
    const gate = deferred<any>()
    bridge.openRouter.chat[commandKind].mockImplementationOnce(() => gate.promise)
    const submitting = commandKind === 'initial' ? logic.onSend() : logic.submitQuestionEdit()
    await waitFor(() => expect(bridge.openRouter.chat[commandKind]).toHaveBeenCalledTimes(1))
    await select('B')
    const returning = logic.onSelectConvo('A')
    await returning
    await waitFor(() => expect(logic.draft.value).toBe('submitted owner packet'))
    expect(logic.isDraftInteractionLocked.value).toBe(true)
    await logic.onSelectBranch(`${branchFor('A')}:other`)
    expect(logic.activeBranchId.value).toBe(branchFor('A'))
    expect(bridge.composer.cancelEditSession).not.toHaveBeenCalled()
    gate.resolve({ ok: true, kind: 'created', operationId: 'operation:accepted', answerRootId: 'answer:A',
      actionKind: commandKind === 'initial' ? 'initial' : 'edit_resend', branch: { branchId: branchFor('A'), conversationId: 'A',
        questionId: 'question:A', headMessageId: 'answer:A', chosenAnswerRootId: 'answer:A', deletedAtMs: null } })
    await submitting
    expect(logic.draft.value).toBe('')
    expect(logic.questionEditSession.value).toBeNull()
    expect(logic.isDraftInteractionLocked.value).toBe(false)
    expect((await readDraft('A')).draftText).toBe('')
    expect((await readDraft('B')).draftText).toBe('draft B')
  })

  it('rebinds transcript, draft and branch after deleting active chat', async () => {
    await mountLogic()
    await logic.onDeleteConvo('A')
    expect(logic.activeConvoId.value).toBe('B')
    expect(logic.activeBranchId.value).toBe(branchFor('B'))
    expect(logic.draft.value).toBe('draft B')
    expect(logic.transcriptMessageIds.value).toContain('question:B')
    expect(logic.transcriptMessageIds.value).not.toContain('question:A')
  })

  it.each(['single', 'bulk'] as const)('clears the active edit projection after %s conversation deletion', async deletionKind => {
    await mountLogic()
    await logic.openQuestionEdit('question:A')
    logic.draft.value = 'deleted edit draft'
    if (deletionKind === 'single') await logic.onDeleteConvo('A')
    else await logic.onBulkDeleteConvos(['A'])
    expect(logic.activeConvoId.value).toBe('B')
    expect(logic.activeBranchId.value).toBe(branchFor('B'))
    expect(logic.draft.value).toBe('draft B')
    expect(logic.questionEditSession.value).toBeNull()
    expect(logic.transcriptMessageIds.value).not.toContain('question:A')
  })

  it('locks source composer during edit submit and preserves newer external edit if accepted clear conflicts', async () => {
    await mountLogic()
    await logic.openQuestionEdit('question:A')
    logic.draft.value = 'accepted edit text'
    const gate = deferred<any>()
    bridge.openRouter.chat.editResend.mockImplementationOnce(() => gate.promise)
    const submitting = logic.submitQuestionEdit()
    await waitFor(() => expect(bridge.openRouter.chat.editResend).toHaveBeenCalledTimes(1))
    expect(logic.isDraftInteractionLocked.value).toBe(true)
    const current = await readDraft('A')
    await bridge.composer.updateText({ conversationId: 'A', expectedRevision: current.revision,
      draftText: 'newer external edit', draftMode: 'edit', editingSourceQuestionId: 'question:A',
      editSessionIdentity: editIdentityFor(current.editSession) })
    const calls = bridge.composer.updateText.mock.calls.length
    logic.draft.value = 'newer local unsaved edit'
    await new Promise(resolve => setTimeout(resolve, 300))
    expect(bridge.composer.updateText.mock.calls.length).toBe(calls)
    gate.resolve({ ok: true, kind: 'created', operationId: 'operation:edit', answerRootId: 'new-answer', actionKind: 'edit_resend',
      branch: { branchId: 'branch:A:new', conversationId: 'A', questionId: 'new-question', headMessageId: 'new-answer',
        chosenAnswerRootId: 'new-answer', deletedAtMs: null } })
    await submitting
    expect(logic.activeBranchId.value).toBe(branchFor('A'))
    expect((await readDraft('A')).draftText).toBe('newer external edit')
    expect((await readDraft('A')).editSession).not.toBeNull()
    expect(bridge.composer.cancelEditSession).not.toHaveBeenCalled()
    expect(logic.activeDraftConflict.value?.captured.text).toBe('newer local unsaved edit')
  })

  it('locks ordinary send and preserves later persisted compose text when accepted clear conflicts', async () => {
    await mountLogic()
    const gate = deferred<any>()
    bridge.openRouter.chat.initial.mockImplementationOnce(() => gate.promise)
    const sending = logic.onSend()
    await waitFor(() => expect(bridge.openRouter.chat.initial).toHaveBeenCalledTimes(1))
    expect(logic.isDraftInteractionLocked.value).toBe(true)
    const current = await readDraft('A')
    await bridge.composer.updateText({ conversationId: 'A', expectedRevision: current.revision,
      draftText: 'newer external compose', draftMode: 'compose', editingSourceQuestionId: null, editSessionIdentity: null })
    gate.resolve({ ok: true, kind: 'created', operationId: 'operation:initial', answerRootId: 'new-answer', actionKind: 'initial',
      branch: { branchId: branchFor('A'), conversationId: 'A', questionId: 'new-question', headMessageId: 'new-answer',
        chosenAnswerRootId: 'new-answer', deletedAtMs: null } })
    await sending
    expect((await readDraft('A')).draftText).toBe('newer external compose')
    expect(logic.activeDraftConflict.value).not.toBeNull()
  })

  it('does not select late deletion fallback after the user selected New', async () => {
    await mountLogic()
    const gate = deferred<void>()
    const getTemplate = bridge.workspace.getSystemTemplate.getMockImplementation()!
    let waiting = false
    bridge.workspace.getSystemTemplate.mockImplementationOnce(async () => { waiting = true; await gate.promise; return getTemplate() })
    const deleting = logic.onBulkDeleteConvos(['A', 'B'])
    await waitFor(() => expect(waiting).toBe(true))
    await logic.onCreateConvo()
    const activeBranch = logic.activeBranchId.value
    gate.resolve()
    await deleting
    expect(logic.activeConvoId.value).toBe('template')
    expect(logic.activeBranchId.value).toBe(activeBranch)
    expect(logic.draft.value).toBe('draft template')
  })

  it('reconciles partial bulk success before reporting failure and chooses New when all are deleted', async () => {
    await mountLogic()
    const remove = bridge.workspace.deleteConversation.getMockImplementation()!
    bridge.workspace.deleteConversation.mockImplementation(async (id: string) => id === 'B'
      ? { ok: false, code: 'SYNTHETIC_DELETE_FAILURE' } : remove(id))
    await logic.onBulkDeleteConvos(['A', 'B'])
    expect(logic.activeConvoId.value).toBe('B')
    expect(logic.draft.value).toBe('draft B')
    expect(logic.loadError.value).toBe('SYNTHETIC_DELETE_FAILURE')
    bridge.workspace.deleteConversation.mockImplementation(remove)
    await logic.onBulkDeleteConvos(['B'])
    expect(logic.activeConvoId.value).toBe('template')
    expect(logic.activeBranchId.value).toBe(branchFor('template'))
    expect(logic.draft.value).toBe('draft template')
  })

  it('waits for every bulk move outcome and refreshes after an early rejection', async () => {
    await mountLogic()
    const gate = deferred<void>()
    bridge.workspace.listConversations.mockClear()
    bridge.workspace.moveConversation.mockImplementation(async (id: string) => {
      if (id === 'A') throw new Error('SYNTHETIC_MOVE_FAILURE')
      await gate.promise
      return ok({})
    })

    let settled = false
    const moving = logic.onBulkMoveConvosToProject(['A', 'B'], 'project:target').finally(() => { settled = true })
    await waitFor(() => expect(bridge.workspace.moveConversation).toHaveBeenCalledTimes(2))
    await new Promise(resolve => setTimeout(resolve, 0))

    expect(settled).toBe(false)
    expect(bridge.workspace.listConversations).not.toHaveBeenCalled()
    gate.resolve()
    await moving

    expect(bridge.workspace.listConversations).toHaveBeenCalled()
    expect(logic.loadError.value).toBe('SYNTHETIC_MOVE_FAILURE')
  })

  it('does not steal navigation when deleting A finishes after B was selected', async () => {
    await mountLogic()
    const gate = deferred<void>()
    const remove = bridge.workspace.deleteConversation.getMockImplementation()!
    bridge.workspace.deleteConversation.mockImplementationOnce(async (id: string) => { await gate.promise; return remove(id) })
    const deleting = logic.onDeleteConvo('A')
    await waitFor(() => expect(bridge.workspace.deleteConversation).toHaveBeenCalled())
    await select('B')
    gate.resolve()
    await deleting
    expect(logic.activeConvoId.value).toBe('B')
    expect(logic.draft.value).toBe('draft B')
  })

  it('shows CAS conflict without borrowing B revision or overwriting B', async () => {
    await mountLogic()
    const current = await readDraft('A')
    await bridge.composer.updateText({ conversationId: 'A', expectedRevision: current.revision,
      draftText: 'external A', draftMode: 'compose', editingSourceQuestionId: null, editSessionIdentity: null })
    logic.draft.value = 'stale visible A'
    await select('B')
    expect(logic.draft.value).toBe('draft B')
    expect((await readDraft('A')).draftText).toBe('external A')
    expect((await readDraft('B')).draftText).toBe('draft B')
    const calls = bridge.composer.updateText.mock.calls.length
    await select('A')
    expect(logic.draft.value).toBe('stale visible A')
    expect(logic.activeDraftConflict.value?.captured.text).toBe('stale visible A')
    expect(logic.isDraftInteractionLocked.value).toBe(true)
    await logic.onSend()
    await new Promise(resolve => setTimeout(resolve, 300))
    expect(bridge.composer.updateText.mock.calls.length).toBe(calls)
    await logic.onRefreshWorkspace()
    expect(logic.draftConflictReloadConfirmation.value).not.toBeNull()
    logic.cancelDraftConflictReload()
    expect(logic.draft.value).toBe('stale visible A')
    await logic.onRefreshWorkspace()
    await logic.confirmDraftConflictReload()
    expect(logic.draft.value).toBe('external A')
    expect(logic.activeDraftConflict.value).toBeNull()
  })

  it('retains the latest T2 packet when deferred T1 CAS fails after navigation', async () => {
    await mountLogic()
    const gate = deferred<void>()
    const update = bridge.composer.updateText.getMockImplementation()!
    bridge.composer.updateText.mockImplementationOnce(async (input: any) => { await gate.promise; return update(input) })
    logic.draft.value = 'T1'
    await waitFor(() => expect(bridge.composer.updateText).toHaveBeenCalledWith(expect.objectContaining({ draftText: 'T1' })))
    const composer = new ComposerDraftV2Repo(db, () => 20)
    const stored = composer.read('A')
    composer.updateText({ conversationId: 'A', expectedRevision: stored.revision, draftText: 'external',
      draftMode: 'compose', editingSourceQuestionId: null })
    logic.draft.value = 'T2 newest unsaved'
    const leaving = logic.onSelectConvo('B')
    gate.resolve()
    await leaving
    const calls = bridge.composer.updateText.mock.calls.length
    await select('A')
    expect(logic.draft.value).toBe('T2 newest unsaved')
    expect(logic.activeDraftConflict.value?.captured.text).toBe('T2 newest unsaved')
    await new Promise(resolve => setTimeout(resolve, 300))
    expect(bridge.composer.updateText.mock.calls.length).toBe(calls)
    expect(composer.read('A').draftText).toBe('external')
  })

  it.each(['initial', 'editResend'] as const)('locks actual composer input before deferred first %s flush', async commandKind => {
    const user = userEvent.setup()
    render(AppChatApp)
    const input = await screen.findByTestId('composer-draft') as HTMLTextAreaElement
    await waitFor(() => expect(input.value).toBe('draft A'))
    await waitFor(() => expect(input).not.toBeDisabled())
    if (commandKind === 'editResend') {
      await user.click(screen.getByTestId('edit-q-question:A'))
      await waitFor(() => expect(input.value).toBe('question body A'))
    }
    await fireEvent.update(input, 'frozen first packet')
    const gate = deferred<void>()
    const update = bridge.composer.updateText.getMockImplementation()!
    bridge.composer.updateText.mockImplementationOnce(async (payload: any) => { await gate.promise; return update(payload) })
    bridge.openRouter.chat[commandKind].mockResolvedValue({ ok: true, kind: 'created', operationId: 'operation:initial',
      answerRootId: 'answer:A', actionKind: commandKind === 'initial' ? 'initial' : 'edit_resend', branch: { branchId: branchFor('A'), conversationId: 'A',
        questionId: 'question:A', headMessageId: 'answer:A', chosenAnswerRootId: 'answer:A', deletedAtMs: null } })
    await user.click(screen.getByTestId(commandKind === 'initial' ? 'composer-send' : 'question-edit-new'))
    await waitFor(() => expect(bridge.composer.updateText).toHaveBeenCalledWith(expect.objectContaining({ draftText: 'frozen first packet' })))
    expect(input).toBeDisabled()
    await user.type(input, 'T2 attempted during flush')
    expect(input.value).toBe('frozen first packet')
    gate.resolve()
    await waitFor(() => expect(bridge.openRouter.chat[commandKind]).toHaveBeenCalledWith(expect.objectContaining({
      command: expect.objectContaining({ userBody: 'frozen first packet' }) })))
    await waitFor(() => expect(input.value).toBe(''))
  })

  it('shows copyable retained text and requires confirmation before UI reload discards it', async () => {
    const user = userEvent.setup()
    render(AppChatApp)
    const input = await screen.findByTestId('composer-draft') as HTMLTextAreaElement
    await waitFor(() => expect(input.value).toBe('draft A'))
    await waitFor(() => expect(input).not.toBeDisabled())
    const composer = new ComposerDraftV2Repo(db, () => 20)
    const stored = composer.read('A')
    composer.updateText({ conversationId: 'A', expectedRevision: stored.revision, draftText: 'external saved text',
      draftMode: 'compose', editingSourceQuestionId: null })
    await fireEvent.update(input, 'unsaved text to copy')
    const panel = await screen.findByTestId('draft-conflict')
    const retained = within(panel).getByRole('textbox') as HTMLTextAreaElement
    expect(retained).toHaveValue('unsaved text to copy')
    expect(retained.readOnly).toBe(true)
    expect(retained).not.toBeDisabled()
    await user.click(within(panel).getByRole('button', { name: t('errors.draftConflict.reload') }))
    const confirmation = await screen.findByTestId('draft-conflict-confirmation')
    await user.click(within(confirmation).getByRole('button', { name: t('common.cancel') }))
    expect(retained).toHaveValue('unsaved text to copy')
    await user.click(within(panel).getByRole('button', { name: t('errors.draftConflict.reload') }))
    await user.click(screen.getByRole('button', { name: t('errors.draftConflict.discardAndReload') }))
    await waitFor(() => expect(input).toHaveValue('external saved text'))
    expect(screen.queryByTestId('draft-conflict')).not.toBeInTheDocument()
  })
})
