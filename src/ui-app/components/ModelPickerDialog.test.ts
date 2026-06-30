import { fireEvent, render, screen, waitFor } from '@testing-library/vue'
import userEvent from '@testing-library/user-event'
import { afterEach, describe, expect, it, vi } from 'vitest'
import type { CatalogQueryInput, CatalogQueryResult } from '@/next/modelCatalog/catalogQueryService'
import { DEFAULT_OPENROUTER_TEST_MODEL } from '@/next/openrouter/openRouterTestModels'
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

  afterEach(() => {
    vi.restoreAllMocks()
    ;(globalThis as any).dbBridge = originalDbBridge
    ;(globalThis as any).electronStore = originalElectronStore
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

  it('uses scoped current query API as the default model list source', async () => {
    const scopedQuery = vi.fn(async () => ({
      providerKey: 'openrouter',
      status: 'synced',
      syncState: 'ok',
      failureReasonCode: null,
      items: [
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
      ],
      nextCursor: null,
    }))
    const legacyInvoke = vi.fn(async () => {
      throw new Error('legacy modelCatalog query should not be called')
    })
    ;(globalThis as any).dbBridge = { invoke: legacyInvoke }
    ;(globalThis as any).electronAPI = {
      modelCatalogQueryScopedCurrent: scopedQuery,
      modelCatalogSyncNow: vi.fn(async () => ({
        ok: true,
        syncAttempted: false,
        syncSucceeded: true,
        providerKey: 'openrouter',
        modelCount: 1,
        lastSyncAtMs: Date.now(),
        errorCode: null,
        errorMessage: null,
      })),
      modelCatalogGetSyncStatus: vi.fn(async () => ({
        providerKey: 'openrouter',
        syncState: 'ok',
        lastSyncAtMs: Date.now(),
        modelCount: 1,
        lastErrorCode: null,
        lastErrorMessage: null,
      })),
    }

    render(ModelPickerDialog, {
      props: {
        open: true,
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
      providerKey: 'openrouter',
      limit: 60,
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

  it('supports pagination via load more and keeps dialog usable on query errors', async () => {
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
      .mockImplementationOnce(async () => {
        throw new Error('query failed')
      })

    const view = render(ModelPickerDialog, {
      props: {
        open: true,
        selectedModelId: DEFAULT_OPENROUTER_TEST_MODEL,
        queryFn,
        endpointDetailFn,
        debounceMs: 300,
      },
    })

    await screen.findByTestId('model-picker-item-openai/page-1')

    await user.click(screen.getByTestId('model-picker-load-more'))
    await screen.findByTestId('model-picker-item-openai/page-2')

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

    await user.click(screen.getByText('Capability Limits'))
    await fireEvent.update(screen.getByTestId('model-picker-context-min'), '4096')
    await fireEvent.update(screen.getByTestId('model-picker-context-max'), '200000')
    await fireEvent.update(screen.getByTestId('model-picker-max-output-min'), '1024')
    await fireEvent.update(screen.getByTestId('model-picker-max-output-max'), '8192')

    await user.click(screen.getByText('Modalities'))
    await user.click(screen.getByTestId('model-picker-arch-text->image'))
    await user.click(screen.getByTestId('model-picker-input-modality-image'))
    await user.click(screen.getByTestId('model-picker-output-modality-text'))

    await user.click(screen.getByText('Features'))
    await user.click(screen.getByTestId('model-picker-supported-tools'))
    await fireEvent.update(screen.getByTestId('model-picker-tokenizers'), 'gpt, sentencepiece')
    await fireEvent.update(screen.getByTestId('model-picker-instruct-types'), 'chatml')
    await user.selectOptions(screen.getByTestId('model-picker-per-request-limits'), 'yes')
    await user.selectOptions(screen.getByTestId('model-picker-default-parameters'), 'no')

    await user.click(screen.getByText('Compliance & Lifecycle'))
    await user.selectOptions(screen.getByTestId('model-picker-is-moderated'), 'yes')
    await user.click(screen.getByTestId('model-picker-expiring-toggle'))
    await fireEvent.update(screen.getByTestId('model-picker-expiring-days'), '14')

    await user.click(screen.getByText('Sort'))
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

  it('shows synced status with model count and time', async () => {
    const now = Date.now()
    ;(globalThis as any).electronAPI = {
      modelCatalogSyncNow: vi.fn(async () => ({
        ok: true,
        syncAttempted: true,
        syncSucceeded: true,
        providerKey: 'openrouter',
        modelCount: 150,
        lastSyncAtMs: now,
        errorCode: null,
        errorMessage: null,
      })),
      modelCatalogGetSyncStatus: vi.fn(async () => ({
        providerKey: 'openrouter',
        syncState: 'ok',
        lastSyncAtMs: now,
        modelCount: 150,
        lastErrorCode: null,
        lastErrorMessage: null,
      })),
    }
    const queryFn = vi.fn(async () => createResult([]))

    render(ModelPickerDialog, {
      props: {
        open: true,
        selectedModelId: DEFAULT_OPENROUTER_TEST_MODEL,
        queryFn,
        debounceMs: 0,
      },
    })

    await waitFor(() => {
      expect(screen.getByText(/已同步/)).toBeTruthy()
      expect(screen.getByText(/150/)).toBeTruthy()
    })
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
    const queryFn = vi.fn(async () => createResult([]))

    render(ModelPickerDialog, {
      props: {
        open: true,
        selectedModelId: DEFAULT_OPENROUTER_TEST_MODEL,
        queryFn,
        debounceMs: 0,
      },
    })

    await waitFor(() => {
      expect(screen.getByText(/同步失败/)).toBeTruthy()
      expect(screen.getByText(/API Key 无效/)).toBeTruthy()
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

  it('manual refresh button triggers force sync', async () => {
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
        lastSyncAtMs: Date.now(),
        modelCount: 100,
        lastErrorCode: null,
        lastErrorMessage: null,
      })),
    }
    const user = userEvent.setup()
    const queryFn = vi.fn(async () => createResult([]))

    render(ModelPickerDialog, {
      props: {
        open: true,
        selectedModelId: DEFAULT_OPENROUTER_TEST_MODEL,
        queryFn,
        debounceMs: 0,
      },
    })

    await waitFor(() => {
      expect(screen.getByTestId('model-picker-sync-refresh')).toBeTruthy()
    })

    syncNow.mockClear()
    await user.click(screen.getByTestId('model-picker-sync-refresh'))

    await waitFor(() => {
      expect(syncNow).toHaveBeenCalledWith(expect.objectContaining({
        force: true,
        reason: 'manual_refresh',
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

  it('after manual sync success, reopening shows synced via getSyncStatus', async () => {
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
    const queryFn = vi.fn(async () => createResult([]))

    render(ModelPickerDialog, {
      props: {
        open: true,
        selectedModelId: DEFAULT_OPENROUTER_TEST_MODEL,
        queryFn,
        debounceMs: 0,
      },
    })

    await waitFor(() => {
      expect(getSyncStatus).toHaveBeenCalled()
      expect(screen.getByText(/已同步/)).toBeTruthy()
      expect(screen.getByText(/300/)).toBeTruthy()
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

  it('auto-sync sends providerKey, force=false, reason=model_picker_opened', async () => {
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
    const queryFn = vi.fn(async () => createResult([]))

    render(ModelPickerDialog, {
      props: {
        open: true,
        selectedModelId: DEFAULT_OPENROUTER_TEST_MODEL,
        queryFn,
        debounceMs: 0,
      },
    })

    await waitFor(() => {
      expect(syncNow).toHaveBeenCalledWith(expect.objectContaining({
        providerKey: 'openrouter',
        force: false,
        reason: 'model_picker_opened',
      }))
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

  it('picker open policy always triggers force=false sync even when status is fresh', async () => {
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

    render(ModelPickerDialog, {
      props: {
        open: true,
        selectedModelId: DEFAULT_OPENROUTER_TEST_MODEL,
        queryFn: vi.fn(async () => createResult([], null, { catalogRevision: 'rev-fresh' })),
        debounceMs: 0,
      },
    })

    await waitFor(() => {
      expect(syncNow).toHaveBeenCalledWith(expect.objectContaining({
        providerKey: 'openrouter',
        force: false,
        reason: 'model_picker_opened',
      }))
    })
  })

  it('manual update mode shows update prompt and waits for immediate update click', async () => {
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
        selectedModelId: 'openai/old',
        queryFn,
        debounceMs: 100000,
      },
    })

    await screen.findByTestId('model-picker-item-openai/old')
    await user.click(screen.getByTestId('model-picker-sync-refresh'))

    await screen.findByTestId('model-picker-update-available')
    expect(screen.getByText('模型列表有更新')).toBeTruthy()
    expect(screen.getByRole('button', { name: '立即更新' })).toBeTruthy()
    expect(screen.queryByTestId('model-picker-item-openai/new')).toBeNull()

    await user.click(screen.getByTestId('model-picker-apply-update'))
    await screen.findByTestId('model-picker-item-openai/new')
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
    expect(queryFn).toHaveBeenCalledTimes(1)
    expect(screen.queryByTestId('model-picker-update-available')).toBeNull()
    expect(screen.getByTestId('model-picker-item-openai/stable')).toBeTruthy()
  })
})

