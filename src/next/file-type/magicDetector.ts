import type { FileFormatId, FileTypeEvidence } from './types'

export type MagicMatchId =
  | 'pdf'
  | 'png'
  | 'jpeg'
  | 'gif'
  | 'webp'
  | 'sqlite'
  | 'wasm'
  | 'seven_zip'
  | 'rar'
  | 'gzip'
  | 'elf'
  | 'pe'
  | 'mach_o'
  | 'mp3'
  | 'wav'
  | 'mp4'
  | 'zip'
  | 'ole_cfb'

export type MagicDetectorResult = Readonly<{
  magicId: MagicMatchId | null
  isStrong: boolean
  evidence: FileTypeEvidence | null
}>

const MP4_BRANDS = new Set(['isom', 'iso2', 'mp41', 'mp42', 'M4V ', 'MSNV', 'avc1', 'dash'])

export function detectMagic(bytes: Uint8Array): MagicDetectorResult {
  if (bytes.length < 4) return noMatch()

  if (startsWith(bytes, [0x25, 0x50, 0x44, 0x46, 0x2d])) return buildMatch('pdf', 'pdf', 'application/pdf')
  if (startsWith(bytes, [0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a])) return buildMatch('png', 'png', 'image/png')
  if (startsWith(bytes, [0xff, 0xd8, 0xff])) return buildMatch('jpeg', 'jpeg', 'image/jpeg')
  if (startsWithAscii(bytes, 'GIF87a') || startsWithAscii(bytes, 'GIF89a')) return buildMatch('gif', 'gif', 'image/gif')
  if (startsWithAscii(bytes, 'RIFF') && startsWithAsciiAt(bytes, 8, 'WEBP')) return buildMatch('webp', 'webp', 'image/webp')
  if (startsWithAscii(bytes, 'SQLite format 3\0')) return buildMatch('sqlite', 'sqlite_db', 'application/vnd.sqlite3')
  if (startsWith(bytes, [0x00, 0x61, 0x73, 0x6d])) return buildMatch('wasm', 'unknown_binary', 'application/wasm')
  if (startsWith(bytes, [0x37, 0x7a, 0xbc, 0xaf, 0x27, 0x1c])) return buildMatch('seven_zip', 'seven_zip', 'application/x-7z-compressed')
  if (startsWith(bytes, [0x52, 0x61, 0x72, 0x21, 0x1a, 0x07, 0x00]) || startsWith(bytes, [0x52, 0x61, 0x72, 0x21, 0x1a, 0x07, 0x01, 0x00])) {
    return buildMatch('rar', 'rar', 'application/x-rar-compressed')
  }
  if (startsWith(bytes, [0x1f, 0x8b, 0x08])) return buildMatch('gzip', 'gzip', 'application/gzip')
  if (startsWith(bytes, [0x7f, 0x45, 0x4c, 0x46])) return buildMatch('elf', 'elf', 'application/x-elf')
  if (looksLikePe(bytes)) return buildMatch('pe', 'windows_exe', 'application/x-msdownload')
  if (looksLikeMachO(bytes)) return buildMatch('mach_o', 'mach_o', 'application/x-mach-binary')
  if (looksLikeMp3(bytes)) return buildMatch('mp3', 'mp3', 'audio/mpeg')
  if (startsWithAscii(bytes, 'RIFF') && startsWithAsciiAt(bytes, 8, 'WAVE')) return buildMatch('wav', 'wav', 'audio/wav')
  if (looksLikeMp4(bytes)) return buildMatch('mp4', 'mp4', 'video/mp4')
  if (looksLikeZip(bytes)) return buildMatch('zip', 'zip', 'application/zip', true)
  if (startsWith(bytes, [0xd0, 0xcf, 0x11, 0xe0, 0xa1, 0xb1, 0x1a, 0xe1])) {
    return buildMatch('ole_cfb', 'unknown_binary', 'application/x-ole-storage')
  }

  return noMatch()
}

