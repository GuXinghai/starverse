import type Store from 'electron-store'
import { validateExternalUrl } from '../security/externalUrlPolicy'
import { compileElectronProxyConfig, type ElectronProxyConfig } from './electronProxyConfigCompiler'
import { classifyProviderResolvedProxy } from './providerHttpTransport'
import {
  DEFAULT_NETWORK_PROXY_POLICY,
  NETWORK_PROXY_POLICY_STORE_KEY,
  normalizeNetworkProxyPolicy,
  validateNetworkProxyPolicy,
  type NetworkProxyPolicy,
  type NetworkProxyPolicyValidationIssue,
} from '../../src/shared/network/proxyPolicy'

export type ElectronProxyApplyReason = 'startup' | 'manual'

export type ElectronProxySessionLike = Readonly<{
  setProxy: (config: ElectronProxyConfig) => Promise<void>
  forceReloadProxyConfig: () => Promise<void>
  closeAllConnections: () => Promise<void>
  resolveProxy: (url: string) => Promise<string>
}>

type NetworkProxyStoreLike = Pick<Store, 'get' | 'set'>

export type ElectronSessionProxyApplyResult =
  | Readonly<{
      ok: true
      policy: NetworkProxyPolicy
      config: ElectronProxyConfig
      reason: ElectronProxyApplyReason
      closedConnections: boolean
      appliedAtMs: number
    }>
  | Readonly<{
      ok: false
      code: 'invalid_policy' | 'session_proxy_failed' | 'store_unavailable'
      message: string
      policy: NetworkProxyPolicy
      issues?: readonly NetworkProxyPolicyValidationIssue[]
    }>

export type ElectronSessionProxyPolicyResult =
  | Readonly<{ ok: true; policy: NetworkProxyPolicy }>
  | Readonly<{ ok: false; code: 'invalid_policy' | 'store_unavailable'; message: string; issues?: readonly NetworkProxyPolicyValidationIssue[] }>

export type ElectronSessionProxyResolveResult =
  | Readonly<{
      ok: true
      url: string
      resolvedProxy: string
      proxyKind: 'DIRECT' | 'PROXY configured' | 'unknown/error'
      observedAtMs: number
    }>
  | Readonly<{
      ok: false
      code: 'invalid_url' | 'session_proxy_failed'
      message: string
      safeUrl?: string
    }>

export type ElectronSessionProxyController = Readonly<{
  getPolicy: () => ElectronSessionProxyPolicyResult
  updatePolicy: (policy: unknown) => Promise<ElectronSessionProxyApplyResult>
  resetPolicy: () => Promise<ElectronSessionProxyApplyResult>
  applyCurrentPolicy: (options?: Readonly<{ closeConnections?: boolean; reason?: ElectronProxyApplyReason }>) => Promise<ElectronSessionProxyApplyResult>
  resolveProxy: (url: unknown) => Promise<ElectronSessionProxyResolveResult>
}>

