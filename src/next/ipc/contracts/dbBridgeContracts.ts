import { z } from 'zod'
import { decodeWithSchema } from './decodeError'

const nonEmpty = z.string().trim().min(1)

export type DecodedProjectSummary = Readonly<{
  id: string
  name: string
  createdAt: number
  updatedAt: number
  meta: Record<string, unknown> | null
  alreadyExists?: boolean
  isSystemProject?: boolean
}>

export type DecodedConvoSummary = Readonly<{
  id: string
  title: string
  projectId: string | null
  createdAt: number
  updatedAt: number
  meta: Record<string, unknown> | null
}>

export type DecodedPersistedMessage = Readonly<{
  id: string
  convoId: string
  role: string
  seq: number
  createdAt: number
  body: string
  meta: unknown
}>

export type DecodedBeginTurnResult = Readonly<{
  convoId: string
  questionId: string
  questionSeq: number
  assistantId: string
  assistantSeq: number
}>

export type DecodedSwitchCandidateResult = Readonly<{ headMessageId: string }>

export type DecodedRegenerateFromQuestionResult = Readonly<{
  newAnswerRootId: string
  newAssistantSeq: number
}>

export type DecodedSwitchQuestionCandidateResult = Readonly<{ headMessageId: string }>

export type DecodedForkQuestionResult = Readonly<{
  baseMessageId: string | null
  newQuestionId: string
  newQuestionSeq: number
  assistantId: string
  assistantSeq: number
}>

export type DecodedConvoSetProjectManyResult = Readonly<{
  moved: number
  failed: string[]
}>

export type DecodedSearchHit = Readonly<{
  entityType: 'project' | 'convo' | 'message'
  entityId: string
  projectId: string | null
  convoId: string | null
  createdAtSec: number
  snippet: string
  score: number
}>

const projectSummarySchema = z.object({
  id: nonEmpty,
  name: nonEmpty,
  createdAt: z.number().finite().default(0),
  updatedAt: z.number().finite().optional(),
  meta: z.record(z.unknown()).nullable().optional(),
  alreadyExists: z.boolean().optional(),
  isSystemProject: z.boolean().optional(),
}).transform((row) => ({
  ...row,
  updatedAt: row.updatedAt ?? row.createdAt,
}))

const convoSummarySchema = z.object({
  id: nonEmpty,
  title: nonEmpty,
  projectId: z.string().trim().nullable().optional(),
  createdAt: z.number().finite().default(0),
  updatedAt: z.number().finite().optional(),
  meta: z.record(z.unknown()).nullable().optional(),
}).transform((row) => ({
  ...row,
  projectId: row.projectId && row.projectId.length > 0 ? row.projectId : null,
  updatedAt: row.updatedAt ?? row.createdAt,
}))

const persistedMessageSchema = z.object({
  id: nonEmpty,
  convoId: nonEmpty,
  role: z.string().trim().default('assistant'),
  seq: z.number().finite(),
  createdAt: z.number().finite().default(0),
  body: z.string().default(''),
  meta: z.unknown().optional(),
}).transform((row) => ({
  ...row,
  meta: row.meta ?? null,
}))

const appendReasoningDetailSegmentsResultSchema = z.object({
  ok: z.boolean(),
  received: z.number().finite(),
  inserted: z.number().finite(),
  skipped: z.number().finite(),
  ignored: z.number().finite(),
  sumDeltaLenInserted: z.number().finite(),
})

const beginTurnResultSchema = z.object({
  ok: z.literal(true),
  convoId: nonEmpty,
  questionId: nonEmpty,
  questionSeq: z.number().finite(),
  assistantId: nonEmpty,
  assistantSeq: z.number().finite(),
})

const switchCandidateResultSchema = z.object({
  headMessageId: nonEmpty,
})

const switchQuestionCandidateResultSchema = z.object({
  ok: z.literal(true),
  headMessageId: nonEmpty,
})

const regenerateFromQuestionResultSchema = z.object({
  ok: z.literal(true),
  newAnswerRootId: nonEmpty,
  newAssistantSeq: z.number().finite(),
})

const forkQuestionResultSchema = z.object({
  ok: z.literal(true),
  baseMessageId: z.string().trim().nullable().optional(),
  newQuestionId: nonEmpty,
  newQuestionSeq: z.number().finite(),
  assistantId: nonEmpty,
  assistantSeq: z.number().finite(),
})

