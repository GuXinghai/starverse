import { sha256PreparedBytesV2, stableSerializeProviderRequestBoundedV2 } from '../../compiler/stableSerialize'
import { ConversationGraphV2Identity, type ConversationGraphV2Identity as GraphIdentity } from '../../domain/conversationGraphV2'
import { GenerationV2Identity, type GenerationV2Identity as Identity } from '../../domain/identityV2'
import type { AttachmentIntentV2 } from '../../domain/generationIntentV2'
import { decodeGenerationCommandAttachmentsV2, projectGenerationCommandAttachmentsV2 } from '../../domain/commandAttachmentsV2'
import { OPENROUTER_FIRST_PARTY_ENDPOINT_PROFILE_ID_V2 } from './verifiedFirstPartyEndpointProfileV2'

const MAX_COMMAND_BYTES = 21 * 1024 * 1024
const MAX_BODY_BYTES = 20 * 1024 * 1024
type Raw = Readonly<Record<string, unknown>>
function closed(value: unknown, keys: readonly string[]): Raw {
  if (!value || typeof value !== 'object' || Array.isArray(value) || Object.getPrototypeOf(value) !== Object.prototype) throw new Error('invalid')
  const descriptors = Object.getOwnPropertyDescriptors(value)
  if (Reflect.ownKeys(value).some((key) => typeof key !== 'string') ||
      Object.keys(descriptors).sort().join('\0') !== [...keys].sort().join('\0') ||
      Object.values(descriptors).some((entry) => !entry.enumerable || !('value' in entry) || entry.value === undefined)) throw new Error('invalid')
  return Object.freeze(Object.fromEntries(keys.map((key) => [key, descriptors[key].value])))
}
function text(value: unknown): string { if (typeof value !== 'string') throw new Error('invalid'); return value }
function fingerprint(projection: object) {
  const canonicalJson = stableSerializeProviderRequestBoundedV2(projection, MAX_COMMAND_BYTES)
  return Object.freeze({ canonicalJson, requestFingerprint: sha256PreparedBytesV2(new TextEncoder().encode(canonicalJson)) })
}

export type OpenRouterPlainTextRetryCommandV2 = Readonly<{
  schemaVersion: 1; kind: 'openrouter_plain_text_retry'; actionKind: 'retry_as_new' | 'retry_replace'
  operationId: Identity<'operation_id'>; clientActionId: string; sourceBranchId: GraphIdentity<'branch_id'>; questionId: GraphIdentity<'question_id'>
  sourceAnswerId: GraphIdentity<'answer_root_id'>; expectedHeadMessageId: GraphIdentity<'message_id'>
  canonicalJson: string; requestFingerprint: string
}>
const retries = new WeakSet<object>()
export function isOpenRouterPlainTextRetryCommandV2(value: unknown): value is OpenRouterPlainTextRetryCommandV2 {
  return Boolean(value && typeof value === 'object' && retries.has(value))
}
export function decodeOpenRouterPlainTextRetryCommandV2(value: unknown): OpenRouterPlainTextRetryCommandV2 {
  try {
    const raw = closed(value, ['actionKind', 'operationId', 'clientActionId', 'sourceBranchId', 'questionId', 'sourceAnswerId', 'expectedHeadMessageId'])
    if (raw.actionKind !== 'retry_as_new' && raw.actionKind !== 'retry_replace') throw new Error('invalid')
    const operationId = GenerationV2Identity.create('operation_id', text(raw.operationId))
    const clientActionId = text(raw.clientActionId)
    if (clientActionId !== operationId.value) throw new Error('invalid')
    const sourceBranchId = ConversationGraphV2Identity.create('branch_id', text(raw.sourceBranchId))
    const questionId = ConversationGraphV2Identity.create('question_id', text(raw.questionId))
    const sourceAnswerId = ConversationGraphV2Identity.create('answer_root_id', text(raw.sourceAnswerId))
    const expectedHeadMessageId = ConversationGraphV2Identity.create('message_id', text(raw.expectedHeadMessageId))
    const projection = Object.freeze({ schemaVersion: 1 as const, kind: 'openrouter_plain_text_retry' as const,
      actionKind: raw.actionKind, operationId: operationId.value, clientActionId,
      sourceBranchId: sourceBranchId.value, questionId: questionId.value,
      sourceAnswerId: sourceAnswerId.value, expectedHeadMessageId: expectedHeadMessageId.value })
    const command = Object.freeze({ ...projection, actionKind: raw.actionKind, operationId, clientActionId,
      sourceBranchId, questionId,
      sourceAnswerId, expectedHeadMessageId, ...fingerprint(projection) }) as OpenRouterPlainTextRetryCommandV2
    retries.add(command); return command
  } catch { throw new Error('GENERATION_V2_OPENROUTER_RETRY_COMMAND_INVALID') }
}

