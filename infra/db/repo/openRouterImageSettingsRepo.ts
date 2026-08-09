import type BetterSqlite3 from 'better-sqlite3'
import {
  decodeOpenRouterImageDescriptorFreshnessPairV2,
  DEFAULT_OPENROUTER_IMAGE_DESCRIPTOR_FRESHNESS_PAIR_V2,
  OpenRouterImageDescriptorFreshnessSettingsV2Error,
  type OpenRouterImageDescriptorFreshnessPairV2,
} from '../../../src/next/generation-v2/providers/openrouter-images/descriptorFreshnessSettingsV2'

const SETTING_ID = 'endpoint_descriptor_freshness'

type SettingsRow = {
  setting_id: unknown
  schema_version: unknown
  refresh_after_ms: unknown
  hard_expire_after_ms: unknown
  revision: unknown
  created_at_ms: unknown
  updated_at_ms: unknown
}

type RevisionClockRow = {
  setting_id: unknown
  last_revision: unknown
}

export type OpenRouterImageDescriptorFreshnessSettingsFactV2 = Readonly<{
  trust: 'repository_settings_fact'
  pair: OpenRouterImageDescriptorFreshnessPairV2
  revision: number
  createdAtMs: number
  updatedAtMs: number
}>

export type OpenRouterImageDescriptorFreshnessReadResultV2 = Readonly<{
  settings: OpenRouterImageDescriptorFreshnessSettingsFactV2
  restoration: 'none' | 'created_default' | 'repaired_default'
}>

export class OpenRouterImageSettingsRepoV2Error extends Error {
  constructor(readonly code:
    | 'GENERATION_V2_OPENROUTER_SETTINGS_CLOCK_INVALID'
    | 'GENERATION_V2_OPENROUTER_SETTINGS_STATE_INVALID'
    | 'GENERATION_V2_OPENROUTER_SETTINGS_STALE_REVISION'
    | 'GENERATION_V2_OPENROUTER_SETTINGS_REVISION_EXHAUSTED') {
    super(code)
    this.name = 'OpenRouterImageSettingsRepoV2Error'
  }
}

const settingsFacts = new WeakSet<object>()

class OpenRouterImageSettingsRowInvalidError extends Error {}

function safeTime(value: number): number {
  if (!Number.isSafeInteger(value) || value < 0) {
    throw new OpenRouterImageSettingsRepoV2Error('GENERATION_V2_OPENROUTER_SETTINGS_CLOCK_INVALID')
  }
  return value
}

function decodeRow(row: SettingsRow): OpenRouterImageDescriptorFreshnessSettingsFactV2 {
  if (row.setting_id !== SETTING_ID || row.schema_version !== 1 ||
      !Number.isSafeInteger(row.revision) || (row.revision as number) <= 0 ||
      !Number.isSafeInteger(row.created_at_ms) || (row.created_at_ms as number) < 0 ||
      !Number.isSafeInteger(row.updated_at_ms) || (row.updated_at_ms as number) < (row.created_at_ms as number)) {
    throw new OpenRouterImageSettingsRowInvalidError('GENERATION_V2_OPENROUTER_SETTINGS_ROW_INVALID')
  }
  const fact: OpenRouterImageDescriptorFreshnessSettingsFactV2 = Object.freeze({
    trust: 'repository_settings_fact',
    pair: decodeOpenRouterImageDescriptorFreshnessPairV2({
      refreshAfterMs: row.refresh_after_ms,
      hardExpireAfterMs: row.hard_expire_after_ms,
    }),
    revision: row.revision as number,
    createdAtMs: row.created_at_ms as number,
    updatedAtMs: row.updated_at_ms as number,
  })
  settingsFacts.add(fact)
  return fact
}

export function isOpenRouterImageDescriptorFreshnessSettingsFactV2(
  value: unknown,
): value is OpenRouterImageDescriptorFreshnessSettingsFactV2 {
  return Boolean(value && typeof value === 'object' && settingsFacts.has(value))
}

export class OpenRouterImageSettingsRepo {
  constructor(
    private readonly db: BetterSqlite3.Database,
    private readonly nowMs: () => number = Date.now,
  ) {}

  readOrRestore(): OpenRouterImageDescriptorFreshnessReadResultV2 {
    const transaction = this.db.transaction(() => {
      const rows = this.readRows()
      const lastRevision = this.readRevisionClock()
      if (rows.length === 1) {
        const settings = this.tryDecodeDataRow(rows[0])
        if (settings && settings.revision === lastRevision) {
          return Object.freeze({ settings, restoration: 'none' as const })
        }
      }
      const requestedNow = safeTime(this.nowMs())
      const priorTimes = rows.flatMap((row) => [row.created_at_ms, row.updated_at_ms])
        .filter((value): value is number => Number.isSafeInteger(value) && (value as number) >= 0)
      const now = Math.max(requestedNow, ...priorTimes)
      const priorRevisions = rows.map((row) => row.revision)
        .filter((value): value is number => Number.isSafeInteger(value) && (value as number) > 0)
      const highestRevision = Math.max(lastRevision, ...priorRevisions)
      if (highestRevision >= Number.MAX_SAFE_INTEGER) {
        throw new OpenRouterImageSettingsRepoV2Error('GENERATION_V2_OPENROUTER_SETTINGS_REVISION_EXHAUSTED')
      }
      const revision = highestRevision + 1
      const clockUpdate = this.db.prepare(`
        UPDATE openrouter_image_endpoint_settings_revision_clock
        SET last_revision = ?
        WHERE setting_id = ? AND last_revision = ?
      `).run(revision, SETTING_ID, lastRevision)
      if (clockUpdate.changes !== 1) {
        throw new OpenRouterImageSettingsRepoV2Error('GENERATION_V2_OPENROUTER_SETTINGS_STALE_REVISION')
      }
      this.db.prepare('DELETE FROM openrouter_image_endpoint_settings').run()
      this.db.prepare(`
        INSERT INTO openrouter_image_endpoint_settings (
          setting_id, schema_version, refresh_after_ms, hard_expire_after_ms,
          revision, created_at_ms, updated_at_ms
        ) VALUES (?, 1, ?, ?, ?, ?, ?)
      `).run(
        SETTING_ID,
        DEFAULT_OPENROUTER_IMAGE_DESCRIPTOR_FRESHNESS_PAIR_V2.refreshAfterMs,
        DEFAULT_OPENROUTER_IMAGE_DESCRIPTOR_FRESHNESS_PAIR_V2.hardExpireAfterMs,
        revision,
        now,
        now,
      )
      const settings = decodeRow(this.readRow()!)
      return Object.freeze({
        settings,
        restoration: rows.length > 0 ? 'repaired_default' as const : 'created_default' as const,
      })
    })
    return this.runImmediate(transaction)
  }

