import type Store from 'electron-store'
import type { ProxyConfig } from 'electron'
import {
  DEFAULT_NETWORK_PROXY_SETTINGS,
  parseNetworkProxySettingsStrict,
  type NetworkProxySettings,
} from '../../src/shared/plugin-distribution/networkProxyShared'

export const NETWORK_PROXY_SETTINGS_V2_STORE_KEY = 'networkProxySettingsV2' as const

export type ProductNetworkProxyV2ErrorCode =
  | 'proxy_settings_invalid'
  | 'proxy_environment_unavailable'
  | 'proxy_environment_invalid'
  | 'proxy_manual_invalid'
  | 'proxy_auth_required'
  | 'proxy_bypass_invalid'
  | 'proxy_strict_ssl_unsupported'
  | 'proxy_session_apply_failed'
  | 'proxy_store_unavailable'
  | 'proxy_store_rollback_failed'

export type CompiledProductNetworkProxyV2 = Readonly<{
  settings: NetworkProxySettings
  electronConfig: ProxyConfig
}>

export type ProductNetworkProxyV2CompileResult =
  | Readonly<{ ok: true; value: CompiledProductNetworkProxyV2 }>
  | ProductNetworkProxyV2Failure

type ProductNetworkProxyV2Failure = Readonly<{
  ok: false
  code: ProductNetworkProxyV2ErrorCode
  message: string
}>

export type ProductNetworkProxyV2State = Readonly<{
  status: 'uninitialized' | 'ready' | 'blocked'
  settings: NetworkProxySettings
  errorCode: ProductNetworkProxyV2ErrorCode | null
  appliedAtMs: number | null
}>

export type ProductNetworkProxyV2Result =
  | Readonly<{ ok: true; settings: NetworkProxySettings; state: ProductNetworkProxyV2State }>
  | Readonly<{ ok: false; code: ProductNetworkProxyV2ErrorCode; message: string; settings: NetworkProxySettings; state: ProductNetworkProxyV2State }>

export type ProductNetworkProxyV2Session = Readonly<{
  setProxy: (config: ProxyConfig) => Promise<void>
  forceReloadProxyConfig: () => Promise<void>
  closeAllConnections: () => Promise<void>
  resolveProxy: (url: string) => Promise<string>
}>

type ProductNetworkProxyV2Store = Pick<Store, 'get' | 'set'>

export type ProductNetworkProxyV2Controller = Readonly<{
  getSettings: () => ProductNetworkProxyV2Result
  updateSettings: (value: unknown) => Promise<ProductNetworkProxyV2Result>
  resetSettings: () => Promise<ProductNetworkProxyV2Result>
  applyStoredSettings: () => Promise<ProductNetworkProxyV2Result>
  getState: () => ProductNetworkProxyV2State
  assertGovernedRequestAvailable: () => void
  resolveProxy: (url: unknown) => Promise<Readonly<{
    ok: true
    resolvedProxy: string
    proxyKind: 'DIRECT' | 'PROXY configured' | 'unknown/error'
  }> | Readonly<{ ok: false; code: ProductNetworkProxyV2ErrorCode | 'invalid_url'; message: string }>>
}>

