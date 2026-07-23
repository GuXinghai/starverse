import {
  sha256PreparedBytesV2,
  stableSerializeProviderRequestV2,
  stableSerializeProviderRequestBoundedV2,
} from '../compiler/stableSerialize'
import type {
  GenerationConfigRevisionEntryV2,
  GenerationConfigRevisionScopeV2,
} from '../config/generationConfigRevisionV2'
import {
  ConversationGraphV2Identity,
  type ConversationGraphV2Identity as GraphIdentity,
} from './conversationGraphV2'
import {
  requiresProviderFileBindingV2,
  type AttachmentIntentV2,
} from './generationIntentV2'
import { projectGenerationIntentLayerV2 } from './generationIntentProjectionV2'
import {
  GenerationV2Digest,
  GenerationV2Identity,
  readGenerationV2Digest,
  readGenerationV2Identity,
} from './identityV2'
import {
  decodeProviderBindingRecordV2,
  projectDecodedProviderBindingRecordV2,
  type DecodedProviderBindingRecordV2,
} from './providerBindingV2'
import {
  decodeResolvedGenerationIntentV2,
  type ResolvedGenerationIntentV2,
} from './resolvedGenerationIntentV2'
import { compatibleBoundedJsonValueSchema } from '../../../shared/provider/openai-chat-compatible/schemas'

export const ASSISTANT_ANSWER_GENERATION_SNAPSHOT_V2_SCHEMA_VERSION = 2 as const
export const ASSISTANT_ANSWER_GENERATION_SNAPSHOT_V2_MAX_UTF8_BYTES = 1024 * 1024

export type CapabilityBindingV2 = Readonly<{
  capabilityRevision: GenerationV2Identity<'capability_revision'>
  evidenceDigest: GenerationV2Digest<'evidence_digest'>
  semanticFieldsDigest: GenerationV2Digest<'capability_fields_digest'>
  snapshotHash: GenerationV2Digest<'snapshot_hash'>
}>

export type ProviderFileDescriptorReferenceV2 = Readonly<{
  descriptorId: GenerationV2Identity<'provider_file_descriptor_id'>
  descriptorRevision: GenerationV2Identity<'provider_file_descriptor_revision'>
  descriptorHash: GenerationV2Digest<'provider_file_descriptor_hash'>
  providerFileId?: string
}>

export type AttachmentProviderFileBindingV2 = Readonly<{
  assetRevisionId: GenerationV2Identity<'asset_revision_id'>
  providerFileDescriptor: ProviderFileDescriptorReferenceV2
}>

export type ToolAuthorityBindingV2 =
  | Readonly<{ kind: 'none' }>
  | Readonly<{
      kind: 'registry'
      toolRegistryRevision: GenerationV2Identity<'tool_registry_revision'>
      toolDefinitionsDigest: GenerationV2Digest<'tool_definitions_digest'>
    }>

export type ProviderConfigurationProvenanceV2 =
  | Readonly<{ kind: 'none' }>
  | Readonly<{
      kind: 'openai_chat_compatible'
      providerInstanceId: GenerationV2Identity<'compatible_provider_instance_id'>
      endpointRevisionId: GenerationV2Identity<'compatible_endpoint_revision_id'>
      endpointDigest: GenerationV2Digest<'compatible_endpoint_digest'>
      credentialRevision: number
      requestProfile: Readonly<{ id: GenerationV2Identity<'compatible_config_id'>; version: number; digest: GenerationV2Digest<'compatible_config_digest'> }>
      requestMappings: readonly Readonly<{ id: GenerationV2Identity<'compatible_config_id'>; version: number; digest: GenerationV2Digest<'compatible_config_digest'> }>[]
      reasoningMapping: Readonly<{ id: GenerationV2Identity<'compatible_config_id'>; version: number; digest: GenerationV2Digest<'compatible_config_digest'> }>
      inlinePolicy: Readonly<{ id: GenerationV2Identity<'compatible_config_id'>; version: number; digest: GenerationV2Digest<'compatible_config_digest'> }>
      responseProfile: Readonly<{ id: GenerationV2Identity<'compatible_config_id'>; version: number; digest: GenerationV2Digest<'compatible_config_digest'> }>
      /** Closed, non-secret compatible-only top-level extension used for exact retry replay. */
      extraBody: unknown | null
      extraBodyDigest: GenerationV2Digest<'compatible_extra_body_digest'>
    }>

