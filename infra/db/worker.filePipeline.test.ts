import { describe, expect, it, vi } from 'vitest'
import BetterSqlite3 from 'better-sqlite3'
import ExcelJS from 'exceljs'
import { readFileSync } from 'node:fs'
import { mkdir, mkdtemp, readFile, rm, writeFile } from 'node:fs/promises'
import { createHash } from 'node:crypto'
import os from 'node:os'
import path from 'node:path'
import type { DbHandler, DbMethod } from './types'
import { dispatchWorkerMessage } from './worker/router'
import { registerFilePipelineHandlers } from './worker/handlers/filePipelineHandlers'
import { FileAssetRepo } from './repo/fileAssetRepo'
import { FileAssetStoreRepo } from './repo/fileAssetStoreRepo'
import { FileDerivativeRepo } from './repo/fileDerivativeRepo'
import { DerivativeJobRepo } from './repo/derivativeJobRepo'
import { DfcOptionGenerationStateRepo } from './repo/dfcOptionGenerationStateRepo'
import { MessageAttachmentRepo } from './repo/messageAttachmentRepo'
import { MessageRepo } from './repo/messageRepo'
import { BranchRepo } from './repo/branchRepo'
import { ConversationDraftRepo } from './repo/conversationDraftRepo'
import { ModelCatalogRepo } from './repo/modelCatalogRepo'
import { FileTypeVerdictRepo } from './repo/fileTypeVerdictRepo'
import { ConversationAttachmentService } from '../files/conversationAttachmentService'
import { DerivativeJobService } from '../files/derivativeJobService'
import { FileIngestionService } from '../files/fileIngestionService'
import { SendPlanService } from '../files/sendPlanService'
import { FileTypeDetectionService } from '../files/fileTypeDetectionService'
import { canOpenBetterSqliteForSuite } from '../testUtils/betterSqliteGate'
import type { ElectronConversionBridge } from '../files/electronConversionBridge'
import {
  DFC_LIBREOFFICE_PDF_PATH_POLICY_EXCEEDED,
  type DfcLibreOfficePdfProcessRunner,
} from '../files/dfcLibreOfficePdfAdapter'
import { runExternalProcess } from '../../src/next/file-type/externalProcessRunner'
import {
  DFC_OFFICE_PDF_CAPABILITIES,
  DFC_OFFICE_PDF_ENGINE_ID,
  DFC_OFFICE_PDF_PLUGIN_ID,
  DFC_OFFICE_PDF_RUNTIME_ID,
  DFC_OFFICE_PDF_RUNTIME_KIND,
  DFC_OFFICE_PDF_RUNTIME_PACKAGE_ID,
  createDfcLibreOfficeTrustBlockedAvailabilitySummary,
  getDfcLibreOfficeManagedRuntimeRoot,
  type DfcOfficePdfRuntimeAvailabilitySummary,
  type DfcOfficePdfRuntimeManifest,
} from '../files/dfcManagedLibreOfficeRuntime'

const describeIfBetterSqlite = canOpenBetterSqliteForSuite('file pipeline worker handlers') ? describe : describe.skip
const itRealLibreOfficeSmoke = process.env.STARVERSE_DFC_LIBREOFFICE_REAL_SMOKE === '1' ? it : it.skip

async function createMinimalXlsxBuffer(): Promise<Buffer> {
  const workbook = new ExcelJS.Workbook()
  const visible = workbook.addWorksheet('Visible Sheet')
  visible.addRow(['name', 'amount', 'note'])
  visible.addRow(['alice', { formula: 'SUM(10,20)', result: 30 }, { text: 'report', hyperlink: 'https://example.com/private?token=secret' }])
  visible.addRow(['bob', 41, 'plain'])
  const hidden = workbook.addWorksheet('Hidden Sheet')
  hidden.state = 'hidden'
  hidden.addRow(['hidden-secret'])
  workbook.addWorksheet('Empty Sheet')
  const bytes = await workbook.xlsx.writeBuffer()
  return Buffer.from(bytes)
}

async function createEscapingXlsxBuffer(): Promise<Buffer> {
  const workbook = new ExcelJS.Workbook()
  const sheet = workbook.addWorksheet('# Sheet | One')
  sheet.addRow(['name', 'note'])
  sheet.addRow(['alice', 'uses | pipe\nline 2'])
  const bytes = await workbook.xlsx.writeBuffer()
  return Buffer.from(bytes)
}

async function createManyWorksheetXlsxBuffer(sheetCount: number): Promise<Buffer> {
  const workbook = new ExcelJS.Workbook()
  for (let index = 0; index < sheetCount; index += 1) {
    const sheet = workbook.addWorksheet(`Sheet ${index + 1}`)
    sheet.addRow(['value'])
  }
  const bytes = await workbook.xlsx.writeBuffer()
  return Buffer.from(bytes)
}

async function createOrderedWorksheetXlsxBuffer(): Promise<Buffer> {
  const workbook = new ExcelJS.Workbook()
  const first = workbook.addWorksheet('First Visible')
  first.addRow(['sheet', 'value'])
  first.addRow(['first', '1'])
  const hidden = workbook.addWorksheet('Hidden Middle')
  hidden.state = 'hidden'
  hidden.addRow(['hidden-secret'])
  const second = workbook.addWorksheet('Second Visible')
  second.addRow(['sheet', 'value'])
  second.addRow(['second', '2'])
  const bytes = await workbook.xlsx.writeBuffer()
  return Buffer.from(bytes)
}

async function createFormulaMissingValueXlsxBuffer(): Promise<Buffer> {
  const workbook = new ExcelJS.Workbook()
  const sheet = workbook.addWorksheet('Formula Missing Value')
  sheet.addRow(['name', 'computed'])
  sheet.addRow(['alice', { formula: 'SUM(1,2)' }])
  const bytes = await workbook.xlsx.writeBuffer()
  return Buffer.from(bytes)
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
  <Override PartName="/word/styles.xml" ContentType="application/vnd.openxmlformats-officedocument.wordprocessingml.styles+xml"/>
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
      name: 'word/styles.xml',
      content: `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<w:styles xmlns:w="http://schemas.openxmlformats.org/wordprocessingml/2006/main">
  <w:style w:type="paragraph" w:styleId="Heading1">
    <w:name w:val="heading 1"/>
    <w:basedOn w:val="Normal"/>
    <w:qFormat/>
  </w:style>
</w:styles>`,
    },
    {
      name: 'word/_rels/document.xml.rels',
      content: `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships">
  <Relationship Id="rIdLink1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/hyperlink" Target="https://example.com/private?token=secret" TargetMode="External"/>
</Relationships>`,
    },
    {
      name: 'word/document.xml',
      content: `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<w:document xmlns:w="http://schemas.openxmlformats.org/wordprocessingml/2006/main" xmlns:r="http://schemas.openxmlformats.org/officeDocument/2006/relationships">
  <w:body>
    <w:p><w:pPr><w:pStyle w:val="Heading1"/></w:pPr><w:r><w:t>DOCX Pilot Title</w:t></w:r></w:p>
    <w:p><w:r><w:t>Plain paragraph for DOCX pilot.</w:t></w:r></w:p>
    <w:p><w:hyperlink r:id="rIdLink1"><w:r><w:t>Project link</w:t></w:r></w:hyperlink></w:p>
    <w:sectPr/>
  </w:body>
</w:document>`,
    },
  ])
}

