import { createHash } from 'node:crypto'

export type ReasoningDetailSegmentRow = Readonly<{
  segmentId: number
  detailId: string | null
  format: string | null
  index: number | null
  type: string
  payload: string
  deltaText?: string | null
  deltaData?: string | null
  deltaSummary?: string | null
}>

function safeParseJson(input: string): Record<string, unknown> | null {
  try {
    const parsed = JSON.parse(input)
    if (!parsed || typeof parsed !== 'object') return null
    return parsed as Record<string, unknown>
  } catch {
    return null
  }
}

function coerceIndex(value: unknown): number | null {
  if (typeof value !== 'number' || !Number.isFinite(value)) return null
  return value
}

/**
 * 构建 segment 分组键
 * 与 reasoningDetailStreamMerger.buildDetailKey 保持一致的语义
 */
function buildKey(segment: ReasoningDetailSegmentRow, payload: Record<string, unknown> | null): string {
  // 优先从 payload 提取字段，再回退到 segment 列
  const id = payload?.id ?? segment.detailId ?? ''
  const index = payload?.index ?? segment.index ?? ''
  const type = payload?.type ?? segment.type ?? ''
  const format = payload?.format ?? segment.format ?? ''
  return `${id}|${index}|${type}|${format}`
}

/**
 * 从 DB segments 重建 reasoning_details 数组
 *
 * 核心语义：
 * - 优先使用 segment.deltaText/deltaData/deltaSummary 列拼接（这是真正可靠的增量数据）
 * - payload.text 仅作为兜底或校验（payload 可能不完整或语义不稳定）
 * - 按 key 分组、按 segmentId 顺序拼接
 * - metadata（signature 等）取最后一次非空值
 *
 * @see docs/architecture/REASONING_SEMANTIC_CONTRACT.md
 */
