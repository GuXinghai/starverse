/**
 * tc19-reasoning-stress.mjs
 * 
 * Reasoning segment 压力回归测试脚本
 * 
 * 目标：
 * 1. 使用固定种子 RNG 生成可复现的测试场景
 * 2. 混合测试：snapshot/delta、重传、metadata-only、并行 key
 * 3. 验证核心不变式：inserted + ignored + skipped === received
 * 4. 验证 aggregator 重建一致性：mismatch === 0
 * 
 * 使用方法：
 *   node scripts/gates/tc19-reasoning-stress.mjs
 */

import Database from 'better-sqlite3'
import * as crypto from 'node:crypto'

// ============================================================================
// 固定种子 RNG (Mulberry32)
// ============================================================================
function mulberry32(seed) {
  return function () {
    let t = (seed += 0x6d2b79f5)
    t = Math.imul(t ^ (t >>> 15), t | 1)
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61)
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296
  }
}

const SEED = 20250613
const rng = mulberry32(SEED)

function randomInt(min, max) {
  return Math.floor(rng() * (max - min + 1)) + min
}

function randomChoice(arr) {
  return arr[Math.floor(rng() * arr.length)]
}

function randomString(len) {
  const chars = 'abcdefghijklmnopqrstuvwxyz'
  let s = ''
  for (let i = 0; i < len; i++) {
    s += chars[Math.floor(rng() * chars.length)]
  }
  return s
}

// ============================================================================
// 辅助函数
// ============================================================================
function computeFingerprint(
  key,
  offsetBefore,
  deltaText,
  deltaSummary,
  deltaData,
  metadataDigest
) {
  const raw = `${key}|${offsetBefore}|${deltaText ?? ''}|${deltaSummary ?? ''}|${deltaData ?? ''}|${metadataDigest ?? ''}`
  return crypto.createHash('sha256').update(raw, 'utf8').digest('hex').slice(0, 16)
}

function computeMetadataDigest(detail) {
  const parts = [
    detail.signature ?? '',
    detail.encrypted ? '1' : '0',
    detail.redacted ? '1' : '0',
    detail.modelId ?? ''
  ]
  return crypto.createHash('sha256').update(parts.join('|'), 'utf8').digest('hex').slice(0, 8)
}

// ============================================================================
// Schema 初始化
// ============================================================================
function initSchema(db) {
  db.exec(`
    CREATE TABLE IF NOT EXISTS convo (
      id TEXT PRIMARY KEY,
      title TEXT,
      created_at INTEGER,
      updated_at INTEGER,
      pinned INTEGER DEFAULT 0
    );

    CREATE TABLE IF NOT EXISTS message (
      id TEXT PRIMARY KEY,
      convo_id TEXT NOT NULL,
      role TEXT NOT NULL,
      content TEXT,
      created_at INTEGER,
      parent_id TEXT,
      reasoning_details TEXT,
      model TEXT,
      usage TEXT,
      FOREIGN KEY (convo_id) REFERENCES convo(id) ON DELETE CASCADE
    );

    CREATE TABLE IF NOT EXISTS message_reasoning_detail_segments (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      message_id TEXT NOT NULL,
      key TEXT NOT NULL,
      type TEXT NOT NULL,
      offset_before INTEGER NOT NULL,
      delta_text TEXT,
      delta_summary TEXT,
      delta_data TEXT,
      payload TEXT NOT NULL,
      fingerprint TEXT NOT NULL,
      created_at INTEGER NOT NULL,
      FOREIGN KEY (message_id) REFERENCES message(id) ON DELETE CASCADE
    );

    CREATE UNIQUE INDEX IF NOT EXISTS idx_segment_fingerprint 
      ON message_reasoning_detail_segments(message_id, fingerprint);
  `)
}

