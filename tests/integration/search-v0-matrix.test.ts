import { afterEach, beforeEach, describe, expect, it } from 'vitest'
import path from 'node:path'
import { tmpdir } from 'node:os'
import { rmSync } from 'node:fs'
import { randomUUID } from 'node:crypto'
import { DbWorkerRuntime } from '../../infra/db/worker'

const scopeProject = { projectName: true, convoName: false, convoContent: false }
const scopeConvo = { projectName: false, convoName: true, convoContent: false }
const scopeContent = { projectName: false, convoName: false, convoContent: true }

describe('search v0 matrix', () => {
  let runtime: DbWorkerRuntime
  let dbPath: string

  const call = async <T = any>(method: string, params?: unknown): Promise<T> => {
    const res = await runtime.handleMessage({ id: randomUUID(), method: method as any, params })
    if (!res.ok) {
      const detail = res.error ? `${res.error.code}: ${res.error.message}` : 'unknown error'
      throw new Error(`DB call failed: ${method} -> ${detail}`)
    }
    return res.result as T
  }

  beforeEach(() => {
    dbPath = path.join(tmpdir(), `sv-search-matrix-${randomUUID()}.db`)
    runtime = new DbWorkerRuntime({
      dbPath,
      schemaPath: path.resolve(process.cwd(), 'infra', 'db', 'schema.sql')
    })
  })

  afterEach(() => {
    runtime.shutdown()
    try {
      rmSync(dbPath, { force: true })
    } catch {
      // ignore
    }
  })

  it('runs the v0 matrix', async () => {
    const project = await call<{ id: string; name: string }>('project.create', { name: 'Alpha' })
    const convo = await call<{ id: string; title: string }>('convo.create', { title: 'First Chat', projectId: project.id })

    const projectHits = await call<any[]>('search.query', {
      q: 'Alpha',
      scope: scopeProject,
      limit: 10,
      offset: 0,
      mode: 'fuzzy'
    })
    expect(projectHits.some((h) => h.entityType === 'project' && h.entityId === project.id)).toBe(true)

    await call('project.save', { id: project.id, name: 'Beta' })
    const projectHitsNew = await call<any[]>('search.query', {
      q: 'Beta',
      scope: scopeProject,
      limit: 10,
      offset: 0,
      mode: 'fuzzy'
    })
    expect(projectHitsNew.some((h) => h.entityType === 'project' && h.entityId === project.id)).toBe(true)

    const projectHitsOld = await call<any[]>('search.query', {
      q: 'Alpha',
      scope: scopeProject,
      limit: 10,
      offset: 0,
      mode: 'fuzzy'
    })
    expect(projectHitsOld.length).toBe(0)

    const convoHits = await call<any[]>('search.query', {
      q: 'First Chat',
      scope: scopeConvo,
      limit: 10,
      offset: 0,
      mode: 'fuzzy'
    })
    expect(convoHits.some((h) => h.entityType === 'convo' && h.entityId === convo.id)).toBe(true)

    await call('convo.save', { id: convo.id, title: 'Second Chat' })
    const convoHitsNew = await call<any[]>('search.query', {
      q: 'Second Chat',
      scope: scopeConvo,
      limit: 10,
      offset: 0,
      mode: 'fuzzy'
    })
    expect(convoHitsNew.some((h) => h.entityType === 'convo' && h.entityId === convo.id)).toBe(true)

    const convoHitsOld = await call<any[]>('search.query', {
      q: 'First Chat',
      scope: scopeConvo,
      limit: 10,
      offset: 0,
      mode: 'fuzzy'
    })
    expect(convoHitsOld.length).toBe(0)

    const user1 = await call<any>('message.append', { convoId: convo.id, role: 'user', body: 'User question 1' })
    expect(user1?.id).toBeTruthy()

    const assistantStreaming = await call<any>('message.append', { convoId: convo.id, role: 'assistant', body: '' })
    await call('message.appendDelta', { convoId: convo.id, seq: assistantStreaming.seq, appendBody: 'partial stream' })

    const partialHitsBefore = await call<any[]>('search.query', {
      q: 'partial stream',
      scope: scopeContent,
      limit: 10,
      offset: 0,
      mode: 'fuzzy'
    })
    expect(partialHitsBefore.length).toBe(0)

    await call('message.setStatus', { messageId: assistantStreaming.id, status: 'final' })

    const partialHitsAfter = await call<any[]>('search.query', {
      q: 'partial stream',
      scope: scopeContent,
      limit: 10,
      offset: 0,
      mode: 'fuzzy'
    })
    expect(partialHitsAfter.some((h) => h.entityId === assistantStreaming.id)).toBe(true)

    await call('message.append', { convoId: convo.id, role: 'user', body: 'User question 2' })
    const assistantFinal = await call<any>('message.append', { convoId: convo.id, role: 'assistant', body: 'Final answer 2' })

    await call('message.append', { convoId: convo.id, role: 'user', body: 'User question 3' })
    const assistantStreaming2 = await call<any>('message.append', { convoId: convo.id, role: 'assistant', body: '' })
    await call('message.appendDelta', { convoId: convo.id, seq: assistantStreaming2.seq, appendBody: 'streaming answer 3' })

    const finalHits = await call<any[]>('search.query', {
      q: 'Final answer 2',
      scope: scopeContent,
      limit: 10,
      offset: 0,
      mode: 'fuzzy'
    })
    expect(finalHits.some((h) => h.entityId === assistantFinal.id)).toBe(true)

    const streamingHits = await call<any[]>('search.query', {
      q: 'streaming answer 3',
      scope: scopeContent,
      limit: 10,
      offset: 0,
      mode: 'fuzzy'
    })
    expect(streamingHits.length).toBe(0)

    const replaceMessages = [
      { role: 'user', body: 'Replaced question', createdAt: Date.now() },
      { role: 'assistant', body: 'Replaced answer', createdAt: Date.now() }
    ]
    await call('message.replace', { convoId: convo.id, messages: replaceMessages })

    const replacedHits = await call<any[]>('search.query', {
      q: 'Replaced answer',
      scope: scopeContent,
      limit: 10,
      offset: 0,
      mode: 'fuzzy'
    })
    expect(replacedHits.length).toBeGreaterThan(0)

    const oldHitsAfterReplace = await call<any[]>('search.query', {
      q: 'Final answer 2',
      scope: scopeContent,
      limit: 10,
      offset: 0,
      mode: 'fuzzy'
    })
    expect(oldHitsAfterReplace.length).toBe(0)

    const beforeRebuild = await call<any[]>('search.query', {
      q: 'Replaced answer',
      scope: scopeContent,
      limit: 10,
      offset: 0,
      mode: 'fuzzy'
    })
    await call('search.rebuildIndex')
    const afterRebuild = await call<any[]>('search.query', {
      q: 'Replaced answer',
      scope: scopeContent,
      limit: 10,
      offset: 0,
      mode: 'fuzzy'
    })
    expect(afterRebuild.length).toBe(beforeRebuild.length)

    const specialHits = await call<any[]>('search.query', {
      q: 'foo (bar:"baz" -test',
      scope: scopeContent,
      limit: 10,
      offset: 0,
      mode: 'fuzzy'
    })
    expect(Array.isArray(specialHits)).toBe(true)

    await call('convo.delete', { id: convo.id })
    const hitsAfterDelete = await call<any[]>('search.query', {
      q: 'Replaced answer',
      scope: scopeContent,
      limit: 10,
      offset: 0,
      mode: 'fuzzy'
    })
    expect(hitsAfterDelete.length).toBe(0)
  })
})
