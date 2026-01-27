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

  it('branch.switchCandidate restores the latest continuation under the selected answer root (does not lose follow-up turns)', async () => {
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

    // Choose A1 and create a follow-up under it (Q2 -> A3).
    const switchedToA1 = await runtime.handleMessage({
      id: 6,
      method: 'branch.switchCandidate',
      params: { branchId, questionId: q1Id, answerRootId: a1Id },
    })
    expect(switchedToA1.ok).toBe(true)

    const begun = await runtime.handleMessage({ id: 7, method: 'branch.beginTurn', params: { branchId, userBody: 'Q2' } })
    expect(begun.ok).toBe(true)
    const a3Id = String((begun as any).result?.assistantId ?? '')
    expect(a3Id.length).toBeGreaterThan(0)

    // Switching away moves head under A2.
    const switchedToA2 = await runtime.handleMessage({
      id: 8,
      method: 'branch.switchCandidate',
      params: { branchId, questionId: q1Id, answerRootId: a2Id },
    })
    expect(switchedToA2.ok).toBe(true)
    expect(String((switchedToA2 as any).result?.headMessageId ?? '')).toBe(a2Id)

    // Switching back should restore the newest descendant under A1 (A3), not truncate to A1.
    const switchedBackToA1 = await runtime.handleMessage({
      id: 9,
      method: 'branch.switchCandidate',
      params: { branchId, questionId: q1Id, answerRootId: a1Id },
    })
    expect(switchedBackToA1.ok).toBe(true)
    expect(String((switchedBackToA1 as any).result?.headMessageId ?? '')).toBe(a3Id)

    const rendered = await runtime.handleMessage({ id: 10, method: 'context.getRenderableTurns', params: { branchId, limit: 5000, debug: false } })
    expect(rendered.ok).toBe(true)
    const bodies = ((rendered as any).result?.messages ?? []).map((m: any) => String(m?.body ?? ''))
    expect(bodies).toContain('Q2')
  })

  it('branch.switchCandidate does not move head to a tool sibling (keeps follow-up chain reachable)', async () => {
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

    // Choose A1 and create a follow-up chain under it.
    const switchedToA1 = await runtime.handleMessage({
      id: 6,
      method: 'branch.switchCandidate',
      params: { branchId, questionId: q1Id, answerRootId: a1Id },
    })
    expect(switchedToA1.ok).toBe(true)

    const begun = await runtime.handleMessage({ id: 7, method: 'branch.beginTurn', params: { branchId, userBody: 'Q2' } })
    expect(begun.ok).toBe(true)
    const q2Id = String((begun as any).result?.questionId ?? '')

    // Append a tool message as a sibling of the follow-up (parent=A1) but later in time (higher seq).
    const tool = await runtime.handleMessage({ id: 8, method: 'message.append', params: { convoId, role: 'tool', body: 'T1', parentId: a1Id } })
    expect(tool.ok).toBe(true)

    // Switching away then back must NOT set head=tool (would hide Q2 chain as a sibling).
    const switchedToA2 = await runtime.handleMessage({
      id: 9,
      method: 'branch.switchCandidate',
      params: { branchId, questionId: q1Id, answerRootId: a2Id },
    })
    expect(switchedToA2.ok).toBe(true)

    const switchedBackToA1 = await runtime.handleMessage({
      id: 10,
      method: 'branch.switchCandidate',
      params: { branchId, questionId: q1Id, answerRootId: a1Id },
    })
    expect(switchedBackToA1.ok).toBe(true)

    // Confirm the follow-up question is still in the render projection.
    const rendered = await runtime.handleMessage({ id: 11, method: 'context.getRenderableTurns', params: { branchId, limit: 5000, debug: false } })
    expect(rendered.ok).toBe(true)
    const ids = ((rendered as any).result?.messages ?? []).map((m: any) => String(m?.id ?? ''))
    expect(ids).toContain(q2Id)
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

  it('branch.getQuestionCandidates is pure read (no side effects)', async () => {
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

    const q2 = await runtime.handleMessage({ id: 4, method: 'message.append', params: { convoId, role: 'user', body: 'Q2', parentId: a1Id } })
    expect(q2.ok).toBe(true)

    const q2b = await runtime.handleMessage({ id: 5, method: 'message.append', params: { convoId, role: 'user', body: 'Q2b', parentId: a1Id } })
    expect(q2b.ok).toBe(true)

    const ensured = await runtime.handleMessage({ id: 6, method: 'branch.ensureDefault', params: { convoId, name: 'Main' } })
    expect(ensured.ok).toBe(true)
    const branchId = String((ensured as any).result?.id ?? '')

    const db = (runtime as any).db as any
    const before = Number(db.prepare(`SELECT COUNT(*) AS c FROM branch_question_hide`).get()?.c ?? 0)

    const candidates = await runtime.handleMessage({
      id: 7,
      method: 'branch.getQuestionCandidates',
      params: { branchId, baseMessageId: a1Id, limit: 200 },
    })
    expect(candidates.ok).toBe(true)

    const after = Number(db.prepare(`SELECT COUNT(*) AS c FROM branch_question_hide`).get()?.c ?? 0)
    expect(after).toBe(before)
  })

  it('branch.getQuestionCandidates lists sibling questions under the same parent and filters branch_question_hide', async () => {
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

    const q2 = await runtime.handleMessage({ id: 4, method: 'message.append', params: { convoId, role: 'user', body: 'Q2', parentId: a1Id } })
    expect(q2.ok).toBe(true)
    const q2Id = String((q2 as any).result?.id ?? '')

    const q2b = await runtime.handleMessage({ id: 5, method: 'message.append', params: { convoId, role: 'user', body: 'Q2b', parentId: a1Id } })
    expect(q2b.ok).toBe(true)
    const q2bId = String((q2b as any).result?.id ?? '')

    const ensured = await runtime.handleMessage({ id: 6, method: 'branch.ensureDefault', params: { convoId, name: 'Main' } })
    expect(ensured.ok).toBe(true)
    const branchId = String((ensured as any).result?.id ?? '')

    const candidates = await runtime.handleMessage({
      id: 7,
      method: 'branch.getQuestionCandidates',
      params: { branchId, baseMessageId: a1Id, limit: 200 },
    })
    expect(candidates.ok).toBe(true)
    const ids = ((candidates as any).result ?? []).map((r: any) => String(r?.questionId ?? ''))
    expect(ids).toContain(q2Id)
    expect(ids).toContain(q2bId)

    // Replace the last question (q2b) which hides it for this branch.
    const replaced = await runtime.handleMessage({
      id: 8,
      method: 'branch.retryReplaceQuestion',
      params: { branchId, oldQuestionId: q2bId, newBody: 'Q2b edited' },
    })
    expect(replaced.ok).toBe(true)
    const newQuestionId = String((replaced as any).result?.newQuestionId ?? '')
    expect(newQuestionId.length).toBeGreaterThan(0)
    expect(newQuestionId).not.toBe(q2bId)

    const candidatesAfter = await runtime.handleMessage({
      id: 9,
      method: 'branch.getQuestionCandidates',
      params: { branchId, baseMessageId: a1Id, limit: 200 },
    })
    expect(candidatesAfter.ok).toBe(true)
    const idsAfter = ((candidatesAfter as any).result ?? []).map((r: any) => String(r?.questionId ?? ''))
    expect(idsAfter).toContain(q2Id)
    expect(idsAfter).toContain(newQuestionId)
    expect(idsAfter).not.toContain(q2bId)
  })

  it('branch.switchQuestionCandidate chooses branch-aware default answer and moves head; falls back to head=questionId when no answers', async () => {
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

    const q2 = await runtime.handleMessage({ id: 4, method: 'message.append', params: { convoId, role: 'user', body: 'Q2', parentId: a1Id } })
    expect(q2.ok).toBe(true)
    const q2Id = String((q2 as any).result?.id ?? '')

    const a2old = await runtime.handleMessage({ id: 5, method: 'message.append', params: { convoId, role: 'assistant', body: 'A2 old', parentId: q2Id } })
    expect(a2old.ok).toBe(true)
    const a2oldId = String((a2old as any).result?.id ?? '')

    const a2new = await runtime.handleMessage({ id: 6, method: 'message.append', params: { convoId, role: 'assistant', body: 'A2 new', parentId: q2Id } })
    expect(a2new.ok).toBe(true)
    const a2newId = String((a2new as any).result?.id ?? '')

    const q3 = await runtime.handleMessage({ id: 7, method: 'message.append', params: { convoId, role: 'user', body: 'Q3 (no answer)', parentId: a1Id } })
    expect(q3.ok).toBe(true)
    const q3Id = String((q3 as any).result?.id ?? '')

    const ensured = await runtime.handleMessage({ id: 8, method: 'branch.ensureDefault', params: { convoId, name: 'Main' } })
    expect(ensured.ok).toBe(true)
    const branchId = String((ensured as any).result?.id ?? '')

    // Hide the newest answer root so ensureChoice must pick the older one.
    const hidden = await runtime.handleMessage({
      id: 9,
      method: 'branchAnswerHide.set',
      params: { branchId, questionId: q2Id, answerRootId: a2newId, hidden: true },
    })
    expect(hidden.ok).toBe(true)

    const switchedQ2 = await runtime.handleMessage({
      id: 10,
      method: 'branch.switchQuestionCandidate',
      params: { branchId, baseMessageId: a1Id, questionId: q2Id },
    })
    expect(switchedQ2.ok).toBe(true)
    expect(String((switchedQ2 as any).result?.headMessageId ?? '')).toBe(a2oldId)

    const rendered = await runtime.handleMessage({ id: 11, method: 'context.getRenderableTurns', params: { branchId, limit: 5000, debug: true } })
    expect(rendered.ok).toBe(true)
    expect((rendered as any).result?.debug?.chosenAnswerRootByQuestionId?.[q2Id]).toBe(a2oldId)

    const switchedQ3 = await runtime.handleMessage({
      id: 12,
      method: 'branch.switchQuestionCandidate',
      params: { branchId, baseMessageId: a1Id, questionId: q3Id },
    })
    expect(switchedQ3.ok).toBe(true)
    expect(String((switchedQ3 as any).result?.headMessageId ?? '')).toBe(q3Id)
  })

  it('branch.retryReplaceQuestion uses branch-local terminal check (other branches do not block) and hide is branch-isolated', async () => {
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

    const q2 = await runtime.handleMessage({ id: 4, method: 'message.append', params: { convoId, role: 'user', body: 'Q2', parentId: a1Id } })
    expect(q2.ok).toBe(true)
    const q2Id = String((q2 as any).result?.id ?? '')

    const a2 = await runtime.handleMessage({ id: 5, method: 'message.append', params: { convoId, role: 'assistant', body: 'A2', parentId: q2Id } })
    expect(a2.ok).toBe(true)
    const a2Id = String((a2 as any).result?.id ?? '')

    const ensured1 = await runtime.handleMessage({ id: 6, method: 'branch.ensureDefault', params: { convoId, name: 'Main' } })
    expect(ensured1.ok).toBe(true)
    const branch1 = String((ensured1 as any).result?.id ?? '')

    const forked = await runtime.handleMessage({
      id: 7,
      method: 'branch.createFromMessage',
      params: { sourceBranchId: branch1, baseMessageId: a2Id, name: 'Fork', copyChoices: true, copyFilters: true, requireOnSourcePath: true },
    })
    expect(forked.ok).toBe(true)
    const branch2 = String((forked as any).result?.id ?? '')

    // Continue on branch2 to create a global follow-up (should not block branch1 replace).
    const begun = await runtime.handleMessage({ id: 8, method: 'branch.beginTurn', params: { branchId: branch2, userBody: 'Q3' } })
    expect(begun.ok).toBe(true)

    const replaced = await runtime.handleMessage({
      id: 9,
      method: 'branch.retryReplaceQuestion',
      params: { branchId: branch1, oldQuestionId: q2Id, newBody: 'Q2 edited' },
    })
    expect(replaced.ok).toBe(true)

    const newQ = String((replaced as any).result?.newQuestionId ?? '')
    expect(newQ.length).toBeGreaterThan(0)
    expect(newQ).not.toBe(q2Id)

    const c1 = await runtime.handleMessage({ id: 10, method: 'branch.getQuestionCandidates', params: { branchId: branch1, baseMessageId: a1Id, limit: 200 } })
    expect(c1.ok).toBe(true)
    const ids1 = ((c1 as any).result ?? []).map((r: any) => String(r?.questionId ?? ''))
    expect(ids1).toContain(newQ)
    expect(ids1).not.toContain(q2Id)

    const c2 = await runtime.handleMessage({ id: 11, method: 'branch.getQuestionCandidates', params: { branchId: branch2, baseMessageId: a1Id, limit: 200 } })
    expect(c2.ok).toBe(true)
    const ids2 = ((c2 as any).result ?? []).map((r: any) => String(r?.questionId ?? ''))
    expect(ids2).toContain(q2Id)
  })

  it('branch.retryReplaceQuestion rejects when oldQuestion is not the last question (no side effects)', async () => {
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

    const q2 = await runtime.handleMessage({ id: 4, method: 'message.append', params: { convoId, role: 'user', body: 'Q2', parentId: a1Id } })
    expect(q2.ok).toBe(true)

    const a2 = await runtime.handleMessage({ id: 5, method: 'message.append', params: { convoId, role: 'assistant', body: 'A2', parentId: String((q2 as any).result?.id ?? '') } })
    expect(a2.ok).toBe(true)
    const a2Id = String((a2 as any).result?.id ?? '')

    const ensured = await runtime.handleMessage({ id: 6, method: 'branch.ensureDefault', params: { convoId, name: 'Main' } })
    expect(ensured.ok).toBe(true)
    const branchId = String((ensured as any).result?.id ?? '')

    const before = await runtime.handleMessage({ id: 7, method: 'branch.list', params: { convoId } })
    expect(before.ok).toBe(true)
    expect(String((before as any).result?.[0]?.headMessageId ?? '')).toBe(a2Id)

    const rejected = await runtime.handleMessage({
      id: 8,
      method: 'branch.retryReplaceQuestion',
      params: { branchId, oldQuestionId: q1Id, newBody: 'Q1 edited' },
    })
    expect(rejected.ok).toBe(false)

    const after = await runtime.handleMessage({ id: 9, method: 'branch.list', params: { convoId } })
    expect(after.ok).toBe(true)
    expect(String((after as any).result?.[0]?.headMessageId ?? '')).toBe(a2Id)

    const search = await runtime.handleMessage({ id: 10, method: 'search.fulltext', params: { query: 'Q1 edited', limit: 50 } })
    expect(search.ok).toBe(true)
    expect(((search as any).result ?? []).length).toBe(0)
  })

  it('branch.forkQuestion rejects when branch head is streaming (no side effects)', async () => {
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

    // Empty assistant body -> status=streaming by default.
    const a1 = await runtime.handleMessage({ id: 3, method: 'message.append', params: { convoId, role: 'assistant', body: '', parentId: q1Id } })
    expect(a1.ok).toBe(true)
    const a1Id = String((a1 as any).result?.id ?? '')

    const ensured = await runtime.handleMessage({ id: 4, method: 'branch.ensureDefault', params: { convoId, name: 'Main' } })
    expect(ensured.ok).toBe(true)
    const branchId = String((ensured as any).result?.id ?? '')

    const before = await runtime.handleMessage({ id: 5, method: 'branch.list', params: { convoId } })
    expect(before.ok).toBe(true)
    expect(String((before as any).result?.[0]?.headMessageId ?? '')).toBe(a1Id)

    const rejected = await runtime.handleMessage({
      id: 6,
      method: 'branch.forkQuestion',
      params: { branchId, oldQuestionId: q1Id, newBody: 'Q1 forked' },
    })
    expect(rejected.ok).toBe(false)

    const after = await runtime.handleMessage({ id: 7, method: 'branch.list', params: { convoId } })
    expect(after.ok).toBe(true)
    expect(String((after as any).result?.[0]?.headMessageId ?? '')).toBe(a1Id)

    const search = await runtime.handleMessage({ id: 8, method: 'search.fulltext', params: { query: 'Q1 forked', limit: 50 } })
    expect(search.ok).toBe(true)
    expect(((search as any).result ?? []).length).toBe(0)
  })

  it('branch.retryReplaceQuestion rejects when head is not within the chosen answer group', async () => {
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

    // Force a mismatch: choice points at a1, but head points at a2.
    const choice = await runtime.handleMessage({
      id: 6,
      method: 'branchChoice.set',
      params: { branchId, questionId: q1Id, chosenAnswerRootId: a1Id },
    })
    expect(choice.ok).toBe(true)

    const head = await runtime.handleMessage({ id: 7, method: 'branch.setHead', params: { branchId, headMessageId: a2Id } })
    expect(head.ok).toBe(true)

    const rejected = await runtime.handleMessage({
      id: 8,
      method: 'branch.retryReplaceQuestion',
      params: { branchId, oldQuestionId: q1Id, newBody: 'Q1 edited mismatch' },
    })
    expect(rejected.ok).toBe(false)

    const search = await runtime.handleMessage({ id: 9, method: 'search.fulltext', params: { query: 'Q1 edited mismatch', limit: 50 } })
    expect(search.ok).toBe(true)
    expect(((search as any).result ?? []).length).toBe(0)
  })
})
