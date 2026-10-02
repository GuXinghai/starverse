import path from 'node:path'
import BetterSqlite3 from 'better-sqlite3'
import { describe, expect, it, vi } from 'vitest'
import { applyGenerationV2SchemaForTest } from '../../infra/db/v2/testSchemaV2'
import { registerGenerationV2SourcePriorityConfigIpc } from './generationV2SourcePriorityConfigIpc'
import { SourcePriorityConfigV1Repo } from '../../infra/db/repo/sourcePriorityConfigV1Repo'

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

  it('notifies only after a committed priority mutation and preserves success when delivery throws', async () => {
    const db = new BetterSqlite3(':memory:')
    applyGenerationV2SchemaForTest(db, path.resolve(process.cwd()))
    const handlers = new Map<string, (event: unknown, payload?: unknown) => unknown>()
    const notify = vi.fn((event: any) => {
      expect(db.inTransaction).toBe(false)
      expect(new SourcePriorityConfigV1Repo(db).get().config.sourcePriorityConfigRevision).toBe(event.sourcePriorityConfigRevision)
      throw new Error('SYNTHETIC_DELIVERY_FAILURE')
    })
    registerGenerationV2SourcePriorityConfigIpc({ db, registerInvoke: (channel, handler) => handlers.set(channel, handler),
      notifyModelFactsSemanticInvalidated: notify })
    try {
      const get = handlers.get('generation-v2:model-facts:source-priority:get')!
      const update = handlers.get('generation-v2:model-facts:source-priority:update')!
      const initial = get({}) as any
      expect(notify).not.toHaveBeenCalled()
      const updated = update({}, { expectedConfigRevision: initial.config.sourcePriorityConfigRevision,
        priorities: { provider_native: 1, models_dev: 2, capability_rule: 3 } }) as any
      expect(updated.config.priorities.capability_rule).toBe(3)
      expect(notify).toHaveBeenCalledExactlyOnceWith({ kind: 'source_priority',
        sourcePriorityConfigRevision: updated.config.sourcePriorityConfigRevision })
      expect(() => update({}, { expectedConfigRevision: initial.config.sourcePriorityConfigRevision,
        priorities: { provider_native: 3, models_dev: 2, capability_rule: 1 } })).toThrow('GENERATION_V2_SOURCE_PRIORITY_CONFIG_STALE_REVISION')
      expect(notify).toHaveBeenCalledTimes(1)
    } finally { db.close() }
  })
})
