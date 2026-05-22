import { fireEvent, render, screen, waitFor } from '@testing-library/vue'
import userEvent from '@testing-library/user-event'
import { afterEach, describe, expect, it, vi } from 'vitest'
import type { CatalogQueryInput, CatalogQueryResult } from '@/next/modelCatalog/catalogQueryService'
import { DEFAULT_OPENROUTER_TEST_MODEL } from '@/next/openrouter/openRouterTestModels'
import ModelPickerDialog from './ModelPickerDialog.vue'

function createResult(items: CatalogQueryResult['items'], nextCursor: CatalogQueryResult['nextCursor'] = null): CatalogQueryResult {
  return {
    items: [...items],
    nextCursor,
    notice: null,
  }
}

describe('ModelPickerDialog', () => {
  afterEach(() => {
    vi.restoreAllMocks()
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
    expect(events.select?.[0]).toEqual(['openai/gpt-4o', 'GPT-4o'])
    expect(events.close).toBeTruthy()
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
        selectedModelId: DEFAULT_OPENROUTER_TEST_MODEL,
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
})

