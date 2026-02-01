<script setup lang="ts">
import { computed, markRaw, nextTick, onMounted, onUnmounted, ref, watch } from 'vue'
import ChatLayout from '@/ui-kit/chat/ChatLayout.vue'
import ChatStatusBar from '@/ui-kit/chat/ChatStatusBar.vue'
import ChatTranscript from '@/ui-kit/chat/ChatTranscript.vue'
import ChatMessageBubble from '@/ui-kit/chat/ChatMessageBubble.vue'
import ChatAppReasoningPanel from './components/ChatAppReasoningPanel.vue'
import type { DomainEvent, MessageState, MessageVM, ReasoningEffort, RequestedReasoningMode, ReasoningPrefs, RootState } from '@/next/state/types'
import {
  createConvo,
  deleteConvo,
  deleteConvos,
  listConvos,
  renameConvo,
  saveConvo,
  setConvoProject,
  setConvoProjectMany,
  type ConvoSummary,
} from '@/next/convo/convoClient'
import {
  clearBranchFilter,
  createBranchFromMessage,
  beginTurn,
  forkQuestion,
  regenerateFromQuestion,
  retryReplaceAnswer,
  retryReplaceQuestion,
  getBranchCandidates,
  getQuestionCandidates,
  deleteBranch,
  ensureDefaultBranch,
  listBranches,
  switchCandidate,
  switchQuestionCandidate,
  setBranchFilter,
  type BranchSummary,
  type BranchCandidate,
  type QuestionCandidate,
  type EffectiveFilterResult,
} from '@/next/branch/branchClient'
import { appendMessageDelta, appendReasoningDetailSegments, finalizeReasoningDetails, getReasoningSegmentsStats, setMessageReasoningRequestConfig, setMessageStatus } from '@/next/message/messageClient'
import { findProjectById, listProjects, saveProject, getInbox, createProject, deleteProject, countConversationsBatch, type ProjectSummary } from '@/next/project/projectClient'
import { getReasoningPrefs, setReasoningPrefs } from '@/next/settings/reasoningPrefsClient'
import { listModelCatalog } from '@/next/modelCatalog/modelCatalogClient'
import { selectModelCatalogAll, selectModelCatalogVisible } from '@/next/modelCatalog/modelCatalogSelectors'
import type { ModelCatalogItem } from '@/next/modelCatalog/modelCatalogTypes'
import { listReasoningModelIndex } from '@/next/modelIndex/reasoningModelIndexClient'
import { selectReasoningModelIndexAll, selectReasoningModelIndexVisible } from '@/next/modelIndex/reasoningModelIndexSelectors'
import type { ReasoningModelIndexItem } from '@/next/modelIndex/reasoningModelIndexTypes'
import { getNetExpSettings } from '@/next/netExp/netExpClient'
import { startNetExpRunReport } from '@/next/netExp/netExpRunReport'
import ConversationList, { type ConversationListItem, type ProjectListItem } from './components/ConversationList.vue'
import ChatAppComposer from './components/ChatAppComposer.vue'
import SettingsPanel from './components/SettingsPanel.vue'
import SettingsModal from './components/SettingsModal.vue'
import SearchModal, { type SearchConvoOption, type SearchProjectOption } from './components/SearchModal.vue'
import { applyEventsBatch, createInitialState, startGeneration, toggleReasoningPanelState } from '@/next/state/reducer'
import { selectMessage, selectRun } from '@/next/state/selectors'
import { streamOpenRouterChatAsEvents } from '@/next/live/openRouterLiveStream'
import { ReasoningDetailStreamMerger } from '@/next/state/reasoningDetailStreamMerger'
import type { SearchHit } from '@/next/search/searchTypes'
import { buildContextForBranchInternalMessages, getRenderableTurnsForBranch } from '@/next/context/contextClient'
import type { InternalMessage } from '@/next/context/buildMessages'
import { toInternalMessagesFromBranchPath } from '@/next/context/loadBranchContext'
import type { NormalizedErrorEnvelope } from '@/next/errors/normalizeOpenRouterError'
import { destroyDbEventBus, subscribeDbEvent, flushBuffer, type DbEvent } from '@/next/db/dbEventBus'
import { createEventScheduler } from '@/next/state/eventScheduler'
import {
  beginCommitMeasure,
  endCommitMeasure,
  recordCommit,
  recordDelta,
  recordUpdatedMessages,
  startPerfReporter,
} from '@/next/state/perfMetrics'
import { getDiagnosticsFlags } from '@/shared/diagnostics/flags'
import { createDiagnosticsLogger, installDiagnosticsBridge } from '@/shared/diagnostics/bridge'

const isReady = ref(false)
const loadError = ref<string | null>(null)
const convos = ref<ConvoSummary[]>([])
const projects = ref<ProjectSummary[]>([])
const projectCounts = ref<Map<string | null, number>>(new Map())
const activeProjectId = ref<string | null>(null)
const inboxId = ref<string | null>(null)
const activeConvoId = ref<string | null>(null)
const activeBranchId = ref<string | null>(null)
const branches = ref<BranchSummary[]>([])
const draft = ref('')
const model = ref('openrouter/auto')
const requestedReasoningEffort = ref<'auto' | ReasoningEffort>('auto')
const requestedReasoningExclude = ref(false)
const settingsOpen = ref(false)
const modelCatalogItems = ref<ModelCatalogItem[]>([])
const reasoningModelIndexItems = ref<ReasoningModelIndexItem[]>([])
const showHiddenModelsInPickers = ref(false)
const modelCatalogNotice = ref<string | null>(null)
const globalReasoningPrefs = ref<ReasoningPrefs | null>(null)
const skipReasoningPrefSave = ref(false)
const reasoningPrefSaveTimer = ref<ReturnType<typeof setTimeout> | null>(null)
const isDev = import.meta.env.DEV
const searchModalOpen = ref(false)

const state = ref<RootState>(createInitialState())
const messageSeqById = ref<Map<string, number>>(new Map())
const messageMetaById = ref<
  Map<string, { parentId: string | null; questionId: string | null; answerRootId: string | null; role: string; status: string }>
>(new Map())
const turnFiltersByQuestionId = ref<Map<string, Readonly<EffectiveFilterResult & { chosenAnswerRootId: string }>>>(new Map())
const questionTurnOrder = ref<string[]>([])
const candidatesCache = ref<Map<string, BranchCandidate[]>>(new Map())
const candidatesEpochGlobal = ref(0)
const candidatesEpochByQuestionId = ref<Map<string, number>>(new Map())
const candidatesLoading = ref<Map<string, string>>(new Map())
const questionCandidatesCache = ref<Map<string, QuestionCandidate[]>>(new Map())
const questionCandidatesEpochGlobal = ref(0)
const questionCandidatesEpochBySlot = ref<Map<string, number>>(new Map())
const questionCandidatesLoading = ref<Map<string, string>>(new Map())

const questionEditDialog = ref<{ questionId: string; draft: string } | null>(null)

const diagnosticsFlags = getDiagnosticsFlags()
const diagnosticsLogger = createDiagnosticsLogger(diagnosticsFlags)
const diagnosticsBridge = installDiagnosticsBridge(diagnosticsFlags)

// Anti-reordering guard for transcript refresh: only the latest request's result lands.
const transcriptRefreshToken = ref(0)

const runId = computed(() => activeBranchId.value)

const activeBranch = computed(() => {
  const id = activeBranchId.value
  if (!id) return null
  return branches.value.find((b) => b.id === id) ?? null
})

// Branch tip (definition): reachable tail / insertion point. Not a UI cursor.
const branchTipId = computed(() => activeBranch.value?.headMessageId ?? null)

// UI-only cursor (selection / highlight) by branch. Does NOT affect branching semantics or persistence.
const cursorByBranchId = ref<Map<string, string>>(new Map())

function setCursorForBranch(branchId: string, messageId: string | null) {
  const bid = String(branchId ?? '').trim()
  const mid = messageId ? String(messageId).trim() : ''
  if (!bid) return
  const next = new Map(cursorByBranchId.value)
  if (mid) next.set(bid, mid)
  else next.delete(bid)
  cursorByBranchId.value = next
}

function isMessageInTranscript(messageId: string): boolean {
  const id = String(messageId ?? '').trim()
  if (!id) return false
  return transcriptMessageIds.value.includes(id)
}

function ensureCursorForActiveBranch() {
  const bid = activeBranchId.value
  if (!bid) return

  const current = cursorByBranchId.value.get(bid) ?? null
  if (current && isMessageInTranscript(current)) return

  const ids = transcriptMessageIds.value
  const fallback = (branchTipId.value && isMessageInTranscript(branchTipId.value) ? branchTipId.value : null) ??
    ids[ids.length - 1] ??
    null
  setCursorForBranch(bid, fallback)
}

function onSelectCursor(messageId: string, ev?: MouseEvent) {
  const bid = activeBranchId.value
  if (!bid) return
  const mid = String(messageId ?? '').trim()
  if (!mid) return

  const target = ev?.target as HTMLElement | null
  if (target && target.closest('button,a,input,textarea,select')) return

  setCursorForBranch(bid, mid)
}

const runVM = computed(() => {
  const id = runId.value
  if (!id) return null
  return selectRun(state.value, id)
})

const transcriptMessageIds = computed<string[]>(() => {
  const id = runId.value
  if (!id) return []
  return state.value.views?.transcriptsByRunId?.[id] ?? []
})

const transcriptMessagesById = computed<Record<string, MessageVM>>(() => {
  const ids = transcriptMessageIds.value
  const map: Record<string, MessageVM> = {}
  for (const id of ids) {
    const vm = selectMessage(state.value, id)
    if (vm) map[id] = vm
  }
  return map
})

const lastAssistantMessage = computed<MessageState | null>(() => {
  const ids = transcriptMessageIds.value
  const messagesById = state.value.entities?.messagesById ?? state.value.messages
  for (let i = ids.length - 1; i >= 0; i -= 1) {
    const msg = messagesById[ids[i]]
    if (msg?.role === 'assistant') return msg
  }
  return null
})

const lastAssistantMessageId = computed(() => lastAssistantMessage.value?.messageId ?? null)

const showReasoningPanel = computed(() => {
  const m = lastAssistantMessage.value
  if (!m) return false
  return m.reasoningPanelState !== 'collapsed'
})

const canToggleReasoningPanel = computed(() => !!lastAssistantMessageId.value)

watch([activeBranchId, transcriptMessageIds], () => ensureCursorForActiveBranch(), { immediate: true })

watch(
  activeBranchId,
  (next, prev) => {
    if (!enableEventScheduler) return
    if (prev && prev !== next) {
      eventScheduler.flushNow(prev, 'switch')
      eventScheduler.dispose(prev)
    }
  },
  { flush: 'sync' }
)

watch(
  activeConvoId,
  (next, prev) => {
    if (!enableEventScheduler) return
    if (prev && prev !== next) {
      eventScheduler.flushAll('switch')
    }
  },
  { flush: 'sync' }
)

watch(requestedReasoningEffort, (value) => {
  if (value === 'auto' || value === 'none') {
    if (requestedReasoningExclude.value) requestedReasoningExclude.value = false
  }
})

watch([requestedReasoningEffort, requestedReasoningExclude], () => {
  if (skipReasoningPrefSave.value) {
    skipReasoningPrefSave.value = false
    return
  }
  scheduleReasoningPrefsSave()
})

const activeCursorMessageId = computed(() => {
  // During streaming, prefer highlighting the active assistant message (UI only).
  const streamingId = activeAssistantMessageId.value
  if (streamingId && isMessageInTranscript(streamingId)) return streamingId

  const bid = activeBranchId.value
  if (!bid) return undefined
  const cursor = cursorByBranchId.value.get(bid)
  if (cursor && isMessageInTranscript(cursor)) return cursor

  if (branchTipId.value && isMessageInTranscript(branchTipId.value)) return branchTipId.value
  const ids = transcriptMessageIds.value
  return ids[ids.length - 1]
})

const lastAssistantReasoningView = computed(() => {
  const id = lastAssistantMessageId.value
  if (!id) return null
  return selectMessage(state.value, id)?.reasoningView ?? null
})

const lastAssistantReasoningVersion = computed(() => lastAssistantMessage.value?.reasoningVersion ?? 0)
const lastAssistantPanelState = computed(() => lastAssistantMessage.value?.reasoningPanelState ?? 'collapsed')
const lastAssistantIsStreaming = computed(() => {
  const s = lastAssistantMessage.value?.streaming
  return Boolean(s && s.isTarget && !s.isComplete)
})
const lastAssistantReasoningPieces = computed(() => lastAssistantMessage.value?.reasoningPieces ?? null)

const isRunning = computed(() => runVM.value?.status === 'requesting' || runVM.value?.status === 'streaming' || runVM.value?.status === 'tool_waiting')

const modelCatalogForPicker = computed<readonly ModelCatalogItem[]>(() => {
  const catalog = showHiddenModelsInPickers.value
    ? selectModelCatalogAll(modelCatalogItems.value)
    : selectModelCatalogVisible(modelCatalogItems.value)

  if (catalog.length > 0) return catalog

  const fallback = showHiddenModelsInPickers.value
    ? selectReasoningModelIndexAll(reasoningModelIndexItems.value)
    : selectReasoningModelIndexVisible(reasoningModelIndexItems.value)

  return fallback.map((item): ModelCatalogItem => ({
    modelId: item.modelId,
    name: item.name,
    vendor: 'openrouter',
    status: item.status === 'hidden' ? 'hidden' : 'visible',
    supportedParameters: ['reasoning'],
    lastSeenSnapshotId: item.lastSyncedSnapshot,
  }))
})

