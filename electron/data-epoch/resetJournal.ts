import { randomUUID } from 'node:crypto'
import {
  createEpoch2ResetInventory,
  decodeEpoch2ResetInventory,
  type Epoch2ResetInventoryV1,
} from './resetInventory'
import type { Epoch2WorkspaceLayout } from './rootManifest'

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
  schemaVersion: 2
  dataEpoch: 2
  operationId: string
  phase: Epoch2ResetPhase
  inventory: Epoch2ResetInventoryV1
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

function isOperationId(value: unknown): value is string {
  return typeof value === 'string' && /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/u.test(value)
}

export function createEpoch2ResetJournal(input: Readonly<{
  operationId?: string
  layout: Epoch2WorkspaceLayout
}>): Epoch2ResetJournal {
  const operationId = input.operationId ?? randomUUID()
  if (!isOperationId(operationId)) {
    throw new Epoch2ResetJournalError('EPOCH2_RESET_JOURNAL_INVALID')
  }
  return Object.freeze({
    schemaVersion: 2,
    dataEpoch: 2,
    operationId,
    phase: 'prepared',
    inventory: createEpoch2ResetInventory(input.layout),
  })
}

export function assertEpoch2ResetJournalInventory(
  journal: Epoch2ResetJournal,
  layout: Epoch2WorkspaceLayout,
): void {
  const expected = createEpoch2ResetInventory(layout)
  if (JSON.stringify(journal.inventory) !== JSON.stringify(expected)) {
    throw new Epoch2ResetJournalError('EPOCH2_RESET_JOURNAL_INVALID')
  }
}

export function decodeEpoch2ResetJournal(value: unknown): Epoch2ResetJournal {
  if (!value || typeof value !== 'object' || Array.isArray(value)) {
    throw new Epoch2ResetJournalError('EPOCH2_RESET_JOURNAL_INVALID')
  }
  const raw = value as Record<string, unknown>
  const keys = Object.keys(raw).sort()
  if (keys.join('\0') !== ['dataEpoch', 'inventory', 'operationId', 'phase', 'schemaVersion'].sort().join('\0') ||
      raw.schemaVersion !== 2 || raw.dataEpoch !== 2 || !isOperationId(raw.operationId) ||
      !EPOCH2_RESET_PHASES.includes(raw.phase as Epoch2ResetPhase)) {
    throw new Epoch2ResetJournalError('EPOCH2_RESET_JOURNAL_INVALID')
  }
  return Object.freeze({
    schemaVersion: 2,
    dataEpoch: 2,
    operationId: raw.operationId,
    phase: raw.phase as Epoch2ResetPhase,
    inventory: decodeEpoch2ResetInventory(raw.inventory),
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