const searchHitSchema = z.object({
  entityType: z.enum(['project', 'convo', 'message']),
  entityId: nonEmpty,
  projectId: z.string().trim().nullable().optional(),
  convoId: z.string().trim().nullable().optional(),
  createdAtSec: z.number().finite().default(0),
  snippet: z.string().default(''),
  score: z.number().finite().default(0),
}).transform((row) => ({
  ...row,
  projectId: row.projectId && row.projectId.length > 0 ? row.projectId : null,
  convoId: row.convoId && row.convoId.length > 0 ? row.convoId : null,
}))

const booleanAckSchema = z.object({
  ok: z.boolean().optional(),
}).transform((row) => row.ok ?? true)

const strictAckSchema = z.object({
  ok: z.boolean(),
})

const openRouterProviderRequireParametersSchema = z.object({
  value: z.boolean(),
})

const projectCountSchema = z.object({
  count: z.number().finite(),
})

const projectCountBatchSchema = z.object({
  counts: z.record(z.number().finite()),
})

const convoSetProjectManySchema = z.object({
  moved: z.number().finite(),
  failed: z.array(z.string()),
})

const convoDeleteManySchema = z.object({
  deleted: z.number().finite(),
})

export function decodeProjectListResponse(raw: unknown): DecodedProjectSummary[] {
  const rows = decodeWithSchema('project.list', z.array(projectSummarySchema), raw)
  return rows.map((row) => ({
    id: row.id,
    name: row.name,
    createdAt: row.createdAt ?? 0,
    updatedAt: row.updatedAt ?? row.createdAt ?? 0,
    meta: row.meta ?? null,
    ...(row.alreadyExists !== undefined ? { alreadyExists: row.alreadyExists } : {}),
    ...(row.isSystemProject !== undefined ? { isSystemProject: row.isSystemProject } : {}),
  }))
}

export function decodeProjectCreateResponse(raw: unknown): DecodedProjectSummary {
  const row = decodeWithSchema('project.create', projectSummarySchema, raw)
  return {
    id: row.id,
    name: row.name,
    createdAt: row.createdAt ?? 0,
    updatedAt: row.updatedAt ?? row.createdAt ?? 0,
    meta: row.meta ?? null,
    ...(row.alreadyExists !== undefined ? { alreadyExists: row.alreadyExists } : {}),
    ...(row.isSystemProject !== undefined ? { isSystemProject: row.isSystemProject } : {}),
  }
}

export function decodeProjectFindByIdResponse(raw: unknown): DecodedProjectSummary | null {
  if (raw === null || raw === undefined) return null
  return decodeProjectCreateResponse(raw)
}

export function decodeProjectGetInboxResponse(raw: unknown): DecodedProjectSummary | null {
  if (raw === null || raw === undefined) return null
  return decodeProjectCreateResponse(raw)
}

export function decodeProjectCountConversationsResponse(raw: unknown): number {
  return decodeWithSchema('project.countConversations', projectCountSchema, raw).count
}

export function decodeProjectCountConversationsBatchResponse(raw: unknown): Record<string, number> {
  return decodeWithSchema('project.countConversationsBatch', projectCountBatchSchema, raw).counts
}

export function decodeConvoListResponse(raw: unknown): DecodedConvoSummary[] {
  const rows = decodeWithSchema('convo.list', z.array(convoSummarySchema), raw)
  return rows.map((row) => ({
    id: row.id,
    title: row.title,
    projectId: row.projectId ?? null,
    createdAt: row.createdAt ?? 0,
    updatedAt: row.updatedAt ?? row.createdAt ?? 0,
    meta: row.meta ?? null,
  }))
}

export function decodeConvoCreateResponse(raw: unknown): DecodedConvoSummary {
  const row = decodeWithSchema('convo.create', convoSummarySchema, raw)
  return {
    id: row.id,
    title: row.title,
    projectId: row.projectId ?? null,
    createdAt: row.createdAt ?? 0,
    updatedAt: row.updatedAt ?? row.createdAt ?? 0,
    meta: row.meta ?? null,
  }
}

export function decodeConvoSetProjectManyResponse(raw: unknown): DecodedConvoSetProjectManyResult {
  const row = decodeWithSchema('convo.setProjectMany', convoSetProjectManySchema, raw)
  return { moved: row.moved, failed: row.failed }
}

export function decodeConvoDeleteManyResponse(raw: unknown): number {
  return decodeWithSchema('convo.deleteMany', convoDeleteManySchema, raw).deleted
}

