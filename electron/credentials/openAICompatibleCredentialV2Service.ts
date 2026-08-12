import { AsyncLocalStorage } from 'node:async_hooks'
import { createHash, randomBytes } from 'node:crypto'
import type BetterSqlite3 from 'better-sqlite3'
import { safeStorage } from 'electron'
import { compatibleRegistryCredentialInputSchema, credentialVersionRefSchema, type CompatibleRegistryCredentialInput } from '../../src/shared/provider/openai-chat-compatible'
import { isCredentialScopeIdV2, type CredentialScopeIdV2 } from '../../infra/security/credentialScopeV2Primitive'
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
import { enforceLinuxCredentialStoragePermissions } from './linuxCredentialStoragePermissions'

const MAX_CIPHERTEXT_BYTES = 1024 * 1024

type PersistedRecord = Readonly<{ providerInstanceId: string; credentialVersionRef: string; backend: 'electron_safe_storage' | 'plaintext'; payload: Buffer | null; revision: number; credentialScopeId: CredentialScopeIdV2 | null; updatedAtMs: number; configured: boolean }>
type SessionRecord = Readonly<{ providerInstanceId: string; credential: CompatibleRegistryCredentialInput; revision: number; credentialScopeId: CredentialScopeIdV2 }>
type RevisionTombstone = Readonly<{ providerInstanceId: string; revision: number }>
export type OpenAICompatiblePreparedCredentialV2 = Readonly<{ providerInstanceId: string; credentialVersionRef: string; storageMode: CredentialStorageMode; payload?: Buffer; credential?: CompatibleRegistryCredentialInput; revision: number; credentialScopeId: CredentialScopeIdV2; updatedAtMs: number }>
export type OpenAICompatibleCredentialV2Status = Readonly<{ credentialVersionRef: string; providerInstanceId: string; configured: boolean; revision: number; credentialScopeId?: CredentialScopeIdV2; storageBackend?: CredentialStorageBackend; sessionOverridesPersistent: boolean; availability: 'unknown' | 'available' | 'unavailable'; diagnosticCode?: OpenAICompatibleCredentialV2Error['code'] }>
export type OpenAICompatibleCredentialV2Lease = Readonly<{ trust: 'openai_compatible_credential_v2_lease'; usage: 'provider_transport_only'; credential: CompatibleRegistryCredentialInput; revision: number; credentialScopeId: CredentialScopeIdV2; assertCurrent: () => void }>
export class OpenAICompatibleCredentialV2Error extends Error {
  constructor(readonly code: 'GENERATION_V2_OPENAI_COMPATIBLE_CREDENTIAL_INVALID' | 'GENERATION_V2_OPENAI_COMPATIBLE_CREDENTIAL_MISSING' | 'GENERATION_V2_OPENAI_COMPATIBLE_CREDENTIAL_STALE' | 'GENERATION_V2_OPENAI_COMPATIBLE_CREDENTIAL_STORAGE_UNAVAILABLE' | 'GENERATION_V2_OPENAI_COMPATIBLE_CREDENTIAL_SAFE_STORAGE_UNAVAILABLE' | 'GENERATION_V2_OPENAI_COMPATIBLE_CREDENTIAL_SAFE_STORAGE_BACKEND_UNTRUSTED' | 'GENERATION_V2_OPENAI_COMPATIBLE_CREDENTIAL_PLAINTEXT_UNSUPPORTED' | 'GENERATION_V2_OPENAI_COMPATIBLE_CREDENTIAL_DECRYPT_FAILED' | 'GENERATION_V2_OPENAI_COMPATIBLE_CREDENTIAL_RECORD_INVALID' | 'GENERATION_V2_OPENAI_COMPATIBLE_CREDENTIAL_DRIFT' | 'GENERATION_V2_OPENAI_COMPATIBLE_CREDENTIAL_REENTRANT' | 'GENERATION_V2_OPENAI_COMPATIBLE_CREDENTIAL_NOT_INITIALIZED') { super(code); this.name = 'OpenAICompatibleCredentialV2Error' }
}

