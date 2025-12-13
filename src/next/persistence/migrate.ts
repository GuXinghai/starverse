import { readFileSync } from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'

type BetterSqliteDatabase = {
  exec(sql: string): void
  pragma(sql: string, options?: { simple?: boolean }): any
}

function readSchemaSQL(): string {
  const __filename = fileURLToPath(import.meta.url)
  const __dirname = path.dirname(__filename)
  const schemaPath = path.resolve(__dirname, './schema.sql')
  return readFileSync(schemaPath, 'utf8')
}

/**
 * Idempotent migration for next pipeline persistence schema.
 */
export function migrateNextPersistence(db: BetterSqliteDatabase): { schemaVersion: number } {
  const current = Number(db.pragma('user_version', { simple: true }) || 0)
  const target = 1

  if (current < target) {
    db.exec(readSchemaSQL())
    db.pragma(`user_version = ${target}`)
  } else {
    // Still ensure tables exist (idempotent).
    db.exec(readSchemaSQL())
  }

  return { schemaVersion: target }
}

