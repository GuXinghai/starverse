import BetterSqlite3 from 'better-sqlite3'
import {
  createEpoch2RuntimeCredentialService,
  type CredentialConfigStore,
  type Epoch2RuntimeCredentialService,
} from '../credentials/epoch2RuntimeCredentialService'
import { validateEpoch2SafeStorageCredentialDecrypt } from '../credentials/epoch2SafeStorageCredentialValidator'
import { runEpoch2ResetThroughConfigReplacement, type Epoch2DefaultSessionReset } from './dataEpochCoordinatorCore'
import { ensureEpoch2DatabaseCreated } from './epochDatabaseCoordinatorCore'
import { advanceEpoch2ResetJournal, EPOCH2_RESET_PHASES, type Epoch2ResetJournal } from './resetJournal'
import { readEpoch2ResetJournal, writeEpoch2ResetJournalAtomic } from './resetJournalStore'
import type { Epoch2WorkspaceLayout } from './rootManifest'
import {
  acquireWin32EpochDatabaseFileAuthority,
  acquireWin32EpochRootLease,
  type Win32EpochDatabaseFileAuthority,
} from './win32EpochRootLease'

export type Epoch2CommittedRuntime = Readonly<{
  journal: Epoch2ResetJournal
  credentialService: Epoch2RuntimeCredentialService
  database: BetterSqlite3.Database
  assertCurrent: () => void
  close: () => Promise<void>
}>

function beforeOrAtConfigReplacement(journal: Epoch2ResetJournal | null): boolean {
  if (journal === null) return true
  return EPOCH2_RESET_PHASES.indexOf(journal.phase) <= EPOCH2_RESET_PHASES.indexOf('config_replaced')
}

export async function bootstrapEpoch2ToCommitted(input: Readonly<{
  layout: Epoch2WorkspaceLayout
  clearDefaultSessionData: Epoch2DefaultSessionReset
  openCredentialStore: () => CredentialConfigStore
}>): Promise<Epoch2CommittedRuntime> {
  const lease = acquireWin32EpochRootLease(input.layout)
  let returned = false
  let credentialService: Epoch2RuntimeCredentialService | undefined
  let databaseFileAuthority: Win32EpochDatabaseFileAuthority | undefined
  let liveDatabase: BetterSqlite3.Database | undefined
  try {
    if (beforeOrAtConfigReplacement(readEpoch2ResetJournal({ layout: input.layout, lease }))) {
      await runEpoch2ResetThroughConfigReplacement({
        layout: input.layout,
        lease,
        validateDecrypt: validateEpoch2SafeStorageCredentialDecrypt,
        clearDefaultSessionData: input.clearDefaultSessionData,
      })
    }

    const database = await ensureEpoch2DatabaseCreated({ layout: input.layout, lease })
    credentialService = await createEpoch2RuntimeCredentialService({
      store: input.openCredentialStore(),
      epochDatabase: {
        layout: input.layout,
        lease,
        rootAuthority: database.rootAuthority,
      },
    })
    const activeCredentialService = credentialService
    let journal = database.journal
    if (journal.phase === 'database_created') {
      journal = advanceEpoch2ResetJournal(journal, 'committed')
      writeEpoch2ResetJournalAtomic({ layout: input.layout, lease, journal })
    }
    if (journal.phase !== 'committed') throw new Error('EPOCH2_BOOTSTRAP_PHASE_INVALID')

    databaseFileAuthority = acquireWin32EpochDatabaseFileAuthority({
      layout: input.layout,
      lease,
      rootAuthority: database.rootAuthority,
      mode: 'verify_existing',
    })
    const liveIdentity = databaseFileAuthority.identity()
    if (liveIdentity.databaseFileId !== database.database.databaseFileId) {
      throw new Error('EPOCH2_BOOTSTRAP_DATABASE_IDENTITY_INVALID')
    }
    liveDatabase = new BetterSqlite3(input.layout.databasePath, { fileMustExist: true })
    liveDatabase.pragma('foreign_keys = ON')
    if (liveDatabase.pragma('foreign_keys', { simple: true }) !== 1) {
      throw new Error('EPOCH2_BOOTSTRAP_DATABASE_PRAGMA_INVALID')
    }
    databaseFileAuthority.verifyPathIdentity()
    const activeDatabase = liveDatabase
    const activeDatabaseFileAuthority = databaseFileAuthority

    let closed = false
    const assertCurrent = () => {
      if (closed || !activeDatabase.open) throw new Error('EPOCH2_BOOTSTRAP_RUNTIME_CLOSED')
      activeDatabaseFileAuthority.verifyPathIdentity()
    }
    const close = async () => {
      if (closed) return
      closed = true
      try {
        if (activeDatabase.open) activeDatabase.close()
      } finally {
        activeDatabaseFileAuthority.release()
        try {
          await activeCredentialService.close()
        } finally {
          lease.release()
        }
      }
    }
    const runtime = Object.freeze({
      journal,
      credentialService: activeCredentialService,
      database: activeDatabase,
      assertCurrent,
      close,
    })
    returned = true
    return runtime
  } finally {
    if (!returned) {
      try {
        if (liveDatabase?.open) liveDatabase.close()
      } finally {
        databaseFileAuthority?.release()
        try {
          await credentialService?.close()
        } finally {
          lease.release()
        }
      }
    }
  }
}
