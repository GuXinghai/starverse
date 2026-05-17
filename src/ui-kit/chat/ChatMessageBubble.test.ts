import { fireEvent, render, screen, waitFor } from '@testing-library/vue'
import { afterEach, beforeEach, vi } from 'vitest'
import ChatMessageBubble from './ChatMessageBubble.vue'
import type { MessageVM } from './types'
import { resetI18nForTests } from '@/shared/i18n'

function msg(partial: Partial<MessageVM> & Pick<MessageVM, 'messageId' | 'role'>): MessageVM {
  return {
    messageId: partial.messageId,
    role: partial.role,
    contentBlocks: partial.contentBlocks ?? [{ type: 'text', text: 'hello' }],
    ...(partial.requestedImageGeneration === true ? { requestedImageGeneration: true } : {}),
    ...(partial.annotations ? { annotations: partial.annotations } : {}),
    toolCalls: partial.toolCalls ?? [],
    reasoningView: partial.reasoningView ?? { visibility: 'not_returned', panelState: 'expanded' },
    streaming: partial.streaming ?? { isTarget: false, isComplete: true },
  }
}

describe('ChatMessageBubble', () => {
  const originalClipboard = globalThis.navigator.clipboard
  const originalIpcRenderer = (globalThis as any).ipcRenderer

  beforeEach(() => {
    resetI18nForTests()
  })

  afterEach(() => {
    Object.defineProperty(globalThis.navigator, 'clipboard', {
      configurable: true,
      value: originalClipboard,
    })
    ;(globalThis as any).ipcRenderer = originalIpcRenderer
    vi.restoreAllMocks()
  })

  it('shows generating marker only for target assistant streaming messages', () => {
    render(ChatMessageBubble, {
      props: {
        message: msg({ messageId: 'a1', role: 'assistant', streaming: { isTarget: true, isComplete: false } }),
      },
    })
    expect(screen.getByText('正在生成')).toBeInTheDocument()
    expect(screen.queryByTestId('message-image-placeholder')).toBeNull()
    expect(screen.queryByText(/References \(/)).not.toBeInTheDocument()
  })

  it('renders before-content slot inside the message bubble', () => {
    render(ChatMessageBubble, {
      props: {
        message: msg({ messageId: 'a_slot_1', role: 'assistant' }),
      },
      slots: {
        'before-content': '<div data-testid="inline-reasoning-slot">Reasoning</div>',
      },
    })

    const bubble = screen.getByText('Assistant').closest('.rounded-2xl')
    expect(bubble).not.toBeNull()
    expect(bubble).toContainElement(screen.getByTestId('inline-reasoning-slot'))
  })

  it('shows image placeholder only when image generation was requested', () => {
    render(ChatMessageBubble, {
      props: {
        message: msg({
          messageId: 'a1_img',
          role: 'assistant',
          streaming: { isTarget: true, isComplete: false },
          requestedImageGeneration: true,
        }),
      },
    })

    expect(screen.getByTestId('message-image-placeholder')).toBeInTheDocument()
  })

  it('hides debug block by default, shows when showDebug=true', () => {
    render(ChatMessageBubble, {
      props: {
        message: msg({ messageId: 'u1', role: 'user' }),
      },
    })
    expect(screen.queryByText(/id:/)).not.toBeInTheDocument()

    render(ChatMessageBubble, {
      props: {
        message: msg({ messageId: 'u2', role: 'user' }),
        showDebug: true,
      },
    })
    expect(screen.getByText(/id:/)).toBeInTheDocument()
    expect(screen.getByText('u2')).toBeInTheDocument()
  })

  it('renders tool calls in a structured block (name + arguments)', () => {
    render(ChatMessageBubble, {
      props: {
        message: msg({
          messageId: 'a3',
          role: 'assistant',
          toolCalls: [
            {
              index: 0,
              id: 'call_1',
              type: 'function',
              name: 'lookup',
              argumentsText: '{"q":"x"}',
            },
          ],
        }),
      },
    })

    expect(screen.getByText(/工具调用/)).toBeInTheDocument()
    expect(screen.getByText('lookup')).toBeInTheDocument()
    expect(screen.getByText('call_1')).toBeInTheDocument()
    expect(screen.getByText('{"q":"x"}')).toBeInTheDocument()
  })

  it('renders assistant references from url_citation annotations', () => {
    render(ChatMessageBubble, {
      props: {
        message: msg({
          messageId: 'a_ref_1',
          role: 'assistant',
          contentBlocks: [{ type: 'text', text: 'OpenRouter docs are useful.' }],
          annotations: [
            {
              type: 'url_citation',
              url_citation: {
                url: 'https://openrouter.ai/docs',
                title: 'OpenRouter Docs',
                start_index: 0,
                end_index: 10,
              },
            },
          ],
        }),
      },
    })

    expect(screen.getByText(/引用 \(1\)/)).toBeInTheDocument()
    expect(screen.getByRole('link', { name: 'OpenRouter Docs' })).toHaveAttribute('href', 'https://openrouter.ai/docs')
    expect(screen.getByText('OpenRouter')).toBeInTheDocument()
  })

  it('falls back to domain/url when citation title/content are missing', () => {
    render(ChatMessageBubble, {
      props: {
        message: msg({
          messageId: 'a_ref_2',
          role: 'assistant',
          contentBlocks: [{ type: 'text', text: 'x' }],
          annotations: [
            {
              type: 'url_citation',
              url_citation: {
                url: 'https://example.com/path',
              },
            },
          ],
        }),
      },
    })

    expect(screen.getByRole('link', { name: 'example.com' })).toBeInTheDocument()
  })

  it('renders completed assistant math content through rich text pipeline', async () => {
    const { container } = render(ChatMessageBubble, {
      props: {
        message: msg({
          messageId: 'a4',
          role: 'assistant',
          contentBlocks: [{ type: 'text', text: '公式：$E=mc^2$' }],
          streaming: { isTarget: false, isComplete: true },
        }),
      },
    })

    await waitFor(() => {
      expect(container.querySelector('.katex')).not.toBeNull()
    })
  })

  it('keeps user message plaintext by default', async () => {
    const { container } = render(ChatMessageBubble, {
      props: {
        message: msg({
          messageId: 'u_math_plain',
          role: 'user',
          contentBlocks: [{ type: 'text', text: '公式：$E=mc^2$' }],
        }),
      },
    })

    await waitFor(() => {
      expect(container.querySelector('.katex')).toBeNull()
    })
  })

  it('renders user message through rich text pipeline when enabled', async () => {
    const { container } = render(ChatMessageBubble, {
      props: {
        renderUserMessageRichText: true,
        message: msg({
          messageId: 'u_math_rich',
          role: 'user',
          contentBlocks: [{ type: 'text', text: '公式：$E=mc^2$' }],
        }),
      },
    })

    await waitFor(() => {
      expect(container.querySelector('.katex')).not.toBeNull()
    })
  })

  it('keeps message layout stable when user math contains invalid TeX', async () => {
    const { container } = render(ChatMessageBubble, {
      props: {
        renderUserMessageRichText: true,
        message: msg({
          messageId: 'u_invalid_math',
          role: 'user',
          contentBlocks: [{ type: 'text', text: 'A $\\invalidcommand$ B' }],
        }),
      },
    })

    await waitFor(() => {
      expect(container.textContent).toContain('A')
      expect(container.textContent).toContain('B')
      expect(container.querySelector('.rt-math-error')).not.toBeNull()
    })
  })

  it('renders multi-image gallery and supports click-to-preview', async () => {
    render(ChatMessageBubble, {
      props: {
        message: msg({
          messageId: 'a_img_1',
          role: 'assistant',
          contentBlocks: [
            { type: 'text', text: 'two images' },
            { type: 'image', url: 'data:image/png;base64,AAA=' },
            { type: 'image', url: 'data:image/png;base64,BBB=' },
          ],
          streaming: { isTarget: false, isComplete: true },
        }),
      },
    })

    expect(screen.getByTestId('message-image-section').textContent).toContain('图片 (2)')
    expect(screen.getByTestId('message-image-card-1')).toBeInTheDocument()

    await fireEvent.click(screen.getByTestId('message-image-preview-open-2'))
    expect(screen.getByTestId('message-image-preview')).toBeInTheDocument()
    expect(screen.getByTestId('message-image-preview-image')).toHaveAttribute('src', 'data:image/png;base64,BBB=')

    await fireEvent.click(screen.getByTestId('message-image-preview-close'))
    await waitFor(() => {
      expect(screen.queryByTestId('message-image-preview')).toBeNull()
    })
  })

  it('disables copy/path/export actions for transient data URLs before persistence', async () => {
    ;(globalThis as any).ipcRenderer = {
      invoke: vi.fn(async () => ({ success: true })),
    }

    render(ChatMessageBubble, {
      props: {
        message: msg({
          messageId: 'a_img_transient',
          role: 'assistant',
          contentBlocks: [{ type: 'image', url: 'data:image/png;base64,AAAA=' }],
        }),
      },
    })

    const copyBtn = screen.getByTestId('message-image-copy-0') as HTMLButtonElement
    const copyPathBtn = screen.getByTestId('message-image-copy-path-0') as HTMLButtonElement
    const exportBtn = screen.getByTestId('message-image-export-0') as HTMLButtonElement
    expect(copyBtn).toBeDisabled()
    expect(copyPathBtn).toBeDisabled()
    expect(exportBtn).toBeDisabled()
    expect(screen.getByTestId('message-image-persisting-0')).toBeInTheDocument()

    await fireEvent.click(copyBtn)
    await fireEvent.click(copyPathBtn)
    await fireEvent.click(exportBtn)
    expect((globalThis as any).ipcRenderer.invoke).not.toHaveBeenCalled()
  })

  it('copies resolved local path for asset images', async () => {
    const writeText = vi.fn(async () => {})
    Object.defineProperty(globalThis.navigator, 'clipboard', {
      configurable: true,
      value: { writeText },
    })
    ;(globalThis as any).ipcRenderer = {
      invoke: vi.fn(async (channel: string) => {
        if (channel === 'shell:resolve-image-path') {
          return { success: true, path: 'C:\\assets\\image-1.png' }
        }
        return { success: false }
      }),
    }

    render(ChatMessageBubble, {
      props: {
        message: msg({
          messageId: 'a_img_2',
          role: 'assistant',
          contentBlocks: [{ type: 'image', url: 'asset://asset_1' }],
        }),
      },
    })

    await fireEvent.click(screen.getByTestId('message-image-copy-path-0'))
    await waitFor(() => {
      expect(writeText).toHaveBeenCalledWith('C:\\assets\\image-1.png')
    })
  })

  it('exports image through ipc when export action is clicked', async () => {
    ;(globalThis as any).ipcRenderer = {
      invoke: vi.fn(async () => ({ success: true })),
    }

    render(ChatMessageBubble, {
      props: {
        message: msg({
          messageId: 'a_img_3',
          role: 'assistant',
          contentBlocks: [{ type: 'image', url: 'asset://asset_2' }],
        }),
      },
    })

    await fireEvent.click(screen.getByTestId('message-image-export-0'))
    await waitFor(() => {
      expect((globalThis as any).ipcRenderer.invoke).toHaveBeenCalledWith(
        'dialog:export-image',
        expect.objectContaining({ imageUrl: 'asset://asset_2' }),
      )
    })
  })
})
