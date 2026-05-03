import type { FileFormatId, FileTypeEvidence } from './types'

export type ContainerProbeFlag =
  | 'zip_slip'
  | 'encrypted'
  | 'zip64_huge'
  | 'duplicate_entry'
  | 'damaged_container'
  | 'unknown_container'

export type ContainerProbeResult = Readonly<{
  containerKind: 'zip' | 'ole_cfb' | null
  detectedFormatId: FileFormatId | null
  flags: readonly ContainerProbeFlag[]
  entryCount: number
  evidence: FileTypeEvidence | null
  note: string | null
}>

type ZipEntry = Readonly<{
  name: string
  flags: number
  compressionMethod: number
  compressedSize: number
  uncompressedSize: number
  dataOffset: number
  localHeaderOffset: number
}>

const OLE_SIGNATURE = [0xd0, 0xcf, 0x11, 0xe0, 0xa1, 0xb1, 0x1a, 0xe1]

export function probeContainer(bytes: Uint8Array): ContainerProbeResult {
  if (startsWith(bytes, OLE_SIGNATURE)) {
    return {
      containerKind: 'ole_cfb',
      detectedFormatId: 'unknown_binary',
      flags: [],
      entryCount: 0,
      evidence: toEvidence('unknown_binary', 'medium', 'containerProbe:ole_cfb'),
      note: 'legacy_office_unknown',
    }
  }

  if (!looksLikeZip(bytes)) {
    return { containerKind: null, detectedFormatId: null, flags: [], entryCount: 0, evidence: null, note: null }
  }

  const parsed = parseZipLocalEntries(bytes)
  const flags = new Set<ContainerProbeFlag>(parsed.flags)
  const normalizedEntries = parsed.entries.map((entry) => entry.name.toLowerCase())
  const detected = detectZipContainerFormat(normalizedEntries, parsed.mimetype)

  if (parsed.entries.length === 0) flags.add('unknown_container')
  if (parsed.damaged) flags.add('damaged_container')

  const detectedFormatId = detected.formatId ?? 'zip'
  const confidence = detected.formatId ? 'high' : 'medium'
  const note = `containerProbe:zip:${detected.kind}`

  return {
    containerKind: 'zip',
    detectedFormatId,
    flags: Array.from(flags),
    entryCount: parsed.entries.length,
    evidence: toEvidence(detectedFormatId, confidence, note),
    note,
  }
}

function detectZipContainerFormat(
  names: string[],
  mimetypeFromEntry: string | null
): Readonly<{ formatId: FileFormatId | null; kind: string }> {
  const has = (path: string) => names.includes(path)
  const starts = (prefix: string) => names.some((name) => name.startsWith(prefix))
  const ends = (suffix: string) => names.some((name) => name.endsWith(suffix))

  const hasVba = ends('/vbaproject.bin')
  const hasWord = starts('word/')
  const hasExcel = starts('xl/')
  const hasPpt = starts('ppt/')
  const hasContentTypes = has('[content_types].xml')

  if (hasContentTypes && hasWord) return { formatId: hasVba ? 'docm' : 'docx', kind: hasVba ? 'ooxml_docm' : 'ooxml_docx' }
  if (hasContentTypes && hasExcel) return { formatId: hasVba ? 'xlsm' : 'xlsx', kind: hasVba ? 'ooxml_xlsm' : 'ooxml_xlsx' }
  if (hasContentTypes && hasPpt) return { formatId: hasVba ? 'pptm' : 'pptx', kind: hasVba ? 'ooxml_pptm' : 'ooxml_pptx' }

  if (mimetypeFromEntry === 'application/vnd.oasis.opendocument.text') return { formatId: 'odt', kind: 'odf_odt' }
  if (mimetypeFromEntry === 'application/vnd.oasis.opendocument.spreadsheet') return { formatId: 'ods', kind: 'odf_ods' }
  if (mimetypeFromEntry === 'application/vnd.oasis.opendocument.presentation') return { formatId: 'odp', kind: 'odf_odp' }
  if (mimetypeFromEntry === 'application/epub+zip' || (has('mimetype') && has('meta-inf/container.xml'))) return { formatId: 'epub', kind: 'epub' }

  if (has('meta-inf/manifest.mf') && ends('.class')) return { formatId: 'generic_container', kind: 'jar' }
  if (has('androidmanifest.xml') || has('classes.dex')) return { formatId: 'apk', kind: 'apk' }
  if (has('extension.vsixmanifest')) return { formatId: 'generic_container', kind: 'vsix' }
  if (names.some((name) => name.includes('.dist-info/wheel'))) return { formatId: 'generic_container', kind: 'whl' }

  return { formatId: null, kind: 'zip_generic' }
}

