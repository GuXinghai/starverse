<script setup lang="ts">
import { computed, onMounted, ref, watch } from 'vue'
import ChatLayout from '@/ui-kit/chat/ChatLayout.vue'
import ChatTranscript from '@/ui-kit/chat/ChatTranscript.vue'
import ChatMessageBubble from '@/ui-kit/chat/ChatMessageBubble.vue'
import type { MessageVM } from '@/next/state/types'
import {
  createConvo,
  deleteConvo,
  deleteConvos,
  listConvos,
  renameConvo,
  setConvoProject,
  setConvoProjectMany,
  type ConvoSummary,
} from '@/next/convo/convoClient'
import {
  clearBranchFilter,
  createBranchFromMessage,
  beginTurn,
  regenerateFromQuestion,
  retryReplaceAnswer,
  getBranchCandidates,
  deleteBranch,
  ensureDefaultBranch,
  listBranches,
  switchCandidate,
  setBranchFilter,
  type BranchSummary,
  type BranchCandidate,
  type EffectiveFilterResult,
} from '@/next/branch/branchClient'
import { appendMessageDelta, setMessageStatus } from '@/next/message/messageClient'
import { listProjects, type ProjectSummary } from '@/next/project/projectClient'
import ConversationList, { type ConversationListItem, type ProjectListItem } from './components/ConversationList.vue'
import ChatAppComposer from './components/ChatAppComposer.vue'
import SettingsPanel from './components/SettingsPanel.vue'
import SettingsModal from './components/SettingsModal.vue'
import { applyEvent, createInitialState, startGeneration } from '@/next/state/reducer'
import { selectRun, selectTranscript } from '@/next/state/selectors'
import type { RootState } from '@/next/state/types'
import { streamOpenRouterChatAsEvents } from '@/next/live/openRouterLiveStream'
import { buildContextForBranchInternalMessages, getRenderableTurnsForBranch } from '@/next/context/contextClient'
import type { InternalMessage } from '@/next/context/buildMessages'
import { toInternalMessagesFromBranchPath } from '@/next/context/loadBranchContext'
import type { NormalizedErrorEnvelope } from '@/next/errors/normalizeOpenRouterError'

const isReady = ref(false)
const loadError = ref<string | null>(null)
const convos = ref<ConvoSummary[]>([])
const projects = ref<ProjectSummary[]>([])
const activeConvoId = ref<string | null>(null)
const activeBranchId = ref<string | null>(null)
const branches = ref<BranchSummary[]>([])
const draft = ref('')
const settingsOpen = ref(false)

const state = ref<RootState>(createInitialState())
const messageSeqById = ref<Map<string, number>>(new Map())
const messageMetaById = ref<
  Map<string, { questionId: string | null; answerRootId: string | null; role: string; status: string }>
>(new Map())
const turnFiltersByQuestionId = ref<Map<string, Readonly<EffectiveFilterResult & { chosenAnswerRootId: string }>>>(new Map())
const questionTurnOrder = ref<string[]>([])
const candidatesCache = ref<Map<string, BranchCandidate[]>>(new Map())
const candidatesEpochGlobal = ref(0)
const candidatesEpochByQuestionId = ref<Map<string, number>>(new Map())
const candidatesLoading = ref<Map<string, string>>(new Map())

// Anti-reordering guard for transcript refresh: only the latest request's result lands.
const transcriptRefreshToken = ref(0)

const runId = computed(() => activeBranchId.value)

const activeBranch = computed(() => {
  const id = activeBranchId.value
  if (!id) return null
  return branches.value.find((b) => b.id === id) ?? null
})

const runVM = computed(() => {
  const id = runId.value
  if (!id) return null
  return selectRun(state.value, id)
})

const transcript = computed<MessageVM[]>(() => {
  const id = runId.value
  if (!id) return []
  return selectTranscript(state.value, id)
})

const isRunning = computed(() => runVM.value?.status === 'requesting' || runVM.value?.status === 'streaming' || runVM.value?.status === 'tool_waiting')

function getNormalizedErrorEnvelope(error: unknown): NormalizedErrorEnvelope | null {
  if (!error || typeof error !== 'object') return null
  const env = (error as any).normalized ? (error as any) : null
  if (env && typeof env === 'object' && 'normalized' in env) return env as NormalizedErrorEnvelope
  return null
}

const normalizedError = computed(() => getNormalizedErrorEnvelope(runVM.value?.error))

const normalizedErrorSummary = computed(() => {
  const e = normalizedError.value?.normalized
  if (!e) return null
  const bits = [
    e.httpStatus ? `HTTP ${e.httpStatus}` : null,
    typeof e.code === 'string' ? e.code : `code:${e.code}`,
    e.message,
  ].filter(Boolean)
  return bits.join(' — ')
})

const normalizedErrorActionHint = computed(() => {
  const a = normalizedError.value?.normalized?.action
  if (!a) return null
  if (a === 'reauth') return 'Action: API key invalid/expired; update key and retry.'
  if (a === 'topup_credits') return 'Action: credits insufficient; top up or switch model.'
  if (a === 'modify_input_moderation') return 'Action: input flagged; revise prompt and retry.'
  if (a === 'fix_request') return 'Action: fix request parameters and retry.'
  if (a === 'backoff_retry') return 'Action: retry with backoff.'
  if (a === 'switch_provider_or_model') return 'Action: switch provider/model and retry.'
  if (a === 'relax_routing_constraints') return 'Action: relax routing constraints or switch model.'
  return 'Action: unknown.'
})

async function copyErrorDetails() {
  const env = normalizedError.value
  if (!env) return
  const details = JSON.stringify(env, null, 2)
  try {
    await navigator.clipboard.writeText(details)
  } catch {
    // no-op (clipboard may be unavailable depending on Electron/webPreferences)
  }
}

type ActiveStream = Readonly<{
  abort: AbortController
  assistantMessageId: string
  assistantSeq: number
  pendingAppendText: { value: string }
  flushing: { value: boolean }
  flushTimer: { id: ReturnType<typeof setTimeout> | null }
}>

const activeStream = ref<ActiveStream | null>(null)

// ======== IDENTITY SSOT ========
// All identity checks (is streaming? should disable?) MUST use this computed, NOT activeStream directly.
// This prevents object-reference comparison traps. Only onAbort() may access activeStream.value for abort.
const activeAssistantMessageId = computed(() => activeStream.value?.assistantMessageId ?? null)

function isUiDebugEnabled(): boolean {
  try {
    return String(globalThis?.localStorage?.getItem('sv_debug_chat') ?? '').trim() === '1'
  } catch {
    return false
  }
}

function shouldLogDebug(): boolean {
  return !!import.meta.env?.DEV || isUiDebugEnabled()
}

function hasDbBridge(): boolean {
  const bridge = (globalThis as any).dbBridge as { invoke?: unknown } | undefined
  return !!(bridge && typeof bridge.invoke === 'function')
}

function toMessageVMTextFallback(raw: Readonly<{ id: string; role: string; body: string }>): MessageVM {
  const roleRaw = String(raw.role ?? '').trim()
  const role: MessageVM['role'] = roleRaw === 'user' ? 'user' : roleRaw === 'assistant' ? 'assistant' : 'tool'

  const text = typeof raw.body === 'string' ? raw.body : String(raw.body ?? '')
  const contentText = roleRaw === role ? text : `[role:${roleRaw}]\n${text}`

  return {
    messageId: raw.id,
    role,
    contentBlocks: contentText.length > 0 ? [{ type: 'text', text: contentText }] : [],
    toolCalls: [],
    reasoningView: { visibility: 'not_returned', panelState: 'collapsed' },
    streaming: { isTarget: false, isComplete: true },
  }
}

