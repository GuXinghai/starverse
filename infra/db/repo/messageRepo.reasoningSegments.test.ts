/**
 * messageRepo.reasoningSegments 聚合一致性测试
 *
 * 覆盖 append → finalize → replay 完整链路，验证三条核心不变式：
 * 1. received == inserted + ignored + skipped
 * 2. totalDeltaLen == sumDeltaLenInserted
 * 3. replay 一致性：拼接后的文本与原始输入一致
 *
 * @see docs/architecture/REASONING_IDEMPOTENCY_CONTRACT.md
 */
import { describe, it, expect, beforeEach } from 'vitest'
import BetterSqlite3, { type Database } from 'better-sqlite3'
import { readFileSync } from 'node:fs'
import { join } from 'node:path'
import { MessageRepo } from './messageRepo'
import { buildReasoningDetailsArray } from './reasoningDetailsAggregator'

function loadSchema(db: Database) {
  const schemaPath = join(process.cwd(), 'infra', 'db', 'schema.sql')
  const schema = readFileSync(schemaPath, 'utf-8')
  db.exec(schema)
}

function insertConvo(db: Database, convoId: string) {
  const now = Date.now()
  db.prepare(`
    INSERT INTO convo (id, project_id, title, created_at, updated_at, meta)
    VALUES (@id, NULL, 'test', @now, @now, NULL)
  `).run({ id: convoId, now })
}

function insertMessage(db: Database, convoId: string, messageId: string) {
  const now = Date.now()
  db.prepare(`
    INSERT INTO message (id, convo_id, role, seq, status, created_at)
    VALUES (@id, @convoId, 'assistant', 1, 'streaming', @now)
  `).run({ id: messageId, convoId, now })
}

