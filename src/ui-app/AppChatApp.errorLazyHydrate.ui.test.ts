import { render, screen, within, waitFor } from '@testing-library/vue'
import userEvent from '@testing-library/user-event'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import AppChatApp from './AppChatApp.vue'

type MessageRow = Readonly<{
  id: string
  convoId: string
  role: string
  seq: number
  createdAt: number
  parentId: string | null
  status: string
  answerRootId: string | null
  questionId: string | null
  body: string
  meta: unknown
}>

type MessageErrorResponder = (ids: string[], callIndex: number) => Array<{ messageId: string; envelopeJson: string }>

function buildErrorSummary(overrides?: Partial<Record<'completionClass' | 'phase' | 'code' | 'message' | 'provider', string>>) {
  return {
    completionClass: 'error',
    phase: 'pre_stream',
    code: 'E-UNSPECIFIED',
    message: 'upstream error',
    provider: 'openrouter',
    ...(overrides ?? {}),
  }
}

function buildMessageRow(id: string, summary: Record<string, string>, body: string, seq = 1): MessageRow {
  return {
    id,
    convoId: 'c1',
    role: 'assistant',
    seq,
    createdAt: 100 + seq,
    parentId: null,
    status: 'final',
    answerRootId: id,
    questionId: null,
    body,
    meta: {
      error_ref: true,
      error_summary: summary,
    },
  }
}

function createDbBridge(
  messages: MessageRow[],
  messageErrorResponder: MessageErrorResponder
): { invoke: (method: string, params?: any) => Promise<any>; messageErrorCalls: string[][] } {
  const convoId = 'c1'
  const branchId = 'b1'
  const convo = { id: convoId, title: 'Lazy hydrate', createdAt: 1, updatedAt: 1 }
  const branch = {
    id: branchId,
    convoId,
    headMessageId: messages[messages.length - 1]?.id ?? null,
    name: 'Main',
    createdAt: 1,
    updatedAt: 1,
    deletedAt: null,
  }
  const inbox = { id: 'inbox', name: 'Inbox', createdAt: 0, updatedAt: 0, meta: null }
  const project = { id: 'proj1', name: 'Default', createdAt: 1, updatedAt: 1, meta: null }
  const messageErrorCalls: string[][] = []
  let messageErrorCallIndex = 0

  const invoke = vi.fn(async (method: string, params?: any) => {
    switch (method) {
      case 'convo.list':
        return [convo]
      case 'branch.ensureDefault':
        return branch
      case 'branch.list':
        return [branch]
      case 'context.getRenderableTurns':
        return {
          messages,
          turns: [],
          debug: {
            branchId,
            excludedQuestionIds: [],
            includedMessageIds: messages.map((m) => m.id),
            chosenAnswerRootByQuestionId: {},
          },
        }
      case 'context.buildForBranch':
        return {
          messages: [],
          debug: { branchId, excludedQuestionIds: [], includedMessageIds: [], chosenAnswerRootByQuestionId: {} },
        }
      case 'messageError.listByMessageIds': {
        const ids = Array.isArray(params?.messageIds)
          ? params.messageIds.map((v: unknown) => String(v ?? '').trim()).filter((v) => v.length > 0)
          : []
        messageErrorCalls.push(ids)
        const response = messageErrorResponder(ids, messageErrorCallIndex) ?? []
        messageErrorCallIndex += 1
        return response
      }
      case 'modelCatalog.list':
      case 'reasoningIndex.list':
        return []
      case 'project.list':
        return [project]
      case 'project.countConversationsBatch': {
        const projectIds = Array.isArray(params?.projectIds) ? params.projectIds : []
        const counts: Record<string, number> = {}
        projectIds.forEach((pid: string) => {
          counts[String(pid ?? '')] = 0
        })
        return { counts }
      }
      case 'project.countConversations':
        return { count: 0 }
      case 'project.getInbox':
        return inbox
      default:
        return []
    }
  })

  return { invoke, messageErrorCalls }
}

async function findPanelBySummary(summaryRegex: RegExp) {
  const summaryNode = await screen.findByText(summaryRegex)
  const panel = summaryNode.closest('.rounded-xl')
  if (!panel) throw new Error('Error panel root not found')
  return panel as HTMLElement
}

