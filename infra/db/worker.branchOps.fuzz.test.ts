import { describe, expect, it } from 'vitest'
import path from 'node:path'
import { DbWorkerRuntime } from './worker'

function makeRng(seed: number) {
  let x = seed >>> 0
  return () => {
    // xorshift32
    x ^= x << 13
    x ^= x >>> 17
    x ^= x << 5
    return (x >>> 0) / 0xffffffff
  }
}

describe('DbWorkerRuntime branch ops (deterministic fuzz: switchCandidate + tool siblings)', () => {
  it('never loses follow-up turns when switching candidates with tool siblings present', async () => {
    const seeds = Array.from({ length: 12 }, (_, i) => i + 1)

    for (const seed of seeds) {
      const rnd = makeRng(seed)
      const runtime = new DbWorkerRuntime({
        dbPath: ':memory:',
        schemaPath: path.resolve(process.cwd(), 'infra', 'db', 'schema.sql'),
      })

      const created = await runtime.handleMessage({ id: 1, method: 'convo.create', params: { title: `Chat ${seed}` } })
      expect(created.ok).toBe(true)
      const convoId = String((created as any).result?.id ?? '')

      const q1 = await runtime.handleMessage({ id: 2, method: 'message.append', params: { convoId, role: 'user', body: 'Q1' } })
      expect(q1.ok).toBe(true)
      const q1Id = String((q1 as any).result?.id ?? '')

      const a1 = await runtime.handleMessage({ id: 3, method: 'message.append', params: { convoId, role: 'assistant', body: 'A1', parentId: q1Id } })
      expect(a1.ok).toBe(true)
      const a1Id = String((a1 as any).result?.id ?? '')

      const a2 = await runtime.handleMessage({ id: 4, method: 'message.append', params: { convoId, role: 'assistant', body: 'A2', parentId: q1Id } })
      expect(a2.ok).toBe(true)
      const a2Id = String((a2 as any).result?.id ?? '')

      const ensured = await runtime.handleMessage({ id: 5, method: 'branch.ensureDefault', params: { convoId, name: 'Main' } })
      expect(ensured.ok).toBe(true)
      const branchId = String((ensured as any).result?.id ?? '')

      // Lock in a follow-up turn under A1 to assert it never becomes unreachable.
      const sw1 = await runtime.handleMessage({ id: 6, method: 'branch.switchCandidate', params: { branchId, questionId: q1Id, answerRootId: a1Id } })
      expect(sw1.ok).toBe(true)

      const begun = await runtime.handleMessage({ id: 7, method: 'branch.beginTurn', params: { branchId, userBody: `Q2-seed-${seed}` } })
      expect(begun.ok).toBe(true)
      const q2Id = String((begun as any).result?.questionId ?? '')

      let opId = 8
      for (let step = 0; step < 30; step++) {
        const roll = rnd()
        if (roll < 0.35) {
          // Append a tool sibling under A1 (often later in time than the follow-up chain).
          const tool = await runtime.handleMessage({
            id: opId++,
            method: 'message.append',
            params: { convoId, role: 'tool', body: `T-${seed}-${step}`, parentId: a1Id },
          })
          expect(tool.ok).toBe(true)
        } else if (roll < 0.65) {
          const sw2 = await runtime.handleMessage({
            id: opId++,
            method: 'branch.switchCandidate',
            params: { branchId, questionId: q1Id, answerRootId: a2Id },
          })
          expect(sw2.ok).toBe(true)
        } else {
          const swBack = await runtime.handleMessage({
            id: opId++,
            method: 'branch.switchCandidate',
            params: { branchId, questionId: q1Id, answerRootId: a1Id },
          })
          expect(swBack.ok).toBe(true)

          const rendered = await runtime.handleMessage({
            id: opId++,
            method: 'context.getRenderableTurns',
            params: { branchId, limit: 5000, debug: false },
          })
          expect(rendered.ok).toBe(true)
          const ids = ((rendered as any).result?.messages ?? []).map((m: any) => String(m?.id ?? ''))
          expect(ids).toContain(q2Id)
        }
      }
    }
  })
})