describe('MessageRepo.appendReasoningDetailSegments (aggregation consistency)', () => {
  let db: Database
  let repo: MessageRepo

  beforeEach(() => {
    db = new BetterSqlite3(':memory:')
    loadSchema(db)
    repo = new MessageRepo(db)
    insertConvo(db, 'c1')
    insertMessage(db, 'c1', 'm1')
  })

  /**
   * 核心不变式 1: received == inserted + ignored + skipped
   * 核心不变式 2: totalDeltaLen == sumDeltaLenInserted
   */
  it('append 统计满足核心不变式 (delta 场景)', () => {
    const details = [
      {
        type: 'reasoning.text',
        text: '好的',
        __deltaText: '好的',
        __isSnapshot: false,
        __hasNewMetadata: false,
        __key: '||reasoning.text|',
        __offsetBefore: 0,
        __offsetAfter: 2,
        __metadataDigest: 'abc',
      },
      {
        type: 'reasoning.text',
        text: '好的，用户',
        __deltaText: '，用户',
        __isSnapshot: true, // 快照语义
        __hasNewMetadata: false,
        __key: '||reasoning.text|',
        __offsetBefore: 2,
        __offsetAfter: 5,
        __metadataDigest: 'abc',
      },
      {
        type: 'reasoning.text',
        text: '好的，用户问的是',
        __deltaText: '问的是',
        __isSnapshot: true,
        __hasNewMetadata: false,
        __key: '||reasoning.text|',
        __offsetBefore: 5,
        __offsetAfter: 8,
        __metadataDigest: 'abc',
      },
    ]

    const result = repo.appendReasoningDetailSegments({ messageId: 'm1', details })

    // 不变式 1: received == inserted + ignored + skipped
    const received = details.length
    expect(result.inserted! + result.ignored! + result.skipped!).toBe(received)

    // 不变式 2: totalDeltaLen == sumDeltaLenInserted
    const totalDeltaLen = details.reduce((sum, d) => {
      return sum + ((d.__deltaText ?? '').length)
    }, 0)
    expect(result.sumDeltaLenInserted).toBe(totalDeltaLen)
    expect(result.inserted).toBe(3)
    expect(result.skipped).toBe(0)
    expect(result.ignored).toBe(0)
  })

  it('重复投递被 fingerprint 约束拒绝 (ignored)', () => {
    const detail = {
      type: 'reasoning.text',
      text: 'hello',
      __deltaText: 'hello',
      __isSnapshot: false,
      __hasNewMetadata: false,
      __key: '||reasoning.text|',
      __offsetBefore: 0,
      __offsetAfter: 5,
      __metadataDigest: 'xyz',
    }

    const r1 = repo.appendReasoningDetailSegments({ messageId: 'm1', details: [detail] })
    expect(r1.inserted).toBe(1)
    expect(r1.ignored).toBe(0)

    // 完全相同的 detail 再次投递
    const r2 = repo.appendReasoningDetailSegments({ messageId: 'm1', details: [detail] })
    expect(r2.inserted).toBe(0)
    expect(r2.ignored).toBe(1) // fingerprint 冲突
  })

  it('相同 deltaText 不同 offsetBefore 都能插入', () => {
    const d1 = {
      type: 'reasoning.text',
      text: '好',
      __deltaText: '好',
      __isSnapshot: false,
      __hasNewMetadata: false,
      __key: '||reasoning.text|',
      __offsetBefore: 0,
      __offsetAfter: 1,
      __metadataDigest: 'meta1',
    }
    const d2 = {
      type: 'reasoning.text',
      text: '好好',
      __deltaText: '好', // 相同的 deltaText
      __isSnapshot: true,
      __hasNewMetadata: false,
      __key: '||reasoning.text|',
      __offsetBefore: 1, // 不同的 offsetBefore
      __offsetAfter: 2,
      __metadataDigest: 'meta1',
    }

    const r1 = repo.appendReasoningDetailSegments({ messageId: 'm1', details: [d1] })
    const r2 = repo.appendReasoningDetailSegments({ messageId: 'm1', details: [d2] })

    expect(r1.inserted).toBe(1)
    expect(r2.inserted).toBe(1)
    expect(r2.ignored).toBe(0)
  })

  it('snapshot + no-delta + no-metadata 被 skip', () => {
    const d1 = {
      type: 'reasoning.text',
      text: 'hello',
      __deltaText: 'hello',
      __isSnapshot: false,
      __hasNewMetadata: false,
      __key: '||reasoning.text|',
      __offsetBefore: 0,
      __offsetAfter: 5,
      __metadataDigest: 'meta1',
    }
    const d2 = {
      type: 'reasoning.text',
      text: 'hello', // 相同的完整 text
      __deltaText: '', // 空增量
      __isSnapshot: true, // 快照语义
      __hasNewMetadata: false, // 无新 metadata
      __key: '||reasoning.text|',
      __offsetBefore: 5,
      __offsetAfter: 5,
      __metadataDigest: 'meta1',
    }

    const r1 = repo.appendReasoningDetailSegments({ messageId: 'm1', details: [d1] })
    const r2 = repo.appendReasoningDetailSegments({ messageId: 'm1', details: [d2] })

    expect(r1.inserted).toBe(1)
    expect(r2.skipped).toBe(1) // 无增量 + 无新 metadata → skip
    expect(r2.inserted).toBe(0)
  })

  it('metadata-only segment (hasNewMetadata=true) 不被 skip', () => {
    const d1 = {
      type: 'reasoning.text',
      text: 'hello',
      __deltaText: 'hello',
      __isSnapshot: false,
      __hasNewMetadata: false,
      __key: '||reasoning.text|',
      __offsetBefore: 0,
      __offsetAfter: 5,
      __metadataDigest: 'meta1',
    }
    const d2 = {
      type: 'reasoning.text',
      text: 'hello',
      signature: 'final-sig', // 新增 signature
      __deltaText: '', // 无增量
      __isSnapshot: true,
      __hasNewMetadata: true, // 有新 metadata！
      __key: '||reasoning.text|',
      __offsetBefore: 5,
      __offsetAfter: 5,
      __metadataDigest: 'meta2', // digest 变化
    }

    const r1 = repo.appendReasoningDetailSegments({ messageId: 'm1', details: [d1] })
    const r2 = repo.appendReasoningDetailSegments({ messageId: 'm1', details: [d2] })

    expect(r1.inserted).toBe(1)
    expect(r2.inserted).toBe(1) // 有新 metadata → 必须落库
    expect(r2.skipped).toBe(0)
  })

  /**
   * 核心不变式 3: replay 一致性
   * append 写入的数据经过 aggregator 重建后与原始输入一致
   */
  it('replay 一致性：aggregator 重建与原始输入一致', () => {
    const originalText = '好的，用户问的是什么问题呢？'
    const chunks = ['好的', '，用户', '问的是', '什么问题', '呢？']

    let offset = 0
    const details = chunks.map((chunk, i) => {
      const detail = {
        type: 'reasoning.text',
        text: originalText.substring(0, offset + chunk.length), // 模拟快照语义
        __deltaText: chunk,
        __isSnapshot: i > 0, // 第一个是 delta，后续是 snapshot
        __hasNewMetadata: false,
        __key: '||reasoning.text|',
        __offsetBefore: offset,
        __offsetAfter: offset + chunk.length,
        __metadataDigest: 'stable',
      }
      offset += chunk.length
      return detail
    })

    repo.appendReasoningDetailSegments({ messageId: 'm1', details })

    // 读取 segments
    const segments = db.prepare(`
      SELECT
        segment_id as segmentId,
        detail_id as detailId,
        format,
        detail_index as 'index',
        type,
        payload,
        delta_text as deltaText,
        delta_data as deltaData,
        delta_summary as deltaSummary
      FROM message_reasoning_detail_segments
      WHERE message_id = ?
      ORDER BY segment_id
    `).all('m1')

    // 使用 aggregator 重建
    const rebuilt = buildReasoningDetailsArray(segments as any)

    expect(rebuilt).toHaveLength(1)
    expect((rebuilt[0] as any).text).toBe(originalText)
  })

  it('多 key 并行场景的 replay 一致性', () => {
    const details = [
      // key1: reasoning.text
      {
        id: 'k1',
        type: 'reasoning.text',
        text: 'A',
        __deltaText: 'A',
        __isSnapshot: false,
        __hasNewMetadata: false,
        __key: 'k1||reasoning.text|',
        __offsetBefore: 0,
        __offsetAfter: 1,
        __metadataDigest: 'm1',
      },
      // key2: reasoning.summary
      {
        id: 'k2',
        type: 'reasoning.summary',
        summary: 'X',
        __deltaSummary: 'X',
        __isSnapshot: false,
        __hasNewMetadata: false,
        __key: 'k2||reasoning.summary|',
        __offsetBefore: 0,
        __offsetAfter: 1,
        __metadataDigest: 'm2',
      },
      // key1 继续
      {
        id: 'k1',
        type: 'reasoning.text',
        text: 'AB',
        __deltaText: 'B',
        __isSnapshot: true,
        __hasNewMetadata: false,
        __key: 'k1||reasoning.text|',
        __offsetBefore: 1,
        __offsetAfter: 2,
        __metadataDigest: 'm1',
      },
      // key2 继续
      {
        id: 'k2',
        type: 'reasoning.summary',
        summary: 'XY',
        __deltaSummary: 'Y',
        __isSnapshot: true,
        __hasNewMetadata: false,
        __key: 'k2||reasoning.summary|',
        __offsetBefore: 1,
        __offsetAfter: 2,
        __metadataDigest: 'm2',
      },
    ]

    repo.appendReasoningDetailSegments({ messageId: 'm1', details })

    const segments = db.prepare(`
      SELECT
        segment_id as segmentId,
        detail_id as detailId,
        format,
        detail_index as 'index',
        type,
        payload,
        delta_text as deltaText,
        delta_data as deltaData,
        delta_summary as deltaSummary
      FROM message_reasoning_detail_segments
      WHERE message_id = ?
      ORDER BY segment_id
    `).all('m1')

    const rebuilt = buildReasoningDetailsArray(segments as any)

    expect(rebuilt).toHaveLength(2)

    const k1 = rebuilt.find((r: any) => r.id === 'k1') as any
    const k2 = rebuilt.find((r: any) => r.id === 'k2') as any

    expect(k1.text).toBe('AB')
    expect(k2.summary).toBe('XY')
  })

  it('encrypted 模型场景 (deltaData)', () => {
    const details = [
      {
        id: 'enc',
        type: 'reasoning.data',
        data: 'encrypted-chunk-1',
        __deltaData: 'encrypted-chunk-1',
        __isSnapshot: false,
        __hasNewMetadata: false,
        __key: 'enc||reasoning.data|',
        __offsetBefore: 0,
        __offsetAfter: 17,
        __metadataDigest: 'e1',
      },
      {
        id: 'enc',
        type: 'reasoning.data',
        data: 'encrypted-chunk-1encrypted-chunk-2',
        __deltaData: 'encrypted-chunk-2',
        __isSnapshot: true,
        __hasNewMetadata: false,
        __key: 'enc||reasoning.data|',
        __offsetBefore: 17,
        __offsetAfter: 34,
        __metadataDigest: 'e1',
      },
    ]

    const result = repo.appendReasoningDetailSegments({ messageId: 'm1', details })

    // 不变式
    expect(result.inserted! + result.ignored! + result.skipped!).toBe(2)
    expect(result.sumDeltaLenInserted).toBe(34) // 17 + 17

    // replay
    const segments = db.prepare(`
      SELECT
        segment_id as segmentId,
        detail_id as detailId,
        format,
        detail_index as 'index',
        type,
        payload,
        delta_text as deltaText,
        delta_data as deltaData,
        delta_summary as deltaSummary
      FROM message_reasoning_detail_segments
      WHERE message_id = ?
      ORDER BY segment_id
    `).all('m1')

    const rebuilt = buildReasoningDetailsArray(segments as any)
    expect(rebuilt).toHaveLength(1)
    expect((rebuilt[0] as any).data).toBe('encrypted-chunk-1encrypted-chunk-2')
  })
})
