import { sha256PreparedBytesV2, stableSerializeProviderRequestBoundedV2 } from '../../compiler/stableSerialize'
import { ConversationGraphV2Identity, type ConversationGraphV2Identity as GraphIdentity } from '../../domain/conversationGraphV2'
import { GenerationV2Identity, type GenerationV2Identity as Identity } from '../../domain/identityV2'
import type { AttachmentIntentV2 } from '../../domain/generationIntentV2'
import { decodeGenerationCommandAttachmentsV2, projectGenerationCommandAttachmentsV2 } from '../../domain/commandAttachmentsV2'
import { GEMINI_DEVELOPER_API_ENDPOINT_PROFILE_ID_V2 } from './verifiedEndpointProfileV2'

const MAX_COMMAND_BYTES = 21 * 1_024 * 1_024
const MAX_USER_BODY_BYTES = 20 * 1_024 * 1_024

export type GeminiPlainTextInitialSendCommandV2 = Readonly<{
  schemaVersion: 1
  kind: 'gemini_plain_text_initial_send'
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

export class GeminiPlainTextInitialSendCommandV2Error extends Error {
  constructor(readonly code: 'GENERATION_V2_GEMINI_INITIAL_SEND_COMMAND_INVALID') {
    super(code)
    this.name = 'GeminiPlainTextInitialSendCommandV2Error'
  }
}
const commands = new WeakSet<object>()
export function isGeminiPlainTextInitialSendCommandV2(value: unknown): value is GeminiPlainTextInitialSendCommandV2 {
  return Boolean(value && typeof value === 'object' && commands.has(value))
}
function fail(): never { throw new GeminiPlainTextInitialSendCommandV2Error('GENERATION_V2_GEMINI_INITIAL_SEND_COMMAND_INVALID') }

export function decodeGeminiPlainTextInitialSendCommandV2(value: unknown): GeminiPlainTextInitialSendCommandV2 {
  try {
    const keys = ['operationId', 'branchId', 'expectedHeadMessageId', 'userBody', 'modelId', 'commandAttachments']
    if (!value || typeof value !== 'object' || Array.isArray(value) || Object.getPrototypeOf(value) !== Object.prototype) return fail()
    const descriptors = Object.getOwnPropertyDescriptors(value)
    if (Reflect.ownKeys(value).some((key) => typeof key !== 'string') ||
        Object.keys(descriptors).sort().join('\0') !== [...keys].sort().join('\0') ||
        Object.values(descriptors).some((entry) => !entry.enumerable || !('value' in entry))) return fail()
    const raw = Object.fromEntries(keys.map((key) => [key, descriptors[key].value])) as Record<string, unknown>
    if (typeof raw.operationId !== 'string' || typeof raw.branchId !== 'string' || typeof raw.userBody !== 'string' ||
        raw.userBody.trim().length === 0 || typeof raw.modelId !== 'string' || raw.modelId.startsWith('models/') ||
        (raw.expectedHeadMessageId !== null && typeof raw.expectedHeadMessageId !== 'string') ||
        !Array.isArray(raw.commandAttachments) || new TextEncoder().encode(raw.userBody).byteLength > MAX_USER_BODY_BYTES) return fail()
    const operationId = GenerationV2Identity.create('operation_id', raw.operationId)
    const branchId = ConversationGraphV2Identity.create('branch_id', raw.branchId)
    const expectedHeadMessageId = raw.expectedHeadMessageId === null ? null : ConversationGraphV2Identity.create('message_id', raw.expectedHeadMessageId)
    const modelId = GenerationV2Identity.create('model_id', raw.modelId)
    const commandAttachments = decodeGenerationCommandAttachmentsV2(raw.commandAttachments)
    const projection = Object.freeze({
      schemaVersion: 1 as const, kind: 'gemini_plain_text_initial_send' as const,
      operationId: operationId.value, branchId: branchId.value,
      expectedHeadMessageId: expectedHeadMessageId?.value ?? null, userBody: raw.userBody,
      providerId: 'google_ai_studio', endpointProfileId: GEMINI_DEVELOPER_API_ENDPOINT_PROFILE_ID_V2,
      modelId: modelId.value, commandAttachments: projectGenerationCommandAttachmentsV2(commandAttachments),
    })
    const canonicalJson = stableSerializeProviderRequestBoundedV2(projection, MAX_COMMAND_BYTES)
    const command = Object.freeze({
      ...projection, operationId, branchId, expectedHeadMessageId,
      providerId: GenerationV2Identity.create('provider_id', 'google_ai_studio'),
      endpointProfileId: GenerationV2Identity.create('endpoint_profile_id', GEMINI_DEVELOPER_API_ENDPOINT_PROFILE_ID_V2),
      modelId, commandAttachments, canonicalJson,
      requestFingerprint: sha256PreparedBytesV2(new TextEncoder().encode(canonicalJson)),
    })
    commands.add(command)
    return command
  } catch (error) {
    if (error instanceof GeminiPlainTextInitialSendCommandV2Error) throw error
    return fail()
  }
}
