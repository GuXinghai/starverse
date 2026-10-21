import type BetterSqlite3 from 'better-sqlite3'
import { CapabilityRuleCoreV1Repo } from '../../infra/db/repo/capabilityRuleCoreV1Repo'
import { GEMINI_THINKING_BUNDLED_OWNER_V2, geminiThinkingRulesSnapshotV2 } from '../../src/core/generation-v2/capability-rules/geminiThinkingRulesV2'
import { CapabilityRuleMaterializationV1Service, type AuthoritativeModelSubjectSetReaderV1 } from '../../infra/db/services/capabilityRuleMaterializationV1Service'
import { CapabilityRuleMaterializationSchedulerV1Service } from './capabilityRuleMaterializationSchedulerV1Service'

/** V1 storage ownership is cloud/user. This reserved owner is explicitly bundled,
 * never the remote cloud/official LKG. It uses the same materialization authority. */
export function installBundledGeminiThinkingRulesV2(db: BetterSqlite3.Database): void {
  const repo = new CapabilityRuleCoreV1Repo(db)
  const current = repo.readOwnershipSnapshot({ ownership: 'cloud', ownerId: GEMINI_THINKING_BUNDLED_OWNER_V2 })
  repo.replaceOwnershipSnapshot({ expectedSnapshotRevision: current?.projected.snapshotRevision ?? null, snapshot: geminiThinkingRulesSnapshotV2() })
}

/** Finish publication before exposing generation IPC, including upgraded profiles. */
export async function initializeBundledGeminiThinkingRulesV2(db: BetterSqlite3.Database, subjects: AuthoritativeModelSubjectSetReaderV1): Promise<void> {
  installBundledGeminiThinkingRulesV2(db)
  const scheduler = new CapabilityRuleMaterializationSchedulerV1Service({ db,
    materializationService: new CapabilityRuleMaterializationV1Service(db, subjects) })
  await scheduler.schedule()
}
