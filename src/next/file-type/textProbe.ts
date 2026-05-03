import type { FileFormatId, FileTypeEvidence } from './types'

export type TextProbeEncoding = 'utf8' | 'utf16le' | 'utf16be' | 'unknown'
export type TextProbeFlag = 'encoding_uncertain' | 'possibly_binary_text' | 'large_line_text'

export type TextProbeResult = Readonly<{
  encoding: TextProbeEncoding
  flags: readonly TextProbeFlag[]
  evidence: FileTypeEvidence | null
  sampleText: string | null
}>

const MAX_TEXT_SAMPLE_BYTES = 256 * 1024
const LARGE_LINE_THRESHOLD = 8 * 1024

export function probeText(bytes: Uint8Array): TextProbeResult {
  if (bytes.length === 0) {
    return {
      encoding: 'utf8',
      flags: [],
      evidence: buildEvidence('plain_text', 'high', 'text/plain', 'textProbe:empty'),
      sampleText: '',
    }
  }

  const flags = new Set<TextProbeFlag>()
  const sample = bytes.subarray(0, Math.min(bytes.length, MAX_TEXT_SAMPLE_BYTES))
  const nulStats = scanNulPattern(sample)

  let encoding: TextProbeEncoding = 'unknown'
  let text: string | null = null

  if (hasUtf16LeBom(sample)) {
    encoding = 'utf16le'
    text = decodeUtf16Le(stripBom(sample, 2))
  } else if (hasUtf16BeBom(sample)) {
    encoding = 'utf16be'
    text = decodeUtf16Be(stripBom(sample, 2))
  } else if (nulStats.looksLikeUtf16Le) {
    encoding = 'utf16le'
    text = decodeUtf16Le(sample)
    flags.add('encoding_uncertain')
  } else if (nulStats.looksLikeUtf16Be) {
    encoding = 'utf16be'
    text = decodeUtf16Be(sample)
    flags.add('encoding_uncertain')
  } else {
    const utf8 = tryDecodeUtf8(sample)
    if (utf8 !== null) {
      encoding = 'utf8'
      text = removeUtf8Bom(utf8)
    } else {
      flags.add('possibly_binary_text')
    }
  }

  if (text === null) {
    return {
      encoding,
      flags: Array.from(flags),
      evidence: null,
      sampleText: null,
    }
  }

  if (hasVeryLongLine(text)) flags.add('large_line_text')
  if (nulStats.nulCount > 0 && encoding === 'utf8') flags.add('possibly_binary_text')

  const structured = detectStructuredFormat(text)
  const formatId = structured ?? 'plain_text'
  const confidence = pickConfidence(structured, flags)
  const mime = guessMime(formatId)

  return {
    encoding,
    flags: Array.from(flags),
    evidence: buildEvidence(formatId, confidence, mime, `textProbe:${encoding}:${structured ?? 'plain'}`),
    sampleText: text.slice(0, 1024),
  }
}

function detectStructuredFormat(text: string): FileFormatId | null {
  const trimmed = text.trim()
  if (!trimmed) return null

  if (looksLikeJson(trimmed)) return 'json'
  if (looksLikeJsonLines(trimmed)) return 'json'
  if (looksLikeXml(trimmed)) {
    if (looksLikeSvg(trimmed)) return 'svg'
    if (looksLikeHtml(trimmed)) return 'html'
    return 'xml'
  }
  if (looksLikeMarkdown(trimmed)) return 'markdown'
  if (looksLikeDelimited(trimmed, ',')) return 'csv'
  if (looksLikeDelimited(trimmed, '\t')) return 'tsv'
  return null
}

function looksLikeJson(text: string): boolean {
  if (!(text.startsWith('{') || text.startsWith('['))) return false
  try {
    JSON.parse(text)
    return true
  } catch {
    return false
  }
}

function looksLikeJsonLines(text: string): boolean {
  const lines = text.split(/\r?\n/).map((line) => line.trim()).filter(Boolean)
  if (lines.length < 2) return false
  const sample = lines.slice(0, 10)
  for (const line of sample) {
    if (!(line.startsWith('{') || line.startsWith('['))) return false
    try {
      JSON.parse(line)
    } catch {
      return false
    }
  }
  return true
}

function looksLikeDelimited(text: string, delimiter: ',' | '\t'): boolean {
  const lines = text.split(/\r?\n/).filter((line) => line.length > 0)
  if (lines.length < 2) return false
  const sample = lines.slice(0, 6)
  const counts = sample.map((line) => line.split(delimiter).length)
  const min = Math.min(...counts)
  const max = Math.max(...counts)
  return min >= 2 && max - min <= 1
}

