import path from 'node:path'
import BetterSqlite3 from 'better-sqlite3'
import { describe, expect, it } from 'vitest'
import { applyGenerationV2SchemaForTest } from '../v2/testSchemaV2'
import { SourcePriorityConfigV1Repo } from './sourcePriorityConfigV1Repo'

describe('SourcePriorityConfigV1Repo', () => {
  it('reads the seeded default and applies an atomic compare-and-set', () => {
    const db = new BetterSqlite3(':memory:')
    applyGenerationV2SchemaForTest(db, path.resolve(process.cwd()))
    try {
      const repo = new SourcePriorityConfigV1Repo(db, () => 42)
      const initial = repo.get()
      expect(initial.config.priorities).toEqual({ provider_native: 3, models_dev: 2, capability_rule: 1 })
      expect(repo.compareAndSet(initial.config.sourcePriorityConfigRevision, initial.config.priorities))
        .toEqual(initial)

      const updated = repo.compareAndSet(initial.config.sourcePriorityConfigRevision, {
        provider_native: 1, models_dev: 1, capability_rule: 1,
      })
      expect(updated.config.priorities).toEqual({ provider_native: 1, models_dev: 1, capability_rule: 1 })
      expect(updated.config.sourcePriorityConfigRevision).not.toBe(initial.config.sourcePriorityConfigRevision)
      expect(updated.updatedAtMs).toBe(42)
      expect(() => repo.compareAndSet(initial.config.sourcePriorityConfigRevision, initial.config.priorities))
        .toThrow('GENERATION_V2_SOURCE_PRIORITY_CONFIG_STALE_REVISION')
    } finally { db.close() }
  })

  it('rejects corrupted stored semantic state', () => {
    const db = new BetterSqlite3(':memory:')
    applyGenerationV2SchemaForTest(db, path.resolve(process.cwd()))
    try {
      db.prepare('UPDATE model_facts_source_priority_v1 SET semantic_json = ? WHERE singleton_id = 1')
        .run('{"priorities":{"capability_rule":1,"models_dev":2,"provider_native":99},"schemaVersion":1}')
      expect(() => new SourcePriorityConfigV1Repo(db).get())
        .toThrow('GENERATION_V2_SOURCE_PRIORITY_CONFIG_STATE_INVALID')
    } finally { db.close() }
  })
})
