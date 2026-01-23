<script setup lang="ts">
import { computed, onMounted, ref } from 'vue'
import ChatLayout from '@/ui-kit/chat/ChatLayout.vue'
import ChatTranscript from '@/ui-kit/chat/ChatTranscript.vue'
import type { MessageVM } from '@/next/state/types'
import { createConvo, listConvos, type ConvoSummary } from '@/next/convo/convoClient'
import { listMessages } from '@/next/message/messageClient'
import ConversationList, { type ConversationListItem } from './components/ConversationList.vue'
import ChatAppComposer from './components/ChatAppComposer.vue'
import { applyEvent, createInitialState, startGeneration } from '@/next/state/reducer'
import { selectRun, selectTranscript } from '@/next/state/selectors'
import type { RootState } from '@/next/state/types'
import { streamOpenRouterChatAsEvents } from '@/next/live/openRouterLiveStream'
import { loadConversationContextMessages } from '@/next/context/loadConversationContext'
import type { NormalizedErrorEnvelope } from '@/next/errors/normalizeOpenRouterError'

const isReady = ref(false)
const loadError = ref<string | null>(null)
const convos = ref<ConvoSummary[]>([])
const activeConvoId = ref<string | null>(null)
const draft = ref('')

const state = ref<RootState>(createInitialState())
const messageSeqById = ref<Map<string, number>>(new Map())

const runId = computed(() => activeConvoId.value)

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

async function getOpenRouterApiKey(): Promise<string | null> {
  const envKey = String((import.meta as any).env?.VITE_OPENROUTER_API_KEY ?? '').trim()
  if (envKey) return envKey

  const store = (globalThis as any).electronStore as { get?: (key: string) => Promise<any> } | undefined
  if (store?.get) {
    const key = String((await store.get('openRouterApiKey')) ?? '').trim()
    if (key) return key
  }
  return null
}

