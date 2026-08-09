import { createHash } from 'node:crypto'
import { stableSerializeProviderRequestBoundedV2 } from './stableSerialize'

export type SemanticConsumptionLedgerEntryV2 = Readonly<{
  kind: 'consumed'
  path: string
  disposition: 'encoded' | 'accepted_no_wire'
  nativeField: string | null
  evidence: string
}>

export type SemanticConsumptionLedgerV2 = Readonly<{
  trust: 'semantic_consumption_ledger_v2'
  entries: readonly SemanticConsumptionLedgerEntryV2[]
  canonicalJson: string
  sha256: string
}>

export class SemanticConsumptionLedgerV2Error extends Error {
  constructor(readonly code:
    | 'GENERATION_V2_LEDGER_INVALID_SHAPE'
    | 'GENERATION_V2_LEDGER_INVALID_VALUE'
    | 'GENERATION_V2_LEDGER_DUPLICATE_PATH'
    | 'GENERATION_V2_LEDGER_LIMIT_EXCEEDED') {
    super(code)
    this.name = 'SemanticConsumptionLedgerV2Error'
  }
}

const MAX_LEDGER_BYTES = 1024 * 1024
const ledgers = new WeakSet<object>()

function entry(value: unknown): SemanticConsumptionLedgerEntryV2 {
  if (!value || typeof value !== 'object' || Array.isArray(value) || Object.getPrototypeOf(value) !== Object.prototype) {
    throw new SemanticConsumptionLedgerV2Error('GENERATION_V2_LEDGER_INVALID_SHAPE')
  }
  const descriptors = Object.getOwnPropertyDescriptors(value)
  const expected = ['kind', 'path', 'disposition', 'nativeField', 'evidence']
  if (Reflect.ownKeys(value).some((key) => typeof key !== 'string') ||
      Object.keys(descriptors).sort().join('\0') !== [...expected].sort().join('\0') ||
      Object.values(descriptors).some((descriptor) => !descriptor.enumerable ||
        !('value' in descriptor) || descriptor.value === undefined)) {
    throw new SemanticConsumptionLedgerV2Error('GENERATION_V2_LEDGER_INVALID_SHAPE')
  }
  const input = Object.fromEntries(expected.map((key) => [key, descriptors[key].value]))
  if (input.kind !== 'consumed' ||
      (input.disposition !== 'encoded' && input.disposition !== 'accepted_no_wire') ||
      typeof input.path !== 'string' || input.path.length === 0 || input.path.trim() !== input.path ||
      typeof input.evidence !== 'string' || input.evidence.length === 0 || input.evidence.trim() !== input.evidence ||
      (input.nativeField !== null && (typeof input.nativeField !== 'string' || input.nativeField.length === 0)) ||
      (input.disposition === 'encoded') !== (input.nativeField !== null)) {
    throw new SemanticConsumptionLedgerV2Error('GENERATION_V2_LEDGER_INVALID_VALUE')
  }
  return Object.freeze({
    kind: 'consumed',
    path: input.path,
    disposition: input.disposition,
    nativeField: input.nativeField,
    evidence: input.evidence,
  }) as SemanticConsumptionLedgerEntryV2
}

export function createSemanticConsumptionLedgerV2(value: unknown): SemanticConsumptionLedgerV2 {
  if (!Array.isArray(value) || Object.getPrototypeOf(value) !== Array.prototype || value.length === 0) {
    throw new SemanticConsumptionLedgerV2Error('GENERATION_V2_LEDGER_INVALID_SHAPE')
  }
  const entries = Object.freeze(value.map(entry))
  if (new Set(entries.map((item) => item.path)).size !== entries.length) {
    throw new SemanticConsumptionLedgerV2Error('GENERATION_V2_LEDGER_DUPLICATE_PATH')
  }
  const canonicalJson = stableSerializeProviderRequestBoundedV2(entries, MAX_LEDGER_BYTES)
  if (new TextEncoder().encode(canonicalJson).byteLength > MAX_LEDGER_BYTES) {
    throw new SemanticConsumptionLedgerV2Error('GENERATION_V2_LEDGER_LIMIT_EXCEEDED')
  }
  const ledger = Object.freeze({
    trust: 'semantic_consumption_ledger_v2' as const,
    entries,
    canonicalJson,
    sha256: createHash('sha256').update(canonicalJson, 'utf8').digest('hex'),
  })
  ledgers.add(ledger)
  return ledger
}

export function isSemanticConsumptionLedgerV2(value: unknown): value is SemanticConsumptionLedgerV2 {
  return Boolean(value && typeof value === 'object' && ledgers.has(value))
}
