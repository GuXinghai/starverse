import type Store from 'electron-store'
import type { ProxyConfig } from 'electron'
import {
  DEFAULT_NETWORK_PROXY_SETTINGS,
  parseNetworkProxySettingsStrict,
  type NetworkProxySettings,
  defaultBrowserProxySettings,
  effectiveProxySettings,
  parseBrowserProxySettingsStrict,
  parseProxyConfigurationStrict,
  type NetworkProxyConfiguration,
  type NetworkProxyScope,
} from '../../src/shared/plugin-distribution/networkProxyShared'

export const NETWORK_PROXY_SETTINGS_V2_STORE_KEY = 'networkProxySettingsV2' as const
export const BROWSER_PROXY_SETTINGS_STORE_KEY = 'inAppBrowserProxySettingsV1' as const

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
  | 'proxy_updating'

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
  status: 'uninitialized' | 'applying' | 'ready' | 'blocked'
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
  resetSettings: (scope?: NetworkProxyScope) => Promise<ProductNetworkProxyV2Result>
  applyStoredSettings: (scope?: NetworkProxyScope) => Promise<ProductNetworkProxyV2Result>
  getState: (scope?: NetworkProxyScope) => ProductNetworkProxyV2State
  getConfiguration: () => ProductProxyConfigurationResult
  updateConfiguration: (value: unknown) => Promise<ProductProxyConfigurationResult>
  getEnvironment: () => Readonly<Record<string, string>>
  assertGovernedRequestAvailable: (scope?: NetworkProxyScope) => void
  resolveProxy: (url: unknown, scope?: NetworkProxyScope) => Promise<Readonly<{
    ok: true
    resolvedProxy: string
    proxyKind: 'DIRECT' | 'PROXY configured' | 'unknown/error'
  }> | Readonly<{ ok: false; code: ProductNetworkProxyV2ErrorCode | 'invalid_url'; message: string }>>
}>

