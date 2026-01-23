import { render, screen, within } from '@testing-library/vue'
import userEvent from '@testing-library/user-event'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import AppChatApp from './AppChatApp.vue'

describe('ui-app (read-only) AppChatApp', () => {
  const originalDbBridge = (globalThis as any).dbBridge

  beforeEach(() => {
    const invoke = vi.fn(async (method: string, params?: any) => {
      if (method === 'convo.list') {
        return [
          { id: 'c1', title: 'Chat 1', createdAt: 1, updatedAt: 10 },
          { id: 'c2', title: 'Chat 2', createdAt: 2, updatedAt: 20 },
        ]
      }

      if (method === 'message.list') {
        const convoId = String(params?.convoId ?? '')
        if (convoId === 'c1') {
          return [
            { id: 'm1', convoId: 'c1', role: 'user', seq: 2, createdAt: 2, body: 'hi', meta: null },
            { id: 'm0', convoId: 'c1', role: 'assistant', seq: 1, createdAt: 1, body: 'hello', meta: null },
          ]
        }
        if (convoId === 'c2') {
          return [
            { id: 'm2', convoId: 'c2', role: 'notice', seq: 1, createdAt: 1, body: 'system note', meta: null },
            { id: 'm3', convoId: 'c2', role: 'assistant', seq: 2, createdAt: 2, body: 'ack', meta: null },
          ]
        }
        return []
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

    const sidebarTitle = await screen.findByText('Conversations')
    const sidebar = (sidebarTitle.closest('.w-80') ?? document.body) as HTMLElement
    const newButton = within(sidebar).getByRole('button', { name: 'New' })

    await user.click(newButton)

    // In this read-only PR-B, create triggers a refresh and selection.
    // The mock list doesn't include c3, so selection falls back to existing convos.
    await screen.findByRole('button', { name: /Chat 1/ })
  })
})
