import type { ConfidenceLevel, PreviewMode, SendRoute } from './types'

export const SEND_ROUTE_LABEL_CODES: Readonly<Record<SendRoute, string>> = {
  direct_text: 'send.route.direct_text',
  direct_image: 'send.route.direct_image',
  direct_audio: 'send.route.direct_audio',
  direct_video: 'send.route.direct_video',
  direct_file: 'send.route.direct_file',
  converted_markdown: 'send.route.converted_markdown',
  converted_plain_text: 'send.route.converted_plain_text',
  converted_csv: 'send.route.converted_csv',
  converted_tsv: 'send.route.converted_tsv',
  converted_pdf: 'send.route.converted_pdf',
  rendered_images: 'send.route.rendered_images',
  extracted_text: 'send.route.extracted_text',
  extracted_audio: 'send.route.extracted_audio',
  selected_frames: 'send.route.selected_frames',
  blocked: 'send.route.blocked',
  ask_user: 'send.route.ask_user',
  skip: 'send.route.skip',
}

export const PREVIEW_MODE_LABEL_CODES: Readonly<Record<PreviewMode, string>> = {
  none: 'preview.mode.none',
  inline_text: 'preview.mode.inline_text',
  inline_table: 'preview.mode.inline_table',
  inline_image: 'preview.mode.inline_image',
  thumbnail: 'preview.mode.thumbnail',
  audio_waveform: 'preview.mode.audio_waveform',
  video_still: 'preview.mode.video_still',
  download_only: 'preview.mode.download_only',
}

export const WARNING_LABEL_CODES = [
  'warning.low_confidence',
  'warning.macro_capable_document',
  'warning.scriptable_format',
  'warning.mime_mismatch',
  'warning.extension_mismatch',
] as const

export const BLOCKED_LABEL_CODES = [
  'blocked.executable_content',
  'blocked.unknown_binary',
  'blocked.policy_denied',
] as const

export const CONFIDENCE_LABEL_CODES: Readonly<Record<ConfidenceLevel, string>> = {
  high: 'confidence.high',
  medium: 'confidence.medium',
  low: 'confidence.low',
  unknown: 'confidence.unknown',
}

export const LABEL_CODES = [
  ...Object.values(SEND_ROUTE_LABEL_CODES),
  ...Object.values(PREVIEW_MODE_LABEL_CODES),
  ...WARNING_LABEL_CODES,
  ...BLOCKED_LABEL_CODES,
  ...Object.values(CONFIDENCE_LABEL_CODES),
] as const

export type LabelCode = (typeof LABEL_CODES)[number]
