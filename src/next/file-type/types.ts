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
  'user_override',
  'cache',
] as const
export type EvidenceSource = (typeof EVIDENCE_SOURCES)[number]

export const DETECTION_COSTS = ['low', 'medium', 'high'] as const
export type DetectionCost = (typeof DETECTION_COSTS)[number]

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

export type FileTypeVerdict = Readonly<{
  primary: FileTypePrimary
  conflicts: readonly FileTypeConflict[]
  flags: readonly FileTypeFlag[]
  evidence: readonly FileTypeEvidence[]
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
