import { mkdir, mkdtemp, stat } from 'node:fs/promises'
import os from 'node:os'
import path from 'node:path'
import { describe, expect, it } from 'vitest'
import type { RunExternalProcessInput } from '../../src/next/file-type/externalProcessRunner'
import { runExternalProcess } from '../../src/next/file-type/externalProcessRunner'
import {
  runDfcLibreOfficeDocxToPdfAdapter,
  type DfcLibreOfficePdfAdapterResult,
} from './dfcLibreOfficePdfAdapter'
import { resolveDfcLibreOfficeRuntimeExecutionDescriptor } from './dfcManagedLibreOfficeRuntime'

type PathDepthClass = 'short' | 'deep'

type PathDepthSmokeMatrixCase = Readonly<{
  id: string
  runtimeClass: PathDepthClass
  runtimeRootEnv: 'STARVERSE_DFC_LIBREOFFICE_PATH_DEPTH_SHORT_RUNTIME_ROOT' | 'STARVERSE_DFC_LIBREOFFICE_PATH_DEPTH_DEEP_RUNTIME_ROOT'
  sandboxClass: PathDepthClass
  assetId: string
}>

type PathDepthSmokeEvidence = Readonly<{
  caseId: string
  runtimeClass: PathDepthClass
  sandboxClass: PathDepthClass
  status: DfcLibreOfficePdfAdapterResult['status'] | 'runtime_unavailable'
  ok: boolean
  cleanupStatus: DfcLibreOfficePdfAdapterResult['cleanupStatus'] | 'not_started'
  pathLengths: Readonly<{
    runtimeRoot: number
    sandboxRoot: number
    inputPath: number
    outputDir: number
    profileDir: number
  }>
  recordedPaths: Readonly<{
    sandboxRoot: boolean
    inputPath: boolean
    outputDir: boolean
    profileDir: boolean
  }>
  diagnosticCodes: readonly string[]
}>

const PATH_DEPTH_SMOKE_FLAG = 'STARVERSE_DFC_LIBREOFFICE_PATH_DEPTH_SMOKE'
const PATH_DEPTH_MATRIX_CASES: readonly PathDepthSmokeMatrixCase[] = [
  {
    id: 'short-runtime-short-sandbox',
    runtimeClass: 'short',
    runtimeRootEnv: 'STARVERSE_DFC_LIBREOFFICE_PATH_DEPTH_SHORT_RUNTIME_ROOT',
    sandboxClass: 'short',
    assetId: 'asset-path-depth-short-short',
  },
  {
    id: 'short-runtime-deep-sandbox',
    runtimeClass: 'short',
    runtimeRootEnv: 'STARVERSE_DFC_LIBREOFFICE_PATH_DEPTH_SHORT_RUNTIME_ROOT',
    sandboxClass: 'deep',
    assetId: 'asset-path-depth-short-runtime-deep-sandbox-docx-pdf',
  },
  {
    id: 'deep-runtime-short-sandbox',
    runtimeClass: 'deep',
    runtimeRootEnv: 'STARVERSE_DFC_LIBREOFFICE_PATH_DEPTH_DEEP_RUNTIME_ROOT',
    sandboxClass: 'short',
    assetId: 'asset-path-depth-deep-runtime-short-sandbox',
  },
  {
    id: 'deep-runtime-deep-sandbox',
    runtimeClass: 'deep',
    runtimeRootEnv: 'STARVERSE_DFC_LIBREOFFICE_PATH_DEPTH_DEEP_RUNTIME_ROOT',
    sandboxClass: 'deep',
    assetId: 'asset-path-depth-deep-runtime-deep-sandbox-docx-pdf',
  },
] as const

const realPathDepthSmoke = process.env[PATH_DEPTH_SMOKE_FLAG] === '1' ? it : it.skip

