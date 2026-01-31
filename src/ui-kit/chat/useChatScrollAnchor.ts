import { computed, onBeforeUnmount, onMounted, ref, watch } from 'vue'
import type { Ref } from 'vue'

export type ScrollAnchorMode = 'follow-tail' | 'user-browsing' | 'jumping'

type AnchorMetrics = Readonly<{ key: string; offset: number }>

type ScrollAnchorOptions = Readonly<{
  scrollEl: Ref<HTMLElement | null>
  bottomSlackPx?: number
  userScrollSlackPx?: number
  getContentHeight: () => number
  getViewportHeight: () => number
  getAnchor?: () => AnchorMetrics | null
  getOffsetForKey?: (key: string) => number | null
}>

const JUMPING_WINDOW_MS = 200

export function useChatScrollAnchor(options: ScrollAnchorOptions) {
  const mode = ref<ScrollAnchorMode>('follow-tail')
  const bottomSlackPx = ref(options.bottomSlackPx ?? 48)
  const userScrollSlackPx = ref(options.userScrollSlackPx ?? 12)

  const anchorAdjustCount = ref(0)
  const followTailCount = ref(0)
  const userBrowsingCount = ref(0)
  const jumpingCount = ref(0)

  const showScrollToBottom = computed(() => mode.value !== 'follow-tail')

  const lastScrollTop = ref(0)
  const scrollDeltaAccum = ref(0)
  const jumpingUntil = ref(0)
  const lastAnchor = ref<AnchorMetrics | null>(null)

  function distanceToBottom(el: HTMLElement): number {
    return Math.max(0, options.getContentHeight() - (el.scrollTop + options.getViewportHeight()))
  }

  function setMode(next: ScrollAnchorMode) {
    if (next === mode.value) return
    mode.value = next
    if (next === 'follow-tail') followTailCount.value += 1
    if (next === 'user-browsing') userBrowsingCount.value += 1
    if (next === 'jumping') jumpingCount.value += 1
  }

  function updateAnchorFromViewport() {
    const anchor = options.getAnchor?.() ?? null
    if (anchor && anchor.key) {
      lastAnchor.value = anchor
    }
  }

  function onScroll() {
    const el = options.scrollEl.value
    if (!el) return
    const now = Date.now()
    const isJumping = now <= jumpingUntil.value
    if (isJumping) return

    const nextDistance = distanceToBottom(el)
    const delta = Math.abs(el.scrollTop - lastScrollTop.value)
    const prevMode = mode.value
    if (nextDistance <= bottomSlackPx.value) {
      setMode('follow-tail')
    } else {
      // 只要离开底部阈值，就进入浏览模式，避免被持续拉回底部
      setMode('user-browsing')
    }

    lastScrollTop.value = el.scrollTop
    if (mode.value === 'user-browsing') {
      if (prevMode !== 'user-browsing') {
        scrollDeltaAccum.value = 0
        updateAnchorFromViewport()
        return
      }
      scrollDeltaAccum.value += delta
      if (scrollDeltaAccum.value >= userScrollSlackPx.value || !lastAnchor.value) {
        updateAnchorFromViewport()
        scrollDeltaAccum.value = 0
      }
    } else {
      scrollDeltaAccum.value = 0
    }
  }

  function scrollToBottom() {
    const el = options.scrollEl.value
    if (!el) return
    jumpingUntil.value = Date.now() + JUMPING_WINDOW_MS
    const target = Math.max(0, options.getContentHeight() - options.getViewportHeight())
    el.scrollTop = target
    setMode(distanceToBottom(el) <= bottomSlackPx.value ? 'follow-tail' : 'user-browsing')
  }

  function scrollToKey(key: string) {
    const el = options.scrollEl.value
    if (!el) return
    const offset = options.getOffsetForKey?.(key)
    if (offset === null || offset === undefined) return
    jumpingUntil.value = Date.now() + JUMPING_WINDOW_MS
    el.scrollTop = Math.max(0, offset)
    setMode(distanceToBottom(el) <= bottomSlackPx.value ? 'follow-tail' : 'user-browsing')
  }

  function setJumping() {
    jumpingUntil.value = Date.now() + JUMPING_WINDOW_MS
    setMode('jumping')
  }

  function notifyContentChanged() {
    const el = options.scrollEl.value
    if (!el) return

    const distance = distanceToBottom(el)
    if (mode.value === 'follow-tail' && distance > bottomSlackPx.value) {
      setMode('user-browsing')
      updateAnchorFromViewport()
    }

    if (mode.value === 'follow-tail') {
      scrollToBottom()
      return
    }

    if (mode.value !== 'user-browsing') return

    const anchor = lastAnchor.value ?? options.getAnchor?.() ?? null
    if (!anchor || !anchor.key) return
    const offset = options.getOffsetForKey?.(anchor.key)
    if (offset === null || offset === undefined) return
    const desiredScrollTop = Math.max(0, offset - anchor.offset)
    if (Math.abs(desiredScrollTop - el.scrollTop) < 0.5) return
    el.scrollTop = desiredScrollTop
    anchorAdjustCount.value += 1
  }

  onMounted(() => {
    const el = options.scrollEl.value
    if (el) {
      lastScrollTop.value = el.scrollTop
      el.addEventListener('scroll', onScroll, { passive: true })
      updateAnchorFromViewport()
    }
  })

  onBeforeUnmount(() => {
    const el = options.scrollEl.value
    if (el) el.removeEventListener('scroll', onScroll)
  })

  watch(
    () => options.scrollEl.value,
    (el, prev) => {
      if (prev) prev.removeEventListener('scroll', onScroll)
      if (el) {
        lastScrollTop.value = el.scrollTop
        el.addEventListener('scroll', onScroll, { passive: true })
        updateAnchorFromViewport()
      }
    },
  )

  return {
    mode,
    showScrollToBottom,
    anchorAdjustCount,
    followTailCount,
    userBrowsingCount,
    jumpingCount,
    scrollToBottom,
    scrollToKey,
    setJumping,
    notifyContentChanged,
  }
}
