import fs from 'node:fs'
import os from 'node:os'
import path from 'node:path'
import { afterEach, describe, expect, it, vi } from 'vitest'
import {
  initializeOrVerifyFreshEpoch2Database,
} from './freshEpochDatabaseInitializer'
import {
  advanceEpoch2ResetJournal,
  createEpoch2ResetJournal,
  EPOCH2_RESET_PHASES,
  type Epoch2ResetJournal,
  type Epoch2ResetPhase,
} from './resetJournal'
import {
  readEpoch2ResetJournal,
  writeEpoch2ResetJournalAtomic,
  writeEpoch2ResetJournalRecoveryAtomic,
} from './resetJournalStore'
import { createEpoch2RootManifest, resolveEpoch2WorkspaceLayout } from './rootManifest'
import { writeEpoch2TransitionOwnershipManifestAtomic } from './rootManifestStore'
import {
  acquireWin32EpochRootLease,
  ensureEpoch2RootAuthority,
} from './win32EpochRootLease'
import {
  EPOCH2_RECOVERY_BACKUP_ROOT,
  recoverEpoch2DatabaseSchemaMismatch,
} from './schemaMismatchRecovery'
import { ensureEpoch2DatabaseCreated } from './epochDatabaseCoordinatorCore'

const safeStorageMock = vi.hoisted(() => ({
  available: true,
  appRoot: process.cwd(),
  isAsyncEncryptionAvailable: vi.fn(async () => safeStorageMock.available),
  encryptStringAsync: vi.fn(async (value: string) => Buffer.from(`scope-key:1:${value}`, 'utf8')),
  decryptStringAsync: vi.fn(async (value: Buffer) => {
    const text = value.toString('utf8')
    const match = /^scope-key:\d+:(.*)$/u.exec(text)
    return { shouldReEncrypt: false, result: match?.[1] ?? 'invalid' }
  }),
}))

vi.mock('electron', () => ({
  app: { isPackaged: true, getAppPath: () => safeStorageMock.appRoot },
  safeStorage: safeStorageMock,
}))

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
  const journal = createEpoch2ResetJournal({
    layout,
    operationId: '123e4567-e89b-42d3-a456-426614174000',
  })
  writeEpoch2ResetJournalAtomic({ layout, lease, journal })
  const rootAuthority = ensureEpoch2RootAuthority({ layout, lease })
  return { layout, lease, rootAuthority, journal }
}

function advanceTo(journal: Epoch2ResetJournal, layout: ReturnType<typeof fixture>['layout'],
  lease: ReturnType<typeof fixture>['lease'], phase: Epoch2ResetPhase): Epoch2ResetJournal {
  let current = journal
  while (EPOCH2_RESET_PHASES.indexOf(current.phase) < EPOCH2_RESET_PHASES.indexOf(phase)) {
    const next = EPOCH2_RESET_PHASES[EPOCH2_RESET_PHASES.indexOf(current.phase) + 1]
    current = advanceEpoch2ResetJournal(current, next)
    writeEpoch2ResetJournalAtomic({ layout, lease, journal: current })
  }
  return current
}

afterEach(() => {
  for (const root of roots.splice(0)) fs.rmSync(root, { recursive: true, force: true })
})