export function compileProductNetworkProxyV2(
  value: unknown,
  env: Readonly<Record<string, string | undefined>> = process.env,
): ProductNetworkProxyV2CompileResult {
  let settings: NetworkProxySettings
  try {
    settings = parseNetworkProxySettingsStrict(value)
  } catch {
    return failure('proxy_settings_invalid', 'Network proxy settings are invalid.')
  }
  if (!settings.strictSSL) {
    return failure('proxy_strict_ssl_unsupported', 'Disabling TLS certificate validation is not supported.')
  }

  if (settings.proxyMode === 'direct' || settings.proxyMode === 'system') {
    return success(settings, { mode: settings.proxyMode })
  }

  const bypassInput = settings.proxyMode === 'environment'
    ? firstNonEmpty(env.no_proxy, env.NO_PROXY)
    : settings.noProxy
  const bypass = compileBypassRules(bypassInput)
  if (!bypass.ok) return bypass

  if (settings.proxyMode === 'manual') {
    const proxy = parseProxyUrl(settings.manualProxyUrl, 'proxy_manual_invalid')
    if (!proxy.ok) return proxy
    return success(settings, {
      mode: 'fixed_servers',
      proxyRules: `http=${proxy.value};https=${proxy.value}`,
      ...(bypass.value ? { proxyBypassRules: bypass.value } : {}),
    })
  }

  const httpRaw = firstNonEmpty(env.http_proxy, env.HTTP_PROXY)
  const httpsRaw = firstNonEmpty(env.https_proxy, env.HTTPS_PROXY)
  if (!httpRaw && !httpsRaw) {
    return failure('proxy_environment_unavailable', 'Proxy environment variables are not available.')
  }
  const httpProxy = httpRaw ? parseProxyUrl(httpRaw, 'proxy_environment_invalid') : null
  if (httpProxy && !httpProxy.ok) return httpProxy
  const httpsProxy = httpsRaw ? parseProxyUrl(httpsRaw, 'proxy_environment_invalid') : null
  if (httpsProxy && !httpsProxy.ok) return httpsProxy

  const rules: string[] = []
  if (httpProxy?.ok) rules.push(`http=${httpProxy.value}`)
  if (httpsProxy?.ok) rules.push(`https=${httpsProxy.value}`)
  else if (httpProxy?.ok) rules.push(`https=${httpProxy.value}`)
  return success(settings, {
    mode: 'fixed_servers',
    proxyRules: rules.join(';'),
    ...(bypass.value ? { proxyBypassRules: bypass.value } : {}),
  })
}

