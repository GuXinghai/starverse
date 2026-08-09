export type GeminiDeveloperApiSurfaceIdV2 =
  | 'gemini-generate-content-v1beta'
  | 'gemini-interactions-v1beta'
  | 'gemini-models-v1beta'

export type GeminiDeveloperApiSurfaceDefinitionV2 = Readonly<
  | {
    surfaceId: 'gemini-generate-content-v1beta'
    codecKind: 'gemini_generate_content_v1beta'
    method: 'POST'
    responseProtocol: 'sse'
    relativePathTemplate: '/models/{model}:streamGenerateContent'
    fixedQuery: Readonly<{ alt: 'sse' }>
    continuationFamily: 'candidate_parts_thought_signatures_tool_calls'
  }
  | {
    surfaceId: 'gemini-interactions-v1beta'
    codecKind: 'gemini_interactions_v1beta'
    method: 'POST'
    relativePathTemplate: '/interactions'
    fixedQuery: Readonly<Record<never, never>>
    streamRequestPolicy: Readonly<{
      location: 'body'
      field: 'stream'
      requiredValue: true
      responseProtocol: 'sse'
      doneSentinel: '[DONE]'
    }>
    statePolicy: Readonly<{
      store: false
      previousInteractionId: 'forbidden'
      continuation: 'client_managed_full_native_steps'
    }>
    continuationFamily: 'interaction_id_and_native_steps'
  }
  | {
    surfaceId: 'gemini-models-v1beta'
    codecKind: 'gemini_models_v1beta'
    method: 'GET'
    relativePathTemplate: '/models'
    fixedQuery: Readonly<Record<never, never>>
    purpose: 'credential_scoped_model_visibility_only'
  }
>

type GeminiDeveloperApiRegistrySurfaceCommonV2 = Readonly<{
  providerFamilyContractId: 'gemini-developer-api-v1beta'
  apiOrigin: 'https://generativelanguage.googleapis.com'
  apiVersion: 'v1beta'
  auth: Readonly<{
    kind: 'header'
    name: 'x-goog-api-key'
  }>
}>

export type GeminiDeveloperApiRegistrySurfaceV2 = Readonly<
  | (Extract<GeminiDeveloperApiSurfaceDefinitionV2, {
    surfaceId: 'gemini-generate-content-v1beta'
  }> & GeminiDeveloperApiRegistrySurfaceCommonV2 & {
    kind: 'gemini_generate_content'
  })
  | (Extract<GeminiDeveloperApiSurfaceDefinitionV2, {
    surfaceId: 'gemini-interactions-v1beta'
  }> & GeminiDeveloperApiRegistrySurfaceCommonV2 & {
    kind: 'gemini_interactions'
  })
  | (Extract<GeminiDeveloperApiSurfaceDefinitionV2, {
    surfaceId: 'gemini-models-v1beta'
  }> & GeminiDeveloperApiRegistrySurfaceCommonV2 & {
    kind: 'gemini_models'
  })
>

export type GeminiDeveloperApiContractV2 = Readonly<{
  classification: 'reviewed_provider_family_definition'
  executionAuthority: 'none'
  implementationStatus: 'definition_only'
  providerId: 'google_ai_studio'
  contractFamilyId: 'gemini-developer-api-v1beta'
  apiOrigin: 'https://generativelanguage.googleapis.com'
  apiVersion: 'v1beta'
  auth: Readonly<{
    kind: 'header'
    name: 'x-goog-api-key'
  }>
  surfaces: readonly GeminiDeveloperApiSurfaceDefinitionV2[]
  evidence: Readonly<{
    verifiedAt: '2026-07-18'
    interactionsOpenApiSha256: '8db3dc884fb96ae2fdeb8872e1666fae5bcde2e46fd03dd6878ad1481e403151'
    provenanceUrls: readonly string[]
  }>
}>

