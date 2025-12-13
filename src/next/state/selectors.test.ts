import { describe, it, expect } from 'vitest'
import { selectMessage, selectTranscript } from './selectors'
import { createInitialState, startGeneration } from './reducer'

describe('selectMessage visibility (SSOT 3.4 compliance)', () => {
  it('returns "excluded" when reasoning.exclude was true and no reasoning returned', () => {
    const state = createInitialState()
    const { state: s1, assistantMessageId } = startGeneration(state, {
      runId: 'run1',
      requestId: 'req1',
      model: 'test-model',
      reasoningExclude: true, // User requested to exclude reasoning
    })

    const vm = selectMessage(s1, assistantMessageId)

    // SSOT 3.4: "excluded：请求使用了 reasoning.exclude = true 且未返回任何 reasoning 内容"
    expect(vm?.reasoningView.visibility).toBe('excluded')
  })

  it('returns "not_returned" when no exclude config and no reasoning returned', () => {
    const state = createInitialState()
    const { state: s1, assistantMessageId } = startGeneration(state, {
      runId: 'run1',
      requestId: 'req1',
      model: 'test-model',
      // No reasoningExclude - user expected reasoning but model didn't provide
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
      reasoningExclude: true, // Even with exclude=true
    })

    // Simulate receiving reasoning content
    const stateWithReasoning = {
      ...s1,
      messages: {
        ...s1.messages,
        [assistantMessageId]: {
          ...s1.messages[assistantMessageId],
          reasoningDetailsRaw: [{ type: 'reasoning.text', text: 'thinking...' }],
        },
      },
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
    const stateWithEncrypted = {
      ...s1,
      messages: {
        ...s1.messages,
        [assistantMessageId]: {
          ...s1.messages[assistantMessageId],
          hasEncryptedReasoning: true,
        },
      },
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
})

describe('selectTranscript', () => {
  it('returns messages with correct visibility in transcript', () => {
    const state = createInitialState()
    const { state: s1, assistantMessageId } = startGeneration(state, {
      runId: 'run1',
      requestId: 'req1',
      model: 'test-model',
      userMessageText: 'Hello',
      reasoningExclude: true,
    })

    const transcript = selectTranscript(s1, 'run1')

    expect(transcript).toHaveLength(2)
    expect(transcript[0].role).toBe('user')
    expect(transcript[1].role).toBe('assistant')
    expect(transcript[1].messageId).toBe(assistantMessageId)
    expect(transcript[1].reasoningView.visibility).toBe('excluded')
  })
})
