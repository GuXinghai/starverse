import { describe, expect, it } from 'vitest'
import BetterSqlite3 from 'better-sqlite3'
import { readFileSync } from 'node:fs'
import path from 'node:path'
import { ModelPreferencesRepo } from './modelPreferencesRepo'

function loadSchema(db: BetterSqlite3.Database) {
  const schemaPath = path.resolve(process.cwd(), 'infra', 'db', 'schema.sql')
  db.exec(readFileSync(schemaPath, 'utf8'))
}

describe('ModelPreferencesRepo', () => {
  it('supports global/project/conversation scopes for favorites and recents', () => {
    const db = new BetterSqlite3(':memory:')
    loadSchema(db)
    const repo = new ModelPreferencesRepo(db)

    repo.addFavorite({ scopeType: 'global', scopeId: '', modelKey: 'openrouter::openai/gpt-4o' })
    repo.addFavorite({ scopeType: 'project', scopeId: 'project-1', modelKey: 'openrouter::openai/gpt-4.1' })
    repo.addFavorite({ scopeType: 'conversation', scopeId: 'convo-1', modelKey: 'openrouter::anthropic/claude-3' })

    expect(repo.listFavorites({})).toHaveLength(1)
    expect(repo.listFavorites({ scopeType: 'project', scopeId: 'project-1' })).toHaveLength(1)
    expect(repo.listFavorites({ scopeType: 'conversation', scopeId: 'convo-1' })).toHaveLength(1)

    repo.recordRecent({ scopeType: 'global', scopeId: '', modelKey: 'openrouter::openai/gpt-4o' })
    repo.recordRecent({ scopeType: 'project', scopeId: 'project-1', modelKey: 'openrouter::openai/gpt-4.1' })
    repo.recordRecent({ scopeType: 'conversation', scopeId: 'convo-1', modelKey: 'openrouter::anthropic/claude-3' })

    expect(repo.listRecents({})).toHaveLength(1)
    expect(repo.listRecents({ scopeType: 'project', scopeId: 'project-1' })).toHaveLength(1)
    expect(repo.listRecents({ scopeType: 'conversation', scopeId: 'convo-1' })).toHaveLength(1)
  })

  it('deduplicates favorites by scope+model and increments recents useCount', () => {
    const db = new BetterSqlite3(':memory:')
    loadSchema(db)
    const repo = new ModelPreferencesRepo(db)

    repo.addFavorite({
      scopeType: 'global',
      scopeId: '',
      modelKey: 'openrouter::openai/gpt-4o',
      sortRank: 8,
    })
    repo.addFavorite({
      scopeType: 'global',
      scopeId: '',
      providerKey: 'openrouter',
      modelId: 'openai/gpt-4o',
      sortRank: 2,
    })

    const favorites = repo.listFavorites()
    expect(favorites).toHaveLength(1)
    expect(favorites[0].sortRank).toBe(2)

    const t0 = Date.now() - 1000
    const t1 = Date.now()
    repo.recordRecent({
      scopeType: 'global',
      scopeId: '',
      modelKey: 'openrouter::openai/gpt-4o',
      usedAtMs: t0,
    })
    repo.recordRecent({
      scopeType: 'global',
      scopeId: '',
      modelKey: 'openrouter::openai/gpt-4o',
      usedAtMs: t1,
    })

    const recents = repo.listRecents({ scopeType: 'global', scopeId: '', limit: 10 })
    expect(recents).toHaveLength(1)
    expect(recents[0].useCount).toBe(2)
    expect(recents[0].lastUsedAtMs).toBe(t1)
  })

  it('keeps deterministic ordering and stable tie-breaker when reordering favorites', () => {
    const db = new BetterSqlite3(':memory:')
    loadSchema(db)
    const repo = new ModelPreferencesRepo(db)

    repo.addFavorite({ modelKey: 'openrouter::openai/a', sortRank: 10 })
    repo.addFavorite({ modelKey: 'openrouter::openai/b', sortRank: 10 })
    repo.addFavorite({ modelKey: 'openrouter::openai/c', sortRank: 10 })

    const initial = repo.listFavorites()
    expect(initial.map((row) => row.modelKey)).toEqual([
      'openrouter::openai/a',
      'openrouter::openai/b',
      'openrouter::openai/c',
    ])

    const reordered = repo.reorderFavorites({
      orderedModelKeys: ['openrouter::openai/c', 'openrouter::openai/c', 'openrouter::openai/a'],
    })
    expect(reordered.map((row) => row.modelKey)).toEqual([
      'openrouter::openai/c',
      'openrouter::openai/a',
      'openrouter::openai/b',
    ])
    expect(reordered.map((row) => row.sortRank)).toEqual([0, 1, 2])
  })

  it('reorderFavorites is atomic when transaction fails mid-update', () => {
    const db = new BetterSqlite3(':memory:')
    loadSchema(db)
    const repo = new ModelPreferencesRepo(db)

    repo.addFavorite({ modelKey: 'openrouter::openai/a', sortRank: 0 })
    repo.addFavorite({ modelKey: 'openrouter::openai/b', sortRank: 1 })
    repo.addFavorite({ modelKey: 'openrouter::openai/c', sortRank: 2 })

    const before = repo.listFavorites()

    expect(() =>
      repo.reorderFavorites({
        orderedModelKeys: [
          'openrouter::openai/b',
          'openrouter::openai/missing',
          'openrouter::openai/a',
        ],
      })
    ).toThrow(/Favorite not found in scope/)

    const after = repo.listFavorites()
    expect(after).toEqual(before)
  })

  it('keeps recents capped at 50 items per scope and prunes oldest entries', () => {
    const db = new BetterSqlite3(':memory:')
    loadSchema(db)
    const repo = new ModelPreferencesRepo(db)

    const base = Date.now()
    for (let i = 0; i < 55; i += 1) {
      repo.recordRecent({
        scopeType: 'global',
        scopeId: '',
        modelKey: `openrouter::openai/model-${i}`,
        usedAtMs: base + i,
      })
    }

    const recents = repo.listRecents({ scopeType: 'global', scopeId: '', limit: 1000 })
    expect(recents).toHaveLength(50)
    expect(recents.map((item) => item.modelId)).not.toContain('openai/model-0')
    expect(recents.map((item) => item.modelId)).not.toContain('openai/model-1')
    expect(recents.map((item) => item.modelId)).not.toContain('openai/model-2')
    expect(recents.map((item) => item.modelId)).not.toContain('openai/model-3')
    expect(recents.map((item) => item.modelId)).not.toContain('openai/model-4')
    expect(recents[0]?.modelId).toBe('openai/model-54')
    expect(recents[49]?.modelId).toBe('openai/model-5')
  })
})
