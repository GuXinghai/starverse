export type OpenAIResponsesApiSurfaceIdV2 =
  | 'openai-responses-v1'
  | 'openai-models-v1'
  | 'openai-files-v1'

type OpenAIEndpointOperationV2 =
  | 'create_response'
  | 'list_models'
  | 'get_model'
  | 'upload_file'
  | 'list_files'
  | 'get_file_metadata'
  | 'download_file'
  | 'delete_file'

export type OpenAIResponsesApiSurfaceDefinitionV2 = Readonly<
  | {
    surfaceId: 'openai-responses-v1'
    codecKind: 'openai_responses_v1'
    endpointOperation: 'create_response'
    method: 'POST'
    relativePathTemplate: '/v1/responses'
    requestContentType: 'application/json'
    streamRequestPolicy: Readonly<{
      location: 'body'
      field: 'stream'
      requiredValue: true
      responseProtocol: 'typed_sse'
      doneSentinel: 'forbidden'
      terminalAuthority: 'response_terminal_event'
    }>
    approvedReasoningRequestFields: readonly ['effort', 'summary', 'mode', 'context']
    contextManagementStatus: 'approved'
    continuationPolicy: Readonly<{
      mode: 'client_managed_native_items'
      store: false
      requiredInclude: readonly ['reasoning.encrypted_content']
      legacyCompatibleInclude: readonly ['reasoning.encrypted_content']
      forbiddenRequestFields: readonly ['previous_response_id', 'conversation']
      replayPolicy: 'complete_ordered_output_items'
      assistantMessagePhasePolicy: 'preserve_when_present'
    }>
  }
  | {
    surfaceId: 'openai-models-v1'
    codecKind: 'openai_models_v1'
    endpointOperations: readonly Readonly<
      | { operation: 'list_models'; method: 'GET'; relativePathTemplate: '/v1/models'; requestKind: 'none'; responseKind: 'json' }
      | { operation: 'get_model'; method: 'GET'; relativePathTemplate: '/v1/models/{model_id}'; requestKind: 'none'; responseKind: 'json' }
    >[]
  }
  | {
    surfaceId: 'openai-files-v1'
    codecKind: 'openai_files_v1'
    endpointOperations: readonly Readonly<
      | { operation: 'upload_file'; method: 'POST'; relativePathTemplate: '/v1/files'; requestKind: 'multipart_form_data'; responseKind: 'json' }
      | { operation: 'list_files'; method: 'GET'; relativePathTemplate: '/v1/files'; requestKind: 'none'; responseKind: 'json' }
      | { operation: 'get_file_metadata'; method: 'GET'; relativePathTemplate: '/v1/files/{file_id}'; requestKind: 'none'; responseKind: 'json' }
      | { operation: 'download_file'; method: 'GET'; relativePathTemplate: '/v1/files/{file_id}/content'; requestKind: 'none'; responseKind: 'binary' }
      | { operation: 'delete_file'; method: 'DELETE'; relativePathTemplate: '/v1/files/{file_id}'; requestKind: 'none'; responseKind: 'json' }
    >[]
  }
>

export type OpenAIResponsesApiContractV2 = Readonly<{
  classification: 'reviewed_provider_family_definition'
  executionAuthority: 'none'
  implementationStatus: 'definition_only'
  providerId: 'openai_responses'
  contractFamilyId: 'openai-api-v1'
  apiOrigin: 'https://api.openai.com'
  auth: Readonly<{
    kind: 'bearer_header'
    name: 'Authorization'
    scheme: 'Bearer'
  }>
  surfaces: readonly OpenAIResponsesApiSurfaceDefinitionV2[]
  evidence: Readonly<{
    verifiedAt: '2026-07-22'
    provenanceUrls: readonly string[]
  }>
}>

export class OpenAIResponsesApiContractV2Error extends Error {
  constructor(readonly code:
    | 'GENERATION_V2_OPENAI_CONTRACT_INVALID'
    | 'GENERATION_V2_OPENAI_ENDPOINT_INPUT_INVALID'
    | 'GENERATION_V2_OPENAI_ENDPOINT_UNKNOWN') {
    super(code)
    this.name = 'OpenAIResponsesApiContractV2Error'
  }
}

const responsesSurface = Object.freeze({
  surfaceId: 'openai-responses-v1',
  codecKind: 'openai_responses_v1',
  endpointOperation: 'create_response',
  method: 'POST',
  relativePathTemplate: '/v1/responses',
  requestContentType: 'application/json',
  streamRequestPolicy: Object.freeze({
    location: 'body',
    field: 'stream',
    requiredValue: true,
    responseProtocol: 'typed_sse',
    doneSentinel: 'forbidden',
    terminalAuthority: 'response_terminal_event',
  }),
  approvedReasoningRequestFields: Object.freeze(['effort', 'summary', 'mode', 'context'] as const),
  contextManagementStatus: 'approved',
  continuationPolicy: Object.freeze({
    mode: 'client_managed_native_items',
    store: false,
    requiredInclude: Object.freeze(['reasoning.encrypted_content'] as const),
    legacyCompatibleInclude: Object.freeze(['reasoning.encrypted_content'] as const),
    forbiddenRequestFields: Object.freeze(['previous_response_id', 'conversation'] as const),
    replayPolicy: 'complete_ordered_output_items',
    assistantMessagePhasePolicy: 'preserve_when_present',
  }),
} as const)

const modelsSurface = Object.freeze({
  surfaceId: 'openai-models-v1',
  codecKind: 'openai_models_v1',
  endpointOperations: Object.freeze([
    Object.freeze({ operation: 'list_models', method: 'GET', relativePathTemplate: '/v1/models', requestKind: 'none', responseKind: 'json' }),
    Object.freeze({ operation: 'get_model', method: 'GET', relativePathTemplate: '/v1/models/{model_id}', requestKind: 'none', responseKind: 'json' }),
  ]),
} as const)