export class GeminiDeveloperApiContractV2Error extends Error {
  constructor(readonly code:
    | 'GENERATION_V2_GEMINI_CONTRACT_INVALID'
    | 'GENERATION_V2_GEMINI_ENDPOINT_INPUT_INVALID'
    | 'GENERATION_V2_GEMINI_SURFACE_UNKNOWN') {
    super(code)
    this.name = 'GeminiDeveloperApiContractV2Error'
  }
}

const generateContentSurface = Object.freeze({
  surfaceId: 'gemini-generate-content-v1beta',
  codecKind: 'gemini_generate_content_v1beta',
  method: 'POST',
  responseProtocol: 'sse',
  relativePathTemplate: '/models/{model}:streamGenerateContent',
  fixedQuery: Object.freeze({ alt: 'sse' }),
  continuationFamily: 'candidate_parts_thought_signatures_tool_calls',
} as const)

const interactionsSurface = Object.freeze({
  surfaceId: 'gemini-interactions-v1beta',
  codecKind: 'gemini_interactions_v1beta',
  method: 'POST',
  relativePathTemplate: '/interactions',
  fixedQuery: Object.freeze({}),
  streamRequestPolicy: Object.freeze({
    location: 'body',
    field: 'stream',
    requiredValue: true,
    responseProtocol: 'sse',
    doneSentinel: '[DONE]',
  }),
  statePolicy: Object.freeze({
    store: false,
    previousInteractionId: 'forbidden',
    continuation: 'client_managed_full_native_steps',
  }),
  continuationFamily: 'interaction_id_and_native_steps',
} as const)

const modelsSurface = Object.freeze({
  surfaceId: 'gemini-models-v1beta',
  codecKind: 'gemini_models_v1beta',
  method: 'GET',
  relativePathTemplate: '/models',
  fixedQuery: Object.freeze({}),
  purpose: 'credential_scoped_model_visibility_only',
} as const)

const contract = Object.freeze({
  classification: 'reviewed_provider_family_definition',
  executionAuthority: 'none',
  implementationStatus: 'definition_only',
  providerId: 'google_ai_studio',
  contractFamilyId: 'gemini-developer-api-v1beta',
  apiOrigin: 'https://generativelanguage.googleapis.com',
  apiVersion: 'v1beta',
  auth: Object.freeze({ kind: 'header', name: 'x-goog-api-key' }),
  surfaces: Object.freeze([generateContentSurface, interactionsSurface, modelsSurface]),
  evidence: Object.freeze({
    verifiedAt: '2026-07-18',
    interactionsOpenApiSha256: '8db3dc884fb96ae2fdeb8872e1666fae5bcde2e46fd03dd6878ad1481e403151',
    provenanceUrls: Object.freeze([
      'https://ai.google.dev/api/generate-content',
      'https://ai.google.dev/api/interactions-api',
      'https://ai.google.dev/static/api/interactions.openapi.json',
      'https://ai.google.dev/gemini-api/docs/api-versions',
    ]),
  }),
} as const satisfies GeminiDeveloperApiContractV2)

const reviewedContracts = new WeakSet<object>([contract])
const surfacesById = new Map(contract.surfaces.map((surface) => [surface.surfaceId, surface]))

function createRegistrySurface(
  surface: GeminiDeveloperApiSurfaceDefinitionV2,
): GeminiDeveloperApiRegistrySurfaceV2 {
  const common = {
    providerFamilyContractId: contract.contractFamilyId,
    apiOrigin: contract.apiOrigin,
    apiVersion: contract.apiVersion,
    auth: contract.auth,
  } as const
  switch (surface.surfaceId) {
    case 'gemini-generate-content-v1beta':
      return Object.freeze({ ...common, ...surface, kind: 'gemini_generate_content' })
    case 'gemini-interactions-v1beta':
      return Object.freeze({ ...common, ...surface, kind: 'gemini_interactions' })
    case 'gemini-models-v1beta':
      return Object.freeze({ ...common, ...surface, kind: 'gemini_models' })
  }
}

