import { isIP } from 'node:net'
import { randomUUID } from 'node:crypto'
import { resolve4 as nodeResolve4, resolve6 as nodeResolve6 } from 'node:dns/promises'

export type CompatibleAddressFamily = 'ipv4' | 'ipv6'

export type CompatibleResolvedAddress = Readonly<{
  address: string
  family: CompatibleAddressFamily
}>

export type CompatibleAddressResolver = Readonly<{
  resolveAll: (hostname: string) => Promise<readonly CompatibleResolvedAddress[]>
}>

export type CompatibleAddressPolicyErrorCode =
  | 'compatible_url_invalid'
  | 'compatible_dns_failed'
  | 'compatible_address_blocked'
  | 'compatible_address_lease_expired'
  | 'compatible_dns_rebinding_blocked'
  | 'compatible_address_lease_consumed'

export class CompatibleAddressPolicyError extends Error {
  readonly code: CompatibleAddressPolicyErrorCode

  constructor(code: CompatibleAddressPolicyErrorCode) {
    super(code)
    this.name = 'CompatibleAddressPolicyError'
    this.code = code
  }
}

export type ValidatedAddressLease = Readonly<{
  leaseId: string
  hostname: string
  port: number
  addresses: readonly CompatibleResolvedAddress[]
  selectedAddress: CompatibleResolvedAddress
  issuedAtMs: number
  expiresAtMs: number
}>

export type CompatibleAddressAudit = Readonly<{
  hostname: string
  port: number
  addresses: readonly CompatibleResolvedAddress[]
  selectedAddress: CompatibleResolvedAddress
  auditedAtMs: number
}>

export type CompatibleAddressLeaseRegistry = Readonly<{
  audit: (url: URL) => Promise<CompatibleAddressAudit>
  issue: (url: URL) => Promise<ValidatedAddressLease>
  consume: (input: Readonly<{
    leaseId: string
    hostname: string
    port: number
    address: string
  }>) => ValidatedAddressLease
  revoke: (leaseId: string) => void
  revokeAll: () => void
  size: () => number
}>

const DEFAULT_LEASE_TTL_MS = 15_000

const BLOCKED_IPV4_PREFIXES: readonly Readonly<{ network: bigint; prefix: number }>[] = [
  ipv4Prefix('0.0.0.0', 8),
  ipv4Prefix('10.0.0.0', 8),
  ipv4Prefix('100.64.0.0', 10),
  ipv4Prefix('127.0.0.0', 8),
  ipv4Prefix('169.254.0.0', 16),
  ipv4Prefix('172.16.0.0', 12),
  ipv4Prefix('192.0.0.0', 24),
  ipv4Prefix('192.0.2.0', 24),
  ipv4Prefix('192.31.196.0', 24),
  ipv4Prefix('192.52.193.0', 24),
  ipv4Prefix('192.88.99.0', 24),
  ipv4Prefix('192.168.0.0', 16),
  ipv4Prefix('192.175.48.0', 24),
  ipv4Prefix('198.18.0.0', 15),
  ipv4Prefix('198.51.100.0', 24),
  ipv4Prefix('203.0.113.0', 24),
  ipv4Prefix('224.0.0.0', 4),
  ipv4Prefix('240.0.0.0', 4),
]

const BLOCKED_IPV6_PREFIXES: readonly Readonly<{ network: bigint; prefix: number }>[] = [
  ipv6Prefix('::', 128),
  ipv6Prefix('::1', 128),
  ipv6Prefix('64:ff9b:1::', 48),
  ipv6Prefix('100::', 64),
  ipv6Prefix('2001::', 23),
  ipv6Prefix('2001:db8::', 32),
  ipv6Prefix('2002::', 16),
  ipv6Prefix('3fff::', 20),
  ipv6Prefix('5f00::', 16),
  ipv6Prefix('fc00::', 7),
  ipv6Prefix('fec0::', 10),
  ipv6Prefix('fe80::', 10),
  ipv6Prefix('ff00::', 8),
]

