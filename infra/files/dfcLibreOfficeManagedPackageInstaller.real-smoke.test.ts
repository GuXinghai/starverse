import { mkdtemp, stat } from 'node:fs/promises'
import os from 'node:os'
import path from 'node:path'
import { describe, expect, it } from 'vitest'
import { runExternalProcess } from '../../src/next/file-type/externalProcessRunner'
import { runDfcLibreOfficeDocxToPdfAdapter } from './dfcLibreOfficePdfAdapter'
import { importDfcLibreOfficeManagedRuntimePackage } from './dfcLibreOfficeManagedPackageInstaller'

const describeRealImportSmoke = process.env.STARVERSE_DFC_LIBREOFFICE_IMPORT_REAL_SMOKE === '1' ? describe : describe.skip

describeRealImportSmoke('DFC LibreOffice managed package import real smoke', () => {
  it('imports the M28 dev runtime into an active managed root and runs real soffice', async () => {
    const sourceRuntimeRoot = String(process.env.STARVERSE_DFC_LIBREOFFICE_SOURCE_RUNTIME_ROOT ?? '').trim()
    const appRoot = String(process.env.STARVERSE_DFC_LIBREOFFICE_IMPORT_APP_ROOT ?? '').trim()
    expect(sourceRuntimeRoot).toBeTruthy()
    expect(appRoot).toBeTruthy()

    const install = await importDfcLibreOfficeManagedRuntimePackage({
      appManagedRootDir: appRoot,
      sourceRuntimeRootDir: sourceRuntimeRoot,
    })
    expect(install.ok).toBe(true)
    if (!install.ok) throw new Error('LibreOffice managed import failed.')

    const sandboxRootDir = await mkdtemp(path.join(os.tmpdir(), 'starverse-dfc-office-pdf-import-real-smoke-'))
    const result = await runDfcLibreOfficeDocxToPdfAdapter({
      assetId: 'asset-docx-office-pdf-import-real-smoke',
      sourceExtension: 'docx',
      sourceBytes: createMinimalDocxBuffer(),
      sandboxRootDir,
      runtime: install.runtime,
      processRunner: runExternalProcess,
      timeoutMs: 120_000,
      cleanupSandbox: true,
    })

    expect(result).toMatchObject({
      ok: true,
      status: 'succeeded',
      output: expect.objectContaining({
        mime: 'application/pdf',
        extension: 'pdf',
      }),
      cleanupStatus: 'attempted',
    })
    if (!result.ok) throw new Error('LibreOffice managed import smoke failed.')
    expect(result.output.outputPath).toContain(`${path.sep}output${path.sep}`)
    expect(result.output.outputPath.startsWith(sandboxRootDir)).toBe(true)
    expect(result.output.bytes).toBeGreaterThan(0)
    expect(await pathExists(sandboxRootDir)).toBe(false)
    expect(JSON.stringify(result.diagnostics)).not.toContain(sourceRuntimeRoot)
    expect(JSON.stringify(result.diagnostics)).not.toContain(install.activeRuntimeRootDir)
    expect(JSON.stringify(result.diagnostics)).not.toContain(install.runtime.executablePath)
  }, 180_000)
})

function createMinimalDocxBuffer(): Buffer {
  return createZipBuffer([
    {
      name: '[Content_Types].xml',
      content: `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<Types xmlns="http://schemas.openxmlformats.org/package/2006/content-types">
  <Default Extension="rels" ContentType="application/vnd.openxmlformats-package.relationships+xml"/>
  <Default Extension="xml" ContentType="application/xml"/>
  <Override PartName="/word/document.xml" ContentType="application/vnd.openxmlformats-officedocument.wordprocessingml.document.main+xml"/>
</Types>`,
    },
    {
      name: '_rels/.rels',
      content: `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships">
  <Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/officeDocument" Target="word/document.xml"/>
</Relationships>`,
    },
    {
      name: 'word/document.xml',
      content: `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<w:document xmlns:w="http://schemas.openxmlformats.org/wordprocessingml/2006/main">
  <w:body>
    <w:p><w:r><w:t>Starverse Office PDF import smoke</w:t></w:r></w:p>
    <w:p><w:r><w:t>Managed LibreOffice activated runtime conversion.</w:t></w:r></w:p>
    <w:sectPr/>
  </w:body>
</w:document>`,
    },
  ])
}

function createZipBuffer(files: readonly { name: string; content: string | Buffer }[]): Buffer {
  const localParts: Buffer[] = []
  const centralParts: Buffer[] = []
  let offset = 0
  for (const file of files) {
    const name = Buffer.from(file.name, 'utf8')
    const content = Buffer.isBuffer(file.content) ? file.content : Buffer.from(file.content, 'utf8')
    const crc = crc32(content)
    const local = Buffer.alloc(30)
    local.writeUInt32LE(0x04034b50, 0)
    local.writeUInt16LE(20, 4)
    local.writeUInt16LE(0, 6)
    local.writeUInt16LE(0, 8)
    local.writeUInt16LE(0, 10)
    local.writeUInt16LE(0, 12)
    local.writeUInt32LE(crc, 14)
    local.writeUInt32LE(content.length, 18)
    local.writeUInt32LE(content.length, 22)
    local.writeUInt16LE(name.length, 26)
    local.writeUInt16LE(0, 28)
    localParts.push(local, name, content)

    const central = Buffer.alloc(46)
    central.writeUInt32LE(0x02014b50, 0)
    central.writeUInt16LE(20, 4)
    central.writeUInt16LE(20, 6)
    central.writeUInt16LE(0, 8)
    central.writeUInt16LE(0, 10)
    central.writeUInt16LE(0, 12)
    central.writeUInt16LE(0, 14)
    central.writeUInt32LE(crc, 16)
    central.writeUInt32LE(content.length, 20)
    central.writeUInt32LE(content.length, 24)
    central.writeUInt16LE(name.length, 28)
    central.writeUInt16LE(0, 30)
    central.writeUInt16LE(0, 32)
    central.writeUInt16LE(0, 34)
    central.writeUInt16LE(0, 36)
    central.writeUInt32LE(0, 38)
    central.writeUInt32LE(offset, 42)
    centralParts.push(central, name)
    offset += local.length + name.length + content.length
  }
  const centralDirectory = Buffer.concat(centralParts)
  const end = Buffer.alloc(22)
  end.writeUInt32LE(0x06054b50, 0)
  end.writeUInt16LE(0, 4)
  end.writeUInt16LE(0, 6)
  end.writeUInt16LE(files.length, 8)
  end.writeUInt16LE(files.length, 10)
  end.writeUInt32LE(centralDirectory.length, 12)
  end.writeUInt32LE(offset, 16)
  end.writeUInt16LE(0, 20)
  return Buffer.concat([...localParts, centralDirectory, end])
}

function crc32(buffer: Buffer): number {
  let crc = 0xffffffff
  for (const byte of buffer) {
    crc = CRC32_TABLE[(crc ^ byte) & 0xff] ^ (crc >>> 8)
  }
  return (crc ^ 0xffffffff) >>> 0
}

const CRC32_TABLE = Array.from({ length: 256 }, (_, index) => {
  let value = index
  for (let bit = 0; bit < 8; bit += 1) {
    value = (value & 1) !== 0 ? 0xedb88320 ^ (value >>> 1) : value >>> 1
  }
  return value >>> 0
})

async function pathExists(target: string): Promise<boolean> {
  return stat(target).then(() => true).catch(() => false)
}

