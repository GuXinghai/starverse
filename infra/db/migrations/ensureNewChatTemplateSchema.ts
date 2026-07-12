import type BetterSqlite3 from 'better-sqlite3'

/**
 * Upgrades legacy conversation tables for the system New Chat template.
 *
 * This migration must remain safe for databases created from an older baseline:
 * CREATE TABLE IF NOT EXISTS does not add columns to an existing table, so the
 * dependent index is deliberately created only after both columns are present.
 */
export function ensureNewChatTemplateSchema(db: BetterSqlite3.Database): void {
  const migrate = db.transaction(() => {
    const columns = db.pragma('table_info(convo)') as Array<{ name: string }>
    const names = new Set(columns.map((column) => column.name))

    if (!names.has('system_key')) {
      db.exec('ALTER TABLE convo ADD COLUMN system_key TEXT')
    }
    if (!names.has('template_revision')) {
      db.exec('ALTER TABLE convo ADD COLUMN template_revision INTEGER NOT NULL DEFAULT 0')
    }

    db.exec(`
      CREATE UNIQUE INDEX IF NOT EXISTS idx_convo_system_key
      ON convo(system_key)
      WHERE system_key IS NOT NULL
    `)
  })

  migrate.immediate()
}
