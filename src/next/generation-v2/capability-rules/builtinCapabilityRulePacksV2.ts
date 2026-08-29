import rawBuiltInPacks from './builtinCapabilityRulePacksV2.json'
import {
  decodeCapabilityRulePackDefinitionV2,
  type CapabilityRulePackDefinitionV2,
} from './capabilityRuleV2'

function load(): readonly CapabilityRulePackDefinitionV2[] {
  if (!rawBuiltInPacks || typeof rawBuiltInPacks !== 'object' || Array.isArray(rawBuiltInPacks) ||
      Object.getPrototypeOf(rawBuiltInPacks) !== Object.prototype ||
      Object.keys(rawBuiltInPacks).sort().join('\0') !== ['packs', 'schemaVersion'].sort().join('\0') ||
      rawBuiltInPacks.schemaVersion !== 1 || !Array.isArray(rawBuiltInPacks.packs)) {
    throw new Error('GENERATION_V2_BUILTIN_CAPABILITY_RULE_PACKS_INVALID')
  }
  const packs = rawBuiltInPacks.packs.map(decodeCapabilityRulePackDefinitionV2)
  if (packs.length === 0 || packs.some((pack) => pack.ownerKind !== 'built_in') ||
      new Set(packs.map((pack) => pack.packId)).size !== packs.length) {
    throw new Error('GENERATION_V2_BUILTIN_CAPABILITY_RULE_PACKS_INVALID')
  }
  return Object.freeze(packs)
}

export const BUILTIN_CAPABILITY_RULE_PACKS_V2 = load()
