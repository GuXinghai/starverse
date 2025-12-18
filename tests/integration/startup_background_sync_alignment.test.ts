import { afterEach, describe, expect, it } from 'vitest'
import BetterSqlite3 from 'better-sqlite3'
import { readFileSync } from 'node:fs'
import path from 'node:path'
import { ModelCatalogRepo } from '../../infra/db/repo/modelCatalogRepo'
import { ReasoningModelIndexRepo } from '../../infra/db/repo/reasoningModelIndexRepo'
import { SettingsRepo } from '../../infra/db/repo/settingsRepo'
import { listModelCatalog } from '../../src/next/modelCatalog/modelCatalogClient'
import { selectModelCatalogVisible } from '../../src/next/modelCatalog/modelCatalogSelectors'
import { listReasoningModelIndex } from '../../src/next/modelIndex/reasoningModelIndexClient'
import { selectReasoningModelIndexVisible } from '../../src/next/modelIndex/reasoningModelIndexSelectors'
import { getOpenRouterProviderRequireParameters } from '../../src/next/settings/openRouterProviderSettingsClient'

function loadSchema(db: BetterSqlite3.Database) {
  const schemaPath = path.resolve(process.cwd(), 'infra', 'db', 'schema.sql')
  db.exec(readFileSync(schemaPath, 'utf8'))
}

describe('integration: startup reads persisted settings, background sync aligns catalog->index', () => {
  const originalDbBridge = (globalThis as any).dbBridge

  afterEach(() => {
    ;(globalThis as any).dbBridge = originalDbBridge
  })

  it('startup uses persisted setting; background sync updates model visibility and index status (no overrides lost)', async () => {
    const db = new BetterSqlite3(':memory:')
    loadSchema(db)

    const catalogRepo = new ModelCatalogRepo(db)
    const reasoningRepo = new ReasoningModelIndexRepo(db)
    const settingsRepo = new SettingsRepo(db)

    // Persist user setting before any network/model sync (cold start offline).
    settingsRepo.setOpenRouterProviderRequireParameters(true)

    ;(globalThis as any).dbBridge = {
      invoke: async (method: string, params?: any) => {
        if (method === 'settings.getOpenRouterProviderRequireParameters') {
          return { value: settingsRepo.getOpenRouterProviderRequireParameters() }
        }
        if (method === 'modelCatalog.list') {
          return catalogRepo.listByRouterSource(String(params?.routerSource ?? 'openrouter'))
        }
        if (method === 'reasoningIndex.list') {
          return reasoningRepo.listAll()
        }
        throw new Error(`unexpected method: ${method}`)
      },
    }

    // Startup (offline): settings readable without any model sync.
    expect(await getOpenRouterProviderRequireParameters()).toBe(true)

    // Snapshot s1: only A exists and supports reasoning => visible.
    catalogRepo.syncSnapshot({
      snapshotId: 's1',
      routerSource: 'openrouter',
      models: [
        {
          modelId: 'openai/a',
          routerSource: 'openrouter',
          vendor: 'openai',
          name: 'A',
          supportedParametersJson: JSON.stringify(['reasoning', 'tools']),
          rawJson: '{}',
        },
      ],
    })
    reasoningRepo.syncFromCatalog('openrouter')

    const startupCatalog = await listModelCatalog('openrouter')
    expect(selectModelCatalogVisible(startupCatalog).map((m) => m.modelId)).toEqual(['openai/a'])

    const startupIndex = await listReasoningModelIndex()
    expect(selectReasoningModelIndexVisible(startupIndex).map((m) => m.modelId)).toEqual(['openai/a'])

    // Background sync success: snapshot s2 hides A (missing) and introduces B (reasoning) as visible.
    catalogRepo.syncSnapshot({
      snapshotId: 's2',
      routerSource: 'openrouter',
      models: [
        {
          modelId: 'openai/b',
          routerSource: 'openrouter',
          vendor: 'openai',
          name: 'B',
          supportedParametersJson: JSON.stringify(['reasoning']),
          rawJson: '{}',
        },
      ],
    })
    reasoningRepo.syncFromCatalog('openrouter')

    const afterS2Index = await listReasoningModelIndex()
    // Hidden reasoning model must still exist in index; visible set flips to B.
    expect(afterS2Index.map((m) => `${m.modelId}:${m.status}`).sort()).toEqual(
      ['openai/a:hidden', 'openai/b:visible'].sort()
    )

    // Another background sync: snapshot s3 restores A (visible) and hides B (missing).
    catalogRepo.syncSnapshot({
      snapshotId: 's3',
      routerSource: 'openrouter',
      models: [
        {
          modelId: 'openai/a',
          routerSource: 'openrouter',
          vendor: 'openai',
          name: 'A3',
          supportedParametersJson: JSON.stringify(['reasoning']),
          rawJson: '{}',
        },
      ],
    })
    reasoningRepo.syncFromCatalog('openrouter')

    const afterS3Index = await listReasoningModelIndex()
    expect(afterS3Index.map((m) => `${m.modelId}:${m.status}`).sort()).toEqual(
      ['openai/a:visible', 'openai/b:hidden'].sort()
    )

    // User setting must remain unchanged (no cleanup/delete during sync).
    expect(await getOpenRouterProviderRequireParameters()).toBe(true)
  })
})

