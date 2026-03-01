let metricsInstalled = false
let scheduledRafId = 0
const isDev = (import.meta as any).env?.DEV === true

function parsePxNumber(value: string): number {
  const normalized = String(value ?? '').trim().replace(/px$/i, '')
  const parsed = Number(normalized)
  return Number.isFinite(parsed) ? Math.max(0, Math.round(parsed)) : 0
}

function scheduleFrame(callback: () => void) {
  if (typeof requestAnimationFrame === 'function') {
    return requestAnimationFrame(callback)
  }
  return setTimeout(callback, 0) as unknown as number
}

export function updateScrollbarMetrics(): void {
  if (typeof document === 'undefined' || !document.body) return
  const doc = document.documentElement
  const el = document.createElement('div')

  el.style.position = 'absolute'
  el.style.top = '-9999px'
  el.style.left = '-9999px'
  el.style.width = '100px'
  el.style.height = '100px'
  el.style.overflow = 'scroll'

  document.body.appendChild(el)

  const sbW = Math.max(0, Math.round(el.offsetWidth - el.clientWidth))
  const measuredSbH = Math.max(0, Math.round(el.offsetHeight - el.clientHeight))

  document.body.removeChild(el)

  const currentSbH = parsePxNumber(getComputedStyle(doc).getPropertyValue('--sv-scrollbar-h'))
  const sbH = Math.max(currentSbH, measuredSbH)
  doc.style.setProperty('--sv-scrollbar-w', `${sbW}px`)
  doc.style.setProperty('--sv-scrollbar-h', `${sbH}px`)
  if (isDev) {
    console.info('[scrollbar-metrics] global-measure', {
      sbW,
      measuredSbH,
      currentSbH,
      appliedSbH: sbH,
      readyState: document.readyState,
      hasBody: Boolean(document.body),
    })
  }
}

export function updateScrollbarMetricsFromElement(el: HTMLElement): void {
  if (typeof document === 'undefined') return
  const doc = document.documentElement
  const measuredFromElement = Math.max(0, Math.round(el.offsetHeight - el.clientHeight))
  const currentSbH = parsePxNumber(getComputedStyle(doc).getPropertyValue('--sv-scrollbar-h'))
  const appliedSbH = Math.max(currentSbH, measuredFromElement)
  if (appliedSbH > 0) {
    doc.style.setProperty('--sv-scrollbar-h', `${appliedSbH}px`)
  }
  if (isDev) {
    const cssScrollbarH = getComputedStyle(doc).getPropertyValue('--sv-scrollbar-h').trim()
    console.info('[scrollbar-metrics] element-backfill', {
      measuredFromElement,
      currentSbH,
      appliedSbH,
      cssScrollbarH,
      offsetHeight: el.offsetHeight,
      clientHeight: el.clientHeight,
      scrollHeight: el.scrollHeight,
      scrollWidth: el.scrollWidth,
      clientWidth: el.clientWidth,
    })
  }
}

export function installScrollbarMetrics(): void {
  if (metricsInstalled || typeof window === 'undefined') return
  metricsInstalled = true

  const schedule = () => {
    if (scheduledRafId) return
    scheduledRafId = scheduleFrame(() => {
      scheduledRafId = 0
      if (!document.body) return
      updateScrollbarMetrics()
    })
  }

  if (document.readyState === 'loading') {
    window.addEventListener('DOMContentLoaded', schedule, { once: true })
  } else {
    schedule()
  }

  window.addEventListener('resize', schedule)
  if (window.visualViewport) {
    window.visualViewport.addEventListener('resize', schedule)
  }
}
