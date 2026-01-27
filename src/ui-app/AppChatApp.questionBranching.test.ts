import { render, screen, waitFor, within } from '@testing-library/vue'
import userEvent from '@testing-library/user-event'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import AppChatApp from './AppChatApp.vue'

vi.mock('@/next/live/openRouterLiveStream', () => {
  async function* streamOpenRouterChatAsEvents() {
    yield { type: 'StreamDone' }
  }
  return { streamOpenRouterChatAsEvents }
})

describe('ui-app AppChatApp (question branching: pager + edit)', () => {
  const originalDbBridge = (globalThis as any).dbBridge
  const originalElectronStore = (globalThis as any).electronStore

  beforeEach(() => {
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
      if (method === 'project.list') return []
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
    await screen.findByTestId('question-edit-dialog')
    expect(screen.getByTestId('question-edit-replace')).toBeDisabled()
    await user.click(screen.getByText('Cancel'))

    await user.click(screen.getByTestId('edit-q-u2'))
    await screen.findByTestId('question-edit-dialog')
    expect(screen.getByTestId('question-edit-replace')).not.toBeDisabled()
  })

  it('New question calls branch.forkQuestion and renders the new question text', async () => {
    const user = userEvent.setup()
    render(AppChatApp)

    await screen.findByText('Q2')

    await user.click(screen.getByTestId('edit-q-u2'))
    await screen.findByTestId('question-edit-dialog')

    const textarea = within(screen.getByTestId('question-edit-dialog')).getByRole('textbox')
    await user.clear(textarea)
    await user.type(textarea, 'Q2 edited')

    await user.click(screen.getByTestId('question-edit-new'))
    await screen.findByText('Q2 edited')

    const invoke = (globalThis as any).dbBridge.invoke as ReturnType<typeof vi.fn>
    expect(invoke).toHaveBeenCalledWith('branch.forkQuestion', expect.objectContaining({ branchId: 'b1', oldQuestionId: 'u2', newBody: 'Q2 edited' }))
  })
})
