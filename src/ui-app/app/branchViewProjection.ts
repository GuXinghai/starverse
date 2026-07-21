import type {
  GenerationV2UiContextMessage,
  GenerationV2UiRenderableTurns,
} from '@/next/generation-v2/renderer/generationV2BranchProjection'
import type { MessageState } from '@/next/state/types'

export type BranchTurnProjection = Readonly<{
  questionId: string
  chosenAnswerRootId: string
  questionMode: 'include' | 'exclude'
  answerMode: 'include' | 'exclude'
  effectiveMode: 'include' | 'exclude'
  lockedByQuestionExclude: boolean
}>

export type BranchAnswerProjection = Readonly<{
  answerRootId: string
  questionId: string
  isChosen: boolean
  contextMode: 'include' | 'exclude'
}>

export type BranchProjectionConsistencyError = Readonly<{
  code: 'chosen_answer_missing' | 'chosen_answer_question_mismatch'
  questionId: string
  answerRootId: string
}>

export type BranchViewSnapshot<MessageMeta> = Readonly<{
  branchId: string
  revision: number
  rows: readonly GenerationV2UiContextMessage[]
  messageSeqById: ReadonlyMap<string, number>
  messageMetaById: ReadonlyMap<string, MessageMeta>
  turnByQuestionId: ReadonlyMap<string, BranchTurnProjection>
  questionTurnOrder: readonly string[]
  answerByRootId: ReadonlyMap<string, BranchAnswerProjection>
  consistencyErrors: readonly BranchProjectionConsistencyError[]
}>

export function emptyBranchViewSnapshot<MessageMeta>(): BranchViewSnapshot<MessageMeta> {
  return {
    branchId: '',
    revision: 0,
    rows: [],
    messageSeqById: new Map(),
    messageMetaById: new Map(),
    turnByQuestionId: new Map(),
    questionTurnOrder: [],
    answerByRootId: new Map(),
    consistencyErrors: [],
  }
}

export function buildBranchViewSnapshot<MessageMeta>(input: Readonly<{
  branchId: string
  revision: number
  rendered: GenerationV2UiRenderableTurns
  messageMetaById: ReadonlyMap<string, MessageMeta>
}>): BranchViewSnapshot<MessageMeta> {
  const branchId = String(input.branchId ?? '').trim()
  if (!branchId) throw new Error('Missing branchId for branch view projection')

  const rows = [...input.rendered.messages]
  const messageSeqById = new Map(rows.map((row) => [row.id, row.seq] as const))
  const rowById = new Map(rows.map((row) => [row.id, row] as const))
  const turnByQuestionId = new Map<string, BranchTurnProjection>()
  const answerByRootId = new Map<string, BranchAnswerProjection>()
  const questionTurnOrder: string[] = []
  const consistencyErrors: BranchProjectionConsistencyError[] = []

  for (const turn of input.rendered.turns) {
    questionTurnOrder.push(turn.questionId)
    const chosenAnswerRootId = String(turn.chosenAnswerRootId ?? '').trim()
    if (!chosenAnswerRootId) continue

    const projection: BranchTurnProjection = {
      questionId: turn.questionId,
      chosenAnswerRootId,
      questionMode: turn.questionMode,
      answerMode: turn.answerMode,
      effectiveMode: turn.effectiveMode,
      lockedByQuestionExclude: turn.lockedByQuestionExclude,
    }
    turnByQuestionId.set(turn.questionId, projection)

    const chosenRow = rowById.get(chosenAnswerRootId)
    if (!chosenRow) {
      consistencyErrors.push({
        code: 'chosen_answer_missing',
        questionId: turn.questionId,
        answerRootId: chosenAnswerRootId,
      })
      continue
    }
    if (chosenRow.questionId !== turn.questionId || chosenRow.answerRootId !== chosenAnswerRootId) {
      consistencyErrors.push({
        code: 'chosen_answer_question_mismatch',
        questionId: turn.questionId,
        answerRootId: chosenAnswerRootId,
      })
      continue
    }
  }

  for (const row of rows) {
    if (row.role !== 'assistant' || row.answerRootId !== row.id || !row.questionId) continue
    const turn = turnByQuestionId.get(row.questionId)
    answerByRootId.set(row.id, {
      answerRootId: row.id,
      questionId: row.questionId,
      isChosen: turn?.chosenAnswerRootId === row.id,
      contextMode: turn?.chosenAnswerRootId === row.id ? turn.effectiveMode : 'include',
    })
  }

  return {
    branchId,
    revision: input.revision,
    rows,
    messageSeqById,
    messageMetaById: new Map(input.messageMetaById),
    turnByQuestionId,
    questionTurnOrder,
    answerByRootId,
    consistencyErrors,
  }
}

export type BranchProjectionRefreshLease = Readonly<{
  branchId: string
  revision: number
}>

export class BranchProjectionRefreshCoordinator {
  private revision = 0
  private activeBranchId = ''

  begin(branchId: string): BranchProjectionRefreshLease {
    const normalized = String(branchId ?? '').trim()
    if (!normalized) throw new Error('Missing branchId for branch projection refresh')
    this.activeBranchId = normalized
    return { branchId: normalized, revision: ++this.revision }
  }

  isCurrent(lease: BranchProjectionRefreshLease, activeBranchId: string | null | undefined): boolean {
    return (
      lease.revision === this.revision &&
      lease.branchId === this.activeBranchId &&
      lease.branchId === String(activeBranchId ?? '').trim()
    )
  }

  invalidate(): void {
    this.revision += 1
    this.activeBranchId = ''
  }
}

export function mergePersistedMessageWithRuntimeOverlay(
  persisted: MessageState,
  previous: MessageState | undefined,
  activeStreamTarget: boolean,
): MessageState {
  if (!previous) return persisted

  const persistedText = String(persisted.contentText ?? '')
  const previousText = String(previous.contentText ?? '')
  if (activeStreamTarget) {
    const preferPreviousText = previousText.length >= persistedText.length
    return {
      ...persisted,
      ...previous,
      contentText: preferPreviousText ? previousText : persistedText,
      contentBlocks: preferPreviousText ? previous.contentBlocks : persisted.contentBlocks,
      errorEnvelope: persisted.errorEnvelope ?? previous.errorEnvelope,
      errorSummary: persisted.errorSummary ?? previous.errorSummary,
    }
  }

  const previousNonTextBlocks = previous.contentBlocks.filter((block) => block.type !== 'text')
  return {
    ...persisted,
    contentBlocks: previousNonTextBlocks.length > 0
      ? [...persisted.contentBlocks, ...previousNonTextBlocks]
      : persisted.contentBlocks,
    toolCalls: previous.toolCalls.length > 0 ? previous.toolCalls : persisted.toolCalls,
    reasoningDetailsRaw: (previous.reasoningDetailsRaw?.length ?? 0) > 0
      ? previous.reasoningDetailsRaw
      : persisted.reasoningDetailsRaw,
    reasoningDisplayBlocks: (previous.reasoningDisplayBlocks?.length ?? 0) > 0
      ? previous.reasoningDisplayBlocks
      : persisted.reasoningDisplayBlocks,
    reasoningPanelState: previous.reasoningPanelState,
    errorEnvelope: persisted.errorEnvelope ?? previous.errorEnvelope,
    errorSummary: persisted.errorSummary ?? previous.errorSummary,
  }
}
