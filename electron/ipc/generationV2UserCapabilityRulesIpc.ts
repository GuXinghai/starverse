import { randomUUID } from 'node:crypto'
import type BetterSqlite3 from 'better-sqlite3'
import { AuthoritativeModelSubjectSetV1Service } from '../../infra/db/services/authoritativeModelSubjectSetV1Service'
import {
  decodeCapabilityRuleCoreRuleV1,
  decodeCapabilityRuleOwnershipSnapshotV1,
} from '../../src/next/generation-v2/capability-rules/capabilityRuleCoreV1'
import { decodeUserRulePackTransferV1, type UserCapabilityRuleNoteV1 } from
  '../../src/next/generation-v2/capability-rules/userRulePackTransferV1'
import type { Epoch2RuntimeCredentialService } from '../credentials/epoch2RuntimeCredentialService'
import { type createOpenAICompatibleCredentialV2Service } from
  '../credentials/openAICompatibleCredentialV2Service'
import { UserCapabilityRulesV1Service } from '../services/userCapabilityRulesV1Service'
import type { RegisterInvoke } from './types'

export const GENERATION_V2_USER_CAPABILITY_RULES_IPC_CHANNELS = Object.freeze([
  'generation-v2:capability-rules:user:read-committed',
  'generation-v2:capability-rules:user:read-draft',
  'generation-v2:capability-rules:user:open-draft',
  'generation-v2:capability-rules:user:replace-draft',
  'generation-v2:capability-rules:user:add-rule',
  'generation-v2:capability-rules:user:rewrite-pack',
  'generation-v2:capability-rules:user:import-pack',
  'generation-v2:capability-rules:user:export-committed-pack',
  'generation-v2:capability-rules:user:save-draft',
  'generation-v2:capability-rules:user:cancel-draft',
] as const)

function plainObject(value: unknown): value is Record<string, unknown> {
  return Boolean(value && typeof value === 'object' && !Array.isArray(value) &&
    (Object.getPrototypeOf(value) === Object.prototype || Object.getPrototypeOf(value) === null))
}

function exactKeys(value: Record<string, unknown>, keys: readonly string[]): void {
  const actual = Object.keys(value).sort()
  const expected = [...keys].sort()
  if (actual.length !== expected.length || actual.some((key, index) => key !== expected[index])) invalid()
}

function invalid(): never {
  throw new Error('GENERATION_V2_USER_CAPABILITY_RULES_IPC_INVALID')
}

function boundedId(value: unknown): string {
  if (typeof value !== 'string' || value.length < 1 || value.length > 256 || value.trim() !== value) invalid()
  return value
}

function revision(value: unknown): number {
  if (!Number.isSafeInteger(value) || (value as number) < 1) invalid()
  return value as number
}

function notes(value: unknown): readonly UserCapabilityRuleNoteV1[] {
  if (!Array.isArray(value) || value.length > 100_000) invalid()
  return Object.freeze(value.map((entry) => {
    if (!plainObject(entry)) invalid()
    exactKeys(entry, ['note', 'ruleId'])
    const ruleId = boundedId(entry.ruleId)
    if (typeof entry.note !== 'string' || entry.note.length < 1 || entry.note.length > 16_384 ||
        entry.note.trim() !== entry.note) invalid()
    return Object.freeze({ ruleId, note: entry.note })
  }))
}

function sessionPayload(value: unknown): Readonly<{ sessionId: string; expectedDraftRevision: number }> {
  if (!plainObject(value)) invalid()
  exactKeys(value, ['expectedDraftRevision', 'sessionId'])
  return Object.freeze({ sessionId: boundedId(value.sessionId), expectedDraftRevision: revision(value.expectedDraftRevision) })
}