function hydrateStateFromPersistedMessages(convoId: string, rows: ReadonlyArray<Readonly<{ id: string; role: string; seq: number; body: string }>>) {
  const s = createInitialState()
  s.runs[convoId] = { runId: convoId, status: 'idle', comments: [] }
  s.runMessageIds[convoId] = []

  for (const r of rows) {
    const messageId = r.id
    const roleRaw = String(r.role ?? '').trim()
    const role = roleRaw === 'user' ? 'user' : roleRaw === 'assistant' ? 'assistant' : roleRaw === 'tool' ? 'tool' : 'tool'
    const body = typeof r.body === 'string' ? r.body : String(r.body ?? '')
    const contentText = roleRaw === role ? body : `[role:${roleRaw}]\n${body}`

    s.messages[messageId] = {
      messageId,
      role,
      contentText,
      contentBlocks: contentText.length > 0 ? [{ type: 'text', text: contentText }] : [],
      toolCalls: [],
      reasoningDetailsRaw: [],
      reasoningStreamingText: '',
      reasoningSummaryText: undefined,
      reasoningPanelState: 'collapsed',
      hasEncryptedReasoning: false,
      streaming: { isTarget: false, isComplete: true },
      requestedReasoningMode: 'auto',
      requestedReasoningEffort: undefined,
      requestedReasoningExclude: false,
    }

    s.runMessageIds[convoId].push(messageId)
  }

  state.value = s
}

function questionIdForMessage(messageId: string, role: string): string | null {
  if (role === 'user') return messageId
  const meta = messageMetaById.value.get(messageId)
  return meta?.questionId ?? null
}

function isAnswerRootMessage(messageId: string): boolean {
  const meta = messageMetaById.value.get(messageId)
  return !!meta && meta.role === 'assistant' && meta.answerRootId === messageId
}

function isAnswerGroupStreamingForQuestion(questionId: string): boolean {
  const chosen = turnFiltersByQuestionId.value.get(questionId)?.chosenAnswerRootId
  if (!chosen) return false

  // Prefer the chosen root's status if we have it.
  const chosenMeta = messageMetaById.value.get(chosen)
  const chosenStatus = String(chosenMeta?.status ?? 'final').trim()
  if (chosenStatus === 'streaming') {
    // Self-heal: if persisted status is still 'streaming' but we already have non-empty content
    // (e.g. after a crash/old build), treat it as non-streaming so controls aren't permanently blocked.
    const msg = (state.value as any)?.messages?.[chosen] as { contentText?: string; contentBlocks?: any[] } | undefined
    const text = typeof msg?.contentText === 'string' ? msg.contentText : ''
    if (text.trim().length > 0) {
      if (import.meta.env?.DEV) {
        console.log('[ui-app] isAnswerGroupStreamingForQuestion: self-heal (has text)', { questionId, chosen, chosenStatus, textLen: text.length })
      }
      return false
    }
    if (Array.isArray(msg?.contentBlocks) && msg!.contentBlocks.length > 0) {
      if (import.meta.env?.DEV) {
        console.log('[ui-app] isAnswerGroupStreamingForQuestion: self-heal (has blocks)', { questionId, chosen, chosenStatus, blocksLen: msg!.contentBlocks.length })
      }
      return false
    }
    if (import.meta.env?.DEV) {
      console.log('[ui-app] isAnswerGroupStreamingForQuestion: blocking (status=streaming, no content)', { questionId, chosen, chosenStatus })
    }
    return true
  }

  // Fallback: if we have an active stream, only consider it streaming when the active target belongs to this answer group.
  const activeId = activeAssistantMessageId.value
  if (!activeId) return false
  if (activeId === chosen) return true
  const activeMeta = messageMetaById.value.get(activeId)
  return !!activeMeta && activeMeta.answerRootId === chosen
}

function isTurnExcludedForMessage(messageId: string, role: string): boolean {
  const qid = questionIdForMessage(messageId, role)
  if (!qid) return false
  const t = turnFiltersByQuestionId.value.get(qid)
  return t?.effectiveMode === 'exclude'
}

function getOrderedCandidatesOldToNew(questionId: string): BranchCandidate[] | null {
  const cached = candidatesCache.value.get(questionId)
  if (!cached) return null
  return [...cached].reverse()
}

function getCandidatePager(questionId: string): Readonly<{ index: number; total: number; canPrev: boolean; canNext: boolean }> | null {
  const ordered = getOrderedCandidatesOldToNew(questionId)
  if (!ordered) return null
  const chosen = turnFiltersByQuestionId.value.get(questionId)?.chosenAnswerRootId
  const total = ordered.length
  if (!chosen || total <= 0) return { index: 0, total: Math.max(0, total), canPrev: false, canNext: false }
  const idx = ordered.findIndex((c) => c.answerRootId === chosen)
  if (idx < 0) return { index: 0, total, canPrev: false, canNext: false }
  return { index: idx, total, canPrev: idx > 0, canNext: idx < total - 1 }
}

function getCandidateLoadToken(questionId: string): string {
  const qid = String(questionId ?? '').trim()
  const qEpoch = candidatesEpochByQuestionId.value.get(qid) ?? 0
  return `${candidatesEpochGlobal.value}:${qEpoch}`
}

function invalidateCandidatesForQuestion(questionId: string) {
  const qid = String(questionId ?? '').trim()
  if (!qid) return

  // Cancel any in-flight fetch and bump epoch so stale async results won't overwrite.
  const nextEpoch = (candidatesEpochByQuestionId.value.get(qid) ?? 0) + 1
  candidatesEpochByQuestionId.value.set(qid, nextEpoch)
  candidatesEpochByQuestionId.value = new Map(candidatesEpochByQuestionId.value)

  if (candidatesLoading.value.has(qid)) {
    candidatesLoading.value.delete(qid)
    candidatesLoading.value = new Map(candidatesLoading.value)
  }

  if (candidatesCache.value.has(qid)) {
    candidatesCache.value.delete(qid)
    candidatesCache.value = new Map(candidatesCache.value)
  }

  if (shouldLogDebug()) {
    console.log('[ui-app] invalidateCandidatesForQuestion', { questionId: qid, epochGlobal: candidatesEpochGlobal.value, questionEpoch: nextEpoch })
  }
}

async function ensureCandidatesLoaded(questionId: string) {
  const qid = String(questionId ?? '').trim()
  const bid = activeBranchId.value
  if (!qid || !bid) return
  if (candidatesCache.value.has(qid)) return

  const token = getCandidateLoadToken(qid)
  if (candidatesLoading.value.get(qid) === token) return

  candidatesLoading.value.set(qid, token)
  candidatesLoading.value = new Map(candidatesLoading.value)
  try {
    const list = await getBranchCandidates(bid, qid, { limit: 200 })

    // Drop stale async results (regenerate/retry can invalidate cache while a fetch is in-flight).
    if (activeBranchId.value !== bid) {
      if (shouldLogDebug()) console.warn('[ui-app] ensureCandidatesLoaded discard (branch changed)', { questionId: qid, branchId: bid, token })
      return
    }
    if (getCandidateLoadToken(qid) !== token) {
      if (shouldLogDebug()) console.warn('[ui-app] ensureCandidatesLoaded discard (token mismatch)', { questionId: qid, branchId: bid, token })
      return
    }

    if (shouldLogDebug()) {
      console.log('[ui-app] ensureCandidatesLoaded', {
        questionId: qid,
        branchId: bid,
        token,
        candidateCount: list.length,
        candidates: list.map(c => ({ answerRootId: c.answerRootId, status: c.status })),
      })
    }
    candidatesCache.value.set(qid, list)
    candidatesCache.value = new Map(candidatesCache.value)
  } finally {
    if (candidatesLoading.value.get(qid) === token) {
      candidatesLoading.value.delete(qid)
      candidatesLoading.value = new Map(candidatesLoading.value)
    }
  }
}

