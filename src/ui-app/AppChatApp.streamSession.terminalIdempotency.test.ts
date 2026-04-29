/* eslint-disable max-lines-per-function, complexity, max-statements */
import { render, screen, waitFor } from '@testing-library/vue'
import userEvent from '@testing-library/user-event'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import type { ErrorEnvelope } from '@/next/errors/openRouterErrorEnvelope'
import { DEFAULT_OPENROUTER_TEST_MODEL } from '@/next/openrouter/openRouterTestModels'

type StreamScenario = 'done_then_throw' | 'error_then_throw' | 'abort_then_abort_error'

const hoisted = vi.hoisted(() => {
  const fixtureErrorEnvelope: ErrorEnvelope = {
    phase: 'mid_stream',
    completionClass: 'error',
    openrouter: { code: 'fixture_error', message: 'fixture stream error' },
    truncated: false,
    kind: 'mid_stream_sse',
  }
  const fixtureAbortEnvelope: ErrorEnvelope = {
    phase: 'mid_stream',
    completionClass: 'aborted',
    openrouter: { code: 'abort', message: 'fixture stream abort' },
    truncated: false,
    kind: 'mid_stream_sse',
  }
  return {
    capturedDispatchTypes: [] as string[],
    fixtureErrorEnvelope,
    fixtureAbortEnvelope,
    scenario: 'done_then_throw' as StreamScenario,
  }
})

try {
  globalThis.localStorage?.setItem('sv_event_scheduler', '0')
  globalThis.localStorage?.setItem('sv_debug_reasoning', '0')
  globalThis.localStorage?.setItem('sv_debug_stream_error', '0')
} catch {
  // no-op
}

const capturedDispatchTypes = hoisted.capturedDispatchTypes

vi.mock('@/next/state/reducer', async () => {
  const actual = await vi.importActual<typeof import('@/next/state/reducer')>('@/next/state/reducer')
  return {
    ...actual,
    applyEventsBatch: (state: any, runId: string, events: any[]) => {
      for (const event of events) {
        capturedDispatchTypes.push(String(event?.type ?? 'unknown'))
      }
      return actual.applyEventsBatch(state, runId, events)
    },
  }
})

vi.mock('@/next/live/openRouterLiveStream', () => {
  const baseEvents = [
    { type: 'MetaDelta', meta: { id: 'gen_fixture', model: DEFAULT_OPENROUTER_TEST_MODEL } },
    { type: 'MessageDeltaText', messageId: '__assistant__', choiceIndex: 0, text: 'he' },
    { type: 'MessageAppendContentBlock', messageId: '__assistant__', choiceIndex: 0, block: { type: 'text', text: 'llo' } },
  ] as const

  function terminalEventsByScenario(scenario: StreamScenario) {
    if (scenario === 'done_then_throw') {
      return [
        { type: 'TimingSnapshot', tAck: 10, tEnd: 30, endReason: 'normal_complete' },
        { type: 'StreamDone' },
      ] as const
    }
    if (scenario === 'error_then_throw') {
      return [
        { type: 'TimingSnapshot', tAck: 10, tEnd: 30, endReason: 'mid_stream_error' },
        { type: 'StreamError', error: hoisted.fixtureErrorEnvelope, terminal: true },
      ] as const
    }
    return [
      { type: 'TimingSnapshot', tAck: 10, tEnd: 30, endReason: 'user_abort' },
      { type: 'StreamAbort', reason: 'aborted', envelope: hoisted.fixtureAbortEnvelope },
    ] as const
  }

  async function* streamOpenRouterChatAsEvents(options: any) {
    const assistantMessageId = String(options?.assistantMessageId ?? '')
    const events = [...baseEvents, ...terminalEventsByScenario(hoisted.scenario)]
    for (const event of events) {
      const cloned = JSON.parse(JSON.stringify(event))
      if (cloned && typeof cloned === 'object' && cloned.messageId === '__assistant__') {
        cloned.messageId = assistantMessageId
      }
      yield cloned
    }
    if (hoisted.scenario === 'abort_then_abort_error') {
      const abortErr = new Error('abort after terminal')
      ;(abortErr as any).name = 'AbortError'
      throw abortErr
    }
    throw new Error(`post-terminal throw: ${hoisted.scenario}`)
  }

  return { streamOpenRouterChatAsEvents }
})

