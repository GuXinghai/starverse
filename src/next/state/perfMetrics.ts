import { getDiagnosticsFlags } from '@/shared/diagnostics/flags'

type PerfWindowSnapshot = Readonly<{
  windowMs: number
  commitCount: number
  deriveCount: number
  deltaCount: number
  bubbleUpdateCount: number
  bubbleUpdateUnique: number
  bubbleUpdateTotalPerSec: number
  bubbleUpdateUniquePerSec: number
  updatedMessageTotal: number
  updatedMessageAvg: number
  commitPerSec: number
  derivePerSec: number
  deltaPerSec: number
  commitAvgMs?: number
  deriveAvgMs?: number
  // Phase 3 新增指标
  fallbackReplayCount: number
  fallbackReplayPerSec: number
  mergeOpsCount: number
  mergeOpsPerSec: number
  mergeDurationTotalMs: number
  mergeDurationAvgMs?: number
}>

type PerfReporterOptions = Readonly<{
  intervalMs?: number
  enabled?: boolean
  logger?: (snapshot: PerfWindowSnapshot) => void
}>

type PerfState = {
  windowStart: number
  commitCount: number
  deriveCount: number
  deltaCount: number
  bubbleUpdateCount: number
  bubbleUpdateIds: Set<string>
  updatedMessageTotal: number
  commitDurationTotalMs: number
  commitDurationSamples: number
  deriveDurationTotalMs: number
  deriveDurationSamples: number
  commitSampleCursor: number
  deriveSampleCursor: number
  // Phase 3 新增状态
  fallbackReplayCount: number
  mergeOpsCount: number
  mergeDurationTotalMs: number
  mergeDurationSamples: number
}

const state: PerfState = {
  windowStart: now(),
  commitCount: 0,
  deriveCount: 0,
  deltaCount: 0,
  bubbleUpdateCount: 0,
  bubbleUpdateIds: new Set(),
  updatedMessageTotal: 0,
  commitDurationTotalMs: 0,
  commitDurationSamples: 0,
  deriveDurationTotalMs: 0,
  deriveDurationSamples: 0,
  commitSampleCursor: 0,
  deriveSampleCursor: 0,
  // Phase 3 新增状态初始化
  fallbackReplayCount: 0,
  mergeOpsCount: 0,
  mergeDurationTotalMs: 0,
  mergeDurationSamples: 0,
}

const DEFAULT_SAMPLE_EVERY = 60

let perfEnabled: boolean | null = null

function now(): number {
  if (typeof performance !== 'undefined' && typeof performance.now === 'function') {
    return performance.now()
  }
  return Date.now()
}

function shouldSampleCommit(sampleEvery = DEFAULT_SAMPLE_EVERY): boolean {
  state.commitSampleCursor += 1
  return state.commitSampleCursor % sampleEvery === 0
}

function shouldSampleDerive(sampleEvery = DEFAULT_SAMPLE_EVERY): boolean {
  state.deriveSampleCursor += 1
  return state.deriveSampleCursor % sampleEvery === 0
}

export function beginCommitMeasure(sampleEvery = DEFAULT_SAMPLE_EVERY): string | null {
  if (!isPerfMetricsEnabled()) return null
  if (typeof performance === 'undefined' || typeof performance.mark !== 'function') return null
  if (!shouldSampleCommit(sampleEvery)) return null
  const id = `sv-commit-${Date.now()}-${Math.random().toString(16).slice(2)}`
  performance.mark(`${id}-start`)
  return id
}

export function endCommitMeasure(id: string | null): number | undefined {
  if (!id || typeof performance === 'undefined' || typeof performance.measure !== 'function') return undefined
  const start = `${id}-start`
  const end = `${id}-end`
  performance.mark(end)
  const measure = performance.measure(id, start, end)
  if (typeof performance.clearMarks === 'function') {
    performance.clearMarks(start)
    performance.clearMarks(end)
  }
  if (typeof performance.clearMeasures === 'function') {
    performance.clearMeasures(id)
  }
  return measure?.duration
}

export function beginDeriveMeasure(sampleEvery = DEFAULT_SAMPLE_EVERY): string | null {
  if (!isPerfMetricsEnabled()) return null
  if (typeof performance === 'undefined' || typeof performance.mark !== 'function') return null
  if (!shouldSampleDerive(sampleEvery)) return null
  const id = `sv-derive-${Date.now()}-${Math.random().toString(16).slice(2)}`
  performance.mark(`${id}-start`)
  return id
}

export function endDeriveMeasure(id: string | null): number | undefined {
  if (!id || typeof performance === 'undefined' || typeof performance.measure !== 'function') return undefined
  const start = `${id}-start`
  const end = `${id}-end`
  performance.mark(end)
  const measure = performance.measure(id, start, end)
  if (typeof performance.clearMarks === 'function') {
    performance.clearMarks(start)
    performance.clearMarks(end)
  }
  if (typeof performance.clearMeasures === 'function') {
    performance.clearMeasures(id)
  }
  return measure?.duration
}

export function recordCommit(durationMs?: number): void {
  if (!isPerfMetricsEnabled()) return
  state.commitCount += 1
  if (typeof durationMs === 'number' && Number.isFinite(durationMs)) {
    state.commitDurationTotalMs += durationMs
    state.commitDurationSamples += 1
  }
}