function getUserQuestionText(questionId: string): string {
  const qid = String(questionId ?? '').trim()
  if (!qid) return ''
  const msg = (state.value as any)?.messages?.[qid] as { contentText?: string } | undefined
  const text = typeof msg?.contentText === 'string' ? msg.contentText : ''
  return text.trim()
}

async function buildContextMessagesBeforeQuestion(branchId: string, questionId: string): Promise<InternalMessage[]> {
  const bid = String(branchId ?? '').trim()
  const qid = String(questionId ?? '').trim()
  if (!bid || !qid) return []

  const questionSeq = messageSeqById.value.get(qid)
  if (typeof questionSeq !== 'number' || !Number.isFinite(questionSeq)) return []

  const built = await buildContextForBranchInternalMessages(bid, { limit: 200, debug: !!import.meta.env?.DEV })
  const rowsBefore = built.rawMessages.filter((m) => typeof m.seq === 'number' && m.seq < questionSeq)
  return toInternalMessagesFromBranchPath(rowsBefore as any)
}

async function refreshTurnFilters(branchId: string) {
  const bid = String(branchId ?? '').trim()
  if (!bid) return

  const next = new Map<string, Readonly<EffectiveFilterResult & { chosenAnswerRootId: string }>>()

  try {
    const rendered = await getRenderableTurnsForBranch(bid, { limit: 5000, debug: !!import.meta.env?.DEV })
    if (import.meta.env?.DEV && rendered.debug) console.log('[ui-app] context.getRenderableTurns debug', rendered.debug)
    for (const t of rendered.turns) {
      if (!t.chosenAnswerRootId) continue
      next.set(t.questionId, {
        questionMode: t.questionMode,
        answerMode: t.answerMode,
        effectiveMode: t.effectiveMode,
        lockedByQuestionExclude: t.lockedByQuestionExclude,
        chosenAnswerRootId: t.chosenAnswerRootId,
      })
    }
  } catch (err) {
    if (import.meta.env?.DEV) console.warn('[ui-app] context.getRenderableTurns failed (filters UI may be incomplete)', err)
  }

  turnFiltersByQuestionId.value = next
}

async function getOpenRouterApiKey(): Promise<string | null> {
  const store = (globalThis as any).electronStore as { get?: (key: string) => Promise<any> } | undefined
  if (store?.get) {
    const key = String((await store.get('openRouterApiKey')) ?? '').trim()
    if (key) return key
  }
  return null
}

async function getOpenRouterBaseUrl(): Promise<string | null> {
  const store = (globalThis as any).electronStore as { get?: (key: string) => Promise<any> } | undefined
  if (store?.get) {
    const url = String((await store.get('openRouterBaseUrl')) ?? '').trim()
    if (url) return url
  }
  return null
}

function randomId(prefix: string): string {
  const cryptoObj = (globalThis as any).crypto as { randomUUID?: () => string } | undefined
  if (cryptoObj?.randomUUID) return `${prefix}_${cryptoObj.randomUUID()}`
  return `${prefix}_${Date.now()}_${Math.random().toString(16).slice(2)}`
}

async function flushPending(convoId: string, stream: ActiveStream) {
  if (stream.flushing.value) return
  const chunk = stream.pendingAppendText.value
  if (!chunk) return
  stream.flushing.value = true
  stream.pendingAppendText.value = ''
  try {
    await appendMessageDelta({ convoId, seq: stream.assistantSeq, appendBody: chunk })
  } finally {
    stream.flushing.value = false
  }
}

function clearFlushTimer(stream: ActiveStream) {
  if (!stream.flushTimer.id) return
  clearTimeout(stream.flushTimer.id)
  stream.flushTimer.id = null
}

function scheduleFlush(convoId: string, stream: ActiveStream, delayMs = 80) {
  if (stream.flushTimer.id) return
  stream.flushTimer.id = setTimeout(async () => {
    stream.flushTimer.id = null
    try {
      await flushPending(convoId, stream)
    } finally {
      if (stream.pendingAppendText.value.length > 0) scheduleFlush(convoId, stream, delayMs)
    }
  }, delayMs)
}

async function refreshConvos() {
  loadError.value = null
  convos.value = await listConvos({ order: 'updatedAt', limit: 200 })
  const active = activeConvoId.value
  if (active && !convos.value.some((c) => c.id === active)) {
    activeConvoId.value = convos.value[0]?.id ?? null
  }
  if (!activeConvoId.value && convos.value.length > 0) activeConvoId.value = convos.value[0].id
}

async function refreshProjects() {
  loadError.value = null
  projects.value = await listProjects({ order: 'name', limit: 500 })
}

async function refreshBranchesForActiveConvo() {
  const convoId = activeConvoId.value
  if (!convoId) {
    branches.value = []
    return
  }
  branches.value = await listBranches(convoId)
}

function resetCandidatesCache() {
  // Invalidate all candidate loads so in-flight requests can't repopulate after resets (e.g. end-of-stream reloads).
  candidatesEpochGlobal.value += 1
  candidatesCache.value = new Map()
  candidatesLoading.value = new Map()
  if (shouldLogDebug()) {
    console.log('[ui-app] resetCandidatesCache', { epochGlobal: candidatesEpochGlobal.value })
  }
}

async function refreshRenderableBranchView(branchId: string) {
  await loadTranscriptForBranch(branchId)
  // Candidate cache can be stale after operations that add/hide candidates (regenerate/retryReplace);
  // for switchCandidate we keep cache.
  for (const qid of turnFiltersByQuestionId.value.keys()) {
    void ensureCandidatesLoaded(qid)
  }
}

function patchBranch(branchId: string, patch: Partial<Omit<BranchSummary, 'id'>>) {
  const bid = String(branchId ?? '').trim()
  if (!bid) return
  branches.value = branches.value.map((b) => (b.id === bid ? ({ ...b, ...patch } satisfies BranchSummary) : b))
}

