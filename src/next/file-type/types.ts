export const FILE_KINDS = [
  'text',
  'code',
  'document',
  'spreadsheet',
  'presentation',
  'image',
  'audio',
  'video',
  'archive',
  'database',
  'font',
  'model',
  'executable',
  'container',
  'binary',
  'unknown',
] as const

export type FileKind = (typeof FILE_KINDS)[number]

export const FILE_FORMAT_IDS = [
  'plain_text',
  'markdown',
  'json',
  'yaml',
  'xml',
  'csv',
  'tsv',
  'html',
  'svg',
  'source_code',
  'pdf',
  'doc',
  'docx',
  'docm',
  'odt',
  'rtf',
  'epub',
  'xls',
  'xlsx',
  'xlsm',
  'ods',
  'ppt',
  'pptx',
  'pptm',
  'odp',
  'png',
  'jpeg',
  'gif',
  'webp',
  'bmp',
  'tiff',
  'heic',
  'mp3',
  'wav',
  'm4a',
  'flac',
  'ogg',
  'mp4',
  'mov',
  'mkv',
  'webm',
  'avi',
  'zip',
  'rar',
  'seven_zip',
  'tar',
  'gzip',
  'sqlite_db',
  'parquet',
  'ttf',
  'otf',
  'woff',
  'woff2',
  'onnx',
  'safetensors',
  'windows_exe',
  'msi',
  'dll',
  'elf',
  'mach_o',
  'apk',
  'dmg',
  'script_file',
  'ooxml_container',
  'odf_container',
  'generic_container',
  'octet_stream',
  'unknown_binary',
  'unknown',
] as const

export type FileFormatId = (typeof FILE_FORMAT_IDS)[number]

export const CONFIDENCE_LEVELS = ['high', 'medium', 'low', 'unknown'] as const
export type ConfidenceLevel = (typeof CONFIDENCE_LEVELS)[number]

export const EVIDENCE_SOURCES = [
  'extension',
  'mime_browser',
  'mime_os',
  'magic',
  'container_probe',
  'text_probe',
  'magika',
  'parser_probe',
  'external_detector',
  'user_override',
  'cache',
] as const
export type EvidenceSource = (typeof EVIDENCE_SOURCES)[number]

export const DETECTION_COSTS = ['low', 'medium', 'high'] as const
export type DetectionCost = (typeof DETECTION_COSTS)[number]

export const FILE_TYPE_DETECTION_LEVELS = ['basic', 'advanced', 'parser_validated'] as const
export type FileTypeDetectionLevel = (typeof FILE_TYPE_DETECTION_LEVELS)[number]

export const FILE_TYPE_ENGINE_MODES = [
  'core_only',
  'core_plus_magika',
  'core_plus_parser',
  'core_plus_external',
] as const
export type FileTypeEngineMode = (typeof FILE_TYPE_ENGINE_MODES)[number]

export const FILE_TYPE_MAGIKA_STATES = [
  'not_installed',
  'disabled',
  'unavailable',
  'available',
  'failed',
  'not_requested',
] as const
export type FileTypeMagikaState = (typeof FILE_TYPE_MAGIKA_STATES)[number]

export const FILE_TYPE_DETECTION_TRIGGERS = [
  'upload',
  'send_plan_build',
  'preview_request',
  'conversion_request',
  'manual_redetect',
  'background_upgrade',
] as const
export type FileTypeDetectionTrigger = (typeof FILE_TYPE_DETECTION_TRIGGERS)[number]

export const FILE_TYPE_ROUTE_ELIGIBILITIES = [
  'verdict_ready',
  'detection_pending',
  'detection_failed',
  'detection_required',
] as const
export type FileTypeRouteEligibility = (typeof FILE_TYPE_ROUTE_ELIGIBILITIES)[number]

export const PREVIEW_MODES = [
  'none',
  'inline_text',
  'inline_table',
  'inline_image',
  'thumbnail',
  'audio_waveform',
  'video_still',
  'download_only',
] as const
export type PreviewMode = (typeof PREVIEW_MODES)[number]

