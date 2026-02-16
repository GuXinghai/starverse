import { render, screen, waitFor } from '@testing-library/vue'
import userEvent from '@testing-library/user-event'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import AppChatApp from './AppChatApp.vue'

describe('ui-app AppChatApp user message render prefs', () => {
  const originalDbBridge = (globalThis as any).dbBridge
  const originalClipboard = globalThis.navigator.clipboard

  beforeEach(() => {
    const convos = [
      { id: 'c1', title: 'Chat 1', createdAt: 1, updatedAt: 10, meta: null as Record<string, unknown> | null },
      { id: 'c2', title: 'Chat 2', createdAt: 2, updatedAt: 20, meta: { renderUserMessageRichText: false } as Record<string, unknown> | null },
    ]
    const convoById = new Map(convos.map((c) => [c.id, c]))
    const branchByConvoId = new Map([
      ['c1', { id: 'b1', convoId: 'c1' }],
      ['c2', { id: 'b2', convoId: 'c2' }],
    ])
    const rowsByBranchId: Record<string, any[]> = {
      b1: [
        {
          id: 'u1',
          convoId: 'c1',
          role: 'user',
          seq: 1,
          createdAt: 1,
          parentId: null,
          status: 'final',
          answerRootId: null,
          questionId: null,
          body: 'raw $E=mc^2$',
          meta: null,
        },
        {
          id: 'a1',
          convoId: 'c1',
          role: 'assistant',
          seq: 2,
          createdAt: 2,
          parentId: 'u1',
          status: 'final',
          answerRootId: 'a1',
          questionId: 'u1',
          body: 'ack',
          meta: null,
        },
      ],
      b2: [
        {
          id: 'u2',
          convoId: 'c2',
          role: 'user',
          seq: 1,
          createdAt: 1,
          parentId: null,
          status: 'final',
          answerRootId: null,
          questionId: null,
          body: 'second user',
          meta: null,
        },
      ],
    }

    const invoke = vi.fn(async (method: string, params?: any) => {
      if (method === 'convo.list') return convos.map((c) => ({ ...c }))
      if (method === 'convo.create') return { id: 'c3', title: 'Chat 3', createdAt: 3, updatedAt: 3, meta: null }
      if (method === 'convo.save') {
        const convo = convoById.get(String(params?.id ?? ''))
        if (convo) convo.meta = (params?.meta ?? null) as Record<string, unknown> | null
        return { ok: true }
      }
      if (method === 'project.list') return []
      if (method === 'project.create') return { id: 'p1', name: String(params?.name ?? 'Inbox'), createdAt: 1, updatedAt: 1, meta: null }
      if (method === 'project.findById') return null
      if (method === 'project.getInbox') return { id: 'inbox', name: 'Inbox', createdAt: 1, updatedAt: 1, meta: null }
      if (method === 'project.countConversationsBatch') return { counts: {} }
      if (method === 'project.countConversations') return { count: 0 }
      if (method === 'settings.getReasoningPrefs') return { value: null }
      if (method === 'settings.getOpenRouterProviderRequireParameters') return { value: false }
      if (method === 'settings.getUserMessageRenderDefault') return { value: true }
      if (method === 'modelCatalog.list') return []
      if (method === 'reasoningModelIndex.list') return []
      if (method === 'branch.ensureDefault') {
        const convoId = String(params?.convoId ?? '')
        const branch = branchByConvoId.get(convoId)
        return {
          id: branch?.id ?? 'b0',
          convoId,
          headMessageId: null,
          name: 'Main',
          createdAt: 1,
          updatedAt: 1,
          deletedAt: null,
        }
      }
      if (method === 'branch.list') {
        const convoId = String(params?.convoId ?? '')
        const branch = branchByConvoId.get(convoId)
        if (!branch) return []
        return [{ id: branch.id, convoId, headMessageId: null, name: 'Main', createdAt: 1, updatedAt: 1, deletedAt: null }]
      }
      if (method === 'context.getRenderableTurns') {
        const bid = String(params?.branchId ?? '')
        return { messages: rowsByBranchId[bid] ?? [], turns: [] }
      }
      if (method === 'context.buildForBranch') {
        return { messages: [] }
      }
      if (method === 'messageError.listByMessageIds') return []
      return { ok: true }
    })

    ;(globalThis as any).dbBridge = { invoke }

    Object.defineProperty(globalThis.navigator, 'clipboard', {
      value: { writeText: vi.fn(async () => undefined) },
      configurable: true,
    })
  })

  afterEach(() => {
    ;(globalThis as any).dbBridge = originalDbBridge
    Object.defineProperty(globalThis.navigator, 'clipboard', {
      value: originalClipboard,
      configurable: true,
    })
  })

  it('persists tri-state override and keeps follow sessions inheriting global updates', async () => {
    const user = userEvent.setup()
    render(AppChatApp)

    const toggle = await screen.findByTestId('user-render-mode-toggle')
    await waitFor(() => expect(toggle.textContent).toContain('Follow (On)'))

    await user.click(toggle)
    expect(toggle.textContent).toContain('On')

    await user.click(toggle)
    expect(toggle.textContent).toContain('Off')

    await user.click(toggle)
    expect(toggle.textContent).toContain('Follow (On)')

    const invoke = (globalThis as any).dbBridge.invoke as ReturnType<typeof vi.fn>
    const saveCalls = invoke.mock.calls.filter((call) => call[0] === 'convo.save')
    expect(saveCalls.length).toBeGreaterThanOrEqual(3)
    expect(saveCalls[0][1]?.meta?.renderUserMessageRichText).toBe(true)
    expect(saveCalls[1][1]?.meta?.renderUserMessageRichText).toBe(false)
    expect(saveCalls[2][1]?.meta?.renderUserMessageRichText).toBeUndefined()

    window.dispatchEvent(new CustomEvent('settings:userMessageRenderDefaultUpdated', { detail: false }))
    await waitFor(() => expect(toggle.textContent).toContain('Follow (Off)'))

    await user.click(await screen.findByRole('button', { name: /Chat 2/ }))
    await waitFor(() => expect(toggle.textContent).toContain('Off'))

    window.dispatchEvent(new CustomEvent('settings:userMessageRenderDefaultUpdated', { detail: true }))
    await waitFor(() => expect(toggle.textContent).toContain('Off'))
  })

  it('copies user raw text via explicit action', async () => {
    const user = userEvent.setup()
    render(AppChatApp)

    const copyButton = await screen.findByTestId('copy-raw-q-u1')
    expect(copyButton).not.toBeDisabled()
    await user.click(copyButton)
  })
})
