export const OPENROUTER_DEFAULT_BASE_URL = 'https://openrouter.ai/api/v1'

export type OpenRouterBaseUrlPolicyResult =
  | Readonly<{ ok: true; baseUrl: typeof OPENROUTER_DEFAULT_BASE_URL }>
  | Readonly<{ ok: false; code: 'openrouter_base_url_untrusted' }>

export function validateOpenRouterOfficialBaseUrl(raw: unknown): OpenRouterBaseUrlPolicyResult {
  const value = String(raw ?? '').trim()
  if (!value) return { ok: true, baseUrl: OPENROUTER_DEFAULT_BASE_URL }

  try {
    const url = new URL(value)
    if (url.protocol !== 'https:') return untrusted()
    if (url.hostname !== 'openrouter.ai') return untrusted()
    if (url.port || url.username || url.password || url.search || url.hash) return untrusted()
    if (url.pathname.replace(/\/+$/, '') !== '/api/v1') return untrusted()
    return { ok: true, baseUrl: OPENROUTER_DEFAULT_BASE_URL }
  } catch {
    return untrusted()
  }
}

export function isOpenRouterOfficialBaseUrl(raw: unknown): boolean {
  return validateOpenRouterOfficialBaseUrl(raw).ok
}

function untrusted(): OpenRouterBaseUrlPolicyResult {
  return { ok: false, code: 'openrouter_base_url_untrusted' }
}