export function createProductNetworkProxyV2Controller(input: Readonly<{
  store: ProductNetworkProxyV2Store
  session: ProductNetworkProxyV2Session
  env?: Readonly<Record<string, string | undefined>> | (() => Readonly<Record<string, string | undefined>>)
  nowMs?: () => number
}>): ProductNetworkProxyV2Controller {
  const nowMs = input.nowMs ?? Date.now
  let state: ProductNetworkProxyV2State = Object.freeze({
    status: 'uninitialized',
    settings: DEFAULT_NETWORK_PROXY_SETTINGS,
    errorCode: null,
    appliedAtMs: null,
  })

  const currentEnv = () => typeof input.env === 'function' ? input.env() : input.env ?? process.env
  const setBlocked = (settings: NetworkProxySettings, code: ProductNetworkProxyV2ErrorCode): ProductNetworkProxyV2State => {
    state = Object.freeze({ status: 'blocked', settings, errorCode: code, appliedAtMs: null })
    return state
  }
  const setReady = (settings: NetworkProxySettings): ProductNetworkProxyV2State => {
    state = Object.freeze({ status: 'ready', settings, errorCode: null, appliedAtMs: nowMs() })
    return state
  }
  const readStored = (): NetworkProxySettings => parseNetworkProxySettingsStrict(
    input.store.get(NETWORK_PROXY_SETTINGS_V2_STORE_KEY),
  )
  const applyConfig = async (compiled: CompiledProductNetworkProxyV2): Promise<void> => {
    await input.session.setProxy(compiled.electronConfig)
    await input.session.forceReloadProxyConfig()
    await input.session.closeAllConnections()
  }
  const compile = (settings: NetworkProxySettings) => compileProductNetworkProxyV2(settings, currentEnv())
  const publicFailure = (
    code: ProductNetworkProxyV2ErrorCode,
    message: string,
    settings: NetworkProxySettings,
  ): ProductNetworkProxyV2Result => Object.freeze({ ok: false, code, message, settings, state })

  const applyStoredSettings = async (): Promise<ProductNetworkProxyV2Result> => {
    let settings: NetworkProxySettings
    try {
      settings = readStored()
    } catch {
      const fallback = DEFAULT_NETWORK_PROXY_SETTINGS
      setBlocked(fallback, 'proxy_settings_invalid')
      return publicFailure('proxy_settings_invalid', 'Stored network proxy settings are invalid.', fallback)
    }
    const compiled = compile(settings)
    if (!compiled.ok) {
      setBlocked(settings, compiled.code)
      return publicFailure(compiled.code, compiled.message, settings)
    }
    try {
      await applyConfig(compiled.value)
    } catch {
      setBlocked(settings, 'proxy_session_apply_failed')
      return publicFailure('proxy_session_apply_failed', 'Electron session proxy update failed.', settings)
    }
    return Object.freeze({ ok: true, settings, state: setReady(settings) })
  }

  const updateSettings = async (value: unknown): Promise<ProductNetworkProxyV2Result> => {
    let next: NetworkProxySettings
    try {
      next = parseNetworkProxySettingsStrict(value)
    } catch {
      return publicFailure('proxy_settings_invalid', 'Network proxy settings are invalid.', state.settings)
    }
    const compiledNext = compile(next)
    if (!compiledNext.ok) return publicFailure(compiledNext.code, compiledNext.message, next)

    let previous: NetworkProxySettings
    try {
      previous = readStored()
    } catch {
      previous = state.settings
    }
    const compiledPrevious = compile(previous)
    try {
      await applyConfig(compiledNext.value)
    } catch {
      if (compiledPrevious.ok) {
        try { await applyConfig(compiledPrevious.value); setReady(previous) }
        catch { setBlocked(previous, 'proxy_store_rollback_failed') }
      } else {
        setBlocked(previous, compiledPrevious.code)
      }
      return publicFailure('proxy_session_apply_failed', 'Electron session proxy update failed.', next)
    }

    try {
      input.store.set(NETWORK_PROXY_SETTINGS_V2_STORE_KEY, next)
    } catch {
      if (compiledPrevious.ok) {
        try {
          await applyConfig(compiledPrevious.value)
          setReady(previous)
          return publicFailure('proxy_store_unavailable', 'Network proxy settings could not be persisted.', next)
        } catch {
          setBlocked(previous, 'proxy_store_rollback_failed')
        }
      } else {
        setBlocked(previous, 'proxy_store_rollback_failed')
      }
      return publicFailure('proxy_store_rollback_failed', 'Network proxy persistence failed and the prior session policy could not be restored.', next)
    }
    return Object.freeze({ ok: true, settings: next, state: setReady(next) })
  }

  return Object.freeze({
    getSettings: () => {
      try {
        const settings = readStored()
        return Object.freeze({ ok: true, settings, state })
      } catch {
        return publicFailure('proxy_settings_invalid', 'Stored network proxy settings are invalid.', state.settings)
      }
    },
    updateSettings,
    resetSettings: () => updateSettings(DEFAULT_NETWORK_PROXY_SETTINGS),
    applyStoredSettings,
    getState: () => state,
    assertGovernedRequestAvailable: () => {
      if (state.status === 'ready') return
      throw new Error(state.errorCode ?? 'proxy_environment_unavailable')
    },
    resolveProxy: async (rawUrl: unknown) => {
      let url: URL
      try {
        url = new URL(String(rawUrl ?? '').trim())
        if ((url.protocol !== 'http:' && url.protocol !== 'https:') || url.username || url.password) throw new Error('invalid')
      } catch {
        return Object.freeze({ ok: false as const, code: 'invalid_url' as const, message: 'Proxy diagnostic URL is invalid.' })
      }
      if (state.status !== 'ready') {
        return Object.freeze({ ok: false as const, code: state.errorCode ?? 'proxy_environment_unavailable', message: 'Network proxy is unavailable.' })
      }
      try {
        const resolvedProxy = sanitizeResolvedProxy(await input.session.resolveProxy(url.toString()))
        return Object.freeze({ ok: true as const, resolvedProxy, proxyKind: classifyResolvedProxy(resolvedProxy) })
      } catch {
        return Object.freeze({ ok: false as const, code: 'proxy_session_apply_failed' as const, message: 'Proxy resolution failed.' })
      }
    },
  })
}

