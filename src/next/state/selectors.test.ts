import { describe, it, expect } from 'vitest'
import { selectMessage, selectTranscript, selectUsageSessionTotalDerived, selectUsageThisTurn } from './selectors'
import { applyEvent, createInitialState, startGeneration } from './reducer'

describe('selectMessage visibility (SSOT 3.4 compliance)', () => {
  it('returns "excluded" when reasoning.exclude was true and no reasoning returned', () => {
    const state = createInitialState()
    const { state: s1, assistantMessageId } = startGeneration(state, {
      runId: 'run1',
      requestId: 'req1',
      model: 'test-model',
      requestedReasoningExclude: true, // User requested to exclude reasoning
    })

    const vm = selectMessage(s1, assistantMessageId)

    // SSOT 3.4: "excluded：请求使用了 reasoning.exclude = true 且未返回任何 reasoning 内容"
    expect(vm?.reasoningView.visibility).toBe('excluded')
  })

  it('separates visibility from panelState and provides a default panelState', () => {
    const state = createInitialState()
    const { state: s1, assistantMessageId } = startGeneration(state, {
      runId: 'run1',
      requestId: 'req1',
      model: 'test-model',
      requestedReasoningExclude: true,
    })

    const vm1 = selectMessage(s1, assistantMessageId)
    expect(vm1?.reasoningView.panelState).toBe('expanded')
    expect(vm1?.reasoningView.visibility).toBe('excluded')

    const nextMessages = {
      ...s1.messages,
      [assistantMessageId]: {
        ...s1.messages[assistantMessageId],
        reasoningPanelState: 'collapsed' as const,
      },
    }
    const s2 = {
      ...s1,
      messages: nextMessages,
      entities: { ...s1.entities, messagesById: nextMessages },
    }

    const vm2 = selectMessage(s2, assistantMessageId)
    expect(vm2?.reasoningView.panelState).toBe('collapsed')
    expect(vm2?.reasoningView.visibility).toBe('excluded')
  })

  it('returns "not_returned" when no exclude config and no reasoning returned', () => {
    const state = createInitialState()
    const { state: s1, assistantMessageId } = startGeneration(state, {
      runId: 'run1',
      requestId: 'req1',
      model: 'test-model',
      // No requestedReasoningExclude - user expected reasoning but model didn't provide
    })

    const vm = selectMessage(s1, assistantMessageId)

    // SSOT 3.4: "not returned：未请求 exclude，但仍未返回 reasoning"
    expect(vm?.reasoningView.visibility).toBe('not_returned')
  })

  it('returns "shown" when reasoning content is present (regardless of exclude setting)', () => {
    const state = createInitialState()
    const { state: s1, assistantMessageId } = startGeneration(state, {
      runId: 'run1',
      requestId: 'req1',
      model: 'test-model',
      requestedReasoningExclude: true, // Even with exclude=true
    })

    // Simulate receiving reasoning content
    const messagesWithReasoning = {
      ...s1.messages,
      [assistantMessageId]: {
        ...s1.messages[assistantMessageId],
        reasoningDetailsRaw: [{ type: 'reasoning.text', text: 'thinking...' }],
      },
    }
    const stateWithReasoning = {
      ...s1,
      messages: messagesWithReasoning,
      entities: { ...s1.entities, messagesById: messagesWithReasoning },
    }

    const vm = selectMessage(stateWithReasoning, assistantMessageId)

    // SSOT 3.4: If we have content, always show
    expect(vm?.reasoningView.visibility).toBe('shown')
  })

  it('returns "shown" when hasEncryptedReasoning is true', () => {
    const state = createInitialState()
    const { state: s1, assistantMessageId } = startGeneration(state, {
      runId: 'run1',
      requestId: 'req1',
      model: 'test-model',
    })

    // Simulate receiving encrypted reasoning signal
    const messagesWithEncrypted = {
      ...s1.messages,
      [assistantMessageId]: {
        ...s1.messages[assistantMessageId],
        hasEncryptedReasoning: true,
      },
    }
    const stateWithEncrypted = {
      ...s1,
      messages: messagesWithEncrypted,
      entities: { ...s1.entities, messagesById: messagesWithEncrypted },
    }

    const vm = selectMessage(stateWithEncrypted, assistantMessageId)

    // SSOT 3.4: "encrypted：出现 type = reasoning.encrypted"
    expect(vm?.reasoningView.visibility).toBe('shown')
    expect(vm?.reasoningView.hasEncrypted).toBe(true)
  })

  it('never infers encrypted from empty reasoning (SSOT hard constraint)', () => {
    const state = createInitialState()
    const { state: s1, assistantMessageId } = startGeneration(state, {
      runId: 'run1',
      requestId: 'req1',
      model: 'test-model',
      // No exclude, no reasoning content
    })

    const vm = selectMessage(s1, assistantMessageId)

    // SSOT: "不允许用"excluded 且为空"去推断"encrypted""
    // We should get 'not_returned', NOT any encrypted-related state
    expect(vm?.reasoningView.visibility).toBe('not_returned')
    expect(vm?.reasoningView.hasEncrypted).toBeFalsy()
  })

  it('does not infer visibility from requestedReasoningEffort when no reasoning returned', () => {
    const state = createInitialState()
    const { state: s1, assistantMessageId } = startGeneration(state, {
      runId: 'run1',
      requestId: 'req1',
      model: 'test-model',
      requestedReasoningMode: 'effort',
      requestedReasoningEffort: 'high',
      requestedReasoningExclude: false,
    })

    const vm = selectMessage(s1, assistantMessageId)
    expect(vm?.reasoningView.visibility).toBe('not_returned')
  })
})

