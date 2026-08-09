import type { RegisterInvoke } from './types'
import type { GenerationStreamProjectionSinkV2 } from '../services/generationStreamProjectionV2'
import type { AnthropicGenerationV2Runtime } from '../services/anthropicGenerationV2Runtime'
import { registerTextGenerationV2IpcCore } from './textGenerationV2IpcCore'
import type { GenerationOperationRuntimeRegistryV2 } from '../services/generationOperationRuntimeRegistryV2'

export const ANTHROPIC_GENERATION_V2_IPC_CHANNELS = Object.freeze([
  'generation-v2:anthropic:initial', 'generation-v2:anthropic:retry',
  'generation-v2:anthropic:regenerate', 'generation-v2:anthropic:edit-resend',
  'generation-v2:anthropic:continue-tool', 'generation-v2:anthropic:abort',
] as const)
export const ANTHROPIC_GENERATION_V2_PROJECTION_CHANNEL = 'generation-v2:anthropic:projection' as const

export function registerAnthropicGenerationV2Ipc(input: Readonly<{
  registerInvoke: RegisterInvoke
  createRuntime: (sink: GenerationStreamProjectionSinkV2) => AnthropicGenerationV2Runtime
  runtimeRegistry?: GenerationOperationRuntimeRegistryV2
}>): readonly string[] {
  return registerTextGenerationV2IpcCore({ registerInvoke: input.registerInvoke, runtimeRegistry: input.runtimeRegistry,
    providerErrorPrefix: 'GENERATION_V2_ANTHROPIC_IPC', createRuntime: (sink) => {
      const runtime = input.createRuntime(sink)
      return Object.freeze({ submitInitial: runtime.submitInitial, retry: runtime.submitRetry,
        regenerate: runtime.submitRegenerate, editResend: runtime.submitEditResend,
        continueTool: runtime.submitToolContinuation, abort: runtime.abort })
    },
    channels: { initial: ANTHROPIC_GENERATION_V2_IPC_CHANNELS[0], retry: ANTHROPIC_GENERATION_V2_IPC_CHANNELS[1],
      regenerate: ANTHROPIC_GENERATION_V2_IPC_CHANNELS[2], editResend: ANTHROPIC_GENERATION_V2_IPC_CHANNELS[3],
      continueTool: ANTHROPIC_GENERATION_V2_IPC_CHANNELS[4], abort: ANTHROPIC_GENERATION_V2_IPC_CHANNELS[5],
      projection: ANTHROPIC_GENERATION_V2_PROJECTION_CHANNEL } })
}
