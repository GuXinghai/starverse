import {
  decodeCapabilityRuleOwnershipSnapshotV1,
  type CapabilityRuleConfiguredStateV1,
  type CapabilityRuleOwnershipSnapshotV1,
  type CapabilityRulePackModeV1,
  type CapabilityRulePackTargetV1,
} from './capabilityRuleCoreV1'
import {
  CLOUD_RULES_OFFICIAL_OWNER_ID_V1,
  type CloudRulesReleaseDocumentV1,
} from './cloudRulesReleaseV1'

export const CLOUD_RULES_LKG_INTEGRITY_STALE_REASON_V1 =
  'CLOUD_RULES_LKG_INTEGRITY_INVALID' as const

export type CloudRulesPackActivationOverrideV1 = Readonly<{
  kind: 'pack'
  packId: string
  mode?: CapabilityRulePackModeV1
  target?: CapabilityRulePackTargetV1
}>

export type CloudRulesRuleActivationOverrideV1 = Readonly<{
  kind: 'rule'
  ruleId: string
  configured: CapabilityRuleConfiguredStateV1
}>

export type CloudRulesActivationOverrideV1 =
  | CloudRulesPackActivationOverrideV1
  | CloudRulesRuleActivationOverrideV1

export type CloudRulesActivationOverlayV1 = Readonly<{
  ownershipSnapshot: CapabilityRuleOwnershipSnapshotV1
  retainedOverrides: readonly CloudRulesActivationOverrideV1[]
}>

function invalid(): never {
  throw new Error('GENERATION_V2_CLOUD_RULES_ACTIVATION_OVERRIDE_INVALID')
}

function id(value: unknown): string {
  if (typeof value !== 'string' || !/^[A-Za-z0-9][A-Za-z0-9._:/-]{0,255}$/u.test(value)) invalid()
  return value
}

export function applyCloudRulesActivationOverridesV1(input: Readonly<{
  document: CloudRulesReleaseDocumentV1
  overrides: readonly CloudRulesActivationOverrideV1[]
}>): CloudRulesActivationOverlayV1 {
  const packIds = new Set(input.document.packs.map((pack) => pack.packId))
  const ruleIds = new Set(input.document.packs.flatMap((pack) => pack.rules.map((rule) => rule.ruleId)))
  const packOverrides = new Map<string, CloudRulesPackActivationOverrideV1>()
  const ruleOverrides = new Map<string, CloudRulesRuleActivationOverrideV1>()
  for (const override of input.overrides) {
    if (!override || typeof override !== 'object') invalid()
    if (override.kind === 'pack') {
      const packId = id(override.packId)
      if (!packIds.has(packId)) continue
      if (override.mode === undefined && override.target === undefined) invalid()
      if (override.mode !== undefined && override.mode !== 'override' &&
          override.mode !== 'default_only' && override.mode !== 'no_control') invalid()
      if (override.target !== undefined && override.target !== 'enabled' && override.target !== 'disabled') invalid()
      if (packOverrides.has(packId)) invalid()
      packOverrides.set(packId, Object.freeze({ kind: 'pack', packId,
        ...(override.mode === undefined ? {} : { mode: override.mode }),
        ...(override.target === undefined ? {} : { target: override.target }) }))
      continue
    }
    if (override.kind !== 'rule') invalid()
    const ruleId = id(override.ruleId)
    if (!ruleIds.has(ruleId)) continue
    if (override.configured !== 'default' && override.configured !== 'on' && override.configured !== 'off') invalid()
    if (ruleOverrides.has(ruleId)) invalid()
    ruleOverrides.set(ruleId, Object.freeze({ kind: 'rule', ruleId, configured: override.configured }))
  }
  const retainedOverrides = Object.freeze([
    ...[...packOverrides.values()].sort((left, right) => left.packId.localeCompare(right.packId, 'en')),
    ...[...ruleOverrides.values()].sort((left, right) => left.ruleId.localeCompare(right.ruleId, 'en')),
  ])
  const ownershipSnapshot = decodeCapabilityRuleOwnershipSnapshotV1({
    schemaVersion: 1,
    ownership: 'cloud',
    ownerId: CLOUD_RULES_OFFICIAL_OWNER_ID_V1,
    packs: input.document.packs.map((pack) => {
      const packOverride = packOverrides.get(pack.packId)
      return { ...pack,
        mode: packOverride?.mode ?? pack.mode,
        target: packOverride?.target ?? pack.target,
        rules: pack.rules.map((rule) => ({ ...rule,
          configured: ruleOverrides.get(rule.ruleId)?.configured ?? rule.configured })) }
    }),
  })
  return Object.freeze({ ownershipSnapshot, retainedOverrides })
}
