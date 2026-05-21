import type { TrustedCatalogPublicKey, TrustedCatalogPublicKeyMap } from './pluginCatalogSignature'

const OFFICIAL_ROOT_ID = 'starverse-official-plugin-ed25519-2026-05'

const OFFICIAL_ROOT_PUBLIC_KEY_PEM = `-----BEGIN PUBLIC KEY-----
MCowBQYDK2VwAyEA2JUh2pJsKuiIHxWl41yFXPF8GCPfkN34Y2VMbppsz0I=
-----END PUBLIC KEY-----`

const TEST_ROOT_ID = 'starverse-test-root'

const TEST_ROOT_PUBLIC_KEY_PEM = `-----BEGIN PUBLIC KEY-----
MCowBQYDK2VwAyEAiaIm/edVF9H9tvP4dFVpw5XF+IMfnfvLwUxGNAc5MI0=
-----END PUBLIC KEY-----`

export type ActiveTrustedRootsResult =
  | Readonly<{ ok: true; trustedRoots: TrustedCatalogPublicKeyMap; source: 'official' | 'test' }>
  | Readonly<{ ok: false; reason: 'official_trusted_root_unconfigured' }>

export function getActiveTrustedRoots(
  env: {
    readonly NODE_ENV?: string
    readonly VITEST?: string
    readonly SV_OFFICIAL_PLUGIN_TRUSTED_ROOTS?: string
    readonly SV_TEST_TRUSTED_ROOTS?: string
    readonly SV_ENGINE_PLUGIN_DEV_MODE?: string
  } = typeof process !== 'undefined' ? process.env as Record<string, string | undefined> : {},
  options?: { isProduction?: boolean; includeEmbeddedOfficialRoot?: boolean },
): ActiveTrustedRootsResult {
  const isProduction = options?.isProduction === true

  if (isProduction || options?.includeEmbeddedOfficialRoot === true) {
    return {
      ok: true,
      trustedRoots: createOfficialTrustedRoots(OFFICIAL_ROOT_PUBLIC_KEY_PEM),
      source: 'official',
    }
  }

  if (!isProduction) {
    const officialJson = (env.SV_OFFICIAL_PLUGIN_TRUSTED_ROOTS ?? '').trim()
    if (officialJson.length > 0) {
      const roots = parseTrustedRootsJson(officialJson)
      if (Object.keys(roots).length > 0) {
        return { ok: true, trustedRoots: roots, source: 'official' }
      }
    }

    const testJson = (env.SV_TEST_TRUSTED_ROOTS ?? '').trim()
    if (testJson.length > 0) {
      const roots = parseTrustedRootsJson(testJson)
      if (Object.keys(roots).length > 0) {
        return { ok: true, trustedRoots: roots, source: 'test' }
      }
    }
  }

  const isDevMode = env.SV_ENGINE_PLUGIN_DEV_MODE === '1'

  if (!isProduction && (env.VITEST === 'true' || env.NODE_ENV === 'test' || isDevMode)) {
    return {
      ok: true,
      trustedRoots: createTestTrustedRoots(TEST_ROOT_PUBLIC_KEY_PEM),
      source: 'test',
    }
  }

  return { ok: false, reason: 'official_trusted_root_unconfigured' }
}

export function createTestTrustedRoots(publicKeyPem: string): TrustedCatalogPublicKeyMap {
  return {
    [TEST_ROOT_ID]: {
      keyId: TEST_ROOT_ID,
      algorithm: 'ed25519',
      publicKeyPem: publicKeyPem.trim(),
    },
  }
}

export function createOfficialTrustedRoots(publicKeyPem: string): TrustedCatalogPublicKeyMap {
  return {
    [OFFICIAL_ROOT_ID]: {
      keyId: OFFICIAL_ROOT_ID,
      algorithm: 'ed25519',
      publicKeyPem: publicKeyPem.trim(),
    },
  }
}

export function parseTrustedRootsJson(raw: string): TrustedCatalogPublicKeyMap {
  try {
    const parsed = JSON.parse(raw) as unknown
    if (!parsed || typeof parsed !== 'object' || Array.isArray(parsed)) return {}
    const source = parsed as Record<string, unknown>
    const out: Record<string, TrustedCatalogPublicKey> = {}
    for (const [keyId, value] of Object.entries(source)) {
      const normalizedKeyId = keyId.trim()
      if (!normalizedKeyId) continue
      if (!value || typeof value !== 'object') continue
      const entry = value as Record<string, unknown>
      const algorithm = String(entry.algorithm ?? '').trim()
      const publicKeyPem = String(entry.publicKeyPem ?? '').trim()
      if (algorithm !== 'ed25519') continue
      if (!publicKeyPem || !publicKeyPem.startsWith('-----BEGIN PUBLIC KEY-----')) continue
      out[normalizedKeyId] = {
        keyId: normalizedKeyId,
        algorithm: 'ed25519',
        publicKeyPem,
      }
    }
    return out
  } catch {
    return {}
  }
}

export function isOfficialTrustedRootUnconfigured(reason: string): boolean {
  return reason === 'official_trusted_root_unconfigured'
}

export function getTestTrustedRootId(): string {
  return TEST_ROOT_ID
}

export function getOfficialTrustedRootId(): string {
  return OFFICIAL_ROOT_ID
}
