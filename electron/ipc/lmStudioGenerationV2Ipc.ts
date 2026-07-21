import type { RegisterInvoke } from './types'
import type { GenerationStreamProjectionSinkV2 } from '../services/generationStreamProjectionV2'
import type { LmStudioOpenResponsesGenerationV2Runtime } from '../services/lmStudioOpenResponsesGenerationV2Runtime'
import { registerTextGenerationV2IpcCore } from './textGenerationV2IpcCore'

export const LMSTUDIO_GENERATION_V2_IPC_CHANNELS = Object.freeze([
  'generation-v2:lmstudio:openresponses:initial', 'generation-v2:lmstudio:openresponses:retry',
  'generation-v2:lmstudio:openresponses:regenerate', 'generation-v2:lmstudio:openresponses:edit-resend',
  'generation-v2:lmstudio:openresponses:continue-tool', 'generation-v2:lmstudio:openresponses:abort',
] as const)
export const LMSTUDIO_GENERATION_V2_PROJECTION_CHANNEL = 'generation-v2:lmstudio:projection' as const
export function registerLmStudioGenerationV2Ipc(input: Readonly<{
  registerInvoke: RegisterInvoke
  createRuntime: (sink: GenerationStreamProjectionSinkV2) => LmStudioOpenResponsesGenerationV2Runtime
}>): readonly string[] {
  return registerTextGenerationV2IpcCore({ registerInvoke: input.registerInvoke,
    providerErrorPrefix: 'GENERATION_V2_LMSTUDIO_IPC', createRuntime: input.createRuntime,
    channels: { initial: LMSTUDIO_GENERATION_V2_IPC_CHANNELS[0], retry: LMSTUDIO_GENERATION_V2_IPC_CHANNELS[1],
      regenerate: LMSTUDIO_GENERATION_V2_IPC_CHANNELS[2], editResend: LMSTUDIO_GENERATION_V2_IPC_CHANNELS[3],
      continueTool: LMSTUDIO_GENERATION_V2_IPC_CHANNELS[4], abort: LMSTUDIO_GENERATION_V2_IPC_CHANNELS[5],
      projection: LMSTUDIO_GENERATION_V2_PROJECTION_CHANNEL } })
}
