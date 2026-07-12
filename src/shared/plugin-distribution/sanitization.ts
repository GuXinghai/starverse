const WINDOWS_ABSOLUTE_PATH_RE = /\b[A-Za-z]:[\\/][^\r\n"'`]+/g
const WINDOWS_UNC_PATH_RE = /\\\\[^\r\n"'`]+/g
const UNIX_ABSOLUTE_PATH_RE = /(^|[\s:(])\/(?:[^\s"',}]+\/)*[^\s"',}]+/g
const KEY_VALUE_DOUBLE_QUOTED_UNIX_PATH_RE = /([=:]\s*)"\/[^"]*("?)/g
const KEY_VALUE_SINGLE_QUOTED_UNIX_PATH_RE = /([=:]\s*)'\/[^']*('?)/g
const KEY_VALUE_DOUBLE_QUOTED_WINDOWS_PATH_RE = /([=:]\s*)"([A-Za-z]:[\\/]|\\\\)[^"]*("?)/g
const KEY_VALUE_SINGLE_QUOTED_WINDOWS_PATH_RE = /([=:]\s*)'([A-Za-z]:[\\/]|\\\\)[^']*('?)/g
const KEY_VALUE_UNIX_PATH_RE = /([=:]\s*)\/[^"',}]+/g
const KEY_VALUE_WINDOWS_PATH_RE = /([=:]\s*)[A-Za-z]:[\\/][^"',}]+/g
const URL_RE = /\b(?:https?|file):\/\/[^\s"'`<>()\]}]+/gi
const SHA256_HEX_RE = /\b[a-f0-9]{64}\b/gi
const CONTENT_TOKEN_RE = /(contentToken["'\s:=]+)([^\s"',}]+)/gi
const FULL_HASH_RE = /(fullHash["'\s:=]+)([A-Za-z0-9+/=:_-]{12,})/gi

export function sanitizePluginDistributionText(value: string | null | undefined): string | undefined {
  if (!value) return undefined
  const compact = value.trim()
  if (!compact) return undefined
  return compact
    .replace(CONTENT_TOKEN_RE, '$1[redacted-token]')
    .replace(FULL_HASH_RE, '$1[redacted-hash]')
    .replace(SHA256_HEX_RE, '[redacted-hash]')
    .replace(URL_RE, '[redacted-url]')
    .replace(KEY_VALUE_DOUBLE_QUOTED_WINDOWS_PATH_RE, '$1"[redacted-path]"')
    .replace(KEY_VALUE_SINGLE_QUOTED_WINDOWS_PATH_RE, "$1'[redacted-path]'")
    .replace(KEY_VALUE_DOUBLE_QUOTED_UNIX_PATH_RE, '$1"[redacted-path]"')
    .replace(KEY_VALUE_SINGLE_QUOTED_UNIX_PATH_RE, "$1'[redacted-path]'")
    .replace(KEY_VALUE_WINDOWS_PATH_RE, '$1[redacted-path]')
    .replace(KEY_VALUE_UNIX_PATH_RE, '$1[redacted-path]')
    .replace(WINDOWS_ABSOLUTE_PATH_RE, '[redacted-path]')
    .replace(WINDOWS_UNC_PATH_RE, '[redacted-path]')
    .replace(UNIX_ABSOLUTE_PATH_RE, (_match, prefix: string) => `${prefix}[redacted-path]`)
}
