import BetterSqlite3 from 'better-sqlite3'
import { createHash, randomUUID } from 'node:crypto'
import { existsSync, mkdirSync, renameSync, rmSync, writeFileSync } from 'node:fs'
import path from 'node:path'
import { pathToFileURL } from 'node:url'
import type {
  GetMessageAssetByIdInput,
  ListMessageAssetsByMessageIdsInput,
  MessageAssetRecord,
  PersistMessageAssetsFromDataUrlsInput,
} from '../types'

type SqlDatabase = BetterSqlite3.Database

type AssetRow = Readonly<{
  id: string
  hash: string
  mime: string
  width: number | null
  height: number | null
  bytes: number
  path: string
}>

type AssetUpsertResult = Readonly<{
  asset: AssetRow
  assetCreated: boolean
  fileCreated: boolean
}>

export type MessageAssetErrorCode =
  | 'invalid_data_url'
  | 'invalid_image_mime'
  | 'base64_decode_failed'
  | 'image_too_large'
  | 'mime_mismatch_for_hash'
  | 'atomic_write_failed'

export class MessageAssetRepoError extends Error {
  readonly code: MessageAssetErrorCode
  readonly details?: Readonly<Record<string, unknown>>

  constructor(code: MessageAssetErrorCode, message: string, details?: Readonly<Record<string, unknown>>) {
    super(message)
    this.name = 'MessageAssetRepoError'
    this.code = code
    this.details = details
  }
}

export type DecodedImageDataUrl = Readonly<{
  mime: string
  bytes: Buffer
}>

export const DEFAULT_MAX_IMAGE_BYTES = 20 * 1024 * 1024

function normalizeDataUrl(value: string): string {
  return value.trim().replace(/\s+/g, '')
}

function throwRepoError(
  code: MessageAssetErrorCode,
  message: string,
  details?: Readonly<Record<string, unknown>>
): never {
  throw new MessageAssetRepoError(code, message, details)
}

// Hash is computed from decoded bytes (not from data URL text) to ensure canonical dedupe.
export function decodeImageDataUrl(value: string, maxImageBytes: number = DEFAULT_MAX_IMAGE_BYTES): DecodedImageDataUrl {
  const normalized = normalizeDataUrl(value)
  const matched = normalized.match(/^data:([^;,]+);base64,([a-z0-9+/=_-]+)$/i)
  if (!matched) {
    throwRepoError('invalid_data_url', 'message asset data URL is invalid', {
      sample: normalized.slice(0, 48),
    })
  }

  const mime = String(matched[1] ?? '').toLowerCase()
  if (!mime.startsWith('image/')) {
    throwRepoError('invalid_image_mime', 'message asset MIME is not image/*', { mime })
  }

  let bytes: Buffer
  try {
    bytes = Buffer.from(String(matched[2] ?? ''), 'base64')
  } catch {
    throwRepoError('base64_decode_failed', 'message asset base64 decoding failed')
  }
  if (bytes.length <= 0) {
    throwRepoError('base64_decode_failed', 'message asset base64 decoded to empty payload')
  }
  if (bytes.length > maxImageBytes) {
    throwRepoError('image_too_large', 'message asset image exceeds max bytes', {
      maxImageBytes,
      actualBytes: bytes.length,
    })
  }

  return { mime, bytes }
}

function mimeToExtension(mime: string): string {
  switch (mime) {
    case 'image/jpeg':
      return 'jpg'
    case 'image/png':
      return 'png'
    case 'image/webp':
      return 'webp'
    case 'image/gif':
      return 'gif'
    case 'image/bmp':
      return 'bmp'
    case 'image/tiff':
      return 'tiff'
    case 'image/avif':
      return 'avif'
    default:
      return 'bin'
  }
}

function readUInt24LE(bytes: Buffer, offset: number): number {
  return bytes[offset] | (bytes[offset + 1] << 8) | (bytes[offset + 2] << 16)
}

