import Database from 'better-sqlite3'
import path from 'node:path'
import { describe, expect, it } from 'vitest'
import { applyGenerationV2SchemaForTest } from '../v2/testSchemaV2'
import { runGenerationV2AuthorityTransactionOnOwnedConnectionV2 } from './generationV2AuthorityTransactionInternal'
import { isToolRegistryRepositoryFactForContextV2, ToolRegistryV2Repo } from './toolRegistryV2Repo'

function registry(name = 'weather') {
  return {
    schemaVersion: 2,
    definitions: [{
      toolId: `tool:${name}`, kind: 'function', sideEffectPolicy: 'none',
      function: { name, parameters: { type: 'object' } },
    }],
  }
}

describe('ToolRegistryV2Repo', () => {
  it('persists immutable revisions and issues transaction-scoped selected facts', () => {
    const db = new Database(':memory:')
    applyGenerationV2SchemaForTest(db, path.resolve(process.cwd()))
    const repo = new ToolRegistryV2Repo(db, () => 100)
    const installed = repo.installAndSelect(registry(), null)
    expect(repo.installAndSelect(registry(), installed.revision).revision).toBe(installed.revision)
    runGenerationV2AuthorityTransactionOnOwnedConnectionV2(db, (context) => {
      const fact = repo.resolveCurrentForTools(context, ['tool:weather'])
      expect(isToolRegistryRepositoryFactForContextV2(fact, context)).toBe(true)
      expect(fact.selectedDefinitions[0].function.name).toBe('weather')
    })
    expect(db.prepare('SELECT count(*) AS count FROM tool_registry_revision_v2').get()).toEqual({ count: 1 })
    db.close()
  })

  it('retains old revisions for snapshot replay and rejects stale head updates', () => {
    const db = new Database(':memory:')
    applyGenerationV2SchemaForTest(db, path.resolve(process.cwd()))
    const repo = new ToolRegistryV2Repo(db, () => 100)
    const first = repo.installAndSelect(registry(), null)
    const second = repo.installAndSelect(registry('calculator'), first.revision)
    expect(() => repo.installAndSelect(registry('other'), first.revision))
      .toThrow('GENERATION_V2_TOOL_REGISTRY_STALE_HEAD')
    runGenerationV2AuthorityTransactionOnOwnedConnectionV2(db, (context) => {
      const fact = repo.loadSnapshotAuthority(context, first.revision, first.definitionsDigest, ['tool:weather'])
      expect(fact.selectedDefinitions[0].toolId).toBe('tool:weather')
    })
    expect(repo.currentRevision()?.revision).toBe(second.revision)
    expect(db.prepare('SELECT count(*) AS count FROM tool_registry_revision_v2').get()).toEqual({ count: 2 })
    db.close()
  })
})
