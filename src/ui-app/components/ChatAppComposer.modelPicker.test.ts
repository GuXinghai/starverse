import { computed, defineComponent, ref } from 'vue'
import { fireEvent, render, screen, waitFor, within } from '@testing-library/vue'
import userEvent from '@testing-library/user-event'
import { afterEach, describe, expect, it, vi } from 'vitest'
import type { CatalogQueryInput, CatalogQueryResult } from '@/next/modelCatalog/catalogQueryService'
import { __resetModelPrefsServiceCacheForTests } from '@/next/modelPrefs/modelPrefsService'
import { DEFAULT_OPENROUTER_TEST_MODEL } from '@/next/openrouter/openRouterTestModels'
import { t } from '@/shared/i18n'
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
    model: { selectedProviderId: 'openrouter' as const, selectedModelKey: DEFAULT_OPENROUTER_TEST_MODEL },
    reasoning: { enabled: true, effort: 'medium' as const },
    webSearch: { enabled: true, level: 'low' as const, detail: null },
    imageGeneration: {
      enabled: true,
      resolution: '1K' as const,
      aspectRatio: '1:1' as const,
      mode: 'default' as const,
      detail: null,
    },
    generationParams: { detail: null },
  }
}

function createBoundSessionConfig(model: { value: string }) {
  return computed(() => ({
    ...createSessionConfig(),
    model: { selectedProviderId: 'openrouter' as const, selectedModelKey: model.value },
  }))
}

function googleAvailability(modelId: string, thinking = true) {
  return {
    result: {
      ok: true,
      providerKey: 'google_ai_studio',
      endpointId: 'google-ai-studio-official',
      profileId: 'gemini_api_v1',
      observedAtMs: Date.UTC(2026, 5, 25),
      warnings: [],
      sourceDocuments: [],
      models: [{
        providerKey: 'google_ai_studio', endpointId: 'google-ai-studio-official', profileId: 'gemini_api_v1',
        nativeModelId: modelId, source: 'gemini_models_api', confidence: 'provider_reported',
        observedAtMs: Date.UTC(2026, 5, 25), warnings: [],
        providerSpecific: {
          thinkingOwnProperty: true, thinkingRawValue: thinking,
          thinkingRawType: 'boolean', supportedGenerationMethods: ['generateContent'],
        },
      }],
    },
  } as any
}

type ComposerTestUser = ReturnType<typeof userEvent.setup>

async function openFavoritesStrip(user: ComposerTestUser) {
  await user.click(await screen.findByTestId('model-main-tab-favorites'))
  return await screen.findByTestId('favorites-strip')
}

async function openRecentsStrip(user: ComposerTestUser) {
  await user.click(await screen.findByTestId('model-main-tab-recents'))
  return await screen.findByTestId('favorites-strip')
}

async function openGoogleThinkingMenu() {
  const chip = screen.getByTestId('google-thinking-chip')
  await fireEvent.click(within(chip).getByTestId('capability-chip-chevron'))
  return await screen.findByTestId('composer-google-thinking-controls')
}