import AppChatApp from './AppChatApp.vue'

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

type ScenarioSummary = Readonly<{
  dispatchTypes: string[]
  methodCounts: Record<string, number>
  appendDeltaText: string
  statusSequence: string[]
  completionClasses: string[]
}>

function createDbBridge() {
  const convoId = 'c1'
  const branchId = 'b1'
  const questionId = 'u1'
  const streamAnswerId = 'a_stream'

  const store: {
    headMessageId: string | null
    chosenAnswerRootId: string | null
    candidates: Array<{ answerRootId: string; createdAt: number; status: string }>
    messagesById: Record<string, PersistedMessage>
  } = {
    headMessageId: null,
    chosenAnswerRootId: null,
    candidates: [],
    messagesById: {},
  }

  const orderedMessages = () => Object.values(store.messagesById).sort((a, b) => a.seq - b.seq)

  const invoke = vi.fn(async (method: string, params?: any) => {
    if (method === 'convo.list') return [{ id: convoId, title: 'Chat 1', createdAt: 1, updatedAt: 1 }]
    if (method === 'convo.create') return { id: convoId, title: 'Chat 1', createdAt: 1, updatedAt: 1 }
    if (method === 'project.list') return []
    if (method === 'project.create') return { id: 'p1', name: String(params?.name ?? 'Inbox'), createdAt: 1, updatedAt: 1, meta: null }
    if (method === 'project.findById') return null
    if (method === 'project.getInbox') return { id: 'inbox', name: 'Inbox', createdAt: 1, updatedAt: 1, meta: null }
    if (method === 'project.countConversationsBatch') return { counts: {} }
    if (method === 'project.countConversations') return { count: 0 }
    if (method === 'settings.getReasoningPrefs') return { value: null }
    if (method === 'settings.getOpenRouterProviderRequireParameters') return { value: false }
    if (method === 'modelCatalog.list') {
      return [
        {
          modelId: DEFAULT_OPENROUTER_TEST_MODEL,
          name: 'Test Default',
          vendor: 'deepseek',
          lastSeenSnapshotId: 'snap_default',
          isHidden: 0,
          supportedParametersJson: '[]',
        },
      ]
    }
    if (method === 'modelCatalog.getModelDetail') {
      const modelId = String(params?.modelId ?? '')
      if (modelId === DEFAULT_OPENROUTER_TEST_MODEL) {
        return {
          providerKey: 'openrouter',
          modelId: DEFAULT_OPENROUTER_TEST_MODEL,
          modelKey: `openrouter::${DEFAULT_OPENROUTER_TEST_MODEL}`,
          canonicalSlug: DEFAULT_OPENROUTER_TEST_MODEL,
          displayName: 'Test Default',
          description: null,
          vendor: 'deepseek',
          family: null,
          status: 'active',
          visibility: 'visible',
          contextLength: 128000,
          maxOutputTokens: 8192,
          architectureModality: 'text->text',
          inputModalitiesJson: '["text"]',
          outputModalitiesJson: '["text"]',
          tokenizer: null,
          instructType: null,
          supportedParametersJson: '[]',
          capabilitiesJson: '{"reasoning":true,"tools":true,"structuredOutputs":true,"vision":false,"longContext":true}',
          pricePrompt: null,
          priceCompletion: null,
          priceRequest: null,
          priceImage: null,
          pricingJson: null,
          createdAtSec: 1,
          expirationDate: null,
          expirationAtSec: null,
          unknownExpiration: 0,
          hasPerRequestLimits: 0,
          hasDefaultParameters: 0,
          perRequestLimitsJson: null,
          defaultParametersJson: null,
          topProviderContextLength: null,
          topProviderIsModerated: false,
          firstSeenAtMs: 1,
          lastSeenAtMs: 1,
          syncedAtMs: 1,
        }
      }
      return null
    }
    if (method === 'reasoningModelIndex.list') return []

    if (method === 'branch.ensureDefault') {
      return { id: branchId, convoId, headMessageId: store.headMessageId, name: 'Main', createdAt: 1, updatedAt: 1, deletedAt: null }
    }
    if (method === 'branch.list') {
      return [{ id: branchId, convoId, headMessageId: store.headMessageId, name: 'Main', createdAt: 1, updatedAt: 1, deletedAt: null }]
    }
    if (method === 'branch.getCandidates') return store.candidates
    if (method === 'context.getRenderableTurns') {
      if (!store.chosenAnswerRootId || !store.messagesById[questionId] || !store.messagesById[store.chosenAnswerRootId]) {
        return { messages: orderedMessages(), turns: [] }
      }
      return {
        messages: [store.messagesById[questionId], store.messagesById[store.chosenAnswerRootId]],
        turns: [
          {
            questionId,
            chosenAnswerRootId: store.chosenAnswerRootId,
            questionMode: 'include',
            answerMode: 'include',
            effectiveMode: 'include',
            lockedByQuestionExclude: false,
          },
        ],
      }
    }
    if (method === 'context.buildForBranch') {
      return { messages: orderedMessages() }
    }
    if (method === 'conversationDraft.restore' || method === 'conversationDraft.updateText') {
      return {
        conversationId: convoId,
        draftText: '',
        draftMode: 'compose',
        editingSourceMessageId: null,
        attachedAssetIds: [],
        attachments: [],
        updatedAt: Date.now(),
      }
    }

    if (method === 'branch.beginTurn') {
      const userBody = String(params?.userBody ?? '')
      const ts = Date.now()
      store.messagesById[questionId] = {
        id: questionId,
        convoId,
        role: 'user',
        seq: 1,
        createdAt: ts,
        parentId: null,
        status: 'final',
        answerRootId: null,
        questionId: null,
        body: userBody,
        meta: null,
      }
      store.messagesById[streamAnswerId] = {
        id: streamAnswerId,
        convoId,
        role: 'assistant',
        seq: 2,
        createdAt: ts + 1,
        parentId: questionId,
        status: 'streaming',
        answerRootId: streamAnswerId,
        questionId,
        body: '',
        meta: null,
      }
      store.headMessageId = streamAnswerId
      store.chosenAnswerRootId = streamAnswerId
      store.candidates = [{ answerRootId: streamAnswerId, createdAt: ts + 1, status: 'streaming' }]
      return { ok: true, convoId, branchId, questionId, questionSeq: 1, assistantId: streamAnswerId, assistantSeq: 2 }
    }

    if (method === 'message.appendDelta') {
      const seq = Number(params?.seq ?? NaN)
      const appendBody = String(params?.appendBody ?? '')
      const target = Object.values(store.messagesById).find((m) => m.seq === seq)
      if (target) target.body = String(target.body ?? '') + appendBody
      return { ok: true }
    }
    if (method === 'message.setStatus') {
      const messageId = String(params?.messageId ?? '')
      const status = String(params?.status ?? '')
      const target = store.messagesById[messageId]
      if (target) target.status = status as PersistedMessage['status']
      return { ok: true }
    }
    if (method === 'message.setReasoningRequestConfig') return { ok: true }
    if (method === 'message.appendReasoningDetailSegments') return { ok: true, received: 0, inserted: 0, skipped: 0, ignored: 0, sumDeltaLenInserted: 0 }
    if (method === 'message.finalizeReasoningDetails') return { ok: true }
    if (method === 'messageError.upsert') return { ok: true }
    if (method === 'messageError.listByMessageIds') return []
    if (method === 'message.list') return orderedMessages()

    return { ok: true }
  })

  return { invoke }
}

