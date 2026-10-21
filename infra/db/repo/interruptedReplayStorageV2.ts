import { createHash } from 'node:crypto'
import type BetterSqlite3 from 'better-sqlite3'
import {
  GENERATION_INTERRUPTED_REPLAY_CANONICAL_MAX_BYTES_V1,
  GENERATION_INTERRUPTED_REPLAY_CHUNK_MAX_RAW_BYTES_V1,
  GENERATION_INTERRUPTED_REPLAY_INLINE_MAX_BYTES_V1,
  GENERATION_INTERRUPTED_REPLAY_MANIFEST_MAX_BYTES_V1,
  GENERATION_INTERRUPTED_REPLAY_MAX_CHUNKS_V1,
} from '../../../src/core/generation-v2/capacity/generationCapacityV1'

export type InterruptedReplayStorageKeyV2 = Readonly<{
  operationId: string
  answerRootId: string
  requestSequence: number
}>

type InterruptedReplayStorageManifestV1 = Readonly<{
  interruptedReplayStorageVersion: 1
  operationId: string
  answerRootId: string
  requestSequence: number
  rawByteLength: number
  rawSha256: string
  chunkHashes: readonly string[]
}>

type ChunkRow = Readonly<{ rawByteLength: unknown; contentBase64: unknown }>
type JsonObject = Readonly<Record<string, unknown>>

const HASH_PATTERN = /^[0-9a-f]{64}$/u
const MANIFEST_FIELDS = [
  'answerRootId', 'chunkHashes', 'interruptedReplayStorageVersion', 'operationId',
  'rawByteLength', 'rawSha256', 'requestSequence',
] as const

export class InterruptedReplayStorageV2Error extends Error {
  constructor(readonly code: 'GENERATION_V2_INTERRUPTED_REPLAY_STORAGE_INVALID') {
    super(code)
    this.name = 'InterruptedReplayStorageV2Error'
  }
}

function invalid(): never {
  throw new InterruptedReplayStorageV2Error('GENERATION_V2_INTERRUPTED_REPLAY_STORAGE_INVALID')
}

function sha256(bytes: Uint8Array): string {
  return createHash('sha256').update(bytes).digest('hex')
}

function validateKey(key: InterruptedReplayStorageKeyV2): void {
  if (!key || typeof key !== 'object' || typeof key.operationId !== 'string' || key.operationId.length < 1 ||
      key.operationId.length > 512 || typeof key.answerRootId !== 'string' || key.answerRootId.length < 1 ||
      key.answerRootId.length > 512 || !Number.isSafeInteger(key.requestSequence) || key.requestSequence < 1) invalid()
}

function validateSnapshotHash(snapshotHash: string): void {
  if (typeof snapshotHash !== 'string' || !HASH_PATTERN.test(snapshotHash)) invalid()
}

function parseObject(json: string): JsonObject {
  let value: unknown
  try { value = JSON.parse(json) } catch { return invalid() }
  if (!value || typeof value !== 'object' || Array.isArray(value) || Object.getPrototypeOf(value) !== Object.prototype) invalid()
  return value as JsonObject
}

function validateRawJson(rawJson: string, snapshotHash: string): Buffer {
  if (typeof rawJson !== 'string') return invalid()
  const bytes = Buffer.from(rawJson, 'utf8')
  if (bytes.toString('utf8') !== rawJson || bytes.byteLength < 2 ||
      bytes.byteLength > GENERATION_INTERRUPTED_REPLAY_CANONICAL_MAX_BYTES_V1) invalid()
  parseObject(rawJson)
  if (sha256(bytes) !== snapshotHash) invalid()
  return bytes
}

function storeChunk(db: BetterSqlite3.Database, bytes: Buffer): string {
  const contentHash = sha256(bytes)
  const contentBase64 = bytes.toString('base64')
  db.prepare(`INSERT INTO generation_interrupted_replay_content_chunk_v2
    (content_sha256,raw_byte_length,content_base64) VALUES(?,?,?)
    ON CONFLICT(content_sha256) DO NOTHING`).run(contentHash, bytes.byteLength, contentBase64)
  const existing = db.prepare(`SELECT raw_byte_length AS rawByteLength,content_base64 AS contentBase64
    FROM generation_interrupted_replay_content_chunk_v2 WHERE content_sha256=?`).get(contentHash) as ChunkRow | undefined
  if (!existing || existing.rawByteLength !== bytes.byteLength || existing.contentBase64 !== contentBase64) invalid()
  return contentHash
}