function parseZipLocalEntries(bytes: Uint8Array): Readonly<{
  entries: ZipEntry[]
  flags: ContainerProbeFlag[]
  damaged: boolean
  mimetype: string | null
}> {
  const entries: ZipEntry[] = []
  const flags = new Set<ContainerProbeFlag>()
  const seen = new Set<string>()
  let offset = 0
  let damaged = false
  let mimetype: string | null = null

  while (offset + 4 <= bytes.length) {
    const signature = readUint32LE(bytes, offset)
    if (signature === null) break
    if (signature === 0x02014b50 || signature === 0x06054b50 || signature === 0x06064b50) break
    if (signature !== 0x04034b50) {
      damaged = true
      break
    }

    if (offset + 30 > bytes.length) {
      damaged = true
      break
    }

    const gpFlags = readUint16LE(bytes, offset + 6) ?? 0
    const compressionMethod = readUint16LE(bytes, offset + 8) ?? 0
    const compressedSize = readUint32LE(bytes, offset + 18) ?? 0
    const uncompressedSize = readUint32LE(bytes, offset + 22) ?? 0
    const nameLen = readUint16LE(bytes, offset + 26) ?? 0
    const extraLen = readUint16LE(bytes, offset + 28) ?? 0

    const nameStart = offset + 30
    const nameEnd = nameStart + nameLen
    const extraEnd = nameEnd + extraLen
    if (extraEnd > bytes.length) {
      damaged = true
      break
    }

    const rawName = decodeUtf8(bytes.subarray(nameStart, nameEnd))
    const normalizedName = rawName.replace(/\\/g, '/').trim()
    if (!normalizedName) {
      damaged = true
      break
    }
    if (isZipSlipPath(normalizedName)) flags.add('zip_slip')
    if (seen.has(normalizedName.toLowerCase())) flags.add('duplicate_entry')
    seen.add(normalizedName.toLowerCase())
    if ((gpFlags & 0x0001) !== 0) flags.add('encrypted')
    if (compressedSize === 0xffffffff || uncompressedSize === 0xffffffff) flags.add('zip64_huge')

    const dataOffset = extraEnd
    const dataEnd = dataOffset + compressedSize
    if (dataEnd > bytes.length) {
      damaged = true
      break
    }

    const entry: ZipEntry = {
      name: normalizedName,
      flags: gpFlags,
      compressionMethod,
      compressedSize,
      uncompressedSize,
      dataOffset,
      localHeaderOffset: offset,
    }
    entries.push(entry)

    if (normalizedName.toLowerCase() === 'mimetype' && compressionMethod === 0 && compressedSize > 0 && compressedSize <= 256) {
      mimetype = decodeUtf8(bytes.subarray(dataOffset, dataEnd)).trim().toLowerCase()
    }

    // Data descriptor bit means local header sizes can be zero; Stage D minimal parser conservatively stops.
    if ((gpFlags & 0x0008) !== 0) {
      damaged = true
      break
    }

    offset = dataEnd
  }

  return { entries, flags: Array.from(flags), damaged, mimetype }
}

function toEvidence(formatId: FileFormatId, confidence: 'high' | 'medium', note: string): FileTypeEvidence {
  return {
    source: 'container_probe',
    detectedFormatId: formatId,
    detectedMime: null,
    detectedExtension: null,
    confidence,
    reasonCodes: ['reason.container_probe_matched'],
    errorCode: null,
    note,
  }
}

function looksLikeZip(bytes: Uint8Array): boolean {
  return startsWith(bytes, [0x50, 0x4b, 0x03, 0x04]) || startsWith(bytes, [0x50, 0x4b, 0x05, 0x06]) || startsWith(bytes, [0x50, 0x4b, 0x07, 0x08])
}

function startsWith(bytes: Uint8Array, signature: number[]): boolean {
  if (bytes.length < signature.length) return false
  for (let i = 0; i < signature.length; i += 1) {
    if (bytes[i] !== signature[i]) return false
  }
  return true
}

function readUint16LE(bytes: Uint8Array, offset: number): number | null {
  if (offset < 0 || offset + 2 > bytes.length) return null
  return bytes[offset] | (bytes[offset + 1] << 8)
}

function readUint32LE(bytes: Uint8Array, offset: number): number | null {
  if (offset < 0 || offset + 4 > bytes.length) return null
  return (bytes[offset] | (bytes[offset + 1] << 8) | (bytes[offset + 2] << 16) | (bytes[offset + 3] << 24)) >>> 0
}

function decodeUtf8(bytes: Uint8Array): string {
  try {
    return new TextDecoder('utf-8', { fatal: false }).decode(bytes)
  } catch {
    return ''
  }
}

function isZipSlipPath(entryName: string): boolean {
  const normalized = entryName.replace(/\\/g, '/')
  return normalized.startsWith('/') || normalized.includes('../') || /^[a-zA-Z]:\//.test(normalized)
}
