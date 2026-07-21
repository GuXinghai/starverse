import { sha256PreparedBytesV2, stableSerializeProviderRequestBoundedV2 } from '../compiler/stableSerialize'
import { decodeGenerationCommandAttachmentsV2, projectGenerationCommandAttachmentsV2 } from './commandAttachmentsV2'
import { ConversationGraphV2Identity, type ConversationGraphV2Identity as GraphId } from './conversationGraphV2'
import { GenerationV2Identity, type GenerationV2Identity as Id } from './identityV2'
import type { AttachmentIntentV2 } from './generationIntentV2'

type Base<K extends string> = Readonly<{ kind: K; operationId: Id<'operation_id'>; branchId: GraphId<'branch_id'>;
  endpointProfileId: Id<'endpoint_profile_id'>; modelId: Id<'model_id'>; canonicalJson: string; requestFingerprint: string }>
export type FixedLocalTextInitialCommandV2<K extends string> = Base<K> & Readonly<{
  expectedHeadMessageId: GraphId<'message_id'> | null; userBody: string; commandAttachments: readonly AttachmentIntentV2[] }>
export type FixedLocalTextRetryCommandV2<K extends string> = Readonly<{ kind: K; actionKind: 'retry_as_new' | 'retry_replace';
  operationId: Id<'operation_id'>; branchId: GraphId<'branch_id'>; questionId: GraphId<'question_id'>;
  targetAnswerRootId: GraphId<'answer_root_id'>; expectedHeadMessageId: GraphId<'message_id'>;
  canonicalJson: string; requestFingerprint: string }>
export type FixedLocalTextRegenerateCommandV2<K extends string> = Base<K> & Readonly<{
  questionId: GraphId<'question_id'>; expectedHeadMessageId: GraphId<'message_id'>; commandAttachments: readonly AttachmentIntentV2[] }>
export type FixedLocalTextEditResendCommandV2<K extends string> = Base<K> & Readonly<{ mode: 'fork' | 'replace';
  sourceQuestionId: GraphId<'question_id'>; sourceAnswerRootId: GraphId<'answer_root_id'>;
  expectedHeadMessageId: GraphId<'message_id'>; userBody: string; commandAttachments: readonly AttachmentIntentV2[] }>

type Raw = Readonly<Record<string, unknown>>
function closed(value: unknown, keys: readonly string[]): Raw {
  if (!value || typeof value !== 'object' || Array.isArray(value) || Object.getPrototypeOf(value) !== Object.prototype) throw new Error('invalid')
  const descriptors = Object.getOwnPropertyDescriptors(value)
  if (Reflect.ownKeys(value).some((key) => typeof key !== 'string') || Object.keys(descriptors).sort().join('\0') !== [...keys].sort().join('\0') ||
      Object.values(descriptors).some((item) => !item.enumerable || !('value' in item) || item.value === undefined)) throw new Error('invalid')
  return Object.freeze(Object.fromEntries(keys.map((key) => [key, descriptors[key].value])))
}
function text(value: unknown, max = 512): string {
  if (typeof value !== 'string' || value.length === 0 || value.length > max || value.trim() !== value) throw new Error('invalid')
  return value
}
function body(value: unknown): string {
  if (typeof value !== 'string' || value.trim().length === 0 || new TextEncoder().encode(value).byteLength > 20 * 1024 * 1024) throw new Error('invalid')
  return value
}
function fingerprint(projection: object) {
  const canonicalJson = stableSerializeProviderRequestBoundedV2(projection, 21 * 1024 * 1024)
  return Object.freeze({ canonicalJson, requestFingerprint: sha256PreparedBytesV2(new TextEncoder().encode(canonicalJson)) })
}
function base(raw: Raw) { return Object.freeze({ operationId: GenerationV2Identity.create('operation_id', text(raw.operationId)),
  branchId: ConversationGraphV2Identity.create('branch_id', text(raw.branchId)),
  endpointProfileId: GenerationV2Identity.create('endpoint_profile_id', text(raw.endpointProfileId)),
  modelId: GenerationV2Identity.create('model_id', text(raw.modelId)) }) }