async function loadTranscriptForBranch(branchId: string) {
  const bid = String(branchId ?? '').trim()
  if (!bid) return

  // Anti-reordering: capture token before async operation.
  const myToken = ++transcriptRefreshToken.value
  const debug = isUiDebugEnabled()
  if (shouldLogDebug()) {
    console.log('[ui-app] loadTranscriptForBranch: fetching from DB', { branchId: bid, token: myToken, debug })
  }
  const rendered = await getRenderableTurnsForBranch(bid, { limit: 5000, debug })

  // Anti-reordering: discard if a newer refresh has started.
  if (transcriptRefreshToken.value !== myToken) {
    if (shouldLogDebug()) {
      console.log('[ui-app] loadTranscriptForBranch: discarding stale result', { branchId: bid, myToken, currentToken: transcriptRefreshToken.value })
    }
    return
  }
  if (debug && rendered.debug) console.log('[ui-app] context.getRenderableTurns debug', rendered.debug)
  const rows = rendered.messages
  hydrateStateFromPersistedMessages(bid, rows.map((m) => ({ id: m.id, role: m.role, seq: m.seq, body: m.body })))
  const seqMap = new Map<string, number>()
  for (const m of rows) seqMap.set(m.id, m.seq)
  messageSeqById.value = seqMap

  const metaMap = new Map<string, { questionId: string | null; answerRootId: string | null; role: string; status: string }>()
  for (const m of rows) {
    metaMap.set(m.id, {
      questionId: m.questionId ?? null,
      answerRootId: m.answerRootId ?? null,
      role: String(m.role ?? '').trim(),
      status: String(m.status ?? 'final'),
    })
  }
  messageMetaById.value = metaMap
  if (shouldLogDebug()) {
    const statuses = [...metaMap.entries()].map(([id, m]) => ({ id: id.slice(0, 8), status: m.status }))
    console.log('[ui-app] loadTranscriptForBranch: updated messageMetaById', { statuses })
  }
  const next = new Map<string, Readonly<EffectiveFilterResult & { chosenAnswerRootId: string }>>()
  const order: string[] = []
  for (const t of rendered.turns) {
    order.push(t.questionId)
    if (!t.chosenAnswerRootId) continue
    next.set(t.questionId, {
      questionMode: t.questionMode,
      answerMode: t.answerMode,
      effectiveMode: t.effectiveMode,
      lockedByQuestionExclude: t.lockedByQuestionExclude,
      chosenAnswerRootId: t.chosenAnswerRootId,
    })
  }
  turnFiltersByQuestionId.value = next
  questionTurnOrder.value = order

  // Self-heal: candidate cache may become stale after operations that add/hide candidates
  // (regenerate/retryReplace). If the cached candidate list no longer contains the chosen answer root,
  // drop the cache for that question so the next ensureCandidatesLoaded() re-fetches.
  let invalidated = false
  for (const [qid, t] of next.entries()) {
    const cached = candidatesCache.value.get(qid)
    if (!cached) continue
    if (cached.some((c) => c.answerRootId === t.chosenAnswerRootId)) continue
    candidatesCache.value.delete(qid)
    invalidated = true
  }
  if (invalidated) candidatesCache.value = new Map(candidatesCache.value)

  for (const qid of next.keys()) {
    void ensureCandidatesLoaded(qid)
  }
}

// ======== UNIFIED REFRESH ENTRY (Anti-reordering Guard) ========
// All transcript refreshes MUST use this function to ensure token-based ordering.
async function refreshTranscriptLatestOnly() {
  const bid = chosenBranchId()
  if (!bid) return
  await loadTranscriptForBranch(bid)
  assertInvariants()
}

// ======== INVARIANT ASSERTION (Development Only) ========
// Guards against regression: activeStream should never exist when status is 'final'.
function assertInvariants() {
  const activeId = activeAssistantMessageId.value
  if (import.meta.env.DEV && activeId) {
    const meta = messageMetaById.value.get(activeId)
    if (meta?.status === 'final' || meta?.status === 'error') {
      console.error('❌ INVARIANT VIOLATION: activeStream exists but message status is final/error', {
        assistantMessageId: activeId,
        status: meta.status
      })
      // Optional: Uncomment to break in debugger
      // debugger
    }
  }
}

// ======== FINALIZATION HELPERS (Enforces Correct Ordering) ========
// Encapsulates the critical pattern: refresh FIRST, then clear activeStream.
async function finalizeRun(assistantMessageId: string) {
  // ① Refresh from DB first (get latest status into messageMetaById)
  try {
    await refreshTranscriptLatestOnly()
    if (import.meta.env?.DEV) {
      const meta = messageMetaById.value.get(assistantMessageId)
      console.log('[ui-app] finalizeRun: after refresh', { assistantMessageId, statusInMeta: meta?.status })
    }
  } catch (err) {
    if (import.meta.env?.DEV) {
      console.warn('[ui-app] finalizeRun: refresh failed', err)
    }
  }
  
  // ② Then clear activeStream (single re-render with consistent state)
  clearActiveIfMatch(assistantMessageId)
}

function clearActiveIfMatch(assistantMessageId: string) {
  const shouldClear = activeStream.value?.assistantMessageId === assistantMessageId
  if (import.meta.env?.DEV) {
    console.log('[ui-app] clearActiveIfMatch: checking', {
      currentActiveStream: activeStream.value?.assistantMessageId,
      targetMessageId: assistantMessageId,
      shouldClear
    })
  }
  if (shouldClear) {
    activeStream.value = null
    if (import.meta.env?.DEV) {
      console.log('[ui-app] clearActiveIfMatch: cleared activeStream')
    }
  } else if (import.meta.env?.DEV && activeStream.value) {
    console.warn('[ui-app] clearActiveIfMatch: activeStream mismatch, NOT clearing')
  }
}

async function loadTranscriptForActiveConvo() {
  const convoId = activeConvoId.value
  if (!convoId) {
    state.value = createInitialState()
    messageSeqById.value = new Map()
    activeBranchId.value = null
    branches.value = []
    messageMetaById.value = new Map()
    turnFiltersByQuestionId.value = new Map()
    questionTurnOrder.value = []
    return
  }

  const ensured = await ensureDefaultBranch(convoId, { name: 'Main' })
  await refreshBranchesForActiveConvo()
  if (!branches.value.some((b) => b.id === ensured.id)) branches.value = [ensured, ...branches.value]

  const preferredId = activeBranchId.value
  const selected =
    (preferredId ? branches.value.find((b) => b.id === preferredId) : null) ??
    branches.value.find((b) => b.id === ensured.id) ??
    branches.value[0] ??
    ensured
  activeBranchId.value = selected.id
  resetCandidatesCache()
  await refreshTranscriptLatestOnly()
}

async function onSelectConvo(convoId: string) {
  if (isRunning.value) return
  activeConvoId.value = convoId
  await refreshTranscriptLatestOnly()
}

async function onSelectBranch(branchId: string) {
  if (isRunning.value) return
  const bid = String(branchId ?? '').trim()
  if (!bid || bid === activeBranchId.value) return
  activeBranchId.value = bid
  resetCandidatesCache()
  await refreshTranscriptLatestOnly()
}

async function onRenameConvo(convoId: string, title: string) {
  if (isRunning.value) return
  try {
    await renameConvo(convoId, title)
    await refreshConvos()
  } catch (err: any) {
    loadError.value = err?.message ? String(err.message) : String(err)
  }
}

async function onDeleteConvo(convoId: string) {
  if (isRunning.value) return
  try {
    await deleteConvo(convoId)
    await refreshConvos()
    await refreshTranscriptLatestOnly()
  } catch (err: any) {
    loadError.value = err?.message ? String(err.message) : String(err)
  }
}

async function onMoveConvoToProject(convoId: string, projectId: string | null) {
  if (isRunning.value) return
  try {
    await setConvoProject(convoId, projectId)
    await refreshConvos()
  } catch (err: any) {
    loadError.value = err?.message ? String(err.message) : String(err)
  }
}

async function onBulkDeleteConvos(convoIds: string[]) {
  if (isRunning.value) return
  try {
    await deleteConvos(convoIds)
    await refreshConvos()
    await refreshTranscriptLatestOnly()
  } catch (err: any) {
    loadError.value = err?.message ? String(err.message) : String(err)
  }
}

async function onBulkMoveConvosToProject(convoIds: string[], projectId: string | null) {
  if (isRunning.value) return
  try {
    await setConvoProjectMany(convoIds, projectId)
    await refreshConvos()
  } catch (err: any) {
    loadError.value = err?.message ? String(err.message) : String(err)
  }
}

async function onCreateConvo() {
  if (isRunning.value) return
  const created = await createConvo({ title: `New chat ${new Date().toLocaleString()}` })
  await refreshConvos()
  if (created) activeConvoId.value = created.id
  await refreshTranscriptLatestOnly()
}

