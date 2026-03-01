import { afterEach, describe, expect, it } from 'vitest'
import { mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs'
import os from 'node:os'
import path from 'node:path'
import { DbWorkerRuntime } from './worker'

describe('DbWorkerRuntime reasoning schema migration', () => {
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

  it('adds annotations_json for legacy message schema and keeps message APIs available', async () => {
    const baseSchemaPath = path.resolve(process.cwd(), 'infra', 'db', 'schema.sql')
    const baseSchema = readFileSync(baseSchemaPath, 'utf8')
    const legacySchema = baseSchema.replace(/^\s*annotations_json TEXT,\r?\n/m, '')
    expect(legacySchema.includes('annotations_json TEXT')).toBe(false)

    const tempDir = mkdtempSync(path.join(os.tmpdir(), 'starverse-legacy-schema-'))
    tempDirs.push(tempDir)
    const legacySchemaPath = path.join(tempDir, 'schema.legacy.sql')
    writeFileSync(legacySchemaPath, legacySchema, 'utf8')

    const runtime = new DbWorkerRuntime({
      dbPath: ':memory:',
      schemaPath: legacySchemaPath,
    })
    try {
      const columns = runtime.db.prepare('PRAGMA table_info(message)').all() as Array<{ name: string }>
      expect(columns.some((c) => c.name === 'annotations_json')).toBe(true)

      const created = await runtime.handleMessage({
        id: 'c1',
        method: 'convo.create',
        params: { title: 'Legacy Conversation' },
      })
      expect(created.ok).toBe(true)
      const convoId = String((created as any).result?.id ?? '')
      expect(convoId.length).toBeGreaterThan(0)

      const appended = await runtime.handleMessage({
        id: 'm1',
        method: 'message.append',
        params: {
          convoId,
          role: 'assistant',
          body: 'hello',
        },
      })
      expect(appended.ok).toBe(true)
      const messageId = String((appended as any).result?.id ?? '')
      expect(messageId.length).toBeGreaterThan(0)

      const saved = await runtime.handleMessage({
        id: 'm2',
        method: 'message.setAnnotations',
        params: {
          messageId,
          annotations: [{ type: 'url_citation', url: 'https://example.com' }],
        },
      })
      expect(saved.ok).toBe(true)

      const listed = await runtime.handleMessage({
        id: 'm3',
        method: 'message.list',
        params: { convoId },
      })
      expect(listed.ok).toBe(true)
      const rows = (listed as any).result as Array<{ meta?: any }>
      expect(Array.isArray(rows)).toBe(true)
      expect(rows[0]?.meta?.annotations).toEqual([{ type: 'url_citation', url: 'https://example.com' }])
    } finally {
      runtime.shutdown()
    }
  })
})
