import { afterEach, describe, expect, it, vi } from 'vitest'
vi.mock('electron', () => ({ session: {} }))
import { createNetworkProxyDraftProbe } from './networkProxyDraftProbe'
import { DEFAULT_NETWORK_PROXY_SETTINGS, defaultBrowserProxySettings } from '../../src/shared/plugin-distribution/networkProxyShared'

const request = (id = 'probe-1', url = 'https://public.test/') => ({ id, url, scope: 'application' as const,
  configuration: { application: DEFAULT_NETWORK_PROXY_SETTINGS, browser: defaultBrowserProxySettings() } })
function fixture(status = 401, timeoutMs = 1000) {
  const target = { setProxy: vi.fn(async () => undefined), forceReloadProxyConfig: vi.fn(async () => undefined),
    closeAllConnections: vi.fn(async () => undefined), resolveProxy: vi.fn(async () => 'PROXY http://user:secret@proxy.test:80'),
    fetch: vi.fn(async (_url: string, _init?: RequestInit) => new Response(null, { status })),
    clearStorageData: vi.fn(async () => undefined), clearCache: vi.fn(async () => undefined), clearAuthCache: vi.fn(async () => undefined) }
  const createSession = vi.fn(() => target)
  const runner = createNetworkProxyDraftProbe({ createSession, resolveHostname: async () => ['93.184.215.14'], timeoutMs })
  return { target, createSession, runner }
}
afterEach(() => vi.useRealTimers())
describe('isolated draft proxy diagnostics', () => {
  it.each([401, 403, 405, 200])('reports HTTP %i without assuming model availability or sending credentials', async (status) => {
    const f = fixture(status)
    const result = await f.runner.probeDraft(request())
    expect(result).toMatchObject({ ok: true, configurationValid: true, httpStatus: status, code: 'http_response_received' })
    expect(JSON.stringify(result)).not.toContain('secret')
    expect(f.target.fetch).toHaveBeenCalledWith('https://public.test/', expect.objectContaining({ method: 'HEAD', credentials: 'omit', cache: 'no-store', redirect: 'manual' }))
    expect(f.target.clearStorageData).toHaveBeenCalledTimes(1)
    expect(f.target.clearAuthCache).toHaveBeenCalledTimes(1)
  })
  it('reports 407 separately and rejects private targets and URL credentials', async () => {
    const f = fixture(407)
    expect(await f.runner.probeDraft(request())).toMatchObject({ ok: false, code: 'proxy_auth_required', httpStatus: 407 })
    f.target.fetch.mockClear()
    expect(await f.runner.probeDraft(request('private', 'http://127.0.0.1/'))).toMatchObject({ ok: false, code: 'url_host_not_allowed' })
    expect(await f.runner.probeDraft(request('credential', 'https://user:secret@public.test/'))).toMatchObject({ ok: false, code: 'url_credentials_not_allowed' })
    expect(f.target.fetch).not.toHaveBeenCalled()
  })
  it('validates redirects before requesting the next hop', async () => {
    const f = fixture()
    f.target.fetch.mockResolvedValueOnce(new Response(null, { status: 302, headers: { location: 'http://127.0.0.1/private' } }))
    expect(await f.runner.probeDraft(request())).toMatchObject({ code: 'url_host_not_allowed', ok: false })
    expect(f.target.fetch).toHaveBeenCalledTimes(1)
  })
  it('bounds setup and proxy resolution, cleans cancelled sessions, and serializes waiting probes', async () => {
    vi.useFakeTimers()
    const f = fixture(200, 10_000)
    let release!: () => void
    f.target.resolveProxy.mockImplementationOnce(() => new Promise<string>((resolve) => { release = () => resolve('DIRECT') }))
    const first = f.runner.probeDraft(request('first'))
    await vi.advanceTimersByTimeAsync(1)
    const second = f.runner.probeDraft(request('second'))
    expect(f.createSession).toHaveBeenCalledTimes(1)
    f.runner.cancel('first')
    expect(await first).toMatchObject({ code: 'proxy_probe_cancelled' })
    expect(f.target.closeAllConnections).toHaveBeenCalledTimes(1)
    expect(await second).toMatchObject({ ok: true })
    release()
    await vi.advanceTimersByTimeAsync(1)
    expect(f.target.fetch).toHaveBeenCalledTimes(1)
    f.target.setProxy.mockImplementationOnce(() => new Promise(() => undefined))
    const timeout = f.runner.probeDraft(request('timeout'))
    await vi.advanceTimersByTimeAsync(10_001)
    expect(await timeout).toMatchObject({ code: 'proxy_connection_timeout' })
  })
  it('compiles the browser independent draft and never needs a live controller or store', async () => {
    const f = fixture()
    const input = request()
    const draft = { ...input, scope: 'browser' as const, configuration: { ...input.configuration,
      browser: { mode: 'independent' as const, settings: { ...DEFAULT_NETWORK_PROXY_SETTINGS, proxyMode: 'manual' as const, manualProxyUrl: 'socks5://127.0.0.1:1080' } } } }
    await f.runner.probeDraft(draft)
    expect(f.target.setProxy).toHaveBeenCalledWith({ mode: 'fixed_servers', proxyRules: 'http=socks5://127.0.0.1:1080;https=socks5://127.0.0.1:1080' })
  })
})
