import BetterSqlite3 from 'better-sqlite3'
import { describe, expect, it } from 'vitest'
import {
  loadNativeArtifactJsonV2,
  NativeArtifactStorageV2Error,
  storeNativeArtifactJsonV2,
} from './nativeArtifactStorageV2'

const HASH = 'a'.repeat(64)
const ARTIFACT_KIND = 'storage_fixture_v1'
const CHUNK_BYTES = 1 * 1_024 * 1_024

function createDb(): BetterSqlite3.Database {
  const db = new BetterSqlite3(':memory:')
  db.exec(`CREATE TABLE generation_native_artifact_content_chunk_v2 (
    content_sha256 TEXT PRIMARY KEY,
    raw_byte_length INTEGER NOT NULL,
    content_base64 TEXT NOT NULL
  )`)
  return db
}

function codecJson(payload: string): string {
  return JSON.stringify({ artifactKind: ARTIFACT_KIND, artifactCodecVersion: 1, artifactHash: HASH, payload })
}

function key(answerRootId: string) {
  return { operationId: 'operation:storage-test', answerRootId, requestSequence: 1, artifactKind: ARTIFACT_KIND }
}

describe('native artifact content-addressed storage V2', () => {
  it('deduplicates full prefix chunks, reassembles exact UTF-8 bytes, rejects tampering, and rolls back atomically', () => {
    const db = createDb()
    const firstJson = codecJson(`${'x'.repeat(2 * CHUNK_BYTES)}A`)
    const secondJson = codecJson(`${'x'.repeat(2 * CHUNK_BYTES)}B`)
    const envelope = { artifactCodecVersion: 1, artifactHash: HASH }
    const store = db.transaction(() => {
      const firstManifest = storeNativeArtifactJsonV2(db, key('answer:storage-1'), firstJson, envelope)
      const secondManifest = storeNativeArtifactJsonV2(db, key('answer:storage-2'), secondJson, envelope)
      return { firstManifest, secondManifest }
    })()
    const first = JSON.parse(store.firstManifest) as { chunkHashes: string[]; rawByteLength: number }
    const second = JSON.parse(store.secondManifest) as { chunkHashes: string[] }
    expect(first.chunkHashes).toHaveLength(3)
    expect(second.chunkHashes).toHaveLength(3)
    expect(first.chunkHashes.slice(0, 2)).toEqual(second.chunkHashes.slice(0, 2))
    expect(db.prepare('SELECT count(*) AS count FROM generation_native_artifact_content_chunk_v2').get())
      .toEqual({ count: 4 })
    expect(db.transaction(() => loadNativeArtifactJsonV2(db, key('answer:storage-1'), store.firstManifest, envelope))())
      .toBe(firstJson)
    expect(first.rawByteLength).toBe(Buffer.byteLength(firstJson, 'utf8'))

    const damaged = db.prepare('SELECT content_sha256 AS hash FROM generation_native_artifact_content_chunk_v2 LIMIT 1')
      .get() as { hash: string }
    db.prepare('UPDATE generation_native_artifact_content_chunk_v2 SET content_base64=? WHERE content_sha256=?')
      .run('AAAA', damaged.hash)
    expect(() => db.transaction(() => loadNativeArtifactJsonV2(db, key('answer:storage-1'), store.firstManifest, envelope))())
      .toThrow(NativeArtifactStorageV2Error)

    const chunkCountBeforeRollback = db.prepare('SELECT count(*) AS count FROM generation_native_artifact_content_chunk_v2')
      .get() as { count: number }
    const rolledBackStore = db.transaction(() => {
      storeNativeArtifactJsonV2(db, key('answer:storage-rollback'), codecJson('rollback'), envelope)
      throw new Error('fixture rollback')
    })
    expect(() => rolledBackStore()).toThrow('fixture rollback')
    expect(db.prepare('SELECT count(*) AS count FROM generation_native_artifact_content_chunk_v2').get())
      .toEqual(chunkCountBeforeRollback)
    db.close()
  })

  it('passes through legacy inline codecs whose version field is schemaVersion', () => {
    const db = createDb()
    const legacyKind = 'openrouter_chat_ordered_native_messages_v1'
    const legacyHash = 'b'.repeat(64)
    const legacyJson = JSON.stringify({
      schemaVersion: 1,
      artifactKind: legacyKind,
      lineageDepth: 0,
      parentArtifactHash: null,
      orderedMessages: [],
      artifactHash: legacyHash,
    })
    const key = { operationId: 'operation:storage-legacy', answerRootId: 'answer:storage-legacy',
      requestSequence: 1, artifactKind: legacyKind }
    expect(db.transaction(() => loadNativeArtifactJsonV2(db, key, legacyJson, {
      artifactCodecVersion: 1, artifactHash: legacyHash,
    }))()).toBe(legacyJson)
    db.close()
  })
})
