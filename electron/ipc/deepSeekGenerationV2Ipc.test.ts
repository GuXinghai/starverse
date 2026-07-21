import { describe, expect, it, vi } from 'vitest'
import {
  DEEPSEEK_GENERATION_V2_IPC_CHANNELS,
  DEEPSEEK_GENERATION_V2_PROJECTION_CHANNEL,
  registerDeepSeekGenerationV2Ipc,
} from './deepSeekGenerationV2Ipc'
import type { GenerationStreamProjectionSinkV2 } from '../services/generationStreamProjectionV2'

function commandResult() {
  return {
    kind: 'created',
    preparedRequest: { operationId: 'operation:1', answerRootId: 'answer:1' },
    execution: { operation: { actionKind: 'initial_send' } },
    projection: {
      branchProjection: {
        branchId: { value: 'branch:1' }, conversationId: { value: 'conversation:1' },
        questionId: { value: 'question:1' }, headMessageId: { value: 'answer:1' },
        chosenAnswerRootId: { value: 'answer:1' }, deletedAtMs: null,
      },
      visibleCandidates: [{ value: 'answer:0' }, { value: 'answer:1' }],
      visibleQuestionCandidates: [{ value: 'question:1' }],
    },
  } as never
}

describe('DeepSeek Generation V2 IPC', () => {
  it('forwards strict V2 commands and projects only committed graph state plus downstream stream updates', async () => {
    const handlers = new Map<string, (...args: unknown[]) => unknown>()
    let sink: GenerationStreamProjectionSinkV2 | undefined
    const runtime = {
      submitInitial: vi.fn(async () => commandResult()),
      retry: vi.fn(), regenerate: vi.fn(), editResend: vi.fn(), continueTool: vi.fn(), abort: vi.fn(() => true),
    }
    expect(registerDeepSeekGenerationV2Ipc({
      registerInvoke: (channel, handler) => handlers.set(channel, handler as never),
      createRuntime: (issuedSink) => {
        sink = issuedSink
        return runtime as never
      },
    })).toEqual([...DEEPSEEK_GENERATION_V2_IPC_CHANNELS])

    const sender = { send: vi.fn() }
    const result = await handlers.get('generation-v2:deepseek:initial')?.({ sender }, { operationId: 'operation:1' })
    expect(runtime.submitInitial).toHaveBeenCalledWith({ operationId: 'operation:1' })
    expect(result).toEqual({
      ok: true, kind: 'created', operationId: 'operation:1', answerRootId: 'answer:1', actionKind: 'initial_send',
      branch: {
        branchId: 'branch:1', conversationId: 'conversation:1', questionId: 'question:1',
        headMessageId: 'answer:1', chosenAnswerRootId: 'answer:1', deletedAtMs: null,
      },
      visibleAnswerRootIds: ['answer:0', 'answer:1'], visibleQuestionIds: ['question:1'],
    })
    sink?.publish({ type: 'assistant_body', operationId: 'operation:1', answerRootId: 'answer:1', content: 'partial' })
    sink?.publish({ type: 'terminal', operationId: 'operation:1', answerRootId: 'answer:1', state: 'completed', errorCode: null, errorMessage: null })
    expect(sender.send).toHaveBeenNthCalledWith(1, DEEPSEEK_GENERATION_V2_PROJECTION_CHANNEL, {
      type: 'assistant_body', operationId: 'operation:1', answerRootId: 'answer:1', content: 'partial',
    })
    expect(sender.send).toHaveBeenNthCalledWith(2, DEEPSEEK_GENERATION_V2_PROJECTION_CHANNEL, {
      type: 'terminal', operationId: 'operation:1', answerRootId: 'answer:1', state: 'completed', errorCode: null, errorMessage: null,
    })
  })

  it('rejects malformed payloads before a V2 command is dispatched', async () => {
    const handlers = new Map<string, (...args: unknown[]) => unknown>()
    const runtime = {
      submitInitial: vi.fn(), retry: vi.fn(), regenerate: vi.fn(), editResend: vi.fn(), continueTool: vi.fn(), abort: vi.fn(),
    }
    registerDeepSeekGenerationV2Ipc({
      registerInvoke: (channel, handler) => handlers.set(channel, handler as never),
      createRuntime: () => runtime as never,
    })
    await expect(handlers.get('generation-v2:deepseek:initial')?.({ sender: { send: vi.fn() } }, { operationId: ' trimmed ' }))
      .resolves.toEqual({ ok: false, code: 'GENERATION_V2_DEEPSEEK_IPC_INVALID_PAYLOAD' })
    expect(runtime.submitInitial).not.toHaveBeenCalled()
  })
})
