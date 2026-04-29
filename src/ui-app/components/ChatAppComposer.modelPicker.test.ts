import { computed, defineComponent, ref } from 'vue'
import { fireEvent, render, screen, waitFor, within } from '@testing-library/vue'
import userEvent from '@testing-library/user-event'
import { afterEach, describe, expect, it, vi } from 'vitest'
import type { CatalogQueryInput, CatalogQueryResult } from '@/next/modelCatalog/catalogQueryService'
import { __resetModelPrefsServiceCacheForTests } from '@/next/modelPrefs/modelPrefsService'
import { DEFAULT_OPENROUTER_TEST_MODEL } from '@/next/openrouter/openRouterTestModels'
import ChatAppComposer from './ChatAppComposer.vue'

function createResult(items: CatalogQueryResult['items']): CatalogQueryResult {
  return {
    items: [...items],
    nextCursor: null,
    notice: null,
  }
}

function createSessionConfig() {
  return {
    model: { selectedModelKey: DEFAULT_OPENROUTER_TEST_MODEL },
    reasoning: { enabled: true, effort: 'medium' as const },
    webSearch: { enabled: true, level: 'low' as const, detail: null },
    imageGeneration: {
      enabled: true,
      resolution: '1K' as const,
      aspectRatio: '1:1' as const,
      mode: 'default' as const,
      detail: null,
    },
    samplingParams: { detail: null },
  }
}

function createBoundSessionConfig(model: { value: string }) {
  return computed(() => ({
    ...createSessionConfig(),
    model: { selectedModelKey: model.value },
  }))
}

