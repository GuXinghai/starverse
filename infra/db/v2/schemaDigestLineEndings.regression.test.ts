import fs from 'node:fs'
import os from 'node:os'
import path from 'node:path'
import BetterSqlite3 from 'better-sqlite3'
import { afterEach, describe, expect, it, vi } from 'vitest'
import {
  canonicalizeGenerationV2SchemaDigestInActiveTransaction,
  inspectGenerationV2SchemaBundle,
  installGenerationV2SchemaInActiveTransaction,
  verifyInstalledGenerationV2SchemaInActiveTransaction,
} from './schemaComposerV2'

const roots: string[] = []
afterEach(() => { while (roots.length) fs.rmSync(roots.pop()!, { recursive: true, force: true }) })

// Copies every schema fragment with one line-ending style, so the result does
// not depend on how this checkout stores the SQL files.
function schemaRootWithLineEndings(eol: '\n' | '\r\n'): string {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'starverse-schema-eol-'))
  roots.push(root)
  const target = path.join(root, 'infra', 'db', 'v2')
  fs.mkdirSync(target, { recursive: true })
  const source = path.resolve('infra/db/v2')
  for (const name of fs.readdirSync(source).filter(file => file.endsWith('.sql'))) {
    const text = fs.readFileSync(path.join(source, name), 'utf8').replace(/\r\n?/gu, '\n')
    fs.writeFileSync(path.join(target, name), eol === '\n' ? text : text.replace(/\n/gu, '\r\n'))
  }
  return root
}

describe('generation V2 schema digest', () => {
  it('is stable for identical bytes', () => {
    const root = schemaRootWithLineEndings('\n')
    expect(inspectGenerationV2SchemaBundle(root).schemaDigest).toBe(inspectGenerationV2SchemaBundle(root).schemaDigest)
  })

  // P2b-01 (+P8-01): the same schema checked out with CRLF line endings must
  // keep its identity, or an identical database is classified as a mismatch.
  it('P2b-01: identifies the same schema identically with LF and CRLF line endings', () => {
    expect(inspectGenerationV2SchemaBundle(schemaRootWithLineEndings('\r\n')).schemaDigest)
      .toBe(inspectGenerationV2SchemaBundle(schemaRootWithLineEndings('\n')).schemaDigest)
  })

  // The current schema as stamped by the reviewed mixed-ending Windows checkout
  // before fragments were hashed with LF line endings.
  const MIXED_CHECKOUT_DIGEST = '89007f35743f10b3a55732af0e3899a1077a5cd8494cb288b23af4e67c73d890'

  function stampedDatabase(root: string, digest: string): BetterSqlite3.Database {
    const db = new BetterSqlite3(':memory:')
    db.pragma('foreign_keys = ON')
    db.exec('BEGIN IMMEDIATE')
    installGenerationV2SchemaInActiveTransaction(db, root)
    db.prepare(`INSERT INTO app_meta_v2 (singleton_id, data_epoch, application_id, root_id, schema_digest, created_at_ms)
      VALUES (1, 2, 'app', ?, ?, 1)`).run('a'.repeat(64), digest)
    db.prepare('UPDATE generation_v2_schema_manifest SET schema_digest=?').run(digest)
    return db
  }

  function storedDigests(db: BetterSqlite3.Database) {
    return [
      (db.prepare('SELECT schema_digest FROM generation_v2_schema_manifest').get() as { schema_digest: string }).schema_digest,
      (db.prepare('SELECT schema_digest FROM app_meta_v2').get() as { schema_digest: string }).schema_digest,
    ]
  }

  it('P2b-01: re-stamps the identical current schema stamped with a line-ending alias', () => {
    const root = schemaRootWithLineEndings('\r\n')
    const canonical = inspectGenerationV2SchemaBundle(root).schemaDigest
    const db = stampedDatabase(root, MIXED_CHECKOUT_DIGEST)
    try {
      const validateIdentity = vi.fn()
      canonicalizeGenerationV2SchemaDigestInActiveTransaction(db, root, validateIdentity)
      expect(validateIdentity).toHaveBeenCalledWith(expect.objectContaining({ schemaDigest: MIXED_CHECKOUT_DIGEST }))
      expect(storedDigests(db)).toEqual([canonical, canonical])
      expect(verifyInstalledGenerationV2SchemaInActiveTransaction(db, root).schemaDigest).toBe(canonical)
      expect(() => db.prepare('UPDATE app_meta_v2 SET created_at_ms=2').run()).toThrow('GENERATION_V2_APP_META_IMMUTABLE')
    } finally { db.close() }
  })

  it('leaves an unknown digest to the mismatch classification', () => {
    const root = schemaRootWithLineEndings('\n')
    const unknown = 'b'.repeat(64)
    const db = stampedDatabase(root, unknown)
    try {
      const validateIdentity = vi.fn()
      canonicalizeGenerationV2SchemaDigestInActiveTransaction(db, root, validateIdentity)
      expect(validateIdentity).not.toHaveBeenCalled()
      expect(storedDigests(db)).toEqual([unknown, unknown])
      expect(() => verifyInstalledGenerationV2SchemaInActiveTransaction(db, root)).toThrow('GENERATION_V2_SCHEMA_DIGEST_MISMATCH')
    } finally { db.close() }
  })

  it('refuses to re-stamp an alias whose installed objects differ from the current schema', () => {
    const root = schemaRootWithLineEndings('\n')
    // A self-consistent database built from a different schema with the same object names.
    const other = schemaRootWithLineEndings('\n')
    const file = path.join(other, 'infra', 'db', 'v2', 'generationExecutionSchema.sql')
    const sql = fs.readFileSync(file, 'utf8')
    expect(sql).toContain("'GENERATION_V2_APP_META_IMMUTABLE'")
    fs.writeFileSync(file, sql.replace("'GENERATION_V2_APP_META_IMMUTABLE'", "'GENERATION_V2_APP_META_LOCKED'"))
    const db = stampedDatabase(other, MIXED_CHECKOUT_DIGEST)
    try {
      const validateIdentity = vi.fn()
      expect(() => canonicalizeGenerationV2SchemaDigestInActiveTransaction(db, root, validateIdentity))
        .toThrow('GENERATION_V2_SCHEMA_STATE_INVALID')
      expect(validateIdentity).not.toHaveBeenCalled()
      expect(storedDigests(db)).toEqual([MIXED_CHECKOUT_DIGEST, MIXED_CHECKOUT_DIGEST])
    } finally { db.close() }
  })
})
