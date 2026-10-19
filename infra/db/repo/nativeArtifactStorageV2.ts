import { createHash } from 'node:crypto'
import type BetterSqlite3 from 'better-sqlite3'
import {
  GENERATION_NATIVE_ARTIFACT_CHUNK_MAX_RAW_BYTES_V1,
  GENERATION_NATIVE_ARTIFACT_MANIFEST_MAX_BYTES_V1,
  GENERATION_NATIVE_ARTIFACT_MAX_BYTES_V1,
  GENERATION_NATIVE_ARTIFACT_MAX_CHUNKS_V1,
} from '../../../src/core/generation-v2/capacity/generationCapacityV1'

export type NativeArtifactStorageKeyV2 = Readonly<{
  operationId: string
  answerRootId: string
  requestSequence: number
  artifactKind: string
}>

export type NativeArtifactStorageEnvelopeV2 = Readonly<{
  artifactCodecVersion: number
  artifactHash: string
}>

type StorageManifestV1 = Readonly<{
  artifactStorageVersion: 1
  artifactKind: string
  artifactCodecVersion: number
  artifactHash: string
  rawByteLength: number
  rawSha256: string
  chunkHashes: readonly string[]
}>

type ChunkRow = Readonly<{ rawByteLength: unknown; contentBase64: unknown }>

const HASH_PATTERN = /^[0-9a-f]{64}$/u
const MANIFEST_FIELDS = [
  'artifactCodecVersion', 'artifactHash', 'artifactKind', 'artifactStorageVersion',
  'chunkHashes', 'rawByteLength', 'rawSha256',
] as const

export class NativeArtifactStorageV2Error extends Error {
  constructor(readonly code: 'GENERATION_V2_NATIVE_ARTIFACT_STORAGE_INVALID') {
    super(code)
    this.name = 'NativeArtifactStorageV2Error'
  }
}

function invalid(): never {
  throw new NativeArtifactStorageV2Error('GENERATION_V2_NATIVE_ARTIFACT_STORAGE_INVALID')
}

function sha256(bytes: Uint8Array): string {
  return createHash('sha256').update(bytes).digest('hex')
}

function validateKey(key: NativeArtifactStorageKeyV2): void {
  if (!key || typeof key !== 'object' || typeof key.operationId !== 'string' || key.operationId.length === 0 ||
      typeof key.answerRootId !== 'string' || key.answerRootId.length === 0 ||
      !Number.isSafeInteger(key.requestSequence) || key.requestSequence < 1 ||
      typeof key.artifactKind !== 'string' || key.artifactKind.length === 0 || key.artifactKind.length > 512) invalid()
}

function validateEnvelope(envelope: NativeArtifactStorageEnvelopeV2): void {
  if (!envelope || typeof envelope !== 'object' || !Number.isSafeInteger(envelope.artifactCodecVersion) ||
      envelope.artifactCodecVersion < 1 || envelope.artifactCodecVersion > 2_147_483_647 ||
      typeof envelope.artifactHash !== 'string' || !HASH_PATTERN.test(envelope.artifactHash)) invalid()
}

function parseObject(json: string): Readonly<Record<string, unknown>> {
  let value: unknown
  try { value = JSON.parse(json) } catch { return invalid() }
  if (!value || typeof value !== 'object' || Array.isArray(value) || Object.getPrototypeOf(value) !== Object.prototype) invalid()
  return value as Readonly<Record<string, unknown>>
}

function validateRawCodecJson(
  rawCodecJson: string,
  key: NativeArtifactStorageKeyV2,
  envelope: NativeArtifactStorageEnvelopeV2,
): Buffer {
  if (typeof rawCodecJson !== 'string') return invalid()
  const bytes = Buffer.from(rawCodecJson, 'utf8')
  if (bytes.toString('utf8') !== rawCodecJson) invalid()
  if (bytes.byteLength < 2 || bytes.byteLength > GENERATION_NATIVE_ARTIFACT_MAX_BYTES_V1) invalid()
  const raw = parseObject(rawCodecJson)
  // Some established native codecs use `schemaVersion` as their codec version
  // (notably OpenRouter history). Keep their canonical inline bytes unchanged.
  const rawCodecVersion = raw.artifactCodecVersion ?? raw.schemaVersion
  if (raw.artifactKind !== key.artifactKind || rawCodecVersion !== envelope.artifactCodecVersion ||
      raw.artifactHash !== envelope.artifactHash) invalid()
  return bytes
}

