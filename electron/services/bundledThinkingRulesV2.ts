import type BetterSqlite3 from 'better-sqlite3'
import { CapabilityRuleMaterializationV1Service, type AuthoritativeModelSubjectSetReaderV1 } from '../../infra/db/services/capabilityRuleMaterializationV1Service'
import { CapabilityRuleMaterializationSchedulerV1Service } from './capabilityRuleMaterializationSchedulerV1Service'
import { installBundledGeminiThinkingRulesV2 } from './bundledGeminiThinkingRulesV2'
import { installBundledAnthropicThinkingRulesV2 } from './bundledAnthropicThinkingRulesV2'
import { installBundledOpenAIResponsesThinkingRulesV2 } from './bundledOpenAIResponsesThinkingRulesV2'

export function installBundledThinkingRulesV2(db: BetterSqlite3.Database): void {
  installBundledGeminiThinkingRulesV2(db)
  installBundledAnthropicThinkingRulesV2(db)
  installBundledOpenAIResponsesThinkingRulesV2(db)
}

/** Publish the complete bundled definition set once before exposing generation IPC. */
export async function initializeBundledThinkingRulesV2(db: BetterSqlite3.Database,
  subjects: AuthoritativeModelSubjectSetReaderV1): Promise<void> {
  installBundledThinkingRulesV2(db)
  const scheduler = new CapabilityRuleMaterializationSchedulerV1Service({ db,
    materializationService: new CapabilityRuleMaterializationV1Service(db, subjects) })
  await scheduler.schedule()
}
