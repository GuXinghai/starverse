import type BetterSqlite3 from 'better-sqlite3'
import {
  assertCapabilityRuleRewriteAvailableV1,
  planCapabilityRuleRewriteV1,
} from '../../src/core/generation-v2/capability-rules/capabilityRuleCoreV1'
import {
  decodeCapabilityRuleCoreRuleV2,
  migrateCapabilityRuleOwnershipSnapshotV1ToV2,
  type CapabilityRuleCorePackV2,
  type CapabilityRuleCoreRuleV2,
  type CapabilityRuleOwnershipSnapshotV2,
} from '../../src/core/generation-v2/capability-rules/capabilityRuleCoreV2'
import {
  createUserRulePackTransferV2,
  decodeUserRulePackTransferV2,
  type UserCapabilityRuleNoteV2,
  type UserRulePackTransferV2,
} from '../../src/core/generation-v2/capability-rules/userRulePackTransferV2'
import { prepareCapabilityRuleMaterializationV1 } from
  '../../src/core/generation-v2/model-facts/materializedCapabilityRuleSourceV1'
import { buildCapabilityRuleSourceScopeIdV1 } from
  '../../src/core/generation-v2/model-facts/sourceScopeV1'
import {
  CapabilityRuleCoreV1Repo,
} from '../../infra/db/repo/capabilityRuleCoreV1Repo'
import { UserCapabilityRuleDraftV1Repo } from '../../infra/db/repo/userCapabilityRuleDraftV1Repo'
import {
  CapabilityRuleCoreV2Repo,
  prepareCapabilityRuleOwnershipSnapshotWriteV2,
} from '../../infra/db/repo/capabilityRuleCoreV2Repo'
import { CapabilityRuleMaterializationV1Repo } from
  '../../infra/db/repo/capabilityRuleMaterializationV1Repo'
import { CanonicalModelFactSourceV1Repo } from
  '../../infra/db/repo/canonicalModelFactSourceV1Repo'
import { CloudRulesApplicationV1Repo } from '../../infra/db/repo/cloudRulesApplicationV1Repo'
import { UserCapabilityRuleDraftV2Repo, type LegacyV1UserSourceBaselineV2, type UserCapabilityRuleDraftV2 } from
  '../../infra/db/repo/userCapabilityRuleDraftV2Repo'
import { USER_RULES_LOCAL_OWNER_ID_V1 } from '../../src/core/generation-v2/capability-rules/userRulePackTransferV1'
import type { UserCapabilityRulesSubjectSetReaderV1 } from './userCapabilityRulesV1Service'
import { prepareGenerationRequestRulesPublicationV2, writeGenerationRequestRulesPublicationV2 } from
  '../../infra/db/repo/generationRequestRulesV2Repo'
import {
  CAPABILITY_RULE_MATERIALIZATION_DEFAULT_ACTIVATION_POLICIES_V1,
  CAPABILITY_RULE_MATERIALIZATION_RULE_STORE_ID_V1,
} from './capabilityRuleMaterializationSchedulerV1Service'
import { canonicalSourceFactDigestV1 } from '../../src/core/generation-v2/model-facts/canonicalSourceFactsV1'

const RESERVED_CLOUD_OWNER_IDS = Object.freeze([
  'bundled-anthropic-thinking-v2',
  'bundled-gemini-thinking-v2',
  'bundled-openai-responses-thinking-v2',
])
const COMPLETE_RULE_MIGRATION_PACK_IDS = Object.freeze([
  'bundled-anthropic-thinking-v2',
  'bundled-gemini-thinking-v2',
  'bundled-openai-responses-thinking-v2',
  'reviewed-request-policy-v2',
])

function invalid(): never {
  throw new UserCapabilityRulesV2ServiceError('GENERATION_V2_USER_CAPABILITY_RULES_INVALID')
}

function ownershipSnapshot(packs: readonly CapabilityRuleCorePackV2[]): CapabilityRuleOwnershipSnapshotV2 {
  return Object.freeze({ schemaVersion: 2, ownership: 'user', ownerId: USER_RULES_LOCAL_OWNER_ID_V1,
    packs: Object.freeze([...packs]) })
}

function noteDigest(notes: readonly UserCapabilityRuleNoteV2[]): string {
  return canonicalSourceFactDigestV1(notes)
}

