import { defineComponent, ref } from 'vue'
import { fireEvent, render, screen, waitFor } from '@testing-library/vue'
import userEvent from '@testing-library/user-event'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { DEFAULT_OPENROUTER_TEST_MODEL } from '@/next/openrouter/openRouterTestModels'
import ChatAppComposer from './ChatAppComposer.vue'

function installDbBridgeStub() {
  ;(globalThis as any).dbBridge = {
    invoke: vi.fn(async (method: string) => {
      if (method === 'modelPrefs.listFavorites') return []
      if (method === 'modelPrefs.listRecents') return []
      return null
    }),
  }
}

describe('ChatAppComposer attachments entry', () => {
  const originalDbBridge = (globalThis as any).dbBridge

  afterEach(() => {
    ;(globalThis as any).dbBridge = originalDbBridge
    vi.restoreAllMocks()
  })

  function renderComposer(input?: Readonly<{ imageInputSupported?: boolean | null; imageInputDisabledReason?: string | null }>) {
    installDbBridgeStub()
    const Wrapper = defineComponent({
      components: { ChatAppComposer },
      setup() {
        const draft = ref('')
        const imageInputSupported = ref(input?.imageInputSupported ?? null)
        const imageInputDisabledReason = ref(input?.imageInputDisabledReason ?? null)
        const sessionConfig = ref({
          model: { selectedModelKey: DEFAULT_OPENROUTER_TEST_MODEL },
          reasoning: { enabled: false, effort: 'medium' as const },
          webSearch: { enabled: false, level: 'low' as const },
          imageGeneration: {
            enabled: false,
            mode: 'default' as const,
            detail: {
              enabled: false,
              outputMode: 'auto' as const,
              aspectRatio: 'default' as const,
              imageSize: 'default' as const,
              advancedJson: '',
            },
            resolution: 'default' as const,
            aspectRatio: 'default' as const,
          },
        })
        return { draft, imageInputSupported, imageInputDisabledReason, sessionConfig }
      },
      template: `
        <ChatAppComposer
          v-model:draft="draft"
          :disabled="false"
          :isRunning="false"
          :sessionConfig="sessionConfig"
          :modelCatalog="[]"
          :imageInputSupported="imageInputSupported"
          :imageInputDisabledReason="imageInputDisabledReason"
        />
      `,
    })
    return render(Wrapper)
  }

  it('shows upload file, upload image, and upload link in the + menu', async () => {
    const user = userEvent.setup()
    renderComposer()

    await user.click(screen.getByTestId('composer-attach-toggle'))

    expect(screen.getByTestId('composer-attach-file').textContent).toContain('Upload file')
    expect(screen.getByTestId('composer-attach-image').textContent).toContain('Upload image')
    expect(screen.getByTestId('composer-attach-url').textContent).toContain('Upload link')
  })

  it('disables image upload entry when the current model does not support images', async () => {
    const user = userEvent.setup()
    renderComposer({ imageInputSupported: false, imageInputDisabledReason: 'Current model does not support image inputs.' })

    await user.click(screen.getByTestId('composer-attach-toggle'))
    const imageButton = screen.getByTestId('composer-attach-image')
    expect(imageButton).toBeDisabled()
    expect(imageButton.getAttribute('title')).toContain('Current model does not support image inputs.')
  })

  it('re-emits raw drop and paste events to the app layer', async () => {
    const { emitted } = renderComposer()
    const draft = screen.getByTestId('composer-draft')
    const file = new File(['hello'], 'hello.txt', { type: 'text/plain' })
    Object.defineProperty(file, 'path', { value: 'C:/tmp/hello.txt' })

    await fireEvent.drop(draft, { dataTransfer: { files: [file] } } as any)
    await fireEvent.paste(draft, {
      clipboardData: {
        files: [file],
        getData: vi.fn(() => ''),
      },
    } as any)

    expect(emitted().drop?.length).toBe(1)
    expect(emitted().paste?.length).toBe(1)
  })

  it('closes the attachment menu on outside click and Escape', async () => {
    const user = userEvent.setup()
    renderComposer()

    await user.click(screen.getByTestId('composer-attach-toggle'))
    expect(screen.getByTestId('composer-attach-menu')).toBeTruthy()

    await user.click(document.body)
    await waitFor(() => {
      expect(screen.queryByTestId('composer-attach-menu')).toBeNull()
    })

    await user.click(screen.getByTestId('composer-attach-toggle'))
    expect(screen.getByTestId('composer-attach-menu')).toBeTruthy()

    await fireEvent.keyDown(document, { key: 'Escape' })
    await waitFor(() => {
      expect(screen.queryByTestId('composer-attach-menu')).toBeNull()
    })
  })

  it('auto-flips upward near viewport bottom and stays downward when space is sufficient', async () => {
    const user = userEvent.setup()
    renderComposer()

    const toggle = screen.getByTestId('composer-attach-toggle')
    const originalInnerHeight = window.innerHeight
    const originalInnerWidth = window.innerWidth
    let triggerRect = {
      x: 24,
      y: 560,
      width: 28,
      height: 24,
      top: 560,
      right: 52,
      bottom: 584,
      left: 24,
      toJSON: () => ({}),
    } as DOMRect
    let menuRect = {
      x: 0,
      y: 0,
      width: 176,
      height: 140,
      top: 0,
      right: 176,
      bottom: 140,
      left: 0,
      toJSON: () => ({}),
    } as DOMRect

    const rectSpy = vi.spyOn(HTMLElement.prototype, 'getBoundingClientRect').mockImplementation(function (this: HTMLElement) {
      const testId = this.getAttribute('data-testid')
      if (testId === 'composer-attach-toggle') return triggerRect
      if (testId === 'composer-attach-menu') return menuRect
      return {
        x: 0,
        y: 0,
        width: 320,
        height: 48,
        top: 0,
        right: 320,
        bottom: 48,
        left: 0,
        toJSON: () => ({}),
      } as DOMRect
    })

    Object.defineProperty(window, 'innerHeight', { value: 600, configurable: true })
    Object.defineProperty(window, 'innerWidth', { value: 900, configurable: true })

    await user.click(toggle)

    const menu = await screen.findByTestId('composer-attach-menu')
    menuRect = {
      x: 0,
      y: 0,
      width: 176,
      height: 140,
      top: 0,
      right: 176,
      bottom: 140,
      left: 0,
      toJSON: () => ({}),
    } as DOMRect
    window.dispatchEvent(new Event('resize'))

    await waitFor(() => {
      expect(Number.parseFloat(menu.style.top)).toBeLessThan(560)
    })

    await user.click(document.body)
    await waitFor(() => {
      expect(screen.queryByTestId('composer-attach-menu')).toBeNull()
    })

    triggerRect = {
      x: 24,
      y: 120,
      width: 28,
      height: 24,
      top: 120,
      right: 52,
      bottom: 144,
      left: 24,
      toJSON: () => ({}),
    } as DOMRect

    await user.click(toggle)
    const menuSecond = await screen.findByTestId('composer-attach-menu')
    menuRect = {
      x: 0,
      y: 0,
      width: 176,
      height: 140,
      top: 0,
      right: 176,
      bottom: 140,
      left: 0,
      toJSON: () => ({}),
    } as DOMRect
    window.dispatchEvent(new Event('resize'))

    await waitFor(() => {
      expect(Number.parseFloat(menuSecond.style.top)).toBeGreaterThan(144)
    })

    rectSpy.mockRestore()
    Object.defineProperty(window, 'innerHeight', { value: originalInnerHeight, configurable: true })
    Object.defineProperty(window, 'innerWidth', { value: originalInnerWidth, configurable: true })
  })

  it('shows a visible error and closes the menu when measurement is still invalid after a retry', async () => {
    const user = userEvent.setup()
    renderComposer()

    const toggle = screen.getByTestId('composer-attach-toggle')
    const toggleRectSpy = vi.spyOn(toggle, 'getBoundingClientRect')
    const rafSpy = vi.spyOn(window, 'requestAnimationFrame').mockImplementation((callback) => {
      callback(16)
      return 1
    })
    const cancelRafSpy = vi.spyOn(window, 'cancelAnimationFrame').mockImplementation(() => undefined)

    toggleRectSpy.mockReturnValue({
      x: 24,
      y: 120,
      width: 28,
      height: 24,
      top: 120,
      right: 52,
      bottom: 144,
      left: 24,
      toJSON: () => ({}),
    } as DOMRect)

    await user.click(toggle)

    await waitFor(() => {
      expect(screen.getByTestId('composer-attachment-menu-error').textContent).toContain('附件菜单暂时无法打开，请重试')
      expect(screen.queryByTestId('composer-attach-menu')).toBeNull()
    })

    expect(rafSpy).toHaveBeenCalled()
    toggleRectSpy.mockRestore()
    rafSpy.mockRestore()
    cancelRafSpy.mockRestore()
  })
})

