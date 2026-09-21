import path from 'node:path'
import BetterSqlite3 from 'better-sqlite3'
import { describe, expect, it } from 'vitest'
import { applyGenerationV2SchemaForTest } from '../../infra/db/v2/testSchemaV2'
import {
  GENERATION_V2_USER_CAPABILITY_RULES_IPC_CHANNELS,
  registerGenerationV2UserCapabilityRulesIpc,
} from './generationV2UserCapabilityRulesIpc'

type Handler = (event: unknown, payload?: unknown) => unknown | Promise<unknown>

function database(): BetterSqlite3.Database {
  const db = new BetterSqlite3(':memory:')
  applyGenerationV2SchemaForTest(db, path.resolve(process.cwd()))
  return db
}

describe('generationV2UserCapabilityRulesIpc', () => {
  it('registers one closed user-draft boundary and does not expose database handles', async () => {
    const db = database()
    try {
      const handlers = new Map<string, Handler>()
      expect(registerGenerationV2UserCapabilityRulesIpc({
        registerInvoke: (channel, handler) => handlers.set(channel, handler as Handler), db,
        credentialService: {} as never, openAICompatibleCredentialService: {} as never,
      })).toEqual(GENERATION_V2_USER_CAPABILITY_RULES_IPC_CHANNELS)
      expect([...handlers.keys()].sort()).toEqual([...GENERATION_V2_USER_CAPABILITY_RULES_IPC_CHANNELS].sort())
      expect(handlers.get('generation-v2:capability-rules:user:read-committed')!({}, null))
        .toEqual(expect.objectContaining({ snapshot: null }))
      const opened = await handlers.get('generation-v2:capability-rules:user:open-draft')!({}) as {
        sessionId: string; draftRevision: number
      }
      expect(opened.sessionId).toMatch(/^[0-9a-f-]{36}$/u)
      expect(opened.draftRevision).toBe(1)
      expect(() => handlers.get('generation-v2:capability-rules:user:open-draft')!({}, { unexpected: true }))
        .toThrow('GENERATION_V2_USER_CAPABILITY_RULES_IPC_INVALID')
    } finally { db.close() }
  })
})
