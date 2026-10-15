import type { NetworkProxyDraftProbe, NetworkProxyProbeResult } from '../../src/shared/plugin-distribution/networkProxyShared'
import { effectiveProxySettings, parseProxyConfigurationStrict } from '../../src/shared/plugin-distribution/networkProxyShared'
import { fetchPublicHttpUrl, type ResolveHostname } from '../../infra/files/urlProbe'
import { compileProductNetworkProxyV2, sanitizeResolvedProxy, type ProductNetworkProxyV2Session } from './productNetworkProxyV2'
import { classifyProviderHttpTransportDiagnostic } from './providerHttpTransport'

type ProbeSession = ProductNetworkProxyV2Session & {
  fetch: (url: string, init?: RequestInit) => Promise<Response>
  clearStorageData: () => Promise<void>
  clearCache: () => Promise<void>
  clearAuthCache: () => Promise<void>
}

/** Each probe owns an ephemeral session: cancellation never mutates live traffic. */
export function createNetworkProxyDraftProbe(input: {
  createSession: () => ProbeSession
  env?: () => Readonly<Record<string, string | undefined>>
  resolveHostname?: ResolveHostname
  beforeRequest?: (url: string) => void
  timeoutMs?: number
}) {
  let queue: Promise<unknown> = Promise.resolve()
  const active = new Map<string, AbortController>()
  const probeDraft = (raw: NetworkProxyDraftProbe): Promise<NetworkProxyProbeResult> => {
    const start = Date.now()
    if (!raw || typeof raw.id !== 'string' || !/^[a-zA-Z0-9_-]{1,80}$/.test(raw.id) || active.has(raw.id)) {
      return Promise.resolve({ ok: false, configurationValid: false, resolvedProxy: null, httpStatus: null, elapsedMs: 0, code: 'invalid_probe' })
    }
    const controller = new AbortController()
    active.set(raw.id, controller)
    const timer = setTimeout(() => controller.abort('proxy_connection_timeout'), input.timeoutMs ?? 10_000)
    let configurationValid = false
    let resolvedProxy: string | null = null
    const result = (code: string, httpStatus: number | null = null): NetworkProxyProbeResult => ({
      ok: code === 'http_response_received', configurationValid, resolvedProxy, httpStatus, elapsedMs: Date.now() - start, code,
    })
    // Include queueing, session setup, DNS and proxy resolution in the deadline.
    const aborted = new Promise<NetworkProxyProbeResult>((resolve) => {
      controller.signal.addEventListener('abort', () => resolve(result(String(controller.signal.reason))), { once: true })
    })
    const work = queue.then(async () => {
      let target: ProbeSession | undefined
      let cleaned = false
      const cleanup = () => {
        if (!target || cleaned) return
        cleaned = true
        void Promise.allSettled([target.closeAllConnections(), target.clearStorageData(), target.clearCache(), target.clearAuthCache()])
      }
      controller.signal.addEventListener('abort', cleanup, { once: true })
      try {
        controller.signal.throwIfAborted()
        if (raw.scope !== 'application' && raw.scope !== 'browser') return result('invalid_scope')
        const config = parseProxyConfigurationStrict(raw.configuration)
        const compiled = compileProductNetworkProxyV2(effectiveProxySettings(config, raw.scope), input.env?.() ?? process.env)
        if (!compiled.ok) return result(compiled.code)
        configurationValid = true
        target = input.createSession()
        await target.setProxy(compiled.value.electronConfig)
        await target.forceReloadProxyConfig()
        controller.signal.throwIfAborted()
        const response = await fetchPublicHttpUrl(raw.url, { method: 'HEAD', credentials: 'omit', cache: 'no-store', signal: controller.signal }, {
          resolveHostname: input.resolveHostname,
          fetch: async (url, init) => {
            controller.signal.throwIfAborted()
            input.beforeRequest?.(url)
            resolvedProxy = sanitizeResolvedProxy(await target!.resolveProxy(url))
            controller.signal.throwIfAborted()
            return target!.fetch(url, init)
          },
        })
        await response.body?.cancel()
        return result(response.status === 407 ? 'proxy_auth_required' : 'http_response_received', response.status)
      } catch (error) {
        if (controller.signal.aborted) return result(String(controller.signal.reason))
        // Codes only; never echo a URL, proxy environment value or exception message.
        const code = (error as { code?: unknown })?.code
        return result(typeof code === 'string' && /^[a-zA-Z0-9_]{1,80}$/.test(code) ? code : classifyProviderHttpTransportDiagnostic(error))
      } finally {
        cleanup()
        controller.signal.removeEventListener('abort', cleanup)
      }
    })
    const completed = Promise.race([work, aborted]).finally(() => {
      clearTimeout(timer)
      active.delete(raw.id)
    })
    queue = completed.catch(() => undefined)
    return completed
  }
  return { probeDraft, cancel: (id: string) => { active.get(id)?.abort('proxy_probe_cancelled') } }
}
