import { describe, expect, it, vi } from 'vitest'
import { OPENAI_COMPATIBLE_GENERATION_V2_IPC_CHANNELS, OPENAI_COMPATIBLE_GENERATION_V2_PROJECTION_CHANNEL, registerOpenAICompatibleGenerationV2Ipc } from './openAICompatibleGenerationV2Ipc'
import type { GenerationStreamProjectionSinkV2 } from '../services/generationStreamProjectionV2'

function commandResult() {
  return { kind: 'created', preparedRequest: { operationId: 'operation:1', answerRootId: 'answer:1' },
    execution: { operation: {
      operationId: { value: 'operation:1' }, targetAnswerId: { value: 'answer:1' }, actionKind: 'initial_send',
    } },
    projection: { branchProjection: { branchId: { value: 'branch:1' }, conversationId: { value: 'conversation:1' }, questionId: { value: 'question:1' },
      headMessageId: { value: 'answer:1' }, chosenAnswerRootId: { value: 'answer:1' }, deletedAtMs: null } } } as never
}

describe('OpenAI-compatible Generation V2 IPC', () => {
  it('dispatches only committed V2 command results and emits projections to the originating renderer', async () => {
    const handlers = new Map<string, (...args: unknown[]) => unknown>(); let sink: GenerationStreamProjectionSinkV2 | undefined
    const runtime = { submitInitial: vi.fn(async () => commandResult()), retry: vi.fn(), regenerate: vi.fn(), editResend: vi.fn(), abort: vi.fn(() => true) }
    expect(registerOpenAICompatibleGenerationV2Ipc({ registerInvoke: (channel, handler) => handlers.set(channel, handler as never),
      createRuntime: (issuedSink) => { sink = issuedSink; return runtime as never } })).toEqual([...OPENAI_COMPATIBLE_GENERATION_V2_IPC_CHANNELS])
    const sender = { send: vi.fn() }
    await expect(handlers.get('generation-v2:openai-compatible:initial')?.({ sender }, {
      command: { operationId: 'operation:1' }, expectedCapabilityRevision: 'capability-v2:test',
    })).resolves.toMatchObject({
      ok: true, operationId: 'operation:1', answerRootId: 'answer:1', branch: { chosenAnswerRootId: 'answer:1', headMessageId: 'answer:1' },
    })
    expect(runtime.submitInitial).toHaveBeenCalledWith({ operationId: 'operation:1' })
    sink?.publish({ type: 'terminal', operationId: 'operation:1', answerRootId: 'answer:1', state: 'completed', errorCode: null, errorMessage: null })
    expect(sender.send).toHaveBeenCalledWith(OPENAI_COMPATIBLE_GENERATION_V2_PROJECTION_CHANNEL, {
      type: 'terminal', operationId: 'operation:1', answerRootId: 'answer:1', state: 'completed', errorCode: null, errorMessage: null,
    })
  })

  it('rejects malformed renderer payloads before dispatch', async () => {
    const handlers = new Map<string, (...args: unknown[]) => unknown>(); const runtime = { submitInitial: vi.fn(), retry: vi.fn(), regenerate: vi.fn(), editResend: vi.fn(), abort: vi.fn() }
    registerOpenAICompatibleGenerationV2Ipc({ registerInvoke: (channel, handler) => handlers.set(channel, handler as never), createRuntime: () => runtime as never })
    await expect(handlers.get('generation-v2:openai-compatible:initial')?.({ sender: { send: vi.fn() } }, {
      command: { operationId: ' whitespace ' }, expectedCapabilityRevision: 'capability-v2:test',
    }))
      .resolves.toEqual({ ok: false, code: 'GENERATION_V2_OPENAI_COMPATIBLE_IPC_INVALID_PAYLOAD' })
    await expect(handlers.get('generation-v2:openai-compatible:initial')?.({ sender: { send: vi.fn() } }, {
      command: { operationId: 'operation:1' },
    }))
      .resolves.toEqual({ ok: false, code: 'GENERATION_V2_OPENAI_COMPATIBLE_IPC_INVALID_PAYLOAD' })
    expect(runtime.submitInitial).not.toHaveBeenCalled()
  })
})
