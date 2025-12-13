import { describe, expect, it } from 'vitest'
import fs from 'node:fs'
import path from 'node:path'
import { decodeOpenRouterSSE } from '../openrouter/sse/decoder'
import { mapChunkToEvents } from '../openrouter/mapChunkToEvents'
import { applyEvents, createInitialState, startGeneration } from './reducer'
import type { DomainEvent, RootState } from './types'
import { toSessionSnapshot, NextSessionSnapshotRepo } from '../persistence/repo'
import { migrateNextPersistence } from '../persistence/migrate'

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

function fixturePath(name: string) {
  return path.join(process.cwd(), 'src/next/openrouter/sse/fixtures', name)
}

async function replaySSEFixtureIntoState(sessionId: string, assistantMessageId: string, fixtureName: string): Promise<RootState> {
  const started = startGeneration(createInitialState(), {
    sessionId,
    requestId: 'r1',
    model: 'openrouter/auto',
    assistantMessageId,
  })

  const text = fs.readFileSync(fixturePath(fixtureName), 'utf8')
  const bytes = new TextEncoder().encode(text)

  async function* chunks() {
    for (let i = 0; i < bytes.length; i += 11) yield bytes.slice(i, i + 11)
  }

  const events: DomainEvent[] = []
  for await (const ev of decodeOpenRouterSSE(chunks())) {
    if (ev.type === 'comment') {
      events.push({ type: 'StreamComment', text: ev.text })
      continue
    }
    if (ev.type === 'done') {
      events.push({ type: 'StreamDone' })
      continue
    }
    if (ev.type === 'protocol_error') {
      events.push({ type: 'StreamError', error: { message: ev.message, raw: ev.raw }, terminal: true })
      break
    }
    if (ev.type === 'terminal_error') {
      // The error JSON chunk was already emitted and mapped; stop replay here.
      break
    }
    if (ev.type === 'json') {
      events.push(...(mapChunkToEvents({ chunk: ev.value as any, messageId: assistantMessageId }) as any))
    }
  }

  return applyEvents(started.state, sessionId, events)
}

describe('TC-07/08 minimal closed-loop: Replay → Snapshot → Persist → Reload → Snapshot', () => {
  const cases: Array<{
    name: string
    fixture: string
    assert: (snapshot: any) => void
  }> = [
    {
      name: 'normal streaming',
      fixture: 'comment_done.txt',
      assert: (snap) => {
        expect(snap.session.status).toBe('done')
        expect(snap.messages[0]?.contentText).toBe('hi')
      },
    },
    {
      name: 'streaming + usage tail (choices=[])',
      fixture: 'usage_tail_choices_empty.txt',
      assert: (snap) => {
        expect(snap.session.status).toBe('done')
        expect(snap.session.usage).toMatchObject({ total_tokens: 123 })
        expect(snap.messages[0]?.contentText).toBe('hello')
      },
    },
    {
      name: 'mid-stream error preserves partial content',
      fixture: 'midstream_error.txt',
      assert: (snap) => {
        expect(snap.session.status).toBe('error')
        expect(snap.session.finishReason).toBe('error')
        expect(snap.messages[0]?.contentText).toBe('partial')
      },
    },
    {
      name: 'debug chunk with choices=[] does not crash',
      fixture: 'debug_choices_empty.txt',
      assert: (snap) => {
        expect(snap.session.status).toBe('done')
        expect(snap.messages[0]?.contentText).toBe('ok')
      },
    },
  ]

  for (const c of cases) {
    it(c.name, async () => {
      const sessionId = 's1'
      const assistantMessageId = 'assistant_1'

      const stateA = await replaySSEFixtureIntoState(sessionId, assistantMessageId, c.fixture)
      const snapshotA = toSessionSnapshot(stateA, sessionId)

      const stateA2 = await replaySSEFixtureIntoState(sessionId, assistantMessageId, c.fixture)
      const snapshotA2 = toSessionSnapshot(stateA2, sessionId)
      expect(snapshotA2).toEqual(snapshotA)

      const db = new InMemoryDb()
      migrateNextPersistence(db as any)
      const repo = new NextSessionSnapshotRepo(db as any)
      repo.save(sessionId, snapshotA)
      const snapshotB = repo.get(sessionId)

      expect(snapshotB).toEqual(snapshotA)
      c.assert(snapshotB)
    })
  }
})

