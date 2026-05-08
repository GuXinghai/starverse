import { createPublicKey, verify } from 'node:crypto'

export const PLUGIN_CATALOG_SIGNATURE_ALGORITHMS = ['ed25519'] as const
export type PluginCatalogSignatureAlgorithm = (typeof PLUGIN_CATALOG_SIGNATURE_ALGORITHMS)[number]

export type PluginCatalogSignature = Readonly<{
  keyId: string
  algorithm: PluginCatalogSignatureAlgorithm
  value: string
}>

export type TrustedCatalogPublicKey = Readonly<{
  keyId: string
  algorithm: PluginCatalogSignatureAlgorithm
  publicKeyPem: string
}>

export type TrustedCatalogPublicKeyMap = Readonly<Record<string, TrustedCatalogPublicKey>>

export type CatalogSignatureVerificationFailureReason =
  | 'signature_missing'
  | 'signature_algorithm_unsupported'
  | 'trusted_root_missing'
  | 'trusted_root_invalid'
  | 'signature_value_invalid'
  | 'signature_invalid'

export type CatalogSignatureVerificationResult =
  | Readonly<{ ok: true }>
  | Readonly<{
      ok: false
      reason: CatalogSignatureVerificationFailureReason
      detail: string
    }>

const SIGNATURE_ALGORITHM_SET = new Set<string>(PLUGIN_CATALOG_SIGNATURE_ALGORITHMS)

export function verifyCatalogSignature(input: Readonly<{
  signedPayload: unknown
  signature: PluginCatalogSignature | null | undefined
  trustedRoots: TrustedCatalogPublicKeyMap
}>): CatalogSignatureVerificationResult {
  if (!input.signature) {
    return { ok: false, reason: 'signature_missing', detail: 'catalog signature is required' }
  }

  const algorithm = normalizeNonEmptyString(input.signature.algorithm)
  if (!algorithm || !SIGNATURE_ALGORITHM_SET.has(algorithm)) {
    return {
      ok: false,
      reason: 'signature_algorithm_unsupported',
      detail: 'unsupported catalog signature algorithm',
    }
  }

  const keyId = normalizeNonEmptyString(input.signature.keyId)
  if (!keyId) {
    return { ok: false, reason: 'trusted_root_missing', detail: 'catalog signature keyId is required' }
  }

  const trusted = input.trustedRoots[keyId]
  if (!trusted || trusted.algorithm !== algorithm) {
    return {
      ok: false,
      reason: 'trusted_root_missing',
      detail: `trusted root not found for keyId: ${keyId}`,
    }
  }

  const publicKeyPem = normalizeNonEmptyString(trusted.publicKeyPem)
  if (!publicKeyPem) {
    return {
      ok: false,
      reason: 'trusted_root_invalid',
      detail: `trusted root key is empty: ${keyId}`,
    }
  }

  const signatureBytes = decodeBase64(input.signature.value)
  if (!signatureBytes || signatureBytes.length === 0) {
    return {
      ok: false,
      reason: 'signature_value_invalid',
      detail: 'catalog signature value must be valid base64',
    }
  }

  const payloadBytes = createCatalogSigningPayload(input.signedPayload)
  try {
    const publicKey = createPublicKey(publicKeyPem)
    const ok = verify(null, Buffer.from(payloadBytes), publicKey, signatureBytes)
    if (!ok) {
      return { ok: false, reason: 'signature_invalid', detail: 'catalog signature verification failed' }
    }
  } catch {
    return {
      ok: false,
      reason: 'trusted_root_invalid',
      detail: `trusted root key parse failed: ${keyId}`,
    }
  }

  return { ok: true }
}

export function createCatalogSigningPayload(value: unknown): Uint8Array {
  const normalized = stableJsonNormalize(value)
  return Buffer.from(JSON.stringify(normalized), 'utf8')
}

function stableJsonNormalize(value: unknown): unknown {
  if (value == null) return null
  if (typeof value === 'string' || typeof value === 'number' || typeof value === 'boolean') return value
  if (Array.isArray(value)) return value.map((item) => stableJsonNormalize(item))
  if (typeof value !== 'object') return String(value)

  const source = value as Record<string, unknown>
  const keys = Object.keys(source).sort((left, right) => left.localeCompare(right))
  const out: Record<string, unknown> = {}
  for (const key of keys) {
    const current = source[key]
    if (current === undefined) continue
    out[key] = stableJsonNormalize(current)
  }
  return out
}

function normalizeNonEmptyString(value: unknown): string | null {
  if (typeof value !== 'string') return null
  const trimmed = value.trim()
  return trimmed.length > 0 ? trimmed : null
}

function decodeBase64(value: unknown): Uint8Array | null {
  if (typeof value !== 'string') return null
  const trimmed = value.trim()
  if (!trimmed) return null
  if (!/^[A-Za-z0-9+/_=-]+$/u.test(trimmed)) return null

  const normalized = trimmed.replace(/-/gu, '+').replace(/_/gu, '/')
  const padded = normalized + '='.repeat((4 - (normalized.length % 4)) % 4)
  try {
    return Buffer.from(padded, 'base64')
  } catch {
    return null
  }
}