export type PersistedAssistantAnswerGenerationSnapshotV2Record = Readonly<{
  schemaVersion: 2
  answerRootId: string
  operationId: string
  semanticIntent: unknown
  resolvedConfigRevisions: readonly unknown[]
  providerBinding: unknown
  capabilityBinding: unknown
  attachmentProviderFileBindings: readonly unknown[]
  toolAuthority: unknown
  providerConfiguration: unknown
  snapshotHash: string
}>

export type DecodedAssistantAnswerGenerationSnapshotV2 = Readonly<{
  trust: 'decoded_unverified'
  schemaVersion: 2
  answerRootId: GraphIdentity<'answer_root_id'>
  operationId: GenerationV2Identity<'operation_id'>
  semanticIntent: ResolvedGenerationIntentV2
  resolvedConfigRevisions: readonly GenerationConfigRevisionEntryV2[]
  providerBinding: DecodedProviderBindingRecordV2
  capabilityBinding: CapabilityBindingV2
  attachmentProviderFileBindings: readonly AttachmentProviderFileBindingV2[]
  toolAuthority: ToolAuthorityBindingV2
  providerConfiguration: ProviderConfigurationProvenanceV2
  snapshotHash: GenerationV2Digest<'snapshot_hash'>
  canonicalJson: string
}>

export class AssistantAnswerGenerationSnapshotV2Error extends Error {
  constructor(readonly code:
    | 'GENERATION_V2_SNAPSHOT_INVALID_SHAPE'
    | 'GENERATION_V2_SNAPSHOT_UNKNOWN_FIELD'
    | 'GENERATION_V2_SNAPSHOT_INVALID_VALUE'
    | 'GENERATION_V2_SNAPSHOT_DUPLICATE_VALUE'
    | 'GENERATION_V2_SNAPSHOT_ATTACHMENT_BINDING_MISMATCH'
    | 'GENERATION_V2_SNAPSHOT_TOOL_BINDING_MISMATCH'
    | 'GENERATION_V2_SNAPSHOT_HASH_MISMATCH'
    | 'GENERATION_V2_SNAPSHOT_NON_CANONICAL_JSON'
    | 'GENERATION_V2_SNAPSHOT_BYTE_LIMIT_EXCEEDED') {
    super(code)
    this.name = 'AssistantAnswerGenerationSnapshotV2Error'
  }
}

type ClosedInput = { readonly [key: string]: unknown }
type SnapshotPayload = Omit<PersistedAssistantAnswerGenerationSnapshotV2Record, 'snapshotHash'>

function closedObject(value: unknown, allowed: readonly string[]): ClosedInput {
  if (!value || typeof value !== 'object' || Array.isArray(value) ||
      (Object.getPrototypeOf(value) !== Object.prototype && Object.getPrototypeOf(value) !== null)) {
    throw new AssistantAnswerGenerationSnapshotV2Error('GENERATION_V2_SNAPSHOT_INVALID_SHAPE')
  }
  const descriptors = Object.getOwnPropertyDescriptors(value)
  if (Reflect.ownKeys(value).some((key) => typeof key !== 'string') ||
      Object.values(descriptors).some((descriptor) => !descriptor.enumerable || !('value' in descriptor) || descriptor.value === undefined)) {
    throw new AssistantAnswerGenerationSnapshotV2Error('GENERATION_V2_SNAPSHOT_INVALID_SHAPE')
  }
  if (Object.keys(descriptors).some((key) => !allowed.includes(key))) {
    throw new AssistantAnswerGenerationSnapshotV2Error('GENERATION_V2_SNAPSHOT_UNKNOWN_FIELD')
  }
  return Object.fromEntries(Object.entries(descriptors).map(([key, descriptor]) => [key, descriptor.value]))
}

