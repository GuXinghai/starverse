import type { BeginTurnInput, BeginTurnResult } from '../types'
import { DbWorkerError } from '../errors'
import type { DbWorkerRuntime } from './runtime'

export function beginTurnPersistenceCore(
  runtime: DbWorkerRuntime,
  input: BeginTurnInput,
  options?: Readonly<{ createdAt?: number }>,
): BeginTurnResult {
  const rt = runtime as any
  const branch = rt.branchRepo.get(input.branchId)
  if (!branch?.convoId) throw new DbWorkerError('ERR_NOT_FOUND', `Branch not found: ${input.branchId}`)
  if (branch.deletedAt != null) throw new DbWorkerError('ERR_INVALID', `Branch is deleted: ${input.branchId}`)
  const question = rt.messageRepo.append({
    convoId: branch.convoId,
    role: 'user',
    body: input.userBody,
    ...(input.userMeta !== undefined ? { meta: input.userMeta } : {}),
    parentId: branch.headMessageId,
    ...(options?.createdAt !== undefined ? { createdAt: options.createdAt } : {}),
  })
  const questionDoc = rt.loadMessageSearchDoc(question.id)
  if (questionDoc) rt.searchRepo.upsertDoc(questionDoc)
  if (input.attachConversationDraft === true) {
    rt.conversationAttachmentService.attachDraftToMessage({
      conversationId: branch.convoId,
      messageId: question.id,
      ...(input.sentAssetIds?.length ? { sentAssetIds: input.sentAssetIds } : {}),
      ...(input.dfcAttachmentSendSnapshots?.length
        ? { dfcAttachmentSendSnapshots: input.dfcAttachmentSendSnapshots }
        : {}),
    })
  }
  const assistant = rt.messageRepo.append({
    convoId: branch.convoId,
    role: 'assistant',
    body: '',
    parentId: question.id,
    status: 'streaming',
    ...(options?.createdAt !== undefined ? { createdAt: options.createdAt } : {}),
  })
  rt.branchRepo.setChoice(input.branchId, question.id, assistant.id)
  rt.branchRepo.setHead(input.branchId, assistant.id)
  return {
    ok: true,
    convoId: branch.convoId,
    branchId: input.branchId,
    questionId: question.id,
    questionSeq: question.seq,
    assistantId: assistant.id,
    assistantSeq: assistant.seq,
  }
}
