import { mkdirSync } from 'node:fs'
import path from 'node:path'
import { normalizeExtension } from '../../src/shared/files/fileRules'

export const LOCAL_FILE_STORAGE_BACKEND = 'local_fs' as const
export const FILE_STORAGE_ROOT_DIR = 'assets' as const
export const BLOB_ASSET_DIR = 'blobs' as const
export const ORIGINAL_ASSET_DIR = 'original' as const
export const DERIVED_ASSET_DIR = 'derived' as const

export type BlobPathInput = Readonly<{
  rootDir: string
  sha256: string
  extension?: string | null
}>

export type OriginalAssetPathInput = Readonly<{
  rootDir: string
  assetId: string
  extension?: string | null
}>

export type DerivativePathInput = Readonly<{
  rootDir: string
  parentAssetId: string
  derivativeId: string
  extension?: string | null
}>

export function ensureStorageLayout(rootDir: string): void {
  mkdirSync(path.join(rootDir, FILE_STORAGE_ROOT_DIR, BLOB_ASSET_DIR), { recursive: true })
  mkdirSync(path.join(rootDir, FILE_STORAGE_ROOT_DIR, ORIGINAL_ASSET_DIR), { recursive: true })
  mkdirSync(path.join(rootDir, FILE_STORAGE_ROOT_DIR, DERIVED_ASSET_DIR), { recursive: true })
}

export function getBlobStorageUri(input: Omit<BlobPathInput, 'rootDir'>): string {
  const sha256 = safeSha256(input.sha256)
  const bucket = sha256.slice(0, 2)
  return toStorageUri(FILE_STORAGE_ROOT_DIR, BLOB_ASSET_DIR, bucket, `${sha256}.${storageExtension(input.extension)}`)
}

export function getBlobPath(input: BlobPathInput): string {
  return path.join(input.rootDir, ...getBlobStorageUri(input).split('/'))
}

export function getOriginalAssetStorageUri(input: Omit<OriginalAssetPathInput, 'rootDir'>): string {
  const assetId = safePathSegment(input.assetId)
  const bucket = bucketForAssetId(assetId)
  return toStorageUri(FILE_STORAGE_ROOT_DIR, ORIGINAL_ASSET_DIR, bucket, `${assetId}.${storageExtension(input.extension)}`)
}

export function getOriginalAssetPath(input: OriginalAssetPathInput): string {
  return path.join(input.rootDir, ...getOriginalAssetStorageUri(input).split('/'))
}

export function getDerivativeStorageUri(input: Omit<DerivativePathInput, 'rootDir'>): string {
  const parentAssetId = safePathSegment(input.parentAssetId)
  const derivativeId = safePathSegment(input.derivativeId)
  return toStorageUri(
    FILE_STORAGE_ROOT_DIR,
    DERIVED_ASSET_DIR,
    parentAssetId,
    `${derivativeId}.${storageExtension(input.extension)}`
  )
}

export function getDerivativePath(input: DerivativePathInput): string {
  return path.join(input.rootDir, ...getDerivativeStorageUri(input).split('/'))
}

function storageExtension(value: string | null | undefined): string {
  return normalizeExtension(value) ?? 'bin'
}

function bucketForAssetId(assetId: string): string {
  return assetId.slice(0, 2).toLowerCase().padEnd(2, '0')
}

function safePathSegment(value: string): string {
  const normalized = String(value ?? '').trim().replace(/[^a-zA-Z0-9._-]/g, '_')
  if (!normalized) throw new Error('storage path segment must be non-empty')
  return normalized
}

function safeSha256(value: string): string {
  const normalized = String(value ?? '').trim().toLowerCase()
  if (!/^[a-f0-9]{64}$/.test(normalized)) throw new Error('sha256 storage path segment must be a 64-character hex digest')
  return normalized
}

function toStorageUri(...segments: string[]): string {
  return segments.join('/')
}