async function openImageMenu() {
  const chip = screen.getByTestId('image-chip')
  await fireEvent.click(within(chip).getByTestId('capability-chip-chevron'))
  await screen.findAllByTestId('capability-chip-menu')
  return screen.getAllByTestId('capability-chip-menu').at(-1) as HTMLElement
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
          maxOutputTokens: null,
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

  it('selects non-OpenRouter provider models from picker sources', async () => {
    const user = userEvent.setup()
    const queryFn = vi.fn(async (_input: CatalogQueryInput): Promise<CatalogQueryResult> => createResult([]))
    const updateModel = vi.fn((selection: { providerId: string; modelId: string }) => selection)

    const Wrapper = defineComponent({
      components: { ChatAppComposer },
      setup() {
        const draft = ref('')
        const model = ref<string>(DEFAULT_OPENROUTER_TEST_MODEL)
        const selectedProviderId = ref('openrouter')
        const requestedReasoningEffort = ref<'auto'>('auto')
        const requestedReasoningExclude = ref(false)
        const sessionConfig = computed(() => ({
          ...createSessionConfig(),
          model: { selectedProviderId: selectedProviderId.value, selectedModelKey: model.value },
        }))
        const modelCatalog = ref([])
        const providerModelSources = ref([
          {
            providerId: 'openai_responses' as const,
            providerName: 'OpenAI Responses',
            statusKind: 'ready' as const,
            statusLabel: '1 model',
            loading: false,
            items: [
              {
                providerId: 'openai_responses' as const,
                providerName: 'OpenAI Responses',
                modelId: 'gpt-4.1-mini',
                modelKey: 'openai_responses::gpt-4.1-mini',
                displayName: 'GPT-4.1 mini',
                description: 'curated OpenAI model',
                vendor: 'OpenAI Responses',
                capabilitySummary: 'text · image input',
                statusKind: 'ready' as const,
                statusLabel: 'available',
                sourceLabel: 'provider availability',
                selectable: true,
                inputModalities: ['text', 'image'],
                outputModalities: ['text'],
              },
            ],
          },
        ])
        const handleUpdateModel = (selection: { providerId: string; modelId: string }) => {
          updateModel(selection)
          selectedProviderId.value = selection.providerId
          model.value = selection.modelId
        }
        return {
          draft,
          model,
          requestedReasoningEffort,
          requestedReasoningExclude,
          sessionConfig,
          modelCatalog,
          providerModelSources,
          queryFn,
          handleUpdateModel,
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
          :providerModelSources="providerModelSources"
          :showHiddenModelsInPickers="false"
          :modelCatalogNotice="null"
          :modelPickerQueryFn="queryFn"
          @updateModel="handleUpdateModel"
        />
      `,
    })

    render(Wrapper)

    await user.click(await screen.findByTestId('current-model-pill'))
    const item = await screen.findByTestId('model-picker-item-openai_responses-gpt-4.1-mini')
    await user.click(item)

    expect(updateModel).toHaveBeenCalledWith({ providerId: 'openai_responses', modelId: 'gpt-4.1-mini' })
    await waitFor(() => {
      expect(screen.getByTestId('current-model-pill').textContent).toContain('OpenAI Responses')
      expect(screen.getByTestId('current-model-pill').textContent).toContain('GPT-4.1 mini')
    })
  })

  it('uses OpenAI Responses reasoning effort options from generation params policy', async () => {
    const user = userEvent.setup()
    const updateGenerationParamsLayer = vi.fn()

    const Wrapper = defineComponent({
      components: { ChatAppComposer },
      setup() {
        const draft = ref('')
        const model = ref('gpt-5.4-nano')
        const requestedReasoningEffort = ref<'auto'>('auto')
        const requestedReasoningExclude = ref(false)
        const sessionConfig = computed(() => ({
          ...createSessionConfig(),
          model: { selectedProviderId: 'openai_responses' as const, selectedModelKey: model.value },
          reasoning: { enabled: false, effort: 'medium' as const },
          generationParams: {
            detail: {
              reasoningEffort: { mode: 'custom' as const, value: 'auto' },
            },
          },
        }))
        return {
          draft,
          model,
          requestedReasoningEffort,
          requestedReasoningExclude,
          sessionConfig,
          updateGenerationParamsLayer,
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
          :modelCatalog="[]"
          :showHiddenModelsInPickers="false"
          :modelCatalogNotice="null"
          @updateGenerationParamsLayer="updateGenerationParamsLayer"
        />
      `,
    })

    render(Wrapper)

    const chip = screen.getByTestId('reasoning-chip')
    expect(chip.textContent).toContain(`${t('chat.generationParams.reasoning.auto')} (none)`)

    await user.click(within(chip).getByTestId('capability-chip-chevron'))
    const menu = await screen.findByTestId('capability-chip-menu')
    expect(within(menu).getByText(t('chat.generationParams.reasoning.summary'))).toBeInTheDocument()
    expect(within(menu).getByRole('button', { name: t('chat.generationParams.reasoning.off') })).toBeInTheDocument()
    expect(within(menu).getByRole('button', { name: t('chat.generationParams.reasoning.concise') })).toBeInTheDocument()
    await user.click(within(menu).getByRole('button', { name: 'xhigh' }))

    expect(updateGenerationParamsLayer).toHaveBeenCalledWith({
      reasoningEffort: { mode: 'custom', value: 'xhigh' },
    })
  })

  it('shows max in the quick reasoning control only when the effective capability includes it', async () => {
    const user = userEvent.setup()
    const updateReasoningEffort = vi.fn()
    render(ChatAppComposer, {
      props: {
        draft: '', disabled: false, isRunning: false, modelCatalog: [],
        sessionConfig: {
          ...createSessionConfig(),
          model: { selectedProviderId: 'deepseek' as const, selectedModelKey: 'deepseek-v4-flash' },
          reasoning: { enabled: true, effort: 'high' as const },
        },
        'onUpdateReasoningEffort': updateReasoningEffort,
      },
    })

    const chip = screen.getByTestId('reasoning-chip')
    await user.click(within(chip).getByTestId('capability-chip-chevron'))
    const menu = await screen.findByTestId('capability-chip-menu')
    expect(within(menu).queryByRole('button', { name: 'low' })).not.toBeInTheDocument()
    await user.click(within(menu).getByRole('button', { name: 'max' }))
    expect(updateReasoningEffort).toHaveBeenCalledWith('max')
  })

  it('updates OpenAI Responses reasoning summary from the composer reasoning menu', async () => {
    const user = userEvent.setup()
    const updateGenerationParamsLayer = vi.fn()

    const Wrapper = defineComponent({
      components: { ChatAppComposer },
      setup() {
        const draft = ref('')
        const model = ref('gpt-5.4-nano')
        const requestedReasoningEffort = ref<'auto'>('auto')
        const requestedReasoningExclude = ref(false)
        const sessionConfig = computed(() => ({
          ...createSessionConfig(),
          model: { selectedProviderId: 'openai_responses' as const, selectedModelKey: model.value },
          generationParams: {
            detail: {
              reasoningEffort: { mode: 'custom' as const, value: 'auto' },
              reasoningSummary: { mode: 'omit' as const },
            },
          },
        }))
        return {
          draft,
          model,
          requestedReasoningEffort,
          requestedReasoningExclude,
          sessionConfig,
          updateGenerationParamsLayer,
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
          :modelCatalog="[]"
          :showHiddenModelsInPickers="false"
          :modelCatalogNotice="null"
          @updateGenerationParamsLayer="updateGenerationParamsLayer"
        />
      `,
    })

    render(Wrapper)

    const chip = screen.getByTestId('reasoning-chip')
    await user.click(within(chip).getByTestId('capability-chip-chevron'))
    const menu = await screen.findByTestId('capability-chip-menu')
    await user.click(within(menu).getByRole('button', { name: t('chat.generationParams.reasoning.detailed') }))

    expect(updateGenerationParamsLayer).toHaveBeenCalledWith({
      reasoningEffort: { mode: 'custom', value: 'auto' },
      reasoningSummary: { mode: 'custom', value: 'detailed' },
    })
  })

  it('applies image-only output filter from model picker dialog controls', async () => {
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
          maxOutputTokens: null,
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

    await user.click(await screen.findByTestId('current-model-pill'))
    await screen.findByTestId('model-picker-quick-image-output')

    queryFn.mockClear()
    await user.click(screen.getByTestId('model-picker-quick-image-output'))
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
    await openFavoritesStrip(user)
    await waitFor(() => {
      expect(screen.getByTestId('favorite-model-openai/gpt-4o')).toBeTruthy()
    })

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
    await openFavoritesStrip(user)
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
          maxOutputTokens: null,
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
    await openFavoritesStrip(user)

    await waitFor(() => {
      expect(screen.getByTestId('favorite-model-anthropic/claude-3')).toBeTruthy()
    })
  })

  it('renders current-session recents strip and switches model with single click', async () => {
    const user = userEvent.setup()
    ;(globalThis as any).dbBridge = {
      invoke: vi.fn(async (method: string) => {
        if (method === 'modelPrefs.listFavorites') return []
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
          maxOutputTokens: null,
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
    await user.click(await screen.findByTestId('model-picker-item-anthropic/claude-3'))

    await openRecentsStrip(user)
    await screen.findByTestId('recent-model-anthropic/claude-3')

    await user.click(screen.getByTestId('recent-model-anthropic/claude-3'))

    await waitFor(() => {
      expect(screen.getByTestId('current-model-pill').textContent).toContain('Claude 3')
    })
  })

  it('limits current-session recents and opens picker from the model pill', async () => {
    const user = userEvent.setup()
    const modelIds = Array.from({ length: 8 }, (_value, index) => `vendor/model-${index + 1}`)

    ;(globalThis as any).dbBridge = {
      invoke: vi.fn(async (method: string) => {
        if (method === 'modelPrefs.listFavorites') return []
        return null
      }),
    }

    const queryFn = vi.fn(async (): Promise<CatalogQueryResult> =>
      createResult(
        modelIds.map((modelId, index) => ({
          providerKey: 'openrouter',
          modelId,
          modelKey: `openrouter::${modelId}`,
          canonicalSlug: modelId,
          displayName: `Model ${index + 1}`,
          description: 'fallback',
          vendor: 'vendor',
          contextLength: 32768,
          maxOutputTokens: null,
          createdAtSec: 1700000000,
          pricing: { prompt: '0.01', completion: '0.02', request: '0', image: '0' },
          capabilities: {
            reasoning: true,
            tools: false,
            structuredOutputs: false,
            vision: false,
            longContext: true,
          },
        })),
      ),
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
          modelIds.map((modelId, index) => ({
            modelId,
            name: `Model ${index + 1}`,
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
          :maxRecentModels="6"
        />
      `,
    })

    render(Wrapper)

    for (const modelId of modelIds) {
      await user.click(await screen.findByTestId('current-model-pill'))
      await user.click(await screen.findByTestId(`model-picker-item-${modelId}`))
    }
    await openRecentsStrip(user)
    await screen.findByTestId('recent-model-vendor/model-8')
    expect(screen.queryByTestId('recent-model-vendor/model-1')).toBeNull()
    expect(screen.queryByTestId('recent-model-vendor/model-2')).toBeNull()

    await user.click(screen.getByTestId('current-model-pill'))
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
          .map((key: string, index: number) => {
            const existing = byKey.get(key)
            if (!existing) return null
            return {
              ...existing,
              sortRank: index,
              updatedAtMs: now + index + 1,
            }
          })
          .filter((row: (typeof favorites)[number] | null): row is (typeof favorites)[number] => row !== null)
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
          maxOutputTokens: null,
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
          maxOutputTokens: null,
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
          sessionConfig,
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
    const favoritesStrip = await openFavoritesStrip(user)
    await waitFor(() => {
      const favoriteButtons = within(favoritesStrip).queryAllByTestId(/^favorite-model-/)
      expect(favoriteButtons[0].textContent).toContain('GPT-4o')
      expect(favoriteButtons[1].textContent).toContain('Claude 3')
    })

    await user.click(screen.getByTestId('current-model-pill'))
    await user.click(await screen.findByTestId('model-picker-favorites-edit'))
    const firstCard = screen.getByTestId('model-picker-favorites-card-0')
    const secondCard = screen.getByTestId('model-picker-favorites-card-1')
    await fireEvent.dragStart(firstCard)
    await fireEvent.dragOver(secondCard)
    await fireEvent.drop(secondCard)
    await fireEvent.dragEnd(firstCard)
    await user.click(screen.getByTestId('model-picker-favorites-done'))

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

    await openFavoritesStrip(user)
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
          .map((key: string, index: number) => {
            const existing = byKey.get(key)
            if (!existing) return null
            return {
              ...existing,
              sortRank: index,
              updatedAtMs: now + index + 1,
            }
          })
          .filter((row: (typeof favorites)[number] | null): row is (typeof favorites)[number] => row !== null)
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
           maxOutputTokens: null,
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
           maxOutputTokens: null,
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
          sessionConfig,
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
    await openFavoritesStrip(user)
    await user.click(screen.getByTestId('current-model-pill'))
    await user.click(await screen.findByTestId('model-picker-favorites-edit'))
    await user.click(screen.getByTestId('model-picker-favorites-remove-1'))
    await user.click(screen.getByTestId('model-picker-favorites-done'))

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

    await openFavoritesStrip(user)
    await waitFor(() => {
      const favoriteButtons = within(screen.getByTestId('favorites-strip')).queryAllByTestId(/^favorite-model-/)
      expect(favoriteButtons).toHaveLength(1)
      expect(favoriteButtons[0].textContent).toContain('GPT-4o')
    })
  })

  it('honors injected project scope for favorite operations', async () => {
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

    await openFavoritesStrip(user)

    await waitFor(() => {
      expect(invoke).toHaveBeenCalledWith(
        'modelPrefs.listFavorites',
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

  it('shows Gemini budget controls for Google AI Studio Gemini 2.5 models', async () => {
    const view = render(ChatAppComposer, {
      props: {
        draft: '',
        disabled: false,
        isRunning: false,
        sessionConfig: {
          ...createSessionConfig(),
          model: { selectedProviderId: 'google_ai_studio' as const, selectedModelKey: 'gemini-2.5-flash' },
          generationParams: { detail: {
            thinkingBudget: { mode: 'custom', value: 2048 },
            includeThoughts: { mode: 'custom', value: false },
          } },
        },
        googleAIStudioModelAvailability: googleAvailability('gemini-2.5-flash'),
        modelCatalog: [],
      },
    })

    expect(screen.queryByTestId('composer-google-thinking-controls')).not.toBeInTheDocument()
    await openGoogleThinkingMenu()

    expect(screen.getByTestId('composer-google-thinking-budget')).toHaveValue(2048)
    expect(screen.queryByTestId('composer-google-thinking-level')).not.toBeInTheDocument()
    expect(screen.queryByTestId('reasoning-chip')).not.toBeInTheDocument()

    await fireEvent.update(screen.getByTestId('composer-google-thinking-budget'), '4096')
    expect(view.emitted('updateGenerationParamsLayer')?.[0]).toEqual([{
      thinkingLevel: { mode: 'omit' },
      thinkingBudget: { mode: 'custom', value: 4096 },
      includeThoughts: { mode: 'custom', value: false },
    }])
  })

  it('shows Gemini level controls for Google AI Studio Gemini 3 models', async () => {
    const view = render(ChatAppComposer, {
      props: {
        draft: '',
        disabled: false,
        isRunning: false,
        sessionConfig: {
          ...createSessionConfig(),
          model: { selectedProviderId: 'google_ai_studio' as const, selectedModelKey: 'gemini-3.1-pro-preview' },
          generationParams: { detail: {
            thinkingLevel: { mode: 'custom', value: 'high' },
            includeThoughts: { mode: 'custom', value: true },
          } },
        },
        googleAIStudioModelAvailability: googleAvailability('gemini-3.1-pro-preview'),
        modelCatalog: [],
      },
    })

    expect(screen.queryByTestId('composer-google-thinking-controls')).not.toBeInTheDocument()
    await openGoogleThinkingMenu()

    expect(screen.getByTestId('composer-google-thinking-level')).toHaveValue('high')
    expect(screen.queryByTestId('composer-google-thinking-budget')).not.toBeInTheDocument()

    await fireEvent.update(screen.getByTestId('composer-google-thinking-level'), 'medium')
    expect(view.emitted('updateGenerationParamsLayer')?.[0]).toEqual([{
      thinkingLevel: { mode: 'custom', value: 'medium' },
      thinkingBudget: { mode: 'omit' },
      includeThoughts: { mode: 'custom', value: true },
    }])
  })

  it('uses Gemini image model thinking and size policy for Nano Banana 2', async () => {
    const view = render(ChatAppComposer, {
      props: {
        draft: '',
        disabled: false,
        isRunning: false,
        sessionConfig: {
          ...createSessionConfig(),
          model: { selectedProviderId: 'google_ai_studio' as const, selectedModelKey: 'gemini-3.1-flash-image' },
          generationParams: { detail: {
            thinkingLevel: { mode: 'custom', value: 'high' },
            thoughtSummaryMode: { mode: 'custom', value: 'none' },
          } },
        },
        modelCatalog: [],
      },
    })

    await openGoogleThinkingMenu()

    const level = screen.getByTestId('composer-google-thinking-level')
    expect(level).toHaveValue('high')
    expect(within(level).queryByRole('option', { name: 'low' })).not.toBeInTheDocument()
    expect(within(level).queryByRole('option', { name: 'medium' })).not.toBeInTheDocument()
    expect(screen.queryByTestId('composer-google-thinking-budget')).not.toBeInTheDocument()

    await fireEvent.update(level, 'minimal')
    expect(view.emitted('updateGenerationParamsLayer')?.[0]).toEqual([{
      thinkingLevel: { mode: 'custom', value: 'minimal' },
      thoughtSummaryMode: { mode: 'custom', value: 'none' },
    }])

    const imageMenu = await openImageMenu()
    const options = within(imageMenu).getAllByTestId('capability-chip-option').map((node) => node.textContent)
    expect(options).toContain('512')
    expect(options).toContain('4K')

    await fireEvent.click(within(imageMenu).getByText('2K'))
    expect(view.emitted('updateImageGenerationResolution')).toEqual([['2K']])
    expect(view.emitted('updateImageGenerationEnabled')).toBeUndefined()
  })

  it('forces image generation on and disables reasoning for legacy Nano Banana', async () => {
    const view = render(ChatAppComposer, {
      props: {
        draft: '',
        disabled: false,
        isRunning: false,
        sessionConfig: {
          ...createSessionConfig(),
          model: { selectedProviderId: 'google_ai_studio' as const, selectedModelKey: 'gemini-2.5-flash-image' },
          imageGeneration: {
            enabled: false,
            resolution: '4K' as const,
            aspectRatio: '16:9' as const,
            mode: 'default' as const,
            detail: null,
          },
        },
        modelCatalog: [],
      },
    })

    expect(screen.queryByTestId('google-thinking-chip')).not.toBeInTheDocument()

    const imageChip = screen.getByTestId('image-chip')
    expect(within(imageChip).getByTestId('capability-chip-body')).toHaveTextContent('1:1')

    await fireEvent.click(within(imageChip).getByTestId('capability-chip-body'))
    expect(view.emitted('updateImageGenerationEnabled')?.[0]).toEqual([true])
  })

  it('keeps selected supported image size and aspect ratio for Google image models', async () => {
    render(ChatAppComposer, {
      props: {
        draft: '',
        disabled: false,
        isRunning: false,
        sessionConfig: {
          ...createSessionConfig(),
          model: { selectedProviderId: 'google_ai_studio' as const, selectedModelKey: 'gemini-3.1-flash-image' },
          generationParams: { detail: {
            thinkingLevel: { mode: 'custom', value: 'minimal' },
            thoughtSummaryMode: { mode: 'custom', value: 'none' },
          } },
          imageGeneration: {
            enabled: true,
            resolution: '4K' as const,
            aspectRatio: '16:9' as const,
            mode: 'custom' as const,
            detail: null,
          },
        },
        modelCatalog: [],
      },
    })

    const imageChip = screen.getByTestId('image-chip')
    expect(within(imageChip).getByTestId('capability-chip-body')).toHaveTextContent('4K · 16:9')
  })

  it('restricts image size options for Nano Banana 2 Lite', async () => {
    render(ChatAppComposer, {
      props: {
        draft: '',
        disabled: false,
        isRunning: false,
        sessionConfig: {
          ...createSessionConfig(),
          model: { selectedProviderId: 'google_ai_studio' as const, selectedModelKey: 'gemini-3.1-flash-lite-image' },
        },
        modelCatalog: [],
      },
    })

    await openImageMenu()
    const options = screen.getAllByTestId('capability-chip-option').map((node) => node.textContent)
    expect(options).toContain('1K')
    expect(options).not.toContain('2K')
    expect(options).not.toContain('4K')
  })

  it('disables Gemini thinking controls for unsupported Google AI Studio models', () => {
    render(ChatAppComposer, {
      props: {
        draft: '',
        disabled: false,
        isRunning: false,
        sessionConfig: {
          ...createSessionConfig(),
          model: { selectedProviderId: 'google_ai_studio' as const, selectedModelKey: 'gemini-1.5-pro' },
        },
        modelCatalog: [],
      },
    })

    const chip = screen.getByTestId('google-thinking-chip')
    expect(within(chip).getByTestId('capability-chip-body')).toBeDisabled()
    expect(within(chip).getByTestId('capability-chip-chevron')).toBeDisabled()
    expect(screen.queryByTestId('composer-google-thinking-controls')).not.toBeInTheDocument()
    expect(screen.queryByTestId('composer-google-thinking-budget')).not.toBeInTheDocument()
    expect(screen.queryByTestId('composer-google-thinking-level')).not.toBeInTheDocument()
  })
})