function parsePngDimensions(bytes: Buffer): Readonly<{ width: number; height: number }> | null {
  if (bytes.length < 24) return null
  const pngSig = '89504e470d0a1a0a'
  if (bytes.subarray(0, 8).toString('hex') !== pngSig) return null
  const chunkType = bytes.subarray(12, 16).toString('ascii')
  if (chunkType !== 'IHDR') return null
  const width = bytes.readUInt32BE(16)
  const height = bytes.readUInt32BE(20)
  if (width <= 0 || height <= 0) return null
  return { width, height }
}

function parseGifDimensions(bytes: Buffer): Readonly<{ width: number; height: number }> | null {
  if (bytes.length < 10) return null
  const sig = bytes.subarray(0, 6).toString('ascii')
  if (sig !== 'GIF87a' && sig !== 'GIF89a') return null
  const width = bytes.readUInt16LE(6)
  const height = bytes.readUInt16LE(8)
  if (width <= 0 || height <= 0) return null
  return { width, height }
}

function parseJpegDimensions(bytes: Buffer): Readonly<{ width: number; height: number }> | null {
  if (bytes.length < 4) return null
  if (bytes[0] !== 0xff || bytes[1] !== 0xd8) return null
  let offset = 2
  while (offset + 3 < bytes.length) {
    if (bytes[offset] !== 0xff) {
      offset += 1
      continue
    }
    const marker = bytes[offset + 1]
    if (marker === 0xd9 || marker === 0xda) break
    if (offset + 4 > bytes.length) break
    const segmentLength = bytes.readUInt16BE(offset + 2)
    if (segmentLength < 2) break
    const isSofMarker =
      marker === 0xc0 ||
      marker === 0xc1 ||
      marker === 0xc2 ||
      marker === 0xc3 ||
      marker === 0xc5 ||
      marker === 0xc6 ||
      marker === 0xc7 ||
      marker === 0xc9 ||
      marker === 0xca ||
      marker === 0xcb ||
      marker === 0xcd ||
      marker === 0xce ||
      marker === 0xcf
    if (isSofMarker) {
      const sofOffset = offset + 5
      if (sofOffset + 3 >= bytes.length) return null
      const height = bytes.readUInt16BE(sofOffset)
      const width = bytes.readUInt16BE(sofOffset + 2)
      if (width <= 0 || height <= 0) return null
      return { width, height }
    }
    offset += 2 + segmentLength
  }
  return null
}

function parseWebpDimensions(bytes: Buffer): Readonly<{ width: number; height: number }> | null {
  if (bytes.length < 30) return null
  if (bytes.subarray(0, 4).toString('ascii') !== 'RIFF') return null
  if (bytes.subarray(8, 12).toString('ascii') !== 'WEBP') return null

  const chunk = bytes.subarray(12, 16).toString('ascii')
  if (chunk === 'VP8X') {
    const width = readUInt24LE(bytes, 24) + 1
    const height = readUInt24LE(bytes, 27) + 1
    if (width <= 0 || height <= 0) return null
    return { width, height }
  }

  if (chunk === 'VP8 ') {
    if (bytes.length < 30) return null
    const width = bytes.readUInt16LE(26) & 0x3fff
    const height = bytes.readUInt16LE(28) & 0x3fff
    if (width <= 0 || height <= 0) return null
    return { width, height }
  }

  if (chunk === 'VP8L') {
    if (bytes.length < 25 || bytes[20] !== 0x2f) return null
    const b0 = bytes[21]
    const b1 = bytes[22]
    const b2 = bytes[23]
    const b3 = bytes[24]
    const width = 1 + (b0 | ((b1 & 0x3f) << 8))
    const height = 1 + (((b1 >> 6) & 0x03) | (b2 << 2) | ((b3 & 0x0f) << 10))
    if (width <= 0 || height <= 0) return null
    return { width, height }
  }

  return null
}

export function parseImageDimensions(bytes: Buffer, mime: string): Readonly<{ width: number; height: number }> | null {
  if (mime === 'image/png') return parsePngDimensions(bytes)
  if (mime === 'image/jpeg') return parseJpegDimensions(bytes)
  if (mime === 'image/webp') return parseWebpDimensions(bytes)
  if (mime === 'image/gif') return parseGifDimensions(bytes)
  return null
}

