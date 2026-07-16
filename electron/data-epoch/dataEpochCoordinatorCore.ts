import type { Epoch2CredentialDecryptValidator } from './configProjection'
import {
  cleanupEpoch2TransitionTemps,
  deleteEpoch2OwnedTarget,
  inspectEpoch2OwnedTarget,
} from './nativeOwnedDelete'
import {
  advanceEpoch2ResetJournal,
  createEpoch2ResetJournal,
  type Epoch2ResetJournal,
} from './resetJournal'
import {
  readEpoch2ResetJournal,
  writeEpoch2ResetJournalAtomic,
} from './resetJournalStore'
import {
  createEpoch2RootManifest,
  type Epoch2WorkspaceLayout,
} from './rootManifest'
import { writeEpoch2TransitionOwnershipManifestAtomic } from './rootManifestStore'
import {
  commitEpoch2ConfigReplacement,
  deleteEpoch2LegacyConfigBackups,
  disposeEpoch2ConfigReplacementAuthority,
  EPOCH2_OWNED_TARGET_IDS,
  inspectEpoch2LegacyConfigBackups,
  prepareEpoch2ConfigReplacement,
  type Epoch2ConfigReplacementAuthority,
  type Win32EpochRootLease,
} from './win32EpochRootLease'

export type Epoch2DefaultSessionReset = () => Promise<void>

export type Epoch2ResetThroughConfigResult = Readonly<{
  journal: Epoch2ResetJournal
  deletedTargetCount: number
  deletedConfigBackupCount: number
}>

function persistNextPhase(input: Readonly<{
  layout: Epoch2WorkspaceLayout
  lease: Win32EpochRootLease
  journal: Epoch2ResetJournal
  nextPhase: 'legacy_files_deleted' | 'config_replaced'
}>): Epoch2ResetJournal {
  const next = advanceEpoch2ResetJournal(input.journal, input.nextPhase)
  writeEpoch2ResetJournalAtomic({
    layout: input.layout,
    lease: input.lease,
    journal: next,
  })
  return next
}

function sweepLegacyOwnedTargets(input: Readonly<{
  layout: Epoch2WorkspaceLayout
  lease: Win32EpochRootLease
}>): number {
  for (const targetId of EPOCH2_OWNED_TARGET_IDS) {
    inspectEpoch2OwnedTarget({
      layout: input.layout,
      lease: input.lease,
      targetId,
    })
  }
  let deletedTargetCount = 0
  for (const targetId of EPOCH2_OWNED_TARGET_IDS) {
    const result = deleteEpoch2OwnedTarget({
      layout: input.layout,
      lease: input.lease,
      targetId,
    })
    if (result.exists) deletedTargetCount += 1
  }
  return deletedTargetCount
}

export async function runEpoch2ResetThroughConfigReplacement(input: Readonly<{
  layout: Epoch2WorkspaceLayout
  lease: Win32EpochRootLease
  validateDecrypt: Epoch2CredentialDecryptValidator
  clearDefaultSessionData: Epoch2DefaultSessionReset
}>): Promise<Epoch2ResetThroughConfigResult> {
  cleanupEpoch2TransitionTemps(input)
  writeEpoch2TransitionOwnershipManifestAtomic({
    layout: input.layout,
    lease: input.lease,
    manifest: createEpoch2RootManifest({ layout: input.layout }),
  })

  let journal = readEpoch2ResetJournal(input)
  if (journal === null) {
    journal = createEpoch2ResetJournal({ layout: input.layout })
    writeEpoch2ResetJournalAtomic({
      layout: input.layout,
      lease: input.lease,
      journal,
    })
  }
  if (journal.phase !== 'prepared' && journal.phase !== 'legacy_files_deleted' &&
      journal.phase !== 'config_replaced') {
    throw new Error('EPOCH2_CONFIG_COORDINATOR_PHASE_INVALID')
  }

  let replacementAuthority: Epoch2ConfigReplacementAuthority | undefined
  let deletedTargetCount = 0
  let deletedConfigBackupCount = 0
  try {
    replacementAuthority = prepareEpoch2ConfigReplacement({
      layout: input.layout,
      lease: input.lease,
      validateDecrypt: input.validateDecrypt,
    })
    inspectEpoch2LegacyConfigBackups(input)

    if (journal.phase !== 'prepared' && journal.phase !== 'legacy_files_deleted') {
      deletedTargetCount += sweepLegacyOwnedTargets(input)
      commitEpoch2ConfigReplacement({
        layout: input.layout,
        lease: input.lease,
        authority: replacementAuthority,
      })
      replacementAuthority = undefined
      deletedConfigBackupCount = deleteEpoch2LegacyConfigBackups(input)
      return Object.freeze({ journal, deletedTargetCount, deletedConfigBackupCount })
    }

    deletedTargetCount += sweepLegacyOwnedTargets(input)
    await input.clearDefaultSessionData()
    deletedTargetCount += sweepLegacyOwnedTargets(input)

    if (journal.phase === 'prepared') {
      journal = persistNextPhase({
        layout: input.layout,
        lease: input.lease,
        journal,
        nextPhase: 'legacy_files_deleted',
      })
    }

    commitEpoch2ConfigReplacement({
      layout: input.layout,
      lease: input.lease,
      authority: replacementAuthority,
    })
    replacementAuthority = undefined
    deletedConfigBackupCount = deleteEpoch2LegacyConfigBackups(input)
    journal = persistNextPhase({
      layout: input.layout,
      lease: input.lease,
      journal,
      nextPhase: 'config_replaced',
    })
    return Object.freeze({ journal, deletedTargetCount, deletedConfigBackupCount })
  } finally {
    if (replacementAuthority) {
      disposeEpoch2ConfigReplacementAuthority(replacementAuthority)
    }
  }
}
