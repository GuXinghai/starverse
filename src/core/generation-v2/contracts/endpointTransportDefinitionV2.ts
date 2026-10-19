import { sha256Hex } from '../../../shared/crypto/sha256Hex'
import { stableSerializeProviderRequestV2 } from '../compiler/stableSerialize'
import { readOpenAIResponsesApiContractV2 } from './openAIResponsesApiContractV2'
import { readOpenRouterChatApiContractV2 } from './openRouterChatApiContractV2'
import { listReviewedProviderContractDefinitionsV2, type ProviderContractOperationV2 } from './providerContractRegistryV2'

export type EndpointTransportDefinitionV2 = Readonly<{
  transportSchemaVersion: 1
  providerId: string
  protocolContractId: string
  operation: ProviderContractOperationV2
  transportRevision: string
  apiOrigin: string | null
  auth: unknown
  /** URI prefix for a version-relative template; null for an origin-absolute requestPath. */
  apiVersion: string | null
  apiVersionHeader?: Readonly<{ name: string; value: string }>
  method: string
  requestPath: string
  fixedQuery: Readonly<Record<string, string>>
  contentType: string
  streamPolicy: Readonly<{
    location: 'body' | 'path'
    field: string
    requiredValue?: boolean
    responseProtocol: string
    doneSentinel?: string
  }>
}>

export class EndpointTransportRegistryV2Error extends Error {
  constructor(readonly code: 'GENERATION_V2_ENDPOINT_TRANSPORT_UNKNOWN' | 'GENERATION_V2_ENDPOINT_TRANSPORT_INVALID') {
    super(code)
    this.name = 'EndpointTransportRegistryV2Error'
  }
}

const OPENAI_RESPONSES = readOpenAIResponsesApiContractV2()
const OPENROUTER_CHAT = readOpenRouterChatApiContractV2()

function readProperty(value: object, key: string): unknown {
  return Object.prototype.hasOwnProperty.call(value, key) ? (value as Record<string, unknown>)[key] : undefined
}

function asPlainRecord(value: unknown): Readonly<Record<string, unknown>> {
  return value && typeof value === 'object' && !Array.isArray(value)
    ? value as Readonly<Record<string, unknown>>
    : Object.freeze({})
}

