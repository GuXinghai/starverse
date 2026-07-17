import { createHash } from 'node:crypto'
import { AsyncLocalStorage } from 'node:async_hooks'
import { safeStorage } from 'electron'
import type Store from 'electron-store'
import {
  deriveCredentialScopeIdWithVerifiedEpoch2Key,
  type FreshEpochDatabaseInitializerInput,
} from '../data-epoch/freshEpochDatabaseInitializer'
import {
  isCredentialScopeIdV2,
  type CredentialScopeIdV2,
} from '../../infra/security/credentialScopeV2Primitive'
import {
  decodeEpoch2ProviderCredentialRecordStructure,
  withEpoch2ProviderCredentialCiphertext,
  type Epoch2ProviderCredentialRecord,
} from './epoch2ProviderCredentialRecord'
import {
  PROVIDER_CREDENTIAL_KEYS,
  PROVIDER_CREDENTIAL_SECURE_STORE_KEY_PREFIX,
  type ProviderCredentialKey,
} from './providerCredentialContract'

const MAX_CREDENTIAL_LENGTH = 16_384
const MAX_CIPHERTEXT_BYTES = 1024 * 1024

export type CredentialConfigStore = Pick<Store, 'delete' | 'get' | 'set'>

type RuntimeSlot = Readonly<{
  record: Epoch2ProviderCredentialRecord
  fingerprint: string
  revision: number
  credentialScopeId: CredentialScopeIdV2
}>

export class Epoch2RuntimeCredentialError extends Error {
  constructor(readonly code:
    | 'EPOCH2_RUNTIME_CREDENTIAL_NOT_INITIALIZED'
    | 'EPOCH2_RUNTIME_CREDENTIAL_STORAGE_UNAVAILABLE'
    | 'EPOCH2_RUNTIME_CREDENTIAL_INVALID'
    | 'EPOCH2_RUNTIME_CREDENTIAL_MISSING'
    | 'EPOCH2_RUNTIME_CREDENTIAL_STALE_REVISION'
    | 'EPOCH2_RUNTIME_CREDENTIAL_SCOPE_MISMATCH'
    | 'EPOCH2_RUNTIME_CREDENTIAL_REENTRANT'
    | 'EPOCH2_RUNTIME_CREDENTIAL_DRIFT'
    | 'EPOCH2_RUNTIME_CREDENTIAL_PERSIST_FAILED') {
    super(code)
    this.name = 'Epoch2RuntimeCredentialError'
  }
}

export type Epoch2RuntimeCredentialStatus = Readonly<{
  providerKey: ProviderCredentialKey
  configured: boolean
  revision: number
  credentialScopeId?: CredentialScopeIdV2
}>

export type Epoch2RuntimeCredentialLease = Readonly<{
  providerKey: ProviderCredentialKey
  credential: string
  revision: number
  credentialScopeId: CredentialScopeIdV2
}>

export type Epoch2RuntimeCredentialService = Readonly<{
  close: () => Promise<void>
  getStatus: (providerKey: ProviderCredentialKey) => Promise<Epoch2RuntimeCredentialStatus>
  updateCredential: (input: Readonly<{
    providerKey: ProviderCredentialKey
    credential: string
    expectedRevision: number
  }>) => Promise<Epoch2RuntimeCredentialStatus>
  clearCredential: (input: Readonly<{
    providerKey: ProviderCredentialKey
    expectedRevision: number
  }>) => Promise<Epoch2RuntimeCredentialStatus>
  withCredential: <T>(input: Readonly<{
    providerKey: ProviderCredentialKey
    expectedRevision: number
    expectedCredentialScopeId: CredentialScopeIdV2
    consume: (lease: Epoch2RuntimeCredentialLease) => Promise<T> | T
  }>) => Promise<T>
}>

function storeKey(providerKey: ProviderCredentialKey): string {
  return `${PROVIDER_CREDENTIAL_SECURE_STORE_KEY_PREFIX}${providerKey}`
}

