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

    let seq = 0
    const invoke = vi.fn(async (method: string, params?: any) => {
      if (method === 'convo.list') {
        return [{ id: 'c1', title: 'Chat 1', createdAt: 1, updatedAt: 1 }]
      }
      if (method === 'message.list') return []
      if (method === 'message.append') {
        seq += 1
        const role = String(params?.role ?? '')
        const id = role === 'assistant' ? 'a1' : 'u1'
        return { id, convoId: 'c1', role, seq, createdAt: Date.now(), body: String(params?.body ?? ''), meta: null }
      }
      if (method === 'message.appendDelta') return { ok: true }
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
    expect(invoke).toHaveBeenCalledWith('message.append', expect.objectContaining({ convoId: 'c1', role: 'user', body: 'ping' }))
    expect(invoke).toHaveBeenCalledWith('message.append', expect.objectContaining({ convoId: 'c1', role: 'assistant', body: '' }))
    expect(invoke).toHaveBeenCalledWith('message.appendDelta', expect.objectContaining({ convoId: 'c1', seq: 2 }))
    expect(invoke.mock.calls.filter((c) => c[0] === 'message.appendDelta').length).toBeGreaterThanOrEqual(1)
  })
})