function closedDenseArray(value: unknown): readonly unknown[] {
  if (!Array.isArray(value) || Object.getPrototypeOf(value) !== Array.prototype) {
    throw new AssistantAnswerGenerationSnapshotV2Error('GENERATION_V2_SNAPSHOT_INVALID_SHAPE')
  }
  const keys = Reflect.ownKeys(value)
  const expected = [...Array.from({ length: value.length }, (_, index) => String(index)), 'length']
  if (keys.length !== expected.length || expected.some((key) => !keys.includes(key))) {
    throw new AssistantAnswerGenerationSnapshotV2Error('GENERATION_V2_SNAPSHOT_INVALID_SHAPE')
  }
  return Object.freeze(expected.slice(0, -1).map((key) => {
    const descriptor = Object.getOwnPropertyDescriptor(value, key)
    if (!descriptor || !descriptor.enumerable || !('value' in descriptor) || descriptor.value === undefined) {
      throw new AssistantAnswerGenerationSnapshotV2Error('GENERATION_V2_SNAPSHOT_INVALID_SHAPE')
    }
    return descriptor.value
  }))
}

function requiredString(input: ClosedInput, key: string): string {
  const value = input[key]
  if (typeof value !== 'string') {
    throw new AssistantAnswerGenerationSnapshotV2Error('GENERATION_V2_SNAPSHOT_INVALID_VALUE')
  }
  return value
}

function compareCodePoints(left: string, right: string): number {
  const a = Array.from(left)
  const b = Array.from(right)
  for (let index = 0; index < Math.min(a.length, b.length); index += 1) {
    const difference = (a[index].codePointAt(0) ?? 0) - (b[index].codePointAt(0) ?? 0)
    if (difference !== 0) return difference
  }
  return a.length - b.length
}

function deepFreeze<T>(value: T): T {
  if (value && typeof value === 'object' && !Object.isFrozen(value)) {
    for (const child of Object.values(value as Record<string, unknown>)) deepFreeze(child)
    Object.freeze(value)
  }
  return value
}

function decodeConfigRevisions(value: unknown): readonly GenerationConfigRevisionEntryV2[] {
  const order: readonly GenerationConfigRevisionScopeV2[] = ['global', 'project', 'conversation']
  const values = closedDenseArray(value).map((item) => {
    const input = closedObject(item, ['ownerKind', 'ownerId', 'revision'])
    if (!order.includes(input.ownerKind as GenerationConfigRevisionScopeV2)) {
      throw new AssistantAnswerGenerationSnapshotV2Error('GENERATION_V2_SNAPSHOT_INVALID_VALUE')
    }
    const ownerKind = input.ownerKind as GenerationConfigRevisionScopeV2
    const ownerId = requiredString(input, 'ownerId')
    if (ownerKind === 'global') {
      if (ownerId !== 'global') throw new AssistantAnswerGenerationSnapshotV2Error('GENERATION_V2_SNAPSHOT_INVALID_VALUE')
    } else {
      ConversationGraphV2Identity.create(ownerKind === 'project' ? 'project_id' : 'conversation_id', ownerId)
    }
    return Object.freeze({
      ownerKind,
      ownerId,
      revision: GenerationV2Identity.create('config_revision', requiredString(input, 'revision')),
    })
  })
  if (values.length === 0 || values.length > order.length ||
      new Set(values.map((item) => item.ownerKind)).size !== values.length ||
      values.some((item, index) => index > 0 &&
        order.indexOf(values[index - 1].ownerKind) >= order.indexOf(item.ownerKind))) {
    throw new AssistantAnswerGenerationSnapshotV2Error('GENERATION_V2_SNAPSHOT_DUPLICATE_VALUE')
  }
  return Object.freeze(values)
}

function decodeCapabilityBinding(value: unknown): CapabilityBindingV2 {
  const input = closedObject(value, [
    'capabilityRevision', 'evidenceDigest', 'semanticFieldsDigest', 'snapshotHash',
  ])
  return Object.freeze({
    capabilityRevision: GenerationV2Identity.create('capability_revision', requiredString(input, 'capabilityRevision')),
    evidenceDigest: GenerationV2Digest.create('evidence_digest', requiredString(input, 'evidenceDigest')),
    semanticFieldsDigest: GenerationV2Digest.create('capability_fields_digest', requiredString(input, 'semanticFieldsDigest')),
    snapshotHash: GenerationV2Digest.create('snapshot_hash', requiredString(input, 'snapshotHash')),
  })
}

