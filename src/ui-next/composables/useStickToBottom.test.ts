import { describe, expect, it } from 'vitest'
import { useStickToBottom } from './useStickToBottom'

function setScrollMetrics(el: HTMLElement, metrics: { scrollTop: number; scrollHeight: number; clientHeight: number }) {
  Object.defineProperty(el, 'scrollTop', { value: metrics.scrollTop, writable: true, configurable: true })
  Object.defineProperty(el, 'scrollHeight', { value: metrics.scrollHeight, configurable: true })
  Object.defineProperty(el, 'clientHeight', { value: metrics.clientHeight, configurable: true })
}

describe('useStickToBottom', () => {
  it('shows scroll-to-bottom when not near bottom', () => {
    const el = document.createElement('div')
    setScrollMetrics(el, { scrollTop: 0, scrollHeight: 1000, clientHeight: 100 })

    const stick = useStickToBottom({ nearBottomThreshold: 40, lockCooldownMs: 800 })
    stick.setContainer(el)

    expect(stick.nearBottom.value).toBe(false)
    expect(stick.locked.value).toBe(true)
    expect(stick.showScrollToBottom.value).toBe(true)
    stick.dispose()
  })

  it('auto-follows on new content when it was near bottom and not in cooldown', async () => {
    const el = document.createElement('div')
    setScrollMetrics(el, { scrollTop: 860, scrollHeight: 1000, clientHeight: 100 }) // distance=40 => near

    const stick = useStickToBottom({ nearBottomThreshold: 40, lockCooldownMs: 800 })
    stick.setContainer(el)

    // call onNewContent before DOM height changes (capture "wasNearBottom"),
    // then simulate DOM update increasing height.
    const p = stick.onNewContent()
    Object.defineProperty(el, 'scrollHeight', { value: 1200, configurable: true })
    await p

    expect(el.scrollTop).toBe(1200)
    stick.dispose()
  })

  it('does not auto-follow during cooldown after user scroll', async () => {
    const el = document.createElement('div')
    setScrollMetrics(el, { scrollTop: 860, scrollHeight: 1000, clientHeight: 100 }) // near

    const stick = useStickToBottom({ nearBottomThreshold: 40, lockCooldownMs: 800 })
    stick.setContainer(el)

    // user scroll (not programmatic) away from bottom
    el.scrollTop = 700
    el.dispatchEvent(new Event('scroll'))

    // back to near bottom immediately
    el.scrollTop = 860
    el.dispatchEvent(new Event('scroll'))

    const p = stick.onNewContent()
    Object.defineProperty(el, 'scrollHeight', { value: 1200, configurable: true })
    await p

    expect(el.scrollTop).toBe(860)
    stick.dispose()
  })
})
