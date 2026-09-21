import { stableSerializeProviderRequestV2 } from '../../src/next/generation-v2/compiler/stableSerialize'
import type { CloudRulesActivationOverrideV1 } from
  '../../src/next/generation-v2/capability-rules/cloudRulesActivationOverlayV1'
import { CloudRulesApplicationV1Repo } from '../../infra/db/repo/cloudRulesApplicationV1Repo'
import { CloudRulesDistributionV1Repo } from '../../infra/db/repo/cloudRulesDistributionV1Repo'
import { CloudRulesApplicationV1Service } from '../services/cloudRulesApplicationV1Service'
import { CloudRulesCandidateRefreshV1 } from '../services/cloudRulesCandidateRefreshV1'
import type { RegisterInvoke } from './types'

export const GENERATION_V2_CLOUD_CAPABILITY_RULES_IPC_CHANNELS = Object.freeze([
  'generation-v2:capability-rules:cloud:read',
  'generation-v2:capability-rules:cloud:check',
  'generation-v2:capability-rules:cloud:candidate-diff',
  'generation-v2:capability-rules:cloud:apply',
  'generation-v2:capability-rules:cloud:rollback',
  'generation-v2:capability-rules:cloud:replace-activation-overrides',
  'generation-v2:capability-rules:cloud:set-history-limit',
  'generation-v2:capability-rules:cloud:resume-updates',
] as const)