export function buildReasoningDetailsArray(segments: ReadonlyArray<ReasoningDetailSegmentRow>): unknown[] {
  // 按 key 分组收集
  const byKey = new Map<string, {
    segmentList: ReasoningDetailSegmentRow[]
    payloads: (Record<string, unknown> | null)[]
    firstSegmentId: number
    index: number | null
  }>()

  for (const segment of segments) {
    const payload = safeParseJson(segment.payload)
    const key = buildKey(segment, payload)

    if (!byKey.has(key)) {
      byKey.set(key, {
        segmentList: [],
        payloads: [],
        firstSegmentId: segment.segmentId,
        index: coerceIndex(payload?.index ?? segment.index),
      })
    }

    const group = byKey.get(key)!
    group.segmentList.push(segment)
    group.payloads.push(payload)
  }

  // 对每个 key 分组：拼接 deltaText/deltaData/deltaSummary，收集最后一次 metadata
  const results: Array<{
    detail: Record<string, unknown>
    firstSegmentId: number
    indexValue: number | null
  }> = []

  for (const [_key, group] of byKey) {
    // 拼接真正的增量数据
    const textParts: string[] = []
    const dataParts: string[] = []
    const summaryParts: string[] = []

    // 收集 metadata（取最后一次非空）
    let lastId: unknown
    let lastIndex: unknown
    let lastType: unknown
    let lastFormat: unknown
    let lastSignature: unknown
    let lastEncrypted: unknown
    let lastThinking: unknown
    let lastThoughtSignature: unknown

    for (let i = 0; i < group.segmentList.length; i++) {
      const seg = group.segmentList[i]
      const payload = group.payloads[i]

      // 拼接增量（首选 segment 列，这是真正可靠的数据源）
      if (seg.deltaText != null && seg.deltaText.length > 0) {
        textParts.push(seg.deltaText)
      }
      if (seg.deltaData != null && seg.deltaData.length > 0) {
        dataParts.push(seg.deltaData)
      }
      if (seg.deltaSummary != null && seg.deltaSummary.length > 0) {
        summaryParts.push(seg.deltaSummary)
      }

      // 收集 metadata（最后一次覆盖）
      if (payload) {
        if (payload.id !== undefined) lastId = payload.id
        if (payload.index !== undefined) lastIndex = payload.index
        if (payload.type !== undefined) lastType = payload.type
        if (payload.format !== undefined) lastFormat = payload.format
        if (payload.signature !== undefined) lastSignature = payload.signature
        if (payload.encrypted !== undefined) lastEncrypted = payload.encrypted
        if (payload.thinking !== undefined) lastThinking = payload.thinking
        if (payload.thought_signature !== undefined) lastThoughtSignature = payload.thought_signature
      }

      // 从 segment 列补齐基础字段
      if (lastId === undefined && seg.detailId) lastId = seg.detailId
      if (lastIndex === undefined && seg.index !== null) lastIndex = seg.index
      if (lastType === undefined && seg.type) lastType = seg.type
      if (lastFormat === undefined && seg.format) lastFormat = seg.format
    }

    // 构建输出对象
    const detail: Record<string, unknown> = {}

    // 基础字段
    if (lastId !== undefined) detail.id = lastId
    if (lastFormat !== undefined) detail.format = lastFormat
    if (lastIndex !== undefined) detail.index = lastIndex
    if (lastType !== undefined) detail.type = lastType

    // 内容字段：优先使用拼接的 delta，兜底取最后一个 payload 的完整值
    const lastPayload = group.payloads[group.payloads.length - 1]

    if (textParts.length > 0) {
      detail.text = textParts.join('')
    } else if (lastPayload?.text !== undefined) {
      // 兜底：如果没有 deltaText 但 payload 有完整 text（兼容历史数据）
      detail.text = lastPayload.text
    }

    if (dataParts.length > 0) {
      detail.data = dataParts.join('')
    } else if (lastPayload?.data !== undefined) {
      detail.data = lastPayload.data
    }

    if (summaryParts.length > 0) {
      detail.summary = summaryParts.join('')
    } else if (lastPayload?.summary !== undefined) {
      detail.summary = lastPayload.summary
    }

    // 其他 metadata
    if (lastSignature !== undefined) detail.signature = lastSignature
    if (lastEncrypted !== undefined) detail.encrypted = lastEncrypted
    if (lastThinking !== undefined) detail.thinking = lastThinking
    if (lastThoughtSignature !== undefined) detail.thought_signature = lastThoughtSignature

    results.push({
      detail,
      firstSegmentId: group.firstSegmentId,
      indexValue: group.index,
    })
  }

  // 诊断日志
  if (segments.length > 0) {
    let segmentsDeltaSum = 0
    for (const seg of segments) {
      segmentsDeltaSum += (seg.deltaText?.length ?? 0) + (seg.deltaData?.length ?? 0) + (seg.deltaSummary?.length ?? 0)
    }
    let resultTextSum = 0
    for (const r of results) {
      if (typeof r.detail.text === 'string') resultTextSum += (r.detail.text as string).length
      if (typeof r.detail.data === 'string') resultTextSum += (r.detail.data as string).length
      if (typeof r.detail.summary === 'string') resultTextSum += (r.detail.summary as string).length
    }
    console.log('[aggregator] buildReasoningDetailsArray stats', {
      segmentsCount: segments.length,
      uniqueKeys: results.length,
      segmentsDeltaSum,
      resultTextSum,
      match: segmentsDeltaSum === resultTextSum,
    })
  }

  // 按 index → firstSegmentId 排序
  results.sort((a, b) => {
    const ai = a.indexValue ?? Number.POSITIVE_INFINITY
    const bi = b.indexValue ?? Number.POSITIVE_INFINITY
    if (ai !== bi) return ai - bi
    return a.firstSegmentId - b.firstSegmentId
  })

  return results.map((entry) => entry.detail)
}

function normalizeReasoningDetail(detail: unknown): unknown {
  if (!detail || typeof detail !== 'object') return detail
  const obj = detail as Record<string, unknown>
  const ordered: Record<string, unknown> = {}
  const baseKeys = ['id', 'format', 'index', 'type', 'text', 'data', 'summary', 'signature']

  for (const key of baseKeys) {
    if (obj[key] !== undefined) ordered[key] = obj[key]
  }

  const extraKeys = Object.keys(obj).filter((k) => !baseKeys.includes(k)).sort()
  for (const key of extraKeys) {
    if (obj[key] !== undefined) ordered[key] = obj[key]
  }

  return ordered
}

export function stableStringifyReasoningDetails(details: ReadonlyArray<unknown>): { json: string; sha256: string; bytes: number } {
  const normalized = details.map(normalizeReasoningDetail)
  const json = JSON.stringify(normalized)
  const sha256 = createHash('sha256').update(json).digest('hex')
  const bytes = Buffer.byteLength(json, 'utf8')
  return { json, sha256, bytes }
}