function storeChunk(db: BetterSqlite3.Database, bytes: Buffer): string {
  const hash = sha256(bytes)
  const base64 = bytes.toString('base64')
  db.prepare(`INSERT INTO generation_native_artifact_content_chunk_v2
    (content_sha256, raw_byte_length, content_base64) VALUES (?, ?, ?)
    ON CONFLICT(content_sha256) DO NOTHING`).run(hash, bytes.byteLength, base64)
  const existing = db.prepare(`SELECT raw_byte_length AS rawByteLength, content_base64 AS contentBase64
    FROM generation_native_artifact_content_chunk_v2 WHERE content_sha256=?`).get(hash) as ChunkRow | undefined
  if (!existing || existing.rawByteLength !== bytes.byteLength || existing.contentBase64 !== base64) invalid()
  return hash
}

/**
 * Store the codec's exact canonical JSON as immutable, content-addressed chunks.
 * The returned root JSON is a small manifest accepted by the native-artifact
 * envelope trigger. Call this only in the same transaction as the root insert.
 */
export function storeNativeArtifactJsonV2(
  db: BetterSqlite3.Database,
  key: NativeArtifactStorageKeyV2,
  rawCodecJson: string,
  envelope: NativeArtifactStorageEnvelopeV2,
): string {
  validateKey(key)
  validateEnvelope(envelope)
  if (!db.inTransaction) invalid()
  const bytes = validateRawCodecJson(rawCodecJson, key, envelope)
  const chunkHashes: string[] = []
  for (let offset = 0; offset < bytes.byteLength; offset += GENERATION_NATIVE_ARTIFACT_CHUNK_MAX_RAW_BYTES_V1) {
    chunkHashes.push(storeChunk(db, bytes.subarray(offset, Math.min(
      offset + GENERATION_NATIVE_ARTIFACT_CHUNK_MAX_RAW_BYTES_V1,
      bytes.byteLength,
    ))))
  }
  if (chunkHashes.length < 1 || chunkHashes.length > GENERATION_NATIVE_ARTIFACT_MAX_CHUNKS_V1) invalid()
  const manifest: StorageManifestV1 = Object.freeze({
    artifactStorageVersion: 1,
    artifactKind: key.artifactKind,
    artifactCodecVersion: envelope.artifactCodecVersion,
    artifactHash: envelope.artifactHash,
    rawByteLength: bytes.byteLength,
    rawSha256: sha256(bytes),
    chunkHashes: Object.freeze(chunkHashes),
  })
  const json = JSON.stringify(manifest)
  if (Buffer.byteLength(json, 'utf8') > GENERATION_NATIVE_ARTIFACT_MANIFEST_MAX_BYTES_V1) invalid()
  return json
}

function decodeManifest(
  value: Readonly<Record<string, unknown>>,
  key: NativeArtifactStorageKeyV2,
  envelope: NativeArtifactStorageEnvelopeV2,
): StorageManifestV1 {
  if (value.artifactStorageVersion !== 1 || Object.keys(value).sort().join('\0') !== [...MANIFEST_FIELDS].sort().join('\0') ||
      value.artifactKind !== key.artifactKind || value.artifactCodecVersion !== envelope.artifactCodecVersion ||
      value.artifactHash !== envelope.artifactHash || !Number.isSafeInteger(value.rawByteLength) ||
      (value.rawByteLength as number) < 2 || (value.rawByteLength as number) > GENERATION_NATIVE_ARTIFACT_MAX_BYTES_V1 ||
      typeof value.rawSha256 !== 'string' || !HASH_PATTERN.test(value.rawSha256) ||
      !Array.isArray(value.chunkHashes) || value.chunkHashes.length < 1 ||
      value.chunkHashes.length > GENERATION_NATIVE_ARTIFACT_MAX_CHUNKS_V1 ||
      value.chunkHashes.some(hash => typeof hash !== 'string' || !HASH_PATTERN.test(hash))) invalid()
  const rawByteLength = value.rawByteLength as number
  if (Math.ceil(rawByteLength / GENERATION_NATIVE_ARTIFACT_CHUNK_MAX_RAW_BYTES_V1) !== value.chunkHashes.length) invalid()
  return value as StorageManifestV1
}

