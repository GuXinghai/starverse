import {
  isCompatibleSecretLikeFieldName,
  looksLikeCompatibleSecretValue,
} from '../../src/shared/provider/openai-chat-compatible/schemas'
import { assertCompatibleNetworkUrl } from './compatibleAddressPolicy'

export type CompatibleRedirectPolicyErrorCode =
  | 'compatible_redirect_blocked'
  | 'compatible_redirect_limit'
  | 'compatible_redirect_loop'

export class CompatibleRedirectPolicyError extends Error {
  readonly code: CompatibleRedirectPolicyErrorCode

  constructor(code: CompatibleRedirectPolicyErrorCode) {
    super(code)
    this.name = 'CompatibleRedirectPolicyError'
    this.code = code
  }
}

export type CompatibleRedirectState = Readonly<{
  initialOrigin: string
  currentUrl: URL
  method: 'GET' | 'POST'
  redirectCount: number
  credentialForwardingAllowed: boolean
  visited: ReadonlySet<string>
}>

export function createCompatibleRedirectState(input: Readonly<{
  url: URL
  method: 'GET' | 'POST'
}>): CompatibleRedirectState {
  const url = canonicalRedirectUrl(input.url)
  return Object.freeze({
    initialOrigin: url.origin,
    currentUrl: url,
    method: input.method,
    redirectCount: 0,
    credentialForwardingAllowed: true,
    visited: new Set([url.toString()]),
  })
}

export function advanceCompatibleRedirect(
  state: CompatibleRedirectState,
  input: Readonly<{ status: number; location: string }>,
  maxRedirects = 5,
): CompatibleRedirectState {
  if (![301, 302, 303, 307, 308].includes(input.status) || !input.location || maxRedirects < 0 || maxRedirects > 5) {
    throw new CompatibleRedirectPolicyError('compatible_redirect_blocked')
  }
  if (state.redirectCount >= maxRedirects) {
    throw new CompatibleRedirectPolicyError('compatible_redirect_limit')
  }
  let next: URL
  try {
    next = canonicalRedirectUrl(new URL(input.location, state.currentUrl))
  } catch {
    throw new CompatibleRedirectPolicyError('compatible_redirect_blocked')
  }
  const identity = next.toString()
  if (state.visited.has(identity)) throw new CompatibleRedirectPolicyError('compatible_redirect_loop')
  const sameOrigin = state.currentUrl.origin === next.origin
  const visited = new Set(state.visited)
  visited.add(identity)
  return Object.freeze({
    initialOrigin: state.initialOrigin,
    currentUrl: next,
    method: state.method,
    redirectCount: state.redirectCount + 1,
    credentialForwardingAllowed: state.credentialForwardingAllowed && sameOrigin,
    visited,
  })
}

export function shouldPreserveCompatibleRequestBody(state: CompatibleRedirectState): boolean {
  return state.method === 'POST'
}

function canonicalRedirectUrl(raw: URL): URL {
  const url = new URL(raw.toString())
  url.hash = ''
  assertCompatibleNetworkUrl(url)
  if (url.toString().length > 8_192) throw new CompatibleRedirectPolicyError('compatible_redirect_blocked')
  for (const [name, value] of url.searchParams.entries()) {
    if (isCompatibleSecretLikeFieldName(name) || looksLikeCompatibleSecretValue(value)) {
      throw new CompatibleRedirectPolicyError('compatible_redirect_blocked')
    }
  }
  return url
}
