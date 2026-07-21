import type {
  OpenAICompatibleEndpointRevisionV2,
  OpenAICompatibleProviderDetailsV2,
} from '../../../../../infra/db/repo/openAICompatibleV2Repo'
import { decodeProviderBindingRecordV2, type DecodedProviderBindingRecordV2 } from '../../domain/providerBindingV2'
import { readReviewedOpenAIChatCompatibleDefinitionV2 } from '../../contracts/providerContractRegistryV2'

export const OPENAI_CHAT_COMPATIBLE_PROTOCOL_V2 = 'openai_chat_compatible' as const
const definition = readReviewedOpenAIChatCompatibleDefinitionV2()
export const OPENAI_CHAT_COMPATIBLE_CONTRACT_DIGEST_V2 = definition.definitionDigest.value

export class OpenAIChatCompatibleContractV2Error extends Error {
  constructor(readonly code:
    | 'GENERATION_V2_OPENAI_COMPATIBLE_PROVIDER_INVALID'
    | 'GENERATION_V2_OPENAI_COMPATIBLE_ENDPOINT_INVALID'
    | 'GENERATION_V2_OPENAI_COMPATIBLE_MODEL_INVALID') {
    super(code)
    this.name = 'OpenAIChatCompatibleContractV2Error'
  }
}

function model(value: unknown): string {
  if (typeof value !== 'string' || value.trim() !== value || value.length < 1 || value.length > 512 || /[\u0000-\u001f\u007f]/u.test(value)) {
    throw new OpenAIChatCompatibleContractV2Error('GENERATION_V2_OPENAI_COMPATIBLE_MODEL_INVALID')
  }
  return value
}

function assertEndpoint(
  provider: OpenAICompatibleProviderDetailsV2,
  endpoint: OpenAICompatibleEndpointRevisionV2,
): void {
  if (provider.protocolContractId !== OPENAI_CHAT_COMPATIBLE_PROTOCOL_V2 || provider.status !== 'active' ||
      endpoint.providerInstanceId !== provider.providerInstanceId || !endpoint.endpointRevisionId ||
      !endpoint.endpointDigest || endpoint.revision < 1) {
    throw new OpenAIChatCompatibleContractV2Error('GENERATION_V2_OPENAI_COMPATIBLE_ENDPOINT_INVALID')
  }
}

/**
 * The user-owned compatible contract has one closed wire operation. It is
 * deliberately not a local-endpoint profile and never probes another API.
 */
export function readOpenAIChatCompatibleChatEndpointV2(endpoint: OpenAICompatibleEndpointRevisionV2): string {
  try {
    const base = new URL(endpoint.baseUrl)
    if (base.protocol !== 'https:' && base.protocol !== 'http:') throw new Error('scheme')
    const result = new URL('/v1/chat/completions', `${base.origin}/`)
    for (const entry of endpoint.query as readonly { name: string; value: string }[]) result.searchParams.append(entry.name, entry.value)
    return result.toString()
  } catch {
    throw new OpenAIChatCompatibleContractV2Error('GENERATION_V2_OPENAI_COMPATIBLE_ENDPOINT_INVALID')
  }
}

export function readOpenAIChatCompatibleModelsEndpointV2(endpoint: OpenAICompatibleEndpointRevisionV2): string {
  try {
    const base = new URL(endpoint.baseUrl)
    if (base.protocol !== 'https:' && base.protocol !== 'http:') throw new Error('scheme')
    const result = new URL('/v1/models', `${base.origin}/`)
    for (const entry of endpoint.query as readonly { name: string; value: string }[]) result.searchParams.append(entry.name, entry.value)
    return result.toString()
  } catch {
    throw new OpenAIChatCompatibleContractV2Error('GENERATION_V2_OPENAI_COMPATIBLE_ENDPOINT_INVALID')
  }
}

export function createOpenAIChatCompatibleProviderBindingV2(input: Readonly<{
  provider: OpenAICompatibleProviderDetailsV2
  endpoint: OpenAICompatibleEndpointRevisionV2
  credentialScopeId: string
  modelId: string
}>): DecodedProviderBindingRecordV2 {
  assertEndpoint(input.provider, input.endpoint)
  const modelId = model(input.modelId)
  readOpenAIChatCompatibleChatEndpointV2(input.endpoint)
  return decodeProviderBindingRecordV2({
    credentialScopeId: input.credentialScopeId,
    providerId: 'openai_compatible',
    endpointProfileId: input.provider.providerInstanceId,
    endpointBinding: {
      kind: 'provider_managed_set',
      endpointSetRevision: input.endpoint.endpointRevisionId,
      descriptors: [{ endpointId: input.provider.providerInstanceId, descriptorRevision: input.endpoint.endpointRevisionId }],
    },
    protocolContractId: OPENAI_CHAT_COMPATIBLE_PROTOCOL_V2,
    contractRevision: definition.contractRevision.value,
    contractDefinitionDigest: definition.definitionDigest.value,
    registryRevision: definition.registryRevision.value,
    modelId,
    operation: 'text',
  })
}
