import type { InternalMessage } from './buildMessages'
import { toInternalMessagesFromBranchPath } from './loadBranchContext'

export type ContextBuiltMessage = Readonly<{
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

export type ContextBuildDebug = Readonly<{
  branchId: string
  excludedQuestionIds: string[]
  includedMessageIds: string[]
  chosenAnswerRootByQuestionId: Record<string, string>
}>

export type BuildContextForBranchResult = Readonly<{
  messages: ContextBuiltMessage[]
  debug?: ContextBuildDebug
}>

export type RenderableTurnSummary = Readonly<{
  questionId: string
  chosenAnswerRootId: string | null
  questionMode: 'include' | 'exclude'
  answerMode: 'include' | 'exclude'
  effectiveMode: 'include' | 'exclude'
  lockedByQuestionExclude: boolean
}>

export type GetRenderableTurnsResult = Readonly<{
  messages: ContextBuiltMessage[]
  turns: ReadonlyArray<RenderableTurnSummary>
  debug?: ContextBuildDebug
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

function coerceMessage(raw: any): ContextBuiltMessage | null {
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
  } satisfies ContextBuiltMessage
}

export async function buildContextForBranchInternalMessages(
  branchId: string,
  params?: Readonly<{ limit?: number; debug?: boolean }>
): Promise<Readonly<{ contextMessages: InternalMessage[]; debug?: ContextBuildDebug; rawMessages: ContextBuiltMessage[] }>> {
  const bridge = requireDbBridge()
  const bid = String(branchId ?? '').trim()
  if (!bid) throw new Error('Missing branchId')

  const raw = await bridge.invoke('context.buildForBranch', { branchId: bid, ...(params ?? {}) })
  const rowsRaw = Array.isArray(raw?.messages) ? raw.messages : []
  const rows = rowsRaw.map(coerceMessage).filter((m): m is ContextBuiltMessage => !!m)

  // Reuse the branch-path -> InternalMessage coercion (same shape).
  const contextMessages = toInternalMessagesFromBranchPath(
    rows.map((m) => ({
      id: m.id,
      convoId: m.convoId,
      role: m.role,
      seq: m.seq,
      createdAt: m.createdAt,
      parentId: m.parentId,
      status: m.status,
      answerRootId: m.answerRootId,
      questionId: m.questionId,
      body: m.body,
      meta: m.meta,
    }))
  )

  const debug = raw?.debug && typeof raw.debug === 'object' ? (raw.debug as ContextBuildDebug) : undefined
  return { contextMessages, debug, rawMessages: rows }
}

export async function getRenderableTurnsForBranch(
  branchId: string,
  params?: Readonly<{ limit?: number; debug?: boolean }>
): Promise<GetRenderableTurnsResult> {
  const bridge = requireDbBridge()
  const bid = String(branchId ?? '').trim()
  if (!bid) throw new Error('Missing branchId')

  const raw = await bridge.invoke('context.getRenderableTurns', { branchId: bid, ...(params ?? {}) })
  const rowsRaw = Array.isArray(raw?.messages) ? raw.messages : []
  const messages = rowsRaw.map(coerceMessage).filter((m): m is ContextBuiltMessage => !!m)

  const turnsRaw = Array.isArray(raw?.turns) ? raw.turns : []
  const turns: RenderableTurnSummary[] = turnsRaw
    .map((t: any) => {
      const questionId = String(t?.questionId ?? '').trim()
      if (!questionId) return null
      const chosenAnswerRootId = t?.chosenAnswerRootId ? String(t.chosenAnswerRootId) : null
      const questionMode = t?.questionMode === 'exclude' ? 'exclude' : 'include'
      const answerMode = t?.answerMode === 'exclude' ? 'exclude' : 'include'
      const effectiveMode = t?.effectiveMode === 'exclude' ? 'exclude' : 'include'
      const lockedByQuestionExclude = t?.lockedByQuestionExclude === true
      return { questionId, chosenAnswerRootId, questionMode, answerMode, effectiveMode, lockedByQuestionExclude } satisfies RenderableTurnSummary
    })
    .filter((x): x is RenderableTurnSummary => !!x)

  const debug = raw?.debug && typeof raw.debug === 'object' ? (raw.debug as ContextBuildDebug) : undefined
  return { messages, turns, ...(debug ? { debug } : {}) }
}
