import type {
  GenerationCapabilityResolutionRequestV2,
  GenerationCapabilityResolutionResultV2,
} from '../capability/capabilityResolutionV2'

function record(value: unknown): value is Record<string, unknown> {
  return Boolean(value && typeof value === 'object' && !Array.isArray(value))
}

function failureCode(value: unknown): string {
  return record(value) && typeof value.code === 'string' && value.code.trim() === value.code
    ? value.code : 'GENERATION_V2_CAPABILITY_RESOLUTION_FAILED'
}

/** Renderer access to the one main-process capability resolver. */
export async function resolveGenerationV2Capabilities(
  request: GenerationCapabilityResolutionRequestV2,
): Promise<GenerationCapabilityResolutionResultV2> {
  const bridge = window.generationV2?.capabilities
  if (!bridge) throw new Error('GENERATION_V2_CAPABILITY_RESOLUTION_UNAVAILABLE')
  const response = await bridge.resolve(request)
  if (!record(response) || response.ok !== true || !record(response.value)) {
    throw new Error(failureCode(response))
  }
  const value = response.value as GenerationCapabilityResolutionResultV2
  if (!record(value.controlsProjection) || typeof value.controlsProjection.capabilityRevision !== 'string' ||
      value.controlsProjection.capabilityRevision.length === 0) {
    throw new Error('GENERATION_V2_CAPABILITY_RESOLUTION_RESPONSE_INVALID')
  }
  return value
}
