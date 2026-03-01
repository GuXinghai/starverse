import { computed, ref } from 'vue'
import { ReasoningDetailStreamMerger } from '@/next/state/reasoningDetailStreamMerger'

export type ActiveStream = Readonly<{
  abort: AbortController
  assistantMessageId: string
  assistantSeq: number
  pendingAppendText: { value: string }
  flushing: { value: boolean }
  flushTimer: { id: ReturnType<typeof setTimeout> | null }
  pendingReasoningDetails: { value: unknown[] }
  reasoningFlushTimer: { id: ReturnType<typeof setTimeout> | null }
  annotationsBuffer: { value: Record<string, unknown>[] | undefined }
  annotationsTouched: { value: boolean }
  reasoningMerger: ReasoningDetailStreamMerger
  diagnosticTracker: {
    events: Array<{ chunkNo: number; key: string; deltaLen: number; action: 'queued' | 'skipped'; reason?: string; offsetBefore?: number }>
    totalQueued: number
    totalSkipped: number
    totalDeltaLen: number
    chunkRanges: Array<{ chunkNo: number; start: number; end: number; key?: string; offsetBefore?: number }>
    textCursor: number
    dbInserted: number
    dbSkipped: number
    dbIgnored: number
    dbSumDeltaLenInserted: number
  }
}>

export function useLiveStreamController() {
  const activeStream = ref<ActiveStream | null>(null)

  const activeAssistantMessageId = computed(() => activeStream.value?.assistantMessageId ?? null)

  function createActiveStream(assistantMessageId: string, assistantSeq: number): ActiveStream {
    return {
      abort: new AbortController(),
      assistantMessageId,
      assistantSeq,
      pendingAppendText: { value: '' },
      flushing: { value: false },
      flushTimer: { id: null },
      pendingReasoningDetails: { value: [] },
      reasoningFlushTimer: { id: null },
      annotationsBuffer: { value: undefined },
      annotationsTouched: { value: false },
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
  }

  return {
    activeStream,
    activeAssistantMessageId,
    createActiveStream,
  }
}
