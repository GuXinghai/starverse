import type BetterSqlite3 from 'better-sqlite3'
import { BUILTIN_CAPABILITY_RULE_PACKS_V2 } from '../../../src/next/generation-v2/capability-rules/builtinCapabilityRulePacksV2'
import { CapabilityRuleV2Repo } from './capabilityRuleV2Repo'

/** Install/update only Starverse-owned packs. User-owned packs are never selected for mutation. */
export function installBuiltInCapabilityRulesV2(
  db: BetterSqlite3.Database,
  nowMs: () => number = Date.now,
): void {
  new CapabilityRuleV2Repo(db, nowMs).installBuiltInPacks(BUILTIN_CAPABILITY_RULE_PACKS_V2)
}