function id(value: unknown): string {
  try { return credentialVersionRefSchema.parse(value) } catch { throw new OpenAICompatibleCredentialV2Error('GENERATION_V2_OPENAI_COMPATIBLE_CREDENTIAL_INVALID') }
}
function provider(value: unknown): string {
  if (typeof value !== 'string' || value.trim() !== value || value.length < 1 || value.length > 256 || /[\u0000-\u001f\u007f]/u.test(value)) throw new OpenAICompatibleCredentialV2Error('GENERATION_V2_OPENAI_COMPATIBLE_CREDENTIAL_INVALID')
  return value
}
function revision(value: unknown): number {
  if (!Number.isSafeInteger(value) || (value as number) < 1) throw new OpenAICompatibleCredentialV2Error('GENERATION_V2_OPENAI_COMPATIBLE_CREDENTIAL_DRIFT')
  return value as number
}
function timestamp(value: unknown): number {
  if (!Number.isSafeInteger(value) || (value as number) < 0) throw new OpenAICompatibleCredentialV2Error('GENERATION_V2_OPENAI_COMPATIBLE_CREDENTIAL_DRIFT')
  return value as number
}
function fingerprint(record: PersistedRecord): string {
  const hash = createHash('sha256').update(`${record.providerInstanceId}\0${record.credentialVersionRef}\0${record.backend}\0${record.revision}\0${record.credentialScopeId ?? ''}\0${record.updatedAtMs}\0${record.configured ? 1 : 0}\0`, 'utf8')
  if (record.payload) hash.update(record.payload)
  return hash.digest('hex')
}
function scope(): CredentialScopeIdV2 {
  const bytes = randomBytes(32)
  try { return `credential-scope-v2:${bytes.toString('hex')}` as CredentialScopeIdV2 }
  finally { bytes.fill(0) }
}
function status(record: PersistedRecord | undefined, session: SessionRecord | undefined, providerInstanceId: string, credentialVersionRef: string, diagnosticCode?: OpenAICompatibleCredentialV2Error['code']): OpenAICompatibleCredentialV2Status {
  if (session) return Object.freeze({ providerInstanceId, credentialVersionRef, configured: true, revision: session.revision,
    credentialScopeId: session.credentialScopeId, storageBackend: 'session', sessionOverridesPersistent: Boolean(record?.configured), availability: 'available' })
  if (!record) return Object.freeze({ providerInstanceId, credentialVersionRef, configured: false, revision: 0, sessionOverridesPersistent: false, availability: 'unknown' })
  return Object.freeze({ providerInstanceId, credentialVersionRef, configured: record.configured, revision: record.revision,
    ...(record.configured ? { credentialScopeId: record.credentialScopeId!, storageBackend: record.backend } : {}),
    sessionOverridesPersistent: false, availability: !record.configured ? 'unknown' : diagnosticCode ? 'unavailable' : record.backend === 'plaintext' ? 'available' : 'unknown',
    ...(diagnosticCode ? { diagnosticCode } : {}) })
}

