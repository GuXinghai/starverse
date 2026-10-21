import { EventEmitter } from 'node:events'
import { PassThrough } from 'node:stream'
import { beforeEach, describe, expect, it, vi } from 'vitest'

const mock = vi.hoisted(() => ({ request: vi.fn() }))
vi.mock('electron', () => ({ net: { request: mock.request } }))
import { electronManualRedirectFetch } from './electronManualRedirectFetch'

function fixture() {
  const request = Object.assign(new EventEmitter(), { setHeader: vi.fn(), end: vi.fn(), abort: vi.fn() })
  mock.request.mockReturnValue(request)
  const session = {} as Electron.Session
  return { request, session }
}
describe('Electron manual redirect adapter', () => {
  beforeEach(() => mock.request.mockReset())
  it('exposes a redirect without following it and retains the supplied session', async () => {
    const f = fixture()
    const pending = electronManualRedirectFetch(f.session, 'https://api.github.com/asset', { redirect: 'manual' })
    f.request.emit('redirect', 302, 'GET', 'https://release-assets.githubusercontent.com/file', { 'x-test': ['one', 'two'] })
    const response = await pending
    expect(response.status).toBe(302)
    expect(response.headers.get('location')).toBe('https://release-assets.githubusercontent.com/file')
    expect(mock.request).toHaveBeenCalledWith(expect.objectContaining({ session: f.session, redirect: 'manual' }))
    expect(f.request.abort).toHaveBeenCalledOnce()
    f.request.emit('error', new Error('Redirect was cancelled'))
  })
  it('streams decoded data and preserves body errors', async () => {
    const f = fixture()
    const pending = electronManualRedirectFetch(f.session, 'https://example.org/')
    f.request.emit('close')
    const incoming = Object.assign(new PassThrough(), { statusCode: 200, statusMessage: 'OK', headers: { 'content-encoding': 'gzip', 'content-length': '42' } })
    f.request.emit('response', incoming)
    const response = await pending
    expect(response.headers.has('content-encoding')).toBe(false)
    incoming.end('decoded')
    expect(await response.text()).toBe('decoded')
    const second = fixture()
    const next = electronManualRedirectFetch(second.session, 'https://example.org/')
    const broken = Object.assign(new PassThrough(), { statusCode: 200, statusMessage: 'OK', headers: {} })
    second.request.emit('response', broken)
    const reading = (await next).text()
    broken.destroy(new Error('body_failed'))
    await expect(reading).rejects.toThrow('body_failed')
  })
  it('handles HEAD and cancellation before and after headers', async () => {
    const f = fixture()
    const controller = new AbortController()
    const pending = electronManualRedirectFetch(f.session, 'https://example.org/', { method: 'HEAD', signal: controller.signal })
    const incoming = Object.assign(new PassThrough(), { statusCode: 200, statusMessage: 'OK', headers: {} })
    f.request.emit('response', incoming)
    expect((await pending).body).toBeNull()
    controller.abort()
    expect(f.request.abort).toHaveBeenCalledOnce()
    const second = fixture()
    const stop = new AbortController()
    const next = electronManualRedirectFetch(second.session, 'https://example.org/', { signal: stop.signal })
    stop.abort()
    await expect(next).rejects.toMatchObject({ name: 'AbortError' })
    expect(second.request.abort).toHaveBeenCalledOnce()
  })
  it('aborts native traffic when its response body is cancelled', async () => {
    const f = fixture()
    const pending = electronManualRedirectFetch(f.session, 'https://example.org/')
    const incoming = Object.assign(new PassThrough(), { statusCode: 200, statusMessage: 'OK', headers: {} })
    f.request.emit('response', incoming)
    await (await pending).body!.cancel()
    expect(f.request.abort).toHaveBeenCalledOnce()
  })
})
