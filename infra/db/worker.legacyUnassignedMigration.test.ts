import BetterSqlite3 from 'better-sqlite3'
import { afterEach, describe, expect, it } from 'vitest'
import { mkdtempSync, readFileSync, rmSync } from 'node:fs'
import os from 'node:os'
import path from 'node:path'
import { DbWorkerRuntime } from './worker'

describe('DbWorkerRuntime legacy unassigned migration', () => {
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

  it('migrates legacy unassigned project conversations to Inbox and removes the pseudo project', () => {
    const baseSchemaPath = path.resolve(process.cwd(), 'infra', 'db', 'schema.sql')
    const baseSchema = readFileSync(baseSchemaPath, 'utf8')

    const tempDir = mkdtempSync(path.join(os.tmpdir(), 'starverse-legacy-unassigned-'))
    tempDirs.push(tempDir)
    const dbPath = path.join(tempDir, 'legacy.sqlite')

    const seedDb = new BetterSqlite3(dbPath)
    try {
      seedDb.exec(baseSchema)
      const now = Date.now()

      seedDb.prepare(`
        INSERT INTO project (id, name, created_at, updated_at, meta, is_system, system_key)
        VALUES (@id, @name, @createdAt, @updatedAt, @meta, @isSystem, @systemKey)
      `).run({
        id: 'unassigned',
        name: 'No Project',
        createdAt: now,
        updatedAt: now,
        meta: null,
        isSystem: 1,
        systemKey: 'unassigned',
      })

      seedDb.prepare(`
        INSERT INTO convo (id, project_id, title, created_at, updated_at, meta)
        VALUES (@id, @projectId, @title, @createdAt, @updatedAt, @meta)
      `).run({
        id: 'c_legacy',
        projectId: 'unassigned',
        title: 'Legacy conversation',
        createdAt: now,
        updatedAt: now,
        meta: null,
      })
    } finally {
      seedDb.close()
    }

    const runtime = new DbWorkerRuntime({
      dbPath,
      schemaPath: baseSchemaPath,
    })

    try {
      const inboxId = runtime.getInboxId()
      expect(inboxId.length).toBeGreaterThan(0)

      const legacyProject = runtime.db
        .prepare(`SELECT id FROM project WHERE id = 'unassigned'`)
        .get() as { id: string } | undefined
      expect(legacyProject).toBeUndefined()

      const convo = runtime.db
        .prepare(`SELECT project_id FROM convo WHERE id = @id`)
        .get({ id: 'c_legacy' }) as { project_id: string } | undefined

      expect(convo?.project_id).toBe(inboxId)
    } finally {
      runtime.shutdown()
    }
  })
})
