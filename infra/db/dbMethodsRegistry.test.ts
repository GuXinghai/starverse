import { describe, expect, it } from 'vitest'
import {
  DB_METHODS,
  DB_RENDERER_METHODS,
  DB_RENDERER_METHOD_SET,
  DB_WORKER_METHODS,
  DB_WORKER_METHOD_SET,
  assertDbMethodCoverage,
  diffDbMethodCoverage,
} from './dbMethodsRegistry'

describe('dbMethodsRegistry', () => {
  it('has unique method names', () => {
    const names = DB_METHODS.map((entry) => entry.name)
    expect(new Set(names).size).toBe(names.length)
  })

  it('derives renderer allowlist from registry flags', () => {
    const expected = DB_METHODS.filter((entry) => entry.renderer).map((entry) => entry.name).sort()
    const actual = [...DB_RENDERER_METHODS].sort()
    expect(actual).toEqual(expected)

    expect(DB_RENDERER_METHOD_SET.has('db.reset')).toBe(false)
    expect(DB_RENDERER_METHOD_SET.has('health.stats')).toBe(true)
    expect(DB_RENDERER_METHOD_SET.has('modelCatalog.queryScopedActive')).toBe(false)
    expect(DB_RENDERER_METHOD_SET.has('modelCatalog.clearScopedCatalog')).toBe(false)
    expect(DB_RENDERER_METHOD_SET.has('modelCatalog.clearAllProviderScopedCatalog')).toBe(false)
    expect(DB_RENDERER_METHOD_SET.has('modelCatalog.clearDeprecatedOpenRouterCatalogCache')).toBe(false)
    expect(DB_RENDERER_METHOD_SET.has('modelCatalog.list' as any)).toBe(false)
    expect(DB_RENDERER_METHOD_SET.has('modelCatalog.queryCore' as any)).toBe(false)
    expect(DB_RENDERER_METHOD_SET.has('reasoningIndex.list' as any)).toBe(false)
  })

  it('derives worker method set from registry flags', () => {
    const expected = DB_METHODS.filter((entry) => entry.worker).map((entry) => entry.name).sort()
    const actual = [...DB_WORKER_METHODS].sort()
    expect(actual).toEqual(expected)

    expect(DB_WORKER_METHOD_SET.has('sendPlan.prepareOpenRouterReplayFromMessage')).toBe(true)
    expect(DB_WORKER_METHOD_SET.has('modelCatalog.queryScopedActive')).toBe(true)
    expect(DB_WORKER_METHOD_SET.has('modelCatalog.cleanupExpiredScopedCatalogCaches')).toBe(true)
    expect(DB_WORKER_METHOD_SET.has('modelCatalog.list' as any)).toBe(false)
    expect(DB_WORKER_METHOD_SET.has('modelCatalog.queryCore' as any)).toBe(false)
    expect(DB_WORKER_METHOD_SET.has('reasoningIndex.syncFromCatalog' as any)).toBe(false)
    expect(DB_WORKER_METHOD_SET.has('health.stats')).toBe(false)
    expect(DB_WORKER_METHOD_SET.has('health.ping')).toBe(true)
  })

  it('keeps replay preparation method available to renderer callers', () => {
    expect(DB_RENDERER_METHOD_SET.has('sendPlan.prepareOpenRouterReplayFromMessage')).toBe(true)
  })

  it('reports missing and extra methods with readable error', () => {
    const expected = ['project.create', 'project.save'] as const
    const actual = ['project.create', 'extra.method'] as const

    expect(() => {
      assertDbMethodCoverage('unit-test', expected, actual)
    }).toThrowError(/unit-test/)

    const diff = diffDbMethodCoverage(expected, actual)
    expect(diff.missing).toEqual(['project.save'])
    expect(diff.extra).toEqual(['extra.method'])
  })
})
