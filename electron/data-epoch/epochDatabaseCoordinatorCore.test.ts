import fs from 'node:fs'
import os from 'node:os'
import path from 'node:path'
import BetterSqlite3 from 'better-sqlite3'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

const safeStorageMock = vi.hoisted(() => ({
  available: true,
  generation: 0,
  isAsyncEncryptionAvailable: vi.fn(async () => safeStorageMock.available),
  encryptStringAsync: vi.fn(async (value: string) => {
    safeStorageMock.generation += 1
    return Buffer.from(`scope-key:${safeStorageMock.generation}:${value}`, 'utf8')
  }),
  decryptStringAsync: vi.fn(async (value: Buffer) => {
    const match = /^scope-key:\d+:(.*)$/u.exec(value.toString('utf8'))
    return { shouldReEncrypt: false, result: match?.[1] ?? 'invalid' }
  }),
}))

const journalWriteMock = vi.hoisted(() => ({
  databaseCreatedFailure: 'none' as 'none' | 'before_write' | 'after_write',
}))

vi.mock('electron', () => ({
  app: { getAppPath: () => process.cwd(), isPackaged: false },
  safeStorage: safeStorageMock,
}))

vi.mock('./resetJournalStore', async (importOriginal) => {
  const actual = await importOriginal<typeof import('./resetJournalStore')>()
  return {
    ...actual,
    writeEpoch2ResetJournalAtomic: (input: Parameters<typeof actual.writeEpoch2ResetJournalAtomic>[0]) => {
      if (input.journal.phase === 'database_created' &&
          journalWriteMock.databaseCreatedFailure === 'before_write') {
        journalWriteMock.databaseCreatedFailure = 'none'
        throw new Error('TEST_DATABASE_PHASE_WRITE_FAILED')
      }
      const result = actual.writeEpoch2ResetJournalAtomic(input)
      if (input.journal.phase === 'database_created' &&
          journalWriteMock.databaseCreatedFailure === 'after_write') {
        journalWriteMock.databaseCreatedFailure = 'none'
        throw new Error('TEST_DATABASE_PHASE_WRITE_AMBIGUOUS')
      }
      return result
    },
  }
})

import { ensureEpoch2DatabaseCreated } from './epochDatabaseCoordinatorCore'
import { initializeOrVerifyFreshEpoch2Database } from './freshEpochDatabaseInitializer'
import { ensureEpoch2RootCreated } from './epochRootCoordinatorCore'
import {
  advanceEpoch2ResetJournal,
  createEpoch2ResetJournal,
  type Epoch2ResetPhase,
} from './resetJournal'
import {
  readEpoch2ResetJournal,
  writeEpoch2ResetJournalAtomic,
} from './resetJournalStore'
import { createEpoch2RootManifest, resolveEpoch2WorkspaceLayout } from './rootManifest'
import { writeEpoch2TransitionOwnershipManifestAtomic } from './rootManifestStore'
import { acquireWin32EpochRootLease } from './win32EpochRootLease'

const windowsIt = process.platform === 'win32' ? it : it.skip
const roots: string[] = []

function fixture(name: string, targetPhase: Epoch2ResetPhase = 'config_replaced') {
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
  let journal = createEpoch2ResetJournal({
    layout,
    operationId: '123e4567-e89b-42d3-a456-426614174000',
  })
  writeEpoch2ResetJournalAtomic({ layout, lease, journal })
  const phaseOrder: Epoch2ResetPhase[] = [
    'prepared', 'legacy_files_deleted', 'config_replaced',
  ]
  const targetIndex = phaseOrder.indexOf(targetPhase)
  if (targetIndex < 0) throw new Error('TEST_PHASE_UNSUPPORTED')
  for (const phase of phaseOrder.slice(1, targetIndex + 1)) {
    journal = advanceEpoch2ResetJournal(journal, phase)
    writeEpoch2ResetJournalAtomic({ layout, lease, journal })
  }
  return { layout, lease }
}

beforeEach(() => {
  safeStorageMock.available = true
  safeStorageMock.generation = 0
  safeStorageMock.isAsyncEncryptionAvailable.mockClear()
  safeStorageMock.encryptStringAsync.mockClear()
  safeStorageMock.decryptStringAsync.mockClear()
  journalWriteMock.databaseCreatedFailure = 'none'
})

afterEach(() => {
  for (const root of roots.splice(0)) fs.rmSync(root, { recursive: true, force: true })
})