function createMinimalOfficePdfDocxBuffer(): Buffer {
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
    <w:p><w:r><w:t>Starverse Office PDF imported runtime smoke</w:t></w:r></w:p>
    <w:p><w:r><w:t>Managed LibreOffice conversion through DFC.</w:t></w:r></w:p>
    <w:sectPr/>
  </w:body>
</w:document>`,
    },
  ])
}

function createDocxWithImageBuffer(): Buffer {
  const imageBytes = Buffer.from('embedded-secret-media-bytes-private-token', 'utf8')
  return createZipBuffer([
    {
      name: '[Content_Types].xml',
      content: `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<Types xmlns="http://schemas.openxmlformats.org/package/2006/content-types">
  <Default Extension="rels" ContentType="application/vnd.openxmlformats-package.relationships+xml"/>
  <Default Extension="xml" ContentType="application/xml"/>
  <Default Extension="png" ContentType="image/png"/>
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
      name: 'word/_rels/document.xml.rels',
      content: `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships">
  <Relationship Id="rIdImage1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/image" Target="media/image1.png"/>
</Relationships>`,
    },
    {
      name: 'word/media/image1.png',
      content: imageBytes,
    },
    {
      name: 'word/document.xml',
      content: `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<w:document xmlns:w="http://schemas.openxmlformats.org/wordprocessingml/2006/main" xmlns:r="http://schemas.openxmlformats.org/officeDocument/2006/relationships" xmlns:wp="http://schemas.openxmlformats.org/drawingml/2006/wordprocessingDrawing" xmlns:a="http://schemas.openxmlformats.org/drawingml/2006/main" xmlns:pic="http://schemas.openxmlformats.org/drawingml/2006/picture">
  <w:body>
    <w:p><w:r><w:t>Paragraph before image.</w:t></w:r></w:p>
    <w:p>
      <w:r>
        <w:drawing>
          <wp:inline>
            <wp:docPr id="1" name="Picture 1" descr="Visible image alt"/>
            <a:graphic>
              <a:graphicData uri="http://schemas.openxmlformats.org/drawingml/2006/picture">
                <pic:pic>
                  <pic:blipFill>
                    <a:blip r:embed="rIdImage1"/>
                  </pic:blipFill>
                </pic:pic>
              </a:graphicData>
            </a:graphic>
          </wp:inline>
        </w:drawing>
      </w:r>
    </w:p>
    <w:p><w:r><w:t>Paragraph after image.</w:t></w:r></w:p>
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

function loadSchema(db: BetterSqlite3.Database) {
  const schemaPath = path.resolve(process.cwd(), 'infra', 'db', 'schema.sql')
  db.exec(readFileSync(schemaPath, 'utf8'))
}

function insertConvo(db: BetterSqlite3.Database, id: string) {
  const now = Date.now()
  db.prepare(`
    INSERT INTO convo(id, project_id, title, created_at, updated_at, meta)
    VALUES (@id, NULL, @title, @createdAt, @updatedAt, NULL)
  `).run({
    id,
    title: 'File Pipeline Worker',
    createdAt: now,
    updatedAt: now,
  })
}

function createWorkerHarness(options: Readonly<{
  electronConversionBridge?: ElectronConversionBridge
  officePdfProcessRunner?: DfcLibreOfficePdfProcessRunner
  officePdfRuntimeSummary?: () => DfcOfficePdfRuntimeAvailabilitySummary | null
  storageRootDir?: string
}> = {}) {
  const db = new BetterSqlite3(':memory:')
  loadSchema(db)
  insertConvo(db, 'c1')
  const message = new MessageRepo(db).append({ convoId: 'c1', role: 'user', body: 'attach' })
  const fileAssetRepo = new FileAssetRepo(db)
  const fileAssetStoreRepo = new FileAssetStoreRepo(db)
  const fileDerivativeRepo = new FileDerivativeRepo(db)
  const derivativeJobRepo = new DerivativeJobRepo(db)
  const dfcOptionGenerationStateRepo = new DfcOptionGenerationStateRepo(db)
  const fileTypeVerdictRepo = new FileTypeVerdictRepo(db)
  const messageAttachmentRepo = new MessageAttachmentRepo(db)
  const messageRepo = new MessageRepo(db)
  const branchRepo = new BranchRepo(db)
  const modelCatalogRepo = new ModelCatalogRepo(db)
  const handlers = new Map<DbMethod, DbHandler>()
  const storageRootDir = options.storageRootDir
    ? path.resolve(options.storageRootDir)
    : path.resolve(process.cwd(), '.tmp-file-pipeline-worker-tests')
  const conversationAttachmentService = new ConversationAttachmentService({
    db,
    fileAssetRepo,
    fileAssetStoreRepo,
    messageRepo,
    messageAttachmentRepo,
    branchRepo,
    draftRepo: new ConversationDraftRepo(db),
    storageRootDir,
    now: () => 1000,
  })
  const fileTypeDetectionService = new FileTypeDetectionService({
    db,
    fileAssetRepo,
    fileTypeVerdictRepo,
    storageRootDir,
    now: () => 1000,
  })
  const fileTypeDetectionCoordinator = {
    scheduleDraftAttachmentDetection: vi.fn(() => ({ scheduled: true })),
    ensureVerdictsForAssets: vi.fn(async (assetIds: readonly string[], options?: { detectionTrigger?: string }) => {
      const results = []
      for (const assetId of assetIds) {
        const result = await fileTypeDetectionService.detectBasic({
          assetId,
          detectionTrigger: options?.detectionTrigger as any,
          magikaState: 'not_installed',
        })
        results.push({
          assetId,
          status: result.job.status === 'ready' && result.verdict ? 'ready' : 'failed',
          verdict: result.verdict,
          fromCache: result.fromCache,
          reusedCurrent: false,
          pipeline: 'basic',
          magikaState: 'not_installed',
          errorCode: result.job.errorCode,
          errorMessage: result.job.errorMessage,
        })
      }
      return results
    }),
  }
  registerFilePipelineHandlers((method, handler) => handlers.set(method, handler), {
    db,
    fileAssetRepo,
    fileDerivativeRepo,
    derivativeJobRepo,
    dfcOptionGenerationStateRepo,
    messageAttachmentRepo,
    conversationAttachmentService,
    derivativeJobService: new DerivativeJobService({
      db,
      fileAssetRepo,
      fileDerivativeRepo,
      derivativeJobRepo,
      modelCatalogRepo,
      storageRootDir,
      electronConversionBridge: options.electronConversionBridge,
      officePdfProcessRunner: options.officePdfProcessRunner,
      officePdfRuntimeSummary: options.officePdfRuntimeSummary,
      now: () => 1000,
    }),
    sendPlanService: new SendPlanService({
      conversationAttachmentService,
      fileAssetRepo,
      fileDerivativeRepo,
      fileTypeVerdictRepo,
    }),
    fileTypeDetectionService,
    fileTypeDetectionCoordinator,
    fileIngestionService: new FileIngestionService({
      fileAssetRepo,
      fileAssetStoreRepo,
      storageRootDir,
    }),
    fileStorageRootDir: storageRootDir,
    officePdfRuntimeSummary: options.officePdfRuntimeSummary,
  } as any)
  return { db, handlers, message, conversationAttachmentService, fileTypeDetectionCoordinator, fileTypeVerdictRepo }
}

function createFakeOfficePdfSuccessRunner(pdfBytes: Buffer): DfcLibreOfficePdfProcessRunner {
  return async (input) => {
    expect(input.shell).toBe(false)
    expect(input.allowBatchEntrypoint).toBe(false)
    const args = [...(input.args ?? [])]
    const outdirIndex = args.indexOf('--outdir')
    const outputDir = outdirIndex >= 0 ? args[outdirIndex + 1] : null
    const sourcePath = args[args.length - 1]
    expect(outputDir).toBeTruthy()
    expect(sourcePath).toMatch(/\.docx$/i)
    const outputPath = path.join(String(outputDir), `${path.basename(String(sourcePath), path.extname(String(sourcePath)))}.pdf`)
    await mkdir(path.dirname(outputPath), { recursive: true })
    await writeFile(outputPath, pdfBytes)
    return {
      exitCode: 0,
      signal: null,
      stdout: '',
      stderr: '',
      timedOut: false,
      outputLimited: false,
      terminationAttempted: false,
      terminated: false,
      errorCode: null,
      elapsedMs: 12,
    }
  }
}

function createFakeOfficePdfFailureRunner(): DfcLibreOfficePdfProcessRunner {
  return async () => ({
    exitCode: 1,
    signal: null,
    stdout: '',
    stderr: 'failed C:\\Users\\private\\source.docx token=secret file body',
    timedOut: false,
    outputLimited: false,
    terminationAttempted: false,
    terminated: false,
    errorCode: 'process_exit_nonzero',
    elapsedMs: 12,
  })
}

type FakeOfficePdfRunnerMode = 'timeout' | 'missing_output' | 'invalid_pdf' | 'ambiguous_pdf'

function createFakeOfficePdfModeRunner(mode: FakeOfficePdfRunnerMode): DfcLibreOfficePdfProcessRunner {
  return async (input) => {
    const args = [...(input.args ?? [])]
    const outdirIndex = args.indexOf('--outdir')
    const outputDir = outdirIndex >= 0 ? args[outdirIndex + 1] : null
    const sourcePath = args[args.length - 1]
    const outputPath = path.join(String(outputDir), `${path.basename(String(sourcePath), path.extname(String(sourcePath)))}.pdf`)
    if (mode === 'timeout') {
      return {
        exitCode: null,
        signal: null,
        stdout: '',
        stderr: 'timeout C:\\Users\\private\\source.docx token=secret file body',
        timedOut: true,
        outputLimited: false,
        terminationAttempted: true,
        terminated: true,
        errorCode: 'process_timeout',
        elapsedMs: 60_000,
      }
    }
    if (mode === 'invalid_pdf') {
      await mkdir(path.dirname(outputPath), { recursive: true })
      await writeFile(outputPath, Buffer.from('not a pdf body token=secret'))
    }
    if (mode === 'ambiguous_pdf') {
      await mkdir(path.dirname(outputPath), { recursive: true })
      await writeFile(outputPath, Buffer.from('%PDF-1.7\n%%EOF'))
      await writeFile(path.join(String(outputDir), 'extra.pdf'), Buffer.from('%PDF-1.7\n%%EOF'))
    }
    return {
      exitCode: 0,
      signal: null,
      stdout: '',
      stderr: '',
      timedOut: false,
      outputLimited: false,
      terminationAttempted: false,
      terminated: false,
      errorCode: null,
      elapsedMs: 12,
    }
  }
}

function dfcSettingsHash(targetKind: string): string {
  return createHash('sha256').update(Buffer.from(JSON.stringify({ targetKind }))).digest('hex')
}

async function writeLibreOfficeRuntimeFixture(root: string, overrides: Partial<DfcOfficePdfRuntimeManifest> = {}): Promise<void> {
  const executablePath = process.platform === 'win32' ? 'program/soffice.exe' : 'program/soffice'
  const executable = Buffer.from('fake soffice executable')
  await mkdir(path.join(root, 'program'), { recursive: true })
  await writeFile(path.join(root, ...executablePath.split('/')), executable)
  await writeFile(path.join(root, 'manifest.json'), JSON.stringify({
    manifestSchemaVersion: '1',
    pluginId: DFC_OFFICE_PDF_PLUGIN_ID,
    packageId: DFC_OFFICE_PDF_RUNTIME_PACKAGE_ID,
    runtimePackageId: DFC_OFFICE_PDF_RUNTIME_PACKAGE_ID,
    engineId: DFC_OFFICE_PDF_ENGINE_ID,
    runtimeId: DFC_OFFICE_PDF_RUNTIME_ID,
    displayName: 'LibreOffice Office PDF',
    pluginVersion: '0.1.0',
    runtimeKind: DFC_OFFICE_PDF_RUNTIME_KIND,
    enabled: true,
    platform: process.platform,
    arch: process.arch,
    capabilities: [...DFC_OFFICE_PDF_CAPABILITIES],
    executablePath,
    libreOfficeVersion: '24.8.0',
    packageVersion: '2026.06.01',
    artifactSha256: 'a'.repeat(64),
    executableSha256: createHash('sha256').update(executable).digest('hex'),
    executableSizeBytes: executable.byteLength,
    provenance: 'starverse-test-fixture',
    licenseId: 'MPL-2.0',
    attribution: 'The Document Foundation LibreOffice',
    notices: ['LibreOffice test fixture attribution'],
    minimumStarverseContractVersion: '1',
    officialRelease: {
      sourceKind: 'test_fixture',
      packageRef: 'fixtures/libreoffice-test.zip',
      releaseTag: 'test-libreoffice-fixture',
      provenance: 'starverse-test-fixture',
    },
    securityPolicy: {
      macrosDisabled: true,
      networkDisabled: true,
      externalLinksDisabled: true,
      embeddedObjectExecutionDisabled: true,
      isolatedProfileRequired: true,
    },
    ...overrides,
  }))
}

function utf16beWithBom(value: string): Buffer {
  const out = Buffer.alloc(2 + value.length * 2)
  out[0] = 0xfe
  out[1] = 0xff
  for (let index = 0; index < value.length; index += 1) {
    const code = value.charCodeAt(index)
    out[2 + index * 2] = (code >> 8) & 0xff
    out[3 + index * 2] = code & 0xff
  }
  return out
}

async function createWorkerAsset(handlers: Map<DbMethod, DbHandler>) {
  return dispatchWorkerMessage(handlers, {
    id: 'req-asset',
    method: 'fileAsset.create',
    params: {
      id: 'asset-1',
      sha256: 'sha',
      filename: 'note.txt',
      extension: 'txt',
      mime: 'text/plain',
      sizeBytes: 5,
      assetKind: 'text',
      sourceKind: 'local_upload',
      storageUri: 'assets/original/as/asset-1.txt',
      ingestStatus: 'stored',
    },
  })
}

describeIfBetterSqlite('file pipeline worker handlers', () => {
  it('routes repo-backed file asset, derivative, and attachment methods', async () => {
    const { handlers, message } = createWorkerHarness()
    const createAsset = await createWorkerAsset(handlers)
    expect(createAsset.ok).toBe(true)

    const createDerivative = await dispatchWorkerMessage(handlers, {
      id: 'req-derivative',
      method: 'fileDerivative.create',
      params: {
        id: 'derivative-1',
        parentAssetId: 'asset-1',
        derivedKind: 'preview_optimized',
        mime: 'text/plain',
        storageUri: 'assets/derived/asset-1/derivative-1.txt',
        generator: 'phase-2-test',
      },
    })
    expect(createDerivative.ok).toBe(true)

    const createAttachment = await dispatchWorkerMessage(handlers, {
      id: 'req-attachment',
      method: 'messageAttachment.create',
      params: {
        id: 'attachment-1',
        messageId: message.id,
        assetId: 'asset-1',
        aiPayloadKind: 'text',
        processingStatus: 'native_supported',
      },
    })
    expect(createAttachment.ok).toBe(true)

    const listAttachments = await dispatchWorkerMessage(handlers, {
      id: 'req-list',
      method: 'messageAttachment.listByMessageId',
      params: { messageId: message.id },
    })
    expect(listAttachments).toMatchObject({
      ok: true,
      result: [expect.objectContaining({ id: 'attachment-1', assetId: 'asset-1' })],
    })
  })

  it('routes draft attachment restore, add, and commit methods', async () => {
    const { handlers, fileTypeDetectionCoordinator } = createWorkerHarness()
    await createWorkerAsset(handlers)
    const restoreDraft = await dispatchWorkerMessage(handlers, {
      id: 'req-draft',
      method: 'conversationDraft.restore',
      params: { conversationId: 'c1' },
    })
    expect(restoreDraft).toMatchObject({ ok: true, result: expect.objectContaining({ conversationId: 'c1' }) })

    await dispatchWorkerMessage(handlers, {
      id: 'req-draft-add',
      method: 'conversationDraft.addAttachment',
      params: { conversationId: 'c1', assetId: 'asset-1' },
    })
    expect(fileTypeDetectionCoordinator.scheduleDraftAttachmentDetection).toHaveBeenCalledWith('asset-1', {
      detectionTrigger: 'upload',
    })

    const commitDraft = await dispatchWorkerMessage(handlers, {
      id: 'req-draft-commit',
      method: 'conversationDraft.commitToUserMessage',
      params: { conversationId: 'c1', body: 'draft with file' },
    })
    expect(commitDraft).toMatchObject({
      ok: true,
      result: {
        message: expect.objectContaining({ role: 'user', body: 'draft with file' }),
        attachments: [expect.objectContaining({ assetId: 'asset-1' })],
        draft: expect.objectContaining({ attachedAssetIds: [] }),
      },
    })
  })

  it('routes DFC binding fields through worker validation without legacy fallback', async () => {
    const { handlers, message } = createWorkerHarness()
    await createWorkerAsset(handlers)
    const selectedAssetRefs = [{ kind: 'raw_file' as const, assetId: 'asset-1' }]

    const draftAdd = await dispatchWorkerMessage(handlers, {
      id: 'req-dfc-draft-add',
      method: 'conversationDraft.addAttachment',
      params: {
        conversationId: 'c1',
        assetId: 'asset-1',
        preferredSendMode: 'inline_base64',
      },
    })

    expect(draftAdd).toMatchObject({
      ok: true,
      result: expect.objectContaining({
        dfcManaged: false,
        preferredSendMode: 'inline_base64',
      }),
    })

    const options = await dispatchWorkerMessage(handlers, {
      id: 'req-dfc-options',
      method: 'conversationDraft.getDfcOptions',
      params: {
        conversationId: 'c1',
        assetId: 'asset-1',
      },
    })
    expect(options).toMatchObject({
      ok: true,
      result: expect.objectContaining({
        decision: expect.objectContaining({ status: 'needs_user_selection' }),
        options: [expect.objectContaining({
          targetKind: 'original_file',
          sendAssetRefs: selectedAssetRefs,
        })],
      }),
    })
    const originalOption = (options as any).result.options.find((option: any) => option.targetKind === 'original_file')

    const draftAttachment = await dispatchWorkerMessage(handlers, {
      id: 'req-dfc-draft-update',
      method: 'conversationDraft.updateAttachmentSettings',
      params: {
        conversationId: 'c1',
        assetId: 'asset-1',
        dfcManaged: true,
        selectedOptionId: originalOption.optionId,
        selectedAssetRefs,
      },
    })

    expect(draftAttachment).toMatchObject({
      ok: true,
      result: expect.objectContaining({
        dfcManaged: true,
        selectedOptionId: originalOption.optionId,
        selectedAssetRefs,
        preferredSendMode: null,
      }),
    })

    const preview = await dispatchWorkerMessage(handlers, {
      id: 'req-dfc-preview',
      method: 'conversationDraft.getDfcPreview',
      params: {
        conversationId: 'c1',
        assetId: 'asset-1',
        maxCharacters: 128,
      },
    })

    expect(preview).toMatchObject({
      ok: true,
      result: expect.objectContaining({
        selectedOptionId: originalOption.optionId,
        selectedAssetRefs,
        targetKind: 'original_file',
        sendStrategy: 'file_attachment',
        preview: expect.objectContaining({
          kind: 'raw_file',
          status: 'ready',
          text: null,
        }),
      }),
    })

    const attached = await dispatchWorkerMessage(handlers, {
      id: 'req-dfc-attach',
      method: 'conversationDraft.attachToMessage',
      params: {
        conversationId: 'c1',
        messageId: message.id,
        sentAssetIds: ['asset-1'],
        dfcAttachmentSendSnapshots: [{
          attachmentId: (draftAttachment as any).result.id,
          assetId: 'asset-1',
          targetKind: 'original_file',
          sendStrategy: 'file_attachment',
          sendAssetRefs: selectedAssetRefs,
        }],
      },
    })

    expect(attached).toMatchObject({
      ok: true,
      result: {
        attachments: [
          expect.objectContaining({
            dfcManaged: true,
            usedOptionId: originalOption.optionId,
            usedAssetRefs: selectedAssetRefs,
            targetKind: 'original_file',
            sendStrategy: 'file_attachment',
          }),
        ],
      },
    })

    await dispatchWorkerMessage(handlers, {
      id: 'req-asset-dfc-direct',
      method: 'fileAsset.create',
      params: {
        id: 'asset-dfc-direct',
        sha256: 'sha-dfc-direct',
        filename: 'direct.txt',
        extension: 'txt',
        mime: 'text/plain',
        sizeBytes: 6,
        assetKind: 'text',
        sourceKind: 'local_upload',
        storageUri: 'assets/original/as/asset-dfc-direct.txt',
        ingestStatus: 'stored',
      },
    })
    const directAssetRefs = [{ kind: 'raw_file' as const, assetId: 'asset-dfc-direct' }]
    const messageAttachment = await dispatchWorkerMessage(handlers, {
      id: 'req-dfc-message-create',
      method: 'messageAttachment.create',
      params: {
        id: 'attachment-dfc',
        messageId: message.id,
        assetId: 'asset-dfc-direct',
        aiPayloadKind: 'text',
        processingStatus: 'native_supported',
        dfcManaged: true,
        usedOptionId: 'option-original',
        usedAssetRefs: directAssetRefs,
        targetKind: 'original_file',
        sendStrategy: 'file_attachment',
      },
    })

    expect(messageAttachment).toMatchObject({
      ok: true,
      result: expect.objectContaining({
        dfcManaged: true,
        usedOptionId: 'option-original',
        usedAssetRefs: directAssetRefs,
        targetKind: 'original_file',
        sendStrategy: 'file_attachment',
      }),
    })
  })

  it('routes send plan build and draft-to-existing-message migration methods', async () => {
    const { handlers, message, fileTypeDetectionCoordinator } = createWorkerHarness()
    await createWorkerAsset(handlers)
    const storageRootDir = path.resolve(process.cwd(), '.tmp-file-pipeline-worker-tests')
    const storageUri = 'assets/original/as/asset-1.txt'
    await mkdir(path.dirname(path.join(storageRootDir, ...storageUri.split('/'))), { recursive: true })
    await writeFile(path.join(storageRootDir, ...storageUri.split('/')), 'hello')
    await dispatchWorkerMessage(handlers, {
      id: 'req-draft-add',
      method: 'conversationDraft.addAttachment',
      params: { conversationId: 'c1', assetId: 'asset-1' },
    })

    const planResult = await dispatchWorkerMessage(handlers, {
      id: 'req-send-plan',
      method: 'sendPlan.buildCurrent',
      params: {
        conversationId: 'c1',
        draftText: 'send with file',
        model: {
          providerKey: 'openrouter',
          modelId: 'test/text',
          modelKey: 'openrouter::test/text',
          inputModalities: ['text', 'file'],
          outputModalities: ['text'],
        },
        providerContext: {
          providerKey: 'openrouter',
          supportsInlineData: true,
          supportsTextUrlRef: true,
        },
      },
    })
    expect(planResult).toMatchObject({
      ok: true,
      result: {
        sendPlan: expect.objectContaining({ status: 'sendable' }),
        assets: [expect.objectContaining({ id: 'asset-1' })],
      },
    })
    expect(fileTypeDetectionCoordinator.ensureVerdictsForAssets).toHaveBeenCalledWith(['asset-1'], {
      detectionTrigger: 'send_plan_build',
    })

    const attached = await dispatchWorkerMessage(handlers, {
      id: 'req-attach-existing',
      method: 'conversationDraft.attachToMessage',
      params: { conversationId: 'c1', messageId: message.id },
    })
    expect(attached).toMatchObject({
      ok: true,
      result: {
        messageId: message.id,
        attachments: [expect.objectContaining({ assetId: 'asset-1' })],
        draft: expect.objectContaining({ attachedAssetIds: [] }),
      },
    })
  })

  it('keeps send plan lazy text derivatives out of DFC-ready option generation until explicit ensure', async () => {
    const { db, handlers } = createWorkerHarness()
    const storageRootDir = path.resolve(process.cwd(), '.tmp-file-pipeline-worker-tests')
    const assetId = 'asset-csv-dfc'
    const storageUri = 'assets/original/cs/asset-csv-dfc.csv'
    await mkdir(path.dirname(path.join(storageRootDir, ...storageUri.split('/'))), { recursive: true })
    await writeFile(path.join(storageRootDir, ...storageUri.split('/')), 'name,age\nalice,30\n')
    await dispatchWorkerMessage(handlers, {
      id: 'req-csv-asset',
      method: 'fileAsset.create',
      params: {
        id: assetId,
        sha256: 'asset-csv-dfc-source-hash',
        filename: 'data.csv',
        extension: 'csv',
        mime: 'text/csv',
        sizeBytes: 18,
        assetKind: 'text',
        sourceKind: 'local_upload',
        storageUri,
        ingestStatus: 'stored',
      },
    })
    await dispatchWorkerMessage(handlers, {
      id: 'req-csv-draft-add',
      method: 'conversationDraft.addAttachment',
      params: { conversationId: 'c1', assetId },
    })

    const planResult = await dispatchWorkerMessage(handlers, {
      id: 'req-csv-send-plan',
      method: 'sendPlan.buildCurrent',
      params: {
        conversationId: 'c1',
        draftText: 'send table',
        model: {
          providerKey: 'openrouter',
          modelId: 'test/text',
          modelKey: 'openrouter::test/text',
          inputModalities: ['text'],
          outputModalities: ['text'],
        },
        providerContext: {
          providerKey: 'openrouter',
          supportsInlineData: true,
          supportsTextUrlRef: true,
        },
      },
    })

    expect(planResult).toMatchObject({
      ok: true,
      result: {
        sendPlan: expect.objectContaining({ status: 'sendable' }),
      },
    })
    const derivativeRow = db.prepare(`
      SELECT id, storage_uri AS storageUri, meta_json AS metaJson
      FROM file_derivatives
      WHERE parent_asset_id=@assetId AND derived_kind='extracted_text'
      LIMIT 1
    `).get({ assetId }) as { id: string; storageUri: string; metaJson: string | null } | undefined
    expect(derivativeRow).toBeTruthy()
    const derivativeMeta = derivativeRow?.metaJson ? JSON.parse(derivativeRow.metaJson) : null
    expect(derivativeMeta).toMatchObject({
      targetKind: 'table_markdown',
      usage: 'preview_and_send',
    })
    expect(derivativeMeta?.storageClass).toBeUndefined()
    expect(derivativeMeta?.converterName).toBeUndefined()
    expect(derivativeMeta?.converterVersion).toBeUndefined()
    const assetRow = db.prepare(`
      SELECT source_meta_json AS sourceMetaJson
      FROM file_assets
      WHERE id=@assetId
      LIMIT 1
    `).get({ assetId }) as { sourceMetaJson: string | null }
    const assetMeta = assetRow.sourceMetaJson ? JSON.parse(assetRow.sourceMetaJson) : null
    expect(assetMeta?.textConversion).toBeUndefined()
    expect(assetMeta?.lineage).toMatchObject({
      sendAssetReady: true,
      sendTextStorageUri: derivativeRow?.storageUri,
    })
    const options = await dispatchWorkerMessage(handlers, {
      id: 'req-csv-dfc-options',
      method: 'conversationDraft.getDfcOptions',
      params: { conversationId: 'c1', assetId },
    })
    const tableOption = (options as any).result.options.find((option: any) => option.targetKind === 'table_markdown')
    expect(tableOption).toMatchObject({
      targetKind: 'table_markdown',
      isAvailable: false,
      compatibilityStatus: 'blocked',
      sendAssetRefs: [{ kind: 'derived_asset', assetId: derivativeRow?.id }],
    })
    expect(JSON.stringify((options as any).result)).not.toContain(derivativeRow?.storageUri ?? 'assets/')
    expect(JSON.stringify((options as any).result)).not.toContain('asset-csv-dfc-source-hash')

    const ensured = await dispatchWorkerMessage(handlers, {
      id: 'req-csv-dfc-ensure',
      method: 'conversationDraft.ensureDfcOptions',
      params: { conversationId: 'c1', assetId },
    })
    expect(options).toMatchObject({
      ok: true,
    })
    expect(ensured).toMatchObject({
      ok: true,
      result: {
        options: expect.arrayContaining([
          expect.objectContaining({
            targetKind: 'table_markdown',
            isAvailable: true,
            sendAssetRefs: [{ kind: 'derived_asset', assetId: derivativeRow?.id }],
          }),
        ]),
      },
    })

    const refreshedPlan = await dispatchWorkerMessage(handlers, {
      id: 'req-csv-send-plan-after-ensure',
      method: 'sendPlan.buildCurrent',
      params: {
        conversationId: 'c1',
        draftText: 'send table again',
        model: {
          providerKey: 'openrouter',
          modelId: 'test/text',
          modelKey: 'openrouter::test/text',
          inputModalities: ['text'],
          outputModalities: ['text'],
        },
        providerContext: {
          providerKey: 'openrouter',
          supportsInlineData: true,
          supportsTextUrlRef: true,
        },
      },
    })
    expect(refreshedPlan).toMatchObject({
      ok: true,
      result: {
        sendPlan: expect.objectContaining({ status: 'sendable' }),
      },
    })
    const preservedAssetRow = db.prepare(`
      SELECT source_meta_json AS sourceMetaJson
      FROM file_assets
      WHERE id=@assetId
      LIMIT 1
    `).get({ assetId }) as { sourceMetaJson: string | null }
    const preservedAssetMeta = preservedAssetRow.sourceMetaJson ? JSON.parse(preservedAssetRow.sourceMetaJson) : null
    expect(preservedAssetMeta?.textConversion).toMatchObject({
      status: 'ready',
      targetKind: 'table_markdown',
      derivativeId: derivativeRow?.id,
      storageClass: 'draft_bound',
      converterName: 'starverse-text-derivative',
      converterVersion: '1',
    })
  })

  it('generates backend-owned DFC draft options through explicit ensure endpoint', async () => {
    const { db, handlers, fileTypeDetectionCoordinator } = createWorkerHarness()
    const storageRootDir = path.resolve(process.cwd(), '.tmp-file-pipeline-worker-tests')
    const assetId = 'asset-csv-explicit-dfc'
    const storageUri = 'assets/original/cs/asset-csv-explicit-dfc.csv'
    await mkdir(path.dirname(path.join(storageRootDir, ...storageUri.split('/'))), { recursive: true })
    await writeFile(path.join(storageRootDir, ...storageUri.split('/')), 'name,age\nalice,30\n')
    await dispatchWorkerMessage(handlers, {
      id: 'req-csv-explicit-asset',
      method: 'fileAsset.create',
      params: {
        id: assetId,
        sha256: 'asset-csv-explicit-source-hash',
        filename: 'data.csv',
        extension: 'csv',
        mime: 'text/csv',
        sizeBytes: 18,
        assetKind: 'text',
        sourceKind: 'local_upload',
        storageUri,
        ingestStatus: 'stored',
      },
    })
    await dispatchWorkerMessage(handlers, {
      id: 'req-csv-explicit-draft-add',
      method: 'conversationDraft.addAttachment',
      params: { conversationId: 'c1', assetId },
    })

    const before = await dispatchWorkerMessage(handlers, {
      id: 'req-csv-explicit-options-before',
      method: 'conversationDraft.getDfcOptions',
      params: { conversationId: 'c1', assetId },
    })
    expect(before).toMatchObject({
      ok: true,
      result: {
        options: [expect.objectContaining({ targetKind: 'original_file' })],
      },
    })

    const ensured = await dispatchWorkerMessage(handlers, {
      id: 'req-csv-explicit-ensure',
      method: 'conversationDraft.ensureDfcOptions',
      params: { conversationId: 'c1', assetId },
    })

    const derivativeRow = db.prepare(`
      SELECT id, storage_uri AS storageUri, meta_json AS metaJson
      FROM file_derivatives
      WHERE parent_asset_id=@assetId AND derived_kind='extracted_text'
      LIMIT 1
    `).get({ assetId }) as { id: string; storageUri: string; metaJson: string | null } | undefined
    expect(derivativeRow).toBeTruthy()
    const tableOption = (ensured as any).result.options.find((option: any) => option.targetKind === 'table_markdown')
    expect(tableOption).toMatchObject({
      optionId: `dfc:${assetId}:table_markdown:derived_asset:${derivativeRow?.id}`,
      sendStrategy: 'text_in_prompt',
      status: 'ready',
      isAvailable: true,
      compatibilityStatus: 'compatible',
      sendAssetRefs: [{ kind: 'derived_asset', assetId: derivativeRow?.id }],
    })
    expect(JSON.stringify((ensured as any).result)).not.toContain(derivativeRow?.storageUri ?? 'assets/')
    expect(JSON.stringify((ensured as any).result)).not.toContain('asset-csv-explicit-source-hash')
    expect(fileTypeDetectionCoordinator.ensureVerdictsForAssets).not.toHaveBeenCalled()

    const selected = await dispatchWorkerMessage(handlers, {
      id: 'req-csv-explicit-select',
      method: 'conversationDraft.updateAttachmentSettings',
      params: {
        conversationId: 'c1',
        assetId,
        dfcManaged: true,
        selectedOptionId: tableOption.optionId,
        selectedAssetRefs: tableOption.sendAssetRefs,
      },
    })
    expect(selected).toMatchObject({
      ok: true,
      result: {
        dfcManaged: true,
        selectedOptionId: tableOption.optionId,
        selectedAssetRefs: tableOption.sendAssetRefs,
        preferredSendMode: null,
      },
    })

    const secondEnsure = await dispatchWorkerMessage(handlers, {
      id: 'req-csv-explicit-ensure-again',
      method: 'conversationDraft.ensureDfcOptions',
      params: { conversationId: 'c1', assetId },
    })
    const derivativeCount = db.prepare(`
      SELECT COUNT(*) AS count
      FROM file_derivatives
      WHERE parent_asset_id=@assetId AND derived_kind='extracted_text'
    `).get({ assetId }) as { count: number }
    const jobCount = db.prepare(`
      SELECT COUNT(*) AS count
      FROM derivative_jobs
      WHERE asset_id=@assetId AND derivative_kind='extracted_text'
    `).get({ assetId }) as { count: number }
    expect(derivativeCount.count).toBe(1)
    expect(jobCount.count).toBe(1)
    expect((secondEnsure as any).result).toMatchObject({
      selectedOptionId: tableOption.optionId,
      selectedAssetRefs: tableOption.sendAssetRefs,
      decision: expect.objectContaining({
        status: 'ready',
        targetKind: 'table_markdown',
        sendAssetRefs: tableOption.sendAssetRefs,
      }),
    })
  })

  it('generates XLSX table_markdown DFC options through explicit ensure endpoint', async () => {
    const { db, handlers, fileTypeDetectionCoordinator } = createWorkerHarness()
    const storageRootDir = path.resolve(process.cwd(), '.tmp-file-pipeline-worker-tests')
    const assetId = 'asset-xlsx-explicit-dfc'
    const storageUri = 'assets/original/xl/asset-xlsx-explicit-dfc.xlsx'
    const xlsxBytes = await createMinimalXlsxBuffer()
    await mkdir(path.dirname(path.join(storageRootDir, ...storageUri.split('/'))), { recursive: true })
    await writeFile(path.join(storageRootDir, ...storageUri.split('/')), xlsxBytes)
    await dispatchWorkerMessage(handlers, {
      id: 'req-xlsx-explicit-asset',
      method: 'fileAsset.create',
      params: {
        id: assetId,
        sha256: 'asset-xlsx-explicit-source-hash',
        filename: 'book.xlsx',
        extension: 'xlsx',
        mime: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
        sizeBytes: xlsxBytes.byteLength,
        assetKind: 'document',
        sourceKind: 'local_upload',
        storageUri,
        ingestStatus: 'stored',
      },
    })
    await dispatchWorkerMessage(handlers, {
      id: 'req-xlsx-explicit-draft-add',
      method: 'conversationDraft.addAttachment',
      params: { conversationId: 'c1', assetId },
    })

    const ensured = await dispatchWorkerMessage(handlers, {
      id: 'req-xlsx-explicit-ensure',
      method: 'conversationDraft.ensureDfcOptions',
      params: { conversationId: 'c1', assetId },
    })

    const derivativeRow = db.prepare(`
      SELECT id, storage_uri AS storageUri, meta_json AS metaJson
      FROM file_derivatives
      WHERE parent_asset_id=@assetId AND derived_kind='extracted_text'
      LIMIT 1
    `).get({ assetId }) as { id: string; storageUri: string; metaJson: string | null } | undefined
    expect(derivativeRow).toBeTruthy()
    const converted = await readFile(path.join(storageRootDir, ...String(derivativeRow?.storageUri ?? '').split('/')), 'utf8')
    expect(converted).toContain('## Visible Sheet')
    expect(converted).toContain('| name | amount | note |')
    expect(converted).toContain('| alice | 30 | report |')
    expect(converted).toContain('## Empty Sheet')
    expect(converted).toContain('_Empty worksheet._')
    expect(converted).not.toContain('hidden-secret')
    expect(converted).not.toContain('https://example.com')
    expect(converted).not.toContain('token=secret')

    const derivativeMeta = derivativeRow?.metaJson ? JSON.parse(derivativeRow.metaJson) : null
    expect(derivativeMeta).toMatchObject({
      targetKind: 'table_markdown',
      usage: 'preview_and_send',
      storageClass: 'draft_bound',
      converterName: 'starverse-text-derivative',
    })
    expect(derivativeMeta?.conversionWarnings).toEqual(expect.arrayContaining([
      'xlsx_formula_cached_value_used',
      'xlsx_hyperlinks_omitted',
      'xlsx_hidden_sheets_skipped',
      'xlsx_empty_sheet',
    ]))

    const tableOption = (ensured as any).result.options.find((option: any) => option.targetKind === 'table_markdown')
    expect(tableOption).toMatchObject({
      optionId: `dfc:${assetId}:table_markdown:derived_asset:${derivativeRow?.id}`,
      sendStrategy: 'text_in_prompt',
      status: 'ready',
      isAvailable: true,
      compatibilityStatus: 'compatible',
      sendAssetRefs: [{ kind: 'derived_asset', assetId: derivativeRow?.id }],
    })
    expect(JSON.stringify((ensured as any).result)).not.toContain(storageUri)
    expect(JSON.stringify((ensured as any).result)).not.toContain(derivativeRow?.storageUri ?? 'assets/')
    expect(JSON.stringify((ensured as any).result)).not.toContain('asset-xlsx-explicit-source-hash')
    expect(fileTypeDetectionCoordinator.ensureVerdictsForAssets).not.toHaveBeenCalled()

    const selected = await dispatchWorkerMessage(handlers, {
      id: 'req-xlsx-explicit-select',
      method: 'conversationDraft.updateAttachmentSettings',
      params: {
        conversationId: 'c1',
        assetId,
        dfcManaged: true,
        selectedOptionId: tableOption.optionId,
        selectedAssetRefs: tableOption.sendAssetRefs,
      },
    })
    const preview = await dispatchWorkerMessage(handlers, {
      id: 'req-xlsx-explicit-preview',
      method: 'conversationDraft.getDfcPreview',
      params: { conversationId: 'c1', assetId, maxCharacters: 2048 },
    })
    const planResult = await dispatchWorkerMessage(handlers, {
      id: 'req-xlsx-explicit-send-plan',
      method: 'sendPlan.buildCurrent',
      params: {
        conversationId: 'c1',
        draftText: 'send xlsx table',
        model: {
          providerKey: 'openrouter',
          modelId: 'test/text',
          modelKey: 'openrouter::test/text',
          inputModalities: ['text'],
          outputModalities: ['text'],
        },
        providerContext: {
          providerKey: 'openrouter',
          supportsInlineData: true,
          supportsTextUrlRef: true,
        },
      },
    })

    expect(selected).toMatchObject({ ok: true })
    expect(preview).toMatchObject({
      ok: true,
      result: {
        selectedOptionId: tableOption.optionId,
        selectedAssetRefs: tableOption.sendAssetRefs,
        targetKind: 'table_markdown',
        sendStrategy: 'text_in_prompt',
        preview: expect.objectContaining({
          kind: 'text',
          status: 'ready',
          text: converted,
        }),
      },
    })
    expect(planResult).toMatchObject({
      ok: true,
      result: {
        sendPlan: expect.objectContaining({
          status: 'sendable',
          attachmentPlans: [
            expect.objectContaining({
              assetId,
              semantic: {
                targetKind: 'table_markdown',
                sendStrategy: 'text_in_prompt',
                mappedFromLegacy: false,
              },
              sendAssetRefs: tableOption.sendAssetRefs,
            }),
          ],
        }),
      },
    })
    const previewJson = JSON.stringify((preview as any).result)
    const planAttachmentPlansJson = JSON.stringify((planResult as any).result.sendPlan.attachmentPlans)
    expect(previewJson).not.toContain(storageUri)
    expect(previewJson).not.toContain(derivativeRow?.storageUri ?? 'assets/')
    expect(previewJson).not.toContain('asset-xlsx-explicit-source-hash')
    expect(planAttachmentPlansJson).not.toContain(storageUri)
    expect(planAttachmentPlansJson).not.toContain(derivativeRow?.storageUri ?? 'assets/')
    expect(planAttachmentPlansJson).not.toContain('asset-xlsx-explicit-source-hash')
  })

  it('generates DOCX markdown DFC options through explicit ensure endpoint', async () => {
    const { db, handlers, fileTypeDetectionCoordinator } = createWorkerHarness()
    const storageRootDir = path.resolve(process.cwd(), '.tmp-file-pipeline-worker-tests')
    const assetId = 'asset-docx-explicit-dfc'
    const storageUri = 'assets/original/do/asset-docx-explicit-dfc.docx'
    const docxBytes = createMinimalDocxBuffer()
    await mkdir(path.dirname(path.join(storageRootDir, ...storageUri.split('/'))), { recursive: true })
    await writeFile(path.join(storageRootDir, ...storageUri.split('/')), docxBytes)
    await dispatchWorkerMessage(handlers, {
      id: 'req-docx-explicit-asset',
      method: 'fileAsset.create',
      params: {
        id: assetId,
        sha256: 'asset-docx-explicit-source-hash',
        filename: 'brief.docx',
        extension: 'docx',
        mime: 'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
        sizeBytes: docxBytes.byteLength,
        assetKind: 'document',
        sourceKind: 'local_upload',
        storageUri,
        ingestStatus: 'stored',
      },
    })
    await dispatchWorkerMessage(handlers, {
      id: 'req-docx-explicit-draft-add',
      method: 'conversationDraft.addAttachment',
      params: { conversationId: 'c1', assetId },
    })

    const ensured = await dispatchWorkerMessage(handlers, {
      id: 'req-docx-explicit-ensure',
      method: 'conversationDraft.ensureDfcOptions',
      params: { conversationId: 'c1', assetId },
    })

    const derivativeRow = db.prepare(`
      SELECT id, storage_uri AS storageUri, meta_json AS metaJson
      FROM file_derivatives
      WHERE parent_asset_id=@assetId AND derived_kind='extracted_text'
      LIMIT 1
    `).get({ assetId }) as { id: string; storageUri: string; metaJson: string | null } | undefined
    expect(derivativeRow).toBeTruthy()
    const converted = await readFile(path.join(storageRootDir, ...String(derivativeRow?.storageUri ?? '').split('/')), 'utf8')
    expect(converted).toContain('# DOCX Pilot Title')
    expect(converted).toContain('Plain paragraph for DOCX pilot.')
    expect(converted).toContain('Project link')
    expect(converted).not.toContain('https://example.com')
    expect(converted).not.toContain('token=secret')

    const derivativeMeta = derivativeRow?.metaJson ? JSON.parse(derivativeRow.metaJson) : null
    expect(derivativeMeta).toMatchObject({
      targetKind: 'markdown',
      usage: 'preview_and_send',
      storageClass: 'draft_bound',
      converterName: 'starverse-text-derivative',
    })
    expect(derivativeMeta?.conversionWarnings).toEqual(expect.arrayContaining([
      'docx_visual_layout_not_preserved',
      'docx_external_resources_not_loaded',
      'docx_hyperlink_targets_omitted',
    ]))

    const markdownOption = (ensured as any).result.options.find((option: any) => option.targetKind === 'markdown')
    expect(markdownOption).toMatchObject({
      optionId: `dfc:${assetId}:markdown:derived_asset:${derivativeRow?.id}`,
      sendStrategy: 'text_in_prompt',
      status: 'ready',
      isAvailable: true,
      compatibilityStatus: 'compatible',
      sendAssetRefs: [{ kind: 'derived_asset', assetId: derivativeRow?.id }],
    })
    expect(JSON.stringify((ensured as any).result)).not.toContain(storageUri)
    expect(JSON.stringify((ensured as any).result)).not.toContain(derivativeRow?.storageUri ?? 'assets/')
    expect(JSON.stringify((ensured as any).result)).not.toContain('asset-docx-explicit-source-hash')
    expect(fileTypeDetectionCoordinator.ensureVerdictsForAssets).not.toHaveBeenCalled()

    const selected = await dispatchWorkerMessage(handlers, {
      id: 'req-docx-explicit-select',
      method: 'conversationDraft.updateAttachmentSettings',
      params: {
        conversationId: 'c1',
        assetId,
        dfcManaged: true,
        selectedOptionId: markdownOption.optionId,
        selectedAssetRefs: markdownOption.sendAssetRefs,
      },
    })
    const preview = await dispatchWorkerMessage(handlers, {
      id: 'req-docx-explicit-preview',
      method: 'conversationDraft.getDfcPreview',
      params: { conversationId: 'c1', assetId, maxCharacters: 2048 },
    })
    const planResult = await dispatchWorkerMessage(handlers, {
      id: 'req-docx-explicit-send-plan',
      method: 'sendPlan.buildCurrent',
      params: {
        conversationId: 'c1',
        draftText: 'send docx markdown',
        model: {
          providerKey: 'openrouter',
          modelId: 'test/text',
          modelKey: 'openrouter::test/text',
          inputModalities: ['text'],
          outputModalities: ['text'],
        },
        providerContext: {
          providerKey: 'openrouter',
          supportsInlineData: true,
          supportsTextUrlRef: true,
        },
      },
    })

    expect(selected).toMatchObject({ ok: true })
    expect(preview).toMatchObject({
      ok: true,
      result: {
        selectedOptionId: markdownOption.optionId,
        selectedAssetRefs: markdownOption.sendAssetRefs,
        targetKind: 'markdown',
        sendStrategy: 'text_in_prompt',
        preview: expect.objectContaining({
          kind: 'text',
          status: 'ready',
          text: converted,
        }),
      },
    })
    expect(planResult).toMatchObject({
      ok: true,
      result: {
        sendPlan: expect.objectContaining({
          status: 'sendable',
          attachmentPlans: [
            expect.objectContaining({
              assetId,
              semantic: {
                targetKind: 'markdown',
                sendStrategy: 'text_in_prompt',
                mappedFromLegacy: false,
              },
              sendAssetRefs: markdownOption.sendAssetRefs,
            }),
          ],
        }),
      },
    })
    const previewJson = JSON.stringify((preview as any).result)
    const planAttachmentPlansJson = JSON.stringify((planResult as any).result.sendPlan.attachmentPlans)
    expect(previewJson).not.toContain(storageUri)
    expect(previewJson).not.toContain(derivativeRow?.storageUri ?? 'assets/')
    expect(previewJson).not.toContain('asset-docx-explicit-source-hash')
    expect(planAttachmentPlansJson).not.toContain(storageUri)
    expect(planAttachmentPlansJson).not.toContain(derivativeRow?.storageUri ?? 'assets/')
    expect(planAttachmentPlansJson).not.toContain('asset-docx-explicit-source-hash')
  })

  it('exposes DOCX pdf_attachment as unavailable when LibreOffice managed runtime is missing', async () => {
    const { db, handlers } = createWorkerHarness()
    const storageRootDir = path.resolve(process.cwd(), '.tmp-file-pipeline-worker-tests')
    await rm(getDfcLibreOfficeManagedRuntimeRoot(storageRootDir), { recursive: true, force: true })
    const assetId = 'asset-docx-office-pdf-missing-runtime'
    const storageUri = 'assets/original/do/asset-docx-office-pdf-missing-runtime.docx'
    const docxBytes = createMinimalDocxBuffer()
    await mkdir(path.dirname(path.join(storageRootDir, ...storageUri.split('/'))), { recursive: true })
    await writeFile(path.join(storageRootDir, ...storageUri.split('/')), docxBytes)
    await dispatchWorkerMessage(handlers, {
      id: 'req-docx-office-pdf-missing-asset',
      method: 'fileAsset.create',
      params: {
        id: assetId,
        sha256: 'asset-docx-office-pdf-missing-source-hash',
        filename: 'office-pdf.docx',
        extension: 'docx',
        mime: 'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
        sizeBytes: docxBytes.byteLength,
        assetKind: 'document',
        sourceKind: 'local_upload',
        storageUri,
        ingestStatus: 'stored',
      },
    })
    await dispatchWorkerMessage(handlers, {
      id: 'req-docx-office-pdf-missing-draft-add',
      method: 'conversationDraft.addAttachment',
      params: { conversationId: 'c1', assetId },
    })

    const ensured = await dispatchWorkerMessage(handlers, {
      id: 'req-docx-office-pdf-missing-ensure',
      method: 'conversationDraft.ensureDfcOptions',
      params: { conversationId: 'c1', assetId },
    })
    const options = (ensured as any).result.options as any[]
    const originalOption = options.find((option) => option.targetKind === 'original_file')
    const markdownOption = options.find((option) => option.targetKind === 'markdown')
    const pdfOption = options.find((option) => option.targetKind === 'pdf_attachment')
    const readyPdfCount = (db.prepare(`
      SELECT COUNT(*) AS count
      FROM file_derivatives
      WHERE parent_asset_id=@assetId AND derived_kind='converted_pdf' AND status='ready'
    `).get({ assetId }) as { count: number }).count
    const generationState = db.prepare(`
      SELECT target_kind AS targetKind, derived_kind AS derivedKind, status, error_code AS errorCode
      FROM dfc_option_generation_states
      WHERE asset_id=@assetId AND target_kind='pdf_attachment'
      LIMIT 1
    `).get({ assetId }) as { targetKind: string; derivedKind: string; status: string; errorCode: string | null }

    expect(originalOption).toMatchObject({
      targetKind: 'original_file',
      status: 'ready',
      sendAssetRefs: [{ kind: 'raw_file', assetId }],
    })
    expect(markdownOption).toMatchObject({
      targetKind: 'markdown',
      status: 'ready',
      isAvailable: true,
    })
    expect(pdfOption).toMatchObject({
      targetKind: 'pdf_attachment',
      sendStrategy: 'file_attachment',
      status: 'blocked',
      isAvailable: false,
      compatibilityStatus: 'blocked',
      sendAssetRefs: [],
      diagnostics: [expect.objectContaining({
        code: 'conversion_engine_missing',
        productCode: 'conversion_engine_missing',
        internalCode: 'office_pdf_runtime_missing',
        runtimeStatus: 'missing',
        productionApproved: false,
        ownerGated: true,
        experimental: true,
        fallbackTargetKinds: ['markdown', 'original_file'],
      })],
    })
    expect(generationState).toMatchObject({
      targetKind: 'pdf_attachment',
      derivedKind: 'converted_pdf',
      status: 'blocked',
      errorCode: 'conversion_engine_missing',
    })
    expect(readyPdfCount).toBe(0)
    expect(JSON.stringify((ensured as any).result)).not.toContain(storageUri)
    expect(JSON.stringify((ensured as any).result)).not.toContain('asset-docx-office-pdf-missing-source-hash')
    expect(JSON.stringify((ensured as any).result)).not.toContain('managed-runtimes')

    const pdfSelect = await dispatchWorkerMessage(handlers, {
      id: 'req-docx-office-pdf-missing-select-pdf',
      method: 'conversationDraft.updateAttachmentSettings',
      params: {
        conversationId: 'c1',
        assetId,
        dfcManaged: true,
        selectedOptionId: pdfOption.optionId,
        selectedAssetRefs: pdfOption.sendAssetRefs,
      },
    })
    const preview = await dispatchWorkerMessage(handlers, {
      id: 'req-docx-office-pdf-missing-preview',
      method: 'conversationDraft.getDfcPreview',
      params: { conversationId: 'c1', assetId, maxCharacters: 256 },
    })

    expect(pdfSelect).toMatchObject({ ok: false })
    expect(preview).toMatchObject({
      ok: true,
      result: {
        selectedOptionId: null,
        selectedAssetRefs: [],
        targetKind: null,
        sendStrategy: null,
        decision: expect.objectContaining({
          status: 'needs_user_selection',
          reasonCode: 'selected_option_missing',
        }),
      },
    })
  })

  it('exposes DOCX pdf_attachment product diagnostics when LibreOffice runtime is policy blocked', async () => {
    const { handlers } = createWorkerHarness()
    const storageRootDir = path.resolve(process.cwd(), '.tmp-file-pipeline-worker-tests')
    const runtimeRoot = getDfcLibreOfficeManagedRuntimeRoot(storageRootDir)
    await writeLibreOfficeRuntimeFixture(runtimeRoot, { enabled: false })
    const assetId = 'asset-docx-office-pdf-policy-blocked-runtime'
    const storageUri = 'assets/original/do/asset-docx-office-pdf-policy-blocked-runtime.docx'
    const docxBytes = createMinimalDocxBuffer()
    await mkdir(path.dirname(path.join(storageRootDir, ...storageUri.split('/'))), { recursive: true })
    await writeFile(path.join(storageRootDir, ...storageUri.split('/')), docxBytes)
    await dispatchWorkerMessage(handlers, {
      id: 'req-docx-office-pdf-policy-blocked-asset',
      method: 'fileAsset.create',
      params: {
        id: assetId,
        sha256: 'asset-docx-office-pdf-policy-blocked-source-hash',
        filename: 'office-pdf-policy-blocked.docx',
        extension: 'docx',
        mime: 'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
        sizeBytes: docxBytes.byteLength,
        assetKind: 'document',
        sourceKind: 'local_upload',
        storageUri,
        ingestStatus: 'stored',
      },
    })
    await dispatchWorkerMessage(handlers, {
      id: 'req-docx-office-pdf-policy-blocked-draft-add',
      method: 'conversationDraft.addAttachment',
      params: { conversationId: 'c1', assetId },
    })

    const ensured = await dispatchWorkerMessage(handlers, {
      id: 'req-docx-office-pdf-policy-blocked-ensure',
      method: 'conversationDraft.ensureDfcOptions',
      params: { conversationId: 'c1', assetId },
    })
    const options = (ensured as any).result.options as any[]
    const pdfOption = options.find((option) => option.targetKind === 'pdf_attachment')
    const markdownOption = options.find((option) => option.targetKind === 'markdown')
    const originalOption = options.find((option) => option.targetKind === 'original_file')

    expect(pdfOption).toMatchObject({
      targetKind: 'pdf_attachment',
      status: 'blocked',
      isAvailable: false,
      diagnostics: [expect.objectContaining({
        code: 'conversion_sandbox_denied',
        productCode: 'conversion_sandbox_denied',
        internalCode: 'office_pdf_runtime_quarantined',
        runtimeStatus: 'blocked',
        productionApproved: false,
        ownerGated: true,
        experimental: true,
        degraded: true,
        fallbackTargetKinds: ['markdown', 'original_file'],
      })],
    })
    expect(markdownOption).toMatchObject({ targetKind: 'markdown', status: 'ready', isAvailable: true })
    expect(originalOption).toMatchObject({ targetKind: 'original_file', status: 'ready', isAvailable: true })
    const ensuredJson = JSON.stringify((ensured as any).result)
    expect(ensuredJson).not.toContain(runtimeRoot)
    expect(ensuredJson).not.toContain(storageUri)
  })

  it('blocks DOCX pdf_attachment for trust-blocked LibreOffice packages before process launch', async () => {
    let processLaunches = 0
    const { handlers } = createWorkerHarness({
      officePdfRuntimeSummary: () => createDfcLibreOfficeTrustBlockedAvailabilitySummary({
        message: 'signature invalid for managed package',
        trustStates: ['signature_invalid'],
        distributionStates: ['distribution_mode_unapproved', 'download_disabled_by_policy'],
        diagnosticCode: 'signature_invalid',
      }),
      officePdfProcessRunner: async () => {
        processLaunches += 1
        throw new Error('process runner must not be reached')
      },
    })
    const storageRootDir = path.resolve(process.cwd(), '.tmp-file-pipeline-worker-tests')
    const runtimeRoot = getDfcLibreOfficeManagedRuntimeRoot(storageRootDir)
    await writeLibreOfficeRuntimeFixture(runtimeRoot)
    const assetId = 'asset-docx-office-pdf-trust-blocked-runtime'
    const storageUri = 'assets/original/dt/asset-docx-office-pdf-trust-blocked-runtime.docx'
    const docxBytes = createMinimalDocxBuffer()
    await mkdir(path.dirname(path.join(storageRootDir, ...storageUri.split('/'))), { recursive: true })
    await writeFile(path.join(storageRootDir, ...storageUri.split('/')), docxBytes)
    await dispatchWorkerMessage(handlers, {
      id: 'req-docx-office-pdf-trust-blocked-asset',
      method: 'fileAsset.create',
      params: {
        id: assetId,
        sha256: 'asset-docx-office-pdf-trust-blocked-source-hash',
        filename: 'office-pdf-trust-blocked.docx',
        extension: 'docx',
        mime: 'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
        sizeBytes: docxBytes.byteLength,
        assetKind: 'document',
        sourceKind: 'local_upload',
        storageUri,
        ingestStatus: 'stored',
      },
    })
    await dispatchWorkerMessage(handlers, {
      id: 'req-docx-office-pdf-trust-blocked-draft-add',
      method: 'conversationDraft.addAttachment',
      params: { conversationId: 'c1', assetId },
    })

    const ensured = await dispatchWorkerMessage(handlers, {
      id: 'req-docx-office-pdf-trust-blocked-ensure',
      method: 'conversationDraft.ensureDfcOptions',
      params: { conversationId: 'c1', assetId },
    })
    const options = (ensured as any).result.options as any[]
    const pdfOption = options.find((option) => option.targetKind === 'pdf_attachment')
    const markdownOption = options.find((option) => option.targetKind === 'markdown')
    const originalOption = options.find((option) => option.targetKind === 'original_file')

    expect(processLaunches).toBe(0)
    expect(pdfOption).toMatchObject({
      targetKind: 'pdf_attachment',
      status: 'blocked',
      isAvailable: false,
      sendAssetRefs: [],
      diagnostics: [expect.objectContaining({
        code: 'conversion_sandbox_denied',
        productCode: 'conversion_sandbox_denied',
        internalCode: 'office_pdf_runtime_quarantined',
        runtimeStatus: 'blocked',
        productionApproved: false,
        ownerGated: true,
        experimental: true,
        degraded: true,
        fallbackTargetKinds: ['markdown', 'original_file'],
      })],
    })
    expect(markdownOption).toMatchObject({ targetKind: 'markdown', status: 'ready', isAvailable: true })
    expect(originalOption).toMatchObject({ targetKind: 'original_file', status: 'ready', isAvailable: true })
    const ensuredJson = JSON.stringify((ensured as any).result)
    expect(ensuredJson).not.toContain(runtimeRoot)
    expect(ensuredJson).not.toContain(storageUri)
    expect(ensuredJson).not.toContain('signature invalid for managed package')
  })

  it('accepts a fake LibreOffice runtime gate fixture without running Office-to-PDF conversion', async () => {
    const { db, handlers } = createWorkerHarness()
    const storageRootDir = path.resolve(process.cwd(), '.tmp-file-pipeline-worker-tests')
    const runtimeRoot = getDfcLibreOfficeManagedRuntimeRoot(storageRootDir)
    await writeLibreOfficeRuntimeFixture(runtimeRoot)
    const assetId = 'asset-docx-office-pdf-valid-runtime'
    const storageUri = 'assets/original/do/asset-docx-office-pdf-valid-runtime.docx'
    const docxBytes = createMinimalDocxBuffer()
    await mkdir(path.dirname(path.join(storageRootDir, ...storageUri.split('/'))), { recursive: true })
    await writeFile(path.join(storageRootDir, ...storageUri.split('/')), docxBytes)
    await dispatchWorkerMessage(handlers, {
      id: 'req-docx-office-pdf-valid-asset',
      method: 'fileAsset.create',
      params: {
        id: assetId,
        sha256: 'asset-docx-office-pdf-valid-source-hash',
        filename: 'office-pdf-ready-runtime.docx',
        extension: 'docx',
        mime: 'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
        sizeBytes: docxBytes.byteLength,
        assetKind: 'document',
        sourceKind: 'local_upload',
        storageUri,
        ingestStatus: 'stored',
      },
    })
    await dispatchWorkerMessage(handlers, {
      id: 'req-docx-office-pdf-valid-draft-add',
      method: 'conversationDraft.addAttachment',
      params: { conversationId: 'c1', assetId },
    })

    const ensured = await dispatchWorkerMessage(handlers, {
      id: 'req-docx-office-pdf-valid-ensure',
      method: 'conversationDraft.ensureDfcOptions',
      params: { conversationId: 'c1', assetId },
    })
    const pdfOption = (ensured as any).result.options.find((option: any) => option.targetKind === 'pdf_attachment')
    const convertedPdfCount = (db.prepare(`
      SELECT COUNT(*) AS count
      FROM file_derivatives
      WHERE parent_asset_id=@assetId AND derived_kind='converted_pdf'
    `).get({ assetId }) as { count: number }).count
    const generationState = db.prepare(`
      SELECT status, error_code AS errorCode
      FROM dfc_option_generation_states
      WHERE asset_id=@assetId AND target_kind='pdf_attachment'
      LIMIT 1
    `).get({ assetId }) as { status: string; errorCode: string | null }

    expect(pdfOption).toMatchObject({
      targetKind: 'pdf_attachment',
      sendStrategy: 'file_attachment',
      status: 'blocked',
      isAvailable: false,
      compatibilityStatus: 'blocked',
      sendAssetRefs: [],
      diagnostics: [expect.objectContaining({
        code: 'conversion_engine_unhealthy',
        productCode: 'conversion_engine_unhealthy',
        internalCode: 'office_pdf_runtime_manifest_invalid',
        runtimeStatus: 'unhealthy',
        productionApproved: false,
        ownerGated: true,
        fallbackTargetKinds: ['markdown', 'original_file'],
      })],
    })
    expect(generationState).toMatchObject({
      status: 'blocked',
      errorCode: 'conversion_engine_unhealthy',
    })
    expect(convertedPdfCount).toBe(0)
    expect(JSON.stringify((ensured as any).result)).not.toContain(runtimeRoot)
    expect(JSON.stringify((ensured as any).result)).not.toContain('soffice')
  })

  it('wires DOCX pdf_attachment generation through the LibreOffice fake process seam', async () => {
    const pdfBytes = Buffer.from('%PDF-1.7\n1 0 obj\n<<>>\nendobj\n%%EOF\n', 'utf8')
    const { db, handlers } = createWorkerHarness({
      officePdfProcessRunner: createFakeOfficePdfSuccessRunner(pdfBytes),
    })
    const storageRootDir = path.resolve(process.cwd(), '.tmp-file-pipeline-worker-tests')
    const runtimeRoot = getDfcLibreOfficeManagedRuntimeRoot(storageRootDir)
    await writeLibreOfficeRuntimeFixture(runtimeRoot)
    const assetId = 'asset-docx-office-pdf-fake-success'
    const storageUri = 'assets/original/do/asset-docx-office-pdf-fake-success.docx'
    const docxBytes = createMinimalDocxBuffer()
    await mkdir(path.dirname(path.join(storageRootDir, ...storageUri.split('/'))), { recursive: true })
    await writeFile(path.join(storageRootDir, ...storageUri.split('/')), docxBytes)
    await dispatchWorkerMessage(handlers, {
      id: 'req-docx-office-pdf-fake-success-asset',
      method: 'fileAsset.create',
      params: {
        id: assetId,
        sha256: 'asset-docx-office-pdf-fake-success-source-hash',
        filename: 'office-pdf-fake-success.docx',
        extension: 'docx',
        mime: 'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
        sizeBytes: docxBytes.byteLength,
        assetKind: 'document',
        sourceKind: 'local_upload',
        storageUri,
        ingestStatus: 'stored',
      },
    })
    await dispatchWorkerMessage(handlers, {
      id: 'req-docx-office-pdf-fake-success-draft-add',
      method: 'conversationDraft.addAttachment',
      params: { conversationId: 'c1', assetId },
    })

    const ensured = await dispatchWorkerMessage(handlers, {
      id: 'req-docx-office-pdf-fake-success-ensure',
      method: 'conversationDraft.ensureDfcOptions',
      params: { conversationId: 'c1', assetId },
    })
    const pdfOption = (ensured as any).result.options.find((option: any) => option.targetKind === 'pdf_attachment')
    const markdownOption = (ensured as any).result.options.find((option: any) => option.targetKind === 'markdown')
    const originalOption = (ensured as any).result.options.find((option: any) => option.targetKind === 'original_file')
    const derivativeId = pdfOption.sendAssetRefs[0].assetId
    const derivativeRow = db.prepare(`
      SELECT derived_kind AS derivedKind, mime, storage_uri AS storageUri, meta_json AS metaJson
      FROM file_derivatives
      WHERE id=@derivativeId
      LIMIT 1
    `).get({ derivativeId }) as { derivedKind: string; mime: string | null; storageUri: string; metaJson: string | null }
    const derivativeMeta = JSON.parse(derivativeRow.metaJson ?? '{}')
    const pdfFileBytes = await readFile(path.join(storageRootDir, ...derivativeRow.storageUri.split('/')))

    expect(originalOption).toMatchObject({
      targetKind: 'original_file',
      status: 'ready',
      sendAssetRefs: [{ kind: 'raw_file', assetId }],
    })
    expect(markdownOption).toMatchObject({ targetKind: 'markdown', status: 'ready' })
    expect(pdfOption).toMatchObject({
      targetKind: 'pdf_attachment',
      status: 'ready',
      isAvailable: true,
      compatibilityStatus: 'compatible',
      sendStrategy: 'file_attachment',
      sendAssetRefs: [{ kind: 'derived_asset', assetId: derivativeId }],
    })
    expect(derivativeRow).toMatchObject({
      derivedKind: 'converted_pdf',
      mime: 'application/pdf',
    })
    expect(derivativeMeta).toMatchObject({
      targetKind: 'pdf_attachment',
      usage: 'preview_and_send',
      storageClass: 'draft_bound',
      sourceHash: 'asset-docx-office-pdf-fake-success-source-hash',
      converterName: 'starverse-libreoffice-docx-pdf',
      converterVersion: 'skeleton-1',
      conversionMode: 'plugin_managed_runtime',
      runtimeSource: 'fake_seam',
      runtimeVersion: '24.8.0',
      runtimePackageVersion: '2026.06.01',
    })
    expect(derivativeMeta.contentHash).toBe(createHash('sha256').update(pdfBytes).digest('hex'))
    expect(Buffer.from(pdfFileBytes).subarray(0, 5).toString('ascii')).toBe('%PDF-')

    const selected = await dispatchWorkerMessage(handlers, {
      id: 'req-docx-office-pdf-fake-success-select',
      method: 'conversationDraft.updateAttachmentSettings',
      params: {
        conversationId: 'c1',
        assetId,
        dfcManaged: true,
        selectedOptionId: pdfOption.optionId,
        selectedAssetRefs: pdfOption.sendAssetRefs,
      },
    })
    const preview = await dispatchWorkerMessage(handlers, {
      id: 'req-docx-office-pdf-fake-success-preview',
      method: 'conversationDraft.getDfcPreview',
      params: { conversationId: 'c1', assetId, maxCharacters: 256 },
    })
    const sendPlan = await dispatchWorkerMessage(handlers, {
      id: 'req-docx-office-pdf-fake-success-send-plan',
      method: 'sendPlan.buildCurrent',
      params: {
        conversationId: 'c1',
        draftText: 'send office pdf',
        model: {
          providerKey: 'openrouter',
          modelId: 'test/pdf',
          modelKey: 'openrouter::test/pdf',
          inputModalities: ['text', 'file'],
          outputModalities: ['text'],
        },
        providerContext: {
          providerKey: 'openrouter',
          supportsInlineData: true,
          supportsPdfInputs: true,
          supportsPdfUrlRef: true,
          supportsTextUrlRef: true,
        },
      },
    })

    expect(selected).toMatchObject({ ok: true })
    expect(preview).toMatchObject({
      ok: true,
      result: {
        selectedOptionId: pdfOption.optionId,
        selectedAssetRefs: pdfOption.sendAssetRefs,
        targetKind: 'pdf_attachment',
        sendStrategy: 'file_attachment',
        decision: expect.objectContaining({
          status: 'ready',
          sendAssetRefs: pdfOption.sendAssetRefs,
        }),
        preview: expect.objectContaining({
          kind: 'raw_file',
          status: 'ready',
          text: null,
          diagnostics: [expect.objectContaining({ code: 'dfc_preview_pdf_metadata_only' })],
        }),
      },
    })
    expect(sendPlan).toMatchObject({
      ok: true,
      result: {
        sendPlan: expect.objectContaining({
          attachmentPlans: [
            expect.objectContaining({
              assetId,
              sendAssetRefs: pdfOption.sendAssetRefs,
              semantic: expect.objectContaining({
                targetKind: 'pdf_attachment',
                sendStrategy: 'file_attachment',
                mappedFromLegacy: false,
              }),
            }),
          ],
        }),
      },
    })
    const ensuredJson = JSON.stringify((ensured as any).result)
    const previewJson = JSON.stringify((preview as any).result)
    const sendPlanJson = JSON.stringify((sendPlan as any).result)
    expect(ensuredJson).not.toContain(storageUri)
    expect(ensuredJson).not.toContain(runtimeRoot)
    expect(ensuredJson).not.toContain('soffice')
    expect(previewJson).not.toContain(storageUri)
    expect(previewJson).not.toContain(derivativeRow.storageUri)
    expect(previewJson).not.toContain('asset-docx-office-pdf-fake-success-source-hash')
    expect(previewJson).not.toContain('%PDF-')
    expect(sendPlanJson).not.toContain(derivativeRow.storageUri)
    expect(sendPlanJson).not.toContain('%PDF-')
  })

  it('blocks DOCX pdf_attachment before process launch when the LibreOffice path policy is exceeded', async () => {
    let processLaunches = 0
    const { db, handlers } = createWorkerHarness({
      storageRootDir: path.join(os.tmpdir(), 'm36lo-worker-storage', 'r'.repeat(90)),
      officePdfProcessRunner: async () => {
        processLaunches += 1
        return {
          exitCode: 0,
          signal: null,
          stdout: '',
          stderr: '',
          timedOut: false,
          outputLimited: false,
          terminationAttempted: false,
          terminated: true,
          errorCode: null,
          elapsedMs: 10,
        }
      },
    })
    const storageRootDir = path.join(os.tmpdir(), 'm36lo-worker-storage', 'r'.repeat(90))
    const runtimeRoot = getDfcLibreOfficeManagedRuntimeRoot(storageRootDir)
    await writeLibreOfficeRuntimeFixture(runtimeRoot, {
      officialRelease: {
        sourceKind: 'official',
        packageRef: 'fixtures/libreoffice-official-test.zip',
        releaseTag: 'test-libreoffice-official-fixture',
        provenance: 'starverse-test-fixture',
      },
    })
    const assetId = 'asset-docx-office-pdf-path-policy'
    const storageUri = 'assets/original/do/asset-docx-office-pdf-path-policy.docx'
    const docxBytes = createMinimalDocxBuffer()
    await mkdir(path.dirname(path.join(storageRootDir, ...storageUri.split('/'))), { recursive: true })
    await writeFile(path.join(storageRootDir, ...storageUri.split('/')), docxBytes)
    await dispatchWorkerMessage(handlers, {
      id: 'req-docx-office-pdf-path-policy-asset',
      method: 'fileAsset.create',
      params: {
        id: assetId,
        sha256: 'asset-docx-office-pdf-path-policy-source-hash',
        filename: 'office-pdf-path-policy.docx',
        extension: 'docx',
        mime: 'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
        sizeBytes: docxBytes.byteLength,
        assetKind: 'document',
        sourceKind: 'local_upload',
        storageUri,
        ingestStatus: 'stored',
      },
    })
    await dispatchWorkerMessage(handlers, {
      id: 'req-docx-office-pdf-path-policy-draft-add',
      method: 'conversationDraft.addAttachment',
      params: { conversationId: 'c1', assetId },
    })

    const ensured = await dispatchWorkerMessage(handlers, {
      id: 'req-docx-office-pdf-path-policy-ensure',
      method: 'conversationDraft.ensureDfcOptions',
      params: { conversationId: 'c1', assetId },
    })
    const pdfOption = (ensured as any).result.options.find((option: any) => option.targetKind === 'pdf_attachment')
    const readyPdfCount = (db.prepare(`
      SELECT COUNT(*) AS count
      FROM file_derivatives
      WHERE parent_asset_id=@assetId AND derived_kind='converted_pdf' AND status='ready'
    `).get({ assetId }) as { count: number }).count
    const generationState = db.prepare(`
      SELECT status, error_code AS errorCode
      FROM dfc_option_generation_states
      WHERE asset_id=@assetId AND target_kind='pdf_attachment'
      LIMIT 1
    `).get({ assetId }) as { status: string; errorCode: string | null }

    expect(processLaunches).toBe(0)
    expect(pdfOption).toMatchObject({
      targetKind: 'pdf_attachment',
      sendStrategy: 'file_attachment',
      status: 'blocked',
      isAvailable: false,
      compatibilityStatus: 'blocked',
      sendAssetRefs: [],
      diagnostics: [expect.objectContaining({
        code: 'conversion_sandbox_denied',
        productCode: 'conversion_sandbox_denied',
        internalCode: 'office_pdf_runtime_quarantined',
        runtimeStatus: 'blocked',
        productionApproved: false,
        ownerGated: true,
        experimental: true,
        fallbackTargetKinds: ['markdown', 'original_file'],
      })],
    })
    expect(generationState).toMatchObject({
      status: 'blocked',
      errorCode: 'conversion_sandbox_denied',
    })
    expect(readyPdfCount).toBe(0)
    const ensuredJson = JSON.stringify((ensured as any).result)
    expect(ensuredJson).not.toContain(storageUri)
    expect(ensuredJson).not.toContain(runtimeRoot)
    expect(ensuredJson).not.toContain('soffice')
    expect(ensuredJson).not.toContain(DFC_LIBREOFFICE_PDF_PATH_POLICY_EXCEEDED)
  })

  it('fails closed for DOCX pdf_attachment fake process failure without exposing process diagnostics', async () => {
    const { db, handlers } = createWorkerHarness({
      officePdfProcessRunner: createFakeOfficePdfFailureRunner(),
    })
    const storageRootDir = path.resolve(process.cwd(), '.tmp-file-pipeline-worker-tests')
    const runtimeRoot = getDfcLibreOfficeManagedRuntimeRoot(storageRootDir)
    await writeLibreOfficeRuntimeFixture(runtimeRoot)
    const assetId = 'asset-docx-office-pdf-fake-failure'
    const storageUri = 'assets/original/do/asset-docx-office-pdf-fake-failure.docx'
    const docxBytes = createMinimalDocxBuffer()
    await mkdir(path.dirname(path.join(storageRootDir, ...storageUri.split('/'))), { recursive: true })
    await writeFile(path.join(storageRootDir, ...storageUri.split('/')), docxBytes)
    await dispatchWorkerMessage(handlers, {
      id: 'req-docx-office-pdf-fake-failure-asset',
      method: 'fileAsset.create',
      params: {
        id: assetId,
        sha256: 'asset-docx-office-pdf-fake-failure-source-hash',
        filename: 'office-pdf-fake-failure.docx',
        extension: 'docx',
        mime: 'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
        sizeBytes: docxBytes.byteLength,
        assetKind: 'document',
        sourceKind: 'local_upload',
        storageUri,
        ingestStatus: 'stored',
      },
    })
    await dispatchWorkerMessage(handlers, {
      id: 'req-docx-office-pdf-fake-failure-draft-add',
      method: 'conversationDraft.addAttachment',
      params: { conversationId: 'c1', assetId },
    })

    const ensured = await dispatchWorkerMessage(handlers, {
      id: 'req-docx-office-pdf-fake-failure-ensure',
      method: 'conversationDraft.ensureDfcOptions',
      params: { conversationId: 'c1', assetId },
    })
    const pdfOption = (ensured as any).result.options.find((option: any) => option.targetKind === 'pdf_attachment')
    const readyPdfCount = (db.prepare(`
      SELECT COUNT(*) AS count
      FROM file_derivatives
      WHERE parent_asset_id=@assetId AND derived_kind='converted_pdf' AND status='ready'
    `).get({ assetId }) as { count: number }).count
    const generationState = db.prepare(`
      SELECT status, error_code AS errorCode
      FROM dfc_option_generation_states
      WHERE asset_id=@assetId AND target_kind='pdf_attachment'
      LIMIT 1
    `).get({ assetId }) as { status: string; errorCode: string | null }

    expect(pdfOption).toMatchObject({
      targetKind: 'pdf_attachment',
      sendStrategy: 'file_attachment',
      status: 'failed',
      isAvailable: false,
      compatibilityStatus: 'blocked',
      sendAssetRefs: [],
      diagnostics: [expect.objectContaining({ code: 'conversion_engine_failed' })],
    })
    expect(generationState).toMatchObject({
      status: 'failed',
      errorCode: 'conversion_engine_failed',
    })
    expect(readyPdfCount).toBe(0)
    const ensuredJson = JSON.stringify((ensured as any).result)
    expect(ensuredJson).not.toContain(storageUri)
    expect(ensuredJson).not.toContain(runtimeRoot)
    expect(ensuredJson).not.toContain('C:\\Users\\private')
    expect(ensuredJson).not.toContain('secret')
    expect(ensuredJson).not.toContain('file body')

    const selected = await dispatchWorkerMessage(handlers, {
      id: 'req-docx-office-pdf-fake-failure-select',
      method: 'conversationDraft.updateAttachmentSettings',
      params: {
        conversationId: 'c1',
        assetId,
        dfcManaged: true,
        selectedOptionId: pdfOption.optionId,
        selectedAssetRefs: pdfOption.sendAssetRefs,
      },
    })
    expect(selected).toMatchObject({ ok: false })
  })

  it.each([
    ['timeout', 'conversion_engine_timeout'],
    ['missing_output', 'conversion_engine_failed'],
    ['invalid_pdf', 'conversion_engine_failed'],
    ['ambiguous_pdf', 'conversion_engine_failed'],
  ] as const)('fails closed for DOCX pdf_attachment fake process %s without ready selection', async (mode, expectedErrorCode) => {
    const { db, handlers } = createWorkerHarness({
      officePdfProcessRunner: createFakeOfficePdfModeRunner(mode),
    })
    const storageRootDir = path.resolve(process.cwd(), '.tmp-file-pipeline-worker-tests')
    const runtimeRoot = getDfcLibreOfficeManagedRuntimeRoot(storageRootDir)
    await writeLibreOfficeRuntimeFixture(runtimeRoot)
    const assetId = `asset-docx-office-pdf-fake-${mode.replace(/_/g, '-')}`
    const storageUri = `assets/original/do/${assetId}.docx`
    const docxBytes = createMinimalDocxBuffer()
    await mkdir(path.dirname(path.join(storageRootDir, ...storageUri.split('/'))), { recursive: true })
    await writeFile(path.join(storageRootDir, ...storageUri.split('/')), docxBytes)
    await dispatchWorkerMessage(handlers, {
      id: `req-${assetId}-asset`,
      method: 'fileAsset.create',
      params: {
        id: assetId,
        sha256: `${assetId}-source-hash`,
        filename: `${assetId}.docx`,
        extension: 'docx',
        mime: 'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
        sizeBytes: docxBytes.byteLength,
        assetKind: 'document',
        sourceKind: 'local_upload',
        storageUri,
        ingestStatus: 'stored',
      },
    })
    await dispatchWorkerMessage(handlers, {
      id: `req-${assetId}-draft-add`,
      method: 'conversationDraft.addAttachment',
      params: { conversationId: 'c1', assetId },
    })

    const ensured = await dispatchWorkerMessage(handlers, {
      id: `req-${assetId}-ensure`,
      method: 'conversationDraft.ensureDfcOptions',
      params: { conversationId: 'c1', assetId },
    })
    const pdfOption = (ensured as any).result.options.find((option: any) => option.targetKind === 'pdf_attachment')
    const readyPdfCount = (db.prepare(`
      SELECT COUNT(*) AS count
      FROM file_derivatives
      WHERE parent_asset_id=@assetId AND derived_kind='converted_pdf' AND status='ready'
    `).get({ assetId }) as { count: number }).count
    const generationState = db.prepare(`
      SELECT status, error_code AS errorCode
      FROM dfc_option_generation_states
      WHERE asset_id=@assetId AND target_kind='pdf_attachment'
      LIMIT 1
    `).get({ assetId }) as { status: string; errorCode: string | null }

    expect(pdfOption).toMatchObject({
      targetKind: 'pdf_attachment',
      sendStrategy: 'file_attachment',
      status: 'failed',
      isAvailable: false,
      compatibilityStatus: 'blocked',
      sendAssetRefs: [],
      diagnostics: [expect.objectContaining({ code: expectedErrorCode })],
    })
    expect(generationState).toMatchObject({
      status: 'failed',
      errorCode: expectedErrorCode,
    })
    expect(readyPdfCount).toBe(0)
    const selected = await dispatchWorkerMessage(handlers, {
      id: `req-${assetId}-select`,
      method: 'conversationDraft.updateAttachmentSettings',
      params: {
        conversationId: 'c1',
        assetId,
        dfcManaged: true,
        selectedOptionId: pdfOption.optionId,
        selectedAssetRefs: pdfOption.sendAssetRefs,
      },
    })
    const ensuredJson = JSON.stringify((ensured as any).result)
    expect(selected).toMatchObject({ ok: false })
    expect(ensuredJson).not.toContain(storageUri)
    expect(ensuredJson).not.toContain(runtimeRoot)
    expect(ensuredJson).not.toContain('C:\\Users\\private')
    expect(ensuredJson).not.toContain('token=secret')
    expect(ensuredJson).not.toContain('file body')
    expect(ensuredJson).not.toContain('not a pdf body')
    expect(ensuredJson).not.toContain('%PDF-')
  })

  itRealLibreOfficeSmoke('runs real managed LibreOffice through DFC DOCX pdf_attachment generation', async () => {
    const runtimeRoot = String(process.env.STARVERSE_DFC_LIBREOFFICE_RUNTIME_ROOT ?? '').trim()
    expect(runtimeRoot).toBeTruthy()
    const storageRootDir = path.resolve(runtimeRoot, '..', '..', '..')
    const { db, handlers } = createWorkerHarness({
      officePdfProcessRunner: runExternalProcess,
      storageRootDir,
    })
    const assetId = 'asset-docx-office-pdf-real-managed-smoke'
    const storageUri = 'assets/original/do/asset-docx-office-pdf-real-managed-smoke.docx'
    const docxBytes = createMinimalOfficePdfDocxBuffer()
    await mkdir(path.dirname(path.join(storageRootDir, ...storageUri.split('/'))), { recursive: true })
    await writeFile(path.join(storageRootDir, ...storageUri.split('/')), docxBytes)
    await dispatchWorkerMessage(handlers, {
      id: 'req-docx-office-pdf-real-managed-smoke-asset',
      method: 'fileAsset.create',
      params: {
        id: assetId,
        sha256: createHash('sha256').update(docxBytes).digest('hex'),
        filename: 'office-pdf-real-managed-smoke.docx',
        extension: 'docx',
        mime: 'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
        sizeBytes: docxBytes.byteLength,
        assetKind: 'document',
        sourceKind: 'local_upload',
        storageUri,
        ingestStatus: 'stored',
      },
    })
    await dispatchWorkerMessage(handlers, {
      id: 'req-docx-office-pdf-real-managed-smoke-draft-add',
      method: 'conversationDraft.addAttachment',
      params: { conversationId: 'c1', assetId },
    })

    const ensured = await dispatchWorkerMessage(handlers, {
      id: 'req-docx-office-pdf-real-managed-smoke-ensure',
      method: 'conversationDraft.ensureDfcOptions',
      params: { conversationId: 'c1', assetId },
    })
    const pdfOption = (ensured as any).result.options.find((option: any) => option.targetKind === 'pdf_attachment')
    const generationState = db.prepare(`
      SELECT status, error_code AS errorCode, derivative_job_id AS derivativeJobId
      FROM dfc_option_generation_states
      WHERE asset_id=@assetId AND target_kind='pdf_attachment'
      LIMIT 1
    `).get({ assetId }) as { status: string; errorCode: string | null; derivativeJobId: string | null } | undefined
    const jobState = generationState?.derivativeJobId
      ? db.prepare(`
        SELECT status, error_code AS errorCode, error_message AS errorMessage, output_derivative_id AS outputDerivativeId
        FROM derivative_jobs
        WHERE id=@derivativeJobId
        LIMIT 1
      `).get({ derivativeJobId: generationState.derivativeJobId }) as { status: string; errorCode: string | null; errorMessage: string | null; outputDerivativeId: string | null } | undefined
      : undefined
    expect({
      optionStatus: pdfOption?.status,
      refCount: pdfOption?.sendAssetRefs?.length ?? 0,
      generationStatus: generationState?.status,
      generationErrorCode: generationState?.errorCode,
      jobStatus: jobState?.status,
      jobErrorCode: jobState?.errorCode,
      jobErrorMessage: jobState?.errorMessage,
      hasJobOutput: Boolean(jobState?.outputDerivativeId),
    }).toMatchObject({
      optionStatus: 'ready',
      refCount: 1,
      generationStatus: 'ready',
      generationErrorCode: null,
      jobStatus: 'ready',
      jobErrorCode: null,
      jobErrorMessage: null,
      hasJobOutput: true,
    })
    const derivativeId = pdfOption.sendAssetRefs[0].assetId
    const derivativeRow = db.prepare(`
      SELECT derived_kind AS derivedKind, mime, storage_uri AS storageUri, meta_json AS metaJson
      FROM file_derivatives
      WHERE id=@derivativeId
      LIMIT 1
    `).get({ derivativeId }) as { derivedKind: string; mime: string | null; storageUri: string; metaJson: string | null }
    const derivativeMeta = JSON.parse(derivativeRow.metaJson ?? '{}')

    expect(pdfOption).toMatchObject({
      targetKind: 'pdf_attachment',
      status: 'ready',
      sendStrategy: 'file_attachment',
      sendAssetRefs: [{ kind: 'derived_asset', assetId: derivativeId }],
    })
    expect(derivativeRow).toMatchObject({
      derivedKind: 'converted_pdf',
      mime: 'application/pdf',
    })
    expect(derivativeMeta).toMatchObject({
      targetKind: 'pdf_attachment',
      usage: 'preview_and_send',
      storageClass: 'draft_bound',
      converterName: 'starverse-libreoffice-docx-pdf',
      converterVersion: 'skeleton-1',
      conversionMode: 'plugin_managed_runtime',
    })

    const selected = await dispatchWorkerMessage(handlers, {
      id: 'req-docx-office-pdf-real-managed-smoke-select',
      method: 'conversationDraft.updateAttachmentSettings',
      params: {
        conversationId: 'c1',
        assetId,
        dfcManaged: true,
        selectedOptionId: pdfOption.optionId,
        selectedAssetRefs: pdfOption.sendAssetRefs,
      },
    })
    const preview = await dispatchWorkerMessage(handlers, {
      id: 'req-docx-office-pdf-real-managed-smoke-preview',
      method: 'conversationDraft.getDfcPreview',
      params: { conversationId: 'c1', assetId, maxCharacters: 256 },
    })
    const sendPlan = await dispatchWorkerMessage(handlers, {
      id: 'req-docx-office-pdf-real-managed-smoke-send-plan',
      method: 'sendPlan.buildCurrent',
      params: {
        conversationId: 'c1',
        draftText: 'send real office pdf smoke',
        model: {
          providerKey: 'openrouter',
          modelId: 'test/pdf',
          modelKey: 'openrouter::test/pdf',
          inputModalities: ['text', 'file'],
          outputModalities: ['text'],
        },
        providerContext: {
          providerKey: 'openrouter',
          supportsInlineData: true,
          supportsPdfInputs: true,
          supportsPdfUrlRef: true,
          supportsTextUrlRef: true,
        },
      },
    })

    expect(selected).toMatchObject({ ok: true })
    expect(preview).toMatchObject({
      ok: true,
      result: {
        selectedOptionId: pdfOption.optionId,
        selectedAssetRefs: pdfOption.sendAssetRefs,
        targetKind: 'pdf_attachment',
        sendStrategy: 'file_attachment',
        preview: expect.objectContaining({
          kind: 'raw_file',
          status: 'ready',
          text: null,
          diagnostics: [expect.objectContaining({ code: 'dfc_preview_pdf_metadata_only' })],
        }),
      },
    })
    expect(sendPlan).toMatchObject({
      ok: true,
      result: {
        sendPlan: expect.objectContaining({
          attachmentPlans: [
            expect.objectContaining({
              assetId,
              sendAssetRefs: pdfOption.sendAssetRefs,
              semantic: expect.objectContaining({
                targetKind: 'pdf_attachment',
                sendStrategy: 'file_attachment',
              }),
            }),
          ],
        }),
      },
    })
    const previewJson = JSON.stringify((preview as any).result)
    const sendPlanJson = JSON.stringify((sendPlan as any).result)
    expect(previewJson).not.toContain(storageUri)
    expect(previewJson).not.toContain(runtimeRoot)
    expect(previewJson).not.toContain(derivativeRow.storageUri)
    expect(previewJson).not.toContain('%PDF-')
    expect(sendPlanJson).not.toContain(derivativeRow.storageUri)
    expect(sendPlanJson).not.toContain('%PDF-')
  }, 180_000)

  it.each([
    ['doc', 'application/msword'],
    ['rtf', 'application/rtf'],
    ['docm', 'application/vnd.ms-word.document.macroenabled.12'],
  ] as const)('does not expose Office PDF candidate for unsupported .%s assets', async (extension, mime) => {
    const { db, handlers } = createWorkerHarness()
    const storageRootDir = path.resolve(process.cwd(), '.tmp-file-pipeline-worker-tests')
    const assetId = `asset-office-pdf-unsupported-${extension}`
    const storageUri = `assets/original/of/${assetId}.${extension}`
    const bytes = Buffer.from(`unsupported ${extension} body`)
    await mkdir(path.dirname(path.join(storageRootDir, ...storageUri.split('/'))), { recursive: true })
    await writeFile(path.join(storageRootDir, ...storageUri.split('/')), bytes)
    await dispatchWorkerMessage(handlers, {
      id: `req-office-pdf-unsupported-${extension}-asset`,
      method: 'fileAsset.create',
      params: {
        id: assetId,
        sha256: `asset-office-pdf-unsupported-${extension}-source-hash`,
        filename: `unsupported.${extension}`,
        extension,
        mime,
        sizeBytes: bytes.byteLength,
        assetKind: 'document',
        sourceKind: 'local_upload',
        storageUri,
        ingestStatus: 'stored',
      },
    })
    await dispatchWorkerMessage(handlers, {
      id: `req-office-pdf-unsupported-${extension}-draft-add`,
      method: 'conversationDraft.addAttachment',
      params: { conversationId: 'c1', assetId },
    })

    const ensured = await dispatchWorkerMessage(handlers, {
      id: `req-office-pdf-unsupported-${extension}-ensure`,
      method: 'conversationDraft.ensureDfcOptions',
      params: { conversationId: 'c1', assetId },
    })
    const options = (ensured as any).result.options as any[]
    const generationStateCount = (db.prepare(`
      SELECT COUNT(*) AS count
      FROM dfc_option_generation_states
      WHERE asset_id=@assetId AND target_kind='pdf_attachment'
    `).get({ assetId }) as { count: number }).count

    expect(options.some((option) => option.targetKind === 'pdf_attachment')).toBe(false)
    expect(options.some((option) => option.targetKind === 'markdown')).toBe(false)
    expect(options.find((option) => option.targetKind === 'original_file')).toMatchObject({
      targetKind: 'original_file',
      status: 'ready',
    })
    expect(generationStateCount).toBe(0)
  })

  it('fails closed for malformed DOCX documents without legacy fallback', async () => {
    const { db, handlers } = createWorkerHarness()
    const storageRootDir = path.resolve(process.cwd(), '.tmp-file-pipeline-worker-tests')
    const assetId = 'asset-docx-malformed-dfc'
    const storageUri = 'assets/original/do/asset-docx-malformed-dfc.docx'
    const docxBytes = Buffer.from('not a valid docx package')
    await mkdir(path.dirname(path.join(storageRootDir, ...storageUri.split('/'))), { recursive: true })
    await writeFile(path.join(storageRootDir, ...storageUri.split('/')), docxBytes)
    await dispatchWorkerMessage(handlers, {
      id: 'req-docx-malformed-asset',
      method: 'fileAsset.create',
      params: {
        id: assetId,
        sha256: 'asset-docx-malformed-source-hash',
        filename: 'malformed.docx',
        extension: 'docx',
        mime: 'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
        sizeBytes: docxBytes.byteLength,
        assetKind: 'document',
        sourceKind: 'local_upload',
        storageUri,
        ingestStatus: 'stored',
      },
    })
    await dispatchWorkerMessage(handlers, {
      id: 'req-docx-malformed-draft-add',
      method: 'conversationDraft.addAttachment',
      params: { conversationId: 'c1', assetId },
    })

    const ensured = await dispatchWorkerMessage(handlers, {
      id: 'req-docx-malformed-ensure',
      method: 'conversationDraft.ensureDfcOptions',
      params: { conversationId: 'c1', assetId },
    })
    const failedOption = (ensured as any).result.options.find((option: any) => option.targetKind === 'markdown')
    const derivativeCount = db.prepare(`
      SELECT COUNT(*) AS count
      FROM file_derivatives
      WHERE parent_asset_id=@assetId
    `).get({ assetId }) as { count: number }

    expect(failedOption).toMatchObject({
      optionId: `dfc:${assetId}:markdown:failed`,
      status: 'failed',
      isAvailable: false,
      compatibilityStatus: 'blocked',
      sendAssetRefs: [],
      diagnostics: [expect.objectContaining({ code: 'derivative_input_missing' })],
    })
    expect(derivativeCount.count).toBe(0)
    expect(JSON.stringify((ensured as any).result)).not.toContain(storageUri)
    expect(JSON.stringify((ensured as any).result)).not.toContain('asset-docx-malformed-source-hash')
    expect(JSON.stringify((ensured as any).result)).not.toContain('not a valid docx package')
  })

  it('omits DOCX embedded media bytes and storage details from derived markdown and DTOs', async () => {
    const { db, handlers } = createWorkerHarness()
    const storageRootDir = path.resolve(process.cwd(), '.tmp-file-pipeline-worker-tests')
    const assetId = 'asset-docx-image-dfc'
    const storageUri = 'assets/original/do/asset-docx-image-dfc.docx'
    const docxBytes = createDocxWithImageBuffer()
    await mkdir(path.dirname(path.join(storageRootDir, ...storageUri.split('/'))), { recursive: true })
    await writeFile(path.join(storageRootDir, ...storageUri.split('/')), docxBytes)
    await dispatchWorkerMessage(handlers, {
      id: 'req-docx-image-asset',
      method: 'fileAsset.create',
      params: {
        id: assetId,
        sha256: 'asset-docx-image-source-hash',
        filename: 'image.docx',
        extension: 'docx',
        mime: 'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
        sizeBytes: docxBytes.byteLength,
        assetKind: 'document',
        sourceKind: 'local_upload',
        storageUri,
        ingestStatus: 'stored',
      },
    })
    await dispatchWorkerMessage(handlers, {
      id: 'req-docx-image-draft-add',
      method: 'conversationDraft.addAttachment',
      params: { conversationId: 'c1', assetId },
    })

    const ensured = await dispatchWorkerMessage(handlers, {
      id: 'req-docx-image-ensure',
      method: 'conversationDraft.ensureDfcOptions',
      params: { conversationId: 'c1', assetId },
    })
    const markdownOption = (ensured as any).result.options.find((option: any) => option.targetKind === 'markdown')
    const derivativeRow = db.prepare(`
      SELECT storage_uri AS storageUri, meta_json AS metaJson
      FROM file_derivatives
      WHERE parent_asset_id=@assetId AND derived_kind='extracted_text'
      LIMIT 1
    `).get({ assetId }) as { storageUri: string; metaJson: string | null } | undefined
    const converted = await readFile(path.join(storageRootDir, ...String(derivativeRow?.storageUri ?? '').split('/')), 'utf8')
    const derivativeMeta = derivativeRow?.metaJson ? JSON.parse(derivativeRow.metaJson) : null

    expect(markdownOption.status).toBe('ready')
    expect(converted).toContain('Paragraph before image.')
    expect(converted).toContain('Paragraph after image.')
    expect(converted).not.toContain('embedded-secret-media-bytes')
    expect(converted).not.toContain('private-token')
    expect(converted).not.toContain('word/media/image1.png')
    expect(JSON.stringify((ensured as any).result)).not.toContain(storageUri)
    expect(JSON.stringify((ensured as any).result)).not.toContain(derivativeRow?.storageUri ?? 'assets/')
    expect(JSON.stringify((ensured as any).result)).not.toContain('asset-docx-image-source-hash')
    expect(JSON.stringify((ensured as any).result)).not.toContain('embedded-secret-media-bytes')
    expect(derivativeMeta?.conversionWarnings).toEqual(expect.arrayContaining([
      'docx_external_resources_not_loaded',
      'docx_images_not_extracted',
    ]))
  })

  it('keeps legacy DOC and RTF outside the DOCX-first markdown pilot', async () => {
    const { db, handlers } = createWorkerHarness()
    for (const legacy of [
      {
        assetId: 'asset-doc-explicit-dfc',
        filename: 'legacy.doc',
        extension: 'doc',
        mime: 'application/msword',
        storageUri: 'assets/original/do/asset-doc-explicit-dfc.doc',
      },
      {
        assetId: 'asset-rtf-explicit-dfc',
        filename: 'legacy.rtf',
        extension: 'rtf',
        mime: 'application/rtf',
        storageUri: 'assets/original/rt/asset-rtf-explicit-dfc.rtf',
      },
    ]) {
      await dispatchWorkerMessage(handlers, {
        id: `req-${legacy.extension}-explicit-asset`,
        method: 'fileAsset.create',
        params: {
          id: legacy.assetId,
          sha256: `asset-${legacy.extension}-explicit-source-hash`,
          filename: legacy.filename,
          extension: legacy.extension,
          mime: legacy.mime,
          sizeBytes: 32,
          assetKind: 'document',
          sourceKind: 'local_upload',
          storageUri: legacy.storageUri,
          ingestStatus: 'stored',
        },
      })
      await dispatchWorkerMessage(handlers, {
        id: `req-${legacy.extension}-explicit-draft-add`,
        method: 'conversationDraft.addAttachment',
        params: { conversationId: 'c1', assetId: legacy.assetId },
      })

      const ensured = await dispatchWorkerMessage(handlers, {
        id: `req-${legacy.extension}-explicit-ensure`,
        method: 'conversationDraft.ensureDfcOptions',
        params: { conversationId: 'c1', assetId: legacy.assetId },
      })
      const markdownOption = (ensured as any).result.options.find((option: any) => option.targetKind === 'markdown')
      const derivativeCount = db.prepare(`
        SELECT COUNT(*) AS count
        FROM file_derivatives
        WHERE parent_asset_id=@assetId
      `).get({ assetId: legacy.assetId }) as { count: number }

      expect(markdownOption).toBeUndefined()
      expect(derivativeCount.count).toBe(0)
      expect(JSON.stringify((ensured as any).result)).not.toContain(legacy.storageUri)
      expect(JSON.stringify((ensured as any).result)).not.toContain(`asset-${legacy.extension}-explicit-source-hash`)
    }
  })

  it('escapes XLSX sheet names and cell text in table_markdown output', async () => {
    const { db, handlers } = createWorkerHarness()
    const storageRootDir = path.resolve(process.cwd(), '.tmp-file-pipeline-worker-tests')
    const assetId = 'asset-xlsx-escaping-dfc'
    const storageUri = 'assets/original/xl/asset-xlsx-escaping-dfc.xlsx'
    const xlsxBytes = await createEscapingXlsxBuffer()
    await mkdir(path.dirname(path.join(storageRootDir, ...storageUri.split('/'))), { recursive: true })
    await writeFile(path.join(storageRootDir, ...storageUri.split('/')), xlsxBytes)
    await dispatchWorkerMessage(handlers, {
      id: 'req-xlsx-escaping-asset',
      method: 'fileAsset.create',
      params: {
        id: assetId,
        sha256: 'asset-xlsx-escaping-source-hash',
        filename: 'escaping.xlsx',
        extension: 'xlsx',
        mime: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
        sizeBytes: xlsxBytes.byteLength,
        assetKind: 'document',
        sourceKind: 'local_upload',
        storageUri,
        ingestStatus: 'stored',
      },
    })
    await dispatchWorkerMessage(handlers, {
      id: 'req-xlsx-escaping-draft-add',
      method: 'conversationDraft.addAttachment',
      params: { conversationId: 'c1', assetId },
    })

    const ensured = await dispatchWorkerMessage(handlers, {
      id: 'req-xlsx-escaping-ensure',
      method: 'conversationDraft.ensureDfcOptions',
      params: { conversationId: 'c1', assetId },
    })
    const tableOption = (ensured as any).result.options.find((option: any) => option.targetKind === 'table_markdown')
    const derivativeRow = db.prepare(`
      SELECT storage_uri AS storageUri
      FROM file_derivatives
      WHERE parent_asset_id=@assetId AND derived_kind='extracted_text'
      LIMIT 1
    `).get({ assetId }) as { storageUri: string } | undefined
    const converted = await readFile(path.join(storageRootDir, ...String(derivativeRow?.storageUri ?? '').split('/')), 'utf8')

    expect(tableOption.status).toBe('ready')
    expect(converted).toContain('## \\# Sheet \\| One')
    expect(converted).toContain('| alice | uses \\| pipe<br>line 2 |')
    expect(JSON.stringify((ensured as any).result)).not.toContain(storageUri)
    expect(JSON.stringify((ensured as any).result)).not.toContain(derivativeRow?.storageUri ?? 'assets/')
    expect(JSON.stringify((ensured as any).result)).not.toContain('asset-xlsx-escaping-source-hash')
  })

  it('blocks XLSX workbooks that exceed the pilot worksheet guard', async () => {
    const { db, handlers } = createWorkerHarness()
    const storageRootDir = path.resolve(process.cwd(), '.tmp-file-pipeline-worker-tests')
    const assetId = 'asset-xlsx-too-many-sheets-dfc'
    const storageUri = 'assets/original/xl/asset-xlsx-too-many-sheets-dfc.xlsx'
    const xlsxBytes = await createManyWorksheetXlsxBuffer(21)
    await mkdir(path.dirname(path.join(storageRootDir, ...storageUri.split('/'))), { recursive: true })
    await writeFile(path.join(storageRootDir, ...storageUri.split('/')), xlsxBytes)
    await dispatchWorkerMessage(handlers, {
      id: 'req-xlsx-too-many-sheets-asset',
      method: 'fileAsset.create',
      params: {
        id: assetId,
        sha256: 'asset-xlsx-too-many-sheets-source-hash',
        filename: 'too-many-sheets.xlsx',
        extension: 'xlsx',
        mime: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
        sizeBytes: xlsxBytes.byteLength,
        assetKind: 'document',
        sourceKind: 'local_upload',
        storageUri,
        ingestStatus: 'stored',
      },
    })
    await dispatchWorkerMessage(handlers, {
      id: 'req-xlsx-too-many-sheets-draft-add',
      method: 'conversationDraft.addAttachment',
      params: { conversationId: 'c1', assetId },
    })

    const ensured = await dispatchWorkerMessage(handlers, {
      id: 'req-xlsx-too-many-sheets-ensure',
      method: 'conversationDraft.ensureDfcOptions',
      params: { conversationId: 'c1', assetId },
    })
    const tableOption = (ensured as any).result.options.find((option: any) => option.targetKind === 'table_markdown')
    const derivativeCount = db.prepare(`
      SELECT COUNT(*) AS count
      FROM file_derivatives
      WHERE parent_asset_id=@assetId
    `).get({ assetId }) as { count: number }

    expect(tableOption).toMatchObject({
      status: 'failed',
      isAvailable: false,
      compatibilityStatus: 'blocked',
      sendAssetRefs: [],
      diagnostics: [expect.objectContaining({ code: 'conversion_not_implemented' })],
    })
    expect(derivativeCount.count).toBe(0)
    expect(JSON.stringify((ensured as any).result)).not.toContain(storageUri)
    expect(JSON.stringify((ensured as any).result)).not.toContain('asset-xlsx-too-many-sheets-source-hash')
  })

  it('fails closed for malformed XLSX workbooks', async () => {
    const { db, handlers } = createWorkerHarness()
    const storageRootDir = path.resolve(process.cwd(), '.tmp-file-pipeline-worker-tests')
    const assetId = 'asset-xlsx-malformed-dfc'
    const storageUri = 'assets/original/xl/asset-xlsx-malformed-dfc.xlsx'
    const xlsxBytes = Buffer.from('not a real xlsx workbook')
    await mkdir(path.dirname(path.join(storageRootDir, ...storageUri.split('/'))), { recursive: true })
    await writeFile(path.join(storageRootDir, ...storageUri.split('/')), xlsxBytes)
    await dispatchWorkerMessage(handlers, {
      id: 'req-xlsx-malformed-asset',
      method: 'fileAsset.create',
      params: {
        id: assetId,
        sha256: 'asset-xlsx-malformed-source-hash',
        filename: 'malformed.xlsx',
        extension: 'xlsx',
        mime: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
        sizeBytes: xlsxBytes.byteLength,
        assetKind: 'document',
        sourceKind: 'local_upload',
        storageUri,
        ingestStatus: 'stored',
      },
    })
    await dispatchWorkerMessage(handlers, {
      id: 'req-xlsx-malformed-draft-add',
      method: 'conversationDraft.addAttachment',
      params: { conversationId: 'c1', assetId },
    })

    const ensured = await dispatchWorkerMessage(handlers, {
      id: 'req-xlsx-malformed-ensure',
      method: 'conversationDraft.ensureDfcOptions',
      params: { conversationId: 'c1', assetId },
    })
    const tableOption = (ensured as any).result.options.find((option: any) => option.targetKind === 'table_markdown')
    const derivativeCount = db.prepare(`
      SELECT COUNT(*) AS count
      FROM file_derivatives
      WHERE parent_asset_id=@assetId
    `).get({ assetId }) as { count: number }

    expect(tableOption).toMatchObject({
      status: 'failed',
      isAvailable: false,
      compatibilityStatus: 'blocked',
      sendAssetRefs: [],
      diagnostics: [expect.objectContaining({ code: 'derivative_input_missing' })],
    })
    expect(derivativeCount.count).toBe(0)
    expect(JSON.stringify((ensured as any).result)).not.toContain(storageUri)
    expect(JSON.stringify((ensured as any).result)).not.toContain('asset-xlsx-malformed-source-hash')
  })

  it('keeps XLSX visible worksheet output order stable and hidden sheet warnings stable', async () => {
    const { db, handlers } = createWorkerHarness()
    const storageRootDir = path.resolve(process.cwd(), '.tmp-file-pipeline-worker-tests')
    const assetId = 'asset-xlsx-ordered-sheets-dfc'
    const storageUri = 'assets/original/xl/asset-xlsx-ordered-sheets-dfc.xlsx'
    const xlsxBytes = await createOrderedWorksheetXlsxBuffer()
    await mkdir(path.dirname(path.join(storageRootDir, ...storageUri.split('/'))), { recursive: true })
    await writeFile(path.join(storageRootDir, ...storageUri.split('/')), xlsxBytes)
    await dispatchWorkerMessage(handlers, {
      id: 'req-xlsx-ordered-sheets-asset',
      method: 'fileAsset.create',
      params: {
        id: assetId,
        sha256: 'asset-xlsx-ordered-sheets-source-hash',
        filename: 'ordered-sheets.xlsx',
        extension: 'xlsx',
        mime: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
        sizeBytes: xlsxBytes.byteLength,
        assetKind: 'document',
        sourceKind: 'local_upload',
        storageUri,
        ingestStatus: 'stored',
      },
    })
    await dispatchWorkerMessage(handlers, {
      id: 'req-xlsx-ordered-sheets-draft-add',
      method: 'conversationDraft.addAttachment',
      params: { conversationId: 'c1', assetId },
    })

    const ensured = await dispatchWorkerMessage(handlers, {
      id: 'req-xlsx-ordered-sheets-ensure',
      method: 'conversationDraft.ensureDfcOptions',
      params: { conversationId: 'c1', assetId },
    })
    const tableOption = (ensured as any).result.options.find((option: any) => option.targetKind === 'table_markdown')
    const derivativeRow = db.prepare(`
      SELECT storage_uri AS storageUri, meta_json AS metaJson
      FROM file_derivatives
      WHERE parent_asset_id=@assetId AND derived_kind='extracted_text'
      LIMIT 1
    `).get({ assetId }) as { storageUri: string; metaJson: string | null } | undefined
    const converted = await readFile(path.join(storageRootDir, ...String(derivativeRow?.storageUri ?? '').split('/')), 'utf8')
    const derivativeMeta = derivativeRow?.metaJson ? JSON.parse(derivativeRow.metaJson) : null

    expect(tableOption.status).toBe('ready')
    expect(converted.indexOf('## First Visible')).toBeLessThan(converted.indexOf('## Second Visible'))
    expect(converted).not.toContain('Hidden Middle')
    expect(converted).not.toContain('hidden-secret')
    expect(derivativeMeta?.conversionWarnings).toEqual(expect.arrayContaining([
      'xlsx_hidden_sheets_skipped',
    ]))
  })

  it('emits an empty XLSX table cell and warning when formula cached value is missing', async () => {
    const { db, handlers } = createWorkerHarness()
    const storageRootDir = path.resolve(process.cwd(), '.tmp-file-pipeline-worker-tests')
    const assetId = 'asset-xlsx-formula-missing-dfc'
    const storageUri = 'assets/original/xl/asset-xlsx-formula-missing-dfc.xlsx'
    const xlsxBytes = await createFormulaMissingValueXlsxBuffer()
    await mkdir(path.dirname(path.join(storageRootDir, ...storageUri.split('/'))), { recursive: true })
    await writeFile(path.join(storageRootDir, ...storageUri.split('/')), xlsxBytes)
    await dispatchWorkerMessage(handlers, {
      id: 'req-xlsx-formula-missing-asset',
      method: 'fileAsset.create',
      params: {
        id: assetId,
        sha256: 'asset-xlsx-formula-missing-source-hash',
        filename: 'formula-missing.xlsx',
        extension: 'xlsx',
        mime: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
        sizeBytes: xlsxBytes.byteLength,
        assetKind: 'document',
        sourceKind: 'local_upload',
        storageUri,
        ingestStatus: 'stored',
      },
    })
    await dispatchWorkerMessage(handlers, {
      id: 'req-xlsx-formula-missing-draft-add',
      method: 'conversationDraft.addAttachment',
      params: { conversationId: 'c1', assetId },
    })

    const ensured = await dispatchWorkerMessage(handlers, {
      id: 'req-xlsx-formula-missing-ensure',
      method: 'conversationDraft.ensureDfcOptions',
      params: { conversationId: 'c1', assetId },
    })
    const tableOption = (ensured as any).result.options.find((option: any) => option.targetKind === 'table_markdown')
    const derivativeRow = db.prepare(`
      SELECT storage_uri AS storageUri, meta_json AS metaJson
      FROM file_derivatives
      WHERE parent_asset_id=@assetId AND derived_kind='extracted_text'
      LIMIT 1
    `).get({ assetId }) as { storageUri: string; metaJson: string | null } | undefined
    const converted = await readFile(path.join(storageRootDir, ...String(derivativeRow?.storageUri ?? '').split('/')), 'utf8')
    const derivativeMeta = derivativeRow?.metaJson ? JSON.parse(derivativeRow.metaJson) : null

    expect(tableOption.status).toBe('ready')
    expect(converted).toContain('| alice |  |')
    expect(converted).not.toContain('SUM(1,2)')
    expect(derivativeMeta?.conversionWarnings).toEqual(expect.arrayContaining([
      'xlsx_formula_cached_value_missing',
    ]))
  })

  it('coalesces concurrent explicit DFC ensure requests for the same text derivative', async () => {
    const { db, handlers } = createWorkerHarness()
    const storageRootDir = path.resolve(process.cwd(), '.tmp-file-pipeline-worker-tests')
    const assetId = 'asset-csv-concurrent-dfc'
    const storageUri = 'assets/original/co/asset-csv-concurrent-dfc.csv'
    await mkdir(path.dirname(path.join(storageRootDir, ...storageUri.split('/'))), { recursive: true })
    await writeFile(path.join(storageRootDir, ...storageUri.split('/')), 'name,age\nalice,30\n')
    await dispatchWorkerMessage(handlers, {
      id: 'req-csv-concurrent-asset',
      method: 'fileAsset.create',
      params: {
        id: assetId,
        sha256: 'asset-csv-concurrent-source-hash',
        filename: 'data.csv',
        extension: 'csv',
        mime: 'text/csv',
        sizeBytes: 18,
        assetKind: 'text',
        sourceKind: 'local_upload',
        storageUri,
        ingestStatus: 'stored',
      },
    })
    await dispatchWorkerMessage(handlers, {
      id: 'req-csv-concurrent-draft-add',
      method: 'conversationDraft.addAttachment',
      params: { conversationId: 'c1', assetId },
    })

    const [first, second] = await Promise.all([
      dispatchWorkerMessage(handlers, {
        id: 'req-csv-concurrent-ensure-a',
        method: 'conversationDraft.ensureDfcOptions',
        params: { conversationId: 'c1', assetId },
      }),
      dispatchWorkerMessage(handlers, {
        id: 'req-csv-concurrent-ensure-b',
        method: 'conversationDraft.ensureDfcOptions',
        params: { conversationId: 'c1', assetId },
      }),
    ])

    expect(first).toMatchObject({ ok: true })
    expect(second).toMatchObject({ ok: true })
    const firstTableOption = (first as any).result.options.find((option: any) => option.targetKind === 'table_markdown')
    const secondTableOption = (second as any).result.options.find((option: any) => option.targetKind === 'table_markdown')
    expect(firstTableOption).toMatchObject({
      status: 'ready',
      isAvailable: true,
      sendAssetRefs: [expect.objectContaining({ kind: 'derived_asset' })],
    })
    expect(secondTableOption).toMatchObject({
      optionId: firstTableOption.optionId,
      sendAssetRefs: firstTableOption.sendAssetRefs,
    })
    const derivativeCount = db.prepare(`
      SELECT COUNT(*) AS count
      FROM file_derivatives
      WHERE parent_asset_id=@assetId AND derived_kind='extracted_text'
    `).get({ assetId }) as { count: number }
    const jobCount = db.prepare(`
      SELECT COUNT(*) AS count
      FROM derivative_jobs
      WHERE asset_id=@assetId AND derivative_kind='extracted_text'
    `).get({ assetId }) as { count: number }
    const generationStateCount = db.prepare(`
      SELECT COUNT(*) AS count
      FROM dfc_option_generation_states
      WHERE asset_id=@assetId AND target_kind='table_markdown'
    `).get({ assetId }) as { count: number }
    const generationState = db.prepare(`
      SELECT status, output_derivative_id AS outputDerivativeId, attempt_count AS attemptCount
      FROM dfc_option_generation_states
      WHERE asset_id=@assetId AND target_kind='table_markdown'
      LIMIT 1
    `).get({ assetId }) as { status: string; outputDerivativeId: string | null; attemptCount: number }
    expect(derivativeCount.count).toBe(1)
    expect(jobCount.count).toBe(1)
    expect(generationStateCount.count).toBe(1)
    expect(generationState).toMatchObject({
      status: 'ready',
      outputDerivativeId: firstTableOption.sendAssetRefs[0].assetId,
      attemptCount: 1,
    })
  })

  it('blocks durable DFC option generation when a draft attachment is removed after conversion completes', async () => {
    const { db, handlers, conversationAttachmentService } = createWorkerHarness()
    const storageRootDir = path.resolve(process.cwd(), '.tmp-file-pipeline-worker-tests')
    const assetId = 'asset-csv-detached-dfc'
    const storageUri = 'assets/original/de/asset-csv-detached-dfc.csv'
    await mkdir(path.dirname(path.join(storageRootDir, ...storageUri.split('/'))), { recursive: true })
    await writeFile(path.join(storageRootDir, ...storageUri.split('/')), 'name,age\nalice,30\n')
    await dispatchWorkerMessage(handlers, {
      id: 'req-csv-detached-asset',
      method: 'fileAsset.create',
      params: {
        id: assetId,
        sha256: 'asset-csv-detached-source-hash',
        filename: 'data.csv',
        extension: 'csv',
        mime: 'text/csv',
        sizeBytes: 18,
        assetKind: 'text',
        sourceKind: 'local_upload',
        storageUri,
        ingestStatus: 'stored',
      },
    })
    await dispatchWorkerMessage(handlers, {
      id: 'req-csv-detached-draft-add',
      method: 'conversationDraft.addAttachment',
      params: { conversationId: 'c1', assetId },
    })

    let relevanceChecks = 0
    const hasDraftAttachmentSpy = vi.spyOn(conversationAttachmentService, 'hasDraftAttachment').mockImplementation((input) => {
      relevanceChecks += 1
      if (relevanceChecks === 1) return true
      conversationAttachmentService.removeDraftAttachment({ ...input, updatedAt: 1001 })
      return false
    })

    const ensure = await dispatchWorkerMessage(handlers, {
      id: 'req-csv-detached-ensure',
      method: 'conversationDraft.ensureDfcOptions',
      params: { conversationId: 'c1', assetId },
    })

    const generationState = db.prepare(`
      SELECT status,
             retryable,
             derivative_job_id AS derivativeJobId,
             output_derivative_id AS outputDerivativeId,
             error_code AS errorCode,
             attempt_count AS attemptCount
      FROM dfc_option_generation_states
      WHERE asset_id=@assetId AND target_kind='table_markdown'
      LIMIT 1
    `).get({ assetId }) as {
      status: string
      retryable: number
      derivativeJobId: string | null
      outputDerivativeId: string | null
      errorCode: string | null
      attemptCount: number
    }
    const derivativeCount = db.prepare(`
      SELECT COUNT(*) AS count
      FROM file_derivatives
      WHERE parent_asset_id=@assetId AND derived_kind='extracted_text'
    `).get({ assetId }) as { count: number }
    const jobCount = db.prepare(`
      SELECT COUNT(*) AS count
      FROM derivative_jobs
      WHERE asset_id=@assetId AND derivative_kind='extracted_text'
    `).get({ assetId }) as { count: number }
    const assetRow = db.prepare(`
      SELECT source_meta_json AS sourceMetaJson
      FROM file_assets
      WHERE id=@assetId
      LIMIT 1
    `).get({ assetId }) as { sourceMetaJson: string | null }
    const assetMeta = assetRow.sourceMetaJson ? JSON.parse(assetRow.sourceMetaJson) : null
    expect(ensure).toMatchObject({
      ok: false,
      error: expect.objectContaining({
        message: expect.stringContaining('draft attachment not found'),
      }),
    })
    expect(generationState).toMatchObject({
      status: 'blocked',
      retryable: 0,
      errorCode: 'draft_attachment_detached',
      outputDerivativeId: null,
      attemptCount: 1,
    })
    expect(generationState.derivativeJobId).toEqual(expect.any(String))
    expect(derivativeCount.count).toBe(1)
    expect(jobCount.count).toBe(1)
    expect(assetMeta?.textConversion?.status).not.toBe('ready')
    expect(JSON.stringify(ensure)).not.toContain(storageUri)
    expect(JSON.stringify(ensure)).not.toContain('asset-csv-detached-source-hash')

    hasDraftAttachmentSpy.mockRestore()
    await dispatchWorkerMessage(handlers, {
      id: 'req-csv-detached-draft-add-again',
      method: 'conversationDraft.addAttachment',
      params: { conversationId: 'c1', assetId },
    })
    const recovered = await dispatchWorkerMessage(handlers, {
      id: 'req-csv-detached-ensure-recovered',
      method: 'conversationDraft.ensureDfcOptions',
      params: { conversationId: 'c1', assetId },
    })
    const recoveredOption = (recovered as any).result.options.find((option: any) => option.targetKind === 'table_markdown')
    const recoveredState = db.prepare(`
      SELECT status,
             retryable,
             output_derivative_id AS outputDerivativeId,
             error_code AS errorCode,
             attempt_count AS attemptCount
      FROM dfc_option_generation_states
      WHERE asset_id=@assetId AND target_kind='table_markdown'
      LIMIT 1
    `).get({ assetId }) as {
      status: string
      retryable: number
      outputDerivativeId: string | null
      errorCode: string | null
      attemptCount: number
    }
    const recoveredJobCount = db.prepare(`
      SELECT COUNT(*) AS count
      FROM derivative_jobs
      WHERE asset_id=@assetId AND derivative_kind='extracted_text'
    `).get({ assetId }) as { count: number }
    expect(recovered).toMatchObject({ ok: true })
    expect(recoveredOption).toMatchObject({
      status: 'ready',
      isAvailable: true,
      compatibilityStatus: 'compatible',
      sendAssetRefs: [expect.objectContaining({ kind: 'derived_asset' })],
    })
    expect(recoveredState).toMatchObject({
      status: 'ready',
      retryable: 0,
      outputDerivativeId: recoveredOption.sendAssetRefs[0].assetId,
      errorCode: null,
      attemptCount: 1,
    })
    expect(recoveredJobCount.count).toBe(1)
    expect(JSON.stringify((recovered as any).result)).not.toContain(storageUri)
    expect(JSON.stringify((recovered as any).result)).not.toContain('asset-csv-detached-source-hash')
  })

  it('retries durable DFC generation state on a later explicit ensure without creating duplicate state rows', async () => {
    const { db, handlers } = createWorkerHarness()
    const storageRootDir = path.resolve(process.cwd(), '.tmp-file-pipeline-worker-tests')
    const assetId = 'asset-dfc-durable-retry'
    const storageUri = 'assets/original/dr/asset-dfc-durable-retry.txt'
    await rm(path.join(storageRootDir, ...storageUri.split('/')), { force: true })
    await dispatchWorkerMessage(handlers, {
      id: 'req-durable-retry-asset',
      method: 'fileAsset.create',
      params: {
        id: assetId,
        sha256: 'asset-dfc-durable-retry-source-hash',
        filename: 'retry.txt',
        extension: 'txt',
        mime: 'text/plain',
        sizeBytes: 12,
        assetKind: 'text',
        sourceKind: 'local_upload',
        storageUri,
        ingestStatus: 'stored',
      },
    })
    await dispatchWorkerMessage(handlers, {
      id: 'req-durable-retry-draft-add',
      method: 'conversationDraft.addAttachment',
      params: { conversationId: 'c1', assetId },
    })

    const first = await dispatchWorkerMessage(handlers, {
      id: 'req-durable-retry-ensure-first',
      method: 'conversationDraft.ensureDfcOptions',
      params: { conversationId: 'c1', assetId },
    })
    const firstOption = (first as any).result.options.find((option: any) => option.targetKind === 'plain_text')
    expect(firstOption).toMatchObject({
      status: 'failed',
      diagnostics: [expect.objectContaining({ code: 'derivative_local_file_missing' })],
    })
    const failedState = db.prepare(`
      SELECT status, retryable, attempt_count AS attemptCount, error_code AS errorCode
      FROM dfc_option_generation_states
      WHERE asset_id=@assetId AND target_kind='plain_text'
      LIMIT 1
    `).get({ assetId }) as { status: string; retryable: number; attemptCount: number; errorCode: string | null }
    expect(failedState).toMatchObject({
      status: 'failed',
      retryable: 1,
      attemptCount: 1,
      errorCode: 'derivative_local_file_missing',
    })

    await mkdir(path.dirname(path.join(storageRootDir, ...storageUri.split('/'))), { recursive: true })
    await writeFile(path.join(storageRootDir, ...storageUri.split('/')), 'retry works\n')
    const second = await dispatchWorkerMessage(handlers, {
      id: 'req-durable-retry-ensure-second',
      method: 'conversationDraft.ensureDfcOptions',
      params: { conversationId: 'c1', assetId },
    })
    const secondOption = (second as any).result.options.find((option: any) => option.targetKind === 'plain_text')
    expect(secondOption).toMatchObject({
      status: 'ready',
      isAvailable: true,
      sendAssetRefs: [expect.objectContaining({ kind: 'derived_asset' })],
    })
    const stateCount = db.prepare(`
      SELECT COUNT(*) AS count
      FROM dfc_option_generation_states
      WHERE asset_id=@assetId AND target_kind='plain_text'
    `).get({ assetId }) as { count: number }
    const readyState = db.prepare(`
      SELECT status, retryable, attempt_count AS attemptCount, error_code AS errorCode, output_derivative_id AS outputDerivativeId
      FROM dfc_option_generation_states
      WHERE asset_id=@assetId AND target_kind='plain_text'
      LIMIT 1
    `).get({ assetId }) as { status: string; retryable: number; attemptCount: number; errorCode: string | null; outputDerivativeId: string | null }
    const jobCount = db.prepare(`
      SELECT COUNT(*) AS count
      FROM derivative_jobs
      WHERE asset_id=@assetId AND derivative_kind='extracted_text'
    `).get({ assetId }) as { count: number }
    expect(stateCount.count).toBe(1)
    expect(jobCount.count).toBe(2)
    expect(readyState).toMatchObject({
      status: 'ready',
      retryable: 0,
      attemptCount: 2,
      errorCode: null,
      outputDerivativeId: secondOption.sendAssetRefs[0].assetId,
    })
    expect(JSON.stringify((second as any).result)).not.toContain(storageUri)
    expect(JSON.stringify((second as any).result)).not.toContain('asset-dfc-durable-retry-source-hash')
  })

  it('does not retry non-retryable durable DFC generation failures for the same option identity', async () => {
    const { db, handlers } = createWorkerHarness()
    const storageRootDir = path.resolve(process.cwd(), '.tmp-file-pipeline-worker-tests')
    const assetId = 'asset-dfc-terminal-failure'
    const storageUri = 'assets/original/tf/asset-dfc-terminal-failure.txt'
    await mkdir(path.dirname(path.join(storageRootDir, ...storageUri.split('/'))), { recursive: true })
    await writeFile(path.join(storageRootDir, ...storageUri.split('/')), 'terminal failure should not retry\n')
    await dispatchWorkerMessage(handlers, {
      id: 'req-terminal-failure-asset',
      method: 'fileAsset.create',
      params: {
        id: assetId,
        sha256: 'asset-dfc-terminal-failure-source-hash',
        filename: 'terminal.txt',
        extension: 'txt',
        mime: 'text/plain',
        sizeBytes: 34,
        assetKind: 'text',
        sourceKind: 'local_upload',
        storageUri,
        ingestStatus: 'stored',
      },
    })
    await dispatchWorkerMessage(handlers, {
      id: 'req-terminal-failure-draft-add',
      method: 'conversationDraft.addAttachment',
      params: { conversationId: 'c1', assetId },
    })
    db.prepare(`
      INSERT INTO dfc_option_generation_states(
        id,
        asset_id,
        target_kind,
        derived_kind,
        exposure_mode,
        generator,
        conversion_settings_hash,
        status,
        retryable,
        derivative_job_id,
        output_derivative_id,
        error_code,
        attempt_count,
        created_at,
        updated_at,
        started_at,
        finished_at
      )
      VALUES (
        'state-terminal-failure',
        @assetId,
        'plain_text',
        'extracted_text',
        'dfc',
        'step3-text-structured-conversion',
        @settingsHash,
        'failed',
        0,
        NULL,
        NULL,
        'conversion_not_implemented',
        1,
        1,
        1,
        1,
        1
      )
    `).run({ assetId, settingsHash: dfcSettingsHash('plain_text') })

    const ensured = await dispatchWorkerMessage(handlers, {
      id: 'req-terminal-failure-ensure',
      method: 'conversationDraft.ensureDfcOptions',
      params: { conversationId: 'c1', assetId },
    })

    const failedOption = (ensured as any).result.options.find((option: any) => option.targetKind === 'plain_text')
    const generationState = db.prepare(`
      SELECT status, retryable, attempt_count AS attemptCount, error_code AS errorCode, output_derivative_id AS outputDerivativeId
      FROM dfc_option_generation_states
      WHERE id='state-terminal-failure'
      LIMIT 1
    `).get() as { status: string; retryable: number; attemptCount: number; errorCode: string | null; outputDerivativeId: string | null }
    const jobCount = db.prepare(`
      SELECT COUNT(*) AS count
      FROM derivative_jobs
      WHERE asset_id=@assetId AND derivative_kind='extracted_text'
    `).get({ assetId }) as { count: number }
    const derivativeCount = db.prepare(`
      SELECT COUNT(*) AS count
      FROM file_derivatives
      WHERE parent_asset_id=@assetId AND derived_kind='extracted_text'
    `).get({ assetId }) as { count: number }
    expect(ensured).toMatchObject({ ok: true })
    expect(failedOption).toMatchObject({
      optionId: `dfc:${assetId}:plain_text:failed`,
      status: 'failed',
      isAvailable: false,
      compatibilityStatus: 'blocked',
      sendAssetRefs: [],
      diagnostics: [expect.objectContaining({ code: 'conversion_not_implemented' })],
    })
    expect(generationState).toMatchObject({
      status: 'failed',
      retryable: 0,
      attemptCount: 1,
      errorCode: 'conversion_not_implemented',
      outputDerivativeId: null,
    })
    expect(jobCount.count).toBe(0)
    expect(derivativeCount.count).toBe(0)
    expect(JSON.stringify((ensured as any).result)).not.toContain(storageUri)
    expect(JSON.stringify((ensured as any).result)).not.toContain('asset-dfc-terminal-failure-source-hash')
  })

  it('lets a verified derivative recover a non-retryable durable DFC failure without creating a new job', async () => {
    const { db, handlers } = createWorkerHarness()
    const storageRootDir = path.resolve(process.cwd(), '.tmp-file-pipeline-worker-tests')
    const assetId = 'asset-dfc-terminal-recovered'
    const storageUri = 'assets/original/tr/asset-dfc-terminal-recovered.txt'
    const derivativeId = 'derivative-terminal-recovered'
    const derivativeStorageUri = 'assets/derived/tr/derivative-terminal-recovered.txt'
    await mkdir(path.dirname(path.join(storageRootDir, ...storageUri.split('/'))), { recursive: true })
    await mkdir(path.dirname(path.join(storageRootDir, ...derivativeStorageUri.split('/'))), { recursive: true })
    await writeFile(path.join(storageRootDir, ...storageUri.split('/')), 'source text\n')
    await writeFile(path.join(storageRootDir, ...derivativeStorageUri.split('/')), 'verified derivative text\n')
    await dispatchWorkerMessage(handlers, {
      id: 'req-terminal-recovered-asset',
      method: 'fileAsset.create',
      params: {
        id: assetId,
        sha256: 'asset-dfc-terminal-recovered-source-hash',
        filename: 'terminal-recovered.txt',
        extension: 'txt',
        mime: 'text/plain',
        sizeBytes: 12,
        assetKind: 'text',
        sourceKind: 'local_upload',
        storageUri,
        ingestStatus: 'stored',
      },
    })
    await dispatchWorkerMessage(handlers, {
      id: 'req-terminal-recovered-derivative',
      method: 'fileDerivative.create',
      params: {
        id: derivativeId,
        parentAssetId: assetId,
        derivedKind: 'extracted_text',
        mime: 'text/plain',
        storageUri: derivativeStorageUri,
        generator: 'step3-text-structured-conversion',
        status: 'ready',
        metaJson: {
          targetKind: 'plain_text',
          usage: 'preview_and_send',
          sourceHash: 'asset-dfc-terminal-recovered-source-hash',
          contentHash: 'derivative-terminal-recovered-content-hash',
          conversionSettingsHash: dfcSettingsHash('plain_text'),
        },
      },
    })
    await dispatchWorkerMessage(handlers, {
      id: 'req-terminal-recovered-draft-add',
      method: 'conversationDraft.addAttachment',
      params: { conversationId: 'c1', assetId },
    })
    db.prepare(`
      INSERT INTO dfc_option_generation_states(
        id,
        asset_id,
        target_kind,
        derived_kind,
        exposure_mode,
        generator,
        conversion_settings_hash,
        status,
        retryable,
        derivative_job_id,
        output_derivative_id,
        error_code,
        attempt_count,
        created_at,
        updated_at,
        started_at,
        finished_at
      )
      VALUES (
        'state-terminal-recovered',
        @assetId,
        'plain_text',
        'extracted_text',
        'dfc',
        'step3-text-structured-conversion',
        @settingsHash,
        'failed',
        0,
        NULL,
        NULL,
        'conversion_not_implemented',
        1,
        1,
        1,
        1,
        1
      )
    `).run({ assetId, settingsHash: dfcSettingsHash('plain_text') })

    const ensured = await dispatchWorkerMessage(handlers, {
      id: 'req-terminal-recovered-ensure',
      method: 'conversationDraft.ensureDfcOptions',
      params: { conversationId: 'c1', assetId },
    })

    const plainTextOption = (ensured as any).result.options.find((option: any) => option.targetKind === 'plain_text')
    const recoveredState = db.prepare(`
      SELECT status, retryable, attempt_count AS attemptCount, error_code AS errorCode, output_derivative_id AS outputDerivativeId
      FROM dfc_option_generation_states
      WHERE id='state-terminal-recovered'
      LIMIT 1
    `).get() as { status: string; retryable: number; attemptCount: number; errorCode: string | null; outputDerivativeId: string | null }
    const jobCount = db.prepare(`
      SELECT COUNT(*) AS count
      FROM derivative_jobs
      WHERE asset_id=@assetId AND derivative_kind='extracted_text'
    `).get({ assetId }) as { count: number }
    expect(ensured).toMatchObject({ ok: true })
    expect(plainTextOption).toMatchObject({
      optionId: `dfc:${assetId}:plain_text:derived_asset:${derivativeId}`,
      status: 'ready',
      isAvailable: true,
      compatibilityStatus: 'compatible',
      sendAssetRefs: [{ kind: 'derived_asset', assetId: derivativeId }],
    })
    expect(recoveredState).toMatchObject({
      status: 'ready',
      retryable: 0,
      attemptCount: 1,
      errorCode: null,
      outputDerivativeId: derivativeId,
    })
    expect(jobCount.count).toBe(0)
    expect(JSON.stringify((ensured as any).result)).not.toContain(storageUri)
    expect(JSON.stringify((ensured as any).result)).not.toContain(derivativeStorageUri)
    expect(JSON.stringify((ensured as any).result)).not.toContain('asset-dfc-terminal-recovered-source-hash')
    expect(JSON.stringify((ensured as any).result)).not.toContain('derivative-terminal-recovered-content-hash')
  })

  it('regenerates explicit DFC derivatives when the reusable output source hash is stale', async () => {
    const { db, handlers } = createWorkerHarness()
    const storageRootDir = path.resolve(process.cwd(), '.tmp-file-pipeline-worker-tests')
    const assetId = 'asset-dfc-stale-regenerate'
    const storageUri = 'assets/original/sr/asset-dfc-stale-regenerate.csv'
    await rm(path.join(storageRootDir, ...storageUri.split('/')), { force: true })
    await mkdir(path.dirname(path.join(storageRootDir, ...storageUri.split('/'))), { recursive: true })
    await writeFile(path.join(storageRootDir, ...storageUri.split('/')), 'name,age\nalice,30\n')
    await dispatchWorkerMessage(handlers, {
      id: 'req-stale-regenerate-asset',
      method: 'fileAsset.create',
      params: {
        id: assetId,
        sha256: 'asset-dfc-stale-regenerate-source-v1',
        filename: 'data.csv',
        extension: 'csv',
        mime: 'text/csv',
        sizeBytes: 18,
        assetKind: 'text',
        sourceKind: 'local_upload',
        storageUri,
        ingestStatus: 'stored',
      },
    })
    await dispatchWorkerMessage(handlers, {
      id: 'req-stale-regenerate-draft-add',
      method: 'conversationDraft.addAttachment',
      params: { conversationId: 'c1', assetId },
    })

    const first = await dispatchWorkerMessage(handlers, {
      id: 'req-stale-regenerate-ensure-first',
      method: 'conversationDraft.ensureDfcOptions',
      params: { conversationId: 'c1', assetId },
    })
    const firstOption = (first as any).result.options.find((option: any) => option.targetKind === 'table_markdown')
    const firstDerivativeId = firstOption.sendAssetRefs[0].assetId

    await writeFile(path.join(storageRootDir, ...storageUri.split('/')), 'name,age\nbob,41\n')
    db.prepare(`
      UPDATE file_assets
      SET sha256 = 'asset-dfc-stale-regenerate-source-v2',
          updated_at = 2000
      WHERE id = @assetId
    `).run({ assetId })

    const second = await dispatchWorkerMessage(handlers, {
      id: 'req-stale-regenerate-ensure-second',
      method: 'conversationDraft.ensureDfcOptions',
      params: { conversationId: 'c1', assetId },
    })
    const secondOption = (second as any).result.options.find((option: any) => option.targetKind === 'table_markdown')
    const secondDerivativeId = secondOption.sendAssetRefs[0].assetId
    const derivativeCount = db.prepare(`
      SELECT COUNT(*) AS count
      FROM file_derivatives
      WHERE parent_asset_id=@assetId AND derived_kind='extracted_text'
    `).get({ assetId }) as { count: number }
    const generationState = db.prepare(`
      SELECT status, attempt_count AS attemptCount, output_derivative_id AS outputDerivativeId
      FROM dfc_option_generation_states
      WHERE asset_id=@assetId AND target_kind='table_markdown'
      LIMIT 1
    `).get({ assetId }) as { status: string; attemptCount: number; outputDerivativeId: string | null }
    const secondDerivativeMetaRow = db.prepare(`
      SELECT meta_json AS metaJson
      FROM file_derivatives
      WHERE id=@derivativeId
      LIMIT 1
    `).get({ derivativeId: secondDerivativeId }) as { metaJson: string | null }
    const secondDerivativeMeta = secondDerivativeMetaRow.metaJson ? JSON.parse(secondDerivativeMetaRow.metaJson) : null

    expect(firstDerivativeId).not.toBe(secondDerivativeId)
    expect(secondOption).toMatchObject({
      status: 'ready',
      isAvailable: true,
      sendAssetRefs: [{ kind: 'derived_asset', assetId: secondDerivativeId }],
    })
    expect(derivativeCount.count).toBe(2)
    expect(generationState).toMatchObject({
      status: 'ready',
      attemptCount: 2,
      outputDerivativeId: secondDerivativeId,
    })
    expect(secondDerivativeMeta).toMatchObject({
      sourceHash: 'asset-dfc-stale-regenerate-source-v2',
      targetKind: 'table_markdown',
    })
    expect(JSON.stringify((second as any).result)).not.toContain('asset-dfc-stale-regenerate-source-v1')
    expect(JSON.stringify((second as any).result)).not.toContain('asset-dfc-stale-regenerate-source-v2')
  })

  it('generates approved Phase 1 local text DFC target families through explicit ensure endpoint', async () => {
    const { db, handlers } = createWorkerHarness()
    const storageRootDir = path.resolve(process.cwd(), '.tmp-file-pipeline-worker-tests')
    const cases = [
      { id: 'asset-dfc-txt', filename: 'note.txt', extension: 'txt', mime: 'text/plain', text: 'plain text\n', targetKind: 'plain_text' },
      { id: 'asset-dfc-md', filename: 'note.md', extension: 'md', mime: 'text/markdown', text: '# Title\n', targetKind: 'markdown' },
      { id: 'asset-dfc-js', filename: 'app.js', extension: 'js', mime: 'text/javascript', text: 'const answer = 42\n', targetKind: 'code' },
      { id: 'asset-dfc-tsv', filename: 'data.tsv', extension: 'tsv', mime: 'text/tab-separated-values', text: 'name\tage\nalice\t30\n', targetKind: 'table_markdown' },
    ] as const

    for (const item of cases) {
      const storageUri = `assets/original/${item.id.slice(-2)}/${item.filename}`
      await mkdir(path.dirname(path.join(storageRootDir, ...storageUri.split('/'))), { recursive: true })
      await writeFile(path.join(storageRootDir, ...storageUri.split('/')), item.text)
      await dispatchWorkerMessage(handlers, {
        id: `req-${item.id}-asset`,
        method: 'fileAsset.create',
        params: {
          id: item.id,
          sha256: `${item.id}-source-hash`,
          filename: item.filename,
          extension: item.extension,
          mime: item.mime,
          sizeBytes: Buffer.byteLength(item.text, 'utf8'),
          assetKind: 'text',
          sourceKind: 'local_upload',
          storageUri,
          ingestStatus: 'stored',
        },
      })
      await dispatchWorkerMessage(handlers, {
        id: `req-${item.id}-draft-add`,
        method: 'conversationDraft.addAttachment',
        params: { conversationId: 'c1', assetId: item.id },
      })

      const ensured = await dispatchWorkerMessage(handlers, {
        id: `req-${item.id}-ensure`,
        method: 'conversationDraft.ensureDfcOptions',
        params: { conversationId: 'c1', assetId: item.id },
      })
      const derivative = db.prepare(`
        SELECT id, meta_json AS metaJson
        FROM file_derivatives
        WHERE parent_asset_id=@assetId AND derived_kind='extracted_text'
        LIMIT 1
      `).get({ assetId: item.id }) as { id: string; metaJson: string | null } | undefined
      const option = (ensured as any).result.options.find((candidate: any) => candidate.targetKind === item.targetKind)
      const derivativeMeta = derivative?.metaJson ? JSON.parse(derivative.metaJson) : null

      expect(derivativeMeta).toMatchObject({
        targetKind: item.targetKind,
        usage: 'preview_and_send',
        storageClass: 'draft_bound',
        converterName: 'starverse-text-derivative',
      })
      expect(option).toMatchObject({
        optionId: `dfc:${item.id}:${item.targetKind}:derived_asset:${derivative?.id}`,
        status: 'ready',
        isAvailable: true,
        sendAssetRefs: [{ kind: 'derived_asset', assetId: derivative?.id }],
      })
    }
  })

  it('previews and commits selected TSV table_markdown from the same derived asset ref', async () => {
    const { db, handlers } = createWorkerHarness()
    const storageRootDir = path.resolve(process.cwd(), '.tmp-file-pipeline-worker-tests')
    const assetId = 'asset-dfc-tsv-preview-send'
    const storageUri = 'assets/original/tp/asset-dfc-tsv-preview-send.tsv'
    await mkdir(path.dirname(path.join(storageRootDir, ...storageUri.split('/'))), { recursive: true })
    await writeFile(path.join(storageRootDir, ...storageUri.split('/')), 'name\tage\nalice\t30\nbob\t41\n')
    await dispatchWorkerMessage(handlers, {
      id: 'req-tsv-preview-send-asset',
      method: 'fileAsset.create',
      params: {
        id: assetId,
        sha256: 'asset-dfc-tsv-preview-send-source-hash',
        filename: 'data.tsv',
        extension: 'tsv',
        mime: 'text/tab-separated-values',
        sizeBytes: 25,
        assetKind: 'text',
        sourceKind: 'local_upload',
        storageUri,
        ingestStatus: 'stored',
      },
    })
    await dispatchWorkerMessage(handlers, {
      id: 'req-tsv-preview-send-draft-add',
      method: 'conversationDraft.addAttachment',
      params: { conversationId: 'c1', assetId },
    })

    const ensured = await dispatchWorkerMessage(handlers, {
      id: 'req-tsv-preview-send-ensure',
      method: 'conversationDraft.ensureDfcOptions',
      params: { conversationId: 'c1', assetId },
    })
    const tableOption = (ensured as any).result.options.find((option: any) => option.targetKind === 'table_markdown')
    const derivativeRow = db.prepare(`
      SELECT id, storage_uri AS storageUri
      FROM file_derivatives
      WHERE parent_asset_id=@assetId AND derived_kind='extracted_text'
      LIMIT 1
    `).get({ assetId }) as { id: string; storageUri: string }
    const converted = await readFile(path.join(storageRootDir, ...derivativeRow.storageUri.split('/')), 'utf8')
    expect(converted).toBe('| name | age |\n| --- | --- |\n| alice | 30 |\n| bob | 41 |')
    expect(tableOption).toMatchObject({
      optionId: `dfc:${assetId}:table_markdown:derived_asset:${derivativeRow.id}`,
      status: 'ready',
      isAvailable: true,
      sendAssetRefs: [{ kind: 'derived_asset', assetId: derivativeRow.id }],
    })

    const selected = await dispatchWorkerMessage(handlers, {
      id: 'req-tsv-preview-send-select',
      method: 'conversationDraft.updateAttachmentSettings',
      params: {
        conversationId: 'c1',
        assetId,
        dfcManaged: true,
        selectedOptionId: tableOption.optionId,
        selectedAssetRefs: tableOption.sendAssetRefs,
      },
    })
    const preview = await dispatchWorkerMessage(handlers, {
      id: 'req-tsv-preview-send-preview',
      method: 'conversationDraft.getDfcPreview',
      params: { conversationId: 'c1', assetId, maxCharacters: 256 },
    })
    const committed = await dispatchWorkerMessage(handlers, {
      id: 'req-tsv-preview-send-commit',
      method: 'conversationDraft.commitToUserMessage',
      params: { conversationId: 'c1', body: 'send tsv as table markdown' },
    })

    expect(selected).toMatchObject({ ok: true })
    expect(preview).toMatchObject({
      ok: true,
      result: {
        selectedOptionId: tableOption.optionId,
        selectedAssetRefs: tableOption.sendAssetRefs,
        targetKind: 'table_markdown',
        sendStrategy: 'text_in_prompt',
        decision: expect.objectContaining({
          status: 'ready',
          sendAssetRefs: tableOption.sendAssetRefs,
        }),
        preview: expect.objectContaining({
          kind: 'text',
          status: 'ready',
          text: converted,
        }),
      },
    })
    expect(committed).toMatchObject({
      ok: true,
      result: {
        attachments: [
          expect.objectContaining({
            assetId,
            dfcManaged: true,
            usedOptionId: tableOption.optionId,
            usedAssetRefs: tableOption.sendAssetRefs,
            targetKind: 'table_markdown',
            sendStrategy: 'text_in_prompt',
          }),
        ],
      },
    })
    expect(JSON.stringify((ensured as any).result)).not.toContain(storageUri)
    expect(JSON.stringify((preview as any).result)).not.toContain(storageUri)
    expect(JSON.stringify((preview as any).result)).not.toContain(derivativeRow.storageUri)
    expect(JSON.stringify((preview as any).result)).not.toContain('asset-dfc-tsv-preview-send-source-hash')
  })

  it('generates HTML code and safe markdown DFC options with original_file raw ref', async () => {
    const { db, handlers } = createWorkerHarness()
    const storageRootDir = path.resolve(process.cwd(), '.tmp-file-pipeline-worker-tests')
    const assetId = 'asset-dfc-html-dual-options'
    const storageUri = 'assets/original/ht/asset-dfc-html-dual-options.html'
    const html = `<html><head><style>.hidden{display:none}</style><script>window.alert('x')</script></head><body><h1>Title</h1><p>Hello <b>world</b></p></body></html>`
    await mkdir(path.dirname(path.join(storageRootDir, ...storageUri.split('/'))), { recursive: true })
    await writeFile(path.join(storageRootDir, ...storageUri.split('/')), html)
    await dispatchWorkerMessage(handlers, {
      id: 'req-html-dual-options-asset',
      method: 'fileAsset.create',
      params: {
        id: assetId,
        sha256: 'asset-dfc-html-dual-options-source-hash',
        filename: 'index.html',
        extension: 'html',
        mime: 'text/html',
        sizeBytes: Buffer.byteLength(html, 'utf8'),
        assetKind: 'text',
        sourceKind: 'local_upload',
        storageUri,
        ingestStatus: 'stored',
      },
    })
    await dispatchWorkerMessage(handlers, {
      id: 'req-html-dual-options-draft-add',
      method: 'conversationDraft.addAttachment',
      params: { conversationId: 'c1', assetId },
    })

    const ensured = await dispatchWorkerMessage(handlers, {
      id: 'req-html-dual-options-ensure',
      method: 'conversationDraft.ensureDfcOptions',
      params: { conversationId: 'c1', assetId },
    })
    const options = (ensured as any).result.options as any[]
    const originalOption = options.find((option) => option.targetKind === 'original_file')
    const markdownOption = options.find((option) => option.targetKind === 'markdown')
    const codeOption = options.find((option) => option.targetKind === 'code')
    const pdfOption = options.find((option) => option.targetKind === 'pdf_attachment')
    const derivativeRows = db.prepare(`
      SELECT id, storage_uri AS storageUri, meta_json AS metaJson
      FROM file_derivatives
      WHERE parent_asset_id=@assetId AND derived_kind='extracted_text'
      ORDER BY created_at ASC, rowid ASC
    `).all({ assetId }) as { id: string; storageUri: string; metaJson: string | null }[]
    const derivatives = derivativeRows.map((row) => ({
      ...row,
      meta: row.metaJson ? JSON.parse(row.metaJson) : null,
    }))
    const markdownDerivative = derivatives.find((row) => row.meta?.targetKind === 'markdown')!
    const codeDerivative = derivatives.find((row) => row.meta?.targetKind === 'code')!
    const markdownText = await readFile(path.join(storageRootDir, ...markdownDerivative.storageUri.split('/')), 'utf8')
    const codeText = await readFile(path.join(storageRootDir, ...codeDerivative.storageUri.split('/')), 'utf8')
    const pdfGenerationState = db.prepare(`
      SELECT target_kind AS targetKind, derived_kind AS derivedKind, status, error_code AS errorCode
      FROM dfc_option_generation_states
      WHERE asset_id=@assetId AND target_kind='pdf_attachment'
      LIMIT 1
    `).get({ assetId }) as { targetKind: string; derivedKind: string; status: string; errorCode: string | null }
    const convertedPdfCount = (db.prepare(`
      SELECT COUNT(*) AS count
      FROM file_derivatives
      WHERE parent_asset_id=@assetId AND derived_kind='converted_pdf'
    `).get({ assetId }) as { count: number }).count

    expect((ensured as any).result.selectedOptionId).toBeNull()
    expect((ensured as any).result.selectedAssetRefs).toEqual([])
    expect((ensured as any).result.decision).toMatchObject({
      status: 'needs_user_selection',
      reasonCode: 'selected_option_missing',
      selectedOptionId: null,
      targetKind: null,
      sendAssetRefs: [],
    })
    expect(originalOption).toMatchObject({
      targetKind: 'original_file',
      status: 'ready',
      sendAssetRefs: [{ kind: 'raw_file', assetId }],
    })
    expect(markdownOption).toMatchObject({
      targetKind: 'markdown',
      status: 'ready',
      sendAssetRefs: [{ kind: 'derived_asset', assetId: markdownDerivative.id }],
      warnings: expect.arrayContaining([
        'html_javascript_not_executed',
        'html_external_resources_not_loaded',
      ]),
    })
    expect(codeOption).toMatchObject({
      targetKind: 'code',
      status: 'ready',
      sendAssetRefs: [{ kind: 'derived_asset', assetId: codeDerivative.id }],
    })
    expect(pdfOption).toMatchObject({
      targetKind: 'pdf_attachment',
      sendStrategy: 'file_attachment',
      status: 'failed',
      isAvailable: false,
      compatibilityStatus: 'blocked',
      sendAssetRefs: [],
      diagnostics: [expect.objectContaining({ code: 'conversion_not_implemented' })],
    })
    expect(pdfGenerationState).toMatchObject({
      targetKind: 'pdf_attachment',
      derivedKind: 'converted_pdf',
      status: 'failed',
      errorCode: 'conversion_not_implemented',
    })
    expect(convertedPdfCount).toBe(0)
    expect(markdownText).toContain('# Title')
    expect(markdownText).toContain('Hello world')
    expect(markdownText).not.toContain('window.alert')
    expect(markdownText).not.toContain('.hidden')
    expect(codeText).toBe(html)
    expect(JSON.stringify((ensured as any).result)).not.toContain('managed-runtimes')
    expect(JSON.stringify((ensured as any).result)).not.toContain('ms-playwright')
    expect(JSON.stringify((ensured as any).result)).not.toContain('C:\\')

    const pdfSelect = await dispatchWorkerMessage(handlers, {
      id: 'req-html-dual-options-select-pdf',
      method: 'conversationDraft.updateAttachmentSettings',
      params: {
        conversationId: 'c1',
        assetId,
        dfcManaged: true,
        selectedOptionId: pdfOption.optionId,
        selectedAssetRefs: pdfOption.sendAssetRefs,
      },
    })
    expect(pdfSelect).toMatchObject({
      ok: false,
    })
    const pdfPreview = await dispatchWorkerMessage(handlers, {
      id: 'req-html-dual-options-pdf-preview',
      method: 'conversationDraft.getDfcPreview',
      params: { conversationId: 'c1', assetId, maxCharacters: 256 },
    })
    const pdfSendPlan = await dispatchWorkerMessage(handlers, {
      id: 'req-html-dual-options-pdf-send-plan',
      method: 'sendPlan.buildCurrent',
      params: {
        conversationId: 'c1',
        draftText: 'attempt html pdf',
        model: {
          providerKey: 'openrouter',
          modelId: 'test/pdf',
          modelKey: 'openrouter::test/pdf',
          inputModalities: ['text', 'file'],
          outputModalities: ['text'],
        },
        providerContext: {
          providerKey: 'openrouter',
          supportsInlineData: true,
          supportsPdfInputs: true,
          supportsPdfUrlRef: true,
          supportsTextUrlRef: true,
        },
      },
    })
    expect(pdfPreview).toMatchObject({
      ok: true,
      result: {
        selectedOptionId: null,
        selectedAssetRefs: [],
        targetKind: null,
        sendStrategy: null,
        decision: expect.objectContaining({
          status: 'needs_user_selection',
          reasonCode: 'selected_option_missing',
        }),
        preview: expect.objectContaining({
          kind: 'none',
          status: 'needs_user_selection',
        }),
      },
    })
    expect(pdfSendPlan).toMatchObject({
      ok: true,
      result: {
        sendPlan: expect.objectContaining({
          status: 'partially_sendable',
          attachmentPlans: [
            expect.objectContaining({
              assetId,
              eligibility: 'excluded',
              sendAssetRefs: [],
              semantic: expect.objectContaining({
                targetKind: 'unsupported',
                sendStrategy: 'unsupported',
                mappedFromLegacy: false,
              }),
            }),
          ],
        }),
      },
    })
    expect(JSON.stringify((pdfSendPlan as any).result)).not.toContain('pdf_attachment')
    expect(JSON.stringify((pdfSendPlan as any).result)).not.toContain('converted_pdf')
    expect(JSON.stringify((pdfPreview as any).result)).not.toContain('managed-runtimes')
    expect(JSON.stringify((pdfPreview as any).result)).not.toContain('ms-playwright')

    await dispatchWorkerMessage(handlers, {
      id: 'req-html-dual-options-select-original',
      method: 'conversationDraft.updateAttachmentSettings',
      params: {
        conversationId: 'c1',
        assetId,
        dfcManaged: true,
        selectedOptionId: originalOption.optionId,
        selectedAssetRefs: originalOption.sendAssetRefs,
      },
    })
    const originalPreview = await dispatchWorkerMessage(handlers, {
      id: 'req-html-dual-options-original-preview',
      method: 'conversationDraft.getDfcPreview',
      params: { conversationId: 'c1', assetId, maxCharacters: 256 },
    })

    expect(originalPreview).toMatchObject({
      ok: true,
      result: {
        selectedOptionId: originalOption.optionId,
        selectedAssetRefs: originalOption.sendAssetRefs,
        targetKind: 'original_file',
        sendStrategy: 'file_attachment',
        decision: expect.objectContaining({
          status: 'ready',
          sendAssetRefs: originalOption.sendAssetRefs,
        }),
        preview: expect.objectContaining({
          kind: 'raw_file',
          status: 'ready',
          text: null,
          diagnostics: [expect.objectContaining({ code: 'dfc_preview_raw_file_metadata_only' })],
        }),
      },
    })
    expect(JSON.stringify((originalPreview as any).result)).not.toContain(storageUri)
    expect(JSON.stringify((originalPreview as any).result)).not.toContain(markdownDerivative.storageUri)
    expect(JSON.stringify((originalPreview as any).result)).not.toContain(codeDerivative.storageUri)
    expect(JSON.stringify((originalPreview as any).result)).not.toContain(html)

    insertConvo(db, 'c-html-original')
    await dispatchWorkerMessage(handlers, {
      id: 'req-html-dual-options-original-draft-add',
      method: 'conversationDraft.addAttachment',
      params: { conversationId: 'c-html-original', assetId },
    })
    await dispatchWorkerMessage(handlers, {
      id: 'req-html-dual-options-original-select-for-commit',
      method: 'conversationDraft.updateAttachmentSettings',
      params: {
        conversationId: 'c-html-original',
        assetId,
        dfcManaged: true,
        selectedOptionId: originalOption.optionId,
        selectedAssetRefs: originalOption.sendAssetRefs,
      },
    })
    const originalCommitted = await dispatchWorkerMessage(handlers, {
      id: 'req-html-dual-options-original-commit',
      method: 'conversationDraft.commitToUserMessage',
      params: { conversationId: 'c-html-original', body: 'send html as original file' },
    })

    expect(originalCommitted).toMatchObject({
      ok: true,
      result: {
        attachments: [
          expect.objectContaining({
            assetId,
            dfcManaged: true,
            usedOptionId: originalOption.optionId,
            usedAssetRefs: originalOption.sendAssetRefs,
            targetKind: 'original_file',
            sendStrategy: 'file_attachment',
          }),
        ],
      },
    })
    expect(JSON.stringify((originalCommitted as any).result)).not.toContain(storageUri)
    expect(JSON.stringify((originalCommitted as any).result)).not.toContain(markdownDerivative.storageUri)
    expect(JSON.stringify((originalCommitted as any).result)).not.toContain(codeDerivative.storageUri)
    expect(JSON.stringify((originalCommitted as any).result)).not.toContain(html)

    await dispatchWorkerMessage(handlers, {
      id: 'req-html-dual-options-select-markdown',
      method: 'conversationDraft.updateAttachmentSettings',
      params: {
        conversationId: 'c1',
        assetId,
        dfcManaged: true,
        selectedOptionId: markdownOption.optionId,
        selectedAssetRefs: markdownOption.sendAssetRefs,
      },
    })
    const preview = await dispatchWorkerMessage(handlers, {
      id: 'req-html-dual-options-preview',
      method: 'conversationDraft.getDfcPreview',
      params: { conversationId: 'c1', assetId, maxCharacters: 256 },
    })

    expect(preview).toMatchObject({
      ok: true,
      result: {
        selectedOptionId: markdownOption.optionId,
        selectedAssetRefs: markdownOption.sendAssetRefs,
        targetKind: 'markdown',
        sendStrategy: 'text_in_prompt',
        decision: expect.objectContaining({
          status: 'ready',
          sendAssetRefs: markdownOption.sendAssetRefs,
        }),
        preview: expect.objectContaining({
          kind: 'text',
          status: 'ready',
          text: markdownText,
        }),
      },
    })
    expect(JSON.stringify((ensured as any).result)).not.toContain(storageUri)
    expect(JSON.stringify((ensured as any).result)).not.toContain('asset-dfc-html-dual-options-source-hash')
    expect(JSON.stringify((preview as any).result)).not.toContain(storageUri)
    expect(JSON.stringify((preview as any).result)).not.toContain(markdownDerivative.storageUri)

    insertConvo(db, 'c-html-markdown')
    await dispatchWorkerMessage(handlers, {
      id: 'req-html-dual-options-markdown-draft-add',
      method: 'conversationDraft.addAttachment',
      params: { conversationId: 'c-html-markdown', assetId },
    })
    await dispatchWorkerMessage(handlers, {
      id: 'req-html-dual-options-markdown-select-for-commit',
      method: 'conversationDraft.updateAttachmentSettings',
      params: {
        conversationId: 'c-html-markdown',
        assetId,
        dfcManaged: true,
        selectedOptionId: markdownOption.optionId,
        selectedAssetRefs: markdownOption.sendAssetRefs,
      },
    })
    const markdownCommitted = await dispatchWorkerMessage(handlers, {
      id: 'req-html-dual-options-markdown-commit',
      method: 'conversationDraft.commitToUserMessage',
      params: { conversationId: 'c-html-markdown', body: 'send html as safe markdown' },
    })

    expect(markdownCommitted).toMatchObject({
      ok: true,
      result: {
        attachments: [
          expect.objectContaining({
            assetId,
            dfcManaged: true,
            usedOptionId: markdownOption.optionId,
            usedAssetRefs: markdownOption.sendAssetRefs,
            targetKind: 'markdown',
            sendStrategy: 'text_in_prompt',
          }),
        ],
      },
    })
    expect(JSON.stringify((markdownCommitted as any).result)).not.toContain(storageUri)
    expect(JSON.stringify((markdownCommitted as any).result)).not.toContain(markdownDerivative.storageUri)
    expect(JSON.stringify((markdownCommitted as any).result)).not.toContain(codeDerivative.storageUri)
    expect(JSON.stringify((markdownCommitted as any).result)).not.toContain(html)

    await dispatchWorkerMessage(handlers, {
      id: 'req-html-dual-options-select-code',
      method: 'conversationDraft.updateAttachmentSettings',
      params: {
        conversationId: 'c1',
        assetId,
        dfcManaged: true,
        selectedOptionId: codeOption.optionId,
        selectedAssetRefs: codeOption.sendAssetRefs,
      },
    })
    const codePreview = await dispatchWorkerMessage(handlers, {
      id: 'req-html-dual-options-code-preview',
      method: 'conversationDraft.getDfcPreview',
      params: { conversationId: 'c1', assetId, maxCharacters: 512 },
    })
    const committed = await dispatchWorkerMessage(handlers, {
      id: 'req-html-dual-options-commit-code',
      method: 'conversationDraft.commitToUserMessage',
      params: { conversationId: 'c1', body: 'send html as code' },
    })

    expect(codePreview).toMatchObject({
      ok: true,
      result: {
        selectedOptionId: codeOption.optionId,
        selectedAssetRefs: codeOption.sendAssetRefs,
        targetKind: 'code',
        sendStrategy: 'text_in_prompt',
        decision: expect.objectContaining({
          status: 'ready',
          sendAssetRefs: codeOption.sendAssetRefs,
        }),
        preview: expect.objectContaining({
          kind: 'text',
          status: 'ready',
          text: codeText,
        }),
      },
    })
    expect(committed).toMatchObject({
      ok: true,
      result: {
        attachments: [
          expect.objectContaining({
            assetId,
            dfcManaged: true,
            usedOptionId: codeOption.optionId,
            usedAssetRefs: codeOption.sendAssetRefs,
            targetKind: 'code',
            sendStrategy: 'text_in_prompt',
          }),
        ],
      },
    })
    expect(JSON.stringify((codePreview as any).result)).not.toContain(storageUri)
    expect(JSON.stringify((codePreview as any).result)).not.toContain(codeDerivative.storageUri)
  })

  it('wires HTML pdf_attachment generation through the Electron conversion bridge', async () => {
    const pdfBytes = Buffer.from('%PDF-1.7\n1 0 obj\n<<>>\nendobj\n%%EOF\n', 'utf8')
    const bridge: ElectronConversionBridge = {
      async convert(request) {
        const outputPath = path.join(request.output.rootDir, ...request.output.relativePath.split(/[\\/]+/))
        await mkdir(path.dirname(outputPath), { recursive: true })
        await writeFile(outputPath, pdfBytes)
        return {
          requestId: request.requestId,
          conversionKind: request.conversionKind,
          status: 'success',
          output: {
            kind: 'controlled_output',
            outputPath,
            mime: request.output.mime,
            extension: request.output.extension,
          },
          diagnostics: [],
          cleanupStatus: 'attempted',
        }
      },
    }
    const { db, handlers } = createWorkerHarness({ electronConversionBridge: bridge })
    const storageRootDir = path.resolve(process.cwd(), '.tmp-file-pipeline-worker-tests')
    const assetId = 'asset-dfc-html-pdf-success'
    const storageUri = 'assets/original/ht/asset-dfc-html-pdf-success.html'
    const html = '<html><body><h1>PDF source</h1><script>window.secret = true</script></body></html>'
    await mkdir(path.dirname(path.join(storageRootDir, ...storageUri.split('/'))), { recursive: true })
    await writeFile(path.join(storageRootDir, ...storageUri.split('/')), html)
    await dispatchWorkerMessage(handlers, {
      id: 'req-html-pdf-success-asset',
      method: 'fileAsset.create',
      params: {
        id: assetId,
        sha256: 'asset-dfc-html-pdf-success-source-hash',
        filename: 'print.html',
        extension: 'html',
        mime: 'text/html',
        sizeBytes: Buffer.byteLength(html, 'utf8'),
        assetKind: 'text',
        sourceKind: 'local_upload',
        storageBackend: 'local_fs',
        storageUri,
        ingestStatus: 'stored',
      },
    })
    await dispatchWorkerMessage(handlers, {
      id: 'req-html-pdf-success-draft-add',
      method: 'conversationDraft.addAttachment',
      params: { conversationId: 'c1', assetId },
    })

    const ensured = await dispatchWorkerMessage(handlers, {
      id: 'req-html-pdf-success-ensure',
      method: 'conversationDraft.ensureDfcOptions',
      params: { conversationId: 'c1', assetId },
    })
    const pdfOption = (ensured as any).result.options.find((option: any) => option.targetKind === 'pdf_attachment')
    const markdownOption = (ensured as any).result.options.find((option: any) => option.targetKind === 'markdown')
    const codeOption = (ensured as any).result.options.find((option: any) => option.targetKind === 'code')
    const originalOption = (ensured as any).result.options.find((option: any) => option.targetKind === 'original_file')
    const derivativeId = pdfOption.sendAssetRefs[0].assetId
    const derivativeRow = db.prepare(`
      SELECT derived_kind AS derivedKind, mime, storage_uri AS storageUri, meta_json AS metaJson
      FROM file_derivatives
      WHERE id=@derivativeId
      LIMIT 1
    `).get({ derivativeId }) as { derivedKind: string; mime: string | null; storageUri: string; metaJson: string | null }
    const derivativeMeta = JSON.parse(derivativeRow.metaJson ?? '{}')
    const pdfFileBytes = await readFile(path.join(storageRootDir, ...derivativeRow.storageUri.split('/')))

    expect(originalOption).toMatchObject({
      targetKind: 'original_file',
      status: 'ready',
      sendAssetRefs: [{ kind: 'raw_file', assetId }],
    })
    expect(markdownOption).toMatchObject({ targetKind: 'markdown', status: 'ready' })
    expect(codeOption).toMatchObject({ targetKind: 'code', status: 'ready' })
    expect(pdfOption).toMatchObject({
      targetKind: 'pdf_attachment',
      status: 'ready',
      isAvailable: true,
      compatibilityStatus: 'compatible',
      sendStrategy: 'file_attachment',
      sendAssetRefs: [{ kind: 'derived_asset', assetId: derivativeId }],
    })
    expect(derivativeRow).toMatchObject({
      derivedKind: 'converted_pdf',
      mime: 'application/pdf',
    })
    expect(derivativeMeta).toMatchObject({
      targetKind: 'pdf_attachment',
      usage: 'preview_and_send',
      storageClass: 'draft_bound',
      sourceHash: 'asset-dfc-html-pdf-success-source-hash',
      converterName: 'starverse-electron-html-pdf',
      converterVersion: '1',
    })
    expect(derivativeMeta.contentHash).toBe(createHash('sha256').update(pdfBytes).digest('hex'))
    expect(Buffer.from(pdfFileBytes).subarray(0, 5).toString('ascii')).toBe('%PDF-')

    const selected = await dispatchWorkerMessage(handlers, {
      id: 'req-html-pdf-success-select',
      method: 'conversationDraft.updateAttachmentSettings',
      params: {
        conversationId: 'c1',
        assetId,
        dfcManaged: true,
        selectedOptionId: pdfOption.optionId,
        selectedAssetRefs: pdfOption.sendAssetRefs,
      },
    })
    const preview = await dispatchWorkerMessage(handlers, {
      id: 'req-html-pdf-success-preview',
      method: 'conversationDraft.getDfcPreview',
      params: { conversationId: 'c1', assetId, maxCharacters: 256 },
    })
    const sendPlan = await dispatchWorkerMessage(handlers, {
      id: 'req-html-pdf-success-send-plan',
      method: 'sendPlan.buildCurrent',
      params: {
        conversationId: 'c1',
        draftText: 'send html pdf',
        model: {
          providerKey: 'openrouter',
          modelId: 'test/pdf',
          modelKey: 'openrouter::test/pdf',
          inputModalities: ['text', 'file'],
          outputModalities: ['text'],
        },
        providerContext: {
          providerKey: 'openrouter',
          supportsInlineData: true,
          supportsPdfInputs: true,
          supportsPdfUrlRef: true,
          supportsTextUrlRef: true,
        },
      },
    })

    expect(selected).toMatchObject({ ok: true })
    expect(preview).toMatchObject({
      ok: true,
      result: {
        selectedOptionId: pdfOption.optionId,
        selectedAssetRefs: pdfOption.sendAssetRefs,
        targetKind: 'pdf_attachment',
        sendStrategy: 'file_attachment',
        decision: expect.objectContaining({
          status: 'ready',
          sendAssetRefs: pdfOption.sendAssetRefs,
        }),
        preview: expect.objectContaining({
          kind: 'raw_file',
          status: 'ready',
          text: null,
          diagnostics: [expect.objectContaining({ code: 'dfc_preview_pdf_metadata_only' })],
        }),
      },
    })
    expect(sendPlan).toMatchObject({
      ok: true,
      result: {
        sendPlan: expect.objectContaining({
          status: 'sendable',
          requiresUserConfirmation: false,
          includedAttachments: [
            expect.objectContaining({
              assetId,
            }),
          ],
          excludedAttachments: [],
          attachmentPlans: [
            expect.objectContaining({
              assetId,
              eligibility: 'included',
              exclusionReason: null,
              selectedSendMode: 'inline_base64',
              sendAssetRefs: pdfOption.sendAssetRefs,
              semantic: expect.objectContaining({
                targetKind: 'pdf_attachment',
                sendStrategy: 'file_attachment',
                mappedFromLegacy: false,
              }),
            }),
          ],
        }),
      },
    })
    expect(JSON.stringify((ensured as any).result)).not.toContain(storageUri)
    expect(JSON.stringify((preview as any).result)).not.toContain(storageUri)
    expect(JSON.stringify((preview as any).result)).not.toContain(derivativeRow.storageUri)
    expect(JSON.stringify((preview as any).result)).not.toContain(html)
    expect(JSON.stringify((sendPlan as any).result)).not.toContain(derivativeRow.storageUri)
    expect(JSON.stringify((sendPlan as any).result)).not.toContain(html)
  })

  it.each([
    ['failed service response', 'failed', 'derivative_output_write_failed'],
    ['timed out service response', 'timed_out', 'derivative_task_timeout'],
    ['invalid PDF output', 'success_invalid_pdf', 'derivative_output_write_failed'],
  ] as const)('fails closed for HTML pdf_attachment generation when %s occurs', async (_label, bridgeMode, expectedErrorCode) => {
    const bridge: ElectronConversionBridge = {
      async convert(request) {
        if (bridgeMode === 'success_invalid_pdf') {
          const outputPath = path.join(request.output.rootDir, ...request.output.relativePath.split(/[\\/]+/))
          await mkdir(path.dirname(outputPath), { recursive: true })
          await writeFile(outputPath, Buffer.from('not a pdf'))
          return {
            requestId: request.requestId,
            conversionKind: request.conversionKind,
            status: 'success',
            output: {
              kind: 'controlled_output',
              outputPath,
              mime: request.output.mime,
              extension: request.output.extension,
            },
            diagnostics: [],
            cleanupStatus: 'attempted',
          }
        }
        return {
          requestId: request.requestId,
          conversionKind: request.conversionKind,
          status: bridgeMode,
          output: null,
          diagnostics: [{
            code: bridgeMode === 'timed_out' ? 'electron_conversion_timeout' : 'electron_conversion_blocked',
            message: 'conversion failed at C:\\Users\\private\\source.html token=secret file body: <html>',
          }],
          cleanupStatus: 'attempted',
        }
      },
    }
    const { db, handlers } = createWorkerHarness({ electronConversionBridge: bridge })
    const storageRootDir = path.resolve(process.cwd(), '.tmp-file-pipeline-worker-tests')
    const assetId = `asset-dfc-html-pdf-${bridgeMode.replace(/_/g, '-')}`
    const storageUri = `assets/original/ht/${assetId}.html`
    const html = '<html><body><h1>Blocked PDF source</h1></body></html>'
    await mkdir(path.dirname(path.join(storageRootDir, ...storageUri.split('/'))), { recursive: true })
    await writeFile(path.join(storageRootDir, ...storageUri.split('/')), html)
    await dispatchWorkerMessage(handlers, {
      id: `req-${assetId}-asset`,
      method: 'fileAsset.create',
      params: {
        id: assetId,
        sha256: `${assetId}-source-hash`,
        filename: 'blocked.html',
        extension: 'html',
        mime: 'text/html',
        sizeBytes: Buffer.byteLength(html, 'utf8'),
        assetKind: 'text',
        sourceKind: 'local_upload',
        storageBackend: 'local_fs',
        storageUri,
        ingestStatus: 'stored',
      },
    })
    await dispatchWorkerMessage(handlers, {
      id: `req-${assetId}-draft-add`,
      method: 'conversationDraft.addAttachment',
      params: { conversationId: 'c1', assetId },
    })

    const ensured = await dispatchWorkerMessage(handlers, {
      id: `req-${assetId}-ensure`,
      method: 'conversationDraft.ensureDfcOptions',
      params: { conversationId: 'c1', assetId },
    })
    const pdfOption = (ensured as any).result.options.find((option: any) => option.targetKind === 'pdf_attachment')
    const readyPdfCount = (db.prepare(`
      SELECT COUNT(*) AS count
      FROM file_derivatives
      WHERE parent_asset_id=@assetId AND derived_kind='converted_pdf' AND status='ready'
    `).get({ assetId }) as { count: number }).count
    const generationState = db.prepare(`
      SELECT status, error_code AS errorCode
      FROM dfc_option_generation_states
      WHERE asset_id=@assetId AND target_kind='pdf_attachment'
      LIMIT 1
    `).get({ assetId }) as { status: string; errorCode: string | null }

    expect(pdfOption).toMatchObject({
      targetKind: 'pdf_attachment',
      sendStrategy: 'file_attachment',
      status: 'failed',
      isAvailable: false,
      compatibilityStatus: 'blocked',
      sendAssetRefs: [],
      diagnostics: [expect.objectContaining({ code: expectedErrorCode })],
    })
    expect(readyPdfCount).toBe(0)
    expect(generationState).toMatchObject({
      status: 'failed',
      errorCode: expectedErrorCode,
    })
    expect(JSON.stringify((ensured as any).result)).not.toContain(storageUri)
    expect(JSON.stringify((ensured as any).result)).not.toContain('C:\\Users\\private')
    expect(JSON.stringify((ensured as any).result)).not.toContain('secret')
    expect(JSON.stringify((ensured as any).result)).not.toContain('<html>')

    const selected = await dispatchWorkerMessage(handlers, {
      id: `req-${assetId}-select`,
      method: 'conversationDraft.updateAttachmentSettings',
      params: {
        conversationId: 'c1',
        assetId,
        dfcManaged: true,
        selectedOptionId: pdfOption.optionId,
        selectedAssetRefs: pdfOption.sendAssetRefs,
      },
    })
    expect(selected).toMatchObject({ ok: false })
  })

  it('generates template-like HTML DFC options while preserving code source and safe markdown output', async () => {
    const { db, handlers } = createWorkerHarness()
    const storageRootDir = path.resolve(process.cwd(), '.tmp-file-pipeline-worker-tests')
    const assetId = 'asset-dfc-html-template-options'
    const storageUri = 'assets/original/ht/asset-dfc-html-template-options.html'
    const html = `<template><article><h1>{{ title }}</h1><p v-if="visible">{{ body }}</p></article></template>`
    await mkdir(path.dirname(path.join(storageRootDir, ...storageUri.split('/'))), { recursive: true })
    await writeFile(path.join(storageRootDir, ...storageUri.split('/')), html)
    await dispatchWorkerMessage(handlers, {
      id: 'req-html-template-options-asset',
      method: 'fileAsset.create',
      params: {
        id: assetId,
        sha256: 'asset-dfc-html-template-options-source-hash',
        filename: 'template.html',
        extension: 'html',
        mime: 'text/html',
        sizeBytes: Buffer.byteLength(html, 'utf8'),
        assetKind: 'text',
        sourceKind: 'local_upload',
        storageUri,
        ingestStatus: 'stored',
      },
    })
    await dispatchWorkerMessage(handlers, {
      id: 'req-html-template-options-draft-add',
      method: 'conversationDraft.addAttachment',
      params: { conversationId: 'c1', assetId },
    })

    const ensured = await dispatchWorkerMessage(handlers, {
      id: 'req-html-template-options-ensure',
      method: 'conversationDraft.ensureDfcOptions',
      params: { conversationId: 'c1', assetId },
    })
    const options = (ensured as any).result.options as any[]
    const originalOption = options.find((option) => option.targetKind === 'original_file')
    const markdownOption = options.find((option) => option.targetKind === 'markdown')
    const codeOption = options.find((option) => option.targetKind === 'code')
    const derivativeRows = db.prepare(`
      SELECT id, storage_uri AS storageUri, meta_json AS metaJson
      FROM file_derivatives
      WHERE parent_asset_id=@assetId AND derived_kind='extracted_text'
      ORDER BY created_at ASC, rowid ASC
    `).all({ assetId }) as { id: string; storageUri: string; metaJson: string | null }[]
    const derivatives = derivativeRows.map((row) => ({
      ...row,
      meta: row.metaJson ? JSON.parse(row.metaJson) : null,
    }))
    const markdownDerivative = derivatives.find((row) => row.meta?.targetKind === 'markdown')!
    const codeDerivative = derivatives.find((row) => row.meta?.targetKind === 'code')!
    const markdownText = await readFile(path.join(storageRootDir, ...markdownDerivative.storageUri.split('/')), 'utf8')
    const codeText = await readFile(path.join(storageRootDir, ...codeDerivative.storageUri.split('/')), 'utf8')

    expect((ensured as any).result.selectedOptionId).toBeNull()
    expect((ensured as any).result.selectedAssetRefs).toEqual([])
    expect((ensured as any).result.decision).toMatchObject({
      status: 'needs_user_selection',
      reasonCode: 'selected_option_missing',
      selectedOptionId: null,
      targetKind: null,
      sendAssetRefs: [],
    })
    expect(originalOption).toMatchObject({
      targetKind: 'original_file',
      status: 'ready',
      sendAssetRefs: [{ kind: 'raw_file', assetId }],
    })
    expect(markdownOption).toMatchObject({
      targetKind: 'markdown',
      status: 'ready',
      sendAssetRefs: [{ kind: 'derived_asset', assetId: markdownDerivative.id }],
      warnings: expect.arrayContaining([
        'html_javascript_not_executed',
        'html_external_resources_not_loaded',
      ]),
    })
    expect(codeOption).toMatchObject({
      targetKind: 'code',
      status: 'ready',
      sendAssetRefs: [{ kind: 'derived_asset', assetId: codeDerivative.id }],
      warnings: [],
    })
    expect(markdownText).toContain('{{ title }}')
    expect(markdownText).toContain('{{ body }}')
    expect(markdownText).not.toContain('<template')
    expect(markdownText).not.toContain('v-if')
    expect(codeText).toBe(html)
    expect(JSON.stringify((ensured as any).result)).not.toContain(storageUri)
    expect(JSON.stringify((ensured as any).result)).not.toContain('asset-dfc-html-template-options-source-hash')
    expect(JSON.stringify((ensured as any).result)).not.toContain(html)

    await dispatchWorkerMessage(handlers, {
      id: 'req-html-template-options-select-code',
      method: 'conversationDraft.updateAttachmentSettings',
      params: {
        conversationId: 'c1',
        assetId,
        dfcManaged: true,
        selectedOptionId: codeOption.optionId,
        selectedAssetRefs: codeOption.sendAssetRefs,
      },
    })
    const codePreview = await dispatchWorkerMessage(handlers, {
      id: 'req-html-template-options-code-preview',
      method: 'conversationDraft.getDfcPreview',
      params: { conversationId: 'c1', assetId, maxCharacters: 512 },
    })
    const committed = await dispatchWorkerMessage(handlers, {
      id: 'req-html-template-options-commit-code',
      method: 'conversationDraft.commitToUserMessage',
      params: { conversationId: 'c1', body: 'send template html as code' },
    })

    expect(codePreview).toMatchObject({
      ok: true,
      result: {
        selectedOptionId: codeOption.optionId,
        selectedAssetRefs: codeOption.sendAssetRefs,
        targetKind: 'code',
        sendStrategy: 'text_in_prompt',
        decision: expect.objectContaining({
          status: 'ready',
          sendAssetRefs: codeOption.sendAssetRefs,
        }),
        preview: expect.objectContaining({
          kind: 'text',
          status: 'ready',
          text: codeText,
        }),
      },
    })
    expect(committed).toMatchObject({
      ok: true,
      result: {
        attachments: [
          expect.objectContaining({
            assetId,
            dfcManaged: true,
            usedOptionId: codeOption.optionId,
            usedAssetRefs: codeOption.sendAssetRefs,
            targetKind: 'code',
            sendStrategy: 'text_in_prompt',
          }),
        ],
      },
    })
    expect(JSON.stringify((codePreview as any).result)).not.toContain(storageUri)
    expect(JSON.stringify((codePreview as any).result)).not.toContain(codeDerivative.storageUri)
    expect(JSON.stringify((committed as any).result)).not.toContain(storageUri)
    expect(JSON.stringify((committed as any).result)).not.toContain(markdownDerivative.storageUri)
    expect(JSON.stringify((committed as any).result)).not.toContain(codeDerivative.storageUri)

    insertConvo(db, 'c-html-template-markdown')
    await dispatchWorkerMessage(handlers, {
      id: 'req-html-template-options-markdown-draft-add',
      method: 'conversationDraft.addAttachment',
      params: { conversationId: 'c-html-template-markdown', assetId },
    })
    await dispatchWorkerMessage(handlers, {
      id: 'req-html-template-options-select-markdown',
      method: 'conversationDraft.updateAttachmentSettings',
      params: {
        conversationId: 'c-html-template-markdown',
        assetId,
        dfcManaged: true,
        selectedOptionId: markdownOption.optionId,
        selectedAssetRefs: markdownOption.sendAssetRefs,
      },
    })
    const markdownPreview = await dispatchWorkerMessage(handlers, {
      id: 'req-html-template-options-markdown-preview',
      method: 'conversationDraft.getDfcPreview',
      params: { conversationId: 'c-html-template-markdown', assetId, maxCharacters: 512 },
    })
    const markdownCommitted = await dispatchWorkerMessage(handlers, {
      id: 'req-html-template-options-commit-markdown',
      method: 'conversationDraft.commitToUserMessage',
      params: { conversationId: 'c-html-template-markdown', body: 'send template html as safe markdown' },
    })

    expect(markdownPreview).toMatchObject({
      ok: true,
      result: {
        selectedOptionId: markdownOption.optionId,
        selectedAssetRefs: markdownOption.sendAssetRefs,
        targetKind: 'markdown',
        sendStrategy: 'text_in_prompt',
        decision: expect.objectContaining({
          status: 'ready',
          sendAssetRefs: markdownOption.sendAssetRefs,
        }),
        preview: expect.objectContaining({
          kind: 'text',
          status: 'ready',
          text: markdownText,
        }),
      },
    })
    expect(markdownCommitted).toMatchObject({
      ok: true,
      result: {
        attachments: [
          expect.objectContaining({
            assetId,
            dfcManaged: true,
            usedOptionId: markdownOption.optionId,
            usedAssetRefs: markdownOption.sendAssetRefs,
            targetKind: 'markdown',
            sendStrategy: 'text_in_prompt',
          }),
        ],
      },
    })
    expect(JSON.stringify((markdownPreview as any).result)).not.toContain(storageUri)
    expect(JSON.stringify((markdownPreview as any).result)).not.toContain(markdownDerivative.storageUri)
    expect(JSON.stringify((markdownCommitted as any).result)).not.toContain(storageUri)
    expect(JSON.stringify((markdownCommitted as any).result)).not.toContain(markdownDerivative.storageUri)
    expect(JSON.stringify((markdownCommitted as any).result)).not.toContain(codeDerivative.storageUri)
    expect(JSON.stringify((markdownCommitted as any).result)).not.toContain(html)

    insertConvo(db, 'c-html-template-original')
    await dispatchWorkerMessage(handlers, {
      id: 'req-html-template-options-original-draft-add',
      method: 'conversationDraft.addAttachment',
      params: { conversationId: 'c-html-template-original', assetId },
    })
    await dispatchWorkerMessage(handlers, {
      id: 'req-html-template-options-select-original',
      method: 'conversationDraft.updateAttachmentSettings',
      params: {
        conversationId: 'c-html-template-original',
        assetId,
        dfcManaged: true,
        selectedOptionId: originalOption.optionId,
        selectedAssetRefs: originalOption.sendAssetRefs,
      },
    })
    const originalPreview = await dispatchWorkerMessage(handlers, {
      id: 'req-html-template-options-original-preview',
      method: 'conversationDraft.getDfcPreview',
      params: { conversationId: 'c-html-template-original', assetId, maxCharacters: 512 },
    })
    const originalCommitted = await dispatchWorkerMessage(handlers, {
      id: 'req-html-template-options-commit-original',
      method: 'conversationDraft.commitToUserMessage',
      params: { conversationId: 'c-html-template-original', body: 'send template html as original file' },
    })

    expect(originalPreview).toMatchObject({
      ok: true,
      result: {
        selectedOptionId: originalOption.optionId,
        selectedAssetRefs: originalOption.sendAssetRefs,
        targetKind: 'original_file',
        sendStrategy: 'file_attachment',
        decision: expect.objectContaining({
          status: 'ready',
          sendAssetRefs: originalOption.sendAssetRefs,
        }),
        preview: expect.objectContaining({
          kind: 'raw_file',
          status: 'ready',
          text: null,
          diagnostics: [expect.objectContaining({ code: 'dfc_preview_raw_file_metadata_only' })],
        }),
      },
    })
    expect(originalCommitted).toMatchObject({
      ok: true,
      result: {
        attachments: [
          expect.objectContaining({
            assetId,
            dfcManaged: true,
            usedOptionId: originalOption.optionId,
            usedAssetRefs: originalOption.sendAssetRefs,
            targetKind: 'original_file',
            sendStrategy: 'file_attachment',
          }),
        ],
      },
    })
    expect(JSON.stringify((originalPreview as any).result)).not.toContain(storageUri)
    expect(JSON.stringify((originalPreview as any).result)).not.toContain(markdownDerivative.storageUri)
    expect(JSON.stringify((originalPreview as any).result)).not.toContain(codeDerivative.storageUri)
    expect(JSON.stringify((originalPreview as any).result)).not.toContain(html)
    expect(JSON.stringify((originalCommitted as any).result)).not.toContain(storageUri)
    expect(JSON.stringify((originalCommitted as any).result)).not.toContain(markdownDerivative.storageUri)
    expect(JSON.stringify((originalCommitted as any).result)).not.toContain(codeDerivative.storageUri)
    expect(JSON.stringify((originalCommitted as any).result)).not.toContain(html)
  })

  it('converts quoted CSV cells into table_markdown without splitting escaped content', async () => {
    const { db, handlers } = createWorkerHarness()
    const storageRootDir = path.resolve(process.cwd(), '.tmp-file-pipeline-worker-tests')
    const assetId = 'asset-dfc-csv-quoted-table'
    const storageUri = 'assets/original/cq/asset-dfc-csv-quoted-table.csv'
    const csv = 'name,notes\n"Alice, A","uses | pipe"\n"Bob","line 1\nline 2"\n'
    await mkdir(path.dirname(path.join(storageRootDir, ...storageUri.split('/'))), { recursive: true })
    await writeFile(path.join(storageRootDir, ...storageUri.split('/')), csv)
    await dispatchWorkerMessage(handlers, {
      id: 'req-csv-quoted-table-asset',
      method: 'fileAsset.create',
      params: {
        id: assetId,
        sha256: 'asset-dfc-csv-quoted-table-source-hash',
        filename: 'quoted.csv',
        extension: 'csv',
        mime: 'text/csv',
        sizeBytes: Buffer.byteLength(csv, 'utf8'),
        assetKind: 'text',
        sourceKind: 'local_upload',
        storageUri,
        ingestStatus: 'stored',
      },
    })
    await dispatchWorkerMessage(handlers, {
      id: 'req-csv-quoted-table-draft-add',
      method: 'conversationDraft.addAttachment',
      params: { conversationId: 'c1', assetId },
    })

    const ensured = await dispatchWorkerMessage(handlers, {
      id: 'req-csv-quoted-table-ensure',
      method: 'conversationDraft.ensureDfcOptions',
      params: { conversationId: 'c1', assetId },
    })

    const tableOption = (ensured as any).result.options.find((option: any) => option.targetKind === 'table_markdown')
    const derivativeRow = db.prepare(`
      SELECT id, storage_uri AS storageUri, meta_json AS metaJson
      FROM file_derivatives
      WHERE parent_asset_id=@assetId AND derived_kind='extracted_text'
      LIMIT 1
    `).get({ assetId }) as { id: string; storageUri: string; metaJson: string | null }
    const converted = await readFile(path.join(storageRootDir, ...derivativeRow.storageUri.split('/')), 'utf8')
    const derivativeMeta = derivativeRow.metaJson ? JSON.parse(derivativeRow.metaJson) : null

    expect(converted).toBe('| name | notes |\n| --- | --- |\n| Alice, A | uses \\| pipe |\n| Bob | line 1<br>line 2 |')
    expect(derivativeMeta).toMatchObject({
      targetKind: 'table_markdown',
      usage: 'preview_and_send',
      storageClass: 'draft_bound',
      converterName: 'starverse-text-derivative',
    })
    expect(tableOption).toMatchObject({
      optionId: `dfc:${assetId}:table_markdown:derived_asset:${derivativeRow.id}`,
      status: 'ready',
      isAvailable: true,
      sendAssetRefs: [{ kind: 'derived_asset', assetId: derivativeRow.id }],
    })
    expect(JSON.stringify((ensured as any).result)).not.toContain(storageUri)
    expect(JSON.stringify((ensured as any).result)).not.toContain(derivativeRow.storageUri)
    expect(JSON.stringify((ensured as any).result)).not.toContain('asset-dfc-csv-quoted-table-source-hash')
  })

  it('converts UTF-16LE BOM TSV assets through explicit DFC table_markdown ensure', async () => {
    const { db, handlers } = createWorkerHarness()
    const storageRootDir = path.resolve(process.cwd(), '.tmp-file-pipeline-worker-tests')
    const assetId = 'asset-dfc-tsv-utf16le'
    const storageUri = 'assets/original/u1/asset-dfc-tsv-utf16le.tsv'
    const tsvText = 'name\tage\nalice\t30\n'
    const tsvBytes = Buffer.from(`\ufeff${tsvText}`, 'utf16le')
    await mkdir(path.dirname(path.join(storageRootDir, ...storageUri.split('/'))), { recursive: true })
    await writeFile(path.join(storageRootDir, ...storageUri.split('/')), tsvBytes)
    await dispatchWorkerMessage(handlers, {
      id: 'req-tsv-utf16le-asset',
      method: 'fileAsset.create',
      params: {
        id: assetId,
        sha256: 'asset-dfc-tsv-utf16le-source-hash',
        filename: 'utf16.tsv',
        extension: 'tsv',
        mime: 'text/tab-separated-values',
        sizeBytes: tsvBytes.byteLength,
        assetKind: 'text',
        sourceKind: 'local_upload',
        storageUri,
        ingestStatus: 'stored',
      },
    })
    await dispatchWorkerMessage(handlers, {
      id: 'req-tsv-utf16le-draft-add',
      method: 'conversationDraft.addAttachment',
      params: { conversationId: 'c1', assetId },
    })

    const ensured = await dispatchWorkerMessage(handlers, {
      id: 'req-tsv-utf16le-ensure',
      method: 'conversationDraft.ensureDfcOptions',
      params: { conversationId: 'c1', assetId },
    })

    const tableOption = (ensured as any).result.options.find((option: any) => option.targetKind === 'table_markdown')
    const derivativeRow = db.prepare(`
      SELECT id, storage_uri AS storageUri, meta_json AS metaJson
      FROM file_derivatives
      WHERE parent_asset_id=@assetId AND derived_kind='extracted_text'
      LIMIT 1
    `).get({ assetId }) as { id: string; storageUri: string; metaJson: string | null }
    const converted = await readFile(path.join(storageRootDir, ...derivativeRow.storageUri.split('/')), 'utf8')
    const derivativeMeta = derivativeRow.metaJson ? JSON.parse(derivativeRow.metaJson) : null

    expect(converted).toBe('| name | age |\n| --- | --- |\n| alice | 30 |')
    expect(derivativeMeta).toMatchObject({
      targetKind: 'table_markdown',
      sourceEncoding: 'utf-16le',
      usage: 'preview_and_send',
      storageClass: 'draft_bound',
    })
    expect(tableOption).toMatchObject({
      optionId: `dfc:${assetId}:table_markdown:derived_asset:${derivativeRow.id}`,
      status: 'ready',
      isAvailable: true,
      sendAssetRefs: [{ kind: 'derived_asset', assetId: derivativeRow.id }],
    })
    expect(JSON.stringify((ensured as any).result)).not.toContain(storageUri)
    expect(JSON.stringify((ensured as any).result)).not.toContain(derivativeRow.storageUri)
    expect(JSON.stringify((ensured as any).result)).not.toContain('asset-dfc-tsv-utf16le-source-hash')
  })

  it('converts UTF-16BE BOM TSV assets through explicit DFC table_markdown ensure', async () => {
    const { db, handlers } = createWorkerHarness()
    const storageRootDir = path.resolve(process.cwd(), '.tmp-file-pipeline-worker-tests')
    const assetId = 'asset-dfc-tsv-utf16be'
    const storageUri = 'assets/original/u2/asset-dfc-tsv-utf16be.tsv'
    const tsvText = 'name\tage\nbob\t41\n'
    const tsvBytes = utf16beWithBom(tsvText)
    await mkdir(path.dirname(path.join(storageRootDir, ...storageUri.split('/'))), { recursive: true })
    await writeFile(path.join(storageRootDir, ...storageUri.split('/')), tsvBytes)
    await dispatchWorkerMessage(handlers, {
      id: 'req-tsv-utf16be-asset',
      method: 'fileAsset.create',
      params: {
        id: assetId,
        sha256: 'asset-dfc-tsv-utf16be-source-hash',
        filename: 'utf16be.tsv',
        extension: 'tsv',
        mime: 'text/tab-separated-values',
        sizeBytes: tsvBytes.byteLength,
        assetKind: 'text',
        sourceKind: 'local_upload',
        storageUri,
        ingestStatus: 'stored',
      },
    })
    await dispatchWorkerMessage(handlers, {
      id: 'req-tsv-utf16be-draft-add',
      method: 'conversationDraft.addAttachment',
      params: { conversationId: 'c1', assetId },
    })

    const ensured = await dispatchWorkerMessage(handlers, {
      id: 'req-tsv-utf16be-ensure',
      method: 'conversationDraft.ensureDfcOptions',
      params: { conversationId: 'c1', assetId },
    })

    const tableOption = (ensured as any).result.options.find((option: any) => option.targetKind === 'table_markdown')
    const derivativeRow = db.prepare(`
      SELECT id, storage_uri AS storageUri, meta_json AS metaJson
      FROM file_derivatives
      WHERE parent_asset_id=@assetId AND derived_kind='extracted_text'
      LIMIT 1
    `).get({ assetId }) as { id: string; storageUri: string; metaJson: string | null }
    const converted = await readFile(path.join(storageRootDir, ...derivativeRow.storageUri.split('/')), 'utf8')
    const derivativeMeta = derivativeRow.metaJson ? JSON.parse(derivativeRow.metaJson) : null

    expect(converted).toBe('| name | age |\n| --- | --- |\n| bob | 41 |')
    expect(derivativeMeta).toMatchObject({
      targetKind: 'table_markdown',
      sourceEncoding: 'utf-16be',
      usage: 'preview_and_send',
      storageClass: 'draft_bound',
    })
    expect(tableOption).toMatchObject({
      optionId: `dfc:${assetId}:table_markdown:derived_asset:${derivativeRow.id}`,
      status: 'ready',
      isAvailable: true,
      sendAssetRefs: [{ kind: 'derived_asset', assetId: derivativeRow.id }],
    })
    expect(JSON.stringify((ensured as any).result)).not.toContain(storageUri)
    expect(JSON.stringify((ensured as any).result)).not.toContain(derivativeRow.storageUri)
    expect(JSON.stringify((ensured as any).result)).not.toContain('asset-dfc-tsv-utf16be-source-hash')
  })

  it('fails closed for UTF-16 TSV assets without an explicit BOM', async () => {
    const { db, handlers } = createWorkerHarness()
    const storageRootDir = path.resolve(process.cwd(), '.tmp-file-pipeline-worker-tests')
    const assetId = 'asset-dfc-tsv-utf16-no-bom'
    const storageUri = 'assets/original/u3/asset-dfc-tsv-utf16-no-bom.tsv'
    const tsvText = 'name\tage\nchris\t52\n'
    const tsvBytes = Buffer.from(tsvText, 'utf16le')
    await mkdir(path.dirname(path.join(storageRootDir, ...storageUri.split('/'))), { recursive: true })
    await writeFile(path.join(storageRootDir, ...storageUri.split('/')), tsvBytes)
    await dispatchWorkerMessage(handlers, {
      id: 'req-tsv-utf16-no-bom-asset',
      method: 'fileAsset.create',
      params: {
        id: assetId,
        sha256: 'asset-dfc-tsv-utf16-no-bom-source-hash',
        filename: 'utf16-no-bom.tsv',
        extension: 'tsv',
        mime: 'text/tab-separated-values',
        sizeBytes: tsvBytes.byteLength,
        assetKind: 'text',
        sourceKind: 'local_upload',
        storageUri,
        ingestStatus: 'stored',
      },
    })
    await dispatchWorkerMessage(handlers, {
      id: 'req-tsv-utf16-no-bom-draft-add',
      method: 'conversationDraft.addAttachment',
      params: { conversationId: 'c1', assetId },
    })

    const ensured = await dispatchWorkerMessage(handlers, {
      id: 'req-tsv-utf16-no-bom-ensure',
      method: 'conversationDraft.ensureDfcOptions',
      params: { conversationId: 'c1', assetId },
    })

    const failedOption = (ensured as any).result.options.find((option: any) => option.targetKind === 'table_markdown')
    const derivativeCount = db.prepare(`
      SELECT COUNT(*) AS count
      FROM file_derivatives
      WHERE parent_asset_id=@assetId
    `).get({ assetId }) as { count: number }
    const failedJob = db.prepare(`
      SELECT status, error_code AS errorCode, error_message AS errorMessage
      FROM derivative_jobs
      WHERE asset_id=@assetId AND derivative_kind='extracted_text'
      LIMIT 1
    `).get({ assetId }) as { status: string; errorCode: string | null; errorMessage: string | null }
    const generationState = db.prepare(`
      SELECT status, target_kind AS targetKind, output_derivative_id AS outputDerivativeId, error_code AS errorCode
      FROM dfc_option_generation_states
      WHERE asset_id=@assetId AND target_kind='table_markdown' AND conversion_settings_hash=@settingsHash
      LIMIT 1
    `).get({ assetId, settingsHash: dfcSettingsHash('table_markdown') }) as {
      status: string
      targetKind: string
      outputDerivativeId: string | null
      errorCode: string | null
    }

    expect(failedOption).toMatchObject({
      optionId: `dfc:${assetId}:table_markdown:failed`,
      status: 'failed',
      isAvailable: false,
      compatibilityStatus: 'blocked',
      sendAssetRefs: [],
      diagnostics: [expect.objectContaining({ code: 'derivative_input_missing' })],
    })
    expect(derivativeCount.count).toBe(0)
    expect(failedJob).toMatchObject({
      status: 'failed',
      errorCode: 'derivative_input_missing',
    })
    expect(generationState).toMatchObject({
      status: 'failed',
      targetKind: 'table_markdown',
      outputDerivativeId: null,
      errorCode: 'derivative_input_missing',
    })
    expect(JSON.stringify((ensured as any).result)).not.toContain(storageUri)
    expect(JSON.stringify((ensured as any).result)).not.toContain('asset-dfc-tsv-utf16-no-bom-source-hash')
    expect(JSON.stringify((ensured as any).result)).not.toContain('Input appears to be binary')
  })

  it('fails closed for invalid UTF-8 table assets without leaking decoder details', async () => {
    const { db, handlers } = createWorkerHarness()
    const storageRootDir = path.resolve(process.cwd(), '.tmp-file-pipeline-worker-tests')
    const assetId = 'asset-dfc-csv-invalid-utf8'
    const storageUri = 'assets/original/u4/asset-dfc-csv-invalid-utf8.csv'
    const csvBytes = Buffer.from([0x6e, 0x61, 0x6d, 0x65, 0x2c, 0x61, 0x67, 0x65, 0x0a, 0xc3, 0x28, 0x2c, 0x31, 0x0a])
    await mkdir(path.dirname(path.join(storageRootDir, ...storageUri.split('/'))), { recursive: true })
    await writeFile(path.join(storageRootDir, ...storageUri.split('/')), csvBytes)
    await dispatchWorkerMessage(handlers, {
      id: 'req-csv-invalid-utf8-asset',
      method: 'fileAsset.create',
      params: {
        id: assetId,
        sha256: 'asset-dfc-csv-invalid-utf8-source-hash',
        filename: 'invalid-utf8.csv',
        extension: 'csv',
        mime: 'text/csv',
        sizeBytes: csvBytes.byteLength,
        assetKind: 'text',
        sourceKind: 'local_upload',
        storageUri,
        ingestStatus: 'stored',
      },
    })
    await dispatchWorkerMessage(handlers, {
      id: 'req-csv-invalid-utf8-draft-add',
      method: 'conversationDraft.addAttachment',
      params: { conversationId: 'c1', assetId },
    })

    const ensured = await dispatchWorkerMessage(handlers, {
      id: 'req-csv-invalid-utf8-ensure',
      method: 'conversationDraft.ensureDfcOptions',
      params: { conversationId: 'c1', assetId },
    })

    const failedOption = (ensured as any).result.options.find((option: any) => option.targetKind === 'table_markdown')
    const derivativeCount = db.prepare(`
      SELECT COUNT(*) AS count
      FROM file_derivatives
      WHERE parent_asset_id=@assetId
    `).get({ assetId }) as { count: number }
    const failedJob = db.prepare(`
      SELECT status, error_code AS errorCode, error_message AS errorMessage
      FROM derivative_jobs
      WHERE asset_id=@assetId AND derivative_kind='extracted_text'
      LIMIT 1
    `).get({ assetId }) as { status: string; errorCode: string | null; errorMessage: string | null }
    const generationState = db.prepare(`
      SELECT status, target_kind AS targetKind, output_derivative_id AS outputDerivativeId, error_code AS errorCode
      FROM dfc_option_generation_states
      WHERE asset_id=@assetId AND target_kind='table_markdown' AND conversion_settings_hash=@settingsHash
      LIMIT 1
    `).get({ assetId, settingsHash: dfcSettingsHash('table_markdown') }) as {
      status: string
      targetKind: string
      outputDerivativeId: string | null
      errorCode: string | null
    }
    const assetRow = db.prepare(`
      SELECT source_meta_json AS sourceMetaJson
      FROM file_assets
      WHERE id=@assetId
      LIMIT 1
    `).get({ assetId }) as { sourceMetaJson: string | null }
    const assetMeta = assetRow.sourceMetaJson ? JSON.parse(assetRow.sourceMetaJson) : null
    const dtoJson = JSON.stringify((ensured as any).result)

    expect(failedOption).toMatchObject({
      optionId: `dfc:${assetId}:table_markdown:failed`,
      status: 'failed',
      isAvailable: false,
      compatibilityStatus: 'blocked',
      sendAssetRefs: [],
      diagnostics: [expect.objectContaining({ code: 'derivative_input_missing' })],
    })
    expect(derivativeCount.count).toBe(0)
    expect(failedJob).toMatchObject({
      status: 'failed',
      errorCode: 'derivative_input_missing',
      errorMessage: 'Derivative input could not be decoded.',
    })
    expect(generationState).toMatchObject({
      status: 'failed',
      targetKind: 'table_markdown',
      outputDerivativeId: null,
      errorCode: 'derivative_input_missing',
    })
    expect(assetMeta?.textConversion).toMatchObject({
      status: 'failed',
      errorCode: 'derivative_input_missing',
      errorMessage: 'Derivative input could not be decoded.',
      dfcOptionExposed: true,
      targetKind: 'table_markdown',
    })
    expect(JSON.stringify(assetMeta)).not.toContain('encoded data')
    expect(JSON.stringify(assetMeta)).not.toContain('utf-8')
    expect(dtoJson).not.toContain(storageUri)
    expect(dtoJson).not.toContain('asset-dfc-csv-invalid-utf8-source-hash')
    expect(dtoJson).not.toContain('encoded data')
    expect(dtoJson).not.toContain('utf-8')
  })

  it('does not generate forbidden DFC runtime options through ensure endpoint', async () => {
    const { db, handlers } = createWorkerHarness()
    const assetId = 'asset-pdf-explicit-dfc'
    await dispatchWorkerMessage(handlers, {
      id: 'req-pdf-explicit-asset',
      method: 'fileAsset.create',
      params: {
        id: assetId,
        sha256: 'asset-pdf-explicit-source-hash',
        filename: 'manual.pdf',
        extension: 'pdf',
        mime: 'application/pdf',
        sizeBytes: 32,
        assetKind: 'document',
        sourceKind: 'local_upload',
        storageUri: 'assets/original/pd/asset-pdf-explicit-dfc.pdf',
        ingestStatus: 'stored',
      },
    })
    await dispatchWorkerMessage(handlers, {
      id: 'req-pdf-explicit-draft-add',
      method: 'conversationDraft.addAttachment',
      params: { conversationId: 'c1', assetId },
    })

    const ensured = await dispatchWorkerMessage(handlers, {
      id: 'req-pdf-explicit-ensure',
      method: 'conversationDraft.ensureDfcOptions',
      params: { conversationId: 'c1', assetId },
    })

    expect(ensured).toMatchObject({
      ok: true,
      result: {
        options: [expect.objectContaining({
          targetKind: 'original_file',
          sendAssetRefs: [{ kind: 'raw_file', assetId }],
        })],
      },
    })
    const derivativeCount = db.prepare(`
      SELECT COUNT(*) AS count
      FROM file_derivatives
      WHERE parent_asset_id=@assetId
    `).get({ assetId }) as { count: number }
    expect(derivativeCount.count).toBe(0)
  })

  it('keeps legacy XLS outside the XLSX-first table_markdown pilot', async () => {
    const { db, handlers } = createWorkerHarness()
    const assetId = 'asset-xls-explicit-dfc'
    await dispatchWorkerMessage(handlers, {
      id: 'req-xls-explicit-asset',
      method: 'fileAsset.create',
      params: {
        id: assetId,
        sha256: 'asset-xls-explicit-source-hash',
        filename: 'legacy.xls',
        extension: 'xls',
        mime: 'application/vnd.ms-excel',
        sizeBytes: 32,
        assetKind: 'document',
        sourceKind: 'local_upload',
        storageUri: 'assets/original/xl/asset-xls-explicit-dfc.xls',
        ingestStatus: 'stored',
      },
    })
    await dispatchWorkerMessage(handlers, {
      id: 'req-xls-explicit-draft-add',
      method: 'conversationDraft.addAttachment',
      params: { conversationId: 'c1', assetId },
    })

    const ensured = await dispatchWorkerMessage(handlers, {
      id: 'req-xls-explicit-ensure',
      method: 'conversationDraft.ensureDfcOptions',
      params: { conversationId: 'c1', assetId },
    })

    expect(ensured).toMatchObject({
      ok: true,
      result: {
        options: [expect.objectContaining({
          targetKind: 'original_file',
          sendAssetRefs: [{ kind: 'raw_file', assetId }],
        })],
      },
    })
    expect((ensured as any).result.options.some((option: any) => option.targetKind === 'table_markdown')).toBe(false)
    const derivativeCount = db.prepare(`
      SELECT COUNT(*) AS count
      FROM file_derivatives
      WHERE parent_asset_id=@assetId
    `).get({ assetId }) as { count: number }
    expect(derivativeCount.count).toBe(0)
    expect(JSON.stringify((ensured as any).result)).not.toContain('asset-xls-explicit-source-hash')
    expect(JSON.stringify((ensured as any).result)).not.toContain('assets/original/xl/asset-xls-explicit-dfc.xls')
  })

  it('does not generate Phase 1 DFC derivatives for non-local source assets through ensure endpoint', async () => {
    const { db, handlers } = createWorkerHarness()
    const assetId = 'asset-remote-text-dfc'
    const created = await dispatchWorkerMessage(handlers, {
      id: 'req-remote-text-asset',
      method: 'fileAsset.create',
      params: {
        id: assetId,
        sha256: 'asset-remote-text-source-hash',
        filename: 'remote.txt',
        extension: 'txt',
        mime: 'text/plain',
        sizeBytes: 16,
        assetKind: 'text',
        sourceKind: 'url_import',
        storageBackend: 'remote_url',
        storageUri: 'https://example.invalid/remote.txt',
        ingestStatus: 'stored',
      },
    })
    expect(created.ok).toBe(true)
    await dispatchWorkerMessage(handlers, {
      id: 'req-remote-text-draft-add',
      method: 'conversationDraft.addAttachment',
      params: { conversationId: 'c1', assetId },
    })

    const ensured = await dispatchWorkerMessage(handlers, {
      id: 'req-remote-text-ensure',
      method: 'conversationDraft.ensureDfcOptions',
      params: { conversationId: 'c1', assetId },
    })

    expect(ensured).toMatchObject({
      ok: true,
      result: {
        options: [expect.objectContaining({
          targetKind: 'original_file',
          sendAssetRefs: [{ kind: 'raw_file', assetId }],
        })],
      },
    })
    const derivativeCount = db.prepare(`
      SELECT COUNT(*) AS count
      FROM file_derivatives
      WHERE parent_asset_id=@assetId
    `).get({ assetId }) as { count: number }
    const jobCount = db.prepare(`
      SELECT COUNT(*) AS count
      FROM derivative_jobs
      WHERE asset_id=@assetId
    `).get({ assetId }) as { count: number }
    expect(derivativeCount.count).toBe(0)
    expect(jobCount.count).toBe(0)
  })

  it('returns sanitized failed DFC options when explicit ensure generation fails', async () => {
    const { db, handlers } = createWorkerHarness()
    const assetId = 'asset-missing-text-dfc'
    const storageUri = 'assets/original/mi/asset-missing-text-dfc.txt'
    await dispatchWorkerMessage(handlers, {
      id: 'req-missing-text-asset',
      method: 'fileAsset.create',
      params: {
        id: assetId,
        sha256: 'asset-missing-text-source-hash',
        filename: 'missing.txt',
        extension: 'txt',
        mime: 'text/plain',
        sizeBytes: 16,
        assetKind: 'text',
        sourceKind: 'local_upload',
        storageBackend: 'local_fs',
        storageUri,
        ingestStatus: 'stored',
      },
    })
    await dispatchWorkerMessage(handlers, {
      id: 'req-missing-text-draft-add',
      method: 'conversationDraft.addAttachment',
      params: { conversationId: 'c1', assetId },
    })

    const ensured = await dispatchWorkerMessage(handlers, {
      id: 'req-missing-text-ensure',
      method: 'conversationDraft.ensureDfcOptions',
      params: { conversationId: 'c1', assetId },
    })

    expect(ensured).toMatchObject({
      ok: true,
      result: {
        decision: expect.objectContaining({
          status: 'needs_user_selection',
          reasonCode: 'selected_option_missing',
        }),
      },
    })
    const failedOption = (ensured as any).result.options.find((option: any) => option.targetKind === 'plain_text')
    expect(failedOption).toMatchObject({
      optionId: `dfc:${assetId}:plain_text:failed`,
      status: 'failed',
      isAvailable: false,
      compatibilityStatus: 'blocked',
      sendAssetRefs: [],
      diagnostics: [expect.objectContaining({ code: 'derivative_local_file_missing' })],
    })
    expect(JSON.stringify((ensured as any).result)).not.toContain(storageUri)
    expect(JSON.stringify((ensured as any).result)).not.toContain('asset-missing-text-source-hash')
    expect(JSON.stringify((ensured as any).result)).not.toContain('Asset local file copy is missing')

    const derivativeCount = db.prepare(`
      SELECT COUNT(*) AS count
      FROM file_derivatives
      WHERE parent_asset_id=@assetId
    `).get({ assetId }) as { count: number }
    const failedJob = db.prepare(`
      SELECT status, error_code AS errorCode
      FROM derivative_jobs
      WHERE asset_id=@assetId AND derivative_kind='extracted_text'
      LIMIT 1
    `).get({ assetId }) as { status: string; errorCode: string | null }
    const assetRow = db.prepare(`
      SELECT source_meta_json AS sourceMetaJson
      FROM file_assets
      WHERE id=@assetId
      LIMIT 1
    `).get({ assetId }) as { sourceMetaJson: string | null }
    const assetMeta = assetRow.sourceMetaJson ? JSON.parse(assetRow.sourceMetaJson) : null
    expect(derivativeCount.count).toBe(0)
    expect(failedJob).toMatchObject({
      status: 'failed',
      errorCode: 'derivative_local_file_missing',
    })
    expect(assetMeta?.textConversion).toMatchObject({
      status: 'failed',
      dfcOptionExposed: true,
      targetKind: 'plain_text',
      converterName: 'starverse-text-derivative',
    })

    const selected = await dispatchWorkerMessage(handlers, {
      id: 'req-missing-text-select-failed',
      method: 'conversationDraft.updateAttachmentSettings',
      params: {
        conversationId: 'c1',
        assetId,
        dfcManaged: true,
        selectedOptionId: failedOption.optionId,
        selectedAssetRefs: failedOption.sendAssetRefs,
      },
    })
    expect(selected).toMatchObject({
      ok: false,
      error: expect.objectContaining({
        message: expect.stringContaining('DFC selectedOptionId requires selectedAssetRefs'),
      }),
    })
  })

  it('marks selected DFC derivatives failed when explicit ensure finds storage unreadable', async () => {
    const { db, handlers } = createWorkerHarness()
    const storageRootDir = path.resolve(process.cwd(), '.tmp-file-pipeline-worker-tests')
    const assetId = 'asset-csv-storage-failed-dfc'
    const storageUri = 'assets/original/sf/asset-csv-storage-failed-dfc.csv'
    await mkdir(path.dirname(path.join(storageRootDir, ...storageUri.split('/'))), { recursive: true })
    await writeFile(path.join(storageRootDir, ...storageUri.split('/')), 'name,age\nalice,30\n')
    await dispatchWorkerMessage(handlers, {
      id: 'req-storage-failed-asset',
      method: 'fileAsset.create',
      params: {
        id: assetId,
        sha256: 'asset-csv-storage-failed-source-hash',
        filename: 'data.csv',
        extension: 'csv',
        mime: 'text/csv',
        sizeBytes: 18,
        assetKind: 'text',
        sourceKind: 'local_upload',
        storageUri,
        ingestStatus: 'stored',
      },
    })
    await dispatchWorkerMessage(handlers, {
      id: 'req-storage-failed-draft-add',
      method: 'conversationDraft.addAttachment',
      params: { conversationId: 'c1', assetId },
    })
    const firstEnsure = await dispatchWorkerMessage(handlers, {
      id: 'req-storage-failed-ensure-first',
      method: 'conversationDraft.ensureDfcOptions',
      params: { conversationId: 'c1', assetId },
    })
    const tableOption = (firstEnsure as any).result.options.find((option: any) => option.targetKind === 'table_markdown')
    await dispatchWorkerMessage(handlers, {
      id: 'req-storage-failed-select',
      method: 'conversationDraft.updateAttachmentSettings',
      params: {
        conversationId: 'c1',
        assetId,
        dfcManaged: true,
        selectedOptionId: tableOption.optionId,
        selectedAssetRefs: tableOption.sendAssetRefs,
      },
    })
    const derivativeId = tableOption.sendAssetRefs[0].assetId
    const derivativeRow = db.prepare(`
      SELECT storage_uri AS storageUri
      FROM file_derivatives
      WHERE id=@derivativeId
      LIMIT 1
    `).get({ derivativeId }) as { storageUri: string }
    await rm(path.join(storageRootDir, ...derivativeRow.storageUri.split('/')), { force: true })

    const secondEnsure = await dispatchWorkerMessage(handlers, {
      id: 'req-storage-failed-ensure-second',
      method: 'conversationDraft.ensureDfcOptions',
      params: { conversationId: 'c1', assetId },
    })

    const failedOption = (secondEnsure as any).result.options.find((option: any) => option.optionId === tableOption.optionId)
    const failedDerivative = db.prepare(`
      SELECT status, meta_json AS metaJson
      FROM file_derivatives
      WHERE id=@derivativeId
      LIMIT 1
    `).get({ derivativeId }) as { status: string; metaJson: string | null }
    expect(secondEnsure).toMatchObject({
      ok: true,
      result: {
        selectedOptionId: tableOption.optionId,
        selectedAssetRefs: tableOption.sendAssetRefs,
        decision: expect.objectContaining({
          status: 'failed',
          reasonCode: 'selected_option_failed',
          targetKind: 'table_markdown',
          sendAssetRefs: [],
        }),
      },
    })
    expect(failedOption).toMatchObject({
      status: 'failed',
      isAvailable: false,
      compatibilityStatus: 'blocked',
      sendAssetRefs: tableOption.sendAssetRefs,
      diagnostics: [expect.objectContaining({ code: 'derivative_local_file_read_failed' })],
    })
    expect(failedDerivative.status).toBe('failed')
    expect(JSON.parse(failedDerivative.metaJson ?? '{}')).toMatchObject({
      targetKind: 'table_markdown',
      failureCode: 'derivative_local_file_read_failed',
    })
    expect(JSON.stringify((secondEnsure as any).result)).not.toContain(derivativeRow.storageUri)
    expect(JSON.stringify((secondEnsure as any).result)).not.toContain('asset-csv-storage-failed-source-hash')
  })

  it('keeps PDF direct send available when extracted text is unsupported', async () => {
    const { db, handlers } = createWorkerHarness()
    const storageRootDir = path.resolve(process.cwd(), '.tmp-file-pipeline-worker-tests')
    const assetId = 'asset-pdf-direct'
    const storageUri = 'assets/original/as/asset-pdf-direct.pdf'
    await dispatchWorkerMessage(handlers, {
      id: 'req-pdf-asset',
      method: 'fileAsset.create',
      params: {
        id: assetId,
        sha256: 'sha-pdf-direct',
        filename: 'manual.pdf',
        extension: 'pdf',
        mime: 'application/pdf',
        sizeBytes: 32,
        assetKind: 'document',
        sourceKind: 'local_upload',
        storageBackend: 'local_fs',
        storageUri,
        ingestStatus: 'stored',
        previewStatus: 'not_requested',
      },
    })
    await mkdir(path.dirname(path.join(storageRootDir, ...storageUri.split('/'))), { recursive: true })
    await writeFile(path.join(storageRootDir, ...storageUri.split('/')), Buffer.from('%PDF-1.7\n1 0 obj\n<<>>\nendobj\n'))
    await dispatchWorkerMessage(handlers, {
      id: 'req-pdf-draft-add',
      method: 'conversationDraft.addAttachment',
      params: { conversationId: 'c1', assetId },
    })
    db.prepare(`
      UPDATE draft_attachments
      SET ai_payload_kind = 'pdf',
          processing_status = 'native_supported'
      WHERE asset_id = @assetId
    `).run({ assetId })

    const planResult = await dispatchWorkerMessage(handlers, {
      id: 'req-pdf-send-plan',
      method: 'sendPlan.buildCurrent',
      params: {
        conversationId: 'c1',
        draftText: 'send pdf',
        model: {
          providerKey: 'openrouter',
          modelId: 'test/pdf',
          modelKey: 'openrouter::test/pdf',
          inputModalities: ['text', 'file'],
          outputModalities: ['text'],
        },
        providerContext: {
          providerKey: 'openrouter',
          supportsInlineData: true,
          supportsPdfInputs: true,
          supportsPdfUrlRef: true,
          supportsTextUrlRef: true,
        },
      },
    })

    expect(planResult).toMatchObject({
      ok: true,
      result: {
        sendPlan: expect.objectContaining({
          status: 'sendable',
          includedAttachments: [
            expect.objectContaining({
              assetId,
            }),
          ],
          excludedAttachments: [],
          attachmentPlans: [
            expect.objectContaining({
              assetId,
              eligibility: 'included',
              selectedSendMode: 'inline_base64',
              fileType: expect.objectContaining({
                recommendedRoute: 'direct_file',
                blocked: false,
              }),
              detection: expect.objectContaining({
                routeEligibility: 'verdict_ready',
              }),
            }),
          ],
        }),
      },
    })
    const row = db.prepare(`
      SELECT source_meta_json AS sourceMetaJson
      FROM file_assets
      WHERE id = @assetId
      LIMIT 1
    `).get({ assetId }) as { sourceMetaJson: string | null }
    const meta = row.sourceMetaJson ? JSON.parse(row.sourceMetaJson) : null
    expect(meta?.textConversion).toMatchObject({
      status: 'failed',
      errorCode: 'derivative_asset_not_supported',
    })
    expect(meta?.lineage?.stale).not.toBe(true)
    expect(meta?.lineage?.sendAssetReady).not.toBe(false)
  })

  it('routes OpenRouter preparation through the worker-side serializer', async () => {
    const { handlers } = createWorkerHarness()
    const storageRootDir = path.resolve(process.cwd(), '.tmp-file-pipeline-worker-tests')
    const assetId = 'asset-openrouter'
    const storageUri = 'assets/original/as/asset-openrouter.png'

    await dispatchWorkerMessage(handlers, {
      id: 'req-asset-openrouter',
      method: 'fileAsset.create',
      params: {
        id: assetId,
        sha256: 'sha-openrouter',
        filename: 'asset-openrouter.png',
        extension: 'png',
        mime: 'image/png',
        sizeBytes: 4,
        assetKind: 'image',
        sourceKind: 'local_upload',
        storageBackend: 'local_fs',
        storageUri,
        ingestStatus: 'stored',
        previewStatus: 'not_requested',
        sourceMetaJson: null,
      },
    })

    await mkdir(path.dirname(path.join(storageRootDir, ...storageUri.split('/'))), { recursive: true })
    await writeFile(path.join(storageRootDir, ...storageUri.split('/')), new Uint8Array([0x89, 0x50, 0x4e, 0x47]))

    await dispatchWorkerMessage(handlers, {
      id: 'req-openrouter-draft-add',
      method: 'conversationDraft.addAttachment',
      params: { conversationId: 'c1', assetId },
    })

    const prepared = await dispatchWorkerMessage(handlers, {
      id: 'req-openrouter-prepare',
      method: 'sendPlan.prepareOpenRouter',
      params: {
        conversationId: 'c1',
        draftText: 'describe this image',
        historyMessageIds: ['m1'],
        model: {
          providerKey: 'openrouter',
          modelId: 'openai/gpt-4o',
          modelKey: 'openrouter::openai/gpt-4o',
          inputModalities: ['text', 'image', 'file'],
        },
        providerContext: {
          providerKey: 'openrouter',
          supportsInlineData: true,
        },
      },
    })

    expect(prepared).toMatchObject({
      ok: true,
      result: expect.objectContaining({
        sendPlan: expect.objectContaining({ status: 'blocked' }),
        contentParts: [],
        diagnostics: expect.objectContaining({
          sendPlanStatus: 'blocked',
          attachmentErrors: [
            expect.objectContaining({
              code: 'file_type_detection_required',
              assetId,
            }),
          ],
        }),
      }),
    })
  })

  it('routes derivative job creation, listing, and cancellation methods', async () => {
    const { handlers } = createWorkerHarness()
    await createWorkerAsset(handlers)

    const created = await dispatchWorkerMessage(handlers, {
      id: 'req-job-create',
      method: 'derivativeJob.create',
      params: {
        id: 'job-1',
        assetId: 'asset-1',
        derivativeKind: 'extracted_text',
        taskFamily: 'chat_context',
        generator: 'phase-7-test',
      },
    })
    expect(created).toMatchObject({
      ok: true,
      result: expect.objectContaining({ id: 'job-1', status: 'pending' }),
    })

    const listed = await dispatchWorkerMessage(handlers, {
      id: 'req-job-list',
      method: 'derivativeJob.listByAssetId',
      params: { assetId: 'asset-1' },
    })
    expect(listed).toMatchObject({
      ok: true,
      result: [expect.objectContaining({ id: 'job-1', assetId: 'asset-1' })],
    })

    const cancelled = await dispatchWorkerMessage(handlers, {
      id: 'req-job-cancel',
      method: 'derivativeJob.cancel',
      params: { jobId: 'job-1', reason: 'stop' },
    })
    expect(cancelled).toMatchObject({
      ok: true,
      result: expect.objectContaining({ id: 'job-1', status: 'cancelled' }),
    })
  })

  it('routes ingestion and preview bridge methods', async () => {
    const { handlers } = createWorkerHarness()
    const tempDir = await mkdtemp(path.join(os.tmpdir(), 'starverse-ingest-'))
    const sourceFilePath = path.join(tempDir, 'sample.txt')
    await writeFile(sourceFilePath, 'hello from ingest')

    const ingestLocal = await dispatchWorkerMessage(handlers, {
      id: 'req-ingest-local',
      method: 'fileIngestion.ingestLocalFile',
      params: {
        filePath: sourceFilePath,
        mimeType: 'text/plain',
      },
    })
    expect(ingestLocal).toMatchObject({
      ok: true,
      result: expect.objectContaining({
        success: true,
        sourceKind: 'local_upload',
      }),
    })

    const ingestUrl = await dispatchWorkerMessage(handlers, {
      id: 'req-ingest-url',
      method: 'fileIngestion.ingestUrl',
      params: {
        url: 'not-a-url',
        retentionMode: 'link_only',
      },
    })
    expect(ingestUrl).toMatchObject({
      ok: true,
      result: expect.objectContaining({
        success: false,
        failureReasonCode: 'invalid_url',
      }),
    })

    const previewLatest = await dispatchWorkerMessage(handlers, {
      id: 'req-preview-latest',
      method: 'preview.getLatestReady',
      params: { assetId: 'missing-asset' },
    })
    expect(previewLatest).toMatchObject({
      ok: true,
      result: expect.objectContaining({
        status: 'missing',
        dataUrl: null,
      }),
    })

    const previewEnsure = await dispatchWorkerMessage(handlers, {
      id: 'req-preview-ensure',
      method: 'preview.ensure',
      params: { assetId: 'missing-asset' },
    })
    expect(previewEnsure).toMatchObject({
      ok: true,
      result: expect.objectContaining({
        status: 'failed',
      }),
    })

    await rm(tempDir, { recursive: true, force: true })
  })

  it('routes file type detection methods without changing send behavior', async () => {
    const { handlers } = createWorkerHarness()
    const storageRootDir = path.resolve(process.cwd(), '.tmp-file-pipeline-worker-tests')
    const storageUri = 'assets/original/as/asset-ft.txt'
    const localPath = path.join(storageRootDir, ...storageUri.split('/'))
    await mkdir(path.dirname(localPath), { recursive: true })
    await writeFile(localPath, 'file type content')

    await dispatchWorkerMessage(handlers, {
      id: 'req-asset-ft',
      method: 'fileAsset.create',
      params: {
        id: 'asset-ft',
        sha256: null,
        filename: 'asset-ft.txt',
        extension: 'txt',
        mime: 'text/plain',
        sizeBytes: 17,
        assetKind: 'text',
        sourceKind: 'local_upload',
        storageBackend: 'local_fs',
        storageUri,
        ingestStatus: 'stored',
      },
    })

    const detected = await dispatchWorkerMessage(handlers, {
      id: 'req-ft-basic',
      method: 'fileType.detectBasic',
      params: {
        assetId: 'asset-ft',
      },
    })
    expect(detected).toMatchObject({
      ok: true,
      result: {
        fromCache: false,
        job: expect.objectContaining({ status: 'ready' }),
        verdict: expect.objectContaining({ assetId: 'asset-ft', primaryFormatId: 'plain_text' }),
      },
    })

    const stale = await dispatchWorkerMessage(handlers, {
      id: 'req-ft-stale',
      method: 'fileType.markStale',
      params: {
        assetId: 'asset-ft',
        staleReason: 'manual_test',
      },
    })
    expect(stale).toMatchObject({
      ok: true,
      result: { ok: true, updated: 1 },
    })
  })
})