describe('epoch-2 schema mismatch recovery', () => {
  windowsIt('backs up the database family and regresses the journal for a fresh recreate', async () => {
    const value = fixture('starverse-recovery-success')
    try {
      advanceTo(value.journal, value.layout, value.lease, 'committed')
      const created = await initializeOrVerifyFreshEpoch2Database({
        layout: value.layout,
        lease: value.lease,
        rootAuthority: value.rootAuthority,
      })
      expect(created.created).toBe(true)
      const originalSize = fs.statSync(value.layout.databasePath).size
      const previousOperationId = readEpoch2ResetJournal({ layout: value.layout, lease: value.lease })!
        .operationId

      const recovered = recoverEpoch2DatabaseSchemaMismatch({ layout: value.layout, lease: value.lease })
      expect(recovered).toMatchObject({
        classification: 'epoch_2_schema_mismatch_recovery',
        backedUpDatabase: true,
        previousJournalOperationId: previousOperationId,
      })
      expect(recovered.backedUpFiles).toContain('starverse.db')
      expect(recovered.backupDirectory).toBe(path.join(
        value.layout.productRoot, EPOCH2_RECOVERY_BACKUP_ROOT,
        path.basename(recovered.backupDirectory),
      ))
      expect(recovered.databaseFileId).toMatch(/^[0-9a-f]{32}$/u)
      expect(fs.existsSync(value.layout.databasePath)).toBe(false)
      expect(fs.statSync(path.join(recovered.backupDirectory, 'starverse.db')).size).toBe(originalSize)

      const journal = readEpoch2ResetJournal({ layout: value.layout, lease: value.lease })!
      expect(journal.phase).toBe('epoch_root_created')
      expect(journal.operationId).not.toBe(previousOperationId)

      const recreated = await ensureEpoch2DatabaseCreated({
        layout: value.layout,
        lease: value.lease,
      })
      expect(recreated.database.created).toBe(true)
      expect(recreated.journal.phase).toBe('database_created')
      expect(fs.existsSync(value.layout.databasePath)).toBe(true)
    } finally { value.lease.release() }
  })

  windowsIt('refuses to recover when the reset journal is missing or not committed', async () => {
    const value = fixture('starverse-recovery-journal-missing')
    try {
      fs.rmSync(path.join(value.layout.transitionRoot, 'epoch-transition.journal.json'),
        { force: true })
      expect(() => recoverEpoch2DatabaseSchemaMismatch({ layout: value.layout, lease: value.lease }))
        .toThrow('EPOCH2_RECOVERY_JOURNAL_INVALID')
    } finally { value.lease.release() }
  })

  windowsIt('refuses to recover a prepared (never committed) journal', async () => {
    const value = fixture('starverse-recovery-journal-prepared')
    try {
      expect(() => recoverEpoch2DatabaseSchemaMismatch({ layout: value.layout, lease: value.lease }))
        .toThrow('EPOCH2_RECOVERY_JOURNAL_INVALID')
    } finally { value.lease.release() }
  })

  windowsIt('refuses to recover when the database file is absent', async () => {
    const value = fixture('starverse-recovery-db-missing')
    try {
      advanceTo(value.journal, value.layout, value.lease, 'committed')
      expect(() => recoverEpoch2DatabaseSchemaMismatch({ layout: value.layout, lease: value.lease }))
        .toThrow('EPOCH2_RECOVERY_DATABASE_UNAVAILABLE')
    } finally { value.lease.release() }
  })
})

describe('epoch-2 reset journal recovery writer', () => {
  windowsIt('replaces a committed journal with a new epoch_root_created operation', () => {
    const value = fixture('starverse-recovery-writer')
    try {
      const committed = advanceTo(value.journal, value.layout, value.lease, 'committed')
      const target = advanceEpoch2ResetJournal(advanceEpoch2ResetJournal(advanceEpoch2ResetJournal(
        createEpoch2ResetJournal({ layout: value.layout }),
        'legacy_files_deleted',
      ), 'config_replaced'), 'epoch_root_created')
      expect(target.operationId).not.toBe(committed.operationId)
      writeEpoch2ResetJournalRecoveryAtomic({ layout: value.layout, lease: value.lease, journal: target })
      expect(readEpoch2ResetJournal({ layout: value.layout, lease: value.lease })).toEqual(target)
    } finally { value.lease.release() }
  })

  windowsIt('rejects a non-epoch_root_created target journal', () => {
    const value = fixture('starverse-recovery-writer-phase')
    try {
      advanceTo(value.journal, value.layout, value.lease, 'committed')
      const target = createEpoch2ResetJournal({ layout: value.layout })
      expect(() => writeEpoch2ResetJournalRecoveryAtomic({
        layout: value.layout, lease: value.lease, journal: target,
      })).toThrow('EPOCH2_RESET_JOURNAL_RECOVERY_INVALID')
    } finally { value.lease.release() }
  })

  windowsIt('rejects a missing current journal', () => {
    const value = fixture('starverse-recovery-writer-missing')
    try {
      fs.rmSync(path.join(value.layout.transitionRoot, 'epoch-transition.journal.json'),
        { force: true })
      const target = advanceEpoch2ResetJournal(advanceEpoch2ResetJournal(advanceEpoch2ResetJournal(
        createEpoch2ResetJournal({ layout: value.layout }),
        'legacy_files_deleted',
      ), 'config_replaced'), 'epoch_root_created')
      expect(() => writeEpoch2ResetJournalRecoveryAtomic({
        layout: value.layout, lease: value.lease, journal: target,
      })).toThrow('EPOCH2_RESET_JOURNAL_RECOVERY_INVALID')
    } finally { value.lease.release() }
  })
})
