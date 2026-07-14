export type AnthropicDeveloperApiSurfaceIdV2 =
  | 'anthropic-messages-2023-06-01'
  | 'anthropic-models-2023-06-01'
  | 'anthropic-files-beta-2025-04-14'

type AnthropicEndpointOperationV2 =
  | 'create_message'
  | 'list_models'
  | 'get_model'
  | 'upload_file'
  | 'list_files'
  | 'get_file_metadata'
  | 'download_file'
  | 'delete_file'

export type AnthropicDeveloperApiSurfaceDefinitionV2 = Readonly<
  | {
    surfaceId: 'anthropic-messages-2023-06-01'
    codecKind: 'anthropic_messages_2023_06_01'
    endpointOperation: 'create_message'
    method: 'POST'
    relativePathTemplate: '/v1/messages'
    requestContentType: 'application/json'
    streamRequestPolicy: Readonly<{
      location: 'body'
      field: 'stream'
      requiredValue: true
      responseProtocol: 'named_sse'
      doneSentinel: 'forbidden'
    }>
    continuationFamily: 'ordered_native_content_blocks_with_signatures'
  }
  | {
    surfaceId: 'anthropic-models-2023-06-01'
    codecKind: 'anthropic_models_2023_06_01'
    endpointOperations: readonly Readonly<
      | { operation: 'list_models'; method: 'GET'; relativePathTemplate: '/v1/models'; requestKind: 'none'; responseKind: 'json' }
      | { operation: 'get_model'; method: 'GET'; relativePathTemplate: '/v1/models/{model_id}'; requestKind: 'none'; responseKind: 'json' }
    >[]
  }
  | {
    surfaceId: 'anthropic-files-beta-2025-04-14'
    codecKind: 'anthropic_files_beta_2025_04_14'
    requiredFeatureHeader: Readonly<{
      name: 'anthropic-beta'
      value: 'files-api-2025-04-14'
    }>
    endpointOperations: readonly Readonly<
      | { operation: 'upload_file'; method: 'POST'; relativePathTemplate: '/v1/files'; requestKind: 'multipart_form_data'; responseKind: 'json' }
      | { operation: 'list_files'; method: 'GET'; relativePathTemplate: '/v1/files'; requestKind: 'none'; responseKind: 'json' }
      | { operation: 'get_file_metadata'; method: 'GET'; relativePathTemplate: '/v1/files/{file_id}'; requestKind: 'none'; responseKind: 'json' }
      | { operation: 'download_file'; method: 'GET'; relativePathTemplate: '/v1/files/{file_id}/content'; requestKind: 'none'; responseKind: 'binary' }
      | { operation: 'delete_file'; method: 'DELETE'; relativePathTemplate: '/v1/files/{file_id}'; requestKind: 'none'; responseKind: 'json' }
    >[]
  }
>

type AnthropicDeveloperApiRegistrySurfaceCommonV2 = Readonly<{
  providerFamilyContractId: 'anthropic-developer-api-2023-06-01'
  apiOrigin: 'https://api.anthropic.com'
  auth: Readonly<{ kind: 'header'; name: 'x-api-key' }>
  apiVersionHeader: Readonly<{ name: 'anthropic-version'; value: '2023-06-01' }>
}>

export type AnthropicMessagesRegistrySurfaceV2 = Readonly<
  Extract<AnthropicDeveloperApiSurfaceDefinitionV2, {
    surfaceId: 'anthropic-messages-2023-06-01'
  }> & AnthropicDeveloperApiRegistrySurfaceCommonV2 & {
    kind: 'anthropic_messages'
  }
>

export type AnthropicDeveloperApiContractV2 = Readonly<{
  classification: 'reviewed_provider_family_definition'
  executionAuthority: 'none'
  implementationStatus: 'definition_only'
  providerId: 'anthropic'
  contractFamilyId: 'anthropic-developer-api-2023-06-01'
  apiOrigin: 'https://api.anthropic.com'
  auth: Readonly<{ kind: 'header'; name: 'x-api-key' }>
  apiVersionHeader: Readonly<{ name: 'anthropic-version'; value: '2023-06-01' }>
  surfaces: readonly AnthropicDeveloperApiSurfaceDefinitionV2[]
  evidence: Readonly<{
    verifiedAt: '2026-07-15'
    provenanceUrls: readonly string[]
  }>
}>