function writeFileAtomically(filePath: string, bytes: Buffer) {
  mkdirSync(path.dirname(filePath), { recursive: true })
  const tmpPath = `${filePath}.tmp-${process.pid}-${Date.now()}-${Math.random().toString(16).slice(2)}`
  try {
    writeFileSync(tmpPath, bytes, { flag: 'wx' })
    renameSync(tmpPath, filePath)
  } catch (error) {
    rmSync(tmpPath, { force: true })
    throw new MessageAssetRepoError('atomic_write_failed', 'atomic write failed for message asset file', {
      filePath,
      error: String((error as any)?.message ?? error),
    })
  }
}

function toAssetOutput(messageId: string, ordinal: number, asset: AssetRow): MessageAssetRecord {
  return {
    messageId,
    assetId: asset.id,
    ordinal,
    hash: asset.hash,
    mime: asset.mime,
    width: asset.width,
    height: asset.height,
    bytes: asset.bytes,
    path: asset.path,
    fileUrl: pathToFileURL(asset.path).toString(),
    assetUrl: `asset://${asset.id}`,
  }
}

export class MessageAssetRepo {
  private findByHashStmt: BetterSqlite3.Statement
  private findByIdStmt: BetterSqlite3.Statement
  private insertAssetStmt: BetterSqlite3.Statement
  private deleteMessageLinksStmt: BetterSqlite3.Statement
  private insertMessageLinkStmt: BetterSqlite3.Statement

  constructor(
    private db: SqlDatabase,
    private assetDirectory: string,
    private maxImageBytes: number = DEFAULT_MAX_IMAGE_BYTES
  ) {
    mkdirSync(this.assetDirectory, { recursive: true })

    this.findByHashStmt = this.db.prepare(`
      SELECT id, hash, mime, width, height, bytes, path
      FROM asset
      WHERE hash = @hash
      LIMIT 1
    `)

    this.findByIdStmt = this.db.prepare(`
      SELECT id, hash, mime, width, height, bytes, path
      FROM asset
      WHERE id = @id
      LIMIT 1
    `)

    this.insertAssetStmt = this.db.prepare(`
      INSERT INTO asset(id, hash, mime, width, height, bytes, path, created_at, updated_at)
      VALUES (@id, @hash, @mime, @width, @height, @bytes, @path, @createdAt, @updatedAt)
    `)

    this.deleteMessageLinksStmt = this.db.prepare(`
      DELETE FROM message_asset
      WHERE message_id = @messageId
    `)

    this.insertMessageLinkStmt = this.db.prepare(`
      INSERT INTO message_asset(message_id, asset_id, ordinal, created_at)
      VALUES (@messageId, @assetId, @ordinal, @createdAt)
    `)
  }

  private upsertAssetFromDataUrl(dataUrl: string): AssetUpsertResult {
    const decoded = decodeImageDataUrl(dataUrl, this.maxImageBytes)

    const hash = createHash('sha256').update(decoded.bytes).digest('hex')
    const existing = this.findByHashStmt.get({ hash }) as AssetRow | undefined
    if (existing) {
      if (existing.mime && existing.mime !== decoded.mime) {
        throwRepoError('mime_mismatch_for_hash', 'existing asset hash has mismatched MIME', {
          hash,
          existingMime: existing.mime,
          incomingMime: decoded.mime,
        })
      }

      let fileCreated = false
      if (!existsSync(existing.path)) {
        writeFileAtomically(existing.path, decoded.bytes)
        fileCreated = true
      }
      return {
        asset: existing,
        assetCreated: false,
        fileCreated,
      }
    }

    const ext = mimeToExtension(decoded.mime)
    const filePath = path.resolve(this.assetDirectory, `${hash}.${ext}`)

    let fileCreated = false
    if (!existsSync(filePath)) {
      writeFileAtomically(filePath, decoded.bytes)
      fileCreated = true
    }

    const now = Date.now()
    const dimensions = parseImageDimensions(decoded.bytes, decoded.mime)
    const row: AssetRow = {
      id: randomUUID(),
      hash,
      mime: decoded.mime,
      width: dimensions?.width ?? null,
      height: dimensions?.height ?? null,
      bytes: decoded.bytes.length,
      path: filePath,
    }

    try {
      this.insertAssetStmt.run({
        id: row.id,
        hash: row.hash,
        mime: row.mime,
        width: row.width,
        height: row.height,
        bytes: row.bytes,
        path: row.path,
        createdAt: now,
        updatedAt: now,
      })
      return {
        asset: row,
        assetCreated: true,
        fileCreated,
      }
    } catch (error) {
      const raced = this.findByHashStmt.get({ hash }) as AssetRow | undefined
      if (raced) {
        return {
          asset: raced,
          assetCreated: false,
          fileCreated: false,
        }
      }
      if (fileCreated) rmSync(filePath, { force: true })
      throw error
    }
  }

