import { render, screen, waitFor } from '@testing-library/vue'
import userEvent from '@testing-library/user-event'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import AppChatApp from './AppChatApp.vue'

vi.mock('@/next/live/openRouterLiveStream', () => {
  async function* streamOpenRouterChatAsEvents(options: any) {
    yield { type: 'MetaDelta', meta: { id: 'gen_1', model: 'openrouter/auto' } }
    yield { type: 'MessageDeltaText', messageId: String(options?.assistantMessageId ?? ''), choiceIndex: 0, text: 'o' }
    yield { type: 'MessageDeltaText', messageId: String(options?.assistantMessageId ?? ''), choiceIndex: 0, text: 'k' }
    yield { type: 'StreamDone' }
  }
  return { streamOpenRouterChatAsEvents }
})

type PersistedMessage = {
  id: string
  convoId: string
  role: 'user' | 'assistant' | 'tool'
  seq: number
  createdAt: number
  parentId: string | null
  status: 'streaming' | 'final' | 'error'
  answerRootId: string | null
  questionId: string | null
  body: string
  meta: any
}

const defaultInboxProject = Object.freeze({
  id: 'project_inbox',
  name: 'Inbox',
  createdAt: 1,
  updatedAt: 1,
  meta: null,
  isSystemProject: true,
})

function mockProjectBootstrapCalls(method: string) {
  if (method === 'project.getInbox') return defaultInboxProject
  if (method === 'project.list') return [defaultInboxProject]
  if (method === 'project.countConversationsBatch') {
    return { counts: { [defaultInboxProject.id]: 0 } }
  }
  return undefined
}