export const SEND_ROUTES = [
  'direct_text',
  'direct_image',
  'direct_audio',
  'direct_video',
  'direct_file',
  'converted_markdown',
  'converted_plain_text',
  'converted_csv',
  'converted_tsv',
  'converted_pdf',
  'rendered_images',
  'extracted_text',
  'extracted_audio',
  'selected_frames',
  'blocked',
  'ask_user',
  'skip',
] as const
export type SendRoute = (typeof SEND_ROUTES)[number]

export type SourceCodeMeta = Readonly<{
  languageId: string | null
  shebang: string | null
  hasRuntimeDirective: boolean
  hasEvalLikePattern: boolean
  probableExecutableScript: boolean
}>

export type FileTypeEvidence = Readonly<{
  source: EvidenceSource
  detectedFormatId: FileFormatId | null
  detectedMime: string | null
  detectedExtension: string | null
  confidence: ConfidenceLevel
  reasonCodes: readonly string[]
  errorCode: string | null
  note: string | null
  engineVersion?: string | null
  engineRuntimeKind?: string | null
}>

export type FileTypeConflict = Readonly<{
  expectedFormatId: FileFormatId | null
  observedFormatId: FileFormatId | null
  sources: readonly EvidenceSource[]
  reasonCodes: readonly string[]
  severity: 'low' | 'medium' | 'high'
}>

export type FileTypeFlag = Readonly<{
  flag: string
  reasonCode: string
  blocking: boolean
}>

export type FileTypePrimary = Readonly<{
  formatId: FileFormatId
  kind: FileKind
  confidence: ConfidenceLevel
  reasonCodes: readonly string[]
  sourceCodeMeta: SourceCodeMeta | null
}>

export type FileTypeVerdictProvenance = Readonly<{
  detectionLevel: FileTypeDetectionLevel
  engineMode: FileTypeEngineMode
  usedMagika: boolean
  magikaState: FileTypeMagikaState
  evidenceSources: readonly EvidenceSource[]
  decisiveEvidenceSource: EvidenceSource | null
  detectionTrigger: FileTypeDetectionTrigger
  routeEligibility: FileTypeRouteEligibility
  magikaModelVersion: string | null
  advancedAttempted: boolean
  advancedFailureReason?: string | null
}>

export type FileTypeVerdict = Readonly<{
  primary: FileTypePrimary
  conflicts: readonly FileTypeConflict[]
  flags: readonly FileTypeFlag[]
  evidence: readonly FileTypeEvidence[]
  provenance?: FileTypeVerdictProvenance | null
  schemaVersion: string
  taxonomyVersion: string
  detectionCost: DetectionCost
  fingerprint: string | null
}>

export type FileTypeStaticPolicyResult = Readonly<{
  blocked: boolean
  warning: boolean
  blockingReasonCodes: readonly string[]
  warningReasonCodes: readonly string[]
  blocksDirectSend: boolean
  blocksConversion: boolean
  needsParserValidation: boolean
  defaultPreviewMode: PreviewMode
  defaultSendRoutes: readonly SendRoute[]
}>

export type ModelInputCapabilities = Readonly<{
  acceptsText: boolean
  acceptsImage: boolean
  acceptsAudio: boolean
  acceptsVideo: boolean
  acceptsFile: boolean
  acceptsPdf: boolean
  acceptsCsv: boolean
  acceptsTsv: boolean
  acceptsUrlRef: boolean
  acceptsInlineData: boolean
}>

export type SendPlanCandidate = Readonly<{
  route: SendRoute
  routeLabelCode: string
  previewMode: PreviewMode
  previewLabelCode: string
  compatible: boolean
  requiresJob: boolean
  blocked: boolean
  blockedBy: readonly string[]
  warnings: readonly string[]
  reasonCodes: readonly string[]
  warningLabelCodes: readonly string[]
  blockedLabelCodes: readonly string[]
  confidenceLabelCode: string
}>

export type FileUserOverride = Readonly<{
  requestedFormatId: FileFormatId | null
  requestedRoute: SendRoute | null
  forceSend: boolean
  note: string | null
}>

export type FileFormatDescriptor = Readonly<{
  formatId: FileFormatId
  primaryKind: FileKind
  businessKinds: readonly FileKind[]
  mime: readonly string[]
  canonicalExtension: string | null
  aliases: readonly string[]
  scriptable: boolean
  macroCapable: boolean
  executable: boolean
  containerBased: boolean
  parserRecommended: boolean
}>
