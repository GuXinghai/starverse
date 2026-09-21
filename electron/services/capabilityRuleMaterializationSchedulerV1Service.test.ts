import BetterSqlite3 from 'better-sqlite3'
import { describe, expect, it, vi } from 'vitest'
import { CapabilityRuleMaterializationSchedulerV1Service } from './capabilityRuleMaterializationSchedulerV1Service'

function database(): BetterSqlite3.Database {
  return new BetterSqlite3(':memory:')
}

describe('CapabilityRuleMaterializationSchedulerV1Service', () => {
  it('coalesces notifications and serializes the follow-up activation', async () => {
    const db = database()
    let releaseFirst!: () => void
    const firstRun = new Promise<void>((resolve) => { releaseFirst = resolve })
    let active = 0
    let maximumActive = 0
    let calls = 0
    const materializationService = {
      activateCurrent: vi.fn(async () => {
        calls += 1
        active += 1
        maximumActive = Math.max(maximumActive, active)
        if (calls === 1) await firstRun
        active -= 1
      }),
    }
    const scheduler = new CapabilityRuleMaterializationSchedulerV1Service({
      db, materializationService,
      readActiveSourceRevision: () => null,
    })
    try {
      const first = scheduler.schedule()
      await vi.waitFor(() => expect(materializationService.activateCurrent).toHaveBeenCalledTimes(1))
      const second = scheduler.schedule()
      const third = scheduler.schedule()
      releaseFirst()
      await Promise.all([first, second, third])

      expect(materializationService.activateCurrent).toHaveBeenCalledTimes(2)
      expect(maximumActive).toBe(1)
    } finally {
      db.close()
    }
  })

  it('re-reads the active revision and retries only a stale preparation/CAS race', async () => {
    const db = database()
    const revisions = ['revision:a', 'revision:b']
    const readActiveSourceRevision = vi.fn(() => revisions.shift() ?? 'revision:b')
    const expectedRevisions: Array<string | null> = []
    let attempt = 0
    const materializationService = {
      activateCurrent: vi.fn(async (input: { expectedActiveSourceRevision: string | null }) => {
        expectedRevisions.push(input.expectedActiveSourceRevision)
        attempt += 1
        if (attempt === 1) {
          const error = new Error('GENERATION_V2_CAPABILITY_RULE_MATERIALIZATION_STAGE_STALE') as Error & { code: string }
          error.code = 'GENERATION_V2_CAPABILITY_RULE_MATERIALIZATION_STAGE_STALE'
          throw error
        }
      }),
    }
    const logFailure = vi.fn()
    const scheduler = new CapabilityRuleMaterializationSchedulerV1Service({
      db, materializationService, readActiveSourceRevision, logFailure,
    })
    try {
      await scheduler.schedule()
      expect(readActiveSourceRevision).toHaveBeenCalledTimes(2)
      expect(expectedRevisions).toEqual(['revision:a', 'revision:b'])
      expect(logFailure).not.toHaveBeenCalled()
    } finally {
      db.close()
    }
  })

  it('logs a non-stale failure without retrying it', async () => {
    const db = database()
    const error = new Error('GENERATION_V2_CAPABILITY_RULE_MATERIALIZATION_INVALID')
    const materializationService = {
      activateCurrent: vi.fn(async () => { throw error }),
    }
    const logFailure = vi.fn()
    const scheduler = new CapabilityRuleMaterializationSchedulerV1Service({
      db, materializationService, readActiveSourceRevision: () => null, logFailure,
    })
    try {
      await expect(scheduler.schedule()).rejects.toBe(error)
      expect(materializationService.activateCurrent).toHaveBeenCalledTimes(1)
      expect(logFailure).toHaveBeenCalledWith({
        code: 'GENERATION_V2_CAPABILITY_RULE_MATERIALIZATION_INVALID', attempts: 1,
      })
    } finally {
      db.close()
    }
  })

  it('logs stale state after the bounded stale-race retry budget is exhausted', async () => {
    const db = database()
    const materializationService = {
      activateCurrent: vi.fn(async () => {
        const error = new Error('GENERATION_V2_AUTHORITATIVE_MODEL_SUBJECT_SET_STALE') as Error & { code: string }
        error.code = 'GENERATION_V2_AUTHORITATIVE_MODEL_SUBJECT_SET_STALE'
        throw error
      }),
    }
    const logFailure = vi.fn()
    const scheduler = new CapabilityRuleMaterializationSchedulerV1Service({
      db, materializationService, readActiveSourceRevision: () => null, logFailure,
    })
    try {
      await expect(scheduler.schedule()).rejects.toMatchObject({
        code: 'GENERATION_V2_AUTHORITATIVE_MODEL_SUBJECT_SET_STALE',
      })
      expect(materializationService.activateCurrent).toHaveBeenCalledTimes(4)
      expect(logFailure).toHaveBeenCalledWith({
        code: 'GENERATION_V2_AUTHORITATIVE_MODEL_SUBJECT_SET_STALE', attempts: 4,
      })
    } finally {
      db.close()
    }
  })

  it('rejects coalesced awaiters while re-arming a queued follow-up after failure', async () => {
    const db = database()
    const error = new Error('GENERATION_V2_CAPABILITY_RULE_MATERIALIZATION_INVALID')
    let rejectFirst!: (reason: unknown) => void
    const firstRun = new Promise<void>((_resolve, reject) => { rejectFirst = reject })
    let calls = 0
    const materializationService = {
      activateCurrent: vi.fn(async () => {
        calls += 1
        if (calls === 1) await firstRun
      }),
    }
    const logFailure = vi.fn()
    const scheduler = new CapabilityRuleMaterializationSchedulerV1Service({
      db, materializationService, readActiveSourceRevision: () => null, logFailure,
    })
    try {
      const first = scheduler.schedule()
      await vi.waitFor(() => expect(materializationService.activateCurrent).toHaveBeenCalledTimes(1))
      const second = scheduler.schedule()
      rejectFirst(error)

      await expect(first).rejects.toBe(error)
      await expect(second).rejects.toBe(error)
      await vi.waitFor(() => expect(materializationService.activateCurrent).toHaveBeenCalledTimes(2))
      expect(logFailure).toHaveBeenCalledWith({
        code: 'GENERATION_V2_CAPABILITY_RULE_MATERIALIZATION_INVALID', attempts: 1,
      })
    } finally {
      db.close()
    }
  })
})