export function createElectronSessionAddressResolver(session: Readonly<{
  resolveHost: (hostname: string, options?: Readonly<{
    queryType?: 'A' | 'AAAA'
    cacheUsage?: 'allowed' | 'staleAllowed' | 'disallowed'
    secureDnsPolicy?: 'allow' | 'disable'
  }>) => Promise<Readonly<{ endpoints: readonly Readonly<{ address: string; family: 'ipv4' | 'ipv6' | 'unspec' }>[] }>>
}>): CompatibleAddressResolver {
  return {
    resolveAll: async (hostname) => {
      const settled = await Promise.allSettled((['A', 'AAAA'] as const).map((queryType) => session.resolveHost(hostname, {
        queryType,
        cacheUsage: 'disallowed',
        secureDnsPolicy: 'allow',
      })))
      assertCompatibleDualStackResolution(settled)
      const addresses: CompatibleResolvedAddress[] = []
      for (const result of settled) {
        if (result.status !== 'fulfilled') continue
        for (const endpoint of result.value.endpoints) {
          const normalized = normalizeIpAddress(endpoint.address)
          const family = isIP(normalized)
          if (family === 4) addresses.push({ address: normalized, family: 'ipv4' })
          if (family === 6) addresses.push({ address: normalized, family: 'ipv6' })
        }
      }
      return deduplicateAddresses(addresses)
    },
  }
}

export function createNodeAddressResolver(input?: Readonly<{
  resolve4?: (hostname: string) => Promise<readonly string[]>
  resolve6?: (hostname: string) => Promise<readonly string[]>
}>): CompatibleAddressResolver {
  const resolve4 = input?.resolve4 ?? nodeResolve4
  const resolve6 = input?.resolve6 ?? nodeResolve6
  return {
    resolveAll: async (hostname) => {
      const settled = await Promise.allSettled([resolve4(hostname), resolve6(hostname)])
      assertCompatibleDualStackResolution(settled)
      const addresses: CompatibleResolvedAddress[] = []
      if (settled[0]?.status === 'fulfilled') {
        for (const address of settled[0].value) addresses.push({ address, family: 'ipv4' })
      }
      if (settled[1]?.status === 'fulfilled') {
        for (const address of settled[1].value) addresses.push({ address, family: 'ipv6' })
      }
      return deduplicateAddresses(addresses)
    },
  }
}

export function createCompatibleAddressLeaseRegistry(input: Readonly<{
  resolver: CompatibleAddressResolver
  nowMs?: () => number
  randomId?: () => string
  leaseTtlMs?: number
}>): CompatibleAddressLeaseRegistry {
  const nowMs = input.nowMs ?? Date.now
  const randomId = input.randomId ?? randomUUID
  const leaseTtlMs = input.leaseTtlMs ?? DEFAULT_LEASE_TTL_MS
  if (!Number.isInteger(leaseTtlMs) || leaseTtlMs < 1 || leaseTtlMs > 60_000) {
    throw new CompatibleAddressPolicyError('compatible_url_invalid')
  }
  const active = new Map<string, ValidatedAddressLease>()

  const audit = async (url: URL): Promise<CompatibleAddressAudit> => {
    assertCompatibleNetworkUrl(url)
    const hostname = normalizeHostname(url.hostname)
    const port = effectivePort(url)
    let addresses: readonly CompatibleResolvedAddress[]
    const literalFamily = isIP(hostname)
    if (literalFamily === 4 || literalFamily === 6) {
      addresses = [{ address: normalizeIpAddress(hostname), family: literalFamily === 4 ? 'ipv4' : 'ipv6' }]
    } else {
      try {
        addresses = deduplicateAddresses(await input.resolver.resolveAll(hostname))
      } catch {
        throw new CompatibleAddressPolicyError('compatible_dns_failed')
      }
    }
    if (addresses.length === 0) throw new CompatibleAddressPolicyError('compatible_dns_failed')
    if (addresses.some((entry) => !isCompatiblePublicIpAddress(entry.address))) {
      throw new CompatibleAddressPolicyError('compatible_address_blocked')
    }
    return Object.freeze({
      hostname,
      port,
      addresses: Object.freeze(addresses.map((entry) => Object.freeze({ ...entry }))),
      selectedAddress: Object.freeze({ ...addresses[0]! }),
      auditedAtMs: nowMs(),
    })
  }

  return {
    audit,
    issue: async (url) => {
      const audited = await audit(url)
      const issuedAtMs = audited.auditedAtMs
      const lease: ValidatedAddressLease = Object.freeze({
        leaseId: randomId(),
        hostname: audited.hostname,
        port: audited.port,
        addresses: audited.addresses,
        selectedAddress: audited.selectedAddress,
        issuedAtMs,
        expiresAtMs: issuedAtMs + leaseTtlMs,
      })
      if (!lease.leaseId || active.has(lease.leaseId)) {
        throw new CompatibleAddressPolicyError('compatible_address_lease_consumed')
      }
      active.set(lease.leaseId, lease)
      return lease
    },
    consume: (candidate) => {
      const lease = active.get(candidate.leaseId)
      if (!lease) throw new CompatibleAddressPolicyError('compatible_address_lease_consumed')
      active.delete(candidate.leaseId)
      if (nowMs() >= lease.expiresAtMs) {
        throw new CompatibleAddressPolicyError('compatible_address_lease_expired')
      }
      const hostname = normalizeHostname(candidate.hostname)
      const address = normalizeIpAddress(candidate.address)
      if (
        hostname !== lease.hostname ||
        candidate.port !== lease.port ||
        address !== normalizeIpAddress(lease.selectedAddress.address)
      ) {
        throw new CompatibleAddressPolicyError('compatible_dns_rebinding_blocked')
      }
      return lease
    },
    revoke: (leaseId) => {
      active.delete(leaseId)
    },
    revokeAll: () => {
      active.clear()
    },
    size: () => active.size,
  }
}

