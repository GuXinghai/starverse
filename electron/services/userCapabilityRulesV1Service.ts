import type BetterSqlite3 from 'better-sqlite3'
import {
  assertCapabilityRuleRewriteAvailableV1,
  planCapabilityRuleRewriteV1,
  type CapabilityRuleCorePackV1,
  type CapabilityRuleCoreRuleV1,
  type CapabilityRuleOwnershipSnapshotV1,
} from '../../src/next/generation-v2/capability-rules/capabilityRuleCoreV1'
import {
  createUserRulePackTransferV1,
  decodeUserRulePackTransferV1,
  USER_RULES_LOCAL_OWNER_ID_V1,
  type UserCapabilityRuleNoteV1,
  type UserRulePackTransferV1,
} from '../../src/next/generation-v2/capability-rules/userRulePackTransferV1'
import { prepareCapabilityRuleMaterializationV1 } from
  '../../src/next/generation-v2/model-facts/materializedCapabilityRuleSourceV1'
import type { AuthoritativeModelSubjectSetV1 } from
  '../../src/next/generation-v2/model-facts/authoritativeModelSubjectSetV1'
import { buildCapabilityRuleSourceScopeIdV1 } from
  '../../src/next/generation-v2/model-facts/sourceScopeV1'
import {
  CapabilityRuleCoreV1Repo,
  prepareCapabilityRuleOwnershipSnapshotWriteV1,
} from '../../infra/db/repo/capabilityRuleCoreV1Repo'
import { CapabilityRuleMaterializationV1Repo } from
  '../../infra/db/repo/capabilityRuleMaterializationV1Repo'
import { CanonicalModelFactSourceV1Repo } from
  '../../infra/db/repo/canonicalModelFactSourceV1Repo'
import { CloudRulesApplicationV1Repo } from '../../infra/db/repo/cloudRulesApplicationV1Repo'
import { UserCapabilityRuleDraftV1Repo,
  type UserCapabilityRuleDraftV1 } from '../../infra/db/repo/userCapabilityRuleDraftV1Repo'
import {
  CAPABILITY_RULE_MATERIALIZATION_DEFAULT_ACTIVATION_POLICIES_V1,
  CAPABILITY_RULE_MATERIALIZATION_RULE_STORE_ID_V1,
} from './capabilityRuleMaterializationSchedulerV1Service'

export interface UserCapabilityRulesSubjectSetReaderV1 {
  readCurrent(): Promise<AuthoritativeModelSubjectSetV1>
}

export class UserCapabilityRulesV1ServiceError extends Error {
  constructor(readonly code:
    | 'GENERATION_V2_USER_CAPABILITY_RULES_INVALID'
    | 'GENERATION_V2_USER_CAPABILITY_RULES_STALE'
    | 'GENERATION_V2_USER_CAPABILITY_RULES_EXPORT_DIRTY'
    | 'GENERATION_V2_USER_CAPABILITY_RULES_PACK_NOT_FOUND'
    | 'GENERATION_V2_USER_CAPABILITY_RULES_IDENTITY_COLLISION'
    | 'GENERATION_V2_USER_CAPABILITY_RULES_CLOUD_SOURCE_UNAVAILABLE') {
    super(code)
    this.name = 'UserCapabilityRulesV1ServiceError'
  }
}

function invalid(): never {
  throw new UserCapabilityRulesV1ServiceError('GENERATION_V2_USER_CAPABILITY_RULES_INVALID')
}

function ownershipSnapshot(packs: readonly CapabilityRuleCorePackV1[]): CapabilityRuleOwnershipSnapshotV1 {
  return Object.freeze({ schemaVersion: 1, ownership: 'user', ownerId: USER_RULES_LOCAL_OWNER_ID_V1,
    packs: Object.freeze([...packs]) })
}

function packById(draft: UserCapabilityRuleDraftV1, packId: string): CapabilityRuleCorePackV1 {
  const pack = draft.projected.definition.packs.find((entry) => entry.packId === packId)
  if (!pack) throw new UserCapabilityRulesV1ServiceError(
    'GENERATION_V2_USER_CAPABILITY_RULES_PACK_NOT_FOUND')
  return pack
}

