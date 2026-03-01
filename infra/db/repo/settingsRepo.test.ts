import { describe, expect, it } from 'vitest'
import BetterSqlite3 from 'better-sqlite3'
import { readFileSync } from 'node:fs'
import path from 'node:path'
import { SettingsRepo } from './settingsRepo'

function loadSchema(db: BetterSqlite3.Database) {
  const schemaPath = path.resolve(process.cwd(), 'infra', 'db', 'schema.sql')
  db.exec(readFileSync(schemaPath, 'utf8'))
}

describe('SettingsRepo', () => {
  it('persists openrouter.provider.require_parameters', () => {
    const db = new BetterSqlite3(':memory:')
    loadSchema(db)
    const repo = new SettingsRepo(db)

    expect(repo.getOpenRouterProviderRequireParameters()).toBe(false)

    repo.setOpenRouterProviderRequireParameters(true)
    expect(repo.getOpenRouterProviderRequireParameters()).toBe(true)

    repo.setOpenRouterProviderRequireParameters(false)
    expect(repo.getOpenRouterProviderRequireParameters()).toBe(false)
  })

  it('persists chat.user_message_render.default and defaults to null', () => {
    const db = new BetterSqlite3(':memory:')
    loadSchema(db)
    const repo = new SettingsRepo(db)

    expect(repo.getUserMessageRenderDefault()).toBeNull()

    repo.setUserMessageRenderDefault(true)
    expect(repo.getUserMessageRenderDefault()).toBe(true)

    repo.setUserMessageRenderDefault(false)
    expect(repo.getUserMessageRenderDefault()).toBe(false)
  })

  it('persists web_search.defaults and defaults to null', () => {
    const db = new BetterSqlite3(':memory:')
    loadSchema(db)
    const repo = new SettingsRepo(db)

    expect(repo.getWebSearchDefaults()).toBeNull()

    const value = {
      searchMode: 'enable',
      searchDepth: 'high',
      searchEngine: 'auto',
      maxResults: 8,
    }
    repo.setWebSearchDefaults(value)
    expect(repo.getWebSearchDefaults()).toEqual(value)

    repo.setWebSearchDefaults(null)
    expect(repo.getWebSearchDefaults()).toBeNull()
  })

  it('persists sampling_params.defaults and defaults to null', () => {
    const db = new BetterSqlite3(':memory:')
    loadSchema(db)
    const repo = new SettingsRepo(db)

    expect(repo.getSamplingParamsDefaults()).toBeNull()

    const value = {
      temperature: { mode: 'custom', value: 0.8 },
      top_p: { mode: 'custom', value: 0.95 },
      max_tokens: { mode: 'custom', value: 1200 },
    }
    repo.setSamplingParamsDefaults(value)
    expect(repo.getSamplingParamsDefaults()).toEqual(value)

    repo.setSamplingParamsDefaults(null)
    expect(repo.getSamplingParamsDefaults()).toBeNull()
  })

  it('persists image_generation.default and defaults to null', () => {
    const db = new BetterSqlite3(':memory:')
    loadSchema(db)
    const repo = new SettingsRepo(db)

    expect(repo.getImageGenerationDefault()).toBeNull()

    const value = {
      enabled: true,
      outputMode: 'image_only',
      aspectRatio: '16:9',
      imageSize: '1024x1024',
      advancedJson: '{"seed":7}',
    }
    repo.setImageGenerationDefault(value)
    expect(repo.getImageGenerationDefault()).toEqual(value)

    repo.setImageGenerationDefault(null)
    expect(repo.getImageGenerationDefault()).toBeNull()
  })
})
