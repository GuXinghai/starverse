import { randomUUID } from 'node:crypto'

export const EPOCH2_RESET_PHASES = [
  'prepared',
  'legacy_files_deleted',
  'config_replaced',
  'epoch_root_created',
  'database_created',
  'committed',
] as const

export type Epoch2ResetPhase = typeof EPOCH2_RESET_PHASES[number]

export type Epoch2ResetJournal = Readonly<{
  schemaVersion: 1
  dataEpoch: 2
  operationId: string
  phase: Epoch2ResetPhase
  pathDigests: Readonly<Record<string, string>>
}>

export class Epoch2ResetJournalError extends Error {
  constructor(readonly code:
    | 'EPOCH2_RESET_JOURNAL_INVALID'
    | 'EPOCH2_RESET_PHASE_REGRESSION'
    | 'EPOCH2_RESET_PHASE_SKIP') {
    super(code)
    this.name = 'Epoch2ResetJournalError'
  }
}

function isDigest(value: unknown): value is string {
  return typeof value === 'string' && /^[a-f0-9]{64}$/u.test(value)
}

function isOperationId(value: unknown): value is string {
  return typeof value === 'string' && /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/iu.test(value)
}

function normalizePathDigests(value: unknown): Readonly<Record<string, string>> {
  if (!value || typeof value !== 'object' || Array.isArray(value)) {
    throw new Epoch2ResetJournalError('EPOCH2_RESET_JOURNAL_INVALID')
  }
  const entries = Object.entries(value as Record<string, unknown>)
  if (entries.length === 0 || entries.some(([key, digest]) => !/^[a-z][a-zA-Z0-9_]*$/u.test(key) || !isDigest(digest))) {
    throw new Epoch2ResetJournalError('EPOCH2_RESET_JOURNAL_INVALID')
  }
  return Object.freeze(Object.fromEntries(entries.sort(([left], [right]) => left < right ? -1 : left > right ? 1 : 0)) as Record<string, string>)
}

export function createEpoch2ResetJournal(input: Readonly<{
  operationId?: string
  pathDigests: Readonly<Record<string, string>>
}>): Epoch2ResetJournal {
  const operationId = input.operationId ?? randomUUID()
  if (!isOperationId(operationId)) {
    throw new Epoch2ResetJournalError('EPOCH2_RESET_JOURNAL_INVALID')
  }
  return Object.freeze({
    schemaVersion: 1,
    dataEpoch: 2,
    operationId,
    phase: 'prepared',
    pathDigests: normalizePathDigests(input.pathDigests),
  })
}

export function decodeEpoch2ResetJournal(value: unknown): Epoch2ResetJournal {
  if (!value || typeof value !== 'object' || Array.isArray(value)) {
    throw new Epoch2ResetJournalError('EPOCH2_RESET_JOURNAL_INVALID')
  }
  const raw = value as Record<string, unknown>
  const keys = Object.keys(raw).sort()
  if (keys.join('\0') !== ['dataEpoch', 'operationId', 'pathDigests', 'phase', 'schemaVersion'].sort().join('\0') ||
      raw.schemaVersion !== 1 || raw.dataEpoch !== 2 || !isOperationId(raw.operationId) ||
      !EPOCH2_RESET_PHASES.includes(raw.phase as Epoch2ResetPhase)) {
    throw new Epoch2ResetJournalError('EPOCH2_RESET_JOURNAL_INVALID')
  }
  return Object.freeze({
    schemaVersion: 1,
    dataEpoch: 2,
    operationId: raw.operationId,
    phase: raw.phase as Epoch2ResetPhase,
    pathDigests: normalizePathDigests(raw.pathDigests),
  })
}

export function advanceEpoch2ResetJournal(
  journal: Epoch2ResetJournal,
  nextPhase: Epoch2ResetPhase,
): Epoch2ResetJournal {
  const currentIndex = EPOCH2_RESET_PHASES.indexOf(journal.phase)
  const nextIndex = EPOCH2_RESET_PHASES.indexOf(nextPhase)
  if (nextIndex < currentIndex) throw new Epoch2ResetJournalError('EPOCH2_RESET_PHASE_REGRESSION')
  if (nextIndex > currentIndex + 1) throw new Epoch2ResetJournalError('EPOCH2_RESET_PHASE_SKIP')
  if (nextIndex === currentIndex) return journal
  return Object.freeze({ ...journal, phase: nextPhase })
}