// ============================================================================
// Segment 追加逻辑 (简化版本，与 messageRepo 逻辑一致)
// ============================================================================
function appendSegments(db, messageId, details) {
  const insertStmt = db.prepare(`
    INSERT INTO message_reasoning_detail_segments
      (message_id, key, type, offset_before, delta_text, delta_summary, delta_data, payload, fingerprint, created_at)
    VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
  `)

  const checkStmt = db.prepare(`
    SELECT 1 FROM message_reasoning_detail_segments
    WHERE message_id = ? AND fingerprint = ?
  `)

  let inserted = 0
  let ignored = 0
  let skipped = 0
  let sumDeltaLenInserted = 0

  for (const d of details) {
    const key = `${d.key ?? ''}|${d.modelId ?? ''}|${d.type}|${d.encrypted ? 'e' : ''}`
    const offsetBefore = d.offsetBefore ?? 0
    const type = d.type
    const deltaText = d.deltaText ?? null
    const deltaSummary = d.deltaSummary ?? null
    const deltaData = d.deltaData ?? null
    const metadataDigest = computeMetadataDigest(d)
    const fingerprint = computeFingerprint(key, offsetBefore, deltaText, deltaSummary, deltaData, metadataDigest)

    const isSnapshot = d.__isSnapshot === true
    const hasAnyDelta = !!(deltaText || deltaSummary || deltaData)
    const hasNewMetadata = !!(d.signature || d.encrypted || d.redacted || d.modelId)

    // Skip 规则
    if (isSnapshot && !hasAnyDelta && !hasNewMetadata) {
      skipped++
      continue
    }

    // Fingerprint 冲突检查
    const exists = checkStmt.get(messageId, fingerprint)
    if (exists) {
      ignored++
      continue
    }

    // 插入
    const payload = JSON.stringify(d)
    const createdAt = Date.now()
    insertStmt.run(messageId, key, type, offsetBefore, deltaText, deltaSummary, deltaData, payload, fingerprint, createdAt)

    inserted++
    sumDeltaLenInserted += (deltaText?.length ?? 0) + (deltaSummary?.length ?? 0) + (deltaData?.length ?? 0)
  }

  return { received: details.length, inserted, ignored, skipped, sumDeltaLenInserted }
}

// ============================================================================
// Aggregator 重建逻辑 (简化版本)
// ============================================================================
function buildReasoningDetailsArray(db, messageId) {
  const rows = db.prepare(`
    SELECT key, type, offset_before, delta_text, delta_summary, delta_data, payload
    FROM message_reasoning_detail_segments
    WHERE message_id = ?
    ORDER BY key ASC, offset_before ASC
  `).all(messageId)

  const groups = new Map()
  for (const row of rows) {
    if (!groups.has(row.key)) {
      groups.set(row.key, [])
    }
    groups.get(row.key).push(row)
  }

  const results = []
  for (const [key, segments] of groups) {
    let text = ''
    let summary = ''
    let data = ''
    let signature = null
    let encrypted = false
    let redacted = false
    let modelId = null
    let type = 'reasoning.text'
    let keyField = null

    for (const seg of segments) {
      // 优先使用 delta 列
      text += seg.delta_text ?? ''
      summary += seg.delta_summary ?? ''
      data += seg.delta_data ?? ''

      // 解析 payload 获取 metadata
      try {
        const p = JSON.parse(seg.payload)
        if (p.signature) signature = p.signature
        if (p.encrypted) encrypted = p.encrypted
        if (p.redacted) redacted = p.redacted
        if (p.modelId) modelId = p.modelId
        if (p.type) type = p.type
        if (p.key) keyField = p.key
      } catch {}
    }

    // 构建结果
    const result = { type }
    if (keyField) result.key = keyField
    if (text) result.text = text
    if (summary) result.summary = summary
    if (data) result.data = data
    if (signature) result.signature = signature
    if (encrypted) result.encrypted = encrypted
    if (redacted) result.redacted = redacted
    if (modelId) result.modelId = modelId

    results.push(result)
  }

  return results
}

