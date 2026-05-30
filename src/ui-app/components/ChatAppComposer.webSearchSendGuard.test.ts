import { computed, defineComponent, ref } from 'vue'
import { fireEvent, render, screen, within } from '@testing-library/vue'
import userEvent from '@testing-library/user-event'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { __resetModelPrefsServiceCacheForTests } from '@/next/modelPrefs/modelPrefsService'
import { DEFAULT_OPENROUTER_TEST_MODEL } from '@/next/openrouter/openRouterTestModels'
import ChatAppComposer from './ChatAppComposer.vue'

describe('ChatAppComposer web search send guard', () => {
  const originalDbBridge = (globalThis as any).dbBridge

  type HarnessSessionConfig = {
    model: { selectedModelKey: string }
    reasoning: { enabled: boolean; effort: 'medium' }
    webSearch: { enabled: boolean; level: 'low' | 'high'; detail: null }
    imageGeneration: {
      enabled: boolean
      resolution: '1K' | '2K' | '4K'
      aspectRatio: '16:9' | '3:4' | '1:1' | '4:3'
      mode: 'default'
      detail: null
    }
    samplingParams: { detail: null }
  }

  afterEach(() => {
    ;(globalThis as any).dbBridge = originalDbBridge
    __resetModelPrefsServiceCacheForTests()
    vi.restoreAllMocks()
  })

  function installDbBridgeStub(input?: Readonly<{ favorites?: unknown[]; recents?: unknown[] }>) {
    const favorites = Array.isArray(input?.favorites) ? input.favorites : []
    const recents = Array.isArray(input?.recents) ? input.recents : []
    ;(globalThis as any).dbBridge = {
      invoke: vi.fn(async (method: string) => {
        if (method === 'modelPrefs.listFavorites') return favorites
        if (method === 'modelPrefs.listRecents') return recents
        return null
      }),
    }
  }

  function createSessionConfig(): HarnessSessionConfig {
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

  function renderHarness(input?: Readonly<{ favorites?: unknown[]; recents?: unknown[]; disabled?: boolean }>) {
    installDbBridgeStub(input)
    const Wrapper = defineComponent({
      components: { ChatAppComposer },
      setup() {
        const draft = ref('hello')
        const model = ref(DEFAULT_OPENROUTER_TEST_MODEL)
        const sessionConfig = ref(createSessionConfig())
        const serializedSessionConfig = computed(() => JSON.stringify(sessionConfig.value))
        const sendCount = ref(0)
        return {
          draft,
          model,
          sessionConfig,
          serializedSessionConfig,
          sendCount,
          disabled: input?.disabled === true,
          onUpdateWebSearchEnabled(value: boolean) {
            sessionConfig.value = {
              ...sessionConfig.value,
              webSearch: { ...sessionConfig.value.webSearch, enabled: value },
            }
          },
          onUpdateWebSearchLevel(value: 'low' | 'high') {
            sessionConfig.value = {
              ...sessionConfig.value,
              webSearch: { ...sessionConfig.value.webSearch, enabled: true, level: value },
            }
          },
          onUpdateImageGenerationEnabled(value: boolean) {
            sessionConfig.value = {
              ...sessionConfig.value,
              imageGeneration: { ...sessionConfig.value.imageGeneration, enabled: value },
            }
          },
          onUpdateImageGenerationResolution(value: '1K' | '2K' | '4K') {
            sessionConfig.value = {
              ...sessionConfig.value,
              imageGeneration: { ...sessionConfig.value.imageGeneration, enabled: true, resolution: value },
            }
          },
          onUpdateImageGenerationAspectRatio(value: '16:9' | '3:4' | '1:1' | '4:3') {
            sessionConfig.value = {
              ...sessionConfig.value,
              imageGeneration: { ...sessionConfig.value.imageGeneration, enabled: true, aspectRatio: value },
            }
          },
        }
      },
      template: `
        <div>
          <ChatAppComposer
            v-model:draft="draft"
            v-model:model="model"
            :sessionConfig="sessionConfig"
            :disabled="disabled"
            :isRunning="false"
            :canSend="!disabled"
            :modelCatalog="[]"
            :modelCatalogNotice="null"
            @updateWebSearchEnabled="onUpdateWebSearchEnabled"
            @updateWebSearchLevel="onUpdateWebSearchLevel"
            @updateImageGenerationEnabled="onUpdateImageGenerationEnabled"
            @updateImageGenerationResolution="onUpdateImageGenerationResolution"
            @updateImageGenerationAspectRatio="onUpdateImageGenerationAspectRatio"
            @send="sendCount += 1"
          />
          <div data-testid="send-count">{{ sendCount }}</div>
          <div data-testid="session-config-json">{{ serializedSessionConfig }}</div>
        </div>
      `,
    })
    return render(Wrapper)
  }

  function sessionConfig() {
    return JSON.parse(screen.getByTestId('session-config-json').textContent ?? '{}')
  }

  async function chooseChipOption(chipTestId: string, optionText: string) {
    const user = userEvent.setup()
    const chip = screen.getByTestId(chipTestId)
    await user.click(within(chip).getByTestId('capability-chip-chevron'))
    const menu = await screen.findByTestId('capability-chip-menu')
    await user.click(within(menu).getByText(optionText))
  }

  it('uses current localized send controls and keeps enabled send behavior', async () => {
    const user = userEvent.setup()
    renderHarness()

    const sendButton = screen.getByTestId('composer-send')
    const textarea = screen.getByTestId('composer-draft')

    expect(sendButton).not.toBeDisabled()
    expect(sendButton.textContent).toContain('发送')

    await user.click(sendButton)
    expect(screen.getByTestId('send-count').textContent).toBe('1')

    await fireEvent.keyDown(textarea, { key: 'Enter', code: 'Enter' })
    expect(screen.getByTestId('send-count').textContent).toBe('2')
  })

  it('updates image generation state through the image capability chip', async () => {
    const user = userEvent.setup()
    renderHarness()

    await user.click(within(screen.getByTestId('image-chip')).getByTestId('capability-chip-body'))
    expect(sessionConfig().imageGeneration.enabled).toBe(false)

    await chooseChipOption('image-chip', '2K')
    expect(sessionConfig().imageGeneration).toMatchObject({ enabled: true, resolution: '2K' })

    await chooseChipOption('image-chip', '16:9')
    expect(sessionConfig().imageGeneration).toMatchObject({ enabled: true, aspectRatio: '16:9' })
  })

  it('keeps reasoning, web search, and image controls in the current capability-chip toolbar', () => {
    renderHarness()

    const reasoning = screen.getByTestId('reasoning-chip')
    const webSearch = screen.getByTestId('web-search-chip')
    const image = screen.getByTestId('image-chip')

    expect(reasoning.parentElement).toBe(webSearch.parentElement)
    expect(webSearch.parentElement).toBe(image.parentElement)
    expect(reasoning.compareDocumentPosition(webSearch) & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy()
    expect(webSearch.compareDocumentPosition(image) & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy()
  })

  it('updates web search state through the web search capability chip', async () => {
    const user = userEvent.setup()
    renderHarness()

    await chooseChipOption('web-search-chip', 'high')
    expect(sessionConfig().webSearch).toMatchObject({ enabled: true, level: 'high' })

    await user.click(within(screen.getByTestId('web-search-chip')).getByTestId('capability-chip-body'))
    expect(sessionConfig().webSearch).toMatchObject({ enabled: false, level: 'high' })
  })

  it('keeps quick model strip anchored below current model controls', async () => {
    const user = userEvent.setup()
    renderHarness({
      favorites: [
        {
          scopeType: 'global',
          scopeId: '',
          providerKey: 'openrouter',
          modelId: DEFAULT_OPENROUTER_TEST_MODEL,
          modelKey: `openrouter::${DEFAULT_OPENROUTER_TEST_MODEL}`,
          sortRank: 0,
          createdAtMs: 1,
          updatedAtMs: 1,
        },
      ],
    })

    const modelTabs = screen.getByTestId('model-quick-mode-tabs')
    await user.click(screen.getByTestId('model-main-tab-favorites'))
    const strip = await screen.findByTestId('favorites-strip')

    expect(strip.parentElement).toBe(modelTabs.parentElement?.parentElement)
    expect(modelTabs.compareDocumentPosition(strip) & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy()
    expect(screen.getByTestId(`favorite-model-${DEFAULT_OPENROUTER_TEST_MODEL}`)).toBeInTheDocument()
  })

  it('disables capability chips and send action when the composer is disabled', () => {
    renderHarness({ disabled: true })

    expect(screen.getByTestId('composer-send')).toBeDisabled()
    expect(within(screen.getByTestId('reasoning-chip')).getByTestId('capability-chip-body')).toBeDisabled()
    expect(within(screen.getByTestId('web-search-chip')).getByTestId('capability-chip-body')).toBeDisabled()
    expect(within(screen.getByTestId('image-chip')).getByTestId('capability-chip-body')).toBeDisabled()
  })
})
