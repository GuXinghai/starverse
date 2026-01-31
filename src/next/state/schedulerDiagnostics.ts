/**
 * Scheduler Diagnostics (Phase 3 rAF Timeout Locator)
 *
 * 目标：定位 rAF flush 中的性能退化来源
 * - 默认关闭，通过 localStorage.sv_diag_sched=1 开启
 * - 1Hz 聚合快照输出 + 超阈值 warn
 * - 可归因到：backlog 堆积 vs 单任务退化；apply/derive/merge/commit 阶段
 *
 * @see docs/guides/SCHEDULER_DIAGNOSTICS.md
 */

// ============================================================================
// Types
// ============================================================================

export type PhaseMs = Readonly<{
  dequeueMs: number
  mergeMs: number
  applyMs: number
  deriveMs: number
  commitMs: number
  miscMs: number
}>

export type FrameSample = Readonly<{
  frameTs: number
  flushTotalMs: number
  queueLenBefore: number
  queueLenAfter: number
  processedTaskCount: number
  processedEventCount: number
  budgetMs: number
  overBudget: boolean
  phaseMs: PhaseMs
  taskTypeCounts: Record<string, number>
  taskTypeMaxMs: Record<string, number>
}>

export type ReducerSample = Readonly<{
  applyMs: number
  deltaTextLen: number
  detailsCount: number
  reasoningPiecesLen: number
  reasoningTotalChars: number
}>

export type SelectorSample = Readonly<{
  deriveMs: number
  fallbackReplay: boolean
}>

export type MergerSample = Readonly<{
  opMs: number
  rawDetailsCount: number
  incomingTextLen: number
  mergedTextLen: number
}>

export type AggregatedSnapshot = Readonly<{
  windowMs: number
  frames: number
  overBudgetFrames: number
  worstFrameMs: number
  queueLenMax: number
  queueLenP95: number | null
  processedTaskCountPerSec: number
  processedEventCountPerSec: number
  phaseMsPerSec: PhaseMs
  reducer: {
    reasoningApplyCountPerSec: number
    reasoningApplyAvgMs: number | null
    reasoningApplyMaxMs: number
  }
  selectors: {
    deriveCountPerSec: number
    deriveAvgMs: number | null
    deriveMaxMs: number
    fallbackReplayCountPerSec: number
    fallbackReplayTotalMs: number
  }
  merger: {
    opsPerSec: number
    avgMs: number | null
    maxMs: number
  }
  topTaskTypes: Array<{ type: string; count: number; maxMs: number }>
  diagnosisHint: string | null
}>

// ============================================================================
// State & Config
// ============================================================================

const WARN_THRESHOLD_MS = 50
const TOP_TASK_TYPES_COUNT = 3
const QUEUE_LEN_SAMPLES_MAX = 120 // ~2 分钟的帧数据

let enabled = false
let initialized = false
let tickerHandle: ReturnType<typeof setInterval> | null = null

// Per-second accumulators
let windowStart = 0
let frameCount = 0
let overBudgetFrameCount = 0
let worstFrameMs = 0
let queueLenSamples: number[] = []
let processedTaskCount = 0
let processedEventCount = 0

const phaseMsAcc: { dequeueMs: number; mergeMs: number; applyMs: number; deriveMs: number; commitMs: number; miscMs: number } = {
  dequeueMs: 0,
  mergeMs: 0,
  applyMs: 0,
  deriveMs: 0,
  commitMs: 0,
  miscMs: 0,
}

// Reducer reasoning accumulators
let reducerReasoningApplyCount = 0
let reducerReasoningApplyTotalMs = 0
let reducerReasoningApplyMaxMs = 0

// Selectors accumulators
let selectorsDeriveCount = 0
let selectorsDeriveTotalMs = 0
let selectorsDeriveMaxMs = 0
let selectorsFallbackReplayCount = 0
let selectorsFallbackReplayTotalMs = 0

