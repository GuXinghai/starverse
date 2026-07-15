import fs, { readFileSync } from 'node:fs'
import os from 'node:os'
import path from 'node:path'
import BetterSqlite3 from 'better-sqlite3'
import { describe, expect, it } from 'vitest'
import {
  DEFAULT_OPENROUTER_IMAGE_DESCRIPTOR_FRESHNESS_PAIR_V2,
  decodeOpenRouterImageDescriptorFreshnessPairV2,
  OPENROUTER_IMAGE_HARD_EXPIRE_AFTER_PRESETS_MS_V2,
  OPENROUTER_IMAGE_REFRESH_AFTER_PRESETS_MS_V2,
} from '../../../src/next/generation-v2/providers/openrouter-images/descriptorFreshnessSettingsV2'
import { applyGenerationV2Schema } from '../v2/schemaComposerV2'
import {
  isOpenRouterImageDescriptorFreshnessSettingsFactV2,
  OpenRouterImageSettingsRepo,
} from './openRouterImageSettingsRepo'

function fixture(times: number[]) {
  const db = new BetterSqlite3(':memory:')
  applyGenerationV2Schema(db, path.resolve(process.cwd()))
  const repo = new OpenRouterImageSettingsRepo(db, () => {
    const value = times.shift()
    if (value === undefined) throw new Error('missing test clock value')
    return value
  })
  return { db, repo }
}

function sqlPresetValues(schema: string, column: 'refresh_after_ms' | 'hard_expire_after_ms'): number[] {
  const match = schema.match(new RegExp(`${column} INTEGER NOT NULL CHECK \\(${column} IN \\(([^)]+)\\)\\)`))
  if (!match) throw new Error(`missing SQL preset constraint for ${column}`)
  return match[1].split(',').map((value) => Number(value.trim()))
}

