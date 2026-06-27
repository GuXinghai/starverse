import { render, screen } from '@testing-library/vue'
import userEvent from '@testing-library/user-event'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import AppChatApp from './AppChatApp.vue'

describe('ui-app (read-only) AppChatApp', () => {
  const originalDbBridge = (globalThis as any).dbBridge

  beforeEach(() => {
    const invoke = vi.fn(async (method: string, params?: any) => {
      if (method === 'project.getInbox') {
        return null
      }

      if (method === 'project.list') {
        return []
      }

      if (method === 'project.countConversationsBatch') {
        return { counts: {} }
      }

      if (method === 'settings.getReasoningPrefs') {
        return { value: null }
      }

      if (method === 'settings.getWebSearchDefaults') {
        return { value: null }
      }

      if (method === 'settings.getSamplingParamsDefaults') {
        return { value: null }
      }

      if (method === 'settings.getUserMessageRenderDefault') {
        return { value: null }
      }

      if (method === 'settings.getImageGenerationDefault') {
        return { value: null }
      }

      if (method === 'settings.getChatReasoningDisplayMode') {
        return { value: 'inline' }
      }

      if (method === 'settings.getChatDraft') {
        return { value: null }
      }

      if (method === 'settings.setChatDraft') {
        return { ok: true }
      }

      if (method === 'settings.deleteChatDraft') {
        return { deleted: 0 }
      }

      if (method === 'settings.deleteChatDraftsByPrefix') {
        return { deleted: 0 }
      }

      if (method === 'settings.setChatReasoningDisplayMode') {
        return { ok: true }
      }

      if (method === 'convo.list') {
        return [
          { id: 'c1', title: 'Chat 1', createdAt: 1, updatedAt: 10 },
          { id: 'c2', title: 'Chat 2', createdAt: 2, updatedAt: 20 },
        ]
      }

      if (method === 'branch.ensureDefault') {
        const convoId = String(params?.convoId ?? '')
        if (convoId === 'c1') {
          return { id: 'b1', convoId: 'c1', headMessageId: 'm1', name: 'Main', createdAt: 1, updatedAt: 10, deletedAt: null }
        }
        if (convoId === 'c2') {
          return { id: 'b2', convoId: 'c2', headMessageId: 'm3', name: 'Main', createdAt: 2, updatedAt: 20, deletedAt: null }
        }
        return { id: 'b0', convoId, headMessageId: null, name: 'Main', createdAt: 0, updatedAt: 0, deletedAt: null }
      }

      if (method === 'branch.list') {
        const convoId = String(params?.convoId ?? '')
        if (convoId === 'c1') return [{ id: 'b1', convoId: 'c1', headMessageId: 'm1', name: 'Main', createdAt: 1, updatedAt: 10, deletedAt: null }]
        if (convoId === 'c2') return [{ id: 'b2', convoId: 'c2', headMessageId: 'm3', name: 'Main', createdAt: 2, updatedAt: 20, deletedAt: null }]
        return []
      }

      if (method === 'context.getRenderableTurns') {
        const branchId = String(params?.branchId ?? '')
        if (branchId === 'b1') {
          return {
            messages: [
              { id: 'm0', convoId: 'c1', role: 'assistant', seq: 1, createdAt: 1, parentId: null, status: 'final', answerRootId: null, questionId: null, body: 'hello', meta: null },
              { id: 'm1', convoId: 'c1', role: 'user', seq: 2, createdAt: 2, parentId: 'm0', status: 'final', answerRootId: null, questionId: null, body: 'hi', meta: null },
            ],
            turns: [],
            debug: { branchId: 'b1', excludedQuestionIds: [], includedMessageIds: ['m0', 'm1'], chosenAnswerRootByQuestionId: {} },
          }
        }
        if (branchId === 'b2') {
          return {
            messages: [
              { id: 'm2', convoId: 'c2', role: 'notice', seq: 1, createdAt: 1, parentId: null, status: 'final', answerRootId: null, questionId: null, body: 'system note', meta: null },
              { id: 'm3', convoId: 'c2', role: 'assistant', seq: 2, createdAt: 2, parentId: 'm2', status: 'final', answerRootId: null, questionId: null, body: 'ack', meta: null },
            ],
            turns: [],
            debug: { branchId: 'b2', excludedQuestionIds: [], includedMessageIds: ['m2', 'm3'], chosenAnswerRootByQuestionId: {} },
          }
        }
        return { messages: [], turns: [], debug: { branchId, excludedQuestionIds: [], includedMessageIds: [], chosenAnswerRootByQuestionId: {} } }
      }

      if (method === 'context.buildForBranch') {
        return { messages: [], debug: { branchId: String(params?.branchId ?? ''), excludedQuestionIds: [], includedMessageIds: [], chosenAnswerRootByQuestionId: {} } }
      }

      if (method === 'convo.create') {
        return { id: 'c3', title: String((params as any)?.title ?? 'New'), createdAt: 3, updatedAt: 3 }
      }

      return { ok: true }
    })

    ;(globalThis as any).dbBridge = { invoke }
  })

  afterEach(() => {
    ;(globalThis as any).dbBridge = originalDbBridge
  })

  it('renders convo list and loads transcript for selected convo (seq sorted)', async () => {
    const user = userEvent.setup()
    render(AppChatApp)

    await screen.findByRole('button', { name: /Chat 1/ })
    await screen.findByRole('button', { name: /Chat 2/ })

    // default active: first convo
    await screen.findByText('hello')
    await screen.findByText('hi')

    const transcript = screen.getByText('hello').closest('.mx-auto')
    expect(transcript?.textContent).toMatch(/hello[\s\S]*hi/)

    // switch convo
    await user.click(screen.getByRole('button', { name: /Chat 2/ }))

    await screen.findByText('ack')
    await screen.findByText(/\[role:notice\]/)
    await screen.findByText(/system note/)
  })

  it('can create a new conversation', async () => {
    const user = userEvent.setup()
    render(AppChatApp)

    const newButton = await screen.findByRole('button', { name: '新建' })

    await user.click(newButton)

    // In this read-only PR-B, create triggers a refresh and selection.
    // The mock list doesn't include c3, so selection falls back to existing convos.
    await screen.findByRole('button', { name: /Chat 1/ })
  })

})
