export const ERROR_CODES = [
  'error.file_access_expired',
  'error.read_failed',
  'error.parser_unavailable',
  'error.parser_timeout',
  'error.container_damaged',
  'error.engine_unavailable',
  'error.engine_timeout',
  'error.cache_stale',
] as const

export type ErrorCode = (typeof ERROR_CODES)[number]

export const ERROR_CODE_SET: ReadonlySet<ErrorCode> = new Set(ERROR_CODES)
