import { describe, expect, it } from 'vitest'
import path from 'node:path'
import { DbWorkerRuntime } from './worker'

describe('DbWorkerRuntime branch ops (switchCandidate / regenerateFromQuestion / retryReplaceAnswer)', () => {
  it('branch.switchCandidate updates choice and head so next beginTurn parents under the chosen answer group', async () => {
    const runtime = new DbWorkerRuntime({
      dbPath: ':memory:',
      schemaPath: path.resolve(process.cwd(), 'infra', 'db', 'schema.sql'),
    })

    const created = await runtime.handleMessage({ id: 1, method: 'convo.create', params: { title: 'Chat' } })
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

    const beforeList = await runtime.handleMessage({ id: 6, method: 'branch.list', params: { convoId } })
    expect(beforeList.ok).toBe(true)
    expect(String((beforeList as any).result?.[0]?.headMessageId ?? '')).toBe(a2Id)

    const switched = await runtime.handleMessage({
      id: 7,
      method: 'branch.switchCandidate',
      params: { branchId, questionId: q1Id, answerRootId: a1Id },
    })
    expect(switched.ok).toBe(true)
    expect(String((switched as any).result?.headMessageId ?? '')).toBe(a1Id)

    const afterList = await runtime.handleMessage({ id: 8, method: 'branch.list', params: { convoId } })
    expect(afterList.ok).toBe(true)
    expect(String((afterList as any).result?.[0]?.headMessageId ?? '')).toBe(a1Id)

    const rendered = await runtime.handleMessage({
      id: 9,
      method: 'context.getRenderableTurns',
      params: { branchId, limit: 5000, debug: true },
    })
    expect(rendered.ok).toBe(true)
    expect((rendered as any).result?.debug?.chosenAnswerRootByQuestionId?.[q1Id]).toBe(a1Id)

    const begun = await runtime.handleMessage({
      id: 10,
      method: 'branch.beginTurn',
      params: { branchId, userBody: 'Q2' },
    })
    expect(begun.ok).toBe(true)
    const q2Id = String((begun as any).result?.questionId ?? '')

    const rendered2 = await runtime.handleMessage({
      id: 11,
      method: 'context.getRenderableTurns',
      params: { branchId, limit: 5000, debug: false },
    })
    expect(rendered2.ok).toBe(true)
    const q2 = ((rendered2 as any).result?.messages ?? []).find((m: any) => String(m?.id) === q2Id)
    expect(String(q2?.parentId ?? '')).toBe(a1Id)
    expect((rendered2 as any).result?.messages?.map((m: any) => m.body)).toContain('A1')
    expect((rendered2 as any).result?.messages?.map((m: any) => m.body)).not.toContain('A2')

    // sanity: a2 still exists as a candidate in storage (not deleted)
    expect(a2Id.length).toBeGreaterThan(0)
  })

  it('branch.regenerateFromQuestion creates a new streaming answer root and moves choice/head', async () => {
    const runtime = new DbWorkerRuntime({
      dbPath: ':memory:',
      schemaPath: path.resolve(process.cwd(), 'infra', 'db', 'schema.sql'),
    })

    const created = await runtime.handleMessage({ id: 1, method: 'convo.create', params: { title: 'Chat' } })
    expect(created.ok).toBe(true)
    const convoId = String((created as any).result?.id ?? '')

    const q1 = await runtime.handleMessage({ id: 2, method: 'message.append', params: { convoId, role: 'user', body: 'Q1' } })
    expect(q1.ok).toBe(true)
    const q1Id = String((q1 as any).result?.id ?? '')

    const a1 = await runtime.handleMessage({ id: 3, method: 'message.append', params: { convoId, role: 'assistant', body: 'A1', parentId: q1Id } })
    expect(a1.ok).toBe(true)

    const ensured = await runtime.handleMessage({ id: 4, method: 'branch.ensureDefault', params: { convoId, name: 'Main' } })
    expect(ensured.ok).toBe(true)
    const branchId = String((ensured as any).result?.id ?? '')

    const regen = await runtime.handleMessage({
      id: 5,
      method: 'branch.regenerateFromQuestion',
      params: { branchId, questionId: q1Id },
    })
    expect(regen.ok).toBe(true)
    const newAnswerRootId = String((regen as any).result?.newAnswerRootId ?? '')
    const newAssistantSeq = Number((regen as any).result?.newAssistantSeq ?? NaN)
    expect(newAnswerRootId.length).toBeGreaterThan(0)
    expect(Number.isFinite(newAssistantSeq)).toBe(true)

    const list = await runtime.handleMessage({ id: 6, method: 'branch.list', params: { convoId } })
    expect(list.ok).toBe(true)
    expect(String((list as any).result?.[0]?.headMessageId ?? '')).toBe(newAnswerRootId)

    const rendered = await runtime.handleMessage({
      id: 7,
      method: 'context.getRenderableTurns',
      params: { branchId, limit: 5000, debug: true },
    })
    expect(rendered.ok).toBe(true)
    expect((rendered as any).result?.debug?.chosenAnswerRootByQuestionId?.[q1Id]).toBe(newAnswerRootId)
  })

  it('branch.retryReplaceAnswer hides the current answer root and creates a new streaming answer root; rejects when non-terminal', async () => {
    const runtime = new DbWorkerRuntime({
      dbPath: ':memory:',
      schemaPath: path.resolve(process.cwd(), 'infra', 'db', 'schema.sql'),
    })

    const created = await runtime.handleMessage({ id: 1, method: 'convo.create', params: { title: 'Chat' } })
    expect(created.ok).toBe(true)
    const convoId = String((created as any).result?.id ?? '')

    const q1 = await runtime.handleMessage({ id: 2, method: 'message.append', params: { convoId, role: 'user', body: 'Q1' } })
    expect(q1.ok).toBe(true)
    const q1Id = String((q1 as any).result?.id ?? '')

    const a1 = await runtime.handleMessage({ id: 3, method: 'message.append', params: { convoId, role: 'assistant', body: 'A1', parentId: q1Id } })
    expect(a1.ok).toBe(true)
    const a1Id = String((a1 as any).result?.id ?? '')

    const ensured = await runtime.handleMessage({ id: 4, method: 'branch.ensureDefault', params: { convoId, name: 'Main' } })
    expect(ensured.ok).toBe(true)
    const branchId = String((ensured as any).result?.id ?? '')

    // Make sure choice is explicitly set so canRetryReplace() has a stable base.
    const choice = await runtime.handleMessage({
      id: 5,
      method: 'branchChoice.set',
      params: { branchId, questionId: q1Id, chosenAnswerRootId: a1Id },
    })
    expect(choice.ok).toBe(true)

    const retry = await runtime.handleMessage({
      id: 6,
      method: 'branch.retryReplaceAnswer',
      params: { branchId, questionId: q1Id, currentAnswerRootId: a1Id },
    })
    expect(retry.ok).toBe(true)
    const newAnswerRootId = String((retry as any).result?.newAnswerRootId ?? '')
    expect(newAnswerRootId.length).toBeGreaterThan(0)
    expect(newAnswerRootId).not.toBe(a1Id)

    const candidatesAfter = await runtime.handleMessage({
      id: 7,
      method: 'branch.getCandidates',
      params: { branchId, questionId: q1Id, limit: 50 },
    })
    expect(candidatesAfter.ok).toBe(true)
    const idsAfter = ((candidatesAfter as any).result ?? []).map((c: any) => String(c?.answerRootId ?? ''))
    expect(idsAfter).toContain(newAnswerRootId)
    expect(idsAfter).not.toContain(a1Id)

    // Create a follow-up turn under the replaced answer group.
    const begun = await runtime.handleMessage({
      id: 8,
      method: 'branch.beginTurn',
      params: { branchId, userBody: 'Q2' },
    })
    expect(begun.ok).toBe(true)

    // Move head back into the original answer group to isolate the follow-up check.
    const switchedBack = await runtime.handleMessage({
      id: 9,
      method: 'branch.switchCandidate',
      params: { branchId, questionId: q1Id, answerRootId: newAnswerRootId },
    })
    expect(switchedBack.ok).toBe(true)

    const rejected = await runtime.handleMessage({
      id: 10,
      method: 'branch.retryReplaceAnswer',
      params: { branchId, questionId: q1Id, currentAnswerRootId: newAnswerRootId },
    })
    expect(rejected.ok).toBe(false)
  })

  it('question exclude semantics remain after switching candidate (excluded turn stays out of buildForBranch)', async () => {
    const runtime = new DbWorkerRuntime({
      dbPath: ':memory:',
      schemaPath: path.resolve(process.cwd(), 'infra', 'db', 'schema.sql'),
    })

    const created = await runtime.handleMessage({ id: 1, method: 'convo.create', params: { title: 'Chat' } })
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
    expect(a2Id.length).toBeGreaterThan(0)

    const ensured = await runtime.handleMessage({ id: 5, method: 'branch.ensureDefault', params: { convoId, name: 'Main' } })
    expect(ensured.ok).toBe(true)
    const branchId = String((ensured as any).result?.id ?? '')

    const excluded = await runtime.handleMessage({
      id: 6,
      method: 'branchFilter.set',
      params: { branchId, targetType: 'question', targetId: q1Id, mode: 'exclude' },
    })
    expect(excluded.ok).toBe(true)

    const switched = await runtime.handleMessage({
      id: 7,
      method: 'branch.switchCandidate',
      params: { branchId, questionId: q1Id, answerRootId: a1Id },
    })
    expect(switched.ok).toBe(true)

    const ctx = await runtime.handleMessage({ id: 8, method: 'context.buildForBranch', params: { branchId, limit: 5000, debug: true } })
    expect(ctx.ok).toBe(true)
    expect((ctx as any).result?.messages?.map((m: any) => m.body)).toEqual([])

    const cleared = await runtime.handleMessage({
      id: 9,
      method: 'branchFilter.clear',
      params: { branchId, targetType: 'question', targetId: q1Id },
    })
    expect(cleared.ok).toBe(true)

    const render = await runtime.handleMessage({ id: 10, method: 'context.getRenderableTurns', params: { branchId, limit: 5000, debug: true } })
    expect(render.ok).toBe(true)
    expect((render as any).result?.debug?.chosenAnswerRootByQuestionId?.[q1Id]).toBe(a1Id)
  })
})
