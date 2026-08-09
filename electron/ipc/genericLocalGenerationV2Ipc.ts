import type { RegisterInvoke } from './types'
import type { GenerationStreamProjectionSinkV2 } from '../services/generationStreamProjectionV2'
import type { createGenericLocalOpenAIChatGenerationV2Runtime } from '../services/genericLocalOpenAIChatGenerationV2Runtime'
import { registerTextGenerationV2IpcCore } from './textGenerationV2IpcCore'
import type { GenerationOperationRuntimeRegistryV2 } from '../services/generationOperationRuntimeRegistryV2'

export function registerGenericLocalGenerationV2Ipc(input: Readonly<{ registerInvoke: RegisterInvoke;
  createRuntime: (sink: GenerationStreamProjectionSinkV2) => ReturnType<typeof createGenericLocalOpenAIChatGenerationV2Runtime>;
  runtimeRegistry?: GenerationOperationRuntimeRegistryV2 }>): readonly string[] {
  return registerTextGenerationV2IpcCore({ registerInvoke: input.registerInvoke, createRuntime: input.createRuntime,
    runtimeRegistry: input.runtimeRegistry,
    providerErrorPrefix: 'GENERATION_V2_GENERIC_LOCAL_IPC',
    channels: Object.freeze({ initial: 'generation-v2:generic-local:openai-chat:initial', retry: 'generation-v2:generic-local:openai-chat:retry',
      regenerate: 'generation-v2:generic-local:openai-chat:regenerate', editResend: 'generation-v2:generic-local:openai-chat:edit-resend',
      abort: 'generation-v2:generic-local:openai-chat:abort', projection: 'generation-v2:generic-local:projection' }) })
}
