import type { RegisterInvoke } from './types'
import type { OpenAIChatCompatibleGenerationV2Runtime } from '../services/openAIChatCompatibleGenerationV2Runtime'
import type { GenerationOperationRuntimeRegistryV2 } from '../services/generationOperationRuntimeRegistryV2'
import type { GenerationStreamProjectionSinkV2 } from '../services/generationStreamProjectionV2'
import { registerTextGenerationV2IpcCore } from './textGenerationV2IpcCore'

export const OPENAI_COMPATIBLE_GENERATION_V2_IPC_CHANNELS = Object.freeze([
  'generation-v2:openai-compatible:initial',
  'generation-v2:openai-compatible:retry',
  'generation-v2:openai-compatible:regenerate',
  'generation-v2:openai-compatible:edit-resend',
  'generation-v2:openai-compatible:abort',
] as const)
export const OPENAI_COMPATIBLE_GENERATION_V2_PROJECTION_CHANNEL = 'generation-v2:openai-compatible:projection' as const

export function registerOpenAICompatibleGenerationV2Ipc(input: Readonly<{
  registerInvoke: RegisterInvoke
  createRuntime: (sink: GenerationStreamProjectionSinkV2) => OpenAIChatCompatibleGenerationV2Runtime
  runtimeRegistry?: GenerationOperationRuntimeRegistryV2
}>): readonly string[] {
  return registerTextGenerationV2IpcCore({
    registerInvoke: input.registerInvoke,
    createRuntime: input.createRuntime,
    runtimeRegistry: input.runtimeRegistry,
    providerErrorPrefix: 'GENERATION_V2_OPENAI_COMPATIBLE_IPC',
    channels: {
      initial: OPENAI_COMPATIBLE_GENERATION_V2_IPC_CHANNELS[0],
      retry: OPENAI_COMPATIBLE_GENERATION_V2_IPC_CHANNELS[1],
      regenerate: OPENAI_COMPATIBLE_GENERATION_V2_IPC_CHANNELS[2],
      editResend: OPENAI_COMPATIBLE_GENERATION_V2_IPC_CHANNELS[3],
      abort: OPENAI_COMPATIBLE_GENERATION_V2_IPC_CHANNELS[4],
      projection: OPENAI_COMPATIBLE_GENERATION_V2_PROJECTION_CHANNEL,
    },
  })
}
