import { render, screen, waitFor, within } from '@testing-library/vue'
import userEvent from '@testing-library/user-event'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import AppChatApp from './AppChatApp.vue'

const streamOpenRouterChatCallArgs: any[] = []

vi.mock('@/next/live/openRouterLiveStream', () => {
  async function* streamOpenRouterChatAsEvents(options: any) {
    streamOpenRouterChatCallArgs.push(options)
    yield { type: 'StreamDone' }
  }
  return { streamOpenRouterChatAsEvents }
})

describe('ui-app AppChatApp (question branching: pager + edit)', () => {
  const originalDbBridge = (globalThis as any).dbBridge
  const originalElectronStore = (globalThis as any).electronStore
  let forceCloneFromMessageFailure = false
  let replayStatusByMessageId: Record<string, 'sendable' | 'blocked' | 'needs_confirmation'> = {}
  let replayBlockingReasonByMessageId: Record<string, string> = {}

  beforeEach(() => {
    streamOpenRouterChatCallArgs.length = 0
    forceCloneFromMessageFailure = false
    replayStatusByMessageId = {}
    replayBlockingReasonByMessageId = {}
    ;(globalThis as any).electronStore = { get: vi.fn(async () => 'sk-test') }

    const convoId = 'c1'
    const branchId = 'b1'

    const base = {
      u1: { id: 'u1', role: 'user', body: 'Q1', seq: 1, parentId: null as string | null },
      a1: { id: 'a1', role: 'assistant', body: 'A1', seq: 2, parentId: 'u1' as string | null, answerRootId: 'a1', questionId: 'u1' },
    }

    const variantsByBaseA1: Record<
      string,
      { qid: string; qBody: string; qSeq: number; aid: string; aBody: string; aSeq: number; createdAt: number; status: 'final' | 'streaming' }
    > = {
      u2: { qid: 'u2', qBody: 'Q2', qSeq: 3, aid: 'a2', aBody: 'A2', aSeq: 4, createdAt: 3, status: 'final' },
      u2alt: { qid: 'u2alt', qBody: 'Q2 alt', qSeq: 5, aid: 'a2alt', aBody: 'A2 alt', aSeq: 6, createdAt: 5, status: 'final' },
    }

    let headQuestionId: 'u2' | 'u2alt' | 'u2b' = 'u2'
    let u2bCounter = 0
    let draftState = {
      conversationId: convoId,
      draftText: '',
      draftMode: 'compose' as const | 'edit',
      editingSourceMessageId: null as string | null,
      attachedAssetIds: [] as string[],
      attachments: [] as Array<Record<string, unknown>>,
      updatedAt: 1,
    }
    const historyAttachmentsByMessageId: Record<string, Array<Record<string, unknown>>> = {}

    const resolveQuestionBodyById = (questionId: string): string => {
      if (questionId === 'u1') return base.u1.body
      const variant = Object.values(variantsByBaseA1).find((item) => item.qid === questionId)
      return variant?.qBody ?? ''
    }

    const listQuestionCandidates = () => {
      const items = Object.values(variantsByBaseA1).map((v) => ({ questionId: v.qid, createdAt: v.createdAt, status: 'final' }))
      // Worker returns new -> old (created_at desc).
      return items.sort((a, b) => b.createdAt - a.createdAt)
    }

    const renderPath = () => {
      const v = variantsByBaseA1[headQuestionId]
      const u2 = { id: v.qid, role: 'user', body: v.qBody, seq: v.qSeq, parentId: 'a1' as string | null }
      const a2 = {
        id: v.aid,
        role: 'assistant',
        body: v.aBody,
        seq: v.aSeq,
        parentId: v.qid,
        status: v.status,
        answerRootId: v.aid,
        questionId: v.qid,
      }
      return { u2, a2 }
    }

    const invoke = vi.fn(async (method: string, params?: any) => {
      if (method === 'project.getInbox') return null
      if (method === 'project.list') return []
      if (method === 'project.countConversationsBatch') return { counts: {} }
      if (method === 'settings.getWebSearchDefaults') return { value: null }
      if (method === 'settings.getSamplingParamsDefaults') return { value: null }
      if (method === 'settings.getImageGenerationDefault') return { value: null }
      if (method === 'settings.getUserMessageRenderDefault') return { value: null }
      if (method === 'settings.getChatReasoningDisplayMode') return { value: 'inline' }
      if (method === 'settings.getChatDraft') return { value: null }
      if (method === 'convo.list') return [{ id: convoId, title: 'Chat 1', createdAt: 1, updatedAt: 1 }]
      if (method === 'branch.ensureDefault') {
        const { a2 } = renderPath()
        return { id: branchId, convoId, headMessageId: a2.id, name: 'Main', createdAt: 1, updatedAt: 1, deletedAt: null }
      }
      if (method === 'branch.list') {
        const { a2 } = renderPath()
        return [{ id: branchId, convoId, headMessageId: a2.id, name: 'Main', createdAt: 1, updatedAt: 1, deletedAt: null }]
      }

      if (method === 'branch.getQuestionCandidates') {
        return listQuestionCandidates()
      }

      if (method === 'branch.switchQuestionCandidate') {
        const qid = String(params?.questionId ?? '')
        headQuestionId = qid === 'u2alt' ? 'u2alt' : qid === 'u2b' ? 'u2b' : 'u2'
        const { a2 } = renderPath()
        return { ok: true, headMessageId: a2.id }
      }

      if (method === 'branch.getCandidates') {
        const qid = String(params?.questionId ?? '')
        const v = Object.values(variantsByBaseA1).find((x) => x.qid === qid) ?? variantsByBaseA1.u2
        return [{ answerRootId: v.aid, createdAt: v.createdAt + 1, status: v.status }]
      }

      if (method === 'context.getRenderableTurns') {
        const { u2, a2 } = renderPath()
        return {
          messages: [
            { id: base.u1.id, convoId, role: 'user', seq: base.u1.seq, createdAt: 1, parentId: base.u1.parentId, status: 'final', answerRootId: null, questionId: null, body: base.u1.body, meta: null },
            {
              id: base.a1.id,
              convoId,
              role: 'assistant',
              seq: base.a1.seq,
              createdAt: 2,
              parentId: base.a1.parentId,
              status: 'final',
              answerRootId: base.a1.answerRootId,
              questionId: base.a1.questionId,
              body: base.a1.body,
              meta: null,
            },
            { id: u2.id, convoId, role: 'user', seq: u2.seq, createdAt: u2.seq, parentId: u2.parentId, status: 'final', answerRootId: null, questionId: null, body: u2.body, meta: null },
            {
              id: a2.id,
              convoId,
              role: 'assistant',
              seq: a2.seq,
              createdAt: a2.seq,
              parentId: a2.parentId,
              status: a2.status,
              answerRootId: a2.answerRootId,
              questionId: a2.questionId,
              body: a2.body,
              meta: null,
            },
          ],
          turns: [
            { questionId: base.u1.id, chosenAnswerRootId: base.a1.id, questionMode: 'include', answerMode: 'include', effectiveMode: 'include', lockedByQuestionExclude: false },
            { questionId: u2.id, chosenAnswerRootId: a2.id, questionMode: 'include', answerMode: 'include', effectiveMode: 'include', lockedByQuestionExclude: false },
          ],
          debug: { branchId, excludedQuestionIds: [], includedMessageIds: [base.u1.id, base.a1.id, u2.id, a2.id], chosenAnswerRootByQuestionId: { [base.u1.id]: base.a1.id, [u2.id]: a2.id } },
        }
      }

      if (method === 'context.buildForBranch') {
        const { u2, a2 } = renderPath()
        return {
          messages: [
            { id: base.u1.id, convoId, role: 'user', seq: base.u1.seq, createdAt: 1, parentId: base.u1.parentId, status: 'final', answerRootId: null, questionId: null, body: base.u1.body, meta: null },
            { id: base.a1.id, convoId, role: 'assistant', seq: base.a1.seq, createdAt: 2, parentId: base.a1.parentId, status: 'final', answerRootId: base.a1.answerRootId, questionId: base.a1.questionId, body: base.a1.body, meta: null },
            { id: u2.id, convoId, role: 'user', seq: u2.seq, createdAt: u2.seq, parentId: u2.parentId, status: 'final', answerRootId: null, questionId: null, body: u2.body, meta: null },
            { id: a2.id, convoId, role: 'assistant', seq: a2.seq, createdAt: a2.seq, parentId: a2.parentId, status: a2.status, answerRootId: a2.answerRootId, questionId: a2.questionId, body: a2.body, meta: null },
          ],
          debug: { branchId, excludedQuestionIds: [], includedMessageIds: [], chosenAnswerRootByQuestionId: {} },
        }
      }

      if (method === 'conversationDraft.restore') {
        return draftState
      }

      if (method === 'conversationDraft.updateText') {
        draftState = {
          ...draftState,
          draftText: String(params?.draftText ?? ''),
          draftMode: params?.draftMode === 'edit' ? 'edit' : 'compose',
          editingSourceMessageId:
            params?.editingSourceMessageId == null || String(params?.editingSourceMessageId ?? '').trim().length === 0
              ? null
              : String(params?.editingSourceMessageId),
          updatedAt: draftState.updatedAt + 1,
        }
        return draftState
      }

      if (method === 'conversationDraft.cloneFromMessage') {
        if (forceCloneFromMessageFailure) throw new Error('clone failed')
        const sourceMessageId = String(params?.sourceMessageId ?? '')
        const body = resolveQuestionBodyById(sourceMessageId)
        const attachment = {
          id: `draft-attachment-${sourceMessageId}`,
          conversationId: convoId,
          assetId: `asset-${sourceMessageId}`,
          attachmentOrder: 0,
          aiPayloadKind: 'text',
          processingStatus: 'native_supported',
          includeInNextRequest: true,
          excludedReason: null,
          preferredSendMode: null,
          urlRetentionMode: null,
          createdAt: 1,
          updatedAt: 1,
        }
        draftState = {
          ...draftState,
          draftText: body,
          draftMode: 'edit',
          editingSourceMessageId: sourceMessageId,
          attachedAssetIds: [attachment.assetId],
          attachments: [attachment],
          updatedAt: draftState.updatedAt + 1,
        }
        return draftState
      }

      if (method === 'conversationDraft.attachToMessage') {
        const messageId = String(params?.messageId ?? '')
        const attachments = draftState.attachments.map((attachment: any) => ({
          id: `attached-${attachment.assetId}`,
          messageId,
          assetId: attachment.assetId,
          aiPayloadKind: attachment.aiPayloadKind,
          processingStatus: attachment.processingStatus,
          includeInNextRequest: attachment.includeInNextRequest,
          excludedReason: attachment.excludedReason,
          createdAt: 1,
          updatedAt: 1,
        }))
        historyAttachmentsByMessageId[messageId] = attachments.map((item: any) => ({ ...item }))
        draftState = {
          ...draftState,
          draftText: '',
          draftMode: 'compose',
          editingSourceMessageId: null,
          attachedAssetIds: [],
          attachments: [],
          updatedAt: draftState.updatedAt + 1,
        }
        return {
          messageId,
          attachments,
          draft: draftState,
        }
      }

      if (method === 'conversationDraft.removeAttachment') {
        const assetId = String(params?.assetId ?? '')
        const removed = draftState.attachments.some((attachment: any) => attachment.assetId === assetId)
        const nextAttachments = draftState.attachments.filter((attachment: any) => attachment.assetId !== assetId)
        draftState = {
          ...draftState,
          attachedAssetIds: nextAttachments.map((attachment: any) => String(attachment.assetId)),
          attachments: nextAttachments,
          updatedAt: draftState.updatedAt + 1,
        }
        return { ok: true, removed, ownership: { assetId, ownerKind: 'detached', lifecycleStatus: 'detached', draftConversationIds: [], messageIds: [], reason: 'removed_from_draft', updatedAt: Date.now() } }
      }

      if (method === 'conversationDraft.updateAttachmentSettings') {
        const assetId = String(params?.assetId ?? '')
        draftState = {
          ...draftState,
          attachments: draftState.attachments.map((attachment: any) => (
            String(attachment.assetId) === assetId
              ? {
                  ...attachment,
                  ...(params?.includeInNextRequest === undefined ? {} : { includeInNextRequest: params.includeInNextRequest === true }),
                  ...(params?.excludedReason === undefined ? {} : { excludedReason: params.excludedReason }),
                  updatedAt: draftState.updatedAt + 1,
                }
              : attachment
          )),
          updatedAt: draftState.updatedAt + 1,
        }
        return draftState.attachments.find((attachment: any) => String(attachment.assetId) === assetId) ?? null
      }

      if (method === 'conversationDraft.addAttachment') {
        const assetId = String(params?.assetId ?? '')
        const next = {
          id: `draft-attachment-${assetId}`,
          conversationId: convoId,
          assetId,
          attachmentOrder: draftState.attachments.length,
          aiPayloadKind: 'image',
          processingStatus: 'native_supported',
          includeInNextRequest: true,
          excludedReason: null,
          preferredSendMode: null,
          urlRetentionMode: null,
          createdAt: Date.now(),
          updatedAt: Date.now(),
        }
        draftState = {
          ...draftState,
          attachedAssetIds: Array.from(new Set([...draftState.attachedAssetIds, assetId])),
          attachments: [...draftState.attachments, next],
          updatedAt: draftState.updatedAt + 1,
        }
        return next
      }

      if (method === 'sendPlan.buildCurrent') {
        const attachmentPlans = draftState.attachments.map((attachment: any) => {
          const forcedExcluded = attachment.includeInNextRequest !== true || String(attachment.excludedReason ?? '').trim().length > 0
          const forcedBlocked = String(attachment.assetId ?? '').includes('blocked')
          const eligibility = forcedBlocked ? 'blocked' : forcedExcluded ? 'excluded' : 'included'
          const exclusionReason = forcedBlocked
            ? 'hard_gate_blocked'
            : forcedExcluded
              ? String(attachment.excludedReason ?? 'manually_excluded')
              : null
          return {
            assetId: attachment.assetId,
            attachmentId: attachment.id,
            source: 'draft',
            messageId: null,
            aiPayloadKind: attachment.aiPayloadKind,
            selectedSendMode: 'inline_base64',
            fallbackSendModes: [],
            eligibility,
            exclusionReason,
            displayStatus: forcedBlocked ? 'failed' : forcedExcluded ? 'unsupported' : 'ready',
            needsUserAttention: forcedBlocked || forcedExcluded,
            notes: forcedBlocked ? ['attachment blocked by send gate'] : forcedExcluded ? ['manually excluded'] : [],
          }
        })
        const hasBlocked = attachmentPlans.some((plan: any) => plan.eligibility === 'blocked')
        const hasExcluded = attachmentPlans.some((plan: any) => plan.eligibility === 'excluded')
        const includedAttachments = attachmentPlans
          .filter((plan: any) => plan.eligibility === 'included')
          .map((plan: any) => ({
            assetId: plan.assetId,
            source: plan.source,
            attachmentId: plan.attachmentId,
            messageId: null,
          }))
        const excludedAttachments = attachmentPlans
          .filter((plan: any) => plan.eligibility !== 'included')
          .map((plan: any) => ({
            assetId: plan.assetId,
            source: plan.source,
            attachmentId: plan.attachmentId,
            messageId: null,
            exclusionReason: plan.exclusionReason ?? 'excluded',
          }))
        return {
          sendPlan: {
            status: hasBlocked ? 'blocked' : hasExcluded ? 'partially_sendable' : 'sendable',
            warnings: [],
            blockingReasons: hasBlocked ? [{ code: 'hard_gate_blocked', message: 'attachment blocked by send gate' }] : [],
            includedAttachments,
            excludedAttachments,
            attachmentPlans,
            requiresModelChange: false,
            canProceedAfterDroppingExcluded: !hasBlocked,
            requiresUserConfirmation: hasBlocked || hasExcluded,
            plannerVersion: 'test',
          },
          draftText: draftState.draftText,
          assets: [],
          storageRootDir: 'D:/Starverse',
        }
      }
      if (method === 'sendPlan.prepareOpenRouterReplayFromMessage') {
        const text = typeof params?.editedUserText === 'string' && params.editedUserText.trim().length > 0
          ? params.editedUserText
          : String(params?.userMessageId ?? '')
        const messageId = String(params?.userMessageId ?? '')
        const status = replayStatusByMessageId[messageId] ?? 'sendable'
        const rows = historyAttachmentsByMessageId[messageId] ?? []
        const rawDecisions = Array.isArray(params?.attachmentDecisions) ? params.attachmentDecisions as Array<Record<string, unknown>> : []
        const excludedByDecision = new Set(
          rawDecisions
            .filter((item) => String(item?.decision ?? '').trim() === 'exclude')
            .map((item) => String(item?.attachmentId ?? '').trim())
            .filter(Boolean)
        )
        const excludedRows = rows.filter((row: any) => row?.includeInNextRequest !== true || row?.excludedReason)
        const unresolvedExcludedRows = excludedRows.filter((row: any) => !excludedByDecision.has(String(row?.id ?? '')))
        const effectiveStatus: 'sendable' | 'blocked' | 'needs_confirmation' =
          status === 'needs_confirmation' && excludedRows.length > 0 && unresolvedExcludedRows.length === 0
            ? 'sendable'
            : status
        const includedRows = rows.filter((row: any) => {
          if (row?.includeInNextRequest !== true) return false
          if (row?.excludedReason) return false
          if (excludedByDecision.has(String(row?.id ?? ''))) return false
          return true
        })
        const nonTextBlocks = includedRows.map((row: any) => ({ type: 'image_url', image_url: { url: `https://cdn.test/${String(row.assetId)}.png` } }))
        return {
          status: effectiveStatus,
          currentUserContentBlocks: [{ type: 'text', text }, ...nonTextBlocks],
          sentAssetIds: includedRows.map((row: any) => String(row.assetId)),
          includedAttachments: includedRows.map((row: any) => ({ assetId: row.assetId, source: 'history', attachmentId: row.id, messageId })),
          excludedAttachments: excludedRows.map((row: any) => ({ assetId: row.assetId, source: 'history', attachmentId: row.id, messageId, exclusionReason: row.excludedReason ?? 'manually_excluded' })),
          blockingReasons: effectiveStatus === 'sendable' ? [] : [{ code: effectiveStatus === 'needs_confirmation' ? 'history_attachment_excluded' : 'hard_gate_blocked', message: replayBlockingReasonByMessageId[messageId] ?? 'blocked' }],
          diagnostics: { sendPlanStatus: effectiveStatus === 'sendable' ? 'sendable' : effectiveStatus === 'needs_confirmation' ? 'partially_sendable' : 'blocked' },
          modelCapabilitySnapshot: { providerKey: 'openrouter' },
          manifestDraft: { replayMode: 'current', attachmentDecisions: rawDecisions },
        }
      }

      if (method === 'branch.forkQuestion') {
        // Only used in one test; simulate adding a new question variant (u2b).
        u2bCounter += 1
        const qid = `u2b`
        const aid = `a2b`
        variantsByBaseA1.u2b = { qid, qBody: String(params?.newBody ?? ''), qSeq: 7 + u2bCounter * 2, aid, aBody: '', aSeq: 8 + u2bCounter * 2, createdAt: 100 + u2bCounter, status: 'streaming' }
        headQuestionId = 'u2b'
        return { ok: true, branchId, baseMessageId: 'a1', newQuestionId: qid, newQuestionSeq: variantsByBaseA1.u2b.qSeq, assistantId: aid, assistantSeq: variantsByBaseA1.u2b.aSeq }
      }

      if (method === 'message.setStatus') {
        const messageId = String(params?.messageId ?? '')
        const status = String(params?.status ?? '')
        if (variantsByBaseA1.u2b?.aid === messageId) {
          variantsByBaseA1.u2b.status = status === 'final' ? 'final' : 'streaming'
        }
        return { ok: true }
      }

      if (method === 'message.appendDelta') return { ok: true }
      if (method === 'branchFilter.set' || method === 'branchFilter.clear') return { ok: true }
      return { ok: true }
    })

    ;(globalThis as any).dbBridge = { invoke }
  })

  afterEach(() => {
    ;(globalThis as any).dbBridge = originalDbBridge
    ;(globalThis as any).electronStore = originalElectronStore
  })

  it('renders question pager and calls branch.switchQuestionCandidate', async () => {
    const user = userEvent.setup()
    render(AppChatApp)

    await screen.findByText('Q2')
    await waitFor(() => expect(screen.getByTestId('qvar-pos-u2').textContent).toBe('1/2'))

    await user.click(screen.getByTestId('qvar-next-u2'))
    await screen.findByText('Q2 alt')
    await waitFor(() => expect(screen.getByTestId('qvar-pos-u2alt').textContent).toBe('2/2'))

    const invoke = (globalThis as any).dbBridge.invoke as ReturnType<typeof vi.fn>
    expect(invoke).toHaveBeenCalledWith('branch.switchQuestionCandidate', expect.objectContaining({ branchId: 'b1', baseMessageId: 'a1', questionId: 'u2alt' }))
  })

  it('disables Replace question unless editing the last question', async () => {
    const user = userEvent.setup()
    render(AppChatApp)

    await screen.findByText('Q1')
    await screen.findByText('Q2')

    await user.click(screen.getByTestId('edit-q-u1'))
    await screen.findByTestId('question-edit-controls')
    expect(screen.getByTestId('question-edit-replace')).toBeDisabled()
    await user.click(within(screen.getByTestId('question-edit-controls')).getByText('Cancel'))

    await user.click(screen.getByTestId('edit-q-u2'))
    await screen.findByTestId('question-edit-controls')
    expect(screen.getByTestId('question-edit-replace')).not.toBeDisabled()
  })

  it('Edit action clones message draft from conversationDraft.cloneFromMessage', async () => {
    const user = userEvent.setup()
    render(AppChatApp)

    await screen.findByText('Q2')
    await user.click(screen.getByTestId('edit-q-u2'))
    await screen.findByTestId('question-edit-controls')
    await screen.findByTestId('draft-attachment-strip')
    const textarea = screen.getByTestId('composer-draft')
    await user.clear(textarea)
    await user.type(textarea, 'Q2 draft edit only')
    expect(screen.getByText('Q2')).toBeTruthy()
    expect(screen.queryByText('Q2 draft edit only')).toBeNull()

    const invoke = (globalThis as any).dbBridge.invoke as ReturnType<typeof vi.fn>
    expect(invoke).toHaveBeenCalledWith('conversationDraft.cloneFromMessage', expect.objectContaining({
      conversationId: 'c1',
      sourceMessageId: 'u2',
    }))
  })

  it('New question calls branch.forkQuestion and renders the new question text', async () => {
    const user = userEvent.setup()
    render(AppChatApp)

    await screen.findByText('Q2')

    await user.click(screen.getByTestId('edit-q-u2'))
    await screen.findByTestId('question-edit-controls')

    const textarea = screen.getByTestId('composer-draft')
    await user.clear(textarea)
    await user.type(textarea, 'Q2 edited')

    await user.click(screen.getByTestId('question-edit-new'))
    await screen.findByText('Q2 edited')

    const invoke = (globalThis as any).dbBridge.invoke as ReturnType<typeof vi.fn>
    expect(invoke).toHaveBeenCalledWith('branch.forkQuestion', expect.objectContaining({ branchId: 'b1', oldQuestionId: 'u2', newBody: 'Q2 edited' }))
    expect(invoke).toHaveBeenCalledWith('conversationDraft.attachToMessage', expect.objectContaining({
      conversationId: 'c1',
      messageId: 'u2b',
    }))
  })

  it('Edit fallback branch is blocked and does not silently submit text-only resend', async () => {
    forceCloneFromMessageFailure = true
    const user = userEvent.setup()
    render(AppChatApp)

    await screen.findByText('Q2')
    await user.click(screen.getByTestId('edit-q-u2'))
    await waitFor(() => {
      expect(screen.queryByTestId('question-edit-controls')).toBeNull()
    })

    const invoke = (globalThis as any).dbBridge.invoke as ReturnType<typeof vi.fn>
    expect(invoke.mock.calls.some((call) => call[0] === 'branch.forkQuestion')).toBe(false)
  })

  it('Edit Question with removed restored attachment does not replay that attachment', async () => {
    const user = userEvent.setup()
    render(AppChatApp)

    await screen.findByText('Q2')
    await user.click(screen.getByTestId('edit-q-u2'))
    await screen.findByTestId('question-edit-controls')
    await screen.findByTestId('draft-attachment-strip')

    await user.click(screen.getByTestId('draft-attachment-remove-asset-u2'))
    await user.click(screen.getByTestId('question-edit-new'))
    await screen.findByText('Q2')

    const lastCall = streamOpenRouterChatCallArgs.at(-1)
    expect(lastCall).toEqual(expect.objectContaining({ currentUserContentBlocks: expect.any(Array) }))
    const blocks = lastCall.currentUserContentBlocks as any[]
    expect(blocks.filter((block: any) => block.type === 'image_url').length).toBe(0)
  })

  it('Edit Question with excluded restored attachment keeps UI item but does not replay it', async () => {
    const user = userEvent.setup()
    render(AppChatApp)

    await screen.findByText('Q2')
    await user.click(screen.getByTestId('edit-q-u2'))
    await screen.findByTestId('question-edit-controls')
    await screen.findByTestId('draft-attachment-card-asset-u2')

    const invoke = (globalThis as any).dbBridge.invoke as ReturnType<typeof vi.fn>
    await invoke('conversationDraft.updateAttachmentSettings', {
      conversationId: 'c1',
      assetId: 'asset-u2',
      includeInNextRequest: false,
      excludedReason: 'manually_excluded',
    })
    expect(screen.getByTestId('draft-attachment-card-asset-u2')).toBeTruthy()

    await user.click(screen.getByTestId('question-edit-new'))
    await screen.findByTestId('attachment-confirm-panel')
    await user.click(screen.getByTestId('attachment-confirm-current-exclude-all'))
    await user.click(screen.getByTestId('attachment-confirm-confirm'))
    await screen.findByText('Q2')

    const lastCall = streamOpenRouterChatCallArgs.at(-1)
    expect(lastCall).toEqual(expect.objectContaining({ currentUserContentBlocks: expect.any(Array) }))
    const blocks = lastCall.currentUserContentBlocks as any[]
    expect(blocks.filter((block: any) => block.type === 'image_url').length).toBe(0)
  })

  it('Edit Question keeps restored and newly added attachments distinct in replay inputs', async () => {
    const user = userEvent.setup()
    render(AppChatApp)

    await screen.findByText('Q2')
    await user.click(screen.getByTestId('edit-q-u2'))
    await screen.findByTestId('question-edit-controls')
    const invoke = (globalThis as any).dbBridge.invoke as ReturnType<typeof vi.fn>
    await invoke('conversationDraft.addAttachment', { conversationId: 'c1', assetId: 'asset-new-upload' })

    await user.click(screen.getByTestId('question-edit-new'))
    await screen.findByText('Q2')

    const lastCall = streamOpenRouterChatCallArgs.at(-1)
    const blocks = lastCall.currentUserContentBlocks as any[]
    expect(blocks.filter((block: any) => block.type === 'image_url').length).toBeGreaterThanOrEqual(2)
  })

  it('Edit Question requires confirmation decisions before submit and blocks unresolved submission', async () => {
    const user = userEvent.setup()
    render(AppChatApp)
    const invoke = (globalThis as any).dbBridge.invoke as ReturnType<typeof vi.fn>

    await screen.findByText('Q2')
    await user.click(screen.getByTestId('edit-q-u2'))
    await screen.findByTestId('question-edit-controls')
    await invoke('conversationDraft.updateAttachmentSettings', {
      conversationId: 'c1',
      assetId: 'asset-u2',
      includeInNextRequest: false,
      excludedReason: 'manually_excluded',
    })
    await user.click(screen.getByTestId('question-edit-new'))
    await screen.findByTestId('attachment-confirm-panel')
    expect((screen.getByTestId('composer-draft') as HTMLTextAreaElement).disabled).toBe(true)
    expect(screen.getByTestId('question-edit-new')).toBeDisabled()
    await user.click(screen.getByTestId('attachment-confirm-confirm'))

    await waitFor(() => {
      expect(screen.getByTestId('attachment-confirm-validation').textContent).toContain('请为每个当前不受支持附件选择 exclude 或 remove')
    })
    expect(invoke.mock.calls.some((call) => call[0] === 'branch.forkQuestion')).toBe(false)
    expect(invoke.mock.calls.some((call) => call[0] === 'message.appendDelta')).toBe(false)
  })

  it('Edit Question cancel on confirmation panel restores edit session without submitting', async () => {
    const user = userEvent.setup()
    render(AppChatApp)
    const invoke = (globalThis as any).dbBridge.invoke as ReturnType<typeof vi.fn>

    await screen.findByText('Q2')
    await user.click(screen.getByTestId('edit-q-u2'))
    await screen.findByTestId('question-edit-controls')
    await invoke('conversationDraft.updateAttachmentSettings', {
      conversationId: 'c1',
      assetId: 'asset-u2',
      includeInNextRequest: false,
      excludedReason: 'manually_excluded',
    })
    await user.click(screen.getByTestId('question-edit-new'))
    await screen.findByTestId('attachment-confirm-panel')
    await user.click(screen.getByTestId('attachment-confirm-cancel'))

    await waitFor(() => {
      expect(screen.queryByTestId('attachment-confirm-panel')).toBeNull()
      expect(screen.getByTestId('question-edit-controls')).toBeTruthy()
    })
    expect(invoke.mock.calls.some((call) => call[0] === 'branch.forkQuestion')).toBe(false)
  })

  it('Edit Question replay does not mix unrelated composer draft attachments', async () => {
    const user = userEvent.setup()
    render(AppChatApp)
    const invoke = (globalThis as any).dbBridge.invoke as ReturnType<typeof vi.fn>

    await invoke('conversationDraft.addAttachment', { conversationId: 'c1', assetId: 'asset-unrelated-compose' })
    await screen.findByText('Q2')
    await user.click(screen.getByTestId('edit-q-u2'))
    await screen.findByTestId('question-edit-controls')
    await user.click(screen.getByTestId('question-edit-new'))
    await screen.findByText('Q2')

    const lastCall = streamOpenRouterChatCallArgs.at(-1)
    const blocks = lastCall.currentUserContentBlocks as any[]
    const imageUrls = blocks
      .filter((block: any) => block.type === 'image_url')
      .map((block: any) => String(block?.image_url?.url ?? ''))
    expect(imageUrls.some((url: string) => url.includes('asset-unrelated-compose'))).toBe(false)
    expect(imageUrls.some((url: string) => url.includes('asset-u2'))).toBe(true)
  })
})
