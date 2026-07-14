import fs from 'node:fs'
import path from 'node:path'
import { decodeEpoch2ResetJournal, type Epoch2ResetJournal } from './resetJournal'

function serialized(journal: Epoch2ResetJournal): string {
  return `${JSON.stringify(journal, null, 2)}\n`
}

function pendingPath(journalPath: string): string {
  return `${journalPath}.pending`
}

function fsyncDirectory(directory: string): void {
  if (process.platform === 'win32') return
  const descriptor = fs.openSync(directory, 'r')
  try { fs.fsyncSync(descriptor) } finally { fs.closeSync(descriptor) }
}

function sameOperation(left: Epoch2ResetJournal, right: Epoch2ResetJournal): boolean {
  return left.operationId === right.operationId && JSON.stringify(left.pathDigests) === JSON.stringify(right.pathDigests)
}

function phaseIndex(journal: Epoch2ResetJournal): number {
  return ['prepared', 'legacy_files_deleted', 'config_replaced', 'epoch_root_created', 'database_created', 'committed']
    .indexOf(journal.phase)
}

function replaceJournal(pending: string, journalPath: string): void {
  fs.renameSync(pending, journalPath)
  fsyncDirectory(path.dirname(journalPath))
}

function reconcilePendingJournal(journalPath: string): void {
  const pending = pendingPath(journalPath)
  if (!fs.existsSync(pending)) return
  let candidate: Epoch2ResetJournal
  try {
    candidate = decodeEpoch2ResetJournal(JSON.parse(fs.readFileSync(pending, 'utf8')))
  } catch {
    fs.unlinkSync(pending)
    return
  }
  const current = readEpoch2ResetJournal(journalPath)
  if ((!current && candidate.phase !== 'prepared') ||
      (current && (!sameOperation(current, candidate) || phaseIndex(candidate) < phaseIndex(current) ||
        phaseIndex(candidate) > phaseIndex(current) + 1))) {
    throw new Error('EPOCH2_RESET_PENDING_JOURNAL_CONFLICT')
  }
  replaceJournal(pending, journalPath)
}

export function writeEpoch2ResetJournalAtomic(journalPath: string, journal: Epoch2ResetJournal): void {
  const directory = path.dirname(journalPath)
  fs.mkdirSync(directory, { recursive: true })
  reconcilePendingJournal(journalPath)
  const current = readEpoch2ResetJournal(journalPath)
  if (current) {
    if (!sameOperation(current, journal) || phaseIndex(journal) < phaseIndex(current) || phaseIndex(journal) > phaseIndex(current) + 1) {
      throw new Error('EPOCH2_RESET_JOURNAL_TRANSITION_INVALID')
    }
    if (phaseIndex(journal) === phaseIndex(current)) return
  } else if (journal.phase !== 'prepared') {
    throw new Error('EPOCH2_RESET_JOURNAL_TRANSITION_INVALID')
  }
  const temporaryPath = pendingPath(journalPath)
  let descriptor: number | null = null
  try {
    fs.writeFileSync(temporaryPath, serialized(journal), { encoding: 'utf8', flag: 'wx', mode: 0o600 })
    descriptor = fs.openSync(temporaryPath, 'r+')
    fs.fsyncSync(descriptor)
    fs.closeSync(descriptor)
    descriptor = null
    replaceJournal(temporaryPath, journalPath)
  } catch (error) {
    if (descriptor !== null) fs.closeSync(descriptor)
    try { fs.unlinkSync(temporaryPath) } catch { /* best-effort cleanup of an uncommitted temp file */ }
    throw error
  }
}

export function readEpoch2ResetJournal(journalPath: string): Epoch2ResetJournal | null {
  if (!fs.existsSync(journalPath)) return null
  return decodeEpoch2ResetJournal(JSON.parse(fs.readFileSync(journalPath, 'utf8')))
}
