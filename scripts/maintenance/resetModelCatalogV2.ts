import path from 'node:path'
import BetterSqlite3 from 'better-sqlite3'
import { resetModelCatalogNamespaceV2InActiveTransaction } from '../../infra/db/v2/schemaComposerV2.ts'

function databasePathFromArgs(argv: readonly string[]): string {
  const marker = argv.indexOf('--database')
  const value = marker >= 0 ? argv[marker + 1] : undefined
  if (!value || !path.isAbsolute(value) || path.basename(value).toLowerCase() !== 'starverse.db' ||
      path.basename(path.dirname(value)).toLowerCase() !== 'epoch-2') {
    throw new Error('MODEL_CATALOG_RESET_DATABASE_PATH_INVALID')
  }
  return path.resolve(value)
}

function safeError(error: unknown): Readonly<Record<string, unknown>> {
  if (!error || typeof error !== 'object') return Object.freeze({ message: String(error) })
  const value = error as Readonly<Record<string, unknown>>
  return Object.freeze({
    name: typeof value.name === 'string' ? value.name : null,
    code: typeof value.code === 'string' ? value.code : null,
    message: typeof value.message === 'string' ? value.message : String(error),
  })
}

const databasePath = databasePathFromArgs(process.argv.slice(2))
const db = new BetterSqlite3(databasePath, { fileMustExist: true })
try {
  db.pragma('foreign_keys = ON')
  db.pragma('busy_timeout = 0')
  db.exec('BEGIN EXCLUSIVE')
  try {
    const beforeEnvelope = db.prepare(`SELECT envelope_revision
      FROM epoch_scope_key_envelope_v2 WHERE singleton_id = 1`).get() as { envelope_revision: number } | undefined
    if (!beforeEnvelope || !Number.isSafeInteger(beforeEnvelope.envelope_revision)) {
      throw new Error('MODEL_CATALOG_RESET_CREDENTIAL_ENVELOPE_REVISION_MISSING')
    }
    const result = resetModelCatalogNamespaceV2InActiveTransaction(db, path.resolve(process.cwd()))
    const afterEnvelope = db.prepare(`SELECT envelope_revision
      FROM epoch_scope_key_envelope_v2 WHERE singleton_id = 1`).get() as { envelope_revision: number } | undefined
    if (!afterEnvelope || beforeEnvelope.envelope_revision !== afterEnvelope.envelope_revision ||
        result.credentialEnvelopeRevision !== afterEnvelope.envelope_revision) {
      throw new Error('MODEL_CATALOG_RESET_CREDENTIAL_ENVELOPE_REVISION_CHANGED')
    }
    db.exec('COMMIT')
    process.stdout.write(`${JSON.stringify({
      ok: true,
      ...result,
      credentialEnvelopeRevisionUnchanged: true,
    })}\n`)
  } catch (error) {
    if (db.inTransaction) db.exec('ROLLBACK')
    process.stderr.write(`${JSON.stringify({
      ok: false,
      stage: 'catalog_namespace_transaction',
      databaseError: safeError(error),
    })}\n`)
    process.exitCode = 1
  }
} finally {
  if (db.open) db.close()
}
