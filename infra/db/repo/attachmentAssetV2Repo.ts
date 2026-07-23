import type BetterSqlite3 from 'better-sqlite3'
import {
  sha256PreparedBytesV2,
} from '../../../src/next/generation-v2/compiler/stableSerialize'
import {
  isAttachmentIntentV2,
  requiresProviderFileBindingV2,
  type AttachmentIntentV2,
} from '../../../src/next/generation-v2/domain/generationIntentV2'
import {
  isDecodedResolvedGenerationIntentV2,
  type DecodedResolvedGenerationIntentV2,
} from '../../../src/next/generation-v2/domain/resolvedGenerationIntentV2'
import {
  GenerationV2Digest,
  GenerationV2Identity,
  readGenerationV2Digest,
  readGenerationV2Identity,
} from '../../../src/next/generation-v2/domain/identityV2'
import {
  assertGenerationV2AuthorityTransactionContextV2,
  isGenerationV2AuthorityTransactionContextV2,
  registerGenerationV2AuthorityTransactionParticipantV2,
  type GenerationV2AuthorityTransactionContextV2,
} from './generationV2AuthorityTransactionInternal'

export type AttachmentAssetKindV2 = 'file' | 'image'
export type AttachmentAssetSourceKindV2 = 'user_import' | 'url_import' | 'generated' | 'derived'
export type AttachmentConversionKindV2 = 'none' | 'pdf' | 'plain_text' | 'images'

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
  parentAssetRevisionId: GenerationV2Identity<'asset_revision_id'> | null
  revisionKind: 'source' | 'derived'
  conversionKind: AttachmentConversionKindV2
  conversionContractId: string | null
  conversionRevision: string | null
  revisionCreatedAtMs: number
}>

export type ResolvedAttachmentAssetAuthorityV2 = Readonly<{
  trust: 'resolved_attachment_asset_authority'
  usage: 'snapshot_reference_verified'
  intent: AttachmentIntentV2
  revision: AttachmentAssetRevisionRepositoryFactV2
}>

export type AttachmentProviderFileRequirementV2 = Readonly<{
  assetId: GenerationV2Identity<'asset_id'>
  assetRevisionId: GenerationV2Identity<'asset_revision_id'>
  assetSha256: GenerationV2Digest<'asset_sha256'>
}>

export type ResolvedAttachmentSetAuthorityV2 = Readonly<{
  trust: 'resolved_attachment_set_authority'
  usage: 'resolved_intent_attachment_set_verified'
  attachments: readonly ResolvedAttachmentAssetAuthorityV2[]
  /**
   * Immutable, database-verified user URL references. These deliberately do
   * not grant access to remote bytes: their only authority is the exact
   * reference string captured in the generation snapshot.
   */
  urlReferenceIntents: readonly Extract<AttachmentIntentV2, {kind:'url_reference'}>[]
  providerFileRequirements: readonly AttachmentProviderFileRequirementV2[]
  requiresProviderFileAuthority: boolean
}>

export type VerifiedAttachmentSendBytesLeaseV2 = Readonly<{
  trust: 'verified_attachment_send_bytes_lease'
  assetId: GenerationV2Identity<'asset_id'>
  assetRevisionId: GenerationV2Identity<'asset_revision_id'>
  assetSha256: GenerationV2Digest<'asset_sha256'>
  blobId: GenerationV2Identity<'blob_id'>
  filename: string
  mime: string
  sizeBytes: number
}>

