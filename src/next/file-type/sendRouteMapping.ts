import {
  BLOCKED_LABEL_CODES,
  CONFIDENCE_LABEL_CODES,
  PREVIEW_MODE_LABEL_CODES,
  SEND_ROUTE_LABEL_CODES,
  WARNING_LABEL_CODES,
} from './labelCodes'
import { evaluateFileTypeStaticPolicy } from './fileTypeStaticPolicy'
import type {
  FileTypeVerdict,
  FileUserOverride,
  ModelInputCapabilities,
  SendPlanCandidate,
  SendRoute,
} from './types'

export type SendRouteMappingEngineAvailability = Readonly<{
  documentConversion: boolean
  spreadsheetConversion: boolean
  presentationConversion: boolean
  renderedImages: boolean
  textExtraction: boolean
  audioExtraction: boolean
  frameSelection: boolean
}>

export type SendRouteMappingUserPrefs = Readonly<{
  preferDirectFile: boolean
  allowUnknownBinary: boolean
  allowScriptableFormats: boolean
}>

export type BuildSendPlanCandidatesInput = Readonly<{
  verdict: FileTypeVerdict
  modelCapabilities: ModelInputCapabilities
  userPrefs?: Partial<SendRouteMappingUserPrefs> | null
  engineAvailability?: Partial<SendRouteMappingEngineAvailability> | null
  override?: FileUserOverride | null
}>

const DEFAULT_PREFS: SendRouteMappingUserPrefs = {
  preferDirectFile: false,
  allowUnknownBinary: false,
  allowScriptableFormats: false,
}

const DEFAULT_ENGINES: SendRouteMappingEngineAvailability = {
  documentConversion: true,
  spreadsheetConversion: true,
  presentationConversion: true,
  renderedImages: true,
  textExtraction: true,
  audioExtraction: true,
  frameSelection: true,
}

const DOCUMENT_FORMATS = new Set([
  'pdf', 'doc', 'docx', 'docm', 'odt', 'rtf', 'epub',
])
const SPREADSHEET_FORMATS = new Set(['csv', 'tsv', 'xls', 'xlsx', 'xlsm', 'ods', 'parquet'])
const PRESENTATION_FORMATS = new Set(['ppt', 'pptx', 'pptm', 'odp'])
const IMAGE_FORMATS = new Set(['png', 'jpeg', 'gif', 'webp', 'bmp', 'tiff', 'heic', 'svg'])
const AUDIO_FORMATS = new Set(['mp3', 'wav', 'm4a', 'flac', 'ogg'])
const VIDEO_FORMATS = new Set(['mp4', 'mov', 'mkv', 'webm', 'avi'])
const TEXT_FORMATS = new Set(['plain_text', 'markdown', 'source_code', 'json', 'yaml', 'xml'])
const EXECUTABLE_FORMATS = new Set(['windows_exe', 'msi', 'dll', 'elf', 'mach_o', 'apk', 'dmg', 'script_file'])
const ARCHIVE_FORMATS = new Set(['zip', 'rar', 'seven_zip', 'tar', 'gzip', 'generic_container', 'ooxml_container', 'odf_container'])

