import fs from 'node:fs'
import os from 'node:os'
import path from 'node:path'
import BetterSqlite3 from 'better-sqlite3'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { createEpoch2ResetJournal } from '../data-epoch/resetJournal'
import { writeEpoch2ResetJournalAtomic } from '../data-epoch/resetJournalStore'
import { createEpoch2RootManifest, resolveEpoch2WorkspaceLayout } from '../data-epoch/rootManifest'
import { writeEpoch2TransitionOwnershipManifestAtomic } from '../data-epoch/rootManifestStore'
import {
  acquireWin32EpochRootLease,
  ensureEpoch2RootAuthority,
} from '../data-epoch/win32EpochRootLease'

const safeStorageMock = vi.hoisted(() => ({
  available: true,
  generation: 0,
  rotateNext: false,
  backend: 'gnome_libsecret' as const,
  isAsyncEncryptionAvailable: vi.fn(async () => safeStorageMock.available),
  getSelectedStorageBackend: vi.fn(() => safeStorageMock.backend),
  encryptStringAsync: vi.fn(async (value: string) => {
    safeStorageMock.generation += 1
    return Buffer.from(`enc:${safeStorageMock.generation}:${value}`, 'utf8')
  }),
  decryptStringAsync: vi.fn(async (ciphertext: Buffer) => {
    const match = /^enc:\d+:(.*)$/u.exec(ciphertext.toString('utf8'))
    if (!match) throw new Error('invalid ciphertext')
    const shouldReEncrypt = safeStorageMock.rotateNext
    safeStorageMock.rotateNext = false
    return { shouldReEncrypt, result: match[1] }
  }),
}))

vi.mock('electron', () => ({
  app: { getAppPath: () => process.cwd(), isPackaged: false },
  safeStorage: safeStorageMock,
}))

import { initializeOrVerifyFreshEpoch2Database } from '../data-epoch/freshEpochDatabaseInitializer'
import {
  createEpoch2RuntimeCredentialService,
  Epoch2RuntimeCredentialError,
  isEpoch2CredentialScopeBindingAuthority,
  isEpoch2RuntimeCredentialLease,
  type Epoch2CredentialScopeBindingAuthority,
  type Epoch2RuntimeCredentialLease,
} from './epoch2RuntimeCredentialService'
import type { ProviderCredentialKey } from './providerCredentialContract'

const windowsIt = process.platform === 'win32' ? it : it.skip
const roots: string[] = []

class MemoryStore {
  readonly values = new Map<string, unknown>()
  get(key: string): unknown { return this.values.get(key) }
  set(key: string, value: unknown): void { this.values.set(key, structuredClone(value)) }
  delete(key: string): void { this.values.delete(key) }
}

function storedRecord(providerKey: ProviderCredentialKey, credential: string, updatedAtMs = 10, revision = 1) {
  return {
    version: 3,
    providerKey,
    backend: 'electron_safe_storage',
    ciphertextBase64: Buffer.from(`enc:100:${credential}`, 'utf8').toString('base64'),
    credentialScopeId: `credential-scope-v2:${'a'.repeat(64)}`,
    revision,
    updatedAtMs,
  }
}

function deferred(): Readonly<{ promise: Promise<void>; resolve: () => void }> {
  let resolve!: () => void
  return Object.freeze({ promise: new Promise<void>((next) => { resolve = next }), resolve })
}

function legacyStoredRecord(providerKey: ProviderCredentialKey, credential: string, updatedAtMs = 10) {
  return {
    version: 1,
    providerKey,
    backend: 'electron_safe_storage',
    ciphertextBase64: Buffer.from(`enc:100:${credential}`, 'utf8').toString('base64'),
    updatedAtMs,
  }
}

async function fixture(name: string, records: Partial<Record<ProviderCredentialKey, unknown>> = {}) {
  const appDataRoot = fs.mkdtempSync(path.join(os.tmpdir(), `${name}-`))
  roots.push(appDataRoot)
  const layout = resolveEpoch2WorkspaceLayout({
    appDataRoot,
    homeRoot: os.homedir(),
    repositoryRoot: process.cwd(),
  })
  fs.mkdirSync(layout.productRoot, { recursive: true })
  const lease = acquireWin32EpochRootLease(layout)
  writeEpoch2TransitionOwnershipManifestAtomic({
    layout,
    lease,
    manifest: createEpoch2RootManifest({ layout }),
  })
  writeEpoch2ResetJournalAtomic({
    layout,
    lease,
    journal: createEpoch2ResetJournal({
      layout,
      operationId: '123e4567-e89b-42d3-a456-426614174000',
    }),
  })
  const rootAuthority = ensureEpoch2RootAuthority({ layout, lease })
  const epochDatabase = { layout, lease, rootAuthority }
  await initializeOrVerifyFreshEpoch2Database(epochDatabase)
  const store = new MemoryStore()
  for (const [providerKey, record] of Object.entries(records)) {
    store.set(`providerCredentials.v1.${providerKey}`, record)
  }
  return { store, epochDatabase, lease }
}

