import BetterSqlite3 from 'better-sqlite3'
import {
  SETTINGS_KEY_CHAT_REASONING_PANEL_DEFAULT_EXPANDED,
  SETTINGS_KEY_CHAT_REASONING_DISPLAY_MODE,
  SETTINGS_KEY_DFC_ATTACHMENT_DEFAULTS,
  SETTINGS_KEY_NETWORK_PROXY,
  SETTINGS_KEY_IMAGE_GENERATION_DEFAULT,
  SETTINGS_KEY_OPENROUTER_PROVIDER_REQUIRE_PARAMETERS,
  SETTINGS_KEY_REASONING_PREFS,
  SETTINGS_KEY_SAMPLING_PARAMS_DEFAULTS,
  SETTINGS_KEY_USER_MESSAGE_RENDER_DEFAULT,
  SETTINGS_KEY_WEB_SEARCH_DEFAULTS,
} from './settingsKeys'
import { normalizeDfcAttachmentDefaults } from '../../../src/shared/files/dfcAttachmentDefaults'
import {
  normalizeNetworkProxySettings,
  proxyUrlContainsCredentials,
  type NetworkProxySettings,
} from '../../../src/next/plugin-distribution/networkProxy'

type SqlDatabase = BetterSqlite3.Database

export class SettingsRepo {
  private getStmt: BetterSqlite3.Statement
  private upsertStmt: BetterSqlite3.Statement
  private deleteStmt: BetterSqlite3.Statement
  private deleteByPrefixStmt: BetterSqlite3.Statement

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

    this.deleteStmt = this.db.prepare(`
      DELETE FROM settings_kv
      WHERE key = @key
    `)

    this.deleteByPrefixStmt = this.db.prepare(`
      DELETE FROM settings_kv
      WHERE key LIKE @prefixLike
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

  private deleteKey(key: string): number {
    const result = this.deleteStmt.run({ key })
    return Number(result.changes ?? 0)
  }

  private deleteKeysByPrefix(prefix: string): number {
    const normalized = String(prefix ?? '')
    if (!normalized) return 0
    const result = this.deleteByPrefixStmt.run({ prefixLike: `${normalized}%` })
    return Number(result.changes ?? 0)
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

  getDfcAttachmentDefaults(): unknown {
    return normalizeDfcAttachmentDefaults(this.readJson(SETTINGS_KEY_DFC_ATTACHMENT_DEFAULTS))
  }

  setDfcAttachmentDefaults(value: unknown): void {
    this.writeJson(SETTINGS_KEY_DFC_ATTACHMENT_DEFAULTS, normalizeDfcAttachmentDefaults(value))
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

  getChatReasoningDisplayMode(): 'inline' | 'rail' {
    const value = this.readJson(SETTINGS_KEY_CHAT_REASONING_DISPLAY_MODE)
    return value === 'rail' ? 'rail' : 'inline'
  }

  setChatReasoningDisplayMode(value: 'inline' | 'rail'): void {
    if (value !== 'inline' && value !== 'rail') throw new Error('value must be inline or rail')
    this.writeJson(SETTINGS_KEY_CHAT_REASONING_DISPLAY_MODE, value)
  }

  getChatReasoningPanelDefaultExpanded(): boolean {
    const value = this.readJson(SETTINGS_KEY_CHAT_REASONING_PANEL_DEFAULT_EXPANDED)
    return value === undefined ? true : value === true
  }

  setChatReasoningPanelDefaultExpanded(value: boolean): void {
    if (typeof value !== 'boolean') throw new Error('value must be boolean')
    this.writeJson(SETTINGS_KEY_CHAT_REASONING_PANEL_DEFAULT_EXPANDED, value)
  }

  getNetworkProxySettings(): NetworkProxySettings {
    return normalizeNetworkProxySettings(this.readJson(SETTINGS_KEY_NETWORK_PROXY))
  }

  setNetworkProxySettings(value: unknown): void {
    const normalized = normalizeNetworkProxySettings(value)
    if (proxyUrlContainsCredentials(normalized.manualProxyUrl)) {
      throw new Error('proxy credentials require secure storage and are not accepted in the proxy URL')
    }
    this.writeJson(SETTINGS_KEY_NETWORK_PROXY, normalized)
  }

  getChatDraft(key: string): string | null {
    const normalized = String(key ?? '').trim()
    if (!normalized) return null
    const value = this.readJson(normalized)
    return typeof value === 'string' ? value : null
  }

  setChatDraft(key: string, value: string): void {
    const normalizedKey = String(key ?? '').trim()
    if (!normalizedKey) throw new Error('key must be non-empty')
    const normalizedValue = typeof value === 'string' ? value : String(value ?? '')
    this.writeJson(normalizedKey, normalizedValue)
  }

  deleteChatDraft(key: string): number {
    const normalized = String(key ?? '').trim()
    if (!normalized) return 0
    return this.deleteKey(normalized)
  }

  deleteChatDraftsByPrefix(prefix: string): number {
    const normalized = String(prefix ?? '').trim()
    if (!normalized) return 0
    return this.deleteKeysByPrefix(normalized)
  }
}
