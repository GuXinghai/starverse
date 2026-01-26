import { render, screen, waitFor } from '@testing-library/vue'
import userEvent from '@testing-library/user-event'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import AppChatApp from './AppChatApp.vue'

describe('ui-app AppChatApp (candidate pager)', () => {
  const originalDbBridge = (globalThis as any).dbBridge
  const originalElectronStore = (globalThis as any).electronStore

  beforeEach(() => {
    ;(globalThis as any).electronStore = { get: vi.fn(async () => 'sk-test') }

    let chosen: 'a1' | 'a2' = 'a1'
    const invoke = vi.fn(async (method: string, params?: any) => {
      if (method === 'project.list') return []
      if (method === 'convo.list') return [{ id: 'c1', title: 'Chat 1', createdAt: 1, updatedAt: 1 }]
      if (method === 'branch.ensureDefault') return { id: 'b1', convoId: 'c1', headMessageId: 'a1', name: 'Main', createdAt: 1, updatedAt: 1, deletedAt: null }
      if (method === 'branch.list') return [{ id: 'b1', convoId: 'c1', headMessageId: chosen, name: 'Main', createdAt: 1, updatedAt: 1, deletedAt: null }]

      if (method === 'branch.getCandidates') {
        // Worker returns new -> old (created_at desc). UI reverses to old -> new.
        return [
          { answerRootId: 'a2', createdAt: 2, status: 'final' },
          { answerRootId: 'a1', createdAt: 1, status: 'final' },
        ]
      }

      if (method === 'context.getRenderableTurns') {
        return {
          messages: [
            { id: 'u1', convoId: 'c1', role: 'user', seq: 1, createdAt: 1, parentId: null, status: 'final', answerRootId: null, questionId: null, body: 'Q1', meta: null },
            {
              id: chosen,
              convoId: 'c1',
              role: 'assistant',
              seq: chosen === 'a1' ? 2 : 3,
              createdAt: chosen === 'a1' ? 2 : 3,
              parentId: 'u1',
              status: 'final',
              answerRootId: chosen,
              questionId: 'u1',
              body: chosen === 'a1' ? 'A1' : 'A2',
              meta: null,
            },
          ],
          turns: [
            { questionId: 'u1', chosenAnswerRootId: chosen, questionMode: 'include', answerMode: 'include', effectiveMode: 'include', lockedByQuestionExclude: false },
          ],
          debug: { branchId: 'b1', excludedQuestionIds: [], includedMessageIds: ['u1', chosen], chosenAnswerRootByQuestionId: { u1: chosen } },
        }
      }

      if (method === 'context.buildForBranch') return { messages: [], debug: { branchId: 'b1', excludedQuestionIds: [], includedMessageIds: [], chosenAnswerRootByQuestionId: {} } }
      if (method === 'branch.switchCandidate') {
        const answerRootId = String(params?.answerRootId ?? '')
        chosen = answerRootId === 'a2' ? 'a2' : 'a1'
        return { ok: true, headMessageId: chosen }
      }

      if (method === 'branch.beginTurn') {
        return { ok: true, convoId: 'c1', branchId: 'b1', questionId: 'u2', questionSeq: 10, assistantId: 'a99', assistantSeq: 11 }
      }

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

  it('renders < i/n > and uses branch.switchCandidate (atomic) on click', async () => {
    const user = userEvent.setup()
    render(AppChatApp)

    await screen.findByText('Q1')
    await waitFor(() => expect(screen.getByTestId('cand-pos-u1').textContent).toBe('1/2'))

    expect(screen.getByTestId('cand-prev-u1')).toBeDisabled()
    expect(screen.getByTestId('cand-next-u1')).not.toBeDisabled()

    await user.click(screen.getByTestId('cand-next-u1'))
    await screen.findByText('A2')
    await waitFor(() => expect(screen.getByTestId('cand-pos-u1').textContent).toBe('2/2'))

    const invoke = (globalThis as any).dbBridge.invoke as ReturnType<typeof vi.fn>
    expect(invoke).toHaveBeenCalledWith('branch.switchCandidate', expect.objectContaining({ branchId: 'b1', questionId: 'u1', answerRootId: 'a2' }))
    expect(invoke.mock.calls.some((c) => c[0] === 'branchChoice.set')).toBe(false)
    expect(invoke.mock.calls.some((c) => c[0] === 'branch.setHead')).toBe(false)
  })

  it('disables < and > when the chosen answer group is streaming', async () => {
    const invoke = (globalThis as any).dbBridge.invoke as ReturnType<typeof vi.fn>
    invoke.mockImplementation(async (method: string, params?: any) => {
      if (method === 'project.list') return []
      if (method === 'convo.list') return [{ id: 'c1', title: 'Chat 1', createdAt: 1, updatedAt: 1 }]
      if (method === 'branch.ensureDefault') return { id: 'b1', convoId: 'c1', headMessageId: 'a1', name: 'Main', createdAt: 1, updatedAt: 1, deletedAt: null }
      if (method === 'branch.list') return [{ id: 'b1', convoId: 'c1', headMessageId: 'a1', name: 'Main', createdAt: 1, updatedAt: 1, deletedAt: null }]
      // Worker returns new -> old (created_at desc). UI reverses to old -> new.
      if (method === 'branch.getCandidates') return [{ answerRootId: 'a2', createdAt: 2, status: 'final' }, { answerRootId: 'a1', createdAt: 1, status: 'final' }]
      if (method === 'context.getRenderableTurns') {
        return {
          messages: [
            { id: 'u1', convoId: 'c1', role: 'user', seq: 1, createdAt: 1, parentId: null, status: 'final', answerRootId: null, questionId: null, body: 'Q1', meta: null },
            { id: 'a1', convoId: 'c1', role: 'assistant', seq: 2, createdAt: 2, parentId: 'u1', status: 'streaming', answerRootId: 'a1', questionId: 'u1', body: '', meta: null },
          ],
          turns: [
            { questionId: 'u1', chosenAnswerRootId: 'a1', questionMode: 'include', answerMode: 'include', effectiveMode: 'include', lockedByQuestionExclude: false },
          ],
          debug: { branchId: 'b1', excludedQuestionIds: [], includedMessageIds: ['u1', 'a1'], chosenAnswerRootByQuestionId: { u1: 'a1' } },
        }
      }
      return { ok: true }
    })

    render(AppChatApp)
    await screen.findByText('Q1')
    await waitFor(() => expect(screen.getByTestId('cand-pos-u1').textContent).toBe('1/2'))
    expect(screen.getByTestId('cand-prev-u1')).toBeDisabled()
    expect(screen.getByTestId('cand-next-u1')).toBeDisabled()
  })
})