export class AnthropicDeveloperApiContractV2Error extends Error {
  constructor(readonly code:
    | 'GENERATION_V2_ANTHROPIC_CONTRACT_INVALID'
    | 'GENERATION_V2_ANTHROPIC_ENDPOINT_INPUT_INVALID'
    | 'GENERATION_V2_ANTHROPIC_ENDPOINT_UNKNOWN') {
    super(code)
    this.name = 'AnthropicDeveloperApiContractV2Error'
  }
}

const messagesSurface = Object.freeze({
  surfaceId: 'anthropic-messages-2023-06-01',
  codecKind: 'anthropic_messages_2023_06_01',
  endpointOperation: 'create_message',
  method: 'POST',
  relativePathTemplate: '/v1/messages',
  requestContentType: 'application/json',
  streamRequestPolicy: Object.freeze({
    location: 'body',
    field: 'stream',
    requiredValue: true,
    responseProtocol: 'named_sse',
    doneSentinel: 'forbidden',
  }),
  continuationFamily: 'ordered_native_content_blocks_with_signatures',
} as const)

const modelsSurface = Object.freeze({
  surfaceId: 'anthropic-models-2023-06-01',
  codecKind: 'anthropic_models_2023_06_01',
  endpointOperations: Object.freeze([
    Object.freeze({ operation: 'list_models', method: 'GET', relativePathTemplate: '/v1/models', requestKind: 'none', responseKind: 'json' }),
    Object.freeze({ operation: 'get_model', method: 'GET', relativePathTemplate: '/v1/models/{model_id}', requestKind: 'none', responseKind: 'json' }),
  ]),
} as const)

const filesSurface = Object.freeze({
  surfaceId: 'anthropic-files-beta-2025-04-14',
  codecKind: 'anthropic_files_beta_2025_04_14',
  requiredFeatureHeader: Object.freeze({ name: 'anthropic-beta', value: 'files-api-2025-04-14' }),
  endpointOperations: Object.freeze([
    Object.freeze({ operation: 'upload_file', method: 'POST', relativePathTemplate: '/v1/files', requestKind: 'multipart_form_data', responseKind: 'json' }),
    Object.freeze({ operation: 'list_files', method: 'GET', relativePathTemplate: '/v1/files', requestKind: 'none', responseKind: 'json' }),
    Object.freeze({ operation: 'get_file_metadata', method: 'GET', relativePathTemplate: '/v1/files/{file_id}', requestKind: 'none', responseKind: 'json' }),
    Object.freeze({ operation: 'download_file', method: 'GET', relativePathTemplate: '/v1/files/{file_id}/content', requestKind: 'none', responseKind: 'binary' }),
    Object.freeze({ operation: 'delete_file', method: 'DELETE', relativePathTemplate: '/v1/files/{file_id}', requestKind: 'none', responseKind: 'json' }),
  ]),
} as const)

const contract = Object.freeze({
  classification: 'reviewed_provider_family_definition',
  executionAuthority: 'none',
  implementationStatus: 'definition_only',
  providerId: 'anthropic',
  contractFamilyId: 'anthropic-developer-api-2023-06-01',
  apiOrigin: 'https://api.anthropic.com',
  auth: Object.freeze({ kind: 'header', name: 'x-api-key' }),
  apiVersionHeader: Object.freeze({ name: 'anthropic-version', value: '2023-06-01' }),
  surfaces: Object.freeze([messagesSurface, modelsSurface, filesSurface]),
  evidence: Object.freeze({
    verifiedAt: '2026-07-15',
    provenanceUrls: Object.freeze([
      'https://platform.claude.com/docs/en/api/overview',
      'https://platform.claude.com/docs/en/api/versioning',
      'https://platform.claude.com/docs/en/api/messages/create',
      'https://platform.claude.com/docs/en/build-with-claude/streaming',
      'https://platform.claude.com/docs/en/api/models',
      'https://platform.claude.com/docs/en/api/beta/files',
      'https://platform.claude.com/docs/en/build-with-claude/files',
    ]),
  }),
} as const satisfies AnthropicDeveloperApiContractV2)

const reviewedContracts = new WeakSet<object>([contract])
const surfacesById = new Map(contract.surfaces.map((surface) => [surface.surfaceId, surface]))
const messagesRegistrySurface: AnthropicMessagesRegistrySurfaceV2 = Object.freeze({
  providerFamilyContractId: contract.contractFamilyId,
  apiOrigin: contract.apiOrigin,
  auth: contract.auth,
  apiVersionHeader: contract.apiVersionHeader,
  ...messagesSurface,
  kind: 'anthropic_messages',
})
const RESOURCE_ID_PATTERN = /^[A-Za-z0-9][A-Za-z0-9._:-]{0,255}$/u

