import { randomUUID } from 'node:crypto'
import path from 'node:path'

export type FileSelectionGrant = Readonly<{
  filePath: string
  token: string
  expiresAtMs: number
}>

export type OpaqueFileSelectionGrant = Readonly<{
  token: string
  expiresAtMs: number
}>

export type FileSelectionGrantConsumeResult =
  | Readonly<{ ok: true }>
  | Readonly<{ ok: false; code: 'grant_missing' | 'grant_expired' | 'sender_mismatch' | 'path_mismatch' | 'invalid_grant' }>

export type FileSelectionGrantStore = Readonly<{
  create: (input: Readonly<{ senderId: number; filePath: string }>) => FileSelectionGrant
  consume: (input: Readonly<{ senderId: number; filePath: string; token: string }>) => FileSelectionGrantConsumeResult
  createOpaque: (input: Readonly<{ senderId: number; filePath: string; frameUrl: string }>) => OpaqueFileSelectionGrant
  consumeOpaque: (input: Readonly<{ senderId: number; token: string; frameUrl: string }>) =>
    FileSelectionGrantConsumeResult | Readonly<{ ok: true; filePath: string }>
  invalidateSender: (senderId: number) => void
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
  opaque: boolean
  frameUrl: string | null
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
        opaque: false,
        frameUrl: null,
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
      if (grant.opaque) return { ok: false, code: 'path_mismatch' }
      if (normalizeFilePath(input.filePath) !== grant.normalizedFilePath) {
        return { ok: false, code: 'path_mismatch' }
      }
      grants.delete(token)
      return { ok: true }
    },
    createOpaque(input) {
      const senderId = normalizeSenderId(input.senderId)
      const frameUrl = String(input.frameUrl ?? '').trim()
      const filePath = String(input.filePath ?? '').trim()
      if (senderId === null || !frameUrl || !filePath) throw new Error('opaque file selection grant requires sender, frame URL and file path')
      const token = tokenFactory()
      const expiresAtMs = now() + Math.min(ttlMs, 60_000)
      grants.set(token, { senderId, normalizedFilePath: normalizeFilePath(filePath), filePath, token, expiresAtMs, opaque: true, frameUrl })
      return { token, expiresAtMs }
    },
    consumeOpaque(input) {
      const token = String(input.token ?? '').trim()
      const grant = grants.get(token)
      if (!token) return { ok: false, code: 'invalid_grant' }
      if (!grant) return { ok: false, code: 'grant_missing' }
      if (now() > grant.expiresAtMs) { grants.delete(token); return { ok: false, code: 'grant_expired' } }
      const senderId = normalizeSenderId(input.senderId)
      if (senderId === null || senderId !== grant.senderId) return { ok: false, code: 'sender_mismatch' }
      if (!grant.opaque || grant.frameUrl !== String(input.frameUrl ?? '').trim()) return { ok: false, code: 'path_mismatch' }
      grants.delete(token)
      return { ok: true, filePath: grant.filePath }
    },
    invalidateSender(senderId) {
      const normalized = normalizeSenderId(senderId)
      if (normalized === null) return
      for (const [token, grant] of grants) if (grant.senderId === normalized) grants.delete(token)
    },
  }
}

export function senderIdFromIpcEvent(event: unknown): number | null {
  return normalizeSenderId((event as { sender?: { id?: unknown } } | null)?.sender?.id)
}

export function isMainFrameIpcEvent(event: unknown): boolean {
  return (event as { senderFrame?: { isMainFrame?: unknown } } | null)?.senderFrame?.isMainFrame === true
}

export function frameUrlFromIpcEvent(event: unknown): string | null {
  const value = (event as { senderFrame?: { url?: unknown } } | null)?.senderFrame?.url
  return typeof value === 'string' && value.length > 0 ? value : null
}

function normalizeSenderId(value: unknown): number | null {
  const numeric = Number(value)
  return Number.isInteger(numeric) && numeric > 0 ? numeric : null
}

function normalizeFilePath(value: unknown): string {
  const resolved = path.normalize(path.resolve(String(value ?? '').trim()))
  return process.platform === 'win32' ? resolved.toLowerCase() : resolved
}