function buildMatch(
  magicId: MagicMatchId,
  detectedFormatId: FileFormatId,
  detectedMime: string,
  conservative = false
): MagicDetectorResult {
  return {
    magicId,
    isStrong: !conservative,
    evidence: {
      source: 'magic',
      detectedFormatId,
      detectedMime,
      detectedExtension: null,
      confidence: conservative ? 'medium' : 'high',
      reasonCodes: ['reason.magic_matched'],
      errorCode: null,
      note: conservative ? `magic:${magicId}:container-signature` : `magic:${magicId}:strong`,
    },
  }
}

function noMatch(): MagicDetectorResult {
  return { magicId: null, isStrong: false, evidence: null }
}

function startsWith(bytes: Uint8Array, signature: number[]): boolean {
  if (bytes.length < signature.length) return false
  for (let i = 0; i < signature.length; i += 1) {
    if (bytes[i] !== signature[i]) return false
  }
  return true
}

function startsWithAscii(bytes: Uint8Array, text: string): boolean {
  return startsWithAsciiAt(bytes, 0, text)
}

function startsWithAsciiAt(bytes: Uint8Array, offset: number, text: string): boolean {
  if (bytes.length < offset + text.length) return false
  for (let i = 0; i < text.length; i += 1) {
    if (bytes[offset + i] !== text.charCodeAt(i)) return false
  }
  return true
}

function looksLikePe(bytes: Uint8Array): boolean {
  if (!startsWith(bytes, [0x4d, 0x5a]) || bytes.length < 0x40) return false
  const peOffset = readUint32LE(bytes, 0x3c)
  if (peOffset === null) return false
  return startsWith(bytes.subarray(peOffset), [0x50, 0x45, 0x00, 0x00])
}

function looksLikeMachO(bytes: Uint8Array): boolean {
  if (bytes.length < 4) return false
  const magic = readUint32BE(bytes, 0)
  if (magic === null) return false
  return magic === 0xfeedface || magic === 0xfeedfacf || magic === 0xcefaedfe || magic === 0xcffaedfe || magic === 0xcafebabe || magic === 0xbebafeca
}

function looksLikeMp3(bytes: Uint8Array): boolean {
  if (startsWith(bytes, [0xff, 0xfe]) || startsWith(bytes, [0xfe, 0xff])) return false
  if (startsWithAscii(bytes, 'ID3')) return true
  if (bytes.length < 2) return false
  return bytes[0] === 0xff && (bytes[1] & 0xe0) === 0xe0
}

function looksLikeMp4(bytes: Uint8Array): boolean {
  if (bytes.length < 12) return false
  const boxSize = readUint32BE(bytes, 0)
  if (boxSize === null || boxSize < 8 || boxSize > bytes.length) return false
  if (!startsWithAsciiAt(bytes, 4, 'ftyp')) return false
  const brand = ascii(bytes.subarray(8, 12))
  return MP4_BRANDS.has(brand)
}

function looksLikeZip(bytes: Uint8Array): boolean {
  return startsWith(bytes, [0x50, 0x4b, 0x03, 0x04]) || startsWith(bytes, [0x50, 0x4b, 0x05, 0x06]) || startsWith(bytes, [0x50, 0x4b, 0x07, 0x08])
}

function readUint32LE(bytes: Uint8Array, offset: number): number | null {
  if (offset < 0 || offset + 4 > bytes.length) return null
  return (bytes[offset] | (bytes[offset + 1] << 8) | (bytes[offset + 2] << 16) | (bytes[offset + 3] << 24)) >>> 0
}

function readUint32BE(bytes: Uint8Array, offset: number): number | null {
  if (offset < 0 || offset + 4 > bytes.length) return null
  return ((bytes[offset] << 24) >>> 0) | (bytes[offset + 1] << 16) | (bytes[offset + 2] << 8) | bytes[offset + 3]
}

function ascii(bytes: Uint8Array): string {
  return String.fromCharCode(...bytes)
}
