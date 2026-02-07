import { describe, expect, it, vi } from 'vitest'
import type { DbHandler, DbMethod } from './types'
import { DB_WORKER_METHODS, assertDbMethodCoverage } from './dbMethodsRegistry'
import { registerProjectHandlers } from './worker/handlers/projectHandlers'
import { registerConvoMessageHandlers } from './worker/handlers/convoMessageHandlers'
import { registerBranchContextHandlers } from './worker/handlers/branchContextHandlers'
import { registerSearchMaintenanceHandlers } from './worker/handlers/searchMaintenanceHandlers'
import { registerUsagePrefsSettingsHandlers } from './worker/handlers/usagePrefsSettingsHandlers'

describe('DbWorker handler registration modules', () => {
  it('register modules fully cover DB_WORKER_METHODS', () => {
    const handlers = new Map<DbMethod, DbHandler>()
    const register = (method: DbMethod, handler: DbHandler) => {
      handlers.set(method, handler)
    }

    const runtime = {} as any
    registerProjectHandlers(register, runtime)
    registerConvoMessageHandlers(register, runtime)
    registerBranchContextHandlers(register, runtime)
    registerSearchMaintenanceHandlers(register, runtime)
    registerUsagePrefsSettingsHandlers(register, runtime)

    expect(() => {
      assertDbMethodCoverage(
        'DbWorkerRuntime.registerHandlers(modularized)',
        DB_WORKER_METHODS,
        handlers.keys()
      )
    }).not.toThrow()
    expect(handlers.size).toBe(DB_WORKER_METHODS.length)
  })

  it('keeps representative handler routing behavior', () => {
    const handlers = new Map<DbMethod, DbHandler>()
    const register = (method: DbMethod, handler: DbHandler) => {
      handlers.set(method, handler)
    }

    const projectListSpy = vi.fn(() => [{ id: 'p1', name: 'default' }])
    const usageAggregateSpy = vi.fn((input: { days?: number }) => ({ total: input.days ?? 0 }))

    const runtime = {
      projectRepo: {
        list: projectListSpy,
      },
      usageRepo: {
        aggregateUsage: usageAggregateSpy,
      },
    } as any

    registerProjectHandlers(register, runtime)
    registerUsagePrefsSettingsHandlers(register, runtime)

    const projectList = handlers.get('project.list')
    const usageAggregate = handlers.get('usage.aggregate')
    expect(projectList).toBeTypeOf('function')
    expect(usageAggregate).toBeTypeOf('function')

    expect(projectList!({ includeSystem: true })).toEqual([{ id: 'p1', name: 'default' }])
    expect(usageAggregate!({ days: 7 })).toEqual({ total: 0 })
    expect(projectListSpy).toHaveBeenCalledTimes(1)
    expect(projectListSpy).toHaveBeenCalledWith({})
    expect(usageAggregateSpy).toHaveBeenCalledWith({})
  })
})
