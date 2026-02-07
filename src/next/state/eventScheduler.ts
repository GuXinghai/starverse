/* eslint-disable max-lines-per-function, max-statements, complexity */
import type { DomainEvent } from './types'
import { buildDetailKey } from './reasoningDetailStreamMerger'
import {
  recordFrameSample,
  createPhaseTimer,
  isSchedDiagEnabled,
  type FrameSample,
} from './schedulerDiagnostics'

type DrainReason = 'raf' | 'flush' | 'visibility' | 'switch' | 'dispose' | 'manual'

type SchedulerConfig = {
  maxEventsPerFrame: number
  maxTextCharsPerFrame: number
  maxReasoningDetailsPerFrame: number
  frameBudgetMs: number
  maxBacklog: number
}

type CommitInfo = Readonly<{
  runId: string
  reason: DrainReason
  eventCount: number
  hadLayoutChange: boolean
}>

type QueueState = {
  pendingQueue: DomainEvent[]
  rafId: number | null
  draining: boolean
  needsAnotherDrain: boolean
}

type SchedulerOptions = Readonly<{
  commit: (runId: string, events: DomainEvent[], info: CommitInfo) => void
  onAfterCommit?: (info: CommitInfo) => void
  onEnqueue?: (event: DomainEvent) => void
  config?: Partial<SchedulerConfig>
}>

type Placeholder = Readonly<{ __placeholder: true; kind: 'text' | 'reasoning'; key: string }>

type TextAgg = {
  messageId: string
  choiceIndex: number
  text: string
}

type ReasoningAgg = {
  messageId: string
  choiceIndex: number
  details: unknown[]
}

const DEFAULT_CONFIG: SchedulerConfig = {
  maxEventsPerFrame: 120,
  maxTextCharsPerFrame: 4000,
  maxReasoningDetailsPerFrame: 120,
  frameBudgetMs: 6,
  maxBacklog: 1200,
}

function now(): number {
  if (typeof performance !== 'undefined' && typeof performance.now === 'function') {
    return performance.now()
  }
  return Date.now()
}

