import fs from 'node:fs'
import os from 'node:os'
import path from 'node:path'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

const safeStorageMock = vi.hoisted(() => ({
  available: true,
  generation: 0,
  isAsyncEncryptionAvailable: vi.fn(async () => safeStorageMock.available),
  encryptStringAsync: vi.fn(async (value: string) => {
    safeStorageMock.generation += 1
    return Buffer.from(`enc:${safeStorageMock.generation}:${value}`, 'utf8')
  }),
  decryptStringAsync: vi.fn(async (ciphertext: Buffer) => {
    const match = /^enc:\d+:(.*)$/u.exec(ciphertext.toString('utf8'))
    if (!match) throw new Error('invalid ciphertext')
    return { shouldReEncrypt: false, result: match[1] }
  }),
}))

vi.mock('electron', () => ({
  app: { getAppPath: () => process.cwd(), isPackaged: false },
  safeStorage: safeStorageMock,
}))

import { bootstrapEpoch2ToCommitted } from './epoch2CommittedBootstrap'
import { readEpoch2ResetJournal } from './resetJournalStore'
import { resolveEpoch2WorkspaceLayout } from './rootManifest'
import { acquireEpochRootLease, acquireWin32EpochRootLease } from './win32EpochRootLease'

const windowsIt = process.platform === 'win32' ? it : it.skip
const roots: string[] = []

class JsonConfigStore {
  readonly path: string
  constructor(private readonly file: string) { this.path = file }
  private read(): Record<string, unknown> { return JSON.parse(fs.readFileSync(this.file, 'utf8')) }
  get(key: string): unknown {
    return key.split('.').reduce<unknown>((value, part) =>
      value && typeof value === 'object' ? (value as Record<string, unknown>)[part] : undefined, this.read())
  }
  set(): never { throw new Error('TEST_STORE_MUTATION_UNEXPECTED') }
  delete(): never { throw new Error('TEST_STORE_MUTATION_UNEXPECTED') }
}

function fixture(name: string, credential = 'sk-openrouter') {
  const appDataRoot = fs.mkdtempSync(path.join(os.tmpdir(), `${name}-`))
  roots.push(appDataRoot)
  const layout = resolveEpoch2WorkspaceLayout({
    appDataRoot,
    homeRoot: os.homedir(),
    repositoryRoot: process.cwd(),
  })
  fs.mkdirSync(layout.productRoot, { recursive: true })
  fs.writeFileSync(path.join(layout.productRoot, 'chat.db'), 'legacy')
  fs.writeFileSync(path.join(layout.productRoot, 'config.json'), JSON.stringify({
    language: 'zh-CN',
    providerCredentials: { v1: { openrouter: {
      version: 3,
      providerKey: 'openrouter',
      backend: 'electron_safe_storage',
      ciphertextBase64: Buffer.from(`enc:100:${credential}`, 'utf8').toString('base64'),
      credentialScopeId: `credential-scope-v2:${'a'.repeat(64)}`,
      revision: 1,
      updatedAtMs: 1,
    } } },
  }))
  return layout
}

beforeEach(() => {
  safeStorageMock.available = true
  safeStorageMock.generation = 0
  safeStorageMock.isAsyncEncryptionAvailable.mockClear()
  safeStorageMock.decryptStringAsync.mockClear()
})
afterEach(() => {
  for (const root of roots.splice(0)) fs.rmSync(root, { recursive: true, force: true })
})

