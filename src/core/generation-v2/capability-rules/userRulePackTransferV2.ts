import { canonicalSourceFactDigestV1 } from '../model-facts/canonicalSourceFactsV1'
import { decodeCapabilityRuleCorePackV2, migrateCapabilityRuleOwnershipSnapshotV1ToV2, type CapabilityRuleCorePackV2 } from './capabilityRuleCoreV2'
import { decodeUserRulePackTransferV1 } from './userRulePackTransferV1'

export const USER_RULE_PACK_TRANSFER_SCHEMA_VERSION_V2 = 2 as const

export type UserCapabilityRuleNoteV2 = Readonly<{ ruleId: string; note: string }>

export type UserRulePackTransferV2 = Readonly<{
  schemaVersion: 2
  pack: CapabilityRuleCorePackV2
  notes: readonly UserCapabilityRuleNoteV2[]
  contentDigest: string
}>

export class UserRulePackTransferV2Error extends Error {
  constructor(readonly code: 'GENERATION_V2_USER_RULE_PACK_TRANSFER_INVALID') {
    super(code)
    this.name = 'UserRulePackTransferV2Error'
  }
}

function invalid(): never {
  throw new UserRulePackTransferV2Error('GENERATION_V2_USER_RULE_PACK_TRANSFER_INVALID')
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

function canonicalNotes(value: unknown, ruleIds: ReadonlySet<string>): readonly UserCapabilityRuleNoteV2[] {
  if (!Array.isArray(value) || value.length > 100_000) invalid()
  const seen = new Set<string>()
  const notes = value.map((entry) => {
    if (!plainObject(entry)) invalid()
    exactKeys(entry, ['ruleId', 'note'])
    if (typeof entry.ruleId !== 'string' || !ruleIds.has(entry.ruleId) || seen.has(entry.ruleId) ||
        typeof entry.note !== 'string' || entry.note.length < 1 || entry.note.length > 16_384 ||
        entry.note.trim() !== entry.note || /[\u0000-\u001f\u007f]/u.test(entry.note)) invalid()
    seen.add(entry.ruleId)
    return Object.freeze({ ruleId: entry.ruleId, note: entry.note })
  }).sort((left, right) => left.ruleId < right.ruleId ? -1 : left.ruleId > right.ruleId ? 1 : 0)
  return Object.freeze(notes)
}

function decodePack(value: unknown): CapabilityRuleCorePackV2 {
  try {
    return decodeCapabilityRuleCorePackV2(value)
  } catch {
    return invalid()
  }
}

function digestPayload(pack: CapabilityRuleCorePackV2, notes: readonly UserCapabilityRuleNoteV2[]): string {
  return `user-rule-pack-transfer-v2:${canonicalSourceFactDigestV1({ pack, notes })}`
}

export function createUserRulePackTransferV2(input: Readonly<{
  pack: unknown
  notes?: readonly UserCapabilityRuleNoteV2[]
}>): UserRulePackTransferV2 {
  const pack = decodePack(input.pack)
  const notes = canonicalNotes(input.notes ?? [], new Set(pack.rules.map((rule) => rule.ruleId)))
  return Object.freeze({ schemaVersion: 2, pack, notes, contentDigest: digestPayload(pack, notes) })
}

export function decodeUserRulePackTransferV2(value: unknown): UserRulePackTransferV2 {
  if (!plainObject(value)) invalid()
  if (value.schemaVersion === 1) {
    // Authenticate the original format before migrating; the new digest describes
    // the converted V2 content, never a relabelled V1 envelope.
    const legacy = decodeUserRulePackTransferV1(value)
    const migrated = migrateCapabilityRuleOwnershipSnapshotV1ToV2({ schemaVersion: 1,
      ownership: 'user', ownerId: 'local-user', packs: [legacy.pack] })
    return createUserRulePackTransferV2({ pack: migrated.packs[0], notes: legacy.notes })
  }
  exactKeys(value, ['schemaVersion', 'pack', 'notes', 'contentDigest'])
  if (value.schemaVersion !== USER_RULE_PACK_TRANSFER_SCHEMA_VERSION_V2) invalid()
  const pack = decodePack(value.pack)
  const notes = canonicalNotes(value.notes, new Set(pack.rules.map((rule) => rule.ruleId)))
  const contentDigest = digestPayload(pack, notes)
  if (value.contentDigest !== contentDigest) invalid()
  return Object.freeze({ schemaVersion: 2, pack, notes, contentDigest })
}