export class AttachmentAssetV2RepoError extends Error {
  constructor(readonly code:
    | 'GENERATION_V2_ASSET_INPUT_INVALID'
    | 'GENERATION_V2_ASSET_STATE_INVALID'
    | 'GENERATION_V2_ASSET_CONFLICT'
    | 'GENERATION_V2_ASSET_NOT_FOUND'
    | 'GENERATION_V2_ASSET_RETIRED'
    | 'GENERATION_V2_ASSET_INTENT_MISMATCH'
    | 'GENERATION_V2_ASSET_DFC_PROVENANCE_INVALID'
    | 'GENERATION_V2_URL_REFERENCE_NOT_FOUND'
    | 'GENERATION_V2_URL_REFERENCE_INTENT_MISMATCH'
    | 'GENERATION_V2_ASSET_DUPLICATE_REFERENCE'
    | 'GENERATION_V2_ASSET_SEND_BYTES_NOT_INCLUDED'
    | 'GENERATION_V2_ASSET_BYTES_MISMATCH'
    | 'GENERATION_V2_ASSET_BYTES_DISPOSED'
    | 'GENERATION_V2_ASSET_BYTES_LEASE_IN_USE'
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

type UrlReferenceRowV2 = Readonly<{
  reference_id: unknown
  reference_revision: unknown
  original_url: unknown
  url_digest: unknown
  media_kind: unknown
  declared_media_type: unknown
  captured_at_ms: unknown
  provenance: unknown
}>

const blobFacts = new WeakSet<object>()
const revisionFacts = new WeakSet<object>()
const attachmentAuthorities = new WeakSet<object>()
const attachmentSetAuthorities = new WeakSet<object>()
const verifiedSendBytesAuthorities = new WeakSet<object>()
const disposedSendBytesAuthorities = new WeakSet<object>()
const consumingSendBytesAuthorities = new WeakSet<object>()
const verifiedSendBytesValues = new WeakMap<object, Uint8Array>()
const pendingSendBytesByReferenceAuthority = new WeakMap<object, {
  values: VerifiedAttachmentSendBytesLeaseV2[]
}>()
const attachmentAuthorityContexts = new WeakMap<object, GenerationV2AuthorityTransactionContextV2>()
const attachmentSetAuthorityContexts = new WeakMap<object, GenerationV2AuthorityTransactionContextV2>()
const repositoryScopes = new WeakMap<object, object>()

const typedArrayPrototype = Object.getPrototypeOf(Uint8Array.prototype) as object
const typedArrayBufferGetter = Object.getOwnPropertyDescriptor(typedArrayPrototype, 'buffer')?.get
const typedArrayByteOffsetGetter = Object.getOwnPropertyDescriptor(typedArrayPrototype, 'byteOffset')?.get
const typedArrayByteLengthGetter = Object.getOwnPropertyDescriptor(typedArrayPrototype, 'byteLength')?.get
const typedArrayTagGetter = Object.getOwnPropertyDescriptor(typedArrayPrototype, Symbol.toStringTag)?.get
const typedArrayFill = Object.getOwnPropertyDescriptor(typedArrayPrototype, 'fill')?.value as
  ((value: number, start?: number, end?: number) => Uint8Array) | undefined
const arrayBufferByteLengthGetter = Object.getOwnPropertyDescriptor(ArrayBuffer.prototype, 'byteLength')?.get

function zeroUint8ArrayBestEffort(value: Uint8Array): void {
  if (!typedArrayFill) return
  try { Reflect.apply(typedArrayFill, value, [0]) } catch { /* detached buffers are already inaccessible */ }
}

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

function revokePendingVerifiedSendBytes(values: readonly VerifiedAttachmentSendBytesLeaseV2[]): void {
  for (const value of values) {
    const bytes = verifiedSendBytesValues.get(value)
    if (bytes) zeroUint8ArrayBestEffort(bytes)
    verifiedSendBytesValues.delete(value)
    verifiedSendBytesAuthorities.delete(value)
    repositoryScopes.delete(value)
    disposedSendBytesAuthorities.add(value)
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
      (row.source_kind !== 'user_import' && row.source_kind !== 'url_import' && row.source_kind !== 'generated' && row.source_kind !== 'derived') ||
      !Number.isSafeInteger(row.asset_created_at_ms) || (row.asset_created_at_ms as number) < 0 ||
      (row.retired_at_ms !== null && (!Number.isSafeInteger(row.retired_at_ms) ||
        (row.retired_at_ms as number) < (row.asset_created_at_ms as number))) ||
      (row.revision_kind !== 'source' && row.revision_kind !== 'derived') ||
      !['none', 'pdf', 'plain_text', 'images'].includes(String(row.conversion_kind)) ||
      !Number.isSafeInteger(row.revision_created_at_ms) || (row.revision_created_at_ms as number) < 0) {
    throw new AttachmentAssetV2RepoError('GENERATION_V2_ASSET_STATE_INVALID')
  }
  const isSource = row.revision_kind === 'source'
  if (isSource
    ? row.parent_asset_revision_id !== null || row.conversion_kind !== 'none' ||
      row.conversion_contract_id !== null || row.conversion_revision !== null
    : typeof row.parent_asset_revision_id !== 'string' || row.conversion_kind === 'none' ||
      typeof row.conversion_contract_id !== 'string' || typeof row.conversion_revision !== 'string') {
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
    parentAssetRevisionId: row.parent_asset_revision_id === null ? null
      : GenerationV2Identity.create('asset_revision_id', row.parent_asset_revision_id as string),
    revisionKind: row.revision_kind as 'source' | 'derived',
    conversionKind: row.conversion_kind as AttachmentConversionKindV2,
    conversionContractId: row.conversion_contract_id as string | null,
    conversionRevision: row.conversion_revision as string | null,
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
  if (!value || typeof value !== 'object' || !attachmentAuthorities.has(value)) return false
  const context = attachmentAuthorityContexts.get(value)
  return Boolean(context && isGenerationV2AuthorityTransactionContextV2(context))
}

export function isResolvedAttachmentSetAuthorityV2(
  value: unknown,
): value is ResolvedAttachmentSetAuthorityV2 {
  if (!value || typeof value !== 'object' || !attachmentSetAuthorities.has(value)) return false
  const context = attachmentSetAuthorityContexts.get(value)
  return Boolean(context && isGenerationV2AuthorityTransactionContextV2(context))
}

export function isVerifiedAttachmentSendBytesLeaseV2(
  value: unknown,
): value is VerifiedAttachmentSendBytesLeaseV2 {
  return Boolean(value && typeof value === 'object' && verifiedSendBytesAuthorities.has(value))
}

function copyVerifiedAttachmentSendBytesLeaseV2(value: VerifiedAttachmentSendBytesLeaseV2): Uint8Array {
  if (value && typeof value === 'object' && disposedSendBytesAuthorities.has(value)) {
    throw new AttachmentAssetV2RepoError('GENERATION_V2_ASSET_BYTES_DISPOSED')
  }
  if (!isVerifiedAttachmentSendBytesLeaseV2(value)) {
    throw new AttachmentAssetV2RepoError('GENERATION_V2_ASSET_INPUT_INVALID')
  }
  const bytes = verifiedSendBytesValues.get(value)
  if (!bytes) throw new AttachmentAssetV2RepoError('GENERATION_V2_ASSET_STATE_INVALID')
  return copyOwnedUint8Array(bytes)
}

export async function consumeVerifiedAttachmentSendBytesLeaseV2<T>(
  value: VerifiedAttachmentSendBytesLeaseV2,
  use: (bytes: Uint8Array) => T | Promise<T>,
): Promise<T> {
  if (typeof use !== 'function') throw new AttachmentAssetV2RepoError('GENERATION_V2_ASSET_INPUT_INVALID')
  if (value && typeof value === 'object' && consumingSendBytesAuthorities.has(value)) {
    throw new AttachmentAssetV2RepoError('GENERATION_V2_ASSET_BYTES_LEASE_IN_USE')
  }
  const bytes = copyVerifiedAttachmentSendBytesLeaseV2(value)
  consumingSendBytesAuthorities.add(value)
  try {
    return await use(bytes)
  } finally {
    try {
      zeroUint8ArrayBestEffort(bytes)
    } finally {
      consumingSendBytesAuthorities.delete(value)
      disposeVerifiedAttachmentSendBytesLeaseV2(value)
    }
  }
}

export function disposeVerifiedAttachmentSendBytesLeaseV2(
  value: VerifiedAttachmentSendBytesLeaseV2,
): boolean {
  if (value && typeof value === 'object' && disposedSendBytesAuthorities.has(value)) return false
  if (value && typeof value === 'object' && consumingSendBytesAuthorities.has(value)) {
    throw new AttachmentAssetV2RepoError('GENERATION_V2_ASSET_BYTES_LEASE_IN_USE')
  }
  if (!isVerifiedAttachmentSendBytesLeaseV2(value)) {
    throw new AttachmentAssetV2RepoError('GENERATION_V2_ASSET_INPUT_INVALID')
  }
  const bytes = verifiedSendBytesValues.get(value)
  if (!bytes) throw new AttachmentAssetV2RepoError('GENERATION_V2_ASSET_STATE_INVALID')
  zeroUint8ArrayBestEffort(bytes)
  verifiedSendBytesValues.delete(value)
  verifiedSendBytesAuthorities.delete(value)
  repositoryScopes.delete(value)
  disposedSendBytesAuthorities.add(value)
  return true
}

export class AttachmentAssetV2Repo {
  private readonly scope = Object.freeze({})
  readonly #db: BetterSqlite3.Database
  readonly #nowMs: () => number

  constructor(
    db: BetterSqlite3.Database,
    nowMs: () => number = Date.now,
  ) {
    this.#db = db
    this.#nowMs = nowMs
    db.pragma('foreign_keys = ON')
    if (db.pragma('foreign_keys', { simple: true }) !== 1) {
      throw new AttachmentAssetV2RepoError('GENERATION_V2_ASSET_STATE_INVALID')
    }
  }

  recordBlobFromBytes(bytes: Uint8Array, mimeValue: unknown): AttachmentBlobRepositoryFactV2 {
    return this.runImmediate(this.#db.transaction(() => this.recordBlobFromBytesInCurrentTransaction(bytes, mimeValue)))
  }

  /** Records an already-persisted epoch blob under the caller-owned terminal transaction. */
  recordBlobFromBytesInAuthorityTransaction(
    context: GenerationV2AuthorityTransactionContextV2,
    bytes: Uint8Array,
    mimeValue: unknown,
  ): AttachmentBlobRepositoryFactV2 {
    assertGenerationV2AuthorityTransactionContextV2(context, this.#db)
    return this.recordBlobFromBytesInCurrentTransaction(bytes, mimeValue)
  }

  private recordBlobFromBytesInCurrentTransaction(bytes: Uint8Array, mimeValue: unknown): AttachmentBlobRepositoryFactV2 {
    const mime = safeMime(mimeValue)
    const owned = copyOwnedUint8Array(bytes)
    const sizeBytes = owned.byteLength
    let sha256: string
    try {
      sha256 = sha256PreparedBytesV2(owned)
    } finally {
      zeroUint8ArrayBestEffort(owned)
    }
    const blobId = `blob-v2:${sha256}`
    const storageRef = `sha256/${sha256.slice(0, 2)}/${sha256}`
    const now = safeTime(this.#nowMs())
    const existing = this.findBlob(blobId)
    if (existing) {
      if (existing.sha256.value !== sha256 || existing.sizeBytes !== sizeBytes || existing.mime !== mime ||
          existing.storageRef !== storageRef) {
        throw new AttachmentAssetV2RepoError('GENERATION_V2_ASSET_CONFLICT')
      }
      return existing
    }
    this.#db.prepare(`INSERT INTO file_blob_v2 (
      blob_id, sha256, size_bytes, mime, storage_ref, created_at_ms
    ) VALUES (?, ?, ?, ?, ?, ?)`).run(blobId, sha256, sizeBytes, mime, storageRef, now)
    return this.readBlob(blobId)
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
    const now = safeTime(this.#nowMs())
    const transaction = this.#db.transaction(() => {
      const row = this.#db.prepare(`SELECT asset_kind, filename, source_kind, created_at_ms, retired_at_ms
        FROM file_asset_v2 WHERE asset_id = ?`).get(assetId) as Record<string, unknown> | undefined
      if (row) {
        if (row.asset_kind !== input.assetKind || row.filename !== filename ||
            row.source_kind !== input.sourceKind || row.retired_at_ms !== null) {
          throw new AttachmentAssetV2RepoError('GENERATION_V2_ASSET_CONFLICT')
        }
        return
      }
      this.#db.prepare(`INSERT INTO file_asset_v2 (
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

  createImportedAssetRevisionInAuthorityTransaction(
    context: GenerationV2AuthorityTransactionContextV2,
    value: Readonly<{
      assetId: string
      assetRevisionId: string
      assetKind: AttachmentAssetKindV2
      filename: string
      blob: AttachmentBlobRepositoryFactV2
      sourceKind?: 'user_import' | 'url_import'
    }>,
  ): AttachmentAssetRevisionRepositoryFactV2 {
    assertGenerationV2AuthorityTransactionContextV2(context, this.#db)
    const input = closedObject(value, ['assetId', 'assetRevisionId', 'assetKind', 'filename', 'blob', 'sourceKind'])
    const assetId = GenerationV2Identity.create('asset_id', safeString(input.assetId, 512)).value
    const assetRevisionId = GenerationV2Identity.create(
      'asset_revision_id', safeString(input.assetRevisionId, 512),
    ).value
    const filename = safeString(input.filename, 4096)
    if (input.assetKind !== 'file' && input.assetKind !== 'image') {
      throw new AttachmentAssetV2RepoError('GENERATION_V2_ASSET_INPUT_INVALID')
    }
    const sourceKind = input.sourceKind === undefined ? 'user_import' : input.sourceKind
    if (sourceKind !== 'user_import' && sourceKind !== 'url_import') throw new AttachmentAssetV2RepoError('GENERATION_V2_ASSET_INPUT_INVALID')
    const blob = input.blob as AttachmentBlobRepositoryFactV2
    if (!isAttachmentBlobRepositoryFactV2(blob) || repositoryScopes.get(blob) !== this.scope) {
      throw new AttachmentAssetV2RepoError('GENERATION_V2_ASSET_INPUT_INVALID')
    }
    const currentBlob = this.readBlob(blob.blobId.value)
    if (currentBlob.sha256.value !== blob.sha256.value || currentBlob.sizeBytes !== blob.sizeBytes ||
        currentBlob.mime !== blob.mime || currentBlob.storageRef !== blob.storageRef) {
      throw new AttachmentAssetV2RepoError('GENERATION_V2_ASSET_STATE_INVALID')
    }
    const now = safeTime(this.#nowMs())
    const existingAsset = this.#db.prepare(`SELECT asset_kind, filename, source_kind, retired_at_ms
      FROM file_asset_v2 WHERE asset_id=?`).get(assetId) as Record<string, unknown> | undefined
    if (existingAsset) {
      if (existingAsset.asset_kind !== input.assetKind || existingAsset.filename !== filename ||
          existingAsset.source_kind !== sourceKind || existingAsset.retired_at_ms !== null) {
        throw new AttachmentAssetV2RepoError('GENERATION_V2_ASSET_CONFLICT')
      }
    } else {
      this.#db.prepare(`INSERT INTO file_asset_v2 (
        asset_id, asset_kind, filename, source_kind, created_at_ms, retired_at_ms
      ) VALUES (?, ?, ?, ?, ?, NULL)`).run(assetId, input.assetKind, filename, sourceKind, now)
    }
    try {
      const existing = this.getRevision(assetId, assetRevisionId)
      if (existing.blob.blobId.value !== blob.blobId.value || existing.revisionKind !== 'source') {
        throw new AttachmentAssetV2RepoError('GENERATION_V2_ASSET_CONFLICT')
      }
      return existing
    } catch (error) {
      if (!(error instanceof AttachmentAssetV2RepoError) || error.code !== 'GENERATION_V2_ASSET_NOT_FOUND') throw error
    }
    this.#db.prepare(`INSERT INTO asset_revision_v2 (
      asset_revision_id, asset_id, blob_id, parent_asset_revision_id, revision_kind,
      conversion_kind, conversion_contract_id, conversion_revision, created_at_ms
    ) VALUES (?, ?, ?, NULL, 'source', 'none', NULL, NULL, ?)`).run(
      assetRevisionId, assetId, blob.blobId.value, now,
    )
    return this.getRevision(assetId, assetRevisionId)
  }

  /**
   * Records one immutable conversion output as its own derived asset. The
   * parent may belong to a different asset because a single source document
   * can produce several independently addressable output files or images.
   */
  createDerivedAssetRevision(value: Readonly<{
    assetId: string
    assetRevisionId: string
    assetKind: AttachmentAssetKindV2
    filename: string
    parentAssetRevisionId: string
    conversionKind: Exclude<AttachmentConversionKindV2, 'none'>
    conversionContractId: string
    conversionRevision: string
    blob: AttachmentBlobRepositoryFactV2
  }>): AttachmentAssetRevisionRepositoryFactV2 {
    return this.runImmediate(this.#db.transaction(() => this.createDerivedAssetRevisionInCurrentTransaction(value)))
  }

  createDerivedAssetRevisionInAuthorityTransaction(
    context: GenerationV2AuthorityTransactionContextV2,
    value: Readonly<{
      assetId: string
      assetRevisionId: string
      assetKind: AttachmentAssetKindV2
      filename: string
      parentAssetRevisionId: string
      conversionKind: Exclude<AttachmentConversionKindV2, 'none'>
      conversionContractId: string
      conversionRevision: string
      blob: AttachmentBlobRepositoryFactV2
    }>,
  ): AttachmentAssetRevisionRepositoryFactV2 {
    assertGenerationV2AuthorityTransactionContextV2(context, this.#db)
    return this.createDerivedAssetRevisionInCurrentTransaction(value)
  }

  private createDerivedAssetRevisionInCurrentTransaction(value: Readonly<{
    assetId: string
    assetRevisionId: string
    assetKind: AttachmentAssetKindV2
    filename: string
    parentAssetRevisionId: string
    conversionKind: Exclude<AttachmentConversionKindV2, 'none'>
    conversionContractId: string
    conversionRevision: string
    blob: AttachmentBlobRepositoryFactV2
  }>): AttachmentAssetRevisionRepositoryFactV2 {
    const input = closedObject(value, [
      'assetId', 'assetRevisionId', 'assetKind', 'filename', 'parentAssetRevisionId',
      'conversionKind', 'conversionContractId', 'conversionRevision', 'blob',
    ])
    const assetId = GenerationV2Identity.create('asset_id', safeString(input.assetId, 512)).value
    const assetRevisionId = GenerationV2Identity.create(
      'asset_revision_id', safeString(input.assetRevisionId, 512),
    ).value
    const parentAssetRevisionId = GenerationV2Identity.create(
      'asset_revision_id', safeString(input.parentAssetRevisionId, 512),
    ).value
    const filename = safeString(input.filename, 4096)
    const conversionContractId = safeString(input.conversionContractId, 512)
    const conversionRevision = safeString(input.conversionRevision, 512)
    if ((input.assetKind !== 'file' && input.assetKind !== 'image') ||
        (input.conversionKind !== 'pdf' && input.conversionKind !== 'plain_text' && input.conversionKind !== 'images')) {
      throw new AttachmentAssetV2RepoError('GENERATION_V2_ASSET_INPUT_INVALID')
    }
    const blob = input.blob as AttachmentBlobRepositoryFactV2
    if (!isAttachmentBlobRepositoryFactV2(blob) || repositoryScopes.get(blob) !== this.scope) {
      throw new AttachmentAssetV2RepoError('GENERATION_V2_ASSET_INPUT_INVALID')
    }
    const now = safeTime(this.#nowMs())
      const parent = this.#db.prepare(`SELECT asset_revision_id FROM asset_revision_v2
        WHERE asset_revision_id=?`).get(parentAssetRevisionId) as { asset_revision_id: unknown } | undefined
      if (parent?.asset_revision_id !== parentAssetRevisionId) {
        throw new AttachmentAssetV2RepoError('GENERATION_V2_ASSET_NOT_FOUND')
      }
      const currentBlob = this.readBlob(blob.blobId.value)
      if (currentBlob.sha256.value !== blob.sha256.value || currentBlob.sizeBytes !== blob.sizeBytes ||
          currentBlob.mime !== blob.mime || currentBlob.storageRef !== blob.storageRef) {
        throw new AttachmentAssetV2RepoError('GENERATION_V2_ASSET_STATE_INVALID')
      }
      const existingAsset = this.#db.prepare(`SELECT asset_kind, filename, source_kind, retired_at_ms
        FROM file_asset_v2 WHERE asset_id=?`).get(assetId) as Record<string, unknown> | undefined
      if (existingAsset) {
        if (existingAsset.asset_kind !== input.assetKind || existingAsset.filename !== filename ||
            existingAsset.source_kind !== 'derived' || existingAsset.retired_at_ms !== null) {
          throw new AttachmentAssetV2RepoError('GENERATION_V2_ASSET_CONFLICT')
        }
      } else {
        this.#db.prepare(`INSERT INTO file_asset_v2 (
          asset_id, asset_kind, filename, source_kind, created_at_ms, retired_at_ms
        ) VALUES (?, ?, ?, 'derived', ?, NULL)`).run(assetId, input.assetKind, filename, now)
      }
      try {
        const existing = this.getRevision(assetId, assetRevisionId)
        if (existing.blob.blobId.value !== blob.blobId.value ||
            existing.parentAssetRevisionId?.value !== parentAssetRevisionId ||
            existing.conversionKind !== input.conversionKind ||
            existing.conversionContractId !== conversionContractId ||
            existing.conversionRevision !== conversionRevision) {
          throw new AttachmentAssetV2RepoError('GENERATION_V2_ASSET_CONFLICT')
        }
        return existing
      } catch (error) {
        if (!(error instanceof AttachmentAssetV2RepoError) || error.code !== 'GENERATION_V2_ASSET_NOT_FOUND') throw error
      }
      this.#db.prepare(`INSERT INTO asset_revision_v2 (
        asset_revision_id, asset_id, blob_id, parent_asset_revision_id, revision_kind,
        conversion_kind, conversion_contract_id, conversion_revision, created_at_ms
      ) VALUES (?, ?, ?, ?, 'derived', ?, ?, ?, ?)`).run(
        assetRevisionId, assetId, blob.blobId.value, parentAssetRevisionId,
        input.conversionKind, conversionContractId, conversionRevision, now,
      )
      return this.getRevision(assetId, assetRevisionId)
  }

  /**
   * Creates the immutable asset/revision pair for a provider-generated image
   * inside the caller's generation terminal transaction. The bytes must have
   * reached the epoch-owned blob store before its matching blob fact is
   * recorded; the caller then atomically associates this revision with the
   * completed request through `generation_image_output_v2`.
   */
  createGeneratedImageAssetInAuthorityTransaction(
    context: GenerationV2AuthorityTransactionContextV2,
    value: Readonly<{
      assetId: string
      assetRevisionId: string
      filename: string
      blob: AttachmentBlobRepositoryFactV2
    }>,
  ): AttachmentAssetRevisionRepositoryFactV2 {
    assertGenerationV2AuthorityTransactionContextV2(context, this.#db)
    const input = closedObject(value, ['assetId', 'assetRevisionId', 'filename', 'blob'])
    const assetId = GenerationV2Identity.create('asset_id', safeString(input.assetId, 512)).value
    const assetRevisionId = GenerationV2Identity.create(
      'asset_revision_id', safeString(input.assetRevisionId, 512),
    ).value
    const filename = safeString(input.filename, 4096)
    const blob = input.blob as AttachmentBlobRepositoryFactV2
    if (!isAttachmentBlobRepositoryFactV2(blob) || repositoryScopes.get(blob) !== this.scope) {
      throw new AttachmentAssetV2RepoError('GENERATION_V2_ASSET_INPUT_INVALID')
    }
    const currentBlob = this.readBlob(blob.blobId.value)
    if (currentBlob.sha256.value !== blob.sha256.value || currentBlob.sizeBytes !== blob.sizeBytes ||
        currentBlob.mime !== blob.mime || currentBlob.storageRef !== blob.storageRef) {
      throw new AttachmentAssetV2RepoError('GENERATION_V2_ASSET_STATE_INVALID')
    }
    const now = safeTime(this.#nowMs())
    const existingAsset = this.#db.prepare(`SELECT asset_kind, filename, source_kind, retired_at_ms
      FROM file_asset_v2 WHERE asset_id=?`).get(assetId) as Record<string, unknown> | undefined
    if (existingAsset) {
      if (existingAsset.asset_kind !== 'image' || existingAsset.filename !== filename ||
          existingAsset.source_kind !== 'generated' || existingAsset.retired_at_ms !== null) {
        throw new AttachmentAssetV2RepoError('GENERATION_V2_ASSET_CONFLICT')
      }
    } else {
      this.#db.prepare(`INSERT INTO file_asset_v2 (
        asset_id, asset_kind, filename, source_kind, created_at_ms, retired_at_ms
      ) VALUES (?, 'image', ?, 'generated', ?, NULL)`).run(assetId, filename, now)
    }
    try {
      const existing = this.getRevision(assetId, assetRevisionId)
      if (existing.assetKind !== 'image' || existing.sourceKind !== 'generated' ||
          existing.blob.blobId.value !== blob.blobId.value) {
        throw new AttachmentAssetV2RepoError('GENERATION_V2_ASSET_CONFLICT')
      }
      return existing
    } catch (error) {
      if (!(error instanceof AttachmentAssetV2RepoError) || error.code !== 'GENERATION_V2_ASSET_NOT_FOUND') {
        throw error
      }
    }
    this.#db.prepare(`INSERT INTO asset_revision_v2 (
      asset_revision_id, asset_id, blob_id, parent_asset_revision_id, revision_kind,
      conversion_kind, conversion_contract_id, conversion_revision, created_at_ms
    ) VALUES (?, ?, ?, NULL, 'source', 'none', NULL, NULL, ?)`).run(
      assetRevisionId, assetId, blob.blobId.value, now,
    )
    return this.getRevision(assetId, assetRevisionId)
  }

  getRevision(assetIdValue: string, assetRevisionIdValue: string): AttachmentAssetRevisionRepositoryFactV2 {
    const assetId = GenerationV2Identity.create('asset_id', assetIdValue).value
    const assetRevisionId = GenerationV2Identity.create('asset_revision_id', assetRevisionIdValue).value
    const row = this.#db.prepare(`SELECT
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

  withSynchronousResolvedIntentAttachmentSetAuthority<T>(
    context: GenerationV2AuthorityTransactionContextV2,
    resolvedIntent: DecodedResolvedGenerationIntentV2,
    use: (authority: ResolvedAttachmentSetAuthorityV2) => T extends PromiseLike<unknown> ? never : T,
  ): T {
    assertGenerationV2AuthorityTransactionContextV2(context, this.#db)
    if (typeof use !== 'function') throw new AttachmentAssetV2RepoError('GENERATION_V2_ASSET_INPUT_INVALID')
    if (!isDecodedResolvedGenerationIntentV2(resolvedIntent)) {
      throw new AttachmentAssetV2RepoError('GENERATION_V2_ASSET_INPUT_INVALID')
    }
    const intents = resolvedIntent.value.attachments
    const managedIntents = intents.filter((intent): intent is Extract<AttachmentIntentV2, {kind:'managed_file'}> => intent.kind === 'managed_file')
    const urlReferenceIntents = intents.filter((intent): intent is Extract<AttachmentIntentV2, {kind:'url_reference'}> => intent.kind === 'url_reference')
    const references = managedIntents.map((intent) => Object.freeze({
      assetId: readGenerationV2Identity(intent.assetId, 'asset_id'),
      assetRevisionId: readGenerationV2Identity(intent.assetRevisionId, 'asset_revision_id'),
      assetSha256: readGenerationV2Digest(intent.assetSha256, 'asset_sha256'),
      conversion: intent.conversion,
    }))
    const revisionKeys = references.map((reference) => reference.assetRevisionId)
    if (new Set(revisionKeys).size !== revisionKeys.length) {
      throw new AttachmentAssetV2RepoError('GENERATION_V2_ASSET_DUPLICATE_REFERENCE')
    }
    const facts = references.map((reference) => this.resolveReferenceFact(reference))
    const verifiedUrlReferenceIntents = urlReferenceIntents.map((intent) =>
      this.resolveUrlReferenceIntent(intent),
    )
    const pendingByAttachment: VerifiedAttachmentSendBytesLeaseV2[][] = facts.map(() => [])
    const attachments = facts.map((fact, index) => {
      const authority = Object.freeze({
        trust: 'resolved_attachment_asset_authority' as const,
        usage: 'snapshot_reference_verified' as const,
        intent: managedIntents[index],
        revision: fact,
      })
      attachmentAuthorities.add(authority)
      attachmentAuthorityContexts.set(authority, context)
      repositoryScopes.set(authority, this.scope)
      pendingSendBytesByReferenceAuthority.set(authority, { values: pendingByAttachment[index] })
      return authority
    })
    const providerFileRequirements = attachments
      .filter((attachment) => requiresProviderFileBindingV2(attachment.intent))
      .map((attachment) => Object.freeze({
        assetId: attachment.revision.assetId,
        assetRevisionId: attachment.revision.assetRevisionId,
        assetSha256: attachment.revision.blob.sha256,
      }))
    const authority = Object.freeze({
      trust: 'resolved_attachment_set_authority' as const,
      usage: 'resolved_intent_attachment_set_verified' as const,
      attachments: Object.freeze(attachments),
      urlReferenceIntents: Object.freeze(verifiedUrlReferenceIntents),
      providerFileRequirements: Object.freeze(providerFileRequirements),
      requiresProviderFileAuthority: providerFileRequirements.length > 0,
    })
    attachmentSetAuthorities.add(authority)
    attachmentSetAuthorityContexts.set(authority, context)
    repositoryScopes.set(authority, this.scope)
    let completed = false
    const revokeAuthorities = () => {
      attachmentSetAuthorities.delete(authority)
      attachmentSetAuthorityContexts.delete(authority)
      repositoryScopes.delete(authority)
      for (const attachment of attachments) {
        pendingSendBytesByReferenceAuthority.delete(attachment)
        attachmentAuthorities.delete(attachment)
        attachmentAuthorityContexts.delete(attachment)
        repositoryScopes.delete(attachment)
      }
    }
    registerGenerationV2AuthorityTransactionParticipantV2(context, this.#db, {
      preCommit: () => {
        if (!completed) throw new AttachmentAssetV2RepoError('GENERATION_V2_ASSET_STATE_INVALID')
        references.forEach((reference, index) => {
          const finalFact = this.resolveReferenceFact(reference)
          const initialFact = facts[index]
          if (finalFact.assetId.value !== initialFact.assetId.value ||
              finalFact.assetRevisionId.value !== initialFact.assetRevisionId.value ||
              finalFact.blob.blobId.value !== initialFact.blob.blobId.value ||
              finalFact.blob.sha256.value !== initialFact.blob.sha256.value) {
            throw new AttachmentAssetV2RepoError('GENERATION_V2_ASSET_STATE_INVALID')
          }
        })
      },
      committed: () => {
        revokeAuthorities()
        for (const pending of pendingByAttachment) {
          for (const value of pending) verifiedSendBytesAuthorities.add(value)
        }
      },
      rolledBack: () => {
        revokeAuthorities()
        for (const pending of pendingByAttachment) revokePendingVerifiedSendBytes(pending)
      },
    })
    try {
      const result = use(authority)
      if (hasThenMember(result)) throw new AttachmentAssetV2RepoError('GENERATION_V2_ASSET_INPUT_INVALID')
      completed = true
      return result
    } finally {
      revokeAuthorities()
    }
  }

  private resolveUrlReferenceIntent(
    intent: Extract<AttachmentIntentV2, {kind:'url_reference'}>,
  ): Extract<AttachmentIntentV2, {kind:'url_reference'}> {
    const row = this.#db.prepare(`SELECT reference_id, reference_revision, original_url,
      url_digest, media_kind, declared_media_type, captured_at_ms, provenance
      FROM url_attachment_reference_v2
      WHERE reference_id = ? AND reference_revision = ?`).get(
      intent.referenceId.value,
      intent.referenceRevision.value,
    ) as UrlReferenceRowV2 | undefined
    if (!row) throw new AttachmentAssetV2RepoError('GENERATION_V2_URL_REFERENCE_NOT_FOUND')
    if (row.reference_id !== intent.referenceId.value ||
        row.reference_revision !== intent.referenceRevision.value ||
        row.original_url !== intent.originalUrl ||
        row.url_digest !== intent.urlDigest.value ||
        row.media_kind !== intent.mediaKind ||
        row.declared_media_type !== (intent.declaredMediaType ?? null) ||
        row.captured_at_ms !== intent.capturedAtMs ||
        row.provenance !== intent.provenance ||
        sha256PreparedBytesV2(new TextEncoder().encode(intent.originalUrl)) !== intent.urlDigest.value) {
      throw new AttachmentAssetV2RepoError('GENERATION_V2_URL_REFERENCE_INTENT_MISMATCH')
    }
    return intent
  }

  withSynchronousSnapshotReferenceAuthority<T>(
    context: GenerationV2AuthorityTransactionContextV2,
    intent: Extract<AttachmentIntentV2, {kind:'managed_file'}>,
    use: (authority: ResolvedAttachmentAssetAuthorityV2) => T extends PromiseLike<unknown> ? never : T,
  ): T {
    assertGenerationV2AuthorityTransactionContextV2(context, this.#db)
    if (!isAttachmentIntentV2(intent) || intent.kind !== 'managed_file' || typeof use !== 'function') {
      throw new AttachmentAssetV2RepoError('GENERATION_V2_ASSET_INPUT_INVALID')
    }
    const reference = Object.freeze({
      assetId: readGenerationV2Identity(intent.assetId, 'asset_id'),
      assetRevisionId: readGenerationV2Identity(intent.assetRevisionId, 'asset_revision_id'),
      assetSha256: readGenerationV2Digest(intent.assetSha256, 'asset_sha256'),
      conversion: intent.conversion,
    })
    const pendingSendBytes: VerifiedAttachmentSendBytesLeaseV2[] = []
    const fact = this.resolveReferenceFact(reference)
    const authority = Object.freeze({
      trust: 'resolved_attachment_asset_authority' as const,
      usage: 'snapshot_reference_verified' as const,
      intent,
      revision: fact,
    })
    attachmentAuthorities.add(authority)
    attachmentAuthorityContexts.set(authority, context)
    repositoryScopes.set(authority, this.scope)
    pendingSendBytesByReferenceAuthority.set(authority, { values: pendingSendBytes })
    let completed = false
    const revokeAuthority = () => {
      pendingSendBytesByReferenceAuthority.delete(authority)
      attachmentAuthorities.delete(authority)
      attachmentAuthorityContexts.delete(authority)
      repositoryScopes.delete(authority)
    }
    registerGenerationV2AuthorityTransactionParticipantV2(context, this.#db, {
      preCommit: () => {
        if (!completed) throw new AttachmentAssetV2RepoError('GENERATION_V2_ASSET_STATE_INVALID')
        const finalFact = this.resolveReferenceFact(reference)
        if (finalFact.assetId.value !== fact.assetId.value ||
            finalFact.assetRevisionId.value !== fact.assetRevisionId.value ||
            finalFact.blob.blobId.value !== fact.blob.blobId.value ||
            finalFact.blob.sha256.value !== fact.blob.sha256.value) {
          throw new AttachmentAssetV2RepoError('GENERATION_V2_ASSET_STATE_INVALID')
        }
      },
      committed: () => {
        revokeAuthority()
        for (const value of pendingSendBytes) verifiedSendBytesAuthorities.add(value)
      },
      rolledBack: () => {
        revokeAuthority()
        revokePendingVerifiedSendBytes(pendingSendBytes)
      },
    })
    try {
      const result = use(authority)
      if (hasThenMember(result)) throw new AttachmentAssetV2RepoError('GENERATION_V2_ASSET_INPUT_INVALID')
      completed = true
      return result
    } finally {
      revokeAuthority()
    }
  }

  verifyAttachmentSendBytes(
    authority: ResolvedAttachmentAssetAuthorityV2,
    bytes: Uint8Array,
  ): VerifiedAttachmentSendBytesLeaseV2 {
    if (!isResolvedAttachmentAssetAuthorityV2(authority) ||
        repositoryScopes.get(authority) !== this.scope) {
      throw new AttachmentAssetV2RepoError('GENERATION_V2_ASSET_INPUT_INVALID')
    }
    if (!authority.intent.include) {
      throw new AttachmentAssetV2RepoError('GENERATION_V2_ASSET_SEND_BYTES_NOT_INCLUDED')
    }
    const pending = pendingSendBytesByReferenceAuthority.get(authority)
    if (!pending) throw new AttachmentAssetV2RepoError('GENERATION_V2_ASSET_INPUT_INVALID')
    const owned = copyOwnedUint8Array(bytes)
    try {
      const sha256 = sha256PreparedBytesV2(owned)
      if (owned.byteLength !== authority.revision.blob.sizeBytes ||
          sha256 !== authority.revision.blob.sha256.value) {
        throw new AttachmentAssetV2RepoError('GENERATION_V2_ASSET_BYTES_MISMATCH')
      }
      const verified = Object.freeze({
        trust: 'verified_attachment_send_bytes_lease' as const,
        assetId: authority.revision.assetId,
        assetRevisionId: authority.revision.assetRevisionId,
        assetSha256: authority.revision.blob.sha256,
        blobId: authority.revision.blob.blobId,
        filename: authority.revision.filename,
        mime: authority.revision.blob.mime,
        sizeBytes: authority.revision.blob.sizeBytes,
      })
      verifiedSendBytesValues.set(verified, owned)
      repositoryScopes.set(verified, this.scope)
      pending.values.push(verified)
      return verified
    } catch (error) {
      zeroUint8ArrayBestEffort(owned)
      throw error
    }
  }

  retireAsset(assetIdValue: string): void {
    const assetId = GenerationV2Identity.create('asset_id', assetIdValue).value
    const now = safeTime(this.#nowMs())
    const transaction = this.#db.transaction(() => {
      const result = this.#db.prepare(`UPDATE file_asset_v2 SET retired_at_ms = ?
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
    if (fact.revisionKind === 'derived') {
      const targetKinds = fact.conversionKind === 'pdf' ? ['pdf_attachment']
        : fact.conversionKind === 'plain_text' ? ['plain_text', 'markdown', 'code', 'table_markdown'] : []
      const parentRevisionId = fact.parentAssetRevisionId?.value
      const output = targetKinds.length === 0 || parentRevisionId === undefined ||
        fact.conversionContractId === null || fact.conversionRevision === null ? undefined :
        this.#db.prepare(`SELECT source_asset_revision_id, target_kind, converter_contract_id,
          converter_revision, conversion_settings_digest, warnings_json, created_at_ms
          FROM dfc_conversion_output_v2 WHERE derived_asset_revision_id=?`).get(
          fact.assetRevisionId.value,
        ) as Record<string, unknown> | undefined
      if (!output || output.source_asset_revision_id !== parentRevisionId ||
          typeof output.target_kind !== 'string' || !targetKinds.includes(output.target_kind) ||
          output.converter_contract_id !== fact.conversionContractId || output.converter_revision !== fact.conversionRevision ||
          typeof output.conversion_settings_digest !== 'string' || !/^[0-9a-f]{64}$/u.test(output.conversion_settings_digest) ||
          typeof output.warnings_json !== 'string' || typeof output.created_at_ms !== 'number' ||
          !Number.isSafeInteger(output.created_at_ms) || output.created_at_ms < 0) {
        throw new AttachmentAssetV2RepoError('GENERATION_V2_ASSET_DFC_PROVENANCE_INVALID')
      }
    }
    return fact
  }

  private findBlob(blobId: string): AttachmentBlobRepositoryFactV2 | null {
    const row = this.#db.prepare(`SELECT
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
    const now = safeTime(this.#nowMs())
    const transaction = this.#db.transaction(() => {
      const asset = this.#db.prepare('SELECT retired_at_ms FROM file_asset_v2 WHERE asset_id = ?')
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
      this.#db.prepare(`INSERT INTO asset_revision_v2 (
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
