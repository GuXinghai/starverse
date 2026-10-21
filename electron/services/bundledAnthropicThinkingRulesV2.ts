import type BetterSqlite3 from 'better-sqlite3'
import { CapabilityRuleCoreV1Repo } from '../../infra/db/repo/capabilityRuleCoreV1Repo'
import { ANTHROPIC_THINKING_BUNDLED_OWNER_V2, anthropicThinkingRulesSnapshotV2 } from '../../src/core/generation-v2/capability-rules/anthropicThinkingRulesV2'
import { CapabilityRuleMaterializationV1Service, type AuthoritativeModelSubjectSetReaderV1 } from '../../infra/db/services/capabilityRuleMaterializationV1Service'
import { CapabilityRuleMaterializationSchedulerV1Service } from './capabilityRuleMaterializationSchedulerV1Service'

/** Reserved bundled owner for exact Anthropic Messages API facts. */
export function installBundledAnthropicThinkingRulesV2(db: BetterSqlite3.Database): void {
  const repo = new CapabilityRuleCoreV1Repo(db)
  const current = repo.readOwnershipSnapshot({ ownership: 'cloud', ownerId: ANTHROPIC_THINKING_BUNDLED_OWNER_V2 })
  repo.replaceOwnershipSnapshot({ expectedSnapshotRevision: current?.projected.snapshotRevision ?? null,
    snapshot: anthropicThinkingRulesSnapshotV2() })
}

/** Publish facts for current subjects before exposing generation IPC. */
export async function initializeBundledAnthropicThinkingRulesV2(
  db: BetterSqlite3.Database,
  subjects: AuthoritativeModelSubjectSetReaderV1,
): Promise<void> {
  installBundledAnthropicThinkingRulesV2(db)
  const scheduler = new CapabilityRuleMaterializationSchedulerV1Service({ db,
    materializationService: new CapabilityRuleMaterializationV1Service(db, subjects) })
  await scheduler.schedule()
}
