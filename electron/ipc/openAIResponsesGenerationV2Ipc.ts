import type { RegisterInvoke } from './types'
import type { GenerationStreamProjectionSinkV2 } from '../services/generationStreamProjectionV2'
import type { OpenAIResponsesGenerationV2Runtime } from '../services/openAIResponsesGenerationV2Runtime'
import { registerTextGenerationV2IpcCore } from './textGenerationV2IpcCore'
import type { GenerationOperationRuntimeRegistryV2 } from '../services/generationOperationRuntimeRegistryV2'

export const OPENAI_RESPONSES_GENERATION_V2_IPC_CHANNELS = Object.freeze([
  'generation-v2:openai-responses:initial', 'generation-v2:openai-responses:retry',
  'generation-v2:openai-responses:regenerate', 'generation-v2:openai-responses:edit-resend',
  'generation-v2:openai-responses:continue-tool', 'generation-v2:openai-responses:abort',
] as const)
export const OPENAI_RESPONSES_GENERATION_V2_PROJECTION_CHANNEL = 'generation-v2:openai-responses:projection' as const

export function registerOpenAIResponsesGenerationV2Ipc(input: Readonly<{
  registerInvoke: RegisterInvoke
  createRuntime: (sink: GenerationStreamProjectionSinkV2) => OpenAIResponsesGenerationV2Runtime
  runtimeRegistry?: GenerationOperationRuntimeRegistryV2
}>): readonly string[] {
  return registerTextGenerationV2IpcCore({ registerInvoke: input.registerInvoke, runtimeRegistry: input.runtimeRegistry,
    providerErrorPrefix: 'GENERATION_V2_OPENAI_RESPONSES_IPC', createRuntime: input.createRuntime,
    channels: { initial: OPENAI_RESPONSES_GENERATION_V2_IPC_CHANNELS[0], retry: OPENAI_RESPONSES_GENERATION_V2_IPC_CHANNELS[1],
      regenerate: OPENAI_RESPONSES_GENERATION_V2_IPC_CHANNELS[2], editResend: OPENAI_RESPONSES_GENERATION_V2_IPC_CHANNELS[3],
      continueTool: OPENAI_RESPONSES_GENERATION_V2_IPC_CHANNELS[4], abort: OPENAI_RESPONSES_GENERATION_V2_IPC_CHANNELS[5],
      projection: OPENAI_RESPONSES_GENERATION_V2_PROJECTION_CHANNEL } })
}
