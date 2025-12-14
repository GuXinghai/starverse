import { nextTick, ref } from 'vue'

export type StickToBottomOptions = Readonly<{
  nearBottomThreshold?: number
  lockCooldownMs?: number
}>

function distanceFromBottom(el: HTMLElement): number {
  return el.scrollHeight - (el.scrollTop + el.clientHeight)
}

function isNearBottom(el: HTMLElement, threshold: number): boolean {
  return distanceFromBottom(el) <= threshold
}

export function useStickToBottom(options: StickToBottomOptions = {}) {
  const nearBottomThreshold = options.nearBottomThreshold ?? 40
  const lockCooldownMs = options.lockCooldownMs ?? 800

  const containerEl = ref<HTMLElement | null>(null)

  const locked = ref(false)
  const nearBottom = ref(true)
  const showScrollToBottom = ref(false)

  const lastUserScrollAt = ref(0)
  const programmaticScrollUntil = ref(0)

  function updateFromScrollPosition(el: HTMLElement) {
    const near = isNearBottom(el, nearBottomThreshold)
    nearBottom.value = near
    locked.value = !near
    showScrollToBottom.value = !near
  }

  function setContainer(el: HTMLElement | null) {
    const prev = containerEl.value
    if (prev === el) return
    if (prev) prev.removeEventListener('scroll', onScroll, { passive: true } as any)
    containerEl.value = el
    if (el) {
      el.addEventListener('scroll', onScroll, { passive: true } as any)
      updateFromScrollPosition(el)
    }
  }

  function onScroll() {
    const el = containerEl.value
    if (!el) return

    const now = Date.now()
    const isProgrammatic = now <= programmaticScrollUntil.value
    if (!isProgrammatic) {
      lastUserScrollAt.value = now
    }
    updateFromScrollPosition(el)
  }

  function scrollToBottom() {
    const el = containerEl.value
    if (!el) return
    programmaticScrollUntil.value = Date.now() + 120
    el.scrollTop = el.scrollHeight
    updateFromScrollPosition(el)
  }

  async function onNewContent() {
    const el = containerEl.value
    if (!el) return

    const now = Date.now()
    const wasNear = isNearBottom(el, nearBottomThreshold)
    const inCooldown = now - lastUserScrollAt.value < lockCooldownMs

    await nextTick()
    const elAfter = containerEl.value
    if (!elAfter) return

    updateFromScrollPosition(elAfter)
    if (inCooldown) return
    if (!wasNear) return
    scrollToBottom()
  }

  function dispose() {
    const el = containerEl.value
    if (el) el.removeEventListener('scroll', onScroll, { passive: true } as any)
  }

  return {
    containerEl,
    setContainer,
    locked,
    nearBottom,
    showScrollToBottom,
    onNewContent,
    scrollToBottom,
    dispose,
  }
}
