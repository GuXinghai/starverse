export type NetworkProxyPolicyMode =
  | 'system'
  | 'direct'
  | 'fixed_servers'
  | 'pac_script'
  | 'auto_detect'

export type NetworkProxyPolicyTarget = 'provider' | 'download' | 'localEndpoint'

export type ProxyCredentialRef = string

export type NetworkProxyPolicy = Readonly<{
  mode: NetworkProxyPolicyMode
  proxyRules: string
  proxyBypassRules: string
  pacScript: string
  credentialRef: ProxyCredentialRef | null
}>

export type NetworkProxyPolicyInput = Readonly<Partial<{
  mode: unknown
  proxyRules: unknown
  proxyBypassRules: unknown
  pacScript: unknown
  credentialRef: unknown
}>>

export type NetworkProxyPolicyConfig = Readonly<{
  defaultPolicy: NetworkProxyPolicy
  overrides: Partial<Record<NetworkProxyPolicyTarget, NetworkProxyPolicy>>
}>

export type NetworkProxyPolicyConfigInput = Readonly<Partial<{
  defaultPolicy: unknown
  overrides: unknown
}>>

export type NetworkProxyPolicyValidationCode =
  | 'proxy_policy_fixed_servers_requires_proxy_rules'
  | 'proxy_policy_pac_script_requires_pac_script'
  | 'proxy_policy_proxy_rules_contains_credentials'
  | 'proxy_policy_pac_script_contains_credentials'

export type NetworkProxyPolicyValidationIssue = Readonly<{
  code: NetworkProxyPolicyValidationCode
  field: keyof NetworkProxyPolicy
  message: string
}>

export type NetworkProxyPolicyValidationResult =
  | Readonly<{ ok: true; policy: NetworkProxyPolicy }>
  | Readonly<{ ok: false; policy: NetworkProxyPolicy; issues: readonly NetworkProxyPolicyValidationIssue[] }>

export const NETWORK_PROXY_POLICY_MODES = [
  'system',
  'direct',
  'fixed_servers',
  'pac_script',
  'auto_detect',
] as const satisfies readonly NetworkProxyPolicyMode[]

export const NETWORK_PROXY_POLICY_TARGETS = [
  'provider',
  'download',
  'localEndpoint',
] as const satisfies readonly NetworkProxyPolicyTarget[]

export const DEFAULT_NETWORK_PROXY_POLICY: NetworkProxyPolicy = {
  mode: 'system',
  proxyRules: '',
  proxyBypassRules: '',
  pacScript: '',
  credentialRef: null,
}

export const LOCAL_ENDPOINT_DIRECT_PROXY_POLICY: NetworkProxyPolicy = {
  ...DEFAULT_NETWORK_PROXY_POLICY,
  mode: 'direct',
}

export const DEFAULT_NETWORK_PROXY_POLICY_BY_TARGET = {
  provider: DEFAULT_NETWORK_PROXY_POLICY,
  download: DEFAULT_NETWORK_PROXY_POLICY,
  localEndpoint: LOCAL_ENDPOINT_DIRECT_PROXY_POLICY,
} as const satisfies Record<NetworkProxyPolicyTarget, NetworkProxyPolicy>

const MAX_PROXY_POLICY_TEXT_LENGTH = 4096
const MAX_PROXY_CREDENTIAL_REF_LENGTH = 256

export function isNetworkProxyPolicyMode(value: unknown): value is NetworkProxyPolicyMode {
  return typeof value === 'string' && (NETWORK_PROXY_POLICY_MODES as readonly string[]).includes(value)
}

export function normalizeNetworkProxyPolicy(
  value: unknown,
  fallback: NetworkProxyPolicy = DEFAULT_NETWORK_PROXY_POLICY,
): NetworkProxyPolicy {
  const raw = value && typeof value === 'object' ? value as Record<string, unknown> : {}
  return {
    mode: isNetworkProxyPolicyMode(raw.mode) ? raw.mode : fallback.mode,
    proxyRules: normalizePolicyText(raw.proxyRules),
    proxyBypassRules: normalizePolicyText(raw.proxyBypassRules),
    pacScript: normalizePolicyText(raw.pacScript),
    credentialRef: normalizeCredentialRef(raw.credentialRef),
  }
}

export function normalizeNetworkProxyPolicyConfig(value: unknown): NetworkProxyPolicyConfig {
  const raw = value && typeof value === 'object' ? value as NetworkProxyPolicyConfigInput : {}
  const defaultPolicy = normalizeNetworkProxyPolicy(raw.defaultPolicy)
  const overrides = normalizeProxyPolicyOverrides(raw.overrides)
  return { defaultPolicy, overrides }
}