export function registerGenerationV2UserCapabilityRulesIpc(input: Readonly<{
  registerInvoke: RegisterInvoke
  db: BetterSqlite3.Database
  credentialService: Epoch2RuntimeCredentialService
  openAICompatibleCredentialService: ReturnType<typeof createOpenAICompatibleCredentialV2Service>
}>): readonly string[] {
  const subjects = new AuthoritativeModelSubjectSetV1Service(input.db, input.credentialService,
    input.openAICompatibleCredentialService)
  const service = new UserCapabilityRulesV1Service(input.db, subjects)
  const register = (channel: string, handler: (payload: unknown) => unknown | Promise<unknown>) =>
    input.registerInvoke(channel, (_event, payload) => handler(payload))

  register(GENERATION_V2_USER_CAPABILITY_RULES_IPC_CHANNELS[0], (value) => {
    if (value !== undefined && value !== null) invalid()
    return service.readCommitted()
  })
  register(GENERATION_V2_USER_CAPABILITY_RULES_IPC_CHANNELS[1], (value) => {
    if (value !== undefined && value !== null) invalid()
    return service.readDraft()
  })
  register(GENERATION_V2_USER_CAPABILITY_RULES_IPC_CHANNELS[2], (value) => {
    if (value !== undefined && value !== null) invalid()
    return service.openDraft({ sessionId: randomUUID() })
  })
  register(GENERATION_V2_USER_CAPABILITY_RULES_IPC_CHANNELS[3], (value) => {
    if (!plainObject(value)) invalid()
    exactKeys(value, ['expectedDraftRevision', 'notes', 'sessionId', 'snapshot'])
    const snapshot = decodeCapabilityRuleOwnershipSnapshotV1(value.snapshot)
    if (snapshot.ownership !== 'user') invalid()
    return service.replaceDraft({ ...sessionPayload({ sessionId: value.sessionId,
      expectedDraftRevision: value.expectedDraftRevision }), snapshot, notes: notes(value.notes) })
  })
  register(GENERATION_V2_USER_CAPABILITY_RULES_IPC_CHANNELS[4], (value) => {
    if (!plainObject(value)) invalid()
    exactKeys(value, ['expectedDraftRevision', 'firstPack', 'note', 'rule', 'sessionId', 'targetPackId'])
    if (!plainObject(value.firstPack)) invalid()
    exactKeys(value.firstPack, ['displayName', 'packId'])
    if (value.targetPackId !== null && value.targetPackId !== undefined) boundedId(value.targetPackId)
    if (value.note !== undefined && value.note !== null &&
        (typeof value.note !== 'string' || value.note.length < 1 || value.note.length > 16_384 ||
         value.note.trim() !== value.note)) invalid()
    return service.addRule({ ...sessionPayload({ sessionId: value.sessionId,
      expectedDraftRevision: value.expectedDraftRevision }),
    targetPackId: value.targetPackId === undefined ? null : value.targetPackId as string | null,
    firstPack: Object.freeze({ packId: boundedId(value.firstPack.packId),
      displayName: boundedId(value.firstPack.displayName) }),
    rule: decodeCapabilityRuleCoreRuleV1(value.rule), note: value.note as string | null | undefined })
  })
  register(GENERATION_V2_USER_CAPABILITY_RULES_IPC_CHANNELS[5], (value) => {
    if (!plainObject(value)) invalid()
    exactKeys(value, ['expectedDraftRevision', 'packId', 'sessionId'])
    return service.rewritePack({ ...sessionPayload({ sessionId: value.sessionId,
      expectedDraftRevision: value.expectedDraftRevision }), packId: boundedId(value.packId) })
  })
  register(GENERATION_V2_USER_CAPABILITY_RULES_IPC_CHANNELS[6], (value) => {
    if (!plainObject(value)) invalid()
    exactKeys(value, ['expectedDraftRevision', 'sessionId', 'transfer'])
    return service.importPack({ ...sessionPayload({ sessionId: value.sessionId,
      expectedDraftRevision: value.expectedDraftRevision }), transfer: decodeUserRulePackTransferV1(value.transfer) })
  })
  register(GENERATION_V2_USER_CAPABILITY_RULES_IPC_CHANNELS[7], (value) => {
    if (!plainObject(value)) invalid()
    exactKeys(value, ['packId'])
    return service.exportCommittedPack({ packId: boundedId(value.packId) })
  })
  register(GENERATION_V2_USER_CAPABILITY_RULES_IPC_CHANNELS[8], (value) =>
    service.saveDraft(sessionPayload(value)))
  register(GENERATION_V2_USER_CAPABILITY_RULES_IPC_CHANNELS[9], (value) => {
    service.cancelDraft(sessionPayload(value))
    return null
  })
  return GENERATION_V2_USER_CAPABILITY_RULES_IPC_CHANNELS
}