function decodeEndpointInput(value: unknown): Readonly<{
  surfaceId: AnthropicDeveloperApiSurfaceIdV2
  operation: AnthropicEndpointOperationV2
  resourceId?: string
}> {
  if (!value || typeof value !== 'object' || Array.isArray(value) || Object.getPrototypeOf(value) !== Object.prototype) {
    throw new AnthropicDeveloperApiContractV2Error('GENERATION_V2_ANTHROPIC_ENDPOINT_INPUT_INVALID')
  }
  const descriptors = Object.getOwnPropertyDescriptors(value)
  const expected = descriptors.resourceId ? ['surfaceId', 'operation', 'resourceId'] : ['surfaceId', 'operation']
  if (Reflect.ownKeys(value).some((key) => typeof key !== 'string') ||
      Object.keys(descriptors).sort().join('\0') !== expected.sort().join('\0') ||
      Object.values(descriptors).some((descriptor) => !descriptor.enumerable || !('value' in descriptor)) ||
      typeof descriptors.surfaceId?.value !== 'string' || typeof descriptors.operation?.value !== 'string' ||
      (descriptors.resourceId && (typeof descriptors.resourceId.value !== 'string' ||
        !RESOURCE_ID_PATTERN.test(descriptors.resourceId.value)))) {
    throw new AnthropicDeveloperApiContractV2Error('GENERATION_V2_ANTHROPIC_ENDPOINT_INPUT_INVALID')
  }
  return Object.freeze({
    surfaceId: descriptors.surfaceId.value as AnthropicDeveloperApiSurfaceIdV2,
    operation: descriptors.operation.value as AnthropicEndpointOperationV2,
    ...(descriptors.resourceId ? { resourceId: descriptors.resourceId.value } : {}),
  })
}

export function readAnthropicDeveloperApiContractV2(): AnthropicDeveloperApiContractV2 {
  return contract
}

export function isAnthropicDeveloperApiContractV2(value: unknown): value is AnthropicDeveloperApiContractV2 {
  return Boolean(value && typeof value === 'object' && reviewedContracts.has(value))
}

export function readAnthropicMessagesRegistrySurfaceV2(): AnthropicMessagesRegistrySurfaceV2 {
  return messagesRegistrySurface
}

export function resolveAnthropicDeveloperApiEndpointV2(
  providerContract: AnthropicDeveloperApiContractV2,
  value: unknown,
): Readonly<{
  surface: AnthropicDeveloperApiSurfaceDefinitionV2
  operation: AnthropicEndpointOperationV2
  method: 'GET' | 'POST' | 'DELETE'
  url: string
  requiredFeatureHeader?: Readonly<{ name: 'anthropic-beta'; value: 'files-api-2025-04-14' }>
}> {
  if (!isAnthropicDeveloperApiContractV2(providerContract)) {
    throw new AnthropicDeveloperApiContractV2Error('GENERATION_V2_ANTHROPIC_CONTRACT_INVALID')
  }
  const input = decodeEndpointInput(value)
  const surface = surfacesById.get(input.surfaceId)
  if (!surface) throw new AnthropicDeveloperApiContractV2Error('GENERATION_V2_ANTHROPIC_ENDPOINT_UNKNOWN')

  const endpoint = surface.surfaceId === 'anthropic-messages-2023-06-01'
    ? (input.operation === surface.endpointOperation ? surface : undefined)
    : surface.endpointOperations.find((candidate) => candidate.operation === input.operation)
  if (!endpoint) throw new AnthropicDeveloperApiContractV2Error('GENERATION_V2_ANTHROPIC_ENDPOINT_UNKNOWN')
  const needsResourceId = endpoint.relativePathTemplate.includes('{model_id}') ||
    endpoint.relativePathTemplate.includes('{file_id}')
  if (needsResourceId !== Boolean(input.resourceId)) {
    throw new AnthropicDeveloperApiContractV2Error('GENERATION_V2_ANTHROPIC_ENDPOINT_INPUT_INVALID')
  }
  const relativePath = input.resourceId
    ? endpoint.relativePathTemplate
      .replace('{model_id}', encodeURIComponent(input.resourceId))
      .replace('{file_id}', encodeURIComponent(input.resourceId))
    : endpoint.relativePathTemplate
  return Object.freeze({
    surface,
    operation: input.operation,
    method: endpoint.method,
    url: `${providerContract.apiOrigin}${relativePath}`,
    ...(surface.surfaceId === 'anthropic-files-beta-2025-04-14'
      ? { requiredFeatureHeader: surface.requiredFeatureHeader }
      : {}),
  })
}
