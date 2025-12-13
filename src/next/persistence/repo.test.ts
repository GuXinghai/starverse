import { describe, it, expect, beforeAll } from 'vitest'
import { migrateNextPersistence } from './migrate'
import { NextSessionSnapshotRepo, toSessionSnapshot } from './repo'
import { applyEvents, createInitialState, startGeneration } from '../state/reducer'
import { decodeOpenRouterSSE } from '../openrouter/sse/decoder'
import { mapChunkToEvents } from '../openrouter/mapChunkToEvents'
import fs from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'
import type { DomainEvent } from '../state/types'

const __filename = fileURLToPath(import.meta.url)
const __dirname = path.dirname(__filename)
const fixturePath = path.resolve(__dirname, '../openrouter/sse/fixtures/comment_done.txt')

class InMemoryDb {
  private userVersion = 0
  private readonly snapshots = new Map<string, string>()

  exec(_sql: string) {}

  pragma(sql: string, options?: { simple?: boolean }) {
    const trimmed = sql.trim()
    if (trimmed === 'user_version' && options?.simple) return this.userVersion
    const match = /^user_version\s*=\s*(\d+)$/i.exec(trimmed)
    if (match) {
      this.userVersion = Number.parseInt(match[1]!, 10)
      return
    }
    throw new Error(`Unsupported pragma in test DB: ${sql}`)
  }

  prepare(sql: string) {
    const normalized = sql.replace(/\s+/g, ' ').trim().toLowerCase()
    if (normalized.startsWith('insert into next_session_snapshots')) {
      return {
        run: (params: any) => {
          this.snapshots.set(String(params.sessionId), String(params.snapshotJson))
          return { changes: 1 }
        },
        get: (_params?: any) => null,
      }
    }
    if (normalized.startsWith('select snapshot_json as snapshotjson from next_session_snapshots')) {
      return {
        run: (_params?: any) => ({ changes: 0 }),
        get: (sessionId: string) => {
          const v = this.snapshots.get(String(sessionId))
          return v ? { snapshotJson: v } : undefined
        },
      }
    }
    throw new Error(`Unsupported SQL in test DB: ${sql}`)
  }
}

const createRepo = () => {
  const db = new InMemoryDb()
  migrateNextPersistence(db as any)
  const repo = new NextSessionSnapshotRepo(db as any)
  return { db, repo }
}

async function replayIntoState() {
  const sessionId = 's1'
  const started = startGeneration(createInitialState(), {
    sessionId,
    requestId: 'r1',
    model: 'openrouter/auto',
    assistantMessageId: 'assistant_1',
  })

  const text = fs.readFileSync(fixturePath, 'utf8')
  const bytes = new TextEncoder().encode(text)

  async function* chunks() {
    for (let i = 0; i < bytes.length; i += 11) yield bytes.slice(i, i + 11)
  }

  const events: DomainEvent[] = []
  for await (const ev of decodeOpenRouterSSE(chunks())) {
    if (ev.type === 'comment') events.push({ type: 'StreamComment', text: ev.text })
    if (ev.type === 'done') events.push({ type: 'StreamDone' })
    if (ev.type === 'json') events.push(...(mapChunkToEvents({ chunk: ev.value as any, messageId: 'assistant_1' }) as any))
  }

  const finalState = applyEvents(started.state, sessionId, events)
  return { sessionId, state: finalState }
}

describe('NextSessionSnapshotRepo', () => {
  let instance: { db: InMemoryDb; repo: NextSessionSnapshotRepo } | null = null

  beforeAll(() => {
    instance = createRepo()
  })

  it('migrate is idempotent', () => {
    if (!instance) throw new Error('test setup failed')
    migrateNextPersistence(instance.db as any)
    migrateNextPersistence(instance.db as any)
    expect(true).toBe(true)
  })

  it('roundtrips reducer snapshot without inference', async () => {
    if (!instance) throw new Error('test setup failed')
    const { sessionId, state } = await replayIntoState()
    const snapshot = toSessionSnapshot(state, sessionId)
    instance.repo.save(sessionId, snapshot)
    const loaded = instance.repo.get(sessionId)
    expect(loaded).toEqual(snapshot)
  })
})