function assertProviderKey(value: unknown): asserts value is ProviderCredentialKey {
  if (!PROVIDER_CREDENTIAL_KEYS.includes(value as ProviderCredentialKey)) {
    throw new Epoch2RuntimeCredentialError('EPOCH2_RUNTIME_CREDENTIAL_INVALID')
  }
}

function fingerprint(record: Epoch2ProviderCredentialRecord): string {
  return createHash('sha256').update(JSON.stringify({
    backend: record.backend,
    ciphertextBase64: record.ciphertextBase64,
    providerKey: record.providerKey,
    updatedAtMs: record.updatedAtMs,
    version: record.version,
  }), 'utf8').digest('hex')
}

function exactRecordEqual(left: Epoch2ProviderCredentialRecord, right: Epoch2ProviderCredentialRecord): boolean {
  return fingerprint(left) === fingerprint(right)
}

function normalizedCredential(value: unknown): string {
  if (typeof value !== 'string' || value.length === 0 || value.length > MAX_CREDENTIAL_LENGTH ||
      value.trim() !== value) {
    throw new Epoch2RuntimeCredentialError('EPOCH2_RUNTIME_CREDENTIAL_INVALID')
  }
  return value
}

function encryptedBuffer(value: unknown): Buffer {
  if (!Buffer.isBuffer(value) || value.byteLength === 0 || value.byteLength > MAX_CIPHERTEXT_BYTES) {
    if (Buffer.isBuffer(value)) value.fill(0)
    throw new Epoch2RuntimeCredentialError('EPOCH2_RUNTIME_CREDENTIAL_STORAGE_UNAVAILABLE')
  }
  return value
}

async function requireSafeStorage(): Promise<void> {
  try {
    if (!await safeStorage.isAsyncEncryptionAvailable()) {
      throw new Epoch2RuntimeCredentialError('EPOCH2_RUNTIME_CREDENTIAL_STORAGE_UNAVAILABLE')
    }
  } catch (error) {
    if (error instanceof Epoch2RuntimeCredentialError) throw error
    throw new Epoch2RuntimeCredentialError('EPOCH2_RUNTIME_CREDENTIAL_STORAGE_UNAVAILABLE')
  }
}

async function decryptRecord(record: Epoch2ProviderCredentialRecord): Promise<Readonly<{
  credential: string
  rewrappedCiphertext?: Buffer
}>> {
  return withEpoch2ProviderCredentialCiphertext({
    record,
    consume: async (ciphertext) => {
      let decrypted: Electron.DecryptStringAsyncReturnValue
      try {
        decrypted = await safeStorage.decryptStringAsync(ciphertext)
      } catch {
        throw new Epoch2RuntimeCredentialError('EPOCH2_RUNTIME_CREDENTIAL_INVALID')
      }
      if (!decrypted || typeof decrypted !== 'object' ||
          typeof decrypted.shouldReEncrypt !== 'boolean' || typeof decrypted.result !== 'string') {
        throw new Epoch2RuntimeCredentialError('EPOCH2_RUNTIME_CREDENTIAL_INVALID')
      }
      const credential = normalizedCredential(decrypted.result)
      if (!decrypted.shouldReEncrypt) return Object.freeze({ credential })
      try {
        return Object.freeze({
          credential,
          rewrappedCiphertext: encryptedBuffer(await safeStorage.encryptStringAsync(credential)),
        })
      } catch (error) {
        if (error instanceof Epoch2RuntimeCredentialError) throw error
        throw new Epoch2RuntimeCredentialError('EPOCH2_RUNTIME_CREDENTIAL_STORAGE_UNAVAILABLE')
      }
    },
  })
}

