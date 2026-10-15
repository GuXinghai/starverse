import {
  sha256PreparedBytesV2,
  stableSerializeProviderRequestBoundedV2,
} from '../../compiler/stableSerialize'
import {
  ConversationGraphV2Identity,
  type ConversationGraphV2Identity as GraphIdentity,
} from '../../domain/conversationGraphV2'
import { GenerationV2Identity, type GenerationV2Identity as Identity } from '../../domain/identityV2'

const MAX_COMMAND_JSON_BYTES = 21 * 1024 * 1024
const MAX_USER_BODY_BYTES = 20 * 1024 * 1024

export class DeepSeekPlainTextInitialSendCommandV2Error extends Error {
  constructor(readonly code: 'GENERATION_V2_DEEPSEEK_INITIAL_SEND_COMMAND_INVALID') {
    super(code)
    this.name = 'DeepSeekPlainTextInitialSendCommandV2Error'
  }
}

export type DeepSeekPlainTextInitialSendCommandV2 = Readonly<{
  schemaVersion: 1
  kind: 'deepseek_plain_text_initial_send'
  operationId: Identity<'operation_id'>
  branchId: GraphIdentity<'branch_id'>
  expectedHeadMessageId: GraphIdentity<'message_id'> | null
  userBody: string
  providerId: Identity<'provider_id'>
  endpointProfileId: Identity<'endpoint_profile_id'>
  modelId: Identity<'model_id'>
  commandAttachments: readonly []
  canonicalJson: string
  requestFingerprint: string
}>

const commands = new WeakSet<object>()

export function isDeepSeekPlainTextInitialSendCommandV2(
  value: unknown,
): value is DeepSeekPlainTextInitialSendCommandV2 {
  return Boolean(value && typeof value === 'object' && commands.has(value))
}

function closedObject(value: unknown): Readonly<Record<string, unknown>> {
  const keys = [
    'operationId', 'branchId', 'expectedHeadMessageId', 'userBody', 'modelId', 'commandAttachments',
  ]
  if (!value || typeof value !== 'object' || Array.isArray(value) || Object.getPrototypeOf(value) !== Object.prototype) {
    throw new DeepSeekPlainTextInitialSendCommandV2Error('GENERATION_V2_DEEPSEEK_INITIAL_SEND_COMMAND_INVALID')
  }
  const descriptors = Object.getOwnPropertyDescriptors(value)
  if (Reflect.ownKeys(value).some((key) => typeof key !== 'string') ||
      Object.keys(descriptors).sort().join('\0') !== [...keys].sort().join('\0') ||
      Object.values(descriptors).some((descriptor) => !descriptor.enumerable || !('value' in descriptor))) {
    throw new DeepSeekPlainTextInitialSendCommandV2Error('GENERATION_V2_DEEPSEEK_INITIAL_SEND_COMMAND_INVALID')
  }
  return Object.freeze(Object.fromEntries(keys.map((key) => [key, descriptors[key].value])))
}

function requiredString(value: unknown): string {
  if (typeof value !== 'string') {
    throw new DeepSeekPlainTextInitialSendCommandV2Error('GENERATION_V2_DEEPSEEK_INITIAL_SEND_COMMAND_INVALID')
  }
  return value
}

export function decodeDeepSeekPlainTextInitialSendCommandV2(
  value: unknown,
): DeepSeekPlainTextInitialSendCommandV2 {
  try {
    const input = closedObject(value)
    const attachments = input.commandAttachments
    if (!Array.isArray(attachments) || attachments.length !== 0 || Reflect.ownKeys(attachments).length !== 1) {
      throw new Error('attachments')
    }
    const operationId = GenerationV2Identity.create('operation_id', requiredString(input.operationId))
    const branchId = ConversationGraphV2Identity.create('branch_id', requiredString(input.branchId))
    const expectedHeadMessageId = input.expectedHeadMessageId === null ? null :
      ConversationGraphV2Identity.create('message_id', requiredString(input.expectedHeadMessageId))
    const modelId = GenerationV2Identity.create('model_id', requiredString(input.modelId))
    const userBody = requiredString(input.userBody)
    if (new TextEncoder().encode(userBody).byteLength > MAX_USER_BODY_BYTES) throw new Error('body')
    const projection = Object.freeze({
      schemaVersion: 1,
      kind: 'deepseek_plain_text_initial_send',
      operationId: operationId.value,
      branchId: branchId.value,
      expectedHeadMessageId: expectedHeadMessageId?.value ?? null,
      userBody,
      providerId: 'deepseek',
      endpointProfileId: 'deepseek-stable-api-v1',
      modelId: modelId.value,
      commandAttachments: Object.freeze([]),
    })
    const canonicalJson = stableSerializeProviderRequestBoundedV2(projection, MAX_COMMAND_JSON_BYTES)
    const command = Object.freeze({
      ...projection,
      operationId,
      branchId,
      expectedHeadMessageId,
      providerId: GenerationV2Identity.create('provider_id', 'deepseek'),
      endpointProfileId: GenerationV2Identity.create('endpoint_profile_id', 'deepseek-stable-api-v1'),
      modelId,
      commandAttachments: Object.freeze([]) as readonly [],
      canonicalJson,
      requestFingerprint: sha256PreparedBytesV2(new TextEncoder().encode(canonicalJson)),
    })
    commands.add(command)
    return command
  } catch (error) {
    if (error instanceof DeepSeekPlainTextInitialSendCommandV2Error) throw error
    throw new DeepSeekPlainTextInitialSendCommandV2Error('GENERATION_V2_DEEPSEEK_INITIAL_SEND_COMMAND_INVALID')
  }
}

export function decodeDeepSeekPlainTextInitialSendCommandJsonV2(
  canonicalJson: string,
): DeepSeekPlainTextInitialSendCommandV2 {
  if (typeof canonicalJson !== 'string') {
    throw new DeepSeekPlainTextInitialSendCommandV2Error('GENERATION_V2_DEEPSEEK_INITIAL_SEND_COMMAND_INVALID')
  }
  try {
    const value = JSON.parse(canonicalJson) as Record<string, unknown>
    const decoded = decodeDeepSeekPlainTextInitialSendCommandV2({
      operationId: value.operationId,
      branchId: value.branchId,
      expectedHeadMessageId: value.expectedHeadMessageId,
      userBody: value.userBody,
      modelId: value.modelId,
      commandAttachments: value.commandAttachments,
    })
    if (decoded.canonicalJson !== canonicalJson) throw new Error('noncanonical')
    return decoded
  } catch (error) {
    if (error instanceof DeepSeekPlainTextInitialSendCommandV2Error) throw error
    throw new DeepSeekPlainTextInitialSendCommandV2Error('GENERATION_V2_DEEPSEEK_INITIAL_SEND_COMMAND_INVALID')
  }
}