async function runScenario(scenario: StreamScenario): Promise<ScenarioSummary> {
  hoisted.scenario = scenario
  const user = userEvent.setup()
  const { invoke } = createDbBridge()
  ;(globalThis as any).dbBridge = { invoke }

  render(AppChatApp)
  await screen.findByRole('button', { name: /Chat 1/ })

  capturedDispatchTypes.length = 0
  const callStart = invoke.mock.calls.length

  const box = screen.getByPlaceholderText('Type a message...')
  await user.click(box)
  await user.type(box, 'fixture question')
  await user.click(screen.getByRole('button', { name: 'Send' }))

  await vi.runAllTimersAsync()
  await waitFor(() => {
    const calls = invoke.mock.calls.slice(callStart)
    expect(calls.some((c) => c[0] === 'message.setStatus')).toBe(true)
  })

  const calls = invoke.mock.calls.slice(callStart)
  const methodCounts: Record<string, number> = {}
  let appendDeltaText = ''
  const statusSequence: string[] = []
  const completionClasses: string[] = []

  for (const [method, params] of calls) {
    methodCounts[method] = (methodCounts[method] ?? 0) + 1
    if (method === 'message.appendDelta') {
      appendDeltaText += String((params as any)?.appendBody ?? '')
      continue
    }
    if (method === 'message.setStatus') {
      statusSequence.push(String((params as any)?.status ?? ''))
      continue
    }
    if (method === 'messageError.upsert') {
      try {
        const envelope = JSON.parse(String((params as any)?.envelopeJson ?? '{}'))
        const completionClass = typeof envelope?.completionClass === 'string' ? envelope.completionClass : null
        if (completionClass) completionClasses.push(completionClass)
      } catch {
        // no-op
      }
    }
  }

  return {
    dispatchTypes: [...capturedDispatchTypes],
    methodCounts,
    appendDeltaText,
    statusSequence,
    completionClasses,
  }
}

