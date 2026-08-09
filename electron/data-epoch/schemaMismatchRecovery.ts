import { lstatSync, mkdirSync, renameSync } from 'node:fs'
import path from 'node:path'
import {
  advanceEpoch2ResetJournal,
  createEpoch2ResetJournal,
} from './resetJournal'
import {
  readEpoch2ResetJournal,
  writeEpoch2ResetJournalRecoveryAtomic,
} from './resetJournalStore'
import { STARVERSE_EPOCH_DATABASE, type Epoch2WorkspaceLayout } from './rootManifest'
import {
  acquireWin32EpochDatabaseFileAuthority,
  assertWin32EpochRootLeaseAuthority,
  verifyEpoch2RootAuthority,
  type Win32EpochRootLease,
} from './win32EpochRootLease'

export const EPOCH2_RECOVERY_BACKUP_ROOT = 'epoch-2-recovery-backups' as const
const EPOCH2_DATABASE_SIDECAR_SUFFIXES = Object.freeze(['-journal', '-wal', '-shm'] as const)

export type Epoch2SchemaMismatchRecoveryResult = Readonly<{
  classification: 'epoch_2_schema_mismatch_recovery'
  backedUpDatabase: boolean
  backupDirectory: string
  databaseFileId: string
  journalOperationId: string
  previousJournalOperationId: string
  backedUpFiles: readonly string[]
}>

export class Epoch2SchemaMismatchRecoveryError extends Error {
  constructor(readonly code:
    | 'EPOCH2_RECOVERY_JOURNAL_INVALID'
    | 'EPOCH2_RECOVERY_DATABASE_UNAVAILABLE'
    | 'EPOCH2_RECOVERY_BACKUP_PATH_INVALID'
    | 'EPOCH2_RECOVERY_BACKUP_FAILED') {
    super(code)
    this.name = 'Epoch2SchemaMismatchRecoveryError'
  }
}

function prepareRecoveryBackupDirectory(layout: Epoch2WorkspaceLayout): string {
  const root = path.join(layout.productRoot, EPOCH2_RECOVERY_BACKUP_ROOT)
  mkdirSync(root, { recursive: true })
  for (let attempt = 0; attempt < 100; attempt += 1) {
    const target = path.join(root, `epoch-2-${Date.now()}${attempt === 0 ? '' : `-${attempt}`}`)
    try {
      mkdirSync(target, { recursive: false })
      return target
    } catch {
      // EEXIST or transient filesystem failure: attempt the next name.
    }
  }
  throw new Epoch2SchemaMismatchRecoveryError('EPOCH2_RECOVERY_BACKUP_PATH_INVALID')
}

function moveDatabaseFamilyToBackup(input: Readonly<{
  layout: Epoch2WorkspaceLayout
  backupDirectory: string
}>): readonly string[] {
  const backedUpFiles: string[] = []
  // Transient sidecars move first so the main file is only touched last; a
  // failed sidecar move never strands the primary database in limbo.
  for (const suffix of EPOCH2_DATABASE_SIDECAR_SUFFIXES) {
    const sourcePath = path.join(input.layout.epochRoot, `${STARVERSE_EPOCH_DATABASE}${suffix}`)
    try {
      const stat = lstatSync(sourcePath)
      if (!stat.isFile() || stat.isSymbolicLink()) {
        throw new Epoch2SchemaMismatchRecoveryError('EPOCH2_RECOVERY_BACKUP_FAILED')
      }
    } catch (error) {
      if (error instanceof Epoch2SchemaMismatchRecoveryError) throw error
      continue // transient sidecar absent (expected after a clean shutdown)
    }
    try {
      renameSync(sourcePath, path.join(input.backupDirectory, path.basename(sourcePath)))
      backedUpFiles.push(path.basename(sourcePath))
    } catch {
      throw new Epoch2SchemaMismatchRecoveryError('EPOCH2_RECOVERY_BACKUP_FAILED')
    }
  }
  const databasePath = path.join(input.layout.epochRoot, STARVERSE_EPOCH_DATABASE)
  try {
    const stat = lstatSync(databasePath)
    if (!stat.isFile() || stat.isSymbolicLink()) {
      throw new Epoch2SchemaMismatchRecoveryError('EPOCH2_RECOVERY_DATABASE_UNAVAILABLE')
    }
  } catch (error) {
    if (error instanceof Epoch2SchemaMismatchRecoveryError) throw error
    throw new Epoch2SchemaMismatchRecoveryError('EPOCH2_RECOVERY_DATABASE_UNAVAILABLE')
  }
  try {
    renameSync(databasePath, path.join(input.backupDirectory, STARVERSE_EPOCH_DATABASE))
    backedUpFiles.push(STARVERSE_EPOCH_DATABASE)
  } catch {
    throw new Epoch2SchemaMismatchRecoveryError('EPOCH2_RECOVERY_BACKUP_FAILED')
  }
  return Object.freeze(backedUpFiles)
}

/**
 * Backup-and-recreate authority for an epoch-2 database whose installed schema
 * no longer matches the current build (EPOCH2_DATABASE_SCHEMA_MISMATCH).
 *
 * The existing database family is moved (renamed) into a timestamped backup
 * directory under the product root and the reset journal is regressed to
 * `epoch_root_created` with a brand-new operation, so the next bootstrap
 * recreates a fresh database with the current schema. Config and credential
 * vaults are untouched. The caller must hold the epoch-2 root lease.
 */
export function recoverEpoch2DatabaseSchemaMismatch(input: Readonly<{
  layout: Epoch2WorkspaceLayout
  lease: Win32EpochRootLease
}>): Epoch2SchemaMismatchRecoveryResult {
  assertWin32EpochRootLeaseAuthority(input.lease, input.layout)
  const { layout, lease } = input
  const rootAuthority = verifyEpoch2RootAuthority({ layout, lease })
  const journal = readEpoch2ResetJournal({ layout, lease })
  if (!journal ||
      (journal.phase !== 'database_created' && journal.phase !== 'committed')) {
    throw new Epoch2SchemaMismatchRecoveryError('EPOCH2_RECOVERY_JOURNAL_INVALID')
  }
  let databaseFileId: string
  try {
    const authority = acquireWin32EpochDatabaseFileAuthority({
      layout,
      lease,
      rootAuthority,
      mode: 'verify_existing',
    })
    try {
      databaseFileId = authority.verifyPathIdentity().databaseFileId
    } finally {
      authority.release()
    }
  } catch {
    throw new Epoch2SchemaMismatchRecoveryError('EPOCH2_RECOVERY_DATABASE_UNAVAILABLE')
  }
  const backupDirectory = prepareRecoveryBackupDirectory(layout)
  const backedUpFiles = moveDatabaseFamilyToBackup({
    layout,
    backupDirectory,
  })
  const fresh = advanceEpoch2ResetJournal(
    advanceEpoch2ResetJournal(
      advanceEpoch2ResetJournal(
        createEpoch2ResetJournal({ layout }),
        'legacy_files_deleted',
      ),
      'config_replaced',
    ),
    'epoch_root_created',
  )
  writeEpoch2ResetJournalRecoveryAtomic({ layout, lease, journal: fresh })
  verifyEpoch2RootAuthority({ layout, lease })
  return Object.freeze({
    classification: 'epoch_2_schema_mismatch_recovery',
    backedUpDatabase: true,
    backupDirectory,
    databaseFileId,
    journalOperationId: fresh.operationId,
    previousJournalOperationId: journal.operationId,
    backedUpFiles,
  })
}