describe('ui-app AppChatApp (regenerate + retry replace)', () => {
  const originalDbBridge = (globalThis as any).dbBridge
  const originalElectronStore = (globalThis as any).electronStore
  const originalSetTimeout = globalThis.setTimeout

  beforeEach(() => {
    vi.useFakeTimers()
    globalThis.setTimeout = ((fn: (...args: any[]) => void) => originalSetTimeout(fn, 0)) as any

    ;(globalThis as any).electronStore = {
      get: vi.fn(async (key: string) => {
        if (key === 'openRouterApiKey') return 'sk-test'
        if (key === 'openRouterBaseUrl') return 'https://openrouter.ai/api/v1'
        return undefined
      }),
    }
  })

  afterEach(() => {
    ;(globalThis as any).dbBridge = originalDbBridge
    ;(globalThis as any).electronStore = originalElectronStore
    globalThis.setTimeout = originalSetTimeout
    vi.useRealTimers()
  })

  it('regenerate creates a new answer root, updates < i/n >, and streams into the new assistant', async () => {
    const user = userEvent.setup()

    const convoId = 'c1'
    const branchId = 'b1'
    const now = Date.now()

    const store: {
      headMessageId: string | null
      chosenAnswerRootId: string
      candidatesNewToOld: Array<{ answerRootId: string; createdAt: number; status: string }>
      messagesById: Record<string, PersistedMessage>
    } = {
      headMessageId: 'a1',
      chosenAnswerRootId: 'a1',
      candidatesNewToOld: [{ answerRootId: 'a1', createdAt: now + 2, status: 'final' }],
      messagesById: {
        u1: {
          id: 'u1',
          convoId,
          role: 'user',
          seq: 1,
          createdAt: now,
          parentId: null,
          status: 'final',
          answerRootId: null,
          questionId: null,
          body: 'Q1',
          meta: null,
        },
        a1: {
          id: 'a1',
          convoId,
          role: 'assistant',
          seq: 2,
          createdAt: now + 1,
          parentId: 'u1',
          status: 'final',
          answerRootId: 'a1',
          questionId: 'u1',
          body: 'A1',
          meta: null,
        },
      },
    }

    const invoke = vi.fn(async (method: string, params?: any) => {
      const projectBootstrap = mockProjectBootstrapCalls(method)
      if (projectBootstrap !== undefined) return projectBootstrap
      if (method === 'convo.list') return [{ id: convoId, title: 'Chat 1', createdAt: 1, updatedAt: 1 }]
      if (method === 'branch.ensureDefault') {
        return { id: branchId, convoId, headMessageId: store.headMessageId, name: 'Main', createdAt: 1, updatedAt: 1, deletedAt: null }
      }
      if (method === 'branch.list') {
        return [{ id: branchId, convoId, headMessageId: store.headMessageId, name: 'Main', createdAt: 1, updatedAt: 1, deletedAt: null }]
      }
      if (method === 'context.getRenderableTurns') {
        const q = store.messagesById.u1
        const chosen = store.messagesById[store.chosenAnswerRootId]
        return {
          messages: [q, chosen],
          turns: [{ questionId: 'u1', chosenAnswerRootId: store.chosenAnswerRootId, questionMode: 'include', answerMode: 'include', effectiveMode: 'include', lockedByQuestionExclude: false }],
        }
      }
      if (method === 'context.buildForBranch') {
        return { messages: [] }
      }
      if (method === 'branch.getCandidates') {
        return store.candidatesNewToOld
      }
      if (method === 'branch.regenerateFromQuestion') {
        const createdAt = Date.now()
        store.messagesById.a2 = {
          id: 'a2',
          convoId,
          role: 'assistant',
          seq: 3,
          createdAt,
          parentId: 'u1',
          status: 'streaming',
          answerRootId: 'a2',
          questionId: 'u1',
          body: '',
          meta: null,
        }
        store.headMessageId = 'a2'
        store.chosenAnswerRootId = 'a2'
        store.candidatesNewToOld = [
          { answerRootId: 'a2', createdAt: createdAt + 1, status: 'streaming' },
          ...store.candidatesNewToOld,
        ]
        return { ok: true, newAnswerRootId: 'a2', newAssistantSeq: 3 }
      }
      if (method === 'message.appendDelta') {
        const seq = Number(params?.seq ?? NaN)
        const appendBody = String(params?.appendBody ?? '')
        const msg = Object.values(store.messagesById).find((m) => m.seq === seq)
        if (msg) msg.body = String(msg.body ?? '') + appendBody
        return { ok: true }
      }
      if (method === 'message.setStatus') {
        const messageId = String(params?.messageId ?? '')
        const status = String(params?.status ?? '')
        const msg = store.messagesById[messageId]
        if (msg) msg.status = status as any
        return { ok: true }
      }
      if (method === 'modelPrefs.recordRecent') {
        const nowTs = Date.now()
        return {
          scopeType: 'global',
          scopeId: '',
          providerKey: String(params?.providerKey ?? 'openrouter'),
          modelId: String(params?.modelId ?? ''),
          modelKey: String(params?.modelKey ?? ''),
          lastUsedAtMs: nowTs,
          useCount: 1,
          createdAtMs: nowTs,
          updatedAtMs: nowTs,
        }
      }
      return { ok: true }
    })

    ;(globalThis as any).dbBridge = { invoke }

    render(AppChatApp)

    await screen.findByRole('button', { name: /Chat 1/ })
    await screen.findByText('Q1')
    await screen.findByText('A1')

    const regen = await screen.findByTestId('regen-q-u1')
    expect(regen).not.toBeDisabled()
    await user.click(regen)

    await screen.findByText('ok')
    await waitFor(() => expect(screen.getByTestId('cand-pos-u1').textContent).toBe('2/2'))

    await vi.runAllTimersAsync()

    expect(invoke).toHaveBeenCalledWith('branch.regenerateFromQuestion', expect.objectContaining({ branchId: 'b1', questionId: 'u1' }))
    expect(invoke).toHaveBeenCalledWith('message.appendDelta', expect.objectContaining({ convoId: 'c1', seq: 3 }))
    expect(invoke).toHaveBeenCalledWith('message.setStatus', expect.objectContaining({ messageId: 'a2', status: 'final' }))
    expect(invoke).toHaveBeenCalledWith(
      'modelPrefs.recordRecent',
      expect.objectContaining({
        scopeType: 'global',
        scopeId: '',
        providerKey: 'openrouter',
        modelId: 'openrouter/auto',
        modelKey: 'openrouter::openrouter/auto',
      }),
    )
    expect(invoke.mock.calls.filter((c) => c[0] === 'branch.getCandidates').length).toBeGreaterThanOrEqual(2)
  })

  it('retry replace hides old candidate (branch-local), selects new candidate, updates < i/n >, and streams', async () => {
    const user = userEvent.setup()

    const convoId = 'c1'
    const branchId = 'b1'
    const now = Date.now()

    const store: {
      headMessageId: string | null
      chosenAnswerRootId: string
      hidden: Set<string>
      candidatesNewToOld: Array<{ answerRootId: string; createdAt: number; status: string }>
      messagesById: Record<string, PersistedMessage>
    } = {
      headMessageId: 'a1',
      chosenAnswerRootId: 'a1',
      hidden: new Set(),
      candidatesNewToOld: [
        { answerRootId: 'a1', createdAt: now + 3, status: 'final' },
        { answerRootId: 'a0', createdAt: now + 2, status: 'final' },
      ],
      messagesById: {
        u1: {
          id: 'u1',
          convoId,
          role: 'user',
          seq: 1,
          createdAt: now,
          parentId: null,
          status: 'final',
          answerRootId: null,
          questionId: null,
          body: 'Q1',
          meta: null,
        },
        a1: {
          id: 'a1',
          convoId,
          role: 'assistant',
          seq: 3,
          createdAt: now + 1,
          parentId: 'u1',
          status: 'final',
          answerRootId: 'a1',
          questionId: 'u1',
          body: 'A1',
          meta: null,
        },
      },
    }

    const visibleCandidates = () => store.candidatesNewToOld.filter((c) => !store.hidden.has(c.answerRootId))

    const invoke = vi.fn(async (method: string, params?: any) => {
      const projectBootstrap = mockProjectBootstrapCalls(method)
      if (projectBootstrap !== undefined) return projectBootstrap
      if (method === 'convo.list') return [{ id: convoId, title: 'Chat 1', createdAt: 1, updatedAt: 1 }]
      if (method === 'branch.ensureDefault') {
        return { id: branchId, convoId, headMessageId: store.headMessageId, name: 'Main', createdAt: 1, updatedAt: 1, deletedAt: null }
      }
      if (method === 'branch.list') {
        return [{ id: branchId, convoId, headMessageId: store.headMessageId, name: 'Main', createdAt: 1, updatedAt: 1, deletedAt: null }]
      }
      if (method === 'context.getRenderableTurns') {
        const q = store.messagesById.u1
        const chosen = store.messagesById[store.chosenAnswerRootId]
        return {
          messages: [q, chosen],
          turns: [{ questionId: 'u1', chosenAnswerRootId: store.chosenAnswerRootId, questionMode: 'include', answerMode: 'include', effectiveMode: 'include', lockedByQuestionExclude: false }],
        }
      }
      if (method === 'context.buildForBranch') return { messages: [] }
      if (method === 'branch.getCandidates') return visibleCandidates()
      if (method === 'branch.retryReplaceAnswer') {
        store.hidden.add(String(params?.currentAnswerRootId ?? ''))
        const createdAt = Date.now()
        store.messagesById.a2 = {
          id: 'a2',
          convoId,
          role: 'assistant',
          seq: 4,
          createdAt,
          parentId: 'u1',
          status: 'streaming',
          answerRootId: 'a2',
          questionId: 'u1',
          body: '',
          meta: null,
        }
        store.headMessageId = 'a2'
        store.chosenAnswerRootId = 'a2'
        store.candidatesNewToOld = [
          { answerRootId: 'a2', createdAt: createdAt + 1, status: 'streaming' },
          ...store.candidatesNewToOld,
        ]
        return { ok: true, newAnswerRootId: 'a2', newAssistantSeq: 4 }
      }
      if (method === 'message.appendDelta') {
        const seq = Number(params?.seq ?? NaN)
        const appendBody = String(params?.appendBody ?? '')
        const msg = Object.values(store.messagesById).find((m) => m.seq === seq)
        if (msg) msg.body = String(msg.body ?? '') + appendBody
        return { ok: true }
      }
      if (method === 'message.setStatus') {
        const messageId = String(params?.messageId ?? '')
        const status = String(params?.status ?? '')
        const msg = store.messagesById[messageId]
        if (msg) msg.status = status as any
        return { ok: true }
      }
      if (method === 'modelPrefs.recordRecent') {
        const nowTs = Date.now()
        return {
          scopeType: 'global',
          scopeId: '',
          providerKey: String(params?.providerKey ?? 'openrouter'),
          modelId: String(params?.modelId ?? ''),
          modelKey: String(params?.modelKey ?? ''),
          lastUsedAtMs: nowTs,
          useCount: 1,
          createdAtMs: nowTs,
          updatedAtMs: nowTs,
        }
      }
      return { ok: true }
    })

    ;(globalThis as any).dbBridge = { invoke }

    render(AppChatApp)
    await screen.findByText('Q1')
    await screen.findByText('A1')

    await waitFor(() => expect(screen.getByTestId('cand-pos-u1').textContent).toBe('2/2'))

    const retry = await screen.findByTestId('retry-a-a1')
    expect(retry).not.toBeDisabled()
    await user.click(retry)

    await screen.findByText('ok')
    await waitFor(() => expect(screen.getByTestId('cand-pos-u1').textContent).toBe('2/2'))

    await vi.runAllTimersAsync()

    expect(invoke).toHaveBeenCalledWith(
      'branch.retryReplaceAnswer',
      expect.objectContaining({ branchId: 'b1', questionId: 'u1', currentAnswerRootId: 'a1' })
    )
    expect(invoke).toHaveBeenCalledWith('message.appendDelta', expect.objectContaining({ convoId: 'c1', seq: 4 }))
    expect(invoke).toHaveBeenCalledWith('message.setStatus', expect.objectContaining({ messageId: 'a2', status: 'final' }))
    expect(invoke).toHaveBeenCalledWith(
      'modelPrefs.recordRecent',
      expect.objectContaining({
        scopeType: 'global',
        scopeId: '',
        providerKey: 'openrouter',
        modelId: 'openrouter/auto',
        modelKey: 'openrouter::openrouter/auto',
      }),
    )
    expect(visibleCandidates().map((c) => c.answerRootId)).not.toContain('a1')
  })

  it('disables regenerate/retry while the selected answer group is streaming', async () => {
    const convoId = 'c1'
    const branchId = 'b1'
    const now = Date.now()

    const invoke = vi.fn(async (method: string) => {
      const projectBootstrap = mockProjectBootstrapCalls(method)
      if (projectBootstrap !== undefined) return projectBootstrap
      if (method === 'convo.list') return [{ id: convoId, title: 'Chat 1', createdAt: 1, updatedAt: 1 }]
      if (method === 'branch.ensureDefault') {
        return { id: branchId, convoId, headMessageId: 'a1', name: 'Main', createdAt: 1, updatedAt: 1, deletedAt: null }
      }
      if (method === 'branch.list') {
        return [{ id: branchId, convoId, headMessageId: 'a1', name: 'Main', createdAt: 1, updatedAt: 1, deletedAt: null }]
      }
      if (method === 'context.getRenderableTurns') {
        return {
          messages: [
            {
              id: 'u1',
              convoId,
              role: 'user',
              seq: 1,
              createdAt: now,
              parentId: null,
              status: 'final',
              answerRootId: null,
              questionId: null,
              body: 'Q1',
              meta: null,
            },
            {
              id: 'a1',
              convoId,
              role: 'assistant',
              seq: 2,
              createdAt: now + 1,
              parentId: 'u1',
              status: 'streaming',
              answerRootId: 'a1',
              questionId: 'u1',
              body: '',
              meta: null,
            },
          ],
          turns: [{ questionId: 'u1', chosenAnswerRootId: 'a1', questionMode: 'include', answerMode: 'include', effectiveMode: 'include', lockedByQuestionExclude: false }],
        }
      }
      if (method === 'context.buildForBranch') return { messages: [] }
      if (method === 'branch.getCandidates') return [{ answerRootId: 'a1', createdAt: now + 2, status: 'streaming' }]
      if (method === 'modelPrefs.recordRecent') {
        const nowTs = Date.now()
        return {
          scopeType: 'global',
          scopeId: '',
          providerKey: 'openrouter',
          modelId: 'openrouter/auto',
          modelKey: 'openrouter::openrouter/auto',
          lastUsedAtMs: nowTs,
          useCount: 1,
          createdAtMs: nowTs,
          updatedAtMs: nowTs,
        }
      }
      return { ok: true }
    })

    ;(globalThis as any).dbBridge = { invoke }

    render(AppChatApp)
    await screen.findByText('Q1')

    expect(await screen.findByTestId('regen-q-u1')).toBeDisabled()
    expect(await screen.findByTestId('retry-a-a1')).toBeDisabled()
  })
})
