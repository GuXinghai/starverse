import { computed, ref } from 'vue'
import { applyEvent, createInitialState, startGeneration } from '@/next/state/reducer'
import { selectSession, selectTranscript } from '@/next/state/selectors'
import type { RootState, SessionVM } from '@/next/state/types'
import { replayOpenRouterSSEFixtureAsEvents } from '@/next/openrouter/replayFixtureStream'

import fixtureNormal from '@/next/openrouter/sse/fixtures/comment_done.txt?raw'
import fixtureUsage from '@/next/openrouter/sse/fixtures/usage_tail_choices_empty.txt?raw'
import fixtureMidstreamError from '@/next/openrouter/sse/fixtures/midstream_error.txt?raw'
import fixtureDebug from '@/next/openrouter/sse/fixtures/debug_choices_empty.txt?raw'

export type DemoScenario = 'normal' | 'usage' | 'midstream_error' | 'debug'

function generateId(prefix: string): string {
  const cryptoObj = (globalThis as any).crypto as { randomUUID?: () => string } | undefined
  if (cryptoObj?.randomUUID) return `${prefix}_${cryptoObj.randomUUID()}`
  return `${prefix}_${Date.now()}_${Math.random().toString(16).slice(2)}`
}

export function useChatSession() {
  const state = ref<RootState>(createInitialState())
  const activeSessionId = ref<string | null>(null)
  const abortController = ref<AbortController | null>(null)
  const isRunning = ref(false)

  const sessionVM = computed<SessionVM | null>(() => {
    if (!activeSessionId.value) return null
    return selectSession(state.value, activeSessionId.value)
  })

  const transcript = computed(() => {
    if (!activeSessionId.value) return []
    return selectTranscript(state.value, activeSessionId.value)
  })

  async function dispatchSend(input: { text: string; scenario: DemoScenario }) {
    if (isRunning.value) return
    isRunning.value = true

    const sessionId = generateId('session')
    const requestId = generateId('request')
    const assistantMessageId = 'assistant_1'

    activeSessionId.value = sessionId
    abortController.value = new AbortController()

    const started = startGeneration(state.value, {
      sessionId,
      requestId,
      model: 'openrouter/auto',
      assistantMessageId,
      userMessageId: 'user_1',
      userMessageText: input.text,
    })
    state.value = started.state

    const fixtureText =
      input.scenario === 'usage'
        ? fixtureUsage
        : input.scenario === 'midstream_error'
          ? fixtureMidstreamError
          : input.scenario === 'debug'
            ? fixtureDebug
            : fixtureNormal

    try {
      for await (const ev of replayOpenRouterSSEFixtureAsEvents(fixtureText, {
        assistantMessageId,
        delayMs: 20,
        signal: abortController.value.signal,
      })) {
        state.value = applyEvent(state.value, sessionId, ev)
      }
    } finally {
      isRunning.value = false
    }
  }

  function dispatchAbort() {
    if (!activeSessionId.value) return
    if (!abortController.value) return
    abortController.value.abort()
    state.value = applyEvent(state.value, activeSessionId.value, { type: 'StreamAbort', reason: 'user' })
  }

  function resetSession() {
    abortController.value?.abort()
    abortController.value = null
    activeSessionId.value = null
    state.value = createInitialState()
    isRunning.value = false
  }

  return {
    sessionVM,
    transcript,
    isRunning,
    dispatchSend,
    dispatchAbort,
    resetSession,
  }
}