export function buildSendPlanCandidates(input: BuildSendPlanCandidatesInput): SendPlanCandidate[] {
  const prefs = { ...DEFAULT_PREFS, ...(input.userPrefs ?? {}) }
  const engines = { ...DEFAULT_ENGINES, ...(input.engineAvailability ?? {}) }
  const policy = evaluateFileTypeStaticPolicy({
    primary: input.verdict.primary,
    conflicts: input.verdict.conflicts,
    flags: input.verdict.flags,
  })
  const formatId = input.verdict.primary.formatId
  const capabilities = input.modelCapabilities

  if (policy.blocked) {
    return [candidateFromRoute('blocked', input, policy, capabilities, engines, ['policy_blocked'], ['static_policy'])]
  }

  const routes: SendRoute[] = []
  if (TEXT_FORMATS.has(formatId)) {
    if (formatId === 'html' || formatId === 'svg') {
      if (!prefs.allowScriptableFormats) {
        routes.push('ask_user')
      } else {
        routes.push('converted_plain_text', 'direct_text')
      }
    } else {
      routes.push('direct_text')
    }
  } else if (formatId === 'csv') {
    routes.push('converted_csv', 'direct_text')
  } else if (formatId === 'tsv') {
    routes.push('converted_tsv', 'direct_text')
  } else if (DOCUMENT_FORMATS.has(formatId)) {
    if (prefs.preferDirectFile) routes.push('direct_file')
    routes.push('converted_markdown', 'extracted_text', 'direct_file')
  } else if (SPREADSHEET_FORMATS.has(formatId)) {
    routes.push('converted_csv', 'converted_tsv', 'direct_file')
  } else if (PRESENTATION_FORMATS.has(formatId)) {
    routes.push('converted_markdown', 'rendered_images', 'direct_file')
  } else if (IMAGE_FORMATS.has(formatId)) {
    routes.push('direct_image', 'direct_file')
  } else if (AUDIO_FORMATS.has(formatId)) {
    routes.push('direct_audio', 'extracted_audio', 'direct_file')
  } else if (VIDEO_FORMATS.has(formatId)) {
    routes.push('direct_video', 'selected_frames', 'direct_file')
  } else if (ARCHIVE_FORMATS.has(formatId)) {
    routes.push('ask_user')
  } else if (EXECUTABLE_FORMATS.has(formatId)) {
    routes.push('blocked')
  } else if (formatId === 'unknown_binary' || formatId === 'unknown' || formatId === 'octet_stream') {
    routes.push(prefs.allowUnknownBinary ? 'ask_user' : 'blocked')
  } else {
    routes.push('ask_user')
  }

  const overrideRoute = input.override?.requestedRoute
  if (overrideRoute) {
    const forced = candidateFromRoute(overrideRoute, input, policy, capabilities, engines, ['user_override'], [])
    const rest = routes
      .filter((route) => route !== overrideRoute)
      .map((route) => candidateFromRoute(route, input, policy, capabilities, engines, [], []))
    return dedupeCandidates([forced, ...rest])
  }

  return dedupeCandidates(routes.map((route) => candidateFromRoute(route, input, policy, capabilities, engines, [], [])))
}

function candidateFromRoute(
  route: SendRoute,
  input: BuildSendPlanCandidatesInput,
  policy: ReturnType<typeof evaluateFileTypeStaticPolicy>,
  capabilities: ModelInputCapabilities,
  engines: SendRouteMappingEngineAvailability,
  extraReasonCodes: string[],
  extraWarnings: string[]
): SendPlanCandidate {
  const compatibility = evaluateCompatibility(route, capabilities)
  const engineGate = evaluateEngineGate(route, engines)
  const baseBlocked = route === 'blocked'
  const blockedBy = [
    ...(compatibility.compatible ? [] : [compatibility.reason]),
    ...(engineGate.available ? [] : [engineGate.reason]),
  ]
  const blocked = baseBlocked || blockedBy.length > 0
  const warningCodes = new Set<string>(policy.warningReasonCodes)
  for (const warning of extraWarnings) warningCodes.add(warning)
  const warningLabelCodes = mapWarningsToLabelCodes(Array.from(warningCodes))
  const blockedLabelCodes = blocked
    ? mapBlockedToLabelCodes(policy.blockingReasonCodes.length > 0 ? policy.blockingReasonCodes : blockedBy)
    : []

  return {
    route,
    routeLabelCode: SEND_ROUTE_LABEL_CODES[route],
    previewMode: policy.defaultPreviewMode,
    previewLabelCode: PREVIEW_MODE_LABEL_CODES[policy.defaultPreviewMode],
    compatible: compatibility.compatible && engineGate.available && route !== 'blocked',
    requiresJob: routeRequiresJob(route),
    blocked,
    blockedBy,
    warnings: Array.from(warningCodes),
    reasonCodes: [...policy.blockingReasonCodes, ...extraReasonCodes].filter(Boolean),
    warningLabelCodes,
    blockedLabelCodes,
    confidenceLabelCode: CONFIDENCE_LABEL_CODES[input.verdict.primary.confidence],
  }
}

