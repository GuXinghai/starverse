import { createHash } from 'node:crypto'
import path from 'node:path'
import BetterSqlite3 from 'better-sqlite3'
import { describe, expect, it } from 'vitest'
import { applyGenerationV2SchemaForTest } from '../v2/testSchemaV2'
import {
  GENERATION_INTERRUPTED_REPLAY_INLINE_MAX_BYTES_V1,
} from '../../../src/core/generation-v2/capacity/generationCapacityV1'
import {
  loadInterruptedReplayJsonV2,
  storeInterruptedReplayJsonV2,
} from './interruptedReplayStorageV2'

const root = path.resolve(process.cwd())
const hash = (value: string) => createHash('sha256').update(value, 'utf8').digest('hex')

function createDb() {
  const db = new BetterSqlite3(':memory:')
  applyGenerationV2SchemaForTest(db, root)
  return db
}

describe('interrupted replay content storage', () => {
  it('preserves small legacy-compatible inline snapshots and verifies their row hash', () => {
    const db = createDb()
    const key = { operationId: 'operation:1', answerRootId: 'answer:1', requestSequence: 1 }
    const rawJson = JSON.stringify({ schemaVersion: 1, replay: [{ role: 'user', content: 'hello' }] })
    try {
      const storedJson = db.transaction(() => storeInterruptedReplayJsonV2(db, key, rawJson, hash(rawJson)))()
      expect(storedJson).toBe(rawJson)
      expect(db.transaction(() => loadInterruptedReplayJsonV2(db, key, storedJson, hash(rawJson)))()).toBe(rawJson)
      expect(db.prepare('SELECT count(*) AS count FROM generation_interrupted_replay_content_chunk_v2').get())
        .toEqual({ count: 0 })
      expect(() => db.transaction(() => loadInterruptedReplayJsonV2(db, key, rawJson, 'f'.repeat(64)))())
        .toThrow('GENERATION_V2_INTERRUPTED_REPLAY_STORAGE_INVALID')
    } finally { db.close() }
  })

  it('chunks large snapshots, deduplicates content, binds manifests to their row key, and rejects missing chunks', () => {
    const db = createDb()
    const firstKey = { operationId: 'operation:1', answerRootId: 'answer:1', requestSequence: 1 }
    const secondKey = { operationId: 'operation:2', answerRootId: 'answer:2', requestSequence: 1 }
    const rawJson = JSON.stringify({ schemaVersion: 1, replay: 'x'.repeat(GENERATION_INTERRUPTED_REPLAY_INLINE_MAX_BYTES_V1 + 128) })
    const rawHash = hash(rawJson)
    try {
      const firstStored = db.transaction(() => storeInterruptedReplayJsonV2(db, firstKey, rawJson, rawHash))()
      const manifest = JSON.parse(firstStored) as { interruptedReplayStorageVersion: number; chunkHashes: string[] }
      expect(manifest.interruptedReplayStorageVersion).toBe(1)
      expect(Buffer.byteLength(firstStored, 'utf8')).toBeLessThan(64 * 1024)
      const firstChunkCount = (db.prepare('SELECT count(*) AS count FROM generation_interrupted_replay_content_chunk_v2').get() as { count: number }).count
      expect(firstChunkCount).toBeGreaterThan(1)
      const secondStored = db.transaction(() => storeInterruptedReplayJsonV2(db, secondKey, rawJson, rawHash))()
      expect(secondStored).not.toBe(firstStored)
      expect(db.prepare('SELECT count(*) AS count FROM generation_interrupted_replay_content_chunk_v2').get())
        .toEqual({ count: firstChunkCount })
      expect(db.transaction(() => loadInterruptedReplayJsonV2(db, firstKey, firstStored, rawHash))()).toBe(rawJson)
      expect(db.transaction(() => loadInterruptedReplayJsonV2(db, secondKey, secondStored, rawHash))()).toBe(rawJson)
      expect(() => db.transaction(() => loadInterruptedReplayJsonV2(db, secondKey, firstStored, rawHash))())
        .toThrow('GENERATION_V2_INTERRUPTED_REPLAY_STORAGE_INVALID')
      expect(() => db.transaction(() => loadInterruptedReplayJsonV2(db,
        { ...secondKey, operationId: 'operation:wrong' }, firstStored, rawHash))())
        .toThrow('GENERATION_V2_INTERRUPTED_REPLAY_STORAGE_INVALID')
      const firstHash = manifest.chunkHashes[0]
      db.prepare('DELETE FROM generation_interrupted_replay_content_chunk_v2 WHERE content_sha256=?').run(firstHash)
      expect(() => db.transaction(() => loadInterruptedReplayJsonV2(db, firstKey, firstStored, rawHash))())
        .toThrow('GENERATION_V2_INTERRUPTED_REPLAY_STORAGE_INVALID')
    } finally { db.close() }
  })

  it('requires a caller-owned transaction and rejects oversize or non-object snapshot JSON', () => {
    const db = createDb()
    const key = { operationId: 'operation:1', answerRootId: 'answer:1', requestSequence: 1 }
    try {
      expect(() => storeInterruptedReplayJsonV2(db, key, '{}', hash('{}')))
        .toThrow('GENERATION_V2_INTERRUPTED_REPLAY_STORAGE_INVALID')
      const arrayJson = '[]'
      expect(() => db.transaction(() => storeInterruptedReplayJsonV2(db, key, arrayJson, hash(arrayJson)))())
        .toThrow('GENERATION_V2_INTERRUPTED_REPLAY_STORAGE_INVALID')
    } finally { db.close() }
  })
})