const filesSurface = Object.freeze({
  surfaceId: 'openai-files-v1',
  codecKind: 'openai_files_v1',
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
  providerId: 'openai_responses',
  contractFamilyId: 'openai-api-v1',
  apiOrigin: 'https://api.openai.com',
  auth: Object.freeze({ kind: 'bearer_header', name: 'Authorization', scheme: 'Bearer' }),
  surfaces: Object.freeze([responsesSurface, modelsSurface, filesSurface]),
  evidence: Object.freeze({
    verifiedAt: '2026-07-22',
    provenanceUrls: Object.freeze([
      'https://developers.openai.com/api/reference/resources/responses/methods/create',
      'https://developers.openai.com/api/reference/resources/responses/streaming-events',
      'https://developers.openai.com/api/docs/guides/conversation-state',
      'https://developers.openai.com/api/docs/guides/reasoning',
      'https://developers.openai.com/api/docs/guides/tools-web-search',
      'https://developers.openai.com/api/docs/guides/tools-image-generation',
      'https://developers.openai.com/api/reference/resources/models/methods/list',
      'https://developers.openai.com/api/reference/resources/models/methods/retrieve',
      'https://developers.openai.com/api/reference/resources/files/methods/list',
      'https://developers.openai.com/api/reference/resources/files/methods/create',
      'https://developers.openai.com/api/reference/resources/files/methods/retrieve',
      'https://developers.openai.com/api/reference/resources/files/methods/content',
      'https://developers.openai.com/api/reference/resources/files/methods/delete',
    ]),
  }),
} as const satisfies OpenAIResponsesApiContractV2)

const reviewedContracts = new WeakSet<object>([contract])
const surfacesById = new Map(contract.surfaces.map((surface) => [surface.surfaceId, surface]))
const RESOURCE_ID_PATTERN = /^[A-Za-z0-9][A-Za-z0-9._:-]{0,255}$/u

function decodeEndpointInput(value: unknown): Readonly<{
  surfaceId: OpenAIResponsesApiSurfaceIdV2
  operation: OpenAIEndpointOperationV2
  resourceId?: string
}> {
  if (!value || typeof value !== 'object' || Array.isArray(value) || Object.getPrototypeOf(value) !== Object.prototype) {
    throw new OpenAIResponsesApiContractV2Error('GENERATION_V2_OPENAI_ENDPOINT_INPUT_INVALID')
  }
  const descriptors = Object.getOwnPropertyDescriptors(value)
  const expected = descriptors.resourceId ? ['surfaceId', 'operation', 'resourceId'] : ['surfaceId', 'operation']
  if (Reflect.ownKeys(value).some((key) => typeof key !== 'string') ||
      Object.keys(descriptors).sort().join('\0') !== expected.sort().join('\0') ||
      Object.values(descriptors).some((descriptor) => !descriptor.enumerable || !('value' in descriptor)) ||
      typeof descriptors.surfaceId?.value !== 'string' || typeof descriptors.operation?.value !== 'string' ||
      (descriptors.resourceId && (typeof descriptors.resourceId.value !== 'string' ||
        !RESOURCE_ID_PATTERN.test(descriptors.resourceId.value)))) {
    throw new OpenAIResponsesApiContractV2Error('GENERATION_V2_OPENAI_ENDPOINT_INPUT_INVALID')
  }
  return Object.freeze({
    surfaceId: descriptors.surfaceId.value as OpenAIResponsesApiSurfaceIdV2,
    operation: descriptors.operation.value as OpenAIEndpointOperationV2,
    ...(descriptors.resourceId ? { resourceId: descriptors.resourceId.value } : {}),
  })
}

export function readOpenAIResponsesApiContractV2(): OpenAIResponsesApiContractV2 {
  return contract
}

export function isOpenAIResponsesApiContractV2(value: unknown): value is OpenAIResponsesApiContractV2 {
  return Boolean(value && typeof value === 'object' && reviewedContracts.has(value))
}

export function resolveOpenAIResponsesApiEndpointV2(
  providerContract: OpenAIResponsesApiContractV2,
  value: unknown,
): Readonly<{
  surface: OpenAIResponsesApiSurfaceDefinitionV2
  operation: OpenAIEndpointOperationV2
  method: 'GET' | 'POST' | 'DELETE'
  url: string
}> {
  if (!isOpenAIResponsesApiContractV2(providerContract)) {
    throw new OpenAIResponsesApiContractV2Error('GENERATION_V2_OPENAI_CONTRACT_INVALID')
  }
  const input = decodeEndpointInput(value)
  const surface = surfacesById.get(input.surfaceId)
  if (!surface) throw new OpenAIResponsesApiContractV2Error('GENERATION_V2_OPENAI_ENDPOINT_UNKNOWN')

  const endpoint = surface.surfaceId === 'openai-responses-v1'
    ? (input.operation === surface.endpointOperation ? surface : undefined)
    : surface.endpointOperations.find((candidate) => candidate.operation === input.operation)
  if (!endpoint) throw new OpenAIResponsesApiContractV2Error('GENERATION_V2_OPENAI_ENDPOINT_UNKNOWN')
  const needsResourceId = endpoint.relativePathTemplate.includes('{model_id}') ||
    endpoint.relativePathTemplate.includes('{file_id}')
  if (needsResourceId !== Boolean(input.resourceId)) {
    throw new OpenAIResponsesApiContractV2Error('GENERATION_V2_OPENAI_ENDPOINT_INPUT_INVALID')
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
  })
}