function createTransport(definition: ReturnType<typeof listReviewedProviderContractDefinitionsV2>[number], operation: ProviderContractOperationV2): EndpointTransportDefinitionV2 {
  const surface = definition.apiSurface as Readonly<Record<string, unknown>>
  const root = definition.protocolContractId.value === 'openai-responses-v1'
    ? OPENAI_RESPONSES as unknown as Readonly<Record<string, unknown>>
    : definition.protocolContractId.value === 'openrouter-images-v1'
      ? OPENROUTER_CHAT as unknown as Readonly<Record<string, unknown>>
      : surface
  const auth = readProperty(surface, 'auth') ?? readProperty(root, 'auth') ?? Object.freeze({ kind: 'endpoint_profile' })
  const rawApiOrigin = readProperty(surface, 'apiOrigin') ?? readProperty(root, 'apiOrigin') ?? null
  if (rawApiOrigin !== null && typeof rawApiOrigin !== 'string') {
    throw new EndpointTransportRegistryV2Error('GENERATION_V2_ENDPOINT_TRANSPORT_INVALID')
  }
  const apiOrigin = rawApiOrigin
  const apiVersionHeader = asPlainRecord(readProperty(surface, 'apiVersionHeader') ?? readProperty(root, 'apiVersionHeader'))
  const rawApiVersion = readProperty(surface, 'apiVersion')
  if (rawApiVersion !== undefined && typeof rawApiVersion !== 'string') {
    throw new EndpointTransportRegistryV2Error('GENERATION_V2_ENDPOINT_TRANSPORT_INVALID')
  }
  // Historical surfaces also use apiVersion as descriptive metadata beside a
  // complete requestPath. Only a relative template needs a URI version prefix.
  const apiVersion = readProperty(surface, 'relativePathTemplate') === undefined ? null : rawApiVersion ?? null
  const rawApiVersionHeaderName = readProperty(apiVersionHeader, 'name')
  const rawApiVersionHeaderValue = readProperty(apiVersionHeader, 'value')
  const projectedApiVersionHeader = rawApiVersionHeaderName === undefined && rawApiVersionHeaderValue === undefined
    ? undefined
    : typeof rawApiVersionHeaderName === 'string' && typeof rawApiVersionHeaderValue === 'string'
      ? Object.freeze({ name: rawApiVersionHeaderName, value: rawApiVersionHeaderValue })
      : null
  if (projectedApiVersionHeader === null) {
    throw new EndpointTransportRegistryV2Error('GENERATION_V2_ENDPOINT_TRANSPORT_INVALID')
  }
  const method = (readProperty(surface, 'method') ?? 'POST') as string
  const requestPath = (readProperty(surface, 'relativePathTemplate') ?? readProperty(surface, 'requestPath')) as string | undefined
  if (!requestPath || !requestPath.startsWith('/') || /[?#]/u.test(requestPath) ||
      (method !== 'POST' && method !== 'GET' && method !== 'DELETE')) {
    throw new EndpointTransportRegistryV2Error('GENERATION_V2_ENDPOINT_TRANSPORT_INVALID')
  }
  const fixedQueryValues = asPlainRecord(readProperty(surface, 'fixedQuery'))
  const fixedQuery: Record<string, string> = {}
  for (const [key, value] of Object.entries(fixedQueryValues)) {
    if (typeof value !== 'string') throw new EndpointTransportRegistryV2Error('GENERATION_V2_ENDPOINT_TRANSPORT_INVALID')
    fixedQuery[key] = value
  }
  const rawStreamPolicy = asPlainRecord(readProperty(surface, 'streamRequestPolicy'))
  const responseProtocols = readProperty(surface, 'responseProtocols')
  const geminiPathStreaming = definition.protocolContractId.value === 'gemini-generate-content-v1beta'
  const streamLocation = readProperty(rawStreamPolicy, 'location') ?? (geminiPathStreaming ? 'path' : 'body')
  const streamField = readProperty(rawStreamPolicy, 'field') ?? (geminiPathStreaming ? 'streamGenerateContent' : 'stream')
  const rawRequiredValue = readProperty(rawStreamPolicy, 'requiredValue')
  const requiredValue = rawRequiredValue === undefined && definition.protocolContractId.value === 'openrouter-images-v1'
    ? undefined : rawRequiredValue ?? true
  const responseProtocol = (readProperty(rawStreamPolicy, 'responseProtocol') ??
    (Array.isArray(responseProtocols) ? responseProtocols[0] : undefined) ??
    readProperty(surface, 'responseProtocol') ?? (definition.protocolContractId.value === 'ollama-chat-v1' ? 'ndjson' :
      definition.protocolContractId.value === 'generic-local-openai-chat-completions' ||
      definition.protocolContractId.value === 'lmstudio-openresponses' ||
      definition.protocolContractId.value === 'openrouter-images-v1' ? 'sse' : 'json')) as string
  if ((streamLocation !== 'body' && streamLocation !== 'path') || typeof streamField !== 'string' ||
      !streamField || requiredValue !== undefined && typeof requiredValue !== 'boolean' ||
      typeof responseProtocol !== 'string' || !responseProtocol) {
    throw new EndpointTransportRegistryV2Error('GENERATION_V2_ENDPOINT_TRANSPORT_INVALID')
  }
  const streamPolicy = Object.freeze({
    location: streamLocation as 'body' | 'path',
    field: streamField,
    ...(requiredValue === undefined ? {} : { requiredValue }),
    responseProtocol,
    ...(typeof readProperty(rawStreamPolicy, 'doneSentinel') === 'string'
      ? { doneSentinel: readProperty(rawStreamPolicy, 'doneSentinel') as string } : {}),
  })
  const projection = Object.freeze({
    providerId: definition.providerId.value,
    protocolContractId: definition.protocolContractId.value,
    operation,
    apiOrigin,
    auth,
    apiVersion,
    ...(projectedApiVersionHeader === undefined ? {} : { apiVersionHeader: projectedApiVersionHeader }),
    method,
    requestPath,
    fixedQuery,
    contentType: (readProperty(surface, 'requestContentType') ?? 'application/json') as string,
    streamPolicy,
  })
  if (typeof projection.contentType !== 'string' ||
      typeof projection.apiVersion !== 'string' && projection.apiVersion !== null) {
    throw new EndpointTransportRegistryV2Error('GENERATION_V2_ENDPOINT_TRANSPORT_INVALID')
  }
  const transportRevision = `endpoint-transport-v1:${definition.protocolContractId.value}:${sha256Hex(stableSerializeProviderRequestV2(projection))}`
  return Object.freeze({ transportSchemaVersion: 1, ...projection, transportRevision })
}

const transports = new Map<string, EndpointTransportDefinitionV2>()
const transportsByRevision = new Map<string, EndpointTransportDefinitionV2>()
for (const definition of listReviewedProviderContractDefinitionsV2()) {
  for (const operation of definition.operations) {
    const transport = createTransport(definition, operation)
    transports.set(`${transport.providerId}\0${operation}`, transport)
    if (transportsByRevision.has(transport.transportRevision)) {
      throw new EndpointTransportRegistryV2Error('GENERATION_V2_ENDPOINT_TRANSPORT_INVALID')
    }
    transportsByRevision.set(transport.transportRevision, transport)
  }
}

export function readEndpointTransportDefinitionV2(
  providerId: string,
  operation: ProviderContractOperationV2,
  transportRevision?: string,
): EndpointTransportDefinitionV2 {
  if (typeof providerId !== 'string' || typeof operation !== 'string') {
    throw new EndpointTransportRegistryV2Error('GENERATION_V2_ENDPOINT_TRANSPORT_UNKNOWN')
  }
  const transport = transportRevision === undefined
    ? transports.get(`${providerId}\0${operation}`)
    : transportsByRevision.get(transportRevision)
  if (!transport || transport.providerId !== providerId || transport.operation !== operation) {
    throw new EndpointTransportRegistryV2Error('GENERATION_V2_ENDPOINT_TRANSPORT_UNKNOWN')
  }
  return transport
}

export function listEndpointTransportDefinitionsV2(): readonly EndpointTransportDefinitionV2[] {
  return Object.freeze([...transports.values()])
}

export function readEndpointTransportDefinitionByRevisionV2(
  providerId: string,
  transportRevision: string,
): EndpointTransportDefinitionV2 {
  if (typeof providerId !== 'string' || typeof transportRevision !== 'string') {
    throw new EndpointTransportRegistryV2Error('GENERATION_V2_ENDPOINT_TRANSPORT_UNKNOWN')
  }
  const transport = transportsByRevision.get(transportRevision)
  if (!transport || transport.providerId !== providerId) {
    throw new EndpointTransportRegistryV2Error('GENERATION_V2_ENDPOINT_TRANSPORT_UNKNOWN')
  }
  return transport
}
