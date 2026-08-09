import { describe, expect, it } from 'vitest'
import type { GenerationOperationRuntimeSnapshotV2 } from '../domain/generationStreamEventV2'
import { BranchRuntimeCacheV2 } from './branchRuntimeCacheV2'

function snapshot(input: Readonly<{
  operationId: string
  branchId: string
  status: GenerationOperationRuntimeSnapshotV2['status']
  body?: string
  sequence?: number
  updatedAtMs?: number
}>): GenerationOperationRuntimeSnapshotV2 {
  return Object.freeze({
    binding: Object.freeze({
      operationId: input.operationId,
      conversationId: `conversation:${input.branchId}`,
      branchId: input.branchId,
      targetAnswerId: `answer:${input.operationId}`,
      sourceAnswerId: null,
      snapshotHash: 'a'.repeat(64),
      providerId: 'deepseek',
      contractId: 'deepseek-chat-completions-v1',
    }),
    status: input.status,
    body: input.body ?? '',
    reasoning: Object.freeze([]),
    images: Object.freeze([]),
    lastSequence: input.sequence ?? 0,
    errorFact: null,
    updatedAtMs: input.updatedAtMs ?? 1,
  })
}

describe('BranchRuntimeCacheV2', () => {
  it('updates inactive branches by operation binding and restores their latest overlay on return', () => {
    let now = 10
    const cache = new BranchRuntimeCacheV2(() => now)
    cache.upsert(snapshot({
      operationId: 'operation:a',
      branchId: 'branch:a',
      status: 'generating',
      body: 'a',
      sequence: 1,
    }), 'branch:b')
    now = 11
    cache.upsert(snapshot({
      operationId: 'operation:b',
      branchId: 'branch:b',
      status: 'generating',
      body: 'b',
      sequence: 1,
    }), 'branch:b')
    now = 12
    cache.upsert(snapshot({
      operationId: 'operation:a',
      branchId: 'branch:a',
      status: 'generating',
      body: 'a updated in background',
      sequence: 2,
      updatedAtMs: 12,
    }), 'branch:b')

    expect(cache.get('branch:a')).toMatchObject({
      branchId: 'branch:a',
      activeOperationId: 'operation:a',
      targetAnswerId: 'answer:operation:a',
      status: 'generating',
      body: 'a updated in background',
      lastSequence: 2,
    })
    expect(cache.get('branch:b')).toMatchObject({
      branchId: 'branch:b',
      activeOperationId: 'operation:b',
      body: 'b',
    })
  })

  it('never evicts active branches and evicts least-recent terminal branches at the limit', () => {
    let now = 1
    const cache = new BranchRuntimeCacheV2(() => now, 1, 1024)
    cache.upsert(snapshot({
      operationId: 'operation:active',
      branchId: 'branch:active',
      status: 'generating',
      body: 'active',
    }), 'branch:current')
    now = 2
    cache.upsert(snapshot({
      operationId: 'operation:old',
      branchId: 'branch:old',
      status: 'completed',
      body: 'old',
    }), 'branch:current')
    now = 3
    cache.upsert(snapshot({
      operationId: 'operation:new',
      branchId: 'branch:new',
      status: 'completed',
      body: 'new',
    }), 'branch:current')

    expect(cache.get('branch:active', false)?.status).toBe('generating')
    expect(cache.get('branch:old', false)).toBeNull()
    expect(cache.get('branch:new', false)?.status).toBe('completed')
  })

  it('ignores stale snapshots for the same operation', () => {
    const cache = new BranchRuntimeCacheV2(() => 1)
    cache.upsert(snapshot({
      operationId: 'operation:1',
      branchId: 'branch:1',
      status: 'generating',
      body: 'new',
      sequence: 3,
    }))
    cache.upsert(snapshot({
      operationId: 'operation:1',
      branchId: 'branch:1',
      status: 'generating',
      body: 'stale',
      sequence: 2,
    }))
    expect(cache.get('branch:1')?.body).toBe('new')
  })
})
