import {
  initializeOrVerifyFreshEpoch2Database,
  verifyExistingFreshEpoch2Database,
  type FreshEpochDatabaseInitializationResult,
} from './freshEpochDatabaseInitializer'
import { ensureEpoch2RootCreated } from './epochRootCoordinatorCore'
import {
  advanceEpoch2ResetJournal,
  type Epoch2ResetJournal,
} from './resetJournal'
import { writeEpoch2ResetJournalAtomic } from './resetJournalStore'
import type { Epoch2WorkspaceLayout } from './rootManifest'
import type { Epoch2RootAuthority, Win32EpochRootLease } from './win32EpochRootLease'

export type Epoch2DatabaseCreationResult = Readonly<{
  journal: Epoch2ResetJournal
  rootAuthority: Epoch2RootAuthority
  database: FreshEpochDatabaseInitializationResult
}>

export async function ensureEpoch2DatabaseCreated(input: Readonly<{
  layout: Epoch2WorkspaceLayout
  lease: Win32EpochRootLease
}>): Promise<Epoch2DatabaseCreationResult> {
  const root = ensureEpoch2RootCreated(input)
  const initializer = Object.freeze({ ...input, rootAuthority: root.rootAuthority })

  if (root.journal.phase === 'epoch_root_created') {
    const database = await initializeOrVerifyFreshEpoch2Database(initializer)
    const journal = advanceEpoch2ResetJournal(root.journal, 'database_created')
    writeEpoch2ResetJournalAtomic({ ...input, journal })
    return Object.freeze({ journal, rootAuthority: root.rootAuthority, database })
  }

  if (root.journal.phase !== 'database_created' && root.journal.phase !== 'committed') {
    throw new Error('EPOCH2_DATABASE_COORDINATOR_PHASE_INVALID')
  }
  const database = await verifyExistingFreshEpoch2Database(initializer)
  return Object.freeze({
    journal: root.journal,
    rootAuthority: root.rootAuthority,
    database,
  })
}