/** Store exact canonical snapshot bytes inline when small or as immutable content-addressed chunks. */
export function storeInterruptedReplayJsonV2(
  db: BetterSqlite3.Database,
  key: InterruptedReplayStorageKeyV2,
  rawJson: string,
  snapshotHash: string,
): string {
  validateKey(key)
  validateSnapshotHash(snapshotHash)
  if (!db.inTransaction) invalid()
  const bytes = validateRawJson(rawJson, snapshotHash)
  if (bytes.byteLength <= GENERATION_INTERRUPTED_REPLAY_INLINE_MAX_BYTES_V1) return rawJson

  const chunkHashes: string[] = []
  for (let offset = 0; offset < bytes.byteLength; offset += GENERATION_INTERRUPTED_REPLAY_CHUNK_MAX_RAW_BYTES_V1) {
    chunkHashes.push(storeChunk(db, bytes.subarray(offset, Math.min(
      offset + GENERATION_INTERRUPTED_REPLAY_CHUNK_MAX_RAW_BYTES_V1,
      bytes.byteLength,
    ))))
  }
  if (chunkHashes.length < 1 || chunkHashes.length > GENERATION_INTERRUPTED_REPLAY_MAX_CHUNKS_V1) invalid()
  const manifest: InterruptedReplayStorageManifestV1 = Object.freeze({
    interruptedReplayStorageVersion: 1,
    operationId: key.operationId,
    answerRootId: key.answerRootId,
    requestSequence: key.requestSequence,
    rawByteLength: bytes.byteLength,
    rawSha256: snapshotHash,
    chunkHashes: Object.freeze(chunkHashes),
  })
  const manifestJson = JSON.stringify(manifest)
  if (Buffer.byteLength(manifestJson, 'utf8') > GENERATION_INTERRUPTED_REPLAY_MANIFEST_MAX_BYTES_V1) invalid()
  return manifestJson
}

function decodeManifest(
  value: JsonObject,
  key: InterruptedReplayStorageKeyV2,
  snapshotHash: string,
): InterruptedReplayStorageManifestV1 {
  if (Object.keys(value).sort().join('\0') !== [...MANIFEST_FIELDS].sort().join('\0') ||
      value.interruptedReplayStorageVersion !== 1 || value.operationId !== key.operationId ||
      value.answerRootId !== key.answerRootId || value.requestSequence !== key.requestSequence ||
      !Number.isSafeInteger(value.rawByteLength) || (value.rawByteLength as number) <= GENERATION_INTERRUPTED_REPLAY_INLINE_MAX_BYTES_V1 ||
      (value.rawByteLength as number) > GENERATION_INTERRUPTED_REPLAY_CANONICAL_MAX_BYTES_V1 ||
      value.rawSha256 !== snapshotHash || !Array.isArray(value.chunkHashes) || value.chunkHashes.length < 1 ||
      value.chunkHashes.length > GENERATION_INTERRUPTED_REPLAY_MAX_CHUNKS_V1 ||
      value.chunkHashes.some(hash => typeof hash !== 'string' || !HASH_PATTERN.test(hash))) invalid()
  const byteLength = value.rawByteLength as number
  if (Math.ceil(byteLength / GENERATION_INTERRUPTED_REPLAY_CHUNK_MAX_RAW_BYTES_V1) !== value.chunkHashes.length) invalid()
  return value as InterruptedReplayStorageManifestV1
}

function loadChunks(db: BetterSqlite3.Database, manifest: InterruptedReplayStorageManifestV1): Buffer {
  const chunks: Buffer[] = []
  let total = 0
  for (const contentHash of manifest.chunkHashes) {
    const row = db.prepare(`SELECT raw_byte_length AS rawByteLength,content_base64 AS contentBase64
      FROM generation_interrupted_replay_content_chunk_v2 WHERE content_sha256=?`).get(contentHash) as ChunkRow | undefined
    if (!row || typeof row.rawByteLength !== 'number' || !Number.isSafeInteger(row.rawByteLength) ||
        typeof row.contentBase64 !== 'string') invalid()
    const expectedLength = Math.min(
      GENERATION_INTERRUPTED_REPLAY_CHUNK_MAX_RAW_BYTES_V1,
      manifest.rawByteLength - total,
    )
    if (row.rawByteLength !== expectedLength || row.rawByteLength < 1 ||
        row.rawByteLength > GENERATION_INTERRUPTED_REPLAY_CHUNK_MAX_RAW_BYTES_V1) invalid()
    const bytes = Buffer.from(row.contentBase64, 'base64')
    if (bytes.byteLength !== row.rawByteLength || bytes.toString('base64') !== row.contentBase64 ||
        sha256(bytes) !== contentHash) invalid()
    total += bytes.byteLength
    chunks.push(bytes)
  }
  if (total !== manifest.rawByteLength) invalid()
  return Buffer.concat(chunks, total)
}

/** Reassemble a manifest or validate and return a legacy inline snapshot row. */
export function loadInterruptedReplayJsonV2(
  db: BetterSqlite3.Database,
  key: InterruptedReplayStorageKeyV2,
  storedJson: string,
  snapshotHash: string,
): string {
  validateKey(key)
  validateSnapshotHash(snapshotHash)
  if (!db.inTransaction || typeof storedJson !== 'string' ||
      Buffer.byteLength(storedJson, 'utf8') > GENERATION_INTERRUPTED_REPLAY_CANONICAL_MAX_BYTES_V1) invalid()
  const stored = parseObject(storedJson)
  if (stored.interruptedReplayStorageVersion === undefined) {
    validateRawJson(storedJson, snapshotHash)
    return storedJson
  }
  if (Buffer.byteLength(storedJson, 'utf8') > GENERATION_INTERRUPTED_REPLAY_MANIFEST_MAX_BYTES_V1) invalid()
  const manifest = decodeManifest(stored, key, snapshotHash)
  const bytes = loadChunks(db, manifest)
  if (sha256(bytes) !== snapshotHash) invalid()
  const rawJson = bytes.toString('utf8')
  if (!Buffer.from(rawJson, 'utf8').equals(bytes) || Buffer.byteLength(rawJson, 'utf8') !== manifest.rawByteLength) invalid()
  parseObject(rawJson)
  return rawJson
}
