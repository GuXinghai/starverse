import {
  decodeCapabilityRuleOwnershipSnapshotV2,
  type CapabilityRuleOwnershipSnapshotV2,
} from './capabilityRuleCoreV2'
import type { CloudRulesActivationOverrideV1 } from './cloudRulesActivationOverlayV1'
import {
  CLOUD_RULES_OFFICIAL_OWNER_ID_V1,
  type CloudRulesReleaseDocumentV1,
} from './cloudRulesReleaseV1'

export type CloudRulesActivationOverlayV2 = Readonly<{
  ownershipSnapshot: CapabilityRuleOwnershipSnapshotV2
  retainedOverrides: readonly CloudRulesActivationOverrideV1[]
}>

function invalid(): never {
  throw new Error('GENERATION_V2_CLOUD_RULES_ACTIVATION_OVERRIDE_INVALID')
}

function id(value: unknown): string {
  if (typeof value !== 'string' || !/^[A-Za-z0-9][A-Za-z0-9._:/-]{0,255}$/u.test(value)) invalid()
  return value
}

/** Applies the same explicit activation overlay used by V1 Cloud releases to a V2 snapshot. */
export function applyCloudRulesActivationOverridesV2(input: Readonly<{
  document: Extract<CloudRulesReleaseDocumentV1, { schemaVersion: 2 }>
  overrides: readonly CloudRulesActivationOverrideV1[]
}>): CloudRulesActivationOverlayV2 {
  const packIds = new Set(input.document.packs.map(pack => pack.packId))
  const ruleIds = new Set(input.document.packs.flatMap(pack => pack.rules.map(rule => rule.ruleId)))
  const packOverrides = new Map<string, Extract<CloudRulesActivationOverrideV1, { kind: 'pack' }>>()
  const ruleOverrides = new Map<string, Extract<CloudRulesActivationOverrideV1, { kind: 'rule' }>>()
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
  const ownershipSnapshot = decodeCapabilityRuleOwnershipSnapshotV2({
    schemaVersion: 2,
    ownership: 'cloud',
    ownerId: CLOUD_RULES_OFFICIAL_OWNER_ID_V1,
    packs: input.document.packs.map(pack => {
      const packOverride = packOverrides.get(pack.packId)
      return { ...pack, mode: packOverride?.mode ?? pack.mode,
        target: packOverride?.target ?? pack.target,
        rules: pack.rules.map(rule => ({ ...rule,
          configured: ruleOverrides.get(rule.ruleId)?.configured ?? rule.configured })) }
    }),
  })
  return Object.freeze({ ownershipSnapshot, retainedOverrides })
}
