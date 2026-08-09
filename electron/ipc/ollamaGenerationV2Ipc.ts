import type { RegisterInvoke } from './types'
import type { GenerationStreamProjectionSinkV2 } from '../services/generationStreamProjectionV2'
import type { GenerationOperationRuntimeRegistryV2 } from '../services/generationOperationRuntimeRegistryV2'
import type { OllamaChatGenerationV2Runtime } from '../services/ollamaChatGenerationV2Runtime'
import { registerTextGenerationV2IpcCore } from './textGenerationV2IpcCore'

export function registerOllamaGenerationV2Ipc(input: Readonly<{
  registerInvoke: RegisterInvoke
  createRuntime: (sink: GenerationStreamProjectionSinkV2) => OllamaChatGenerationV2Runtime
  runtimeRegistry?: GenerationOperationRuntimeRegistryV2
}>): readonly string[] {
  return registerTextGenerationV2IpcCore({
    registerInvoke: input.registerInvoke,
    createRuntime: input.createRuntime,
    runtimeRegistry: input.runtimeRegistry,
    providerErrorPrefix: 'GENERATION_V2_OLLAMA_IPC',
    channels: {
      initial: 'generation-v2:ollama:chat:initial',
      retry: 'generation-v2:ollama:chat:retry',
      regenerate: 'generation-v2:ollama:chat:regenerate',
      editResend: 'generation-v2:ollama:chat:edit-resend',
      abort: 'generation-v2:ollama:chat:abort',
      projection: 'generation-v2:ollama:projection',
    },
  })
}