export class UserCapabilityRulesV1Service {
  readonly #draftRepo: UserCapabilityRuleDraftV1Repo
  readonly #coreRepo: CapabilityRuleCoreV1Repo
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
    this.#draftRepo = new UserCapabilityRuleDraftV1Repo(db, nowMs)
    this.#coreRepo = new CapabilityRuleCoreV1Repo(db, nowMs)
    this.#materializationRepo = new CapabilityRuleMaterializationV1Repo(db, nowMs)
    this.#sourceRepo = new CanonicalModelFactSourceV1Repo(db, nowMs)
    this.#cloudApplicationRepo = new CloudRulesApplicationV1Repo(db, nowMs)
  }

  openDraft(input: Readonly<{ sessionId: string }>): UserCapabilityRuleDraftV1 {
    return this.#draftRepo.openOrCreate(input)
  }

  replaceDraft(input: Readonly<{
    sessionId: string
    expectedDraftRevision: number
    snapshot: unknown
    notes: readonly UserCapabilityRuleNoteV1[]
  }>): UserCapabilityRuleDraftV1 {
    this.#requiredDraft(input)
    return this.#draftRepo.replaceDraft(input)
  }

  cancelDraft(input: Readonly<{ sessionId: string; expectedDraftRevision: number }>): void {
    this.#requiredDraft(input)
    this.#draftRepo.discard(input)
  }

  addRule(input: Readonly<{
    sessionId: string
    expectedDraftRevision: number
    targetPackId: string | null
    firstPack: Readonly<{ packId: string; displayName: string }>
    rule: CapabilityRuleCoreRuleV1
    note?: string | null
  }>): UserCapabilityRuleDraftV1 {
    const draft = this.#requiredDraft(input)
    if (draft.projected.definition.packs.some((pack) => pack.rules.some((rule) =>
      rule.ruleId === input.rule.ruleId))) {
      throw new UserCapabilityRulesV1ServiceError('GENERATION_V2_USER_CAPABILITY_RULES_IDENTITY_COLLISION')
    }
    let packs = [...draft.projected.definition.packs]
    let targetPackId = input.targetPackId
    if (packs.length === 0) {
      targetPackId = input.firstPack.packId
      packs.push(Object.freeze({ schemaVersion: 1, packId: input.firstPack.packId,
        displayName: input.firstPack.displayName, description: null, priority: 0,
        mode: 'no_control', target: 'enabled', rules: Object.freeze([]) }))
    }
    if (targetPackId === null) invalid()
    let found = false
    packs = packs.map((pack) => {
      if (pack.packId !== targetPackId) return pack
      found = true
      return Object.freeze({ ...pack, rules: Object.freeze([...pack.rules, input.rule]) })
    })
    if (!found) throw new UserCapabilityRulesV1ServiceError(
      'GENERATION_V2_USER_CAPABILITY_RULES_PACK_NOT_FOUND')
    const notes = [...draft.notes]
    if (input.note !== undefined && input.note !== null && input.note !== '') {
      notes.push(Object.freeze({ ruleId: input.rule.ruleId, note: input.note }))
    }
    return this.#draftRepo.replaceDraft({ expectedDraftRevision: draft.draftRevision,
      snapshot: ownershipSnapshot(packs), notes })
  }

  rewritePack(input: Readonly<{
    sessionId: string
    expectedDraftRevision: number
    packId: string
  }>): UserCapabilityRuleDraftV1 {
    const draft = this.#requiredDraft(input)
    const pack = packById(draft, input.packId)
    const plan = planCapabilityRuleRewriteV1({ mode: pack.mode, target: pack.target, rules: pack.rules })
    assertCapabilityRuleRewriteAvailableV1(plan)
    const changed = new Map(plan.changedRules.map((rule) => [rule.ruleId, rule.configured]))
    const packs = draft.projected.definition.packs.map((entry) => entry.packId !== pack.packId ? entry
      : Object.freeze({ ...entry, rules: Object.freeze(entry.rules.map((rule) =>
        changed.has(rule.ruleId) ? Object.freeze({ ...rule, configured: changed.get(rule.ruleId)! }) : rule)) }))
    return this.#draftRepo.replaceDraft({ expectedDraftRevision: draft.draftRevision,
      snapshot: ownershipSnapshot(packs), notes: draft.notes })
  }

  importPack(input: Readonly<{
    sessionId: string
    expectedDraftRevision: number
    transfer: unknown
  }>): UserCapabilityRuleDraftV1 {
    const draft = this.#requiredDraft(input)
    const transfer = decodeUserRulePackTransferV1(input.transfer)
    const existingPack = draft.projected.definition.packs.find((pack) => pack.packId === transfer.pack.packId)
    const outsideRuleIds = new Set(draft.projected.definition.packs
      .filter((pack) => pack.packId !== transfer.pack.packId)
      .flatMap((pack) => pack.rules.map((rule) => rule.ruleId)))
    if (transfer.pack.rules.some((rule) => outsideRuleIds.has(rule.ruleId))) {
      throw new UserCapabilityRulesV1ServiceError('GENERATION_V2_USER_CAPABILITY_RULES_IDENTITY_COLLISION')
    }
    const packs = existingPack
      ? draft.projected.definition.packs.map((pack) => pack.packId === transfer.pack.packId
        ? transfer.pack : pack)
      : [...draft.projected.definition.packs, transfer.pack]
    const replacedRuleIds = new Set(existingPack?.rules.map((rule) => rule.ruleId) ?? [])
    const notes = [...draft.notes.filter((note) => !replacedRuleIds.has(note.ruleId)), ...transfer.notes]
    return this.#draftRepo.replaceDraft({ expectedDraftRevision: draft.draftRevision,
      snapshot: ownershipSnapshot(packs), notes })
  }

  exportCommittedPack(input: Readonly<{ packId: string }>): UserRulePackTransferV1 {
    const draft = this.#draftRepo.readDraft()
    if (draft?.dirty) throw new UserCapabilityRulesV1ServiceError(
      'GENERATION_V2_USER_CAPABILITY_RULES_EXPORT_DIRTY')
    const committed = this.#coreRepo.readOwnershipSnapshot({ ownership: 'user',
      ownerId: USER_RULES_LOCAL_OWNER_ID_V1 })
    const pack = committed?.projected.definition.packs.find((entry) => entry.packId === input.packId)
    if (!pack) throw new UserCapabilityRulesV1ServiceError(
      'GENERATION_V2_USER_CAPABILITY_RULES_PACK_NOT_FOUND')
    const ruleIds = new Set(pack.rules.map((rule) => rule.ruleId))
    const notes = this.#draftRepo.readCommittedNotes().notes.filter((note) => ruleIds.has(note.ruleId))
    return createUserRulePackTransferV1({ pack, notes })
  }

  async saveDraft(input: Readonly<{
    sessionId: string
    expectedDraftRevision: number
  }>): Promise<Readonly<{ snapshotRevision: string; canonicalSourceRevision: string }>> {
    const draft = this.#requiredDraft(input)
    if (draft.sessionId !== input.sessionId) this.#stale()
    if (this.#cloudApplicationRepo.readState().appliedIntegrity === 'invalid') {
      throw new UserCapabilityRulesV1ServiceError(
        'GENERATION_V2_USER_CAPABILITY_RULES_CLOUD_SOURCE_UNAVAILABLE')
    }
    const committed = this.#coreRepo.readOwnershipSnapshot({ ownership: 'user',
      ownerId: USER_RULES_LOCAL_OWNER_ID_V1 })
    if ((committed?.projected.snapshotRevision ?? null) !== draft.baseSnapshotRevision) this.#stale()
    const committedNotes = this.#draftRepo.readCommittedNotes()
    const coreWrite = prepareCapabilityRuleOwnershipSnapshotWriteV1(draft.projected.definition)
    const ownershipSnapshots = this.#coreRepo.listOwnershipSnapshots()
      .filter((snapshot) => !(snapshot.projected.definition.ownership === 'user' &&
        snapshot.projected.definition.ownerId === USER_RULES_LOCAL_OWNER_ID_V1))
      .map((snapshot) => snapshot.projected)
    ownershipSnapshots.push(coreWrite.projected)
    const subjectSet = await this.subjectSetReader.readCurrent()
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
      const currentStage = this.#materializationRepo.readStage(this.#sourceScopeId)
      const currentSource = this.#sourceRepo.readSourceState('capability_rule', this.#sourceScopeId)
      if (!currentDraft || currentDraft.sessionId !== input.sessionId ||
          currentDraft.draftRevision !== input.expectedDraftRevision ||
          currentDraft.baseSnapshotRevision !== draft.baseSnapshotRevision ||
          (currentCommitted?.projected.snapshotRevision ?? null) !== draft.baseSnapshotRevision ||
          this.#draftRepo.readCommittedNotes().revision !== committedNotes.revision ||
          (currentStage?.materializationRevision ?? null) !== expectedMaterializationRevision ||
          (currentSource?.currentSourceRevision ?? null) !== expectedActiveSourceRevision ||
          this.#cloudApplicationRepo.readState().appliedIntegrity === 'invalid') this.#stale()

      const installed = this.#coreRepo.replacePreparedOwnershipSnapshot({
        expectedSnapshotRevision: draft.baseSnapshotRevision, prepared: coreWrite })
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
        canonicalSourceRevision: promoted.source.sourceRevision.canonicalSourceRevision })
    }).immediate()
  }

  #requiredDraft(input: Readonly<{
    sessionId: string
    expectedDraftRevision: number
  }>): UserCapabilityRuleDraftV1 {
    const draft = this.#draftRepo.readDraft()
    if (!draft || draft.sessionId !== input.sessionId ||
        draft.draftRevision !== input.expectedDraftRevision) this.#stale()
    return draft
  }

  #stale(): never {
    throw new UserCapabilityRulesV1ServiceError('GENERATION_V2_USER_CAPABILITY_RULES_STALE')
  }
}
