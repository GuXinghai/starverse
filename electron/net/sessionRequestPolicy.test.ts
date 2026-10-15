import { describe, expect, it, vi } from 'vitest'
import { applySessionRequestPolicy } from './sessionRequestPolicy'

describe('one composed browser session request policy', () => {
  it('gates subresources and WebSocket handshakes with both readiness and caller policy', () => {
    const onBeforeRequest = vi.fn()
    let ready = false
    applySessionRequestPolicy({ webRequest: { onBeforeRequest } }, (raw) => {
      const url = new URL(raw)
      if (url.protocol === 'ws:') url.protocol = 'http:'
      return ready && url.origin === 'http://127.0.0.1:5177'
    })
    expect(onBeforeRequest).toHaveBeenCalledTimes(1)
    expect(onBeforeRequest.mock.calls[0][0].urls).toEqual(['http://*/*', 'https://*/*', 'ws://*/*', 'wss://*/*'])
    const handler = onBeforeRequest.mock.calls[0][1]
    const callback = vi.fn()
    handler({ url: 'http://127.0.0.1:5177/subresource' }, callback)
    expect(callback).toHaveBeenLastCalledWith({ cancel: true })
    ready = true
    handler({ url: 'ws://127.0.0.1:5177/socket' }, callback)
    expect(callback).toHaveBeenLastCalledWith({ cancel: false })
    handler({ url: 'https://external.test/script.js' }, callback)
    expect(callback).toHaveBeenLastCalledWith({ cancel: true })
  })
  it('cancels requests when the composed predicate throws', () => {
    const onBeforeRequest = vi.fn()
    applySessionRequestPolicy({ webRequest: { onBeforeRequest } }, () => { throw new Error('unavailable') })
    const callback = vi.fn()
    onBeforeRequest.mock.calls[0][1]({ url: 'https://public.test/' }, callback)
    expect(callback).toHaveBeenCalledExactlyOnceWith({ cancel: true })
  })
})