  persistFromDataUrls(input: PersistMessageAssetsFromDataUrlsInput): { ok: true; assets: MessageAssetRecord[] } {
    const messageId = String(input.messageId ?? '').trim()
    if (!messageId) throw new Error('Missing messageId')

    const rawUrls = Array.isArray(input.imageDataUrls) ? input.imageDataUrls : []
    const urls = rawUrls
      .map((item) => (typeof item === 'string' ? item.trim() : ''))
      .filter((item) => item.length > 0)

    const assets: MessageAssetRecord[] = []
    // Compensation list: only files created during this call and inserted as new assets.
    // If DB transaction fails afterwards, these files are removed to avoid orphan blobs.
    const createdFilesToCompensate: string[] = []
    const txn = this.db.transaction(() => {
      this.deleteMessageLinksStmt.run({ messageId })
      let ordinal = 0
      for (const dataUrl of urls) {
        const upsert = this.upsertAssetFromDataUrl(dataUrl)
        const now = Date.now()
        this.insertMessageLinkStmt.run({
          messageId,
          assetId: upsert.asset.id,
          ordinal,
          createdAt: now,
        })
        if (upsert.assetCreated && upsert.fileCreated) {
          createdFilesToCompensate.push(upsert.asset.path)
        }
        assets.push(toAssetOutput(messageId, ordinal, upsert.asset))
        ordinal += 1
      }
    })

    try {
      txn()
    } catch (error) {
      for (const filePath of createdFilesToCompensate) {
        rmSync(filePath, { force: true })
      }
      throw error
    }

    return { ok: true, assets }
  }

  listByMessageIds(input: ListMessageAssetsByMessageIdsInput): MessageAssetRecord[] {
    const messageIds = Array.isArray(input.messageIds)
      ? Array.from(new Set(input.messageIds.map((item) => String(item ?? '').trim()).filter((item) => item.length > 0)))
      : []
    if (messageIds.length === 0) return []

    const placeholders = messageIds.map(() => '?').join(', ')
    const sql = `
      SELECT
        ma.message_id AS messageId,
        ma.ordinal AS ordinal,
        a.id AS assetId,
        a.hash AS hash,
        a.mime AS mime,
        a.width AS width,
        a.height AS height,
        a.bytes AS bytes,
        a.path AS path
      FROM message_asset ma
      JOIN asset a ON a.id = ma.asset_id
      WHERE ma.message_id IN (${placeholders})
      ORDER BY ma.message_id ASC, ma.ordinal ASC
    `
    const rows = this.db.prepare(sql).all(...messageIds) as Array<{
      messageId: string
      ordinal: number
      assetId: string
      hash: string
      mime: string
      width: number | null
      height: number | null
      bytes: number
      path: string
    }>

    return rows.map((row) => ({
      messageId: row.messageId,
      assetId: row.assetId,
      ordinal: row.ordinal,
      hash: row.hash,
      mime: row.mime,
      width: row.width ?? null,
      height: row.height ?? null,
      bytes: row.bytes,
      path: row.path,
      fileUrl: pathToFileURL(row.path).toString(),
      assetUrl: `asset://${row.assetId}`,
    }))
  }

  getById(input: GetMessageAssetByIdInput): MessageAssetRecord | null {
    const id = String(input.assetId ?? '').trim()
    if (!id) throw new Error('Missing assetId')
    const row = this.findByIdStmt.get({ id }) as AssetRow | undefined
    if (!row) return null
    return toAssetOutput('', 0, row)
  }
}
