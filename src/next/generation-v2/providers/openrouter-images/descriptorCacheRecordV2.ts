import { stableSerializeProviderRequestV2 } from '../../compiler/stableSerialize'
import { GenerationV2Identity } from '../../domain/identityV2'
import {
  decodeCanonicalOpenRouterImageDescriptorSetV2,
  OPENROUTER_IMAGE_DESCRIPTOR_CACHE_MAX_BYTES_V2,
  type CanonicalOpenRouterImageDescriptorSetV2,
} from './canonicalDescriptorV2'

export type DecodedOpenRouterImageDescriptorCacheRecordV2 = Readonly<{
  trust: 'repository_decoded_unverified'
  credentialScopeId: GenerationV2Identity<'credential_scope_id'>
  modelId: GenerationV2Identity<'model_id'>
  operation: 'image_generate'
  rowGeneration: number
  endpointSetRevision: GenerationV2Identity<'endpoint_set_revision'>
  fetchedAtMs: number
  descriptorSet: CanonicalOpenRouterImageDescriptorSetV2
}>

export class OpenRouterImageDescriptorCacheRecordV2Error extends Error {
  constructor(readonly code:
    | 'GENERATION_V2_OPENROUTER_CACHE_RECORD_INVALID_SHAPE'
    | 'GENERATION_V2_OPENROUTER_CACHE_RECORD_INVALID_VALUE'
    | 'GENERATION_V2_OPENROUTER_CACHE_RECORD_CONTENT_MISMATCH') {
    super(code)
    this.name = 'OpenRouterImageDescriptorCacheRecordV2Error'
  }
}

type Row = Readonly<{
  credential_scope_id: unknown
  model_id: unknown
  operation: unknown
  row_generation: unknown
  endpoint_set_revision: unknown
  fetched_at_ms: unknown
  descriptor_response_json: unknown
}>

function closedRow(value: unknown): Row {
  if (!value || typeof value !== 'object' || Array.isArray(value) || Object.getPrototypeOf(value) !== Object.prototype) {
    throw new OpenRouterImageDescriptorCacheRecordV2Error('GENERATION_V2_OPENROUTER_CACHE_RECORD_INVALID_SHAPE')
  }
  const descriptors = Object.getOwnPropertyDescriptors(value)
  const expected = [
    'credential_scope_id', 'model_id', 'operation', 'row_generation',
    'endpoint_set_revision', 'fetched_at_ms', 'descriptor_response_json',
  ]
  if (Reflect.ownKeys(value).some((key) => typeof key !== 'string') ||
      Object.keys(descriptors).sort().join('\0') !== expected.sort().join('\0') ||
      Object.values(descriptors).some((descriptor) => !descriptor.enumerable || !('value' in descriptor) || descriptor.value === undefined)) {
    throw new OpenRouterImageDescriptorCacheRecordV2Error('GENERATION_V2_OPENROUTER_CACHE_RECORD_INVALID_SHAPE')
  }
  return Object.fromEntries(Object.entries(descriptors).map(([key, descriptor]) => [key, descriptor.value])) as Row
}

function requiredString(value: unknown): string {
  if (typeof value !== 'string' || value.length === 0 || value.trim() !== value) {
    throw new OpenRouterImageDescriptorCacheRecordV2Error('GENERATION_V2_OPENROUTER_CACHE_RECORD_INVALID_VALUE')
  }
  return value
}

export function decodeOpenRouterImageDescriptorCacheRecordV2(
  value: unknown,
): DecodedOpenRouterImageDescriptorCacheRecordV2 {
  const row = closedRow(value)
  const credentialScopeId = requiredString(row.credential_scope_id)
  const modelId = requiredString(row.model_id)
  const endpointSetRevision = requiredString(row.endpoint_set_revision)
  if (row.operation !== 'image_generate' || !Number.isSafeInteger(row.row_generation) || (row.row_generation as number) <= 0 ||
      !Number.isSafeInteger(row.fetched_at_ms) || (row.fetched_at_ms as number) < 0 ||
      typeof row.descriptor_response_json !== 'string') {
    throw new OpenRouterImageDescriptorCacheRecordV2Error('GENERATION_V2_OPENROUTER_CACHE_RECORD_INVALID_VALUE')
  }
  if (Buffer.byteLength(row.descriptor_response_json, 'utf8') > OPENROUTER_IMAGE_DESCRIPTOR_CACHE_MAX_BYTES_V2) {
    throw new OpenRouterImageDescriptorCacheRecordV2Error('GENERATION_V2_OPENROUTER_CACHE_RECORD_INVALID_VALUE')
  }
  let response: unknown
  try {
    response = JSON.parse(row.descriptor_response_json)
  } catch {
    throw new OpenRouterImageDescriptorCacheRecordV2Error('GENERATION_V2_OPENROUTER_CACHE_RECORD_INVALID_VALUE')
  }
  if (stableSerializeProviderRequestV2(response) !== row.descriptor_response_json) {
    throw new OpenRouterImageDescriptorCacheRecordV2Error('GENERATION_V2_OPENROUTER_CACHE_RECORD_CONTENT_MISMATCH')
  }
  const descriptorSet = decodeCanonicalOpenRouterImageDescriptorSetV2(response)
  if (descriptorSet.modelId.value !== modelId || descriptorSet.endpointSetRevision.value !== endpointSetRevision) {
    throw new OpenRouterImageDescriptorCacheRecordV2Error('GENERATION_V2_OPENROUTER_CACHE_RECORD_CONTENT_MISMATCH')
  }
  return Object.freeze({
    trust: 'repository_decoded_unverified',
    credentialScopeId: GenerationV2Identity.create('credential_scope_id', credentialScopeId),
    modelId: GenerationV2Identity.create('model_id', modelId),
    operation: 'image_generate',
    rowGeneration: row.row_generation as number,
    endpointSetRevision: GenerationV2Identity.create('endpoint_set_revision', endpointSetRevision),
    fetchedAtMs: row.fetched_at_ms as number,
    descriptorSet,
  })
}
