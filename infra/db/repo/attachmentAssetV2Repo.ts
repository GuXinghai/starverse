import type BetterSqlite3 from 'better-sqlite3'
import {
  sha256PreparedBytesV2,
} from '../../../src/next/generation-v2/compiler/stableSerialize'
import {
  isAttachmentIntentV2,
  type AttachmentIntentV2,
} from '../../../src/next/generation-v2/domain/generationIntentV2'
import {
  GenerationV2Digest,
  GenerationV2Identity,
  readGenerationV2Digest,
  readGenerationV2Identity,
} from '../../../src/next/generation-v2/domain/identityV2'

export type AttachmentAssetKindV2 = 'file' | 'image'
export type AttachmentAssetSourceKindV2 = 'user_import' | 'generated' | 'derived'
export type AttachmentConversionKindV2 = 'none'

export type AttachmentBlobRepositoryFactV2 = Readonly<{
  trust: 'attachment_blob_repository_fact'
  blobId: GenerationV2Identity<'blob_id'>
  sha256: GenerationV2Digest<'asset_sha256'>
  sizeBytes: number
  mime: string
  storageRef: string
  createdAtMs: number
}>

export type AttachmentAssetRevisionRepositoryFactV2 = Readonly<{
  trust: 'attachment_asset_revision_repository_fact'
  assetId: GenerationV2Identity<'asset_id'>
  assetRevisionId: GenerationV2Identity<'asset_revision_id'>
  assetKind: AttachmentAssetKindV2
  filename: string
  sourceKind: AttachmentAssetSourceKindV2
  assetCreatedAtMs: number
  retiredAtMs: number | null
  blob: AttachmentBlobRepositoryFactV2
  parentAssetRevisionId: null
  revisionKind: 'source'
  conversionKind: 'none'
  conversionContractId: null
  conversionRevision: null
  revisionCreatedAtMs: number
}>

export type ResolvedAttachmentAssetAuthorityV2 = Readonly<{
  trust: 'resolved_attachment_asset_authority'
  usage: 'snapshot_reference_verified'
  intent: AttachmentIntentV2
  revision: AttachmentAssetRevisionRepositoryFactV2
}>

export class AttachmentAssetV2RepoError extends Error {
  constructor(readonly code:
    | 'GENERATION_V2_ASSET_INPUT_INVALID'
    | 'GENERATION_V2_ASSET_STATE_INVALID'
    | 'GENERATION_V2_ASSET_CONFLICT'
    | 'GENERATION_V2_ASSET_NOT_FOUND'
    | 'GENERATION_V2_ASSET_RETIRED'
    | 'GENERATION_V2_ASSET_INTENT_MISMATCH'
    | 'GENERATION_V2_ASSET_LOCK_CONFLICT') {
    super(code)
    this.name = 'AttachmentAssetV2RepoError'
  }
}

type JoinedRevisionRow = {
  asset_id: unknown
  asset_revision_id: unknown
  asset_kind: unknown
  filename: unknown
  source_kind: unknown
  asset_created_at_ms: unknown
  retired_at_ms: unknown
  blob_id: unknown
  sha256: unknown
  size_bytes: unknown
  mime: unknown
  storage_ref: unknown
  blob_created_at_ms: unknown
  parent_asset_revision_id: unknown
  revision_kind: unknown
  conversion_kind: unknown
  conversion_contract_id: unknown
  conversion_revision: unknown
  revision_created_at_ms: unknown
}

type AttachmentReferenceV2 = Readonly<{
  assetId: string
  assetRevisionId: string
  assetSha256: string
  conversion: AttachmentIntentV2['conversion']
}>

const blobFacts = new WeakSet<object>()
const revisionFacts = new WeakSet<object>()
const attachmentAuthorities = new WeakSet<object>()
const repositoryScopes = new WeakMap<object, object>()

const typedArrayPrototype = Object.getPrototypeOf(Uint8Array.prototype) as object
const typedArrayBufferGetter = Object.getOwnPropertyDescriptor(typedArrayPrototype, 'buffer')?.get
const typedArrayByteOffsetGetter = Object.getOwnPropertyDescriptor(typedArrayPrototype, 'byteOffset')?.get
const typedArrayByteLengthGetter = Object.getOwnPropertyDescriptor(typedArrayPrototype, 'byteLength')?.get
const typedArrayTagGetter = Object.getOwnPropertyDescriptor(typedArrayPrototype, Symbol.toStringTag)?.get
const arrayBufferByteLengthGetter = Object.getOwnPropertyDescriptor(ArrayBuffer.prototype, 'byteLength')?.get

