import {
  decodeEpoch2ResetJournal,
  EPOCH2_RESET_PHASES,
  type Epoch2ResetJournal,
} from './resetJournal'
import type { Epoch2WorkspaceLayout } from './rootManifest'
import {
  assertWin32EpochRootLeaseAuthority,
  type Win32EpochRootLease,
} from './win32EpochRootLease'

const encoder = new TextEncoder()
const decoder = new TextDecoder('utf-8', { fatal: true })

function serialized(journal: Epoch2ResetJournal): Uint8Array {
  const bytes = encoder.encode(`${JSON.stringify(journal, null, 2)}\n`)
  if (bytes.byteLength > 64 * 1024) throw new Error('EPOCH2_RESET_JOURNAL_INVALID')
  return bytes
}

function decode(bytes: Uint8Array): Epoch2ResetJournal {
  try {
    return decodeEpoch2ResetJournal(JSON.parse(decoder.decode(bytes)))
  } catch {
    throw new Error('EPOCH2_RESET_JOURNAL_INVALID')
  }
}

function sameOperation(left: Epoch2ResetJournal, right: Epoch2ResetJournal): boolean {
  return left.operationId === right.operationId &&
    JSON.stringify(left.pathDigests) === JSON.stringify(right.pathDigests)
}

function phaseIndex(journal: Epoch2ResetJournal): number {
  return EPOCH2_RESET_PHASES.indexOf(journal.phase)
}

function assertAuthority(input: Readonly<{
  layout: Epoch2WorkspaceLayout
  lease: Win32EpochRootLease
}>): void {
  assertWin32EpochRootLeaseAuthority(input.lease, input.layout)
}

export function writeEpoch2ResetJournalAtomic(input: Readonly<{
  layout: Epoch2WorkspaceLayout
  lease: Win32EpochRootLease
  journal: Epoch2ResetJournal
}>): void {
  assertAuthority(input)
  const journal = decodeEpoch2ResetJournal(input.journal)
  const current = readEpoch2ResetJournal(input)
  if (current) {
    if (!sameOperation(current, journal) ||
        phaseIndex(journal) < phaseIndex(current) ||
        phaseIndex(journal) > phaseIndex(current) + 1) {
      throw new Error('EPOCH2_RESET_JOURNAL_TRANSITION_INVALID')
    }
    if (phaseIndex(journal) === phaseIndex(current)) return
  } else if (journal.phase !== 'prepared') {
    throw new Error('EPOCH2_RESET_JOURNAL_TRANSITION_INVALID')
  }
  if (input.lease.writeTransitionFile('reset_journal', serialized(journal)) !== 'written') {
    throw new Error('EPOCH2_RESET_JOURNAL_TRANSITION_INVALID')
  }
}

export function readEpoch2ResetJournal(input: Readonly<{
  layout: Epoch2WorkspaceLayout
  lease: Win32EpochRootLease
}>): Epoch2ResetJournal | null {
  assertAuthority(input)
  const bytes = input.lease.readTransitionFile('reset_journal')
  return bytes === null ? null : decode(bytes)
}