export function isCompatiblePublicIpAddress(rawAddress: string): boolean {
  const address = normalizeIpAddress(rawAddress)
  const family = isIP(address)
  if (family === 4) {
    const value = parseIpv4(address)
    return value !== null && !BLOCKED_IPV4_PREFIXES.some((range) => matchesPrefix(value, range.network, range.prefix, 32))
  }
  if (family !== 6 || address.includes('%')) return false

  const mapped = extractMappedIpv4(address)
  if (mapped) return isCompatiblePublicIpAddress(mapped)
  const compatible = extractCompatibleIpv4(address)
  if (compatible) return isCompatiblePublicIpAddress(compatible)
  const translated = extractTranslatedIpv4(address)
  if (translated) return isCompatiblePublicIpAddress(translated)
  const nat64 = extractWellKnownNat64Ipv4(address)
  if (nat64) return isCompatiblePublicIpAddress(nat64)
  const value = parseIpv6(address)
  return value !== null && !BLOCKED_IPV6_PREFIXES.some((range) => matchesPrefix(value, range.network, range.prefix, 128))
}

export function assertCompatibleNetworkUrl(url: URL): void {
  if ((url.protocol !== 'http:' && url.protocol !== 'https:') || url.username || url.password || url.hash) {
    throw new CompatibleAddressPolicyError('compatible_url_invalid')
  }
  if (!url.hostname || !Number.isInteger(effectivePort(url))) {
    throw new CompatibleAddressPolicyError('compatible_url_invalid')
  }
}

function effectivePort(url: URL): number {
  if (url.port) {
    const parsed = Number(url.port)
    if (Number.isInteger(parsed) && parsed >= 1 && parsed <= 65_535) return parsed
    throw new CompatibleAddressPolicyError('compatible_url_invalid')
  }
  return url.protocol === 'https:' ? 443 : 80
}

function normalizeHostname(value: string): string {
  return value.trim().toLowerCase().replace(/^\[/u, '').replace(/\]$/u, '').replace(/\.$/u, '')
}

function normalizeIpAddress(value: string): string {
  return normalizeHostname(value)
}

function deduplicateAddresses(entries: readonly CompatibleResolvedAddress[]): readonly CompatibleResolvedAddress[] {
  const seen = new Set<string>()
  const output: CompatibleResolvedAddress[] = []
  for (const entry of entries) {
    const address = normalizeIpAddress(entry.address)
    const family = isIP(address)
    if (family !== 4 && family !== 6) continue
    const key = `${family}:${address}`
    if (seen.has(key)) continue
    seen.add(key)
    output.push({ address, family: family === 4 ? 'ipv4' : 'ipv6' })
  }
  return output
}

function assertCompatibleDualStackResolution(
  settled: readonly PromiseSettledResult<unknown>[],
): void {
  const rejected = settled.filter((result): result is PromiseRejectedResult => result.status === 'rejected')
  if (rejected.length === settled.length || rejected.some((result) => !isCompatibleNoDataError(result.reason))) {
    throw new CompatibleAddressPolicyError('compatible_dns_failed')
  }
}

