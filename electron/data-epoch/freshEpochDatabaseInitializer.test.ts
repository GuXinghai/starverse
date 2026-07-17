import fs from 'node:fs'
import os from 'node:os'
import path from 'node:path'
import BetterSqlite3 from 'better-sqlite3'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { applyGenerationV2SchemaForTest } from '../../infra/db/v2/testSchemaV2'
import { createEpoch2ResetJournal } from './resetJournal'
import { writeEpoch2ResetJournalAtomic } from './resetJournalStore'
import { createEpoch2RootManifest, resolveEpoch2WorkspaceLayout } from './rootManifest'
import { writeEpoch2TransitionOwnershipManifestAtomic } from './rootManifestStore'
import {
  acquireWin32EpochDatabaseFileAuthority,
  acquireWin32EpochRootLease,
  ensureEpoch2RootAuthority,
} from './win32EpochRootLease'

const safeStorageMock = vi.hoisted(() => ({
  available: true,
  appRoot: process.cwd(),
  cipherGeneration: 0,
  decryptMode: 'valid' as 'valid' | 'invalid' | 'rotate' | 'throw',
  isAsyncEncryptionAvailable: vi.fn(async () => safeStorageMock.available),
  encryptStringAsync: vi.fn(async (value: string) => {
    safeStorageMock.cipherGeneration += 1
    return Buffer.from(`scope-key:${safeStorageMock.cipherGeneration}:${value}`, 'utf8')
  }),
  decryptStringAsync: vi.fn(async (value: Buffer) => {
    if (safeStorageMock.decryptMode === 'throw') throw new Error('test decrypt failure')
    if (safeStorageMock.decryptMode === 'invalid') {
      return { shouldReEncrypt: false, result: 'invalid' }
    }
    const text = value.toString('utf8')
    const match = /^scope-key:\d+:(.*)$/u.exec(text)
    const shouldReEncrypt = safeStorageMock.decryptMode === 'rotate'
    if (shouldReEncrypt) safeStorageMock.decryptMode = 'valid'
    return {
      shouldReEncrypt,
      result: match?.[1] ?? 'invalid',
    }
  }),
}))

vi.mock('electron', () => ({
  app: { getAppPath: () => safeStorageMock.appRoot },
  safeStorage: safeStorageMock,
}))

import {
  initializeOrVerifyFreshEpoch2Database,
  verifyExistingFreshEpoch2Database,
} from './freshEpochDatabaseInitializer'

const windowsIt = process.platform === 'win32' ? it : it.skip
const roots: string[] = []
const repositoryRoot = path.resolve(process.cwd())

function fixture(name: string) {
  const appDataRoot = fs.mkdtempSync(path.join(os.tmpdir(), `${name}-`))
  roots.push(appDataRoot)
  const layout = resolveEpoch2WorkspaceLayout({
    appDataRoot,
    homeRoot: os.homedir(),
    repositoryRoot,
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
  return { layout, lease, rootAuthority }
}

function createBrokenSchemaRoot(): string {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'starverse-v2-broken-schema-'))
  roots.push(root)
  const target = path.join(root, 'infra', 'db', 'v2')
  fs.mkdirSync(target, { recursive: true })
  for (const file of [
    'coreConversationSchema.sql',
    'generationConfigSchema.sql',
    'attachmentAssetSchema.sql',
    'openRouterImagesSchema.sql',
    'deepSeekStableModelEvidenceSchema.sql',
  ]) fs.copyFileSync(path.join(repositoryRoot, 'infra', 'db', 'v2', file), path.join(target, file))
  fs.writeFileSync(path.join(target, 'generationExecutionSchema.sql'), [
    '-- Generation Compiler V2 failing fresh initializer fixture.',
    'CREATE TABLE IF NOT EXISTS transaction_partial_probe_v2 (id TEXT PRIMARY KEY);',
    'THIS IS NOT SQL;',
  ].join('\n'))
  return root
}

beforeEach(() => {
  safeStorageMock.available = true
  safeStorageMock.appRoot = repositoryRoot
  safeStorageMock.cipherGeneration = 0
  safeStorageMock.decryptMode = 'valid'
  safeStorageMock.isAsyncEncryptionAvailable.mockClear()
  safeStorageMock.encryptStringAsync.mockClear()
  safeStorageMock.decryptStringAsync.mockClear()
})