describe('selectTranscript', () => {
  it('returns messages with correct visibility in transcript', () => {
    const state = createInitialState()
    const { state: s1, assistantMessageId } = startGeneration(state, {
      runId: 'run1',
      requestId: 'req1',
      model: 'test-model',
      userMessageText: 'Hello',
      requestedReasoningExclude: true,
    })

    const transcript = selectTranscript(s1, 'run1')

    expect(transcript).toHaveLength(2)
    expect(transcript[0].role).toBe('user')
    expect(transcript[1].role).toBe('assistant')
    expect(transcript[1].messageId).toBe(assistantMessageId)
    expect(transcript[1].reasoningView.visibility).toBe('excluded')
  })
})

describe('selector reference stability', () => {
  it('reuses message VM when message is unchanged', () => {
    const state = createInitialState()
    const { state: s1, assistantMessageId } = startGeneration(state, {
      runId: 'run1',
      requestId: 'req1',
      model: 'test-model',
      userMessageId: 'u1',
      userMessageText: 'hello',
      assistantMessageId: 'a1',
    })

    const vm1 = selectMessage(s1, assistantMessageId)
    const vm2 = selectMessage(s1, assistantMessageId)
    expect(vm2).toBe(vm1)
  })

  it('returns stable transcript array when state is unchanged', () => {
    const state = createInitialState()
    const { state: s1 } = startGeneration(state, {
      runId: 'run1',
      requestId: 'req1',
      model: 'test-model',
      userMessageId: 'u1',
      userMessageText: 'hello',
      assistantMessageId: 'a1',
    })

    const t1 = selectTranscript(s1, 'run1')
    const t2 = selectTranscript(s1, 'run1')
    expect(t2).toBe(t1)
  })

  it('reuses unchanged message VM when only one message updates', () => {
    const state = createInitialState()
    const { state: s1 } = startGeneration(state, {
      runId: 'run1',
      requestId: 'req1',
      model: 'test-model',
      userMessageId: 'u1',
      userMessageText: 'hello',
      assistantMessageId: 'a1',
    })

    const t1 = selectTranscript(s1, 'run1')
    const userVm1 = t1.find((m) => m.messageId === 'u1')

    const s2 = applyEvent(s1, 'run1', { type: 'MessageDeltaText', messageId: 'a1', choiceIndex: 0, text: 'x' })
    const t2 = selectTranscript(s2, 'run1')
    const userVm2 = t2.find((m) => m.messageId === 'u1')

    expect(t2).not.toBe(t1)
    expect(userVm2).toBe(userVm1)
  })
})

describe('usage view (turn vs session total derived)', () => {
  it('labels this-turn as the active run usage, and session total as sum of runs', () => {
    let state = createInitialState()

    state = startGeneration(state, { runId: 'run1', requestId: 'req1', model: 'm' }).state
    state = applyEvent(state, 'run1', {
      type: 'UsageDelta',
      usage: { prompt_tokens: 10, completion_tokens: 5, total_tokens: 15 },
    })

    state = startGeneration(state, { runId: 'run2', requestId: 'req2', model: 'm' }).state
    state = applyEvent(state, 'run2', {
      type: 'UsageDelta',
      usage: { prompt_tokens: 3, completion_tokens: 7, total_tokens: 10 },
    })

    expect(selectUsageThisTurn(state, 'run2')).toEqual({
      promptTokens: 3,
      completionTokens: 7,
      totalTokens: 10,
    })

    expect(selectUsageSessionTotalDerived(state)).toEqual({
      promptTokens: 13,
      completionTokens: 12,
      totalTokens: 25,
    })
  })
})