const convoListItems = computed<ConversationListItem[]>(() =>
  convos.value.map((c) => ({ id: c.id, title: c.title, updatedAt: c.updatedAt }))
)

const projectListItems = computed<ProjectListItem[]>(() => projects.value.map((p) => ({ id: p.id, name: p.name })))

const activeTitle = computed(() => convos.value.find((c) => c.id === activeConvoId.value)?.title ?? '')

async function ensureActiveConvo(): Promise<string> {
  if (activeConvoId.value) return activeConvoId.value
  const created = await createConvo({ title: `New chat ${new Date().toLocaleString()}` })
  await refreshConvos()
  if (!created?.id) throw new Error('Failed to create conversation')
  activeConvoId.value = created.id
  await refreshTranscriptLatestOnly()
  return created.id
}

async function ensureActiveBranch(convoId: string): Promise<BranchSummary> {
  const current = activeBranch.value
  if (current && current.convoId === convoId && current.deletedAt == null) return current
  const ensured = await ensureDefaultBranch(convoId, { name: 'Main' })
  await refreshBranchesForActiveConvo()
  if (!branches.value.some((b) => b.id === ensured.id)) branches.value = [ensured, ...branches.value]
  activeBranchId.value = ensured.id
  return ensured
}

async function onAbort() {
  const s = activeStream.value
  if (!s) return
  s.abort.abort('abort')
}

function openSettings() {
  if (!isReady.value) return
  settingsOpen.value = true
}

function closeSettings() {
  settingsOpen.value = false
}

async function startStreamingForAssistantTurn(input: Readonly<{
  convoId: string
  branchId: string
  questionId: string
  questionText: string
  assistantMessageId: string
  assistantSeq: number
  contextMessages: ReadonlyArray<InternalMessage>
}>) {
  const convoId = String(input.convoId ?? '').trim()
  const branchId = String(input.branchId ?? '').trim()
  const questionId = String(input.questionId ?? '').trim()
  const assistantMessageId = String(input.assistantMessageId ?? '').trim()
  const assistantSeq = Number(input.assistantSeq ?? NaN)
  const questionText = typeof input.questionText === 'string' ? input.questionText : String(input.questionText ?? '')
  if (!convoId || !branchId || !questionId || !assistantMessageId || !Number.isFinite(assistantSeq) || !questionText.trim()) return

  // Invariant: while streaming a regenerate/retry answer, the UI should already be projected onto the new chosen answer root.
  // If not, force a single DB-backed rehydrate before we begin streaming to avoid temporarily rendering both old+new variants.
  if (activeBranchId.value === branchId) {
    const chosen = turnFiltersByQuestionId.value.get(questionId)?.chosenAnswerRootId ?? null
    if (chosen && chosen !== assistantMessageId) {
      if (shouldLogDebug()) {
        console.warn('[ui-app] startStreamingForAssistantTurn: chosen mismatch; reloading transcript', {
          branchId,
          questionId,
          chosenAnswerRootId: chosen,
          assistantMessageId,
        })
      }
      // Refresh through unified entry if this is the active branch, else direct call
      if (branchId === activeBranchId.value) {
        await refreshTranscriptLatestOnly()
      } else {
        await loadTranscriptForBranch(branchId)
      }
    }
  }

  const apiKey = await getOpenRouterApiKey()
  if (!apiKey) {
    loadError.value = 'Missing OpenRouter API key (set electron-store openRouterApiKey or VITE_OPENROUTER_API_KEY)'
    try {
      await setMessageStatus({ messageId: assistantMessageId, status: 'error' })
    } catch {
      // no-op
    }
    await refreshTranscriptLatestOnly()
    return
  }

  const baseUrl = await getOpenRouterBaseUrl()
  const model = 'openrouter/auto'

  const started = startGeneration(state.value, {
    runId: branchId,
    requestId: randomId('req'),
    model,
    userMessageId: questionId,
    userMessageText: questionText,
    assistantMessageId,
    requestedReasoningMode: 'auto',
  })
  state.value = started.state

  const abort = new AbortController()
  const stream: ActiveStream = {
    abort,
    assistantMessageId,
    assistantSeq,
    pendingAppendText: { value: '' },
    flushing: { value: false },
    flushTimer: { id: null },
  }
  activeStream.value = stream

  let finalStatus: 'final' | 'error' = 'final'
  try {
    for await (const ev of streamOpenRouterChatAsEvents({
      requestId: randomId('req'),
      assistantMessageId,
      userText: questionText,
      contextMessages: input.contextMessages,
      signal: abort.signal,
      config: {
        apiKey,
        model,
        requestedReasoningMode: 'auto',
        ...(baseUrl ? { baseUrl } : {}),
      },
    })) {
      state.value = applyEvent(state.value, branchId, ev)

      if (ev.type === 'MessageDeltaText' && ev.messageId === assistantMessageId) {
        stream.pendingAppendText.value += ev.text
        scheduleFlush(convoId, stream)
      }
      if (ev.type === 'MessageAppendContentBlock' && ev.messageId === assistantMessageId && ev.block?.type === 'text') {
        stream.pendingAppendText.value += String((ev.block as any).text ?? '')
        scheduleFlush(convoId, stream)
      }

      if (ev.type === 'StreamDone' || ev.type === 'StreamAbort' || ev.type === 'StreamError') {
        if (ev.type === 'StreamAbort' || ev.type === 'StreamError') finalStatus = 'error'
        clearFlushTimer(stream)
        await flushPending(convoId, stream)
      }
    }

    clearFlushTimer(stream)
    await flushPending(convoId, stream)
    await setMessageStatus({ messageId: assistantMessageId, status: finalStatus })
  } catch (err: any) {
    finalStatus = 'error'
    loadError.value = err?.message ? String(err.message) : String(err)
    try {
      await setMessageStatus({ messageId: assistantMessageId, status: 'error' })
    } catch {
      // no-op
    }
  } finally {
    clearFlushTimer(stream)
    // Use unified finalization to enforce: refresh FIRST, then clear activeStream.
    await finalizeRun(assistantMessageId)
  }
}

