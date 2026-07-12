import { createApp, nextTick, ref } from 'vue'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { useVirtualWindow } from './useVirtualWindow'

function installRafStub() {
  const callbacks: FrameRequestCallback[] = []
  vi.stubGlobal('requestAnimationFrame', (callback: FrameRequestCallback) => {
    callbacks.push(callback)
    return callbacks.length
  })
  vi.stubGlobal('cancelAnimationFrame', vi.fn())
  return {
    flush() {
      const pending = callbacks.splice(0)
      for (const callback of pending) callback(performance.now())
    },
  }
}

function mockElementHeight(el: HTMLElement, height: number) {
  Object.defineProperty(el, 'offsetHeight', {
    configurable: true,
    get: () => height,
  })
  Object.defineProperty(el, 'getBoundingClientRect', {
    configurable: true,
    value: () => ({ height }) as DOMRect,
  })
}

async function mountVirtualWindow(input: Readonly<{
  itemKeys: string[]
  scrollTop?: number
  clientHeight?: number
  scrollHeight?: number
}>) {
  const holder: { api?: ReturnType<typeof useVirtualWindow> } = {}
  const items = ref(input.itemKeys)
  const scrollTopSpy = vi.fn(() => input.scrollTop ?? 0)
  const container = document.createElement('div')
  document.body.appendChild(container)

  const app = createApp({
    setup() {
      const scroller = ref<HTMLElement | null>(null)
      holder.api = useVirtualWindow({
        items,
        scrollEl: scroller,
        estimatedHeight: 68,
        overscan: 2,
      })
      return { scroller }
    },
    template: '<div ref="scroller"></div>',
  })

  app.mount(container)
  await nextTick()

  const scroller = container.firstElementChild as HTMLElement
  Object.defineProperty(scroller, 'scrollTop', {
    configurable: true,
    get: scrollTopSpy,
    set: vi.fn(),
  })
  Object.defineProperty(scroller, 'clientHeight', {
    configurable: true,
    get: () => input.clientHeight ?? 200,
  })
  Object.defineProperty(scroller, 'scrollHeight', {
    configurable: true,
    get: () => input.scrollHeight ?? 200,
  })
  await nextTick()
  if (!holder.api) throw new Error('useVirtualWindow test harness failed to mount')
  holder.api.refresh()

  return {
    api: holder.api,
    items,
    scrollTopSpy,
    unmount() {
      app.unmount()
      container.remove()
    },
  }
}

describe('useVirtualWindow', () => {
  let raf: ReturnType<typeof installRafStub>

  beforeEach(() => {
    raf = installRafStub()
  })

  afterEach(() => {
    vi.unstubAllGlobals()
    document.body.innerHTML = ''
  })

  it('does not update range when measure flush has no height changes', async () => {
    const h = await mountVirtualWindow({ itemKeys: ['row-1'], scrollTop: 0 })
    const row = document.createElement('button')
    mockElementHeight(row, 100)

    h.api.measureElement('row-1', row)
    raf.flush()

    h.scrollTopSpy.mockClear()
    h.api.measureElement('row-1', row)
    raf.flush()

    expect(h.scrollTopSpy).not.toHaveBeenCalled()
    h.unmount()
  })

  it('does not rewrite virtual range refs when computed range is unchanged', async () => {
    const h = await mountVirtualWindow({ itemKeys: ['row-1', 'row-2', 'row-3'], scrollTop: 0 })
    const beforeRange = h.api.range.value
    const beforeTop = h.api.topPaddingPx.value
    const beforeBottom = h.api.bottomPaddingPx.value

    const changed = h.api.refresh()

    expect(changed).toBe(false)
    expect(h.api.range.value).toBe(beforeRange)
    expect(h.api.topPaddingPx.value).toBe(beforeTop)
    expect(h.api.bottomPaddingPx.value).toBe(beforeBottom)
    h.unmount()
  })
})