function success(settings: NetworkProxySettings, electronConfig: ProxyConfig): ProductNetworkProxyV2CompileResult {
  return Object.freeze({ ok: true, value: Object.freeze({ settings, electronConfig: Object.freeze(electronConfig) }) })
}

function failure(code: ProductNetworkProxyV2ErrorCode, message: string): ProductNetworkProxyV2Failure {
  return Object.freeze({ ok: false, code, message })
}

function firstNonEmpty(lower: string | undefined, upper: string | undefined): string {
  const lowerValue = String(lower ?? '').trim()
  return lowerValue || String(upper ?? '').trim()
}

function parseProxyUrl(
  value: string,
  invalidCode: 'proxy_environment_invalid' | 'proxy_manual_invalid',
): Readonly<{ ok: true; value: string }> | Readonly<{ ok: false; code: ProductNetworkProxyV2ErrorCode; message: string }> {
  let parsed: URL
  try { parsed = new URL(value) } catch { return failure(invalidCode, 'Proxy URL is invalid.') }
  if (parsed.username || parsed.password) return failure('proxy_auth_required', 'Proxy credentials require a separate secure credential reference.')
  if ((parsed.protocol !== 'http:' && parsed.protocol !== 'https:') || !parsed.hostname ||
      (parsed.pathname !== '/' && parsed.pathname !== '') || parsed.search || parsed.hash) {
    return failure(invalidCode, 'Proxy URL is invalid.')
  }
  return Object.freeze({ ok: true, value: parsed.origin })
}

function compileBypassRules(value: string):
  | Readonly<{ ok: true; value: string }>
  | Readonly<{ ok: false; code: ProductNetworkProxyV2ErrorCode; message: string }> {
  const raw = String(value ?? '').trim()
  if (!raw) return Object.freeze({ ok: true, value: '' })
  const entries = raw.split(/[;,]/u).map((item) => item.trim())
  if (entries.length > 256 || entries.some((item) => !isSafeBypassEntry(item))) {
    return failure('proxy_bypass_invalid', 'Proxy bypass rules are invalid.')
  }
  return Object.freeze({ ok: true, value: entries.join(';') })
}

function isSafeBypassEntry(value: string): boolean {
  if (!value || value.length > 255 || /[\u0000-\u001f\u007f\s\\@?#]/u.test(value)) return false
  if (value === '<local>' || value === '*') return true
  if (/^\[[0-9a-f:]+\](?::\d{1,5})?(?:\/\d{1,3})?$/iu.test(value)) return validPortAndPrefix(value)
  if (/^(?:\*\.)?\.?[a-z0-9_-]+(?:\.[a-z0-9_-]+)*(?::\d{1,5})?(?:\/\d{1,3})?$/iu.test(value)) return validPortAndPrefix(value)
  return false
}

function validPortAndPrefix(value: string): boolean {
  const port = value.match(/:(\d{1,5})(?:\/|$)/u)?.[1]
  if (port && (Number(port) < 1 || Number(port) > 65535)) return false
  const prefix = value.match(/\/(\d{1,3})$/u)?.[1]
  return !prefix || Number(prefix) <= (value.startsWith('[') ? 128 : 32)
}

function sanitizeResolvedProxy(value: unknown): string {
  return String(value ?? '').trim()
    .replace(/([a-z][a-z0-9+.-]*:\/\/)([^/@\s:;]+)(?::([^/@\s;]+))?@/giu, '$1[redacted]@')
    .replace(/\b(PROXY|HTTPS|SOCKS|SOCKS5)\s+([^/@\s:;]+):([^/@\s;]+)@/giu, '$1 [redacted]@')
    .slice(0, 1024)
}

function classifyResolvedProxy(value: string): 'DIRECT' | 'PROXY configured' | 'unknown/error' {
  if (/^DIRECT(?:\s|$)/iu.test(value)) return 'DIRECT'
  if (/\b(PROXY|HTTPS|SOCKS|SOCKS5)\b/iu.test(value)) return 'PROXY configured'
  return 'unknown/error'
}
