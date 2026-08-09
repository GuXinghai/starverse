import {
  sha256PreparedBytesV2,
  stableSerializeProviderRequestBoundedV2,
} from '../../compiler/stableSerialize'
import { readAnthropicDeveloperApiContractV2 } from '../../contracts/anthropicDeveloperApiContractV2'
import {
  ConversationGraphV2Identity,
  type ConversationGraphV2Identity as GraphIdentity,
} from '../../domain/conversationGraphV2'
import { GenerationV2Identity, type GenerationV2Identity as Identity } from '../../domain/identityV2'
import { decodeAnthropicCommandAttachmentsV2, projectAnthropicCommandAttachmentsV2 } from './commandAttachmentsV2'
import type { AttachmentIntentV2 } from '../../domain/generationIntentV2'

const MAX_COMMAND_JSON_BYTES = 21 * 1024 * 1024
const MAX_USER_BODY_BYTES = 20 * 1024 * 1024
const COMMAND_KEYS = Object.freeze([
  'operationId',
  'branchId',
  'expectedHeadMessageId',
  'userBody',
  'modelId',
  'commandAttachments',
] as const)

export class AnthropicPlainTextInitialSendCommandV2Error extends Error {
  constructor(readonly code: 'GENERATION_V2_ANTHROPIC_INITIAL_SEND_COMMAND_INVALID') {
    super(code)
    this.name = 'AnthropicPlainTextInitialSendCommandV2Error'
  }
}

export type AnthropicPlainTextInitialSendCommandV2 = Readonly<{
  schemaVersion: 1
  kind: 'anthropic_plain_text_initial_send'
  operationId: Identity<'operation_id'>
  branchId: GraphIdentity<'branch_id'>
  expectedHeadMessageId: GraphIdentity<'message_id'> | null
  userBody: string
  providerId: Identity<'provider_id'>
  endpointProfileId: Identity<'endpoint_profile_id'>
  modelId: Identity<'model_id'>
  commandAttachments: readonly AttachmentIntentV2[]
  canonicalJson: string
  requestFingerprint: string
}>

const commands = new WeakSet<object>()

export function isAnthropicPlainTextInitialSendCommandV2(
  value: unknown,
): value is AnthropicPlainTextInitialSendCommandV2 {
  return Boolean(value && typeof value === 'object' && commands.has(value))
}

function fail(): never {
  throw new AnthropicPlainTextInitialSendCommandV2Error(
    'GENERATION_V2_ANTHROPIC_INITIAL_SEND_COMMAND_INVALID',
  )
}

function readClosedCommand(value: unknown): Readonly<Record<(typeof COMMAND_KEYS)[number], unknown>> {
  if (!value || typeof value !== 'object' || Array.isArray(value) ||
      Object.getPrototypeOf(value) !== Object.prototype) fail()
  const descriptors = Object.getOwnPropertyDescriptors(value)
  if (Reflect.ownKeys(value).some((key) => typeof key !== 'string') ||
      Object.keys(descriptors).sort().join('\0') !== [...COMMAND_KEYS].sort().join('\0') ||
      Object.values(descriptors).some((descriptor) => !descriptor.enumerable || !('value' in descriptor))) fail()
  return Object.freeze(Object.fromEntries(
    COMMAND_KEYS.map((key) => [key, descriptors[key].value]),
  )) as Readonly<Record<(typeof COMMAND_KEYS)[number], unknown>>
}

export function decodeAnthropicPlainTextInitialSendCommandV2(
  value: unknown,
): AnthropicPlainTextInitialSendCommandV2 {
  try {
    const raw = readClosedCommand(value)
    if (typeof raw.operationId !== 'string' || typeof raw.branchId !== 'string' ||
        typeof raw.userBody !== 'string' || typeof raw.modelId !== 'string' ||
        (raw.expectedHeadMessageId !== null && typeof raw.expectedHeadMessageId !== 'string') ||
        !Array.isArray(raw.commandAttachments) ||
        new TextEncoder().encode(raw.userBody).byteLength > MAX_USER_BODY_BYTES) fail()

    const contract = readAnthropicDeveloperApiContractV2()
    const operationId = GenerationV2Identity.create('operation_id', raw.operationId)
    const branchId = ConversationGraphV2Identity.create('branch_id', raw.branchId)
    const expectedHeadMessageId = raw.expectedHeadMessageId === null
      ? null
      : ConversationGraphV2Identity.create('message_id', raw.expectedHeadMessageId)
    const modelId = GenerationV2Identity.create('model_id', raw.modelId)
    const projection = Object.freeze({
      schemaVersion: 1 as const,
      kind: 'anthropic_plain_text_initial_send' as const,
      operationId: operationId.value,
      branchId: branchId.value,
      expectedHeadMessageId: expectedHeadMessageId?.value ?? null,
      userBody: raw.userBody,
      providerId: contract.providerId,
      endpointProfileId: contract.contractFamilyId,
      modelId: modelId.value,
      commandAttachments: projectAnthropicCommandAttachmentsV2(decodeAnthropicCommandAttachmentsV2(raw.commandAttachments)),
    })
    const canonicalJson = stableSerializeProviderRequestBoundedV2(projection, MAX_COMMAND_JSON_BYTES)
    const command = Object.freeze({
      ...projection,
      operationId,
      branchId,
      expectedHeadMessageId,
      providerId: GenerationV2Identity.create('provider_id', contract.providerId),
      endpointProfileId: GenerationV2Identity.create('endpoint_profile_id', contract.contractFamilyId),
      modelId,
      commandAttachments: decodeAnthropicCommandAttachmentsV2(raw.commandAttachments),
      canonicalJson,
      requestFingerprint: sha256PreparedBytesV2(new TextEncoder().encode(canonicalJson)),
    })
    commands.add(command)
    return command
  } catch (error) {
    if (error instanceof AnthropicPlainTextInitialSendCommandV2Error) throw error
    return fail()
  }
}

export function decodeAnthropicPlainTextInitialSendCommandJsonV2(
  canonicalJson: string,
): AnthropicPlainTextInitialSendCommandV2 {
  if (typeof canonicalJson !== 'string') return fail()
  try {
    const value = JSON.parse(canonicalJson) as Record<string, unknown>
    const decoded = decodeAnthropicPlainTextInitialSendCommandV2({
      operationId: value.operationId,
      branchId: value.branchId,
      expectedHeadMessageId: value.expectedHeadMessageId,
      userBody: value.userBody,
      modelId: value.modelId,
      commandAttachments: value.commandAttachments,
    })
    if (decoded.canonicalJson !== canonicalJson) return fail()
    return decoded
  } catch (error) {
    if (error instanceof AnthropicPlainTextInitialSendCommandV2Error) throw error
    return fail()
  }
}
