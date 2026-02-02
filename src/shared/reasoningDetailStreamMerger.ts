/**
 * ReasoningDetailStreamMerger (shared)
 *
 * - 处理 reasoning_details 的快照/增量语义差异
 * - 计算 delta 并维护逻辑 offset
 * - 维护 merged 快照（文本/summary/data 使用 delta 累积，metadata 使用最后非空覆盖）
 *
 * @see docs/architecture/REASONING_SEMANTIC_CONTRACT.md 语义契约
 * @see docs/architecture/REASONING_IDEMPOTENCY_CONTRACT.md 幂等契约
 */

// ============================================================================
// Scheduler Diagnostics Hook (injected by state layer)
// ============================================================================

export type MergerDiagSample = Readonly<{
  opMs: number
  rawDetailsCount: number
  incomingTextLen: number
  mergedTextLen: number
}>

type MergerDiagRecorder = (sample: MergerDiagSample) => void

let diagRecorder: MergerDiagRecorder | null = null
let diagEnabled = false

/**
 * 注入诊断记录器（由 state 层调用，避免 shared 依赖 next/state）
 */
export function injectMergerDiagRecorder(recorder: MergerDiagRecorder | null, enabled: boolean): void {
  diagRecorder = recorder
  diagEnabled = enabled
}

function now(): number {
  if (typeof performance !== 'undefined' && typeof performance.now === 'function') {
    return performance.now()
  }
  return Date.now()
}

export type DetailKey = string

export type StreamingDetail = Readonly<{
  id?: string
  index?: number
  type?: string
  format?: string
  text?: string
  summary?: string
  data?: string
  signature?: unknown
  [key: string]: unknown
}>

export type MergedDelta = Readonly<{
  /** 原始 detail 对象（带完整元数据） */
  originalDetail: StreamingDetail
  /** 稳定 key，由 (id, index, type, format) 拼接 */
  key: DetailKey
  /** 本 key 在本次 merge 前累计文本长度（用于幂等 fingerprint） */
  offsetBefore: number
  /** offsetBefore + deltaText.length（merge 后的累计长度） */
  offsetAfter: number
  /** 计算出的文本增量（null 表示无变化或首次） */
  deltaText: string | null
  /** 计算出的 summary 增量 */
  deltaSummary: string | null
  /** 计算出的 data 增量 */
  deltaData: string | null
  /** 是否为快照语义（检测到前缀匹配） */
  isSnapshot: boolean
  /** 是否有新的 metadata 变化（如 signature 首次出现或变化） */
  hasNewMetadata: boolean
  /** metadata 摘要（用于幂等 fingerprint） */
  metadataDigest: string
  /** 诊断信息 */
  diagnostics: Readonly<{
    key: string
    isFirstSeen: boolean
    prefixMatch: boolean
    oldLen: number
    newLen: number
    deltaLen: number
    metadataChanged: string[]
  }>
}>

export function buildDetailKey(detail: StreamingDetail): DetailKey {
  const id = typeof detail.id === 'string' ? detail.id : ''
  const index = typeof detail.index === 'number' ? String(detail.index) : ''
  const type = typeof detail.type === 'string' ? detail.type : ''
  const format = typeof detail.format === 'string' ? detail.format : ''
  return `${id}|${index}|${type}|${format}`
}

/**
 * 计算后缀增量
 * - 若 newText 以 oldText 为前缀：delta = newText.slice(oldText.length)
 * - 若不满足前缀关系：计算最长重叠后返回非重叠部分
 * - 若 newText 变短或完全不相干：返回完整 newText（视为重置）
 */
function computeSuffixDelta(oldText: string | undefined, newText: string | undefined): {
  delta: string | null
  prefixMatch: boolean
  overlap: number
} {
  if (newText === undefined || newText === null) {
    return { delta: null, prefixMatch: false, overlap: 0 }
  }
  if (oldText === undefined || oldText === null || oldText.length === 0) {
    return { delta: newText, prefixMatch: false, overlap: 0 }
  }
  if (newText === oldText) {
    return { delta: null, prefixMatch: true, overlap: oldText.length }
  }
  // 典型快照增长：newText 以 oldText 为前缀
  if (newText.startsWith(oldText)) {
    return { delta: newText.slice(oldText.length), prefixMatch: true, overlap: oldText.length }
  }
  // 非前缀关系：计算 oldText 的最长后缀与 newText 的最长前缀重叠
  // 这处理分词/换行导致的边界抖动
  let overlapLen = 0
  const maxPossible = Math.min(oldText.length, newText.length)
  for (let len = 1; len <= maxPossible; len++) {
    if (oldText.slice(-len) === newText.slice(0, len)) {
      overlapLen = len
    }
  }
  if (overlapLen > 0) {
    return { delta: newText.slice(overlapLen), prefixMatch: false, overlap: overlapLen }
  }
  // 完全不相干：视为重置，返回完整 newText
  // 这可能是乱序/重放/上游重置
  return { delta: newText, prefixMatch: false, overlap: 0 }
}