function mergeMigratedSnapshot(current: CapabilityRuleOwnershipSnapshotV2 | null,
  legacy: CapabilityRuleOwnershipSnapshotV2 | null): CapabilityRuleOwnershipSnapshotV2 {
  if (!current && !legacy) return ownershipSnapshot([])
  if (!legacy) return current!
  if (!current) return legacy
  const packs = [...current.packs]
  const packIndexes = new Map(packs.map((pack, index) => [pack.packId, index]))
  const ruleIds = new Set(packs.flatMap(pack => pack.rules.map(rule => rule.ruleId)))
  const existingRules = new Map(packs.flatMap(pack => pack.rules.map(rule => [rule.ruleId, { packId: pack.packId, rule }] as const)))
  for (const pack of legacy.packs) {
    for (const rule of pack.rules) {
      const prior = existingRules.get(rule.ruleId)
      if (prior && (prior.packId !== pack.packId || canonicalSourceFactDigestV1(prior.rule) !== canonicalSourceFactDigestV1(rule))) {
        throw new UserCapabilityRulesV2ServiceError('GENERATION_V2_USER_CAPABILITY_RULES_IDENTITY_COLLISION')
      }
    }
    const index = packIndexes.get(pack.packId)
    if (index !== undefined) {
      const existing = packs[index]!
      if (canonicalSourceFactDigestV1({ ...existing, rules: [] }) !== canonicalSourceFactDigestV1({ ...pack, rules: [] })) {
        throw new UserCapabilityRulesV2ServiceError('GENERATION_V2_USER_CAPABILITY_RULES_IDENTITY_COLLISION')
      }
      const additional = pack.rules.filter(rule => !ruleIds.has(rule.ruleId))
      packs[index] = Object.freeze({ ...existing, rules: Object.freeze([...existing.rules, ...additional]) })
      for (const rule of additional) ruleIds.add(rule.ruleId)
      continue
    }
    const additional = pack.rules.filter(rule => !ruleIds.has(rule.ruleId))
    if (additional.length === 0 && pack.rules.length > 0) continue
    const imported = additional.length === pack.rules.length ? pack : Object.freeze({ ...pack,
      rules: Object.freeze(additional) })
    packIndexes.set(pack.packId, packs.length)
    packs.push(imported)
    for (const rule of additional) ruleIds.add(rule.ruleId)
  }
  return ownershipSnapshot(packs)
}

function mergeNotes(primary: readonly UserCapabilityRuleNoteV2[], secondary: readonly UserCapabilityRuleNoteV2[],
  snapshot: CapabilityRuleOwnershipSnapshotV2): readonly UserCapabilityRuleNoteV2[] {
  const ruleIds = new Set(snapshot.packs.flatMap(pack => pack.rules.map(rule => rule.ruleId)))
  const byRule = new Map<string, UserCapabilityRuleNoteV2>()
  for (const note of secondary) if (ruleIds.has(note.ruleId)) byRule.set(note.ruleId, note)
  for (const note of primary) if (ruleIds.has(note.ruleId)) {
    const prior = byRule.get(note.ruleId)
    if (prior && prior.note !== note.note) throw new UserCapabilityRulesV2ServiceError('GENERATION_V2_USER_CAPABILITY_RULES_IDENTITY_COLLISION')
    byRule.set(note.ruleId, note)
  }
  return Object.freeze([...byRule.values()].sort((left, right) => left.ruleId.localeCompare(right.ruleId, 'en')))
}

function sameLegacyDraft(left: LegacyV1UserSourceBaselineV2['draft'],
  right: LegacyV1UserSourceBaselineV2['draft']): boolean {
  return JSON.stringify(left) === JSON.stringify(right)
}

function legacyDraftBaseline(draft: ReturnType<UserCapabilityRuleDraftV1Repo['readDraft']>):
  LegacyV1UserSourceBaselineV2['draft'] {
  return draft ? Object.freeze({ sessionId: draft.sessionId, draftRevision: draft.draftRevision,
    baseSnapshotRevision: draft.baseSnapshotRevision, baseContentDigest: draft.baseContentDigest,
    draftContentDigest: draft.draftContentDigest, dirty: draft.dirty }) : null
}

function assertReservedCloudBaseline(source: LegacyV1UserSourceBaselineV2): void {
  if (source.reservedCloudOwners.length !== RESERVED_CLOUD_OWNER_IDS.length ||
      source.reservedCloudOwners.some((owner, index) => owner.ownerId !== RESERVED_CLOUD_OWNER_IDS[index])) invalid()
}