describe('OpenRouter Images V2 descriptor freshness settings', () => {
  it('atomically persists defaults once and returns a repository-issued fact', () => {
    const { db, repo } = fixture([100])
    try {
      const first = repo.readOrRestore()
      expect(first.restoration).toBe('created_default')
      expect(first.settings.pair).toEqual(DEFAULT_OPENROUTER_IMAGE_DESCRIPTOR_FRESHNESS_PAIR_V2)
      expect(first.settings.revision).toBe(1)
      expect(isOpenRouterImageDescriptorFreshnessSettingsFactV2(first.settings)).toBe(true)
      const second = repo.readOrRestore()
      expect(second.restoration).toBe('none')
      expect(second.settings).toMatchObject({ revision: 1, createdAtMs: 100, updatedAtMs: 100 })
    } finally { db.close() }
  })

  it('strictly accepts only complete numeric preset pairs and rejects coercion or partial patches', () => {
    expect(decodeOpenRouterImageDescriptorFreshnessPairV2({
      refreshAfterMs: 60 * 60 * 1_000,
      hardExpireAfterMs: 24 * 60 * 60 * 1_000,
    })).toEqual({ refreshAfterMs: 3_600_000, hardExpireAfterMs: 86_400_000 })
    for (const value of [
      { refreshAfterMs: '3600000', hardExpireAfterMs: 86_400_000 },
      { refreshAfterMs: 3_600_000.5, hardExpireAfterMs: 86_400_000 },
      { refreshAfterMs: 86_400_000, hardExpireAfterMs: 86_400_000 },
      { refreshAfterMs: 3_600_000 },
      { refreshAfterMs: 3_600_000, hardExpireAfterMs: 86_400_000, extra: true },
    ]) expect(() => decodeOpenRouterImageDescriptorFreshnessPairV2(value)).toThrow()
    let calls = 0
    const accessor = Object.defineProperty({ hardExpireAfterMs: 86_400_000 }, 'refreshAfterMs', {
      enumerable: true, get: () => { calls += 1; return 3_600_000 },
    })
    expect(() => decodeOpenRouterImageDescriptorFreshnessPairV2(accessor)).toThrow()
    expect(calls).toBe(0)
  })

  it('uses revision CAS for whole-pair updates and keeps diagnostic time nondecreasing', () => {
    const { db, repo } = fixture([100, 50, 200])
    try {
      const initial = repo.readOrRestore().settings
      const updated = repo.setPair({ refreshAfterMs: 3_600_000, hardExpireAfterMs: 86_400_000 }, initial.revision)
      expect(updated).toMatchObject({ revision: 2, createdAtMs: 100, updatedAtMs: 100 })
      expect(() => repo.setPair({ refreshAfterMs: 900_000, hardExpireAfterMs: 3_600_000 }, initial.revision))
        .toThrow('GENERATION_V2_OPENROUTER_SETTINGS_STALE_REVISION')
      expect(repo.readOrRestore().settings).toMatchObject({
        revision: 2,
        pair: { refreshAfterMs: 3_600_000, hardExpireAfterMs: 86_400_000 },
      })
    } finally { db.close() }
  })

  it('repairs a bypassed invalid row as one default pair with a new revision', () => {
    const { db, repo } = fixture([100, 200])
    try {
      repo.readOrRestore()
      db.pragma('ignore_check_constraints = ON')
      db.prepare(`UPDATE openrouter_image_endpoint_settings SET refresh_after_ms = ?, revision = 7`)
        .run(123)
      db.pragma('ignore_check_constraints = OFF')
      const repaired = repo.readOrRestore()
      expect(repaired.restoration).toBe('repaired_default')
      expect(repaired.settings).toMatchObject({
        revision: 8,
        pair: DEFAULT_OPENROUTER_IMAGE_DESCRIPTOR_FRESHNESS_PAIR_V2,
      })
      expect(db.prepare('SELECT COUNT(*) AS count FROM openrouter_image_endpoint_settings').get()).toEqual({ count: 1 })
    } finally { db.close() }
  })

  it('repairs wrong or extra singleton rows as one complete default pair', () => {
    const { db, repo } = fixture([100, 200, 300])
    try {
      repo.readOrRestore()
      db.pragma('ignore_check_constraints = ON')
      db.prepare(`
        INSERT INTO openrouter_image_endpoint_settings (
          setting_id, schema_version, refresh_after_ms, hard_expire_after_ms,
          revision, created_at_ms, updated_at_ms
        ) VALUES ('rogue', 1, 900000, 3600000, 9, 150, 150)
      `).run()
      db.pragma('ignore_check_constraints = OFF')
      const repairedExtra = repo.readOrRestore()
      expect(repairedExtra).toMatchObject({
        restoration: 'repaired_default',
        settings: { revision: 10, pair: DEFAULT_OPENROUTER_IMAGE_DESCRIPTOR_FRESHNESS_PAIR_V2 },
      })
      expect(db.prepare('SELECT setting_id FROM openrouter_image_endpoint_settings').all())
        .toEqual([{ setting_id: 'endpoint_descriptor_freshness' }])

      db.pragma('ignore_check_constraints = ON')
      db.prepare('UPDATE openrouter_image_endpoint_settings SET setting_id = ?, revision = 12').run('wrong-only')
      db.prepare(`
        INSERT INTO openrouter_image_endpoint_settings (
          setting_id, schema_version, refresh_after_ms, hard_expire_after_ms,
          revision, created_at_ms, updated_at_ms
        ) VALUES ('second-rogue', 1, 900000, 3600000, 13, 250, 250)
      `).run()
      db.pragma('ignore_check_constraints = OFF')
      const repairedWrong = repo.readOrRestore()
      expect(repairedWrong).toMatchObject({
        restoration: 'repaired_default',
        settings: { revision: 14, pair: DEFAULT_OPENROUTER_IMAGE_DESCRIPTOR_FRESHNESS_PAIR_V2 },
      })
      expect(db.prepare('SELECT COUNT(*) AS count FROM openrouter_image_endpoint_settings').get()).toEqual({ count: 1 })
    } finally { db.close() }
  })

  it('never reuses a revision after the settings row is deleted and restored', () => {
    const { db, repo } = fixture([100, 200, 300])
    try {
      const oldRevision = repo.readOrRestore().settings.revision
      db.prepare('DELETE FROM openrouter_image_endpoint_settings').run()
      const restored = repo.readOrRestore()
      expect(restored).toMatchObject({ restoration: 'created_default', settings: { revision: oldRevision + 1 } })
      expect(() => repo.setPair(
        { refreshAfterMs: 3_600_000, hardExpireAfterMs: 86_400_000 },
        oldRevision,
      )).toThrow('GENERATION_V2_OPENROUTER_SETTINGS_STALE_REVISION')
    } finally { db.close() }
  })

  it('rejects exhausted revisions without deleting or rewriting settings', () => {
    const { db, repo } = fixture([100, 200])
    try {
      repo.readOrRestore()
      db.pragma('ignore_check_constraints = ON')
      db.prepare('UPDATE openrouter_image_endpoint_settings SET refresh_after_ms = 123, revision = ?')
        .run(Number.MAX_SAFE_INTEGER)
      db.pragma('ignore_check_constraints = OFF')
      const before = db.serialize()
      expect(() => repo.readOrRestore()).toThrow('GENERATION_V2_OPENROUTER_SETTINGS_REVISION_EXHAUSTED')
      expect(db.serialize()).toEqual(before)
    } finally { db.close() }
  })

  it('fails closed when the revision clock is missing or has multiple rows', () => {
    const { db, repo } = fixture([100])
    try {
      repo.readOrRestore()
      db.prepare('DELETE FROM openrouter_image_endpoint_settings_revision_clock').run()
      const missingState = db.serialize()
      expect(() => repo.readOrRestore()).toThrow('GENERATION_V2_OPENROUTER_SETTINGS_STATE_INVALID')
      expect(db.serialize()).toEqual(missingState)

      db.pragma('ignore_check_constraints = ON')
      db.prepare(`
        INSERT INTO openrouter_image_endpoint_settings_revision_clock (setting_id, last_revision)
        VALUES ('endpoint_descriptor_freshness', 1), ('rogue', 2)
      `).run()
      db.pragma('ignore_check_constraints = OFF')
      const multipleState = db.serialize()
      expect(() => repo.readOrRestore()).toThrow('GENERATION_V2_OPENROUTER_SETTINGS_STATE_INVALID')
      expect(db.serialize()).toEqual(multipleState)
    } finally { db.close() }
  })

  it('repairs a clock/settings mismatch without reusing either revision', () => {
    const { db, repo } = fixture([100, 200])
    try {
      repo.readOrRestore()
      db.prepare(`
        UPDATE openrouter_image_endpoint_settings_revision_clock SET last_revision = 7
        WHERE setting_id = 'endpoint_descriptor_freshness'
      `).run()
      const repaired = repo.readOrRestore()
      expect(repaired).toMatchObject({ restoration: 'repaired_default', settings: { revision: 8 } })
    } finally { db.close() }
  })

  it('rolls back the clock when a settings update or restore insert aborts', () => {
    const { db, repo } = fixture([100, 200, 300])
    try {
      const initial = repo.readOrRestore().settings
      db.exec(`
        CREATE TRIGGER abort_settings_update BEFORE UPDATE ON openrouter_image_endpoint_settings
        BEGIN SELECT RAISE(ABORT, 'blocked update'); END;
      `)
      expect(() => repo.setPair(
        { refreshAfterMs: 3_600_000, hardExpireAfterMs: 86_400_000 },
        initial.revision,
      )).toThrow('blocked update')
      expect(db.prepare('SELECT last_revision FROM openrouter_image_endpoint_settings_revision_clock').get())
        .toEqual({ last_revision: initial.revision })
      db.exec('DROP TRIGGER abort_settings_update')

      db.prepare('DELETE FROM openrouter_image_endpoint_settings').run()
      db.exec(`
        CREATE TRIGGER abort_settings_insert BEFORE INSERT ON openrouter_image_endpoint_settings
        BEGIN SELECT RAISE(ABORT, 'blocked insert'); END;
      `)
      expect(() => repo.readOrRestore()).toThrow('blocked insert')
      expect(db.prepare('SELECT last_revision FROM openrouter_image_endpoint_settings_revision_clock').get())
        .toEqual({ last_revision: initial.revision })
      expect(db.prepare('SELECT COUNT(*) AS count FROM openrouter_image_endpoint_settings').get())
        .toEqual({ count: 0 })
    } finally { db.close() }
  })

  it('locks the TypeScript and SQL preset acceptance sets with the complete matrix', () => {
    const { db } = fixture([])
    try {
      const schema = readFileSync(path.resolve('infra/db/v2/openRouterImagesSchema.sql'), 'utf8')
      expect(sqlPresetValues(schema, 'refresh_after_ms'))
        .toEqual([...OPENROUTER_IMAGE_REFRESH_AFTER_PRESETS_MS_V2])
      expect(sqlPresetValues(schema, 'hard_expire_after_ms'))
        .toEqual([...OPENROUTER_IMAGE_HARD_EXPIRE_AFTER_PRESETS_MS_V2])
      const insert = db.prepare(`
        INSERT INTO openrouter_image_endpoint_settings (
          setting_id, schema_version, refresh_after_ms, hard_expire_after_ms,
          revision, created_at_ms, updated_at_ms
        ) VALUES ('endpoint_descriptor_freshness', 1, ?, ?, 1, 1, 1)
      `)
      for (const refreshAfterMs of OPENROUTER_IMAGE_REFRESH_AFTER_PRESETS_MS_V2) {
        for (const hardExpireAfterMs of OPENROUTER_IMAGE_HARD_EXPIRE_AFTER_PRESETS_MS_V2) {
          let codecAccepted = true
          try { decodeOpenRouterImageDescriptorFreshnessPairV2({ refreshAfterMs, hardExpireAfterMs }) } catch { codecAccepted = false }
          db.prepare('DELETE FROM openrouter_image_endpoint_settings').run()
          let sqlAccepted = true
          try { insert.run(refreshAfterMs, hardExpireAfterMs) } catch { sqlAccepted = false }
          expect(sqlAccepted, `${refreshAfterMs}/${hardExpireAfterMs}`).toBe(codecAccepted)
          expect(codecAccepted).toBe(refreshAfterMs < hardExpireAfterMs)
        }
      }
    } finally { db.close() }
  })

  it('allows only one winner across two database connections at the same revision', () => {
    const directory = fs.mkdtempSync(path.join(os.tmpdir(), 'starverse-or-settings-'))
    const databasePath = path.join(directory, 'starverse.db')
    const firstDb = new BetterSqlite3(databasePath)
    const secondDb = new BetterSqlite3(databasePath)
    try {
      firstDb.pragma('journal_mode = WAL')
      applyGenerationV2Schema(firstDb, path.resolve(process.cwd()))
      secondDb.pragma('busy_timeout = 1')
      const first = new OpenRouterImageSettingsRepo(firstDb, () => 100)
      const second = new OpenRouterImageSettingsRepo(secondDb, () => 200)
      const revision = first.readOrRestore().settings.revision
      first.setPair({ refreshAfterMs: 3_600_000, hardExpireAfterMs: 86_400_000 }, revision)
      expect(() => second.setPair({ refreshAfterMs: 900_000, hardExpireAfterMs: 3_600_000 }, revision))
        .toThrow('GENERATION_V2_OPENROUTER_SETTINGS_STALE_REVISION')
      expect(second.readOrRestore().settings.pair).toEqual({ refreshAfterMs: 3_600_000, hardExpireAfterMs: 86_400_000 })
    } finally {
      secondDb.close()
      firstDb.close()
      fs.rmSync(directory, { recursive: true, force: true })
    }
  })
})
