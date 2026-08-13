import { createHash, randomBytes } from 'node:crypto'
import { AsyncLocalStorage } from 'node:async_hooks'
import { safeStorage } from 'electron'
import { enforceLinuxCredentialStoragePermissions } from './linuxCredentialStoragePermissions'
import type Store from 'electron-store'
import {
  assertFreshEpoch2DatabaseFileCurrent,
  type FreshEpochDatabaseInitializerInput,
} from '../data-epoch/freshEpochDatabaseInitializer'
import {
  isCredentialScopeIdV2,
  type CredentialScopeIdV2,
} from '../../infra/security/credentialScopeV2Primitive'
import {
  decodeEpoch2ProviderCredentialRecordStructure,
  isLegacyEpoch2ProviderCredentialRecord,
  withEpoch2ProviderCredentialCiphertext,
  type Epoch2ProviderCredentialRecord,
} from './epoch2ProviderCredentialRecord'
import {
  PROVIDER_CREDENTIAL_KEYS,
  PROVIDER_CREDENTIAL_SECURE_STORE_KEY_PREFIX,
  type ProviderCredentialKey,
} from './providerCredentialContract'
import {
  createCredentialMutationQueue,
  CredentialMutationQueueError,
  type CredentialMutationQueue,
} from './credentialMutationQueue'
import {
  CredentialSafeStorageBackendError,
  requireTrustedCredentialSafeStorage,
} from './credentialSafeStorageBackend'
import type { CredentialStorageBackend, CredentialStorageMode } from './credentialStorageMode'

const MAX_CREDENTIAL_LENGTH = 16_384
const MAX_CIPHERTEXT_BYTES = 1024 * 1024

export type CredentialConfigStore = Pick<Store, 'delete' | 'get' | 'set'>

type RuntimeSlot = Readonly<{
  record: Epoch2ProviderCredentialRecord
  fingerprint: string
  revision: number
  credentialScopeId: CredentialScopeIdV2
}>

type SessionSlot = Readonly<{
  credential: string
  revision: number
  credentialScopeId: CredentialScopeIdV2
}>

