import BetterSqlite3 from 'better-sqlite3'
import { describe, expect, it, vi } from 'vitest'
import { applyGenerationV2SchemaForTest } from '../../infra/db/v2/testSchemaV2'
import { CapabilityRuleCoreV1Repo } from '../../infra/db/repo/capabilityRuleCoreV1Repo'
import { buildAuthoritativeModelSubjectSetV1 } from '../../src/core/generation-v2/model-facts/authoritativeModelSubjectSetV1'
import { CapabilityRuleMaterializationSchedulerV1Service } from './capabilityRuleMaterializationSchedulerV1Service'
import { initializeBundledThinkingRulesV2 } from './bundledThinkingRulesV2'

describe('complete bundled thinking definition bootstrap', () => {
  it('installs every provider owner before one shared publication pass', async () => {
    const db = new BetterSqlite3(':memory:')
    applyGenerationV2SchemaForTest(db, process.cwd())
    const scheduled = vi.spyOn(CapabilityRuleMaterializationSchedulerV1Service.prototype, 'schedule')
    const readCurrent = vi.fn(async () => buildAuthoritativeModelSubjectSetV1([]))
    try {
      await initializeBundledThinkingRulesV2(db, { readCurrent })
      expect(scheduled).toHaveBeenCalledTimes(1)
      const repo = new CapabilityRuleCoreV1Repo(db)
      for (const ownerId of ['bundled-gemini-thinking-v2', 'bundled-anthropic-thinking-v2', 'bundled-openai-responses-thinking-v2']) {
        expect(repo.readOwnershipSnapshot({ ownership: 'cloud', ownerId })).not.toBeNull()
      }
      expect(readCurrent).toHaveBeenCalled()
    } finally { scheduled.mockRestore(); db.close() }
  })
})