export type OpenRouterPlainTextRegenerateCommandV2 = Readonly<{
  schemaVersion: 1; kind: 'openrouter_plain_text_regenerate_question'; operationId: Identity<'operation_id'>; clientActionId: string
  sourceBranchId: GraphIdentity<'branch_id'>; questionId: GraphIdentity<'question_id'>; sourceAnswerId: GraphIdentity<'answer_root_id'>
  expectedHeadMessageId: GraphIdentity<'message_id'>
  providerId: Identity<'provider_id'>; endpointProfileId: Identity<'endpoint_profile_id'>; modelId: Identity<'model_id'>
  commandAttachments: readonly AttachmentIntentV2[]; canonicalJson: string; requestFingerprint: string
}>
const regenerates = new WeakSet<object>()
export function isOpenRouterPlainTextRegenerateCommandV2(value: unknown): value is OpenRouterPlainTextRegenerateCommandV2 {
  return Boolean(value && typeof value === 'object' && regenerates.has(value))
}
export function decodeOpenRouterPlainTextRegenerateCommandV2(value: unknown): OpenRouterPlainTextRegenerateCommandV2 {
  try {
    const raw = closed(value, ['operationId', 'clientActionId', 'sourceBranchId', 'questionId', 'sourceAnswerId', 'expectedHeadMessageId', 'modelId', 'commandAttachments'])
    const operationId = GenerationV2Identity.create('operation_id', text(raw.operationId))
    const clientActionId = text(raw.clientActionId)
    if (clientActionId !== operationId.value) throw new Error('invalid')
    const sourceBranchId = ConversationGraphV2Identity.create('branch_id', text(raw.sourceBranchId))
    const questionId = ConversationGraphV2Identity.create('question_id', text(raw.questionId))
    const sourceAnswerId = ConversationGraphV2Identity.create('answer_root_id', text(raw.sourceAnswerId))
    const expectedHeadMessageId = ConversationGraphV2Identity.create('message_id', text(raw.expectedHeadMessageId))
    const modelId = GenerationV2Identity.create('model_id', text(raw.modelId))
    const commandAttachments = decodeGenerationCommandAttachmentsV2(raw.commandAttachments)
    const projection = Object.freeze({ schemaVersion: 1 as const, kind: 'openrouter_plain_text_regenerate_question' as const,
      operationId: operationId.value, clientActionId, sourceBranchId: sourceBranchId.value,
      questionId: questionId.value, sourceAnswerId: sourceAnswerId.value,
      expectedHeadMessageId: expectedHeadMessageId.value, providerId: 'openrouter',
      endpointProfileId: OPENROUTER_FIRST_PARTY_ENDPOINT_PROFILE_ID_V2, modelId: modelId.value,
      commandAttachments: projectGenerationCommandAttachmentsV2(commandAttachments) })
    const command = Object.freeze({ ...projection, operationId, clientActionId, sourceBranchId, questionId,
      sourceAnswerId, expectedHeadMessageId,
      providerId: GenerationV2Identity.create('provider_id', 'openrouter'),
      endpointProfileId: GenerationV2Identity.create('endpoint_profile_id', OPENROUTER_FIRST_PARTY_ENDPOINT_PROFILE_ID_V2),
      modelId, commandAttachments, ...fingerprint(projection) })
    regenerates.add(command); return command
  } catch { throw new Error('GENERATION_V2_OPENROUTER_REGENERATE_COMMAND_INVALID') }
}

