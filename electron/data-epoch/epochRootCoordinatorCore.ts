import {
  advanceEpoch2ResetJournal,
  EPOCH2_RESET_PHASES,
  type Epoch2ResetJournal,
} from './resetJournal'
import {
  readEpoch2ResetJournal,
  writeEpoch2ResetJournalAtomic,
} from './resetJournalStore'
import type { Epoch2WorkspaceLayout } from './rootManifest'
import { readAndVerifyEpoch2TransitionOwnershipManifest } from './rootManifestStore'
import {
  ensureEpoch2RootAuthority,
  verifyEpoch2RootAuthority,
  type Epoch2RootAuthority,
  type Win32EpochRootLease,
} from './win32EpochRootLease'

export type Epoch2RootCreationResult = Readonly<{
  journal: Epoch2ResetJournal
  rootAuthority: Epoch2RootAuthority
}>

export function ensureEpoch2RootCreated(input: Readonly<{
  layout: Epoch2WorkspaceLayout
  lease: Win32EpochRootLease
}>): Epoch2RootCreationResult {
  readAndVerifyEpoch2TransitionOwnershipManifest(input)
  let journal = readEpoch2ResetJournal(input)
  if (journal === null) throw new Error('EPOCH2_ROOT_COORDINATOR_PHASE_INVALID')
  const phaseIndex = EPOCH2_RESET_PHASES.indexOf(journal.phase)
  const rootCreatedIndex = EPOCH2_RESET_PHASES.indexOf('epoch_root_created')
  if (journal.phase === 'config_replaced') {
    const rootAuthority = ensureEpoch2RootAuthority(input)
    journal = advanceEpoch2ResetJournal(journal, 'epoch_root_created')
    writeEpoch2ResetJournalAtomic({ ...input, journal })
    return Object.freeze({ journal, rootAuthority })
  }
  if (phaseIndex < rootCreatedIndex) {
    throw new Error('EPOCH2_ROOT_COORDINATOR_PHASE_INVALID')
  }
  const rootAuthority = verifyEpoch2RootAuthority(input)
  return Object.freeze({ journal, rootAuthority })
}
