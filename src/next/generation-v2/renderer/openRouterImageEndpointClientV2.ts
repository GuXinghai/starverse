export type OpenRouterImageEndpointCandidateClientV2 = Readonly<{
  providerName: string
  providerTag: string
  providerSlug: string
  bound: boolean
  eligible: boolean
  issues: readonly Readonly<{ semanticPath: string; code: string; wireKey?: string }>[]
  allowedPassthroughParameters: readonly string[]
}>

export type OpenRouterImageEndpointSelectionClientStateV2 = Readonly<{
  modelId: string
  credentialScopeId: string
  descriptorRowGeneration: number
  endpointSetRevision: string
  fetchedAtMs: number
  settings: Readonly<{ refreshAfterMs: number; hardExpireAfterMs: number; revision: number }>
  binding: null | Readonly<{
    providerTag: string
    providerSlug: string
    selectedBy: 'user' | 'sole_eligible'
    bindingGeneration: number
  }>
  decision: string
  candidates: readonly OpenRouterImageEndpointCandidateClientV2[]
}>

type Result<T> = Readonly<{ ok: true; value: T }> | Readonly<{ ok: false; code: string }>

function bridge() {
  const value = window.generationV2?.openRouter.images
  if (!value) throw new Error('GENERATION_V2_OPENROUTER_IMAGE_ENDPOINT_BRIDGE_UNAVAILABLE')
  return value
}

function unwrap<T>(value: unknown): T {
  if (!value || typeof value !== 'object' || Array.isArray(value)) {
    throw new Error('GENERATION_V2_OPENROUTER_IMAGE_ENDPOINT_RESPONSE_INVALID')
  }
  const result = value as Result<T>
  if (!result.ok) throw new Error(result.code || 'GENERATION_V2_OPENROUTER_IMAGE_ENDPOINT_COMMAND_FAILED')
  return result.value
}

export async function getOpenRouterImageEndpointSelectionV2(payload: Readonly<{
  modelId: string
  semanticIntent: unknown
}>): Promise<OpenRouterImageEndpointSelectionClientStateV2> {
  return unwrap(await bridge().getEndpointSelection(payload))
}

export async function selectOpenRouterImageEndpointV2(payload: Readonly<{
  modelId: string
  semanticIntent: unknown
  providerTag: string
}>): Promise<OpenRouterImageEndpointSelectionClientStateV2> {
  return unwrap(await bridge().selectEndpoint(payload))
}

export async function updateOpenRouterImageEndpointSettingsV2(payload: Readonly<{
  refreshAfterMs: number
  hardExpireAfterMs: number
  expectedRevision: number
}>): Promise<Readonly<{ pair: Readonly<{ refreshAfterMs: number; hardExpireAfterMs: number }>; revision: number }>> {
  return unwrap(await bridge().updateEndpointSettings(payload))
}