const registrySurfacesById = new Map<GeminiDeveloperApiSurfaceIdV2, GeminiDeveloperApiRegistrySurfaceV2>(
  contract.surfaces.map((surface) => [surface.surfaceId, createRegistrySurface(surface)]),
)
const MODEL_ID_PATTERN = /^[A-Za-z0-9][A-Za-z0-9._-]{0,127}$/u

function hasOnlyDataProperties(value: object, expected: readonly string[]): boolean {
  const descriptors = Object.getOwnPropertyDescriptors(value)
  return Reflect.ownKeys(value).every((key) => typeof key === 'string') &&
    Object.keys(descriptors).sort().join('\0') === [...expected].sort().join('\0') &&
    Object.values(descriptors).every((descriptor) => descriptor.enumerable && 'value' in descriptor)
}

export function readGeminiDeveloperApiContractV2(): GeminiDeveloperApiContractV2 {
  return contract
}

export function isGeminiDeveloperApiContractV2(value: unknown): value is GeminiDeveloperApiContractV2 {
  return Boolean(value && typeof value === 'object' && reviewedContracts.has(value))
}

export function readGeminiDeveloperApiRegistrySurfaceV2(
  surfaceId: GeminiDeveloperApiSurfaceIdV2,
): GeminiDeveloperApiRegistrySurfaceV2 {
  const surface = registrySurfacesById.get(surfaceId)
  if (!surface) throw new GeminiDeveloperApiContractV2Error('GENERATION_V2_GEMINI_SURFACE_UNKNOWN')
  return surface
}

export function resolveGeminiDeveloperApiEndpointV2(
  providerContract: GeminiDeveloperApiContractV2,
  input: unknown,
): Readonly<{
  surface: GeminiDeveloperApiSurfaceDefinitionV2
  url: string
}> {
  if (!isGeminiDeveloperApiContractV2(providerContract)) {
    throw new GeminiDeveloperApiContractV2Error('GENERATION_V2_GEMINI_CONTRACT_INVALID')
  }
  if (!input || typeof input !== 'object' || Array.isArray(input) || Object.getPrototypeOf(input) !== Object.prototype) {
    throw new GeminiDeveloperApiContractV2Error('GENERATION_V2_GEMINI_ENDPOINT_INPUT_INVALID')
  }
  const descriptors = Object.getOwnPropertyDescriptors(input)
  const surfaceIdDescriptor = descriptors.surfaceId
  if (!surfaceIdDescriptor?.enumerable || !('value' in surfaceIdDescriptor) ||
      typeof surfaceIdDescriptor.value !== 'string') {
    throw new GeminiDeveloperApiContractV2Error('GENERATION_V2_GEMINI_ENDPOINT_INPUT_INVALID')
  }
  const surfaceId = surfaceIdDescriptor.value
  const surface = surfacesById.get(surfaceId as GeminiDeveloperApiSurfaceIdV2)
  if (!surface) throw new GeminiDeveloperApiContractV2Error('GENERATION_V2_GEMINI_SURFACE_UNKNOWN')

  const expectsModel = surface.surfaceId === 'gemini-generate-content-v1beta'
  const expected = expectsModel ? ['surfaceId', 'modelId'] : ['surfaceId']
  if (!hasOnlyDataProperties(input, expected)) {
    throw new GeminiDeveloperApiContractV2Error('GENERATION_V2_GEMINI_ENDPOINT_INPUT_INVALID')
  }

  let relativePath: string = surface.relativePathTemplate
  if (expectsModel) {
    const modelId = descriptors.modelId.value
    if (typeof modelId !== 'string' || !MODEL_ID_PATTERN.test(modelId)) {
      throw new GeminiDeveloperApiContractV2Error('GENERATION_V2_GEMINI_ENDPOINT_INPUT_INVALID')
    }
    relativePath = surface.relativePathTemplate.replace('{model}', encodeURIComponent(modelId))
  }

  const url = new URL(`${providerContract.apiOrigin}/${providerContract.apiVersion}${relativePath}`)
  for (const [key, value] of Object.entries(surface.fixedQuery)) url.searchParams.set(key, value)
  return Object.freeze({ surface, url: url.toString() })
}
