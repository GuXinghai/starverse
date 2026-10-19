import type BetterSqlite3 from 'better-sqlite3'
import { CapabilityRuleCoreV1Repo } from '../../infra/db/repo/capabilityRuleCoreV1Repo'
import { OPENAI_RESPONSES_THINKING_BUNDLED_OWNER_V2, openAIResponsesThinkingRulesSnapshotV2 } from '../../src/core/generation-v2/capability-rules/openAIResponsesThinkingRulesV2'
import { CapabilityRuleMaterializationV1Service, type AuthoritativeModelSubjectSetReaderV1 } from '../../infra/db/services/capabilityRuleMaterializationV1Service'
import { CapabilityRuleMaterializationSchedulerV1Service } from './capabilityRuleMaterializationSchedulerV1Service'

/** Reserved bundled owner for exact OpenAI Responses reasoning-effort facts. */
export function installBundledOpenAIResponsesThinkingRulesV2(db: BetterSqlite3.Database): void {
  const repo = new CapabilityRuleCoreV1Repo(db)
  const current = repo.readOwnershipSnapshot({ ownership: 'cloud', ownerId: OPENAI_RESPONSES_THINKING_BUNDLED_OWNER_V2 })
  repo.replaceOwnershipSnapshot({ expectedSnapshotRevision: current?.projected.snapshotRevision ?? null,
    snapshot: openAIResponsesThinkingRulesSnapshotV2() })
}

/** Publish exact-model facts before exposing OpenAI Responses generation IPC. */
export async function initializeBundledOpenAIResponsesThinkingRulesV2(
  db: BetterSqlite3.Database,
  subjects: AuthoritativeModelSubjectSetReaderV1,
): Promise<void> {
  installBundledOpenAIResponsesThinkingRulesV2(db)
  const scheduler = new CapabilityRuleMaterializationSchedulerV1Service({ db,
    materializationService: new CapabilityRuleMaterializationV1Service(db, subjects) })
  await scheduler.schedule()
}