describe('epoch-2 database phase coordinator', () => {
  windowsIt('creates and verifies the database before advancing, then replays verify-only', async () => {
    const value = fixture('starverse-epoch-database-create')
    try {
      const created = await ensureEpoch2DatabaseCreated(value)
      expect(created.journal.phase).toBe('database_created')
      expect(created.database.created).toBe(true)
      expect(fs.existsSync(value.layout.databasePath)).toBe(true)

      const replay = await ensureEpoch2DatabaseCreated(value)
      expect(replay.journal.phase).toBe('database_created')
      expect(replay.database.created).toBe(false)
      expect(replay.database.databaseFileId).toBe(created.database.databaseFileId)
    } finally { value.lease.release() }
  })

  windowsIt('recovers a complete database whose journal remained at epoch_root_created', async () => {
    const value = fixture('starverse-epoch-database-journal-lag')
    try {
      const root = ensureEpoch2RootCreated(value)
      const initialized = await initializeOrVerifyFreshEpoch2Database({
        ...value,
        rootAuthority: root.rootAuthority,
      })
      expect(initialized.created).toBe(true)
      expect(readEpoch2ResetJournal(value)?.phase).toBe('epoch_root_created')

      const recovered = await ensureEpoch2DatabaseCreated(value)
      expect(recovered.database.created).toBe(false)
      expect(recovered.database.databaseFileId).toBe(initialized.databaseFileId)
      expect(recovered.journal.phase).toBe('database_created')
    } finally { value.lease.release() }
  })

  windowsIt('keeps the journal behind on initialization or journal-write failure and recovers', async () => {
    const unavailable = fixture('starverse-epoch-database-unavailable')
    safeStorageMock.available = false
    try {
      await expect(ensureEpoch2DatabaseCreated(unavailable))
        .rejects.toThrow('EPOCH2_SCOPE_KEY_STORAGE_UNAVAILABLE')
      expect(readEpoch2ResetJournal(unavailable)?.phase).toBe('epoch_root_created')
      expect(fs.existsSync(unavailable.layout.databasePath)).toBe(false)
    } finally { unavailable.lease.release() }

    safeStorageMock.available = true
    const journalFailure = fixture('starverse-epoch-database-journal-write')
    journalWriteMock.databaseCreatedFailure = 'before_write'
    try {
      await expect(ensureEpoch2DatabaseCreated(journalFailure))
        .rejects.toThrow('TEST_DATABASE_PHASE_WRITE_FAILED')
      expect(readEpoch2ResetJournal(journalFailure)?.phase).toBe('epoch_root_created')
      expect(fs.existsSync(journalFailure.layout.databasePath)).toBe(true)
      const recovered = await ensureEpoch2DatabaseCreated(journalFailure)
      expect(recovered.database.created).toBe(false)
      expect(recovered.journal.phase).toBe('database_created')
    } finally { journalFailure.lease.release() }
  })

  windowsIt('never recreates a missing database after database_created', async () => {
    const value = fixture('starverse-epoch-database-missing-after-phase')
    try {
      await ensureEpoch2DatabaseCreated(value)
      fs.rmSync(value.layout.databasePath)
      await expect(ensureEpoch2DatabaseCreated(value)).rejects.toThrow()
      expect(readEpoch2ResetJournal(value)?.phase).toBe('database_created')
      expect(fs.existsSync(value.layout.databasePath)).toBe(false)
    } finally { value.lease.release() }
  })

  windowsIt('does not repair a corrupt database after database_created', async () => {
    const value = fixture('starverse-epoch-database-corrupt-after-phase')
    try {
      await ensureEpoch2DatabaseCreated(value)
      const db = new BetterSqlite3(value.layout.databasePath)
      try {
        db.exec('CREATE TABLE unexpected_after_database_created (id TEXT PRIMARY KEY)')
      } finally { db.close() }
      await expect(ensureEpoch2DatabaseCreated(value)).rejects.toThrow()
      expect(readEpoch2ResetJournal(value)?.phase).toBe('database_created')
      const check = new BetterSqlite3(value.layout.databasePath, { readonly: true })
      try {
        expect(check.prepare(`SELECT name FROM sqlite_master
          WHERE type = 'table' AND name = 'unexpected_after_database_created'`).get()).toBeTruthy()
      } finally { check.close() }
    } finally { value.lease.release() }
  })

  windowsIt('recovers when the database_created journal write landed before reporting failure', async () => {
    const value = fixture('starverse-epoch-database-ambiguous-journal-write')
    journalWriteMock.databaseCreatedFailure = 'after_write'
    try {
      await expect(ensureEpoch2DatabaseCreated(value))
        .rejects.toThrow('TEST_DATABASE_PHASE_WRITE_AMBIGUOUS')
      expect(readEpoch2ResetJournal(value)?.phase).toBe('database_created')
      const recovered = await ensureEpoch2DatabaseCreated(value)
      expect(recovered.journal.phase).toBe('database_created')
      expect(recovered.database.created).toBe(false)
    } finally { value.lease.release() }
  })

  windowsIt('replays committed only through verify-existing', async () => {
    const value = fixture('starverse-epoch-database-committed-replay')
    try {
      const created = await ensureEpoch2DatabaseCreated(value)
      const committed = advanceEpoch2ResetJournal(created.journal, 'committed')
      writeEpoch2ResetJournalAtomic({ ...value, journal: committed })
      const replay = await ensureEpoch2DatabaseCreated(value)
      expect(replay.journal.phase).toBe('committed')
      expect(replay.database.created).toBe(false)
      expect(replay.database.databaseFileId).toBe(created.database.databaseFileId)
    } finally { value.lease.release() }
  })

  windowsIt('rejects phases before config replacement without creating root or database', async () => {
    const value = fixture('starverse-epoch-database-early-phase', 'prepared')
    try {
      await expect(ensureEpoch2DatabaseCreated(value))
        .rejects.toThrow('EPOCH2_ROOT_COORDINATOR_PHASE_INVALID')
      expect(readEpoch2ResetJournal(value)?.phase).toBe('prepared')
      expect(fs.existsSync(value.layout.epochRoot)).toBe(false)
      expect(fs.existsSync(value.layout.databasePath)).toBe(false)
    } finally { value.lease.release() }
  })
})