describe('epoch-2 committed bootstrap facade', () => {
  it('boots the committed runtime through the POSIX authority when the platform is Linux', async () => {
    const layout = fixture('starverse-epoch-committed-posix')
    const runtime = await bootstrapEpoch2ToCommitted({
      layout,
      platform: 'linux',
      enforceCredentialStoragePermissions: vi.fn(),
      clearDefaultSessionData: async () => {},
      openCredentialStore: () => new JsonConfigStore(path.join(layout.productRoot, 'config.json')) as never,
    })
    try {
      expect(runtime.journal.phase).toBe('committed')
      expect(runtime.database.open).toBe(true)
      expect(() => runtime.assertCurrent()).not.toThrow()
      expect(() => acquireEpochRootLease(layout, 'linux')).toThrow('EPOCH2_POSIX_LEASE_BUSY')
    } finally { await runtime.close() }
    const reopened = acquireEpochRootLease(layout, 'linux')
    reopened.release()
  })

  windowsIt('commits the complete reset/database/credential runtime and holds the lease', async () => {
    const layout = fixture('starverse-epoch-committed-bootstrap')
    const clearDefaultSessionData = vi.fn(async () => {})
    const runtime = await bootstrapEpoch2ToCommitted({
      layout,
      clearDefaultSessionData,
      openCredentialStore: () => new JsonConfigStore(path.join(layout.productRoot, 'config.json')) as never,
    })
    try {
      expect(runtime.journal.phase).toBe('committed')
      expect(clearDefaultSessionData).toHaveBeenCalledTimes(1)
      expect(fs.existsSync(path.join(layout.productRoot, 'chat.db'))).toBe(false)
      expect(fs.existsSync(layout.databasePath)).toBe(true)
      expect(runtime.database.open).toBe(true)
      expect(runtime.database.prepare('SELECT data_epoch FROM app_meta_v2').get()).toEqual({ data_epoch: 2 })
      expect(() => runtime.assertCurrent()).not.toThrow()
      await expect(runtime.credentialService.getStatus('openrouter')).resolves.toMatchObject({ configured: true })
      expect(() => acquireWin32EpochRootLease(layout)).toThrow('EPOCH2_WIN32_LOCK_OPEN_FAILED')
    } finally { await runtime.close() }
    await expect(runtime.credentialService.getStatus('openrouter'))
      .rejects.toThrow('EPOCH2_RUNTIME_CREDENTIAL_NOT_INITIALIZED')
    await expect(runtime.openAICompatibleCredentialService.getStatus(
      'ocp_provider_12345678', 'ocp_credential_12345678',
    )).rejects.toThrow('GENERATION_V2_OPENAI_COMPATIBLE_CREDENTIAL_NOT_INITIALIZED')
    expect(runtime.database.open).toBe(false)
    expect(() => runtime.assertCurrent()).toThrow('EPOCH2_BOOTSTRAP_RUNTIME_CLOSED')
    const reopenedLease = acquireWin32EpochRootLease(layout)
    reopenedLease.release()
  })

  windowsIt('boots with a valid v3 credential while safeStorage is unavailable and does not decrypt it', async () => {
    const layout = fixture('starverse-epoch-committed-bootstrap-safe-storage-unavailable')
    safeStorageMock.available = false
    const runtime = await bootstrapEpoch2ToCommitted({
      layout,
      clearDefaultSessionData: async () => {},
      openCredentialStore: () => new JsonConfigStore(path.join(layout.productRoot, 'config.json')) as never,
    })
    try {
      await expect(runtime.credentialService.getStatus('openrouter')).resolves.toMatchObject({
        configured: true,
        availability: 'unknown',
      })
      expect(safeStorageMock.isAsyncEncryptionAvailable).not.toHaveBeenCalled()
      expect(safeStorageMock.decryptStringAsync).not.toHaveBeenCalled()
    } finally { await runtime.close() }
  })

  windowsIt('restarts committed through verify-only without repeating session clearing', async () => {
    const layout = fixture('starverse-epoch-committed-restart')
    const first = await bootstrapEpoch2ToCommitted({
      layout,
      clearDefaultSessionData: async () => {},
      openCredentialStore: () => new JsonConfigStore(path.join(layout.productRoot, 'config.json')) as never,
    })
    const databaseId = first.journal.operationId
    await first.close()
    const clearDefaultSessionData = vi.fn(async () => {})
    const second = await bootstrapEpoch2ToCommitted({
      layout,
      clearDefaultSessionData,
      openCredentialStore: () => new JsonConfigStore(path.join(layout.productRoot, 'config.json')) as never,
    })
    try {
      expect(second.journal.operationId).toBe(databaseId)
      expect(second.journal.phase).toBe('committed')
      expect(clearDefaultSessionData).not.toHaveBeenCalled()
    } finally { await second.close() }
  })

  windowsIt('commits reset and isolates an undecryptable v3 credential to its provider operation', async () => {
    const layout = fixture('starverse-epoch-committed-invalid-credential')
    const config = JSON.parse(fs.readFileSync(path.join(layout.productRoot, 'config.json'), 'utf8'))
    config.providerCredentials.v1.openrouter.ciphertextBase64 = Buffer.from('invalid').toString('base64')
    fs.writeFileSync(path.join(layout.productRoot, 'config.json'), JSON.stringify(config))
    const runtime = await bootstrapEpoch2ToCommitted({
      layout,
      clearDefaultSessionData: async () => {},
      openCredentialStore: () => new JsonConfigStore(path.join(layout.productRoot, 'config.json')) as never,
    })
    try {
      const status = await runtime.credentialService.getStatus('openrouter')
      expect(status).toMatchObject({ configured: true, availability: 'unknown' })
      await expect(runtime.credentialService.withCredential({
        providerKey: 'openrouter', expectedRevision: status.revision,
        expectedCredentialScopeId: status.credentialScopeId!, consume: () => undefined,
      })).rejects.toThrow('EPOCH2_RUNTIME_CREDENTIAL_DECRYPT_FAILED')
      await expect(runtime.credentialService.getStatus('openrouter')).resolves.toMatchObject({
        configured: true,
        availability: 'unavailable',
        diagnosticCode: 'EPOCH2_RUNTIME_CREDENTIAL_DECRYPT_FAILED',
      })
    } finally { await runtime.close() }
    expect(fs.existsSync(path.join(layout.productRoot, 'chat.db'))).toBe(false)
    const lease = acquireWin32EpochRootLease(layout)
    try { expect(readEpoch2ResetJournal({ layout, lease })?.phase).toBe('committed') } finally { lease.release() }
  })

  windowsIt('commits malformed v3 credentials for runtime diagnostics without calling safeStorage', async () => {
    const layout = fixture('starverse-epoch-committed-malformed-v3-credential')
    const config = JSON.parse(fs.readFileSync(path.join(layout.productRoot, 'config.json'), 'utf8'))
    config.providerCredentials.v1.openrouter.ciphertextBase64 = 'not base64'
    fs.writeFileSync(path.join(layout.productRoot, 'config.json'), JSON.stringify(config))
    const runtime = await bootstrapEpoch2ToCommitted({
      layout,
      clearDefaultSessionData: async () => {},
      openCredentialStore: () => new JsonConfigStore(path.join(layout.productRoot, 'config.json')) as never,
    })
    try {
      await expect(runtime.credentialService.getStatus('openrouter')).resolves.toMatchObject({
        configured: true,
        availability: 'unavailable',
        diagnosticCode: 'EPOCH2_RUNTIME_CREDENTIAL_INVALID',
      })
      expect(safeStorageMock.isAsyncEncryptionAvailable).not.toHaveBeenCalled()
      expect(safeStorageMock.decryptStringAsync).not.toHaveBeenCalled()
      const persisted = JSON.parse(fs.readFileSync(path.join(layout.productRoot, 'config.json'), 'utf8'))
      expect(persisted.providerCredentials.v1.openrouter.ciphertextBase64).toBe('not base64')
    } finally { await runtime.close() }
  })
})