function decodeAttachmentBindings(
  value: unknown,
  attachments: readonly AttachmentIntentV2[],
  providerId: string,
): readonly AttachmentProviderFileBindingV2[] {
  const bindings = closedDenseArray(value).map((item) => {
    const input = closedObject(item, ['assetRevisionId', 'providerFileDescriptor'])
    const descriptor = closedObject(input.providerFileDescriptor, ['descriptorId', 'descriptorRevision', 'descriptorHash', 'providerFileId'])
    return Object.freeze({
      assetRevisionId: GenerationV2Identity.create('asset_revision_id', requiredString(input, 'assetRevisionId')),
      providerFileDescriptor: Object.freeze({
        descriptorId: GenerationV2Identity.create('provider_file_descriptor_id', requiredString(descriptor, 'descriptorId')),
        descriptorRevision: GenerationV2Identity.create('provider_file_descriptor_revision', requiredString(descriptor, 'descriptorRevision')),
        descriptorHash: GenerationV2Digest.create('provider_file_descriptor_hash', requiredString(descriptor, 'descriptorHash')),
        ...(descriptor.providerFileId === undefined ? {} : { providerFileId: requiredString(descriptor, 'providerFileId') }),
      }),
    })
  })
  const expected = providerId === 'google_ai_studio' ? [] : attachments
    .filter(requiresProviderFileBindingV2)
    .map((item) => readGenerationV2Identity(item.assetRevisionId, 'asset_revision_id'))
    .sort(compareCodePoints)
  const actual = bindings.map((item) => readGenerationV2Identity(item.assetRevisionId, 'asset_revision_id'))
  if (new Set(actual).size !== actual.length || expected.length !== actual.length ||
      expected.some((item, index) => item !== actual[index])) {
    throw new AssistantAnswerGenerationSnapshotV2Error('GENERATION_V2_SNAPSHOT_ATTACHMENT_BINDING_MISMATCH')
  }
  return Object.freeze(bindings)
}

function decodeToolAuthority(value: unknown, intent: ResolvedGenerationIntentV2): ToolAuthorityBindingV2 {
  const discriminator = closedObject(value, ['kind', 'toolRegistryRevision', 'toolDefinitionsDigest'])
  if (discriminator.kind === 'none') {
    if (Object.keys(discriminator).length !== 1 || intent.tools.mode !== 'disabled') {
      throw new AssistantAnswerGenerationSnapshotV2Error('GENERATION_V2_SNAPSHOT_TOOL_BINDING_MISMATCH')
    }
    return Object.freeze({ kind: 'none' })
  }
  if (discriminator.kind !== 'registry' || intent.tools.mode !== 'enabled') {
    throw new AssistantAnswerGenerationSnapshotV2Error('GENERATION_V2_SNAPSHOT_TOOL_BINDING_MISMATCH')
  }
  return Object.freeze({
    kind: 'registry',
    toolRegistryRevision: GenerationV2Identity.create(
      'tool_registry_revision', requiredString(discriminator, 'toolRegistryRevision'),
    ),
    toolDefinitionsDigest: GenerationV2Digest.create(
      'tool_definitions_digest', requiredString(discriminator, 'toolDefinitionsDigest'),
    ),
  })
}

type CompatibleConfigRef = Readonly<{
  id: GenerationV2Identity<'compatible_config_id'>
  version: number
  digest: GenerationV2Digest<'compatible_config_digest'>
}>

function decodeCompatibleConfigRef(value: unknown): CompatibleConfigRef {
  const input = closedObject(value, ['id', 'version', 'digest'])
  if (!Number.isSafeInteger(input.version) || (input.version as number) < 1) {
    throw new AssistantAnswerGenerationSnapshotV2Error('GENERATION_V2_SNAPSHOT_INVALID_VALUE')
  }
  return Object.freeze({
    id: GenerationV2Identity.create('compatible_config_id', requiredString(input, 'id')),
    version: input.version as number,
    digest: GenerationV2Digest.create('compatible_config_digest', requiredString(input, 'digest')),
  })
}

function projectCompatibleConfigRef(value: CompatibleConfigRef): Readonly<{ id: string; version: number; digest: string }> {
  return Object.freeze({
    id: readGenerationV2Identity(value.id, 'compatible_config_id'),
    version: value.version,
    digest: readGenerationV2Digest(value.digest, 'compatible_config_digest'),
  })
}