beforeEach(() => {
  safeStorageMock.available = true
  safeStorageMock.generation = 0
  safeStorageMock.rotateNext = false
  safeStorageMock.backend = 'gnome_libsecret'
  safeStorageMock.isAsyncEncryptionAvailable.mockClear()
  safeStorageMock.getSelectedStorageBackend.mockClear()
  safeStorageMock.encryptStringAsync.mockClear()
  safeStorageMock.decryptStringAsync.mockClear()
})

afterEach(() => {
  for (const root of roots.splice(0)) fs.rmSync(root, { recursive: true, force: true })
})

describe('epoch-2 runtime credential slot/revision authority', () => {
  windowsIt('loads v2 metadata without decrypting and decrypts only during credential consumption', async () => {
    const value = await fixture('starverse-runtime-credential-load', {
      openrouter: storedRecord('openrouter', 'sk-openrouter'),
    })
    try {
      const service = await createEpoch2RuntimeCredentialService({
        store: value.store as never,
        epochDatabase: value.epochDatabase,
      })
      const status = await service.getStatus('openrouter')
      expect(status.configured).toBe(true)
      expect(status.revision).toBe(1)
      expect(status.credentialScopeId).toMatch(/^credential-scope-v2:[0-9a-f]{64}$/u)
      expect(JSON.stringify(status)).not.toContain('sk-openrouter')
      expect(status.availability).toBe('unknown')
      expect(safeStorageMock.decryptStringAsync).not.toHaveBeenCalled()
      const probe = new BetterSqlite3(value.epochDatabase.layout.databasePath)
      try { probe.exec('CREATE TABLE credential_consumption_hot_path_probe (id INTEGER PRIMARY KEY)') } finally { probe.close() }
      const decryptsBeforeConsumption = safeStorageMock.decryptStringAsync.mock.calls.length
      const consumed = await service.withCredential({
        providerKey: 'openrouter',
        expectedRevision: status.revision,
        expectedCredentialScopeId: status.credentialScopeId!,
        consume: async (lease) => ({
          credential: lease.credential,
          revision: lease.revision,
          scope: lease.credentialScopeId,
        }),
      })
      expect(consumed).toEqual({
        credential: 'sk-openrouter',
        revision: 1,
        scope: status.credentialScopeId,
      })
      expect(safeStorageMock.decryptStringAsync).toHaveBeenCalledTimes(decryptsBeforeConsumption + 1)
      expect((await service.getStatus('deepseek')).configured).toBe(false)
    } finally { value.lease.release() }
  })

  windowsIt('uses monotonic CAS revisions across update, clear and recreate without scope ABA', async () => {
    const value = await fixture('starverse-runtime-credential-cas')
    try {
      const service = await createEpoch2RuntimeCredentialService({
        store: value.store as never,
        epochDatabase: value.epochDatabase,
        nowMs: () => 20,
      })
      const created = await service.updateCredential({
        providerKey: 'deepseek', credential: 'sk-first', expectedRevision: 0,
      })
      expect(created.revision).toBe(1)
      const firstScope = created.credentialScopeId!
      await expect(service.updateCredential({
        providerKey: 'deepseek', credential: 'sk-stale', expectedRevision: 0,
      })).rejects.toThrow('EPOCH2_RUNTIME_CREDENTIAL_STALE_REVISION')
      const cleared = await service.clearCredential({ providerKey: 'deepseek', expectedRevision: 1 })
      expect(cleared).toMatchObject({ configured: false, revision: 2 })
      const recreated = await service.updateCredential({
        providerKey: 'deepseek', credential: 'sk-second', expectedRevision: 2,
      })
      expect(recreated.revision).toBe(3)
      expect(recreated.credentialScopeId).not.toBe(firstScope)
      await expect(service.withCredential({
        providerKey: 'deepseek', expectedRevision: 1, expectedCredentialScopeId: firstScope,
        consume: () => undefined,
      })).rejects.toThrow('EPOCH2_RUNTIME_CREDENTIAL_STALE_REVISION')
    } finally { value.lease.release() }
  })

  windowsIt('persists a random scope without decrypting when the service restarts', async () => {
    const value = await fixture('starverse-runtime-credential-persisted-random-scope')
    try {
      const first = await createEpoch2RuntimeCredentialService({
        store: value.store as never,
        epochDatabase: value.epochDatabase,
      })
      const created = await first.updateCredential({
        providerKey: 'openai_responses', credential: 'sk-openai', expectedRevision: 0,
      })
      expect((value.store.get('providerCredentials.v1.openai_responses') as { version: number }).version).toBe(3)
      await first.close()
      safeStorageMock.decryptStringAsync.mockClear()

      const restarted = await createEpoch2RuntimeCredentialService({
        store: value.store as never,
        epochDatabase: value.epochDatabase,
      })
      try {
        await expect(restarted.getStatus('openai_responses')).resolves.toMatchObject({
          configured: true,
          revision: created.revision,
          credentialScopeId: created.credentialScopeId,
          availability: 'unknown',
        })
        expect(safeStorageMock.decryptStringAsync).not.toHaveBeenCalled()
      } finally { await restarted.close() }
    } finally { value.lease.release() }
  })

  windowsIt('retains configured metadata and reports a precise unavailable state after decrypt failure', async () => {
    const value = await fixture('starverse-runtime-credential-decrypt-failure', {
      anthropic: storedRecord('anthropic', 'sk-anthropic'),
    })
    try {
      const service = await createEpoch2RuntimeCredentialService({
        store: value.store as never,
        epochDatabase: value.epochDatabase,
      })
      const initial = await service.getStatus('anthropic')
      safeStorageMock.decryptStringAsync.mockImplementationOnce(async () => { throw new Error('DPAPI unavailable') })
      await expect(service.withCredential({
        providerKey: 'anthropic', expectedRevision: initial.revision,
        expectedCredentialScopeId: initial.credentialScopeId!, consume: () => undefined,
      })).rejects.toThrow('EPOCH2_RUNTIME_CREDENTIAL_DECRYPT_FAILED')
      await expect(service.getStatus('anthropic')).resolves.toMatchObject({
        configured: true,
        revision: initial.revision,
        credentialScopeId: initial.credentialScopeId,
        availability: 'unavailable',
        diagnosticCode: 'EPOCH2_RUNTIME_CREDENTIAL_DECRYPT_FAILED',
      })
      expect(value.store.get('providerCredentials.v1.anthropic')).toEqual(storedRecord('anthropic', 'sk-anthropic'))
    } finally { value.lease.release() }
  })

  windowsIt('isolates malformed v2 ciphertext and preserves an exact diagnostic for replacement', async () => {
    const malformed = {
      ...storedRecord('google_ai_studio', 'sk-google'),
      ciphertextBase64: 'not-canonical-base64',
    }
    const value = await fixture('starverse-runtime-credential-malformed-v2', {
      google_ai_studio: malformed,
    })
    try {
      const service = await createEpoch2RuntimeCredentialService({
        store: value.store as never,
        epochDatabase: value.epochDatabase,
      })
      await expect(service.getStatus('google_ai_studio')).resolves.toMatchObject({
        configured: true,
        revision: 0,
        availability: 'unavailable',
        diagnosticCode: 'EPOCH2_RUNTIME_CREDENTIAL_INVALID',
      })
      await expect(service.updateCredential({
        providerKey: 'google_ai_studio', credential: 'sk-replacement', expectedRevision: 0,
      })).resolves.toMatchObject({ configured: true, revision: 1, availability: 'unknown' })
    } finally { value.lease.release() }
  })

  windowsIt('holds the provider mutation lease through controlled credential consumption', async () => {
    const value = await fixture('starverse-runtime-credential-lease', {
      anthropic: storedRecord('anthropic', 'sk-old'),
    })
    try {
      const service = await createEpoch2RuntimeCredentialService({
        store: value.store as never,
        epochDatabase: value.epochDatabase,
      })
      const initial = await service.getStatus('anthropic')
      let release!: () => void
      const gate = new Promise<void>((resolve) => { release = resolve })
      let markEntered!: () => void
      const entered = new Promise<void>((resolve) => { markEntered = resolve })
      let capturedLease: Epoch2RuntimeCredentialLease | undefined
      const active = service.withCredential({
        providerKey: 'anthropic',
        expectedRevision: initial.revision,
        expectedCredentialScopeId: initial.credentialScopeId!,
        consume: async (lease) => {
          expect(lease.credential).toBe('sk-old')
          expect(isEpoch2RuntimeCredentialLease(lease)).toBe(true)
          expect(lease.usage).toBe('provider_transport_only')
          lease.assertCurrent()
          capturedLease = lease
          markEntered()
          await gate
          return 'done'
        },
      })
      await entered
      let updateFinished = false
      const update = service.updateCredential({
        providerKey: 'anthropic', credential: 'sk-new', expectedRevision: 1,
      }).then((result) => { updateFinished = true; return result })
      await Promise.resolve()
      expect(updateFinished).toBe(false)
      release()
      await expect(active).resolves.toBe('done')
      expect(isEpoch2RuntimeCredentialLease(capturedLease)).toBe(false)
      expect(() => capturedLease?.assertCurrent()).toThrow('EPOCH2_RUNTIME_CREDENTIAL_NOT_INITIALIZED')
      await expect(update).resolves.toMatchObject({ revision: 2 })
    } finally { value.lease.release() }
  })

  windowsIt('issues a short-lived non-plaintext scope authority while holding the provider mutation lease', async () => {
    const value = await fixture('starverse-runtime-credential-scope-authority', {
      deepseek: storedRecord('deepseek', 'sk-private'),
    })
    try {
      const service = await createEpoch2RuntimeCredentialService({
        store: value.store as never,
        epochDatabase: value.epochDatabase,
      })
      const status = await service.getStatus('deepseek')
      let escaped: Epoch2CredentialScopeBindingAuthority | undefined
      let release!: () => void
      const gate = new Promise<void>((resolve) => { release = resolve })
      let entered!: () => void
      const activeEntered = new Promise<void>((resolve) => { entered = resolve })
      const active = service.withCredentialScopeBindingAuthority({
        providerKey: 'deepseek',
        expectedRevision: status.revision,
        expectedCredentialScopeId: status.credentialScopeId!,
        consume: async (authority) => {
          escaped = authority
          expect(isEpoch2CredentialScopeBindingAuthority(authority)).toBe(true)
          expect(authority).toMatchObject({
            providerKey: 'deepseek',
            revision: 1,
            credentialScopeId: status.credentialScopeId,
          })
          expect(JSON.stringify(authority)).not.toContain('sk-private')
          entered()
          await gate
          return authority.credentialScopeId
        },
      })
      await activeEntered
      let updateFinished = false
      const update = service.updateCredential({
        providerKey: 'deepseek', credential: 'sk-new', expectedRevision: 1,
      }).then((result) => { updateFinished = true; return result })
      await Promise.resolve()
      expect(updateFinished).toBe(false)
      release()
      await expect(active).resolves.toBe(status.credentialScopeId)
      expect(isEpoch2CredentialScopeBindingAuthority(escaped)).toBe(false)
      expect(isEpoch2CredentialScopeBindingAuthority({ ...escaped })).toBe(false)
      expect(() => escaped?.assertCurrent()).toThrow('EPOCH2_RUNTIME_CREDENTIAL_NOT_INITIALIZED')
      await expect(update).resolves.toMatchObject({ revision: 2 })
    } finally { value.lease.release() }
  })

  windowsIt('rejects a second service for the held epoch lease and permits recreation only after close', async () => {
    const value = await fixture('starverse-runtime-credential-single-service', {
      deepseek: storedRecord('deepseek', 'sk-private'),
    })
    const first = await createEpoch2RuntimeCredentialService({
      store: value.store as never,
      epochDatabase: value.epochDatabase,
    })
    try {
      await expect(createEpoch2RuntimeCredentialService({
        store: value.store as never,
        epochDatabase: value.epochDatabase,
      })).rejects.toThrow('EPOCH2_RUNTIME_CREDENTIAL_ALREADY_INITIALIZED')
      await first.close()
      const second = await createEpoch2RuntimeCredentialService({
        store: value.store as never,
        epochDatabase: value.epochDatabase,
      })
      await second.close()
    } finally {
      await first.close()
      value.lease.release()
    }
  })

  windowsIt('fences external drift and forbids all service re-entry while a scope authority is active', async () => {
    const value = await fixture('starverse-runtime-credential-scope-authority-fence', {
      deepseek: storedRecord('deepseek', 'sk-private'),
      anthropic: storedRecord('anthropic', 'sk-anthropic'),
    })
    try {
      const service = await createEpoch2RuntimeCredentialService({
        store: value.store as never,
        epochDatabase: value.epochDatabase,
      })
      const status = await service.getStatus('deepseek')
      await expect(service.withCredentialScopeBindingAuthority({
        providerKey: 'deepseek', expectedRevision: status.revision,
        expectedCredentialScopeId: status.credentialScopeId!,
        consume: async (authority) => {
          authority.assertCurrent()
          await expect(service.getStatus('anthropic'))
            .rejects.toThrow('EPOCH2_RUNTIME_CREDENTIAL_REENTRANT')
          await expect(service.close()).rejects.toThrow('EPOCH2_RUNTIME_CREDENTIAL_REENTRANT')
          value.store.set('providerCredentials.v1.deepseek', storedRecord('deepseek', 'sk-external', 99))
          expect(() => authority.assertCurrent()).toThrow('EPOCH2_RUNTIME_CREDENTIAL_DRIFT')
        },
      })).resolves.toBeUndefined()
    } finally { value.lease.release() }
  })

  windowsIt('rejects stale or mismatched scope-authority requests before issuing authority', async () => {
    const value = await fixture('starverse-runtime-credential-scope-authority-stale', {
      deepseek: storedRecord('deepseek', 'sk-private'),
    })
    try {
      const service = await createEpoch2RuntimeCredentialService({
        store: value.store as never,
        epochDatabase: value.epochDatabase,
      })
      const status = await service.getStatus('deepseek')
      await expect(service.withCredentialScopeBindingAuthority({
        providerKey: 'deepseek', expectedRevision: 2,
        expectedCredentialScopeId: status.credentialScopeId!, consume: () => undefined,
      })).rejects.toThrow('EPOCH2_RUNTIME_CREDENTIAL_STALE_REVISION')
      await expect(service.withCredentialScopeBindingAuthority({
        providerKey: 'deepseek', expectedRevision: 1,
        expectedCredentialScopeId: 'credential-scope-v2:'.concat('f'.repeat(64)) as never,
        consume: () => undefined,
      })).rejects.toThrow('EPOCH2_RUNTIME_CREDENTIAL_SCOPE_MISMATCH')
      let failedAuthority: Epoch2CredentialScopeBindingAuthority | undefined
      await expect(service.withCredentialScopeBindingAuthority({
        providerKey: 'deepseek', expectedRevision: 1,
        expectedCredentialScopeId: status.credentialScopeId!,
        consume: async (authority) => {
          failedAuthority = authority
          throw new Error('consumer_failed')
        },
      })).rejects.toThrow('consumer_failed')
      expect(isEpoch2CredentialScopeBindingAuthority(failedAuthority)).toBe(false)
      safeStorageMock.available = false
      await expect(service.withCredentialScopeBindingAuthority({
        providerKey: 'deepseek', expectedRevision: 1,
        expectedCredentialScopeId: status.credentialScopeId!, consume: () => undefined,
      })).rejects.toThrow('EPOCH2_RUNTIME_CREDENTIAL_STORAGE_UNAVAILABLE')
    } finally { value.lease.release() }
  })

  windowsIt('rejects same-provider authority re-entry instead of self-deadlocking', async () => {
    const value = await fixture('starverse-runtime-credential-reentry', {
      anthropic: storedRecord('anthropic', 'sk-old'),
    })
    try {
      const service = await createEpoch2RuntimeCredentialService({
        store: value.store as never,
        epochDatabase: value.epochDatabase,
      })
      const initial = await service.getStatus('anthropic')
      await expect(service.withCredential({
        providerKey: 'anthropic',
        expectedRevision: initial.revision,
        expectedCredentialScopeId: initial.credentialScopeId!,
        consume: () => service.clearCredential({
          providerKey: 'anthropic',
          expectedRevision: initial.revision,
        }),
      })).rejects.toThrow('EPOCH2_RUNTIME_CREDENTIAL_REENTRANT')
      await expect(service.getStatus('anthropic')).resolves.toMatchObject({
        configured: true,
        revision: initial.revision,
      })
    } finally { value.lease.release() }
  })

  windowsIt('deletes legacy records without decrypting and isolates unavailable async storage to credential use', async () => {
    const value = await fixture('starverse-runtime-credential-drift', {
      openai_responses: storedRecord('openai_responses', 'sk-openai'),
    })
    try {
      const service = await createEpoch2RuntimeCredentialService({
        store: value.store as never,
        epochDatabase: value.epochDatabase,
      })
      value.store.set('providerCredentials.v1.openai_responses', storedRecord('openai_responses', 'changed'))
      await expect(service.getStatus('openai_responses'))
        .rejects.toThrow('EPOCH2_RUNTIME_CREDENTIAL_DRIFT')
    } finally { value.lease.release() }

    const legacy = await fixture('starverse-runtime-credential-legacy', {
      google_ai_studio: legacyStoredRecord('google_ai_studio', 'sk-legacy'),
    })
    try {
      const service = await createEpoch2RuntimeCredentialService({
        store: legacy.store as never,
        epochDatabase: legacy.epochDatabase,
      })
      await expect(service.getStatus('google_ai_studio')).resolves.toMatchObject({ configured: false, revision: 0 })
      expect(legacy.store.get('providerCredentials.v1.google_ai_studio')).toBeUndefined()
      expect(safeStorageMock.decryptStringAsync).not.toHaveBeenCalled()
    } finally { legacy.lease.release() }

    const unavailable = await fixture('starverse-runtime-credential-unavailable', {
      deepseek: storedRecord('deepseek', 'sk-deepseek'),
    })
    safeStorageMock.available = false
    try {
      const service = await createEpoch2RuntimeCredentialService({
        store: unavailable.store as never,
        epochDatabase: unavailable.epochDatabase,
      })
      const status = await service.getStatus('deepseek')
      await expect(service.withCredential({
        providerKey: 'deepseek', expectedRevision: status.revision,
        expectedCredentialScopeId: status.credentialScopeId!, consume: () => undefined,
      })).rejects.toThrow('EPOCH2_RUNTIME_CREDENTIAL_STORAGE_UNAVAILABLE')
      await expect(service.getStatus('deepseek')).resolves.toMatchObject({
        configured: true,
        availability: 'unavailable',
        diagnosticCode: 'EPOCH2_RUNTIME_CREDENTIAL_STORAGE_UNAVAILABLE',
      })
    } finally { unavailable.lease.release() }
  })

  windowsIt('does not make credential replacement wait for an already issued provider lease', async () => {
    const value = await fixture('starverse-runtime-credential-concurrent-lease', {
      openrouter: storedRecord('openrouter', 'sk-original'),
    })
    try {
      const service = await createEpoch2RuntimeCredentialService({
        store: value.store as never,
        epochDatabase: value.epochDatabase,
      })
      const status = await service.getStatus('openrouter')
      const gate = deferred()
      const consumption = service.withCredential({
        providerKey: 'openrouter', expectedRevision: status.revision,
        expectedCredentialScopeId: status.credentialScopeId!,
        consume: async (lease) => { await gate.promise; return lease.credential },
      })
      await vi.waitFor(() => expect(safeStorageMock.decryptStringAsync).toHaveBeenCalled())
      await expect(service.updateCredential({
        providerKey: 'openrouter', expectedRevision: status.revision, credential: 'sk-replacement',
      })).resolves.toMatchObject({ revision: status.revision + 1 })
      gate.resolve()
      await expect(consumption).resolves.toBe('sk-original')
    } finally { value.lease.release() }
  })

  windowsIt('keeps session credentials main-side, restores persistent records after restart, and clears both layers', async () => {
    const value = await fixture('starverse-runtime-credential-session', {
      openrouter: storedRecord('openrouter', 'persisted-key'),
    })
    try {
      const service = await createEpoch2RuntimeCredentialService({ store: value.store as never, epochDatabase: value.epochDatabase })
      const persistent = await service.getStatus('openrouter')
      const session = await service.updateCredential({ providerKey: 'openrouter', credential: 'session-key',
        expectedRevision: persistent.revision, storageMode: 'session' })
      expect(session).toMatchObject({ storageBackend: 'session', sessionOverridesPersistent: true, revision: persistent.revision + 1 })
      expect(JSON.stringify(value.store.get('providerCredentials.v1.openrouter'))).not.toContain('session-key')
      await expect(service.withCredential({ providerKey: 'openrouter', expectedRevision: session.revision,
        expectedCredentialScopeId: session.credentialScopeId!, consume: (lease) => lease.credential })).resolves.toBe('session-key')
      await service.close()
      const restarted = await createEpoch2RuntimeCredentialService({ store: value.store as never, epochDatabase: value.epochDatabase })
      await expect(restarted.getStatus('openrouter')).resolves.toMatchObject({ storageBackend: 'electron_safe_storage', sessionOverridesPersistent: false, revision: persistent.revision })
      await restarted.close()

      const active = await createEpoch2RuntimeCredentialService({ store: value.store as never, epochDatabase: value.epochDatabase })
      const activePersistent = await active.getStatus('openrouter')
      const temporary = await active.updateCredential({ providerKey: 'openrouter', credential: 'clear-session',
        expectedRevision: activePersistent.revision, storageMode: 'session' })
      await expect(active.clearCredential({ providerKey: 'openrouter', expectedRevision: temporary.revision }))
        .resolves.toMatchObject({ configured: false, revision: temporary.revision + 1 })
      expect(value.store.get('providerCredentials.v1.openrouter')).toBeUndefined()
      await active.close()
    } finally { value.lease.release() }
  })

  windowsIt('persists plaintext only when explicitly selected and does not use safeStorage for its lease', async () => {
    const value = await fixture('starverse-runtime-credential-plaintext')
    try {
      const service = await createEpoch2RuntimeCredentialService({ store: value.store as never, epochDatabase: value.epochDatabase,
        platform: 'linux' })
      const status = await service.updateCredential({ providerKey: 'deepseek', credential: 'explicit-plaintext', expectedRevision: 0,
        storageMode: 'plaintext' })
      expect(status).toMatchObject({ storageBackend: 'plaintext', sessionOverridesPersistent: false })
      expect(value.store.get('providerCredentials.v1.deepseek')).toMatchObject({ version: 3, backend: 'plaintext', plaintext: 'explicit-plaintext' })
      safeStorageMock.decryptStringAsync.mockClear()
      await expect(service.withCredential({ providerKey: 'deepseek', expectedRevision: status.revision,
        expectedCredentialScopeId: status.credentialScopeId!, consume: (lease) => lease.credential })).resolves.toBe('explicit-plaintext')
      expect(safeStorageMock.decryptStringAsync).not.toHaveBeenCalled()
      await service.close()
    } finally { value.lease.release() }
  })

  windowsIt('fails closed for basic_text and unknown Linux backends before encrypting', async () => {
    const value = await fixture('starverse-runtime-credential-linux-backend')
    try {
      for (const backend of ['basic_text', 'unknown'] as const) {
        const service = await createEpoch2RuntimeCredentialService({ store: value.store as never, epochDatabase: value.epochDatabase,
          platform: 'linux' })
        safeStorageMock.backend = backend as never
        await expect(service.updateCredential({ providerKey: 'deepseek', credential: 'never-persist', expectedRevision: 0 }))
          .rejects.toMatchObject({ code: 'EPOCH2_RUNTIME_CREDENTIAL_SAFE_STORAGE_BACKEND_UNTRUSTED' })
        expect(value.store.get('providerCredentials.v1.deepseek')).toBeUndefined()
        await service.close()
      }
    } finally { value.lease.release() }
  })

  windowsIt('rejects explicit plaintext persistence outside Linux in the main authority', async () => {
    const value = await fixture('starverse-runtime-credential-non-linux-plaintext')
    try {
      const service = await createEpoch2RuntimeCredentialService({ store: value.store as never, epochDatabase: value.epochDatabase,
        platform: 'win32' })
      await expect(service.updateCredential({ providerKey: 'deepseek', credential: 'never-persist', expectedRevision: 0,
        storageMode: 'plaintext' })).rejects.toMatchObject({ code: 'EPOCH2_RUNTIME_CREDENTIAL_PLAINTEXT_UNSUPPORTED' })
      expect(value.store.get('providerCredentials.v1.deepseek')).toBeUndefined()
      await service.close()
    } finally { value.lease.release() }
  })

  windowsIt('fails closed when the Linux safeStorage backend query fails', async () => {
    const value = await fixture('starverse-runtime-credential-linux-backend-query')
    try {
      const service = await createEpoch2RuntimeCredentialService({ store: value.store as never, epochDatabase: value.epochDatabase,
        platform: 'linux' })
      safeStorageMock.getSelectedStorageBackend.mockImplementationOnce(() => { throw new Error('backend query failed') })
      await expect(service.updateCredential({ providerKey: 'deepseek', credential: 'never-persist', expectedRevision: 0 }))
        .rejects.toMatchObject({ code: 'EPOCH2_RUNTIME_CREDENTIAL_SAFE_STORAGE_BACKEND_UNTRUSTED' })
      expect(value.store.get('providerCredentials.v1.deepseek')).toBeUndefined()
      await service.close()
    } finally { value.lease.release() }
  })

  windowsIt('commits exactly one of one hundred concurrent writes from the same revision', async () => {
    const value = await fixture('starverse-runtime-credential-one-hundred-writers', {
      openrouter: storedRecord('openrouter', 'sk-original'),
    })
    try {
      const service = await createEpoch2RuntimeCredentialService({
        store: value.store as never,
        epochDatabase: value.epochDatabase,
      })
      const status = await service.getStatus('openrouter')
      const results = await Promise.allSettled(Array.from({ length: 100 }, (_value, index) =>
        service.updateCredential({
          providerKey: 'openrouter', expectedRevision: status.revision, credential: `sk-candidate-${index}`,
        }),
      ))
      const fulfilled = results.filter((result) => result.status === 'fulfilled')
      const rejected = results.filter((result) => result.status === 'rejected')
      expect(fulfilled).toHaveLength(1)
      expect(rejected).toHaveLength(99)
      for (const result of rejected) {
        expect(result.reason).toMatchObject({ code: 'EPOCH2_RUNTIME_CREDENTIAL_STALE_REVISION' })
      }
      await expect(service.getStatus('openrouter')).resolves.toMatchObject({ revision: status.revision + 1 })
    } finally { value.lease.release() }
  })

  windowsIt('does not overwrite an external credential change that races an async mutation', async () => {
    const value = await fixture('starverse-runtime-credential-racing-drift', {
      deepseek: storedRecord('deepseek', 'sk-original'),
    })
    try {
      const service = await createEpoch2RuntimeCredentialService({
        store: value.store as never,
        epochDatabase: value.epochDatabase,
      })
      const external = storedRecord('deepseek', 'sk-external', 99)
      safeStorageMock.encryptStringAsync.mockImplementationOnce(async (credential: string) => {
        value.store.set('providerCredentials.v1.deepseek', external)
        return Buffer.from(`enc:999:${credential}`, 'utf8')
      })

      await expect(service.updateCredential({
        providerKey: 'deepseek',
        credential: 'sk-requested',
        expectedRevision: 1,
      })).rejects.toThrow('EPOCH2_RUNTIME_CREDENTIAL_DRIFT')
      expect(value.store.get('providerCredentials.v1.deepseek')).toEqual(external)
    } finally { value.lease.release() }
  })

  windowsIt('rewraps provider ciphertext only during use without changing revision or scope', async () => {
    const value = await fixture('starverse-runtime-credential-rewrap', {
      openrouter: storedRecord('openrouter', 'sk-openrouter'),
    })
    safeStorageMock.rotateNext = true
    try {
      const service = await createEpoch2RuntimeCredentialService({
        store: value.store as never,
        epochDatabase: value.epochDatabase,
      })
      const status = await service.getStatus('openrouter')
      expect(status.revision).toBe(1)
      expect((value.store.get('providerCredentials.v1.openrouter') as { ciphertextBase64: string }).ciphertextBase64)
        .toBe(storedRecord('openrouter', 'sk-openrouter').ciphertextBase64)
      await expect(service.withCredential({
        providerKey: 'openrouter',
        expectedRevision: 1,
        expectedCredentialScopeId: status.credentialScopeId!,
        consume: (lease) => lease.credential,
      })).resolves.toBe('sk-openrouter')
      expect((value.store.get('providerCredentials.v1.openrouter') as { ciphertextBase64: string }).ciphertextBase64)
        .not.toBe(storedRecord('openrouter', 'sk-openrouter').ciphertextBase64)
    } finally { value.lease.release() }
  })

  it('is activated only through the epoch-2 main authority and never imported by renderer code', () => {
    const entry = fs.readFileSync(path.resolve('electron/epoch2MainEntry.ts'), 'utf8')
    const registration = fs.readFileSync(path.resolve('electron/ipc/generationV2IpcRegistration.ts'), 'utf8')
    const preload = fs.readFileSync(path.resolve('electron/preload.ts'), 'utf8')
    const renderer = fs.readFileSync(path.resolve('src/ui-app/app/appChatApp.logic.ts'), 'utf8')
    expect(entry).toContain('bootstrapEpoch2ApplicationRuntime')
    expect(registration).toContain('credentialService: input.epoch2.credentialService')
    expect(registration).toContain('registerGenerationV2CredentialSettingsIpc')
    expect(preload).not.toContain('epoch2RuntimeCredentialService')
    expect(renderer).not.toContain('epoch2RuntimeCredentialService')
    expect(renderer).not.toContain('withCredential(')
  })

  it('uses closed error envelopes without secret-bearing messages', () => {
    const error = new Epoch2RuntimeCredentialError('EPOCH2_RUNTIME_CREDENTIAL_INVALID')
    expect(error.message).toBe('EPOCH2_RUNTIME_CREDENTIAL_INVALID')
  })
})
