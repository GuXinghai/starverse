import { describe, it, expect } from 'vitest'
import { buildReasoningDetailsArray, stableStringifyReasoningDetails } from './reasoningDetailsAggregator'
import type { ReasoningDetailSegmentRow } from './reasoningDetailsAggregator'

describe('buildReasoningDetailsArray', () => {
  function makeSegment(overrides: Partial<ReasoningDetailSegmentRow> & { segmentId: number }): ReasoningDetailSegmentRow {
    return {
      detailId: null,
      format: null,
      index: null,
      type: 'reasoning.text',
      payload: '{}',
      deltaText: null,
      deltaData: null,
      deltaSummary: null,
      ...overrides,
    }
  }

  describe('快照增长语义（payload 重放）', () => {
    it('应正确拼接 deltaText 而非 payload.text', () => {
      // 模拟快照语义：payload.text 是完整快照，deltaText 是真增量
      const segments: ReasoningDetailSegmentRow[] = [
        makeSegment({
          segmentId: 1,
          type: 'reasoning.text',
          payload: JSON.stringify({ type: 'reasoning.text', text: '好的' }),
          deltaText: '好的',
        }),
        makeSegment({
          segmentId: 2,
          type: 'reasoning.text',
          payload: JSON.stringify({ type: 'reasoning.text', text: '好的，用户' }),
          deltaText: '，用户',
        }),
        makeSegment({
          segmentId: 3,
          type: 'reasoning.text',
          payload: JSON.stringify({ type: 'reasoning.text', text: '好的，用户问的是' }),
          deltaText: '问的是',
        }),
      ]

      const result = buildReasoningDetailsArray(segments)
      expect(result).toHaveLength(1)
      expect((result[0] as any).text).toBe('好的，用户问的是')
    })

    it('deltaText 部分缺失时取已有的 deltaText（不依赖 payload.text 差分）', () => {
      // 边界场景：某些 segment 的 deltaText 为 null
      // 新语义：只拼接有值的 deltaText，丢失的部分不可恢复
      // 这种情况本不应该发生（上游应保证 deltaText 完整）
      const segments: ReasoningDetailSegmentRow[] = [
        makeSegment({
          segmentId: 1,
          type: 'reasoning.text',
          payload: JSON.stringify({ type: 'reasoning.text', text: '好的' }),
          deltaText: '好的',
        }),
        makeSegment({
          segmentId: 2,
          type: 'reasoning.text',
          payload: JSON.stringify({ type: 'reasoning.text', text: '好的，用户' }),
          deltaText: null, // 缺失！这种情况属于数据不完整
        }),
      ]

      const result = buildReasoningDetailsArray(segments)
      // 新行为：只能得到第一个 deltaText，第二个丢失
      // 这是正确的：我们不再依赖 payload.text 差分（因为不可靠）
      expect((result[0] as any).text).toBe('好的')
    })
  })

  describe('重复 delta 场景', () => {
    it('连续两次相同 delta 应都被保留（fingerprint 不同）', () => {
      // 两次都新增 "好"，但 payload 不同
      const segments: ReasoningDetailSegmentRow[] = [
        makeSegment({
          segmentId: 1,
          type: 'reasoning.text',
          payload: JSON.stringify({ type: 'reasoning.text', text: '好' }),
          deltaText: '好',
        }),
        makeSegment({
          segmentId: 2,
          type: 'reasoning.text',
          payload: JSON.stringify({ type: 'reasoning.text', text: '好好' }),
          deltaText: '好', // 同样的 delta
        }),
      ]

      const result = buildReasoningDetailsArray(segments)
      expect((result[0] as any).text).toBe('好好')
    })
  })

  describe('signature-only 场景', () => {
    it('只带 signature 无 deltaText 应保留 signature', () => {
      const segments: ReasoningDetailSegmentRow[] = [
        makeSegment({
          segmentId: 1,
          type: 'reasoning.text',
          payload: JSON.stringify({ type: 'reasoning.text', text: '思考中' }),
          deltaText: '思考中',
        }),
        makeSegment({
          segmentId: 2,
          type: 'reasoning.text',
          payload: JSON.stringify({ type: 'reasoning.text', text: '思考中', signature: 'abc123' }),
          deltaText: null, // 无增量
        }),
      ]

      const result = buildReasoningDetailsArray(segments)
      expect((result[0] as any).text).toBe('思考中')
      expect((result[0] as any).signature).toBe('abc123')
    })

    it('signature 变化应被更新（最后非空覆盖）- payload 无 text', () => {
      // 关键测试：payload 不含 text，仅靠 deltaText 列重建
      // 这验证了 aggregator 正确使用 segment.deltaText 作为首选数据源
      const segments: ReasoningDetailSegmentRow[] = [
        makeSegment({
          segmentId: 1,
          type: 'reasoning.text',
          payload: JSON.stringify({ type: 'reasoning.text', signature: 'old' }),
          deltaText: 'A',
        }),
        makeSegment({
          segmentId: 2,
          type: 'reasoning.text',
          payload: JSON.stringify({ type: 'reasoning.text', signature: 'new' }),
          deltaText: 'B',
        }),
      ]

      const result = buildReasoningDetailsArray(segments)
      // text 必须从 deltaText 列拼接得到 'AB'
      expect((result[0] as any).text).toBe('AB')
      // signature 取最后一个非空值
      expect((result[0] as any).signature).toBe('new')
    })
  })

  describe('多 key 隔离', () => {
    it('不同 (id,index,type,format) 应独立聚合', () => {
      const segments: ReasoningDetailSegmentRow[] = [
        makeSegment({
          segmentId: 1,
          detailId: 'a',
          type: 'reasoning.text',
          payload: JSON.stringify({ id: 'a', type: 'reasoning.text', text: '第一段' }),
          deltaText: '第一段',
        }),
        makeSegment({
          segmentId: 2,
          detailId: 'b',
          type: 'reasoning.summary',
          payload: JSON.stringify({ id: 'b', type: 'reasoning.summary', summary: '摘要' }),
          deltaSummary: '摘要',
        }),
        makeSegment({
          segmentId: 3,
          detailId: 'a',
          type: 'reasoning.text',
          payload: JSON.stringify({ id: 'a', type: 'reasoning.text', text: '第一段继续' }),
          deltaText: '继续',
        }),
      ]

      const result = buildReasoningDetailsArray(segments)
      expect(result).toHaveLength(2)

      const first = result.find((r: any) => r.id === 'a') as any
      const second = result.find((r: any) => r.id === 'b') as any

      expect(first.text).toBe('第一段继续')
      expect(second.summary).toBe('摘要')
    })
  })

  describe('deltaText 优先级（核心保障）', () => {
    it('完全无 payload.text 时从 deltaText 重建', () => {
      // metadata-only payload，只靠 deltaText 列
      const segments: ReasoningDetailSegmentRow[] = [
        makeSegment({
          segmentId: 1,
          type: 'reasoning.text',
          payload: JSON.stringify({ type: 'reasoning.text' }),
          deltaText: '你',
        }),
        makeSegment({
          segmentId: 2,
          type: 'reasoning.text',
          payload: JSON.stringify({ type: 'reasoning.text' }),
          deltaText: '好',
        }),
        makeSegment({
          segmentId: 3,
          type: 'reasoning.text',
          payload: JSON.stringify({ type: 'reasoning.text' }),
          deltaText: '世界',
        }),
      ]

      const result = buildReasoningDetailsArray(segments)
      expect(result).toHaveLength(1)
      expect((result[0] as any).text).toBe('你好世界')
    })

    it('deltaData 优先于 payload.data', () => {
      const segments: ReasoningDetailSegmentRow[] = [
        makeSegment({
          segmentId: 1,
          type: 'reasoning.data',
          payload: JSON.stringify({ type: 'reasoning.data', data: 'payload-data' }),
          deltaData: 'real-delta-A',
        }),
        makeSegment({
          segmentId: 2,
          type: 'reasoning.data',
          payload: JSON.stringify({ type: 'reasoning.data' }),
          deltaData: 'real-delta-B',
        }),
      ]

      const result = buildReasoningDetailsArray(segments)
      expect((result[0] as any).data).toBe('real-delta-Areal-delta-B')
    })

    it('混合 deltaText 和 deltaData 的多 key 场景', () => {
      const segments: ReasoningDetailSegmentRow[] = [
        makeSegment({
          segmentId: 1,
          detailId: 'text-key',
          type: 'reasoning.text',
          payload: JSON.stringify({ id: 'text-key', type: 'reasoning.text' }),
          deltaText: 'text-A',
        }),
        makeSegment({
          segmentId: 2,
          detailId: 'data-key',
          type: 'reasoning.data',
          payload: JSON.stringify({ id: 'data-key', type: 'reasoning.data' }),
          deltaData: 'data-A',
        }),
        makeSegment({
          segmentId: 3,
          detailId: 'text-key',
          type: 'reasoning.text',
          payload: JSON.stringify({ id: 'text-key', type: 'reasoning.text' }),
          deltaText: 'text-B',
        }),
      ]

      const result = buildReasoningDetailsArray(segments)
      expect(result).toHaveLength(2)
      const textResult = result.find((r: any) => r.id === 'text-key') as any
      const dataResult = result.find((r: any) => r.id === 'data-key') as any
      expect(textResult.text).toBe('text-Atext-B')
      expect(dataResult.data).toBe('data-A')
    })

    it('payload.text 作为兜底（历史兼容：deltaText 全部为空）', () => {
      // 旧格式数据：没有 deltaText 列，只有 payload.text
      const segments: ReasoningDetailSegmentRow[] = [
        makeSegment({
          segmentId: 1,
          type: 'reasoning.text',
          payload: JSON.stringify({ type: 'reasoning.text', text: '旧格式数据' }),
          deltaText: null,
        }),
      ]

      const result = buildReasoningDetailsArray(segments)
      expect((result[0] as any).text).toBe('旧格式数据')
    })
  })
})

describe('stableStringifyReasoningDetails', () => {
  it('应生成稳定的 JSON 和 SHA256', () => {
    const details = [
      { id: 'a', type: 'reasoning.text', text: 'hello' },
      { id: 'b', type: 'reasoning.summary', summary: 'world' },
    ]

    const r1 = stableStringifyReasoningDetails(details)
    const r2 = stableStringifyReasoningDetails(details)

    expect(r1.sha256).toBe(r2.sha256)
    expect(r1.json).toBe(r2.json)
  })
})