export class Epoch2RuntimeCredentialError extends Error {
  constructor(readonly code:
    | 'EPOCH2_RUNTIME_CREDENTIAL_NOT_INITIALIZED'
    | 'EPOCH2_RUNTIME_CREDENTIAL_STORAGE_UNAVAILABLE'
    | 'EPOCH2_RUNTIME_CREDENTIAL_SAFE_STORAGE_UNAVAILABLE'
    | 'EPOCH2_RUNTIME_CREDENTIAL_SAFE_STORAGE_BACKEND_UNTRUSTED'
    | 'EPOCH2_RUNTIME_CREDENTIAL_PLAINTEXT_UNSUPPORTED'
    | 'EPOCH2_RUNTIME_CREDENTIAL_DECRYPT_FAILED'
    | 'EPOCH2_RUNTIME_CREDENTIAL_INVALID'
    | 'EPOCH2_RUNTIME_CREDENTIAL_MISSING'
    | 'EPOCH2_RUNTIME_CREDENTIAL_STALE_REVISION'
    | 'EPOCH2_RUNTIME_CREDENTIAL_SCOPE_MISMATCH'
    | 'EPOCH2_RUNTIME_CREDENTIAL_REENTRANT'
    | 'EPOCH2_RUNTIME_CREDENTIAL_ALREADY_INITIALIZED'
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
  availability: 'unknown' | 'available' | 'unavailable'
  storageBackend?: CredentialStorageBackend
  sessionOverridesPersistent: boolean
  diagnosticCode?: Epoch2RuntimeCredentialError['code']
}>

export type Epoch2RuntimeCredentialLease = Readonly<{
  trust: 'epoch2_runtime_credential_lease'
  usage: 'provider_transport_only'
  providerKey: ProviderCredentialKey
  credential: string
  revision: number
  credentialScopeId: CredentialScopeIdV2
  assertCurrent: () => void
}>

export type Epoch2CredentialScopeBindingAuthority = Readonly<{
  trust: 'epoch2_credential_scope_binding_authority'
  usage: 'provider_binding_snapshot_only'
  providerKey: ProviderCredentialKey
  revision: number
  credentialScopeId: CredentialScopeIdV2
  assertCurrent: () => void
}>

const credentialScopeBindingAuthorities = new WeakSet<object>()
const runtimeCredentialLeases = new WeakSet<object>()
const activeCredentialServiceLeases = new WeakSet<object>()

export function isEpoch2RuntimeCredentialLease(
  value: unknown,
): value is Epoch2RuntimeCredentialLease {
  return Boolean(value && typeof value === 'object' && runtimeCredentialLeases.has(value))
}

export function isEpoch2CredentialScopeBindingAuthority(
  value: unknown,
): value is Epoch2CredentialScopeBindingAuthority {
  return Boolean(value && typeof value === 'object' && credentialScopeBindingAuthorities.has(value))
}

export type Epoch2RuntimeCredentialService = Readonly<{
  close: () => Promise<void>
  getStatus: (providerKey: ProviderCredentialKey) => Promise<Epoch2RuntimeCredentialStatus>
  updateCredential: (input: Readonly<{
    providerKey: ProviderCredentialKey
    credential: string
    expectedRevision: number
    storageMode?: CredentialStorageMode
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
  withCredentialScopeBindingAuthority: <T>(input: Readonly<{
    providerKey: ProviderCredentialKey
    expectedRevision: number
    expectedCredentialScopeId: CredentialScopeIdV2
    consume: (authority: Epoch2CredentialScopeBindingAuthority) => Promise<T> | T
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
    ...(record.backend === 'electron_safe_storage'
      ? { ciphertextBase64: record.ciphertextBase64 }
      : { plaintext: record.plaintext }),
    credentialScopeId: record.credentialScopeId,
    providerKey: record.providerKey,
    revision: record.revision,
    updatedAtMs: record.updatedAtMs,
    version: record.version,
  }), 'utf8').digest('hex')
}

function exactRecordEqual(left: Epoch2ProviderCredentialRecord, right: Epoch2ProviderCredentialRecord): boolean {
  return fingerprint(left) === fingerprint(right)
}

function rawRecordFingerprint(value: unknown): string {
  try {
    return createHash('sha256').update(JSON.stringify(value), 'utf8').digest('hex')
  } catch {
    return 'unserializable'
  }
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

async function encryptCredential(credential: string): Promise<Buffer> {
  try {
    return encryptedBuffer(await safeStorage.encryptStringAsync(credential))
  } catch (error) {
    if (error instanceof Epoch2RuntimeCredentialError) throw error
    throw new Epoch2RuntimeCredentialError('EPOCH2_RUNTIME_CREDENTIAL_SAFE_STORAGE_UNAVAILABLE')
  }
}

async function requireSafeStorage(platform = process.platform): Promise<void> {
  try {
    await requireTrustedCredentialSafeStorage({ platform })
  } catch (error) {
    if (error instanceof Epoch2RuntimeCredentialError) throw error
    if (error instanceof CredentialSafeStorageBackendError &&
        error.code === 'CREDENTIAL_SAFE_STORAGE_BACKEND_UNTRUSTED') {
      throw new Epoch2RuntimeCredentialError('EPOCH2_RUNTIME_CREDENTIAL_SAFE_STORAGE_BACKEND_UNTRUSTED')
    }
    if (error instanceof CredentialSafeStorageBackendError &&
        error.code === 'CREDENTIAL_SAFE_STORAGE_UNAVAILABLE') {
      throw new Epoch2RuntimeCredentialError('EPOCH2_RUNTIME_CREDENTIAL_SAFE_STORAGE_UNAVAILABLE')
    }
    throw new Epoch2RuntimeCredentialError('EPOCH2_RUNTIME_CREDENTIAL_STORAGE_UNAVAILABLE')
  }
}

async function decryptRecord(record: Epoch2ProviderCredentialRecord): Promise<Readonly<{
  credential: string
  rewrappedCiphertext?: Buffer
}>> {
  if (record.backend === 'plaintext') return Object.freeze({ credential: record.plaintext })
  return withEpoch2ProviderCredentialCiphertext({
    record,
    consume: async (ciphertext) => {
      let decrypted: Electron.DecryptStringAsyncReturnValue
      try {
        decrypted = await safeStorage.decryptStringAsync(ciphertext)
      } catch {
        throw new Epoch2RuntimeCredentialError('EPOCH2_RUNTIME_CREDENTIAL_DECRYPT_FAILED')
      }
      if (!decrypted || typeof decrypted !== 'object' ||
          typeof decrypted.shouldReEncrypt !== 'boolean' || typeof decrypted.result !== 'string') {
        throw new Epoch2RuntimeCredentialError('EPOCH2_RUNTIME_CREDENTIAL_INVALID')
      }
      const credential = normalizedCredential(decrypted.result)
      if (!decrypted.shouldReEncrypt) return Object.freeze({ credential })
      return Object.freeze({ credential, rewrappedCiphertext: await encryptCredential(credential) })
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

function createCredentialScopeId(): CredentialScopeIdV2 {
  const random = randomBytes(32)
  try {
    return `credential-scope-v2:${random.toString('hex')}` as CredentialScopeIdV2
  } finally {
    random.fill(0)
  }
}

export async function createEpoch2RuntimeCredentialService(input: Readonly<{
  store: CredentialConfigStore
  epochDatabase: FreshEpochDatabaseInitializerInput
  mutationQueue?: CredentialMutationQueue
  nowMs?: () => number
  platform?: NodeJS.Platform
  credentialStoragePaths?: Readonly<{ directories: readonly string[]; files: readonly string[]; optionalFiles?: readonly string[] }>
}>): Promise<Epoch2RuntimeCredentialService> {
  const leaseIdentity = input.epochDatabase.lease as object
  if (activeCredentialServiceLeases.has(leaseIdentity)) {
    throw new Epoch2RuntimeCredentialError('EPOCH2_RUNTIME_CREDENTIAL_ALREADY_INITIALIZED')
  }
  activeCredentialServiceLeases.add(leaseIdentity)
  let serviceReturned = false
  try {
  const nowMs = input.nowMs ?? Date.now
  const slots = new Map<ProviderCredentialKey, RuntimeSlot>()
  const sessions = new Map<ProviderCredentialKey, SessionSlot>()
  const revisions = new Map<ProviderCredentialKey, number>()
  const availability = new Map<ProviderCredentialKey, Epoch2RuntimeCredentialStatus['availability']>()
  const diagnostics = new Map<ProviderCredentialKey, Epoch2RuntimeCredentialError['code']>()
  const faultedRecordFingerprints = new Map<ProviderCredentialKey, string>()
  const mutationQueue = input.mutationQueue ?? createCredentialMutationQueue()
  const ownsMutationQueue = input.mutationQueue === undefined
  const activeCredentialOperation = new AsyncLocalStorage<ProviderCredentialKey>()
  const activeLeaseCompletions = new Set<Promise<void>>()
  let closed = false
  let closePromise: Promise<void> | undefined

  function assertPlaintextStoragePermissions(): void {
    if (!input.credentialStoragePaths) return
    enforceLinuxCredentialStoragePermissions({ platform: input.platform ?? process.platform, ...input.credentialStoragePaths })
  }

  function assertOpenAndNonReentrant(providerKey?: ProviderCredentialKey): void {
    if (providerKey) assertProviderKey(providerKey)
    if (closed) {
      throw new Epoch2RuntimeCredentialError('EPOCH2_RUNTIME_CREDENTIAL_NOT_INITIALIZED')
    }
    if (activeCredentialOperation.getStore() !== undefined) {
      throw new Epoch2RuntimeCredentialError('EPOCH2_RUNTIME_CREDENTIAL_REENTRANT')
    }
  }

  async function mutate<T>(providerKey: ProviderCredentialKey, work: () => Promise<T>): Promise<T> {
    assertOpenAndNonReentrant(providerKey)
    try {
      return await mutationQueue.run(`standard:${providerKey}`, work)
    } catch (error) {
      if (error instanceof CredentialMutationQueueError) {
        throw new Epoch2RuntimeCredentialError(error.code === 'CREDENTIAL_MUTATION_QUEUE_REENTRANT'
          ? 'EPOCH2_RUNTIME_CREDENTIAL_REENTRANT'
          : 'EPOCH2_RUNTIME_CREDENTIAL_NOT_INITIALIZED')
      }
      throw error
    }
  }

  async function leaseOperation<T>(providerKey: ProviderCredentialKey, work: () => Promise<T>): Promise<T> {
    assertProviderKey(providerKey)
    assertOpenAndNonReentrant()
    let resolveCompletion!: () => void
    const completion = new Promise<void>((resolve) => { resolveCompletion = resolve })
    activeLeaseCompletions.add(completion)
    try {
      return await work()
    } finally {
      resolveCompletion()
      activeLeaseCompletions.delete(completion)
    }
  }

  function readPersisted(providerKey: ProviderCredentialKey): Epoch2ProviderCredentialRecord | undefined {
    const value = input.store.get(storeKey(providerKey))
    if (value === undefined) return undefined
    if (isLegacyEpoch2ProviderCredentialRecord(value)) {
      try {
        input.store.delete(storeKey(providerKey))
        if (input.store.get(storeKey(providerKey)) !== undefined) {
          throw new Epoch2RuntimeCredentialError('EPOCH2_RUNTIME_CREDENTIAL_PERSIST_FAILED')
        }
        return undefined
      } catch (error) {
        if (error instanceof Epoch2RuntimeCredentialError) throw error
        throw new Epoch2RuntimeCredentialError('EPOCH2_RUNTIME_CREDENTIAL_PERSIST_FAILED')
      }
    }
    try {
      return decodeEpoch2ProviderCredentialRecordStructure({ value, providerKey })
    } catch {
      throw new Epoch2RuntimeCredentialError('EPOCH2_RUNTIME_CREDENTIAL_INVALID')
    }
  }

  function assertPersistedSlot(providerKey: ProviderCredentialKey): RuntimeSlot | undefined {
    const slot = slots.get(providerKey)
    const faultedFingerprint = faultedRecordFingerprints.get(providerKey)
    if (faultedFingerprint !== undefined) {
      if (rawRecordFingerprint(input.store.get(storeKey(providerKey))) !== faultedFingerprint) {
        throw new Epoch2RuntimeCredentialError('EPOCH2_RUNTIME_CREDENTIAL_DRIFT')
      }
      return undefined
    }
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

  function assertEpochDatabaseCurrent(): void {
    try {
      assertFreshEpoch2DatabaseFileCurrent(input.epochDatabase)
    } catch {
      throw new Epoch2RuntimeCredentialError('EPOCH2_RUNTIME_CREDENTIAL_STORAGE_UNAVAILABLE')
    }
  }

  async function decryptAndMaintainRecord(
    providerKey: ProviderCredentialKey,
    slot: RuntimeSlot,
  ): Promise<Readonly<{ slot: RuntimeSlot; credential: string }>> {
    const decrypted = await decryptRecord(slot.record)
    let current = slot
    if (decrypted.rewrappedCiphertext) {
      try {
        current = await mutate(providerKey, async () => {
          const latest = assertPersistedSlot(providerKey)
          if (latest !== slot) {
            throw new Epoch2RuntimeCredentialError('EPOCH2_RUNTIME_CREDENTIAL_DRIFT')
          }
          const maintained = Object.freeze({
            ...slot.record,
            ciphertextBase64: decrypted.rewrappedCiphertext!.toString('base64'),
          })
          persistRecord(maintained)
          const next = Object.freeze({ ...slot, record: maintained, fingerprint: fingerprint(maintained) })
          slots.set(providerKey, next)
          return next
        })
      } finally {
        decrypted.rewrappedCiphertext.fill(0)
      }
    }
    return Object.freeze({ slot: current, credential: decrypted.credential })
  }

  async function decryptAvailableRecord(
    providerKey: ProviderCredentialKey,
    slot: RuntimeSlot,
  ): Promise<Readonly<{ slot: RuntimeSlot; credential: string }>> {
    try {
      const decrypted = await decryptAndMaintainRecord(providerKey, slot)
      if (!sessions.has(providerKey) && slots.get(providerKey) === slot &&
          revisions.get(providerKey) === slot.revision) {
        availability.set(providerKey, 'available')
        diagnostics.delete(providerKey)
      }
      return decrypted
    } catch (error) {
      if (!sessions.has(providerKey) && slots.get(providerKey) === slot &&
          revisions.get(providerKey) === slot.revision) {
        availability.set(providerKey, 'unavailable')
        if (error instanceof Epoch2RuntimeCredentialError) diagnostics.set(providerKey, error.code)
      }
      throw error
    }
  }

  async function requireAvailableForProvider(
    providerKey: ProviderCredentialKey,
    originatingSlot?: RuntimeSlot,
  ): Promise<void> {
    try {
      await requireSafeStorage(input.platform)
    } catch (error) {
      if (!originatingSlot || (!sessions.has(providerKey) && slots.get(providerKey) === originatingSlot &&
          revisions.get(providerKey) === originatingSlot.revision)) {
        availability.set(providerKey, 'unavailable')
        if (error instanceof Epoch2RuntimeCredentialError) diagnostics.set(providerKey, error.code)
      }
      throw error
    }
  }

  for (const providerKey of PROVIDER_CREDENTIAL_KEYS) {
    revisions.set(providerKey, 0)
    availability.set(providerKey, 'unknown')
    let record: Epoch2ProviderCredentialRecord | undefined
    try {
      record = readPersisted(providerKey)
    } catch (error) {
      if (!(error instanceof Epoch2RuntimeCredentialError)) throw error
      faultedRecordFingerprints.set(providerKey, rawRecordFingerprint(input.store.get(storeKey(providerKey))))
      availability.set(providerKey, 'unavailable')
      diagnostics.set(providerKey, error.code)
      continue
    }
    if (!record) continue
    const slot = Object.freeze({
      record,
      fingerprint: fingerprint(record),
      revision: record.revision,
      credentialScopeId: record.credentialScopeId,
    })
    slots.set(providerKey, slot)
    revisions.set(providerKey, record.revision)
  }

  function status(providerKey: ProviderCredentialKey): Epoch2RuntimeCredentialStatus {
    const slot = slots.get(providerKey)
    const session = sessions.get(providerKey)
    const revision = revisions.get(providerKey)
    if (revision === undefined) {
      throw new Epoch2RuntimeCredentialError('EPOCH2_RUNTIME_CREDENTIAL_NOT_INITIALIZED')
    }
    return Object.freeze({
      providerKey,
      configured: Boolean(session || slot) || faultedRecordFingerprints.has(providerKey),
      revision,
      ...(session ? { credentialScopeId: session.credentialScopeId } : slot ? { credentialScopeId: slot.credentialScopeId } : {}),
      storageBackend: session ? 'session' : slot?.record.backend,
      sessionOverridesPersistent: Boolean(session && slot),
      availability: session || slot?.record.backend === 'plaintext' ? 'available' : availability.get(providerKey) ?? 'unknown',
      ...(diagnostics.has(providerKey) ? { diagnosticCode: diagnostics.get(providerKey)! } : {}),
    })
  }

  const service: Epoch2RuntimeCredentialService = Object.freeze({
    close: async () => {
      if (activeCredentialOperation.getStore() !== undefined) {
        throw new Epoch2RuntimeCredentialError('EPOCH2_RUNTIME_CREDENTIAL_REENTRANT')
      }
      if (closePromise) return closePromise
      closed = true
      closePromise = (async () => {
        await Promise.all([...activeLeaseCompletions])
        if (ownsMutationQueue) await mutationQueue.close()
        slots.clear()
        sessions.clear()
        revisions.clear()
        availability.clear()
        diagnostics.clear()
        faultedRecordFingerprints.clear()
      })().finally(() => {
        activeCredentialServiceLeases.delete(leaseIdentity)
      })
      return closePromise
    },
    getStatus: async (providerKey) => {
      assertOpenAndNonReentrant(providerKey)
      assertPersistedSlot(providerKey)
      return status(providerKey)
    },
    updateCredential: (request) => mutate(request.providerKey, async () => {
      const current = assertPersistedSlot(request.providerKey)
      const currentRevision = revisions.get(request.providerKey)
      if (currentRevision === undefined || request.expectedRevision !== currentRevision) {
        throw new Epoch2RuntimeCredentialError('EPOCH2_RUNTIME_CREDENTIAL_STALE_REVISION')
      }
      const credential = normalizedCredential(request.credential)
      const storageMode = request.storageMode ?? 'system_secure'
      if (storageMode !== 'system_secure' && storageMode !== 'session' && storageMode !== 'plaintext') {
        throw new Epoch2RuntimeCredentialError('EPOCH2_RUNTIME_CREDENTIAL_INVALID')
      }
      if (storageMode === 'plaintext' && (input.platform ?? process.platform) !== 'linux') {
        throw new Epoch2RuntimeCredentialError('EPOCH2_RUNTIME_CREDENTIAL_PLAINTEXT_UNSUPPORTED')
      }
      const credentialScopeId = createCredentialScopeId()
      const revision = nextRevision(currentRevision)
      if (storageMode === 'session') {
        sessions.set(request.providerKey, Object.freeze({ credential, revision, credentialScopeId }))
        revisions.set(request.providerKey, revision)
        availability.set(request.providerKey, 'available')
        diagnostics.delete(request.providerKey)
        return status(request.providerKey)
      }
      if (storageMode === 'system_secure') await requireAvailableForProvider(request.providerKey)
      if (storageMode === 'plaintext') assertPlaintextStoragePermissions()
      let ciphertext: Buffer | undefined
      try {
        if (storageMode === 'system_secure') ciphertext = await encryptCredential(credential)
        const record: Epoch2ProviderCredentialRecord = storageMode === 'system_secure'
          ? Object.freeze({ version: 3 as const, providerKey: request.providerKey, backend: 'electron_safe_storage' as const,
            ciphertextBase64: ciphertext!.toString('base64'), credentialScopeId, revision,
            updatedAtMs: nextUpdatedAt(nowMs, current?.record.updatedAtMs ?? -1) })
          : Object.freeze({ version: 3 as const, providerKey: request.providerKey, backend: 'plaintext' as const,
            plaintext: credential, credentialScopeId, revision,
            updatedAtMs: nextUpdatedAt(nowMs, current?.record.updatedAtMs ?? -1) })
        const latest = assertPersistedSlot(request.providerKey)
        if (latest !== current) {
          throw new Epoch2RuntimeCredentialError('EPOCH2_RUNTIME_CREDENTIAL_DRIFT')
        }
        persistRecord(record)
        if (storageMode === 'plaintext') assertPlaintextStoragePermissions()
        sessions.delete(request.providerKey)
        faultedRecordFingerprints.delete(request.providerKey)
        revisions.set(request.providerKey, revision)
        availability.set(request.providerKey, 'unknown')
        diagnostics.delete(request.providerKey)
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
    clearCredential: (request) => mutate(request.providerKey, async () => {
      const current = assertPersistedSlot(request.providerKey)
      const currentRevision = revisions.get(request.providerKey)
      if (currentRevision === undefined || request.expectedRevision !== currentRevision) {
        throw new Epoch2RuntimeCredentialError('EPOCH2_RUNTIME_CREDENTIAL_STALE_REVISION')
      }
      const faulted = faultedRecordFingerprints.has(request.providerKey)
      const session = sessions.get(request.providerKey)
      if (!current && !faulted && !session) return status(request.providerKey)
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
      sessions.delete(request.providerKey)
      faultedRecordFingerprints.delete(request.providerKey)
      availability.set(request.providerKey, 'unknown')
      diagnostics.delete(request.providerKey)
      return status(request.providerKey)
    }),
    withCredential: (request) => leaseOperation(request.providerKey, async () => {
      if (!Number.isSafeInteger(request.expectedRevision) || request.expectedRevision < 1 ||
          !isCredentialScopeIdV2(request.expectedCredentialScopeId) || typeof request.consume !== 'function') {
        throw new Epoch2RuntimeCredentialError('EPOCH2_RUNTIME_CREDENTIAL_INVALID')
      }
      const session = sessions.get(request.providerKey)
      if (session) {
        if (request.expectedRevision !== session.revision || request.expectedCredentialScopeId !== session.credentialScopeId) {
          throw new Epoch2RuntimeCredentialError('EPOCH2_RUNTIME_CREDENTIAL_STALE_REVISION')
        }
        const lease = Object.freeze({ trust: 'epoch2_runtime_credential_lease' as const, usage: 'provider_transport_only' as const,
          providerKey: request.providerKey, credential: session.credential, revision: session.revision,
          credentialScopeId: session.credentialScopeId, assertCurrent: () => {
            if (!runtimeCredentialLeases.has(lease) || sessions.get(request.providerKey) !== session || revisions.get(request.providerKey) !== session.revision) {
              throw new Epoch2RuntimeCredentialError('EPOCH2_RUNTIME_CREDENTIAL_DRIFT')
            }
          } })
        runtimeCredentialLeases.add(lease)
        try { return await activeCredentialOperation.run(request.providerKey, () => request.consume(lease)) }
        finally { runtimeCredentialLeases.delete(lease) }
      }
      const slot = assertPersistedSlot(request.providerKey)
      if (!slot) {
        if (faultedRecordFingerprints.has(request.providerKey)) {
          throw new Epoch2RuntimeCredentialError('EPOCH2_RUNTIME_CREDENTIAL_INVALID')
        }
        throw new Epoch2RuntimeCredentialError('EPOCH2_RUNTIME_CREDENTIAL_MISSING')
      }
      if (slot?.record.backend === 'electron_safe_storage') await requireAvailableForProvider(request.providerKey, slot)
      const maintained = await decryptAvailableRecord(request.providerKey, slot)
      const currentRevision = revisions.get(request.providerKey)
      if (currentRevision !== request.expectedRevision || maintained.slot.revision !== currentRevision) {
        throw new Epoch2RuntimeCredentialError('EPOCH2_RUNTIME_CREDENTIAL_STALE_REVISION')
      }
      if (request.expectedCredentialScopeId !== maintained.slot.credentialScopeId) {
        throw new Epoch2RuntimeCredentialError('EPOCH2_RUNTIME_CREDENTIAL_SCOPE_MISMATCH')
      }
      assertEpochDatabaseCurrent()
      assertPersistedSlot(request.providerKey)
      const lease = Object.freeze({
        trust: 'epoch2_runtime_credential_lease' as const,
        usage: 'provider_transport_only' as const,
        providerKey: request.providerKey,
        credential: maintained.credential,
        revision: currentRevision,
        credentialScopeId: maintained.slot.credentialScopeId,
        assertCurrent: () => {
          if (!runtimeCredentialLeases.has(lease)) {
            throw new Epoch2RuntimeCredentialError('EPOCH2_RUNTIME_CREDENTIAL_NOT_INITIALIZED')
          }
          assertEpochDatabaseCurrent()
          const latest = assertPersistedSlot(request.providerKey)
          if (latest !== maintained.slot || revisions.get(request.providerKey) !== currentRevision ||
              latest?.credentialScopeId !== maintained.slot.credentialScopeId) {
            throw new Epoch2RuntimeCredentialError('EPOCH2_RUNTIME_CREDENTIAL_DRIFT')
          }
        },
      })
      runtimeCredentialLeases.add(lease)
      try {
        return await activeCredentialOperation.run(request.providerKey, () => request.consume(lease))
      } finally {
        runtimeCredentialLeases.delete(lease)
      }
    }),
    withCredentialScopeBindingAuthority: (request) => leaseOperation(request.providerKey, async () => {
      if (!Number.isSafeInteger(request.expectedRevision) || request.expectedRevision < 1 ||
          !isCredentialScopeIdV2(request.expectedCredentialScopeId) || typeof request.consume !== 'function') {
        throw new Epoch2RuntimeCredentialError('EPOCH2_RUNTIME_CREDENTIAL_INVALID')
      }
      const session = sessions.get(request.providerKey)
      if (session) {
        if (request.expectedRevision !== session.revision || request.expectedCredentialScopeId !== session.credentialScopeId) {
          throw new Epoch2RuntimeCredentialError('EPOCH2_RUNTIME_CREDENTIAL_STALE_REVISION')
        }
        const authority = Object.freeze({ trust: 'epoch2_credential_scope_binding_authority' as const,
          usage: 'provider_binding_snapshot_only' as const, providerKey: request.providerKey,
          revision: session.revision, credentialScopeId: session.credentialScopeId, assertCurrent: () => {
            if (!credentialScopeBindingAuthorities.has(authority) || sessions.get(request.providerKey) !== session ||
                revisions.get(request.providerKey) !== session.revision) {
              throw new Epoch2RuntimeCredentialError('EPOCH2_RUNTIME_CREDENTIAL_DRIFT')
            }
          } })
        credentialScopeBindingAuthorities.add(authority)
        try { return await activeCredentialOperation.run(request.providerKey, () => request.consume(authority)) }
        finally { credentialScopeBindingAuthorities.delete(authority) }
      }
      const slot = assertPersistedSlot(request.providerKey)
      if (!slot) {
        if (faultedRecordFingerprints.has(request.providerKey)) {
          throw new Epoch2RuntimeCredentialError('EPOCH2_RUNTIME_CREDENTIAL_INVALID')
        }
        throw new Epoch2RuntimeCredentialError('EPOCH2_RUNTIME_CREDENTIAL_MISSING')
      }
      if (slot?.record.backend === 'electron_safe_storage') await requireAvailableForProvider(request.providerKey, slot)
      const maintained = await decryptAvailableRecord(request.providerKey, slot)
      const currentRevision = revisions.get(request.providerKey)
      if (currentRevision !== request.expectedRevision || maintained.slot.revision !== currentRevision) {
        throw new Epoch2RuntimeCredentialError('EPOCH2_RUNTIME_CREDENTIAL_STALE_REVISION')
      }
      if (request.expectedCredentialScopeId !== maintained.slot.credentialScopeId) {
        throw new Epoch2RuntimeCredentialError('EPOCH2_RUNTIME_CREDENTIAL_SCOPE_MISMATCH')
      }
      assertEpochDatabaseCurrent()
      assertPersistedSlot(request.providerKey)
      const authority = Object.freeze({
        trust: 'epoch2_credential_scope_binding_authority' as const,
        usage: 'provider_binding_snapshot_only' as const,
        providerKey: request.providerKey,
        revision: currentRevision,
        credentialScopeId: maintained.slot.credentialScopeId,
        assertCurrent: () => {
          if (!credentialScopeBindingAuthorities.has(authority)) {
            throw new Epoch2RuntimeCredentialError('EPOCH2_RUNTIME_CREDENTIAL_NOT_INITIALIZED')
          }
          assertEpochDatabaseCurrent()
          const latest = assertPersistedSlot(request.providerKey)
          if (latest !== maintained.slot || revisions.get(request.providerKey) !== currentRevision ||
              latest?.credentialScopeId !== maintained.slot.credentialScopeId) {
            throw new Epoch2RuntimeCredentialError('EPOCH2_RUNTIME_CREDENTIAL_DRIFT')
          }
        },
      })
      credentialScopeBindingAuthorities.add(authority)
      try {
        return await activeCredentialOperation.run(request.providerKey, () => request.consume(authority))
      } finally {
        credentialScopeBindingAuthorities.delete(authority)
      }
    }),
  })
  serviceReturned = true
  return service
  } finally {
    if (!serviceReturned) activeCredentialServiceLeases.delete(leaseIdentity)
  }
}
