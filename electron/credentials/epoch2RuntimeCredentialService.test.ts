import fs from 'node:fs'
import os from 'node:os'
import path from 'node:path'
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
  isAsyncEncryptionAvailable: vi.fn(async () => safeStorageMock.available),
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

function storedRecord(providerKey: ProviderCredentialKey, credential: string, updatedAtMs = 10) {
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
  safeStorageMock.isAsyncEncryptionAvailable.mockClear()
  safeStorageMock.encryptStringAsync.mockClear()
  safeStorageMock.decryptStringAsync.mockClear()
})

afterEach(() => {
  for (const root of roots.splice(0)) fs.rmSync(root, { recursive: true, force: true })
})

describe('epoch-2 runtime credential slot/revision authority', () => {
  windowsIt('loads only exact encrypted leaves and exposes scope/revision without the credential', async () => {
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
      const active = service.withCredential({
        providerKey: 'anthropic',
        expectedRevision: initial.revision,
        expectedCredentialScopeId: initial.credentialScopeId!,
        consume: async (lease) => {
          expect(lease.credential).toBe('sk-old')
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
      await expect(update).resolves.toMatchObject({ revision: 2 })
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

  windowsIt('fails closed on external record drift, plaintext records and unavailable async storage', async () => {
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

    const plaintext = await fixture('starverse-runtime-credential-plaintext', {
      google_ai_studio: {
        version: 1, providerKey: 'google_ai_studio', backend: 'plaintext_fallback',
        plaintext: 'forbidden', updatedAtMs: 1,
      },
    })
    try {
      await expect(createEpoch2RuntimeCredentialService({
        store: plaintext.store as never,
        epochDatabase: plaintext.epochDatabase,
      })).rejects.toThrow()
    } finally { plaintext.lease.release() }

    const unavailable = await fixture('starverse-runtime-credential-unavailable')
    safeStorageMock.available = false
    try {
      await expect(createEpoch2RuntimeCredentialService({
        store: unavailable.store as never,
        epochDatabase: unavailable.epochDatabase,
      })).rejects.toThrow('EPOCH2_RUNTIME_CREDENTIAL_STORAGE_UNAVAILABLE')
    } finally { unavailable.lease.release() }
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

  windowsIt('rewraps provider ciphertext without changing semantic revision or scope', async () => {
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
        .not.toBe(storedRecord('openrouter', 'sk-openrouter').ciphertextBase64)
      await expect(service.withCredential({
        providerKey: 'openrouter',
        expectedRevision: 1,
        expectedCredentialScopeId: status.credentialScopeId!,
        consume: (lease) => lease.credential,
      })).resolves.toBe('sk-openrouter')
    } finally { value.lease.release() }
  })

  it('remains outside current main, IPC and transport activation', () => {
    const production = [
      'electron/main.ts',
      'electron/ipc/registerIpc.ts',
      'electron/ipc/openRouterStreamBridge.ts',
    ].map((file) => fs.readFileSync(path.resolve(file), 'utf8')).join('\n')
    expect(production).not.toContain('epoch2RuntimeCredentialService')
  })

  it('uses closed error envelopes without secret-bearing messages', () => {
    const error = new Epoch2RuntimeCredentialError('EPOCH2_RUNTIME_CREDENTIAL_INVALID')
    expect(error.message).toBe('EPOCH2_RUNTIME_CREDENTIAL_INVALID')
  })
})
