import { computed, defineComponent, ref } from 'vue'
import { fireEvent, render, screen } from '@testing-library/vue'
import userEvent from '@testing-library/user-event'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { __resetModelPrefsServiceCacheForTests } from '@/next/modelPrefs/modelPrefsService'
import type { SamplingParamsLayer } from '@/next/openrouter/samplingParamsResolver'
import type { SearchSettingsLayer } from '@/next/openrouter/searchSettingsResolver'
import ChatAppComposer from './ChatAppComposer.vue'

describe('ChatAppComposer web search send guard', () => {
  const originalDbBridge = (globalThis as any).dbBridge

  afterEach(() => {
    ;(globalThis as any).dbBridge = originalDbBridge
    __resetModelPrefsServiceCacheForTests()
    vi.restoreAllMocks()
  })

  function installDbBridgeStub(input?: Readonly<{ favorites?: unknown[]; recents?: unknown[] }>) {
    const favorites = Array.isArray(input?.favorites) ? input?.favorites : []
    const recents = Array.isArray(input?.recents) ? input?.recents : []
    ;(globalThis as any).dbBridge = {
      invoke: vi.fn(async (method: string) => {
        if (method === 'modelPrefs.listFavorites') return favorites
        if (method === 'modelPrefs.listRecents') return recents
        return null
      }),
    }
  }

  function renderHarness(initialLayer: SearchSettingsLayer | null, input?: Readonly<{ favorites?: unknown[]; recents?: unknown[] }>) {
    installDbBridgeStub(input)
    const Wrapper = defineComponent({
      components: { ChatAppComposer },
      setup() {
        const draft = ref('hello')
        const model = ref('openrouter/auto')
        const requestedReasoningEffort = ref<'auto'>('auto')
        const requestedReasoningExclude = ref(false)
        const samplingParamsLayer = ref<SamplingParamsLayer | null>(null)
        const imageGeneration = ref({
          enabled: false,
          outputMode: 'auto' as const,
          aspectRatio: '',
          imageSize: '',
          advancedJson: '',
        })
        const imageGenerationSupported = ref(true)
        const imageGenerationCapabilityClass = ref<'text_and_image' | 'image_only' | null>('text_and_image')
        const imageGenerationSupportHint = ref('ok')
        const webSearchLayer = ref<SearchSettingsLayer | null>(initialLayer)
        const serializedLayer = computed(() => JSON.stringify(webSearchLayer.value))
        const serializedSamplingLayer = computed(() => JSON.stringify(samplingParamsLayer.value))
        const serializedImageGeneration = computed(() => JSON.stringify(imageGeneration.value))
        const sendCount = ref(0)
        return {
          draft,
          model,
          requestedReasoningEffort,
          requestedReasoningExclude,
          samplingParamsLayer,
          imageGeneration,
          imageGenerationSupported,
          imageGenerationCapabilityClass,
          imageGenerationSupportHint,
          webSearchLayer,
          serializedLayer,
          serializedSamplingLayer,
          serializedImageGeneration,
          sendCount,
        }
      },
      template: `
        <div>
          <ChatAppComposer
            v-model:draft="draft"
            v-model:model="model"
            v-model:requestedReasoningEffort="requestedReasoningEffort"
            v-model:requestedReasoningExclude="requestedReasoningExclude"
            v-model:samplingParamsLayer="samplingParamsLayer"
            v-model:webSearchLayer="webSearchLayer"
            :imageGeneration="imageGeneration"
            :imageGenerationVisible="true"
            :imageGenerationSupported="imageGenerationSupported"
            :imageGenerationCapabilityClass="imageGenerationCapabilityClass"
            :imageGenerationSupportHint="imageGenerationSupportHint"
            :imageGenerationAdvancedError="null"
            :disabled="false"
            :isRunning="false"
            :modelCatalog="[]"
            :showHiddenModelsInPickers="false"
            :modelCatalogNotice="null"
            @update:imageGeneration="imageGeneration = $event"
            @send="sendCount += 1"
          />
          <div data-testid="send-count">{{ sendCount }}</div>
          <div data-testid="layer-json">{{ serializedLayer }}</div>
          <div data-testid="sampling-layer-json">{{ serializedSamplingLayer }}</div>
          <div data-testid="image-generation-json">{{ serializedImageGeneration }}</div>
        </div>
      `,
    })
    return render(Wrapper)
  }

  async function expandSamplingPanelIfNeeded(user: ReturnType<typeof userEvent.setup>) {
    if (screen.queryByTestId('sampling-mode-temperature')) return
    const toggle = screen.queryByTestId('sampling-params-toggle')
    if (!toggle) return
    await user.click(toggle)
  }

  it('uses dropdown for custom maxResults and keeps send enabled', async () => {
    const user = userEvent.setup()
    renderHarness({ searchDepth: 'custom' })

    const sendButton = screen.getByRole('button', { name: 'Send' })
    const depthSelect = screen.getByTestId('composer-web-depth-select') as HTMLSelectElement
    const customSelect = screen.getByTestId('composer-web-max-results') as HTMLSelectElement
    const textarea = screen.getByPlaceholderText('Type a message...')

    expect(customSelect.tagName).toBe('SELECT')
    expect(customSelect.value).toBe('5')
    expect(Array.from(customSelect.options).map((option) => option.value)).toEqual([
      '10',
      '9',
      '8',
      '7',
      '6',
      '5',
      '4',
      '3',
      '2',
      '1',
    ])
    expect(sendButton).not.toBeDisabled()

    await user.click(sendButton)
    expect(screen.getByTestId('send-count').textContent).toBe('1')

    await fireEvent.keyDown(textarea, { key: 'Enter', code: 'Enter' })
    expect(screen.getByTestId('send-count').textContent).toBe('2')

    await user.selectOptions(customSelect, '7')
    expect(JSON.parse(screen.getByTestId('layer-json').textContent ?? 'null')).toEqual({
      searchDepth: 'custom',
      maxResults: 7,
    })

    await user.selectOptions(depthSelect, 'medium')
    expect(JSON.parse(screen.getByTestId('layer-json').textContent ?? 'null')).toEqual({
      searchDepth: 'medium',
    })

    await user.selectOptions(depthSelect, 'custom')
    const customSelectAgain = screen.getByTestId('composer-web-max-results') as HTMLSelectElement
    expect(customSelectAgain.value).toBe('7')
    expect(JSON.parse(screen.getByTestId('layer-json').textContent ?? 'null')).toEqual({
      searchDepth: 'custom',
      maxResults: 7,
    })
  })

  it('updates image generation state through dedicated control row', async () => {
    const user = userEvent.setup()
    renderHarness(null)

    const enable = screen.getByTestId('composer-image-enable') as HTMLInputElement
    const outputMode = screen.getByTestId('composer-image-output-mode') as HTMLSelectElement
    const aspectRatio = screen.getByTestId('composer-image-aspect-ratio') as HTMLSelectElement
    const size = screen.getByTestId('composer-image-size') as HTMLSelectElement
    const advanced = screen.getByTestId('composer-image-advanced-json') as HTMLInputElement
    const aspectOptions = Array.from(aspectRatio.options).map((option) => option.value)
    expect(aspectOptions).toEqual([
      'default',
      '1:1',
      '2:3',
      '3:2',
      '3:4',
      '4:3',
      '4:5',
      '5:4',
      '9:16',
      '16:9',
      '21:9',
    ])
    expect(Array.from(size.options).map((option) => option.value)).toEqual(['default', '1K', '2K', '4K'])

    await user.click(enable)
    await user.selectOptions(outputMode, 'image_only')
    await user.selectOptions(aspectRatio, '16:9')
    await user.selectOptions(size, '2K')
    await fireEvent.update(advanced, '{"seed":42}')

    expect(JSON.parse(screen.getByTestId('image-generation-json').textContent ?? 'null')).toEqual({
      enabled: true,
      outputMode: 'image_only',
      aspectRatio: '16:9',
      imageSize: '2K',
      advancedJson: '{"seed":42}',
    })
  })

  it('keeps image controls on an independent row between reasoning and web search', () => {
    renderHarness(null)

    const reasoning = screen.getByTestId('reasoning-controls')
    const reasoningRow = reasoning.parentElement as HTMLElement
    const imageRow = screen.getByTestId('composer-image-generation-row')
    const webSearchRow = screen.getByTestId('composer-web-search-row')

    expect(reasoningRow.className).toContain('min-h-[38px]')
    expect(reasoningRow.parentElement).toBe(imageRow.parentElement)
    expect(imageRow.parentElement).toBe(webSearchRow.parentElement)
    expect(imageRow.className).toContain('min-h-[38px]')
    expect(webSearchRow.className).toContain('min-h-[38px]')
    expect(reasoning.compareDocumentPosition(imageRow) & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy()
    expect(imageRow.compareDocumentPosition(webSearchRow) & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy()
  })

  it('keeps sampling row anchor stable while toggling default/custom', async () => {
    const user = userEvent.setup()
    renderHarness(null)
    await expandSamplingPanelIfNeeded(user)

    const samplingRow = screen.getByTestId('composer-sampling-params-row')
    const reasoning = screen.getByTestId('reasoning-controls')
    const beforeClass = samplingRow.className
    const beforeParent = samplingRow.parentElement

    const mode = screen.getByTestId('sampling-mode-temperature') as HTMLSelectElement
    const value = screen.getByTestId('sampling-value-temperature') as HTMLInputElement

    await user.selectOptions(mode, 'custom')
    await fireEvent.update(value, '0.7')
    await fireEvent.blur(value)

    expect(JSON.parse(screen.getByTestId('sampling-layer-json').textContent ?? 'null')).toEqual({
      temperature: { mode: 'custom', value: 0.7 },
    })
    expect(samplingRow.parentElement).toBe(beforeParent)
    expect(samplingRow.className).toBe(beforeClass)
    expect(samplingRow.compareDocumentPosition(reasoning) & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy()

    await user.selectOptions(mode, 'default')
    expect(JSON.parse(screen.getByTestId('sampling-layer-json').textContent ?? 'null')).toBeNull()
    expect(samplingRow.parentElement).toBe(beforeParent)
    expect(samplingRow.className).toBe(beforeClass)
    expect(samplingRow.compareDocumentPosition(reasoning) & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy()
  })

  it('keeps image control row anchor and classes stable when favorites enters/exits edit mode', async () => {
    const user = userEvent.setup()
    renderHarness(null, {
      favorites: [
        {
          scopeType: 'global',
          scopeId: '',
          providerKey: 'openrouter',
          modelId: 'openrouter/auto',
          modelKey: 'openrouter::openrouter/auto',
          sortRank: 0,
          createdAtMs: 1,
          updatedAtMs: 1,
        },
      ],
    })

    const reasoning = screen.getByTestId('reasoning-controls')
    const imageRow = screen.getByTestId('composer-image-generation-row')
    const webSearchRow = screen.getByTestId('composer-web-search-row')
    const beforeImageClass = imageRow.className
    const beforeWebClass = webSearchRow.className
    const parent = imageRow.parentElement

    await user.click(await screen.findByTestId('favorites-edit'))
    await user.click(screen.getByTestId('favorites-cancel'))

    expect(imageRow.parentElement).toBe(parent)
    expect(webSearchRow.parentElement).toBe(parent)
    expect(imageRow.className).toBe(beforeImageClass)
    expect(webSearchRow.className).toBe(beforeWebClass)
    expect(reasoning.compareDocumentPosition(imageRow) & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy()
    expect(imageRow.compareDocumentPosition(webSearchRow) & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy()
  })

  it('shows clear disabled state and explanation for unsupported models', async () => {
    installDbBridgeStub()
    const Wrapper = defineComponent({
      components: { ChatAppComposer },
      setup() {
        const draft = ref('hello')
        const model = ref('openrouter/auto')
        const requestedReasoningEffort = ref<'auto'>('auto')
        const requestedReasoningExclude = ref(false)
        const imageGeneration = ref({
          enabled: false,
          outputMode: 'auto' as const,
          aspectRatio: '',
          imageSize: '',
          advancedJson: '',
        })
        return {
          draft,
          model,
          requestedReasoningEffort,
          requestedReasoningExclude,
          imageGeneration,
        }
      },
      template: `
        <ChatAppComposer
          v-model:draft="draft"
          v-model:model="model"
          v-model:requestedReasoningEffort="requestedReasoningEffort"
          v-model:requestedReasoningExclude="requestedReasoningExclude"
          :imageGeneration="imageGeneration"
          :imageGenerationVisible="true"
          :imageGenerationSupported="false"
          :imageGenerationCapabilityClass="null"
          imageGenerationSupportHint="selected model cannot be used for image generation."
          :imageGenerationAdvancedError="null"
          :disabled="false"
          :isRunning="false"
          :modelCatalog="[]"
          :showHiddenModelsInPickers="false"
          :modelCatalogNotice="null"
          @update:imageGeneration="imageGeneration = $event"
        />
      `,
    })
    render(Wrapper)

    expect(screen.getByTestId('composer-image-enable')).toBeDisabled()
    expect(screen.getByTestId('composer-image-output-mode')).toBeDisabled()
    expect(screen.getByTestId('composer-image-aspect-ratio')).toBeDisabled()
    expect(screen.getByTestId('composer-image-size')).toBeDisabled()
    expect(screen.getByTestId('composer-image-advanced-json')).toBeDisabled()
    expect(screen.getByTestId('composer-image-capability-badge').textContent).toContain('unsupported')
    expect(screen.getByTestId('composer-image-support-hint').textContent).toContain(
      'selected model cannot be used for image generation.'
    )
  })
})
