import path from 'node:path'
import BetterSqlite3 from 'better-sqlite3'
import { describe, expect, it, vi } from 'vitest'
import { applyGenerationV2SchemaForTest } from '../../infra/db/v2/testSchemaV2'
import {
  GENERATION_V2_USER_CAPABILITY_RULES_IPC_CHANNELS,
  registerGenerationV2UserCapabilityRulesIpc,
} from './generationV2UserCapabilityRulesIpc'
import { LocalEndpointProfileV2Repo } from '../../infra/db/repo/localEndpointProfileV2Repo'
import { CanonicalModelFactSourceV1Repo } from '../../infra/db/repo/canonicalModelFactSourceV1Repo'
import { CAPABILITY_RULE_SOURCE_SCOPE_ID_V1 } from '../../src/next/generation-v2/model-facts/semanticInvalidationV1'

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

  it('emits after the real User Rules save, stays silent for draft/CAS/rollback failures, and isolates delivery', async () => {
    const db = database()
    try {
      new LocalEndpointProfileV2Repo(db).create({ endpointProfileId: 'profile:local', providerId: 'ollama',
        protocolContractId: 'ollama-chat-v1', baseUrl: 'http://127.0.0.1:11434',
        protocolConfig: { modelId: 'qwen-test', thinkingControl: 'boolean', tools: false } })
      const handlers = new Map<string, Handler>()
      const notify = vi.fn((event: any) => {
        expect(db.inTransaction).toBe(false)
        expect(new CanonicalModelFactSourceV1Repo(db).readSourceState('capability_rule', CAPABILITY_RULE_SOURCE_SCOPE_ID_V1)
          ?.currentSourceRevision).toBe(event.canonicalSourceRevision)
        throw new Error('SYNTHETIC_DELIVERY_FAILURE')
      })
      registerGenerationV2UserCapabilityRulesIpc({ db, registerInvoke: (channel, handler) => handlers.set(channel, handler as Handler),
        credentialService: { getStatus: async (providerKey: string) => ({ providerKey, configured: false, revision: 0 }) } as never,
        openAICompatibleCredentialService: {} as never, notifyModelFactsSemanticInvalidated: notify })
      const call = (suffix: string, payload?: unknown) => handlers.get(`generation-v2:capability-rules:user:${suffix}`)!({}, payload) as any
      const opened = await call('open-draft')
      const changed = await call('add-rule', { sessionId: opened.sessionId, expectedDraftRevision: opened.draftRevision,
        targetPackId: null, firstPack: { packId: 'pack.user', displayName: 'Synthetic User Rules' }, note: null,
        rule: { ruleId: 'rule.user', label: null, description: null, priority: 0, configured: 'default',
          providerAuthorityId: 'ollama-local', endpointProfileId: 'profile:local', selector: { kind: 'exact', nativeModelIds: ['qwen-test'] },
          assertion: { path: 'reasoning.support', value: { kind: 'support', value: 'supported' } }, evidence: null } })
      expect(notify).not.toHaveBeenCalled()
      await expect(call('save-draft', { sessionId: changed.sessionId, expectedDraftRevision: changed.draftRevision - 1 })).rejects.toThrow()
      expect(notify).not.toHaveBeenCalled()
      const saved = await call('save-draft', { sessionId: changed.sessionId, expectedDraftRevision: changed.draftRevision })
      expect(saved.canonicalSourceRevision).toMatch(/^canonical-source-v1:/u)
      expect(notify).toHaveBeenCalledExactlyOnceWith({ kind: 'capability_rules', sourceScopeId: CAPABILITY_RULE_SOURCE_SCOPE_ID_V1,
        canonicalSourceRevision: saved.canonicalSourceRevision })
      const reopened = await call('open-draft')
      db.exec(`CREATE TRIGGER synthetic_rules_abort BEFORE DELETE ON user_capability_rule_editing_session_v1
        BEGIN SELECT RAISE(ABORT, 'SYNTHETIC_RULES_ROLLBACK'); END`)
      await expect(call('save-draft', { sessionId: reopened.sessionId, expectedDraftRevision: reopened.draftRevision })).rejects.toThrow('SYNTHETIC_RULES_ROLLBACK')
      expect(notify).toHaveBeenCalledTimes(1)
    } finally { db.close() }
  })
})