function looksLikeMarkdown(text: string): boolean {
  return /(^|\n)#{1,6}\s+\S/.test(text) || /(^|\n)([-*+]\s+\S|\d+\.\s+\S)/.test(text) || /```[\s\S]*```/.test(text)
}

function looksLikeHtml(text: string): boolean {
  return /<!doctype\s+html/i.test(text) || /<html[\s>]/i.test(text) || /<body[\s>]/i.test(text)
}

function looksLikeSvg(text: string): boolean {
  return /<svg[\s>]/i.test(text)
}

function looksLikeXml(text: string): boolean {
  return text.startsWith('<?xml') || /^<([a-zA-Z_][\w:.-]*)(\s|>)/.test(text)
}

function pickConfidence(structured: FileFormatId | null, flags: Set<TextProbeFlag>): 'high' | 'medium' | 'low' {
  if (flags.has('possibly_binary_text')) return 'low'
  if (!structured) return flags.has('encoding_uncertain') ? 'low' : 'medium'
  if (structured === 'json' || structured === 'xml' || structured === 'html' || structured === 'svg') return 'high'
  return flags.has('encoding_uncertain') ? 'medium' : 'high'
}

function guessMime(formatId: FileFormatId): string {
  switch (formatId) {
    case 'json':
      return 'application/json'
    case 'xml':
      return 'application/xml'
    case 'html':
      return 'text/html'
    case 'svg':
      return 'image/svg+xml'
    case 'csv':
      return 'text/csv'
    case 'tsv':
      return 'text/tab-separated-values'
    case 'markdown':
      return 'text/markdown'
    default:
      return 'text/plain'
  }
}

function buildEvidence(
  formatId: FileFormatId,
  confidence: 'high' | 'medium' | 'low',
  mime: string,
  note: string
): FileTypeEvidence {
  return {
    source: 'text_probe',
    detectedFormatId: formatId,
    detectedMime: mime,
    detectedExtension: null,
    confidence,
    reasonCodes: [],
    errorCode: null,
    note,
  }
}

function hasVeryLongLine(text: string): boolean {
  return text.split(/\r?\n/).some((line) => line.length > LARGE_LINE_THRESHOLD)
}

function hasUtf16LeBom(bytes: Uint8Array): boolean {
  return bytes.length >= 2 && bytes[0] === 0xff && bytes[1] === 0xfe
}

function hasUtf16BeBom(bytes: Uint8Array): boolean {
  return bytes.length >= 2 && bytes[0] === 0xfe && bytes[1] === 0xff
}

function stripBom(bytes: Uint8Array, bomLength: number): Uint8Array {
  return bytes.subarray(Math.min(bomLength, bytes.length))
}

function removeUtf8Bom(text: string): string {
  return text.charCodeAt(0) === 0xfeff ? text.slice(1) : text
}

function tryDecodeUtf8(bytes: Uint8Array): string | null {
  try {
    return new TextDecoder('utf-8', { fatal: true }).decode(bytes)
  } catch {
    return null
  }
}

function decodeUtf16Le(bytes: Uint8Array): string {
  const evenLength = bytes.length - (bytes.length % 2)
  return new TextDecoder('utf-16le', { fatal: false }).decode(bytes.subarray(0, evenLength))
}

function decodeUtf16Be(bytes: Uint8Array): string {
  const evenLength = bytes.length - (bytes.length % 2)
  const swapped = new Uint8Array(evenLength)
  for (let i = 0; i < evenLength; i += 2) {
    swapped[i] = bytes[i + 1]
    swapped[i + 1] = bytes[i]
  }
  return new TextDecoder('utf-16le', { fatal: false }).decode(swapped)
}

function scanNulPattern(bytes: Uint8Array): Readonly<{
  nulCount: number
  looksLikeUtf16Le: boolean
  looksLikeUtf16Be: boolean
}> {
  let nulCount = 0
  let evenNul = 0
  let oddNul = 0
  for (let i = 0; i < bytes.length; i += 1) {
    if (bytes[i] !== 0x00) continue
    nulCount += 1
    if (i % 2 === 0) evenNul += 1
    else oddNul += 1
  }
  const evenSlots = Math.ceil(bytes.length / 2)
  const oddSlots = Math.floor(bytes.length / 2)
  const evenRate = evenSlots > 0 ? evenNul / evenSlots : 0
  const oddRate = oddSlots > 0 ? oddNul / oddSlots : 0
  return {
    nulCount,
    looksLikeUtf16Le: oddRate > 0.3 && evenRate < 0.1,
    looksLikeUtf16Be: evenRate > 0.3 && oddRate < 0.1,
  }
}
