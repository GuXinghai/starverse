import path from 'node:path'
import BetterSqlite3 from 'better-sqlite3'
import { describe, expect, it } from 'vitest'
import { applyGenerationV2SchemaForTest } from '../../infra/db/v2/testSchemaV2'
import { registerGenerationV2SourcePriorityConfigIpc } from './generationV2SourcePriorityConfigIpc'

describe('generation V2 source-priority IPC', () => {
  it('registers a read/update bridge with strict payload validation', async () => {
    const db = new BetterSqlite3(':memory:')
    applyGenerationV2SchemaForTest(db, path.resolve(process.cwd()))
    const handlers = new Map<string, (event: unknown, payload?: unknown) => unknown | Promise<unknown>>()
    registerGenerationV2SourcePriorityConfigIpc({
      db,
      registerInvoke: (channel, handler) => handlers.set(channel, handler),
    })
    try {
      const get = handlers.get('generation-v2:model-facts:source-priority:get')!
      const update = handlers.get('generation-v2:model-facts:source-priority:update')!
      const initial = await get({}, undefined) as { config: { sourcePriorityConfigRevision: string } }
      expect(initial.config.sourcePriorityConfigRevision).toMatch(/^source-priority-config-v1:[0-9a-f]{64}$/u)
      const updated = await update({}, { expectedConfigRevision: initial.config.sourcePriorityConfigRevision,
        priorities: { provider_native: 2, models_dev: 2, capability_rule: 2 } })
      expect(updated).toMatchObject({
        config: { priorities: { provider_native: 2, models_dev: 2, capability_rule: 2 } },
      })
      expect(() => update({}, { expectedConfigRevision: 'bad',
        priorities: { provider_native: 2, models_dev: 2, capability_rule: 2 } })).toThrow(
        'GENERATION_V2_SOURCE_PRIORITY_CONFIG_IPC_INVALID',
      )
    } finally { db.close() }
  })
})
