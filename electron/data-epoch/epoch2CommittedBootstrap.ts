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
import { acquireWin32EpochRootLease } from './win32EpochRootLease'

export type Epoch2CommittedRuntime = Readonly<{
  journal: Epoch2ResetJournal
  credentialService: Epoch2RuntimeCredentialService
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

    let closed = false
    const close = async () => {
      if (closed) return
      closed = true
      await activeCredentialService.close()
      lease.release()
    }
    const runtime = Object.freeze({ journal, credentialService: activeCredentialService, close })
    returned = true
    return runtime
  } finally {
    if (!returned) {
      await credentialService?.close()
      lease.release()
    }
  }
}