export function createElectronSessionProxyController(input: Readonly<{
  store: NetworkProxyStoreLike
  session: ElectronProxySessionLike
  nowMs?: () => number
}>): ElectronSessionProxyController {
  const proxySession = input.session
  const nowMs = input.nowMs ?? Date.now

  const getPolicy = (): ElectronSessionProxyPolicyResult => {
    try {
      return { ok: true, policy: readPolicy(input.store) }
    } catch {
      return safePolicyFailure('store_unavailable')
    }
  }

  const applyPolicy = async (
    policy: NetworkProxyPolicy,
    options: Readonly<{ closeConnections: boolean; reason: ElectronProxyApplyReason }>,
  ): Promise<ElectronSessionProxyApplyResult> => {
    const compiled = compileElectronProxyConfig(policy)
    if (!compiled.ok) {
      return {
        ok: false,
        code: 'invalid_policy',
        message: 'Network proxy policy is invalid.',
        policy: sanitizePolicyForDiagnostics(compiled.policy),
        issues: compiled.issues,
      }
    }

    try {
      await proxySession.setProxy(compiled.config)
      await proxySession.forceReloadProxyConfig()
      if (options.closeConnections) {
        await proxySession.closeAllConnections()
      }
      return {
        ok: true,
        policy: compiled.policy,
        config: compiled.config,
        reason: options.reason,
        closedConnections: options.closeConnections,
        appliedAtMs: nowMs(),
      }
    } catch {
      return {
        ok: false,
        code: 'session_proxy_failed',
        message: 'Electron session proxy update failed.',
        policy: compiled.policy,
      }
    }
  }

  return {
    getPolicy,
    updatePolicy: async (policyInput: unknown) => {
      const validation = validateNetworkProxyPolicy(policyInput)
      if (!validation.ok) {
        return {
        ok: false,
        code: 'invalid_policy',
        message: 'Network proxy policy is invalid.',
        policy: sanitizePolicyForDiagnostics(validation.policy),
        issues: validation.issues,
      }
      }

      try {
        input.store.set(NETWORK_PROXY_POLICY_STORE_KEY, validation.policy)
      } catch {
        return safeApplyFailure('store_unavailable', validation.policy)
      }

      return applyPolicy(validation.policy, { closeConnections: true, reason: 'manual' })
    },
    resetPolicy: async () => {
      try {
        input.store.set(NETWORK_PROXY_POLICY_STORE_KEY, DEFAULT_NETWORK_PROXY_POLICY)
      } catch {
        return safeApplyFailure('store_unavailable', DEFAULT_NETWORK_PROXY_POLICY)
      }

      return applyPolicy(DEFAULT_NETWORK_PROXY_POLICY, { closeConnections: true, reason: 'manual' })
    },
    applyCurrentPolicy: async (options) => {
      let policy: NetworkProxyPolicy
      try {
        policy = readPolicy(input.store)
      } catch {
        return safeApplyFailure('store_unavailable', DEFAULT_NETWORK_PROXY_POLICY)
      }

      return applyPolicy(policy, {
        closeConnections: options?.closeConnections === true,
        reason: options?.reason ?? 'startup',
      })
    },
    resolveProxy: async (rawUrl: unknown) => {
      const allowed = validateExternalUrl(rawUrl)
      if (!allowed.ok) {
        return {
          ok: false,
          code: 'invalid_url',
          message: allowed.message,
          safeUrl: sanitizeDiagnosticUrl(rawUrl),
        }
      }

      try {
        const resolvedProxy = sanitizeResolvedProxy(await proxySession.resolveProxy(allowed.url))
        return {
          ok: true,
          url: sanitizeDiagnosticUrl(allowed.url) ?? allowed.url,
          resolvedProxy,
          proxyKind: classifyProviderResolvedProxy(resolvedProxy),
          observedAtMs: nowMs(),
        }
      } catch {
        return {
          ok: false,
          code: 'session_proxy_failed',
          message: 'Electron session proxy resolution failed.',
          safeUrl: sanitizeDiagnosticUrl(allowed.url),
        }
      }
    },
  }
}

function readPolicy(store: NetworkProxyStoreLike): NetworkProxyPolicy {
  return normalizeNetworkProxyPolicy(store.get(NETWORK_PROXY_POLICY_STORE_KEY))
}

function safePolicyFailure(code: 'store_unavailable'): ElectronSessionProxyPolicyResult {
  return {
    ok: false,
    code,
    message: 'Network proxy policy store is unavailable.',
  }
}

function safeApplyFailure(
  code: 'store_unavailable',
  policy: NetworkProxyPolicy,
): ElectronSessionProxyApplyResult {
  return {
    ok: false,
    code,
    message: 'Network proxy policy store is unavailable.',
    policy,
  }
}

function sanitizeDiagnosticUrl(value: unknown): string | undefined {
  try {
    const parsed = new URL(String(value ?? '').trim())
    if (parsed.protocol !== 'http:' && parsed.protocol !== 'https:') {
      return `${parsed.protocol}[blocked]`
    }
    parsed.username = ''
    parsed.password = ''
    parsed.search = ''
    parsed.hash = ''
    return parsed.toString()
  } catch {
    return undefined
  }
}

function sanitizeResolvedProxy(value: unknown): string {
  return String(value ?? '')
    .trim()
    .replace(/([a-z][a-z0-9+.-]*:\/\/)([^/@\s:;]+)(?::([^/@\s;]+))?@/giu, '$1[redacted]@')
    .replace(/\b(PROXY|HTTPS|SOCKS|SOCKS5)\s+([^/@\s:;]+):([^/@\s;]+)@/giu, '$1 [redacted]@')
    .slice(0, 1024)
}

function sanitizePolicyForDiagnostics(policy: NetworkProxyPolicy): NetworkProxyPolicy {
  return {
    ...policy,
    proxyRules: redactProxyCredentials(policy.proxyRules),
    pacScript: redactProxyCredentials(policy.pacScript),
  }
}

function redactProxyCredentials(value: string): string {
  return value
    .replace(/([a-z][a-z0-9+.-]*:\/\/)([^/@\s:;]+)(?::([^/@\s;]+))?@/giu, '$1[redacted]@')
    .replace(/\b([^/@\s:;=]+):([^/@\s;=]+)@/giu, '[redacted]@')
}