// Merger accumulators
let mergerOpsCount = 0
let mergerOpsTotalMs = 0
let mergerOpsMaxMs = 0

// Task type tracking (fixed-size map)
const taskTypeCounts = new Map<string, number>()
const taskTypeMaxMs = new Map<string, number>()

// ============================================================================
// Utility
// ============================================================================

function now(): number {
  if (typeof performance !== 'undefined' && typeof performance.now === 'function') {
    return performance.now()
  }
  return Date.now()
}

function resetAccumulators(): void {
  windowStart = now()
  frameCount = 0
  overBudgetFrameCount = 0
  worstFrameMs = 0
  queueLenSamples = []
  processedTaskCount = 0
  processedEventCount = 0
  phaseMsAcc.dequeueMs = 0
  phaseMsAcc.mergeMs = 0
  phaseMsAcc.applyMs = 0
  phaseMsAcc.deriveMs = 0
  phaseMsAcc.commitMs = 0
  phaseMsAcc.miscMs = 0
  reducerReasoningApplyCount = 0
  reducerReasoningApplyTotalMs = 0
  reducerReasoningApplyMaxMs = 0
  selectorsDeriveCount = 0
  selectorsDeriveTotalMs = 0
  selectorsDeriveMaxMs = 0
  selectorsFallbackReplayCount = 0
  selectorsFallbackReplayTotalMs = 0
  mergerOpsCount = 0
  mergerOpsTotalMs = 0
  mergerOpsMaxMs = 0
  taskTypeCounts.clear()
  taskTypeMaxMs.clear()
}

function computeP95(samples: number[]): number | null {
  if (samples.length === 0) return null
  const sorted = [...samples].sort((a, b) => a - b)
  const idx = Math.floor(sorted.length * 0.95)
  return sorted[Math.min(idx, sorted.length - 1)]
}

function getTopTaskTypes(): Array<{ type: string; count: number; maxMs: number }> {
  const entries = [...taskTypeCounts.entries()]
    .sort((a, b) => b[1] - a[1])
    .slice(0, TOP_TASK_TYPES_COUNT)
  return entries.map(([type, count]) => ({
    type,
    count,
    maxMs: taskTypeMaxMs.get(type) ?? 0,
  }))
}

function computeDiagnosisHint(snapshot: AggregatedSnapshot): string | null {
  const { queueLenMax, worstFrameMs, reducer, selectors, merger, phaseMsPerSec } = snapshot

  // 检测 backlog 堆积
  if (queueLenMax > 100 && reducer.reasoningApplyMaxMs < 10 && selectors.deriveMaxMs < 10) {
    return 'backlog explosion: 任务产生速度 > 消费速度（需限流/合并/降频）'
  }

  // 检测单任务退化
  if (worstFrameMs > 50) {
    if (merger.maxMs > 20) {
      return `single-task regression: merger heavy (maxMs=${merger.maxMs.toFixed(1)})`
    }
    if (selectors.deriveMaxMs > 20) {
      return `single-task regression: selectors derive heavy (maxMs=${selectors.deriveMaxMs.toFixed(1)})`
    }
    if (reducer.reasoningApplyMaxMs > 20) {
      return `single-task regression: reducer reasoning apply heavy (maxMs=${reducer.reasoningApplyMaxMs.toFixed(1)})`
    }
  }

  // 检测 derive 占比过高
  const totalPhaseMs = phaseMsPerSec.dequeueMs + phaseMsPerSec.mergeMs + phaseMsPerSec.applyMs + phaseMsPerSec.deriveMs + phaseMsPerSec.commitMs
  if (totalPhaseMs > 0 && phaseMsPerSec.deriveMs / totalPhaseMs > 0.6) {
    return 'derive heavy: selectors 派生退化或回退重放'
  }

  // 检测 merge 占比过高
  if (totalPhaseMs > 0 && phaseMsPerSec.mergeMs / totalPhaseMs > 0.4) {
    return 'merger heavy: suffix-delta/合并退化'
  }

  // 检测 fallback replay 频繁
  if (selectors.fallbackReplayCountPerSec > 10) {
    return `fallback replay heavy: ${selectors.fallbackReplayCountPerSec.toFixed(1)}/s（应走 pieces 路径）`
  }

  return null
}

