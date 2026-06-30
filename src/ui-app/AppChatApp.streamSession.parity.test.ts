/* eslint-disable max-lines-per-function, complexity, max-statements */
import { render, screen, waitFor } from '@testing-library/vue'
import userEvent from '@testing-library/user-event'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import type { ErrorEnvelope } from '@/next/errors/openRouterErrorEnvelope'
import { DEFAULT_OPENROUTER_TEST_MODEL } from '@/next/openrouter/openRouterTestModels'
import { t } from '@/shared/i18n'

const hoisted = vi.hoisted(() => {
  const fixtureErrorEnvelope: ErrorEnvelope = {
    phase: 'mid_stream',
    completionClass: 'error',
    openrouter: { code: 'fixture_error', message: 'fixture stream error' },
    truncated: false,
    kind: 'mid_stream_sse',
  }
  return {
    capturedDispatchTypes: [] as string[],
    fixtureErrorEnvelope,
    streamOptions: [] as any[],
    throwAbortInGenerator: false,
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
const capturedStreamOptions = hoisted.streamOptions

const draftBox = () => screen.getByTestId('composer-draft') as HTMLTextAreaElement
const sendButton = () => screen.getByTestId('composer-send')
const waitForComposerReady = async () => {
  await waitFor(() => {
    expect(screen.getByTestId('current-model-pill')).toBeInTheDocument()
    expect(draftBox()).not.toBeDisabled()
  })
}

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
  const fixtureEvents = [
    { type: 'MetaDelta', meta: { id: 'gen_fixture', model: DEFAULT_OPENROUTER_TEST_MODEL } },
    { type: 'MessageDeltaText', messageId: '__assistant__', choiceIndex: 0, text: 'he' },
    { type: 'MessageAppendContentBlock', messageId: '__assistant__', choiceIndex: 0, block: { type: 'text', text: 'llo' } },
    {
      type: 'MessageDeltaReasoningDetail',
      messageId: '__assistant__',
      choiceIndex: 0,
      chunkNo: 1,
      detail: { id: 'r1', index: 0, type: 'reasoning.text', text: 'reasoning-fixture' },
    },
    { type: 'UsageDelta', usage: { completion_tokens: 2, total_tokens: 3 } },
    { type: 'TimingSnapshot', tAck: 10, tEnd: 30, endReason: 'mid_stream_error' },
    { type: 'StreamError', error: hoisted.fixtureErrorEnvelope, terminal: true },
  ] as const

  async function* streamOpenRouterChatAsEvents(options: any) {
    hoisted.streamOptions.push(options)
    if (hoisted.throwAbortInGenerator) {
      const error = new Error('aborted in generator')
      ;(error as any).name = 'AbortError'
      throw error
    }
    const assistantMessageId = String(options?.assistantMessageId ?? '')
    for (const event of fixtureEvents) {
      const cloned = JSON.parse(JSON.stringify(event))
      if (cloned && typeof cloned === 'object' && cloned.messageId === '__assistant__') {
        cloned.messageId = assistantMessageId
      }
      yield cloned
    }
  }

  return { streamOpenRouterChatAsEvents }
})

import AppChatApp from './AppChatApp.vue'

type ScenarioMode = 'send' | 'regenerate' | 'retry'

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

type ScenarioSummary = {
  dispatchTypes: string[]
  appendDeltaText: string
  statusSequence: string[]
  endReasonSequence: Array<string | null>
  completionClasses: string[]
  reasoningSegmentCalls: number
  reasoningSegmentItems: number
  finalizeReasoningCalls: number
}

function createDbBridge(mode: ScenarioMode) {
  const convoId = 'c1'
  const branchId = 'b1'
  const now = Date.now()
  const questionId = 'u1'
  const oldAnswerId = 'a_old'
  const streamAnswerId = 'a_stream'

  const store: {
    headMessageId: string | null
    chosenAnswerRootId: string | null
    candidates: Array<{ answerRootId: string; createdAt: number; status: string }>
    messagesById: Record<string, PersistedMessage>
  } = {
    headMessageId: mode === 'send' ? null : oldAnswerId,
    chosenAnswerRootId: mode === 'send' ? null : oldAnswerId,
    candidates: mode === 'send' ? [] : [{ answerRootId: oldAnswerId, createdAt: now + 2, status: 'final' }],
    messagesById:
      mode === 'send'
        ? {}
        : {
            [questionId]: {
              id: questionId,
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
            [oldAnswerId]: {
              id: oldAnswerId,
              convoId,
              role: 'assistant',
              seq: 2,
              createdAt: now + 1,
              parentId: questionId,
              status: 'final',
              answerRootId: oldAnswerId,
              questionId,
              body: 'A-old',
              meta: null,
            },
          },
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
    if (method === 'branch.getCandidates') {
      return store.candidates
    }
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
    if (method === 'sendPlan.buildCurrent') {
      return {
        sendPlan: {
          status: 'sendable',
          warnings: [],
          blockingReasons: [],
          includedAttachments: [],
          excludedAttachments: [],
          attachmentPlans: [],
          requiresModelChange: false,
          canProceedAfterDroppingExcluded: false,
          requiresUserConfirmation: false,
          plannerVersion: 'phase-5/v1',
        },
        draftText: '',
        assets: [],
        storageRootDir: 'C:/tmp',
      }
    }
    if (method === 'sendPlan.prepareOpenRouterReplayFromMessage') {
      const userMessageId = String(params?.userMessageId ?? '')
      const text = String(store.messagesById[userMessageId]?.body ?? 'Q1')
      return {
        status: 'sendable',
        currentUserContentBlocks: [{ type: 'text', text }],
        sentAssetIds: [],
        includedAttachments: [],
        excludedAttachments: [],
        blockingReasons: [],
        diagnostics: { sendPlanStatus: 'sendable' },
        modelCapabilitySnapshot: { modelId: DEFAULT_OPENROUTER_TEST_MODEL, providerKey: 'openrouter' },
        manifestDraft: { replayMode: 'current', sourceUserMessageId: userMessageId, sentAssetIds: [] },
      }
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

    if (method === 'branch.regenerateFromQuestion') {
      const ts = Date.now()
      store.messagesById[streamAnswerId] = {
        id: streamAnswerId,
        convoId,
        role: 'assistant',
        seq: 3,
        createdAt: ts,
        parentId: questionId,
        status: 'streaming',
        answerRootId: streamAnswerId,
        questionId,
        body: '',
        meta: null,
      }
      store.headMessageId = streamAnswerId
      store.chosenAnswerRootId = streamAnswerId
      store.candidates = [
        { answerRootId: streamAnswerId, createdAt: ts + 1, status: 'streaming' },
        ...store.candidates.filter((c) => c.answerRootId !== streamAnswerId),
      ]
      return { ok: true, newAnswerRootId: streamAnswerId, newAssistantSeq: 3 }
    }

    if (method === 'branch.retryReplaceAnswer') {
      const ts = Date.now()
      store.messagesById[streamAnswerId] = {
        id: streamAnswerId,
        convoId,
        role: 'assistant',
        seq: 3,
        createdAt: ts,
        parentId: questionId,
        status: 'streaming',
        answerRootId: streamAnswerId,
        questionId,
        body: '',
        meta: null,
      }
      store.headMessageId = streamAnswerId
      store.chosenAnswerRootId = streamAnswerId
      store.candidates = [
        { answerRootId: streamAnswerId, createdAt: ts + 1, status: 'streaming' },
        ...store.candidates.filter((c) => c.answerRootId !== streamAnswerId),
      ]
      return { ok: true, newAnswerRootId: streamAnswerId, newAssistantSeq: 3 }
    }

    if (method === 'branch.truncateFromQuestion') {
      const qid = String(params?.questionId ?? '')
      const question = store.messagesById[qid]
      const minSeq = typeof question?.seq === 'number' ? question.seq : Number.POSITIVE_INFINITY
      for (const message of Object.values(store.messagesById)) {
        if (message.seq >= minSeq) delete store.messagesById[message.id]
      }
      store.headMessageId = null
      store.chosenAnswerRootId = null
      store.candidates = []
      return { ok: true, headMessageId: null, fallbackQuestionId: null }
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
    if (method === 'message.appendReasoningDetailSegments') {
      const details = Array.isArray(params?.details) ? params.details : []
      const sumDeltaLenInserted = details.reduce((sum: number, detail: unknown) => {
        const d = detail as any
        return sum + String(d?.__deltaText ?? '').length + String(d?.__deltaSummary ?? '').length + String(d?.__deltaData ?? '').length
      }, 0)
      return { ok: true, received: details.length, inserted: details.length, skipped: 0, ignored: 0, sumDeltaLenInserted }
    }
    if (method === 'message.finalizeReasoningDetails') return { ok: true }
    if (method === 'messageError.upsert') return { ok: true }
    if (method === 'messageError.listByMessageIds') return []
    if (method === 'message.list') return orderedMessages()

    return { ok: true }
  })

  return { invoke }
}

async function runScenario(mode: ScenarioMode, options?: { expectHello?: boolean }): Promise<ScenarioSummary> {
  const user = userEvent.setup()
  const { invoke } = createDbBridge(mode)
  ;(globalThis as any).dbBridge = { invoke }

  render(AppChatApp)
  const convoButton = await screen.findByRole('button', { name: /Chat 1/ })
  if (mode !== 'send') {
    await user.click(convoButton)
  }

  if (mode !== 'send') {
    await screen.findByText('Q1')
    await screen.findByText('A-old')
  }
  await waitForComposerReady()

  capturedDispatchTypes.length = 0
  const callStart = invoke.mock.calls.length

  if (mode === 'send') {
    const box = draftBox()
    await user.click(box)
    await user.type(box, 'fixture question')
    await user.click(sendButton())
  } else if (mode === 'regenerate') {
    const button = await screen.findByTestId('regen-q-u1')
    await user.click(button)
  } else {
    const button = await screen.findByTestId('retry-a-a_old')
    await user.click(button)
  }

  if (options?.expectHello !== false) {
    await screen.findByText('hello')
  }
  await vi.runAllTimersAsync()

  await waitFor(() => {
    const calls = invoke.mock.calls.slice(callStart)
    expect(calls.some((c) => c[0] === 'message.setStatus')).toBe(true)
  })

  const calls = invoke.mock.calls.slice(callStart)
  let appendDeltaText = ''
  const statusSequence: string[] = []
  const endReasonSequence: Array<string | null> = []
  const completionClasses: string[] = []
  let reasoningSegmentCalls = 0
  let reasoningSegmentItems = 0
  let finalizeReasoningCalls = 0

  for (const [method, params] of calls) {
    if (method === 'message.appendDelta') {
      appendDeltaText += String((params as any)?.appendBody ?? '')
      continue
    }
    if (method === 'message.setStatus') {
      statusSequence.push(String((params as any)?.status ?? ''))
      const endReason = (params as any)?.reasoningEndReason
      endReasonSequence.push(typeof endReason === 'string' ? endReason : null)
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
      continue
    }
    if (method === 'message.appendReasoningDetailSegments') {
      reasoningSegmentCalls += 1
      reasoningSegmentItems += Array.isArray((params as any)?.details) ? (params as any).details.length : 0
      continue
    }
    if (method === 'message.finalizeReasoningDetails') {
      finalizeReasoningCalls += 1
    }
  }

  return {
    dispatchTypes: [...capturedDispatchTypes],
    appendDeltaText,
    statusSequence,
    endReasonSequence,
    completionClasses,
    reasoningSegmentCalls,
    reasoningSegmentItems,
    finalizeReasoningCalls,
  }
}

describe('ui-app AppChatApp stream session parity', () => {
  const originalDbBridge = (globalThis as any).dbBridge
  const originalElectronStore = (globalThis as any).electronStore
  const originalClipboard = globalThis.navigator.clipboard
  const originalSetTimeout = globalThis.setTimeout
  let clipboardWriteText: ReturnType<typeof vi.fn>

  beforeEach(() => {
    vi.useFakeTimers()
    globalThis.setTimeout = ((fn: (...args: any[]) => void) => originalSetTimeout(fn, 0)) as any
    globalThis.localStorage?.removeItem('starverse.localEndpointTextChat.enabled')
    globalThis.localStorage?.removeItem('starverse.openAIResponsesTextChat.enabled')
    globalThis.localStorage?.removeItem('starverse.googleAIStudioTextChat.enabled')
    globalThis.localStorage?.removeItem('starverse.anthropicMessagesTextChat.enabled')
    globalThis.localStorage?.removeItem('starverse.deepSeekTextChat.enabled')
    globalThis.localStorage?.setItem('starverse.openRouterTextChat.enabled', '1')
    clipboardWriteText = vi.fn(async () => undefined)
    Object.defineProperty(globalThis.navigator, 'clipboard', {
      configurable: true,
      value: { writeText: clipboardWriteText },
    })

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
    capturedStreamOptions.length = 0
    hoisted.throwAbortInGenerator = false
    ;(globalThis as any).dbBridge = originalDbBridge
    ;(globalThis as any).electronStore = originalElectronStore
    Object.defineProperty(globalThis.navigator, 'clipboard', {
      configurable: true,
      value: originalClipboard,
    })
    globalThis.setTimeout = originalSetTimeout
    globalThis.localStorage?.removeItem('starverse.openRouterTextChat.enabled')
    vi.useRealTimers()
  })

  it.each(['send', 'regenerate', 'retry'] as const)(
    'keeps stream terminal/dispatch/persist summary equivalent for %s',
    async (mode) => {
      const summary = await runScenario(mode)

      expect(summary.dispatchTypes).toEqual([
        'MetaDelta',
        'MessageDeltaText',
        'MessageAppendContentBlock',
        'MessageDeltaReasoningDetail',
        'UsageDelta',
        'TimingSnapshot',
        'StreamError',
      ])
      expect(summary.appendDeltaText).toBe('hello')
      expect(summary.statusSequence).toEqual(['error'])
      expect(summary.endReasonSequence).toEqual(['mid_stream_error'])
      expect(summary.completionClasses).toEqual(['error'])
      expect(summary.reasoningSegmentCalls).toBe(1)
      expect(summary.reasoningSegmentItems).toBe(1)
      expect(summary.finalizeReasoningCalls).toBe(1)
    }
  )

  it('maps AbortError thrown by stream generator to aborted terminal semantics', async () => {
    hoisted.throwAbortInGenerator = true
    const summary = await runScenario('send', { expectHello: false })
    expect(summary.dispatchTypes).toEqual(['TimingSnapshot', 'StreamAbort'])
    expect(summary.statusSequence).toEqual(['final'])
    expect(summary.endReasonSequence).toEqual(['user_abort'])
    expect(summary.completionClasses).toEqual(['aborted'])
    expect(summary.appendDeltaText).toBe('')
  })

  it('keeps reasoning artifacts out of copy, prompt/context, and clears them when the question is deleted', async () => {
    const user = userEvent.setup()
    const { invoke } = createDbBridge('send')
    ;(globalThis as any).dbBridge = { invoke }

    render(AppChatApp)
    await screen.findByRole('button', { name: /Chat 1/ })
    await waitForComposerReady()

    await user.click(draftBox())
    await user.type(draftBox(), 'fixture question')
    await user.click(sendButton())

    await screen.findByText('hello')
    const diagnostics = await screen.findByTestId('reasoning-artifact-diagnostics')
    expect(diagnostics.textContent).toContain(`${t('diagnostics.reasoningArtifacts.title')} · 1`)
    expect(diagnostics.textContent).toContain('reasoning-fixture')

    await vi.runAllTimersAsync()
    const copyButton = await screen.findByTestId('copy-assistant-text-a_stream')
    await waitFor(() => {
      expect(copyButton).not.toBeDisabled()
    })
    expect(copyButton.textContent).toContain('Copy text')
    expect(diagnostics.textContent?.toLowerCase()).not.toContain('copy')
    expect(clipboardWriteText).not.toHaveBeenCalledWith(expect.stringContaining('reasoning-fixture'))

    const contextCalls = invoke.mock.calls.filter((call) => call[0] === 'context.buildForBranch')
    expect(JSON.stringify(contextCalls)).not.toContain('reasoning-fixture')
    expect(JSON.stringify(capturedStreamOptions)).not.toContain('reasoning-fixture')

    await user.click(await screen.findByTestId('delete-q-u1'))
    await user.click(await screen.findByTestId('confirm-delete-q-u1'))
    await waitFor(() => {
      expect(screen.queryByTestId('reasoning-artifact-diagnostics')).toBeNull()
    })
  })
})

