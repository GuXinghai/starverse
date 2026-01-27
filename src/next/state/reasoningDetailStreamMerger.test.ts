import { describe, it, expect, beforeEach } from 'vitest'
import { ReasoningDetailStreamMerger } from './reasoningDetailStreamMerger'

describe('ReasoningDetailStreamMerger', () => {
  let merger: ReasoningDetailStreamMerger

  beforeEach(() => {
    merger = new ReasoningDetailStreamMerger()
  })

  describe('快照增长语义', () => {
    it('应正确提取后缀增量', () => {
      // A="好的"
      const r1 = merger.merge({ type: 'reasoning.text', text: '好的' })
      expect(r1).not.toBeNull()
      expect(r1!.deltaText).toBe('好的')
      expect(r1!.isSnapshot).toBe(false) // 首次

      // B="好的，用户"
      const r2 = merger.merge({ type: 'reasoning.text', text: '好的，用户' })
      expect(r2).not.toBeNull()
      expect(r2!.deltaText).toBe('，用户')
      expect(r2!.isSnapshot).toBe(true) // 检测到前缀匹配

      // C="好的，用户问的是"
      const r3 = merger.merge({ type: 'reasoning.text', text: '好的，用户问的是' })
      expect(r3).not.toBeNull()
      expect(r3!.deltaText).toBe('问的是')
      expect(r3!.isSnapshot).toBe(true)
    })

    it('聚合后文本应连续不重复', () => {
      // 重新测试完整流程
      const m2 = new ReasoningDetailStreamMerger()
      const d1 = m2.merge({ type: 'reasoning.text', text: '好的' })
      const d2 = m2.merge({ type: 'reasoning.text', text: '好的，用户' })
      const d3 = m2.merge({ type: 'reasoning.text', text: '好的，用户问的是' })

      const aggregated = [d1!.deltaText, d2!.deltaText, d3!.deltaText].join('')
      expect(aggregated).toBe('好的，用户问的是')
    })
  })

  describe('重复 delta 场景', () => {
    it('连续两次相同增量应都被保留（fingerprint 基于 payload 而非 delta）', () => {
      // 场景：两次新增 "好"（不同 payload，同 delta）
      // 这测试的是 Merger 返回结果，实际去重在 messageRepo

      // 第一次：text="好"
      const r1 = merger.merge({ type: 'reasoning.text', text: '好' })
      expect(r1).not.toBeNull()
      expect(r1!.deltaText).toBe('好')

      // 第二次：text="好好"（快照语义，新增一个"好"）
      const r2 = merger.merge({ type: 'reasoning.text', text: '好好' })
      expect(r2).not.toBeNull()
      expect(r2!.deltaText).toBe('好') // delta 相同
      expect(r2!.isSnapshot).toBe(true)

      // 两次 originalDetail 不同（text 字段不同）
      expect(r1!.originalDetail.text).toBe('好')
      expect(r2!.originalDetail.text).toBe('好好')
    })
  })

  describe('signature-only 场景', () => {
    it('只带 signature 无 text 增量时应返回结果（hasNewMetadata=true）', () => {
      // 第一个 chunk：text="思考中"
      const r1 = merger.merge({ type: 'reasoning.text', text: '思考中' })
      expect(r1).not.toBeNull()
      expect(r1!.deltaText).toBe('思考中')
      // 首次见到此 key，type 字段被检测为 metadata 变化
      expect(r1!.hasNewMetadata).toBe(true)

      // 第二个 chunk：同样 text，但新增 signature
      const r2 = merger.merge({
        type: 'reasoning.text',
        text: '思考中',
        signature: 'abc123',
      })
      expect(r2).not.toBeNull()
      expect(r2!.deltaText).toBeNull() // text 无增量
      expect(r2!.hasNewMetadata).toBe(true) // 检测到 signature
      expect(r2!.diagnostics.metadataChanged).toContain('signature')
    })

    it('signature 变化时应返回结果', () => {
      merger.merge({ type: 'reasoning.text', text: 'x', signature: 'old' })
      const r2 = merger.merge({ type: 'reasoning.text', text: 'x', signature: 'new' })

      expect(r2).not.toBeNull()
      expect(r2!.hasNewMetadata).toBe(true)
      expect(r2!.diagnostics.metadataChanged).toContain('signature')
    })
  })

  describe('无变化时应跳过', () => {
    it('完全相同的 chunk 应返回 null', () => {
      merger.merge({ type: 'reasoning.text', text: 'hello' })
      const r2 = merger.merge({ type: 'reasoning.text', text: 'hello' })

      expect(r2).toBeNull() // 无增量、非首次、无新 metadata
    })
  })

  describe('不同 key 隔离', () => {
    it('不同 (id,index,type,format) 应独立追踪', () => {
      const r1 = merger.merge({ id: 'a', index: 0, type: 'reasoning.text', text: '第一段' })
      const r2 = merger.merge({ id: 'b', index: 1, type: 'reasoning.summary', text: '第二段' })

      expect(r1!.deltaText).toBe('第一段')
      expect(r2!.deltaText).toBe('第二段')

      // 各自继续增长
      const r3 = merger.merge({ id: 'a', index: 0, type: 'reasoning.text', text: '第一段继续' })
      expect(r3!.deltaText).toBe('继续')
      expect(r3!.isSnapshot).toBe(true)
    })
  })

  describe('诊断统计', () => {
    it('应正确统计快照比例', () => {
      merger.merge({ type: 'reasoning.text', text: 'A' })
      merger.merge({ type: 'reasoning.text', text: 'AB' })
      merger.merge({ type: 'reasoning.text', text: 'ABC' })

      const stats = merger.getStats()
      expect(stats.chunkCount).toBe(3)
      expect(stats.snapshotCount).toBe(2) // 后两次检测到前缀匹配
      expect(stats.isLikelySnapshot).toBe(true) // 2/3 > 0.5
    })
  })

  describe('offsetBefore/offsetAfter 逻辑位置追踪', () => {
    it('应正确计算累积 offset', () => {
      // 首次：offsetBefore=0, deltaText="好的"(2), offsetAfter=2
      const r1 = merger.merge({ type: 'reasoning.text', text: '好的' })
      expect(r1).not.toBeNull()
      expect(r1!.offsetBefore).toBe(0)
      expect(r1!.offsetAfter).toBe(2)

      // 第二次：offsetBefore=2, deltaText="用户"(2), offsetAfter=4
      const r2 = merger.merge({ type: 'reasoning.text', text: '好的用户' })
      expect(r2).not.toBeNull()
      expect(r2!.offsetBefore).toBe(2)
      expect(r2!.offsetAfter).toBe(4)

      // 第三次：offsetBefore=4, deltaText="你好"(2), offsetAfter=6
      const r3 = merger.merge({ type: 'reasoning.text', text: '好的用户你好' })
      expect(r3).not.toBeNull()
      expect(r3!.offsetBefore).toBe(4)
      expect(r3!.offsetAfter).toBe(6)
    })

    it('相同 deltaText 但不同 offsetBefore 应都被保留', () => {
      // 场景：连续两次增量都是"好"，但 offset 不同
      const r1 = merger.merge({ type: 'reasoning.text', text: '好' })
      expect(r1!.deltaText).toBe('好')
      expect(r1!.offsetBefore).toBe(0)

      const r2 = merger.merge({ type: 'reasoning.text', text: '好好' })
      expect(r2!.deltaText).toBe('好') // 相同的增量文本
      expect(r2!.offsetBefore).toBe(1) // 但 offset 不同

      // 两者的 key+offsetBefore 组合不同，所以 fingerprint 不同
      expect(r1!.key).toBe(r2!.key)
      expect(r1!.offsetBefore).not.toBe(r2!.offsetBefore)
    })
  })

  describe('metadataDigest 计算', () => {
    it('应为相同 metadata 生成相同 digest', () => {
      const r1 = merger.merge({ type: 'reasoning.text', text: 'A', signature: 'sig1' })
      merger.reset()
      const r2 = merger.merge({ type: 'reasoning.text', text: 'A', signature: 'sig1' })

      expect(r1!.metadataDigest).toBe(r2!.metadataDigest)
    })

    it('应为不同 metadata 生成不同 digest', () => {
      const r1 = merger.merge({ type: 'reasoning.text', text: 'A', signature: 'sig1' })
      merger.reset()
      const r2 = merger.merge({ type: 'reasoning.text', text: 'A', signature: 'sig2' })

      expect(r1!.metadataDigest).not.toBe(r2!.metadataDigest)
    })
  })

  describe('reset/shorter 场景', () => {
    it('newText 短于 oldText 时应视为重置并返回完整内容', () => {
      // 初始：text="完整的推理内容"
      merger.merge({ type: 'reasoning.text', text: '完整的推理内容' })

      // 重置：text="新" (短于之前)
      const r2 = merger.merge({ type: 'reasoning.text', text: '新' })

      expect(r2).not.toBeNull()
      // 由于无法提取前缀增量，返回完整 newText
      expect(r2!.deltaText).toBe('新')
      expect(r2!.isSnapshot).toBe(false) // 无前缀匹配
    })
  })

  describe('key 稳定性', () => {
    it('应返回稳定的 key 字段', () => {
      const r = merger.merge({ id: 'abc', index: 1, type: 'reasoning.text', format: 'markdown', text: 'test' })

      expect(r).not.toBeNull()
      expect(r!.key).toBe('abc|1|reasoning.text|markdown')
    })

    it('缺失字段时 key 应仍然稳定', () => {
      const r = merger.merge({ type: 'reasoning.text', text: 'test' })

      expect(r).not.toBeNull()
      expect(r!.key).toBe('||reasoning.text|')
    })
  })

  describe('首次事件必须返回结果', () => {
    it('首次事件即使无增量也应返回（isFirstSeen）', () => {
      // 首次空 text
      const r = merger.merge({ type: 'reasoning.text', text: '' })
      // 首次见到此 key，即使无增量也返回结果
      expect(r).not.toBeNull()
    })
  })

  describe('metadata-only 事件', () => {
    it('仅 metadata 变化无 delta 时应返回结果', () => {
      merger.merge({ type: 'reasoning.text', text: 'content' })

      // 同样内容但新增 encrypted 字段
      const r2 = merger.merge({ type: 'reasoning.text', text: 'content', encrypted: true })

      expect(r2).not.toBeNull()
      expect(r2!.deltaText).toBeNull() // 无文本增量
      expect(r2!.hasNewMetadata).toBe(true)
      expect(r2!.diagnostics.metadataChanged).toContain('encrypted')
    })
  })
})
