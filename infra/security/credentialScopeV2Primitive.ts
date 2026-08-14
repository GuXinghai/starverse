const CREDENTIAL_SCOPE_PATTERN = /^credential-scope-v2:[0-9a-f]{64}$/u

declare const CREDENTIAL_SCOPE_ID_V2: unique symbol

export type CredentialScopeIdV2 = string & {
  readonly [CREDENTIAL_SCOPE_ID_V2]: true
}

export function isCredentialScopeIdV2(value: unknown): value is CredentialScopeIdV2 {
  return typeof value === 'string' && CREDENTIAL_SCOPE_PATTERN.test(value)
}