function copyOwnedUint8Array(value: unknown): Uint8Array {
  if (!typedArrayBufferGetter || !typedArrayByteOffsetGetter || !typedArrayByteLengthGetter ||
      !typedArrayTagGetter || !arrayBufferByteLengthGetter || !value || typeof value !== 'object') {
    throw new AttachmentAssetV2RepoError('GENERATION_V2_ASSET_INPUT_INVALID')
  }
  try {
    if (Reflect.apply(typedArrayTagGetter, value, []) !== 'Uint8Array') {
      throw new AttachmentAssetV2RepoError('GENERATION_V2_ASSET_INPUT_INVALID')
    }
    const buffer = Reflect.apply(typedArrayBufferGetter, value, []) as ArrayBuffer
    const byteOffset = Reflect.apply(typedArrayByteOffsetGetter, value, []) as number
    const byteLength = Reflect.apply(typedArrayByteLengthGetter, value, []) as number
    // ArrayBuffer's intrinsic getter rejects SharedArrayBuffer and detached/non-buffer values.
    Reflect.apply(arrayBufferByteLengthGetter, buffer, [])
    const source = new Uint8Array(buffer, byteOffset, byteLength)
    const owned = new Uint8Array(byteLength)
    owned.set(source)
    return owned
  } catch (error) {
    if (error instanceof AttachmentAssetV2RepoError) throw error
    throw new AttachmentAssetV2RepoError('GENERATION_V2_ASSET_INPUT_INVALID')
  }
}

function hasThenMember(value: unknown): boolean {
  if ((typeof value !== 'object' || value === null) && typeof value !== 'function') return false
  try {
    let cursor: object | null = value as object
    const visited = new Set<object>()
    while (cursor !== null) {
      if (visited.has(cursor)) throw new AttachmentAssetV2RepoError('GENERATION_V2_ASSET_INPUT_INVALID')
      visited.add(cursor)
      if (Object.getOwnPropertyDescriptor(cursor, 'then')) return true
      cursor = Object.getPrototypeOf(cursor) as object | null
    }
    return false
  } catch (error) {
    if (error instanceof AttachmentAssetV2RepoError) throw error
    throw new AttachmentAssetV2RepoError('GENERATION_V2_ASSET_INPUT_INVALID')
  }
}

function closedObject(value: unknown, allowed: readonly string[]): Readonly<Record<string, unknown>> {
  if (!value || typeof value !== 'object' || Array.isArray(value) ||
      (Object.getPrototypeOf(value) !== Object.prototype && Object.getPrototypeOf(value) !== null)) {
    throw new AttachmentAssetV2RepoError('GENERATION_V2_ASSET_INPUT_INVALID')
  }
  const descriptors = Object.getOwnPropertyDescriptors(value)
  if (Reflect.ownKeys(value).some((key) => typeof key !== 'string') ||
      Object.keys(descriptors).some((key) => !allowed.includes(key)) ||
      Object.values(descriptors).some((descriptor) => !descriptor.enumerable || !('value' in descriptor) || descriptor.value === undefined)) {
    throw new AttachmentAssetV2RepoError('GENERATION_V2_ASSET_INPUT_INVALID')
  }
  return Object.fromEntries(Object.entries(descriptors).map(([key, descriptor]) => [key, descriptor.value]))
}

function safeTime(value: number): number {
  if (!Number.isSafeInteger(value) || value < 0) {
    throw new AttachmentAssetV2RepoError('GENERATION_V2_ASSET_INPUT_INVALID')
  }
  return value
}

function safeString(value: unknown, maxLength: number): string {
  if (typeof value !== 'string' || value.length < 1 || value.length > maxLength ||
      value.trim() !== value || /[\u0000-\u001f\u007f]/u.test(value)) {
    throw new AttachmentAssetV2RepoError('GENERATION_V2_ASSET_INPUT_INVALID')
  }
  return value
}