export function createEventScheduler(options: SchedulerOptions) {
  const queues = new Map<string, QueueState>()
  // Tombstone set for "dispose => do not accept further events for this runId".
  // Risk: if runId cardinality is unbounded in a long-lived session, this set can grow without bound.
  // Current lifecycle relies on upper-layer teardown (`disposeAll` on app unmount) to drop scheduler instance.
  // If this scheduler becomes long-lived across many ephemeral runIds, add explicit cleanup policy:
  // 1) lifecycle release hook when a run is fully finalized and should be reusable; or
  // 2) bounded LRU/TTL tombstones.
  const disposedRunIds = new Set<string>()
  const config: SchedulerConfig = { ...DEFAULT_CONFIG, ...(options.config ?? {}) }

  function ensureQueue(runId: string): QueueState {
    const id = String(runId ?? '').trim()
    if (!id) {
      return { pendingQueue: [], rafId: null, draining: false, needsAnotherDrain: false }
    }
    const existing = queues.get(id)
    if (existing) return existing
    const created: QueueState = { pendingQueue: [], rafId: null, draining: false, needsAnotherDrain: false }
    queues.set(id, created)
    return created
  }

  function cancelScheduled(queue: QueueState) {
    if (queue.rafId == null) return
    if (typeof cancelAnimationFrame === 'function') {
      cancelAnimationFrame(queue.rafId)
    } else {
      clearTimeout(queue.rafId)
    }
    queue.rafId = null
  }

  function scheduleDrain(runId: string, queue: QueueState) {
    if (queue.rafId != null) return
    const schedule = () => {
      queue.rafId = null
      drainOnce(runId, queue, 'raf')
    }

    if (typeof document !== 'undefined' && document.hidden) {
      queue.rafId = setTimeout(schedule, 16) as unknown as number
      return
    }

    if (typeof requestAnimationFrame === 'function') {
      queue.rafId = requestAnimationFrame(schedule)
    } else {
      queue.rafId = setTimeout(schedule, 16) as unknown as number
    }
  }

  function takePrefix(queue: QueueState): DomainEvent[] {
    const pending = queue.pendingQueue
    if (pending.length === 0) return []

    const backlogMultiplier = pending.length > config.maxBacklog ? 4 : 1
    const maxEvents = config.maxEventsPerFrame * backlogMultiplier
    const maxTextChars = config.maxTextCharsPerFrame * backlogMultiplier
    const maxReasoning = config.maxReasoningDetailsPerFrame * backlogMultiplier

    const startedAt = now()
    let count = 0
    let textChars = 0
    let reasoningCount = 0

    for (const ev of pending) {
      if (count >= maxEvents) break
      if (config.frameBudgetMs > 0 && now() - startedAt > config.frameBudgetMs) break

      if (ev.type === 'MessageDeltaText') {
        textChars += typeof ev.text === 'string' ? ev.text.length : 0
      }
      if (ev.type === 'MessageAppendContentBlock' && ev.block?.type === 'text') {
        textChars += typeof ev.block.text === 'string' ? ev.block.text.length : 0
      }
      if (ev.type === 'MessageDeltaReasoningDetail') {
        reasoningCount += 1
      }

      if (textChars > maxTextChars || reasoningCount > maxReasoning) break
      count += 1
    }

    if (count <= 0) count = 1
    return pending.splice(0, count)
  }

  function buildBatch(events: DomainEvent[]): { batch: DomainEvent[]; hadLayoutChange: boolean } {
    const tokens: Array<DomainEvent | Placeholder> = []
    const textAgg = new Map<string, TextAgg>()
    const reasoningAgg = new Map<string, ReasoningAgg>()
    const textSegmentIndex = new Map<string, number>()
    const reasoningSegmentIndex = new Map<string, number>()

    let lastTextKey: string | null = null
    let lastTextMessageId: string | null = null
    let lastReasoningKey: string | null = null

    let hadLayoutChange = false

    for (const ev of events) {
      const isTextEvent =
        (ev.type === 'MessageDeltaText' && typeof ev.text === 'string' && ev.text.length > 0) ||
        (ev.type === 'MessageAppendContentBlock' && ev.block?.type === 'text' && ev.block.text.length > 0)
      const isReasoningEvent = ev.type === 'MessageDeltaReasoningDetail'

      if (!isTextEvent) {
        lastTextKey = null
        lastTextMessageId = null
      }
      if (!isReasoningEvent) {
        lastReasoningKey = null
      }

      if (isTextEvent) {
        const messageId = ev.messageId
        const baseKey = `text:${messageId}`
        let aggKey: string
        if (lastTextKey && lastTextMessageId === messageId) {
          aggKey = lastTextKey
        } else {
          const nextIdx = (textSegmentIndex.get(baseKey) ?? 0) + 1
          textSegmentIndex.set(baseKey, nextIdx)
          aggKey = `${baseKey}:${nextIdx}`
          tokens.push({ __placeholder: true, kind: 'text', key: aggKey })
          lastTextKey = aggKey
          lastTextMessageId = messageId
        }

        const existing = textAgg.get(aggKey) ?? {
          messageId,
          choiceIndex: ev.choiceIndex,
          text: '',
        }

        const appendText =
          ev.type === 'MessageDeltaText'
            ? ev.text
            : (ev.block as { type: 'text'; text: string }).text
        existing.text += appendText
        textAgg.set(aggKey, existing)
        hadLayoutChange = true
        continue
      }

      if (isReasoningEvent) {
        const detailKey = buildDetailKey(ev.detail as any)
        const baseKey = `reasoning:${ev.messageId}:${detailKey}`
        let aggKey: string

        if (lastReasoningKey && lastReasoningKey.startsWith(baseKey)) {
          aggKey = lastReasoningKey
        } else {
          const nextIdx = (reasoningSegmentIndex.get(baseKey) ?? 0) + 1
          reasoningSegmentIndex.set(baseKey, nextIdx)
          aggKey = `${baseKey}:${nextIdx}`
          tokens.push({ __placeholder: true, kind: 'reasoning', key: aggKey })
          lastReasoningKey = aggKey
        }

        const existing = reasoningAgg.get(aggKey) ?? {
          messageId: ev.messageId,
          choiceIndex: ev.choiceIndex,
          details: [],
        }
        existing.details.push(ev.detail)
        reasoningAgg.set(aggKey, existing)
        continue
      }

      tokens.push(ev)
      if (ev.type === 'MessageAppendContentBlock' && ev.block?.type !== 'text') {
        hadLayoutChange = true
      }
    }

    const batch: DomainEvent[] = tokens.map((token) => {
      if (!('__placeholder' in token)) return token
      if (token.kind === 'text') {
        const agg = textAgg.get(token.key)
        if (!agg || agg.text.length === 0) {
          return { type: 'StreamComment', text: '' }
        }
        return { type: 'MessageDeltaText', messageId: agg.messageId, choiceIndex: agg.choiceIndex, text: agg.text }
      }
      const agg = reasoningAgg.get(token.key)
      if (!agg || agg.details.length === 0) {
        return { type: 'StreamComment', text: '' }
      }
      return {
        type: 'MessageDeltaReasoningDetailBatch',
        messageId: agg.messageId,
        choiceIndex: agg.choiceIndex,
        details: agg.details,
      }
    })

    const filtered = batch.filter((ev) => !(ev.type === 'StreamComment' && ev.text === ''))
    return { batch: filtered, hadLayoutChange }
  }

  function drainOnce(runId: string, queue: QueueState, reason: DrainReason) {
    if (queue.draining) {
      queue.needsAnotherDrain = true
      return
    }

    queue.draining = true
    const phaseTimer = createPhaseTimer()
    const queueLenBefore = queue.pendingQueue.length

    try {
      phaseTimer?.mark('dequeueMs')
      const slice = takePrefix(queue)
      if (slice.length === 0) return

      phaseTimer?.mark('mergeMs')
      const { batch, hadLayoutChange } = buildBatch(slice)
      if (batch.length === 0) return

      const info: CommitInfo = {
        runId,
        reason,
        eventCount: batch.length,
        hadLayoutChange,
      }

      phaseTimer?.mark('applyMs')
      options.commit(runId, batch, info)

      phaseTimer?.mark('commitMs')
      options.onAfterCommit?.(info)

      // 记录诊断数据
      if (phaseTimer && isSchedDiagEnabled()) {
        const phaseMs = phaseTimer.getPhaseMs()
        const flushTotalMs = phaseMs.dequeueMs + phaseMs.mergeMs + phaseMs.applyMs + phaseMs.deriveMs + phaseMs.commitMs + phaseMs.miscMs

        // 统计事件类型
        const taskTypeCounts: Record<string, number> = {}
        const taskTypeMaxMs: Record<string, number> = {}
        for (const ev of batch) {
          const type = ev.type
          taskTypeCounts[type] = (taskTypeCounts[type] ?? 0) + 1
          // 单事件耗时估算（平均分配）
          const avgMs = flushTotalMs / batch.length
          taskTypeMaxMs[type] = Math.max(taskTypeMaxMs[type] ?? 0, avgMs)
        }

        const sample: FrameSample = {
          frameTs: now(),
          flushTotalMs,
          queueLenBefore,
          queueLenAfter: queue.pendingQueue.length,
          processedTaskCount: slice.length,
          processedEventCount: batch.length,
          budgetMs: config.frameBudgetMs,
          overBudget: flushTotalMs > config.frameBudgetMs,
          phaseMs,
          taskTypeCounts,
          taskTypeMaxMs,
        }
        recordFrameSample(sample)
      }
    } finally {
      queue.draining = false
      if (queue.needsAnotherDrain) {
        queue.needsAnotherDrain = false
        scheduleDrain(runId, queue)
      } else if (queue.pendingQueue.length > 0 && reason === 'raf') {
        scheduleDrain(runId, queue)
      }
    }
  }

  function drainAll(runId: string, reason: DrainReason) {
    const queue = ensureQueue(runId)
    if (queue.pendingQueue.length === 0) return
    cancelScheduled(queue)

    while (queue.pendingQueue.length > 0) {
      const slice = queue.pendingQueue.splice(0, queue.pendingQueue.length)
      const { batch, hadLayoutChange } = buildBatch(slice)
      if (batch.length === 0) continue
      const info: CommitInfo = {
        runId,
        reason,
        eventCount: batch.length,
        hadLayoutChange,
      }
      options.commit(runId, batch, info)
      options.onAfterCommit?.(info)
    }
  }

  return {
    enqueue(runId: string, event: DomainEvent) {
      const id = String(runId ?? '').trim()
      if (!id) return
      if (disposedRunIds.has(id)) return
      const queue = ensureQueue(id)
      queue.pendingQueue.push(event)
      options.onEnqueue?.(event)
      scheduleDrain(id, queue)
    },
    flushNow(runId: string, reason: DrainReason = 'flush') {
      const id = String(runId ?? '').trim()
      if (!id) return
      drainAll(id, reason)
    },
    flushAll(reason: DrainReason = 'flush') {
      for (const runId of queues.keys()) {
        drainAll(runId, reason)
      }
    },
    dispose(runId: string) {
      const id = String(runId ?? '').trim()
      if (!id) return
      disposedRunIds.add(id)
      const queue = queues.get(id)
      if (!queue) return
      drainAll(id, 'dispose')
      cancelScheduled(queue)
      queues.delete(id)
    },
    disposeAll() {
      for (const runId of queues.keys()) {
        this.dispose(runId)
      }
    },
    setBudget(ms: number) {
      if (!Number.isFinite(ms) || ms <= 0) return
      config.frameBudgetMs = ms
    },
    setMaxBacklog(maxBacklog: number) {
      if (!Number.isFinite(maxBacklog) || maxBacklog <= 0) return
      config.maxBacklog = maxBacklog
    },
    getPendingCount(runId: string) {
      const id = String(runId ?? '').trim()
      if (!id) return 0
      const queue = queues.get(id)
      return queue?.pendingQueue.length ?? 0
    },
  }
}
