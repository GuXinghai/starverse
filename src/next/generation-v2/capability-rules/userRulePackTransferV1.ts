import { canonicalSourceFactDigestV1 } from '../model-facts/canonicalSourceFactsV1'
import {
  decodeCapabilityRuleOwnershipSnapshotV1,
  type CapabilityRuleCorePackV1,
} from './capabilityRuleCoreV1'

export const USER_RULES_LOCAL_OWNER_ID_V1 = 'local-user' as const
export const USER_RULE_PACK_TRANSFER_SCHEMA_VERSION_V1 = 1 as const

export type UserCapabilityRuleNoteV1 = Readonly<{
  ruleId: string
  note: string
}>

export type UserRulePackTransferV1 = Readonly<{
  schemaVersion: 1
  pack: CapabilityRuleCorePackV1
  notes: readonly UserCapabilityRuleNoteV1[]
  contentDigest: string
}>

export class UserRulePackTransferV1Error extends Error {
  constructor(readonly code: 'GENERATION_V2_USER_RULE_PACK_TRANSFER_INVALID') {
    super(code)
    this.name = 'UserRulePackTransferV1Error'
  }
}

function invalid(): never {
  throw new UserRulePackTransferV1Error('GENERATION_V2_USER_RULE_PACK_TRANSFER_INVALID')
}

function plainObject(value: unknown): value is Record<string, unknown> {
  return Boolean(value && typeof value === 'object' && !Array.isArray(value) &&
    (Object.getPrototypeOf(value) === Object.prototype || Object.getPrototypeOf(value) === null))
}

function exactKeys(value: Record<string, unknown>, keys: readonly string[]): void {
  const actual = Object.keys(value).sort()
  const expected = [...keys].sort()
  if (actual.length !== expected.length || actual.some((key, index) => key !== expected[index])) invalid()
}

function canonicalNotes(value: unknown, ruleIds: ReadonlySet<string>): readonly UserCapabilityRuleNoteV1[] {
  if (!Array.isArray(value) || value.length > 100_000) invalid()
  const seen = new Set<string>()
  const notes = value.map((entry) => {
    if (!plainObject(entry)) invalid()
    exactKeys(entry, ['ruleId', 'note'])
    if (typeof entry.ruleId !== 'string' || !ruleIds.has(entry.ruleId) || seen.has(entry.ruleId) ||
        typeof entry.note !== 'string' || entry.note.length < 1 || entry.note.length > 16_384 ||
        entry.note.trim() !== entry.note) invalid()
    seen.add(entry.ruleId)
    return Object.freeze({ ruleId: entry.ruleId, note: entry.note })
  }).sort((left, right) => left.ruleId.localeCompare(right.ruleId, 'en'))
  return Object.freeze(notes)
}

function decodePack(value: unknown): CapabilityRuleCorePackV1 {
  try {
    const snapshot = decodeCapabilityRuleOwnershipSnapshotV1({ schemaVersion: 1, ownership: 'user',
      ownerId: USER_RULES_LOCAL_OWNER_ID_V1, packs: [value] })
    return snapshot.packs[0]!
  } catch { return invalid() }
}

function digestPayload(pack: CapabilityRuleCorePackV1, notes: readonly UserCapabilityRuleNoteV1[]): string {
  return `user-rule-pack-transfer-v1:${canonicalSourceFactDigestV1({ pack, notes })}`
}

export function createUserRulePackTransferV1(input: Readonly<{
  pack: unknown
  notes?: readonly UserCapabilityRuleNoteV1[]
}>): UserRulePackTransferV1 {
  const pack = decodePack(input.pack)
  const notes = canonicalNotes(input.notes ?? [], new Set(pack.rules.map((rule) => rule.ruleId)))
  return Object.freeze({ schemaVersion: 1, pack, notes, contentDigest: digestPayload(pack, notes) })
}

export function decodeUserRulePackTransferV1(value: unknown): UserRulePackTransferV1 {
  if (!plainObject(value)) invalid()
  exactKeys(value, ['schemaVersion', 'pack', 'notes', 'contentDigest'])
  if (value.schemaVersion !== USER_RULE_PACK_TRANSFER_SCHEMA_VERSION_V1) invalid()
  const pack = decodePack(value.pack)
  const notes = canonicalNotes(value.notes, new Set(pack.rules.map((rule) => rule.ruleId)))
  const contentDigest = digestPayload(pack, notes)
  if (value.contentDigest !== contentDigest) invalid()
  return Object.freeze({ schemaVersion: 1, pack, notes, contentDigest })
}
