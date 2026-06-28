import { randomUUID } from 'node:crypto'
import path from 'node:path'

export type FileSelectionGrant = Readonly<{
  filePath: string
  token: string
  expiresAtMs: number
}>

export type FileSelectionGrantConsumeResult =
  | Readonly<{ ok: true }>
  | Readonly<{ ok: false; code: 'grant_missing' | 'grant_expired' | 'sender_mismatch' | 'path_mismatch' | 'invalid_grant' }>

export type FileSelectionGrantStore = Readonly<{
  create: (input: Readonly<{ senderId: number; filePath: string }>) => FileSelectionGrant
  consume: (input: Readonly<{ senderId: number; filePath: string; token: string }>) => FileSelectionGrantConsumeResult
}>

export type FileSelectionGrantStoreOptions = Readonly<{
  ttlMs?: number
  now?: () => number
  tokenFactory?: () => string
}>

type StoredGrant = Readonly<{
  senderId: number
  normalizedFilePath: string
  filePath: string
  token: string
  expiresAtMs: number
}>

const DEFAULT_FILE_SELECTION_GRANT_TTL_MS = 5 * 60 * 1000

export function createFileSelectionGrantStore(options: FileSelectionGrantStoreOptions = {}): FileSelectionGrantStore {
  const ttlMs = options.ttlMs ?? DEFAULT_FILE_SELECTION_GRANT_TTL_MS
  const now = options.now ?? Date.now
  const tokenFactory = options.tokenFactory ?? randomUUID
  const grants = new Map<string, StoredGrant>()

  return {
    create(input) {
      const senderId = normalizeSenderId(input.senderId)
      if (senderId === null) throw new Error('file selection grant requires a sender id')
      const filePath = String(input.filePath ?? '').trim()
      if (!filePath) throw new Error('file selection grant requires a file path')
      const token = tokenFactory()
      const expiresAtMs = now() + ttlMs
      grants.set(token, {
        senderId,
        normalizedFilePath: normalizeFilePath(filePath),
        filePath,
        token,
        expiresAtMs,
      })
      return { filePath, token, expiresAtMs }
    },
    consume(input) {
      const token = String(input.token ?? '').trim()
      if (!token) return { ok: false, code: 'invalid_grant' }
      const grant = grants.get(token)
      if (!grant) return { ok: false, code: 'grant_missing' }
      if (now() > grant.expiresAtMs) {
        grants.delete(token)
        return { ok: false, code: 'grant_expired' }
      }
      const senderId = normalizeSenderId(input.senderId)
      if (senderId === null || senderId !== grant.senderId) {
        return { ok: false, code: 'sender_mismatch' }
      }
      if (normalizeFilePath(input.filePath) !== grant.normalizedFilePath) {
        return { ok: false, code: 'path_mismatch' }
      }
      grants.delete(token)
      return { ok: true }
    },
  }
}

export function senderIdFromIpcEvent(event: unknown): number | null {
  return normalizeSenderId((event as { sender?: { id?: unknown } } | null)?.sender?.id)
}

function normalizeSenderId(value: unknown): number | null {
  const numeric = Number(value)
  return Number.isInteger(numeric) && numeric > 0 ? numeric : null
}

function normalizeFilePath(value: unknown): string {
  const resolved = path.normalize(path.resolve(String(value ?? '').trim()))
  return process.platform === 'win32' ? resolved.toLowerCase() : resolved
}