export function createFixedLocalTextCommandDecodersV2<const K extends Readonly<{
  initial: string; retry: string; regenerate: string; editResend: string; errorPrefix: string
}>>(kinds: K) {
  const initialBrand = new WeakSet<object>(); const retryBrand = new WeakSet<object>()
  const regenerateBrand = new WeakSet<object>(); const editBrand = new WeakSet<object>()
  const decodeInitial = (value: unknown): FixedLocalTextInitialCommandV2<K['initial']> => { try {
    const raw = closed(value, ['operationId','branchId','expectedHeadMessageId','userBody','endpointProfileId','modelId','commandAttachments'])
    const ids = base(raw); const userBody = body(raw.userBody); const expectedHeadMessageId = raw.expectedHeadMessageId === null ? null : ConversationGraphV2Identity.create('message_id', text(raw.expectedHeadMessageId))
    const commandAttachments = decodeGenerationCommandAttachmentsV2(raw.commandAttachments)
    const projection = { schemaVersion: 1, kind: kinds.initial, operationId: ids.operationId.value, branchId: ids.branchId.value,
      expectedHeadMessageId: expectedHeadMessageId?.value ?? null, userBody, endpointProfileId: ids.endpointProfileId.value,
      modelId: ids.modelId.value, commandAttachments: projectGenerationCommandAttachmentsV2(commandAttachments) }
    const result = Object.freeze({ ...projection, kind: kinds.initial, ...ids, expectedHeadMessageId, userBody, commandAttachments, ...fingerprint(projection) })
    initialBrand.add(result); return result
  } catch { throw new Error(`${kinds.errorPrefix}_INITIAL_COMMAND_INVALID`) } }
  const decodeRetry = (value: unknown): FixedLocalTextRetryCommandV2<K['retry']> => { try {
    const raw = closed(value, ['actionKind','operationId','branchId','questionId','targetAnswerRootId','expectedHeadMessageId'])
    if (raw.actionKind !== 'retry_as_new' && raw.actionKind !== 'retry_replace') throw new Error('invalid')
    const operationId = GenerationV2Identity.create('operation_id', text(raw.operationId)); const branchId = ConversationGraphV2Identity.create('branch_id', text(raw.branchId))
    const questionId = ConversationGraphV2Identity.create('question_id', text(raw.questionId)); const targetAnswerRootId = ConversationGraphV2Identity.create('answer_root_id', text(raw.targetAnswerRootId))
    const expectedHeadMessageId = ConversationGraphV2Identity.create('message_id', text(raw.expectedHeadMessageId)); if (expectedHeadMessageId.value !== targetAnswerRootId.value) throw new Error('invalid')
    const projection = { schemaVersion: 1, kind: kinds.retry, actionKind: raw.actionKind, operationId: operationId.value,
      branchId: branchId.value, questionId: questionId.value, targetAnswerRootId: targetAnswerRootId.value,
      expectedHeadMessageId: expectedHeadMessageId.value }
    const result = Object.freeze({ ...projection, kind: kinds.retry, actionKind: raw.actionKind, operationId, branchId,
      questionId, targetAnswerRootId, expectedHeadMessageId, ...fingerprint(projection) }) as FixedLocalTextRetryCommandV2<K['retry']>
    retryBrand.add(result); return result
  } catch { throw new Error(`${kinds.errorPrefix}_RETRY_COMMAND_INVALID`) } }
  const decodeRegenerate = (value: unknown): FixedLocalTextRegenerateCommandV2<K['regenerate']> => { try {
    const raw = closed(value, ['operationId','branchId','questionId','expectedHeadMessageId','endpointProfileId','modelId','commandAttachments'])
    const ids = base(raw); const questionId = ConversationGraphV2Identity.create('question_id', text(raw.questionId));
    const expectedHeadMessageId = ConversationGraphV2Identity.create('message_id', text(raw.expectedHeadMessageId)); const commandAttachments = decodeGenerationCommandAttachmentsV2(raw.commandAttachments)
    const projection = { schemaVersion: 1, kind: kinds.regenerate, operationId: ids.operationId.value, branchId: ids.branchId.value,
      questionId: questionId.value, expectedHeadMessageId: expectedHeadMessageId.value, endpointProfileId: ids.endpointProfileId.value,
      modelId: ids.modelId.value, commandAttachments: projectGenerationCommandAttachmentsV2(commandAttachments) }
    const result = Object.freeze({ ...projection, kind: kinds.regenerate, ...ids, questionId, expectedHeadMessageId, commandAttachments, ...fingerprint(projection) })
    regenerateBrand.add(result); return result
  } catch { throw new Error(`${kinds.errorPrefix}_REGENERATE_COMMAND_INVALID`) } }
  const decodeEditResend = (value: unknown): FixedLocalTextEditResendCommandV2<K['editResend']> => { try {
    const raw = closed(value, ['operationId','mode','branchId','sourceQuestionId','sourceAnswerRootId','expectedHeadMessageId','userBody','endpointProfileId','modelId','commandAttachments'])
    if (raw.mode !== 'fork' && raw.mode !== 'replace') throw new Error('invalid'); const ids = base(raw); const userBody = body(raw.userBody)
    const sourceQuestionId = ConversationGraphV2Identity.create('question_id', text(raw.sourceQuestionId)); const sourceAnswerRootId = ConversationGraphV2Identity.create('answer_root_id', text(raw.sourceAnswerRootId))
    const expectedHeadMessageId = ConversationGraphV2Identity.create('message_id', text(raw.expectedHeadMessageId)); const commandAttachments = decodeGenerationCommandAttachmentsV2(raw.commandAttachments)
    const projection = { schemaVersion: 1, kind: kinds.editResend, mode: raw.mode, operationId: ids.operationId.value,
      branchId: ids.branchId.value, sourceQuestionId: sourceQuestionId.value, sourceAnswerRootId: sourceAnswerRootId.value,
      expectedHeadMessageId: expectedHeadMessageId.value, userBody, endpointProfileId: ids.endpointProfileId.value,
      modelId: ids.modelId.value, commandAttachments: projectGenerationCommandAttachmentsV2(commandAttachments) }
    const result = Object.freeze({ ...projection, kind: kinds.editResend, mode: raw.mode, ...ids, sourceQuestionId,
      sourceAnswerRootId, expectedHeadMessageId, userBody, commandAttachments, ...fingerprint(projection) }) as FixedLocalTextEditResendCommandV2<K['editResend']>
    editBrand.add(result); return result
  } catch { throw new Error(`${kinds.errorPrefix}_EDIT_RESEND_COMMAND_INVALID`) } }
  return Object.freeze({ decodeInitial, decodeRetry, decodeRegenerate, decodeEditResend,
    isInitial: (value: unknown): value is FixedLocalTextInitialCommandV2<K['initial']> => Boolean(value && typeof value === 'object' && initialBrand.has(value)),
    isRetry: (value: unknown): value is FixedLocalTextRetryCommandV2<K['retry']> => Boolean(value && typeof value === 'object' && retryBrand.has(value)),
    isRegenerate: (value: unknown): value is FixedLocalTextRegenerateCommandV2<K['regenerate']> => Boolean(value && typeof value === 'object' && regenerateBrand.has(value)),
    isEditResend: (value: unknown): value is FixedLocalTextEditResendCommandV2<K['editResend']> => Boolean(value && typeof value === 'object' && editBrand.has(value)),
  })
}