function decodeProviderConfiguration(
  value: unknown,
  binding: DecodedProviderBindingRecordV2,
): ProviderConfigurationProvenanceV2 {
  const input = closedObject(value, ['kind', 'providerInstanceId', 'endpointRevisionId', 'endpointDigest', 'credentialRevision',
    'requestProfile', 'requestMappings', 'reasoningMapping', 'inlinePolicy', 'responseProfile', 'extraBody', 'extraBodyDigest'])
  if (input.kind === 'none') {
    if (Object.keys(input).length !== 1 || binding.protocolContractId.value === 'openai_chat_compatible') {
      throw new AssistantAnswerGenerationSnapshotV2Error('GENERATION_V2_SNAPSHOT_INVALID_VALUE')
    }
    return Object.freeze({ kind: 'none' })
  }
  if (input.kind !== 'openai_chat_compatible' || binding.protocolContractId.value !== 'openai_chat_compatible' ||
      !Number.isSafeInteger(input.credentialRevision) || (input.credentialRevision as number) < 1) {
    throw new AssistantAnswerGenerationSnapshotV2Error('GENERATION_V2_SNAPSHOT_INVALID_VALUE')
  }
  const requestMappings = closedDenseArray(input.requestMappings).map(decodeCompatibleConfigRef)
  const mappingKeys = requestMappings.map((item) => `${item.id.value}\u0000${item.version}`)
  if (new Set(mappingKeys).size !== mappingKeys.length || mappingKeys.some((item, index) => index > 0 && mappingKeys[index - 1]! >= item)) {
    throw new AssistantAnswerGenerationSnapshotV2Error('GENERATION_V2_SNAPSHOT_DUPLICATE_VALUE')
  }
  let extraBody: unknown | null
  try {
    extraBody = input.extraBody === null ? null : compatibleBoundedJsonValueSchema.parse(input.extraBody)
    if (extraBody !== null && (typeof extraBody !== 'object' || Array.isArray(extraBody))) throw new Error('not_object')
  } catch {
    throw new AssistantAnswerGenerationSnapshotV2Error('GENERATION_V2_SNAPSHOT_INVALID_VALUE')
  }
  const extraBodyDigest = GenerationV2Digest.create('compatible_extra_body_digest', requiredString(input, 'extraBodyDigest'))
  if (sha256PreparedBytesV2(new TextEncoder().encode(stableSerializeProviderRequestV2(extraBody ?? {}))) !== extraBodyDigest.value) {
    throw new AssistantAnswerGenerationSnapshotV2Error('GENERATION_V2_SNAPSHOT_INVALID_VALUE')
  }
  return Object.freeze({
    kind: 'openai_chat_compatible',
    providerInstanceId: GenerationV2Identity.create('compatible_provider_instance_id', requiredString(input, 'providerInstanceId')),
    endpointRevisionId: GenerationV2Identity.create('compatible_endpoint_revision_id', requiredString(input, 'endpointRevisionId')),
    endpointDigest: GenerationV2Digest.create('compatible_endpoint_digest', requiredString(input, 'endpointDigest')),
    credentialRevision: input.credentialRevision as number,
    requestProfile: decodeCompatibleConfigRef(input.requestProfile),
    requestMappings: Object.freeze(requestMappings),
    reasoningMapping: decodeCompatibleConfigRef(input.reasoningMapping),
    inlinePolicy: decodeCompatibleConfigRef(input.inlinePolicy),
    responseProfile: decodeCompatibleConfigRef(input.responseProfile),
    extraBody,
    extraBodyDigest,
  })
}

function projectProviderConfiguration(value: ProviderConfigurationProvenanceV2): unknown {
  if (value.kind === 'none') return Object.freeze({ kind: 'none' })
  return Object.freeze({
    kind: value.kind,
    providerInstanceId: readGenerationV2Identity(value.providerInstanceId, 'compatible_provider_instance_id'),
    endpointRevisionId: readGenerationV2Identity(value.endpointRevisionId, 'compatible_endpoint_revision_id'),
    endpointDigest: readGenerationV2Digest(value.endpointDigest, 'compatible_endpoint_digest'),
    credentialRevision: value.credentialRevision,
    requestProfile: projectCompatibleConfigRef(value.requestProfile),
    requestMappings: value.requestMappings.map(projectCompatibleConfigRef),
    reasoningMapping: projectCompatibleConfigRef(value.reasoningMapping),
    inlinePolicy: projectCompatibleConfigRef(value.inlinePolicy),
    responseProfile: projectCompatibleConfigRef(value.responseProfile),
    extraBody: value.extraBody,
    extraBodyDigest: readGenerationV2Digest(value.extraBodyDigest, 'compatible_extra_body_digest'),
  })
}