// ============================================================================
// 测试场景生成
// ============================================================================
function generateTestScenario() {
  const scenario = {
    name: '',
    details: [],
    expectedTexts: new Map() // key -> expected final text
  }

  const scenarioType = randomChoice(['delta_stream', 'retransmit', 'metadata_only', 'multi_key', 'mixed'])

  switch (scenarioType) {
    case 'delta_stream': {
      // 正常 delta 流
      scenario.name = 'delta_stream'
      const count = randomInt(3, 10)
      const key = randomString(4)
      let offset = 0
      let expectedText = ''
      for (let i = 0; i < count; i++) {
        const delta = randomString(randomInt(1, 5))
        scenario.details.push({
          type: 'reasoning.text',
          key,
          offsetBefore: offset,
          deltaText: delta
        })
        offset += delta.length
        expectedText += delta
      }
      scenario.expectedTexts.set(`${key}||reasoning.text|`, expectedText)
      break
    }

    case 'retransmit': {
      // 重传场景
      scenario.name = 'retransmit'
      const delta = randomString(5)
      const key = randomString(4)
      scenario.details.push({
        type: 'reasoning.text',
        key,
        offsetBefore: 0,
        deltaText: delta
      })
      // 重传同一个
      scenario.details.push({
        type: 'reasoning.text',
        key,
        offsetBefore: 0,
        deltaText: delta
      })
      scenario.expectedTexts.set(`${key}||reasoning.text|`, delta)
      break
    }

    case 'metadata_only': {
      // metadata-only segment
      scenario.name = 'metadata_only'
      const key = randomString(4)
      const delta = randomString(5)
      scenario.details.push({
        type: 'reasoning.text',
        key,
        offsetBefore: 0,
        deltaText: delta
      })
      scenario.details.push({
        type: 'reasoning.text',
        key,
        offsetBefore: delta.length,
        __isSnapshot: true,
        signature: 'sig_' + randomString(8)
      })
      scenario.expectedTexts.set(`${key}||reasoning.text|`, delta)
      break
    }

    case 'multi_key': {
      // 多 key 并行
      scenario.name = 'multi_key'
      const keys = [randomString(4), randomString(4)]
      for (const k of keys) {
        let offset = 0
        let expected = ''
        const count = randomInt(2, 4)
        for (let i = 0; i < count; i++) {
          const delta = randomString(randomInt(1, 3))
          scenario.details.push({
            type: 'reasoning.text',
            key: k,
            offsetBefore: offset,
            deltaText: delta
          })
          offset += delta.length
          expected += delta
        }
        scenario.expectedTexts.set(`${k}||reasoning.text|`, expected)
      }
      break
    }

    case 'mixed': {
      // 混合场景
      scenario.name = 'mixed'
      const key = randomString(4)
      let offset = 0
      let expected = ''
      // 几个 delta
      for (let i = 0; i < 3; i++) {
        const delta = randomString(2)
        scenario.details.push({
          type: 'reasoning.text',
          key,
          offsetBefore: offset,
          deltaText: delta
        })
        offset += delta.length
        expected += delta
      }
      // 一个 snapshot (会被 skip)
      scenario.details.push({
        type: 'reasoning.text',
        key,
        offsetBefore: offset,
        __isSnapshot: true
      })
      // 一个带 metadata 的 snapshot (不会被 skip)
      scenario.details.push({
        type: 'reasoning.text',
        key,
        offsetBefore: offset,
        __isSnapshot: true,
        signature: 'final_sig'
      })
      scenario.expectedTexts.set(`${key}||reasoning.text|`, expected)
      break
    }
  }

  return scenario
}

