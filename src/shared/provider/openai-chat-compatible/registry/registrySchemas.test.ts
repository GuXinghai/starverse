import { describe, expect, it } from 'vitest'
import {
  compatibleRegistryBaseUrlSchema,
  compatibleRegistryCredentialInputSchema,
  compatibleRegistryEndpointConfigSchema,
  createCompatibleProviderCommandSchema,
} from './registrySchemas'

describe('compatible registry configuration schemas', () => {
  it.each([
    ['HTTPS trailing slash', 'HTTPS://Example.COM:443/v1///', 'https://example.com/v1'],
    ['HTTP warning route', 'http://api.example.test/v1/', 'http://api.example.test/v1'],
    ['root path', 'https://api.example.test/', 'https://api.example.test/v1'],
    ['gateway prefix', 'https://api.example.test/gateway/', 'https://api.example.test/gateway/v1'],
    ['duplicate terminal version', 'https://api.example.test/gateway/v1/v1/', 'https://api.example.test/gateway/v1'],
  ])('canonicalizes %s without network access', (_label, input, expected) => {
    expect(compatibleRegistryBaseUrlSchema.parse(input)).toBe(expected)
  })

  it.each([
    'ftp://api.example.test/v1',
    'https://user:password@api.example.test/v1',
    'https://api.example.test/v1?api_key=value',
    'https://api.example.test/v1#fragment',
  ])('rejects unsafe Base URL %s', (value) => {
    expect(() => compatibleRegistryBaseUrlSchema.parse(value)).toThrow()
  })

  it('normalizes ordinary header names and records HTTP warning state', () => {
    expect(compatibleRegistryEndpointConfigSchema.parse({
      baseUrl: 'http://api.example.test/v1/',
      securityPolicy: 'compatibility_first',
      ordinaryHeaders: [{ name: 'X-Tenant', value: 'public-tenant', classification: 'public_non_secret' }],
      query: [{ name: 'region', value: 'us', classification: 'public_non_secret' }],
    })).toEqual({
      baseUrl: 'http://api.example.test/v1',
      allowInsecureHttp: true,
      securityPolicy: 'compatibility_first',
      ordinaryHeaders: [{ name: 'x-tenant', value: 'public-tenant', classification: 'public_non_secret' }],
      query: [{ name: 'region', value: 'us', classification: 'public_non_secret' }],
    })
  })

  it('requires one explicit endpoint security policy without a default or alias', () => {
    const base = { baseUrl: 'https://api.example.test/v1', ordinaryHeaders: [], query: [] }
    expect(compatibleRegistryEndpointConfigSchema.parse({ ...base, securityPolicy: 'strict_ssrf' }).securityPolicy).toBe('strict_ssrf')
    expect(() => compatibleRegistryEndpointConfigSchema.parse(base)).toThrow()
    expect(() => compatibleRegistryEndpointConfigSchema.parse({ ...base, securityPolicy: 'strict' })).toThrow()
    expect(() => compatibleRegistryEndpointConfigSchema.parse({ ...base, securityPolicy: 'browser_compatible' })).toThrow()
  })

  it.each(['Host', 'Content-Length', 'Authorization', 'Accept', 'Content-Type', 'Sec-Fetch-Site', 'Proxy-Connection', 'Proxy-Custom'])('rejects transport-owned header %s', (name) => {
    expect(() => compatibleRegistryEndpointConfigSchema.parse({
      baseUrl: 'https://api.example.test/v1',
      securityPolicy: 'compatibility_first',
      ordinaryHeaders: [{ name, value: 'public', classification: 'public_non_secret' }],
      query: [],
    })).toThrow()
  })

  it('stores explicitly sensitive custom credential headers regardless of name and rejects CRLF', () => {
    expect(compatibleRegistryCredentialInputSchema.parse({
      mode: 'custom_headers',
      headers: [{ name: 'X-Api-Key', value: 'secret-value' }],
    })).toMatchObject({ mode: 'custom_headers' })
    expect(compatibleRegistryCredentialInputSchema.parse({
      mode: 'custom_headers',
      headers: [{ name: 'X-Tenant', value: 'not-sensitive' }],
    })).toMatchObject({ mode: 'custom_headers' })
    expect(() => compatibleRegistryCredentialInputSchema.parse({
      mode: 'custom_headers',
      headers: [{ name: 'X-Api-Key', value: 'secret\r\ninjected' }],
    })).toThrow()
  })

  it('rejects query secrets, duplicate headers and caller-owned IDs', () => {
    const valid = {
      displayName: 'Example',
      endpoint: { baseUrl: 'https://api.example.test/v1', securityPolicy: 'compatibility_first', ordinaryHeaders: [], query: [] },
      credential: { mode: 'none' },
    }
    expect(createCompatibleProviderCommandSchema.parse(valid)).toBeTruthy()
    expect(() => createCompatibleProviderCommandSchema.parse({ ...valid, providerInstanceId: 'ocp_provider_12345678' })).toThrow()
    expect(() => createCompatibleProviderCommandSchema.parse({
      ...valid,
      endpoint: {
        ...valid.endpoint,
        query: [{ name: 'api_key', value: 'secret', classification: 'public_non_secret' }],
      },
    })).toThrow()
  })
})
