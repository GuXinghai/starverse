import BetterSqlite3 from 'better-sqlite3'
import {
  createEpoch2RuntimeCredentialService,
  type CredentialConfigStore,
  type Epoch2RuntimeCredentialService,
} from '../credentials/epoch2RuntimeCredentialService'
import { runEpoch2ResetThroughConfigReplacement, type Epoch2DefaultSessionReset } from './dataEpochCoordinatorCore'
import { ensureEpoch2DatabaseCreated } from './epochDatabaseCoordinatorCore'
import { advanceEpoch2ResetJournal, EPOCH2_RESET_PHASES, type Epoch2ResetJournal } from './resetJournal'
import { readEpoch2ResetJournal, writeEpoch2ResetJournalAtomic } from './resetJournalStore'
import type { Epoch2WorkspaceLayout } from './rootManifest'
import { Epoch2AttachmentBlobStoreV2 } from './epoch2AttachmentBlobStoreV2'
import { createOpenAICompatibleCredentialV2Service } from '../credentials/openAICompatibleCredentialV2Service'
import { createCredentialMutationQueue } from '../credentials/credentialMutationQueue'
import { enforceLinuxCredentialStoragePermissions } from '../credentials/linuxCredentialStoragePermissions'
import {
  acquireEpochDatabaseFileAuthority,
  acquireEpochRootLease,
  type EpochDatabaseFileAuthority,
} from './win32EpochRootLease'

export type Epoch2CommittedRuntime = Readonly<{
  journal: Epoch2ResetJournal
  credentialService: Epoch2RuntimeCredentialService
  openAICompatibleCredentialService: ReturnType<typeof createOpenAICompatibleCredentialV2Service>
  database: BetterSqlite3.Database
  attachmentBlobStore: Epoch2AttachmentBlobStoreV2
  assertCurrent: () => void
  close: () => Promise<void>
}>

function beforeOrAtConfigReplacement(journal: Epoch2ResetJournal | null): boolean {
  if (journal === null) return true
  return EPOCH2_RESET_PHASES.indexOf(journal.phase) <= EPOCH2_RESET_PHASES.indexOf('config_replaced')
}

function startupMilestone(value: string): void {
  if (process.env.SV_EPOCH2_NORMAL_PROFILE_INIT === '1') {
    process.stderr.write(`[epoch2-bootstrap] ${value}\n`)
  }
}

export async function bootstrapEpoch2ToCommitted(input: Readonly<{
  layout: Epoch2WorkspaceLayout
  clearDefaultSessionData: Epoch2DefaultSessionReset
  openCredentialStore: () => CredentialConfigStore
  platform?: NodeJS.Platform
  enforceCredentialStoragePermissions?: typeof enforceLinuxCredentialStoragePermissions
}>): Promise<Epoch2CommittedRuntime> {
  const platform = input.platform ?? process.platform
  const enforceCredentialStoragePermissions = input.enforceCredentialStoragePermissions ?? enforceLinuxCredentialStoragePermissions
  startupMilestone('lease_acquire_start')
  const lease = acquireEpochRootLease(input.layout, platform)
  startupMilestone('lease_acquired')
  let returned = false
  let credentialService: Epoch2RuntimeCredentialService | undefined
  let openAICompatibleCredentialService: ReturnType<typeof createOpenAICompatibleCredentialV2Service> | undefined
  let databaseFileAuthority: EpochDatabaseFileAuthority | undefined
  let liveDatabase: BetterSqlite3.Database | undefined
  const credentialMutationQueue = createCredentialMutationQueue()
  try {
    if (beforeOrAtConfigReplacement(readEpoch2ResetJournal({ layout: input.layout, lease }))) {
      startupMilestone('reset_resume_start')
      await runEpoch2ResetThroughConfigReplacement({
        layout: input.layout,
        lease,
        clearDefaultSessionData: input.clearDefaultSessionData,
      })
      startupMilestone('reset_resume_complete')
    }

    startupMilestone('database_initialize_start')
    const database = await ensureEpoch2DatabaseCreated({ layout: input.layout, lease })
    startupMilestone('database_initialize_complete')
    const credentialStore = input.openCredentialStore()
    startupMilestone('credential_store_opened')
    const credentialStorePath = (credentialStore as { path?: unknown }).path
    const credentialStoragePaths = Object.freeze({
      directories: [input.layout.productRoot, input.layout.workspaceRoot, input.layout.epochRoot],
      files: [input.layout.databasePath, ...(typeof credentialStorePath === 'string' ? [credentialStorePath] : [])],
      optionalFiles: [`${input.layout.databasePath}-wal`, `${input.layout.databasePath}-shm`, `${input.layout.databasePath}-journal`],
    })
    enforceCredentialStoragePermissions({
      platform,
      ...credentialStoragePaths,
    })
    credentialService = await createEpoch2RuntimeCredentialService({
      store: credentialStore,
      mutationQueue: credentialMutationQueue,
      epochDatabase: {
        layout: input.layout,
        lease,
        rootAuthority: database.rootAuthority,
      },
      credentialStoragePaths,
      platform,
    })
    startupMilestone('credential_service_ready')
    const activeCredentialService = credentialService
    let journal = database.journal
    if (journal.phase === 'database_created') {
      journal = advanceEpoch2ResetJournal(journal, 'committed')
      writeEpoch2ResetJournalAtomic({ layout: input.layout, lease, journal })
    }
    if (journal.phase !== 'committed') throw new Error('EPOCH2_BOOTSTRAP_PHASE_INVALID')
    startupMilestone('journal_committed')

    databaseFileAuthority = acquireEpochDatabaseFileAuthority({
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
    enforceCredentialStoragePermissions({
      platform,
      ...credentialStoragePaths,
    })
    startupMilestone('live_database_ready')
    const activeDatabase = liveDatabase
    const activeDatabaseFileAuthority = databaseFileAuthority
    const attachmentBlobStore = new Epoch2AttachmentBlobStoreV2({
      layout: input.layout, lease, rootAuthority: database.rootAuthority,
    })
    openAICompatibleCredentialService = createOpenAICompatibleCredentialV2Service({
      db: activeDatabase,
      mutationQueue: credentialMutationQueue,
      credentialStoragePaths,
      platform,
    })

    let closed = false
    let closePromise: Promise<void> | undefined
    const assertCurrent = () => {
      if (closed || !activeDatabase.open) throw new Error('EPOCH2_BOOTSTRAP_RUNTIME_CLOSED')
      activeDatabaseFileAuthority.verifyPathIdentity()
    }
    const close = async () => {
      if (closePromise) return closePromise
      closed = true
      closePromise = (async () => {
        await openAICompatibleCredentialService!.close()
        await activeCredentialService.close()
        await credentialMutationQueue.close()
        if (activeDatabase.open) activeDatabase.close()
      })().finally(async () => {
        activeDatabaseFileAuthority.release()
        try {
          lease.release()
        } catch { /* lease release is best effort during terminal close */ }
      })
      return closePromise
    }
    const runtime = Object.freeze({
      journal,
      credentialService: activeCredentialService,
      openAICompatibleCredentialService,
      database: activeDatabase,
      attachmentBlobStore,
      assertCurrent,
      close,
    })
    returned = true
    return runtime
  } finally {
    if (!returned) {
      try {
        await openAICompatibleCredentialService?.close()
        await credentialService?.close()
        await credentialMutationQueue.close()
        if (liveDatabase?.open) liveDatabase.close()
      } finally {
        databaseFileAuthority?.release()
        lease.release()
      }
    }
  }
}