function packById(draft: UserCapabilityRuleDraftV2, packId: string): CapabilityRuleCorePackV2 {
  const pack = draft.projected.definition.packs.find(entry => entry.packId === packId)
  if (!pack) throw new UserCapabilityRulesV2ServiceError('GENERATION_V2_USER_CAPABILITY_RULES_PACK_NOT_FOUND')
  return pack
}

export class UserCapabilityRulesV2ServiceError extends Error {
  constructor(readonly code:
    | 'GENERATION_V2_USER_CAPABILITY_RULES_INVALID'
    | 'GENERATION_V2_USER_CAPABILITY_RULES_STALE'
    | 'GENERATION_V2_USER_CAPABILITY_RULES_EXPORT_DIRTY'
    | 'GENERATION_V2_USER_CAPABILITY_RULES_PACK_NOT_FOUND'
    | 'GENERATION_V2_USER_CAPABILITY_RULES_IDENTITY_COLLISION'
    | 'GENERATION_V2_USER_CAPABILITY_RULES_CLOUD_SOURCE_UNAVAILABLE') {
    super(code)
    this.name = 'UserCapabilityRulesV2ServiceError'
  }
}

export class UserCapabilityRulesV2Service {
  readonly #draftRepo: UserCapabilityRuleDraftV2Repo
  readonly #coreRepo: CapabilityRuleCoreV2Repo
  readonly #legacyCoreRepo: CapabilityRuleCoreV1Repo
  readonly #legacyDraftRepo: UserCapabilityRuleDraftV1Repo
  readonly #materializationRepo: CapabilityRuleMaterializationV1Repo
  readonly #sourceRepo: CanonicalModelFactSourceV1Repo
  readonly #cloudApplicationRepo: CloudRulesApplicationV1Repo
  readonly #sourceScopeId = buildCapabilityRuleSourceScopeIdV1({
    ruleStoreId: CAPABILITY_RULE_MATERIALIZATION_RULE_STORE_ID_V1,
  })

  constructor(
    private readonly db: BetterSqlite3.Database,
    private readonly subjectSetReader: UserCapabilityRulesSubjectSetReaderV1,
    private readonly nowMs: () => number = Date.now,
  ) {
    this.#draftRepo = new UserCapabilityRuleDraftV2Repo(db, nowMs)
    this.#coreRepo = new CapabilityRuleCoreV2Repo(db, nowMs)
    this.#legacyCoreRepo = new CapabilityRuleCoreV1Repo(db, nowMs)
    this.#legacyDraftRepo = new UserCapabilityRuleDraftV1Repo(db, nowMs)
    this.#materializationRepo = new CapabilityRuleMaterializationV1Repo(db, nowMs)
    this.#sourceRepo = new CanonicalModelFactSourceV1Repo(db, nowMs)
    this.#cloudApplicationRepo = new CloudRulesApplicationV1Repo(db, nowMs)
  }

  readCommitted(): Readonly<{
    snapshot: ReturnType<CapabilityRuleCoreV2Repo['readOwnershipSnapshot']>
    notes: ReturnType<UserCapabilityRuleDraftV2Repo['readCommittedNotes']>
  }> {
    return Object.freeze({ snapshot: this.#coreRepo.readOwnershipSnapshot({ ownership: 'user',
      ownerId: USER_RULES_LOCAL_OWNER_ID_V1 }), notes: this.#draftRepo.readCommittedNotes() })
  }

  readDraft(): UserCapabilityRuleDraftV2 | null { return this.#draftRepo.readDraft() }

  openDraft(input: Readonly<{ sessionId: string }>): UserCapabilityRuleDraftV2 {
    const existing = this.#draftRepo.readDraft()
    if (existing) return existing
    const v1Committed = this.#legacyCoreRepo.readOwnershipSnapshot({ ownership: 'user',
      ownerId: USER_RULES_LOCAL_OWNER_ID_V1 })
    const v1Draft = this.#legacyDraftRepo.readDraft()
    const v1Notes = this.#legacyDraftRepo.readCommittedNotes()
    const v2Committed = this.#coreRepo.readOwnershipSnapshot({ ownership: 'user',
      ownerId: USER_RULES_LOCAL_OWNER_ID_V1 })
    const v2Notes = this.#draftRepo.readCommittedNotes()
    const legacyDefinition = v1Draft?.projected.definition ?? v1Committed?.projected.definition
    const migrated = legacyDefinition
      ? migrateCapabilityRuleOwnershipSnapshotV1ToV2(legacyDefinition)
      : null
    const merged = mergeMigratedSnapshot(v2Committed?.projected.definition ?? null, migrated)
    const primaryNotes = v1Draft?.notes ?? v1Notes.notes
    const notes = mergeNotes(v2Notes.notes, primaryNotes, merged)
    const legacyV1Source: LegacyV1UserSourceBaselineV2 = Object.freeze({ schemaVersion: 1,
      committedSnapshotRevision: v1Committed?.projected.snapshotRevision ?? null,
      committedNotesRevision: v1Notes.revision,
      committedNotesDigest: noteDigest(v1Notes.notes),
      reservedCloudOwners: Object.freeze(RESERVED_CLOUD_OWNER_IDS.map(ownerId => Object.freeze({ ownerId,
        snapshotRevision: this.#legacyCoreRepo.readOwnershipSnapshot({ ownership: 'cloud', ownerId })
          ?.projected.snapshotRevision ?? null }))),
      draft: legacyDraftBaseline(v1Draft) })
    return this.#draftRepo.openOrCreate({ ...input, snapshot: merged, notes, legacyV1Source })
  }

  replaceDraft(input: Readonly<{
    sessionId: string
    expectedDraftRevision: number
    snapshot: unknown
    notes: readonly UserCapabilityRuleNoteV2[]
  }>): UserCapabilityRuleDraftV2 {
    this.#requiredDraft(input)
    return this.#draftRepo.replaceDraft(input)
  }

  addRule(input: Readonly<{
    sessionId: string
    expectedDraftRevision: number
    targetPackId: string | null
    firstPack: Readonly<{ packId: string; displayName: string }>
    rule: CapabilityRuleCoreRuleV2
    note?: string | null
  }>): UserCapabilityRuleDraftV2 {
    const draft = this.#requiredDraft(input)
    const rule = decodeCapabilityRuleCoreRuleV2(input.rule)
    if (draft.projected.definition.packs.some(pack => pack.rules.some(existing => existing.ruleId === rule.ruleId))) {
      throw new UserCapabilityRulesV2ServiceError('GENERATION_V2_USER_CAPABILITY_RULES_IDENTITY_COLLISION')
    }
    let packs = [...draft.projected.definition.packs]
    let targetPackId = input.targetPackId
    if (packs.length === 0) {
      targetPackId = input.firstPack.packId
      packs.push(Object.freeze({ schemaVersion: 2, packId: input.firstPack.packId,
        displayName: input.firstPack.displayName, description: null, priority: 0,
        mode: 'no_control', target: 'enabled', rules: Object.freeze([]) }))
    }
    if (targetPackId === null) invalid()
    let found = false
    packs = packs.map(pack => {
      if (pack.packId !== targetPackId) return pack
      found = true
      return Object.freeze({ ...pack, rules: Object.freeze([...pack.rules, rule]) })
    })
    if (!found) throw new UserCapabilityRulesV2ServiceError('GENERATION_V2_USER_CAPABILITY_RULES_PACK_NOT_FOUND')
    const notes = [...draft.notes]
    if (input.note !== undefined && input.note !== null && input.note !== '') {
      notes.push(Object.freeze({ ruleId: rule.ruleId, note: input.note }))
    }
    return this.#draftRepo.replaceDraft({ expectedDraftRevision: draft.draftRevision,
      snapshot: ownershipSnapshot(packs), notes })
  }

  rewritePack(input: Readonly<{ sessionId: string; expectedDraftRevision: number; packId: string }>): UserCapabilityRuleDraftV2 {
    const draft = this.#requiredDraft(input)
    const pack = packById(draft, input.packId)
    const plan = planCapabilityRuleRewriteV1({ mode: pack.mode, target: pack.target, rules: pack.rules })
    assertCapabilityRuleRewriteAvailableV1(plan)
    const changed = new Map(plan.changedRules.map(rule => [rule.ruleId, rule.configured]))
    const packs = draft.projected.definition.packs.map(entry => entry.packId !== pack.packId ? entry
      : Object.freeze({ ...entry, rules: Object.freeze(entry.rules.map(rule =>
        changed.has(rule.ruleId) ? Object.freeze({ ...rule, configured: changed.get(rule.ruleId)! }) : rule)) }))
    return this.#draftRepo.replaceDraft({ expectedDraftRevision: draft.draftRevision,
      snapshot: ownershipSnapshot(packs), notes: draft.notes })
  }

  importPack(input: Readonly<{ sessionId: string; expectedDraftRevision: number; transfer: unknown }>): UserCapabilityRuleDraftV2 {
    const draft = this.#requiredDraft(input)
    const transfer = decodeUserRulePackTransferV2(input.transfer)
    const legacyImport = Boolean(input.transfer && typeof input.transfer === 'object' &&
      (input.transfer as Record<string, unknown>).schemaVersion === 1)
    const existingPack = draft.projected.definition.packs.find(pack => pack.packId === transfer.pack.packId)
    const legacyCloudSnapshot = this.#legacyCoreRepo.readOwnershipSnapshot({ ownership: 'cloud',
      ownerId: transfer.pack.packId })
    const legacyCloudPack = legacyCloudSnapshot
      ? migrateCapabilityRuleOwnershipSnapshotV1ToV2(legacyCloudSnapshot.projected.definition).packs
        .find(pack => pack.packId === transfer.pack.packId) ?? null
      : null
    const settingsSource = existingPack ?? legacyCloudPack
    const outsideRuleIds = new Set(draft.projected.definition.packs.filter(pack => pack.packId !== transfer.pack.packId)
      .flatMap(pack => pack.rules.map(rule => rule.ruleId)))
    if (transfer.pack.rules.some(rule => outsideRuleIds.has(rule.ruleId))) {
      throw new UserCapabilityRulesV2ServiceError('GENERATION_V2_USER_CAPABILITY_RULES_IDENTITY_COLLISION')
    }
    const existingRules = new Map(settingsSource?.rules.map(rule => [rule.ruleId, rule]) ?? [])
    if (legacyImport && transfer.pack.rules.some(rule => {
      const prior = existingRules.get(rule.ruleId)
      return prior && (prior.effect.kind !== 'fact_assertion' || prior.when !== null || prior.dependencies.length > 0 ||
        prior.decisionKey !== rule.decisionKey)
    })) throw new UserCapabilityRulesV2ServiceError('GENERATION_V2_USER_CAPABILITY_RULES_IDENTITY_COLLISION')
    const retainedRules = legacyImport ? existingPack?.rules.filter(rule =>
      !transfer.pack.rules.some(incoming => incoming.ruleId === rule.ruleId)) ?? [] : []
    const importedPack = settingsSource ? Object.freeze({ ...transfer.pack,
      priority: settingsSource.priority, mode: settingsSource.mode, target: settingsSource.target,
      rules: Object.freeze([...transfer.pack.rules.map(rule => {
        const prior = existingRules.get(rule.ruleId)
        return prior ? Object.freeze({ ...rule, configured: prior.configured, priority: prior.priority,
          label: prior.label, description: prior.description }) : rule
      }), ...retainedRules]) }) : transfer.pack
    const packs = existingPack
      ? draft.projected.definition.packs.map(pack => pack.packId === transfer.pack.packId ? importedPack : pack)
      : [...draft.projected.definition.packs, importedPack]
    const importedRuleIds = new Set(transfer.pack.rules.map(rule => rule.ruleId))
    const finalRuleIds = new Set(importedPack.rules.map(rule => rule.ruleId))
    const transferNotes = new Map(transfer.notes.map(note => [note.ruleId, note]))
    const previousNotes = draft.notes.filter(note => importedRuleIds.has(note.ruleId))
    const notes = [...draft.notes.filter(note => !existingPack ||
      !existingPack.rules.some(rule => rule.ruleId === note.ruleId) || finalRuleIds.has(note.ruleId)),
    ...[...transferNotes.values()].filter(note => !previousNotes.some(old => old.ruleId === note.ruleId))]
    return this.#draftRepo.replaceDraft({ expectedDraftRevision: draft.draftRevision,
      snapshot: ownershipSnapshot(packs), notes })
  }

  exportCommittedPack(input: Readonly<{ packId: string }>): UserRulePackTransferV2 {
    const draft = this.#draftRepo.readDraft()
    if (draft?.dirty) throw new UserCapabilityRulesV2ServiceError('GENERATION_V2_USER_CAPABILITY_RULES_EXPORT_DIRTY')
    const committed = this.#coreRepo.readOwnershipSnapshot({ ownership: 'user', ownerId: USER_RULES_LOCAL_OWNER_ID_V1 })
    const pack = committed?.projected.definition.packs.find(entry => entry.packId === input.packId)
    if (!pack) throw new UserCapabilityRulesV2ServiceError('GENERATION_V2_USER_CAPABILITY_RULES_PACK_NOT_FOUND')
    const ruleIds = new Set(pack.rules.map(rule => rule.ruleId))
    const notes = this.#draftRepo.readCommittedNotes().notes.filter(note => ruleIds.has(note.ruleId))
    return createUserRulePackTransferV2({ pack, notes })
  }

  async saveDraft(input: Readonly<{ sessionId: string; expectedDraftRevision: number }>): Promise<Readonly<{
    snapshotRevision: string
    canonicalSourceRevision: string
    requestRulesPublicationRevision: string
  }>> {
    const draft = this.#requiredDraft(input)
    if (draft.sessionId !== input.sessionId) this.#stale()
    if (this.#cloudApplicationRepo.readState().appliedIntegrity === 'invalid') {
      throw new UserCapabilityRulesV2ServiceError('GENERATION_V2_USER_CAPABILITY_RULES_CLOUD_SOURCE_UNAVAILABLE')
    }
    const committed = this.#coreRepo.readOwnershipSnapshot({ ownership: 'user', ownerId: USER_RULES_LOCAL_OWNER_ID_V1 })
    if ((committed?.projected.snapshotRevision ?? null) !== draft.baseSnapshotRevision) this.#stale()
    const committedNotes = this.#draftRepo.readCommittedNotes()
    const coreWrite = prepareCapabilityRuleOwnershipSnapshotWriteV2(draft.projected.definition)
    const legacyV1User = this.#legacyCoreRepo.readOwnershipSnapshot({ ownership: 'user',
      ownerId: USER_RULES_LOCAL_OWNER_ID_V1 })
    const legacyV1Notes = this.#legacyDraftRepo.readCommittedNotes()
    const legacyV1Draft = this.#legacyDraftRepo.readDraft()
    const legacySource = draft.legacyV1Source
    if (!legacySource) this.#stale()
    assertReservedCloudBaseline(legacySource)
    const currentLegacyDraft = legacyDraftBaseline(legacyV1Draft)
    if ((legacyV1User?.projected.snapshotRevision ?? null) !== legacySource.committedSnapshotRevision ||
        legacyV1Notes.revision !== legacySource.committedNotesRevision ||
        noteDigest(legacyV1Notes.notes) !== legacySource.committedNotesDigest ||
        !sameLegacyDraft(currentLegacyDraft, legacySource.draft)) this.#stale()
    const currentReservedCloudOwners = RESERVED_CLOUD_OWNER_IDS.map(ownerId => ({ ownerId,
      expectedSnapshotRevision: legacySource.reservedCloudOwners.find(entry => entry.ownerId === ownerId)!
        .snapshotRevision,
      snapshot: this.#legacyCoreRepo.readOwnershipSnapshot({ ownership: 'cloud', ownerId }),
    }))
    const importedReservedIds = new Set(draft.projected.definition.packs
      .filter(pack => RESERVED_CLOUD_OWNER_IDS.includes(pack.packId as typeof RESERVED_CLOUD_OWNER_IDS[number]))
      .map(pack => pack.packId))
    const migrateReservedCloudOwners = COMPLETE_RULE_MIGRATION_PACK_IDS.every(packId =>
      draft.projected.definition.packs.some(pack => pack.packId === packId && pack.rules.length > 0))
    const reservedCloudOwners = migrateReservedCloudOwners ? currentReservedCloudOwners : []
    const reservedCloudCasOwners = migrateReservedCloudOwners ? currentReservedCloudOwners
      : currentReservedCloudOwners.filter(owner => importedReservedIds.has(owner.ownerId))
    if (reservedCloudCasOwners.some(owner => (owner.snapshot?.projected.snapshotRevision ?? null) !==
        owner.expectedSnapshotRevision)) this.#stale()
    const subjectSet = await this.subjectSetReader.readCurrent()
    const requestRulesPublication = prepareGenerationRequestRulesPublicationV2(this.db, subjectSet,
      coreWrite.projected.definition, undefined,
      CAPABILITY_RULE_MATERIALIZATION_DEFAULT_ACTIVATION_POLICIES_V1)
    // R4-09 (P3a-07): an owner row that no longer decodes is left out of this publication rather than blocking the
    // save of the user's own rules; it stays in the database untouched.
    const readableV2 = this.#coreRepo.listReadableOwnershipSnapshots()
    const readableV1 = this.#legacyCoreRepo.listReadableOwnershipSnapshots()
    if (readableV2.unreadable.length > 0 || readableV1.unreadable.length > 0) {
      console.warn('[capability-rules] skipped unreadable owner snapshots while saving user rules',
        { v2: readableV2.unreadable, v1: readableV1.unreadable })
    }
    const activeV2Snapshots = readableV2.snapshots
      .filter(snapshot => !(snapshot.projected.definition.ownership === 'user' &&
        snapshot.projected.definition.ownerId === USER_RULES_LOCAL_OWNER_ID_V1))
      .map(snapshot => snapshot.projected)
    activeV2Snapshots.push(coreWrite.projected)
    const v2OwnerKeys = new Set(activeV2Snapshots.map(snapshot =>
      `${snapshot.definition.ownership}\0${snapshot.definition.ownerId}`))
    const reservedOwnerKeys = new Set(reservedCloudOwners.map(({ ownerId }) => `cloud\0${ownerId}`))
    const activeV1Snapshots = readableV1.snapshots
      .filter(snapshot => !v2OwnerKeys.has(`${snapshot.projected.definition.ownership}\0${snapshot.projected.definition.ownerId}`) &&
        !reservedOwnerKeys.has(`${snapshot.projected.definition.ownership}\0${snapshot.projected.definition.ownerId}`))
      .map(snapshot => snapshot.projected)
    const ownershipSnapshots = [...activeV1Snapshots, ...activeV2Snapshots]
    const materialization = prepareCapabilityRuleMaterializationV1({ sourceScopeId: this.#sourceScopeId,
      subjectSet, ownershipSnapshots,
      defaultActivationPolicies: CAPABILITY_RULE_MATERIALIZATION_DEFAULT_ACTIVATION_POLICIES_V1 })
    const expectedMaterializationRevision = this.#materializationRepo.readStage(this.#sourceScopeId)
      ?.materializationRevision ?? null
    const expectedActiveSourceRevision = this.#sourceRepo.readSourceState('capability_rule', this.#sourceScopeId)
      ?.currentSourceRevision ?? null
    const currentSubjectSet = await this.subjectSetReader.readCurrent()
    if (currentSubjectSet.subjectSetRevision !== materialization.authoritativeSubjectSetRevision) this.#stale()

    return this.db.transaction(() => {
      const currentDraft = this.#draftRepo.readDraft()
      const currentCommitted = this.#coreRepo.readOwnershipSnapshot({ ownership: 'user',
        ownerId: USER_RULES_LOCAL_OWNER_ID_V1 })
      const currentLegacyUser = this.#legacyCoreRepo.readOwnershipSnapshot({ ownership: 'user',
        ownerId: USER_RULES_LOCAL_OWNER_ID_V1 })
      const currentLegacyNotes = this.#legacyDraftRepo.readCommittedNotes()
      const currentLegacyDraft = this.#legacyDraftRepo.readDraft()
      const txReservedCloudOwners = reservedCloudCasOwners.map(({ ownerId }) => ({ ownerId,
        snapshotRevision: this.#legacyCoreRepo.readOwnershipSnapshot({ ownership: 'cloud', ownerId })
          ?.projected.snapshotRevision ?? null }))
      const currentStage = this.#materializationRepo.readStage(this.#sourceScopeId)
      const currentSource = this.#sourceRepo.readSourceState('capability_rule', this.#sourceScopeId)
      if (!currentDraft || currentDraft.sessionId !== input.sessionId ||
          currentDraft.draftRevision !== input.expectedDraftRevision ||
          currentDraft.baseSnapshotRevision !== draft.baseSnapshotRevision ||
          (currentCommitted?.projected.snapshotRevision ?? null) !== draft.baseSnapshotRevision ||
          (currentLegacyUser?.projected.snapshotRevision ?? null) !== legacySource.committedSnapshotRevision ||
          currentLegacyNotes.revision !== legacySource.committedNotesRevision ||
          noteDigest(currentLegacyNotes.notes) !== legacySource.committedNotesDigest ||
          !sameLegacyDraft(legacyDraftBaseline(currentLegacyDraft), legacySource.draft) ||
          txReservedCloudOwners.some(owner => owner.snapshotRevision !==
            legacySource.reservedCloudOwners.find(entry => entry.ownerId === owner.ownerId)?.snapshotRevision) ||
          this.#draftRepo.readCommittedNotes().revision !== committedNotes.revision ||
          (currentStage?.materializationRevision ?? null) !== expectedMaterializationRevision ||
          (currentSource?.currentSourceRevision ?? null) !== expectedActiveSourceRevision ||
          this.#cloudApplicationRepo.readState().appliedIntegrity === 'invalid') this.#stale()

      const installed = this.#coreRepo.replacePreparedOwnershipSnapshot({
        expectedSnapshotRevision: draft.baseSnapshotRevision, prepared: coreWrite })
      if (legacyV1User || legacyV1Notes.notes.length > 0) {
        this.#legacyDraftRepo.retireCommittedNotesExpected({ expectedRevision: legacySource.committedNotesRevision,
          expectedSnapshotRevision: legacySource.committedSnapshotRevision })
      }
      this.#legacyCoreRepo.deleteOwnershipSnapshot({ ownership: 'user', ownerId: USER_RULES_LOCAL_OWNER_ID_V1,
        expectedSnapshotRevision: legacySource.committedSnapshotRevision })
      if (legacySource.draft) this.#legacyDraftRepo.deleteDraftExpected({ sessionId: legacySource.draft.sessionId,
        expectedDraftRevision: legacySource.draft.draftRevision })
      for (const reserved of reservedCloudOwners) {
        this.#legacyCoreRepo.deleteOwnershipSnapshot({ ownership: 'cloud', ownerId: reserved.ownerId,
          expectedSnapshotRevision: reserved.expectedSnapshotRevision })
      }
      writeGenerationRequestRulesPublicationV2(this.db, requestRulesPublication)
      const staged = this.#materializationRepo.stagePrepared({ prepared: materialization,
        expectedMaterializationRevision,
        currentAuthoritativeSubjectSetRevision: currentSubjectSet.subjectSetRevision })
      const timestamp = this.nowMs()
      const promoted = this.#sourceRepo.promoteStagedCompleteSourceRevision({
        sourceKind: 'capability_rule', sourceScopeId: this.#sourceScopeId,
        canonicalSourceRevision: staged.stage.canonicalSourceRevision,
        expectedCurrentRevision: expectedActiveSourceRevision,
        fetchedAtMs: timestamp, lastAttemptedAtMs: timestamp })
      this.#draftRepo.replaceCommittedNotes({ expectedRevision: committedNotes.revision,
        notes: draft.notes, committedSnapshot: installed.projected.definition })
      this.#draftRepo.deleteDraftExpected({ sessionId: input.sessionId,
        expectedDraftRevision: input.expectedDraftRevision })
      return Object.freeze({ snapshotRevision: installed.projected.snapshotRevision,
        canonicalSourceRevision: promoted.source.sourceRevision.canonicalSourceRevision,
        requestRulesPublicationRevision: requestRulesPublication.publicationRevision })
    }).immediate()
  }

  cancelDraft(input: Readonly<{ sessionId: string; expectedDraftRevision: number }>): void {
    // Cancelling does not need the draft's content, so a draft that no longer decodes can still be cancelled.
    const header = this.#draftRepo.readDraftHeader()
    if (!header || header.sessionId !== input.sessionId || header.draftRevision !== input.expectedDraftRevision) this.#stale()
    this.#draftRepo.discard(input)
  }

  #requiredDraft(input: Readonly<{ sessionId: string; expectedDraftRevision: number }>): UserCapabilityRuleDraftV2 {
    const draft = this.#draftRepo.readDraft()
    if (!draft || draft.sessionId !== input.sessionId || draft.draftRevision !== input.expectedDraftRevision) this.#stale()
    return draft
  }

  #stale(): never {
    throw new UserCapabilityRulesV2ServiceError('GENERATION_V2_USER_CAPABILITY_RULES_STALE')
  }
}
