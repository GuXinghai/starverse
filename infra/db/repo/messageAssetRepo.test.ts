import { describe, expect, it } from 'vitest'
import BetterSqlite3 from 'better-sqlite3'
import { existsSync, mkdtempSync, readFileSync, rmSync } from 'node:fs'
import os from 'node:os'
import path from 'node:path'
import { MessageRepo } from './messageRepo'
import { MessageAssetRepo } from './messageAssetRepo'
import { canOpenBetterSqliteForSuite } from '../../testUtils/betterSqliteGate'

function loadSchema(db: BetterSqlite3.Database) {
  const schemaPath = path.resolve(process.cwd(), 'infra', 'db', 'schema.sql')
  db.exec(readFileSync(schemaPath, 'utf8'))
}

function insertConvo(db: BetterSqlite3.Database, id: string) {
  const now = Date.now()
  db.prepare(`
    INSERT INTO convo(id, project_id, title, created_at, updated_at, meta)
    VALUES (@id, NULL, @title, @createdAt, @updatedAt, NULL)
  `).run({
    id,
    title: 'Chat',
    createdAt: now,
    updatedAt: now,
  })
}

const ONE_BY_ONE_PNG_DATA_URL =
  'data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8/5+hHgAGgwJ/l7h5NwAAAABJRU5ErkJggg=='

const describeIfBetterSqlite = canOpenBetterSqliteForSuite('MessageAssetRepo') ? describe : describe.skip

describeIfBetterSqlite('MessageAssetRepo', () => {
  it('deduplicates files by content hash and links assets to multiple messages', () => {
    const tempRoot = mkdtempSync(path.join(os.tmpdir(), 'starverse-message-asset-'))
    try {
      const db = new BetterSqlite3(':memory:')
      loadSchema(db)
      insertConvo(db, 'c1')

      const messageRepo = new MessageRepo(db)
      const m1 = messageRepo.append({ convoId: 'c1', role: 'assistant', body: '' })
      const m2 = messageRepo.append({ convoId: 'c1', role: 'assistant', body: '' })

      const repo = new MessageAssetRepo(db, path.join(tempRoot, 'images'))
      const persisted1 = repo.persistFromDataUrls({ messageId: m1.id, imageDataUrls: [ONE_BY_ONE_PNG_DATA_URL] })
      const persisted2 = repo.persistFromDataUrls({ messageId: m2.id, imageDataUrls: [ONE_BY_ONE_PNG_DATA_URL] })

      expect(persisted1.ok).toBe(true)
      expect(persisted2.ok).toBe(true)
      expect(persisted1.assets).toHaveLength(1)
      expect(persisted2.assets).toHaveLength(1)
      expect(persisted1.assets[0].assetId).toBe(persisted2.assets[0].assetId)
      expect(persisted1.assets[0].width).toBe(1)
      expect(persisted1.assets[0].height).toBe(1)
      expect(existsSync(persisted1.assets[0].path)).toBe(true)

      const assetCount = db.prepare('SELECT COUNT(*) AS cnt FROM asset').get() as { cnt: number }
      const linkCount = db.prepare('SELECT COUNT(*) AS cnt FROM message_asset').get() as { cnt: number }
      expect(assetCount.cnt).toBe(1)
      expect(linkCount.cnt).toBe(2)

      const messageMetaRows = db
        .prepare('SELECT id, COALESCE(meta, \'\') AS meta FROM message WHERE id IN (?, ?)')
        .all(m1.id, m2.id) as Array<{ id: string; meta: string }>
      for (const row of messageMetaRows) {
        expect(row.meta.includes('data:image')).toBe(false)
      }
    } finally {
      rmSync(tempRoot, { recursive: true, force: true })
    }
  })

  it('returns stable file-url mappings for historical message reload', () => {
    const tempRoot = mkdtempSync(path.join(os.tmpdir(), 'starverse-message-asset-'))
    try {
      const db = new BetterSqlite3(':memory:')
      loadSchema(db)
      insertConvo(db, 'c1')

      const messageRepo = new MessageRepo(db)
      const m1 = messageRepo.append({ convoId: 'c1', role: 'assistant', body: '' })
      const repo = new MessageAssetRepo(db, path.join(tempRoot, 'images'))
      repo.persistFromDataUrls({ messageId: m1.id, imageDataUrls: [ONE_BY_ONE_PNG_DATA_URL, ONE_BY_ONE_PNG_DATA_URL] })

      const links = repo.listByMessageIds({ messageIds: [m1.id] })
      expect(links).toHaveLength(2)
      expect(links[0].messageId).toBe(m1.id)
      expect(links[0].ordinal).toBe(0)
      expect(links[1].ordinal).toBe(1)
      expect(links[0].fileUrl.startsWith('file://')).toBe(true)
      expect(links[0].assetUrl.startsWith('asset://')).toBe(true)
      expect(links[0].path).toContain(path.join(tempRoot, 'images'))
      expect(links[0].assetId).toBe(links[1].assetId)
    } finally {
      rmSync(tempRoot, { recursive: true, force: true })
    }
  })
})
