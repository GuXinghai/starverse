import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import {
  __resetModelPrefsServiceCacheForTests,
  ModelPrefsService,
  type ModelPrefsFavorite,
  type ModelPrefsRecent,
} from './modelPrefsService'

const originalDbBridge = (globalThis as any).dbBridge

describe('ModelPrefsService', () => {
  beforeEach(() => {
    __resetModelPrefsServiceCacheForTests()
  })

  afterEach(() => {
    __resetModelPrefsServiceCacheForTests()
    ;(globalThis as any).dbBridge = originalDbBridge
    vi.restoreAllMocks()
  })

  it('degrades safely when dbBridge is unavailable', async () => {
    ;(globalThis as any).dbBridge = undefined

    await expect(ModelPrefsService.listFavorites()).resolves.toEqual([])
    await expect(ModelPrefsService.listRecents()).resolves.toEqual([])
    await expect(
      ModelPrefsService.toggleFavorite({ modelKey: 'openrouter::openai/gpt-4o' })
    ).resolves.toEqual({
      ok: false,
      favorited: false,
      item: null,
      error: 'Missing dbBridge.',
    })
    await expect(
      ModelPrefsService.reorderFavorites(['openrouter::openai/gpt-4o'])
    ).resolves.toEqual([])
    await expect(
      ModelPrefsService.recordRecent({ modelKey: 'openrouter::openai/gpt-4o' })
    ).resolves.toBeNull()
  })

  it('uses favorites cache and supports toggleFavorite with mutation events', async () => {
    let now = 1_700_000_000_000
    const favorites = new Map<string, ModelPrefsFavorite[]>()
    const invoke = vi.fn(async (method: string, params: any) => {
      const scopeType = String(params?.scopeType ?? 'global')
      const scopeId = String(params?.scopeId ?? '')
      const scopeKey = `${scopeType}|${scopeId}`
      const rows = favorites.get(scopeKey) ?? []
      if (method === 'modelPrefs.listFavorites') {
        return rows
      }
      if (method === 'modelPrefs.addFavorite') {
        const providerKey = String(params?.providerKey ?? '')
        const modelId = String(params?.modelId ?? '')
        const modelKey = String(params?.modelKey ?? `${providerKey}::${modelId}`)
        const existingIndex = rows.findIndex((row) => row.modelKey === modelKey)
        const nextRow: ModelPrefsFavorite = {
          scopeType: scopeType as any,
          scopeId,
          providerKey,
          modelId,
          modelKey,
          sortRank: existingIndex >= 0 ? rows[existingIndex].sortRank : rows.length,
          createdAtMs: now,
          updatedAtMs: now,
        }
        now += 1
        if (existingIndex >= 0) rows[existingIndex] = nextRow
        else rows.push(nextRow)
        rows.sort((a, b) => (a.sortRank === b.sortRank ? a.modelKey.localeCompare(b.modelKey) : a.sortRank - b.sortRank))
        favorites.set(scopeKey, rows)
        return nextRow
      }
      if (method === 'modelPrefs.removeFavorite') {
        const modelKey = String(params?.modelKey ?? '')
        const nextRows = rows.filter((row) => row.modelKey !== modelKey)
        favorites.set(scopeKey, nextRows)
        return { removed: rows.length - nextRows.length }
      }
      return null
    })
    ;(globalThis as any).dbBridge = { invoke }

    const events: string[] = []
    const unsubscribe = ModelPrefsService.subscribe((event) => {
      events.push(`${event.kind}:${event.reason}:${event.scopeType}:${event.scopeId}`)
    })

    const first = await ModelPrefsService.listFavorites()
    const second = await ModelPrefsService.listFavorites()
    expect(first).toEqual([])
    expect(second).toEqual([])
    expect(invoke.mock.calls.filter((call) => call[0] === 'modelPrefs.listFavorites')).toHaveLength(1)

    const added = await ModelPrefsService.toggleFavorite({ modelKey: 'openrouter::openai/gpt-4o' })
    expect(added.ok).toBe(true)
    expect(added.favorited).toBe(true)
    expect(added.item?.modelKey).toBe('openrouter::openai/gpt-4o')
    expect(invoke).toHaveBeenCalledWith(
      'modelPrefs.addFavorite',
      expect.objectContaining({
        scopeType: 'global',
        scopeId: '',
        modelKey: 'openrouter::openai/gpt-4o',
      }),
    )

    const afterAdd = await ModelPrefsService.listFavorites()
    expect(afterAdd.map((row) => row.modelKey)).toEqual(['openrouter::openai/gpt-4o'])
    expect(invoke.mock.calls.filter((call) => call[0] === 'modelPrefs.listFavorites')).toHaveLength(1)

    const removed = await ModelPrefsService.toggleFavorite({ modelKey: 'openrouter::openai/gpt-4o' })
    expect(removed.ok).toBe(true)
    expect(removed.favorited).toBe(false)

    const afterRemove = await ModelPrefsService.listFavorites()
    expect(afterRemove).toEqual([])
    expect(events.filter((event) => event.startsWith('favorites:mutation:global:'))).toHaveLength(2)
    unsubscribe()
  })

  it('reorders favorites and updates cache without extra list query', async () => {
    const rows: ModelPrefsFavorite[] = [
      {
        scopeType: 'global',
        scopeId: '',
        providerKey: 'openrouter',
        modelId: 'openai/a',
        modelKey: 'openrouter::openai/a',
        sortRank: 0,
        createdAtMs: 1,
        updatedAtMs: 1,
      },
      {
        scopeType: 'global',
        scopeId: '',
        providerKey: 'openrouter',
        modelId: 'openai/b',
        modelKey: 'openrouter::openai/b',
        sortRank: 1,
        createdAtMs: 2,
        updatedAtMs: 2,
      },
      {
        scopeType: 'global',
        scopeId: '',
        providerKey: 'openrouter',
        modelId: 'openai/c',
        modelKey: 'openrouter::openai/c',
        sortRank: 2,
        createdAtMs: 3,
        updatedAtMs: 3,
      },
    ]

    const invoke = vi.fn(async (method: string, params: any) => {
      if (method === 'modelPrefs.listFavorites') return rows
      if (method === 'modelPrefs.reorderFavorites') {
        const input = Array.isArray(params?.orderedModelKeys) ? params.orderedModelKeys : []
        const set = new Set<string>(input.map((value: unknown) => String(value ?? '')))
        const reordered: ModelPrefsFavorite[] = []
        for (const modelKey of input) {
          const found = rows.find((row) => row.modelKey === modelKey)
          if (found && !reordered.some((row) => row.modelKey === modelKey)) reordered.push(found)
        }
        for (const row of rows) {
          if (set.has(row.modelKey)) continue
          reordered.push(row)
        }
        reordered.forEach((row, index) => {
          row.sortRank = index
        })
        return { items: reordered }
      }
      return null
    })
    ;(globalThis as any).dbBridge = { invoke }

    await ModelPrefsService.listFavorites()
    const reordered = await ModelPrefsService.reorderFavorites([
      'openrouter::openai/c',
      'openrouter::openai/c',
      'openrouter::openai/a',
    ])

    expect(reordered.map((row) => row.modelKey)).toEqual([
      'openrouter::openai/c',
      'openrouter::openai/a',
      'openrouter::openai/b',
    ])
    expect(invoke).toHaveBeenCalledWith(
      'modelPrefs.reorderFavorites',
      expect.objectContaining({
        orderedModelKeys: ['openrouter::openai/c', 'openrouter::openai/a'],
      }),
    )

    const secondList = await ModelPrefsService.listFavorites()
    expect(secondList.map((row) => row.modelKey)).toEqual([
      'openrouter::openai/c',
      'openrouter::openai/a',
      'openrouter::openai/b',
    ])
    expect(invoke.mock.calls.filter((call) => call[0] === 'modelPrefs.listFavorites')).toHaveLength(1)
  })

  it('invalidates recents cache after recordRecent and handles record failure gracefully', async () => {
    let failRecord = false
    const recents = new Map<string, ModelPrefsRecent[]>()
    recents.set('global|', [
      {
        scopeType: 'global',
        scopeId: '',
        providerKey: 'openrouter',
        modelId: 'openai/gpt-4o',
        modelKey: 'openrouter::openai/gpt-4o',
        lastUsedAtMs: 100,
        useCount: 1,
        createdAtMs: 100,
        updatedAtMs: 100,
      },
    ])
    const invoke = vi.fn(async (method: string, params: any) => {
      const scopeType = String(params?.scopeType ?? 'global')
      const scopeId = String(params?.scopeId ?? '')
      const scopeKey = `${scopeType}|${scopeId}`
      const rows = recents.get(scopeKey) ?? []
      if (method === 'modelPrefs.listRecents') {
        const limit = Number(params?.limit ?? 20)
        return [...rows]
          .sort((a, b) =>
            a.lastUsedAtMs === b.lastUsedAtMs
              ? a.modelKey.localeCompare(b.modelKey)
              : b.lastUsedAtMs - a.lastUsedAtMs
          )
          .slice(0, limit)
      }
      if (method === 'modelPrefs.recordRecent') {
        if (failRecord) throw new Error('disk busy')
        const providerKey = String(params?.providerKey ?? '')
        const modelId = String(params?.modelId ?? '')
        const modelKey = String(params?.modelKey ?? `${providerKey}::${modelId}`)
        const usedAtMs =
          typeof params?.usedAtMs === 'number' && Number.isFinite(params.usedAtMs)
            ? params.usedAtMs
            : Date.now()
        const existingIndex = rows.findIndex((row) => row.modelKey === modelKey)
        if (existingIndex >= 0) {
          const current = rows[existingIndex]
          const next: ModelPrefsRecent = {
            ...current,
            lastUsedAtMs: Math.max(current.lastUsedAtMs, usedAtMs),
            useCount: current.useCount + 1,
            updatedAtMs: usedAtMs,
          }
          rows[existingIndex] = next
          recents.set(scopeKey, rows)
          return next
        }
        const next: ModelPrefsRecent = {
          scopeType: scopeType as any,
          scopeId,
          providerKey,
          modelId,
          modelKey,
          lastUsedAtMs: usedAtMs,
          useCount: 1,
          createdAtMs: usedAtMs,
          updatedAtMs: usedAtMs,
        }
        rows.push(next)
        recents.set(scopeKey, rows)
        return next
      }
      return null
    })
    ;(globalThis as any).dbBridge = { invoke }

    const first = await ModelPrefsService.listRecents(undefined, { limit: 20 })
    const second = await ModelPrefsService.listRecents(undefined, { limit: 20 })
    expect(first).toHaveLength(1)
    expect(second).toHaveLength(1)
    expect(invoke.mock.calls.filter((call) => call[0] === 'modelPrefs.listRecents')).toHaveLength(1)

    const recorded = await ModelPrefsService.recordRecent({ modelKey: 'openrouter::anthropic/claude-3' })
    expect(recorded?.modelKey).toBe('openrouter::anthropic/claude-3')

    const third = await ModelPrefsService.listRecents(undefined, { limit: 20 })
    expect(third.map((row) => row.modelKey)).toEqual(
      expect.arrayContaining(['openrouter::openai/gpt-4o', 'openrouter::anthropic/claude-3'])
    )
    expect(invoke.mock.calls.filter((call) => call[0] === 'modelPrefs.listRecents')).toHaveLength(2)

    failRecord = true
    const failed = await ModelPrefsService.recordRecent({ modelKey: 'openrouter::google/gemini-2.0' })
    expect(failed).toBeNull()
  })

  it('passes project scope through favorites/recents IPC methods', async () => {
    const invoke = vi.fn(async (method: string, params: any) => {
      const scopeType = String(params?.scopeType ?? 'global')
      const scopeId = String(params?.scopeId ?? '')
      if (method === 'modelPrefs.listFavorites') return []
      if (method === 'modelPrefs.listRecents') return []
      if (method === 'modelPrefs.addFavorite') {
        return {
          scopeType,
          scopeId,
          providerKey: String(params?.providerKey ?? 'openrouter'),
          modelId: String(params?.modelId ?? ''),
          modelKey: String(params?.modelKey ?? ''),
          sortRank: 0,
          createdAtMs: 1,
          updatedAtMs: 1,
        }
      }
      if (method === 'modelPrefs.reorderFavorites') {
        return {
          items: [
            {
              scopeType,
              scopeId,
              providerKey: 'openrouter',
              modelId: 'openai/gpt-4o',
              modelKey: 'openrouter::openai/gpt-4o',
              sortRank: 0,
              createdAtMs: 1,
              updatedAtMs: 2,
            },
          ],
        }
      }
      if (method === 'modelPrefs.recordRecent') {
        return {
          scopeType,
          scopeId,
          providerKey: String(params?.providerKey ?? 'openrouter'),
          modelId: String(params?.modelId ?? ''),
          modelKey: String(params?.modelKey ?? ''),
          lastUsedAtMs: 10,
          useCount: 1,
          createdAtMs: 10,
          updatedAtMs: 10,
        }
      }
      return null
    })
    ;(globalThis as any).dbBridge = { invoke }

    const scope = { scopeType: 'project' as const, scopeId: 'project-123' }
    await ModelPrefsService.listFavorites(scope)
    await ModelPrefsService.listRecents(scope, { limit: 5 })
    await ModelPrefsService.toggleFavorite({ modelKey: 'openrouter::openai/gpt-4o' }, scope)
    await ModelPrefsService.reorderFavorites(['openrouter::openai/gpt-4o'], scope)
    await ModelPrefsService.recordRecent({ modelKey: 'openrouter::openai/gpt-4o' }, scope)

    expect(invoke).toHaveBeenCalledWith(
      'modelPrefs.listFavorites',
      expect.objectContaining({ scopeType: 'project', scopeId: 'project-123' }),
    )
    expect(invoke).toHaveBeenCalledWith(
      'modelPrefs.listRecents',
      expect.objectContaining({ scopeType: 'project', scopeId: 'project-123', limit: 5 }),
    )
    expect(invoke).toHaveBeenCalledWith(
      'modelPrefs.addFavorite',
      expect.objectContaining({ scopeType: 'project', scopeId: 'project-123' }),
    )
    expect(invoke).toHaveBeenCalledWith(
      'modelPrefs.reorderFavorites',
      expect.objectContaining({ scopeType: 'project', scopeId: 'project-123' }),
    )
    expect(invoke).toHaveBeenCalledWith(
      'modelPrefs.recordRecent',
      expect.objectContaining({ scopeType: 'project', scopeId: 'project-123' }),
    )
  })
})
