import type { RegisterInvoke } from './types'
import type { DeepSeekGenerationV2Runtime } from '../services/deepSeekGenerationV2Runtime'
import type { GenerationOperationRuntimeRegistryV2 } from '../services/generationOperationRuntimeRegistryV2'
import type { GenerationStreamProjectionSinkV2 } from '../services/generationStreamProjectionV2'
import { registerTextGenerationV2IpcCore } from './textGenerationV2IpcCore'

export const DEEPSEEK_GENERATION_V2_IPC_CHANNELS = Object.freeze([
  'generation-v2:deepseek:initial',
  'generation-v2:deepseek:retry',
  'generation-v2:deepseek:regenerate',
  'generation-v2:deepseek:edit-resend',
  'generation-v2:deepseek:continue-tool',
  'generation-v2:deepseek:abort',
] as const)

export const DEEPSEEK_GENERATION_V2_PROJECTION_CHANNEL = 'generation-v2:deepseek:projection' as const

export function registerDeepSeekGenerationV2Ipc(input: Readonly<{
  registerInvoke: RegisterInvoke
  createRuntime: (sink: GenerationStreamProjectionSinkV2) => DeepSeekGenerationV2Runtime
  runtimeRegistry?: GenerationOperationRuntimeRegistryV2
}>): readonly string[] {
  return registerTextGenerationV2IpcCore({
    registerInvoke: input.registerInvoke,
    runtimeRegistry: input.runtimeRegistry,
    providerErrorPrefix: 'GENERATION_V2_DEEPSEEK_IPC',
    createRuntime: (sink) => {
      const runtime = input.createRuntime(sink)
      return Object.freeze({
        submitInitial: runtime.submitInitial,
        retry: runtime.retry,
        regenerate: runtime.regenerate,
        editResend: runtime.editResend,
        continueTool: runtime.continueTool,
        abort: runtime.abort,
      })
    },
    channels: {
      initial: DEEPSEEK_GENERATION_V2_IPC_CHANNELS[0],
      retry: DEEPSEEK_GENERATION_V2_IPC_CHANNELS[1],
      regenerate: DEEPSEEK_GENERATION_V2_IPC_CHANNELS[2],
      editResend: DEEPSEEK_GENERATION_V2_IPC_CHANNELS[3],
      continueTool: DEEPSEEK_GENERATION_V2_IPC_CHANNELS[4],
      abort: DEEPSEEK_GENERATION_V2_IPC_CHANNELS[5],
      projection: DEEPSEEK_GENERATION_V2_PROJECTION_CHANNEL,
    },
  })
}