  setPair(value: unknown, expectedRevision: unknown): OpenRouterImageDescriptorFreshnessSettingsFactV2 {
    const pair = decodeOpenRouterImageDescriptorFreshnessPairV2(value)
    if (!Number.isSafeInteger(expectedRevision) || (expectedRevision as number) <= 0) {
      throw new OpenRouterImageSettingsRepoV2Error('GENERATION_V2_OPENROUTER_SETTINGS_STALE_REVISION')
    }
    if (expectedRevision === Number.MAX_SAFE_INTEGER) {
      throw new OpenRouterImageSettingsRepoV2Error('GENERATION_V2_OPENROUTER_SETTINGS_REVISION_EXHAUSTED')
    }
    const now = safeTime(this.nowMs())
    const transaction = this.db.transaction(() => {
      const rows = this.readRows()
      const lastRevision = this.readRevisionClock()
      const current = rows.length === 1 ? this.tryDecodeDataRow(rows[0]) : null
      if (!current || current.revision !== expectedRevision || lastRevision !== expectedRevision) {
        throw new OpenRouterImageSettingsRepoV2Error('GENERATION_V2_OPENROUTER_SETTINGS_STALE_REVISION')
      }
      const clockUpdate = this.db.prepare(`
        UPDATE openrouter_image_endpoint_settings_revision_clock
        SET last_revision = last_revision + 1
        WHERE setting_id = ? AND last_revision = ?
      `).run(SETTING_ID, expectedRevision)
      if (clockUpdate.changes !== 1) {
        throw new OpenRouterImageSettingsRepoV2Error('GENERATION_V2_OPENROUTER_SETTINGS_STALE_REVISION')
      }
      const result = this.db.prepare(`
        UPDATE openrouter_image_endpoint_settings SET
          refresh_after_ms = ?, hard_expire_after_ms = ?, revision = revision + 1,
          updated_at_ms = CASE WHEN updated_at_ms > ? THEN updated_at_ms ELSE ? END
        WHERE setting_id = ? AND schema_version = 1 AND revision = ?
      `).run(pair.refreshAfterMs, pair.hardExpireAfterMs, now, now, SETTING_ID, expectedRevision)
      if (result.changes !== 1) {
        throw new OpenRouterImageSettingsRepoV2Error('GENERATION_V2_OPENROUTER_SETTINGS_STALE_REVISION')
      }
      return decodeRow(this.readRow()!)
    })
    return this.runImmediate(transaction)
  }

  private readRows(): SettingsRow[] {
    return this.db.prepare(`
      SELECT setting_id, schema_version, refresh_after_ms, hard_expire_after_ms,
             revision, created_at_ms, updated_at_ms
      FROM openrouter_image_endpoint_settings ORDER BY setting_id
    `).all() as SettingsRow[]
  }

  private readRow(): SettingsRow | undefined {
    return this.readRows().find((row) => row.setting_id === SETTING_ID)
  }

  private readRevisionClock(): number {
    const rows = this.db.prepare(`
      SELECT setting_id, last_revision
      FROM openrouter_image_endpoint_settings_revision_clock ORDER BY setting_id
    `).all() as RevisionClockRow[]
    if (rows.length !== 1 || rows[0].setting_id !== SETTING_ID ||
        !Number.isSafeInteger(rows[0].last_revision) || (rows[0].last_revision as number) < 0) {
      throw new OpenRouterImageSettingsRepoV2Error('GENERATION_V2_OPENROUTER_SETTINGS_STATE_INVALID')
    }
    return rows[0].last_revision as number
  }

  private tryDecodeDataRow(row: SettingsRow): OpenRouterImageDescriptorFreshnessSettingsFactV2 | null {
    try { return decodeRow(row) } catch (error) {
      if (error instanceof OpenRouterImageSettingsRowInvalidError ||
          error instanceof OpenRouterImageDescriptorFreshnessSettingsV2Error) return null
      throw error
    }
  }

  private runImmediate<T>(transaction: { immediate(): T }): T {
    try { return transaction.immediate() } catch (error) {
      if (error instanceof OpenRouterImageSettingsRepoV2Error) throw error
      const code = (error as { code?: unknown })?.code
      if (code === 'SQLITE_BUSY' || code === 'SQLITE_BUSY_SNAPSHOT' || code === 'SQLITE_LOCKED') {
        throw new OpenRouterImageSettingsRepoV2Error('GENERATION_V2_OPENROUTER_SETTINGS_STALE_REVISION')
      }
      throw error
    }
  }
}
