import { describe, expect, it } from 'vitest'
import fs from 'node:fs'
import path from 'node:path'
import { decodeOpenRouterSSE } from '../openrouter/sse/decoder'
import { mapChunkToEvents } from '../openrouter/mapChunkToEvents'
import { applyEvents, createInitialState, startGeneration } from './reducer'
import type { DomainEvent, RootState } from './types'
import { toRunSnapshot, NextRunSnapshotRepo } from '../persistence/repo'
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
    if (normalized.startsWith('insert into next_run_snapshots')) {
      return {
        run: (params: any) => {
          this.snapshots.set(String(params.runId), String(params.snapshotJson))
          return { changes: 1 }
        },
        get: (_params?: any) => null,
      }
    }
    if (normalized.startsWith('select snapshot_json as snapshotjson from next_run_snapshots')) {
      return {
        run: (_params?: any) => ({ changes: 0 }),
        get: (runId: string) => {
          const v = this.snapshots.get(String(runId))
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

async function replaySSEFixtureIntoState(runId: string, assistantMessageId: string, fixtureName: string): Promise<RootState> {
  const started = startGeneration(createInitialState(), {
    runId,
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

  return applyEvents(started.state, runId, events)
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
        expect(snap.run.status).toBe('done')
        expect(snap.messages[0]?.contentText).toBe('hi')
      },
    },
    {
      name: 'streaming + usage tail (choices=[])',
      fixture: 'usage_tail_choices_empty.txt',
      assert: (snap) => {
        expect(snap.run.status).toBe('done')
        expect(snap.run.usage).toMatchObject({ total_tokens: 123 })
        expect(snap.messages[0]?.contentText).toBe('hello')
      },
    },
    {
      name: 'mid-stream error preserves partial content',
      fixture: 'midstream_error.txt',
      assert: (snap) => {
        expect(snap.run.status).toBe('error')
        expect(snap.run.finishReason).toBe('error')
        expect(snap.messages[0]?.contentText).toBe('partial')
      },
    },
    {
      name: 'debug chunk with choices=[] does not crash',
      fixture: 'debug_choices_empty.txt',
      assert: (snap) => {
        expect(snap.run.status).toBe('done')
        expect(snap.messages[0]?.contentText).toBe('ok')
      },
    },
  ]

  for (const c of cases) {
    it(c.name, async () => {
      const runId = 'run1'
      const assistantMessageId = 'assistant_1'

      const stateA = await replaySSEFixtureIntoState(runId, assistantMessageId, c.fixture)
      const snapshotA = toRunSnapshot(stateA, runId)

      const stateA2 = await replaySSEFixtureIntoState(runId, assistantMessageId, c.fixture)
      const snapshotA2 = toRunSnapshot(stateA2, runId)
      expect(snapshotA2).toEqual(snapshotA)

      const db = new InMemoryDb()
      migrateNextPersistence(db as any)
      const repo = new NextRunSnapshotRepo(db as any)
      repo.save(runId, snapshotA)
      const snapshotB = repo.get(runId)

      expect(snapshotB).toEqual(snapshotA)
      c.assert(snapshotB)
    })
  }
})