export type OpenRouterPlainTextEditResendCommandV2 = Readonly<{
  schemaVersion: 1; kind: 'openrouter_plain_text_edit_resend'; operationId: Identity<'operation_id'>; clientActionId: string
  sourceBranchId: GraphIdentity<'branch_id'>; sourceQuestionId: GraphIdentity<'question_id'>; sourceAnswerRootId: GraphIdentity<'answer_root_id'>
  expectedHeadMessageId: GraphIdentity<'message_id'>; userBody: string; providerId: Identity<'provider_id'>
  endpointProfileId: Identity<'endpoint_profile_id'>; modelId: Identity<'model_id'>; commandAttachments: readonly AttachmentIntentV2[]
  canonicalJson: string; requestFingerprint: string
}>
const edits = new WeakSet<object>()
export function isOpenRouterPlainTextEditResendCommandV2(value: unknown): value is OpenRouterPlainTextEditResendCommandV2 {
  return Boolean(value && typeof value === 'object' && edits.has(value))
}
export function decodeOpenRouterPlainTextEditResendCommandV2(value: unknown): OpenRouterPlainTextEditResendCommandV2 {
  try {
    const raw = closed(value, ['operationId', 'clientActionId', 'sourceBranchId', 'sourceQuestionId', 'sourceAnswerRootId', 'expectedHeadMessageId', 'userBody', 'modelId', 'commandAttachments'])
    const userBody = text(raw.userBody)
    if (userBody.trim().length === 0 || new TextEncoder().encode(userBody).byteLength > MAX_BODY_BYTES) throw new Error('invalid')
    const operationId = GenerationV2Identity.create('operation_id', text(raw.operationId))
    const clientActionId = text(raw.clientActionId)
    if (clientActionId !== operationId.value) throw new Error('invalid')
    const sourceBranchId = ConversationGraphV2Identity.create('branch_id', text(raw.sourceBranchId))
    const sourceQuestionId = ConversationGraphV2Identity.create('question_id', text(raw.sourceQuestionId))
    const sourceAnswerRootId = ConversationGraphV2Identity.create('answer_root_id', text(raw.sourceAnswerRootId))
    const expectedHeadMessageId = ConversationGraphV2Identity.create('message_id', text(raw.expectedHeadMessageId))
    const modelId = GenerationV2Identity.create('model_id', text(raw.modelId))
    const commandAttachments = decodeGenerationCommandAttachmentsV2(raw.commandAttachments)
    const projection = Object.freeze({ schemaVersion: 1 as const, kind: 'openrouter_plain_text_edit_resend' as const,
      operationId: operationId.value, clientActionId, sourceBranchId: sourceBranchId.value,
      sourceQuestionId: sourceQuestionId.value,
      sourceAnswerRootId: sourceAnswerRootId.value, expectedHeadMessageId: expectedHeadMessageId.value, userBody,
      providerId: 'openrouter', endpointProfileId: OPENROUTER_FIRST_PARTY_ENDPOINT_PROFILE_ID_V2, modelId: modelId.value,
      commandAttachments: projectGenerationCommandAttachmentsV2(commandAttachments) })
    const command = Object.freeze({ ...projection, operationId, clientActionId, sourceBranchId,
      sourceQuestionId, sourceAnswerRootId,
      expectedHeadMessageId, providerId: GenerationV2Identity.create('provider_id', 'openrouter'),
      endpointProfileId: GenerationV2Identity.create('endpoint_profile_id', OPENROUTER_FIRST_PARTY_ENDPOINT_PROFILE_ID_V2),
      modelId, commandAttachments, ...fingerprint(projection) }) as OpenRouterPlainTextEditResendCommandV2
    edits.add(command); return command
  } catch { throw new Error('GENERATION_V2_OPENROUTER_EDIT_RESEND_COMMAND_INVALID') }
}