function isCompatibleNoDataError(error: unknown): boolean {
  const code = error && typeof error === 'object' && 'code' in error
    ? String((error as { code?: unknown }).code ?? '')
    : ''
  if (code === 'ENODATA' || code === 'ENOTFOUND' || code === 'ERR_NAME_NOT_RESOLVED') return true
  const message = error instanceof Error ? error.message : String(error ?? '')
  return /(?:^|\b)(?:ENODATA|ENOTFOUND|ERR_NAME_NOT_RESOLVED)(?:\b|$)/u.test(message)
}

function ipv4Prefix(address: string, prefix: number): Readonly<{ network: bigint; prefix: number }> {
  const parsed = parseIpv4(address)
  if (parsed === null) throw new Error('invalid IPv4 policy prefix')
  return { network: parsed, prefix }
}

function ipv6Prefix(address: string, prefix: number): Readonly<{ network: bigint; prefix: number }> {
  const parsed = parseIpv6(address)
  if (parsed === null) throw new Error('invalid IPv6 policy prefix')
  return { network: parsed, prefix }
}

function matchesPrefix(value: bigint, network: bigint, prefix: number, bits: number): boolean {
  if (prefix === 0) return true
  const shift = BigInt(bits - prefix)
  return (value >> shift) === (network >> shift)
}

function parseIpv4(address: string): bigint | null {
  const parts = address.split('.')
  if (parts.length !== 4) return null
  let value = 0n
  for (const part of parts) {
    if (!/^\d{1,3}$/u.test(part)) return null
    const byte = Number(part)
    if (!Number.isInteger(byte) || byte < 0 || byte > 255) return null
    value = (value << 8n) | BigInt(byte)
  }
  return value
}

function parseIpv6(address: string): bigint | null {
  const normalized = normalizeIpAddress(address)
  if (isIP(normalized) !== 6 || normalized.includes('%')) return null
  let source = normalized
  const dottedIndex = source.lastIndexOf(':')
  if (source.includes('.') && dottedIndex >= 0) {
    const ipv4 = parseIpv4(source.slice(dottedIndex + 1))
    if (ipv4 === null) return null
    source = `${source.slice(0, dottedIndex)}:${((ipv4 >> 16n) & 0xffffn).toString(16)}:${(ipv4 & 0xffffn).toString(16)}`
  }
  const halves = source.split('::')
  if (halves.length > 2) return null
  const left = halves[0] ? halves[0].split(':') : []
  const right = halves.length === 2 && halves[1] ? halves[1].split(':') : []
  const missing = 8 - left.length - right.length
  if ((halves.length === 1 && missing !== 0) || (halves.length === 2 && missing < 1)) return null
  const groups = [...left, ...Array(missing).fill('0'), ...right]
  if (groups.length !== 8) return null
  let value = 0n
  for (const group of groups) {
    if (!/^[0-9a-f]{1,4}$/iu.test(group)) return null
    value = (value << 16n) | BigInt(Number.parseInt(group, 16))
  }
  return value
}

function extractMappedIpv4(address: string): string | null {
  const value = parseIpv6(address)
  if (value === null || (value >> 32n) !== 0xffffn) return null
  return ipv4FromBigInt(value & 0xffffffffn)
}

function extractCompatibleIpv4(address: string): string | null {
  const value = parseIpv6(address)
  if (value === null || (value >> 32n) !== 0n) return null
  return ipv4FromBigInt(value & 0xffffffffn)
}

function extractTranslatedIpv4(address: string): string | null {
  const value = parseIpv6(address)
  const prefix = parseIpv6('::ffff:0:0:0')!
  if (value === null || !matchesPrefix(value, prefix, 96, 128)) return null
  return ipv4FromBigInt(value & 0xffffffffn)
}

function extractWellKnownNat64Ipv4(address: string): string | null {
  const value = parseIpv6(address)
  const prefix = parseIpv6('64:ff9b::')!
  if (value === null || !matchesPrefix(value, prefix, 96, 128)) return null
  return ipv4FromBigInt(value & 0xffffffffn)
}

function ipv4FromBigInt(value: bigint): string {
  return [24n, 16n, 8n, 0n].map((shift) => Number((value >> shift) & 0xffn)).join('.')
}