export function decodeMessageListResponse(raw: unknown): DecodedPersistedMessage[] {
  const rows = decodeWithSchema('message.list', z.array(persistedMessageSchema), raw)
  return rows.map((row) => ({
    id: row.id,
    convoId: row.convoId,
    role: row.role ?? 'assistant',
    seq: row.seq,
    createdAt: row.createdAt ?? 0,
    body: row.body ?? '',
    meta: row.meta ?? null,
  }))
}

export function decodeMessageAppendResponse(raw: unknown): DecodedPersistedMessage {
  const row = decodeWithSchema('message.append', persistedMessageSchema, raw)
  return {
    id: row.id,
    convoId: row.convoId,
    role: row.role ?? 'assistant',
    seq: row.seq,
    createdAt: row.createdAt ?? 0,
    body: row.body ?? '',
    meta: row.meta ?? null,
  }
}

export function decodeAppendReasoningDetailSegmentsResponse(raw: unknown) {
  return decodeWithSchema('message.appendReasoningDetailSegments', appendReasoningDetailSegmentsResultSchema, raw)
}

export function decodeBranchBeginTurnResponse(raw: unknown): DecodedBeginTurnResult {
  const row = decodeWithSchema('branch.beginTurn', beginTurnResultSchema, raw)
  return {
    convoId: row.convoId,
    questionId: row.questionId,
    questionSeq: row.questionSeq,
    assistantId: row.assistantId,
    assistantSeq: row.assistantSeq,
  }
}

export function decodeBranchSwitchCandidateResponse(raw: unknown): DecodedSwitchCandidateResult {
  return decodeWithSchema('branch.switchCandidate', switchCandidateResultSchema, raw)
}

export function decodeBranchSwitchQuestionCandidateResponse(raw: unknown): DecodedSwitchQuestionCandidateResult {
  const row = decodeWithSchema('branch.switchQuestionCandidate', switchQuestionCandidateResultSchema, raw)
  return { headMessageId: row.headMessageId }
}

export function decodeBranchRegenerateFromQuestionResponse(raw: unknown): DecodedRegenerateFromQuestionResult {
  const row = decodeWithSchema('branch.regenerateFromQuestion', regenerateFromQuestionResultSchema, raw)
  return {
    newAnswerRootId: row.newAnswerRootId,
    newAssistantSeq: row.newAssistantSeq,
  }
}

export function decodeBranchForkQuestionResponse(raw: unknown): DecodedForkQuestionResult {
  const row = decodeWithSchema('branch.forkQuestion', forkQuestionResultSchema, raw)
  return {
    baseMessageId: row.baseMessageId ?? null,
    newQuestionId: row.newQuestionId,
    newQuestionSeq: row.newQuestionSeq,
    assistantId: row.assistantId,
    assistantSeq: row.assistantSeq,
  }
}

export function decodeBranchRetryReplaceQuestionResponse(raw: unknown): DecodedForkQuestionResult {
  const row = decodeWithSchema('branch.retryReplaceQuestion', forkQuestionResultSchema, raw)
  return {
    baseMessageId: row.baseMessageId ?? null,
    newQuestionId: row.newQuestionId,
    newQuestionSeq: row.newQuestionSeq,
    assistantId: row.assistantId,
    assistantSeq: row.assistantSeq,
  }
}

export function decodeSearchQueryResponse(raw: unknown): DecodedSearchHit[] {
  const rows = decodeWithSchema('search.query', z.array(searchHitSchema), raw)
  return rows.map((row) => ({
    entityType: row.entityType,
    entityId: row.entityId,
    projectId: row.projectId ?? null,
    convoId: row.convoId ?? null,
    createdAtSec: row.createdAtSec ?? 0,
    snippet: row.snippet ?? '',
    score: row.score ?? 0,
  }))
}

export function decodeBooleanAck(method: string, raw: unknown): boolean {
  return decodeWithSchema(method, booleanAckSchema, raw)
}

export function decodeStrictAck(method: string, raw: unknown): boolean {
  return decodeWithSchema(method, strictAckSchema, raw).ok
}

export function decodeOpenRouterProviderRequireParametersResponse(raw: unknown): boolean {
  return decodeWithSchema('settings.getOpenRouterProviderRequireParameters', openRouterProviderRequireParametersSchema, raw).value
}

export function decodeMessageSetStatusResponse(raw: unknown): boolean {
  return decodeStrictAck('message.setStatus', raw)
}

export function decodeMessageFinalizeReasoningDetailsResponse(raw: unknown): boolean {
  return decodeStrictAck('message.finalizeReasoningDetails', raw)
}

export function decodeBranchSetHeadResponse(raw: unknown): boolean {
  return decodeStrictAck('branch.setHead', raw)
}