type DecodedPayload = Omit<DecodedAssistantAnswerGenerationSnapshotV2, 'trust' | 'snapshotHash' | 'canonicalJson'>

function decodePayload(value: unknown): Readonly<{ decoded: DecodedPayload; projection: SnapshotPayload }> {
  const input = closedObject(value, [
    'schemaVersion', 'answerRootId', 'operationId', 'semanticIntent', 'resolvedConfigRevisions',
    'providerBinding', 'capabilityBinding', 'attachmentProviderFileBindings', 'toolAuthority', 'providerConfiguration',
  ])
  if (input.schemaVersion !== 2) {
    throw new AssistantAnswerGenerationSnapshotV2Error('GENERATION_V2_SNAPSHOT_INVALID_VALUE')
  }
  const answerRootId = ConversationGraphV2Identity.create('answer_root_id', requiredString(input, 'answerRootId'))
  const operationId = GenerationV2Identity.create('operation_id', requiredString(input, 'operationId'))
  const semanticIntent = decodeResolvedGenerationIntentV2(input.semanticIntent).value
  const resolvedConfigRevisions = decodeConfigRevisions(input.resolvedConfigRevisions)
  const providerBinding = decodeProviderBindingRecordV2(input.providerBinding)
  const capabilityBinding = decodeCapabilityBinding(input.capabilityBinding)
  const attachmentProviderFileBindings = decodeAttachmentBindings(
    input.attachmentProviderFileBindings, semanticIntent.attachments, providerBinding.providerId.value,
  )
  const toolAuthority = decodeToolAuthority(input.toolAuthority, semanticIntent)
  const providerConfiguration = decodeProviderConfiguration(input.providerConfiguration ?? { kind: 'none' }, providerBinding)
  const projection: SnapshotPayload = {
    schemaVersion: 2,
    answerRootId: answerRootId.value,
    operationId: readGenerationV2Identity(operationId, 'operation_id'),
    semanticIntent: projectGenerationIntentLayerV2(semanticIntent),
    resolvedConfigRevisions: resolvedConfigRevisions.map((item) => ({
      ownerKind: item.ownerKind,
      ownerId: item.ownerId,
      revision: readGenerationV2Identity(item.revision, 'config_revision'),
    })),
    providerBinding: projectDecodedProviderBindingRecordV2(providerBinding),
    capabilityBinding: {
      capabilityRevision: readGenerationV2Identity(capabilityBinding.capabilityRevision, 'capability_revision'),
      evidenceDigest: readGenerationV2Digest(capabilityBinding.evidenceDigest, 'evidence_digest'),
      semanticFieldsDigest: readGenerationV2Digest(capabilityBinding.semanticFieldsDigest, 'capability_fields_digest'),
      snapshotHash: readGenerationV2Digest(capabilityBinding.snapshotHash, 'snapshot_hash'),
    },
    attachmentProviderFileBindings: attachmentProviderFileBindings.map((item) => ({
      assetRevisionId: readGenerationV2Identity(item.assetRevisionId, 'asset_revision_id'),
      providerFileDescriptor: {
        descriptorId: readGenerationV2Identity(item.providerFileDescriptor.descriptorId, 'provider_file_descriptor_id'),
        descriptorRevision: readGenerationV2Identity(
          item.providerFileDescriptor.descriptorRevision, 'provider_file_descriptor_revision',
        ),
        descriptorHash: readGenerationV2Digest(
          item.providerFileDescriptor.descriptorHash, 'provider_file_descriptor_hash',
        ),
        ...(item.providerFileDescriptor.providerFileId === undefined ? {} : { providerFileId: item.providerFileDescriptor.providerFileId }),
      },
    })),
    toolAuthority: toolAuthority.kind === 'none' ? { kind: 'none' } : {
      kind: 'registry',
      toolRegistryRevision: readGenerationV2Identity(toolAuthority.toolRegistryRevision, 'tool_registry_revision'),
      toolDefinitionsDigest: readGenerationV2Digest(toolAuthority.toolDefinitionsDigest, 'tool_definitions_digest'),
    },
    providerConfiguration: projectProviderConfiguration(providerConfiguration),
  }
  return Object.freeze({
    decoded: Object.freeze({
      schemaVersion: 2,
      answerRootId,
      operationId,
      semanticIntent,
      resolvedConfigRevisions,
      providerBinding,
      capabilityBinding,
      attachmentProviderFileBindings,
      toolAuthority,
      providerConfiguration,
    }),
    projection,
  })
}

