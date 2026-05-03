export const REASON_CODES = [
  'reason.magic_matched',
  'reason.extension_mismatch',
  'reason.browser_mime_mismatch',
  'reason.os_mime_mismatch',
  'reason.container_probe_matched',
  'reason.container_probe_failed',
  'reason.parser_probe_failed',
  'reason.low_confidence',
  'reason.executable_content',
  'reason.macro_capable_document',
  'reason.scriptable_format',
  'reason.polyglot_suspected',
  'reason.unknown_binary',
] as const

export type ReasonCode = (typeof REASON_CODES)[number]

export const REASON_CODE_SET: ReadonlySet<ReasonCode> = new Set(REASON_CODES)