describe('ChatAppComposer model picker integration', () => {
  const originalDbBridge = (globalThis as any).dbBridge

  afterEach(() => {
    ;(globalThis as any).dbBridge = originalDbBridge
    __resetModelPrefsServiceCacheForTests()
    vi.restoreAllMocks()
  })

  it('closes dialog and updates current model pill after single-click selection', async () => {
    const user = userEvent.setup()
    const queryFn = vi.fn(async (_input: CatalogQueryInput): Promise<CatalogQueryResult> =>
      createResult([
        {
          providerKey: 'openrouter',
          modelId: 'anthropic/claude-3',
          modelKey: 'openrouter::anthropic/claude-3',
          canonicalSlug: 'anthropic/claude-3',
          displayName: 'Claude 3',
          description: 'fallback',
          vendor: 'anthropic',
          contextLength: 200000,
          createdAtSec: 1700000123,
          pricing: { prompt: '0.01', completion: '0.02', request: '0', image: '0' },
          capabilities: {
            reasoning: true,
            tools: false,
            structuredOutputs: false,
            vision: false,
            longContext: true,
          },
        },
      ]),
    )

    const Wrapper = defineComponent({
      components: { ChatAppComposer },
      setup() {
        const draft = ref('')
        const model = ref(DEFAULT_OPENROUTER_TEST_MODEL)
        const requestedReasoningEffort = ref<'auto'>('auto')
        const requestedReasoningExclude = ref(false)
        const sessionConfig = createBoundSessionConfig(model)
        const modelCatalog = ref([
          {
            modelId: 'openai/gpt-4o',
            name: 'GPT-4o',
            vendor: 'openai',
            status: 'visible' as const,
            supportedParameters: [],
            lastSeenSnapshotId: 's1',
          },
        ])

        return {
          draft,
          model,
          requestedReasoningEffort,
          requestedReasoningExclude,
          sessionConfig,
          modelCatalog,
          queryFn,
        }
      },
      template: `
        <ChatAppComposer
          v-model:draft="draft"
          v-model:model="model"
          v-model:requestedReasoningEffort="requestedReasoningEffort"
          v-model:requestedReasoningExclude="requestedReasoningExclude"
          :disabled="false"
          :isRunning="false"
          :sessionConfig="sessionConfig"
          :modelCatalog="modelCatalog"
          :showHiddenModelsInPickers="false"
          :modelCatalogNotice="null"
          :modelPickerQueryFn="queryFn"
        />
      `,
    })

    render(Wrapper)

    const pillBefore = await screen.findByTestId('current-model-pill')
    expect(pillBefore.textContent).toContain(DEFAULT_OPENROUTER_TEST_MODEL)

    await user.click(pillBefore)
    await screen.findByTestId('model-picker-item-anthropic/claude-3')
    await user.click(screen.getByTestId('model-picker-item-anthropic/claude-3'))

    expect(screen.queryByTestId('model-picker-dialog')).toBeNull()
    const pillAfter = await screen.findByTestId('current-model-pill')
    expect(pillAfter.textContent).toContain('Claude 3')
  })

  it('applies image-only output filter when opening picker from composer filter toggle', async () => {
    const user = userEvent.setup()
    const queryFn = vi.fn(async (_input: CatalogQueryInput): Promise<CatalogQueryResult> =>
      createResult([
        {
          providerKey: 'openrouter',
          modelId: 'openai/gpt-image-1',
          modelKey: 'openrouter::openai/gpt-image-1',
          canonicalSlug: 'openai/gpt-image-1',
          displayName: 'GPT Image 1',
          description: 'image model',
          vendor: 'openai',
          contextLength: 32000,
          createdAtSec: 1700000123,
          pricing: { prompt: '0.01', completion: '0.02', request: '0', image: '0.04' },
          capabilities: {
            reasoning: false,
            tools: false,
            structuredOutputs: false,
            vision: false,
            longContext: false,
          },
        },
      ]),
    )

    const Wrapper = defineComponent({
      components: { ChatAppComposer },
      setup() {
        const draft = ref('')
        const model = ref(DEFAULT_OPENROUTER_TEST_MODEL)
        const requestedReasoningEffort = ref<'auto'>('auto')
        const requestedReasoningExclude = ref(false)
        const sessionConfig = createBoundSessionConfig(model)
        const modelCatalog = ref([
          {
            modelId: 'openai/gpt-image-1',
            name: 'GPT Image 1',
            vendor: 'openai',
            status: 'visible' as const,
            supportedParameters: [],
            lastSeenSnapshotId: 's1',
          },
        ])
        return {
          draft,
          model,
          requestedReasoningEffort,
          requestedReasoningExclude,
          sessionConfig,
          modelCatalog,
          queryFn,
        }
      },
      template: `
        <ChatAppComposer
          v-model:draft="draft"
          v-model:model="model"
          v-model:requestedReasoningEffort="requestedReasoningEffort"
          v-model:requestedReasoningExclude="requestedReasoningExclude"
          :disabled="false"
          :isRunning="false"
          :sessionConfig="sessionConfig"
          :modelCatalog="modelCatalog"
          :showHiddenModelsInPickers="false"
          :modelCatalogNotice="null"
          :modelPickerQueryFn="queryFn"
        />
      `,
    })

    render(Wrapper)

    await user.click(await screen.findByTestId('composer-model-image-filter-toggle'))
    queryFn.mockClear()
    await user.click(screen.getByTestId('current-model-pill'))

    await waitFor(() => {
      expect(queryFn).toHaveBeenCalledWith(
        expect.objectContaining({
          filter: expect.objectContaining({
            outputModalities: ['image'],
          }),
        }),
      )
    })
  })

  it('toggles current model favorite and updates favorites strip immediately', async () => {
    const user = userEvent.setup()
    const now = 1_700_000_000_000
    let favorites: any[] = []
    ;(globalThis as any).dbBridge = {
      invoke: vi.fn(async (method: string, params?: any) => {
        if (method === 'modelPrefs.listFavorites') {
          return favorites
        }
        if (method === 'modelPrefs.addFavorite') {
          const modelId = String(params?.modelId ?? '')
          const providerKey = String(params?.providerKey ?? 'openrouter')
          const modelKey = String(params?.modelKey ?? `${providerKey}::${modelId}`)
          const row = {
            scopeType: 'global',
            scopeId: '',
            providerKey,
            modelId,
            modelKey,
            sortRank: 0,
            createdAtMs: now,
            updatedAtMs: now,
          }
          favorites = [row]
          return row
        }
        if (method === 'modelPrefs.removeFavorite') {
          const modelKey = String(params?.modelKey ?? '')
          const before = favorites.length
          favorites = favorites.filter((item) => item.modelKey !== modelKey)
          return { removed: before - favorites.length }
        }
        return null
      }),
    }

    const Wrapper = defineComponent({
      components: { ChatAppComposer },
      setup() {
        const draft = ref('')
        const model = ref('openai/gpt-4o')
        const requestedReasoningEffort = ref<'auto'>('auto')
        const requestedReasoningExclude = ref(false)
        const sessionConfig = createBoundSessionConfig(model)
        const modelCatalog = ref([
          {
            modelId: 'openai/gpt-4o',
            name: 'GPT-4o',
            vendor: 'openai',
            status: 'visible' as const,
            supportedParameters: [],
            lastSeenSnapshotId: 's1',
          },
        ])

        return {
          draft,
          model,
          requestedReasoningEffort,
          requestedReasoningExclude,
          sessionConfig,
          modelCatalog,
        }
      },
      template: `
        <ChatAppComposer
          v-model:draft="draft"
          v-model:model="model"
          v-model:requestedReasoningEffort="requestedReasoningEffort"
          v-model:requestedReasoningExclude="requestedReasoningExclude"
          :disabled="false"
          :isRunning="false"
          :sessionConfig="sessionConfig"
          :modelCatalog="modelCatalog"
          :showHiddenModelsInPickers="false"
          :modelCatalogNotice="null"
        />
      `,
    })

    render(Wrapper)

    await user.click(await screen.findByTestId('current-model-favorite-toggle'))
    await waitFor(() => {
      expect(screen.getByTestId('favorite-model-openai/gpt-4o')).toBeTruthy()
    })
    expect(screen.getByTestId('favorites-scrollbar-reserve-spacer')).toBeTruthy()

    await user.click(screen.getByTestId('current-model-favorite-toggle'))
    await waitFor(() => {
      expect(screen.queryByTestId('favorite-model-openai/gpt-4o')).toBeNull()
    })
  })

  it('switches current model from favorites strip without opening picker', async () => {
    const user = userEvent.setup()
    ;(globalThis as any).dbBridge = {
      invoke: vi.fn(async (method: string) => {
        if (method === 'modelPrefs.listFavorites') {
          return [
            {
              scopeType: 'global',
              scopeId: '',
              providerKey: 'openrouter',
              modelId: 'openai/gpt-4o',
              modelKey: 'openrouter::openai/gpt-4o',
              sortRank: 0,
              createdAtMs: 1_700_000_000_000,
              updatedAtMs: 1_700_000_000_000,
            },
          ]
        }
        if (method === 'modelPrefs.listRecents') return []
        return null
      }),
    }

    const Wrapper = defineComponent({
      components: { ChatAppComposer },
      setup() {
        const draft = ref('')
        const model = ref(DEFAULT_OPENROUTER_TEST_MODEL)
        const requestedReasoningEffort = ref<'auto'>('auto')
        const requestedReasoningExclude = ref(false)
        const sessionConfig = createBoundSessionConfig(model)
        const modelCatalog = ref([
          {
            modelId: 'openai/gpt-4o',
            name: 'GPT-4o',
            vendor: 'openai',
            status: 'visible' as const,
            supportedParameters: [],
            lastSeenSnapshotId: 's1',
          },
        ])

        return {
          draft,
          model,
          requestedReasoningEffort,
          requestedReasoningExclude,
          sessionConfig,
          modelCatalog,
        }
      },
      template: `
        <ChatAppComposer
          v-model:draft="draft"
          v-model:model="model"
          v-model:requestedReasoningEffort="requestedReasoningEffort"
          v-model:requestedReasoningExclude="requestedReasoningExclude"
          :disabled="false"
          :isRunning="false"
          :sessionConfig="sessionConfig"
          :modelCatalog="modelCatalog"
          :showHiddenModelsInPickers="false"
          :modelCatalogNotice="null"
        />
      `,
    })

    render(Wrapper)
    await screen.findByTestId('favorite-model-openai/gpt-4o')

    await user.click(screen.getByTestId('favorite-model-openai/gpt-4o'))

    await waitFor(() => {
      expect(screen.getByTestId('current-model-pill').textContent).toContain('GPT-4o')
    })
    expect(screen.queryByTestId('model-picker-dialog')).toBeNull()
  })

  it('opens model picker dialog from current model pill while running', async () => {
    const user = userEvent.setup()
    const Wrapper = defineComponent({
      components: { ChatAppComposer },
      setup() {
        const draft = ref('')
        const model = ref(DEFAULT_OPENROUTER_TEST_MODEL)
        const requestedReasoningEffort = ref<'auto'>('auto')
        const requestedReasoningExclude = ref(false)
        const sessionConfig = createBoundSessionConfig(model)
        const modelCatalog = ref([])
        return {
          draft,
          model,
          requestedReasoningEffort,
          requestedReasoningExclude,
          sessionConfig,
          modelCatalog,
        }
      },
      template: `
        <ChatAppComposer
          v-model:draft="draft"
          v-model:model="model"
          v-model:requestedReasoningEffort="requestedReasoningEffort"
          v-model:requestedReasoningExclude="requestedReasoningExclude"
          :disabled="false"
          :isRunning="true"
          :sessionConfig="sessionConfig"
          :modelCatalog="modelCatalog"
          :showHiddenModelsInPickers="false"
          :modelCatalogNotice="null"
        />
      `,
    })

    render(Wrapper)
    await user.click(await screen.findByTestId('current-model-pill'))
    await screen.findByTestId('model-picker-dialog')
  })

  it('wires model picker row favorite toggle to favorites strip update', async () => {
    const user = userEvent.setup()
    let favorites: any[] = []
    ;(globalThis as any).dbBridge = {
      invoke: vi.fn(async (method: string, params?: any) => {
        if (method === 'modelPrefs.listFavorites') {
          return favorites
        }
        if (method === 'modelPrefs.addFavorite') {
          const providerKey = String(params?.providerKey ?? 'openrouter')
          const modelId = String(params?.modelId ?? '')
          const modelKey = String(params?.modelKey ?? `${providerKey}::${modelId}`)
          const row = {
            scopeType: 'global',
            scopeId: '',
            providerKey,
            modelId,
            modelKey,
            sortRank: 0,
            createdAtMs: 1,
            updatedAtMs: 1,
          }
          favorites = [row]
          return row
        }
        if (method === 'modelPrefs.removeFavorite') {
          const modelKey = String(params?.modelKey ?? '')
          const before = favorites.length
          favorites = favorites.filter((item) => item.modelKey !== modelKey)
          return { removed: before - favorites.length }
        }
        return null
      }),
    }

    const queryFn = vi.fn(async (_input: CatalogQueryInput): Promise<CatalogQueryResult> =>
      createResult([
        {
          providerKey: 'openrouter',
          modelId: 'anthropic/claude-3',
          modelKey: 'openrouter::anthropic/claude-3',
          canonicalSlug: 'anthropic/claude-3',
          displayName: 'Claude 3',
          description: 'fallback',
          vendor: 'anthropic',
          contextLength: 200000,
          createdAtSec: 1700000123,
          pricing: { prompt: '0.01', completion: '0.02', request: '0', image: '0' },
          capabilities: {
            reasoning: true,
            tools: false,
            structuredOutputs: false,
            vision: false,
            longContext: true,
          },
        },
      ]),
    )

    const Wrapper = defineComponent({
      components: { ChatAppComposer },
      setup() {
        const draft = ref('')
        const model = ref(DEFAULT_OPENROUTER_TEST_MODEL)
        const requestedReasoningEffort = ref<'auto'>('auto')
        const requestedReasoningExclude = ref(false)
        const sessionConfig = createBoundSessionConfig(model)
        const modelCatalog = ref([
          {
            modelId: 'openai/gpt-4o',
            name: 'GPT-4o',
            vendor: 'openai',
            status: 'visible' as const,
            supportedParameters: [],
            lastSeenSnapshotId: 's1',
          },
        ])

        return {
          draft,
          model,
          requestedReasoningEffort,
          requestedReasoningExclude,
          sessionConfig,
          modelCatalog,
          queryFn,
        }
      },
      template: `
        <ChatAppComposer
          v-model:draft="draft"
          v-model:model="model"
          v-model:requestedReasoningEffort="requestedReasoningEffort"
          v-model:requestedReasoningExclude="requestedReasoningExclude"
          :disabled="false"
          :isRunning="false"
          :sessionConfig="sessionConfig"
          :modelCatalog="modelCatalog"
          :showHiddenModelsInPickers="false"
          :modelCatalogNotice="null"
          :modelPickerQueryFn="queryFn"
        />
      `,
    })

    render(Wrapper)

    await user.click(await screen.findByTestId('current-model-pill'))
    await screen.findByTestId('model-picker-item-anthropic/claude-3')
    await user.click(screen.getByTestId('model-picker-favorite-anthropic/claude-3'))

    await waitFor(() => {
      expect(screen.getByTestId('favorite-model-anthropic/claude-3')).toBeTruthy()
    })
  })

  it('renders recents strip and switches model with single click', async () => {
    const user = userEvent.setup()
    ;(globalThis as any).dbBridge = {
      invoke: vi.fn(async (method: string) => {
        if (method === 'modelPrefs.listFavorites') return []
        if (method === 'modelPrefs.listRecents') {
          return [
            {
              scopeType: 'global',
              scopeId: '',
              providerKey: 'openrouter',
              modelId: 'anthropic/claude-3',
              modelKey: 'openrouter::anthropic/claude-3',
              lastUsedAtMs: 1_700_000_000_000,
              useCount: 3,
              createdAtMs: 1_700_000_000_000,
              updatedAtMs: 1_700_000_000_000,
            },
          ]
        }
        return null
      }),
    }

    const Wrapper = defineComponent({
      components: { ChatAppComposer },
      setup() {
        const draft = ref('')
        const model = ref(DEFAULT_OPENROUTER_TEST_MODEL)
        const requestedReasoningEffort = ref<'auto'>('auto')
        const requestedReasoningExclude = ref(false)
        const sessionConfig = createBoundSessionConfig(model)
        const modelCatalog = ref([
          {
            modelId: 'anthropic/claude-3',
            name: 'Claude 3',
            vendor: 'anthropic',
            status: 'visible' as const,
            supportedParameters: [],
            lastSeenSnapshotId: 's1',
          },
        ])

        return {
          draft,
          model,
          requestedReasoningEffort,
          requestedReasoningExclude,
          sessionConfig,
          modelCatalog,
        }
      },
      template: `
        <ChatAppComposer
          v-model:draft="draft"
          v-model:model="model"
          v-model:requestedReasoningEffort="requestedReasoningEffort"
          v-model:requestedReasoningExclude="requestedReasoningExclude"
          :disabled="false"
          :isRunning="false"
          :sessionConfig="sessionConfig"
          :modelCatalog="modelCatalog"
          :showHiddenModelsInPickers="false"
          :modelCatalogNotice="null"
        />
      `,
    })

    render(Wrapper)
    await screen.findByTestId('recent-model-anthropic/claude-3')

    await user.click(screen.getByTestId('recent-model-anthropic/claude-3'))

    await waitFor(() => {
      expect(screen.getByTestId('current-model-pill').textContent).toContain('Claude 3')
    })
  })

  it('collapses overflowing recents and opens picker for hidden items', async () => {
    const user = userEvent.setup()
    const recents = Array.from({ length: 8 }, (_value, index) => ({
      scopeType: 'global',
      scopeId: '',
      providerKey: 'openrouter',
      modelId: `vendor/model-${index + 1}`,
      modelKey: `openrouter::vendor/model-${index + 1}`,
      lastUsedAtMs: 1_700_000_000_000 - index,
      useCount: 1,
      createdAtMs: 1_700_000_000_000 - index,
      updatedAtMs: 1_700_000_000_000 - index,
    }))

    ;(globalThis as any).dbBridge = {
      invoke: vi.fn(async (method: string) => {
        if (method === 'modelPrefs.listFavorites') return []
        if (method === 'modelPrefs.listRecents') return recents
        return null
      }),
    }

    const queryFn = vi.fn(async (): Promise<CatalogQueryResult> =>
      createResult([
        {
          providerKey: 'openrouter',
          modelId: 'vendor/model-1',
          modelKey: 'openrouter::vendor/model-1',
          canonicalSlug: 'vendor/model-1',
          displayName: 'Model 1',
          description: 'fallback',
          vendor: 'vendor',
          contextLength: 32768,
          createdAtSec: 1700000000,
          pricing: { prompt: '0.01', completion: '0.02', request: '0', image: '0' },
          capabilities: {
            reasoning: true,
            tools: false,
            structuredOutputs: false,
            vision: false,
            longContext: true,
          },
        },
      ]),
    )

    const Wrapper = defineComponent({
      components: { ChatAppComposer },
      setup() {
        const draft = ref('')
        const model = ref(DEFAULT_OPENROUTER_TEST_MODEL)
        const requestedReasoningEffort = ref<'auto'>('auto')
        const requestedReasoningExclude = ref(false)
        const sessionConfig = createBoundSessionConfig(model)
        const modelCatalog = ref(
          recents.map((item) => ({
            modelId: item.modelId,
            name: item.modelId,
            vendor: 'vendor',
            status: 'visible' as const,
            supportedParameters: [],
            lastSeenSnapshotId: 's1',
          })),
        )

        return {
          draft,
          model,
          requestedReasoningEffort,
          requestedReasoningExclude,
          sessionConfig,
          modelCatalog,
          queryFn,
        }
      },
      template: `
        <ChatAppComposer
          v-model:draft="draft"
          v-model:model="model"
          v-model:requestedReasoningEffort="requestedReasoningEffort"
          v-model:requestedReasoningExclude="requestedReasoningExclude"
          :disabled="false"
          :isRunning="false"
          :sessionConfig="sessionConfig"
          :modelCatalog="modelCatalog"
          :showHiddenModelsInPickers="false"
          :modelCatalogNotice="null"
          :modelPickerQueryFn="queryFn"
        />
      `,
    })

    render(Wrapper)

    await screen.findByTestId('recent-model-vendor/model-1')
    expect(screen.queryByTestId('recent-model-vendor/model-7')).toBeNull()
    expect(screen.queryByTestId('recent-model-vendor/model-8')).toBeNull()

    await user.click(screen.getByTestId('recents-open-picker'))
    await screen.findByTestId('model-picker-dialog')
  })

  it('reorders favorites from favorites strip editor and persists order', async () => {
    const user = userEvent.setup()
    const now = 1_700_000_000_000
    let favorites = [
      {
        scopeType: 'global',
        scopeId: '',
        providerKey: 'openrouter',
        modelId: 'openai/gpt-4o',
        modelKey: 'openrouter::openai/gpt-4o',
        sortRank: 0,
        createdAtMs: now,
        updatedAtMs: now,
      },
      {
        scopeType: 'global',
        scopeId: '',
        providerKey: 'openrouter',
        modelId: 'anthropic/claude-3',
        modelKey: 'openrouter::anthropic/claude-3',
        sortRank: 1,
        createdAtMs: now,
        updatedAtMs: now,
      },
    ]

    const invoke = vi.fn(async (method: string, params?: any) => {
      if (method === 'modelPrefs.listFavorites') return favorites
      if (method === 'modelPrefs.listRecents') return []
      if (method === 'modelPrefs.reorderFavorites') {
        const ordered = Array.isArray(params?.orderedModelKeys) ? params.orderedModelKeys.map((value: unknown) => String(value)) : []
        const byKey = new Map(favorites.map((row) => [row.modelKey, row]))
        favorites = ordered
          .map((key, index) => {
            const existing = byKey.get(key)
            if (!existing) return null
            return {
              ...existing,
              sortRank: index,
              updatedAtMs: now + index + 1,
            }
          })
          .filter((row): row is (typeof favorites)[number] => row !== null)
        return favorites
      }
      return null
    })

    ;(globalThis as any).dbBridge = { invoke }

    const queryFn = vi.fn(async (_input: CatalogQueryInput): Promise<CatalogQueryResult> =>
      createResult([
        {
          providerKey: 'openrouter',
          modelId: 'openai/gpt-4o',
          modelKey: 'openrouter::openai/gpt-4o',
          canonicalSlug: 'openai/gpt-4o',
          displayName: 'GPT-4o',
          description: null,
          vendor: 'openai',
          contextLength: 128000,
          createdAtSec: 1700000123,
          pricing: { prompt: '0.1', completion: '0.2', request: '0', image: '0' },
          capabilities: {
            reasoning: true,
            tools: true,
            structuredOutputs: true,
            vision: true,
            longContext: true,
          },
        },
        {
          providerKey: 'openrouter',
          modelId: 'anthropic/claude-3',
          modelKey: 'openrouter::anthropic/claude-3',
          canonicalSlug: 'anthropic/claude-3',
          displayName: 'Claude 3',
          description: null,
          vendor: 'anthropic',
          contextLength: 200000,
          createdAtSec: 1700000123,
          pricing: { prompt: '0.1', completion: '0.2', request: '0', image: '0' },
          capabilities: {
            reasoning: true,
            tools: false,
            structuredOutputs: false,
            vision: false,
            longContext: true,
          },
        },
      ]),
    )

    const Wrapper = defineComponent({
      components: { ChatAppComposer },
      setup() {
        const draft = ref('')
        const model = ref(DEFAULT_OPENROUTER_TEST_MODEL)
        const modelPrefsScope = ref({ scopeType: 'conversation' as const, scopeId: 'convo-42' })
        const requestedReasoningEffort = ref<'auto'>('auto')
        const requestedReasoningExclude = ref(false)
        const sessionConfig = createBoundSessionConfig(model)
        const modelCatalog = ref([
          {
            modelId: 'openai/gpt-4o',
            name: 'GPT-4o',
            vendor: 'openai',
            status: 'visible' as const,
            supportedParameters: [],
            lastSeenSnapshotId: 's1',
          },
          {
            modelId: 'anthropic/claude-3',
            name: 'Claude 3',
            vendor: 'anthropic',
            status: 'visible' as const,
            supportedParameters: [],
            lastSeenSnapshotId: 's1',
          },
        ])

        return {
          draft,
          model,
          requestedReasoningEffort,
          requestedReasoningExclude,
          modelPrefsScope,
          modelCatalog,
          queryFn,
        }
      },
      template: `
        <ChatAppComposer
          v-model:draft="draft"
          v-model:model="model"
          v-model:requestedReasoningEffort="requestedReasoningEffort"
          v-model:requestedReasoningExclude="requestedReasoningExclude"
          :disabled="false"
          :isRunning="false"
          :sessionConfig="sessionConfig"
          :modelCatalog="modelCatalog"
          :showHiddenModelsInPickers="false"
          :modelCatalogNotice="null"
          :modelPickerQueryFn="queryFn"
          :modelPrefsScope="modelPrefsScope"
        />
      `,
    })

    render(Wrapper)
    const favoritesStrip = await screen.findByTestId('favorites-strip')
    await waitFor(() => {
      const favoriteButtons = within(favoritesStrip).queryAllByTestId(/^favorite-model-/)
      expect(favoriteButtons[0].textContent).toContain('GPT-4o')
      expect(favoriteButtons[1].textContent).toContain('Claude 3')
    })

    await user.click(screen.getByTestId('favorites-edit'))
    const firstCard = screen.getByTestId('favorite-edit-card-0')
    const secondCard = screen.getByTestId('favorite-edit-card-1')
    await fireEvent.dragStart(firstCard)
    await fireEvent.dragOver(secondCard)
    await fireEvent.drop(secondCard)
    await fireEvent.dragEnd(firstCard)
    await user.click(screen.getByTestId('favorites-done'))

    await waitFor(() => {
      expect(invoke).toHaveBeenCalledWith(
        'modelPrefs.reorderFavorites',
        expect.objectContaining({
          scopeType: 'conversation',
          scopeId: 'convo-42',
          orderedModelKeys: ['openrouter::anthropic/claude-3', 'openrouter::openai/gpt-4o'],
        }),
      )
    })

    await waitFor(() => {
      const favoriteButtons = within(screen.getByTestId('favorites-strip')).queryAllByTestId(/^favorite-model-/)
      expect(favoriteButtons[0].textContent).toContain('Claude 3')
      expect(favoriteButtons[1].textContent).toContain('GPT-4o')
    })
  })

  it('removes favorite from favorites strip editor and persists on done', async () => {
    const user = userEvent.setup()
    const now = 1_700_000_000_000
    let favorites = [
      {
        scopeType: 'global',
        scopeId: '',
        providerKey: 'openrouter',
        modelId: 'openai/gpt-4o',
        modelKey: 'openrouter::openai/gpt-4o',
        sortRank: 0,
        createdAtMs: now,
        updatedAtMs: now,
      },
      {
        scopeType: 'global',
        scopeId: '',
        providerKey: 'openrouter',
        modelId: 'anthropic/claude-3',
        modelKey: 'openrouter::anthropic/claude-3',
        sortRank: 1,
        createdAtMs: now,
        updatedAtMs: now,
      },
    ]

    const invoke = vi.fn(async (method: string, params?: any) => {
      if (method === 'modelPrefs.listFavorites') return favorites
      if (method === 'modelPrefs.listRecents') return []
      if (method === 'modelPrefs.removeFavorite') {
        favorites = favorites.filter((row) => row.modelKey !== String(params?.modelKey ?? ''))
        return { removed: 1 }
      }
      if (method === 'modelPrefs.reorderFavorites') {
        const ordered = Array.isArray(params?.orderedModelKeys) ? params.orderedModelKeys.map((value: unknown) => String(value)) : []
        const byKey = new Map(favorites.map((row) => [row.modelKey, row]))
        favorites = ordered
          .map((key, index) => {
            const existing = byKey.get(key)
            if (!existing) return null
            return {
              ...existing,
              sortRank: index,
              updatedAtMs: now + index + 1,
            }
          })
          .filter((row): row is (typeof favorites)[number] => row !== null)
        return favorites
      }
      return null
    })

    ;(globalThis as any).dbBridge = { invoke }

    const queryFn = vi.fn(async (_input: CatalogQueryInput): Promise<CatalogQueryResult> =>
      createResult([
        {
          providerKey: 'openrouter',
          modelId: 'openai/gpt-4o',
          modelKey: 'openrouter::openai/gpt-4o',
          canonicalSlug: 'openai/gpt-4o',
          displayName: 'GPT-4o',
          description: null,
          vendor: 'openai',
          contextLength: 128000,
          createdAtSec: 1700000123,
          pricing: { prompt: '0.1', completion: '0.2', request: '0', image: '0' },
          capabilities: {
            reasoning: true,
            tools: true,
            structuredOutputs: true,
            vision: true,
            longContext: true,
          },
        },
        {
          providerKey: 'openrouter',
          modelId: 'anthropic/claude-3',
          modelKey: 'openrouter::anthropic/claude-3',
          canonicalSlug: 'anthropic/claude-3',
          displayName: 'Claude 3',
          description: null,
          vendor: 'anthropic',
          contextLength: 200000,
          createdAtSec: 1700000123,
          pricing: { prompt: '0.1', completion: '0.2', request: '0', image: '0' },
          capabilities: {
            reasoning: true,
            tools: false,
            structuredOutputs: false,
            vision: false,
            longContext: true,
          },
        },
      ]),
    )

    const Wrapper = defineComponent({
      components: { ChatAppComposer },
      setup() {
        const draft = ref('')
        const model = ref(DEFAULT_OPENROUTER_TEST_MODEL)
        const modelPrefsScope = ref({ scopeType: 'conversation' as const, scopeId: 'convo-42' })
        const requestedReasoningEffort = ref<'auto'>('auto')
        const requestedReasoningExclude = ref(false)
        const sessionConfig = createBoundSessionConfig(model)
        const modelCatalog = ref([
          {
            modelId: 'openai/gpt-4o',
            name: 'GPT-4o',
            vendor: 'openai',
            status: 'visible' as const,
            supportedParameters: [],
            lastSeenSnapshotId: 's1',
          },
          {
            modelId: 'anthropic/claude-3',
            name: 'Claude 3',
            vendor: 'anthropic',
            status: 'visible' as const,
            supportedParameters: [],
            lastSeenSnapshotId: 's1',
          },
        ])

        return {
          draft,
          model,
          requestedReasoningEffort,
          requestedReasoningExclude,
          modelPrefsScope,
          modelCatalog,
          queryFn,
        }
      },
      template: `
        <ChatAppComposer
          v-model:draft="draft"
          v-model:model="model"
          v-model:requestedReasoningEffort="requestedReasoningEffort"
          v-model:requestedReasoningExclude="requestedReasoningExclude"
          :disabled="false"
          :isRunning="false"
          :sessionConfig="sessionConfig"
          :modelCatalog="modelCatalog"
          :showHiddenModelsInPickers="false"
          :modelCatalogNotice="null"
          :modelPickerQueryFn="queryFn"
          :modelPrefsScope="modelPrefsScope"
        />
      `,
    })

    render(Wrapper)
    await user.click(screen.getByTestId('favorites-edit'))
    await user.click(screen.getByTestId('favorite-edit-remove-1'))
    await user.click(screen.getByTestId('favorites-done'))

    await waitFor(() => {
      expect(invoke).toHaveBeenCalledWith(
        'modelPrefs.removeFavorite',
        expect.objectContaining({
          scopeType: 'conversation',
          scopeId: 'convo-42',
          modelKey: 'openrouter::anthropic/claude-3',
        }),
      )
    })

    await waitFor(() => {
      const favoriteButtons = within(screen.getByTestId('favorites-strip')).queryAllByTestId(/^favorite-model-/)
      expect(favoriteButtons).toHaveLength(1)
      expect(favoriteButtons[0].textContent).toContain('GPT-4o')
    })
  })

  it('honors injected project scope for favorites and recents operations', async () => {
    const user = userEvent.setup()
    const invoke = vi.fn(async (method: string, params?: any) => {
      if (method === 'modelPrefs.listFavorites') return []
      if (method === 'modelPrefs.listRecents') return []
      if (method === 'modelPrefs.addFavorite') {
        return {
          scopeType: String(params?.scopeType ?? 'global'),
          scopeId: String(params?.scopeId ?? ''),
          providerKey: String(params?.providerKey ?? 'openrouter'),
          modelId: String(params?.modelId ?? ''),
          modelKey: String(params?.modelKey ?? ''),
          sortRank: 0,
          createdAtMs: 1_700_000_000_000,
          updatedAtMs: 1_700_000_000_000,
        }
      }
      return null
    })
    ;(globalThis as any).dbBridge = { invoke }

    const Wrapper = defineComponent({
      components: { ChatAppComposer },
      setup() {
        const draft = ref('')
        const model = ref('openai/gpt-4o')
        const modelPrefsScope = ref({ scopeType: 'project' as const, scopeId: 'project-77' })
        const requestedReasoningEffort = ref<'auto'>('auto')
        const requestedReasoningExclude = ref(false)
        const sessionConfig = createBoundSessionConfig(model)
        const modelCatalog = ref([
          {
            modelId: 'openai/gpt-4o',
            name: 'GPT-4o',
            vendor: 'openai',
            status: 'visible' as const,
            supportedParameters: [],
            lastSeenSnapshotId: 's1',
          },
        ])

        return {
          draft,
          model,
          modelPrefsScope,
          requestedReasoningEffort,
          requestedReasoningExclude,
          sessionConfig,
          modelCatalog,
        }
      },
      template: `
        <ChatAppComposer
          v-model:draft="draft"
          v-model:model="model"
          v-model:requestedReasoningEffort="requestedReasoningEffort"
          v-model:requestedReasoningExclude="requestedReasoningExclude"
          :disabled="false"
          :isRunning="false"
          :sessionConfig="sessionConfig"
          :modelCatalog="modelCatalog"
          :showHiddenModelsInPickers="false"
          :modelCatalogNotice="null"
          :modelPrefsScope="modelPrefsScope"
        />
      `,
    })

    render(Wrapper)

    await waitFor(() => {
      expect(invoke).toHaveBeenCalledWith(
        'modelPrefs.listFavorites',
        expect.objectContaining({ scopeType: 'project', scopeId: 'project-77' }),
      )
      expect(invoke).toHaveBeenCalledWith(
        'modelPrefs.listRecents',
        expect.objectContaining({ scopeType: 'project', scopeId: 'project-77' }),
      )
    })

    await user.click(await screen.findByTestId('current-model-favorite-toggle'))

    await waitFor(() => {
      expect(invoke).toHaveBeenCalledWith(
        'modelPrefs.addFavorite',
        expect.objectContaining({
          scopeType: 'project',
          scopeId: 'project-77',
          modelId: 'openai/gpt-4o',
          modelKey: 'openrouter::openai/gpt-4o',
        }),
      )
    })
  })
})

