import { describe, expect, it } from 'vitest'
import { restoreOpenAIResponsesTerminalResultV1 } from '../../../../core/generation-v2/providers/openai-responses/responsesStreamV1'
import { createOpenAIResponsesCompletionReceiptV1, restoreOpenAIResponsesCompletionReceiptV1 } from '../../../../core/generation-v2/providers/openai-responses/completionReceiptV1'
import { interruptedAssistantReplayV1 } from '../../../../core/generation-v2/providers/interruptedReplayV1'

function receipt(text: string) {
  const terminalResult = restoreOpenAIResponsesTerminalResultV1({ terminalKind: 'completed', responseId: 'resp_1',
    model: 'test-model', createdAt: 1, completedAt: 2,
    output: [{ id: 'msg_1', type: 'message', role: 'assistant', status: 'completed',
      content: [{ type: 'output_text', text, annotations: [] }] }],
    visibleText: text, reasoningSummaryText: '', usage: null, error: null, incompleteReason: null })
  return createOpenAIResponsesCompletionReceiptV1({ terminalResult, replayOutput: terminalResult.output,
    interruptedSnapshot: { items: terminalResult.output, completeIndexes: [0], text,
      reasoningSummaryText: '', complete: true } })
}

describe('OpenAI completion receipt persistence contract', () => {
  it('retains JSON-representable provider text without adding a stricter content filter', () => {
    const original = receipt('before\u0000after\nline')
    const restored = restoreOpenAIResponsesCompletionReceiptV1(JSON.parse(JSON.stringify(original)))
    expect(restored).toEqual(original)
    expect(restored.interruptedSnapshot.text).toBe('before\u0000after\nline')
    expect(restoreOpenAIResponsesCompletionReceiptV1(original.terminalResult).terminalResult).toEqual(original.terminalResult)
  })

  it('binds a completed snapshot to the chosen reasoning replay ciphertext', () => {
    const terminalResult = restoreOpenAIResponsesTerminalResultV1({ terminalKind: 'completed', responseId: 'resp_cipher',
      model: 'test-model', createdAt: 1, completedAt: 2,
      output: [{ id: 'rs_1', type: 'reasoning', summary: [], encrypted_content: 'terminal-B' },
        ...receipt('answer').terminalResult.output],
      visibleText: 'answer', reasoningSummaryText: '', usage: null, error: null, incompleteReason: null })
    const replayOutput = terminalResult.output.map(item => item.type === 'reasoning' ? { ...item, encrypted_content: 'done-A' } : item)
    const original = createOpenAIResponsesCompletionReceiptV1({ terminalResult, replayOutput,
      interruptedSnapshot: { items: replayOutput, completeIndexes: [0, 1], text: 'answer',
        reasoningSummaryText: '', complete: true } })
    const changed = JSON.parse(JSON.stringify(original))
    changed.interruptedSnapshot.items[0].encrypted_content = 'terminal-B'
    expect(() => restoreOpenAIResponsesCompletionReceiptV1(changed)).toThrow()
    const legacy = restoreOpenAIResponsesCompletionReceiptV1(terminalResult)
    expect(legacy.interruptedSnapshot.completeIndexes).toEqual([0, 1])
    expect(interruptedAssistantReplayV1('openai_responses', legacy.interruptedSnapshot)).toEqual(terminalResult.output)
  })

  it('rejects a changed replay or snapshot rather than changing the durable terminal fact', () => {
    const original = receipt('original')
    const changedReplay = JSON.parse(JSON.stringify(original))
    changedReplay.replayOutput[0].content[0].text = 'changed'
    expect(() => restoreOpenAIResponsesCompletionReceiptV1(changedReplay)).toThrow()
    const changedSnapshot = JSON.parse(JSON.stringify(original))
    changedSnapshot.interruptedSnapshot.text = 'changed'
    expect(() => restoreOpenAIResponsesCompletionReceiptV1(changedSnapshot)).toThrow()
  })

  it('accepts the native codec maximum item count without imposing a smaller JSON-field count', () => {
    const output = Array.from({ length: 4_096 }, (_, index) => ({ id: `msg_${index}`, type: 'message',
      role: 'assistant', status: 'completed', content: [{ type: 'output_text', text: 'x', annotations: [] }] }))
    const text = 'x'.repeat(output.length)
    const terminalResult = restoreOpenAIResponsesTerminalResultV1({ terminalKind: 'completed', responseId: 'resp_many',
      model: 'test-model', createdAt: 1, completedAt: 2, output, visibleText: text,
      reasoningSummaryText: '', usage: null, error: null, incompleteReason: null })
    const saved = createOpenAIResponsesCompletionReceiptV1({ terminalResult, replayOutput: terminalResult.output,
      interruptedSnapshot: { items: terminalResult.output, completeIndexes: output.map((_, index) => index),
        text, reasoningSummaryText: '', complete: true } })
    expect(restoreOpenAIResponsesCompletionReceiptV1(JSON.parse(JSON.stringify(saved))).replayOutput).toHaveLength(4_096)
  }, 20_000)
})