function nextUpdatedAt(nowMs: () => number, previous: number): number {
  const now = nowMs()
  if (!Number.isSafeInteger(now) || now < 0 || previous >= Number.MAX_SAFE_INTEGER) {
    throw new Epoch2RuntimeCredentialError('EPOCH2_RUNTIME_CREDENTIAL_PERSIST_FAILED')
  }
  return Math.max(now, previous + 1)
}

function nextRevision(current: number): number {
  if (!Number.isSafeInteger(current) || current < 0 || current >= Number.MAX_SAFE_INTEGER) {
    throw new Epoch2RuntimeCredentialError('EPOCH2_RUNTIME_CREDENTIAL_PERSIST_FAILED')
  }
  return current + 1
}

export async function createEpoch2RuntimeCredentialService(input: Readonly<{
  store: CredentialConfigStore
  epochDatabase: FreshEpochDatabaseInitializerInput
  nowMs?: () => number
}>): Promise<Epoch2RuntimeCredentialService> {
  await requireSafeStorage()
  const nowMs = input.nowMs ?? Date.now
  const slots = new Map<ProviderCredentialKey, RuntimeSlot>()
  const revisions = new Map<ProviderCredentialKey, number>()
  const tails = new Map<ProviderCredentialKey, Promise<void>>()
  const activeProvider = new AsyncLocalStorage<ProviderCredentialKey>()
  let closed = false

  async function exclusive<T>(providerKey: ProviderCredentialKey, work: () => Promise<T>): Promise<T> {
    assertProviderKey(providerKey)
    if (closed) {
      throw new Epoch2RuntimeCredentialError('EPOCH2_RUNTIME_CREDENTIAL_NOT_INITIALIZED')
    }
    if (activeProvider.getStore() === providerKey) {
      throw new Epoch2RuntimeCredentialError('EPOCH2_RUNTIME_CREDENTIAL_REENTRANT')
    }
    const previous = tails.get(providerKey) ?? Promise.resolve()
    let release!: () => void
    const gate = new Promise<void>((resolve) => { release = resolve })
    const tail = previous.then(() => gate)
    tails.set(providerKey, tail)
    await previous
    try {
      return await activeProvider.run(providerKey, work)
    } finally {
      release()
      if (tails.get(providerKey) === tail) tails.delete(providerKey)
    }
  }

  function readPersisted(providerKey: ProviderCredentialKey): Epoch2ProviderCredentialRecord | undefined {
    const value = input.store.get(storeKey(providerKey))
    if (value === undefined) return undefined
    try {
      return decodeEpoch2ProviderCredentialRecordStructure({ value, providerKey })
    } catch {
      throw new Epoch2RuntimeCredentialError('EPOCH2_RUNTIME_CREDENTIAL_INVALID')
    }
  }

  function assertPersistedSlot(providerKey: ProviderCredentialKey): RuntimeSlot | undefined {
    const slot = slots.get(providerKey)
    const persisted = readPersisted(providerKey)
    if ((!slot && persisted) || (slot && !persisted) ||
        (slot && persisted && !exactRecordEqual(slot.record, persisted))) {
      throw new Epoch2RuntimeCredentialError('EPOCH2_RUNTIME_CREDENTIAL_DRIFT')
    }
    return slot
  }

  function persistRecord(record: Epoch2ProviderCredentialRecord): void {
    try {
      input.store.set(storeKey(record.providerKey), record)
      const persisted = readPersisted(record.providerKey)
      if (!persisted || !exactRecordEqual(record, persisted)) {
        throw new Epoch2RuntimeCredentialError('EPOCH2_RUNTIME_CREDENTIAL_PERSIST_FAILED')
      }
    } catch (error) {
      if (error instanceof Epoch2RuntimeCredentialError) throw error
      throw new Epoch2RuntimeCredentialError('EPOCH2_RUNTIME_CREDENTIAL_PERSIST_FAILED')
    }
  }

  async function deriveScope(
    providerKey: ProviderCredentialKey,
    credential: string,
  ): Promise<CredentialScopeIdV2> {
    return deriveCredentialScopeIdWithVerifiedEpoch2Key({
      initializer: input.epochDatabase,
      providerId: providerKey,
      credential,
    })
  }

  async function decryptAndMaintainRecord(
    providerKey: ProviderCredentialKey,
    slot: RuntimeSlot,
  ): Promise<Readonly<{ slot: RuntimeSlot; credential: string }>> {
    const decrypted = await decryptRecord(slot.record)
    let current = slot
    if (decrypted.rewrappedCiphertext) {
      try {
        const latest = assertPersistedSlot(providerKey)
        if (latest !== slot) {
          throw new Epoch2RuntimeCredentialError('EPOCH2_RUNTIME_CREDENTIAL_DRIFT')
        }
        const maintained = Object.freeze({
          ...slot.record,
          ciphertextBase64: decrypted.rewrappedCiphertext.toString('base64'),
        })
        persistRecord(maintained)
        current = Object.freeze({ ...slot, record: maintained, fingerprint: fingerprint(maintained) })
        slots.set(providerKey, current)
      } finally {
        decrypted.rewrappedCiphertext.fill(0)
      }
    }
    return Object.freeze({ slot: current, credential: decrypted.credential })
  }

  for (const providerKey of PROVIDER_CREDENTIAL_KEYS) {
    revisions.set(providerKey, 0)
    const record = readPersisted(providerKey)
    if (!record) continue
    const decrypted = await decryptRecord(record)
    let maintained = record
    try {
      if (decrypted.rewrappedCiphertext) {
        const persistedBeforeMaintenance = readPersisted(providerKey)
        if (!persistedBeforeMaintenance || !exactRecordEqual(record, persistedBeforeMaintenance)) {
          throw new Epoch2RuntimeCredentialError('EPOCH2_RUNTIME_CREDENTIAL_DRIFT')
        }
        maintained = Object.freeze({
          ...record,
          ciphertextBase64: decrypted.rewrappedCiphertext.toString('base64'),
        })
        persistRecord(maintained)
      }
      const credentialScopeId = await deriveScope(providerKey, decrypted.credential)
      const persisted = readPersisted(providerKey)
      if (!persisted || !exactRecordEqual(maintained, persisted)) {
        throw new Epoch2RuntimeCredentialError('EPOCH2_RUNTIME_CREDENTIAL_DRIFT')
      }
      const slot = Object.freeze({
        record: maintained,
        fingerprint: fingerprint(maintained),
        revision: 1,
        credentialScopeId,
      })
      slots.set(providerKey, slot)
      revisions.set(providerKey, 1)
    } finally {
      decrypted.rewrappedCiphertext?.fill(0)
    }
  }

  function status(providerKey: ProviderCredentialKey): Epoch2RuntimeCredentialStatus {
    const slot = slots.get(providerKey)
    const revision = revisions.get(providerKey)
    if (revision === undefined) {
      throw new Epoch2RuntimeCredentialError('EPOCH2_RUNTIME_CREDENTIAL_NOT_INITIALIZED')
    }
    return Object.freeze({
      providerKey,
      configured: Boolean(slot),
      revision,
      ...(slot ? { credentialScopeId: slot.credentialScopeId } : {}),
    })
  }

  return Object.freeze({
    close: async () => {
      if (closed) return
      closed = true
      await Promise.all([...tails.values()])
      slots.clear()
      revisions.clear()
    },
    getStatus: (providerKey) => exclusive(providerKey, async () => {
      assertPersistedSlot(providerKey)
      return status(providerKey)
    }),
    updateCredential: (request) => exclusive(request.providerKey, async () => {
      const current = assertPersistedSlot(request.providerKey)
      const currentRevision = revisions.get(request.providerKey)
      if (currentRevision === undefined || request.expectedRevision !== currentRevision) {
        throw new Epoch2RuntimeCredentialError('EPOCH2_RUNTIME_CREDENTIAL_STALE_REVISION')
      }
      const credential = normalizedCredential(request.credential)
      const credentialScopeId = await deriveScope(request.providerKey, credential)
      const revision = nextRevision(currentRevision)
      let ciphertext: Buffer | undefined
      try {
        ciphertext = encryptedBuffer(await safeStorage.encryptStringAsync(credential))
        const record = Object.freeze({
          version: 1 as const,
          providerKey: request.providerKey,
          backend: 'electron_safe_storage' as const,
          ciphertextBase64: ciphertext.toString('base64'),
          updatedAtMs: nextUpdatedAt(nowMs, current?.record.updatedAtMs ?? -1),
        })
        const latest = assertPersistedSlot(request.providerKey)
        if (latest !== current) {
          throw new Epoch2RuntimeCredentialError('EPOCH2_RUNTIME_CREDENTIAL_DRIFT')
        }
        persistRecord(record)
        revisions.set(request.providerKey, revision)
        slots.set(request.providerKey, Object.freeze({
          record,
          fingerprint: fingerprint(record),
          revision,
          credentialScopeId,
        }))
        return status(request.providerKey)
      } finally {
        ciphertext?.fill(0)
      }
    }),
    clearCredential: (request) => exclusive(request.providerKey, async () => {
      const current = assertPersistedSlot(request.providerKey)
      const currentRevision = revisions.get(request.providerKey)
      if (currentRevision === undefined || request.expectedRevision !== currentRevision) {
        throw new Epoch2RuntimeCredentialError('EPOCH2_RUNTIME_CREDENTIAL_STALE_REVISION')
      }
      if (!current) return status(request.providerKey)
      const revision = nextRevision(currentRevision)
      try {
        input.store.delete(storeKey(request.providerKey))
        if (input.store.get(storeKey(request.providerKey)) !== undefined) {
          throw new Epoch2RuntimeCredentialError('EPOCH2_RUNTIME_CREDENTIAL_PERSIST_FAILED')
        }
      } catch (error) {
        if (error instanceof Epoch2RuntimeCredentialError) throw error
        throw new Epoch2RuntimeCredentialError('EPOCH2_RUNTIME_CREDENTIAL_PERSIST_FAILED')
      }
      revisions.set(request.providerKey, revision)
      slots.delete(request.providerKey)
      return status(request.providerKey)
    }),
    withCredential: (request) => exclusive(request.providerKey, async () => {
      if (!isCredentialScopeIdV2(request.expectedCredentialScopeId)) {
        throw new Epoch2RuntimeCredentialError('EPOCH2_RUNTIME_CREDENTIAL_SCOPE_MISMATCH')
      }
      const slot = assertPersistedSlot(request.providerKey)
      if (!slot) throw new Epoch2RuntimeCredentialError('EPOCH2_RUNTIME_CREDENTIAL_MISSING')
      const maintained = await decryptAndMaintainRecord(request.providerKey, slot)
      const derivedScope = await deriveScope(request.providerKey, maintained.credential)
      const currentRevision = revisions.get(request.providerKey)
      if (currentRevision !== request.expectedRevision || maintained.slot.revision !== currentRevision) {
        throw new Epoch2RuntimeCredentialError('EPOCH2_RUNTIME_CREDENTIAL_STALE_REVISION')
      }
      if (derivedScope !== maintained.slot.credentialScopeId ||
          request.expectedCredentialScopeId !== maintained.slot.credentialScopeId) {
        throw new Epoch2RuntimeCredentialError('EPOCH2_RUNTIME_CREDENTIAL_SCOPE_MISMATCH')
      }
      assertPersistedSlot(request.providerKey)
      return request.consume(Object.freeze({
        providerKey: request.providerKey,
        credential: maintained.credential,
        revision: currentRevision,
        credentialScopeId: maintained.slot.credentialScopeId,
      }))
    }),
  })
}
