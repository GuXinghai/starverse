import fs from 'node:fs'
import os from 'node:os'
import path from 'node:path'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

const safeStorageMock = vi.hoisted(() => ({
  generation: 0,
  isAsyncEncryptionAvailable: vi.fn(async () => true),
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
import { acquireWin32EpochRootLease } from './win32EpochRootLease'

const windowsIt = process.platform === 'win32' ? it : it.skip
const roots: string[] = []

class JsonConfigStore {
  constructor(private readonly file: string) {}
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
      version: 1,
      providerKey: 'openrouter',
      backend: 'electron_safe_storage',
      ciphertextBase64: Buffer.from(`enc:100:${credential}`, 'utf8').toString('base64'),
      updatedAtMs: 1,
    } } },
  }))
  return layout
}

beforeEach(() => { safeStorageMock.generation = 0 })
afterEach(() => {
  for (const root of roots.splice(0)) fs.rmSync(root, { recursive: true, force: true })
})

describe('epoch-2 committed bootstrap facade', () => {
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
    expect(runtime.database.open).toBe(false)
    expect(() => runtime.assertCurrent()).toThrow('EPOCH2_BOOTSTRAP_RUNTIME_CLOSED')
    const reopenedLease = acquireWin32EpochRootLease(layout)
    reopenedLease.release()
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

  windowsIt('releases the lease and preserves legacy data when credential preflight fails', async () => {
    const layout = fixture('starverse-epoch-committed-invalid-credential')
    const config = JSON.parse(fs.readFileSync(path.join(layout.productRoot, 'config.json'), 'utf8'))
    config.providerCredentials.v1.openrouter.ciphertextBase64 = Buffer.from('invalid').toString('base64')
    fs.writeFileSync(path.join(layout.productRoot, 'config.json'), JSON.stringify(config))
    await expect(bootstrapEpoch2ToCommitted({
      layout,
      clearDefaultSessionData: async () => {},
      openCredentialStore: () => new JsonConfigStore(path.join(layout.productRoot, 'config.json')) as never,
    })).rejects.toThrow('EPOCH2_CREDENTIAL_INVALID:openrouter')
    expect(fs.readFileSync(path.join(layout.productRoot, 'chat.db'), 'utf8')).toBe('legacy')
    const lease = acquireWin32EpochRootLease(layout)
    try { expect(readEpoch2ResetJournal({ layout, lease })?.phase).toBe('prepared') } finally { lease.release() }
  })
})
