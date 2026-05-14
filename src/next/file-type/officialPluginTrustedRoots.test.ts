/* eslint-disable max-lines-per-function */
import { generateKeyPairSync, sign as cryptoSign } from 'node:crypto'
import { describe, expect, it } from 'vitest'
import {
  createOfficialTrustedRoots,
  createTestTrustedRoots,
  getActiveTrustedRoots,
  isOfficialTrustedRootUnconfigured,
  parseTrustedRootsJson,
} from './officialPluginTrustedRoots'
import { createCatalogSigningPayload, verifyCatalogSignature } from './pluginCatalogSignature'

describe('officialPluginTrustedRoots', () => {
  it('returns official_trusted_root_unconfigured when no roots configured for production', () => {
    const result = getActiveTrustedRoots({})
    expect(result.ok).toBe(false)
    if (!result.ok) {
      expect(result.reason).toBe('official_trusted_root_unconfigured')
    }
  })

  it('returns test roots in vitest environment', () => {
    const result = getActiveTrustedRoots({ VITEST: 'true' })
    expect(result.ok).toBe(true)
    if (result.ok) {
      expect(result.source).toBe('test')
      expect(result.trustedRoots['starverse-test-root']).toBeDefined()
    }
  })

  it('returns test roots in NODE_ENV=test environment', () => {
    const result = getActiveTrustedRoots({ NODE_ENV: 'test' })
    expect(result.ok).toBe(true)
    if (result.ok) {
      expect(result.source).toBe('test')
    }
  })

  it('returns test roots in SV_ENGINE_PLUGIN_DEV_MODE=1', () => {
    const result = getActiveTrustedRoots({ SV_ENGINE_PLUGIN_DEV_MODE: '1' })
    expect(result.ok).toBe(true)
    if (result.ok) {
      expect(result.source).toBe('test')
    }
  })

  it('returns official roots when SV_OFFICIAL_PLUGIN_TRUSTED_ROOTS configured', () => {
    const { publicKey } = generateKeyPairSync('ed25519')
    const pem = publicKey.export({ type: 'spki', format: 'pem' }).toString().trim()
    const config = JSON.stringify({
      'starverse-official-root-001': {
        keyId: 'starverse-official-root-001',
        algorithm: 'ed25519',
        publicKeyPem: pem,
      },
    })
    const result = getActiveTrustedRoots({ SV_OFFICIAL_PLUGIN_TRUSTED_ROOTS: config })
    expect(result.ok).toBe(true)
    if (result.ok) {
      expect(result.source).toBe('official')
      expect(result.trustedRoots['starverse-official-root-001']).toBeDefined()
    }
  })

  it('prefers SV_TEST_TRUSTED_ROOTS over test defaults', () => {
    const { publicKey } = generateKeyPairSync('ed25519')
    const pem = publicKey.export({ type: 'spki', format: 'pem' }).toString().trim()
    const config = JSON.stringify({
      'starverse-test-root': {
        keyId: 'starverse-test-root',
        algorithm: 'ed25519',
        publicKeyPem: pem,
      },
    })
    const result = getActiveTrustedRoots({ SV_TEST_TRUSTED_ROOTS: config })
    expect(result.ok).toBe(true)
    if (result.ok) {
      expect(result.source).toBe('test')
    }
  })

  it('createTestTrustedRoots builds valid trusted root map', () => {
    const roots = createTestTrustedRoots(
      '-----BEGIN PUBLIC KEY-----\nMCowBQYDK2VwAyEAiaIm/edVF9H9tvP4dFVpw5XF+IMfnfvLwUxGNAc5MI0=\n-----END PUBLIC KEY-----'
    )
    expect(roots['starverse-test-root']).toBeDefined()
    expect(roots['starverse-test-root']?.algorithm).toBe('ed25519')
  })

  it('createOfficialTrustedRoots builds valid official root map', () => {
    const roots = createOfficialTrustedRoots(
      '-----BEGIN PUBLIC KEY-----\nMCowBQYDK2VwAyEAiaIm/edVF9H9tvP4dFVpw5XF+IMfnfvLwUxGNAc5MI0=\n-----END PUBLIC KEY-----'
    )
    expect(roots['starverse-pdp-ed25519-prod-2026Q2']).toBeDefined()
  })

  it('parseTrustedRootsJson rejects invalid input gracefully', () => {
    expect(parseTrustedRootsJson('')).toEqual({})
    expect(parseTrustedRootsJson('not json')).toEqual({})
    expect(parseTrustedRootsJson('[]')).toEqual({})
    expect(parseTrustedRootsJson('{}')).toEqual({})
    expect(parseTrustedRootsJson('{"bad": {}}')).toEqual({})
  })

  it('isOfficialTrustedRootUnconfigured matches the reason', () => {
    expect(isOfficialTrustedRootUnconfigured('official_trusted_root_unconfigured')).toBe(true)
    expect(isOfficialTrustedRootUnconfigured('other_reason')).toBe(false)
  })

  it('test trusted root can verify a signed catalog payload', () => {
    const { privateKey, publicKey } = generateKeyPairSync('ed25519')
    const publicKeyPem = publicKey.export({ type: 'spki', format: 'pem' }).toString().trim()

    const signedPayload = { schemaVersion: '1', source: 'official', plugins: [] }
    const payloadBytes = Buffer.from(createCatalogSigningPayload(signedPayload))
    const signatureValue = cryptoSign(null, payloadBytes, privateKey).toString('base64')

    const trustedRoots = createTestTrustedRoots(publicKeyPem)

    const result = verifyCatalogSignature({
      signedPayload,
      signature: {
        keyId: 'starverse-test-root',
        algorithm: 'ed25519',
        value: signatureValue,
      },
      trustedRoots,
    })
    expect(result.ok).toBe(true)
  })

  it('test trusted root fails on tampered payload', () => {
    const { privateKey, publicKey } = generateKeyPairSync('ed25519')
    const publicKeyPem = publicKey.export({ type: 'spki', format: 'pem' }).toString().trim()

    const signedPayload = { schemaVersion: '1', source: 'official', plugins: [] }
    const payloadBytes = Buffer.from(createCatalogSigningPayload(signedPayload))
    const signatureValue = cryptoSign(null, payloadBytes, privateKey).toString('base64')

    const trustedRoots = createTestTrustedRoots(publicKeyPem)

    const tamperedPayload = { ...signedPayload, source: 'unofficial' }
    const result = verifyCatalogSignature({
      signedPayload: tamperedPayload,
      signature: {
        keyId: 'starverse-test-root',
        algorithm: 'ed25519',
        value: signatureValue,
      },
      trustedRoots,
    })
    expect(result.ok).toBe(false)
  })

  it('returns embedded official roots when isProduction is true', () => {
    const result = getActiveTrustedRoots({}, { isProduction: true })
    expect(result.ok).toBe(true)
    if (result.ok) {
      expect(result.source).toBe('official')
      expect(result.trustedRoots['starverse-pdp-ed25519-prod-2026Q2']).toBeDefined()
    }
  })

  it('ignores SV_ENGINE_PLUGIN_DEV_MODE=1 when isProduction is true', () => {
    const result = getActiveTrustedRoots(
      { SV_ENGINE_PLUGIN_DEV_MODE: '1' },
      { isProduction: true },
    )
    expect(result.ok).toBe(true)
    if (result.ok) {
      expect(result.source).toBe('official')
    }
  })

  it('allows SV_ENGINE_PLUGIN_DEV_MODE=1 when isProduction is false', () => {
    const result = getActiveTrustedRoots(
      { SV_ENGINE_PLUGIN_DEV_MODE: '1' },
      { isProduction: false },
    )
    expect(result.ok).toBe(true)
    if (result.ok) {
      expect(result.source).toBe('test')
    }
  })

  it('ignores VITEST=true when isProduction is true', () => {
    const result = getActiveTrustedRoots(
      { VITEST: 'true' },
      { isProduction: true },
    )
    expect(result.ok).toBe(true)
    if (result.ok) {
      expect(result.source).toBe('official')
    }
  })

  it('ignores SV_OFFICIAL_PLUGIN_TRUSTED_ROOTS env var in production', () => {
    const { publicKey } = generateKeyPairSync('ed25519')
    const pem = publicKey.export({ type: 'spki', format: 'pem' }).toString().trim()
    const config = JSON.stringify({
      'starverse-official-root-001': {
        keyId: 'starverse-official-root-001',
        algorithm: 'ed25519',
        publicKeyPem: pem,
      },
    })
    const result = getActiveTrustedRoots(
      { SV_OFFICIAL_PLUGIN_TRUSTED_ROOTS: config },
      { isProduction: true },
    )
    expect(result.ok).toBe(true)
    if (result.ok) {
      expect(result.source).toBe('official')
      expect(result.trustedRoots['starverse-pdp-ed25519-prod-2026Q2']?.publicKeyPem).not.toBe(pem)
    }
  })

  it('ignores SV_TEST_TRUSTED_ROOTS env var in production', () => {
    const { publicKey } = generateKeyPairSync('ed25519')
    const pem = publicKey.export({ type: 'spki', format: 'pem' }).toString().trim()
    const config = JSON.stringify({
      'starverse-test-root': {
        keyId: 'starverse-test-root',
        algorithm: 'ed25519',
        publicKeyPem: pem,
      },
    })
    const result = getActiveTrustedRoots(
      { SV_TEST_TRUSTED_ROOTS: config },
      { isProduction: true },
    )
    expect(result.ok).toBe(true)
    if (result.ok) {
      expect(result.source).toBe('official')
    }
  })

  it('ignores NODE_ENV=test when isProduction is true', () => {
    const result = getActiveTrustedRoots(
      { NODE_ENV: 'test' },
      { isProduction: true },
    )
    expect(result.ok).toBe(true)
    if (result.ok) {
      expect(result.source).toBe('official')
    }
  })

  it('ignores SV_OFFICIAL_PLUGIN_TRUSTED_ROOTS in production even with DEV_MODE=1', () => {
    const { publicKey } = generateKeyPairSync('ed25519')
    const pem = publicKey.export({ type: 'spki', format: 'pem' }).toString().trim()
    const config = JSON.stringify({
      'starverse-official-root-001': {
        keyId: 'starverse-official-root-001',
        algorithm: 'ed25519',
        publicKeyPem: pem,
      },
    })
    const result = getActiveTrustedRoots(
      { SV_OFFICIAL_PLUGIN_TRUSTED_ROOTS: config, SV_ENGINE_PLUGIN_DEV_MODE: '1' },
      { isProduction: true },
    )
    expect(result.ok).toBe(true)
    if (result.ok) {
      expect(result.source).toBe('official')
      expect(result.trustedRoots['starverse-pdp-ed25519-prod-2026Q2']?.publicKeyPem).not.toBe(pem)
    }
  })
})