export class ReasoningDetailStreamMerger {
  /** 按 key 存储每个 detail 的当前 raw 快照（用于 delta 计算） */
  private snapshots = new Map<DetailKey, StreamingDetail>()
  /** 按 key 存储聚合后的 merged 快照（文本/summary/data 使用 delta 累积） */
  private mergedSnapshots = new Map<DetailKey, StreamingDetail>()
  /** 按 key 存储当前累计文本长度（用于 offsetBefore 计算） */
  private offsets = new Map<DetailKey, number>()
  /** 诊断计数器 */
  private chunkCount = 0
  private snapshotCount = 0
  private deltaCount = 0

  /**
   * 计算 metadata 摘要（用于幂等 fingerprint）
   * 覆盖 signature/encrypted/type/format 等影响语义的字段
   */
  private computeMetadataDigest(detail: StreamingDetail): string {
    const metadataKeys = ['id', 'index', 'type', 'format', 'signature', 'encrypted', 'thinking', 'thought_signature']
    const obj: Record<string, unknown> = {}
    for (const key of metadataKeys) {
      if (detail[key] !== undefined) {
        obj[key] = detail[key]
      }
    }
    // 稳定排序 JSON
    return JSON.stringify(obj, Object.keys(obj).sort())
  }

  /**
   * 检测 metadata 字段变化（除 text/summary/data 外的字段）
   * 返回变化的字段名列表
   */
  private detectMetadataChanges(oldSnapshot: StreamingDetail | undefined, newDetail: StreamingDetail): string[] {
    // 对回传有意义的 metadata 字段（与聚合器保持一致）
    const metadataKeys = ['id', 'index', 'type', 'format', 'signature', 'encrypted', 'thinking', 'thought_signature']
    const changed: string[] = []

    for (const key of metadataKeys) {
      const oldVal = oldSnapshot?.[key]
      const newVal = newDetail[key]

      // 新字段出现
      if (oldVal === undefined && newVal !== undefined) {
        changed.push(key)
        continue
      }
      // 值变化（简单比较，signature 等复杂对象用 JSON 比较）
      if (oldVal !== undefined && newVal !== undefined) {
        const oldStr = typeof oldVal === 'object' ? JSON.stringify(oldVal) : String(oldVal)
        const newStr = typeof newVal === 'object' ? JSON.stringify(newVal) : String(newVal)
        if (oldStr !== newStr) {
          changed.push(key)
        }
      }
    }

    return changed
  }

