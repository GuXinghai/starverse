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

  it('persists chat.reasoning_panel.default_expanded and defaults to true', () => {
    const db = new BetterSqlite3(':memory:')
    loadSchema(db)
    const repo = new SettingsRepo(db)

    expect(repo.getChatReasoningPanelDefaultExpanded()).toBe(true)

    repo.setChatReasoningPanelDefaultExpanded(false)
    expect(repo.getChatReasoningPanelDefaultExpanded()).toBe(false)

    repo.setChatReasoningPanelDefaultExpanded(true)
    expect(repo.getChatReasoningPanelDefaultExpanded()).toBe(true)
  })

  it('persists chat.reasoning_panel.auto_collapse_after_reasoning and defaults to false', () => {
    const db = new BetterSqlite3(':memory:')
    loadSchema(db)
    const repo = new SettingsRepo(db)

    expect(repo.getChatReasoningPanelAutoCollapseAfterReasoning()).toBe(false)

    repo.setChatReasoningPanelAutoCollapseAfterReasoning(true)
    expect(repo.getChatReasoningPanelAutoCollapseAfterReasoning()).toBe(true)

    repo.setChatReasoningPanelAutoCollapseAfterReasoning(false)
    expect(repo.getChatReasoningPanelAutoCollapseAfterReasoning()).toBe(false)
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

  it('persists generation_params.defaults without reading legacy sampling params', () => {
    const db = new BetterSqlite3(':memory:')
    loadSchema(db)
    const repo = new SettingsRepo(db)

    expect(repo.getGenerationParamsDefaults()).toBeNull()

    db.prepare(`
      INSERT INTO settings_kv(key, value_json, created_at_ms, updated_at_ms)
      VALUES ('sampling_params.defaults', @valueJson, 1, 1)
    `).run({
      valueJson: JSON.stringify({ top_p: { mode: 'custom', value: 0.2 } }),
    })
    expect(repo.getGenerationParamsDefaults()).toBeNull()

    const value = {
      version: 1,
      params: {
        topP: { mode: 'custom', value: 0.95 },
        maxOutputTokens: { mode: 'omit' },
      },
    }
    repo.setGenerationParamsDefaults(value)
    expect(repo.getGenerationParamsDefaults()).toEqual(value)

    repo.setGenerationParamsDefaults(null)
    expect(repo.getGenerationParamsDefaults()).toBeNull()
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
    }
    repo.setImageGenerationDefault(value)
    expect(repo.getImageGenerationDefault()).toEqual(value)

    repo.setImageGenerationDefault(null)
    expect(repo.getImageGenerationDefault()).toBeNull()
  })

  it('persists network proxy settings with environment default', () => {
    const db = new BetterSqlite3(':memory:')
    loadSchema(db)
    const repo = new SettingsRepo(db)

    expect(repo.getNetworkProxySettings()).toEqual({
      proxyMode: 'environment',
      manualProxyUrl: '',
      noProxy: '',
      strictSSL: true,
    })

    repo.setNetworkProxySettings({
      proxyMode: 'manual',
      manualProxyUrl: 'http://127.0.0.1:7890',
      noProxy: 'localhost,.github.com',
      strictSSL: true,
    })
    expect(repo.getNetworkProxySettings()).toEqual({
      proxyMode: 'manual',
      manualProxyUrl: 'http://127.0.0.1:7890',
      noProxy: 'localhost,.github.com',
      strictSSL: true,
    })
  })

  it('rejects credential-bearing proxy URLs before persistence', () => {
    const db = new BetterSqlite3(':memory:')
    loadSchema(db)
    const repo = new SettingsRepo(db)

    expect(() => repo.setNetworkProxySettings({
      proxyMode: 'manual',
      manualProxyUrl: 'http://user:secret@127.0.0.1:7890',
      noProxy: '',
      strictSSL: true,
    })).toThrow(/proxy credentials/u)
    expect(repo.getNetworkProxySettings().manualProxyUrl).toBe('')
  })
})
