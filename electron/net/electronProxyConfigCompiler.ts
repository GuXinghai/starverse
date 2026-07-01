import type { ProxyConfig } from 'electron'
import {
  validateNetworkProxyPolicy,
  type NetworkProxyPolicy,
  type NetworkProxyPolicyValidationIssue,
} from '../../src/shared/network/proxyPolicy'

export type ElectronProxyConfig = ProxyConfig

export type ElectronProxyConfigCompileResult =
  | Readonly<{ ok: true; policy: NetworkProxyPolicy; config: ElectronProxyConfig }>
  | Readonly<{ ok: false; policy: NetworkProxyPolicy; issues: readonly NetworkProxyPolicyValidationIssue[] }>

export function compileElectronProxyConfig(value: unknown): ElectronProxyConfigCompileResult {
  const validation = validateNetworkProxyPolicy(value)
  if (!validation.ok) {
    return {
      ok: false,
      policy: validation.policy,
      issues: validation.issues,
    }
  }

  const { policy } = validation
  const config: ElectronProxyConfig = { mode: policy.mode }

  if (policy.proxyBypassRules) {
    config.proxyBypassRules = policy.proxyBypassRules
  }

  if (policy.mode === 'fixed_servers') {
    config.proxyRules = policy.proxyRules
  }

  if (policy.mode === 'pac_script') {
    config.pacScript = policy.pacScript
  }

  return { ok: true, policy, config }
}