afterEach(() => {
  for (const root of roots.splice(0)) fs.rmSync(root, { recursive: true, force: true })
})

describe('fresh epoch-2 database initializer', () => {
  windowsIt('verify-existing rejects a missing database without creating a file', async () => {
    const value = fixture('starverse-fresh-db-verify-missing')
    try {
      expect(fs.existsSync(value.layout.databasePath)).toBe(false)
      await expect(verifyExistingFreshEpoch2Database(value)).rejects.toThrow()
      expect(fs.existsSync(value.layout.databasePath)).toBe(false)
    } finally { value.lease.release() }
  })

  windowsIt('atomically initializes one complete identity and verifies the same database on reopen', async () => {
    const value = fixture('starverse-fresh-db-success')
    try {
      const created = await initializeOrVerifyFreshEpoch2Database(value)
      expect(created).toMatchObject({
        classification: 'epoch_2_database_initialized',
        executionAuthority: 'none',
        created: true,
        schemaVersion: 1,
      })
      expect(created.databaseFileId).toMatch(/^[0-9a-f]{32}$/u)
      expect(created.schemaDigest).toMatch(/^[0-9a-f]{64}$/u)
      expect(created.objectProjectionDigest).toMatch(/^[0-9a-f]{64}$/u)
      expect(safeStorageMock.encryptStringAsync).toHaveBeenCalledTimes(1)
      expect(safeStorageMock.decryptStringAsync).toHaveBeenCalledTimes(1)

      const reopened = await initializeOrVerifyFreshEpoch2Database(value)
      expect(reopened).toEqual({ ...created, created: false })
      expect(safeStorageMock.encryptStringAsync).toHaveBeenCalledTimes(1)
      expect(safeStorageMock.decryptStringAsync).toHaveBeenCalledTimes(2)

      const db = new BetterSqlite3(value.layout.databasePath, { readonly: true })
      try {
        expect(db.prepare('SELECT data_epoch, application_id, root_id, schema_digest FROM app_meta_v2').get())
          .toEqual({
            data_epoch: 2,
            application_id: 'io.github.guxinghai.starverse',
            root_id: created.rootId,
            schema_digest: created.schemaDigest,
          })
        expect(db.prepare('SELECT backend, key_version, typeof(ciphertext) AS storage_type FROM epoch_scope_key_envelope_v2').get())
          .toEqual({ backend: 'electron_safe_storage', key_version: 1, storage_type: 'blob' })
      } finally { db.close() }
    } finally { value.lease.release() }
  })

  windowsIt('fails before database creation when async safeStorage is unavailable', async () => {
    const value = fixture('starverse-fresh-db-storage-unavailable')
    safeStorageMock.available = false
    try {
      await expect(initializeOrVerifyFreshEpoch2Database(value))
        .rejects.toThrow('EPOCH2_SCOPE_KEY_STORAGE_UNAVAILABLE')
      expect(fs.existsSync(value.layout.databasePath)).toBe(false)
      expect(safeStorageMock.encryptStringAsync).not.toHaveBeenCalled()
    } finally { value.lease.release() }
  })

  windowsIt('rolls back all logical state and later recovers regardless of the physical main-file size', async () => {
    const value = fixture('starverse-fresh-db-rollback')
    const brokenRoot = createBrokenSchemaRoot()
    try {
      safeStorageMock.appRoot = brokenRoot
      await expect(initializeOrVerifyFreshEpoch2Database(value))
        .rejects.toThrow('EPOCH2_DATABASE_TRANSACTION_FAILED')
      expect(fs.statSync(value.layout.databasePath).size).toBeGreaterThanOrEqual(0)
      const afterFailure = new BetterSqlite3(value.layout.databasePath)
      try {
        expect(afterFailure.prepare(`SELECT count(*) AS count FROM sqlite_master
          WHERE name NOT LIKE 'sqlite_%'`).get()).toEqual({ count: 0 })
      } finally { afterFailure.close() }

      safeStorageMock.appRoot = repositoryRoot
      const recovered = await initializeOrVerifyFreshEpoch2Database(value)
      expect(recovered.created).toBe(true)
    } finally { value.lease.release() }
  })

  windowsIt('rejects schema-only state without patching missing identity rows', async () => {
    const value = fixture('starverse-fresh-db-schema-only')
    const authority = acquireWin32EpochDatabaseFileAuthority({ ...value, mode: 'create_or_open' })
    try {
      const db = new BetterSqlite3(value.layout.databasePath)
      try { applyGenerationV2SchemaForTest(db, repositoryRoot) } finally { db.close() }
    } finally { authority.release() }

    try {
      await expect(initializeOrVerifyFreshEpoch2Database(value))
        .rejects.toThrow('EPOCH2_DATABASE_STATE_INVALID')
      const db = new BetterSqlite3(value.layout.databasePath, { readonly: true })
      try {
        expect(db.prepare('SELECT count(*) AS count FROM app_meta_v2').get()).toEqual({ count: 0 })
        expect(db.prepare('SELECT count(*) AS count FROM epoch_scope_key_envelope_v2').get())
          .toEqual({ count: 0 })
      } finally { db.close() }
      expect(safeStorageMock.encryptStringAsync).not.toHaveBeenCalled()
    } finally { value.lease.release() }
  })

  windowsIt('atomically rewraps a valid key when safeStorage requests rotation', async () => {
    const value = fixture('starverse-fresh-db-rewrap')
    try {
      await initializeOrVerifyFreshEpoch2Database(value)
      const before = new BetterSqlite3(value.layout.databasePath, { readonly: true })
      const original = before.prepare(`SELECT envelope_revision, hex(ciphertext) AS ciphertext
        FROM epoch_scope_key_envelope_v2`).get() as { envelope_revision: number; ciphertext: string }
      before.close()
      safeStorageMock.decryptMode = 'rotate'
      const reopened = await initializeOrVerifyFreshEpoch2Database(value)
      expect(reopened.created).toBe(false)
      const after = new BetterSqlite3(value.layout.databasePath, { readonly: true })
      try {
        const current = after.prepare(`SELECT envelope_revision, hex(ciphertext) AS ciphertext
          FROM epoch_scope_key_envelope_v2`).get() as { envelope_revision: number; ciphertext: string }
        expect(current.envelope_revision).toBe(original.envelope_revision + 1)
        expect(current.ciphertext).not.toBe(original.ciphertext)
      } finally { after.close() }
    } finally { value.lease.release() }
  })

  windowsIt('keeps a complete database fail-closed when decrypted key material is invalid', async () => {
    const value = fixture('starverse-fresh-db-decrypt-invalid')
    try {
      await initializeOrVerifyFreshEpoch2Database(value)
      for (const mode of ['invalid', 'throw'] as const) {
        safeStorageMock.decryptMode = mode
        await expect(initializeOrVerifyFreshEpoch2Database(value))
          .rejects.toThrow('EPOCH2_SCOPE_KEY_DECRYPT_FAILED')
      }
      const db = new BetterSqlite3(value.layout.databasePath, { readonly: true })
      try {
        expect(db.prepare('SELECT count(*) AS count FROM app_meta_v2').get()).toEqual({ count: 1 })
        expect(db.prepare('SELECT count(*) AS count FROM epoch_scope_key_envelope_v2').get())
          .toEqual({ count: 1 })
      } finally { db.close() }
    } finally { value.lease.release() }
  })

  windowsIt.each([
    ['table', 'CREATE TABLE unexpected_epoch2_object (id TEXT)'],
    ['trigger', `CREATE TRIGGER unexpected_epoch2_trigger AFTER INSERT ON app_meta_v2
      BEGIN SELECT 1; END`],
  ])('rejects an otherwise complete database containing an extra %s', async (_kind, sql) => {
    const value = fixture('starverse-fresh-db-extra-object')
    try {
      await initializeOrVerifyFreshEpoch2Database(value)
      const db = new BetterSqlite3(value.layout.databasePath)
      try { db.exec(sql) } finally { db.close() }
      await expect(initializeOrVerifyFreshEpoch2Database(value))
        .rejects.toThrow('EPOCH2_DATABASE_TRANSACTION_FAILED')
    } finally { value.lease.release() }
  })
})