function routeRequiresJob(route: SendRoute): boolean {
  return (
    route === 'converted_markdown' ||
    route === 'converted_plain_text' ||
    route === 'converted_csv' ||
    route === 'converted_tsv' ||
    route === 'converted_pdf' ||
    route === 'rendered_images' ||
    route === 'extracted_text' ||
    route === 'extracted_audio' ||
    route === 'selected_frames'
  )
}

function evaluateCompatibility(
  route: SendRoute,
  capabilities: ModelInputCapabilities
): Readonly<{ compatible: boolean; reason: string }> {
  switch (route) {
    case 'direct_text':
    case 'converted_markdown':
    case 'converted_plain_text':
    case 'converted_csv':
    case 'converted_tsv':
    case 'extracted_text':
      return { compatible: capabilities.acceptsText, reason: 'model_text_unsupported' }
    case 'direct_image':
    case 'rendered_images':
      return { compatible: capabilities.acceptsImage, reason: 'model_image_unsupported' }
    case 'direct_audio':
    case 'extracted_audio':
      return { compatible: capabilities.acceptsAudio, reason: 'model_audio_unsupported' }
    case 'direct_video':
    case 'selected_frames':
      return { compatible: capabilities.acceptsVideo || capabilities.acceptsImage, reason: 'model_video_unsupported' }
    case 'direct_file':
    case 'converted_pdf':
      return { compatible: capabilities.acceptsFile || capabilities.acceptsPdf, reason: 'model_file_unsupported' }
    case 'ask_user':
    case 'skip':
    case 'blocked':
      return { compatible: true, reason: '' }
    default:
      return { compatible: true, reason: '' }
  }
}

function evaluateEngineGate(
  route: SendRoute,
  engines: SendRouteMappingEngineAvailability
): Readonly<{ available: boolean; reason: string }> {
  switch (route) {
    case 'converted_markdown':
    case 'converted_plain_text':
      return { available: engines.documentConversion, reason: 'engine_document_conversion_unavailable' }
    case 'converted_csv':
    case 'converted_tsv':
      return { available: engines.spreadsheetConversion, reason: 'engine_spreadsheet_conversion_unavailable' }
    case 'rendered_images':
      return { available: engines.renderedImages || engines.presentationConversion, reason: 'engine_rendered_images_unavailable' }
    case 'extracted_text':
      return { available: engines.textExtraction, reason: 'engine_text_extraction_unavailable' }
    case 'extracted_audio':
      return { available: engines.audioExtraction, reason: 'engine_audio_extraction_unavailable' }
    case 'selected_frames':
      return { available: engines.frameSelection, reason: 'engine_frame_selection_unavailable' }
    default:
      return { available: true, reason: '' }
  }
}

function mapWarningsToLabelCodes(warnings: readonly string[]): string[] {
  const out = new Set<string>()
  for (const warning of warnings) {
    if (warning.includes('low_confidence')) out.add('warning.low_confidence')
    if (warning.includes('macro_capable_document')) out.add('warning.macro_capable_document')
    if (warning.includes('scriptable_format')) out.add('warning.scriptable_format')
  }
  for (const code of out) {
    if (!WARNING_LABEL_CODES.includes(code as any)) out.delete(code)
  }
  return Array.from(out)
}

function mapBlockedToLabelCodes(reasons: readonly string[]): string[] {
  const out = new Set<string>()
  for (const reason of reasons) {
    if (reason.includes('executable_content')) out.add('blocked.executable_content')
    if (reason.includes('unknown_binary')) out.add('blocked.unknown_binary')
  }
  if (out.size === 0) out.add('blocked.policy_denied')
  for (const code of out) {
    if (!BLOCKED_LABEL_CODES.includes(code as any)) out.delete(code)
  }
  if (out.size === 0) out.add('blocked.policy_denied')
  return Array.from(out)
}

function dedupeCandidates(candidates: readonly SendPlanCandidate[]): SendPlanCandidate[] {
  const map = new Map<SendRoute, SendPlanCandidate>()
  for (const candidate of candidates) {
    if (!map.has(candidate.route)) map.set(candidate.route, candidate)
  }
  return Array.from(map.values())
}
