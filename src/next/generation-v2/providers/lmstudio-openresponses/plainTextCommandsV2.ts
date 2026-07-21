import { sha256PreparedBytesV2, stableSerializeProviderRequestBoundedV2 } from '../../compiler/stableSerialize'
import { decodeGenerationCommandAttachmentsV2, projectGenerationCommandAttachmentsV2 } from '../../domain/commandAttachmentsV2'
import { ConversationGraphV2Identity, type ConversationGraphV2Identity as GraphId } from '../../domain/conversationGraphV2'
import { GenerationV2Identity, type GenerationV2Identity as Id } from '../../domain/identityV2'
import type { AttachmentIntentV2 } from '../../domain/generationIntentV2'

type Base = Readonly<{ operationId: Id<'operation_id'>; branchId: GraphId<'branch_id'>;
  endpointProfileId: Id<'endpoint_profile_id'>; modelId: Id<'model_id'>; canonicalJson: string; requestFingerprint: string }>
export type LmStudioPlainTextInitialCommandV2 = Base & Readonly<{ kind: 'lmstudio_plain_text_initial';
  expectedHeadMessageId: GraphId<'message_id'> | null; userBody: string; commandAttachments: readonly AttachmentIntentV2[] }>
export type LmStudioPlainTextRetryCommandV2 = Readonly<{ kind: 'lmstudio_plain_text_retry'; actionKind: 'retry_as_new' | 'retry_replace';
  operationId: Id<'operation_id'>; branchId: GraphId<'branch_id'>; questionId: GraphId<'question_id'>;
  targetAnswerRootId: GraphId<'answer_root_id'>; expectedHeadMessageId: GraphId<'message_id'>;
  canonicalJson: string; requestFingerprint: string }>
export type LmStudioPlainTextRegenerateCommandV2 = Base & Readonly<{ kind: 'lmstudio_plain_text_regenerate';
  questionId: GraphId<'question_id'>; expectedHeadMessageId: GraphId<'message_id'>; commandAttachments: readonly AttachmentIntentV2[] }>
export type LmStudioPlainTextEditResendCommandV2 = Base & Readonly<{ kind: 'lmstudio_plain_text_edit_resend'; mode: 'fork' | 'replace';
  sourceQuestionId: GraphId<'question_id'>; sourceAnswerRootId: GraphId<'answer_root_id'>;
  expectedHeadMessageId: GraphId<'message_id'>; userBody: string; commandAttachments: readonly AttachmentIntentV2[] }>

const initialBrand = new WeakSet<object>(); const retryBrand = new WeakSet<object>()
const regenerateBrand = new WeakSet<object>(); const editBrand = new WeakSet<object>()
type Raw = Readonly<Record<string, unknown>>
function object(value: unknown, keys: readonly string[]): Raw {
  if (!value || typeof value !== 'object' || Array.isArray(value) || Object.getPrototypeOf(value) !== Object.prototype) throw new Error('invalid')
  const descriptors = Object.getOwnPropertyDescriptors(value)
  if (Reflect.ownKeys(value).some((key) => typeof key !== 'string') || Object.keys(descriptors).sort().join('\0') !== [...keys].sort().join('\0') ||
      Object.values(descriptors).some((item) => !item.enumerable || !('value' in item) || item.value === undefined)) throw new Error('invalid')
  return Object.freeze(Object.fromEntries(keys.map((key) => [key, descriptors[key].value])))
}
function text(value: unknown, max = 512): string {
  if (typeof value !== 'string' || value.length < 1 || value.length > max || value.trim() !== value) throw new Error('invalid')
  return value
}
function body(value: unknown): string { if (typeof value !== 'string' || value.trim().length === 0 || new TextEncoder().encode(value).byteLength > 20 * 1024 * 1024) throw new Error('invalid'); return value }
function fingerprint(projection: object) { const canonicalJson = stableSerializeProviderRequestBoundedV2(projection, 21 * 1024 * 1024)
  return Object.freeze({ canonicalJson, requestFingerprint: sha256PreparedBytesV2(new TextEncoder().encode(canonicalJson)) }) }