async function onSend() {
  if (isRunning.value) return
  const text = draft.value.trim()
  if (!text) return
  draft.value = ''

  const convoId = await ensureActiveConvo()
  const branch = await ensureActiveBranch(convoId)
  loadError.value = null

  const apiKey = await getOpenRouterApiKey()
  if (!apiKey) {
    loadError.value = 'Missing OpenRouter API key (set electron-store openRouterApiKey or VITE_OPENROUTER_API_KEY)'
    return
  }

  const baseUrl = await getOpenRouterBaseUrl()
  const model = 'openrouter/auto'

  let contextMessages: any[] = []
  try {
    const built = await buildContextForBranchInternalMessages(branch.id, { limit: 200, debug: !!import.meta.env?.DEV })
    contextMessages = built.contextMessages as any[]
  } catch (err) {
    if (import.meta.env?.DEV) console.warn('[ui-app] context.buildForBranch failed; using empty context', err)
  }

  const begun = await beginTurn(branch.id, text)
  patchBranch(branch.id, { headMessageId: begun.assistantId, updatedAt: Date.now() })

  const userMessageId = begun.questionId
  const assistantMessageId = begun.assistantId
  const assistantSeq = begun.assistantSeq

  messageSeqById.value.set(userMessageId, begun.questionSeq)
  messageSeqById.value.set(assistantMessageId, assistantSeq)

  const started = startGeneration(state.value, {
    runId: branch.id,
    requestId: randomId('req'),
    model,
    userMessageId,
    userMessageText: text,
    assistantMessageId,
    requestedReasoningMode: 'auto',
  })
  state.value = started.state

  const abort = new AbortController()
  const stream: ActiveStream = {
    abort,
    assistantMessageId,
    assistantSeq,
    pendingAppendText: { value: '' },
    flushing: { value: false },
    flushTimer: { id: null },
  }
  activeStream.value = stream

  let finalStatus: 'final' | 'error' = 'final'
  try {
    for await (const ev of streamOpenRouterChatAsEvents({
      requestId: randomId('req'),
      assistantMessageId,
      userText: text,
      contextMessages,
      signal: abort.signal,
      config: {
        apiKey,
        model,
        requestedReasoningMode: 'auto',
        ...(baseUrl ? { baseUrl } : {}),
      },
    })) {
      state.value = applyEvent(state.value, branch.id, ev)

      if (ev.type === 'MessageDeltaText' && ev.messageId === assistantMessageId) {
        stream.pendingAppendText.value += ev.text
        scheduleFlush(convoId, stream)
      }
      if (ev.type === 'MessageAppendContentBlock' && ev.messageId === assistantMessageId && ev.block?.type === 'text') {
        stream.pendingAppendText.value += String((ev.block as any).text ?? '')
        scheduleFlush(convoId, stream)
      }

      if (ev.type === 'StreamDone' || ev.type === 'StreamAbort' || ev.type === 'StreamError') {
        if (ev.type === 'StreamAbort' || ev.type === 'StreamError') finalStatus = 'error'
        clearFlushTimer(stream)
        await flushPending(convoId, stream)
      }
    }

    clearFlushTimer(stream)
    await flushPending(convoId, stream)
    await setMessageStatus({ messageId: assistantMessageId, status: finalStatus })
  } catch (err: any) {
    finalStatus = 'error'
    loadError.value = err?.message ? String(err.message) : String(err)
    try {
      await setMessageStatus({ messageId: assistantMessageId, status: 'error' })
    } catch {
      // no-op
    }
  } finally {
    clearFlushTimer(stream)
    // Use unified finalization to enforce: refresh FIRST, then clear activeStream.
    await finalizeRun(assistantMessageId)
  }
}

async function onForkFromHead() {
  if (isRunning.value) return
  const convoId = activeConvoId.value
  const branch = activeBranch.value
  if (!convoId || !branch?.id || !branch.headMessageId) return

  try {
    const created = await createBranchFromMessage({
      sourceBranchId: branch.id,
      baseMessageId: branch.headMessageId,
      copyChoices: true,
      copyFilters: true,
      requireOnSourcePath: true,
    })
    await refreshBranchesForActiveConvo()
    activeBranchId.value = created.id
    resetCandidatesCache()
    await refreshRenderableBranchView(created.id)
  } catch (err: any) {
    loadError.value = err?.message ? String(err.message) : String(err)
  }
}

async function onDeleteActiveBranch() {
  if (isRunning.value) return
  const convoId = activeConvoId.value
  const bid = activeBranchId.value
  if (!convoId || !bid) return
  if (branches.value.length <= 1) return

  try {
    await deleteBranch(bid)
    await refreshBranchesForActiveConvo()
    const next = branches.value[0] ?? (await ensureDefaultBranch(convoId, { name: 'Main' }))
    activeBranchId.value = next.id
    resetCandidatesCache()
    await refreshRenderableBranchView(next.id)
  } catch (err: any) {
    loadError.value = err?.message ? String(err.message) : String(err)
  }
}

async function onCandidateShift(questionId: string, delta: -1 | 1) {
  const bid = activeBranchId.value
  if (!bid) return
  if (activeAssistantMessageId.value) return

  const ordered = getOrderedCandidatesOldToNew(questionId)
  if (!ordered) {
    if (import.meta.env?.DEV) {
      console.log('[ui-app] onCandidateShift: no cached candidates, triggering load', { questionId })
    }
    await ensureCandidatesLoaded(questionId)
    return
  }

  const current = turnFiltersByQuestionId.value.get(questionId)
  const chosen = current?.chosenAnswerRootId
  const idx = chosen ? ordered.findIndex((c) => c.answerRootId === chosen) : -1
  const targetIndex = idx + delta
  
  if (import.meta.env?.DEV) {
    console.log('[ui-app] onCandidateShift', {
      questionId,
      delta,
      orderedCount: ordered.length,
      orderedIds: ordered.map(c => c.answerRootId),
      chosenAnswerRootId: chosen,
      currentIndex: idx,
      targetIndex,
      canShift: idx >= 0 && targetIndex >= 0 && targetIndex < ordered.length,
    })
  }
  
  if (idx < 0 || targetIndex < 0 || targetIndex >= ordered.length) return

  const target = ordered[targetIndex]
  try {
    if (import.meta.env?.DEV) {
      console.log('[ui-app] switchCandidate', {
        branchId: bid,
        questionId,
        from: `${idx + 1}/${ordered.length}`,
        to: `${targetIndex + 1}/${ordered.length}`,
        oldAnswerRootId: chosen,
        newAnswerRootId: target.answerRootId,
      })
    }
    await switchCandidate(bid, questionId, target.answerRootId)
    await refreshRenderableBranchView(bid)
  } catch (err: any) {
    loadError.value = err?.message ? String(err.message) : String(err)
    await refreshRenderableBranchView(bid)
  }
}

async function onRegenerateFromQuestion(questionId: string) {
  if (isRunning.value) return
  if (activeAssistantMessageId.value) return

  const convoId = activeConvoId.value
  const branch = activeBranch.value
  const qid = String(questionId ?? '').trim()
  if (!convoId || !branch?.id || !qid) return

  const questionText = getUserQuestionText(qid)
  if (!questionText) return

  // Capture old chosen answer root for debugging
  const oldChosenAnswerRootId = turnFiltersByQuestionId.value.get(qid)?.chosenAnswerRootId
  if (import.meta.env?.DEV) {
    console.log('[ui-app] onRegenerateFromQuestion START', {
      questionId: qid,
      branchId: branch.id,
      oldChosenAnswerRootId,
    })
  }

  loadError.value = null
  const contextMessages = await buildContextMessagesBeforeQuestion(branch.id, qid)

  try {
    const regen = await regenerateFromQuestion(branch.id, qid)
    if (import.meta.env?.DEV) {
      console.log('[ui-app] onRegenerateFromQuestion after regenerate', {
        newAnswerRootId: regen.newAnswerRootId,
        newAssistantSeq: regen.newAssistantSeq,
      })
    }
    invalidateCandidatesForQuestion(qid)
    patchBranch(branch.id, { headMessageId: regen.newAnswerRootId, updatedAt: Date.now() })
    await refreshRenderableBranchView(branch.id)
    
    // Log candidates after refresh
    if (import.meta.env?.DEV) {
      const cachedCandidates = candidatesCache.value.get(qid)
      console.log('[ui-app] onRegenerateFromQuestion after refresh', {
        cachedCandidatesCount: cachedCandidates?.length ?? 0,
        cachedCandidateIds: cachedCandidates?.map(c => c.answerRootId) ?? [],
        newChosenAnswerRootId: turnFiltersByQuestionId.value.get(qid)?.chosenAnswerRootId,
      })
    }
    
    await startStreamingForAssistantTurn({
      convoId,
      branchId: branch.id,
      questionId: qid,
      questionText,
      assistantMessageId: regen.newAnswerRootId,
      assistantSeq: regen.newAssistantSeq,
      contextMessages,
    })
  } catch (err: any) {
    loadError.value = err?.message ? String(err.message) : String(err)
    await refreshRenderableBranchView(branch.id)
  }
}

