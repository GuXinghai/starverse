export type BranchSummary = Readonly<{
  id: string
  convoId: string
  headMessageId: string | null
  name: string | null
  createdAt: number
  updatedAt: number
  deletedAt: number | null
}>

export type BranchPathMessage = Readonly<{
  id: string
  convoId: string
  role: string
  seq: number
  createdAt: number
  parentId: string | null
  status: string
  answerRootId: string | null
  questionId: string | null
  body: string
  meta: unknown
}>

export type BranchCandidate = Readonly<{
  answerRootId: string
  createdAt: number
  status: string
}>

export type EffectiveFilterResult = Readonly<{
  questionMode: 'include' | 'exclude'
  answerMode: 'include' | 'exclude'
  effectiveMode: 'include' | 'exclude'
  lockedByQuestionExclude: boolean
}>

export type BeginTurnResult = Readonly<{
  convoId: string
  branchId: string
  questionId: string
  questionSeq: number
  assistantId: string
  assistantSeq: number
}>

export type SwitchCandidateResult = Readonly<{ headMessageId: string }>

export type RegenerateFromQuestionResult = Readonly<{
  newAnswerRootId: string
  newAssistantSeq: number
}>

export type RetryReplaceAnswerResult = Readonly<{
  newAnswerRootId: string
  newAssistantSeq: number
}>

type DbBridge = Readonly<{
  invoke: (method: string, params?: unknown) => Promise<any>
}>

function getDbBridge(): DbBridge | null {
  const bridge = (globalThis as any).dbBridge as DbBridge | undefined
  return bridge && typeof bridge.invoke === 'function' ? bridge : null
}

function requireDbBridge(): DbBridge {
  const bridge = getDbBridge()
  if (!bridge) throw new Error('Missing dbBridge')
  return bridge
}

function coerceBranch(raw: any): BranchSummary | null {
  const id = String(raw?.id ?? '').trim()
  const convoId = String(raw?.convoId ?? '').trim()
  if (!id || !convoId) return null
  return {
    id,
    convoId,
    headMessageId: raw?.headMessageId ? String(raw.headMessageId) : null,
    name: raw?.name === null || raw?.name === undefined ? null : String(raw.name),
    createdAt: typeof raw?.createdAt === 'number' ? raw.createdAt : 0,
    updatedAt: typeof raw?.updatedAt === 'number' ? raw.updatedAt : 0,
    deletedAt: raw?.deletedAt === null || raw?.deletedAt === undefined ? null : Number(raw.deletedAt),
  } satisfies BranchSummary
}

function coercePathMessage(raw: any): BranchPathMessage | null {
  const id = String(raw?.id ?? '').trim()
  const convoId = String(raw?.convoId ?? '').trim()
  const role = String(raw?.role ?? '').trim()
  const seq = typeof raw?.seq === 'number' ? raw.seq : NaN
  const createdAt = typeof raw?.createdAt === 'number' ? raw.createdAt : 0
  if (!id || !convoId || !role || !Number.isFinite(seq)) return null
  return {
    id,
    convoId,
    role,
    seq,
    createdAt,
    parentId: raw?.parentId ? String(raw.parentId) : null,
    status: String(raw?.status ?? 'final'),
    answerRootId: raw?.answerRootId ? String(raw.answerRootId) : null,
    questionId: raw?.questionId ? String(raw.questionId) : null,
    body: typeof raw?.body === 'string' ? raw.body : String(raw?.body ?? ''),
    meta: raw?.meta ?? null,
  } satisfies BranchPathMessage
}

export async function ensureDefaultBranch(convoId: string, params?: Readonly<{ name?: string | null }>): Promise<BranchSummary> {
  const bridge = requireDbBridge()
  const cid = String(convoId ?? '').trim()
  if (!cid) throw new Error('Missing convoId')
  const raw = await bridge.invoke('branch.ensureDefault', { convoId: cid, ...(params?.name !== undefined ? { name: params.name } : {}) })
  const branch = coerceBranch(raw)
  if (!branch) throw new Error('DB did not return a valid branch')
  return branch
}

export async function listBranches(convoId: string, params?: Readonly<{ includeDeleted?: boolean }>): Promise<BranchSummary[]> {
  const bridge = getDbBridge()
  if (!bridge) return []
  const cid = String(convoId ?? '').trim()
  if (!cid) return []
  const rows = await bridge.invoke('branch.list', { convoId: cid, ...(params?.includeDeleted ? { includeDeleted: true } : {}) })
  if (!Array.isArray(rows)) return []
  return rows
    .map(coerceBranch)
    .filter((b): b is BranchSummary => !!b)
    .sort((a, b) => b.updatedAt - a.updatedAt)
}