describe('DFC LibreOffice path-depth smoke matrix harness', () => {
  it('defines a default-off matrix covering short/deep runtime roots and sandbox input/output paths', () => {
    expect(PATH_DEPTH_SMOKE_FLAG).toBe('STARVERSE_DFC_LIBREOFFICE_PATH_DEPTH_SMOKE')
    expect(PATH_DEPTH_MATRIX_CASES.map((entry) => entry.id)).toEqual([
      'short-runtime-short-sandbox',
      'short-runtime-deep-sandbox',
      'deep-runtime-short-sandbox',
      'deep-runtime-deep-sandbox',
    ])
    expect(new Set(PATH_DEPTH_MATRIX_CASES.map((entry) => entry.runtimeClass))).toEqual(new Set(['short', 'deep']))
    expect(new Set(PATH_DEPTH_MATRIX_CASES.map((entry) => entry.sandboxClass))).toEqual(new Set(['short', 'deep']))
    expect(PATH_DEPTH_MATRIX_CASES.every((entry) => entry.assetId.endsWith('docm') === false)).toBe(true)
    expect(PATH_DEPTH_MATRIX_CASES.every((entry) => entry.runtimeRootEnv.startsWith('STARVERSE_DFC_LIBREOFFICE_PATH_DEPTH_'))).toBe(true)
  })

  it('serializes only sanitized path-depth evidence labels, lengths, statuses, and diagnostic codes', () => {
    const evidence = buildPathDepthEvidence({
      matrixCase: PATH_DEPTH_MATRIX_CASES[3],
      runtimeRoot: 'C:\\Users\\owner\\very\\private\\runtime-root',
      sandboxRoot: 'C:\\Users\\owner\\private\\sandbox-root',
      processInput: {
        command: 'C:\\Users\\owner\\private\\runtime-root\\program\\soffice.exe',
        args: [
          '--headless',
          '--outdir',
          'C:\\Users\\owner\\private\\sandbox-root\\output',
          '-env:UserInstallation=file:///C:/Users/owner/private/sandbox-root/work/libreoffice-profile',
          'C:\\Users\\owner\\private\\sandbox-root\\input\\asset.docx',
        ],
        cwd: 'C:\\Users\\owner\\private\\sandbox-root\\work',
        env: {},
        mode: 'conversion',
        timeoutMs: 300_000,
        shell: false,
        allowBatchEntrypoint: false,
      },
      result: {
        ok: false,
        status: 'timed_out',
        output: null,
        diagnostics: [
          { code: 'office_pdf_process_timeout', message: 'Office PDF conversion process timed out.' },
        ],
        cleanupStatus: 'attempted',
      },
    })

    const serialized = JSON.stringify(evidence)
    expect(evidence.recordedPaths).toEqual({
      sandboxRoot: true,
      inputPath: true,
      outputDir: true,
      profileDir: true,
    })
    expect(evidence.pathLengths.runtimeRoot).toBeGreaterThan(0)
    expect(evidence.diagnosticCodes).toEqual(['office_pdf_process_timeout'])
    expect(serialized).not.toContain('C:\\Users\\owner')
    expect(serialized).not.toContain('soffice.exe')
    expect(serialized).not.toContain('asset.docx')
    expect(serialized).not.toContain('private')
  })

  realPathDepthSmoke('runs DOCX-to-PDF against the explicit short/deep runtime and sandbox path-depth matrix', async () => {
    for (const matrixCase of PATH_DEPTH_MATRIX_CASES) {
      const runtimeRoot = String(process.env[matrixCase.runtimeRootEnv] ?? '').trim()
      if (!runtimeRoot) {
        throw new Error(`Missing ${matrixCase.runtimeRootEnv} for LibreOffice path-depth smoke case ${matrixCase.id}.`)
      }

      const availability = await resolveDfcLibreOfficeRuntimeExecutionDescriptor({
        managedRuntimeRootDir: runtimeRoot,
      })
      if (!availability.ok) {
        const evidence = buildPathDepthEvidence({
          matrixCase,
          runtimeRoot,
          sandboxRoot: '',
          processInput: null,
          result: null,
          runtimeUnavailable: true,
        })
        throw new Error(`LibreOffice path-depth smoke runtime unavailable for ${matrixCase.id}: ${evidence.diagnosticCodes.join(',') || 'runtime_unavailable'}`)
      }

      const sandboxRoot = await createSandboxRoot(matrixCase)
      let processInput: RunExternalProcessInput | null = null
      const result = await runDfcLibreOfficeDocxToPdfAdapter({
        assetId: matrixCase.assetId,
        sourceExtension: 'docx',
        sourceBytes: createMinimalDocxBuffer(),
        sandboxRootDir: sandboxRoot,
        runtime: availability.runtime,
        processRunner: async (input) => {
          processInput = input
          return runExternalProcess(input)
        },
        timeoutMs: 300_000,
        cleanupSandbox: true,
      })

      const evidence = buildPathDepthEvidence({
        matrixCase,
        runtimeRoot,
        sandboxRoot,
        processInput,
        result,
      })
      const serializedEvidence = JSON.stringify(evidence)
      if (!processInput) throw new Error(`LibreOffice path-depth smoke did not record process input for ${matrixCase.id}.`)
      if (!evidence.recordedPaths.inputPath || !evidence.recordedPaths.outputDir || !evidence.recordedPaths.profileDir) {
        throw new Error(`LibreOffice path-depth smoke did not record required path classes for ${matrixCase.id}.`)
      }
      if (serializedEvidence.includes(runtimeRoot) || serializedEvidence.includes(sandboxRoot) || serializedEvidence.includes(availability.runtime.executablePath)) {
        throw new Error(`LibreOffice path-depth smoke evidence leaked raw paths for ${matrixCase.id}.`)
      }
      if (!result.ok) {
        throw new Error(`LibreOffice path-depth smoke failed for ${matrixCase.id}: ${result.status}; diagnostics=${evidence.diagnosticCodes.join(',')}`)
      }
      if (result.cleanupStatus !== 'attempted') {
        throw new Error(`LibreOffice path-depth smoke did not attempt cleanup for ${matrixCase.id}.`)
      }
      if (await pathExists(sandboxRoot)) {
        throw new Error(`LibreOffice path-depth smoke sandbox cleanup left a directory for ${matrixCase.id}.`)
      }
    }
  }, 30 * 60 * 1000)
})