const retryReplaceUiDebugOnce = new Set<string>()

function canRetryReplaceInUi(questionId: string, answerRootId: string): boolean {
  const qid = String(questionId ?? '').trim()
  const ar = String(answerRootId ?? '').trim()
  if (!qid || !ar) return false

  const debug = isUiDebugEnabled()
  const baseKey = `${qid}:${ar}`
  const logBlock = (reason: string, data: Record<string, unknown>) => {
    if (!debug) return
    const k = `${baseKey}:${reason}`
    if (retryReplaceUiDebugOnce.has(k)) return
    retryReplaceUiDebugOnce.add(k)
    console.warn('[ui-app] canRetryReplaceInUi blocked', { reason, ...data })
  }

  const lastQ = questionTurnOrder.value.length > 0 ? questionTurnOrder.value[questionTurnOrder.value.length - 1] : null
  if (lastQ !== qid) {
    logBlock('not_last_question', { qid, lastQ, orderLen: questionTurnOrder.value.length })
    return false
  }

  const chosen = turnFiltersByQuestionId.value.get(qid)?.chosenAnswerRootId
  if (chosen !== ar) {
    logBlock('choice_mismatch', { qid, chosen, ar })
    return false
  }

  const headId = activeBranch.value?.headMessageId
  // Head should be within this answer group. If we can't resolve head meta from the current projection,
  // defer strict validation to the backend (UI keeps the button enabled).
  if (headId) {
    const headMeta = messageMetaById.value.get(headId)
    const headAnswerRoot = headMeta?.answerRootId ?? null
    // If we can't resolve head's answer root from the current projection, defer strict validation to the backend.
    if (headMeta && headAnswerRoot && headId !== ar && headAnswerRoot !== ar) {
      logBlock('head_not_within_answer_group', { qid, ar, headId, headAnswerRoot })
      return false
    }
  }

  return true
}

async function onRetryReplaceAnswer(questionId: string, currentAnswerRootId: string) {
  if (isRunning.value) return
  if (activeAssistantMessageId.value) return

  const convoId = activeConvoId.value
  const branch = activeBranch.value
  const qid = String(questionId ?? '').trim()
  const current = String(currentAnswerRootId ?? '').trim()
  if (!convoId || !branch?.id || !qid || !current) return

  const questionText = getUserQuestionText(qid)
  if (!questionText) return

  loadError.value = null
  const contextMessages = await buildContextMessagesBeforeQuestion(branch.id, qid)

  try {
    const res = await retryReplaceAnswer(branch.id, qid, current)
    invalidateCandidatesForQuestion(qid)
    patchBranch(branch.id, { headMessageId: res.newAnswerRootId, updatedAt: Date.now() })
    await refreshRenderableBranchView(branch.id)
    await startStreamingForAssistantTurn({
      convoId,
      branchId: branch.id,
      questionId: qid,
      questionText,
      assistantMessageId: res.newAnswerRootId,
      assistantSeq: res.newAssistantSeq,
      contextMessages,
    })
  } catch (err: any) {
    loadError.value = err?.message ? String(err.message) : String(err)
    await refreshRenderableBranchView(branch.id)
  }
}

async function onToggleQuestionExclude(questionId: string) {
  const bid = activeBranchId.value
  if (!bid) return
  const current = turnFiltersByQuestionId.value.get(questionId)
  if (current?.questionMode === 'exclude') {
    await clearBranchFilter({ branchId: bid, targetType: 'question', targetId: questionId })
  } else {
    await setBranchFilter({ branchId: bid, targetType: 'question', targetId: questionId, mode: 'exclude' })
  }
  await refreshTurnFilters(bid)
}

async function onToggleAnswerExclude(questionId: string, answerRootId: string) {
  const bid = activeBranchId.value
  if (!bid) return
  const current = turnFiltersByQuestionId.value.get(questionId)
  if (!current || current.chosenAnswerRootId !== answerRootId) return
  if (current.lockedByQuestionExclude) return

  if (current.answerMode === 'exclude') {
    await clearBranchFilter({ branchId: bid, targetType: 'answer', targetId: answerRootId })
  } else {
    await setBranchFilter({ branchId: bid, targetType: 'answer', targetId: answerRootId, mode: 'exclude' })
  }
  await refreshTurnFilters(bid)
}

onMounted(async () => {
  isReady.value = false
  loadError.value = null

  if (!hasDbBridge()) {
    isReady.value = true
    loadError.value = 'Missing dbBridge (run in Electron via `npm run electron:dev`)'
    return
  }

  try {
    await refreshProjects()
    await refreshConvos()
    await refreshTranscriptLatestOnly()
  } catch (err: any) {
    loadError.value = err?.message ? String(err.message) : String(err)
  } finally {
    isReady.value = true
  }
})

const lastTranscriptSig = ref('')
watch(
  transcript,
  (next) => {
    if (!shouldLogDebug()) return
    const ids = next.map((m) => m.messageId)
    const uniq = new Set(ids)

    const sig = `${runId.value ?? ''}:${ids.length}:${uniq.size}:${ids.slice(-6).join(',')}`
    if (sig === lastTranscriptSig.value) return
    lastTranscriptSig.value = sig

    if (ids.length !== uniq.size) {
      const seen = new Set<string>()
      const dupes: string[] = []
      for (const id of ids) {
        if (seen.has(id)) dupes.push(id)
        else seen.add(id)
      }
      console.warn('[ui-app] transcript has duplicate messageIds (Vue keys unstable)', { runId: runId.value, dupes, ids })
    }
  },
  { deep: false }
)
</script>