const reasoningModelIndexForPicker = computed(() =>
  showHiddenModelsInPickers.value
    ? selectReasoningModelIndexAll(reasoningModelIndexItems.value)
    : selectReasoningModelIndexVisible(reasoningModelIndexItems.value)
)

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
  pendingReasoningDetails: { value: unknown[] }
  reasoningFlushTimer: { id: ReturnType<typeof setTimeout> | null }
  /** Merger 用于处理快照语义的 reasoning_details，提取真正的后缀增量 */
  reasoningMerger: ReasoningDetailStreamMerger
  /** 诊断追踪器：记录每个 chunkNo 的处理结果 */
  diagnosticTracker: {
    events: Array<{ chunkNo: number; key: string; deltaLen: number; action: 'queued' | 'skipped'; reason?: string; offsetBefore?: number }>
    totalQueued: number
    totalSkipped: number
    totalDeltaLen: number
    // chunkNo 到文本区间的映射 [start, end)
    chunkRanges: Array<{ chunkNo: number; start: number; end: number; key?: string; offsetBefore?: number }>
    textCursor: number
    // DB 统计
    dbInserted: number
    dbSkipped: number
    dbIgnored: number
    dbSumDeltaLenInserted: number
  }
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

function shouldLogReasoningDebug(): boolean {
  try {
    const flag = String(globalThis?.localStorage?.getItem('sv_debug_reasoning') ?? '').trim()
    if (flag === '0') return false
    if (flag === '1') return true
  } catch {
    // no-op
  }
  return false
}

function isEventSchedulerEnabled(): boolean {
  try {
    const flag = String(globalThis?.localStorage?.getItem('sv_event_scheduler') ?? '').trim()
    if (flag === '0') return false
    if (flag === '1') return true
  } catch {
    // no-op
  }
  return true
}


function hasDbBridge(): boolean {
  const bridge = (globalThis as any).dbBridge as { invoke?: unknown } | undefined
  return !!(bridge && typeof bridge.invoke === 'function')
}

const enableEventScheduler = isEventSchedulerEnabled()
const eventScheduler = createEventScheduler({
  commit: (runId, events) => {
    if (events.length === 0) return
    const updatedIds = new Set<string>()
    for (const ev of events) {
      if ('messageId' in ev && typeof ev.messageId === 'string') {
        updatedIds.add(ev.messageId)
      }
    }
    const measureId = beginCommitMeasure()
    const next = applyEventsBatch(state.value, runId, events)
    state.value = next
    const duration = endCommitMeasure(measureId)
    recordCommit(duration)
    recordUpdatedMessages(updatedIds.size)
  },
  onEnqueue: (event) => {
    if (event.type === 'MessageDeltaReasoningDetail') recordDelta(1)
    if (event.type === 'MessageDeltaReasoningDetailBatch') {
      const count = Array.isArray(event.details) ? event.details.length : 0
      if (count > 0) recordDelta(count)
    }
  },
})

let stopPerfReporter: (() => void) | null = null
let refAuditTimer: ReturnType<typeof setInterval> | null = null
const refAuditCache = new Map<string, MessageVM>()
const refAuditSeenAt = new Map<string, number>()
const refAuditRecentWindowMs = 1500
let lastTranscriptIdsRef: string[] | null = null
let idsRefStableCount = 0
let idsRefChangedCount = 0

function handleVisibilityChange() {
  if (!enableEventScheduler) return
  if (typeof document !== 'undefined' && document.hidden) {
    eventScheduler.flushAll('visibility')
  }
}

function commitImmediate(runId: string, event: DomainEvent) {
  if (event.type === 'MessageDeltaReasoningDetail') recordDelta(1)
  if (event.type === 'MessageDeltaReasoningDetailBatch') {
    const count = Array.isArray(event.details) ? event.details.length : 0
    if (count > 0) recordDelta(count)
  }
  if ('messageId' in event && typeof event.messageId === 'string') {
    recordUpdatedMessages(1)
  }
  const measureId = beginCommitMeasure()
  const next = applyEventsBatch(state.value, runId, [event])
  state.value = next
  const duration = endCommitMeasure(measureId)
  recordCommit(duration)
}

function asRecord(value: unknown): Record<string, unknown> | null {
  if (!value || typeof value !== 'object') return null
  return value as Record<string, unknown>
}

function extractReasoningDetailsFromMeta(meta: unknown): unknown[] {
  const obj = asRecord(meta)
  const raw = obj?.reasoningDetailsRaw
  if (Array.isArray(raw)) return raw as unknown[]
  return []
}

function extractReasoningTextFromDetails(details: ReadonlyArray<unknown> | null | undefined): {
  reasoningText?: string
  summaryText?: string
  encryptedData?: string
  isEncrypted: boolean
} {
  const items = Array.isArray(details) ? details : []
  let summaryText: string | undefined
  let encryptedData: string | undefined
  const reasoningTextParts: string[] = []
  let isEncrypted = false

  for (const detail of items) {
    if (!detail || typeof detail !== 'object') continue
    const type = (detail as any).type
    if (type === 'reasoning.text') {
      const text = (detail as any).text
      if (typeof text === 'string' && text.length > 0) reasoningTextParts.push(text)
      continue
    }
    if (type === 'reasoning.summary') {
      const summary = (detail as any).summary ?? (detail as any).text
      if (typeof summary === 'string' && summary.length > 0) summaryText = summary
      continue
    }
    if (type === 'reasoning.encrypted') {
      isEncrypted = true
      const data = (detail as any).data
      if (typeof data === 'string' && data.length > 0) {
        encryptedData = encryptedData ? encryptedData + data : data
      }
      continue
    }
  }

  const reasoningText = reasoningTextParts.length > 0 ? reasoningTextParts.join('') : undefined
  return { reasoningText, summaryText, encryptedData, isEncrypted }
}

function extractRequestReasoningConfigFromMeta(meta: unknown): { mode: RequestedReasoningMode; effort?: ReasoningEffort; exclude?: boolean } | null {
  const obj = asRecord(meta)
  const config = asRecord(obj?.requestReasoningConfig)
  const resolved = asRecord(config?.resolved) ?? asRecord(config?.normalized)
  if (!resolved) return null

  const mode = resolved?.mode === 'effort' ? 'effort' : 'auto'
  const effortRaw = resolved?.effort
  const effort = typeof effortRaw === 'string' && effortRaw !== 'auto' ? (effortRaw as ReasoningEffort) : undefined
  const exclude = mode === 'auto' || effort === 'none' ? false : resolved?.exclude === true
  return { mode, effort, exclude }
}

type IpcRendererLike = Readonly<{
  on: (channel: string, listener: (...args: any[]) => void) => any
}>

function getIpcRenderer(): IpcRendererLike | null {
  const ipc = (globalThis as any).ipcRenderer as IpcRendererLike | undefined
  return ipc && typeof ipc.on === 'function' ? ipc : null
}

async function refreshModelLists() {
  if (!hasDbBridge()) {
    modelCatalogItems.value = []
    reasoningModelIndexItems.value = []
    modelCatalogNotice.value = '模型目录不可用（dbBridge 未就绪）'
    return
  }

  try {
    const [catalog, reasoningIndex] = await Promise.all([listModelCatalog('openrouter'), listReasoningModelIndex()])
    modelCatalogItems.value = catalog
    reasoningModelIndexItems.value = reasoningIndex

    if (catalog.length === 0 && reasoningIndex.length === 0) {
      modelCatalogNotice.value = '模型目录尚未同步（稍后自动刷新）'
    } else if (catalog.length === 0 && reasoningIndex.length > 0) {
      modelCatalogNotice.value = '模型目录为空（已回退到推理模型索引）'
    } else if (reasoningIndex.length === 0) {
      modelCatalogNotice.value = '推理模型索引尚未同步（仅显示目录）'
    } else {
      modelCatalogNotice.value = null
    }
  } catch (err) {
    modelCatalogItems.value = []
    reasoningModelIndexItems.value = []
    modelCatalogNotice.value = '模型目录不可用（同步失败）'
    if (shouldLogDebug()) {
      console.warn('[ui-app] refreshModelLists failed (non-fatal):', err)
    }
  }
}

const onModelsSynced = async () => {
  await refreshModelLists()
}