function buildSnapshot(): AggregatedSnapshot {
  const windowMs = now() - windowStart

  const snapshot: AggregatedSnapshot = {
    windowMs,
    frames: frameCount,
    overBudgetFrames: overBudgetFrameCount,
    worstFrameMs,
    queueLenMax: queueLenSamples.length > 0 ? Math.max(...queueLenSamples) : 0,
    queueLenP95: computeP95(queueLenSamples),
    processedTaskCountPerSec: processedTaskCount,
    processedEventCountPerSec: processedEventCount,
    phaseMsPerSec: { ...phaseMsAcc },
    reducer: {
      reasoningApplyCountPerSec: reducerReasoningApplyCount,
      reasoningApplyAvgMs: reducerReasoningApplyCount > 0 ? reducerReasoningApplyTotalMs / reducerReasoningApplyCount : null,
      reasoningApplyMaxMs: reducerReasoningApplyMaxMs,
    },
    selectors: {
      deriveCountPerSec: selectorsDeriveCount,
      deriveAvgMs: selectorsDeriveCount > 0 ? selectorsDeriveTotalMs / selectorsDeriveCount : null,
      deriveMaxMs: selectorsDeriveMaxMs,
      fallbackReplayCountPerSec: selectorsFallbackReplayCount,
      fallbackReplayTotalMs: selectorsFallbackReplayTotalMs,
    },
    merger: {
      opsPerSec: mergerOpsCount,
      avgMs: mergerOpsCount > 0 ? mergerOpsTotalMs / mergerOpsCount : null,
      maxMs: mergerOpsMaxMs,
    },
    topTaskTypes: getTopTaskTypes(),
    diagnosisHint: null,
  }

  // 计算诊断提示
  ;(snapshot as any).diagnosisHint = computeDiagnosisHint(snapshot)

  return snapshot
}

function tick(): void {
  if (!enabled) return

  const snapshot = buildSnapshot()

  // 1Hz 聚合输出
  const compactSnapshot = {
    windowMs: Math.round(snapshot.windowMs),
    frames: snapshot.frames,
    overBudget: snapshot.overBudgetFrames,
    worstMs: Number(snapshot.worstFrameMs.toFixed(1)),
    qMax: snapshot.queueLenMax,
    tasks: snapshot.processedTaskCountPerSec,
    events: snapshot.processedEventCountPerSec,
    phase: {
      deq: Number(snapshot.phaseMsPerSec.dequeueMs.toFixed(1)),
      mrg: Number(snapshot.phaseMsPerSec.mergeMs.toFixed(1)),
      app: Number(snapshot.phaseMsPerSec.applyMs.toFixed(1)),
      der: Number(snapshot.phaseMsPerSec.deriveMs.toFixed(1)),
      cmt: Number(snapshot.phaseMsPerSec.commitMs.toFixed(1)),
    },
    reducer: {
      cnt: snapshot.reducer.reasoningApplyCountPerSec,
      avg: snapshot.reducer.reasoningApplyAvgMs !== null ? Number(snapshot.reducer.reasoningApplyAvgMs.toFixed(2)) : null,
      max: Number(snapshot.reducer.reasoningApplyMaxMs.toFixed(1)),
    },
    selectors: {
      cnt: snapshot.selectors.deriveCountPerSec,
      avg: snapshot.selectors.deriveAvgMs !== null ? Number(snapshot.selectors.deriveAvgMs.toFixed(2)) : null,
      max: Number(snapshot.selectors.deriveMaxMs.toFixed(1)),
      fbCnt: snapshot.selectors.fallbackReplayCountPerSec,
    },
    merger: {
      cnt: snapshot.merger.opsPerSec,
      avg: snapshot.merger.avgMs !== null ? Number(snapshot.merger.avgMs.toFixed(2)) : null,
      max: Number(snapshot.merger.maxMs.toFixed(1)),
    },
    top: snapshot.topTaskTypes.map(t => `${t.type}:${t.count}/${t.maxMs.toFixed(0)}ms`).join(', '),
    hint: snapshot.diagnosisHint,
  }

  console.log('[sched-diag]', compactSnapshot)

  resetAccumulators()
}

