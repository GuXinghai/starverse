import { computed, ref } from 'vue'
import { applyEvent, createInitialState, startGeneration, toggleReasoningPanelState } from '@/next/state/reducer'
import { selectRun, selectTranscript, selectUsageSessionTotalDerived, selectUsageThisTurn, type TokenUsage } from '@/next/state/selectors'
import type { RootState, RunVM } from '@/next/state/types'
import { replayOpenRouterSSEFixtureAsEvents } from '@/next/openrouter/replayFixtureStream'
import { streamOpenRouterChatAsEvents, type LiveRequestConfig } from '@/ui-next/live/openRouterLiveStream'

import fixtureNormal from '@/next/openrouter/sse/fixtures/comment_done.txt?raw'
import fixtureUsage from '@/next/openrouter/sse/fixtures/usage_tail_choices_empty.txt?raw'
import fixtureMidstreamError from '@/next/openrouter/sse/fixtures/midstream_error.txt?raw'
import fixtureDebug from '@/next/openrouter/sse/fixtures/debug_choices_empty.txt?raw'

import fixtureReasoningDetails from '@/next/openrouter/sse/fixtures/reasoning_details.txt?raw'
import fixtureEncrypted from '@/next/openrouter/sse/fixtures/encrypted.txt?raw'
import fixtureToolCalls from '@/next/openrouter/sse/fixtures/tool_calls.txt?raw'

export type DemoScenario =
  | 'normal'
  | 'usage'
  | 'midstream_error'
  | 'excluded'
  | 'reasoning_details'
  | 'encrypted'
  | 'tool_calls'
  | 'debug'

export type RunMode = 'live' | 'demo'

function generateId(prefix: string): string {
  const cryptoObj = (globalThis as any).crypto as { randomUUID?: () => string } | undefined
  if (cryptoObj?.randomUUID) return `${prefix}_${cryptoObj.randomUUID()}`
  return `${prefix}_${Date.now()}_${Math.random().toString(16).slice(2)}`
}

export function useChatRun() {
  const state = ref<RootState>(createInitialState())
  const activeRunId = ref<string | null>(null)
  const abortController = ref<AbortController | null>(null)
  const isRunning = ref(false)

  const runVM = computed<RunVM | null>(() => {
    if (!activeRunId.value) return null
    return selectRun(state.value, activeRunId.value)
  })

  const transcript = computed(() => {
    if (!activeRunId.value) return []
    return selectTranscript(state.value, activeRunId.value)
  })

  const usageThisTurn = computed<TokenUsage | null>(() => {
    if (!activeRunId.value) return null
    return selectUsageThisTurn(state.value, activeRunId.value)
  })

  const usageSessionTotalDerived = computed<TokenUsage | null>(() => selectUsageSessionTotalDerived(state.value))

  async function dispatchSend(input: {
    text: string
    scenario: DemoScenario
    mode: RunMode
    live: LiveRequestConfig
  }) {
    if (isRunning.value) return
    isRunning.value = true

    const runId = generateId('run')
    const requestId = generateId('request')
    const assistantMessageId = 'assistant_1'

    activeRunId.value = runId
    abortController.value = new AbortController()

    const started = startGeneration(state.value, {
      runId,
      requestId,
      model: input.live.model,
      assistantMessageId,
      userMessageId: 'user_1',
      userMessageText: input.text,
      reasoningExclude: input.mode === 'demo' ? input.scenario === 'excluded' : input.live.reasoningExclude,
    })
    state.value = started.state

    try {
      if (input.mode === 'demo') {
        const fixtureText =
          input.scenario === 'usage'
            ? fixtureUsage
            : input.scenario === 'midstream_error'
              ? fixtureMidstreamError
              : input.scenario === 'reasoning_details'
                ? fixtureReasoningDetails
                : input.scenario === 'encrypted'
                  ? fixtureEncrypted
                  : input.scenario === 'tool_calls'
                    ? fixtureToolCalls
                  : input.scenario === 'debug'
                  ? fixtureDebug
                  : fixtureNormal

        for await (const ev of replayOpenRouterSSEFixtureAsEvents(fixtureText, {
          assistantMessageId,
          delayMs: 20,
          signal: abortController.value.signal,
        })) {
          state.value = applyEvent(state.value, runId, ev)
        }
      } else {
        for await (const ev of streamOpenRouterChatAsEvents({
          requestId,
          assistantMessageId,
          userText: input.text,
          signal: abortController.value.signal,
          config: input.live,
        })) {
          state.value = applyEvent(state.value, runId, ev)
        }
      }
    } finally {
      isRunning.value = false
    }
  }

  function dispatchAbort() {
    if (!activeRunId.value) return
    if (!abortController.value) return
    abortController.value.abort()
    state.value = applyEvent(state.value, activeRunId.value, { type: 'StreamAbort', reason: 'user' })
  }

  function resetRun() {
    abortController.value?.abort()
    abortController.value = null
    activeRunId.value = null
    state.value = createInitialState()
    isRunning.value = false
  }

  function dispatchToggleReasoningPanelState(messageId: string) {
    state.value = toggleReasoningPanelState(state.value, messageId)
  }

  return {
    runVM,
    transcript,
    isRunning,
    usageThisTurn,
    usageSessionTotalDerived,
    dispatchSend,
    dispatchAbort,
    dispatchToggleReasoningPanelState,
    resetRun,
  }
}
