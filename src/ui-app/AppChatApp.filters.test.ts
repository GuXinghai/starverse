import { render, screen, waitFor } from '@testing-library/vue'
import userEvent from '@testing-library/user-event'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import AppChatApp from './AppChatApp.vue'

describe('ui-app AppChatApp (filters: include/exclude)', () => {
  const originalDbBridge = (globalThis as any).dbBridge
  const originalElectronStore = (globalThis as any).electronStore

  beforeEach(() => {
    ;(globalThis as any).electronStore = { get: vi.fn(async () => 'sk-test') }

    const invoke = vi.fn(async (method: string, _params?: any) => {
      if (method === 'project.list') return []
      if (method === 'convo.list') return [{ id: 'c1', title: 'Chat 1', createdAt: 1, updatedAt: 1 }]
      if (method === 'branch.ensureDefault') return { id: 'b1', convoId: 'c1', headMessageId: 'a1', name: 'Main', createdAt: 1, updatedAt: 1, deletedAt: null }
      if (method === 'branch.list') return [{ id: 'b1', convoId: 'c1', headMessageId: 'a1', name: 'Main', createdAt: 1, updatedAt: 1, deletedAt: null }]

      if (method === 'context.getRenderableTurns') {
        return {
          messages: [
            { id: 'u1', convoId: 'c1', role: 'user', seq: 1, createdAt: 1, parentId: null, status: 'final', answerRootId: null, questionId: null, body: 'Q1', meta: null },
            { id: 'a1', convoId: 'c1', role: 'assistant', seq: 2, createdAt: 2, parentId: 'u1', status: 'final', answerRootId: 'a1', questionId: 'u1', body: 'A1', meta: null },
          ],
          turns: [
            { questionId: 'u1', chosenAnswerRootId: 'a1', questionMode: 'include', answerMode: 'include', effectiveMode: 'include', lockedByQuestionExclude: false },
          ],
          debug: { branchId: 'b1', excludedQuestionIds: [], includedMessageIds: ['u1', 'a1'], chosenAnswerRootByQuestionId: { u1: 'a1' } },
        }
      }

      if (method === 'context.buildForBranch') {
        return { messages: [], debug: { branchId: 'b1', excludedQuestionIds: [], includedMessageIds: [], chosenAnswerRootByQuestionId: { u1: 'a1' } } }
      }

      if (method === 'branchFilter.set' || method === 'branchFilter.clear') return { ok: true }
      return { ok: true }
    })

    ;(globalThis as any).dbBridge = { invoke }
  })

  afterEach(() => {
    ;(globalThis as any).dbBridge = originalDbBridge
    ;(globalThis as any).electronStore = originalElectronStore
  })

  it('clicking question exclude calls branchFilter.set', async () => {
    const user = userEvent.setup()
    render(AppChatApp)

    await screen.findByText('Q1')

    const btn = await screen.findByTestId('toggle-q-u1')
    await user.click(btn)

    const invoke = (globalThis as any).dbBridge.invoke as ReturnType<typeof vi.fn>
    expect(invoke).toHaveBeenCalledWith('branchFilter.set', expect.objectContaining({ branchId: 'b1', targetType: 'question', targetId: 'u1', mode: 'exclude' }))

    // Refresh called (context.getRenderableTurns invoked again).
    await waitFor(() => expect(invoke).toHaveBeenCalledWith('context.getRenderableTurns', expect.objectContaining({ branchId: 'b1' })))
  })
})
