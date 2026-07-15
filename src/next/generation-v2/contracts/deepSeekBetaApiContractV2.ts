export type DeepSeekBetaApiSurfaceIdV2 = 'deepseek-beta-chat-prefix-v1' | 'deepseek-beta-fim-v1'

export type DeepSeekBetaApiContractV2 = Readonly<{
  classification: 'reviewed_provider_family_definition'
  executionAuthority: 'none'
  implementationStatus: 'definition_only'
  providerId: 'deepseek'
  contractFamilyId: 'deepseek-beta-api-v1'
  apiOrigin: 'https://api.deepseek.com/beta'
  auth: Readonly<{ kind: 'header'; name: 'Authorization'; scheme: 'Bearer' }>
  selectionPolicy: Readonly<{
    explicitSelectionRequired: true
    stableMaySwitchToBeta: false
    runtimeFallback: 'forbidden'
  }>
  surfaces: readonly Readonly<
    | {
      surfaceId: 'deepseek-beta-chat-prefix-v1'
      codecKind: 'deepseek_beta_chat_prefix_v1'
      method: 'POST'
      relativePathTemplate: '/chat/completions'
      requiredSemantic: 'last_assistant_message_prefix_true'
    }
    | {
      surfaceId: 'deepseek-beta-fim-v1'
      codecKind: 'deepseek_beta_fim_v1'
      method: 'POST'
      relativePathTemplate: '/completions'
      maxOutputTokens: 4096
    }
  >[]
  evidence: Readonly<{ verifiedAt: '2026-07-15'; provenanceUrls: readonly string[] }>
}>

export class DeepSeekBetaApiContractV2Error extends Error {
  constructor(readonly code:
    | 'GENERATION_V2_DEEPSEEK_BETA_CONTRACT_INVALID'
    | 'GENERATION_V2_DEEPSEEK_BETA_ENDPOINT_INPUT_INVALID'
    | 'GENERATION_V2_DEEPSEEK_BETA_ENDPOINT_UNKNOWN') {
    super(code)
    this.name = 'DeepSeekBetaApiContractV2Error'
  }
}

const chatPrefixSurface = Object.freeze({
  surfaceId: 'deepseek-beta-chat-prefix-v1',
  codecKind: 'deepseek_beta_chat_prefix_v1',
  method: 'POST',
  relativePathTemplate: '/chat/completions',
  requiredSemantic: 'last_assistant_message_prefix_true',
} as const)
const fimSurface = Object.freeze({
  surfaceId: 'deepseek-beta-fim-v1',
  codecKind: 'deepseek_beta_fim_v1',
  method: 'POST',
  relativePathTemplate: '/completions',
  maxOutputTokens: 4096,
} as const)
const contract = Object.freeze({
  classification: 'reviewed_provider_family_definition',
  executionAuthority: 'none',
  implementationStatus: 'definition_only',
  providerId: 'deepseek',
  contractFamilyId: 'deepseek-beta-api-v1',
  apiOrigin: 'https://api.deepseek.com/beta',
  auth: Object.freeze({ kind: 'header', name: 'Authorization', scheme: 'Bearer' }),
  selectionPolicy: Object.freeze({
    explicitSelectionRequired: true, stableMaySwitchToBeta: false, runtimeFallback: 'forbidden',
  }),
  surfaces: Object.freeze([chatPrefixSurface, fimSurface]),
  evidence: Object.freeze({
    verifiedAt: '2026-07-15',
    provenanceUrls: Object.freeze([
      'https://api-docs.deepseek.com/guides/chat_prefix_completion/',
      'https://api-docs.deepseek.com/guides/fim_completion/',
    ]),
  }),
} as const satisfies DeepSeekBetaApiContractV2)

const reviewedContracts = new WeakSet<object>([contract])
const surfacesById = new Map(contract.surfaces.map((surface) => [surface.surfaceId, surface]))

export function readDeepSeekBetaApiContractV2(): DeepSeekBetaApiContractV2 {
  return contract
}

export function isDeepSeekBetaApiContractV2(value: unknown): value is DeepSeekBetaApiContractV2 {
  return Boolean(value && typeof value === 'object' && reviewedContracts.has(value))
}

export function resolveDeepSeekBetaApiEndpointV2(
  providerContract: DeepSeekBetaApiContractV2,
  input: unknown,
): Readonly<{ surface: DeepSeekBetaApiContractV2['surfaces'][number]; method: 'POST'; url: string }> {
  if (!isDeepSeekBetaApiContractV2(providerContract)) {
    throw new DeepSeekBetaApiContractV2Error('GENERATION_V2_DEEPSEEK_BETA_CONTRACT_INVALID')
  }
  if (!input || typeof input !== 'object' || Array.isArray(input) || Object.getPrototypeOf(input) !== Object.prototype) {
    throw new DeepSeekBetaApiContractV2Error('GENERATION_V2_DEEPSEEK_BETA_ENDPOINT_INPUT_INVALID')
  }
  const descriptors = Object.getOwnPropertyDescriptors(input)
  if (Reflect.ownKeys(input).some((key) => typeof key !== 'string') || Object.keys(descriptors).join('\0') !== 'surfaceId' ||
      !descriptors.surfaceId.enumerable || !('value' in descriptors.surfaceId) || typeof descriptors.surfaceId.value !== 'string') {
    throw new DeepSeekBetaApiContractV2Error('GENERATION_V2_DEEPSEEK_BETA_ENDPOINT_INPUT_INVALID')
  }
  const surface = surfacesById.get(descriptors.surfaceId.value as DeepSeekBetaApiSurfaceIdV2)
  if (!surface) throw new DeepSeekBetaApiContractV2Error('GENERATION_V2_DEEPSEEK_BETA_ENDPOINT_UNKNOWN')
  return Object.freeze({ surface, method: 'POST', url: `${providerContract.apiOrigin}${surface.relativePathTemplate}` })
}
