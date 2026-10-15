export type DeepSeekStableApiSurfaceIdV2 =
  | 'deepseek-stable-chat-v1'
  | 'deepseek-stable-models-v1'

export type DeepSeekStableApiSurfaceDefinitionV2 = Readonly<
  | {
    surfaceId: 'deepseek-stable-chat-v1'
    codecKind: 'deepseek_stable_chat_v1'
    endpointOperation: 'create_chat_completion'
    method: 'POST'
    relativePathTemplate: '/chat/completions'
    requestContentType: 'application/json'
    streamRequestPolicy: Readonly<{
      location: 'body'
      field: 'stream'
      requiredValue: true
      responseProtocol: 'data_only_sse'
      doneSentinel: 'required'
    }>
    continuationFamily: 'ordered_native_chat_messages_with_reasoning_and_tools'
  }
  | {
    surfaceId: 'deepseek-stable-models-v1'
    codecKind: 'deepseek_stable_models_v1'
    endpointOperation: 'list_models'
    method: 'GET'
    relativePathTemplate: '/models'
    requestContentType: 'none'
    responseProtocol: 'json'
  }
>

export type DeepSeekStableChatRegistrySurfaceV2 = Readonly<
  Extract<DeepSeekStableApiSurfaceDefinitionV2, { surfaceId: 'deepseek-stable-chat-v1' }> & {
    kind: 'deepseek_stable_chat'
    providerFamilyContractId: 'deepseek-stable-api-v1'
    apiOrigin: 'https://api.deepseek.com'
    auth: Readonly<{ kind: 'header'; name: 'Authorization'; scheme: 'Bearer' }>
  }
>

export type DeepSeekStableApiContractV2 = Readonly<{
  classification: 'reviewed_provider_family_definition'
  executionAuthority: 'none'
  implementationStatus: 'definition_only'
  providerId: 'deepseek'
  contractFamilyId: 'deepseek-stable-api-v1'
  apiOrigin: 'https://api.deepseek.com'
  auth: Readonly<{ kind: 'header'; name: 'Authorization'; scheme: 'Bearer' }>
  betaPolicy: Readonly<{
    stableMayUseBetaOrigin: false
    automaticSwitch: 'forbidden'
  }>
  surfaces: readonly DeepSeekStableApiSurfaceDefinitionV2[]
  evidence: Readonly<{
    verifiedAt: '2026-07-15'
    provenanceUrls: readonly string[]
  }>
}>

export class DeepSeekStableApiContractV2Error extends Error {
  constructor(readonly code:
    | 'GENERATION_V2_DEEPSEEK_CONTRACT_INVALID'
    | 'GENERATION_V2_DEEPSEEK_ENDPOINT_INPUT_INVALID'
    | 'GENERATION_V2_DEEPSEEK_ENDPOINT_UNKNOWN') {
    super(code)
    this.name = 'DeepSeekStableApiContractV2Error'
  }
}

const chatSurface = Object.freeze({
  surfaceId: 'deepseek-stable-chat-v1',
  codecKind: 'deepseek_stable_chat_v1',
  endpointOperation: 'create_chat_completion',
  method: 'POST',
  relativePathTemplate: '/chat/completions',
  requestContentType: 'application/json',
  streamRequestPolicy: Object.freeze({
    location: 'body',
    field: 'stream',
    requiredValue: true,
    responseProtocol: 'data_only_sse',
    doneSentinel: 'required',
  }),
  continuationFamily: 'ordered_native_chat_messages_with_reasoning_and_tools',
} as const)

const modelsSurface = Object.freeze({
  surfaceId: 'deepseek-stable-models-v1',
  codecKind: 'deepseek_stable_models_v1',
  endpointOperation: 'list_models',
  method: 'GET',
  relativePathTemplate: '/models',
  requestContentType: 'none',
  responseProtocol: 'json',
} as const)

const contract = Object.freeze({
  classification: 'reviewed_provider_family_definition',
  executionAuthority: 'none',
  implementationStatus: 'definition_only',
  providerId: 'deepseek',
  contractFamilyId: 'deepseek-stable-api-v1',
  apiOrigin: 'https://api.deepseek.com',
  auth: Object.freeze({ kind: 'header', name: 'Authorization', scheme: 'Bearer' }),
  betaPolicy: Object.freeze({ stableMayUseBetaOrigin: false, automaticSwitch: 'forbidden' }),
  surfaces: Object.freeze([chatSurface, modelsSurface]),
  evidence: Object.freeze({
    verifiedAt: '2026-07-15',
    provenanceUrls: Object.freeze([
      'https://api-docs.deepseek.com/api/create-chat-completion',
      'https://api-docs.deepseek.com/api/list-models',
      'https://api-docs.deepseek.com/guides/thinking_mode/',
      'https://api-docs.deepseek.com/guides/tool_calls/',
    ]),
  }),
} as const satisfies DeepSeekStableApiContractV2)

const reviewedContracts = new WeakSet<object>([contract])
const surfacesById = new Map(contract.surfaces.map((surface) => [surface.surfaceId, surface]))
const chatRegistrySurface: DeepSeekStableChatRegistrySurfaceV2 = Object.freeze({
  providerFamilyContractId: contract.contractFamilyId,
  apiOrigin: contract.apiOrigin,
  auth: contract.auth,
  ...chatSurface,
  kind: 'deepseek_stable_chat',
})

export function readDeepSeekStableApiContractV2(): DeepSeekStableApiContractV2 {
  return contract
}

export function isDeepSeekStableApiContractV2(value: unknown): value is DeepSeekStableApiContractV2 {
  return Boolean(value && typeof value === 'object' && reviewedContracts.has(value))
}

export function readDeepSeekStableChatRegistrySurfaceV2(): DeepSeekStableChatRegistrySurfaceV2 {
  return chatRegistrySurface
}

export function resolveDeepSeekStableApiEndpointV2(
  providerContract: DeepSeekStableApiContractV2,
  input: unknown,
): Readonly<{ surface: DeepSeekStableApiSurfaceDefinitionV2; method: 'GET' | 'POST'; url: string }> {
  if (!isDeepSeekStableApiContractV2(providerContract)) {
    throw new DeepSeekStableApiContractV2Error('GENERATION_V2_DEEPSEEK_CONTRACT_INVALID')
  }
  if (!input || typeof input !== 'object' || Array.isArray(input) || Object.getPrototypeOf(input) !== Object.prototype) {
    throw new DeepSeekStableApiContractV2Error('GENERATION_V2_DEEPSEEK_ENDPOINT_INPUT_INVALID')
  }
  const descriptors = Object.getOwnPropertyDescriptors(input)
  if (Reflect.ownKeys(input).some((key) => typeof key !== 'string') ||
      Object.keys(descriptors).join('\0') !== 'surfaceId' ||
      !descriptors.surfaceId.enumerable || !('value' in descriptors.surfaceId) ||
      typeof descriptors.surfaceId.value !== 'string') {
    throw new DeepSeekStableApiContractV2Error('GENERATION_V2_DEEPSEEK_ENDPOINT_INPUT_INVALID')
  }
  const surface = surfacesById.get(descriptors.surfaceId.value as DeepSeekStableApiSurfaceIdV2)
  if (!surface) throw new DeepSeekStableApiContractV2Error('GENERATION_V2_DEEPSEEK_ENDPOINT_UNKNOWN')
  return Object.freeze({ surface, method: surface.method, url: `${providerContract.apiOrigin}${surface.relativePathTemplate}` })
}