<template>
  <div class="flex h-full">
    <ConversationList
      :items="convoListItems"
      :activeId="activeConvoId"
      :projects="projectListItems"
      :disabled="!isReady || isRunning"
      @select="onSelectConvo"
      @create="onCreateConvo"
      @refresh="refreshConvos"
      @rename="onRenameConvo"
      @delete="onDeleteConvo"
      @moveToProject="onMoveConvoToProject"
      @bulkDelete="onBulkDeleteConvos"
      @bulkMoveToProject="onBulkMoveConvosToProject"
    />

    <div class="min-h-0 flex-1">
      <ChatLayout sidePanel="right">
        <template #status>
          <div class="flex items-center justify-between gap-2 px-4 py-2 text-xs text-gray-600">
            <div class="min-w-0">
              <div class="truncate font-semibold uppercase tracking-wide">ui-app</div>
              <div class="truncate text-[11px] text-gray-500">
                {{ activeTitle || 'No active conversation' }}
              </div>
            </div>
            <div class="flex items-center gap-2 text-[11px] text-gray-500">
              <label class="sr-only" for="branch-select">Branch</label>
              <select
                id="branch-select"
                class="rounded border border-gray-200 bg-white px-2 py-1 text-[11px] text-gray-700 shadow-sm disabled:opacity-50"
                :disabled="!isReady || isRunning || branches.length === 0"
                :value="activeBranchId ?? ''"
                data-testid="branch-select"
                @change="onSelectBranch(($event.target as HTMLSelectElement).value)"
              >
                <option v-for="b in branches" :key="b.id" :value="b.id">
                  {{ b.name ?? b.id.slice(0, 8) }}
                </option>
              </select>
              <button
                type="button"
                class="rounded-md border border-gray-200 bg-white px-2 py-1 text-[11px] text-gray-700 shadow-sm hover:bg-gray-50 disabled:opacity-50"
                :disabled="!isReady || isRunning || !activeBranch?.headMessageId"
                data-testid="branch-fork-head"
                @click="onForkFromHead"
              >
                Fork
              </button>
              <button
                type="button"
                class="rounded-md border border-gray-200 bg-white px-2 py-1 text-[11px] text-gray-700 shadow-sm hover:bg-gray-50 disabled:opacity-50"
                :disabled="!isReady || isRunning || branches.length <= 1"
                data-testid="branch-delete"
                @click="onDeleteActiveBranch"
              >
                Delete
              </button>
              <div>Phase 3 (text-only)</div>
              <button
                type="button"
                class="rounded-md border border-gray-200 bg-white px-2 py-1 text-[11px] text-gray-700 shadow-sm hover:bg-gray-50 disabled:opacity-50"
                :disabled="!isReady || isRunning"
                aria-label="Open settings"
                @click="openSettings"
              >
                Settings
              </button>
            </div>
          </div>
          <div v-if="loadError" class="border-t border-red-200 bg-red-50 px-4 py-2 text-xs text-red-900">
            {{ loadError }}
          </div>
          <div v-else-if="normalizedErrorSummary" class="border-t border-amber-200 bg-amber-50 px-4 py-2 text-xs text-amber-900">
            <div class="flex items-start justify-between gap-3">
              <div class="min-w-0">
                <div class="break-words">{{ normalizedErrorSummary }}</div>
                <div v-if="normalizedErrorActionHint" class="mt-1 text-[11px] text-amber-800">{{ normalizedErrorActionHint }}</div>
              </div>
              <button
                type="button"
                class="shrink-0 rounded border border-amber-300 bg-white px-2 py-1 text-[11px] text-amber-900 hover:bg-amber-100"
                @click="copyErrorDetails"
              >
                Copy details
              </button>
            </div>
          </div>
        </template>

        <template #transcript>
          <ChatTranscript :messages="transcript" :error="runVM?.error" emptyText="No messages in this conversation yet.">
            <template #message="{ message }">
              <div
                class="rounded-2xl"
                :class="isTurnExcludedForMessage(message.messageId, message.role) ? 'opacity-45 grayscale' : ''"
                :data-testid="`msg-wrap-${message.messageId}`"
              >
                <ChatMessageBubble :message="message" />

                <div v-if="message.role === 'user'" class="mt-2 flex items-center gap-2 pl-11 text-[11px] text-gray-500">
                  <button
                    type="button"
                    class="rounded border border-gray-200 bg-white px-2 py-1 text-[11px] text-gray-700 hover:bg-gray-50"
                    :data-testid="`toggle-q-${message.messageId}`"
                    @click="onToggleQuestionExclude(message.messageId)"
                  >
                    {{ turnFiltersByQuestionId.get(message.messageId)?.questionMode === 'exclude' ? 'Restore question' : 'Exclude question' }}
                  </button>

                  <button
                    type="button"
                    class="rounded border border-gray-200 bg-white px-2 py-1 text-[11px] text-gray-700 hover:bg-gray-50 disabled:opacity-50"
                    :disabled="activeAssistantMessageId != null || isAnswerGroupStreamingForQuestion(message.messageId)"
                    :data-testid="`regen-q-${message.messageId}`"
                    @click="onRegenerateFromQuestion(message.messageId)"
                  >
                    Regenerate
                  </button>

                  <div v-if="getCandidatePager(message.messageId)?.total > 1" class="ml-auto flex items-center gap-1 text-gray-600">
                    <button
                      type="button"
                      class="rounded border border-gray-200 bg-white px-2 py-1 text-[11px] text-gray-700 hover:bg-gray-50 disabled:opacity-50"
                      :disabled="
                        activeAssistantMessageId != null ||
                        candidatesLoading.has(message.messageId) ||
                        !getCandidatePager(message.messageId)?.canPrev ||
                        isAnswerGroupStreamingForQuestion(message.messageId)
                      "
                      :data-testid="`cand-prev-${message.messageId}`"
                      @click="onCandidateShift(message.messageId, -1)"
                    >
                      &lt;
                    </button>
                    <div :data-testid="`cand-pos-${message.messageId}`" class="min-w-[48px] text-center">
                      {{
                        `${(getCandidatePager(message.messageId)?.index ?? 0) + 1}/${getCandidatePager(message.messageId)?.total ?? 1}`
                      }}
                    </div>
                    <button
                      type="button"
                      class="rounded border border-gray-200 bg-white px-2 py-1 text-[11px] text-gray-700 hover:bg-gray-50 disabled:opacity-50"
                      :disabled="
                        activeAssistantMessageId != null ||
                        candidatesLoading.has(message.messageId) ||
                        !getCandidatePager(message.messageId)?.canNext ||
                        isAnswerGroupStreamingForQuestion(message.messageId)
                      "
                      :data-testid="`cand-next-${message.messageId}`"
                      @click="onCandidateShift(message.messageId, 1)"
                    >
                      &gt;
                    </button>
                  </div>
                </div>

                <div
                  v-else-if="message.role === 'assistant' && isAnswerRootMessage(message.messageId)"
                  class="mt-2 flex items-center gap-2 pl-11 text-[11px] text-gray-500"
                >
                  <button
                    v-if="questionIdForMessage(message.messageId, message.role) && turnFiltersByQuestionId.get(questionIdForMessage(message.messageId, message.role)!)?.chosenAnswerRootId === message.messageId"
                    type="button"
                    class="rounded border border-gray-200 bg-white px-2 py-1 text-[11px] text-gray-700 hover:bg-gray-50 disabled:opacity-50"
                    :disabled="turnFiltersByQuestionId.get(questionIdForMessage(message.messageId, message.role)!)?.lockedByQuestionExclude === true"
                    :data-testid="`toggle-a-${message.messageId}`"
                    @click="onToggleAnswerExclude(questionIdForMessage(message.messageId, message.role)!, message.messageId)"
                  >
                    {{
                      turnFiltersByQuestionId.get(questionIdForMessage(message.messageId, message.role)!)?.answerMode === 'exclude'
                        ? 'Restore answer'
                        : 'Exclude answer'
                    }}
                  </button>
                  <button
                    v-if="questionIdForMessage(message.messageId, message.role) && turnFiltersByQuestionId.get(questionIdForMessage(message.messageId, message.role)!)?.chosenAnswerRootId === message.messageId"
                    type="button"
                    class="rounded border border-gray-200 bg-white px-2 py-1 text-[11px] text-gray-700 hover:bg-gray-50 disabled:opacity-50"
                    :disabled="
                      activeAssistantMessageId != null ||
                      isAnswerGroupStreamingForQuestion(questionIdForMessage(message.messageId, message.role)!) ||
                      !canRetryReplaceInUi(questionIdForMessage(message.messageId, message.role)!, message.messageId)
                    "
                    :data-testid="`retry-a-${message.messageId}`"
                    @click="onRetryReplaceAnswer(questionIdForMessage(message.messageId, message.role)!, message.messageId)"
                  >
                    Retry replace
                  </button>
                  <div v-else class="text-[11px] text-gray-400">answer not selected for context</div>
                </div>
              </div>
            </template>
          </ChatTranscript>
        </template>

        <template #side>
          <div class="h-full p-4 text-sm text-gray-600">Right panel placeholder (reasoning/usage later)</div>
        </template>

        <template #composer>
          <ChatAppComposer v-model:draft="draft" :disabled="!isReady" :isRunning="isRunning" @send="onSend" @abort="onAbort" />
        </template>
      </ChatLayout>

      <SettingsModal :open="settingsOpen" :disabled="!isReady" :isRunning="isRunning" @close="closeSettings">
        <SettingsPanel :disabled="!isReady" :isRunning="isRunning" />
      </SettingsModal>
    </div>
  </div>
</template>