export function recordDerive(durationMs?: number): void {
  if (!isPerfMetricsEnabled()) return
  state.deriveCount += 1
  if (typeof durationMs === 'number' && Number.isFinite(durationMs)) {
    state.deriveDurationTotalMs += durationMs
    state.deriveDurationSamples += 1
  }
}

export function recordDelta(count = 1): void {
  if (!isPerfMetricsEnabled()) return
  if (!Number.isFinite(count) || count <= 0) return
  state.deltaCount += count
}

export function recordBubbleUpdate(messageId?: string): void {
  if (!isPerfMetricsEnabled()) return
  state.bubbleUpdateCount += 1
  const key = typeof messageId === 'string' && messageId.length > 0 ? messageId : '__unknown__'
  state.bubbleUpdateIds.add(key)
}

export function recordUpdatedMessages(count: number): void {
  if (!isPerfMetricsEnabled()) return
  if (!Number.isFinite(count) || count < 0) return
  state.updatedMessageTotal += count
}

export function isPerfMetricsEnabled(): boolean {
  if (perfEnabled !== null) return perfEnabled
  perfEnabled = getDiagnosticsFlags().perf
  return perfEnabled
}

export function snapshotAndReset(): PerfWindowSnapshot {
  const elapsedMs = Math.max(1, now() - state.windowStart)
  const commitPerSec = state.commitCount / (elapsedMs / 1000)
  const derivePerSec = state.deriveCount / (elapsedMs / 1000)
  const deltaPerSec = state.deltaCount / (elapsedMs / 1000)
  const commitAvgMs = state.commitDurationSamples > 0 ? state.commitDurationTotalMs / state.commitDurationSamples : undefined
  const deriveAvgMs = state.deriveDurationSamples > 0 ? state.deriveDurationTotalMs / state.deriveDurationSamples : undefined

  const updatedMessageAvg = state.commitCount > 0 ? state.updatedMessageTotal / state.commitCount : 0
  const fallbackReplayPerSec = state.fallbackReplayCount / (elapsedMs / 1000)
  const mergeOpsPerSec = state.mergeOpsCount / (elapsedMs / 1000)
  const mergeDurationAvgMs = state.mergeDurationSamples > 0 ? state.mergeDurationTotalMs / state.mergeDurationSamples : undefined
  const bubbleUpdateUnique = state.bubbleUpdateIds.size
  const bubbleUpdateTotalPerSec = state.bubbleUpdateCount / (elapsedMs / 1000)
  const bubbleUpdateUniquePerSec = bubbleUpdateUnique / (elapsedMs / 1000)
  
  const snapshot: PerfWindowSnapshot = {
    windowMs: elapsedMs,
    commitCount: state.commitCount,
    deriveCount: state.deriveCount,
    deltaCount: state.deltaCount,
    bubbleUpdateCount: state.bubbleUpdateCount,
    bubbleUpdateUnique,
    bubbleUpdateTotalPerSec,
    bubbleUpdateUniquePerSec,
    updatedMessageTotal: state.updatedMessageTotal,
    updatedMessageAvg,
    commitPerSec,
    derivePerSec,
    deltaPerSec,
    fallbackReplayCount: state.fallbackReplayCount,
    fallbackReplayPerSec,
    mergeOpsCount: state.mergeOpsCount,
    mergeOpsPerSec,
    mergeDurationTotalMs: state.mergeDurationTotalMs,
    ...(commitAvgMs !== undefined ? { commitAvgMs } : {}),
    ...(deriveAvgMs !== undefined ? { deriveAvgMs } : {}),
    ...(mergeDurationAvgMs !== undefined ? { mergeDurationAvgMs } : {}),
  }

  state.windowStart = now()
  state.commitCount = 0
  state.deriveCount = 0
  state.deltaCount = 0
  state.commitDurationTotalMs = 0
  state.commitDurationSamples = 0
  state.deriveDurationTotalMs = 0
  state.deriveDurationSamples = 0
  state.bubbleUpdateCount = 0
  state.bubbleUpdateIds.clear()
  state.updatedMessageTotal = 0
  // Phase 3 重置新增状态
  state.fallbackReplayCount = 0
  state.mergeOpsCount = 0
  state.mergeDurationTotalMs = 0
  state.mergeDurationSamples = 0

  return snapshot
}

// Phase 3 新增性能监控函数
export function recordFallbackReplay(): void {
  if (!isPerfMetricsEnabled()) return
  state.fallbackReplayCount += 1
}

export function recordMergeOp(durationMs: number): void {
  if (!isPerfMetricsEnabled()) return
  state.mergeOpsCount += 1
  state.mergeDurationTotalMs += durationMs
  state.mergeDurationSamples += 1
}

export function startPerfReporter(options: PerfReporterOptions = {}): () => void {
  const enabled = options.enabled ?? isPerfMetricsEnabled()
  if (!enabled) return () => {}
  const intervalMs = options.intervalMs ?? 1000
  const logger = options.logger ?? (() => {})

  const handle = setInterval(() => {
    logger(snapshotAndReset())
  }, intervalMs)

  return () => clearInterval(handle)
}