function printFrameWarn(sample: FrameSample): void {
  const phasesAboveThreshold = Object.entries(sample.phaseMs)
    .filter(([, ms]) => ms > 5)
    .map(([name, ms]) => `${name}=${ms.toFixed(1)}`)
    .join(', ')

  const topTypes = Object.entries(sample.taskTypeCounts)
    .sort((a, b) => b[1] - a[1])
    .slice(0, 3)
    .map(([type, count]) => `${type}:${count}/${(sample.taskTypeMaxMs[type] ?? 0).toFixed(0)}ms`)
    .join(', ')

  console.warn('[sched-diag][warn]', {
    flushMs: Number(sample.flushTotalMs.toFixed(1)),
    qBefore: sample.queueLenBefore,
    qAfter: sample.queueLenAfter,
    tasks: sample.processedTaskCount,
    phases: phasesAboveThreshold || 'none>5ms',
    top: topTypes || 'none',
  })
}

// ============================================================================
// Public Recording API (called from hot paths)
// ============================================================================

/**
 * 记录一帧的诊断数据
 * 仅当 diag 启用时才执行实际逻辑
 */
export function recordFrameSample(sample: FrameSample): void {
  if (!enabled) return

  frameCount++
  if (sample.overBudget) overBudgetFrameCount++
  if (sample.flushTotalMs > worstFrameMs) worstFrameMs = sample.flushTotalMs

  // 队列长度采样（限制数组大小）
  if (queueLenSamples.length < QUEUE_LEN_SAMPLES_MAX) {
    queueLenSamples.push(sample.queueLenBefore)
  }

  processedTaskCount += sample.processedTaskCount
  processedEventCount += sample.processedEventCount

  phaseMsAcc.dequeueMs += sample.phaseMs.dequeueMs
  phaseMsAcc.mergeMs += sample.phaseMs.mergeMs
  phaseMsAcc.applyMs += sample.phaseMs.applyMs
  phaseMsAcc.deriveMs += sample.phaseMs.deriveMs
  phaseMsAcc.commitMs += sample.phaseMs.commitMs
  phaseMsAcc.miscMs += sample.phaseMs.miscMs

  // 合并 task type 统计
  for (const [type, count] of Object.entries(sample.taskTypeCounts)) {
    taskTypeCounts.set(type, (taskTypeCounts.get(type) ?? 0) + count)
  }
  for (const [type, maxMs] of Object.entries(sample.taskTypeMaxMs)) {
    const prev = taskTypeMaxMs.get(type) ?? 0
    if (maxMs > prev) taskTypeMaxMs.set(type, maxMs)
  }

  // 超阈值 warn
  if (sample.flushTotalMs > WARN_THRESHOLD_MS) {
    printFrameWarn(sample)
  }
}

/**
 * 记录 reducer reasoning 处理耗时
 */
export function recordReducerReasoning(sample: ReducerSample): void {
  if (!enabled) return

  reducerReasoningApplyCount++
  reducerReasoningApplyTotalMs += sample.applyMs
  if (sample.applyMs > reducerReasoningApplyMaxMs) {
    reducerReasoningApplyMaxMs = sample.applyMs
  }
}

/**
 * 记录 selectors derive 耗时
 */
