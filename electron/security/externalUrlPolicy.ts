export type ExternalUrlPolicyResult =
  | Readonly<{ ok: true; url: string }>
  | Readonly<{ ok: false; code: 'invalid_url' | 'external_protocol_blocked'; message: string }>

const ALLOWED_EXTERNAL_PROTOCOLS = new Set(['http:', 'https:'])

export function validateExternalUrl(rawUrl: unknown): ExternalUrlPolicyResult {
  const value = typeof rawUrl === 'string' ? rawUrl.trim() : ''
  if (!value) {
    return {
      ok: false,
      code: 'invalid_url',
      message: 'External URL is invalid.',
    }
  }

  let parsed: URL
  try {
    parsed = new URL(value)
  } catch {
    return {
      ok: false,
      code: 'invalid_url',
      message: 'External URL is invalid.',
    }
  }

  if (!ALLOWED_EXTERNAL_PROTOCOLS.has(parsed.protocol)) {
    return {
      ok: false,
      code: 'external_protocol_blocked',
      message: 'External URL protocol is blocked.',
    }
  }

  return { ok: true, url: parsed.toString() }
}

export function isAllowedExternalUrl(rawUrl: unknown): boolean {
  return validateExternalUrl(rawUrl).ok
}