// ============================================================================
// 主测试逻辑
// ============================================================================
function runStressTest() {
  console.log('=' .repeat(80))
  console.log('TC19: Reasoning Segment Stress Test')
  console.log('=' .repeat(80))
  console.log(`Seed: ${SEED}`)
  console.log()

  const db = new Database(':memory:')
  initSchema(db)

  // 创建测试 convo 和 message
  db.prepare(`INSERT INTO convo (id, title, created_at, updated_at) VALUES (?, ?, ?, ?)`).run('c1', 'Test', Date.now(), Date.now())
  db.prepare(`INSERT INTO message (id, convo_id, role, content, created_at) VALUES (?, ?, ?, ?, ?)`).run('m1', 'c1', 'assistant', '', Date.now())

  const NUM_SCENARIOS = 100
  let totalReceived = 0
  let totalInserted = 0
  let totalIgnored = 0
  let totalSkipped = 0
  let totalMismatch = 0
  let scenarioPassed = 0
  let scenarioFailed = 0

  console.log(`Running ${NUM_SCENARIOS} random scenarios...`)
  console.log()

  for (let i = 0; i < NUM_SCENARIOS; i++) {
    const scenario = generateTestScenario()
    const messageId = `m_${i}`

    // 创建 message
    db.prepare(`INSERT INTO message (id, convo_id, role, content, created_at) VALUES (?, ?, ?, ?, ?)`).run(messageId, 'c1', 'assistant', '', Date.now())

    // 追加 segments
    const stats = appendSegments(db, messageId, scenario.details)
    totalReceived += stats.received
    totalInserted += stats.inserted
    totalIgnored += stats.ignored
    totalSkipped += stats.skipped

    // 核心不变式检查
    const invariant1 = stats.inserted + stats.ignored + stats.skipped === stats.received
    if (!invariant1) {
      console.error(`[FAIL] Scenario ${i} (${scenario.name}): Invariant 1 violated`)
      console.error(`  received=${stats.received}, inserted=${stats.inserted}, ignored=${stats.ignored}, skipped=${stats.skipped}`)
      scenarioFailed++
      totalMismatch++
      continue
    }

    // Aggregator 重建检查
    const rebuilt = buildReasoningDetailsArray(db, messageId)
    let mismatch = false
    for (const [key, expectedText] of scenario.expectedTexts) {
      const found = rebuilt.find(r => {
        const rKey = `${r.key ?? ''}||${r.type}|${r.encrypted ? 'e' : ''}`
        return rKey === key
      })
      const actualText = found?.text ?? ''
      if (actualText !== expectedText) {
        console.error(`[FAIL] Scenario ${i} (${scenario.name}): Text mismatch for key "${key}"`)
        console.error(`  expected: "${expectedText}"`)
        console.error(`  actual:   "${actualText}"`)
        mismatch = true
      }
    }

    if (mismatch) {
      scenarioFailed++
      totalMismatch++
    } else {
      scenarioPassed++
    }
  }

  console.log()
  console.log('=' .repeat(80))
  console.log('Summary')
  console.log('=' .repeat(80))
  console.log()
  console.log(`Scenarios:  ${scenarioPassed} passed, ${scenarioFailed} failed`)
  console.log()
  console.log('Aggregate Statistics:')
  console.log(`  Total received:  ${totalReceived}`)
  console.log(`  Total inserted:  ${totalInserted}`)
  console.log(`  Total ignored:   ${totalIgnored}`)
  console.log(`  Total skipped:   ${totalSkipped}`)
  console.log()
  console.log('Core Invariants:')
  console.log(`  [${totalMismatch === 0 ? '✓' : '✗'}] mismatch === 0: ${totalMismatch === 0} (actual: ${totalMismatch})`)
  console.log(`  [${totalInserted + totalIgnored + totalSkipped === totalReceived ? '✓' : '✗'}] inserted + ignored + skipped === received: ${totalInserted + totalIgnored + totalSkipped === totalReceived}`)
  console.log()

  db.close()

  if (totalMismatch > 0 || scenarioFailed > 0) {
    console.error('❌ STRESS TEST FAILED')
    process.exit(1)
  }

  console.log('✅ STRESS TEST PASSED')
  process.exit(0)
}

runStressTest()