export function recordSelectorsDerive(sample: SelectorSample): void {
  if (!enabled) return

  selectorsDeriveCount++
  selectorsDeriveTotalMs += sample.deriveMs
  if (sample.deriveMs > selectorsDeriveMaxMs) {
    selectorsDeriveMaxMs = sample.deriveMs
  }

  if (sample.fallbackReplay) {
    selectorsFallbackReplayCount++
    selectorsFallbackReplayTotalMs += sample.deriveMs
  }
}

/**
 * 记录 merger 操作耗时
 */
export function recordMergerOp(sample: MergerSample): void {
  if (!enabled) return

  mergerOpsCount++
  mergerOpsTotalMs += sample.opMs
  if (sample.opMs > mergerOpsMaxMs) {
    mergerOpsMaxMs = sample.opMs
  }
}

// ============================================================================
// Control API (exposed via window.__sv_sched_diag__)
// ============================================================================

export function startSchedDiag(): void {
  if (enabled) return
  enabled = true
  resetAccumulators()
  tickerHandle = setInterval(tick, 1000)
  console.log('[sched-diag] started - 1Hz snapshot enabled')
}

export function stopSchedDiag(): void {
  if (!enabled) return
  enabled = false
  if (tickerHandle) {
    clearInterval(tickerHandle)
    tickerHandle = null
  }
  console.log('[sched-diag] stopped')
}

export function snapshotSchedDiag(): AggregatedSnapshot {
  return buildSnapshot()
}

export function isSchedDiagEnabled(): boolean {
  return enabled
}

// ============================================================================
// Initialization (called once at startup)
// ============================================================================

/**
 * 初始化诊断系统
 * 仅在浏览器环境调用一次；读取 localStorage 缓存开关状态
 */
export function initSchedDiag(flags: { sched: boolean }): void {
  if (initialized) return
  initialized = true

  if (typeof window === 'undefined') return
  if (!flags.sched) return

  // 自动启动
  startSchedDiag()
}

/**
 * 安装 window hook（由 bridge.ts 调用）
 */
export function installSchedDiagHook(): void {
  if (typeof window === 'undefined') return

  const g = globalThis as any
  g.__sv_sched_diag__ = {
    start: startSchedDiag,
    stop: stopSchedDiag,
    snapshot: snapshotSchedDiag,
    isEnabled: isSchedDiagEnabled,
  }
}

/**
 * 卸载 window hook
 */
export function uninstallSchedDiagHook(): void {
  if (typeof window === 'undefined') return
  const g = globalThis as any
  delete g.__sv_sched_diag__
}

// ============================================================================
// Timing Helpers (for instrumentation)
// ============================================================================

/**
 * 创建计时器（用于热路径的分段计时）
 * 返回 null 表示未启用，调用方应跳过计时逻辑
 */
export function createPhaseTimer(): { mark: (phase: keyof PhaseMs) => void; getPhaseMs: () => PhaseMs } | null {
  if (!enabled) return null

  const startTs = now()
  let lastTs = startTs
  const phaseMs: { dequeueMs: number; mergeMs: number; applyMs: number; deriveMs: number; commitMs: number; miscMs: number } = {
    dequeueMs: 0,
    mergeMs: 0,
    applyMs: 0,
    deriveMs: 0,
    commitMs: 0,
    miscMs: 0,
  }
  let currentPhase: keyof PhaseMs | null = null

  return {
    mark(phase: keyof PhaseMs): void {
      const ts = now()
      if (currentPhase) {
        phaseMs[currentPhase] += ts - lastTs
      }
      currentPhase = phase
      lastTs = ts
    },
    getPhaseMs(): PhaseMs {
      // 结束当前阶段
      if (currentPhase) {
        const ts = now()
        phaseMs[currentPhase] += ts - lastTs
      }
      return phaseMs
    },
  }
}

/**
 * 简单计时器（用于单点计时）
 */
export function startTimer(): () => number {
  if (!enabled) return () => 0
  const start = now()
  return () => now() - start
}