function loadManifestChunks(db: BetterSqlite3.Database, manifest: StorageManifestV1): Buffer {
  const chunks: Buffer[] = []
  let total = 0
  for (let index = 0; index < manifest.chunkHashes.length; index += 1) {
    const hash = manifest.chunkHashes[index]
    const row = db.prepare(`SELECT raw_byte_length AS rawByteLength, content_base64 AS contentBase64
      FROM generation_native_artifact_content_chunk_v2 WHERE content_sha256=?`).get(hash) as ChunkRow | undefined
    if (!row || typeof row.rawByteLength !== 'number' || !Number.isSafeInteger(row.rawByteLength) ||
        typeof row.contentBase64 !== 'string') invalid()
    const expectedLength = Math.min(
      GENERATION_NATIVE_ARTIFACT_CHUNK_MAX_RAW_BYTES_V1,
      manifest.rawByteLength - total,
    )
    if (row.rawByteLength !== expectedLength || row.rawByteLength < 1 ||
        row.rawByteLength > GENERATION_NATIVE_ARTIFACT_CHUNK_MAX_RAW_BYTES_V1) invalid()
    const bytes = Buffer.from(row.contentBase64, 'base64')
    if (bytes.byteLength !== row.rawByteLength || bytes.toString('base64') !== row.contentBase64 || sha256(bytes) !== hash) invalid()
    total += bytes.byteLength
    chunks.push(bytes)
  }
  if (total !== manifest.rawByteLength) invalid()
  const bytes = Buffer.concat(chunks, total)
  if (sha256(bytes) !== manifest.rawSha256) invalid()
  return bytes
}

/** Reassemble a manifest or pass through a legacy inline codec JSON row. */
export function loadNativeArtifactJsonV2(
  db: BetterSqlite3.Database,
  key: NativeArtifactStorageKeyV2,
  storedArtifactJson: string,
  envelope: NativeArtifactStorageEnvelopeV2,
): string {
  validateKey(key)
  validateEnvelope(envelope)
  if (!db.inTransaction || typeof storedArtifactJson !== 'string' ||
      Buffer.byteLength(storedArtifactJson, 'utf8') > GENERATION_NATIVE_ARTIFACT_MAX_BYTES_V1) invalid()
  const stored = parseObject(storedArtifactJson)
  if (stored.artifactStorageVersion === undefined) {
    validateRawCodecJson(storedArtifactJson, key, envelope)
    return storedArtifactJson
  }
  if (Buffer.byteLength(storedArtifactJson, 'utf8') > GENERATION_NATIVE_ARTIFACT_MANIFEST_MAX_BYTES_V1) invalid()
  const manifest = decodeManifest(stored, key, envelope)
  const bytes = loadManifestChunks(db, manifest)
  let rawCodecJson: string
  try { rawCodecJson = new TextDecoder('utf-8', { fatal: true }).decode(bytes) } catch { return invalid() }
  if (Buffer.byteLength(rawCodecJson, 'utf8') !== manifest.rawByteLength) invalid()
  validateRawCodecJson(rawCodecJson, key, envelope)
  return rawCodecJson
}

/** Load the artifact_json projection from a repository row with its full storage key. */
export function loadNativeArtifactJsonFromRowV2(
  db: BetterSqlite3.Database,
  row: Readonly<Record<string, unknown>>,
): string {
  if (!row || typeof row.operationId !== 'string' || typeof row.answerRootId !== 'string' ||
      !Number.isSafeInteger(row.requestSequence) || typeof row.artifactKind !== 'string' ||
      !Number.isSafeInteger(row.codecVersion) || typeof row.artifactJson !== 'string' ||
      typeof row.artifactHash !== 'string') invalid()
  return loadNativeArtifactJsonV2(db, {
    operationId: row.operationId,
    answerRootId: row.answerRootId,
    requestSequence: row.requestSequence as number,
    artifactKind: row.artifactKind,
  }, row.artifactJson, {
    artifactCodecVersion: row.codecVersion as number,
    artifactHash: row.artifactHash,
  })
}

/** Return false for any corrupt or conflicting persisted envelope at an idempotent write site. */
export function nativeArtifactJsonMatchesV2(
  db: BetterSqlite3.Database,
  key: NativeArtifactStorageKeyV2,
  storedArtifactJson: string,
  storedEnvelope: NativeArtifactStorageEnvelopeV2,
  expectedRawCodecJson: string,
): boolean {
  try {
    return loadNativeArtifactJsonV2(db, key, storedArtifactJson, storedEnvelope) === expectedRawCodecJson
  } catch {
    return false
  }
}
