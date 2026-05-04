type ZipEntryInput = Readonly<{
  name: string
  data: Uint8Array
  encrypted?: boolean
  compressedSizeOverride?: number
  uncompressedSizeOverride?: number
}>

export function encodeUtf8(value: string): Uint8Array {
  return new TextEncoder().encode(value)
}

export function encodeUtf16LeWithBom(value: string): Uint8Array {
  const utf16 = new Uint8Array(value.length * 2 + 2)
  utf16[0] = 0xff
  utf16[1] = 0xfe
  for (let i = 0; i < value.length; i += 1) {
    const code = value.charCodeAt(i)
    utf16[2 + i * 2] = code & 0xff
    utf16[3 + i * 2] = (code >> 8) & 0xff
  }
  return utf16
}

export function encodeUtf16BeWithBom(value: string): Uint8Array {
  const utf16 = new Uint8Array(value.length * 2 + 2)
  utf16[0] = 0xfe
  utf16[1] = 0xff
  for (let i = 0; i < value.length; i += 1) {
    const code = value.charCodeAt(i)
    utf16[2 + i * 2] = (code >> 8) & 0xff
    utf16[3 + i * 2] = code & 0xff
  }
  return utf16
}

export function buildStoredZip(entries: readonly ZipEntryInput[]): Uint8Array {
  const parts: Uint8Array[] = []
  for (const entry of entries) {
    const nameBytes = encodeUtf8(entry.name)
    const header = new Uint8Array(30)
    writeU32LE(header, 0, 0x04034b50)
    writeU16LE(header, 4, 20)
    writeU16LE(header, 6, entry.encrypted ? 0x0001 : 0)
    writeU16LE(header, 8, 0)
    writeU16LE(header, 10, 0)
    writeU16LE(header, 12, 0)
    writeU32LE(header, 14, 0)
    writeU32LE(header, 18, entry.compressedSizeOverride ?? entry.data.length)
    writeU32LE(header, 22, entry.uncompressedSizeOverride ?? entry.data.length)
    writeU16LE(header, 26, nameBytes.length)
    writeU16LE(header, 28, 0)
    parts.push(header, nameBytes, entry.data)
  }
  return concat(parts)
}

export function makePdfBytes(text: string): Uint8Array {
  return encodeUtf8(`%PDF-1.7\n${text}\n%%EOF\n`)
}

export function makePngBytes(): Uint8Array {
  return Uint8Array.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a, 0x00, 0x00, 0x00, 0x0d])
}

export function makeJpegBytes(): Uint8Array {
  return Uint8Array.from([0xff, 0xd8, 0xff, 0xe0, 0x00, 0x10, 0x4a, 0x46, 0x49, 0x46])
}

export function makeWavBytes(): Uint8Array {
  return encodeUtf8('RIFF----WAVEfmt ')
}

export function makeSqliteBytes(): Uint8Array {
  return encodeUtf8('SQLite format 3\0fixture')
}

export function makeWasmBytes(): Uint8Array {
  return Uint8Array.from([0x00, 0x61, 0x73, 0x6d, 0x01, 0x00, 0x00, 0x00])
}

export function makeWindowsExeBytes(): Uint8Array {
  const bytes = new Uint8Array(0x90)
  bytes[0] = 0x4d
  bytes[1] = 0x5a
  bytes[0x3c] = 0x80
  bytes[0x80] = 0x50
  bytes[0x81] = 0x45
  bytes[0x82] = 0x00
  bytes[0x83] = 0x00
  return bytes
}

function concat(parts: readonly Uint8Array[]): Uint8Array {
  const total = parts.reduce((sum, part) => sum + part.length, 0)
  const out = new Uint8Array(total)
  let offset = 0
  for (const part of parts) {
    out.set(part, offset)
    offset += part.length
  }
  return out
}

function writeU16LE(target: Uint8Array, offset: number, value: number): void {
  target[offset] = value & 0xff
  target[offset + 1] = (value >> 8) & 0xff
}

function writeU32LE(target: Uint8Array, offset: number, value: number): void {
  target[offset] = value & 0xff
  target[offset + 1] = (value >> 8) & 0xff
  target[offset + 2] = (value >> 16) & 0xff
  target[offset + 3] = (value >> 24) & 0xff
}