async function getOpenRouterBaseUrl(): Promise<string | null> {
  const envUrl = String((import.meta as any).env?.VITE_OPENROUTER_BASE_URL ?? '').trim()
  if (envUrl) return envUrl

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

async function appendDelta(convoId: string, seq: number, appendBody: string) {
  const bridge = (globalThis as any).dbBridge as { invoke?: (method: string, params?: unknown) => Promise<any> } | undefined
  if (!bridge?.invoke) throw new Error('Missing dbBridge')
  if (!appendBody) return
  await bridge.invoke('message.appendDelta', { convoId, seq, appendBody })
}

async function flushPending(convoId: string, stream: ActiveStream) {
  if (stream.flushing.value) return
  const chunk = stream.pendingAppendText.value
  if (!chunk) return
  stream.flushing.value = true
  stream.pendingAppendText.value = ''
  try {
    await appendDelta(convoId, stream.assistantSeq, chunk)
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
  if (!activeConvoId.value && convos.value.length > 0) activeConvoId.value = convos.value[0].id
}

async function loadTranscriptForActiveConvo() {
  const convoId = activeConvoId.value
  if (!convoId) {
    state.value = createInitialState()
    messageSeqById.value = new Map()
    return
  }

  const rows = await listMessages(convoId, { direction: 'asc', limit: 500 })
  hydrateStateFromPersistedMessages(
    convoId,
    rows.map((m) => ({ id: m.id, role: m.role, seq: m.seq, body: m.body }))
  )
  const seqMap = new Map<string, number>()
  for (const m of rows) seqMap.set(m.id, m.seq)
  messageSeqById.value = seqMap
}

async function onSelectConvo(convoId: string) {
  if (isRunning.value) return
  activeConvoId.value = convoId
  await loadTranscriptForActiveConvo()
}

async function onCreateConvo() {
  if (isRunning.value) return
  const created = await createConvo({ title: `New chat ${new Date().toLocaleString()}` })
  await refreshConvos()
  if (created) activeConvoId.value = created.id
  await loadTranscriptForActiveConvo()
}

const convoListItems = computed<ConversationListItem[]>(() =>
  convos.value.map((c) => ({ id: c.id, title: c.title, updatedAt: c.updatedAt }))
)

const activeTitle = computed(() => convos.value.find((c) => c.id === activeConvoId.value)?.title ?? '')

async function ensureActiveConvo(): Promise<string> {
  if (activeConvoId.value) return activeConvoId.value
  const created = await createConvo({ title: `New chat ${new Date().toLocaleString()}` })
  await refreshConvos()
  if (!created?.id) throw new Error('Failed to create conversation')
  activeConvoId.value = created.id
  await loadTranscriptForActiveConvo()
  return created.id
}

async function onAbort() {
  const s = activeStream.value
  if (!s) return
  s.abort.abort('abort')
}

async function onSend() {
  if (isRunning.value) return
  const text = draft.value.trim()
  if (!text) return
  draft.value = ''

  const convoId = await ensureActiveConvo()
  loadError.value = null

  const apiKey = await getOpenRouterApiKey()
  if (!apiKey) {
    loadError.value = 'Missing OpenRouter API key (set electron-store openRouterApiKey or VITE_OPENROUTER_API_KEY)'
    return
  }

  const baseUrl = await getOpenRouterBaseUrl()
  const model = 'openrouter/auto'
  const contextMessages = await loadConversationContextMessages(convoId, { limit: 200 })

  const bridge = (globalThis as any).dbBridge as { invoke?: (method: string, params?: unknown) => Promise<any> } | undefined
  if (!bridge?.invoke) {
    loadError.value = 'Missing dbBridge'
    return
  }

  const userRecord = await bridge.invoke('message.append', { convoId, role: 'user', body: text })
  const assistantRecord = await bridge.invoke('message.append', { convoId, role: 'assistant', body: '' })

  const userMessageId = String(userRecord?.id ?? '').trim()
  const assistantMessageId = String(assistantRecord?.id ?? '').trim()
  const assistantSeq = Number(assistantRecord?.seq ?? NaN)
  if (!userMessageId || !assistantMessageId || !Number.isFinite(assistantSeq)) {
    loadError.value = 'DB did not return message ids/sequences'
    return
  }

  messageSeqById.value.set(userMessageId, Number(userRecord?.seq ?? NaN))
  messageSeqById.value.set(assistantMessageId, assistantSeq)

  const started = startGeneration(state.value, {
    runId: convoId,
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
      state.value = applyEvent(state.value, convoId, ev)

      if (ev.type === 'MessageDeltaText' && ev.messageId === assistantMessageId) {
        stream.pendingAppendText.value += ev.text
        scheduleFlush(convoId, stream)
      }
      if (ev.type === 'MessageAppendContentBlock' && ev.messageId === assistantMessageId && ev.block?.type === 'text') {
        stream.pendingAppendText.value += String((ev.block as any).text ?? '')
        scheduleFlush(convoId, stream)
      }

      if (ev.type === 'StreamDone' || ev.type === 'StreamAbort' || ev.type === 'StreamError') {
        clearFlushTimer(stream)
        await flushPending(convoId, stream)
      }
    }

    clearFlushTimer(stream)
    await flushPending(convoId, stream)
  } catch (err: any) {
    loadError.value = err?.message ? String(err.message) : String(err)
  } finally {
    clearFlushTimer(stream)
    if (activeStream.value === stream) activeStream.value = null
  }
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
    await refreshConvos()
    await loadTranscriptForActiveConvo()
  } catch (err: any) {
    loadError.value = err?.message ? String(err.message) : String(err)
  } finally {
    isReady.value = true
  }
})
</script>

<template>
  <div class="flex h-full">
    <ConversationList
      :items="convoListItems"
      :activeId="activeConvoId"
      :disabled="!isReady || isRunning"
      @select="onSelectConvo"
      @create="onCreateConvo"
      @refresh="refreshConvos"
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
            <div class="text-[11px] text-gray-500">Phase 3 (text-only)</div>
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
          <ChatTranscript :messages="transcript" :error="runVM?.error" emptyText="No messages in this conversation yet." />
        </template>

        <template #side>
          <div class="h-full p-4 text-sm text-gray-600">Right panel placeholder (reasoning/usage later)</div>
        </template>

        <template #composer>
          <ChatAppComposer v-model:draft="draft" :disabled="!isReady" :isRunning="isRunning" @send="onSend" @abort="onAbort" />
        </template>
      </ChatLayout>
    </div>
  </div>
</template>
