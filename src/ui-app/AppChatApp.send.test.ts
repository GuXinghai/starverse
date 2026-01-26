import { render, screen, waitFor } from '@testing-library/vue'
import userEvent from '@testing-library/user-event'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import AppChatApp from './AppChatApp.vue'

vi.mock('@/next/live/openRouterLiveStream', () => {
  async function* streamOpenRouterChatAsEvents() {
    yield { type: 'MetaDelta', meta: { id: 'gen_1', model: 'openrouter/auto' } }
    yield { type: 'MessageDeltaText', messageId: 'a1', choiceIndex: 0, text: 'h' }
    yield { type: 'MessageDeltaText', messageId: 'a1', choiceIndex: 0, text: 'i' }
    yield { type: 'StreamDone' }
  }
  return { streamOpenRouterChatAsEvents }
})

describe('ui-app AppChatApp (send: pure text)', () => {
  const originalDbBridge = (globalThis as any).dbBridge
  const originalElectronStore = (globalThis as any).electronStore
  const originalSetTimeout = globalThis.setTimeout

  beforeEach(() => {
    vi.useFakeTimers()
    // Make throttle immediate in tests (while still exercising scheduling code paths).
    globalThis.setTimeout = ((fn: (...args: any[]) => void) => originalSetTimeout(fn, 0)) as any

    ;(globalThis as any).electronStore = {
      get: vi.fn(async (key: string) => {
        if (key === 'openRouterApiKey') return 'sk-test'
        if (key === 'openRouterBaseUrl') return 'https://openrouter.ai/api/v1'
        return undefined
      }),
    }

    const persisted: Array<any> = []
    const invoke = vi.fn(async (method: string, params?: any) => {
      if (method === 'convo.list') {
        return [{ id: 'c1', title: 'Chat 1', createdAt: 1, updatedAt: 1 }]
      }
      if (method === 'branch.ensureDefault') {
        return { id: 'b1', convoId: 'c1', headMessageId: null, name: 'Main', createdAt: 1, updatedAt: 1, deletedAt: null }
      }
      if (method === 'branch.list') {
        return [{ id: 'b1', convoId: 'c1', headMessageId: persisted[persisted.length - 1]?.id ?? null, name: 'Main', createdAt: 1, updatedAt: 1, deletedAt: null }]
      }
      if (method === 'context.getRenderableTurns') {
        const hasQ = persisted.some((m) => String(m.role) === 'user')
        return {
          messages: persisted,
          turns: hasQ
            ? [{ questionId: 'u1', chosenAnswerRootId: 'a1', questionMode: 'include', answerMode: 'include', effectiveMode: 'include', lockedByQuestionExclude: false }]
            : [],
          debug: { branchId: 'b1', excludedQuestionIds: [], includedMessageIds: persisted.map((m) => m.id), chosenAnswerRootByQuestionId: hasQ ? { u1: 'a1' } : {} },
        }
      }
      if (method === 'context.buildForBranch') {
        return { messages: [], debug: { branchId: 'b1', excludedQuestionIds: [], includedMessageIds: [], chosenAnswerRootByQuestionId: {} } }
      }
      if (method === 'branch.beginTurn') {
        const userBody = String(params?.userBody ?? '')
        const now = Date.now()
        persisted.push({
          id: 'u1',
          convoId: 'c1',
          role: 'user',
          seq: 1,
          createdAt: now,
          parentId: null,
          status: 'final',
          answerRootId: null,
          questionId: null,
          body: userBody,
          meta: null,
        })
        persisted.push({
          id: 'a1',
          convoId: 'c1',
          role: 'assistant',
          seq: 2,
          createdAt: now + 1,
          parentId: 'u1',
          status: 'streaming',
          answerRootId: 'a1',
          questionId: 'u1',
          body: '',
          meta: null,
        })
        return { ok: true, convoId: 'c1', branchId: 'b1', questionId: 'u1', questionSeq: 1, assistantId: 'a1', assistantSeq: 2 }
      }
      if (method === 'message.appendDelta') {
        const targetSeq = Number(params?.seq ?? NaN)
        const appendBody = String(params?.appendBody ?? '')
        const msg = persisted.find((m) => Number(m.seq) === targetSeq)
        if (msg && appendBody) msg.body = String(msg.body ?? '') + appendBody
        return { ok: true }
      }
      if (method === 'message.setStatus') {
        const messageId = String(params?.messageId ?? '')
        const status = String(params?.status ?? '')
        const msg = persisted.find((m) => String(m.id) === messageId)
        if (msg) msg.status = status
        return { ok: true }
      }
      if (method === 'convo.create') return { id: 'c1', title: 'Chat 1', createdAt: 1, updatedAt: 1 }
      return { ok: true }
    })

    ;(globalThis as any).dbBridge = { invoke }
  })

  afterEach(() => {
    ;(globalThis as any).dbBridge = originalDbBridge
    ;(globalThis as any).electronStore = originalElectronStore
    globalThis.setTimeout = originalSetTimeout
    vi.useRealTimers()
  })

  it('appends user+assistant, streams text, persists via message.appendDelta', async () => {
    const user = userEvent.setup()
    render(AppChatApp)

    await screen.findByRole('button', { name: /Chat 1/ })

    await waitFor(() => expect(screen.getByRole('button', { name: 'New' })).not.toBeDisabled())

    const box = screen.getByPlaceholderText('Type a message...')
    expect(box).not.toBeDisabled()
    await user.click(box)
    await user.type(box, 'ping')
    expect((box as HTMLTextAreaElement).value).toBe('ping')

    const send = screen.getByRole('button', { name: 'Send' })
    expect(send).not.toBeDisabled()
    await user.click(send)

    await screen.findByText('ping')
    await screen.findByText('hi')

    await vi.runAllTimersAsync()

    const invoke = (globalThis as any).dbBridge.invoke as ReturnType<typeof vi.fn>
    expect(invoke).toHaveBeenCalledWith('context.buildForBranch', expect.objectContaining({ branchId: 'b1' }))
    expect(invoke).toHaveBeenCalledWith('branch.beginTurn', expect.objectContaining({ branchId: 'b1', userBody: 'ping' }))
    expect(invoke).toHaveBeenCalledWith('message.appendDelta', expect.objectContaining({ convoId: 'c1', seq: 2 }))
    expect(invoke).toHaveBeenCalledWith('message.setStatus', expect.objectContaining({ messageId: 'a1', status: 'final' }))
    expect(invoke.mock.calls.filter((c) => c[0] === 'message.appendDelta').length).toBeGreaterThanOrEqual(1)
  })
})
