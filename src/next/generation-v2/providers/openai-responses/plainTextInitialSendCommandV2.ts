import { sha256PreparedBytesV2, stableSerializeProviderRequestBoundedV2 } from '../../compiler/stableSerialize'
import { ConversationGraphV2Identity, type ConversationGraphV2Identity as GraphIdentity } from '../../domain/conversationGraphV2'
import { GenerationV2Identity, type GenerationV2Identity as Identity } from '../../domain/identityV2'

const MAX_COMMAND_JSON_BYTES = 21 * 1024 * 1024
const MAX_USER_BODY_BYTES = 20 * 1024 * 1024

export class OpenAIResponsesPlainTextInitialSendCommandV2Error extends Error {
  constructor(readonly code: 'GENERATION_V2_OPENAI_INITIAL_SEND_COMMAND_INVALID') {
    super(code)
    this.name = 'OpenAIResponsesPlainTextInitialSendCommandV2Error'
  }
}

export type OpenAIResponsesPlainTextInitialSendCommandV2 = Readonly<{
  schemaVersion: 1
  kind: 'openai_responses_plain_text_initial_send'
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

export function isOpenAIResponsesPlainTextInitialSendCommandV2(
  value: unknown,
): value is OpenAIResponsesPlainTextInitialSendCommandV2 {
  return Boolean(value && typeof value === 'object' && commands.has(value))
}

function fail(): never {
  throw new OpenAIResponsesPlainTextInitialSendCommandV2Error('GENERATION_V2_OPENAI_INITIAL_SEND_COMMAND_INVALID')
}

export function decodeOpenAIResponsesPlainTextInitialSendCommandV2(
  value: unknown,
): OpenAIResponsesPlainTextInitialSendCommandV2 {
  try {
    const keys = ['operationId', 'branchId', 'expectedHeadMessageId', 'userBody', 'modelId', 'commandAttachments']
    if (!value || typeof value !== 'object' || Array.isArray(value) || Object.getPrototypeOf(value) !== Object.prototype) return fail()
    const descriptors = Object.getOwnPropertyDescriptors(value)
    if (Reflect.ownKeys(value).some((key) => typeof key !== 'string') ||
        Object.keys(descriptors).sort().join('\0') !== [...keys].sort().join('\0') ||
        Object.values(descriptors).some((descriptor) => !descriptor.enumerable || !('value' in descriptor))) return fail()
    const raw = Object.fromEntries(keys.map((key) => [key, descriptors[key].value])) as Record<string, unknown>
    if (typeof raw.operationId !== 'string' || typeof raw.branchId !== 'string' || typeof raw.userBody !== 'string' ||
        typeof raw.modelId !== 'string' || (raw.expectedHeadMessageId !== null && typeof raw.expectedHeadMessageId !== 'string') ||
        !Array.isArray(raw.commandAttachments) || raw.commandAttachments.length !== 0 ||
        Reflect.ownKeys(raw.commandAttachments).length !== 1 ||
        new TextEncoder().encode(raw.userBody).byteLength > MAX_USER_BODY_BYTES) return fail()
    const operationId = GenerationV2Identity.create('operation_id', raw.operationId)
    const branchId = ConversationGraphV2Identity.create('branch_id', raw.branchId)
    const expectedHeadMessageId = raw.expectedHeadMessageId === null ? null
      : ConversationGraphV2Identity.create('message_id', raw.expectedHeadMessageId)
    const modelId = GenerationV2Identity.create('model_id', raw.modelId)
    const projection = Object.freeze({
      schemaVersion: 1, kind: 'openai_responses_plain_text_initial_send' as const,
      operationId: operationId.value, branchId: branchId.value,
      expectedHeadMessageId: expectedHeadMessageId?.value ?? null, userBody: raw.userBody,
      providerId: 'openai_responses', endpointProfileId: 'openai-api-v1', modelId: modelId.value,
      commandAttachments: Object.freeze([]),
    })
    const canonicalJson = stableSerializeProviderRequestBoundedV2(projection, MAX_COMMAND_JSON_BYTES)
    const command = Object.freeze({
      ...projection, operationId, branchId, expectedHeadMessageId,
      providerId: GenerationV2Identity.create('provider_id', 'openai_responses'),
      endpointProfileId: GenerationV2Identity.create('endpoint_profile_id', 'openai-api-v1'),
      modelId, commandAttachments: Object.freeze([]) as readonly [], canonicalJson,
      requestFingerprint: sha256PreparedBytesV2(new TextEncoder().encode(canonicalJson)),
    })
    commands.add(command)
    return command
  } catch (error) {
    if (error instanceof OpenAIResponsesPlainTextInitialSendCommandV2Error) throw error
    return fail()
  }
}

export function decodeOpenAIResponsesPlainTextInitialSendCommandJsonV2(
  canonicalJson: string,
): OpenAIResponsesPlainTextInitialSendCommandV2 {
  if (typeof canonicalJson !== 'string') return fail()
  try {
    const value = JSON.parse(canonicalJson) as Record<string, unknown>
    const decoded = decodeOpenAIResponsesPlainTextInitialSendCommandV2({
      operationId: value.operationId, branchId: value.branchId,
      expectedHeadMessageId: value.expectedHeadMessageId, userBody: value.userBody,
      modelId: value.modelId, commandAttachments: value.commandAttachments,
    })
    if (decoded.canonicalJson !== canonicalJson) return fail()
    return decoded
  } catch (error) {
    if (error instanceof OpenAIResponsesPlainTextInitialSendCommandV2Error) throw error
    return fail()
  }
}
