export type OpenRouterChatApiSurfaceDefinitionV2 = Readonly<{
  surfaceId: 'openrouter-chat-completions-v1'
  codecKind: 'openrouter_chat_completions_v1'
  endpointOperation: 'create_chat_completion'
  method: 'POST'
  relativePathTemplate: '/api/v1/chat/completions'
  requestContentType: 'application/json'
  streamRequestPolicy: Readonly<{
    location: 'body'
    field: 'stream'
    requiredValue: true
    responseProtocol: 'data_only_sse'
    commentsMayAppear: true
    commentPolicy: 'ignore'
    doneSentinel: 'required'
  }>
  continuationFamily: 'ordered_native_chat_messages_with_reasoning_details_and_tools'
}>

export type OpenRouterChatRegistrySurfaceV2 = Readonly<OpenRouterChatApiSurfaceDefinitionV2 & {
  kind: 'openrouter_chat'
  providerFamilyContractId: 'openrouter-chat-api-v1'
  apiOrigin: 'https://openrouter.ai'
  auth: Readonly<{ kind: 'header'; name: 'Authorization'; scheme: 'Bearer' }>
}>

export type OpenRouterChatApiContractV2 = Readonly<{
  classification: 'reviewed_provider_family_definition'
  executionAuthority: 'none'
  implementationStatus: 'definition_only'
  providerId: 'openrouter'
  contractFamilyId: 'openrouter-chat-api-v1'
  apiOrigin: 'https://openrouter.ai'
  auth: Readonly<{ kind: 'header'; name: 'Authorization'; scheme: 'Bearer' }>
  surfaces: readonly [OpenRouterChatApiSurfaceDefinitionV2]
  evidence: Readonly<{
    verifiedAt: '2026-07-15'
    provenanceUrls: readonly string[]
  }>
}>

export class OpenRouterChatApiContractV2Error extends Error {
  constructor(readonly code:
    | 'GENERATION_V2_OPENROUTER_CHAT_CONTRACT_INVALID'
    | 'GENERATION_V2_OPENROUTER_CHAT_ENDPOINT_INPUT_INVALID'
    | 'GENERATION_V2_OPENROUTER_CHAT_ENDPOINT_UNKNOWN') {
    super(code)
    this.name = 'OpenRouterChatApiContractV2Error'
  }
}

const chatSurface = Object.freeze({
  surfaceId: 'openrouter-chat-completions-v1',
  codecKind: 'openrouter_chat_completions_v1',
  endpointOperation: 'create_chat_completion',
  method: 'POST',
  relativePathTemplate: '/api/v1/chat/completions',
  requestContentType: 'application/json',
  streamRequestPolicy: Object.freeze({
    location: 'body',
    field: 'stream',
    requiredValue: true,
    responseProtocol: 'data_only_sse',
    commentsMayAppear: true,
    commentPolicy: 'ignore',
    doneSentinel: 'required',
  }),
  continuationFamily: 'ordered_native_chat_messages_with_reasoning_details_and_tools',
} as const satisfies OpenRouterChatApiSurfaceDefinitionV2)

const contract = Object.freeze({
  classification: 'reviewed_provider_family_definition',
  executionAuthority: 'none',
  implementationStatus: 'definition_only',
  providerId: 'openrouter',
  contractFamilyId: 'openrouter-chat-api-v1',
  apiOrigin: 'https://openrouter.ai',
  auth: Object.freeze({ kind: 'header', name: 'Authorization', scheme: 'Bearer' }),
  surfaces: Object.freeze([chatSurface]),
  evidence: Object.freeze({
    verifiedAt: '2026-07-15',
    provenanceUrls: Object.freeze([
      'https://openrouter.ai/docs/api/reference/overview',
      'https://openrouter.ai/docs/api/reference/authentication',
      'https://openrouter.ai/docs/api/reference/streaming',
      'https://openrouter.ai/docs/api/reference/errors-and-debugging',
      'https://openrouter.ai/docs/guides/best-practices/reasoning-tokens',
    ]),
  }),
} as const satisfies OpenRouterChatApiContractV2)

const reviewedContracts = new WeakSet<object>([contract])
const registrySurface: OpenRouterChatRegistrySurfaceV2 = Object.freeze({
  providerFamilyContractId: contract.contractFamilyId,
  apiOrigin: contract.apiOrigin,
  auth: contract.auth,
  ...chatSurface,
  kind: 'openrouter_chat',
})

export function readOpenRouterChatApiContractV2(): OpenRouterChatApiContractV2 {
  return contract
}

export function isOpenRouterChatApiContractV2(value: unknown): value is OpenRouterChatApiContractV2 {
  return Boolean(value && typeof value === 'object' && reviewedContracts.has(value))
}

export function readOpenRouterChatRegistrySurfaceV2(): OpenRouterChatRegistrySurfaceV2 {
  return registrySurface
}

export function resolveOpenRouterChatApiEndpointV2(
  providerContract: OpenRouterChatApiContractV2,
  input: unknown,
): Readonly<{ surface: OpenRouterChatApiSurfaceDefinitionV2; method: 'POST'; url: string }> {
  if (!isOpenRouterChatApiContractV2(providerContract)) {
    throw new OpenRouterChatApiContractV2Error('GENERATION_V2_OPENROUTER_CHAT_CONTRACT_INVALID')
  }
  if (!input || typeof input !== 'object' || Array.isArray(input) || Object.getPrototypeOf(input) !== Object.prototype) {
    throw new OpenRouterChatApiContractV2Error('GENERATION_V2_OPENROUTER_CHAT_ENDPOINT_INPUT_INVALID')
  }
  const descriptors = Object.getOwnPropertyDescriptors(input)
  if (Reflect.ownKeys(input).some((key) => typeof key !== 'string') ||
      Object.keys(descriptors).join('\0') !== 'surfaceId' ||
      !descriptors.surfaceId.enumerable || !('value' in descriptors.surfaceId) ||
      typeof descriptors.surfaceId.value !== 'string') {
    throw new OpenRouterChatApiContractV2Error('GENERATION_V2_OPENROUTER_CHAT_ENDPOINT_INPUT_INVALID')
  }
  if (descriptors.surfaceId.value !== chatSurface.surfaceId) {
    throw new OpenRouterChatApiContractV2Error('GENERATION_V2_OPENROUTER_CHAT_ENDPOINT_UNKNOWN')
  }
  return Object.freeze({
    surface: chatSurface,
    method: chatSurface.method,
    url: `${providerContract.apiOrigin}${chatSurface.relativePathTemplate}`,
  })
}
