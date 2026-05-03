import { FILE_FORMAT_DESCRIPTORS } from './taxonomy'
import type { FileTypeConflict, FileTypeFlag, FileTypePrimary, FileTypeStaticPolicyResult, SendRoute } from './types'

export type FileTypeStaticPolicyInput = Readonly<{
  primary: FileTypePrimary
  conflicts: readonly FileTypeConflict[]
  flags: readonly FileTypeFlag[]
}>

export function evaluateFileTypeStaticPolicy(input: FileTypeStaticPolicyInput): FileTypeStaticPolicyResult {
  const descriptor = FILE_FORMAT_DESCRIPTORS[input.primary.formatId]

  const blockingReasonCodes = new Set<string>()
  const warningReasonCodes = new Set<string>()

  for (const flag of input.flags) {
    if (flag.blocking) blockingReasonCodes.add(flag.reasonCode)
    else warningReasonCodes.add(flag.reasonCode)
  }

  if (descriptor?.executable) blockingReasonCodes.add('reason.executable_content')
  if (descriptor?.macroCapable) warningReasonCodes.add('reason.macro_capable_document')
  if (descriptor?.scriptable) warningReasonCodes.add('reason.scriptable_format')
  if (input.primary.confidence === 'low' || input.primary.confidence === 'unknown') warningReasonCodes.add('reason.low_confidence')
  if (input.conflicts.some((conflict) => conflict.severity === 'high')) blockingReasonCodes.add('reason.polyglot_suspected')

  const blocked = blockingReasonCodes.size > 0
  const warning = !blocked && warningReasonCodes.size > 0

  return {
    blocked,
    warning,
    blockingReasonCodes: Array.from(blockingReasonCodes),
    warningReasonCodes: Array.from(warningReasonCodes),
    defaultPreviewMode: pickPreviewMode(descriptor?.primaryKind ?? input.primary.kind),
    defaultSendRoutes: pickDefaultRoutes(descriptor?.primaryKind ?? input.primary.kind, blocked),
  }
}

function pickPreviewMode(kind: FileTypePrimary['kind']): FileTypeStaticPolicyResult['defaultPreviewMode'] {
  switch (kind) {
    case 'image':
      return 'inline_image'
    case 'audio':
      return 'audio_waveform'
    case 'video':
      return 'video_still'
    case 'spreadsheet':
      return 'inline_table'
    case 'text':
    case 'code':
    case 'document':
      return 'inline_text'
    default:
      return 'download_only'
  }
}

function pickDefaultRoutes(kind: FileTypePrimary['kind'], blocked: boolean): SendRoute[] {
  if (blocked) return ['blocked']
  switch (kind) {
    case 'image':
      return ['direct_image']
    case 'audio':
      return ['direct_audio', 'extracted_audio']
    case 'video':
      return ['direct_video', 'selected_frames']
    case 'spreadsheet':
      return ['converted_csv', 'converted_tsv']
    case 'text':
    case 'code':
      return ['direct_text']
    case 'document':
      return ['direct_file', 'converted_markdown']
    case 'archive':
    case 'container':
    case 'binary':
    case 'unknown':
      return ['ask_user']
    default:
      return ['ask_user']
  }
}
