import { describe, expect, it, vi } from 'vitest'
import {
  CompatibleAddressPolicyError,
  createCompatibleAddressLeaseRegistry,
  createElectronSessionAddressResolver,
  createNodeAddressResolver,
  isCompatiblePublicIpAddress,
} from './compatibleAddressPolicy'

describe('compatibleAddressPolicy', () => {
  it.each([
    '0.0.0.0',
    '10.0.0.1',
    '100.64.0.1',
    '127.0.0.1',
    '169.254.169.254',
    '172.16.0.1',
    '192.168.1.1',
    '192.0.2.1',
    '198.18.0.1',
    '198.51.100.1',
    '203.0.113.1',
    '224.0.0.1',
    '255.255.255.255',
    '::',
    '::1',
    'fc00::1',
    'fd00::1',
    'fe80::1',
    'fec0::1',
    'ff02::1',
    '2001:db8::1',
    '2002::1',
    '::ffff:127.0.0.1',
    '::ffff:c0a8:101',
    '::127.0.0.1',
    '::10.0.0.1',
    '::192.168.1.1',
    '::ffff:0:127.0.0.1',
    '::ffff:0:192.168.1.1',
    '64:ff9b::a00:1',
  ])('blocks non-public address %s', (address) => {
    expect(isCompatiblePublicIpAddress(address)).toBe(false)
  })

  it.each([
    '1.1.1.1',
    '8.8.8.8',
    '93.184.216.34',
    '2001:4860:4860::8888',
    '2606:4700:4700::1111',
    '::ffff:8.8.8.8',
    '::8.8.8.8',
    '::ffff:0:8.8.8.8',
    '64:ff9b::808:808',
  ])('allows globally routable address %s', (address) => {
    expect(isCompatiblePublicIpAddress(address)).toBe(true)
  })

  it('resolves A and AAAA with cache disabled and deduplicates all answers', async () => {
    const resolveHost = vi.fn(async (_hostname: string, options?: { queryType?: 'A' | 'AAAA' }) => ({
      endpoints: options?.queryType === 'A'
        ? [{ address: '8.8.8.8', family: 'ipv4' as const }, { address: '8.8.8.8', family: 'ipv4' as const }]
        : [{ address: '2001:4860:4860::8888', family: 'ipv6' as const }],
    }))
    const resolver = createElectronSessionAddressResolver({ resolveHost })
    await expect(resolver.resolveAll('api.example')).resolves.toEqual([
      { address: '8.8.8.8', family: 'ipv4' },
      { address: '2001:4860:4860::8888', family: 'ipv6' },
    ])
    expect(resolveHost).toHaveBeenNthCalledWith(1, 'api.example', {
      queryType: 'A', cacheUsage: 'disallowed', secureDnsPolicy: 'allow',
    })
    expect(resolveHost).toHaveBeenNthCalledWith(2, 'api.example', {
      queryType: 'AAAA', cacheUsage: 'disallowed', secureDnsPolicy: 'allow',
    })
  })

  it('merges Node A and AAAA answers without falling back when one family is unavailable', async () => {
    const noData = Object.assign(new Error('AAAA unavailable'), { code: 'ENODATA' })
    const resolver = createNodeAddressResolver({
      resolve4: async () => ['8.8.8.8', '8.8.8.8'],
      resolve6: async () => { throw noData },
    })
    await expect(resolver.resolveAll('api.example')).resolves.toEqual([
      { address: '8.8.8.8', family: 'ipv4' },
    ])
  })

  it('fails closed when one DNS family has an unclassified resolution failure', async () => {
    const nodeResolver = createNodeAddressResolver({
      resolve4: async () => ['8.8.8.8'],
      resolve6: async () => { throw Object.assign(new Error('resolver timeout'), { code: 'ETIMEOUT' }) },
    })
    await expect(nodeResolver.resolveAll('api.example')).rejects.toMatchObject({ code: 'compatible_dns_failed' })

    const electronResolver = createElectronSessionAddressResolver({
      resolveHost: async (_hostname, options) => {
        if (options?.queryType === 'A') return { endpoints: [{ address: '8.8.8.8', family: 'ipv4' as const }] }
        throw new Error('net::ERR_DNS_TIMED_OUT')
      },
    })
    await expect(electronResolver.resolveAll('api.example')).rejects.toMatchObject({ code: 'compatible_dns_failed' })
  })

  it('blocks the entire mixed DNS answer set when any answer is private', async () => {
    const registry = createCompatibleAddressLeaseRegistry({
      resolver: {
        resolveAll: async () => [
          { address: '8.8.8.8', family: 'ipv4' },
          { address: '127.0.0.1', family: 'ipv4' },
        ],
      },
      randomId: () => 'lease-1',
    })
    await expect(registry.issue(new URL('https://api.example/v1/models'))).rejects.toMatchObject({
      code: 'compatible_address_blocked',
    })
    expect(registry.size()).toBe(0)
  })

  it('audits compatibility-first targets without creating a lease', async () => {
    const registry = createCompatibleAddressLeaseRegistry({
      resolver: { resolveAll: async () => [{ address: '8.8.8.8', family: 'ipv4' }] },
      nowMs: () => 123,
    })
    await expect(registry.audit(new URL('https://api.example/v1/models'))).resolves.toEqual({
      hostname: 'api.example',
      port: 443,
      addresses: [{ address: '8.8.8.8', family: 'ipv4' }],
      selectedAddress: { address: '8.8.8.8', family: 'ipv4' },
      auditedAtMs: 123,
    })
    expect(registry.size()).toBe(0)
  })

  it('binds one-use connect-time consumption to host, port and exact selected address', async () => {
    let now = 100
    const registry = createCompatibleAddressLeaseRegistry({
      resolver: { resolveAll: async () => [{ address: '8.8.8.8', family: 'ipv4' }] },
      randomId: () => 'lease-1',
      nowMs: () => now,
      leaseTtlMs: 50,
    })
    const lease = await registry.issue(new URL('https://api.example/v1/models'))
    expect(registry.consume({
      leaseId: lease.leaseId,
      hostname: 'api.example',
      port: 443,
      address: '8.8.8.8',
    })).toEqual(lease)
    expect(() => registry.consume({
      leaseId: lease.leaseId,
      hostname: 'api.example',
      port: 443,
      address: '8.8.8.8',
    })).toThrowError(expect.objectContaining({ code: 'compatible_address_lease_consumed' }))
    now = 200
  })

  it('rejects rebinding at consumption before a connector receives the new address', async () => {
    const registry = createCompatibleAddressLeaseRegistry({
      resolver: { resolveAll: async () => [{ address: '8.8.8.8', family: 'ipv4' }] },
      randomId: () => 'lease-1',
    })
    const lease = await registry.issue(new URL('https://api.example/v1/models'))
    expect(() => registry.consume({
      leaseId: lease.leaseId,
      hostname: 'api.example',
      port: 443,
      address: '127.0.0.1',
    })).toThrowError(expect.objectContaining({ code: 'compatible_dns_rebinding_blocked' }))
  })

  it('expires and revokes leases without exposing target values in errors', async () => {
    let now = 100
    const registry = createCompatibleAddressLeaseRegistry({
      resolver: { resolveAll: async () => [{ address: '8.8.8.8', family: 'ipv4' }] },
      randomId: () => 'lease-1',
      nowMs: () => now,
      leaseTtlMs: 10,
    })
    const lease = await registry.issue(new URL('https://secret-host.example:8443/v1/models?token=hidden'))
    now = 111
    let caught: unknown
    try {
      registry.consume({ leaseId: lease.leaseId, hostname: lease.hostname, port: lease.port, address: lease.selectedAddress.address })
    } catch (error) {
      caught = error
    }
    expect(caught).toBeInstanceOf(CompatibleAddressPolicyError)
    expect(caught).toMatchObject({ code: 'compatible_address_lease_expired', message: 'compatible_address_lease_expired' })
    expect(String(caught)).not.toContain('secret-host')
    expect(String(caught)).not.toContain('hidden')
  })
})
