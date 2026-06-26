const SECRET_VALUE_PATTERN = /\b(?:sk|sk-or|sk-ant|AIza|pk)-[A-Za-z0-9._-]{6,}\b/g
const BEARER_PATTERN = /\bBearer\s+[A-Za-z0-9._~+/=-]+/gi
const AUTHORIZATION_PATTERN = /\bAuthorization\s*[:=]\s*[^\s,;}\]]+/gi
const X_API_KEY_PATTERN = /\bx-api-key\s*[:=]\s*[^\s,;}\]]+/gi

export function redactProviderCredentialText(value: unknown): string {
  return String(value ?? '')
    .replace(AUTHORIZATION_PATTERN, 'Authorization: [REDACTED]')
    .replace(X_API_KEY_PATTERN, 'x-api-key: [REDACTED]')
    .replace(BEARER_PATTERN, 'Bearer [REDACTED]')
    .replace(SECRET_VALUE_PATTERN, '[REDACTED_API_KEY]')
}

export function safeProviderCredentialErrorMessage(value: unknown, fallback: string): string {
  const text = redactProviderCredentialText(value).trim()
  if (!text) return fallback
  if (text.length > 500) return `${text.slice(0, 500)}...[truncated]`
  return text
}