  /**
   * 处理一个 reasoning detail chunk，返回计算出的增量
   */
  merge(detail: unknown): MergedDelta | null {
    if (!detail || typeof detail !== 'object') return null

    const startTs = diagEnabled ? now() : 0
    const incomingTextLen = typeof (detail as any)?.text === 'string' ? (detail as any).text.length : 0

    const d = detail as StreamingDetail
    const key = buildDetailKey(d)
    const oldSnapshot = this.snapshots.get(key)
    const isFirstSeen = !oldSnapshot

    this.chunkCount++

    // 计算各字段的增量
    const textResult = computeSuffixDelta(oldSnapshot?.text, d.text)
    const summaryResult = computeSuffixDelta(oldSnapshot?.summary, d.summary)
    const dataResult = computeSuffixDelta(oldSnapshot?.data, d.data)

    // 检测 metadata 变化
    const metadataChanged = this.detectMetadataChanges(oldSnapshot, d)
    const hasNewMetadata = metadataChanged.length > 0

    // 检测是否为快照语义
    const isSnapshot = textResult.prefixMatch || summaryResult.prefixMatch || dataResult.prefixMatch
    if (isSnapshot) this.snapshotCount++

    // 判断是否有实际增量
    const hasTextDelta = textResult.delta !== null && textResult.delta.length > 0
    const hasSummaryDelta = summaryResult.delta !== null && summaryResult.delta.length > 0
    const hasDataDelta = dataResult.delta !== null && dataResult.delta.length > 0
    const hasAnyDelta = hasTextDelta || hasSummaryDelta || hasDataDelta

    if (hasAnyDelta) this.deltaCount++

    // 计算 offset（本次 merge 前的累计长度）
    // 使用归一化的累积长度：text + summary + data
    const offsetBefore = this.offsets.get(key) ?? 0
    const deltaTextLen = textResult.delta?.length ?? 0
    const deltaSummaryLen = summaryResult.delta?.length ?? 0
    const deltaDataLen = dataResult.delta?.length ?? 0
    const offsetAfter = offsetBefore + deltaTextLen + deltaSummaryLen + deltaDataLen

    // 更新 offset
    if (hasAnyDelta) {
      this.offsets.set(key, offsetAfter)
    }

    // 计算 metadata 摘要
    const metadataDigest = this.computeMetadataDigest(d)

    // 更新 raw 快照
    this.snapshots.set(key, d)

    // 更新 merged 快照（仅 text/summary/data 使用 delta 累积，其他字段用最后非空覆盖）
    const prevMerged = this.mergedSnapshots.get(key) ?? {}
    const nextMerged: Record<string, unknown> = { ...prevMerged }

    // 保留/覆盖 id/index/type/format
    if (d.id !== undefined) nextMerged.id = d.id
    if (d.index !== undefined) nextMerged.index = d.index
    if (d.type !== undefined) nextMerged.type = d.type
    if (d.format !== undefined) nextMerged.format = d.format

    if (hasTextDelta) {
      const existing = typeof nextMerged.text === 'string' ? nextMerged.text : ''
      nextMerged.text = existing + textResult.delta
    }
    if (hasSummaryDelta) {
      const existing = typeof nextMerged.summary === 'string' ? nextMerged.summary : ''
      nextMerged.summary = existing + summaryResult.delta
    }
    if (hasDataDelta) {
      const existing = typeof nextMerged.data === 'string' ? nextMerged.data : ''
      nextMerged.data = existing + dataResult.delta
    }

    // 其他 metadata：最后非空覆盖（排除 text/summary/data 和内部字段）
    for (const [k, v] of Object.entries(d)) {
      if (k === 'text' || k === 'summary' || k === 'data') continue
      if (k.startsWith('__')) continue
      if (v !== undefined && v !== null) {
        nextMerged[k] = v
      }
    }

    this.mergedSnapshots.set(key, nextMerged as StreamingDetail)

    // 记录诊断数据
    if (diagEnabled && diagRecorder) {
      const mergedText = typeof nextMerged.text === 'string' ? nextMerged.text : ''
      diagRecorder({
        opMs: now() - startTs,
        rawDetailsCount: this.snapshots.size,
        incomingTextLen,
        mergedTextLen: mergedText.length,
      })
    }

    // 【修复风险2】只有当：无增量、非首次、且无新 metadata 时才跳过
    if (!hasAnyDelta && !isFirstSeen && !hasNewMetadata) {
      return null
    }

    const diagnostics = {
      key,
      isFirstSeen,
      prefixMatch: isSnapshot,
      oldLen: oldSnapshot?.text?.length ?? 0,
      newLen: d.text?.length ?? 0,
      deltaLen: textResult.delta?.length ?? 0,
      metadataChanged,
    }

    return {
      originalDetail: d,
      key,
      offsetBefore,
      offsetAfter,
      deltaText: hasTextDelta ? textResult.delta : null,
      deltaSummary: hasSummaryDelta ? summaryResult.delta : null,
      deltaData: hasDataDelta ? dataResult.delta : null,
      isSnapshot,
      hasNewMetadata,
      metadataDigest,
      diagnostics,
    }
  }

  /**
   * 获取 merged 快照（文本/summary/data 已拼接）
   */
  getMergedSnapshots(): ReadonlyArray<StreamingDetail> {
    return [...this.mergedSnapshots.values()]
  }

  /**
   * 获取 merged 快照 Map（按 key）
   */
  getMergedSnapshotMap(): ReadonlyMap<DetailKey, StreamingDetail> {
    return this.mergedSnapshots
  }

  /**
   * 获取诊断统计
   */
  getStats(): Readonly<{
    chunkCount: number
    snapshotCount: number
    deltaCount: number
    uniqueKeys: number
    isLikelySnapshot: boolean
  }> {
    // 如果 snapshotCount > chunkCount * 0.5，则上游很可能是快照语义
    const isLikelySnapshot = this.chunkCount > 0 && this.snapshotCount / this.chunkCount > 0.5
    return {
      chunkCount: this.chunkCount,
      snapshotCount: this.snapshotCount,
      deltaCount: this.deltaCount,
      uniqueKeys: this.snapshots.size,
      isLikelySnapshot,
    }
  }

  /**
   * 重置状态（用于新的流式会话）
   */
  reset(): void {
    this.snapshots.clear()
    this.mergedSnapshots.clear()
    this.offsets.clear()
    this.chunkCount = 0
    this.snapshotCount = 0
    this.deltaCount = 0
  }
}