export async function createBranchFromMessage(input: Readonly<{
  sourceBranchId: string
  baseMessageId: string
  name?: string | null
  copyChoices?: boolean
  copyFilters?: boolean
  requireOnSourcePath?: boolean
}>): Promise<BranchSummary> {
  const bridge = requireDbBridge()
  const sourceBranchId = String(input.sourceBranchId ?? '').trim()
  const baseMessageId = String(input.baseMessageId ?? '').trim()
  if (!sourceBranchId || !baseMessageId) throw new Error('Missing sourceBranchId/baseMessageId')
  const raw = await bridge.invoke('branch.createFromMessage', {
    sourceBranchId,
    baseMessageId,
    ...(input.name !== undefined ? { name: input.name } : {}),
    ...(input.copyChoices !== undefined ? { copyChoices: input.copyChoices } : {}),
    ...(input.copyFilters !== undefined ? { copyFilters: input.copyFilters } : {}),
    ...(input.requireOnSourcePath !== undefined ? { requireOnSourcePath: input.requireOnSourcePath } : {}),
  })
  const branch = coerceBranch(raw)
  if (!branch) throw new Error('DB did not return a valid branch')
  return branch
}

export async function deleteBranch(branchId: string): Promise<boolean> {
  const bridge = requireDbBridge()
  const bid = String(branchId ?? '').trim()
  if (!bid) throw new Error('Missing branchId')
  const result = await bridge.invoke('branch.delete', { branchId: bid })
  return !!(result && typeof result === 'object' && 'ok' in result ? (result as any).ok : true)
}

export async function beginTurn(branchId: string, userBody: string, params?: Readonly<{ userMeta?: unknown }>): Promise<BeginTurnResult> {
  const bridge = requireDbBridge()
  const bid = String(branchId ?? '').trim()
  const body = typeof userBody === 'string' ? userBody : String(userBody ?? '')
  if (!bid) throw new Error('Missing branchId')
  if (!body.trim()) throw new Error('Missing userBody')

  const raw = await bridge.invoke('branch.beginTurn', { branchId: bid, userBody: body, ...(params?.userMeta !== undefined ? { userMeta: params.userMeta } : {}) })
  if (!raw || typeof raw !== 'object' || raw.ok !== true) throw new Error('DB did not return ok for beginTurn')

  const convoId = String((raw as any).convoId ?? '').trim()
  const questionId = String((raw as any).questionId ?? '').trim()
  const assistantId = String((raw as any).assistantId ?? '').trim()
  const questionSeq = Number((raw as any).questionSeq ?? NaN)
  const assistantSeq = Number((raw as any).assistantSeq ?? NaN)
  if (!convoId || !questionId || !assistantId || !Number.isFinite(questionSeq) || !Number.isFinite(assistantSeq)) {
    throw new Error('DB did not return valid beginTurn fields')
  }
  return { convoId, branchId: bid, questionId, questionSeq, assistantId, assistantSeq }
}

export async function switchCandidate(branchId: string, questionId: string, answerRootId: string): Promise<SwitchCandidateResult> {
  const bridge = requireDbBridge()
  const bid = String(branchId ?? '').trim()
  const qid = String(questionId ?? '').trim()
  const ar = String(answerRootId ?? '').trim()
  if (!bid || !qid || !ar) throw new Error('Missing branchId/questionId/answerRootId')
  const raw = await bridge.invoke('branch.switchCandidate', { branchId: bid, questionId: qid, answerRootId: ar })
  const headMessageId = String(raw?.headMessageId ?? '').trim()
  if (!headMessageId) throw new Error('DB did not return headMessageId')
  return { headMessageId }
}

export async function regenerateFromQuestion(branchId: string, questionId: string): Promise<RegenerateFromQuestionResult> {
  const bridge = requireDbBridge()
  const bid = String(branchId ?? '').trim()
  const qid = String(questionId ?? '').trim()
  if (!bid || !qid) throw new Error('Missing branchId/questionId')
  const raw = await bridge.invoke('branch.regenerateFromQuestion', { branchId: bid, questionId: qid })
  if (!raw || typeof raw !== 'object' || raw.ok !== true) throw new Error('DB did not return ok for regenerateFromQuestion')
  const newAnswerRootId = String((raw as any).newAnswerRootId ?? '').trim()
  const newAssistantSeq = Number((raw as any).newAssistantSeq ?? NaN)
  if (!newAnswerRootId || !Number.isFinite(newAssistantSeq)) throw new Error('DB did not return regenerateFromQuestion fields')
  return { newAnswerRootId, newAssistantSeq }
}

export async function retryReplaceAnswer(branchId: string, questionId: string, currentAnswerRootId: string): Promise<RetryReplaceAnswerResult> {
  const bridge = requireDbBridge()
  const bid = String(branchId ?? '').trim()
  const qid = String(questionId ?? '').trim()
  const aid = String(currentAnswerRootId ?? '').trim()
  if (!bid || !qid || !aid) throw new Error('Missing branchId/questionId/currentAnswerRootId')
  const raw = await bridge.invoke('branch.retryReplaceAnswer', { branchId: bid, questionId: qid, currentAnswerRootId: aid })
  if (!raw || typeof raw !== 'object' || raw.ok !== true) throw new Error('DB did not return ok for retryReplaceAnswer')
  const newAnswerRootId = String((raw as any).newAnswerRootId ?? '').trim()
  const newAssistantSeq = Number((raw as any).newAssistantSeq ?? NaN)
  if (!newAnswerRootId || !Number.isFinite(newAssistantSeq)) throw new Error('DB did not return retryReplaceAnswer fields')
  return { newAnswerRootId, newAssistantSeq }
}