function buildPathDepthEvidence(input: Readonly<{
  matrixCase: PathDepthSmokeMatrixCase
  runtimeRoot: string
  sandboxRoot: string
  processInput: RunExternalProcessInput | null
  result: DfcLibreOfficePdfAdapterResult | null
  runtimeUnavailable?: boolean
}>): PathDepthSmokeEvidence {
  const args = input.processInput?.args ?? []
  const outputDir = String(args[args.indexOf('--outdir') + 1] ?? '')
  const profileArg = args.find((arg) => String(arg).startsWith('-env:UserInstallation=file:')) ?? ''
  const inputPath = String(args[args.length - 1] ?? '')
  const profileDir = String(profileArg).replace(/^-env:UserInstallation=file:\/\//, '')
  const status = input.runtimeUnavailable === true ? 'runtime_unavailable' : input.result?.status ?? 'runtime_unavailable'

  return {
    caseId: input.matrixCase.id,
    runtimeClass: input.matrixCase.runtimeClass,
    sandboxClass: input.matrixCase.sandboxClass,
    status,
    ok: input.result?.ok ?? false,
    cleanupStatus: input.result?.cleanupStatus ?? 'not_started',
    pathLengths: {
      runtimeRoot: input.runtimeRoot.length,
      sandboxRoot: input.sandboxRoot.length,
      inputPath: inputPath.length,
      outputDir: outputDir.length,
      profileDir: profileDir.length,
    },
    recordedPaths: {
      sandboxRoot: input.sandboxRoot.length > 0,
      inputPath: inputPath.length > 0,
      outputDir: outputDir.length > 0,
      profileDir: profileDir.length > 0,
    },
    diagnosticCodes: input.result?.diagnostics.map((diagnostic) => diagnostic.code) ?? [],
  }
}

async function createSandboxRoot(matrixCase: PathDepthSmokeMatrixCase): Promise<string> {
  const root = await mkdtemp(path.join(os.tmpdir(), `starverse-lo-path-${matrixCase.runtimeClass}-${matrixCase.sandboxClass}-`))
  if (matrixCase.sandboxClass === 'short') return root

  const deepRoot = path.join(
    root,
    'deep-sandbox-root',
    'segment-001-owner-approved-path-depth-matrix',
    'segment-002-runtime-output-profile-check',
    'segment-003-docx-pdf-conversion-sandbox',
    'segment-004-libreoffice-profile-output-risk',
  )
  await mkdir(deepRoot, { recursive: true })
  return deepRoot
}

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
    <w:p><w:r><w:t>Starverse LibreOffice path depth matrix</w:t></w:r></w:p>
    <w:p><w:r><w:t>DOCX to PDF managed runtime smoke.</w:t></w:r></w:p>
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