function invalid(): never {
  throw new Error('GENERATION_V2_CLOUD_CAPABILITY_RULES_IPC_INVALID')
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

function id(value: unknown): string {
  if (typeof value !== 'string' || value.length < 1 || value.length > 256 || value.trim() !== value) invalid()
  return value
}

function positiveInteger(value: unknown): number {
  if (!Number.isSafeInteger(value) || (value as number) < 1) invalid()
  return value as number
}

function nonnegativeInteger(value: unknown): number {
  if (!Number.isSafeInteger(value) || (value as number) < 0) invalid()
  return value as number
}

function nullableInteger(value: unknown): number | null {
  return value === null ? null : positiveInteger(value)
}

function overrides(value: unknown): readonly CloudRulesActivationOverrideV1[] {
  if (!Array.isArray(value) || value.length > 100_000) invalid()
  return Object.freeze(value.map((entry) => {
    if (!plainObject(entry) || typeof entry.kind !== 'string') invalid()
    if (entry.kind === 'pack') {
      const keys = Object.keys(entry).sort()
      if (!keys.every((key) => ['kind', 'mode', 'packId', 'target'].includes(key)) ||
          !keys.includes('kind') || !keys.includes('packId') || keys.length < 3) invalid()
      if (entry.mode !== undefined && entry.mode !== 'override' && entry.mode !== 'default_only' &&
          entry.mode !== 'no_control') invalid()
      if (entry.target !== undefined && entry.target !== 'enabled' && entry.target !== 'disabled') invalid()
      if (entry.mode === undefined && entry.target === undefined) invalid()
      return Object.freeze({ kind: 'pack' as const, packId: id(entry.packId),
        ...(entry.mode === undefined ? {} : { mode: entry.mode }),
        ...(entry.target === undefined ? {} : { target: entry.target }) })
    }
    if (entry.kind !== 'rule') invalid()
    exactKeys(entry, ['configured', 'kind', 'ruleId'])
    if (entry.configured !== 'default' && entry.configured !== 'on' && entry.configured !== 'off') invalid()
    return Object.freeze({ kind: 'rule' as const, ruleId: id(entry.ruleId), configured: entry.configured })
  }))
}

function empty(value: unknown): void {
  if (value !== undefined && value !== null) invalid()
}

export function registerGenerationV2CloudCapabilityRulesIpc(input: Readonly<{
  registerInvoke: RegisterInvoke
  refresh: CloudRulesCandidateRefreshV1
  application: CloudRulesApplicationV1Service
  applicationRepo: CloudRulesApplicationV1Repo
  distributionRepo: CloudRulesDistributionV1Repo
}>): readonly string[] {
  const register = (channel: string, handler: (payload: unknown) => unknown | Promise<unknown>) =>
    input.registerInvoke(channel, (_event, payload) => handler(payload))
  const read = () => Object.freeze({ distribution: input.distributionRepo.readState(),
    application: input.applicationRepo.readState(), history: input.applicationRepo.listHistory() })

  register(GENERATION_V2_CLOUD_CAPABILITY_RULES_IPC_CHANNELS[0], (value) => {
    empty(value)
    return read()
  })
  register(GENERATION_V2_CLOUD_CAPABILITY_RULES_IPC_CHANNELS[1], (value) => {
    empty(value)
    return input.refresh.checkNow()
  })
  register(GENERATION_V2_CLOUD_CAPABILITY_RULES_IPC_CHANNELS[2], (value) => {
    if (!plainObject(value)) invalid()
    exactKeys(value, ['expectedAppliedRecordRevision', 'expectedCandidateRecordRevision'])
    const current = read()
    if (current.distribution.candidate?.candidateRecordRevision !== id(value.expectedCandidateRecordRevision) ||
        current.application.appliedRecordRevision !== nullableInteger(value.expectedAppliedRecordRevision)) {
      throw new Error('GENERATION_V2_CLOUD_CAPABILITY_RULES_IPC_STALE')
    }
    if (!current.distribution.candidate) throw new Error('GENERATION_V2_CLOUD_CAPABILITY_RULES_IPC_CANDIDATE_NOT_FOUND')
    return Object.freeze({
      expectedCandidateRecordRevision: current.distribution.candidate.candidateRecordRevision,
      expectedAppliedRecordRevision: current.application.appliedRecordRevision,
      current: current.application.applied === null ? null : stableSerializeProviderRequestV2(current.application.applied.document),
      candidate: stableSerializeProviderRequestV2(current.distribution.candidate.document),
    })
  })
  register(GENERATION_V2_CLOUD_CAPABILITY_RULES_IPC_CHANNELS[3], (value) => {
    if (!plainObject(value)) invalid()
    exactKeys(value, ['expectedAppliedRecordRevision', 'expectedCandidateRecordRevision'])
    return input.application.applyCandidate({ expectedCandidateRecordRevision: id(value.expectedCandidateRecordRevision),
      expectedAppliedRecordRevision: nullableInteger(value.expectedAppliedRecordRevision) })
  })
  register(GENERATION_V2_CLOUD_CAPABILITY_RULES_IPC_CHANNELS[4], (value) => {
    if (!plainObject(value)) invalid()
    exactKeys(value, ['expectedAppliedRecordRevision', 'expectedHistoryTargetRecordRevision', 'pinTarget'])
    if (typeof value.pinTarget !== 'boolean') invalid()
    return input.application.rollback({ expectedAppliedRecordRevision: positiveInteger(value.expectedAppliedRecordRevision),
      expectedHistoryTargetRecordRevision: positiveInteger(value.expectedHistoryTargetRecordRevision), pinTarget: value.pinTarget })
  })
  register(GENERATION_V2_CLOUD_CAPABILITY_RULES_IPC_CHANNELS[5], (value) => {
    if (!plainObject(value)) invalid()
    exactKeys(value, ['expectedAppliedRecordRevision', 'expectedOverrideRevision', 'overrides'])
    return input.application.replaceActivationOverrides({
      expectedAppliedRecordRevision: positiveInteger(value.expectedAppliedRecordRevision),
      expectedOverrideRevision: positiveInteger(value.expectedOverrideRevision), overrides: overrides(value.overrides),
    })
  })
  register(GENERATION_V2_CLOUD_CAPABILITY_RULES_IPC_CHANNELS[6], (value) => {
    if (!plainObject(value)) invalid()
    exactKeys(value, ['expectedPolicyRevision', 'historyLimit'])
    return input.applicationRepo.setHistoryLimit({ expectedPolicyRevision: nonnegativeInteger(value.expectedPolicyRevision),
      historyLimit: nonnegativeInteger(value.historyLimit) })
  })
  register(GENERATION_V2_CLOUD_CAPABILITY_RULES_IPC_CHANNELS[7], (value) => {
    if (!plainObject(value)) invalid()
    exactKeys(value, ['expectedPolicyRevision'])
    return input.applicationRepo.resumeUpdates({ expectedPolicyRevision: nonnegativeInteger(value.expectedPolicyRevision) })
  })
  return GENERATION_V2_CLOUD_CAPABILITY_RULES_IPC_CHANNELS
}