export async function setBranchHead(branchId: string, headMessageId: string | null): Promise<boolean> {
  const bridge = requireDbBridge()
  const bid = String(branchId ?? '').trim()
  if (!bid) throw new Error('Missing branchId')
  const result = await bridge.invoke('branch.setHead', { branchId: bid, headMessageId })
  return !!(result && typeof result === 'object' && 'ok' in result ? (result as any).ok : true)
}

export async function setBranchChoice(branchId: string, questionId: string, chosenAnswerRootId: string): Promise<boolean> {
  const bridge = requireDbBridge()
  const bid = String(branchId ?? '').trim()
  const qid = String(questionId ?? '').trim()
  const aid = String(chosenAnswerRootId ?? '').trim()
  if (!bid || !qid || !aid) throw new Error('Missing branchId/questionId/chosenAnswerRootId')
  const result = await bridge.invoke('branchChoice.set', { branchId: bid, questionId: qid, chosenAnswerRootId: aid })
  return !!(result && typeof result === 'object' && 'ok' in result ? (result as any).ok : true)
}

export async function setBranchFilter(input: Readonly<{ branchId: string; targetType: 'question' | 'answer'; targetId: string; mode: 'exclude' | 'include' }>): Promise<boolean> {
  const bridge = requireDbBridge()
  const branchId = String(input.branchId ?? '').trim()
  const targetId = String(input.targetId ?? '').trim()
  if (!branchId || !targetId) throw new Error('Missing branchId/targetId')
  const result = await bridge.invoke('branchFilter.set', { branchId, targetType: input.targetType, targetId, mode: input.mode })
  return !!(result && typeof result === 'object' && 'ok' in result ? (result as any).ok : true)
}

export async function clearBranchFilter(input: Readonly<{ branchId: string; targetType: 'question' | 'answer'; targetId: string }>): Promise<boolean> {
  const bridge = requireDbBridge()
  const branchId = String(input.branchId ?? '').trim()
  const targetId = String(input.targetId ?? '').trim()
  if (!branchId || !targetId) throw new Error('Missing branchId/targetId')
  const result = await bridge.invoke('branchFilter.clear', { branchId, targetType: input.targetType, targetId })
  return !!(result && typeof result === 'object' && 'ok' in result ? (result as any).ok : true)
}

export async function getBranchEffectiveFilters(branchId: string, questionId: string, chosenAnswerRootId: string): Promise<EffectiveFilterResult> {
  const bridge = requireDbBridge()
  const bid = String(branchId ?? '').trim()
  const qid = String(questionId ?? '').trim()
  const aid = String(chosenAnswerRootId ?? '').trim()
  if (!bid || !qid || !aid) throw new Error('Missing branchId/questionId/chosenAnswerRootId')
  const raw = await bridge.invoke('branch.getEffectiveFilters', { branchId: bid, questionId: qid, chosenAnswerRootId: aid })
  const questionMode = raw?.questionMode === 'exclude' ? 'exclude' : 'include'
  const answerMode = raw?.answerMode === 'exclude' ? 'exclude' : 'include'
  const effectiveMode = raw?.effectiveMode === 'exclude' ? 'exclude' : 'include'
  const lockedByQuestionExclude = raw?.lockedByQuestionExclude === true
  return { questionMode, answerMode, effectiveMode, lockedByQuestionExclude }
}

export async function getBranchCandidates(branchId: string, questionId: string, params?: Readonly<{ limit?: number }>): Promise<BranchCandidate[]> {
  const bridge = getDbBridge()
  if (!bridge) return []
  const bid = String(branchId ?? '').trim()
  const qid = String(questionId ?? '').trim()
  if (!bid || !qid) return []
  const rows = await bridge.invoke('branch.getCandidates', { branchId: bid, questionId: qid, ...(params ?? {}) })
  if (!Array.isArray(rows)) return []
  return rows
    .map((r: any) => {
      const answerRootId = String(r?.answerRootId ?? '').trim()
      if (!answerRootId) return null
      return { answerRootId, createdAt: typeof r?.createdAt === 'number' ? r.createdAt : 0, status: String(r?.status ?? 'final') } satisfies BranchCandidate
    })
    .filter((x): x is BranchCandidate => !!x)
}

export async function listBranchPathMessages(branchId: string, params?: Readonly<{ limit?: number }>): Promise<BranchPathMessage[]> {
  const bridge = getDbBridge()
  if (!bridge) return []
  const bid = String(branchId ?? '').trim()
  if (!bid) return []
  const rows = await bridge.invoke('branch.getPathMessages', { branchId: bid, ...(params ?? {}) })
  if (!Array.isArray(rows)) return []
  return rows
    .map(coercePathMessage)
    .filter((m): m is BranchPathMessage => !!m)
    .sort((a, b) => a.seq - b.seq)
}
