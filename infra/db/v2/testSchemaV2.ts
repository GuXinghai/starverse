import type BetterSqlite3 from 'better-sqlite3'
import {
  installGenerationV2SchemaInActiveTransaction,
  type GenerationV2SchemaBundle,
} from './schemaComposerV2'

export function applyGenerationV2SchemaForTest(
  db: BetterSqlite3.Database,
  rootPath: string,
): GenerationV2SchemaBundle {
  if (db.inTransaction) throw new Error('GENERATION_V2_TEST_SCHEMA_TRANSACTION_ACTIVE')
  db.pragma('foreign_keys = ON')
  if (db.pragma('foreign_keys', { simple: true }) !== 1) {
    throw new Error('GENERATION_V2_TEST_SCHEMA_FOREIGN_KEYS_UNAVAILABLE')
  }
  db.exec('BEGIN IMMEDIATE')
  try {
    const result = installGenerationV2SchemaInActiveTransaction(db, rootPath)
    db.exec('COMMIT')
    return result
  } catch (error) {
    if (db.inTransaction) db.exec('ROLLBACK')
    throw error
  }
}
