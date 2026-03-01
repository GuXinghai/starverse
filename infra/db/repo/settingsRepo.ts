import BetterSqlite3 from 'better-sqlite3'
import {
  SETTINGS_KEY_IMAGE_GENERATION_DEFAULT,
  SETTINGS_KEY_OPENROUTER_PROVIDER_REQUIRE_PARAMETERS,
  SETTINGS_KEY_REASONING_PREFS,
  SETTINGS_KEY_SAMPLING_PARAMS_DEFAULTS,
  SETTINGS_KEY_USER_MESSAGE_RENDER_DEFAULT,
  SETTINGS_KEY_WEB_SEARCH_DEFAULTS,
} from './settingsKeys'

type SqlDatabase = BetterSqlite3.Database

export class SettingsRepo {
  private getStmt: BetterSqlite3.Statement
  private upsertStmt: BetterSqlite3.Statement

  constructor(private db: SqlDatabase) {
    this.getStmt = this.db.prepare(`
      SELECT value_json AS valueJson
      FROM settings_kv
      WHERE key = @key
      LIMIT 1
    `)

    this.upsertStmt = this.db.prepare(`
      INSERT INTO settings_kv(key, value_json, created_at_ms, updated_at_ms)
      VALUES (@key, @valueJson, @nowMs, @nowMs)
      ON CONFLICT(key) DO UPDATE SET
        value_json = excluded.value_json,
        updated_at_ms = excluded.updated_at_ms
    `)
  }

  private readJson(key: string): unknown | undefined {
    const row = this.getStmt.get({ key }) as { valueJson?: string } | undefined
    if (!row?.valueJson) return undefined
    try {
      return JSON.parse(row.valueJson)
    } catch {
      return undefined
    }
  }

  private writeJson(key: string, value: unknown): void {
    const nowMs = Date.now()
    this.upsertStmt.run({
      key,
      valueJson: JSON.stringify(value),
      nowMs,
    })
  }

  getOpenRouterProviderRequireParameters(): boolean {
    const value = this.readJson(SETTINGS_KEY_OPENROUTER_PROVIDER_REQUIRE_PARAMETERS)
    return value === true
  }

  setOpenRouterProviderRequireParameters(value: boolean): void {
    if (typeof value !== 'boolean') throw new Error('value must be boolean')
    this.writeJson(SETTINGS_KEY_OPENROUTER_PROVIDER_REQUIRE_PARAMETERS, value)
  }

  getReasoningPrefs(): unknown | null {
    const value = this.readJson(SETTINGS_KEY_REASONING_PREFS)
    return value === undefined ? null : value
  }

  setReasoningPrefs(value: unknown): void {
    this.writeJson(SETTINGS_KEY_REASONING_PREFS, value)
  }

  getWebSearchDefaults(): unknown | null {
    const value = this.readJson(SETTINGS_KEY_WEB_SEARCH_DEFAULTS)
    return value === undefined ? null : value
  }

  setWebSearchDefaults(value: unknown): void {
    this.writeJson(SETTINGS_KEY_WEB_SEARCH_DEFAULTS, value)
  }

  getSamplingParamsDefaults(): unknown | null {
    const value = this.readJson(SETTINGS_KEY_SAMPLING_PARAMS_DEFAULTS)
    return value === undefined ? null : value
  }

  setSamplingParamsDefaults(value: unknown): void {
    this.writeJson(SETTINGS_KEY_SAMPLING_PARAMS_DEFAULTS, value)
  }

  getImageGenerationDefault(): unknown | null {
    const value = this.readJson(SETTINGS_KEY_IMAGE_GENERATION_DEFAULT)
    return value === undefined ? null : value
  }

  setImageGenerationDefault(value: unknown): void {
    this.writeJson(SETTINGS_KEY_IMAGE_GENERATION_DEFAULT, value)
  }

  getUserMessageRenderDefault(): boolean | null {
    const value = this.readJson(SETTINGS_KEY_USER_MESSAGE_RENDER_DEFAULT)
    if (value === undefined) return null
    return value === true
  }

  setUserMessageRenderDefault(value: boolean): void {
    if (typeof value !== 'boolean') throw new Error('value must be boolean')
    this.writeJson(SETTINGS_KEY_USER_MESSAGE_RENDER_DEFAULT, value)
  }
}
