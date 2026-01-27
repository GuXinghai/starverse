import { render, screen, waitFor } from '@testing-library/vue'
import userEvent from '@testing-library/user-event'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import AppChatApp from './AppChatApp.vue'

describe('ui-app AppChatApp (no-answer question pager)', () => {
  const originalDbBridge = (globalThis as any).dbBridge
  const originalElectronStore = (globalThis as any).electronStore

  beforeEach(() => {
    ;(globalThis as any).electronStore = { get: vi.fn(async () => 'sk-test') }

    const convoId = 'c1'
    const branchId = 'b1'

    let headQuestionId: 'u2' | 'u2alt' = 'u2'

    const invoke = vi.fn(async (method: string, params?: any) => {
      if (method === 'project.list') return []
      if (method === 'convo.list') return [{ id: convoId, title: 'Chat 1', createdAt: 1, updatedAt: 1 }]
      if (method === 'branch.ensureDefault') return { id: branchId, convoId, headMessageId: headQuestionId, name: 'Main', createdAt: 1, updatedAt: 1, deletedAt: null }
      if (method === 'branch.list') return [{ id: branchId, convoId, headMessageId: headQuestionId, name: 'Main', createdAt: 1, updatedAt: 1, deletedAt: null }]

      if (method === 'branch.getQuestionCandidates') {
        // Worker returns new -> old (created_at desc).
        return [
          { questionId: 'u2alt', createdAt: 2, status: 'final' },
          { questionId: 'u2', createdAt: 1, status: 'final' },
        ]
      }

      if (method === 'branch.switchQuestionCandidate') {
        const qid = String(params?.questionId ?? '')
        headQuestionId = qid === 'u2alt' ? 'u2alt' : 'u2'
        return { ok: true, headMessageId: headQuestionId }
      }

      if (method === 'branch.getCandidates') {
        // Only Q1 has an answer; keep it single-candidate so the answer pager doesn't render.
        return [{ answerRootId: 'a1', createdAt: 1, status: 'final' }]
      }

      if (method === 'context.getRenderableTurns') {
        const questionBody = headQuestionId === 'u2alt' ? 'Q2 alt (no answer)' : 'Q2 (no answer)'
        return {
          messages: [
            { id: 'u1', convoId, role: 'user', seq: 1, createdAt: 1, parentId: null, status: 'final', answerRootId: null, questionId: null, body: 'Q1', meta: null },
            {
              id: 'a1',
              convoId,
              role: 'assistant',
              seq: 2,
              createdAt: 2,
              parentId: 'u1',
              status: 'final',
              answerRootId: 'a1',
              questionId: 'u1',
              body: 'A1',
              meta: null,
            },
            {
              id: headQuestionId,
              convoId,
              role: 'user',
              seq: headQuestionId === 'u2alt' ? 4 : 3,
              createdAt: headQuestionId === 'u2alt' ? 4 : 3,
              parentId: 'a1',
              status: 'final',
              answerRootId: null,
              questionId: null,
              body: questionBody,
              meta: null,
            },
          ],
          turns: [
            { questionId: 'u1', chosenAnswerRootId: 'a1', questionMode: 'include', answerMode: 'include', effectiveMode: 'include', lockedByQuestionExclude: false },
            { questionId: headQuestionId, chosenAnswerRootId: '', questionMode: 'include', answerMode: 'include', effectiveMode: 'include', lockedByQuestionExclude: false },
          ],
          debug: { branchId, excludedQuestionIds: [], includedMessageIds: ['u1', 'a1', headQuestionId], chosenAnswerRootByQuestionId: { u1: 'a1' } },
        }
      }

      if (method === 'context.buildForBranch') return { messages: [], debug: { branchId, excludedQuestionIds: [], includedMessageIds: [], chosenAnswerRootByQuestionId: {} } }
      if (method === 'message.appendDelta' || method === 'message.setStatus') return { ok: true }
      if (method === 'branchFilter.set' || method === 'branchFilter.clear') return { ok: true }
      return { ok: true }
    })

    ;(globalThis as any).dbBridge = { invoke }
  })

  afterEach(() => {
    ;(globalThis as any).dbBridge = originalDbBridge
    ;(globalThis as any).electronStore = originalElectronStore
  })

  it('keeps question variant pager usable when head==question (no answer), and does not render answer candidate pager for that question', async () => {
    const user = userEvent.setup()
    render(AppChatApp)

    await screen.findByText('Q2 (no answer)')
    await waitFor(() => expect(screen.getByTestId('qvar-pos-u2').textContent).toBe('1/2'))

    expect(screen.queryByTestId('cand-pos-u2')).toBeNull()

    await user.click(screen.getByTestId('qvar-next-u2'))
    await screen.findByText('Q2 alt (no answer)')
    await waitFor(() => expect(screen.getByTestId('qvar-pos-u2alt').textContent).toBe('2/2'))

    const invoke = (globalThis as any).dbBridge.invoke as ReturnType<typeof vi.fn>
    expect(invoke).toHaveBeenCalledWith('branch.switchQuestionCandidate', expect.objectContaining({ branchId: 'b1', baseMessageId: 'a1', questionId: 'u2alt' }))
  })
})
