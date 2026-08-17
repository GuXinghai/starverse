import { describe, expect, it, vi } from 'vitest'
import { GEMINI_GENERATION_V2_IPC_CHANNELS, registerGeminiGenerationV2Ipc } from './geminiGenerationV2Ipc'

describe('Gemini GenerateContent V2 IPC', () => {
  it('registers and forwards the provider-native tool continuation channel', async () => {
    const handlers = new Map<string, (...args: unknown[]) => unknown>()
    const runtime = {
      submitInitial: vi.fn(), retry: vi.fn(), regenerate: vi.fn(), editResend: vi.fn(),
      continueTool: vi.fn(async () => ({ kind: 'idempotent_replay' })), abort: vi.fn(),
    }
    const interactionsImageRuntime = {
      submitInitial: vi.fn(), retry: vi.fn(), regenerate: vi.fn(), editResend: vi.fn(), abort: vi.fn(),
    }
    expect(registerGeminiGenerationV2Ipc({
      registerInvoke: (channel, handler) => handlers.set(channel, handler as never),
      createRuntime: () => runtime as never,
      createInteractionsImageRuntime: () => interactionsImageRuntime as never,
    })).toEqual([...GEMINI_GENERATION_V2_IPC_CHANNELS])
    const command = { operationId: 'operation:1', priorRequestSequence: 1, toolOutputs: [] }
    await handlers.get('generation-v2:gemini:generate-content:continue-tool')?.(
      { sender: { send: vi.fn() } }, { command, expectedCapabilityRevision: 'capability-v2:test' },
    )
    expect(runtime.continueTool).toHaveBeenCalledWith(command)
    expect(handlers.has('generation-v2:gemini:interactions-image:initial')).toBe(true)
  })
})
