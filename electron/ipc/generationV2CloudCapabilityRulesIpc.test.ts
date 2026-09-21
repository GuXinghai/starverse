import path from 'node:path'
import BetterSqlite3 from 'better-sqlite3'
import { describe, expect, it, vi } from 'vitest'
import { applyGenerationV2SchemaForTest } from '../../infra/db/v2/testSchemaV2'
import { CloudRulesApplicationV1Repo } from '../../infra/db/repo/cloudRulesApplicationV1Repo'
import { CloudRulesDistributionV1Repo } from '../../infra/db/repo/cloudRulesDistributionV1Repo'
import { buildAuthoritativeModelSubjectSetV1 } from
  '../../src/next/generation-v2/model-facts/authoritativeModelSubjectSetV1'
import { CloudRulesApplicationV1Service } from '../services/cloudRulesApplicationV1Service'
import { CloudRulesCandidateRefreshV1 } from '../services/cloudRulesCandidateRefreshV1'
import {
  GENERATION_V2_CLOUD_CAPABILITY_RULES_IPC_CHANNELS,
  registerGenerationV2CloudCapabilityRulesIpc,
} from './generationV2CloudCapabilityRulesIpc'

type Handler = (event: unknown, payload?: unknown) => unknown | Promise<unknown>

function database(): BetterSqlite3.Database {
  const db = new BetterSqlite3(':memory:')
  applyGenerationV2SchemaForTest(db, path.resolve(process.cwd()))
  return db
}

describe('generationV2CloudCapabilityRulesIpc', () => {
  it('registers only the closed Cloud lifecycle surface and returns persisted read projections', () => {
    const db = database()
    try {
      const handlers = new Map<string, Handler>()
      const applicationRepo = new CloudRulesApplicationV1Repo(db)
      const distributionRepo = new CloudRulesDistributionV1Repo(db)
      const application = new CloudRulesApplicationV1Service(db, {
        readCurrent: async () => buildAuthoritativeModelSubjectSetV1([]),
      })
      const refresh = new CloudRulesCandidateRefreshV1({ db, fetchImpl: vi.fn() })
      expect(registerGenerationV2CloudCapabilityRulesIpc({
        registerInvoke: (channel, handler) => handlers.set(channel, handler as Handler), refresh,
        application, applicationRepo, distributionRepo,
      })).toEqual(GENERATION_V2_CLOUD_CAPABILITY_RULES_IPC_CHANNELS)
      expect([...handlers.keys()].sort()).toEqual([...GENERATION_V2_CLOUD_CAPABILITY_RULES_IPC_CHANNELS].sort())
      expect(handlers.get('generation-v2:capability-rules:cloud:read')!({}, null))
        .toEqual(expect.objectContaining({ history: [], application: expect.objectContaining({ applied: null }) }))
      expect(() => handlers.get('generation-v2:capability-rules:cloud:check')!({}, { extra: true }))
        .toThrow('GENERATION_V2_CLOUD_CAPABILITY_RULES_IPC_INVALID')
    } finally { db.close() }
  })
})