describe('ui-app AppChatApp stream session terminal idempotency', () => {
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
    capturedDispatchTypes.length = 0
    hoisted.scenario = 'done_then_throw'
    ;(globalThis as any).dbBridge = originalDbBridge
    ;(globalThis as any).electronStore = originalElectronStore
    globalThis.setTimeout = originalSetTimeout
    vi.useRealTimers()
  })

  it.each([
    {
      scenario: 'done_then_throw' as const,
      expectedTerminalType: 'StreamDone',
      expectedStatus: 'final',
      expectedErrorUpsertCount: 0,
      expectedCompletionClasses: [] as string[],
    },
    {
      scenario: 'error_then_throw' as const,
      expectedTerminalType: 'StreamError',
      expectedStatus: 'error',
      expectedErrorUpsertCount: 1,
      expectedCompletionClasses: ['error'],
    },
    {
      scenario: 'abort_then_abort_error' as const,
      expectedTerminalType: 'StreamAbort',
      expectedStatus: 'final',
      expectedErrorUpsertCount: 1,
      expectedCompletionClasses: ['aborted'],
    },
  ])(
    'keeps terminal side effects idempotent for $scenario',
    async ({ scenario, expectedTerminalType, expectedStatus, expectedErrorUpsertCount, expectedCompletionClasses }) => {
      const summary = await runScenario(scenario)

      const terminalTypes = new Set(['StreamDone', 'StreamError', 'StreamAbort'])
      const terminalDispatches = summary.dispatchTypes.filter((type) => terminalTypes.has(type))

      expect(terminalDispatches).toEqual([expectedTerminalType])
      expect(summary.dispatchTypes.filter((type) => type === 'TimingSnapshot')).toEqual(['TimingSnapshot'])
      expect(summary.methodCounts['message.setStatus'] ?? 0).toBe(1)
      expect(summary.methodCounts['messageError.upsert'] ?? 0).toBe(expectedErrorUpsertCount)
      expect(summary.methodCounts['message.appendDelta'] ?? 0).toBe(1)
      expect(summary.methodCounts['message.finalizeReasoningDetails'] ?? 0).toBe(1)
      expect(summary.statusSequence).toEqual([expectedStatus])
      expect(summary.completionClasses).toEqual(expectedCompletionClasses)
      expect(summary.appendDeltaText).toBe('hello')
    }
  )
})