function safeMime(value: unknown): string {
  const mime = safeString(value, 255)
  if (!/^[a-z0-9][a-z0-9!#$&^_.+*-]*\/[a-z0-9][a-z0-9!#$&^_.+*-]*$/u.test(mime)) {
    throw new AttachmentAssetV2RepoError('GENERATION_V2_ASSET_INPUT_INVALID')
  }
  return mime
}

function decodeBlobColumns(row: JoinedRevisionRow, scope: object): AttachmentBlobRepositoryFactV2 {
  if (typeof row.sha256 !== 'string' || !/^[0-9a-f]{64}$/u.test(row.sha256) ||
      row.blob_id !== `blob-v2:${row.sha256}` ||
      row.storage_ref !== `sha256/${row.sha256.slice(0, 2)}/${row.sha256}` ||
      !Number.isSafeInteger(row.size_bytes) || (row.size_bytes as number) < 0 ||
      !Number.isSafeInteger(row.blob_created_at_ms) || (row.blob_created_at_ms as number) < 0) {
    throw new AttachmentAssetV2RepoError('GENERATION_V2_ASSET_STATE_INVALID')
  }
  let mime: string
  try { mime = safeMime(row.mime) } catch {
    throw new AttachmentAssetV2RepoError('GENERATION_V2_ASSET_STATE_INVALID')
  }
  const fact = Object.freeze({
    trust: 'attachment_blob_repository_fact' as const,
    blobId: GenerationV2Identity.create('blob_id', row.blob_id),
    sha256: GenerationV2Digest.create('asset_sha256', row.sha256),
    sizeBytes: row.size_bytes as number,
    mime,
    storageRef: row.storage_ref as string,
    createdAtMs: row.blob_created_at_ms as number,
  })
  blobFacts.add(fact)
  repositoryScopes.set(fact, scope)
  return fact
}

function decodeRevisionRow(row: JoinedRevisionRow, scope: object): AttachmentAssetRevisionRepositoryFactV2 {
  if (typeof row.asset_id !== 'string' || typeof row.asset_revision_id !== 'string' ||
      (row.asset_kind !== 'file' && row.asset_kind !== 'image') ||
      (row.source_kind !== 'user_import' && row.source_kind !== 'generated' && row.source_kind !== 'derived') ||
      !Number.isSafeInteger(row.asset_created_at_ms) || (row.asset_created_at_ms as number) < 0 ||
      (row.retired_at_ms !== null && (!Number.isSafeInteger(row.retired_at_ms) ||
        (row.retired_at_ms as number) < (row.asset_created_at_ms as number))) ||
      row.revision_kind !== 'source' || row.conversion_kind !== 'none' ||
      row.parent_asset_revision_id !== null || row.conversion_contract_id !== null ||
      row.conversion_revision !== null ||
      !Number.isSafeInteger(row.revision_created_at_ms) || (row.revision_created_at_ms as number) < 0) {
    throw new AttachmentAssetV2RepoError('GENERATION_V2_ASSET_STATE_INVALID')
  }
  let filename: string
  try { filename = safeString(row.filename, 4096) } catch {
    throw new AttachmentAssetV2RepoError('GENERATION_V2_ASSET_STATE_INVALID')
  }
  const assetId = GenerationV2Identity.create('asset_id', row.asset_id)
  const assetRevisionId = GenerationV2Identity.create('asset_revision_id', row.asset_revision_id)
  const fact = Object.freeze({
    trust: 'attachment_asset_revision_repository_fact' as const,
    assetId,
    assetRevisionId,
    assetKind: row.asset_kind,
    filename,
    sourceKind: row.source_kind,
    assetCreatedAtMs: row.asset_created_at_ms as number,
    retiredAtMs: row.retired_at_ms as number | null,
    blob: decodeBlobColumns(row, scope),
    parentAssetRevisionId: null,
    revisionKind: 'source' as const,
    conversionKind: 'none' as const,
    conversionContractId: null,
    conversionRevision: null,
    revisionCreatedAtMs: row.revision_created_at_ms as number,
  })
  revisionFacts.add(fact)
  repositoryScopes.set(fact, scope)
  return fact
}

export function isAttachmentBlobRepositoryFactV2(value: unknown): value is AttachmentBlobRepositoryFactV2 {
  return Boolean(value && typeof value === 'object' && blobFacts.has(value))
}

export function isAttachmentAssetRevisionRepositoryFactV2(
  value: unknown,
): value is AttachmentAssetRevisionRepositoryFactV2 {
  return Boolean(value && typeof value === 'object' && revisionFacts.has(value))
}

export function isResolvedAttachmentAssetAuthorityV2(
  value: unknown,
): value is ResolvedAttachmentAssetAuthorityV2 {
  return Boolean(value && typeof value === 'object' && attachmentAuthorities.has(value))
}

export class AttachmentAssetV2Repo {
  private readonly scope = Object.freeze({})

  constructor(
    private readonly db: BetterSqlite3.Database,
    private readonly nowMs: () => number = Date.now,
  ) {
    db.pragma('foreign_keys = ON')
    if (db.pragma('foreign_keys', { simple: true }) !== 1) {
      throw new AttachmentAssetV2RepoError('GENERATION_V2_ASSET_STATE_INVALID')
    }
  }

  recordBlobFromBytes(bytes: Uint8Array, mimeValue: unknown): AttachmentBlobRepositoryFactV2 {
    const mime = safeMime(mimeValue)
    const owned = copyOwnedUint8Array(bytes)
    const sizeBytes = owned.byteLength
    let sha256: string
    try {
      sha256 = sha256PreparedBytesV2(owned)
    } finally {
      owned.fill(0)
    }
    const blobId = `blob-v2:${sha256}`
    const storageRef = `sha256/${sha256.slice(0, 2)}/${sha256}`
    const now = safeTime(this.nowMs())
    const transaction = this.db.transaction(() => {
      const existing = this.findBlob(blobId)
      if (existing) {
        if (existing.sha256.value !== sha256 || existing.sizeBytes !== sizeBytes || existing.mime !== mime ||
            existing.storageRef !== storageRef) {
          throw new AttachmentAssetV2RepoError('GENERATION_V2_ASSET_CONFLICT')
        }
        return existing
      }
      this.db.prepare(`INSERT INTO file_blob_v2 (
        blob_id, sha256, size_bytes, mime, storage_ref, created_at_ms
      ) VALUES (?, ?, ?, ?, ?, ?)`).run(blobId, sha256, sizeBytes, mime, storageRef, now)
      return this.readBlob(blobId)
    })
    return this.runImmediate(transaction)
  }

  createAsset(value: Readonly<{
    assetId: string
    assetKind: AttachmentAssetKindV2
    filename: string
    sourceKind: AttachmentAssetSourceKindV2
  }>): void {
    const input = closedObject(value, ['assetId', 'assetKind', 'filename', 'sourceKind'])
    const assetId = GenerationV2Identity.create('asset_id', safeString(input.assetId, 512)).value
    const filename = safeString(input.filename, 4096)
    if ((input.assetKind !== 'file' && input.assetKind !== 'image') ||
        (input.sourceKind !== 'user_import' && input.sourceKind !== 'generated' && input.sourceKind !== 'derived')) {
      throw new AttachmentAssetV2RepoError('GENERATION_V2_ASSET_INPUT_INVALID')
    }
    const now = safeTime(this.nowMs())
    const transaction = this.db.transaction(() => {
      const row = this.db.prepare(`SELECT asset_kind, filename, source_kind, created_at_ms, retired_at_ms
        FROM file_asset_v2 WHERE asset_id = ?`).get(assetId) as Record<string, unknown> | undefined
      if (row) {
        if (row.asset_kind !== input.assetKind || row.filename !== filename ||
            row.source_kind !== input.sourceKind || row.retired_at_ms !== null) {
          throw new AttachmentAssetV2RepoError('GENERATION_V2_ASSET_CONFLICT')
        }
        return
      }
      this.db.prepare(`INSERT INTO file_asset_v2 (
        asset_id, asset_kind, filename, source_kind, created_at_ms, retired_at_ms
      ) VALUES (?, ?, ?, ?, ?, NULL)`).run(assetId, input.assetKind, filename, input.sourceKind, now)
    })
    this.runImmediate(transaction)
  }

  appendSourceRevision(value: Readonly<{
    assetId: string
    assetRevisionId: string
    blob: AttachmentBlobRepositoryFactV2
  }>): AttachmentAssetRevisionRepositoryFactV2 {
    const input = closedObject(value, ['assetId', 'assetRevisionId', 'blob'])
    return this.appendSourceRevisionRecord(
      safeString(input.assetId, 512), safeString(input.assetRevisionId, 512),
      input.blob as AttachmentBlobRepositoryFactV2,
    )
  }

  getRevision(assetIdValue: string, assetRevisionIdValue: string): AttachmentAssetRevisionRepositoryFactV2 {
    const assetId = GenerationV2Identity.create('asset_id', assetIdValue).value
    const assetRevisionId = GenerationV2Identity.create('asset_revision_id', assetRevisionIdValue).value
    const row = this.db.prepare(`SELECT
      a.asset_id, r.asset_revision_id, a.asset_kind, a.filename, a.source_kind,
      a.created_at_ms AS asset_created_at_ms, a.retired_at_ms,
      b.blob_id, b.sha256, b.size_bytes, b.mime, b.storage_ref, b.created_at_ms AS blob_created_at_ms,
      r.parent_asset_revision_id, r.revision_kind, r.conversion_kind,
      r.conversion_contract_id, r.conversion_revision, r.created_at_ms AS revision_created_at_ms
      FROM asset_revision_v2 r
      JOIN file_asset_v2 a ON a.asset_id = r.asset_id
      JOIN file_blob_v2 b ON b.blob_id = r.blob_id
      WHERE r.asset_id = ? AND r.asset_revision_id = ?`).get(assetId, assetRevisionId) as JoinedRevisionRow | undefined
    if (!row) throw new AttachmentAssetV2RepoError('GENERATION_V2_ASSET_NOT_FOUND')
    return decodeRevisionRow(row, this.scope)
  }

  withSynchronousSnapshotReferenceAuthority<T>(
    intent: AttachmentIntentV2,
    use: (authority: ResolvedAttachmentAssetAuthorityV2) => T extends PromiseLike<unknown> ? never : T,
  ): T {
    if (!isAttachmentIntentV2(intent) || typeof use !== 'function') {
      throw new AttachmentAssetV2RepoError('GENERATION_V2_ASSET_INPUT_INVALID')
    }
    const reference = Object.freeze({
      assetId: readGenerationV2Identity(intent.assetId, 'asset_id'),
      assetRevisionId: readGenerationV2Identity(intent.assetRevisionId, 'asset_revision_id'),
      assetSha256: readGenerationV2Digest(intent.assetSha256, 'asset_sha256'),
      conversion: intent.conversion,
    })
    const transaction = this.db.transaction(() => {
      const fact = this.resolveReferenceFact(reference)
      const authority = Object.freeze({
        trust: 'resolved_attachment_asset_authority' as const,
        usage: 'snapshot_reference_verified' as const,
        intent,
        revision: fact,
      })
      attachmentAuthorities.add(authority)
      try {
        const result = use(authority)
        if (hasThenMember(result)) throw new AttachmentAssetV2RepoError('GENERATION_V2_ASSET_INPUT_INVALID')
        const finalFact = this.resolveReferenceFact(reference)
        if (finalFact.assetId.value !== fact.assetId.value ||
            finalFact.assetRevisionId.value !== fact.assetRevisionId.value ||
            finalFact.blob.blobId.value !== fact.blob.blobId.value ||
            finalFact.blob.sha256.value !== fact.blob.sha256.value) {
          throw new AttachmentAssetV2RepoError('GENERATION_V2_ASSET_STATE_INVALID')
        }
        return result
      } finally {
        attachmentAuthorities.delete(authority)
      }
    })
    return this.runImmediate(transaction)
  }

  retireAsset(assetIdValue: string): void {
    const assetId = GenerationV2Identity.create('asset_id', assetIdValue).value
    const now = safeTime(this.nowMs())
    const transaction = this.db.transaction(() => {
      const result = this.db.prepare(`UPDATE file_asset_v2 SET retired_at_ms = ?
        WHERE asset_id = ? AND retired_at_ms IS NULL`).run(now, assetId)
      if (result.changes !== 1) throw new AttachmentAssetV2RepoError('GENERATION_V2_ASSET_NOT_FOUND')
    })
    this.runImmediate(transaction)
  }

  private readBlob(blobId: string): AttachmentBlobRepositoryFactV2 {
    const fact = this.findBlob(blobId)
    if (!fact) throw new AttachmentAssetV2RepoError('GENERATION_V2_ASSET_NOT_FOUND')
    return fact
  }

  private resolveReferenceFact(reference: AttachmentReferenceV2): AttachmentAssetRevisionRepositoryFactV2 {
    const fact = this.getRevision(reference.assetId, reference.assetRevisionId)
    if (fact.retiredAtMs !== null) throw new AttachmentAssetV2RepoError('GENERATION_V2_ASSET_RETIRED')
    if (reference.assetSha256 !== fact.blob.sha256.value || reference.conversion !== fact.conversionKind) {
      throw new AttachmentAssetV2RepoError('GENERATION_V2_ASSET_INTENT_MISMATCH')
    }
    return fact
  }

  private findBlob(blobId: string): AttachmentBlobRepositoryFactV2 | null {
    const row = this.db.prepare(`SELECT
      '' AS asset_id, '' AS asset_revision_id, 'file' AS asset_kind, 'placeholder' AS filename,
      'user_import' AS source_kind, 0 AS asset_created_at_ms, NULL AS retired_at_ms,
      blob_id, sha256, size_bytes, mime, storage_ref, created_at_ms AS blob_created_at_ms,
      NULL AS parent_asset_revision_id, 'source' AS revision_kind, 'none' AS conversion_kind,
      NULL AS conversion_contract_id, NULL AS conversion_revision, 0 AS revision_created_at_ms
      FROM file_blob_v2 WHERE blob_id = ?`).get(blobId) as JoinedRevisionRow | undefined
    return row ? decodeBlobColumns(row, this.scope) : null
  }

  private appendSourceRevisionRecord(
    assetIdValue: string,
    assetRevisionIdValue: string,
    blob: AttachmentBlobRepositoryFactV2,
  ): AttachmentAssetRevisionRepositoryFactV2 {
    if (!isAttachmentBlobRepositoryFactV2(blob) || repositoryScopes.get(blob) !== this.scope) {
      throw new AttachmentAssetV2RepoError('GENERATION_V2_ASSET_INPUT_INVALID')
    }
    const assetId = GenerationV2Identity.create('asset_id', assetIdValue).value
    const assetRevisionId = GenerationV2Identity.create('asset_revision_id', assetRevisionIdValue).value
    const now = safeTime(this.nowMs())
    const transaction = this.db.transaction(() => {
      const asset = this.db.prepare('SELECT retired_at_ms FROM file_asset_v2 WHERE asset_id = ?')
        .get(assetId) as { retired_at_ms: unknown } | undefined
      if (!asset) throw new AttachmentAssetV2RepoError('GENERATION_V2_ASSET_NOT_FOUND')
      if (asset.retired_at_ms !== null) throw new AttachmentAssetV2RepoError('GENERATION_V2_ASSET_RETIRED')
      try {
        const existing = this.getRevision(assetId, assetRevisionId)
        if (existing.blob.blobId.value !== blob.blobId.value) {
          throw new AttachmentAssetV2RepoError('GENERATION_V2_ASSET_CONFLICT')
        }
        return existing
      } catch (error) {
        if (!(error instanceof AttachmentAssetV2RepoError) || error.code !== 'GENERATION_V2_ASSET_NOT_FOUND') {
          throw error
        }
      }
      this.db.prepare(`INSERT INTO asset_revision_v2 (
        asset_revision_id, asset_id, blob_id, parent_asset_revision_id, revision_kind,
        conversion_kind, conversion_contract_id, conversion_revision, created_at_ms
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`).run(
        assetRevisionId, assetId, blob.blobId.value, null, 'source',
        'none', null, null, now,
      )
      return this.getRevision(assetId, assetRevisionId)
    })
    return this.runImmediate(transaction)
  }

  private runImmediate<T>(transaction: { immediate(): T }): T {
    try { return transaction.immediate() } catch (error) {
      if (error instanceof AttachmentAssetV2RepoError) throw error
      const code = (error as { code?: unknown })?.code
      if (code === 'SQLITE_BUSY' || code === 'SQLITE_BUSY_SNAPSHOT' || code === 'SQLITE_LOCKED') {
        throw new AttachmentAssetV2RepoError('GENERATION_V2_ASSET_LOCK_CONFLICT')
      }
      throw error
    }
  }
}