describe('AppChatApp lazy hydrate error panels', () => {
  const originalDbBridge = (globalThis as any).dbBridge
  const originalElectronStore = (globalThis as any).electronStore

  beforeEach(() => {
    ;(globalThis as any).electronStore = {
      get: vi.fn(async () => undefined),
      set: vi.fn(async () => undefined),
    }
  })

  afterEach(() => {
    ;(globalThis as any).dbBridge = originalDbBridge
    ;(globalThis as any).electronStore = originalElectronStore
    vi.restoreAllMocks()
  })

  it('expands once, shows loading, then unavailable without refetch', async () => {
    const summary = buildErrorSummary({ code: 'ERROR-1', message: 'summary only' })
    const message = buildMessageRow('a1', summary, 'error message 1')
    const { invoke, messageErrorCalls } = createDbBridge([message], () => [])
    ;(globalThis as any).dbBridge = { invoke }

    const user = userEvent.setup()
    render(AppChatApp)

    await screen.findByText(/code:ERROR-1/)
    expect(messageErrorCalls.length).toBe(0)
    const initialErrorCallCount = messageErrorCalls.length

    const panel = await findPanelBySummary(/code:ERROR-1/)
    const expandButton = within(panel).getByRole('button', { name: 'Expand' })

    await user.click(expandButton)

    await new Promise((resolve) => setTimeout(resolve, 0))
    await waitFor(() => expect(messageErrorCalls.length).toBeGreaterThan(initialErrorCallCount), { timeout: 1000 })
    await within(panel).findByText('Details unavailable.')
    const afterFirstFetch = messageErrorCalls.length
    expect(messageErrorCalls[messageErrorCalls.length - 1]).toEqual(['a1'])

    await user.click(expandButton)
    expect(messageErrorCalls.length).toBe(afterFirstFetch)
  }, 20000)

  it('shows truncated badge from summary without triggering hydrate until expand', async () => {
    const summary = buildErrorSummary({ completionClass: 'truncated', code: 'LIMIT', message: 'trimmed' })
    const message = buildMessageRow('a0', summary, 'truncated summary')
    const { invoke, messageErrorCalls } = createDbBridge([message], () => [])
    ;(globalThis as any).dbBridge = { invoke }

    const user = userEvent.setup()
    render(AppChatApp)

    await screen.findByText(/code:LIMIT/)
    const badge = await screen.findByText('Truncated')
    expect(badge).toBeInTheDocument()
    expect(messageErrorCalls.length).toBe(0)

    const panel = await findPanelBySummary(/code:LIMIT/)
    const expandButton = within(panel).getByRole('button', { name: 'Expand' })
    await user.click(expandButton)

    await new Promise((resolve) => setTimeout(resolve, 0))
    await waitFor(() => expect(messageErrorCalls.length).toBe(1), { timeout: 1000 })
  }, 20000)

  it('renders details when lazy hydrate succeeds', async () => {
    const summary = buildErrorSummary({ code: 'ERROR-2', message: 'ready to hydrate' })
    const message = buildMessageRow('a2', summary, 'error message 2')
    const envelope = {
      completionClass: 'error',
      phase: 'mid_stream',
      openrouter: { code: 'ERROR-2', message: 'ready to hydrate' },
      truncated: true,
    }
    const { invoke, messageErrorCalls } = createDbBridge([message], (ids) => {
      return ids.map((id) => ({
        messageId: id,
        envelopeJson: JSON.stringify(envelope),
      }))
    })
    ;(globalThis as any).dbBridge = { invoke }

    const user = userEvent.setup()
    render(AppChatApp)

    await screen.findByText(/code:ERROR-2/)
    expect(messageErrorCalls.length).toBe(0)
    const initialErrorCallCount = messageErrorCalls.length

    const panel = await findPanelBySummary(/code:ERROR-2/)
    const expandButton = within(panel).getByRole('button', { name: 'Expand' })

    await user.click(expandButton)

    await new Promise((resolve) => setTimeout(resolve, 0))
    await waitFor(() => expect(messageErrorCalls.length).toBeGreaterThan(initialErrorCallCount), { timeout: 1000 })
    expect(messageErrorCalls[messageErrorCalls.length - 1]).toEqual(['a2'])
    await within(panel).findByText(/bytes:/i)
    await within(panel).findByText(/"openrouter"/i)
    const afterFirstFetch = messageErrorCalls.length

    await user.click(expandButton) // collapse and reopen
    await user.click(expandButton)
    expect(messageErrorCalls.length).toBe(afterFirstFetch)
  }, 20000)

  it('coalesces multiple expands into a single micro-batched request', async () => {
    const summaryA = buildErrorSummary({ code: 'LAZY-A', message: 'first' })
    const summaryB = buildErrorSummary({ code: 'LAZY-B', message: 'second' })
    const messageA = buildMessageRow('a3', summaryA, 'first lazy error', 1)
    const messageB = buildMessageRow('a4', summaryB, 'second lazy error', 2)
    const envelopes = new Map<string, Record<string, unknown>>([
      [
        'a3',
        {
          completionClass: 'error',
          phase: 'responses',
          openrouter: { code: 'LAZY-A', message: 'first' },
          truncated: false,
        },
      ],
      [
        'a4',
        {
          completionClass: 'error',
          phase: 'responses',
          openrouter: { code: 'LAZY-B', message: 'second' },
          truncated: false,
        },
      ],
    ])
    const { invoke, messageErrorCalls } = createDbBridge([messageA, messageB], (ids) => {
      return ids
        .map((id) => {
          const env = envelopes.get(id)
          if (!env) return null
          return { messageId: id, envelopeJson: JSON.stringify(env) }
        })
        .filter((x): x is { messageId: string; envelopeJson: string } => x !== null)
    })
    ;(globalThis as any).dbBridge = { invoke }

    const user = userEvent.setup()
    render(AppChatApp)

    await screen.findByText(/code:LAZY-A/)
    await screen.findByText(/code:LAZY-B/)
    expect(messageErrorCalls.length).toBe(0)
    const initialErrorCallCount = messageErrorCalls.length

    const panelA = await findPanelBySummary(/code:LAZY-A/)
    const panelB = await findPanelBySummary(/code:LAZY-B/)
    const expandA = within(panelA).getByRole('button', { name: 'Expand' })
    const expandB = within(panelB).getByRole('button', { name: 'Expand' })

    expandA.click()
    expandB.click()

    await new Promise((resolve) => setTimeout(resolve, 0))
    await waitFor(() => expect(messageErrorCalls.length).toBeGreaterThan(initialErrorCallCount), { timeout: 1000 })
    const firstCall = messageErrorCalls[0] ?? []
    const combinedCallExists = [firstCall].some((call) => {
      const ids = new Set(call)
      return ids.has('a3') && ids.has('a4')
    })
    expect(combinedCallExists).toBe(true)
    expect(within(panelA).getByText(/"openrouter"/i)).toBeInTheDocument()
    expect(within(panelB).getByText(/"openrouter"/i)).toBeInTheDocument()

    const afterFirstFetch = messageErrorCalls.length
    await user.click(expandA)
    await user.click(expandA)
    await user.click(expandB)
    await user.click(expandB)
    expect(messageErrorCalls.length).toBe(afterFirstFetch)
  }, 20000)

  it('hydrates error envelope for error status even without error_ref', async () => {
    const message: MessageRow = {
      id: 'a5',
      convoId: 'c1',
      role: 'assistant',
      seq: 1,
      createdAt: 101,
      parentId: null,
      status: 'error',
      answerRootId: 'a5',
      questionId: null,
      body: '',
      meta: {},
    }
    const envelope = {
      completionClass: 'error',
      phase: 'pre_stream',
      openrouter: { code: 'STATUS-ERR', message: 'db error' },
      truncated: false,
    }
    const { invoke, messageErrorCalls } = createDbBridge([message], (ids) => {
      return ids.map((id) => ({ messageId: id, envelopeJson: JSON.stringify(envelope) }))
    })
    ;(globalThis as any).dbBridge = { invoke }

    render(AppChatApp)

    await screen.findByText(/code:STATUS-ERR/)
    await waitFor(() => expect(messageErrorCalls.length).toBe(1), { timeout: 1000 })
    expect(messageErrorCalls[0]).toEqual(['a5'])
  }, 20000)
})
