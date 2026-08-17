import type { Epoch2CommittedRuntime } from '../data-epoch/epoch2CommittedBootstrap'
import type { RegisterInvoke } from './types'
import {
  decodeGenerationCapabilityResolutionRequestV2,
  type GenerationCapabilityResolutionResultV2,
} from '../../src/next/generation-v2/capability/capabilityResolutionV2'
import {
  createGenerationV2CapabilityResolutionService,
  GenerationV2CapabilityResolutionServiceError,
} from '../services/generationV2CapabilityResolutionService'

export const GENERATION_V2_CAPABILITY_IPC_CHANNELS = Object.freeze([
  'generation-v2:capabilities:resolve',
] as const)

function publicCode(error: unknown): string {
  if (error instanceof GenerationV2CapabilityResolutionServiceError) return error.code
  if (error && typeof error === 'object' && 'code' in error &&
      typeof (error as { code?: unknown }).code === 'string') return (error as { code: string }).code
  return 'GENERATION_V2_CAPABILITY_RESOLUTION_FAILED'
}

type Success = Readonly<{ ok: true; value: GenerationCapabilityResolutionResultV2 }>
type Failure = Readonly<{ ok: false; code: string }>

export function registerGenerationV2CapabilityIpc(input: Readonly<{
  registerInvoke: RegisterInvoke
  epoch2: Epoch2CommittedRuntime
}>): readonly string[] {
  const service = createGenerationV2CapabilityResolutionService({
    db: input.epoch2.database,
    credentialService: input.epoch2.credentialService,
    openAICompatibleCredentialService: input.epoch2.openAICompatibleCredentialService,
  })
  input.registerInvoke(GENERATION_V2_CAPABILITY_IPC_CHANNELS[0], async (_event: unknown, payload: unknown): Promise<Success | Failure> => {
    try {
      const request = decodeGenerationCapabilityResolutionRequestV2(payload)
      return Object.freeze({ ok: true as const, value: await service.resolve(request) })
    } catch (error) {
      return Object.freeze({ ok: false as const, code: publicCode(error) })
    }
  })
  return GENERATION_V2_CAPABILITY_IPC_CHANNELS
}