function hydrateStateFromPersistedMessages(
  convoId: string,
  rows: ReadonlyArray<Readonly<{ id: string; role: string; seq: number; body: string; meta?: unknown }>>
) {
  const s = createInitialState()
  s.runs[convoId] = { runId: convoId, status: 'idle', comments: [] }
  s.runMessageIds[convoId] = []

  for (const r of rows) {
    const messageId = r.id
    const roleRaw = String(r.role ?? '').trim()
    const role = roleRaw === 'user' ? 'user' : roleRaw === 'assistant' ? 'assistant' : roleRaw === 'tool' ? 'tool' : 'tool'
    const body = typeof r.body === 'string' ? r.body : String(r.body ?? '')
    const contentText = roleRaw === role ? body : `[role:${roleRaw}]\n${body}`

    const meta = r.meta ?? null
    const reasoningDetailsRaw = extractReasoningDetailsFromMeta(meta)
    const hasEncryptedReasoning = reasoningDetailsRaw.some((detail) => detail && typeof detail === 'object' && (detail as any).type === 'reasoning.encrypted')
    const requestConfig = extractRequestReasoningConfigFromMeta(meta)

    s.messages[messageId] = {
      messageId,
      role,
      contentText,
      contentBlocks: markRaw(contentText.length > 0 ? [{ type: 'text', text: contentText }] : []),
      toolCalls: [],
      reasoningDetailsRaw: markRaw(reasoningDetailsRaw),
      reasoningStreamingText: '',
      reasoningSummaryText: undefined,
      reasoningPieces: markRaw([]),
      reasoningLastPieceLen: 0,
      reasoningPanelState: 'collapsed',
      hasEncryptedReasoning,
      streaming: { isTarget: false, isComplete: true },
      textVersion: 0,
      reasoningVersion: 0,
      requestedReasoningMode: requestConfig?.mode === 'effort' ? 'effort' : 'auto',
      requestedReasoningEffort: requestConfig?.mode === 'effort' ? requestConfig.effort : undefined,
      requestedReasoningExclude: requestConfig?.mode === 'effort' ? requestConfig.exclude === true : false,
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

function chosenQuestionIdForAnswerRootMessage(answerRootMessageId: string): string | null {
  const qid = questionIdForMessage(answerRootMessageId, 'assistant')
  if (!qid) {
    if (import.meta.env?.DEV) {
      console.log('[ui-app] chosenQuestionIdForAnswerRootMessage: missing questionId (meta not ready?)', { answerRootMessageId })
    }
    return null
  }
  const chosen = turnFiltersByQuestionId.value.get(qid)?.chosenAnswerRootId
  if (!chosen || chosen !== answerRootMessageId) return null
  return qid
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

function getQuestionSlotKey(baseMessageId: string | null): string {
  const base = baseMessageId === null ? null : String(baseMessageId ?? '').trim() || null
  return base ?? '__root__'
}

function getQuestionCandidateLoadToken(slotKey: string): string {
  const key = String(slotKey ?? '').trim()
  const epoch = questionCandidatesEpochBySlot.value.get(key) ?? 0
  return `${questionCandidatesEpochGlobal.value}:${epoch}`
}

function invalidateQuestionCandidatesForSlot(baseMessageId: string | null) {
  const slotKey = getQuestionSlotKey(baseMessageId)

  const nextEpoch = (questionCandidatesEpochBySlot.value.get(slotKey) ?? 0) + 1
  questionCandidatesEpochBySlot.value.set(slotKey, nextEpoch)
  questionCandidatesEpochBySlot.value = new Map(questionCandidatesEpochBySlot.value)

  if (questionCandidatesLoading.value.has(slotKey)) {
    questionCandidatesLoading.value.delete(slotKey)
    questionCandidatesLoading.value = new Map(questionCandidatesLoading.value)
  }

  if (questionCandidatesCache.value.has(slotKey)) {
    questionCandidatesCache.value.delete(slotKey)
    questionCandidatesCache.value = new Map(questionCandidatesCache.value)
  }
}

async function ensureQuestionCandidatesLoadedForQuestion(questionId: string) {
  const qid = String(questionId ?? '').trim()
  const meta = qid ? messageMetaById.value.get(qid) : null
  if (!qid || !meta || String(meta.role ?? '').trim() !== 'user') return
  await ensureQuestionCandidatesLoadedForSlot(meta.parentId ?? null)
}

async function ensureQuestionCandidatesLoadedForSlot(baseMessageId: string | null) {
  const bid = activeBranchId.value
  if (!bid) return

  const slotKey = getQuestionSlotKey(baseMessageId)
  if (questionCandidatesCache.value.has(slotKey)) return

  const token = getQuestionCandidateLoadToken(slotKey)
  if (questionCandidatesLoading.value.get(slotKey) === token) return

  questionCandidatesLoading.value.set(slotKey, token)
  questionCandidatesLoading.value = new Map(questionCandidatesLoading.value)
  try {
    const list = await getQuestionCandidates(bid, baseMessageId, { limit: 200 })

    if (activeBranchId.value !== bid) return
    if (getQuestionCandidateLoadToken(slotKey) !== token) return

    questionCandidatesCache.value.set(slotKey, list)
    questionCandidatesCache.value = new Map(questionCandidatesCache.value)
  } finally {
    if (questionCandidatesLoading.value.get(slotKey) === token) {
      questionCandidatesLoading.value.delete(slotKey)
      questionCandidatesLoading.value = new Map(questionCandidatesLoading.value)
    }
  }
}

function getOrderedQuestionCandidatesOldToNew(baseMessageId: string | null): QuestionCandidate[] | null {
  const key = getQuestionSlotKey(baseMessageId)
  const cached = questionCandidatesCache.value.get(key)
  if (!cached) return null
  return [...cached].reverse()
}

function getQuestionPagerForQuestion(questionId: string): Readonly<{ index: number; total: number; canPrev: boolean; canNext: boolean }> | null {
  const qid = String(questionId ?? '').trim()
  if (!qid) return null
  const meta = messageMetaById.value.get(qid)
  if (!meta || meta.role !== 'user') return null

  const ordered = getOrderedQuestionCandidatesOldToNew(meta.parentId ?? null)
  if (!ordered) return null
  const total = ordered.length
  if (total <= 0) return { index: 0, total: 0, canPrev: false, canNext: false }

  const idx = ordered.findIndex((c) => c.questionId === qid)
  if (idx < 0) return { index: 0, total, canPrev: false, canNext: false }
  return { index: idx, total, canPrev: idx > 0, canNext: idx < total - 1 }
}

function isQuestionSlotLoadingForQuestion(questionId: string): boolean {
  const qid = String(questionId ?? '').trim()
  if (!qid) return false
  const meta = messageMetaById.value.get(qid)
  if (!meta || meta.role !== 'user') return false
  const slotKey = getQuestionSlotKey(meta.parentId ?? null)
  return questionCandidatesLoading.value.has(slotKey)
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

function clearReasoningFlushTimer(stream: ActiveStream) {
  if (!stream.reasoningFlushTimer.id) return
  clearTimeout(stream.reasoningFlushTimer.id)
  stream.reasoningFlushTimer.id = null
}

async function flushReasoningDetailSegments(stream: ActiveStream, assistantMessageId: string) {
  const pending = stream.pendingReasoningDetails.value
  if (!pending || pending.length === 0) return
  const batch = pending.splice(0, pending.length)
  try {
    const result = await appendReasoningDetailSegments({ messageId: assistantMessageId, details: batch })
    // 累加 DB 统计到 diagnosticTracker
    stream.diagnosticTracker.dbInserted += result.inserted
    stream.diagnosticTracker.dbSkipped += result.skipped
    stream.diagnosticTracker.dbIgnored += result.ignored
    stream.diagnosticTracker.dbSumDeltaLenInserted += result.sumDeltaLenInserted
    if (shouldLogReasoningDebug() && (result.ignored > 0 || result.skipped > 0)) {
      console.log('[reasoning-flush] batch stats', {
        received: result.received,
        inserted: result.inserted,
        skipped: result.skipped,
        ignored: result.ignored,
        sumDeltaLenInserted: result.sumDeltaLenInserted,
      })
    }
  } catch (err) {
    if (shouldLogReasoningDebug()) console.warn('[ui-app] appendReasoningDetailSegments failed (non-fatal):', err)
  }
}

function scheduleReasoningDetailFlush(stream: ActiveStream, assistantMessageId: string, delayMs = 250) {
  if (stream.reasoningFlushTimer.id) return
  stream.reasoningFlushTimer.id = setTimeout(async () => {
    stream.reasoningFlushTimer.id = null
    try {
      await flushReasoningDetailSegments(stream, assistantMessageId)
    } finally {
      if (stream.pendingReasoningDetails.value.length > 0) {
        scheduleReasoningDetailFlush(stream, assistantMessageId, delayMs)
      }
    }
  }, delayMs)
}

function buildReasoningRequestConfigSnapshot(input: Readonly<{
  requestedReasoningMode: RequestedReasoningMode
  requestedReasoningEffortValue?: ReasoningEffort
  requestedReasoningExclude: boolean
}>): Readonly<{ raw: unknown; normalized: unknown; resolved: unknown }> {
  const { requestedReasoningMode, requestedReasoningEffortValue, requestedReasoningExclude } = input
  const effort = requestedReasoningMode === 'auto' ? 'auto' : (requestedReasoningEffortValue ?? 'none')
  const exclude = requestedReasoningMode === 'auto' || effort === 'none' ? false : requestedReasoningExclude
  const rawReasoning =
    requestedReasoningMode === 'auto'
      ? null
      : {
          effort: requestedReasoningEffortValue ?? 'none',
          ...(exclude ? { exclude: true } : {}),
        }

  const normalized = {
    mode: requestedReasoningMode,
    effort,
    exclude,
  }

  const resolved =
    requestedReasoningMode === 'auto'
      ? { mode: 'auto', effort: 'auto', exclude: false }
      : { mode: 'effort', effort: requestedReasoningEffortValue ?? 'none', exclude }

  return {
    raw: { reasoning: rawReasoning },
    normalized,
    resolved,
  }
}

async function refreshConvos() {
  loadError.value = null
  // 根据当前选中的项目进行 DB 端筛选
  // activeProjectId === null 表示"全部对话"，不传 projectId 参数
  const filterProjectId = activeProjectId.value
  convos.value = await listConvos({
    order: 'updatedAt',
    limit: 200,
    ...(filterProjectId !== null ? { projectId: filterProjectId } : {}),
  })
  const active = activeConvoId.value
  if (active && !convos.value.some((c) => c.id === active)) {
    activeConvoId.value = convos.value[0]?.id ?? null
  }
  if (!activeConvoId.value && convos.value.length > 0) activeConvoId.value = convos.value[0].id
}

async function refreshProjects() {
  loadError.value = null
  // 获取 Inbox
  const inbox = await getInbox()
  if (inbox) {
    inboxId.value = inbox.id
  }
  // 获取所有项目
  projects.value = await listProjects({ order: 'name', limit: 500 })
  // 更新项目计数（避免 N+1：批量获取）
  await refreshProjectCounts()
}

async function refreshProjectCounts() {
  if (projects.value.length === 0) {
    projectCounts.value = new Map()
    return
  }
  
  const projectIds = projects.value.map(p => p.id)
  projectCounts.value = await countConversationsBatch(projectIds)
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
  candidatesEpochByQuestionId.value = new Map()
  questionCandidatesEpochGlobal.value += 1
  questionCandidatesCache.value = new Map()
  questionCandidatesLoading.value = new Map()
  questionCandidatesEpochBySlot.value = new Map()
  if (shouldLogDebug()) {
    console.log('[ui-app] resetCandidatesCache', { answerEpochGlobal: candidatesEpochGlobal.value, questionEpochGlobal: questionCandidatesEpochGlobal.value })
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
  hydrateStateFromPersistedMessages(
    bid,
    rows.map((m) => ({ id: m.id, role: m.role, seq: m.seq, body: m.body, meta: m.meta }))
  )
  const seqMap = new Map<string, number>()
  for (const m of rows) seqMap.set(m.id, m.seq)
  messageSeqById.value = seqMap

  const metaMap = new Map<string, { parentId: string | null; questionId: string | null; answerRootId: string | null; role: string; status: string }>()
  for (const m of rows) {
    metaMap.set(m.id, {
      parentId: m.parentId ?? null,
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

  // Self-heal: question candidate cache may become stale after question replace (branch_question_hide).
  // If the cached question variants no longer contain the currently-visible question, drop the cache for that slot.
  let qInvalidated = false
  for (const qid of order) {
    const base = messageMetaById.value.get(qid)?.parentId ?? null
    const slotKey = getQuestionSlotKey(base)
    const cached = questionCandidatesCache.value.get(slotKey)
    if (!cached) continue
    if (cached.some((c) => c.questionId === qid)) continue
    questionCandidatesCache.value.delete(slotKey)
    qInvalidated = true
  }
  if (qInvalidated) questionCandidatesCache.value = new Map(questionCandidatesCache.value)

  for (const qid of next.keys()) {
    void ensureCandidatesLoaded(qid)
  }

  for (const qid of order) {
    void ensureQuestionCandidatesLoadedForQuestion(qid)
  }
}

// ======== UNIFIED REFRESH ENTRY (Anti-reordering Guard) ========
// All transcript refreshes MUST use this function to ensure token-based ordering.
// Note: assertInvariants() is NOT called here to avoid false positives during transient states.
// Callers should invoke assertInvariants() at stable boundaries (after all state updates complete).
async function refreshTranscriptLatestOnly() {
  const bid = activeBranchId.value
  if (!bid) return
  await loadTranscriptForBranch(bid)
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
  
  // ③ Assert invariants at stable boundary (after both refresh and clear complete)
  assertInvariants()
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
    applyReasoningPrefs(DEFAULT_REASONING_PREFS)
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
  await loadReasoningPrefsForActiveConvo()
}

async function onSelectConvo(convoId: string) {
  if (isRunning.value) return
  activeConvoId.value = convoId
  await loadTranscriptForActiveConvo()
  assertInvariants() // Stable boundary: conversation switched and refreshed
}

async function onSelectBranch(branchId: string) {
  if (isRunning.value) return
  const bid = String(branchId ?? '').trim()
  if (!bid || bid === activeBranchId.value) return
  activeBranchId.value = bid
  resetCandidatesCache()
  await refreshTranscriptLatestOnly()
  assertInvariants() // Stable boundary: branch switched and refreshed
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
    await loadTranscriptForActiveConvo()
  } catch (err: any) {
    loadError.value = err?.message ? String(err.message) : String(err)
  }
}

async function onMoveConvoToProject(convoId: string, projectId: string | null) {
  if (isRunning.value) return
  try {
    await setConvoProject(convoId, projectId)
    await ensureProjectReasoningPrefsInitialized(projectId)
    await refreshConvos()
    await loadReasoningPrefsForActiveConvo()
  } catch (err: any) {
    loadError.value = err?.message ? String(err.message) : String(err)
  }
}

async function onBulkDeleteConvos(convoIds: string[]) {
  if (isRunning.value) return
  try {
    await deleteConvos(convoIds)
    await refreshConvos()
    await loadTranscriptForActiveConvo()
  } catch (err: any) {
    loadError.value = err?.message ? String(err.message) : String(err)
  }
}

async function onBulkMoveConvosToProject(convoIds: string[], projectId: string | null) {
  if (isRunning.value) return
  try {
    await setConvoProjectMany(convoIds, projectId)
    await ensureProjectReasoningPrefsInitialized(projectId)
    await refreshConvos()
    await loadReasoningPrefsForActiveConvo()
  } catch (err: any) {
    loadError.value = err?.message ? String(err.message) : String(err)
  }
}

// ========== Project Management ==========

function onSelectProject(projectId: string | null) {
  if (isRunning.value) return
  activeProjectId.value = projectId
  // 切换项目后刷新对话列表
  void refreshConvos()
}

async function onCreateProject(name: string) {
  if (isRunning.value) return
  try {
    const created = await createProject({ name })
    
    // 如果是已存在的项目，直接选中，不刷新列表（避免不必要的 DB 查询）
    if (created.alreadyExists) {
      // 对系统项目（Inbox）给出特殊提示
      if ((created as any).isSystemProject) {
        console.info('[ui-app] Inbox is a system project, selected existing instance')
      }
      onSelectProject(created.id)
      return
    }
    
    // 仅在真正创建新项目时刷新列表
    await refreshProjects()
    onSelectProject(created.id)
  } catch (err: any) {
    loadError.value = err?.message ? String(err.message) : String(err)
  }
}

async function onRenameProject(projectId: string, name: string) {
  if (isRunning.value) return
  try {
    await saveProject({ id: projectId, name })
    await refreshProjects()
  } catch (err: any) {
    loadError.value = err?.message ? String(err.message) : String(err)
  }
}

async function onDeleteProject(projectId: string) {
  if (isRunning.value) return
  try {
    const result = await deleteProject(projectId)
    if (!result.ok && result.error) {
      loadError.value = result.error.message
      return
    }
    // 如果删除的是当前选中的项目，切换到全部对话
    if (activeProjectId.value === projectId) {
      activeProjectId.value = null
    }
    await refreshProjects()
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
  await loadTranscriptForActiveConvo()
  assertInvariants() // Stable boundary: new conversation created and active
}

const convoListItems = computed<ConversationListItem[]>(() =>
  convos.value.map((c) => ({ id: c.id, title: c.title, updatedAt: c.updatedAt }))
)

const projectListItems = computed<ProjectListItem[]>(() =>
  projects.value.map((p) => ({
    id: p.id,
    name: p.name,
    isSystem: p.id === inboxId.value,
    convoCount: projectCounts.value.get(p.id) ?? undefined,
  }))
)

const searchProjectOptions = computed<SearchProjectOption[]>(() =>
  projects.value.map((p) => ({ id: p.id, name: p.name }))
)

const searchConvoOptions = computed<SearchConvoOption[]>(() =>
  convos.value.map((c) => ({ id: c.id, title: c.title, projectId: c.projectId ?? null }))
)

const activeTitle = computed(() => convos.value.find((c) => c.id === activeConvoId.value)?.title ?? '')

function openSearchModal() {
  searchModalOpen.value = true
}

function closeSearchModal() {
  searchModalOpen.value = false
}

async function focusMessageAfterSearch(messageId: string) {
  const mid = String(messageId ?? '').trim()
  if (!mid) return
  const bid = activeBranchId.value
  if (!bid) return

  setCursorForBranch(bid, mid)
  await nextTick()
  if (!isMessageInTranscript(mid)) return
  const el = document.querySelector(`[data-testid="msg-wrap-${mid}"]`) as HTMLElement | null
  if (el?.scrollIntoView) {
    el.scrollIntoView({ block: 'center', behavior: 'smooth' })
  }
}

async function onSelectSearchHit(hit: SearchHit) {
  if (hit.entityType === 'project') {
    onSelectProject(hit.entityId)
    return
  }

  if (hit.entityType === 'convo') {
    if (hit.projectId !== undefined) {
      onSelectProject(hit.projectId ?? null)
    }
    await onSelectConvo(hit.entityId)
    return
  }

  if (hit.entityType === 'message') {
    if (hit.projectId !== undefined) {
      onSelectProject(hit.projectId ?? null)
    }
    const convoId = hit.convoId
    if (!convoId) return
    await onSelectConvo(convoId)
    await focusMessageAfterSearch(hit.entityId)
  }
}

async function ensureActiveConvo(): Promise<string> {
  if (activeConvoId.value) return activeConvoId.value
  const created = await createConvo({ title: `New chat ${new Date().toLocaleString()}` })
  await refreshConvos()
  if (!created?.id) throw new Error('Failed to create conversation')
  activeConvoId.value = created.id
  await loadTranscriptForActiveConvo()
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
  if (enableEventScheduler && activeBranchId.value) {
    eventScheduler.flushNow(activeBranchId.value, 'flush')
  }
  s.abort.abort('abort')
}

function onToggleReasoningPanelState(messageId?: string) {
  const targetId = typeof messageId === 'string' && messageId.trim().length > 0 ? messageId : lastAssistantMessageId.value
  if (!targetId) return
  state.value = toggleReasoningPanelState(state.value, targetId)
}

function getRequestedReasoningConfig(): Readonly<{
  requestedReasoningMode: RequestedReasoningMode
  requestedReasoningEffortValue?: ReasoningEffort
  requestedReasoningExclude: boolean
}> {
  const requestedReasoningMode: RequestedReasoningMode = requestedReasoningEffort.value === 'auto' ? 'auto' : 'effort'
  const requestedReasoningEffortValue: ReasoningEffort | undefined =
    requestedReasoningMode === 'auto' ? undefined : (requestedReasoningEffort.value as ReasoningEffort)
  const requestedReasoningExcludeValue =
    requestedReasoningMode === 'auto' || requestedReasoningEffortValue === 'none' ? false : requestedReasoningExclude.value
  return {
    requestedReasoningMode,
    requestedReasoningEffortValue,
    requestedReasoningExclude: requestedReasoningExcludeValue,
  }
}

const DEFAULT_REASONING_PREFS: ReasoningPrefs = { mode: 'auto', effort: 'auto', exclude: false }
const REASONING_EFFORTS: ReasoningEffort[] = ['none', 'minimal', 'low', 'medium', 'high', 'xhigh']

function isReasoningEffort(value: unknown): value is ReasoningEffort {
  return typeof value === 'string' && (REASONING_EFFORTS as string[]).includes(value)
}

function normalizeReasoningPrefs(raw: unknown): ReasoningPrefs | null {
  if (!raw || typeof raw !== 'object') return null
  const mode = (raw as any).mode === 'effort' || (raw as any).mode === 'auto' ? (raw as any).mode : 'auto'
  const effortRaw = (raw as any).effort
  const effort = effortRaw === 'auto' || isReasoningEffort(effortRaw) ? effortRaw : undefined
  const excludeRaw = (raw as any).exclude === true

  if (mode === 'auto') {
    return { mode: 'auto', effort: 'auto', exclude: false }
  }

  const resolvedEffort = effort && effort !== 'auto' ? effort : 'none'
  const exclude = resolvedEffort === 'none' ? false : excludeRaw
  return { mode: 'effort', effort: resolvedEffort, exclude }
}

function extractReasoningPrefs(meta: unknown): ReasoningPrefs | null {
  if (!meta || typeof meta !== 'object') return null
  return normalizeReasoningPrefs((meta as any).reasoningPrefs)
}

function buildReasoningPrefsFromUi(): ReasoningPrefs {
  const mode: RequestedReasoningMode = requestedReasoningEffort.value === 'auto' ? 'auto' : 'effort'
  const effort = requestedReasoningEffort.value
  const exclude = mode === 'auto' || effort === 'none' ? false : requestedReasoningExclude.value
  return { mode, effort, exclude }
}

function applyReasoningPrefs(prefs: ReasoningPrefs) {
  skipReasoningPrefSave.value = true
  if (prefs.mode === 'auto') {
    requestedReasoningEffort.value = 'auto'
    requestedReasoningExclude.value = false
    setTimeout(() => {
      skipReasoningPrefSave.value = false
    }, 0)
    return
  }

  const nextEffort = prefs.effort && prefs.effort !== 'auto' ? prefs.effort : 'none'
  requestedReasoningEffort.value = nextEffort
  requestedReasoningExclude.value = nextEffort === 'none' ? false : prefs.exclude === true
  setTimeout(() => {
    skipReasoningPrefSave.value = false
  }, 0)
}

function mergeReasoningPrefsIntoMeta(meta: unknown, prefs: ReasoningPrefs): Record<string, unknown> {
  const base = meta && typeof meta === 'object' ? { ...(meta as Record<string, unknown>) } : {}
  return { ...base, reasoningPrefs: prefs }
}

function getActiveConvoRecord(): ConvoSummary | null {
  const convoId = activeConvoId.value
  if (!convoId) return null
  return convos.value.find((c) => c.id === convoId) ?? null
}

async function refreshGlobalReasoningPrefs(): Promise<ReasoningPrefs | null> {
  try {
    const raw = await getReasoningPrefs()
    const normalized = normalizeReasoningPrefs(raw)
    globalReasoningPrefs.value = normalized
    return normalized
  } catch (err) {
    if (shouldLogDebug()) console.warn('[ui-app] refreshGlobalReasoningPrefs failed (non-fatal):', err)
    globalReasoningPrefs.value = null
    return null
  }
}

async function loadProjectReasoningPrefs(projectId: string): Promise<ReasoningPrefs | null> {
  const cached = projects.value.find((p) => p.id === projectId)
  const cachedPrefs = extractReasoningPrefs(cached?.meta ?? null)
  if (cachedPrefs) return cachedPrefs

  const found = await findProjectById(projectId)
  if (found) {
    projects.value = projects.value.some((p) => p.id === found.id)
      ? projects.value.map((p) => (p.id === found.id ? found : p))
      : [...projects.value, found]
    return extractReasoningPrefs(found.meta ?? null)
  }

  return null
}

async function loadReasoningPrefsForActiveConvo() {
  const convo = getActiveConvoRecord()
  if (!convo) {
    applyReasoningPrefs(DEFAULT_REASONING_PREFS)
    return
  }

  const convoPrefs = extractReasoningPrefs(convo.meta ?? null)
  let projectPrefs: ReasoningPrefs | null = null
  if (!convoPrefs && convo.projectId) {
    projectPrefs = await loadProjectReasoningPrefs(convo.projectId)
  }

  const globalPrefs = globalReasoningPrefs.value ?? (await refreshGlobalReasoningPrefs())
  const effective = convoPrefs ?? projectPrefs ?? globalPrefs ?? DEFAULT_REASONING_PREFS
  applyReasoningPrefs(effective)
}

function scheduleReasoningPrefsSave() {
  if (reasoningPrefSaveTimer.value) clearTimeout(reasoningPrefSaveTimer.value)
  reasoningPrefSaveTimer.value = setTimeout(() => {
    reasoningPrefSaveTimer.value = null
    void persistReasoningPrefs()
  }, 500)
}

function handleGlobalReasoningPrefsUpdated(event: Event) {
  const detail = (event as CustomEvent).detail
  const normalized = normalizeReasoningPrefs(detail) ?? DEFAULT_REASONING_PREFS
  globalReasoningPrefs.value = normalized

  const convo = getActiveConvoRecord()
  if (!convo) return
  const convoPrefs = extractReasoningPrefs(convo.meta ?? null)
  if (convoPrefs) return
  const projectPrefs = convo.projectId
    ? extractReasoningPrefs(projects.value.find((p) => p.id === convo.projectId)?.meta ?? null)
    : null
  if (projectPrefs) return
  applyReasoningPrefs(normalized)
}

async function persistReasoningPrefs() {
  const convo = getActiveConvoRecord()
  if (!convo) return
  const prefs = buildReasoningPrefsFromUi()
  const nextMeta = mergeReasoningPrefsIntoMeta(convo.meta ?? null, prefs)

  try {
    await saveConvo({
      id: convo.id,
      title: convo.title,
      projectId: convo.projectId ?? null,
      meta: nextMeta,
    })
    convos.value = convos.value.map((c) => (c.id === convo.id ? { ...c, meta: nextMeta } : c))
  } catch (err) {
    if (shouldLogDebug()) console.warn('[ui-app] persistReasoningPrefs failed (non-fatal):', err)
  }

  if (!convo.projectId) {
    try {
      await setReasoningPrefs(prefs)
      globalReasoningPrefs.value = prefs
    } catch (err) {
      if (shouldLogDebug()) console.warn('[ui-app] setReasoningPrefs failed (non-fatal):', err)
    }
  }
}

async function ensureProjectReasoningPrefsInitialized(projectId: string | null) {
  if (!projectId) return
  const existing = await loadProjectReasoningPrefs(projectId)
  if (existing) return

  const project = await findProjectById(projectId)
  if (!project) return

  const prefs = buildReasoningPrefsFromUi()
  const nextMeta = mergeReasoningPrefsIntoMeta(project.meta ?? null, prefs)

  try {
    await saveProject({ id: project.id, name: project.name, meta: nextMeta })
    projects.value = projects.value.some((p) => p.id === project.id)
      ? projects.value.map((p) => (p.id === project.id ? { ...p, meta: nextMeta } : p))
      : [...projects.value, { ...project, meta: nextMeta }]
  } catch (err) {
    if (shouldLogDebug()) console.warn('[ui-app] ensureProjectReasoningPrefsInitialized failed (non-fatal):', err)
  }
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
  const modelId = model.value.trim() || 'openrouter/auto'

  const { requestedReasoningMode, requestedReasoningEffortValue, requestedReasoningExclude } = getRequestedReasoningConfig()

  const requestId = randomId('req')
  const netExpSettings = await getNetExpSettings()
  const netExpRunTracker = startNetExpRunReport({
    runId: branchId,
    requestId,
    streamMode: netExpSettings.streamInMainProcess ? 'main' : 'renderer',
    model: modelId,
    baseUrl: baseUrl ?? undefined,
    settings: netExpSettings,
  })
  let netExpTerminalStatus: 'done' | 'error' | 'aborted' = 'done'
  let netExpTerminalError: unknown = null
  let netExpFinalized = false

  const started = startGeneration(state.value, {
    runId: branchId,
    requestId,
    model: modelId,
    userMessageId: questionId,
    userMessageText: questionText,
    assistantMessageId,
    requestedReasoningMode,
    ...(requestedReasoningEffortValue ? { requestedReasoningEffort: requestedReasoningEffortValue } : {}),
    ...(requestedReasoningExclude ? { requestedReasoningExclude: true } : {}),
  })
  state.value = started.state

  const requestReasoningConfig = buildReasoningRequestConfigSnapshot({
    requestedReasoningMode,
    requestedReasoningEffortValue,
    requestedReasoningExclude,
  })
  try {
    await setMessageReasoningRequestConfig({ messageId: assistantMessageId, value: requestReasoningConfig })
  } catch (err) {
    if (shouldLogDebug()) console.warn('[ui-app] setMessageReasoningRequestConfig failed (non-fatal):', err)
  }

  const abort = new AbortController()
  const stream: ActiveStream = {
    abort,
    assistantMessageId,
    assistantSeq,
    pendingAppendText: { value: '' },
    flushing: { value: false },
    flushTimer: { id: null },
    pendingReasoningDetails: { value: [] },
    reasoningFlushTimer: { id: null },
    reasoningMerger: new ReasoningDetailStreamMerger(),
    diagnosticTracker: {
      events: [],
      totalQueued: 0,
      totalSkipped: 0,
      totalDeltaLen: 0,
      chunkRanges: [],
      textCursor: 0,
      dbInserted: 0,
      dbSkipped: 0,
      dbIgnored: 0,
      dbSumDeltaLenInserted: 0,
    },
  }
  activeStream.value = stream

  let finalStatus: 'final' | 'error' = 'final'
  try {
    for await (const ev of streamOpenRouterChatAsEvents({
      requestId,
      assistantMessageId,
      userText: questionText,
      contextMessages: input.contextMessages,
      signal: abort.signal,
      config: {
        apiKey,
        model: modelId,
        requestedReasoningMode,
        ...(requestedReasoningEffortValue ? { requestedReasoningEffort: requestedReasoningEffortValue } : {}),
        ...(requestedReasoningExclude ? { requestedReasoningExclude: true } : {}),
        ...(baseUrl ? { baseUrl } : {}),
      },
    })) {
      netExpRunTracker.onEvent(ev)
      if (ev.type === 'StreamError') {
        netExpTerminalStatus = 'error'
        netExpTerminalError = ev.error
      }
      if (ev.type === 'StreamAbort') {
        netExpTerminalStatus = 'aborted'
      }

      if (enableEventScheduler) {
        eventScheduler.enqueue(branchId, ev)
      } else {
        commitImmediate(branchId, ev)
      }

      if (ev.type === 'MessageDeltaText' && ev.messageId === assistantMessageId) {
        stream.pendingAppendText.value += ev.text
        scheduleFlush(convoId, stream)
      }
      if (ev.type === 'MessageAppendContentBlock' && ev.messageId === assistantMessageId && ev.block?.type === 'text') {
        stream.pendingAppendText.value += String((ev.block as any).text ?? '')
        scheduleFlush(convoId, stream)
      }

      if (ev.type === 'MessageDeltaReasoningDetail' && ev.messageId === assistantMessageId) {
        // 使用 Merger 处理快照语义，提取真正的后缀增量
        const merged = stream.reasoningMerger.merge(ev.detail)
        const key = merged?.key ?? 'unknown'
        const chunkNo = typeof ev.chunkNo === 'number' ? ev.chunkNo : -1

        if (merged) {
          const deltaLen = (merged.deltaText?.length ?? 0) + (merged.deltaSummary?.length ?? 0) + (merged.deltaData?.length ?? 0)
          // 构建带有真正 delta 和 offset 信息的对象用于存储
          const detailWithDelta = {
            ...merged.originalDetail,
            __deltaText: merged.deltaText,
            __deltaSummary: merged.deltaSummary,
            __deltaData: merged.deltaData,
            __isSnapshot: merged.isSnapshot,
            __hasNewMetadata: merged.hasNewMetadata,
            __key: merged.key,
            __offsetBefore: merged.offsetBefore,
            __offsetAfter: merged.offsetAfter,
            __metadataDigest: merged.metadataDigest,
          }
          stream.pendingReasoningDetails.value.push(detailWithDelta)
          scheduleReasoningDetailFlush(stream, assistantMessageId)

          // 追踪诊断信息
          stream.diagnosticTracker.events.push({ chunkNo, key, offsetBefore: merged.offsetBefore, deltaLen, action: 'queued' })
          stream.diagnosticTracker.totalQueued++
          stream.diagnosticTracker.totalDeltaLen += deltaLen
          // 记录 offset 到文本区间的映射 [start, end)
          const start = stream.diagnosticTracker.textCursor
          const end = start + deltaLen
          stream.diagnosticTracker.chunkRanges.push({ chunkNo, key, offsetBefore: merged.offsetBefore, start, end })
          stream.diagnosticTracker.textCursor = end

          if (shouldLogReasoningDebug()) {
            const snapshotTail = merged.isSnapshot && typeof (merged.originalDetail as any)?.text === 'string'
              ? (merged.originalDetail as any).text.slice(-30)
              : undefined
            console.log('[reasoning-chunk]', { key, offsetBefore: merged.offsetBefore, deltaLen, hasNewMetadata: merged.hasNewMetadata, isSnapshot: merged.isSnapshot, deltaHead: merged.deltaText?.slice(0, 30), snapshotTail })
          }
        } else {
          // Merger 返回 null，记录跳过
          stream.diagnosticTracker.events.push({ chunkNo, key, deltaLen: 0, action: 'skipped', reason: 'merger_null' })
          stream.diagnosticTracker.totalSkipped++
          if (shouldLogReasoningDebug()) {
            console.log('[reasoning-chunk] SKIPPED (merger returned null)', { key })
          }
        }
      }

      if (ev.type === 'StreamError') {
        if (String(globalThis?.localStorage?.getItem('sv_debug_stream_error') ?? '').trim() === '1') {
          console.error('[ui-app] stream error event', ev)
        }
      }
      if (ev.type === 'StreamDone' || ev.type === 'StreamAbort' || ev.type === 'StreamError') {
        if (ev.type === 'StreamAbort' || ev.type === 'StreamError') finalStatus = 'error'
        if (enableEventScheduler) {
          eventScheduler.flushNow(branchId, 'flush')
        }
        clearFlushTimer(stream)
        await flushPending(convoId, stream)
        clearReasoningFlushTimer(stream)
        await flushReasoningDetailSegments(stream, assistantMessageId)
      }
    }

    if (enableEventScheduler) {
      eventScheduler.flushNow(branchId, 'flush')
    }
    clearFlushTimer(stream)
    await flushPending(convoId, stream)
    await setMessageStatus({ messageId: assistantMessageId, status: finalStatus })
    if (!netExpFinalized) {
      netExpFinalized = true
      netExpRunTracker.onEnd(netExpTerminalStatus, netExpTerminalError)
    }
  } catch (err: any) {
    finalStatus = 'error'
    if (!netExpFinalized) {
      netExpFinalized = true
      netExpRunTracker.onEnd('error', err)
    }
    loadError.value = err?.message ? String(err.message) : String(err)
    if (enableEventScheduler) {
      eventScheduler.flushNow(branchId, 'flush')
    }
    try {
      await setMessageStatus({ messageId: assistantMessageId, status: 'error' })
    } catch {
      // no-op
    }
  } finally {
    clearFlushTimer(stream)
    clearReasoningFlushTimer(stream)
    // 输出 Merger 诊断统计
    if (shouldLogReasoningDebug()) {
      const stats = stream.reasoningMerger.getStats()
      console.log('[reasoning-merger] stream stats:', stats)
      if (stats.isLikelySnapshot) {
        console.log('[reasoning-merger] ⚠️ 检测到快照语义 (>50% prefixMatch)，已自动提取后缀增量')
      }
    }
    // Use unified finalization to enforce: refresh FIRST, then clear activeStream.
    try {
      // 记录 flush 前的队列信息
      const pendingCountBeforeFlush = stream.pendingReasoningDetails.value.length
      await flushReasoningDetailSegments(stream, assistantMessageId)
      await finalizeReasoningDetails({ messageId: assistantMessageId })

      if (shouldLogReasoningDebug()) {
        const mergerStats = stream.reasoningMerger.getStats()
        const mergerSnapshot = stream.reasoningMerger.getMergedSnapshots()
        const mergerExtracted = extractReasoningTextFromDetails(mergerSnapshot)
        const mergerFinalText = mergerExtracted.reasoningText
        const isEncryptedModel = mergerExtracted.isEncrypted

        let dbReplaySnapshot: unknown[] | null = null
        let dbFinalText: string | undefined
        let dbExtracted: ReturnType<typeof extractReasoningTextFromDetails> | null = null
        let dbSegmentsCount: number | undefined
        try {
          const bridge = (globalThis as any).dbBridge as { invoke?: (method: string, params?: unknown) => Promise<any> } | undefined
          if (bridge?.invoke) {
            const rows = await bridge.invoke('message.list', { convoId, fromSeq: assistantSeq, limit: 1 })
            const row = Array.isArray(rows)
              ? (rows.find((r) => r && typeof r === 'object' && (r as any).id === assistantMessageId) ?? rows[0])
              : null
            const meta = row && typeof (row as any).meta === 'object' ? (row as any).meta : null
            const reasoningDetailsRaw = Array.isArray(meta?.reasoningDetailsRaw) ? meta.reasoningDetailsRaw : null
            if (reasoningDetailsRaw) {
              dbReplaySnapshot = reasoningDetailsRaw
              dbExtracted = extractReasoningTextFromDetails(dbReplaySnapshot)
              dbFinalText = dbExtracted.reasoningText
            }
            // 尝试获取 segments count（如果 meta 中有的话）
            dbSegmentsCount = typeof meta?.reasoningSegmentsCount === 'number' ? meta.reasoningSegmentsCount : undefined
          }
        } catch (err) {
          console.warn('[reasoning-verify] failed to load db replay snapshot:', err)
        }

        const uiFinalText = selectMessage(state.value, assistantMessageId)?.reasoningView?.reasoningText

        // 输出 diagnosticTracker 摘要（包含 DB 统计）
        const tracker = stream.diagnosticTracker
        console.log('[reasoning-diag] tracker summary', {
          // UI 侧统计
          totalQueued: tracker.totalQueued,
          totalSkipped: tracker.totalSkipped,
          totalDeltaLen: tracker.totalDeltaLen,
          eventCount: tracker.events.length,
          // DB 侧统计
          dbInserted: tracker.dbInserted,
          dbSkipped: tracker.dbSkipped,
          dbIgnored: tracker.dbIgnored,
          dbSumDeltaLenInserted: tracker.dbSumDeltaLenInserted,
        })

        // 一次性 DB 统计查询（作为对照）
        const dbRealStats = await getReasoningSegmentsStats(assistantMessageId)
        if (dbRealStats) {
          const matchCnt = dbRealStats.cnt === tracker.dbInserted
          const matchSum = dbRealStats.sumLen === tracker.dbSumDeltaLenInserted
          console.log('[reasoning-diag] DB real stats', {
            segmentsInDb: dbRealStats.cnt,
            sumDeltaTextLenInDb: dbRealStats.sumLen,
            trackerDbInserted: tracker.dbInserted,
            trackerDbSumDeltaLenInserted: tracker.dbSumDeltaLenInserted,
            matchCnt,
            matchSum,
          })
          // 失败时输出差异诊断
          if (!matchCnt || !matchSum) {
            console.warn('[reasoning-diag] MISMATCH', {
              messageId: assistantMessageId,
              cntDiff: dbRealStats.cnt - tracker.dbInserted,
              sumDiff: dbRealStats.sumLen - tracker.dbSumDeltaLenInserted,
              trackerIgnored: tracker.dbIgnored,
              trackerSkipped: tracker.dbSkipped,
            })
          }
        } else {
          console.warn('[reasoning-diag] failed to get DB real stats for', assistantMessageId)
        }

        // 恒等式验证
        const eventCountExpected = tracker.dbInserted + tracker.dbIgnored + tracker.dbSkipped
        const invariant1 = tracker.totalQueued === eventCountExpected
        console.log('[reasoning-diag] invariants', {
          'eventCount == dbInserted + dbIgnored + dbSkipped': invariant1,
          totalQueued: tracker.totalQueued,
          eventCountExpected,
          'totalDeltaLen == dbSumDeltaLenInserted': tracker.totalDeltaLen === tracker.dbSumDeltaLenInserted,
          totalDeltaLen: tracker.totalDeltaLen,
          dbSumDeltaLenInserted: tracker.dbSumDeltaLenInserted,
          deltaLenDiff: tracker.totalDeltaLen - tracker.dbSumDeltaLenInserted,
        })

        // 详细诊断日志
        console.log('[reasoning-verify] diagnostic info', {
          messageId: assistantMessageId,
          mergerChunkCount: mergerStats.chunkCount,
          mergerDeltaCount: mergerStats.deltaCount,
          mergerSnapshotCount: mergerStats.snapshotCount,
          mergerUniqueKeys: mergerStats.uniqueKeys,
          pendingCountBeforeFlush,
          dbSegmentsCount,
          isLikelySnapshot: mergerStats.isLikelySnapshot,
          isEncryptedModel,
        })

        // 对于加密模型，比较 encryptedData；否则比较 reasoningText
        const mergerCompareText = isEncryptedModel ? mergerExtracted.encryptedData : mergerFinalText
        const dbCompareText = isEncryptedModel ? dbExtracted?.encryptedData : dbFinalText

        console.log('[reasoning-verify] text compare', {
          messageId: assistantMessageId,
          isEncryptedModel,
          mergerFinalTextLen: mergerCompareText?.length ?? 0,
          dbFinalTextLen: dbCompareText?.length ?? 0,
          uiFinalTextLen: uiFinalText?.length ?? 0,
          // 加密模型不输出原文（避免日志过大）
          mergerFinalText: isEncryptedModel ? `[encrypted ${mergerCompareText?.length ?? 0} bytes]` : mergerFinalText,
          dbFinalText: isEncryptedModel ? `[encrypted ${dbCompareText?.length ?? 0} bytes]` : dbFinalText,
          uiFinalText: isEncryptedModel ? '[encrypted - see UI]' : uiFinalText,
        })

        // 加密模型：比较 encryptedData；非加密模型：比较 reasoningText
        const textMismatch = mergerCompareText !== dbCompareText
        // UI 文本对于加密模型无法直接比较（UI 可能解密显示），跳过 UI 比较
        const uiMismatch = !isEncryptedModel && dbFinalText !== uiFinalText

        if (textMismatch || uiMismatch) {
          // 找出具体差异位置（使用比较用的文本）
          let diffPos = -1
          const shorter = mergerCompareText && dbCompareText
            ? (mergerCompareText.length <= dbCompareText.length ? mergerCompareText : dbCompareText)
            : ''
          const longer = mergerCompareText && dbCompareText
            ? (mergerCompareText.length > dbCompareText.length ? mergerCompareText : dbCompareText)
            : ''
          for (let i = 0; i < shorter.length; i++) {
            if (shorter[i] !== longer[i]) {
              diffPos = i
              break
            }
          }
          if (diffPos === -1 && shorter.length !== longer.length) {
            diffPos = shorter.length
          }

          console.warn('[reasoning-verify] MISMATCH DETECTED', {
            messageId: assistantMessageId,
            isEncryptedModel,
            textMismatch,
            uiMismatch,
            diffPos,
            diffContext: diffPos >= 0 && !isEncryptedModel ? {
              mergerAround: mergerCompareText?.slice(Math.max(0, diffPos - 20), diffPos + 20),
              dbAround: dbCompareText?.slice(Math.max(0, diffPos - 20), diffPos + 20),
            } : null,
            mergerSnapshotCount: mergerSnapshot.length,
            dbSnapshotCount: dbReplaySnapshot?.length ?? 0,
          })

          // 用 diffPos 映射到 chunkNo（精确定位被吞的 chunk）
          const affectedChunk = tracker.chunkRanges.find(r => r.start <= diffPos && diffPos < r.end)
          console.warn('[reasoning-verify] diffPos → chunkNo mapping', {
            diffPos,
            affectedChunkNo: affectedChunk?.chunkNo ?? 'not found',
            affectedChunkRange: affectedChunk ? `[${affectedChunk.start}, ${affectedChunk.end})` : null,
            nearbyChunks: tracker.chunkRanges.filter(r => 
              Math.abs(r.start - diffPos) < 50 || Math.abs(r.end - diffPos) < 50
            ).slice(0, 5),
          })

          // 输出每个 snapshot 的 text 长度对比
          console.warn('[reasoning-verify] snapshot details', {
            mergerSnapshots: mergerSnapshot.map((s: any) => ({
              key: `${s.id ?? ''}|${s.index ?? ''}|${s.type ?? ''}`,
              textLen: s.text?.length ?? 0,
              textPreview: s.text?.slice(0, 50),
            })),
            dbSnapshots: dbReplaySnapshot?.map((s: any) => ({
              key: `${s.id ?? ''}|${s.index ?? ''}|${s.type ?? ''}`,
              textLen: s.text?.length ?? 0,
              textPreview: s.text?.slice(0, 50),
            })),
          })
        }
      }
    } catch (err) {
      if (shouldLogReasoningDebug()) console.warn('[ui-app] finalizeReasoningDetails failed (non-fatal):', err)
    }
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
  const modelId = model.value.trim() || 'openrouter/auto'

  let contextMessages: any[] = []
  try {
    const built = await buildContextForBranchInternalMessages(branch.id, { limit: 200, debug: !!import.meta.env?.DEV })
    contextMessages = built.contextMessages as any[]
  } catch (err) {
    if (import.meta.env?.DEV) console.warn('[ui-app] context.buildForBranch failed; using empty context', err)
  }

  const begun = await beginTurn(branch.id, text)
  // Branch tip update (definition): the new assistant becomes the insertion point for the next turn.
  patchBranch(branch.id, { headMessageId: begun.assistantId, updatedAt: Date.now() })

  const userMessageId = begun.questionId
  const assistantMessageId = begun.assistantId
  const assistantSeq = begun.assistantSeq

  messageSeqById.value.set(userMessageId, begun.questionSeq)
  messageSeqById.value.set(assistantMessageId, assistantSeq)

  const { requestedReasoningMode, requestedReasoningEffortValue, requestedReasoningExclude } = getRequestedReasoningConfig()

  const started = startGeneration(state.value, {
    runId: branch.id,
    requestId: randomId('req'),
    model: modelId,
    userMessageId,
    userMessageText: text,
    assistantMessageId,
    requestedReasoningMode,
    ...(requestedReasoningEffortValue ? { requestedReasoningEffort: requestedReasoningEffortValue } : {}),
    ...(requestedReasoningExclude ? { requestedReasoningExclude: true } : {}),
  })
  state.value = started.state

  const requestReasoningConfig = buildReasoningRequestConfigSnapshot({
    requestedReasoningMode,
    requestedReasoningEffortValue,
    requestedReasoningExclude,
  })
  try {
    await setMessageReasoningRequestConfig({ messageId: assistantMessageId, value: requestReasoningConfig })
  } catch (err) {
    if (shouldLogDebug()) console.warn('[ui-app] setMessageReasoningRequestConfig failed (non-fatal):', err)
  }

  const abort = new AbortController()
  const stream: ActiveStream = {
    abort,
    assistantMessageId,
    assistantSeq,
    pendingAppendText: { value: '' },
    flushing: { value: false },
    flushTimer: { id: null },
    pendingReasoningDetails: { value: [] },
    reasoningFlushTimer: { id: null },
    reasoningMerger: new ReasoningDetailStreamMerger(),
    diagnosticTracker: {
      events: [],
      totalQueued: 0,
      totalSkipped: 0,
      totalDeltaLen: 0,
      chunkRanges: [],
      textCursor: 0,
      dbInserted: 0,
      dbSkipped: 0,
      dbIgnored: 0,
      dbSumDeltaLenInserted: 0,
    },
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
        model: modelId,
        requestedReasoningMode,
        ...(requestedReasoningEffortValue ? { requestedReasoningEffort: requestedReasoningEffortValue } : {}),
        ...(requestedReasoningExclude ? { requestedReasoningExclude: true } : {}),
        ...(baseUrl ? { baseUrl } : {}),
      },
    })) {
      if (enableEventScheduler) {
        eventScheduler.enqueue(branch.id, ev)
      } else {
        commitImmediate(branch.id, ev)
      }

      if (ev.type === 'MessageDeltaText' && ev.messageId === assistantMessageId) {
        stream.pendingAppendText.value += ev.text
        scheduleFlush(convoId, stream)
      }
      if (ev.type === 'MessageAppendContentBlock' && ev.messageId === assistantMessageId && ev.block?.type === 'text') {
        stream.pendingAppendText.value += String((ev.block as any).text ?? '')
        scheduleFlush(convoId, stream)
      }

      if (ev.type === 'MessageDeltaReasoningDetail' && ev.messageId === assistantMessageId) {
        // 使用 Merger 处理快照语义，提取真正的后缀增量
        const merged = stream.reasoningMerger.merge(ev.detail)
        const key = merged?.key ?? 'unknown'
        const chunkNo = typeof ev.chunkNo === 'number' ? ev.chunkNo : -1

        if (merged) {
          const deltaLen = (merged.deltaText?.length ?? 0) + (merged.deltaSummary?.length ?? 0) + (merged.deltaData?.length ?? 0)
          // 构建带有真正 delta 和 offset 信息的对象用于存储
          const detailWithDelta = {
            ...merged.originalDetail,
            __deltaText: merged.deltaText,
            __deltaSummary: merged.deltaSummary,
            __deltaData: merged.deltaData,
            __isSnapshot: merged.isSnapshot,
            __hasNewMetadata: merged.hasNewMetadata,
            __key: merged.key,
            __offsetBefore: merged.offsetBefore,
            __offsetAfter: merged.offsetAfter,
            __metadataDigest: merged.metadataDigest,
          }
          stream.pendingReasoningDetails.value.push(detailWithDelta)
          scheduleReasoningDetailFlush(stream, assistantMessageId)

          // 追踪诊断信息
          stream.diagnosticTracker.events.push({ chunkNo, key, offsetBefore: merged.offsetBefore, deltaLen, action: 'queued' })
          stream.diagnosticTracker.totalQueued++
          stream.diagnosticTracker.totalDeltaLen += deltaLen
          // 记录 offset 到文本区间的映射 [start, end)
          const start = stream.diagnosticTracker.textCursor
          const end = start + deltaLen
          stream.diagnosticTracker.chunkRanges.push({ chunkNo, key, offsetBefore: merged.offsetBefore, start, end })
          stream.diagnosticTracker.textCursor = end

          if (shouldLogReasoningDebug()) {
            const snapshotTail = merged.isSnapshot && typeof (merged.originalDetail as any)?.text === 'string'
              ? (merged.originalDetail as any).text.slice(-30)
              : undefined
            console.log('[reasoning-chunk]', { key, offsetBefore: merged.offsetBefore, deltaLen, hasNewMetadata: merged.hasNewMetadata, isSnapshot: merged.isSnapshot, deltaHead: merged.deltaText?.slice(0, 30), snapshotTail })
          }
        } else {
          // Merger 返回 null，记录跳过
          stream.diagnosticTracker.events.push({ chunkNo, key, deltaLen: 0, action: 'skipped', reason: 'merger_null' })
          stream.diagnosticTracker.totalSkipped++
          if (shouldLogReasoningDebug()) {
            console.log('[reasoning-chunk] SKIPPED (merger returned null)', { key })
          }
        }
      }

      if (ev.type === 'StreamError') {
        if (String(globalThis?.localStorage?.getItem('sv_debug_stream_error') ?? '').trim() === '1') {
          console.error('[ui-app] stream error event', ev)
        }
      }
      if (ev.type === 'StreamDone' || ev.type === 'StreamAbort' || ev.type === 'StreamError') {
        if (ev.type === 'StreamAbort' || ev.type === 'StreamError') finalStatus = 'error'
        if (enableEventScheduler) {
          eventScheduler.flushNow(branch.id, 'flush')
        }
        clearFlushTimer(stream)
        await flushPending(convoId, stream)
        clearReasoningFlushTimer(stream)
        await flushReasoningDetailSegments(stream, assistantMessageId)
      }
    }

    if (enableEventScheduler) {
      eventScheduler.flushNow(branch.id, 'flush')
    }
    clearFlushTimer(stream)
    await flushPending(convoId, stream)
    await setMessageStatus({ messageId: assistantMessageId, status: finalStatus })
  } catch (err: any) {
    finalStatus = 'error'
    loadError.value = err?.message ? String(err.message) : String(err)
    if (enableEventScheduler) {
      eventScheduler.flushNow(branch.id, 'flush')
    }
    try {
      await setMessageStatus({ messageId: assistantMessageId, status: 'error' })
    } catch {
      // no-op
    }
  } finally {
    clearFlushTimer(stream)
    clearReasoningFlushTimer(stream)
    // 输出 Merger 诊断统计
    if (shouldLogReasoningDebug()) {
      const stats = stream.reasoningMerger.getStats()
      console.log('[reasoning-merger] stream stats:', stats)
      if (stats.isLikelySnapshot) {
        console.log('[reasoning-merger] ⚠️ 检测到快照语义 (>50% prefixMatch)，已自动提取后缀增量')
      }
    }
    // Use unified finalization to enforce: refresh FIRST, then clear activeStream.
    try {
      // 记录 flush 前的队列信息
      const pendingCountBeforeFlush = stream.pendingReasoningDetails.value.length
      await flushReasoningDetailSegments(stream, assistantMessageId)
      await finalizeReasoningDetails({ messageId: assistantMessageId })

      if (shouldLogReasoningDebug()) {
        const mergerStats = stream.reasoningMerger.getStats()
        const mergerSnapshot = stream.reasoningMerger.getMergedSnapshots()
        const mergerExtracted = extractReasoningTextFromDetails(mergerSnapshot)
        const mergerFinalText = mergerExtracted.reasoningText
        const isEncryptedModel = mergerExtracted.isEncrypted

        let dbReplaySnapshot: unknown[] | null = null
        let dbFinalText: string | undefined
        let dbExtracted: ReturnType<typeof extractReasoningTextFromDetails> | null = null
        let dbSegmentsCount: number | undefined
        try {
          const bridge = (globalThis as any).dbBridge as { invoke?: (method: string, params?: unknown) => Promise<any> } | undefined
          if (bridge?.invoke) {
            const rows = await bridge.invoke('message.list', { convoId, fromSeq: assistantSeq, limit: 1 })
            const row = Array.isArray(rows)
              ? (rows.find((r) => r && typeof r === 'object' && (r as any).id === assistantMessageId) ?? rows[0])
              : null
            const meta = row && typeof (row as any).meta === 'object' ? (row as any).meta : null
            const reasoningDetailsRaw = Array.isArray(meta?.reasoningDetailsRaw) ? meta.reasoningDetailsRaw : null
            if (reasoningDetailsRaw) {
              dbReplaySnapshot = reasoningDetailsRaw
              dbExtracted = extractReasoningTextFromDetails(dbReplaySnapshot)
              dbFinalText = dbExtracted.reasoningText
            }
            dbSegmentsCount = typeof meta?.reasoningSegmentsCount === 'number' ? meta.reasoningSegmentsCount : undefined
          }
        } catch (err) {
          console.warn('[reasoning-verify] failed to load db replay snapshot:', err)
        }

        const uiFinalText = selectMessage(state.value, assistantMessageId)?.reasoningView?.reasoningText

        // 输出 diagnosticTracker 摘要（包含 DB 统计）
        const tracker = stream.diagnosticTracker
        console.log('[reasoning-diag] tracker summary', {
          // UI 侧统计
          totalQueued: tracker.totalQueued,
          totalSkipped: tracker.totalSkipped,
          totalDeltaLen: tracker.totalDeltaLen,
          eventCount: tracker.events.length,
          // DB 侧统计
          dbInserted: tracker.dbInserted,
          dbSkipped: tracker.dbSkipped,
          dbIgnored: tracker.dbIgnored,
          dbSumDeltaLenInserted: tracker.dbSumDeltaLenInserted,
        })

        // 一次性 DB 统计查询（作为对照）
        const dbRealStats = await getReasoningSegmentsStats(assistantMessageId)
        if (dbRealStats) {
          const matchCnt = dbRealStats.cnt === tracker.dbInserted
          const matchSum = dbRealStats.sumLen === tracker.dbSumDeltaLenInserted
          console.log('[reasoning-diag] DB real stats', {
            segmentsInDb: dbRealStats.cnt,
            sumDeltaTextLenInDb: dbRealStats.sumLen,
            trackerDbInserted: tracker.dbInserted,
            trackerDbSumDeltaLenInserted: tracker.dbSumDeltaLenInserted,
            matchCnt,
            matchSum,
          })
          // 失败时输出差异诊断
          if (!matchCnt || !matchSum) {
            console.warn('[reasoning-diag] MISMATCH', {
              messageId: assistantMessageId,
              cntDiff: dbRealStats.cnt - tracker.dbInserted,
              sumDiff: dbRealStats.sumLen - tracker.dbSumDeltaLenInserted,
              trackerIgnored: tracker.dbIgnored,
              trackerSkipped: tracker.dbSkipped,
            })
          }
        } else {
          console.warn('[reasoning-diag] failed to get DB real stats for', assistantMessageId)
        }

        // 恒等式验证
        const eventCountExpected = tracker.dbInserted + tracker.dbIgnored + tracker.dbSkipped
        const invariant1 = tracker.totalQueued === eventCountExpected
        console.log('[reasoning-diag] invariants', {
          'eventCount == dbInserted + dbIgnored + dbSkipped': invariant1,
          totalQueued: tracker.totalQueued,
          eventCountExpected,
          'totalDeltaLen == dbSumDeltaLenInserted': tracker.totalDeltaLen === tracker.dbSumDeltaLenInserted,
          totalDeltaLen: tracker.totalDeltaLen,
          dbSumDeltaLenInserted: tracker.dbSumDeltaLenInserted,
          deltaLenDiff: tracker.totalDeltaLen - tracker.dbSumDeltaLenInserted,
        })

        // 详细诊断日志
        console.log('[reasoning-verify] diagnostic info', {
          messageId: assistantMessageId,
          mergerChunkCount: mergerStats.chunkCount,
          mergerDeltaCount: mergerStats.deltaCount,
          mergerSnapshotCount: mergerStats.snapshotCount,
          mergerUniqueKeys: mergerStats.uniqueKeys,
          pendingCountBeforeFlush,
          dbSegmentsCount,
          isLikelySnapshot: mergerStats.isLikelySnapshot,
          isEncryptedModel,
        })

        // 对于加密模型，比较 encryptedData；否则比较 reasoningText
        const mergerCompareText = isEncryptedModel ? mergerExtracted.encryptedData : mergerFinalText
        const dbCompareText = isEncryptedModel ? dbExtracted?.encryptedData : dbFinalText

        console.log('[reasoning-verify] text compare', {
          messageId: assistantMessageId,
          isEncryptedModel,
          mergerFinalTextLen: mergerCompareText?.length ?? 0,
          dbFinalTextLen: dbCompareText?.length ?? 0,
          uiFinalTextLen: uiFinalText?.length ?? 0,
          // 加密模型不输出原文（避免日志过大）
          mergerFinalText: isEncryptedModel ? `[encrypted ${mergerCompareText?.length ?? 0} bytes]` : mergerFinalText,
          dbFinalText: isEncryptedModel ? `[encrypted ${dbCompareText?.length ?? 0} bytes]` : dbFinalText,
          uiFinalText: isEncryptedModel ? '[encrypted - see UI]' : uiFinalText,
        })

        // 加密模型：比较 encryptedData；非加密模型：比较 reasoningText
        const textMismatch = mergerCompareText !== dbCompareText
        // UI 文本对于加密模型无法直接比较（UI 可能解密显示），跳过 UI 比较
        const uiMismatch = !isEncryptedModel && dbFinalText !== uiFinalText

        if (textMismatch || uiMismatch) {
          let diffPos = -1
          const shorter = mergerCompareText && dbCompareText
            ? (mergerCompareText.length <= dbCompareText.length ? mergerCompareText : dbCompareText)
            : ''
          const longer = mergerCompareText && dbCompareText
            ? (mergerCompareText.length > dbCompareText.length ? mergerCompareText : dbCompareText)
            : ''
          for (let i = 0; i < shorter.length; i++) {
            if (shorter[i] !== longer[i]) {
              diffPos = i
              break
            }
          }
          if (diffPos === -1 && shorter.length !== longer.length) {
            diffPos = shorter.length
          }

          console.warn('[reasoning-verify] MISMATCH DETECTED', {
            messageId: assistantMessageId,
            isEncryptedModel,
            textMismatch,
            uiMismatch,
            diffPos,
            diffContext: diffPos >= 0 && !isEncryptedModel ? {
              mergerAround: mergerCompareText?.slice(Math.max(0, diffPos - 20), diffPos + 20),
              dbAround: dbCompareText?.slice(Math.max(0, diffPos - 20), diffPos + 20),
            } : null,
            mergerSnapshotCount: mergerSnapshot.length,
            dbSnapshotCount: dbReplaySnapshot?.length ?? 0,
          })

          // 用 diffPos 映射到 chunkNo（精确定位被吞的 chunk）
          const affectedChunk = tracker.chunkRanges.find(r => r.start <= diffPos && diffPos < r.end)
          console.warn('[reasoning-verify] diffPos → chunkNo mapping', {
            diffPos,
            affectedChunkNo: affectedChunk?.chunkNo ?? 'not found',
            affectedChunkRange: affectedChunk ? `[${affectedChunk.start}, ${affectedChunk.end})` : null,
            nearbyChunks: tracker.chunkRanges.filter(r => 
              Math.abs(r.start - diffPos) < 50 || Math.abs(r.end - diffPos) < 50
            ).slice(0, 5),
          })

          console.warn('[reasoning-verify] snapshot details', {
            mergerSnapshots: mergerSnapshot.map((s: any) => ({
              key: `${s.id ?? ''}|${s.index ?? ''}|${s.type ?? ''}`,
              textLen: s.text?.length ?? 0,
              textPreview: s.text?.slice(0, 50),
            })),
            dbSnapshots: dbReplaySnapshot?.map((s: any) => ({
              key: `${s.id ?? ''}|${s.index ?? ''}|${s.type ?? ''}`,
              textLen: s.text?.length ?? 0,
              textPreview: s.text?.slice(0, 50),
            })),
          })
        }
      }
    } catch (err) {
      if (shouldLogReasoningDebug()) console.warn('[ui-app] finalizeReasoningDetails failed (non-fatal):', err)
    }
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
      // Fork base is the branch tip (definition), not a UI cursor.
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

async function onQuestionCandidateShift(questionId: string, delta: -1 | 1) {
  const bid = activeBranchId.value
  if (!bid) return
  if (activeAssistantMessageId.value) return

  const qid = String(questionId ?? '').trim()
  const meta = qid ? messageMetaById.value.get(qid) : null
  if (!qid || !meta || meta.role !== 'user') return

  const baseMessageId = meta.parentId ?? null
  const ordered = getOrderedQuestionCandidatesOldToNew(baseMessageId)
  if (!ordered) {
    await ensureQuestionCandidatesLoadedForSlot(baseMessageId)
    return
  }

  const idx = ordered.findIndex((c) => c.questionId === qid)
  const targetIndex = idx + delta
  if (idx < 0 || targetIndex < 0 || targetIndex >= ordered.length) return
  const target = ordered[targetIndex]

  try {
    const res = await switchQuestionCandidate(bid, baseMessageId, target.questionId)
    // Branch tip update (definition): backend returns the new insertion point after switching question candidate.
    patchBranch(bid, { headMessageId: res.headMessageId, updatedAt: Date.now() })
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
    // Branch tip update (definition): regeneration chooses a new answer root and moves insertion point.
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

function openQuestionEdit(questionId: string) {
  const qid = String(questionId ?? '').trim()
  if (!qid) return
  const meta = messageMetaById.value.get(qid)
  if (!meta || meta.role !== 'user') return
  questionEditDialog.value = { questionId: qid, draft: getUserQuestionText(qid) }
}

function closeQuestionEdit() {
  questionEditDialog.value = null
}

function canReplaceQuestionInUi(questionId: string): boolean {
  const qid = String(questionId ?? '').trim()
  if (!qid) return false
  const meta = messageMetaById.value.get(qid)
  if (!meta || meta.role !== 'user') return false
  const lastQ = questionTurnOrder.value.length > 0 ? questionTurnOrder.value[questionTurnOrder.value.length - 1] : null
  return lastQ === qid
}

async function submitQuestionEdit(mode: 'new' | 'replace') {
  if (isRunning.value) return
  if (activeAssistantMessageId.value) return

  const convoId = activeConvoId.value
  const branch = activeBranch.value
  const dlg = questionEditDialog.value
  if (!convoId || !branch?.id || !dlg) return

  const oldQuestionId = String(dlg.questionId ?? '').trim()
  const newText = typeof dlg.draft === 'string' ? dlg.draft.trim() : String(dlg.draft ?? '').trim()
  if (!oldQuestionId || !newText) return

  const baseMessageId = messageMetaById.value.get(oldQuestionId)?.parentId ?? null
  if (mode === 'replace' && !canReplaceQuestionInUi(oldQuestionId)) return

  loadError.value = null

  try {
    const res =
      mode === 'replace'
        ? await retryReplaceQuestion(branch.id, oldQuestionId, newText)
        : await forkQuestion(branch.id, oldQuestionId, newText)

    invalidateQuestionCandidatesForSlot(baseMessageId)
    // Branch tip update (definition): fork/replace creates a new assistant and moves insertion point.
    patchBranch(branch.id, { headMessageId: res.assistantId, updatedAt: Date.now() })

    // Build context off the NEW head (branch is now pointed at the new assistant),
    // then slice to messages strictly before the new question.
    const built = await buildContextForBranchInternalMessages(branch.id, { limit: 200, debug: !!import.meta.env?.DEV })
    const rowsBefore = built.rawMessages.filter((m) => typeof m.seq === 'number' && m.seq < res.newQuestionSeq)
    const contextMessages = toInternalMessagesFromBranchPath(rowsBefore as any)

    messageSeqById.value.set(res.newQuestionId, res.newQuestionSeq)
    messageSeqById.value.set(res.assistantId, res.assistantSeq)

    closeQuestionEdit()
    await refreshRenderableBranchView(branch.id)

    await startStreamingForAssistantTurn({
      convoId,
      branchId: branch.id,
      questionId: res.newQuestionId,
      questionText: newText,
      assistantMessageId: res.assistantId,
      assistantSeq: res.assistantSeq,
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

  const tipId = activeBranch.value?.headMessageId
  // Tip should be within this answer group. If we can't resolve tip meta from the current projection,
  // defer strict validation to the backend (UI keeps the button enabled).
  if (tipId) {
    const tipMeta = messageMetaById.value.get(tipId)
    const tipAnswerRoot = tipMeta?.answerRootId ?? null
    // If we can't resolve head's answer root from the current projection, defer strict validation to the backend.
    if (tipMeta && tipAnswerRoot && tipId !== ar && tipAnswerRoot !== ar) {
      logBlock('head_not_within_answer_group', { qid, ar, tipId, tipAnswerRoot })
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
    // Branch tip update (definition): retry-replace moves insertion point to the new answer root.
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

  // 注意：dbEventBus 在模块导入时已自动初始化并开始缓冲
  // 这里只需要在基线同步完成后 flush

  try {
    // 基线同步：先加载所有数据
    await refreshProjects()
    await refreshConvos()
    await refreshGlobalReasoningPrefs()
    await loadTranscriptForActiveConvo()
    
    // 基线同步完成，flush 缓冲的事件
    flushBuffer()
    
    assertInvariants() // Stable boundary: initial load complete
  } catch (err: any) {
    loadError.value = err?.message ? String(err.message) : String(err)
  } finally {
    isReady.value = true
  }
})

onMounted(() => {
  window.addEventListener('settings:reasoningPrefsUpdated', handleGlobalReasoningPrefsUpdated)
})

onMounted(() => {
  if (diagnosticsFlags.perf) {
    const logger = isDev
      ? (snapshot: Record<string, unknown>) => {
          diagnosticsBridge?.setPerfSnapshot(snapshot)
          diagnosticsLogger.log('perf', snapshot)
        }
      : undefined
    stopPerfReporter = startPerfReporter({ intervalMs: 1000, enabled: true, ...(logger ? { logger } : {}) })
  }
  if (diagnosticsFlags.refAudit) {
    refAuditTimer = setInterval(() => {
      const ids = transcriptMessageIds.value
      if (ids.length === 0) return

      const now = Date.now()

      const idsSet = new Set(ids)
      for (const id of ids) {
        if (!refAuditSeenAt.has(id)) refAuditSeenAt.set(id, now)
      }
      for (const id of refAuditSeenAt.keys()) {
        if (!idsSet.has(id)) {
          refAuditSeenAt.delete(id)
          refAuditCache.delete(id)
        }
      }

      if (lastTranscriptIdsRef === ids) idsRefStableCount += 1
      else idsRefChangedCount += 1
      lastTranscriptIdsRef = ids

      const excludeId = activeAssistantMessageId.value ?? activeCursorMessageId.value
      const candidates = excludeId ? ids.filter((id) => id !== excludeId) : ids.slice()
      const eligibleCandidates = candidates.filter((id) => {
        const seenAt = refAuditSeenAt.get(id)
        return typeof seenAt === 'number' && now - seenAt >= refAuditRecentWindowMs
      })
      const recentExcluded = candidates.length - eligibleCandidates.length
      const sampleSize = Math.min(20, eligibleCandidates.length)
      if (sampleSize === 0) return

      const messagesById = transcriptMessagesById.value as Record<string, MessageVM | undefined>
      let stable = 0
      let changed = 0

      for (let i = 0; i < sampleSize; i += 1) {
        const idx = Math.floor(Math.random() * eligibleCandidates.length)
        const id = eligibleCandidates[idx]
        const current = messagesById[id]
        if (!current) continue
        const prev = refAuditCache.get(id)
        if (prev && prev === current) stable += 1
        else if (prev && prev !== current) {
          changed += 1
          refAuditSeenAt.set(id, now)
        }
        refAuditCache.set(id, current)
      }

      const total = stable + changed
      const stableRatio = total > 0 ? Math.round((stable / total) * 1000) / 1000 : 1
      const idsRefChangeRate = idsRefChangedCount + idsRefStableCount > 0
        ? Math.round((idsRefChangedCount / (idsRefChangedCount + idsRefStableCount)) * 1000) / 1000
        : 0

      const refAuditSnapshot = {
        idsLength: ids.length,
        sampleSize,
        recentExcluded,
        stable,
        changed,
        stableRatio,
        idsRefChanged: idsRefChangedCount,
        idsRefStable: idsRefStableCount,
        idsRefChangeRate,
      }

      if (isDev) {
        diagnosticsBridge?.setRefAuditSnapshot(refAuditSnapshot)
      }

      diagnosticsLogger.log('ref-audit', refAuditSnapshot)
    }, 1000)
  }
  if (typeof document !== 'undefined') {
    document.addEventListener('visibilitychange', handleVisibilityChange)
  }
})

// DB 事件订阅
let unsubscribeDbEvent: (() => void) | null = null

onMounted(() => {
  unsubscribeDbEvent = subscribeDbEvent(handleDbEvent)
})

function handleDbEvent(event: DbEvent) {
  switch (event.type) {
    case 'project.created':
    case 'project.updated':
    case 'project.deleted':
      // 项目变更：刷新项目列表
      void refreshProjects()
      break
    case 'conversation.moved':
      // 对话移动：刷新对话列表和项目计数
      void refreshConvos()
      void refreshProjectCounts()
      break
    case 'conversation.activity_updated':
      // 对话活动更新：如果是当前显示的对话列表，可能需要重新排序
      // 优化：仅在 "全部对话" 或当前项目匹配时刷新
      void refreshConvos()
      break
  }
}

onUnmounted(() => {
  window.removeEventListener('settings:reasoningPrefsUpdated', handleGlobalReasoningPrefsUpdated)
  // 清理 DB 事件订阅
  if (unsubscribeDbEvent) {
    unsubscribeDbEvent()
    unsubscribeDbEvent = null
  }
  destroyDbEventBus()

  diagnosticsBridge?.dispose()

  if (stopPerfReporter) {
    stopPerfReporter()
    stopPerfReporter = null
  }
  if (refAuditTimer) {
    clearInterval(refAuditTimer)
    refAuditTimer = null
  }
  if (typeof document !== 'undefined') {
    document.removeEventListener('visibilitychange', handleVisibilityChange)
  }
  if (enableEventScheduler) {
    eventScheduler.flushAll('dispose')
    eventScheduler.disposeAll()
  }
})

onMounted(() => {
  void refreshModelLists()
  const ipc = getIpcRenderer()
  if (!ipc) return
  ipc.on('db:modelCatalogSynced', onModelsSynced)
})

const lastTranscriptSig = ref('')
watch(
  transcriptMessageIds,
  (ids) => {
    if (!shouldLogDebug()) return
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
    <!-- 对话列表 -->
    <ConversationList
      :items="convoListItems"
      :activeId="activeConvoId"
      :activeProjectId="activeProjectId"
      :inboxId="inboxId"
      :projects="projectListItems"
      :disabled="!isReady || isRunning"
      @openSearch="openSearchModal"
      @selectProject="onSelectProject"
      @createProject="onCreateProject"
      @renameProject="onRenameProject"
      @deleteProject="onDeleteProject"
      @select="onSelectConvo"
      @create="onCreateConvo"
      @refresh="refreshConvos"
      @rename="onRenameConvo"
      @delete="onDeleteConvo"
      @moveToProject="onMoveConvoToProject"
      @bulkDelete="onBulkDeleteConvos"
      @bulkMoveToProject="onBulkMoveConvosToProject"
    />

    <SearchModal
      :open="searchModalOpen"
      :projects="searchProjectOptions"
      :convos="searchConvoOptions"
      :activeProjectId="activeProjectId"
      :activeConvoId="activeConvoId"
      :disabled="!isReady || isRunning"
      @close="closeSearchModal"
      @select="onSelectSearchHit"
    />

    <div class="min-h-0 flex-1">
      <ChatLayout :sidePanel="showReasoningPanel ? 'right' : 'none'">
        <template #header>
          <ChatStatusBar
            title="Starverse"
            :run="runVM"
            :isRunning="isRunning"
            :showAbort="false"
            :showReset="false"
          />
        </template>
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
              <button
                type="button"
                class="rounded-md border border-gray-200 bg-white px-2 py-1 text-[11px] text-gray-700 shadow-sm hover:bg-gray-50 disabled:opacity-50"
                :disabled="!canToggleReasoningPanel"
                @click="onToggleReasoningPanelState()"
              >
                {{ showReasoningPanel ? 'Hide reasoning' : 'Show reasoning' }}
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
          <ChatTranscript
            :messageIds="transcriptMessageIds"
            :messagesById="transcriptMessagesById"
            :activeMessageId="activeCursorMessageId"
            :error="runVM?.error"
            emptyText="No messages in this conversation yet."
          >
            <template #message="{ message }">
              <div
                class="rounded-2xl"
                :class="isTurnExcludedForMessage(message.messageId, message.role) ? 'opacity-45 grayscale' : ''"
                :data-testid="`msg-wrap-${message.messageId}`"
                @click="onSelectCursor(message.messageId, $event)"
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

                  <button
                    type="button"
                    class="rounded border border-gray-200 bg-white px-2 py-1 text-[11px] text-gray-700 hover:bg-gray-50 disabled:opacity-50"
                    :disabled="activeAssistantMessageId != null || isAnswerGroupStreamingForQuestion(message.messageId)"
                    :data-testid="`edit-q-${message.messageId}`"
                    @click="openQuestionEdit(message.messageId)"
                  >
                    Edit
                  </button>

                  <div class="ml-auto flex items-center gap-3 text-gray-600">
                    <div v-if="(getQuestionPagerForQuestion(message.messageId)?.total ?? 0) > 1" class="flex items-center gap-1">
                      <button
                        type="button"
                        class="rounded border border-gray-200 bg-white px-2 py-1 text-[11px] text-gray-700 hover:bg-gray-50 disabled:opacity-50"
                        :disabled="
                          activeAssistantMessageId != null ||
                          isQuestionSlotLoadingForQuestion(message.messageId) ||
                          !getQuestionPagerForQuestion(message.messageId)?.canPrev ||
                          isAnswerGroupStreamingForQuestion(message.messageId)
                        "
                        :data-testid="`qvar-prev-${message.messageId}`"
                        @click="onQuestionCandidateShift(message.messageId, -1)"
                      >
                        &lt;
                      </button>
                      <div :data-testid="`qvar-pos-${message.messageId}`" class="min-w-[56px] text-center">
                        {{
                          `${(getQuestionPagerForQuestion(message.messageId)?.index ?? 0) + 1}/${getQuestionPagerForQuestion(message.messageId)?.total ?? 1}`
                        }}
                      </div>
                      <button
                        type="button"
                        class="rounded border border-gray-200 bg-white px-2 py-1 text-[11px] text-gray-700 hover:bg-gray-50 disabled:opacity-50"
                        :disabled="
                          activeAssistantMessageId != null ||
                          isQuestionSlotLoadingForQuestion(message.messageId) ||
                          !getQuestionPagerForQuestion(message.messageId)?.canNext ||
                          isAnswerGroupStreamingForQuestion(message.messageId)
                        "
                        :data-testid="`qvar-next-${message.messageId}`"
                        @click="onQuestionCandidateShift(message.messageId, 1)"
                      >
                        &gt;
                      </button>
                    </div>
                  </div>
                </div>

                <div
                  v-else-if="message.role === 'assistant' && isAnswerRootMessage(message.messageId)"
                  class="mt-2 flex items-center gap-2 pl-11 text-[11px] text-gray-500"
                >
                  <template v-if="chosenQuestionIdForAnswerRootMessage(message.messageId)">
                    <button
                      type="button"
                      class="rounded border border-gray-200 bg-white px-2 py-1 text-[11px] text-gray-700 hover:bg-gray-50 disabled:opacity-50"
                      :disabled="
                        turnFiltersByQuestionId.get(chosenQuestionIdForAnswerRootMessage(message.messageId)!)?.lockedByQuestionExclude === true
                      "
                      :data-testid="`toggle-a-${message.messageId}`"
                      @click="onToggleAnswerExclude(chosenQuestionIdForAnswerRootMessage(message.messageId)!, message.messageId)"
                    >
                      {{
                        turnFiltersByQuestionId.get(chosenQuestionIdForAnswerRootMessage(message.messageId)!)?.answerMode === 'exclude'
                          ? 'Restore answer'
                          : 'Exclude answer'
                      }}
                    </button>
                    <button
                      type="button"
                      class="rounded border border-gray-200 bg-white px-2 py-1 text-[11px] text-gray-700 hover:bg-gray-50 disabled:opacity-50"
                      :disabled="
                        activeAssistantMessageId != null ||
                        isAnswerGroupStreamingForQuestion(chosenQuestionIdForAnswerRootMessage(message.messageId)!) ||
                        !canRetryReplaceInUi(chosenQuestionIdForAnswerRootMessage(message.messageId)!, message.messageId)
                      "
                      :data-testid="`retry-a-${message.messageId}`"
                      @click="onRetryReplaceAnswer(chosenQuestionIdForAnswerRootMessage(message.messageId)!, message.messageId)"
                    >
                      Retry replace
                    </button>

                    <div v-if="(getCandidatePager(chosenQuestionIdForAnswerRootMessage(message.messageId)!)?.total ?? 0) > 1" class="ml-auto flex items-center gap-1 text-gray-600">
                      <button
                        type="button"
                        class="rounded border border-gray-200 bg-white px-2 py-1 text-[11px] text-gray-700 hover:bg-gray-50 disabled:opacity-50"
                        :disabled="
                          activeAssistantMessageId != null ||
                          candidatesLoading.has(chosenQuestionIdForAnswerRootMessage(message.messageId)!) ||
                          !getCandidatePager(chosenQuestionIdForAnswerRootMessage(message.messageId)!)?.canPrev ||
                          isAnswerGroupStreamingForQuestion(chosenQuestionIdForAnswerRootMessage(message.messageId)!)
                        "
                        :data-testid="`cand-prev-${chosenQuestionIdForAnswerRootMessage(message.messageId)!}`"
                        @click="onCandidateShift(chosenQuestionIdForAnswerRootMessage(message.messageId)!, -1)"
                      >
                        &lt;
                      </button>
                      <div :data-testid="`cand-pos-${chosenQuestionIdForAnswerRootMessage(message.messageId)!}`" class="min-w-[48px] text-center">
                        {{
                          `${(getCandidatePager(chosenQuestionIdForAnswerRootMessage(message.messageId)!)?.index ?? 0) + 1}/${
                            getCandidatePager(chosenQuestionIdForAnswerRootMessage(message.messageId)!)?.total ?? 1
                          }`
                        }}
                      </div>
                      <button
                        type="button"
                        class="rounded border border-gray-200 bg-white px-2 py-1 text-[11px] text-gray-700 hover:bg-gray-50 disabled:opacity-50"
                        :disabled="
                          activeAssistantMessageId != null ||
                          candidatesLoading.has(chosenQuestionIdForAnswerRootMessage(message.messageId)!) ||
                          !getCandidatePager(chosenQuestionIdForAnswerRootMessage(message.messageId)!)?.canNext ||
                          isAnswerGroupStreamingForQuestion(chosenQuestionIdForAnswerRootMessage(message.messageId)!)
                        "
                        :data-testid="`cand-next-${chosenQuestionIdForAnswerRootMessage(message.messageId)!}`"
                        @click="onCandidateShift(chosenQuestionIdForAnswerRootMessage(message.messageId)!, 1)"
                      >
                        &gt;
                      </button>
                    </div>
                  </template>
                  <div v-else-if="questionIdForMessage(message.messageId, message.role)" class="text-[11px] text-gray-400">
                    answer not selected for context
                  </div>
                </div>
              </div>
            </template>
          </ChatTranscript>
        </template>

        <template #side>
          <ChatAppReasoningPanel
            :messageId="lastAssistantMessageId"
            :reasoningView="lastAssistantReasoningView"
            :reasoningVersion="lastAssistantReasoningVersion"
            :panelState="lastAssistantPanelState"
            :isStreaming="lastAssistantIsStreaming"
            :reasoningPieces="lastAssistantReasoningPieces"
            @toggle-panel-state="onToggleReasoningPanelState"
          />
        </template>

        <template #composer>
          <ChatAppComposer
            v-model:draft="draft"
            v-model:model="model"
            v-model:requestedReasoningEffort="requestedReasoningEffort"
            v-model:requestedReasoningExclude="requestedReasoningExclude"
            :disabled="!isReady"
            :isRunning="isRunning"
            :modelCatalog="modelCatalogForPicker"
            :reasoningModelIndex="reasoningModelIndexForPicker"
            :showHiddenModelsInPickers="showHiddenModelsInPickers"
            :modelCatalogNotice="modelCatalogNotice"
            @toggleShowHiddenModelsInPickers="showHiddenModelsInPickers = !showHiddenModelsInPickers"
            @send="onSend"
            @abort="onAbort"
          />
        </template>
      </ChatLayout>

      <SettingsModal :open="settingsOpen" :disabled="!isReady" :isRunning="isRunning" @close="closeSettings">
        <SettingsPanel :disabled="!isReady" :isRunning="isRunning" />
      </SettingsModal>

      <div
        v-if="questionEditDialog"
        class="fixed inset-0 z-50 flex items-center justify-center bg-black/30 p-4"
        data-testid="question-edit-dialog"
        @keydown.esc="closeQuestionEdit"
      >
        <div class="w-full max-w-xl rounded-lg bg-white p-4 shadow-xl">
          <div class="text-sm font-semibold text-gray-900">Edit question</div>
          <div class="mt-2">
            <textarea
              class="h-28 w-full rounded border border-gray-200 px-3 py-2 text-sm text-gray-900 focus:outline-none focus:ring-2 focus:ring-blue-500"
              :value="questionEditDialog.draft"
              @input="questionEditDialog = { ...questionEditDialog, draft: ($event.target as HTMLTextAreaElement).value }"
            />
            <div class="mt-1 text-[11px] text-gray-500">
              New question creates a new question variant. Replace question hides the current question variant (branch-local) and is only allowed on the last question.
            </div>
          </div>
          <div class="mt-3 flex items-center justify-end gap-2">
            <button type="button" class="rounded border border-gray-200 bg-white px-3 py-1.5 text-sm text-gray-700 hover:bg-gray-50" @click="closeQuestionEdit">
              Cancel
            </button>
            <button
              type="button"
              class="rounded border border-gray-200 bg-white px-3 py-1.5 text-sm text-gray-700 hover:bg-gray-50 disabled:opacity-50"
              :disabled="isRunning || questionEditDialog.draft.trim().length === 0"
              data-testid="question-edit-new"
              @click="submitQuestionEdit('new')"
            >
              New question
            </button>
            <button
              type="button"
              class="rounded border border-amber-300 bg-amber-50 px-3 py-1.5 text-sm text-amber-900 hover:bg-amber-100 disabled:opacity-50"
              :disabled="
                isRunning ||
                questionEditDialog.draft.trim().length === 0 ||
                !canReplaceQuestionInUi(questionEditDialog.questionId)
              "
              data-testid="question-edit-replace"
              @click="submitQuestionEdit('replace')"
            >
              Replace question
            </button>
          </div>
        </div>
      </div>
    </div>
  </div>
</template>
