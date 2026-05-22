import BetterSqlite3 from 'better-sqlite3'
import { afterEach, describe, expect, it } from 'vitest'
import { mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs'
import os from 'node:os'
import path from 'node:path'
import { DbWorkerRuntime } from './worker'

describe('DbWorkerRuntime model catalog FTS migration', () => {
  const tempDirs: string[] = []

  afterEach(() => {
    for (const dir of tempDirs.splice(0)) {
      try {
        rmSync(dir, { recursive: true, force: true })
      } catch {
        // no-op
      }
    }
  })

  it('rebuilds legacy models_fts with prefix indexes and indexed model_id while preserving rows', () => {
    const baseSchemaPath = path.resolve(process.cwd(), 'infra', 'db', 'schema.sql')
    const baseSchema = readFileSync(baseSchemaPath, 'utf8')
    const legacySchema = baseSchema
      .replace(/  model_id,\r?\n  display_name,/, '  model_id UNINDEXED,\n  display_name,')
      .replace(/,\r?\n  prefix = '1 2 3 4'/, '')

    const tempDir = mkdtempSync(path.join(os.tmpdir(), 'starverse-model-fts-'))
    tempDirs.push(tempDir)
    const legacySchemaPath = path.join(tempDir, 'legacy-schema.sql')
    const dbPath = path.join(tempDir, 'catalog.sqlite')
    writeFileSync(legacySchemaPath, legacySchema, 'utf8')

    const seedDb = new BetterSqlite3(dbPath)
    try {
      seedDb.exec(legacySchema)
      const nowMs = Date.now()
      seedDb.prepare(`
        INSERT INTO providers (provider_key, display_name, updated_at_ms)
        VALUES ('openrouter', 'OpenRouter', @nowMs)
      `).run({ nowMs })
      seedDb.prepare(`
        INSERT INTO models (
          provider_key,
          model_id,
          model_key,
          canonical_slug,
          display_name,
          description,
          first_seen_at_ms,
          last_seen_at_ms,
          synced_at_ms
        ) VALUES (
          'openrouter',
          'deepseek/deepseek-chat',
          'openrouter::deepseek/deepseek-chat',
          'deepseek/deepseek-chat-v4',
          'DeepSeek: DeepSeek V4',
          'chat model',
          @nowMs,
          @nowMs,
          @nowMs
        )
      `).run({ nowMs })
    } finally {
      seedDb.close()
    }

    const runtime = new DbWorkerRuntime({
      dbPath,
      schemaPath: baseSchemaPath,
    })
    try {
      const ftsSql = String(
        (runtime.db
          .prepare("SELECT sql FROM sqlite_master WHERE type = 'table' AND name = 'models_fts'")
          .get() as { sql?: string } | undefined)?.sql ?? ''
      ).toLowerCase()
      expect(ftsSql).toMatch(/prefix\s*=\s*'?1 2 3 4'?/)
      expect(ftsSql).not.toContain('model_id unindexed')

      const rows = runtime.db
        .prepare("SELECT model_id AS modelId FROM models_fts WHERE models_fts MATCH @query")
        .all({ query: '{display_name model_id canonical_slug} : deep* v*' }) as Array<{ modelId: string }>
      expect(rows.map((row) => row.modelId)).toContain('deepseek/deepseek-chat')
    } finally {
      runtime.shutdown()
    }
  })
})
