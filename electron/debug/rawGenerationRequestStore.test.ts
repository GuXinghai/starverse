import { mkdtempSync, rmSync, writeFileSync } from 'node:fs'
import os from 'node:os'
import path from 'node:path'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { RawGenerationRequestStore } from './rawGenerationRequestStore'
import { ImmutablePreparedBodyV2 } from '../../src/next/generation-v2/compiler/stableSerialize'

const roots: string[] = []
afterEach(() => { while (roots.length) rmSync(roots.pop()!, { recursive: true, force: true }) })

function fixture() {
  const root = mkdtempSync(path.join(os.tmpdir(), 'starverse-raw-generation-'))
  roots.push(root)
  return new RawGenerationRequestStore(path.join(root, 'debug', 'generation-raw.sqlite'))
}

const context = {
  operationId: 'req-1', answerRootId: 'answer-1', requestSequence: 1,
  providerId: 'openrouter', modelId: 'model-a',
} as const

describe('RawGenerationRequestStore', () => {
  it('persists the exact serialized body in an isolated sqlite database', () => {
    const store = fixture()
    const serializedBody = '{"model":"model-a","messages":[{"role":"user","content":"raw"}]}'
    store.tryPersist(context, serializedBody)
    const rows = store.listByAnswerRootId('answer-1')
    expect(rows).toHaveLength(1)
    expect(rows[0]?.serializedBody).toBe(serializedBody)
    expect(rows[0]?.bodyBytes).toBe(Buffer.byteLength(serializedBody, 'utf8'))
    expect(rows[0]?.bodySha256).toMatch(/^[a-f0-9]{64}$/u)
    store.close()
  })

  it('persists the exact immutable prepared bytes and hash without reserialization', () => {
    const store = fixture()
    const prepared = ImmutablePreparedBodyV2.fromNativeRequest({
      model: 'model-a',
      messages: [{ role: 'user', content: 'exact body' }],
      stream: true,
    })
    store.tryPersistPreparedV2(context, prepared)

    const row = store.listByAnswerRootId('answer-1')[0]!
    expect(row.serializedBody).toBe(prepared.copyUtf8Text())
    expect(Buffer.from(row.serializedBody, 'utf8')).toEqual(Buffer.from(prepared.copyBytes()))
    expect(row.bodyBytes).toBe(prepared.byteLength)
    expect(row.bodySha256).toBe(prepared.sha256)
    store.close()
  })

  it('is idempotent for the same sequence and never overwrites a conflicting body', () => {
    const store = fixture()
    const warn = vi.spyOn(console, 'warn').mockImplementation(() => undefined)
    store.tryPersist(context, '{"first":true}')
    store.tryPersist(context, '{"first":true}')
    store.tryPersist(context, '{"second":true}')
    expect(store.listByAnswerRootId('answer-1').map((row) => row.serializedBody)).toEqual(['{"first":true}'])
    expect(warn).toHaveBeenCalledWith('[raw-generation] request sequence conflict', expect.any(Object))
    warn.mockRestore()
    store.close()
  })

  it('swallows storage initialization failures', () => {
    const warn = vi.spyOn(console, 'warn').mockImplementation(() => undefined)
    const root = mkdtempSync(path.join(os.tmpdir(), 'starverse-raw-generation-blocked-'))
    roots.push(root)
    const blocker = path.join(root, 'not-a-directory')
    writeFileSync(blocker, 'blocked')
    const store = new RawGenerationRequestStore(path.join(blocker, 'generation-raw.sqlite'))
    expect(() => store.tryPersist(context, '{}')).not.toThrow()
    expect(store.getStatus()).toMatchObject({ available: false, schemaReady: false, errorCode: 'RAW_DEBUG_STORE_OPEN_FAILED' })
    expect(() => store.listByAnswerRootId('answer-1')).toThrow('RAW_DEBUG_QUERY_FAILED')
    warn.mockRestore()
  })
})
