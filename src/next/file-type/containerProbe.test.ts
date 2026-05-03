import { describe, expect, it } from 'vitest'
import { probeContainer } from './containerProbe'

type ZipEntryInput = Readonly<{
  name: string
  data: Uint8Array
  encrypted?: boolean
}>

function buildStoredZip(entries: readonly ZipEntryInput[]): Uint8Array {
  const parts: Uint8Array[] = []
  for (const entry of entries) {
    const nameBytes = new TextEncoder().encode(entry.name)
    const header = new Uint8Array(30)
    writeU32LE(header, 0, 0x04034b50)
    writeU16LE(header, 4, 20)
    writeU16LE(header, 6, entry.encrypted ? 0x0001 : 0)
    writeU16LE(header, 8, 0) // store
    writeU16LE(header, 10, 0)
    writeU16LE(header, 12, 0)
    writeU32LE(header, 14, 0) // crc (ignored by parser)
    writeU32LE(header, 18, entry.data.length)
    writeU32LE(header, 22, entry.data.length)
    writeU16LE(header, 26, nameBytes.length)
    writeU16LE(header, 28, 0)
    parts.push(header, nameBytes, entry.data)
  }
  return concat(parts)
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

describe('containerProbe', () => {
  it('detects OOXML docx from zip entries', () => {
    const zip = buildStoredZip([
      { name: '[Content_Types].xml', data: new TextEncoder().encode('<Types/>') },
      { name: 'word/document.xml', data: new TextEncoder().encode('<w:document/>') },
    ])
    const result = probeContainer(zip)
    expect(result.containerKind).toBe('zip')
    expect(result.detectedFormatId).toBe('docx')
    expect(result.evidence?.source).toBe('container_probe')
  })

  it('detects macro-capable OOXML as docm/xlsm/pptm', () => {
    const zip = buildStoredZip([
      { name: '[Content_Types].xml', data: new TextEncoder().encode('<Types/>') },
      { name: 'word/document.xml', data: new TextEncoder().encode('<w:document/>') },
      { name: 'word/vbaProject.bin', data: Uint8Array.from([1, 2, 3]) },
    ])
    const result = probeContainer(zip)
    expect(result.detectedFormatId).toBe('docm')
  })

  it('detects odf/epub via mimetype entry', () => {
    const odfZip = buildStoredZip([
      { name: 'mimetype', data: new TextEncoder().encode('application/vnd.oasis.opendocument.text') },
      { name: 'content.xml', data: new TextEncoder().encode('<office:document/>') },
    ])
    const epubZip = buildStoredZip([
      { name: 'mimetype', data: new TextEncoder().encode('application/epub+zip') },
      { name: 'META-INF/container.xml', data: new TextEncoder().encode('<container/>') },
    ])
    expect(probeContainer(odfZip).detectedFormatId).toBe('odt')
    expect(probeContainer(epubZip).detectedFormatId).toBe('epub')
  })

  it('flags suspicious zip entries', () => {
    const zip = buildStoredZip([
      { name: '../evil.txt', data: new TextEncoder().encode('boom') },
      { name: 'dup.txt', data: new TextEncoder().encode('a') },
      { name: 'dup.txt', data: new TextEncoder().encode('b') },
      { name: 'secret.txt', data: new TextEncoder().encode('x'), encrypted: true },
    ])
    const result = probeContainer(zip)
    expect(result.flags).toEqual(expect.arrayContaining(['zip_slip', 'duplicate_entry', 'encrypted']))
  })

  it('recognizes OLE CFB signature minimally', () => {
    const ole = Uint8Array.from([0xd0, 0xcf, 0x11, 0xe0, 0xa1, 0xb1, 0x1a, 0xe1, 0, 0, 0, 0])
    const result = probeContainer(ole)
    expect(result.containerKind).toBe('ole_cfb')
    expect(result.note).toContain('legacy_office_unknown')
  })
})