export function createOpenAICompatibleCredentialV2Service(input: Readonly<{
  db: BetterSqlite3.Database
  mutationQueue?: CredentialMutationQueue
  nowMs?: () => number
  platform?: NodeJS.Platform
  credentialStoragePaths?: Readonly<{ directories: readonly string[]; files: readonly string[]; optionalFiles?: readonly string[] }>
}>) {
  const nowMs = input.nowMs ?? Date.now
  const mutationQueue = input.mutationQueue ?? createCredentialMutationQueue()
  const ownsMutationQueue = input.mutationQueue === undefined
  const active = new WeakSet<object>()
  const activeCredentialOperation = new AsyncLocalStorage<string>()
  const sessions = new Map<string, SessionRecord>()
  const tombstones = new Map<string, RevisionTombstone>()
  const diagnostics = new Map<string, OpenAICompatibleCredentialV2Error['code']>()
  const activeLeaseCompletions = new Set<Promise<void>>()
  let closed = false
  let closePromise: Promise<void> | undefined

  function assertOpenAndNonReentrant(): void {
    if (closed) throw new OpenAICompatibleCredentialV2Error('GENERATION_V2_OPENAI_COMPATIBLE_CREDENTIAL_NOT_INITIALIZED')
    if (activeCredentialOperation.getStore() !== undefined) throw new OpenAICompatibleCredentialV2Error('GENERATION_V2_OPENAI_COMPATIBLE_CREDENTIAL_REENTRANT')
  }
  function assertPlaintextStoragePermissions(): void {
    if ((input.platform ?? process.platform) !== 'linux') {
      throw new OpenAICompatibleCredentialV2Error('GENERATION_V2_OPENAI_COMPATIBLE_CREDENTIAL_PLAINTEXT_UNSUPPORTED')
    }
    if (!input.credentialStoragePaths) return
    enforceLinuxCredentialStoragePermissions({ platform: input.platform ?? process.platform, ...input.credentialStoragePaths })
  }
  function sessionFor(credentialVersionRef: string, providerInstanceId: string): SessionRecord | undefined {
    const session = sessions.get(credentialVersionRef)
    if (session && session.providerInstanceId !== providerInstanceId) {
      throw new OpenAICompatibleCredentialV2Error('GENERATION_V2_OPENAI_COMPATIBLE_CREDENTIAL_DRIFT')
    }
    return session
  }
  function tombstoneFor(credentialVersionRef: string, providerInstanceId: string): RevisionTombstone | undefined {
    const tombstone = tombstones.get(credentialVersionRef)
    if (tombstone && tombstone.providerInstanceId !== providerInstanceId) {
      throw new OpenAICompatibleCredentialV2Error('GENERATION_V2_OPENAI_COMPATIBLE_CREDENTIAL_DRIFT')
    }
    return tombstone
  }
  function withSessionRollback<T>(work: () => T): T {
    const sessionsBefore = new Map(sessions)
    const tombstonesBefore = new Map(tombstones)
    try { return work() }
    catch (error) {
      sessions.clear(); for (const [key, value] of sessionsBefore) sessions.set(key, value)
      tombstones.clear(); for (const [key, value] of tombstonesBefore) tombstones.set(key, value)
      throw error
    }
  }
  function read(ref: string, providerInstanceId: string): PersistedRecord | undefined {
    const row = input.db.prepare(`SELECT provider_instance_id, credential_version_ref, backend, payload, revision, credential_scope_id, updated_at_ms, configured
      FROM openai_compatible_credential_v2 WHERE credential_version_ref=?`).get(ref) as Record<string, unknown> | undefined
    if (!row) return undefined
    if (row.provider_instance_id !== providerInstanceId || row.credential_version_ref !== ref || (row.configured !== 0 && row.configured !== 1)) {
      throw new OpenAICompatibleCredentialV2Error('GENERATION_V2_OPENAI_COMPATIBLE_CREDENTIAL_DRIFT')
    }
    const configured = row.configured === 1
    const backend = row.backend === 'electron_safe_storage' || row.backend === 'plaintext' ? row.backend : null
    const payload = row.payload === null ? null : Buffer.isBuffer(row.payload) ? Buffer.from(row.payload) : null
    const credentialScopeId = row.credential_scope_id === null ? null : isCredentialScopeIdV2(row.credential_scope_id) ? row.credential_scope_id : null
    if (!backend || (configured && (!payload || payload.byteLength === 0 || payload.byteLength > MAX_CIPHERTEXT_BYTES || !credentialScopeId)) ||
        (!configured && (payload !== null || credentialScopeId !== null))) {
      payload?.fill(0)
      throw new OpenAICompatibleCredentialV2Error('GENERATION_V2_OPENAI_COMPATIBLE_CREDENTIAL_DRIFT')
    }
    return Object.freeze({ providerInstanceId, credentialVersionRef: ref, backend, payload, revision: revision(row.revision), credentialScopeId, updatedAtMs: timestamp(row.updated_at_ms), configured })
  }
  async function mutate<T>(providerInstanceId: string, work: () => Promise<T>): Promise<T> {
    assertOpenAndNonReentrant()
    try { return await mutationQueue.run(`compatible:${providerInstanceId}`, work) }
    catch (error) {
      if (error instanceof CredentialMutationQueueError) throw new OpenAICompatibleCredentialV2Error(error.code === 'CREDENTIAL_MUTATION_QUEUE_REENTRANT'
        ? 'GENERATION_V2_OPENAI_COMPATIBLE_CREDENTIAL_REENTRANT' : 'GENERATION_V2_OPENAI_COMPATIBLE_CREDENTIAL_STORAGE_UNAVAILABLE')
      throw error
    }
  }
  async function leaseOperation<T>(work: () => Promise<T>): Promise<T> {
    assertOpenAndNonReentrant()
    let resolveCompletion!: () => void
    const completion = new Promise<void>((resolve) => { resolveCompletion = resolve })
    activeLeaseCompletions.add(completion)
    try { return await work() } finally { resolveCompletion(); activeLeaseCompletions.delete(completion) }
  }
  async function requireAvailable(): Promise<void> {
    try { await requireTrustedCredentialSafeStorage({ platform: input.platform }) }
    catch (error) {
      throw new OpenAICompatibleCredentialV2Error(error instanceof CredentialSafeStorageBackendError &&
        error.code === 'CREDENTIAL_SAFE_STORAGE_BACKEND_UNTRUSTED'
        ? 'GENERATION_V2_OPENAI_COMPATIBLE_CREDENTIAL_SAFE_STORAGE_BACKEND_UNTRUSTED'
        : (input.platform ?? process.platform) === 'linux' && error instanceof CredentialSafeStorageBackendError &&
            error.code === 'CREDENTIAL_SAFE_STORAGE_UNAVAILABLE'
          ? 'GENERATION_V2_OPENAI_COMPATIBLE_CREDENTIAL_SAFE_STORAGE_UNAVAILABLE'
        : 'GENERATION_V2_OPENAI_COMPATIBLE_CREDENTIAL_STORAGE_UNAVAILABLE')
    }
  }
  async function prepare(inputValue: Readonly<{ providerInstanceId: string; credentialVersionRef: string; credential: CompatibleRegistryCredentialInput; expectedRevision: number; storageMode?: CredentialStorageMode }>): Promise<OpenAICompatiblePreparedCredentialV2> {
    assertOpenAndNonReentrant()
    const providerInstanceId = provider(inputValue.providerInstanceId); const credentialVersionRef = id(inputValue.credentialVersionRef)
    if (!Number.isSafeInteger(inputValue.expectedRevision) || inputValue.expectedRevision < 0) throw new OpenAICompatibleCredentialV2Error('GENERATION_V2_OPENAI_COMPATIBLE_CREDENTIAL_INVALID')
    let credential: CompatibleRegistryCredentialInput
    try { credential = compatibleRegistryCredentialInputSchema.parse(inputValue.credential) } catch { throw new OpenAICompatibleCredentialV2Error('GENERATION_V2_OPENAI_COMPATIBLE_CREDENTIAL_INVALID') }
    if (credential.mode === 'none') throw new OpenAICompatibleCredentialV2Error('GENERATION_V2_OPENAI_COMPATIBLE_CREDENTIAL_INVALID')
    const storageMode = inputValue.storageMode ?? 'system_secure'
    if (storageMode !== 'system_secure' && storageMode !== 'session' && storageMode !== 'plaintext') throw new OpenAICompatibleCredentialV2Error('GENERATION_V2_OPENAI_COMPATIBLE_CREDENTIAL_INVALID')
    if (storageMode === 'plaintext' && (input.platform ?? process.platform) !== 'linux') throw new OpenAICompatibleCredentialV2Error('GENERATION_V2_OPENAI_COMPATIBLE_CREDENTIAL_PLAINTEXT_UNSUPPORTED')
    if (storageMode === 'session') return Object.freeze({ providerInstanceId, credentialVersionRef, storageMode, credential,
      revision: inputValue.expectedRevision + 1, credentialScopeId: scope(), updatedAtMs: nowMs() })
    if (storageMode === 'system_secure') await requireAvailable()
    let payload: Buffer | undefined
    try {
      payload = storageMode === 'system_secure'
        ? await safeStorage.encryptStringAsync(JSON.stringify(credential))
        : Buffer.from(JSON.stringify(credential), 'utf8')
      if (!Buffer.isBuffer(payload) || payload.byteLength === 0 || payload.byteLength > MAX_CIPHERTEXT_BYTES) throw new Error('invalid')
      return Object.freeze({ providerInstanceId, credentialVersionRef, storageMode, payload, revision: inputValue.expectedRevision + 1,
        credentialScopeId: scope(), updatedAtMs: nowMs() })
    } catch (error) {
      payload?.fill(0)
      if (error instanceof OpenAICompatibleCredentialV2Error) throw error
      throw new OpenAICompatibleCredentialV2Error('GENERATION_V2_OPENAI_COMPATIBLE_CREDENTIAL_STORAGE_UNAVAILABLE')
    }
  }
  function discardPrepared(prepared: OpenAICompatiblePreparedCredentialV2): void { prepared.payload?.fill(0) }
  function writePrepared(prepared: OpenAICompatiblePreparedCredentialV2): OpenAICompatibleCredentialV2Status {
    const existing = read(prepared.credentialVersionRef, prepared.providerInstanceId)
    try {
      if (input.db.prepare(`SELECT 1 FROM openai_compatible_provider_v2 WHERE provider_instance_id=? AND status <> 'deleted'`)
        .get(prepared.providerInstanceId) === undefined) {
        throw new OpenAICompatibleCredentialV2Error('GENERATION_V2_OPENAI_COMPATIBLE_CREDENTIAL_MISSING')
      }
      const expectedRevision = prepared.revision - 1
      const session = sessionFor(prepared.credentialVersionRef, prepared.providerInstanceId)
      const effectiveRevision = session?.revision ?? existing?.revision ?? tombstoneFor(prepared.credentialVersionRef, prepared.providerInstanceId)?.revision ?? 0
      if (effectiveRevision !== expectedRevision) {
        throw new OpenAICompatibleCredentialV2Error('GENERATION_V2_OPENAI_COMPATIBLE_CREDENTIAL_STALE')
      }
      if (prepared.storageMode === 'session') {
        if (!prepared.credential) {
          throw new OpenAICompatibleCredentialV2Error('GENERATION_V2_OPENAI_COMPATIBLE_CREDENTIAL_STALE')
        }
        sessions.set(prepared.credentialVersionRef, Object.freeze({ providerInstanceId: prepared.providerInstanceId, credential: prepared.credential, revision: prepared.revision,
          credentialScopeId: prepared.credentialScopeId }))
        tombstones.delete(prepared.credentialVersionRef)
        diagnostics.delete(prepared.credentialVersionRef)
        return status(existing, sessionFor(prepared.credentialVersionRef, prepared.providerInstanceId), prepared.providerInstanceId, prepared.credentialVersionRef)
      }
      const expectedPersistedRevision = existing?.revision ?? 0
      if (prepared.storageMode === 'plaintext') assertPlaintextStoragePermissions()
      const changes = input.db.prepare(`INSERT INTO openai_compatible_credential_v2 (
      credential_version_ref, provider_instance_id, backend, payload, revision, credential_scope_id, updated_at_ms, configured
    ) VALUES (?, ?, ?, ?, ?, ?, ?, 1)
    ON CONFLICT(credential_version_ref) DO UPDATE SET backend=excluded.backend, payload=excluded.payload, revision=excluded.revision,
      credential_scope_id=excluded.credential_scope_id, updated_at_ms=excluded.updated_at_ms, configured=1
    WHERE openai_compatible_credential_v2.provider_instance_id=excluded.provider_instance_id
      AND openai_compatible_credential_v2.revision=?`).run(prepared.credentialVersionRef, prepared.providerInstanceId,
      prepared.storageMode === 'system_secure' ? 'electron_safe_storage' : 'plaintext', prepared.payload, prepared.revision,
      prepared.credentialScopeId, prepared.updatedAtMs, expectedPersistedRevision).changes
      if (changes !== 1) throw new OpenAICompatibleCredentialV2Error('GENERATION_V2_OPENAI_COMPATIBLE_CREDENTIAL_STALE')
      if (prepared.storageMode === 'plaintext') assertPlaintextStoragePermissions()
      sessions.delete(prepared.credentialVersionRef)
      tombstones.delete(prepared.credentialVersionRef)
      diagnostics.delete(prepared.credentialVersionRef)
      return status(Object.freeze({ providerInstanceId: prepared.providerInstanceId, credentialVersionRef: prepared.credentialVersionRef,
        backend: prepared.storageMode === 'system_secure' ? 'electron_safe_storage' : 'plaintext', payload: prepared.payload!, revision: prepared.revision,
        credentialScopeId: prepared.credentialScopeId, updatedAtMs: prepared.updatedAtMs, configured: true }), undefined, prepared.providerInstanceId, prepared.credentialVersionRef)
    } finally { existing?.payload?.fill(0) }
  }
  function clearPersisted(providerInstanceId: string, credentialVersionRef: string, expectedRevision: number): OpenAICompatibleCredentialV2Status {
    const existing = read(credentialVersionRef, providerInstanceId)
    try {
      const session = sessionFor(credentialVersionRef, providerInstanceId)
      const effectiveRevision = session?.revision ?? existing?.revision ?? tombstoneFor(credentialVersionRef, providerInstanceId)?.revision ?? 0
      if (effectiveRevision !== expectedRevision) throw new OpenAICompatibleCredentialV2Error('GENERATION_V2_OPENAI_COMPATIBLE_CREDENTIAL_STALE')
      if (!existing) {
        sessions.delete(credentialVersionRef)
        const next = expectedRevision + 1
        tombstones.set(credentialVersionRef, Object.freeze({ providerInstanceId, revision: next }))
        diagnostics.delete(credentialVersionRef)
        return Object.freeze({ providerInstanceId, credentialVersionRef, configured: false, revision: next,
          sessionOverridesPersistent: false, availability: 'unknown' })
      }
      const next = expectedRevision + 1
      if (input.db.prepare(`UPDATE openai_compatible_credential_v2 SET payload=NULL, credential_scope_id=NULL, configured=0, revision=?, updated_at_ms=?
      WHERE credential_version_ref=? AND provider_instance_id=? AND revision=?`).run(next, Math.max(nowMs(), existing.updatedAtMs), credentialVersionRef, providerInstanceId, existing.revision).changes !== 1) {
        throw new OpenAICompatibleCredentialV2Error('GENERATION_V2_OPENAI_COMPATIBLE_CREDENTIAL_STALE')
      }
      sessions.delete(credentialVersionRef)
      tombstones.set(credentialVersionRef, Object.freeze({ providerInstanceId, revision: next }))
      diagnostics.delete(credentialVersionRef)
      return Object.freeze({ providerInstanceId, credentialVersionRef, configured: false, revision: next, sessionOverridesPersistent: false, availability: 'unknown' })
    } finally { existing?.payload?.fill(0) }
  }
  function clearCurrentPersisted(providerInstanceId: string, credentialVersionRef: string): OpenAICompatibleCredentialV2Status {
    const current = read(credentialVersionRef, providerInstanceId)
    try {
      if (current) return clearPersisted(providerInstanceId, credentialVersionRef, sessionFor(credentialVersionRef, providerInstanceId)?.revision ?? current.revision)
      const session = sessionFor(credentialVersionRef, providerInstanceId)
      if (!session) return status(undefined, undefined, providerInstanceId, credentialVersionRef)
      sessions.delete(credentialVersionRef)
      const next = session.revision + 1
      tombstones.set(credentialVersionRef, Object.freeze({ providerInstanceId, revision: next }))
      diagnostics.delete(credentialVersionRef)
      return Object.freeze({ providerInstanceId, credentialVersionRef, configured: false, revision: next,
        sessionOverridesPersistent: false, availability: 'unknown' })
    }
    finally { current?.payload?.fill(0) }
  }
  async function decrypt(record: PersistedRecord): Promise<CompatibleRegistryCredentialInput> {
    if (!record.payload) throw new OpenAICompatibleCredentialV2Error('GENERATION_V2_OPENAI_COMPATIBLE_CREDENTIAL_MISSING')
    const payload = Buffer.from(record.payload)
    try {
      let serialized: string
      if (record.backend === 'electron_safe_storage') {
        await requireAvailable()
        try { serialized = (await safeStorage.decryptStringAsync(payload)).result }
        catch { throw new OpenAICompatibleCredentialV2Error('GENERATION_V2_OPENAI_COMPATIBLE_CREDENTIAL_DECRYPT_FAILED') }
      } else {
        serialized = payload.toString('utf8')
      }
      try { return compatibleRegistryCredentialInputSchema.parse(JSON.parse(serialized)) }
      catch { throw new OpenAICompatibleCredentialV2Error('GENERATION_V2_OPENAI_COMPATIBLE_CREDENTIAL_RECORD_INVALID') }
    }
    finally { payload.fill(0) }
  }
  function clearProviderSessions(providerInstanceId: string): void {
    const providerId = provider(providerInstanceId)
    for (const [ref, session] of sessions) if (session.providerInstanceId === providerId) sessions.delete(ref)
    for (const [ref, tombstone] of tombstones) if (tombstone.providerInstanceId === providerId) tombstones.delete(ref)
  }

  return Object.freeze({
    prepare,
    discardPrepared,
    writePrepared,
    clearPersisted,
    clearCurrentPersisted,
    clearProviderSessions,
    getStatus: async (providerInstanceId: string, credentialVersionRef: string): Promise<OpenAICompatibleCredentialV2Status> => {
      assertOpenAndNonReentrant(); const providerId = provider(providerInstanceId); const ref = id(credentialVersionRef)
       const current = read(ref, providerId); try {
         const currentStatus = status(current, sessionFor(ref, providerId), providerId, ref, diagnostics.get(ref))
         const tombstone = tombstoneFor(ref, providerId)
         return currentStatus.configured || !tombstone ? currentStatus : Object.freeze({ ...currentStatus, revision: tombstone.revision })
       } finally { current?.payload?.fill(0) }
    },
    write: async (request: Readonly<{ providerInstanceId: string; credentialVersionRef: string; credential: CompatibleRegistryCredentialInput; expectedRevision: number; storageMode?: CredentialStorageMode }>) => {
      const prepared = await prepare(request)
      try { return await mutate(prepared.providerInstanceId, async () => input.db.transaction(() => withSessionRollback(() => writePrepared(prepared)))()) }
       finally { discardPrepared(prepared) }
    },
    clear: async (providerInstanceId: string, credentialVersionRef: string, expectedRevision: number) => {
      const providerId = provider(providerInstanceId); const ref = id(credentialVersionRef)
      return mutate(providerId, async () => input.db.transaction(() => withSessionRollback(() => clearPersisted(providerId, ref, expectedRevision)))())
    },
    withCredential: async <T>(request: Readonly<{ providerInstanceId: string; credentialVersionRef: string; expectedRevision: number; expectedCredentialScopeId: CredentialScopeIdV2; consume: (lease: OpenAICompatibleCredentialV2Lease) => Promise<T> | T }>): Promise<T> => leaseOperation(async () => {
       const providerId = provider(request.providerInstanceId); const ref = id(request.credentialVersionRef); const current = read(ref, providerId); const session = sessionFor(ref, providerId)
       if (session) {
         if (session.revision !== request.expectedRevision || session.credentialScopeId !== request.expectedCredentialScopeId || typeof request.consume !== 'function') { current?.payload?.fill(0); throw new OpenAICompatibleCredentialV2Error('GENERATION_V2_OPENAI_COMPATIBLE_CREDENTIAL_STALE') }
         const lease = Object.freeze({ trust: 'openai_compatible_credential_v2_lease' as const, usage: 'provider_transport_only' as const,
           credential: session.credential, revision: session.revision, credentialScopeId: session.credentialScopeId,
           assertCurrent: () => { if (!active.has(lease) || sessions.get(ref) !== session) throw new OpenAICompatibleCredentialV2Error('GENERATION_V2_OPENAI_COMPATIBLE_CREDENTIAL_DRIFT') } })
         active.add(lease); try { return await activeCredentialOperation.run(ref, () => request.consume(lease)) } finally { active.delete(lease); current?.payload?.fill(0) }
       }
       if (!current || !current.configured || !current.credentialScopeId) { current?.payload?.fill(0); throw new OpenAICompatibleCredentialV2Error('GENERATION_V2_OPENAI_COMPATIBLE_CREDENTIAL_MISSING') }
       if (current.revision !== request.expectedRevision || current.credentialScopeId !== request.expectedCredentialScopeId || typeof request.consume !== 'function') { current.payload?.fill(0); throw new OpenAICompatibleCredentialV2Error('GENERATION_V2_OPENAI_COMPATIBLE_CREDENTIAL_STALE') }
      const expectedFingerprint = fingerprint(current)
      try {
        let credential: CompatibleRegistryCredentialInput
        try { credential = await decrypt(current); diagnostics.delete(ref) }
        catch (error) {
          if (error instanceof OpenAICompatibleCredentialV2Error) diagnostics.set(ref, error.code)
          throw error
        }
        const lease = Object.freeze({ trust: 'openai_compatible_credential_v2_lease' as const, usage: 'provider_transport_only' as const,
          credential, revision: current.revision, credentialScopeId: current.credentialScopeId,
           assertCurrent: () => { const later = read(ref, providerId); try { if (!active.has(lease) || !later || fingerprint(later) !== expectedFingerprint) throw new OpenAICompatibleCredentialV2Error('GENERATION_V2_OPENAI_COMPATIBLE_CREDENTIAL_DRIFT') } finally { later?.payload?.fill(0) } } })
        active.add(lease); try { return await activeCredentialOperation.run(ref, () => request.consume(lease)) } finally { active.delete(lease) }
       } finally { current.payload?.fill(0) }
    }),
    close: async (): Promise<void> => {
      if (activeCredentialOperation.getStore() !== undefined) throw new OpenAICompatibleCredentialV2Error('GENERATION_V2_OPENAI_COMPATIBLE_CREDENTIAL_REENTRANT')
      if (closePromise) return closePromise
      closed = true
       closePromise = Promise.all([...activeLeaseCompletions]).then(async () => { sessions.clear(); tombstones.clear(); diagnostics.clear(); if (ownsMutationQueue) await mutationQueue.close() })
      return closePromise
    },
    commit: async <T>(providerInstanceId: string, work: () => T): Promise<T> => {
      const providerId = provider(providerInstanceId)
      return mutate(providerId, async () => withSessionRollback(work))
    },
  })
}
