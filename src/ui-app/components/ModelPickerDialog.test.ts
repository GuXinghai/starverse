import { fireEvent, render, screen, waitFor } from '@testing-library/vue'
import userEvent from '@testing-library/user-event'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { defineComponent, ref } from 'vue'
import type { CatalogQueryInput, CatalogQueryResult } from '@/next/modelCatalog/catalogQueryService'
import { DEFAULT_OPENROUTER_TEST_MODEL } from '@/next/openrouter/openRouterTestModels'
import { t, tf } from '@/shared/i18n'
import { installGenerationV2ModelsList, successfulGenerationV2Models } from '../../../tests/helpers/generationV2ModelsBridge'
import ModelPickerDialog from './ModelPickerDialog.vue'

function createResult(
  items: CatalogQueryResult['items'],
  nextCursor: CatalogQueryResult['nextCursor'] = null,
  meta: Partial<CatalogQueryResult> = {},
): CatalogQueryResult {
  return {
    items: [...items],
    nextCursor,
    notice: null,
    status: 'synced',
    ...meta,
  }
}

function setCatalogSettings(values: Record<string, unknown>) {
  ;(globalThis as any).electronStore = {
    get: vi.fn(async (key: string) => values[key]),
  }
}

describe('ModelPickerDialog', () => {
  const originalDbBridge = (globalThis as any).dbBridge
  const originalElectronStore = (globalThis as any).electronStore
  const originalGenerationV2 = (globalThis as any).generationV2

  beforeEach(() => {
    const current = (globalThis as any).generationV2 ?? {}
    ;(globalThis as any).generationV2 = { ...current, models: { ...(current.models ?? {}),
      sync: vi.fn(async (payload: any) => {
        const legacy = (globalThis as any).electronAPI?.modelCatalogSyncNow
        if (typeof legacy !== 'function') return { ok: true, status: 'synced', modelCount: 0,
          visibleModelCount: 0, hiddenModelCount: 0, responseDigest: null, observedAtMs: Date.now() }
        const result = await legacy(payload)
        return result?.ok === true && result?.syncSucceeded !== false
          ? { ok: true, status: 'synced', modelCount: result.modelCount ?? 0,
              visibleModelCount: result.visibleModelCount ?? result.modelCount ?? 0,
              hiddenModelCount: result.hiddenModelCount ?? 0, responseDigest: result.catalogRevision ?? null,
              observedAtMs: result.lastSyncAtMs ?? Date.now() }
          : { ok: false, code: result?.errorCode ?? 'sync_failed' }
      }),
      status: vi.fn(async (payload: any) => {
        const legacy = (globalThis as any).electronAPI?.modelCatalogGetSyncStatus
        if (typeof legacy !== 'function') return { ok: true, status: 'not_synced', modelCount: 0,
          visibleModelCount: 0, hiddenModelCount: 0, responseDigest: null, observedAtMs: null, errorCode: null }
        const result = await legacy(payload)
        return { ok: result?.ok !== false, status: result?.status ?? (result?.syncState === 'ok' ? 'synced' : 'not_synced'),
          modelCount: result?.modelCount ?? 0, visibleModelCount: result?.visibleModelCount ?? result?.modelCount ?? 0,
          hiddenModelCount: result?.hiddenModelCount ?? 0, responseDigest: result?.catalogRevision ?? null,
          observedAtMs: result?.lastSyncAtMs ?? null, errorCode: result?.lastErrorCode ?? null }
      }),
    } }
  })

  afterEach(() => {
    vi.restoreAllMocks()
    ;(globalThis as any).dbBridge = originalDbBridge
    ;(globalThis as any).electronStore = originalElectronStore
    ;(globalThis as any).generationV2 = originalGenerationV2
    delete (globalThis as any).electronAPI
  })

  it('loads first page and emits select+close on single click', async () => {
    const user = userEvent.setup()
    const endpointDetailFn = vi.fn(async (input: { modelId: string }) => ({
      providerKey: 'openrouter',
      modelId: input.modelId,
      fetchedAtMs: null,
      source: 'cache' as const,
      items: [],
      error: null,
    }))
    const queryFn = vi.fn(async () =>
      createResult([
        {
          providerKey: 'openrouter',
          modelId: 'openai/gpt-4o',
          modelKey: 'openrouter::openai/gpt-4o',
          canonicalSlug: 'openai/gpt-4o',
          displayName: 'GPT-4o',
          description: 'omni',
          vendor: 'openai',
          contextLength: 128000,
          maxOutputTokens: 8192,
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
      ])
    )

    const view = render(ModelPickerDialog, {
      props: {
        open: true,
        selectedProviderId: 'openrouter',
        selectedModelId: DEFAULT_OPENROUTER_TEST_MODEL,
        queryFn,
        endpointDetailFn,
        debounceMs: 0,
      },
    })

    await screen.findByTestId('model-picker-item-openai/gpt-4o')
    await user.click(screen.getByTestId('model-picker-item-openai/gpt-4o'))

    const events = view.emitted()
    expect(events.select).toBeTruthy()
    expect(events.select?.[0]).toEqual([{ providerId: 'openrouter', modelId: 'openai/gpt-4o' }, 'GPT-4o'])
    expect(events.close).toBeTruthy()
  })

  it('renders provider model sources and emits provider-scoped selection', async () => {
    const user = userEvent.setup()
    const queryFn = vi.fn(async () => createResult([]))
    const modelDetailFn = vi.fn(async () => {
      throw new Error('non-OpenRouter provider source should not request OpenRouter model detail')
    })
    const view = render(ModelPickerDialog, {
      props: {
        open: true,
        selectedProviderId: 'openrouter',
        selectedModelId: DEFAULT_OPENROUTER_TEST_MODEL,
        queryFn,
        modelDetailFn,
        debounceMs: 0,
        providerSources: [
          {
            providerId: 'openai_responses',
            providerName: 'OpenAI Responses',
            statusKind: 'ready',
            statusLabel: '1 model',
            loading: false,
            items: [
              {
                providerId: 'openai_responses',
                providerName: 'OpenAI Responses',
                modelId: 'gpt-4.1-mini',
                modelKey: 'openai_responses::gpt-4.1-mini',
                displayName: 'GPT-4.1 mini',
                description: 'curated OpenAI model',
                vendor: 'OpenAI Responses',
                capabilitySummary: 'text · image input',
                statusKind: 'ready',
                statusLabel: 'available',
                sourceLabel: 'provider availability',
                selectable: true,
                inputModalities: ['text', 'image'],
                outputModalities: ['text'],
              },
            ],
          },
          {
            providerId: 'anthropic_messages',
            providerName: 'Anthropic Messages',
            statusKind: 'credential_missing',
            statusLabel: 'credential missing',
            loading: false,
            items: [],
          },
        ],
      },
    })

    expect(await screen.findByTestId('model-picker-provider-status-openai_responses')).toHaveTextContent('1 model')
    expect(screen.getByTestId('model-picker-provider-status-anthropic_messages')).toHaveTextContent('credential missing')
    expect(await screen.findByTestId('model-picker-item-openai_responses-gpt-4.1-mini')).toHaveTextContent('OpenAI Responses')

    await user.click(screen.getByTestId('model-picker-provider-select-none'))
    await user.click(screen.getByTestId('model-picker-provider-filter-anthropic_messages'))
    await waitFor(() => {
      expect(screen.queryByTestId('model-picker-item-openai_responses-gpt-4.1-mini')).toBeNull()
      expect(screen.getByText(t('errors.modelCatalog.noModelsFound'))).toBeTruthy()
    })

    await user.click(screen.getByTestId('model-picker-provider-select-none'))
    await user.click(screen.getByTestId('model-picker-provider-filter-openai_responses'))
    const openAIItem = await screen.findByTestId('model-picker-item-openai_responses-gpt-4.1-mini')
    await user.hover(openAIItem)
    expect(await screen.findByTestId('model-picker-provider-detail')).toHaveTextContent('GPT-4.1 mini')
    expect(modelDetailFn).not.toHaveBeenCalled()

    await user.click(openAIItem)

    const events = view.emitted()
    expect(events.select?.[0]).toEqual([{ providerId: 'openai_responses', modelId: 'gpt-4.1-mini' }, 'GPT-4.1 mini'])
    expect(events.close).toBeTruthy()
  })

  it('temporarily preserves provider filters and list scroll across close and reopen', async () => {
    const user = userEvent.setup()
    const queryFn = vi.fn(async (input: CatalogQueryInput) => {
      const providerKey = String(input.sourceProviderKey ?? input.providerKey ?? 'openrouter')
      const modelId = providerKey === 'openai_responses' ? 'gpt-4.1' : 'openrouter-model'
      const displayName = providerKey === 'openai_responses' ? 'GPT-4.1' : 'OpenRouter Model'
      return createResult([
        {
          providerKey,
          modelId,
          modelKey: `${providerKey}::${modelId}`,
          canonicalSlug: modelId,
          displayName,
          description: null,
          vendor: providerKey,
          contextLength: 8192,
          maxOutputTokens: 4096,
          createdAtSec: 1700000123,
          pricing: { prompt: null, completion: null, request: null, image: null },
          capabilities: {
            reasoning: false,
            tools: false,
            structuredOutputs: false,
            vision: false,
            longContext: false,
          },
        },
      ])
    })

    const Wrapper = defineComponent({
      components: { ModelPickerDialog },
      setup() {
        const open = ref(true)
        return {
          open,
          queryFn,
          close: () => {
            open.value = false
          },
          reopen: () => {
            open.value = true
          },
        }
      },
      template: `
        <button type="button" data-testid="reopen-model-picker" @click="reopen">Reopen</button>
        <ModelPickerDialog
          :open="open"
          selectedProviderId="openrouter"
          selectedModelId="openrouter-model"
          :queryFn="queryFn"
          :debounceMs="0"
          :providerSources="[
            {
              providerId: 'openai_responses',
              providerName: 'OpenAI Responses',
              statusKind: 'not_loaded',
              statusLabel: 'catalog',
              loading: false,
              items: [],
            },
          ]"
          @close="close"
        />
      `,
    })

    render(Wrapper)

    await screen.findByTestId('model-picker-item-openrouter-model')
    await screen.findByTestId('model-picker-item-openai_responses-gpt-4.1')

    await user.click(screen.getByTestId('model-picker-provider-filter-openrouter'))
    await waitFor(() => {
      expect(screen.queryByTestId('model-picker-item-openrouter-model')).toBeNull()
      expect(screen.getByTestId('model-picker-item-openai_responses-gpt-4.1')).toBeTruthy()
    })

    const list = screen.getByTestId('model-picker-list') as HTMLElement
    list.scrollTop = 180
    await fireEvent.scroll(list)
    await user.click(screen.getByTestId('model-picker-close'))
    expect(screen.queryByTestId('model-picker-dialog')).toBeNull()

    await user.click(screen.getByTestId('reopen-model-picker'))
    await screen.findByTestId('model-picker-item-openai_responses-gpt-4.1')

    expect(screen.queryByTestId('model-picker-item-openrouter-model')).toBeNull()
    expect((screen.getByTestId('model-picker-provider-filter-openrouter') as HTMLInputElement).checked).toBe(false)
    expect((screen.getByTestId('model-picker-provider-filter-openai_responses') as HTMLInputElement).checked).toBe(true)
    await waitFor(() => {
      expect((screen.getByTestId('model-picker-list') as HTMLElement).scrollTop).toBe(180)
    })
  })

  it('keeps other catalog provider models visible after OpenRouter is unchecked', async () => {
    const user = userEvent.setup()
    const queryFn = vi.fn(async (input: CatalogQueryInput) => {
      const providerKey = String(input.sourceProviderKey ?? input.providerKey ?? 'openrouter')
      const modelId = providerKey === 'openrouter'
        ? 'openrouter-model'
        : providerKey === 'openai_responses'
          ? 'gpt-4.1'
          : 'gemini-2.5-flash'
      const displayName = providerKey === 'openrouter'
        ? 'OpenRouter Model'
        : providerKey === 'openai_responses'
          ? 'GPT-4.1'
          : 'Gemini 2.5 Flash'
      return createResult([
        {
          providerKey,
          modelId,
          modelKey: `${providerKey}::${modelId}`,
          canonicalSlug: modelId,
          displayName,
          description: null,
          vendor: providerKey,
          contextLength: 8192,
          maxOutputTokens: 4096,
          createdAtSec: 1700000123,
          pricing: { prompt: null, completion: null, request: null, image: null },
          capabilities: {
            reasoning: false,
            tools: false,
            structuredOutputs: false,
            vision: false,
            longContext: false,
          },
        },
      ])
    })

    render(ModelPickerDialog, {
      props: {
        open: true,
        selectedProviderId: 'openrouter',
        selectedModelId: DEFAULT_OPENROUTER_TEST_MODEL,
        queryFn,
        debounceMs: 0,
        providerSources: [
          { providerId: 'openai_responses', providerName: 'OpenAI Responses', statusKind: 'not_loaded', statusLabel: 'catalog', loading: false, items: [] },
          { providerId: 'google_ai_studio', providerName: 'Google AI Studio', statusKind: 'not_loaded', statusLabel: 'catalog', loading: false, items: [] },
        ],
      },
    })

    await screen.findByTestId('model-picker-item-openrouter-model')
    await screen.findByTestId('model-picker-item-openai_responses-gpt-4.1')
    await screen.findByTestId('model-picker-item-google_ai_studio-gemini-2.5-flash')

    await user.click(screen.getByTestId('model-picker-provider-filter-openrouter'))

    await waitFor(() => {
      expect(screen.queryByTestId('model-picker-item-openrouter-model')).toBeNull()
      expect(screen.getByTestId('model-picker-item-openai_responses-gpt-4.1')).toBeTruthy()
      expect(screen.getByTestId('model-picker-item-google_ai_studio-gemini-2.5-flash')).toBeTruthy()
    })
  })

  it('uses scoped current query API as the default model list source', async () => {
    const scopedQuery = installGenerationV2ModelsList('openrouter', async () => successfulGenerationV2Models([
        {
          providerKey: 'openrouter',
          modelId: 'scoped/current-model',
          modelKey: 'openrouter::scoped/current-model',
          canonicalSlug: 'scoped/current-model',
          displayName: 'Scoped Current Model',
          description: null,
          vendor: 'scoped',
          contextLength: 8192,
          maxOutputTokens: 4096,
          createdAtSec: 1700000123,
          pricing: { prompt: null, completion: null, request: null, image: null },
          capabilities: {
            reasoning: false,
            tools: false,
            structuredOutputs: false,
            vision: false,
            longContext: false,
          },
        },
      ], { responseDigest: 'scoped-current', observedAtMs: Date.now() }))
    const legacyInvoke = vi.fn(async () => {
      throw new Error('legacy modelCatalog query should not be called')
    })
    ;(globalThis as any).dbBridge = { invoke: legacyInvoke }

    render(ModelPickerDialog, {
      props: {
        open: true,
        selectedProviderId: 'openrouter',
        selectedModelId: 'scoped/current-model',
        modelDetailFn: vi.fn(async () => ({
          providerKey: 'openrouter',
          modelId: 'scoped/current-model',
          error: null,
          item: null,
        })),
        debounceMs: 0,
      },
    })

    await screen.findByTestId('model-picker-item-scoped/current-model')

    expect(scopedQuery).toHaveBeenCalledWith(expect.objectContaining({
      timeoutMs: expect.any(Number),
    }))
    expect(legacyInvoke).not.toHaveBeenCalled()
    const payload = JSON.stringify(scopedQuery.mock.calls)
    expect(payload).not.toContain('sk-')
    expect(payload).not.toContain('catalogScopeKey')
  })

  it('emits toggleFavorite from row star button without selecting row', async () => {
    const user = userEvent.setup()
    const endpointDetailFn = vi.fn(async (input: { modelId: string }) => ({
      providerKey: 'openrouter',
      modelId: input.modelId,
      fetchedAtMs: null,
      source: 'cache' as const,
      items: [],
      error: null,
    }))
    const queryFn = vi.fn(async () =>
      createResult([
        {
          providerKey: 'openrouter',
          modelId: 'openai/gpt-4o',
          modelKey: 'openrouter::openai/gpt-4o',
          canonicalSlug: 'openai/gpt-4o',
          displayName: 'GPT-4o',
          description: 'omni',
          vendor: 'openai',
          contextLength: 128000,
          maxOutputTokens: 8192,
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
      ])
    )

    const view = render(ModelPickerDialog, {
      props: {
        open: true,
        selectedProviderId: 'openrouter',
        selectedModelId: DEFAULT_OPENROUTER_TEST_MODEL,
        queryFn,
        endpointDetailFn,
        debounceMs: 0,
      },
    })

    await screen.findByTestId('model-picker-item-openai/gpt-4o')
    await user.click(screen.getByTestId('model-picker-favorite-openai/gpt-4o'))

    const events = view.emitted()
    expect(events.toggleFavorite).toBeTruthy()
    expect(events.toggleFavorite?.[0]).toEqual(['openai/gpt-4o'])
    expect(events.select).toBeFalsy()
  })

  it('supports favorites reorder edit mode with drag and done', async () => {
    const user = userEvent.setup()
    const endpointDetailFn = vi.fn(async (input: { modelId: string }) => ({
      providerKey: 'openrouter',
      modelId: input.modelId,
      fetchedAtMs: null,
      source: 'cache' as const,
      items: [],
      error: null,
    }))
    const queryFn = vi.fn(async () =>
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
          maxOutputTokens: 8192,
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
          maxOutputTokens: null,
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

    const view = render(ModelPickerDialog, {
      props: {
        open: true,
        selectedProviderId: 'openrouter',
        selectedModelId: DEFAULT_OPENROUTER_TEST_MODEL,
        favoriteModelKeys: ['openrouter::openai/gpt-4o', 'openrouter::anthropic/claude-3'],
        queryFn,
        endpointDetailFn,
        debounceMs: 0,
      },
    })

    await screen.findByTestId('model-picker-favorites-edit')
    await user.click(screen.getByTestId('model-picker-favorites-edit'))
    const firstCard = screen.getByTestId('model-picker-favorites-card-0')
    const secondCard = screen.getByTestId('model-picker-favorites-card-1')
    await fireEvent.dragStart(firstCard)
    await fireEvent.dragOver(secondCard)
    await fireEvent.drop(secondCard)
    await fireEvent.dragEnd(firstCard)
    await user.click(screen.getByTestId('model-picker-favorites-done'))

    const events = view.emitted()
    expect(events.reorderFavorites).toBeTruthy()
    expect(events.reorderFavorites?.[0]).toEqual([
      ['openrouter::anthropic/claude-3', 'openrouter::openai/gpt-4o'],
    ])
  })

  it('does not use fallbackModels to populate current scoped picker details', async () => {
    const queryFn = vi.fn(async () => createResult([]))

    render(ModelPickerDialog, {
      props: {
        open: true,
        selectedProviderId: 'openrouter',
        selectedModelId: 'legacy/only-model',
        notice: 'Model catalog is empty. Fell back to reasoning model index cache.',
        favoriteModelKeys: ['openrouter::legacy/only-model'],
        fallbackModels: [
          {
            modelId: 'legacy/only-model',
            name: 'Legacy Pretty Name',
            vendor: 'legacy-vendor',
            status: 'visible',
            supportedParameters: [],
            lastSeenSnapshotId: 'legacy-snapshot',
          },
        ],
        queryFn,
        debounceMs: 0,
      },
    })

    await waitFor(() => {
      expect(queryFn).toHaveBeenCalled()
    })

    expect(screen.getAllByText('legacy/only-model').length).toBeGreaterThan(0)
    expect(screen.queryByText('Legacy Pretty Name')).toBeNull()
    expect(screen.queryByText(/fallback/i)).toBeNull()
    expect(screen.queryByText(/cache/i)).toBeNull()
    expect(screen.queryByTestId('model-picker-vendor-legacy-vendor')).toBeNull()
    expect(screen.queryByTestId('model-picker-item-legacy/only-model')).toBeNull()
  })

  it('does not auto-select the first scoped model when the selected model is missing', async () => {
    const modelDetailFn = vi.fn(async () => ({
      providerKey: 'openrouter',
      modelId: 'openai/gpt-4o',
      error: null,
      item: null,
    }))
    const queryFn = vi.fn(async () =>
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
          maxOutputTokens: 8192,
          createdAtSec: 1700000123,
          pricing: { prompt: null, completion: null, request: null, image: null },
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

    const view = render(ModelPickerDialog, {
      props: {
        open: true,
        selectedProviderId: 'openrouter',
        selectedModelId: 'missing/current-model',
        queryFn,
        modelDetailFn,
        debounceMs: 0,
      },
    })

    await screen.findByTestId('model-picker-item-openai/gpt-4o')
    await fireEvent.keyDown(screen.getByTestId('model-picker-dialog'), { key: 'Enter' })

    expect(modelDetailFn).not.toHaveBeenCalled()
    expect(view.emitted().select).toBeFalsy()
    expect(screen.getByText('missing/current-model')).toBeTruthy()
  })

  it('applies search debounce and forwards latest search text only', async () => {
    const user = userEvent.setup()
    const endpointDetailFn = vi.fn(async (input: { modelId: string }) => ({
      providerKey: 'openrouter',
      modelId: input.modelId,
      fetchedAtMs: null,
      source: 'cache' as const,
      items: [],
      error: null,
    }))
    const queryFn = vi.fn(async (input: CatalogQueryInput) => {
      const keyword = String(input.searchText ?? '')
      const id = keyword.length > 0 ? `openai/${keyword}` : 'openai/default'
      return createResult([
        {
          providerKey: 'openrouter',
          modelId: id,
          modelKey: `openrouter::${id}`,
          canonicalSlug: id,
          displayName: id,
          description: null,
          vendor: 'openai',
          contextLength: 8192,
          maxOutputTokens: null,
          createdAtSec: 1700000123,
          pricing: { prompt: null, completion: null, request: null, image: null },
          capabilities: {
            reasoning: false,
            tools: false,
            structuredOutputs: false,
            vision: false,
            longContext: false,
          },
        },
      ])
    })

    render(ModelPickerDialog, {
      props: {
        open: true,
        selectedProviderId: 'openrouter',
        selectedModelId: DEFAULT_OPENROUTER_TEST_MODEL,
        queryFn,
        endpointDetailFn,
        debounceMs: 300,
      },
    })

    const input = await screen.findByTestId('model-picker-search')
    await user.type(input, 'gpt')

    await waitFor(() => {
      expect(queryFn).toHaveBeenLastCalledWith(expect.objectContaining({
        searchText: 'gpt',
        includeDescriptionInSearch: false,
      }))
    })

    await user.click(screen.getByTestId('model-picker-include-description'))
    await waitFor(() => {
      expect(queryFn).toHaveBeenLastCalledWith(expect.objectContaining({
        searchText: 'gpt',
        includeDescriptionInSearch: true,
      }))
    })
  })

  it('supports one-click image output filter in modal controls', async () => {
    const user = userEvent.setup()
    const endpointDetailFn = vi.fn(async (input: { modelId: string }) => ({
      providerKey: 'openrouter',
      modelId: input.modelId,
      fetchedAtMs: null,
      source: 'cache' as const,
      items: [],
      error: null,
    }))
    const queryFn = vi.fn(async () => createResult([]))

    render(ModelPickerDialog, {
      props: {
        open: true,
        selectedProviderId: 'openrouter',
        selectedModelId: DEFAULT_OPENROUTER_TEST_MODEL,
        queryFn,
        endpointDetailFn,
        debounceMs: 0,
      },
    })

    await screen.findByTestId('model-picker-quick-image-output')
    queryFn.mockClear()
    await user.click(screen.getByTestId('model-picker-quick-image-output'))

    await waitFor(() => {
      expect(queryFn).toHaveBeenCalled()
      expect(queryFn).toHaveBeenLastCalledWith(
        expect.objectContaining({
          filter: expect.objectContaining({
            outputModalities: ['image'],
          }),
        })
      )
    })
  })

  it('loads all catalog pages automatically and keeps dialog usable on query errors', async () => {
    const user = userEvent.setup()
    const endpointDetailFn = vi.fn(async (input: { modelId: string }) => ({
      providerKey: 'openrouter',
      modelId: input.modelId,
      fetchedAtMs: null,
      source: 'cache' as const,
      items: [],
      error: null,
    }))
    const queryFn = vi
      .fn(async (_input: CatalogQueryInput): Promise<CatalogQueryResult> => createResult([]))
      .mockImplementationOnce(async () =>
        createResult(
          [
            {
              providerKey: 'openrouter',
              modelId: 'openai/page-1',
              modelKey: 'openrouter::openai/page-1',
              canonicalSlug: 'openai/page-1',
              displayName: 'Page 1',
              description: null,
              vendor: 'openai',
              contextLength: 8192,
              maxOutputTokens: 4096,
              createdAtSec: 1700000123,
              pricing: { prompt: null, completion: null, request: null, image: null },
              capabilities: {
                reasoning: false,
                tools: false,
                structuredOutputs: false,
                vision: false,
                longContext: false,
              },
            },
          ],
          {
            sortBy: 'name',
            sortOrder: 'asc',
            name: 'Page 1',
            modelKey: 'openrouter::openai/page-1',
          },
        ),
      )
      .mockImplementationOnce(async () =>
        createResult([
          {
            providerKey: 'openrouter',
            modelId: 'openai/page-2',
            modelKey: 'openrouter::openai/page-2',
            canonicalSlug: 'openai/page-2',
            displayName: 'Page 2',
            description: null,
            vendor: 'openai',
            contextLength: 8192,
            maxOutputTokens: 4096,
            createdAtSec: 1700000123,
            pricing: { prompt: null, completion: null, request: null, image: null },
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
      .mockImplementation(async (input: CatalogQueryInput) => {
        if (input.searchText === 'broken') throw new Error('query failed')
        return createResult([])
      })

    const view = render(ModelPickerDialog, {
      props: {
        open: true,
        selectedProviderId: 'openrouter',
        selectedModelId: DEFAULT_OPENROUTER_TEST_MODEL,
        queryFn,
        endpointDetailFn,
        debounceMs: 300,
      },
    })

    await screen.findByTestId('model-picker-item-openai/page-1')
    await screen.findByTestId('model-picker-item-openai/page-2')
    expect(screen.queryByTestId('model-picker-load-more')).toBeNull()

    const search = screen.getByTestId('model-picker-search')
    await fireEvent.update(search, 'broken')
    await screen.findByText('query failed')

    await user.click(screen.getByTestId('model-picker-close'))
    expect(view.emitted().close).toBeTruthy()
  })

  it('maps grouped model-level filters into query payload', async () => {
    const user = userEvent.setup()
    const endpointDetailFn = vi.fn(async (input: { modelId: string }) => ({
      providerKey: 'openrouter',
      modelId: input.modelId,
      fetchedAtMs: null,
      source: 'cache' as const,
      items: [],
      error: null,
    }))
    const queryFn = vi.fn(async () =>
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
          maxOutputTokens: 8192,
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
      ]),
    )

    render(ModelPickerDialog, {
      props: {
        open: true,
        selectedProviderId: 'openrouter',
        selectedModelId: DEFAULT_OPENROUTER_TEST_MODEL,
        queryFn,
        endpointDetailFn,
        debounceMs: 0,
      },
    })

    await screen.findByTestId('model-picker-item-openai/gpt-4o')

    await user.type(screen.getByTestId('model-picker-search'), 'gpt')
    await user.click(screen.getByTestId('model-picker-vendor-openai'))
    await user.selectOptions(screen.getByTestId('model-picker-category'), 'science')

    await user.click(screen.getByText(t('errors.modelCatalog.capabilityLimits')))
    await fireEvent.update(screen.getByTestId('model-picker-context-min'), '4096')
    await fireEvent.update(screen.getByTestId('model-picker-context-max'), '200000')
    await fireEvent.update(screen.getByTestId('model-picker-max-output-min'), '1024')
    await fireEvent.update(screen.getByTestId('model-picker-max-output-max'), '8192')

    await user.click(screen.getByText(t('errors.modelCatalog.modalities')))
    await user.click(screen.getByTestId('model-picker-arch-text->image'))
    await user.click(screen.getByTestId('model-picker-input-modality-image'))
    await user.click(screen.getByTestId('model-picker-output-modality-text'))

    await user.click(screen.getByText(t('errors.modelCatalog.features')))
    await user.click(screen.getByTestId('model-picker-supported-tools'))
    await fireEvent.update(screen.getByTestId('model-picker-tokenizers'), 'gpt, sentencepiece')
    await fireEvent.update(screen.getByTestId('model-picker-instruct-types'), 'chatml')
    await user.selectOptions(screen.getByTestId('model-picker-per-request-limits'), 'yes')
    await user.selectOptions(screen.getByTestId('model-picker-default-parameters'), 'no')

    await user.click(screen.getByText(t('errors.modelCatalog.complianceLifecycle')))
    await user.selectOptions(screen.getByTestId('model-picker-is-moderated'), 'yes')
    await user.click(screen.getByTestId('model-picker-expiring-toggle'))
    await fireEvent.update(screen.getByTestId('model-picker-expiring-days'), '14')

    await user.click(screen.getByText(t('errors.modelCatalog.sort')))
    await user.selectOptions(screen.getByTestId('model-picker-sort-by'), 'context_length')
    await user.selectOptions(screen.getByTestId('model-picker-sort-order'), 'desc')

    await waitFor(() => {
      expect(queryFn).toHaveBeenLastCalledWith(
        expect.objectContaining({
          sourceProviderKey: 'openrouter',
          searchText: 'gpt',
          sort: { by: 'context_length', order: 'desc' },
          filter: expect.objectContaining({
            vendors: ['openai'],
            category: 'science',
            contextLength: { min: 4096, max: 200000 },
            maxOutputTokens: { min: 1024, max: 8192 },
            architectureModalities: ['text->image'],
            inputModalities: ['image'],
            outputModalities: ['text'],
            supportedParameters: ['tools'],
            tokenizers: ['gpt', 'sentencepiece'],
            instructTypes: ['chatml'],
            hasPerRequestLimits: true,
            hasDefaultParameters: false,
            topProviderIsModerated: true,
            expiringWithinDays: 14,
          }),
        }),
      )
    })
  })

  it('loads endpoint details only after opening endpoint tab and supports manual refresh', async () => {
    const user = userEvent.setup()
    const modelDetailFn = vi.fn(async () => ({
      providerKey: 'openrouter',
      modelId: 'openai/gpt-4o',
      error: null,
      item: {
        providerKey: 'openrouter',
        modelId: 'openai/gpt-4o',
        modelKey: 'openrouter::openai/gpt-4o',
        canonicalSlug: 'openai/gpt-4o',
        displayName: 'GPT-4o detail',
        description: 'omni detail',
        vendor: 'openai',
        family: 'gpt-4',
        status: 'active' as const,
        visibility: 'visible' as const,
        contextLength: 128000,
        maxOutputTokens: 4096,
        architectureModality: 'text->text',
        inputModalities: ['text'],
        outputModalities: ['text'],
        tokenizer: 'GPT',
        instructType: 'chatml',
        supportedParameters: ['temperature'],
        capabilities: {
          reasoning: true,
          tools: true,
          structuredOutputs: true,
          vision: false,
          longContext: true,
        },
        pricing: {
          prompt: '0.1',
          completion: '0.2',
          request: '0',
          image: '0',
          webSearch: null,
          internalReasoning: null,
          inputCacheRead: null,
          inputCacheWrite: null,
        },
        createdAtSec: 1700000123,
        expirationDate: null,
        expirationAtSec: null,
        unknownExpiration: false,
        hasPerRequestLimits: false,
        hasDefaultParameters: false,
        perRequestLimits: null,
        defaultParameters: null,
        topProviderContextLength: 128000,
        topProviderIsModerated: true,
        firstSeenAtMs: 1700000000000,
        lastSeenAtMs: 1700000000100,
        syncedAtMs: 1700000000200,
        raw: {
          inputModalitiesJson: '["text"]',
          outputModalitiesJson: '["text"]',
          supportedParametersJson: '["temperature"]',
          capabilitiesJson: '{}',
          pricingJson: null,
          perRequestLimitsJson: null,
          defaultParametersJson: null,
          rawJson: '{"id":"openai/gpt-4o"}',
        },
      },
    }))
    const endpointDetailFn = vi.fn(async (input: { modelId: string; forceRefresh?: boolean }) => ({
      providerKey: 'openrouter',
      modelId: input.modelId,
      fetchedAtMs: 1700000000000,
      source: input.forceRefresh ? ('network' as const) : ('cache' as const),
      items: [
        {
          endpointKey: `${input.modelId}::openai::fp16::OpenAI`,
          providerName: 'OpenAI',
          tag: 'openai',
          quantization: 'fp16',
          contextLength: 8192,
          maxCompletionTokens: 4096,
          maxPromptTokens: 8192,
          supportedParameters: ['temperature'],
          supportsImplicitCaching: true,
          status: 0,
          uptimeLast30m: 99.5,
          latencyLast30m: { p50: 0.25 },
          throughputLast30m: { p50: 42 },
          rawJson: null,
        },
      ],
      error: null,
    }))
    const queryFn = vi.fn(async () =>
      createResult([
        {
          providerKey: 'openrouter',
          modelId: 'openai/gpt-4o',
          modelKey: 'openrouter::openai/gpt-4o',
          canonicalSlug: 'openai/gpt-4o',
          displayName: 'GPT-4o',
          description: 'omni',
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
      ]),
    )

    render(ModelPickerDialog, {
      props: {
        open: true,
        selectedProviderId: 'openrouter',
        selectedModelId: 'openai/gpt-4o',
        queryFn,
        endpointDetailFn,
        modelDetailFn,
        debounceMs: 0,
      },
    })

    await screen.findByTestId('model-picker-item-openai/gpt-4o')
    await waitFor(() => {
      expect(screen.getByTestId('model-detail-basic').textContent).toContain('GPT-4o detail')
    })
    expect(endpointDetailFn).not.toHaveBeenCalled()

    await user.click(screen.getByTestId('model-picker-detail-tab-endpoints'))
    await waitFor(() => {
      expect(endpointDetailFn).toHaveBeenCalledWith(
        expect.objectContaining({ modelId: 'openai/gpt-4o', forceRefresh: false }),
      )
    })
    expect(endpointDetailFn).toHaveBeenCalledTimes(1)

    await user.click(screen.getByTestId('model-picker-detail-tab-model'))
    await user.click(screen.getByTestId('model-picker-detail-tab-endpoints'))
    await waitFor(() => {
      expect(endpointDetailFn).toHaveBeenCalledTimes(1)
    })

    await user.click(screen.getByTestId('endpoint-detail-refresh'))
    await waitFor(() => {
      expect(endpointDetailFn).toHaveBeenCalledWith(
        expect.objectContaining({ modelId: 'openai/gpt-4o', forceRefresh: true }),
      )
    })
    expect(endpointDetailFn).toHaveBeenCalledTimes(2)
  })

  it('shows synced status with total, visible, and hidden model counts when metadata has direct counts', async () => {
    const now = Date.now()
    ;(globalThis as any).electronAPI = {
      modelCatalogSyncNow: vi.fn(async () => ({
        ok: true,
        syncAttempted: true,
        syncSucceeded: true,
        providerKey: 'openrouter',
        modelCount: 150,
        visibleModelCount: 140,
        hiddenModelCount: 10,
        lastSyncAtMs: now,
        errorCode: null,
        errorMessage: null,
      })),
      modelCatalogGetSyncStatus: vi.fn(async () => ({
        providerKey: 'openrouter',
        syncState: 'ok',
        lastSyncAtMs: now,
        modelCount: 150,
        visibleModelCount: 140,
        hiddenModelCount: 10,
        lastErrorCode: null,
        lastErrorMessage: null,
      })),
    }
    const queryFn = vi.fn(async () => createResult([], null, {
      status: 'synced', catalogRevision: 'rev-counts', modelCount: 150,
      visibleModelCount: 140, hiddenModelCount: 10, lastSyncAtMs: now,
    }))

    render(ModelPickerDialog, {
      props: {
        open: true,
        selectedProviderId: 'openrouter',
        selectedModelId: DEFAULT_OPENROUTER_TEST_MODEL,
        queryFn,
        debounceMs: 0,
      },
    })

    await waitFor(() => {
      expect(screen.getByText(/已同步/)).toBeTruthy()
      const statusBar = screen.getByTestId('model-picker-sync-refresh').closest('[class*="border-t"]')
      expect(statusBar?.textContent).toContain('150')
      expect(statusBar?.textContent).toContain('140')
      expect(statusBar?.textContent).toContain('10')
      expect(statusBar?.textContent).toContain('显示')
      expect(statusBar?.textContent).toContain('隐藏')
    })
  })

  it('shows direct hidden zero and keeps OpenRouter provider count on synced total instead of visible page size', async () => {
    const now = Date.now()
    ;(globalThis as any).electronAPI = {
      modelCatalogSyncNow: vi.fn(async () => ({
        ok: true,
        syncAttempted: true,
        syncSucceeded: true,
        providerKey: 'openrouter',
        modelCount: 338,
        visibleModelCount: 338,
        hiddenModelCount: 0,
        lastSyncAtMs: now,
        errorCode: null,
        errorMessage: null,
      })),
      modelCatalogGetSyncStatus: vi.fn(async () => ({
        providerKey: 'openrouter',
        syncState: 'ok',
        lastSyncAtMs: now,
        modelCount: 338,
        visibleModelCount: 338,
        hiddenModelCount: 0,
        lastErrorCode: null,
        lastErrorMessage: null,
      })),
    }
    const queryFn = vi.fn(async () => createResult([
      {
        providerKey: 'openrouter',
        modelId: 'openai/page-1',
        modelKey: 'openrouter::openai/page-1',
        canonicalSlug: 'openai/page-1',
        displayName: 'Page 1',
        description: null,
        vendor: 'openai',
        contextLength: 8192,
        maxOutputTokens: 4096,
        createdAtSec: 1700000123,
        pricing: { prompt: null, completion: null, request: null, image: null },
        capabilities: {
          reasoning: false,
          tools: false,
          structuredOutputs: false,
          vision: false,
          longContext: false,
        },
      },
    ], null, { catalogRevision: 'rev-counts', modelCount: 338, visibleModelCount: 338, hiddenModelCount: 0, lastSyncAtMs: now }))

    render(ModelPickerDialog, {
      props: {
        open: true,
        selectedProviderId: 'openrouter',
        selectedModelId: DEFAULT_OPENROUTER_TEST_MODEL,
        queryFn,
        debounceMs: 0,
      },
    })

    await waitFor(() => {
      const statusBar = screen.getByTestId('model-picker-sync-refresh').closest('[class*="border-t"]')
      expect(statusBar?.textContent).toContain('已同步')
      expect(statusBar?.textContent).toContain('338')
      expect(statusBar?.textContent).toContain('隐藏 0')
      expect(screen.getByTestId('model-picker-provider-status-openrouter').textContent).toContain(tf('errors.modelCatalog.shownCount', { shownCount: 1, totalCount: 338 }))
    })
    expect(screen.getByTestId('model-picker-provider-status-openrouter').textContent).toContain(tf('errors.modelCatalog.shownCount', { shownCount: 1, totalCount: 338 }))
  })

  it('uses catalog sync status for non-active provider counts', async () => {
    const now = Date.now()
    const counts: Record<string, number> = {
      openrouter: 340,
      openai_responses: 2,
      google_ai_studio: 39,
      anthropic_messages: 9,
      deepseek: 4,
    }
    ;(globalThis as any).electronAPI = {
      modelCatalogSyncNow: vi.fn(async () => ({
        ok: true,
        syncAttempted: false,
        syncSucceeded: true,
        providerKey: 'openrouter',
        modelCount: counts.openrouter,
        visibleModelCount: counts.openrouter,
        hiddenModelCount: 0,
        lastSyncAtMs: now,
        errorCode: null,
        errorMessage: null,
      })),
      modelCatalogGetSyncStatus: vi.fn(async (options: any) => {
        const providerKey = String(options?.providerKey ?? 'openrouter')
        const count = counts[providerKey] ?? 0
        return {
          providerKey,
          syncState: 'ok',
          lastSyncAtMs: now,
          modelCount: count,
          visibleModelCount: count,
          hiddenModelCount: 0,
          lastErrorCode: null,
          lastErrorMessage: null,
        }
      }),
    }
    const queryFn = vi.fn(async (input: CatalogQueryInput) => {
      const providerKey = String(input.sourceProviderKey ?? input.providerKey ?? 'openrouter')
      return createResult([
        {
          providerKey,
          modelId: `${providerKey}/page-1`,
          modelKey: `${providerKey}::${providerKey}/page-1`,
          canonicalSlug: `${providerKey}/page-1`,
          displayName: `${providerKey} Page 1`,
          description: null,
          vendor: providerKey,
          contextLength: 8192,
          maxOutputTokens: 4096,
          createdAtSec: 1700000123,
          pricing: { prompt: null, completion: null, request: null, image: null },
          capabilities: {
            reasoning: false,
            tools: false,
            structuredOutputs: false,
            vision: false,
            longContext: false,
          },
        },
      ], null, {
        catalogRevision: `rev-counts-${providerKey}`,
        modelCount: counts[providerKey] ?? 0,
        visibleModelCount: counts[providerKey] ?? 0,
        hiddenModelCount: 0,
        lastSyncAtMs: now,
      })
    })

    render(ModelPickerDialog, {
      props: {
        open: true,
        selectedProviderId: 'openrouter',
        selectedModelId: DEFAULT_OPENROUTER_TEST_MODEL,
        queryFn,
        debounceMs: 0,
        providerSources: [
          { providerId: 'openai_responses', providerName: 'OpenAI Responses', statusKind: 'not_loaded', statusLabel: 'catalog', loading: false, items: [] },
          { providerId: 'google_ai_studio', providerName: 'Google AI Studio', statusKind: 'not_loaded', statusLabel: 'catalog', loading: false, items: [] },
          { providerId: 'anthropic_messages', providerName: 'Anthropic Messages', statusKind: 'not_loaded', statusLabel: 'catalog', loading: false, items: [] },
          { providerId: 'deepseek', providerName: 'DeepSeek', statusKind: 'not_loaded', statusLabel: 'catalog', loading: false, items: [] },
        ],
      },
    })

    await waitFor(() => {
      expect(screen.getByTestId('model-picker-provider-status-openrouter').textContent).toContain(tf('errors.modelCatalog.shownCount', { shownCount: 1, totalCount: 340 }))
      expect(screen.getByTestId('model-picker-provider-status-openai_responses').textContent).toContain(tf('errors.modelCatalog.shownCount', { shownCount: 1, totalCount: 2 }))
      expect(screen.getByTestId('model-picker-provider-status-google_ai_studio').textContent).toContain(tf('errors.modelCatalog.shownCount', { shownCount: 1, totalCount: 39 }))
      expect(screen.getByTestId('model-picker-provider-status-anthropic_messages').textContent).toContain(tf('errors.modelCatalog.shownCount', { shownCount: 1, totalCount: 9 }))
      expect(screen.getByTestId('model-picker-provider-status-deepseek').textContent).toContain(tf('errors.modelCatalog.shownCount', { shownCount: 1, totalCount: 4 }))
    })

    expect(screen.getByTestId('model-picker-provider-status-openai_responses').textContent).toContain(tf('errors.modelCatalog.shownCount', { shownCount: 1, totalCount: 2 }))
    expect(screen.getByTestId('model-picker-provider-status-google_ai_studio').textContent).toContain(tf('errors.modelCatalog.shownCount', { shownCount: 1, totalCount: 39 }))
    expect(screen.getByTestId('model-picker-provider-status-anthropic_messages').textContent).toContain(tf('errors.modelCatalog.shownCount', { shownCount: 1, totalCount: 9 }))
    expect(screen.getByTestId('model-picker-provider-status-deepseek').textContent).toContain(tf('errors.modelCatalog.shownCount', { shownCount: 1, totalCount: 4 }))
  })

  it('shows failed status with error reason', async () => {
    ;(globalThis as any).electronAPI = {
      modelCatalogSyncNow: vi.fn(async () => ({
        ok: false,
        syncAttempted: true,
        syncSucceeded: false,
        providerKey: 'openrouter',
        modelCount: 0,
        lastSyncAtMs: Date.now(),
        errorCode: 'invalid_api_key',
        errorMessage: 'API Key 无效',
      })),
      modelCatalogGetSyncStatus: vi.fn(async () => ({
        providerKey: 'openrouter',
        syncState: 'error',
        lastSyncAtMs: 0,
        modelCount: 0,
        lastErrorCode: 'invalid_api_key',
        lastErrorMessage: 'API Key 无效',
      })),
    }
    const queryFn = vi.fn(async () => createResult([], null, {
      status: 'failed', modelCount: 0, lastSyncAtMs: Date.now(),
      errorCode: 'invalid_api_key', errorMessage: 'API Key 无效',
    }))

    render(ModelPickerDialog, {
      props: {
        open: true,
        selectedProviderId: 'openrouter',
        selectedModelId: DEFAULT_OPENROUTER_TEST_MODEL,
        queryFn,
        debounceMs: 0,
      },
    })

    await waitFor(() => {
      expect(screen.getByText('同步失败：API Key 无效')).toBeTruthy()
    })
  })

  it('does not show cache or fallback text in sync status', async () => {
    ;(globalThis as any).electronAPI = {
      modelCatalogSyncNow: vi.fn(async () => ({
        ok: false,
        syncAttempted: true,
        syncSucceeded: false,
        providerKey: 'openrouter',
        modelCount: 50,
        lastSyncAtMs: Date.now(),
        errorCode: 'network_unreachable',
        errorMessage: '网络不可达',
      })),
      modelCatalogGetSyncStatus: vi.fn(async () => ({
        providerKey: 'openrouter',
        syncState: 'error',
        lastSyncAtMs: Date.now(),
        modelCount: 50,
        lastErrorCode: 'network_unreachable',
        lastErrorMessage: '网络不可达',
      })),
    }
    const queryFn = vi.fn(async () => createResult([]))

    render(ModelPickerDialog, {
      props: {
        open: true,
        selectedProviderId: 'openrouter',
        selectedModelId: DEFAULT_OPENROUTER_TEST_MODEL,
        queryFn,
        debounceMs: 0,
      },
    })

    await waitFor(() => {
      const syncRefresh = screen.getByTestId('model-picker-sync-refresh')
      expect(syncRefresh).toBeTruthy()
    })

    const statusBar = screen.getByTestId('model-picker-sync-refresh').closest('[class*="border-t"]')
    expect(statusBar).toBeTruthy()
    const text = statusBar!.textContent!.toLowerCase()
    expect(text).not.toContain('缓存')
    expect(text).not.toContain('cache')
    expect(text).not.toContain('fallback')
  })

  it('manual refresh button triggers a new V2 catalog authority query', async () => {
    const user = userEvent.setup()
    const queryFn = vi.fn(async () => createResult([]))

    render(ModelPickerDialog, {
      props: {
        open: true,
        selectedProviderId: 'openrouter',
        selectedModelId: DEFAULT_OPENROUTER_TEST_MODEL,
        queryFn,
        debounceMs: 0,
      },
    })

    await waitFor(() => {
      expect(screen.getByTestId('model-picker-sync-refresh')).toBeTruthy()
    })

    const callsBeforeRefresh = queryFn.mock.calls.length
    await user.click(screen.getByTestId('model-picker-sync-refresh'))

    await waitFor(() => {
      expect(queryFn.mock.calls.length).toBeGreaterThan(callsBeforeRefresh)
      expect(queryFn).toHaveBeenLastCalledWith(expect.objectContaining({
        sourceProviderKey: 'openrouter',
      }))
    })
  })

  it('auto-sync cache-fresh returns ok=true shows synced not failed', async () => {
    const now = Date.now()
    ;(globalThis as any).electronAPI = {
      modelCatalogSyncNow: vi.fn(async () => ({
        ok: true,
        syncAttempted: false,
        syncSucceeded: true,
        providerKey: 'openrouter',
        modelCount: 200,
        lastSyncAtMs: now,
        errorCode: null,
        errorMessage: null,
      })),
      modelCatalogGetSyncStatus: vi.fn(async () => ({
        providerKey: 'openrouter',
        syncState: 'ok',
        lastSyncAtMs: now,
        modelCount: 200,
        lastErrorCode: null,
        lastErrorMessage: null,
      })),
    }
    const queryFn = vi.fn(async () => createResult([]))

    render(ModelPickerDialog, {
      props: {
        open: true,
        selectedProviderId: 'openrouter',
        selectedModelId: DEFAULT_OPENROUTER_TEST_MODEL,
        queryFn,
        debounceMs: 0,
      },
    })

    await waitFor(() => {
      expect(screen.getByTestId('model-picker-sync-refresh')).toBeTruthy()
    })

    const statusBar = screen.getByTestId('model-picker-sync-refresh').closest('[class*="border-t"]')
    expect(statusBar).toBeTruthy()
    const text = statusBar!.textContent!.toLowerCase()
    expect(text).not.toContain('失败')
    expect(text).not.toContain('failed')
    expect(text).not.toContain('缓存')
    expect(text).not.toContain('cache')
  })

  it('restores synced status from the authoritative V2 catalog result on open', async () => {
    const now = Date.now()
    const getSyncStatus = vi.fn(async () => ({
      providerKey: 'openrouter',
      syncState: 'ok',
      lastSyncAtMs: now,
      modelCount: 300,
      lastErrorCode: null,
      lastErrorMessage: null,
    }))
    ;(globalThis as any).electronAPI = {
      modelCatalogSyncNow: vi.fn(async () => ({
        ok: true,
        syncAttempted: false,
        syncSucceeded: true,
        providerKey: 'openrouter',
        modelCount: 300,
        lastSyncAtMs: now,
        errorCode: null,
        errorMessage: null,
      })),
      modelCatalogGetSyncStatus: getSyncStatus,
    }
    const queryFn = vi.fn(async () => createResult([], null, {
      status: 'synced', catalogRevision: 'rev-open', modelCount: 300, lastSyncAtMs: now,
    }))

    render(ModelPickerDialog, {
      props: {
        open: true,
        selectedProviderId: 'openrouter',
        selectedModelId: DEFAULT_OPENROUTER_TEST_MODEL,
        queryFn,
        debounceMs: 0,
      },
    })

    await waitFor(() => {
      expect(screen.getByText(/已同步/)).toBeTruthy()
      const statusBar = screen.getByTestId('model-picker-sync-refresh').closest('[class*="border-t"]')
      expect(statusBar?.textContent).toContain('300')
      expect(statusBar?.textContent).not.toContain('显示')
      expect(statusBar?.textContent).not.toContain('隐藏')
    })
  })

  it('syncState=ok with lastErrorCode residue still shows synced', async () => {
    const now = Date.now()
    ;(globalThis as any).electronAPI = {
      modelCatalogSyncNow: vi.fn(async () => ({
        ok: true,
        syncAttempted: false,
        syncSucceeded: true,
        providerKey: 'openrouter',
        modelCount: 50,
        lastSyncAtMs: now,
        errorCode: null,
        errorMessage: null,
      })),
      modelCatalogGetSyncStatus: vi.fn(async () => ({
        providerKey: 'openrouter',
        syncState: 'ok',
        lastSyncAtMs: now,
        modelCount: 50,
        lastErrorCode: 'network_unreachable',
        lastErrorMessage: 'stale error from previous failed sync',
      })),
    }
    const queryFn = vi.fn(async () => createResult([]))

    render(ModelPickerDialog, {
      props: {
        open: true,
        selectedProviderId: 'openrouter',
        selectedModelId: DEFAULT_OPENROUTER_TEST_MODEL,
        queryFn,
        debounceMs: 0,
      },
    })

    await waitFor(() => {
      expect(screen.getByTestId('model-picker-sync-refresh')).toBeTruthy()
    })

    const statusBar = screen.getByTestId('model-picker-sync-refresh').closest('[class*="border-t"]')
    expect(statusBar).toBeTruthy()
    const text = statusBar!.textContent!.toLowerCase()
    expect(text).not.toContain('失败')
    expect(text).not.toContain('failed')
  })

  it('stale-on-open policy performs one additional V2 provider-scoped query', async () => {
    const syncNow = vi.fn(async () => ({
      ok: true,
      syncAttempted: true,
      syncSucceeded: true,
      providerKey: 'openrouter',
      modelCount: 100,
      lastSyncAtMs: Date.now(),
      errorCode: null,
      errorMessage: null,
    }))
    ;(globalThis as any).electronAPI = {
      modelCatalogSyncNow: syncNow,
      modelCatalogGetSyncStatus: vi.fn(async () => ({
        providerKey: 'openrouter',
        syncState: 'idle',
        lastSyncAtMs: 0,
        modelCount: 0,
        lastErrorCode: null,
        lastErrorMessage: null,
      })),
    }
    const queryFn = vi.fn(async () => createResult([], null, {
      status: 'synced', catalogRevision: 'rev-stale', modelCount: 0, lastSyncAtMs: 1,
    }))

    render(ModelPickerDialog, {
      props: {
        open: true,
        selectedProviderId: 'openrouter',
        selectedModelId: DEFAULT_OPENROUTER_TEST_MODEL,
        queryFn,
        debounceMs: 0,
      },
    })

    await waitFor(() => {
      expect(queryFn.mock.calls.length).toBeGreaterThanOrEqual(2)
      expect(queryFn).toHaveBeenLastCalledWith(expect.objectContaining({ sourceProviderKey: 'openrouter' }))
    })
  })

  it('picker open policy never does not trigger automatic sync', async () => {
    setCatalogSettings({ openRouterCatalogPickerOpenSyncPolicy: 'never' })
    const syncNow = vi.fn(async () => ({
      ok: true,
      syncAttempted: true,
      syncSucceeded: true,
      providerKey: 'openrouter',
      modelCount: 100,
      lastSyncAtMs: Date.now(),
      errorCode: null,
      errorMessage: null,
    }))
    ;(globalThis as any).electronAPI = {
      modelCatalogSyncNow: syncNow,
      modelCatalogGetSyncStatus: vi.fn(async () => ({
        providerKey: 'openrouter',
        syncState: 'idle',
        status: 'not_synced',
        lastSyncAtMs: 0,
        modelCount: 0,
        lastErrorCode: null,
        lastErrorMessage: null,
        isStale: true,
      })),
    }

    render(ModelPickerDialog, {
      props: {
        open: true,
        selectedProviderId: 'openrouter',
        selectedModelId: DEFAULT_OPENROUTER_TEST_MODEL,
        queryFn: vi.fn(async () => createResult([])),
        debounceMs: 0,
      },
    })

    await waitFor(() => {
      expect(screen.getByTestId('model-picker-sync-refresh')).toBeTruthy()
    })
    expect(syncNow).not.toHaveBeenCalled()
  })

  it('picker open stale_only skips sync when current scope is fresh', async () => {
    setCatalogSettings({ openRouterCatalogPickerOpenSyncPolicy: 'stale_only' })
    const syncNow = vi.fn(async () => ({
      ok: true,
      syncAttempted: true,
      syncSucceeded: true,
      providerKey: 'openrouter',
      modelCount: 100,
      lastSyncAtMs: Date.now(),
      errorCode: null,
      errorMessage: null,
    }))
    ;(globalThis as any).electronAPI = {
      modelCatalogSyncNow: syncNow,
      modelCatalogGetSyncStatus: vi.fn(async () => ({
        providerKey: 'openrouter',
        syncState: 'ok',
        status: 'synced',
        lastSyncAtMs: Date.now(),
        modelCount: 100,
        lastErrorCode: null,
        lastErrorMessage: null,
        isStale: false,
        catalogRevision: 'rev-fresh',
      })),
    }

    render(ModelPickerDialog, {
      props: {
        open: true,
        selectedProviderId: 'openrouter',
        selectedModelId: DEFAULT_OPENROUTER_TEST_MODEL,
        queryFn: vi.fn(async () => createResult([], null, { catalogRevision: 'rev-fresh' })),
        debounceMs: 0,
      },
    })

    await waitFor(() => {
      expect(screen.getByTestId('model-picker-sync-refresh')).toBeTruthy()
    })
    expect(syncNow).not.toHaveBeenCalled()
  })

  it('picker open policy always performs a fresh V2 catalog query', async () => {
    setCatalogSettings({ openRouterCatalogPickerOpenSyncPolicy: 'always' })
    const syncNow = vi.fn(async () => ({
      ok: true,
      syncAttempted: false,
      syncSucceeded: true,
      providerKey: 'openrouter',
      modelCount: 100,
      lastSyncAtMs: Date.now(),
      errorCode: null,
      errorMessage: null,
      catalogRevision: 'rev-fresh',
    }))
    ;(globalThis as any).electronAPI = {
      modelCatalogSyncNow: syncNow,
      modelCatalogGetSyncStatus: vi.fn(async () => ({
        providerKey: 'openrouter',
        syncState: 'ok',
        status: 'synced',
        lastSyncAtMs: Date.now(),
        modelCount: 100,
        lastErrorCode: null,
        lastErrorMessage: null,
        isStale: false,
        catalogRevision: 'rev-fresh',
      })),
    }

    const queryFn = vi.fn(async () => createResult([], null, {
      status: 'synced', catalogRevision: 'rev-fresh', modelCount: 100, lastSyncAtMs: Date.now(),
    }))
    render(ModelPickerDialog, {
      props: {
        open: true,
        selectedProviderId: 'openrouter',
        selectedModelId: DEFAULT_OPENROUTER_TEST_MODEL,
        queryFn,
        debounceMs: 0,
      },
    })

    await waitFor(() => {
      expect(queryFn.mock.calls.length).toBeGreaterThanOrEqual(2)
      expect(queryFn).toHaveBeenLastCalledWith(expect.objectContaining({ sourceProviderKey: 'openrouter' }))
    })
  })

  it('manual refresh applies changed catalog list immediately', async () => {
    setCatalogSettings({
      openRouterCatalogPickerOpenSyncPolicy: 'never',
      openRouterCatalogListUpdateMode: 'manual',
    })
    const user = userEvent.setup()
    const oldModel = {
      providerKey: 'openrouter',
      modelId: 'openai/old',
      modelKey: 'openrouter::openai/old',
      canonicalSlug: 'openai/old',
      displayName: 'Old Model',
      description: null,
      vendor: 'openai',
      contextLength: 8192,
      maxOutputTokens: 4096,
      createdAtSec: 1,
      pricing: { prompt: null, completion: null, request: null, image: null },
      capabilities: { reasoning: false, tools: false, structuredOutputs: false, vision: false, longContext: false },
    }
    const newModel = { ...oldModel, modelId: 'openai/new', modelKey: 'openrouter::openai/new', displayName: 'New Model' }
    const queryFn = vi
      .fn()
      .mockResolvedValueOnce(createResult([oldModel], null, { catalogRevision: 'rev-old', modelCount: 1, lastSyncAtMs: 100 }))
      .mockResolvedValueOnce(createResult([newModel], null, { catalogRevision: 'rev-new', modelCount: 1, lastSyncAtMs: 200 }))
      .mockResolvedValue(createResult([newModel], null, { catalogRevision: 'rev-new', modelCount: 1, lastSyncAtMs: 200 }))
    const syncNow = vi.fn(async () => ({
      ok: true,
      syncAttempted: true,
      syncSucceeded: true,
      providerKey: 'openrouter',
      modelCount: 1,
      lastSyncAtMs: 200,
      errorCode: null,
      errorMessage: null,
      catalogRevision: 'rev-new',
    }))
    ;(globalThis as any).electronAPI = {
      modelCatalogSyncNow: syncNow,
      modelCatalogGetSyncStatus: vi.fn(async () => ({
        providerKey: 'openrouter',
        syncState: 'ok',
        status: 'synced',
        lastSyncAtMs: 100,
        modelCount: 1,
        lastErrorCode: null,
        lastErrorMessage: null,
        isStale: false,
        catalogRevision: 'rev-old',
      })),
    }

    render(ModelPickerDialog, {
      props: {
        open: true,
        selectedProviderId: 'openrouter',
        selectedModelId: 'openai/old',
        queryFn,
        debounceMs: 100000,
      },
    })

    await screen.findByTestId('model-picker-item-openai/old')
    await user.click(screen.getByTestId('model-picker-sync-refresh'))

    await screen.findByTestId('model-picker-item-openai/new')
    expect(screen.queryByTestId('model-picker-update-available')).toBeNull()
    expect(queryFn).toHaveBeenCalledTimes(3)
  })

  it('automatic update mode applies changed list and preserves search text without auto-selecting first item', async () => {
    setCatalogSettings({
      openRouterCatalogPickerOpenSyncPolicy: 'never',
      openRouterCatalogListUpdateMode: 'automatic',
    })
    const user = userEvent.setup()
    const oldModel = {
      providerKey: 'openrouter',
      modelId: 'openai/old',
      modelKey: 'openrouter::openai/old',
      canonicalSlug: 'openai/old',
      displayName: 'Old Model',
      description: null,
      vendor: 'openai',
      contextLength: 8192,
      maxOutputTokens: 4096,
      createdAtSec: 1,
      pricing: { prompt: null, completion: null, request: null, image: null },
      capabilities: { reasoning: false, tools: false, structuredOutputs: false, vision: false, longContext: false },
    }
    const newModel = { ...oldModel, modelId: 'openai/new', modelKey: 'openrouter::openai/new', displayName: 'New Model' }
    const queryFn = vi
      .fn()
      .mockResolvedValueOnce(createResult([oldModel], null, { catalogRevision: 'rev-old', modelCount: 1, lastSyncAtMs: 100 }))
      .mockResolvedValueOnce(createResult([newModel], null, { catalogRevision: 'rev-new', modelCount: 1, lastSyncAtMs: 200 }))
      .mockResolvedValue(createResult([newModel], null, { catalogRevision: 'rev-new', modelCount: 1, lastSyncAtMs: 200 }))
    ;(globalThis as any).electronAPI = {
      modelCatalogSyncNow: vi.fn(async () => ({
        ok: true,
        syncAttempted: true,
        syncSucceeded: true,
        providerKey: 'openrouter',
        modelCount: 1,
        lastSyncAtMs: 200,
        errorCode: null,
        errorMessage: null,
        catalogRevision: 'rev-new',
      })),
      modelCatalogGetSyncStatus: vi.fn(async () => ({
        providerKey: 'openrouter',
        syncState: 'ok',
        status: 'synced',
        lastSyncAtMs: 100,
        modelCount: 1,
        lastErrorCode: null,
        lastErrorMessage: null,
        isStale: false,
        catalogRevision: 'rev-old',
      })),
    }

    render(ModelPickerDialog, {
      props: {
        open: true,
        selectedProviderId: 'openrouter',
        selectedModelId: 'openai/old',
        queryFn,
        debounceMs: 100000,
      },
    })

    await screen.findByTestId('model-picker-item-openai/old')
    const search = screen.getByTestId('model-picker-search') as HTMLInputElement
    await user.type(search, 'vision')
    await user.click(screen.getByTestId('model-picker-sync-refresh'))

    await screen.findByTestId('model-picker-item-openai/new')
    expect(search.value).toBe('vision')
    expect(screen.queryByTestId('model-picker-update-available')).toBeNull()
    expect(screen.getByTestId('model-picker-item-openai/new').className).not.toContain('border-blue-300')
  })

  it('unchanged sync result updates status without resetting current list', async () => {
    setCatalogSettings({
      openRouterCatalogPickerOpenSyncPolicy: 'never',
      openRouterCatalogListUpdateMode: 'manual',
    })
    const user = userEvent.setup()
    const model = {
      providerKey: 'openrouter',
      modelId: 'openai/stable',
      modelKey: 'openrouter::openai/stable',
      canonicalSlug: 'openai/stable',
      displayName: 'Stable Model',
      description: null,
      vendor: 'openai',
      contextLength: 8192,
      maxOutputTokens: 4096,
      createdAtSec: 1,
      pricing: { prompt: null, completion: null, request: null, image: null },
      capabilities: { reasoning: false, tools: false, structuredOutputs: false, vision: false, longContext: false },
    }
    const queryFn = vi.fn(async () => createResult([model], null, { catalogRevision: 'rev-stable', modelCount: 1, lastSyncAtMs: 100 }))
    ;(globalThis as any).electronAPI = {
      modelCatalogSyncNow: vi.fn(async () => ({
        ok: true,
        syncAttempted: true,
        syncSucceeded: true,
        providerKey: 'openrouter',
        modelCount: 1,
        lastSyncAtMs: 200,
        errorCode: null,
        errorMessage: null,
        catalogRevision: 'rev-stable',
      })),
      modelCatalogGetSyncStatus: vi.fn(async () => ({
        providerKey: 'openrouter',
        syncState: 'ok',
        status: 'synced',
        lastSyncAtMs: 100,
        modelCount: 1,
        lastErrorCode: null,
        lastErrorMessage: null,
        isStale: false,
        catalogRevision: 'rev-stable',
      })),
    }

    render(ModelPickerDialog, {
      props: {
        open: true,
        selectedProviderId: 'openrouter',
        selectedModelId: 'openai/stable',
        queryFn,
        debounceMs: 0,
      },
    })

    await screen.findByTestId('model-picker-item-openai/stable')
    await user.click(screen.getByTestId('model-picker-sync-refresh'))

    await waitFor(() => {
      expect(screen.getByText(/已同步/)).toBeTruthy()
    })
    expect(queryFn).toHaveBeenCalledTimes(2)
    expect(screen.queryByTestId('model-picker-update-available')).toBeNull()
    expect(screen.getByTestId('model-picker-item-openai/stable')).toBeTruthy()
  })
})