export function getDefaultNetworkProxyPolicyForTarget(target: NetworkProxyPolicyTarget): NetworkProxyPolicy {
  return DEFAULT_NETWORK_PROXY_POLICY_BY_TARGET[target]
}

export function resolveNetworkProxyPolicyForTarget(
  config: NetworkProxyPolicyConfig,
  target: NetworkProxyPolicyTarget,
): NetworkProxyPolicy {
  const override = config.overrides[target]
  if (override) return override
  if (target === 'localEndpoint') return LOCAL_ENDPOINT_DIRECT_PROXY_POLICY
  return config.defaultPolicy
}

export function validateNetworkProxyPolicy(
  value: unknown,
  fallback: NetworkProxyPolicy = DEFAULT_NETWORK_PROXY_POLICY,
): NetworkProxyPolicyValidationResult {
  const policy = normalizeNetworkProxyPolicy(value, fallback)
  const issues: NetworkProxyPolicyValidationIssue[] = []

  if (policy.mode === 'fixed_servers' && !policy.proxyRules) {
    issues.push({
      code: 'proxy_policy_fixed_servers_requires_proxy_rules',
      field: 'proxyRules',
      message: 'fixed_servers proxy policy requires proxyRules',
    })
  }

  if (policy.mode === 'pac_script' && !policy.pacScript) {
    issues.push({
      code: 'proxy_policy_pac_script_requires_pac_script',
      field: 'pacScript',
      message: 'pac_script proxy policy requires pacScript',
    })
  }

  if (proxyTextContainsEmbeddedCredentials(policy.proxyRules)) {
    issues.push({
      code: 'proxy_policy_proxy_rules_contains_credentials',
      field: 'proxyRules',
      message: 'proxyRules must not contain embedded credentials; use credentialRef for secure storage',
    })
  }

  if (proxyTextContainsEmbeddedCredentials(policy.pacScript)) {
    issues.push({
      code: 'proxy_policy_pac_script_contains_credentials',
      field: 'pacScript',
      message: 'pacScript URL must not contain embedded credentials; use credentialRef for secure storage',
    })
  }

  return issues.length > 0 ? { ok: false, policy, issues } : { ok: true, policy }
}

export function proxyTextContainsEmbeddedCredentials(value: unknown): boolean {
  const text = String(value ?? '').trim()
  if (!text) return false

  for (const token of splitProxyRuleText(text)) {
    if (tokenContainsEmbeddedCredentials(token)) return true
  }
  return false
}

function normalizeProxyPolicyOverrides(value: unknown): Partial<Record<NetworkProxyPolicyTarget, NetworkProxyPolicy>> {
  if (!value || typeof value !== 'object') return {}
  const raw = value as Partial<Record<NetworkProxyPolicyTarget, unknown>>
  const overrides: Partial<Record<NetworkProxyPolicyTarget, NetworkProxyPolicy>> = {}

  for (const target of NETWORK_PROXY_POLICY_TARGETS) {
    if (raw[target] !== undefined) {
      overrides[target] = normalizeNetworkProxyPolicy(raw[target], getDefaultNetworkProxyPolicyForTarget(target))
    }
  }

  return overrides
}

function normalizePolicyText(value: unknown): string {
  return String(value ?? '').trim().slice(0, MAX_PROXY_POLICY_TEXT_LENGTH)
}

function normalizeCredentialRef(value: unknown): ProxyCredentialRef | null {
  const normalized = String(value ?? '').trim().slice(0, MAX_PROXY_CREDENTIAL_REF_LENGTH)
  return normalized || null
}

function splitProxyRuleText(text: string): string[] {
  return text
    .split(/[;,\s]+/u)
    .map((token) => token.trim())
    .filter(Boolean)
    .flatMap((token) => {
      const equalsIndex = token.indexOf('=')
      return equalsIndex >= 0 ? [token.slice(equalsIndex + 1)] : [token]
    })
}

function tokenContainsEmbeddedCredentials(token: string): boolean {
  const value = token.trim()
  if (!value) return false
  if (/^[^/@\s:;=]+:[^/@\s;=]+@/u.test(value)) return true
  if (/^[a-z][a-z0-9+.-]*:\/\/[^/@\s:;=]+(?::[^/@\s;=]+)?@/iu.test(value)) return true

  try {
    const parsed = new URL(value)
    return Boolean(parsed.username || parsed.password)
  } catch {
    return false
  }
}
