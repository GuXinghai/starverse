import { afterEach, describe, expect, it, vi } from 'vitest'
import { updateScrollbarMetrics, updateScrollbarMetricsFromElement } from './scrollbarMetrics'

describe('scrollbarMetrics', () => {
  afterEach(() => {
    vi.restoreAllMocks()
    document.documentElement.style.removeProperty('--sv-scrollbar-w')
    document.documentElement.style.removeProperty('--sv-scrollbar-h')
  })

  it('writes measured scrollbar metrics into css variables', () => {
    const originalCreateElement = document.createElement.bind(document)
    vi.spyOn(document, 'createElement').mockImplementation((tagName: string) => {
      const el = originalCreateElement(tagName)
      if (String(tagName).toLowerCase() === 'div') {
        Object.defineProperty(el, 'offsetWidth', { value: 100, configurable: true })
        Object.defineProperty(el, 'clientWidth', { value: 84, configurable: true })
        Object.defineProperty(el, 'offsetHeight', { value: 100, configurable: true })
        Object.defineProperty(el, 'clientHeight', { value: 90, configurable: true })
      }
      return el
    })

    updateScrollbarMetrics()

    expect(document.documentElement.style.getPropertyValue('--sv-scrollbar-w')).toBe('16px')
    expect(document.documentElement.style.getPropertyValue('--sv-scrollbar-h')).toBe('10px')
  })

  it('backfills scrollbar height from actual element when positive', () => {
    const el = document.createElement('div')
    Object.defineProperty(el, 'offsetHeight', { value: 48, configurable: true })
    Object.defineProperty(el, 'clientHeight', { value: 36, configurable: true })

    updateScrollbarMetricsFromElement(el)

    expect(document.documentElement.style.getPropertyValue('--sv-scrollbar-h')).toBe('12px')
  })

  it('keeps existing scrollbar height when element backfill is smaller', () => {
    document.documentElement.style.setProperty('--sv-scrollbar-h', '16px')
    const el = document.createElement('div')
    Object.defineProperty(el, 'offsetHeight', { value: 55, configurable: true })
    Object.defineProperty(el, 'clientHeight', { value: 40, configurable: true })

    updateScrollbarMetricsFromElement(el)

    expect(document.documentElement.style.getPropertyValue('--sv-scrollbar-h')).toBe('16px')
  })

  it('keeps existing scrollbar height when global measure is smaller', () => {
    document.documentElement.style.setProperty('--sv-scrollbar-h', '16px')
    const originalCreateElement = document.createElement.bind(document)
    vi.spyOn(document, 'createElement').mockImplementation((tagName: string) => {
      const el = originalCreateElement(tagName)
      if (String(tagName).toLowerCase() === 'div') {
        Object.defineProperty(el, 'offsetWidth', { value: 100, configurable: true })
        Object.defineProperty(el, 'clientWidth', { value: 85, configurable: true })
        Object.defineProperty(el, 'offsetHeight', { value: 100, configurable: true })
        Object.defineProperty(el, 'clientHeight', { value: 85, configurable: true })
      }
      return el
    })

    updateScrollbarMetrics()

    expect(document.documentElement.style.getPropertyValue('--sv-scrollbar-h')).toBe('16px')
    expect(document.documentElement.style.getPropertyValue('--sv-scrollbar-w')).toBe('15px')
  })
})
