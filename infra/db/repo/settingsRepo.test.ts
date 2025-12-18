import { describe, expect, it } from 'vitest'
import BetterSqlite3 from 'better-sqlite3'
import { readFileSync } from 'node:fs'
import path from 'node:path'
import { SettingsRepo } from './settingsRepo'

function loadSchema(db: BetterSqlite3.Database) {
  const schemaPath = path.resolve(process.cwd(), 'infra', 'db', 'schema.sql')
  db.exec(readFileSync(schemaPath, 'utf8'))
}

describe('SettingsRepo (openrouter.provider.require_parameters)', () => {
  it('defaults to false and persists updates', () => {
    const db = new BetterSqlite3(':memory:')
    loadSchema(db)
    const repo = new SettingsRepo(db)

    expect(repo.getOpenRouterProviderRequireParameters()).toBe(false)

    repo.setOpenRouterProviderRequireParameters(true)
    expect(repo.getOpenRouterProviderRequireParameters()).toBe(true)

    repo.setOpenRouterProviderRequireParameters(false)
    expect(repo.getOpenRouterProviderRequireParameters()).toBe(false)
  })
})