function serializeBounded(value: unknown): string {
  try {
    return stableSerializeProviderRequestBoundedV2(
      value, ASSISTANT_ANSWER_GENERATION_SNAPSHOT_V2_MAX_UTF8_BYTES,
    )
  } catch (error) {
    if (error instanceof Error && error.message === 'GENERATION_V2_JSON_BYTE_LIMIT_EXCEEDED') {
      throw new AssistantAnswerGenerationSnapshotV2Error('GENERATION_V2_SNAPSHOT_BYTE_LIMIT_EXCEEDED')
    }
    throw error
  }
}

function computeHash(projection: SnapshotPayload): string {
  return sha256PreparedBytesV2(new TextEncoder().encode(serializeBounded(projection)))
}

export function canonicalizeUnverifiedAssistantAnswerGenerationSnapshotV2(
  payload: unknown,
): PersistedAssistantAnswerGenerationSnapshotV2Record {
  const { projection } = decodePayload(payload)
  const record = { ...projection, snapshotHash: computeHash(projection) }
  serializeBounded(record)
  return deepFreeze(record)
}

export function decodeAssistantAnswerGenerationSnapshotV2(
  value: unknown,
): DecodedAssistantAnswerGenerationSnapshotV2 {
  const input = closedObject(value, [
    'schemaVersion', 'answerRootId', 'operationId', 'semanticIntent', 'resolvedConfigRevisions',
    'providerBinding', 'capabilityBinding', 'attachmentProviderFileBindings', 'toolAuthority', 'providerConfiguration', 'snapshotHash',
  ])
  const snapshotHash = requiredString(input, 'snapshotHash')
  const payload = Object.fromEntries(Object.entries(input).filter(([key]) => key !== 'snapshotHash'))
  const { decoded, projection } = decodePayload(payload)
  const expectedHash = computeHash(projection)
  if (snapshotHash !== expectedHash) {
    throw new AssistantAnswerGenerationSnapshotV2Error('GENERATION_V2_SNAPSHOT_HASH_MISMATCH')
  }
  const record = { ...projection, snapshotHash }
  const canonicalJson = serializeBounded(record)
  return Object.freeze({
    trust: 'decoded_unverified',
    ...decoded,
    snapshotHash: GenerationV2Digest.create('snapshot_hash', snapshotHash),
    canonicalJson,
  })
}

export function decodeAssistantAnswerGenerationSnapshotJsonV2(
  serialized: string,
): DecodedAssistantAnswerGenerationSnapshotV2 {
  if (typeof serialized !== 'string') {
    throw new AssistantAnswerGenerationSnapshotV2Error('GENERATION_V2_SNAPSHOT_INVALID_SHAPE')
  }
  if (new TextEncoder().encode(serialized).byteLength > ASSISTANT_ANSWER_GENERATION_SNAPSHOT_V2_MAX_UTF8_BYTES) {
    throw new AssistantAnswerGenerationSnapshotV2Error('GENERATION_V2_SNAPSHOT_BYTE_LIMIT_EXCEEDED')
  }
  let parsed: unknown
  try {
    parsed = JSON.parse(serialized)
  } catch {
    throw new AssistantAnswerGenerationSnapshotV2Error('GENERATION_V2_SNAPSHOT_INVALID_SHAPE')
  }
  const decoded = decodeAssistantAnswerGenerationSnapshotV2(parsed)
  if (decoded.canonicalJson !== serialized) {
    throw new AssistantAnswerGenerationSnapshotV2Error('GENERATION_V2_SNAPSHOT_NON_CANONICAL_JSON')
  }
  return decoded
}
