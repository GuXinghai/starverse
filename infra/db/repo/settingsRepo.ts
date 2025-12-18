import BetterSqlite3 from 'better-sqlite3'

type SqlDatabase = BetterSqlite3.Database

const KEY_OPENROUTER_PROVIDER_REQUIRE_PARAMETERS = 'openrouter.provider.require_parameters' as const

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
    const value = this.readJson(KEY_OPENROUTER_PROVIDER_REQUIRE_PARAMETERS)
    return value === true
  }

  setOpenRouterProviderRequireParameters(value: boolean): void {
    if (typeof value !== 'boolean') throw new Error('value must be boolean')
    this.writeJson(KEY_OPENROUTER_PROVIDER_REQUIRE_PARAMETERS, value)
  }
}