function base(raw: Raw) { return Object.freeze({ operationId: GenerationV2Identity.create('operation_id', text(raw.operationId)),
  branchId: ConversationGraphV2Identity.create('branch_id', text(raw.branchId)),
  endpointProfileId: GenerationV2Identity.create('endpoint_profile_id', text(raw.endpointProfileId)),
  modelId: GenerationV2Identity.create('model_id', text(raw.modelId)) }) }

export function decodeLmStudioPlainTextInitialCommandV2(value: unknown): LmStudioPlainTextInitialCommandV2 {
  try { const raw = object(value, ['operationId', 'branchId', 'expectedHeadMessageId', 'userBody', 'endpointProfileId', 'modelId', 'commandAttachments'])
    const ids = base(raw); const userBody = body(raw.userBody); const expectedHeadMessageId = raw.expectedHeadMessageId === null ? null : ConversationGraphV2Identity.create('message_id', text(raw.expectedHeadMessageId))
    const commandAttachments = decodeGenerationCommandAttachmentsV2(raw.commandAttachments)
    const projection = { schemaVersion: 1, kind: 'lmstudio_plain_text_initial', operationId: ids.operationId.value,
      branchId: ids.branchId.value, expectedHeadMessageId: expectedHeadMessageId?.value ?? null, userBody,
      endpointProfileId: ids.endpointProfileId.value, modelId: ids.modelId.value,
      commandAttachments: projectGenerationCommandAttachmentsV2(commandAttachments) }
    const result = Object.freeze({ ...projection, kind: 'lmstudio_plain_text_initial' as const, ...ids, expectedHeadMessageId,
      userBody, commandAttachments, ...fingerprint(projection) }); initialBrand.add(result); return result
  } catch { throw new Error('GENERATION_V2_LMSTUDIO_INITIAL_COMMAND_INVALID') }
}
export function decodeLmStudioPlainTextRetryCommandV2(value: unknown): LmStudioPlainTextRetryCommandV2 {
  try { const raw = object(value, ['actionKind', 'operationId', 'branchId', 'questionId', 'targetAnswerRootId', 'expectedHeadMessageId'])
    if (raw.actionKind !== 'retry_as_new' && raw.actionKind !== 'retry_replace') throw new Error('invalid')
    const operationId = GenerationV2Identity.create('operation_id', text(raw.operationId)); const branchId = ConversationGraphV2Identity.create('branch_id', text(raw.branchId))
    const questionId = ConversationGraphV2Identity.create('question_id', text(raw.questionId)); const targetAnswerRootId = ConversationGraphV2Identity.create('answer_root_id', text(raw.targetAnswerRootId))
    const expectedHeadMessageId = ConversationGraphV2Identity.create('message_id', text(raw.expectedHeadMessageId)); if (expectedHeadMessageId.value !== targetAnswerRootId.value) throw new Error('invalid')
    const projection = { schemaVersion: 1, kind: 'lmstudio_plain_text_retry', actionKind: raw.actionKind,
      operationId: operationId.value, branchId: branchId.value, questionId: questionId.value,
      targetAnswerRootId: targetAnswerRootId.value, expectedHeadMessageId: expectedHeadMessageId.value }
    const result = Object.freeze({ ...projection, kind: 'lmstudio_plain_text_retry' as const, actionKind: raw.actionKind,
      operationId, branchId, questionId, targetAnswerRootId, expectedHeadMessageId, ...fingerprint(projection) }) as LmStudioPlainTextRetryCommandV2
    retryBrand.add(result); return result
  } catch { throw new Error('GENERATION_V2_LMSTUDIO_RETRY_COMMAND_INVALID') }
}
export function decodeLmStudioPlainTextRegenerateCommandV2(value: unknown): LmStudioPlainTextRegenerateCommandV2 {
  try { const raw = object(value, ['operationId', 'branchId', 'questionId', 'expectedHeadMessageId', 'endpointProfileId', 'modelId', 'commandAttachments'])
    const ids = base(raw); const questionId = ConversationGraphV2Identity.create('question_id', text(raw.questionId));
    const expectedHeadMessageId = ConversationGraphV2Identity.create('message_id', text(raw.expectedHeadMessageId)); const commandAttachments = decodeGenerationCommandAttachmentsV2(raw.commandAttachments)
    const projection = { schemaVersion: 1, kind: 'lmstudio_plain_text_regenerate', operationId: ids.operationId.value,
      branchId: ids.branchId.value, questionId: questionId.value, expectedHeadMessageId: expectedHeadMessageId.value,
      endpointProfileId: ids.endpointProfileId.value, modelId: ids.modelId.value, commandAttachments: projectGenerationCommandAttachmentsV2(commandAttachments) }
    const result = Object.freeze({ ...projection, kind: 'lmstudio_plain_text_regenerate' as const, ...ids, questionId,
      expectedHeadMessageId, commandAttachments, ...fingerprint(projection) }); regenerateBrand.add(result); return result
  } catch { throw new Error('GENERATION_V2_LMSTUDIO_REGENERATE_COMMAND_INVALID') }
}
export function decodeLmStudioPlainTextEditResendCommandV2(value: unknown): LmStudioPlainTextEditResendCommandV2 {
  try { const raw = object(value, ['operationId', 'mode', 'branchId', 'sourceQuestionId', 'sourceAnswerRootId', 'expectedHeadMessageId', 'userBody', 'endpointProfileId', 'modelId', 'commandAttachments'])
    if (raw.mode !== 'fork' && raw.mode !== 'replace') throw new Error('invalid'); const ids = base(raw); const userBody = body(raw.userBody)
    const sourceQuestionId = ConversationGraphV2Identity.create('question_id', text(raw.sourceQuestionId)); const sourceAnswerRootId = ConversationGraphV2Identity.create('answer_root_id', text(raw.sourceAnswerRootId))
    const expectedHeadMessageId = ConversationGraphV2Identity.create('message_id', text(raw.expectedHeadMessageId)); const commandAttachments = decodeGenerationCommandAttachmentsV2(raw.commandAttachments)
    const projection = { schemaVersion: 1, kind: 'lmstudio_plain_text_edit_resend', mode: raw.mode,
      operationId: ids.operationId.value, branchId: ids.branchId.value, sourceQuestionId: sourceQuestionId.value,
      sourceAnswerRootId: sourceAnswerRootId.value, expectedHeadMessageId: expectedHeadMessageId.value, userBody,
      endpointProfileId: ids.endpointProfileId.value, modelId: ids.modelId.value, commandAttachments: projectGenerationCommandAttachmentsV2(commandAttachments) }
    const result = Object.freeze({ ...projection, kind: 'lmstudio_plain_text_edit_resend' as const, mode: raw.mode,
      ...ids, sourceQuestionId, sourceAnswerRootId, expectedHeadMessageId, userBody, commandAttachments,
      ...fingerprint(projection) }) as LmStudioPlainTextEditResendCommandV2; editBrand.add(result); return result
  } catch { throw new Error('GENERATION_V2_LMSTUDIO_EDIT_RESEND_COMMAND_INVALID') }
}
export function isLmStudioPlainTextInitialCommandV2(value: unknown): value is LmStudioPlainTextInitialCommandV2 { return Boolean(value && typeof value === 'object' && initialBrand.has(value)) }
export function isLmStudioPlainTextRetryCommandV2(value: unknown): value is LmStudioPlainTextRetryCommandV2 { return Boolean(value && typeof value === 'object' && retryBrand.has(value)) }
export function isLmStudioPlainTextRegenerateCommandV2(value: unknown): value is LmStudioPlainTextRegenerateCommandV2 { return Boolean(value && typeof value === 'object' && regenerateBrand.has(value)) }
export function isLmStudioPlainTextEditResendCommandV2(value: unknown): value is LmStudioPlainTextEditResendCommandV2 { return Boolean(value && typeof value === 'object' && editBrand.has(value)) }