export type ProductProxyConfigurationResult = Readonly<{
  ok: boolean
  code?: ProductNetworkProxyV2ErrorCode
  configuration: NetworkProxyConfiguration
  states: Readonly<Record<NetworkProxyScope, ProductNetworkProxyV2State>>
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

  const allRaw = firstNonEmpty(env.all_proxy, env.ALL_PROXY)
  const httpSpecific = firstNonEmpty(env.http_proxy, env.HTTP_PROXY)
  const httpRaw = httpSpecific || allRaw
  const httpsRaw = firstNonEmpty(env.https_proxy, env.HTTPS_PROXY) || httpSpecific || allRaw
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
  browserSession?: ProductNetworkProxyV2Session
  env?: Readonly<Record<string, string | undefined>> | (() => Readonly<Record<string, string | undefined>>)
  nowMs?: () => number
}>): ProductNetworkProxyV2Controller {
  const nowMs = input.nowMs ?? Date.now
  const currentEnv = () => typeof input.env === 'function' ? input.env() : input.env ?? process.env
  let configuration: NetworkProxyConfiguration = {
    application: DEFAULT_NETWORK_PROXY_SETTINGS, browser: defaultBrowserProxySettings(),
  }
  const sessions = { application: input.session, browser: input.browserSession }
  const applied: Partial<Record<NetworkProxyScope, CompiledProductNetworkProxyV2>> = {}
  const states: Record<NetworkProxyScope, ProductNetworkProxyV2State> = {
    application: stateFor('application', 'uninitialized'), browser: stateFor('browser', 'uninitialized'),
  }
  let initialized = false
  let invalidStored = new Set<NetworkProxyScope>()
  let queue: Promise<unknown> = Promise.resolve()
  const scopes: NetworkProxyScope[] = input.browserSession ? ['application', 'browser'] : ['application']
  function stateFor(scope: NetworkProxyScope, status: ProductNetworkProxyV2State['status'], code: ProductNetworkProxyV2ErrorCode | null = null): ProductNetworkProxyV2State {
    return Object.freeze({ status, settings: effectiveProxySettings(configuration, scope), errorCode: code,
      appliedAtMs: status === 'ready' ? nowMs() : null })
  }
  function enqueue<T>(work: () => Promise<T>): Promise<T> {
    const result = queue.then(work)
    queue = result.catch(() => undefined)
    return result
  }
  const snapshot = (code?: ProductNetworkProxyV2ErrorCode): ProductProxyConfigurationResult => ({
    ok: !code, ...(code ? { code } : {}), configuration,
    states: { application: states.application, browser: states.browser },
  })
  const legacy = (result: ProductProxyConfigurationResult): ProductNetworkProxyV2Result => result.ok
    ? { ok: true, settings: configuration.application, state: states.application }
    : { ok: false, code: result.code ?? 'proxy_settings_invalid', message: result.code ?? 'proxy_settings_invalid',
      settings: configuration.application, state: states.application }
  async function apply(scope: NetworkProxyScope, compiled: CompiledProductNetworkProxyV2): Promise<void> {
    const target = sessions[scope]
    if (!target) return
    await target.setProxy(compiled.electronConfig)
    await target.forceReloadProxyConfig()
    await target.closeAllConnections()
  }
  async function load(scope?: NetworkProxyScope): Promise<ProductProxyConfigurationResult> {
    if (initialized) {
      const targets = scope === 'browser' ? ['browser'] as NetworkProxyScope[]
        : scopes.filter((item) => item === 'application' || (configuration.browser.mode === 'inherit' && !invalidStored.has('browser')))
      return update(configuration, false, targets)
    }
    const invalid = new Set<NetworkProxyScope>()
    let application = configuration.application
    let browser = configuration.browser
    try { application = parseNetworkProxySettingsStrict(input.store.get(NETWORK_PROXY_SETTINGS_V2_STORE_KEY)) }
    catch { invalid.add('application') }
    try { browser = parseBrowserProxySettingsStrict(input.store.get(BROWSER_PROXY_SETTINGS_STORE_KEY)) }
    catch { invalid.add('browser') }
    configuration = { application, browser }
    invalidStored = new Set(invalid)
    if (invalid.has('application') && browser.mode === 'inherit') invalid.add('browser')
    const targets = !initialized ? scopes : scope === 'browser' ? ['browser'] as const
      : scopes.filter((item) => item === 'application' || browser.mode === 'inherit')
    initialized = true
    for (const item of targets) {
      if (invalid.has(item)) { states[item] = stateFor(item, 'blocked', 'proxy_settings_invalid'); continue }
      const compiled = compileProductNetworkProxyV2(effectiveProxySettings(configuration, item), currentEnv())
      if (!compiled.ok) { states[item] = stateFor(item, 'blocked', compiled.code); continue }
      states[item] = stateFor(item, 'applying', 'proxy_updating')
      try {
        await apply(item, compiled.value)
        applied[item] = compiled.value
        states[item] = stateFor(item, 'ready')
      } catch { states[item] = stateFor(item, 'blocked', 'proxy_session_apply_failed') }
    }
    return snapshot(targets.map((item) => states[item].errorCode).find(Boolean) ?? undefined)
  }
  async function update(next: NetworkProxyConfiguration, legacyWrite = false, force: readonly NetworkProxyScope[] = [], repair: readonly NetworkProxyScope[] = []): Promise<ProductProxyConfigurationResult> {
    const previous = configuration
    const previousStates = { ...states }
    const nextCompiled: Partial<Record<NetworkProxyScope, CompiledProductNetworkProxyV2>> = {}
    const targets: NetworkProxyScope[] = []
    const repaired = new Set<NetworkProxyScope>()
    for (const scope of scopes) {
      const changed = scope === 'application' ? JSON.stringify(next.application) !== JSON.stringify(previous.application)
        : JSON.stringify(next.browser) !== JSON.stringify(previous.browser)
      if (invalidStored.has(scope) && (changed || repair.includes(scope))) repaired.add(scope)
    }
    for (const scope of scopes) {
      if (force.length > 0 && !force.includes(scope)) continue
      if (invalidStored.has(scope) && !repaired.has(scope)) {
        if (force.includes(scope)) return snapshot('proxy_settings_invalid')
        continue
      }
      if (scope === 'browser' && next.browser.mode === 'inherit' && invalidStored.has('application') && !repaired.has('application')) {
        return snapshot('proxy_settings_invalid')
      }
      const settings = effectiveProxySettings(next, scope)
      const changed = JSON.stringify(settings) !== JSON.stringify(effectiveProxySettings(previous, scope))
      const ownChanged = repaired.has(scope) || repair.includes(scope) || (scope === 'application' ? changed
        : JSON.stringify(next.browser) !== JSON.stringify(previous.browser) || (next.browser.mode === 'inherit' && repaired.has('application')))
      if (!changed && !ownChanged && !force.includes(scope) && applied[scope] && states[scope].status === 'ready') continue
      // An unrelated blocked scope must not prevent saving the independent scope.
      if (!changed && !ownChanged && !force.includes(scope) && states[scope].status === 'blocked') continue
      const compiled = compileProductNetworkProxyV2(settings, currentEnv())
      if (!compiled.ok) return snapshot(compiled.code)
      nextCompiled[scope] = compiled.value
      if (force.includes(scope) || states[scope].status !== 'ready' || !applied[scope] || JSON.stringify(compiled.value.electronConfig) !== JSON.stringify(applied[scope]?.electronConfig)) targets.push(scope)
    }
    const configChanged = repaired.size > 0 || JSON.stringify(previous) !== JSON.stringify(next)
    if (!configChanged && targets.length === 0) return snapshot()
    for (const scope of targets) states[scope] = stateFor(scope, 'applying', 'proxy_updating')
    const attempted: NetworkProxyScope[] = []
    let code: ProductNetworkProxyV2ErrorCode = 'proxy_session_apply_failed'
    try {
      for (const scope of targets) { attempted.push(scope); await apply(scope, nextCompiled[scope]!) }
      code = 'proxy_store_unavailable'
      if (configChanged) {
        if (legacyWrite && !input.browserSession) input.store.set(NETWORK_PROXY_SETTINGS_V2_STORE_KEY, next.application)
        else input.store.set({
          [NETWORK_PROXY_SETTINGS_V2_STORE_KEY]: invalidStored.has('application') && !repaired.has('application')
            ? input.store.get(NETWORK_PROXY_SETTINGS_V2_STORE_KEY) : next.application,
          [BROWSER_PROXY_SETTINGS_STORE_KEY]: invalidStored.has('browser') && !repaired.has('browser')
            ? input.store.get(BROWSER_PROXY_SETTINGS_STORE_KEY) : next.browser,
        })
      }
    } catch {
      let rollbackFailed = false
      for (const scope of attempted.reverse()) {
        const prior = applied[scope]
        try {
          if (!prior) throw new Error('no prior applied policy')
          await apply(scope, prior)
          states[scope] = previousStates[scope]
        } catch { states[scope] = stateFor(scope, 'blocked', 'proxy_store_rollback_failed'); rollbackFailed = true }
      }
      for (const scope of targets) if (!attempted.includes(scope)) states[scope] = previousStates[scope]
      return snapshot(rollbackFailed ? 'proxy_store_rollback_failed' : code)
    }
    configuration = next
    initialized = true
    for (const scope of repaired) invalidStored.delete(scope)
    for (const scope of scopes) {
      if (nextCompiled[scope]) { applied[scope] = nextCompiled[scope]; states[scope] = stateFor(scope, 'ready') }
    }
    return snapshot()
  }
  function updateSettings(value: unknown): Promise<ProductNetworkProxyV2Result> {
    return enqueue(async () => {
      let next: NetworkProxySettings
      try { next = parseNetworkProxySettingsStrict(value) }
      catch { return legacy(snapshot('proxy_settings_invalid')) }
      // Legacy callers can update before explicit startup initialization.
      if (!initialized) {
        try { configuration = { ...configuration, application: parseNetworkProxySettingsStrict(input.store.get(NETWORK_PROXY_SETTINGS_V2_STORE_KEY)) } } catch { /* explicit save repairs corrupt settings */ }
      }
      return legacy(await update({ ...configuration, application: next }, true))
    })
  }
  return Object.freeze({
    getSettings: () => {
      try { return { ok: true as const, settings: parseNetworkProxySettingsStrict(input.store.get(NETWORK_PROXY_SETTINGS_V2_STORE_KEY)), state: states.application } }
      catch { return legacy(snapshot('proxy_settings_invalid')) }
    },
    updateSettings,
    resetSettings: (scope: NetworkProxyScope = 'application') => enqueue(async () => legacy(await update(scope === 'application'
      ? { ...configuration, application: DEFAULT_NETWORK_PROXY_SETTINGS }
      : { ...configuration, browser: defaultBrowserProxySettings() }, false, [], [scope]))),
    applyStoredSettings: (scope?: NetworkProxyScope) => enqueue(async () => legacy(await load(scope))),
    getState: (scope: NetworkProxyScope = 'application') => states[scope],
    getConfiguration: () => snapshot(),
    updateConfiguration: (value: unknown) => enqueue(async () => {
      try { return await update(parseProxyConfigurationStrict(value)) }
      catch { return snapshot('proxy_settings_invalid') }
    }),
    getEnvironment: () => {
      const env = currentEnv()
      const result: Record<string, string> = {}
      for (const key of ['http_proxy', 'HTTP_PROXY', 'https_proxy', 'HTTPS_PROXY', 'all_proxy', 'ALL_PROXY', 'no_proxy', 'NO_PROXY']) {
        const raw = String(env[key] ?? '').trim()
        if (!raw) result[key] = ''
        else if (key.toLowerCase() === 'no_proxy') result[key] = compileBypassRules(raw).ok ? raw : '[proxy_bypass_invalid]'
        else {
          const parsed = parseProxyUrl(raw, 'proxy_environment_invalid')
          result[key] = parsed.ok ? parsed.value : `[${parsed.code}]`
        }
      }
      return result
    },
    assertGovernedRequestAvailable: (scope: NetworkProxyScope = 'application') => {
      if (states[scope].status !== 'ready') throw new Error(states[scope].errorCode ?? 'proxy_environment_unavailable')
    },
    resolveProxy: async (rawUrl: unknown, scope: NetworkProxyScope = 'application') => {
      let url: URL
      try {
        url = new URL(String(rawUrl ?? '').trim())
        if (!['http:', 'https:'].includes(url.protocol) || url.username || url.password) throw new Error('invalid')
      } catch { return { ok: false as const, code: 'invalid_url' as const, message: 'Proxy diagnostic URL is invalid.' } }
      if (states[scope].status !== 'ready' || !sessions[scope]) {
        return { ok: false as const, code: states[scope].errorCode ?? 'proxy_environment_unavailable', message: 'Network proxy is unavailable.' }
      }
      try {
        const resolvedProxy = sanitizeResolvedProxy(await sessions[scope]!.resolveProxy(url.toString()))
        return { ok: true as const, resolvedProxy, proxyKind: classifyResolvedProxy(resolvedProxy) }
      } catch { return { ok: false as const, code: 'proxy_session_apply_failed' as const, message: 'Proxy resolution failed.' } }
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
  if (!['http:', 'https:', 'socks5:'].includes(parsed.protocol) || !parsed.hostname ||
      (parsed.pathname !== '/' && parsed.pathname !== '') || parsed.search || parsed.hash) {
    return failure(invalidCode, 'Proxy URL is invalid.')
  }
  return Object.freeze({ ok: true, value: `${parsed.protocol}//${parsed.host}` })
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

export function sanitizeResolvedProxy(value: unknown): string {
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
