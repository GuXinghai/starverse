import { fireEvent, render, screen } from '@testing-library/vue'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import AppChatApp from './AppChatApp.vue'

describe('ui-app AppChatApp draft bridge migration', () => {
  const originalDbBridge = (globalThis as any).dbBridge
  let invoke: ReturnType<typeof vi.fn>

  beforeEach(() => {
    invoke = vi.fn(async (method: string, params?: any) => {
      if (method === 'project.getInbox') return null
      if (method === 'project.list') return []
      if (method === 'project.countConversationsBatch') return { counts: {} }
      if (method === 'settings.getReasoningPrefs') return { value: null }
      if (method === 'settings.getWebSearchDefaults') return { value: null }
      if (method === 'settings.getSamplingParamsDefaults') return { value: null }
      if (method === 'settings.getUserMessageRenderDefault') return { value: null }
      if (method === 'settings.getImageGenerationDefault') return { value: null }
      if (method === 'settings.getChatReasoningDisplayMode') return { value: 'inline' }
      if (method === 'settings.setChatReasoningDisplayMode') return { ok: true }

      if (method === 'convo.list') {
        return [{ id: 'c1', title: 'Chat 1', createdAt: 1, updatedAt: 2 }]
      }
      if (method === 'branch.ensureDefault') {
        return { id: 'b1', convoId: 'c1', headMessageId: null, name: 'Main', createdAt: 1, updatedAt: 2, deletedAt: null }
      }
      if (method === 'branch.list') {
        return [{ id: 'b1', convoId: 'c1', headMessageId: null, name: 'Main', createdAt: 1, updatedAt: 2, deletedAt: null }]
      }
      if (method === 'context.getRenderableTurns') {
        return { messages: [], turns: [], debug: { branchId: 'b1', excludedQuestionIds: [], includedMessageIds: [], chosenAnswerRootByQuestionId: {} } }
      }
      if (method === 'context.buildForBranch') {
        return { messages: [], debug: { branchId: 'b1', excludedQuestionIds: [], includedMessageIds: [], chosenAnswerRootByQuestionId: {} } }
      }

      if (method === 'conversationDraft.restore') {
        return {
          conversationId: 'c1',
          draftText: 'restored from conversation draft',
          draftMode: 'compose',
          editingSourceMessageId: null,
          attachedAssetIds: [],
          attachments: [],
          updatedAt: 1,
        }
      }

      if (method === 'conversationDraft.updateText') {
        return {
          conversationId: 'c1',
          draftText: String(params?.draftText ?? ''),
          draftMode: 'compose',
          editingSourceMessageId: null,
          attachedAssetIds: [],
          attachments: [],
          updatedAt: 2,
        }
      }

      return { ok: true }
    })
    ;(globalThis as any).dbBridge = { invoke }
  })

  afterEach(() => {
    ;(globalThis as any).dbBridge = originalDbBridge
    vi.restoreAllMocks()
  })

  it('restores draft text from conversationDraft.restore instead of legacy chatDraft', async () => {
    render(AppChatApp)
    await screen.findByDisplayValue('restored from conversation draft')

    const calledMethods = invoke.mock.calls.map((call) => String(call[0]))
    expect(calledMethods).toContain('conversationDraft.restore')
    expect(calledMethods).not.toContain('settings.getChatDraft')
  })

  it('persists draft text through conversationDraft.updateText and never calls legacy chatDraft writes', async () => {
    render(AppChatApp)

    const textarea = (await screen.findByPlaceholderText('Type a message...')) as HTMLTextAreaElement
    await fireEvent.update(textarea, 'new text')
    await new Promise((resolve) => setTimeout(resolve, 350))

    const updateCalls = invoke.mock.calls.filter((call) => call[0] === 'conversationDraft.updateText')
    expect(updateCalls.length).toBeGreaterThan(0)
    const payload = updateCalls[0]?.[1] as Record<string, unknown>
    expect(payload.conversationId).toBe('c1')
    expect(payload.draftMode).toBe('compose')
    expect(payload.editingSourceMessageId).toBeNull()

    const calledMethods = invoke.mock.calls.map((call) => String(call[0]))
    expect(calledMethods).not.toContain('settings.setChatDraft')
    expect(calledMethods).not.toContain('settings.deleteChatDraft')
  })
})
