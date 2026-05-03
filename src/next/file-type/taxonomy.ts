import {
  FILE_FORMAT_IDS,
  type FileFormatDescriptor,
  type FileFormatId,
  type FileKind,
} from './types'

export const FILE_TYPE_TAXONOMY_VERSION = 'v0-stage-b'

function descriptor(
  formatId: FileFormatId,
  primaryKind: FileKind,
  options: Readonly<{
    businessKinds?: readonly FileKind[]
    mime?: readonly string[]
    canonicalExtension?: string | null
    aliases?: readonly string[]
    scriptable?: boolean
    macroCapable?: boolean
    executable?: boolean
    containerBased?: boolean
    parserRecommended?: boolean
  }>
): FileFormatDescriptor {
  return {
    formatId,
    primaryKind,
    businessKinds: options.businessKinds ?? [primaryKind],
    mime: options.mime ?? [],
    canonicalExtension: options.canonicalExtension ?? null,
    aliases: options.aliases ?? [],
    scriptable: options.scriptable ?? false,
    macroCapable: options.macroCapable ?? false,
    executable: options.executable ?? false,
    containerBased: options.containerBased ?? false,
    parserRecommended: options.parserRecommended ?? false,
  }
}

export const FILE_FORMAT_DESCRIPTORS: Readonly<Record<FileFormatId, FileFormatDescriptor>> = {
  plain_text: descriptor('plain_text', 'text', {
    mime: ['text/plain'],
    canonicalExtension: 'txt',
    aliases: ['text'],
  }),
  markdown: descriptor('markdown', 'text', {
    mime: ['text/markdown', 'text/x-markdown'],
    canonicalExtension: 'md',
  }),
  json: descriptor('json', 'text', {
    mime: ['application/json', 'text/json'],
    canonicalExtension: 'json',
    parserRecommended: true,
  }),
  yaml: descriptor('yaml', 'text', {
    mime: ['application/yaml', 'text/yaml', 'text/x-yaml'],
    canonicalExtension: 'yaml',
    aliases: ['yml'],
    parserRecommended: true,
  }),
  xml: descriptor('xml', 'text', {
    mime: ['application/xml', 'text/xml'],
    canonicalExtension: 'xml',
    parserRecommended: true,
  }),
  csv: descriptor('csv', 'spreadsheet', {
    businessKinds: ['spreadsheet', 'text'],
    mime: ['text/csv'],
    canonicalExtension: 'csv',
    parserRecommended: true,
  }),
  tsv: descriptor('tsv', 'spreadsheet', {
    businessKinds: ['spreadsheet', 'text'],
    mime: ['text/tab-separated-values'],
    canonicalExtension: 'tsv',
    parserRecommended: true,
  }),
  html: descriptor('html', 'document', {
    businessKinds: ['document', 'text', 'code'],
    mime: ['text/html'],
    canonicalExtension: 'html',
    aliases: ['htm'],
    scriptable: true,
    parserRecommended: true,
  }),
  svg: descriptor('svg', 'image', {
    businessKinds: ['image', 'document', 'code'],
    mime: ['image/svg+xml'],
    canonicalExtension: 'svg',
    scriptable: true,
    parserRecommended: true,
  }),
  source_code: descriptor('source_code', 'code', {
    businessKinds: ['code', 'text'],
    mime: ['text/plain', 'application/octet-stream'],
    canonicalExtension: null,
    aliases: ['code'],
    scriptable: true,
    parserRecommended: true,
  }),

  pdf: descriptor('pdf', 'document', {
    mime: ['application/pdf'],
    canonicalExtension: 'pdf',
    parserRecommended: true,
  }),
  doc: descriptor('doc', 'document', {
    mime: ['application/msword'],
    canonicalExtension: 'doc',
    parserRecommended: true,
  }),
  docx: descriptor('docx', 'document', {
    businessKinds: ['document', 'container'],
    mime: ['application/vnd.openxmlformats-officedocument.wordprocessingml.document'],
    canonicalExtension: 'docx',
    containerBased: true,
    parserRecommended: true,
  }),
  docm: descriptor('docm', 'document', {
    businessKinds: ['document', 'container'],
    mime: ['application/vnd.ms-word.document.macroenabled.12'],
    canonicalExtension: 'docm',
    macroCapable: true,
    containerBased: true,
    parserRecommended: true,
  }),
  odt: descriptor('odt', 'document', {
    businessKinds: ['document', 'container'],
    mime: ['application/vnd.oasis.opendocument.text'],
    canonicalExtension: 'odt',
    containerBased: true,
    parserRecommended: true,
  }),
  rtf: descriptor('rtf', 'document', {
    mime: ['application/rtf', 'text/rtf'],
    canonicalExtension: 'rtf',
    parserRecommended: true,
  }),
  epub: descriptor('epub', 'document', {
    businessKinds: ['document', 'container'],
    mime: ['application/epub+zip'],
    canonicalExtension: 'epub',
    containerBased: true,
    parserRecommended: true,
  }),

  xls: descriptor('xls', 'spreadsheet', {
    businessKinds: ['spreadsheet', 'document'],
    mime: ['application/vnd.ms-excel'],
    canonicalExtension: 'xls',
    parserRecommended: true,
  }),
  xlsx: descriptor('xlsx', 'spreadsheet', {
    businessKinds: ['spreadsheet', 'document', 'container'],
    mime: ['application/vnd.openxmlformats-officedocument.spreadsheetml.sheet'],
    canonicalExtension: 'xlsx',
    containerBased: true,
    parserRecommended: true,
  }),
  xlsm: descriptor('xlsm', 'spreadsheet', {
    businessKinds: ['spreadsheet', 'document', 'container'],
    mime: ['application/vnd.ms-excel.sheet.macroenabled.12'],
    canonicalExtension: 'xlsm',
    macroCapable: true,
    containerBased: true,
    parserRecommended: true,
  }),
  ods: descriptor('ods', 'spreadsheet', {
    businessKinds: ['spreadsheet', 'document', 'container'],
    mime: ['application/vnd.oasis.opendocument.spreadsheet'],
    canonicalExtension: 'ods',
    containerBased: true,
    parserRecommended: true,
  }),

  ppt: descriptor('ppt', 'presentation', {
    businessKinds: ['presentation', 'document'],
    mime: ['application/vnd.ms-powerpoint'],
    canonicalExtension: 'ppt',
    parserRecommended: true,
  }),
  pptx: descriptor('pptx', 'presentation', {
    businessKinds: ['presentation', 'document', 'container'],
    mime: ['application/vnd.openxmlformats-officedocument.presentationml.presentation'],
    canonicalExtension: 'pptx',
    containerBased: true,
    parserRecommended: true,
  }),
  pptm: descriptor('pptm', 'presentation', {
    businessKinds: ['presentation', 'document', 'container'],
    mime: ['application/vnd.ms-powerpoint.presentation.macroenabled.12'],
    canonicalExtension: 'pptm',
    macroCapable: true,
    containerBased: true,
    parserRecommended: true,
  }),
  odp: descriptor('odp', 'presentation', {
    businessKinds: ['presentation', 'document', 'container'],
    mime: ['application/vnd.oasis.opendocument.presentation'],
    canonicalExtension: 'odp',
    containerBased: true,
    parserRecommended: true,
  }),

  png: descriptor('png', 'image', {
    mime: ['image/png'],
    canonicalExtension: 'png',
  }),
  jpeg: descriptor('jpeg', 'image', {
    mime: ['image/jpeg'],
    canonicalExtension: 'jpg',
    aliases: ['jpeg'],
  }),
  gif: descriptor('gif', 'image', {
    mime: ['image/gif'],
    canonicalExtension: 'gif',
  }),
  webp: descriptor('webp', 'image', {
    mime: ['image/webp'],
    canonicalExtension: 'webp',
  }),
  bmp: descriptor('bmp', 'image', {
    mime: ['image/bmp'],
    canonicalExtension: 'bmp',
  }),
  tiff: descriptor('tiff', 'image', {
    mime: ['image/tiff'],
    canonicalExtension: 'tiff',
    aliases: ['tif'],
  }),
  heic: descriptor('heic', 'image', {
    mime: ['image/heic', 'image/heif'],
    canonicalExtension: 'heic',
  }),

  mp3: descriptor('mp3', 'audio', {
    mime: ['audio/mpeg'],
    canonicalExtension: 'mp3',
  }),
  wav: descriptor('wav', 'audio', {
    mime: ['audio/wav', 'audio/x-wav'],
    canonicalExtension: 'wav',
  }),
  m4a: descriptor('m4a', 'audio', {
    mime: ['audio/mp4'],
    canonicalExtension: 'm4a',
  }),
  flac: descriptor('flac', 'audio', {
    mime: ['audio/flac'],
    canonicalExtension: 'flac',
  }),
  ogg: descriptor('ogg', 'audio', {
    mime: ['audio/ogg'],
    canonicalExtension: 'ogg',
  }),

  mp4: descriptor('mp4', 'video', {
    mime: ['video/mp4'],
    canonicalExtension: 'mp4',
  }),
  mov: descriptor('mov', 'video', {
    mime: ['video/quicktime'],
    canonicalExtension: 'mov',
  }),
  mkv: descriptor('mkv', 'video', {
    mime: ['video/x-matroska'],
    canonicalExtension: 'mkv',
  }),
  webm: descriptor('webm', 'video', {
    mime: ['video/webm'],
    canonicalExtension: 'webm',
  }),
  avi: descriptor('avi', 'video', {
    mime: ['video/x-msvideo'],
    canonicalExtension: 'avi',
  }),

  zip: descriptor('zip', 'archive', {
    businessKinds: ['archive', 'container'],
    mime: ['application/zip'],
    canonicalExtension: 'zip',
    containerBased: true,
    parserRecommended: true,
  }),
  rar: descriptor('rar', 'archive', {
    businessKinds: ['archive', 'container'],
    mime: ['application/x-rar-compressed'],
    canonicalExtension: 'rar',
    containerBased: true,
    parserRecommended: true,
  }),
  seven_zip: descriptor('seven_zip', 'archive', {
    businessKinds: ['archive', 'container'],
    mime: ['application/x-7z-compressed'],
    canonicalExtension: '7z',
    aliases: ['7zip'],
    containerBased: true,
    parserRecommended: true,
  }),
  tar: descriptor('tar', 'archive', {
    businessKinds: ['archive', 'container'],
    mime: ['application/x-tar'],
    canonicalExtension: 'tar',
    containerBased: true,
    parserRecommended: true,
  }),
  gzip: descriptor('gzip', 'archive', {
    businessKinds: ['archive', 'container'],
    mime: ['application/gzip'],
    canonicalExtension: 'gz',
    aliases: ['gzip'],
    containerBased: true,
    parserRecommended: true,
  }),

  sqlite_db: descriptor('sqlite_db', 'database', {
    mime: ['application/vnd.sqlite3'],
    canonicalExtension: 'sqlite',
    aliases: ['db', 'sqlite3'],
    parserRecommended: true,
  }),
  parquet: descriptor('parquet', 'database', {
    mime: ['application/vnd.apache.parquet'],
    canonicalExtension: 'parquet',
    parserRecommended: true,
  }),

  ttf: descriptor('ttf', 'font', {
    mime: ['font/ttf'],
    canonicalExtension: 'ttf',
  }),
  otf: descriptor('otf', 'font', {
    mime: ['font/otf'],
    canonicalExtension: 'otf',
  }),
  woff: descriptor('woff', 'font', {
    mime: ['font/woff'],
    canonicalExtension: 'woff',
  }),
  woff2: descriptor('woff2', 'font', {
    mime: ['font/woff2'],
    canonicalExtension: 'woff2',
  }),

  onnx: descriptor('onnx', 'model', {
    mime: ['application/octet-stream'],
    canonicalExtension: 'onnx',
  }),
  safetensors: descriptor('safetensors', 'model', {
    mime: ['application/octet-stream'],
    canonicalExtension: 'safetensors',
  }),

  windows_exe: descriptor('windows_exe', 'executable', {
    mime: ['application/x-msdownload'],
    canonicalExtension: 'exe',
    aliases: ['pe'],
    executable: true,
    parserRecommended: true,
  }),
  msi: descriptor('msi', 'executable', {
    mime: ['application/x-msi'],
    canonicalExtension: 'msi',
    executable: true,
    containerBased: true,
    parserRecommended: true,
  }),
  dll: descriptor('dll', 'executable', {
    mime: ['application/x-msdownload'],
    canonicalExtension: 'dll',
    executable: true,
    parserRecommended: true,
  }),
  elf: descriptor('elf', 'executable', {
    mime: ['application/x-elf'],
    canonicalExtension: 'elf',
    executable: true,
    parserRecommended: true,
  }),
  mach_o: descriptor('mach_o', 'executable', {
    mime: ['application/x-mach-binary'],
    canonicalExtension: null,
    aliases: ['mach-o'],
    executable: true,
    parserRecommended: true,
  }),
  apk: descriptor('apk', 'executable', {
    businessKinds: ['executable', 'container', 'archive'],
    mime: ['application/vnd.android.package-archive'],
    canonicalExtension: 'apk',
    executable: true,
    containerBased: true,
    parserRecommended: true,
  }),
  dmg: descriptor('dmg', 'executable', {
    businessKinds: ['executable', 'container'],
    mime: ['application/x-apple-diskimage'],
    canonicalExtension: 'dmg',
    executable: true,
    containerBased: true,
    parserRecommended: true,
  }),
  script_file: descriptor('script_file', 'executable', {
    businessKinds: ['executable', 'code', 'text'],
    mime: ['text/plain', 'application/x-sh'],
    canonicalExtension: 'sh',
    aliases: ['ps1', 'bat', 'cmd'],
    scriptable: true,
    executable: true,
    parserRecommended: true,
  }),

  ooxml_container: descriptor('ooxml_container', 'container', {
    businessKinds: ['container', 'document'],
    mime: ['application/vnd.openxmlformats-officedocument'],
    canonicalExtension: null,
    aliases: ['ooxml'],
    containerBased: true,
    parserRecommended: true,
  }),
  odf_container: descriptor('odf_container', 'container', {
    businessKinds: ['container', 'document'],
    mime: ['application/vnd.oasis.opendocument'],
    canonicalExtension: null,
    aliases: ['odf'],
    containerBased: true,
    parserRecommended: true,
  }),
  generic_container: descriptor('generic_container', 'container', {
    businessKinds: ['container', 'binary'],
    mime: ['application/octet-stream'],
    canonicalExtension: null,
    containerBased: true,
    parserRecommended: true,
  }),

  octet_stream: descriptor('octet_stream', 'binary', {
    businessKinds: ['binary', 'unknown'],
    mime: ['application/octet-stream'],
    canonicalExtension: null,
  }),
  unknown_binary: descriptor('unknown_binary', 'binary', {
    businessKinds: ['binary', 'unknown'],
    mime: [],
    canonicalExtension: null,
  }),
  unknown: descriptor('unknown', 'unknown', {
    businessKinds: ['unknown'],
    mime: [],
    canonicalExtension: null,
  }),
}

export const FILE_FORMAT_ID_SET: ReadonlySet<FileFormatId> = new Set(FILE_FORMAT_IDS)
