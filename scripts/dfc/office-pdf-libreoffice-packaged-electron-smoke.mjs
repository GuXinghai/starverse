#!/usr/bin/env node
import { spawn } from 'node:child_process'
import { readFile, rm, stat, writeFile } from 'node:fs/promises'
import os from 'node:os'
import path from 'node:path'
import { fileURLToPath } from 'node:url'
import { _electron as electron } from 'playwright'
import { formatPreflightEvidence, preflightLibreOfficeSvpkg } from './libreoffice-svpkg-preflight.mjs'

const scriptDir = path.dirname(fileURLToPath(import.meta.url))
const repoRoot = path.resolve(scriptDir, '..', '..')
const packageJson = JSON.parse(await readFile(path.join(repoRoot, 'package.json'), 'utf8'))
const packagePath = String(
  process.env.STARVERSE_DFC_LIBREOFFICE_PACKAGED_ELECTRON_SVPKG ||
  process.env.STARVERSE_DFC_LIBREOFFICE_PACKAGED_SVPKG ||
  process.env.STARVERSE_DFC_LIBREOFFICE_REAL_SVPKG ||
  ''
).trim()
const userDataRoot = path.resolve(
  process.env.STARVERSE_DFC_LIBREOFFICE_PACKAGED_ELECTRON_USER_DATA ||
  defaultShortUserDataRoot()
)
const activeRuntimeRoot = path.join(userDataRoot, 'managed-runtimes', 'dfc-office-pdf', 'libreoffice-office-pdf')
const docxFixturePath = path.join(userDataRoot, 'm37-docx.pdf-smoke.docx')
const providedExecutable = String(process.env.STARVERSE_DFC_LIBREOFFICE_PACKAGED_ELECTRON_EXE || '').trim()

async function main() {
  if (!packagePath) fail('STARVERSE_DFC_LIBREOFFICE_PACKAGED_ELECTRON_SVPKG is required.')
  const packagePreflight = await preflightLibreOfficeSvpkg(packagePath)
  console.log(formatPreflightEvidence(packagePreflight))
  if (!packagePreflight.ok) fail(`packaged Electron smoke package preflight failed: ${packagePreflight.diagnosticCode}`)
  if (isInsideRepo(userDataRoot)) fail('packaged Electron smoke userData root must be repo-external.')
  if (activeRuntimeRoot.length > 120) fail(`office_pdf_path_policy_exceeded: runtimeRootLength=${activeRuntimeRoot.length}`)
  if (docxFixturePath.length > 130) fail(`office_pdf_path_policy_exceeded: inputPathLength=${docxFixturePath.length}`)
  if (isOwnedSmokeRoot(userDataRoot)) await rm(userDataRoot, { recursive: true, force: true })

  await runPackageManager('npm', ['run', 'rebuild:node'], { timeoutMs: 10 * 60 * 1000 })
  await stageManagedRuntime()
  await writeFile(docxFixturePath, createMinimalDocxBuffer())

  const executablePath = providedExecutable || await buildPackagedAppDir()
  if (!(await pathExists(executablePath))) fail('packaged Electron executable is missing.')

  let electronApp
  try {
    electronApp = await electron.launch({
      executablePath,
      args: [`--user-data-dir=${userDataRoot}`],
      cwd: repoRoot,
      env: {
        ...process.env,
        NODE_ENV: 'production',
        SV_ELECTRON_SMOKE: '1',
        SV_ELECTRON_SMOKE_DFC: '1',
        FORCE_COLOR: '0',
      },
      timeout: 90_000,
    })
    const page = await waitForAppWindow(electronApp, 90_000)
    await waitForMountedApp(page, 120_000)
    await page.waitForFunction(
      () => typeof window.__starverseElectronSmokeSeedDocxPdfAttachment === 'function',
      undefined,
      { timeout: 90_000 },
    )

    const runtimeState = await page.evaluate(async () => {
      const installed = await window.dbBridge.invoke('enginePluginLifecycle.listInstalledPlugins', undefined)
      const diagnostics = await window.dbBridge.invoke('enginePluginLifecycle.getDiagnosticsSummary', undefined)
      return { installed, diagnostics }
    })
    const libreOffice = Array.isArray(runtimeState.installed)
      ? runtimeState.installed.find((item) => item?.engineId === 'libreoffice')
      : null
    if (!libreOffice) fail('LibreOffice Office-to-PDF plugin row was not visible to packaged app worker.')
    if (libreOffice.productGate?.productionApproved !== true) fail('LibreOffice Windows x64 production approval was not active.')
    if (libreOffice.productGate?.approvedPlatform !== 'win32' || libreOffice.productGate?.approvedArch !== 'x64') {
      fail('LibreOffice production approval scope was not Windows x64.')
    }
    if (libreOffice.productGate?.approvedInput !== 'docx' || libreOffice.productGate?.approvedOutput !== 'pdf_attachment') {
      fail('LibreOffice production approval route was not DOCX pdf_attachment.')
    }
    if (libreOffice.productGate?.downloadEnabled !== false) fail('LibreOffice automatic download policy changed.')
    if (libreOffice.productGate?.conversionTimeDownloadEnabled !== false) fail('LibreOffice conversion-time download policy changed.')

    const result = await page.evaluate(async (filePath) => {
      const seed = window.__starverseElectronSmokeSeedDocxPdfAttachment
      if (typeof seed !== 'function') throw new Error('DOCX PDF smoke seeder is missing')
      return await seed(filePath)
    }, docxFixturePath)

    assertDocxPdfResult(result)
    const previewText = await page.evaluate((assetId) => {
      const card = document.querySelector(`[data-testid="draft-attachment-card-${assetId}"]`)
      return {
        cardVisible: Boolean(card),
        bodyText: document.body.innerText.slice(0, 8000),
      }
    }, result.assetId)
    if (!previewText.cardVisible) fail('DOCX PDF packaged app attachment card was not rendered.')
    if (/[A-Za-z]:\\|file:\/\/|storageRef|contentToken|%PDF-|soffice\.exe/iu.test(previewText.bodyText)) {
      fail('packaged app smoke UI leaked path-like or body-like evidence.')
    }

    console.log(JSON.stringify({
      type: 'dfc-libreoffice-m37-packaged-electron-smoke',
      packagedAppSmoke: 'passed',
      pluginManagement: {
        visible: true,
        productionApproved: libreOffice.productGate?.productionApproved === true ? 'true' : 'false',
        ownerGated: libreOffice.productGate?.ownerGated === true,
        experimental: libreOffice.productGate?.experimental === true,
        status: libreOffice.productGate?.status ?? 'unknown',
        diagnosticCode: libreOffice.productGate?.productCode ?? libreOffice.failureReason ?? null,
      },
      managedRuntime: {
        discovery: 'validated_by_packaged_worker',
        packageVersion: libreOffice.packageVersion ?? null,
        runtimeVersion: libreOffice.runtimeVersion ?? null,
        sourceKind: libreOffice.productGate?.source ?? null,
      },
      docxToPdf: {
        result: 'ready_pdf_attachment',
        targetKind: result.targetKind,
        sendStrategy: result.sendStrategy,
        selectedRefAuthority: result.selectedAssetRefs.some((ref) => ref.kind === 'derived_asset') ? 'derived_asset' : 'missing',
        preview: `${result.previewKind}:${result.previewStatus}`,
      },
      pathLengths: {
        userDataRoot: userDataRoot.length,
        runtimeRoot: activeRuntimeRoot.length,
        inputPath: docxFixturePath.length,
      },
      pathCapsSatisfied: activeRuntimeRoot.length <= 120 && docxFixturePath.length <= 130,
      evidencePrivacy: 'sanitized',
    }, null, 2))
  } finally {
    if (electronApp) await electronApp.close().catch(() => undefined)
    if (isOwnedSmokeRoot(userDataRoot)) await rm(userDataRoot, { recursive: true, force: true }).catch(() => undefined)
  }
}

async function stageManagedRuntime() {
  await run(process.execPath, [
    path.join(repoRoot, 'scripts', 'dfc', 'office-pdf-libreoffice-packaged-smoke.mjs'),
  ], {
    env: {
      ...process.env,
      STARVERSE_DFC_LIBREOFFICE_PACKAGED_SVPKG: packagePath,
      STARVERSE_DFC_LIBREOFFICE_PACKAGED_APP_ROOT: userDataRoot,
    },
    timeoutMs: 25 * 60 * 1000,
  })
}

async function buildPackagedAppDir() {
  if (process.env.STARVERSE_DFC_LIBREOFFICE_PACKAGED_ELECTRON_SKIP_BUILD === '1') {
    fail('packaged Electron executable env is required when packaged build is skipped.')
  }
  await runPackageManager('npm', ['run', 'rebuild:electron'], { timeoutMs: 10 * 60 * 1000 })
  await runPackageManager('npm', ['run', 'build:worker'], { timeoutMs: 5 * 60 * 1000 })
  await runPackageManager('npx', ['vite', 'build', '--config', 'vite.config.ts'], { timeoutMs: 10 * 60 * 1000 })
  await runPackageManager('npx', ['electron-builder', '--dir', '--win', '--x64', '--config', 'electron-builder.json5'], { timeoutMs: 20 * 60 * 1000 })
  return path.join(repoRoot, 'release', packageJson.version, 'win-unpacked', 'YourAppName.exe')
}

async function runPackageManager(command, args, options) {
  if (process.platform !== 'win32') {
    await run(command, args, options)
    return
  }
  const shell = process.env.ComSpec || 'cmd.exe'
  await run(shell, ['/d', '/s', '/c', `${command}.cmd`, ...args], options)
}

function assertDocxPdfResult(result) {
  if (!result?.backendOwned) fail('DOCX PDF packaged app smoke was not backend-owned.')
  if (result.targetKind !== 'pdf_attachment') fail(`Expected pdf_attachment target, got ${result.targetKind}`)
  if (result.sendStrategy !== 'file_attachment') fail(`Expected file_attachment send strategy, got ${result.sendStrategy}`)
  if (!Array.isArray(result.selectedAssetRefs) || !result.selectedAssetRefs.some((ref) => ref.kind === 'derived_asset')) {
    fail('DOCX PDF selected refs do not include a derived_asset.')
  }
  if (result.previewKind !== 'raw_file' || result.previewStatus !== 'ready') {
    fail(`DOCX PDF preview is not metadata-only ready: ${result.previewKind}:${result.previewStatus}`)
  }
  for (const requiredTarget of ['original_file', 'markdown', 'pdf_attachment']) {
    if (!result.availableTargets.includes(requiredTarget)) {
      fail(`DOCX PDF smoke missing available ${requiredTarget} option.`)
    }
  }
}

async function run(command, args, options = {}) {
  await new Promise((resolve, reject) => {
    const child = spawn(command, args, {
      cwd: repoRoot,
      env: options.env ?? process.env,
      shell: false,
      stdio: ['ignore', 'pipe', 'pipe'],
      windowsHide: true,
    })
    pipeSanitized(child.stdout, process.stdout)
    pipeSanitized(child.stderr, process.stderr)
    const timeout = setTimeout(() => {
      child.kill()
      reject(new Error('packaged Electron smoke command timed out.'))
    }, options.timeoutMs ?? 120_000)
    child.once('error', (error) => {
      clearTimeout(timeout)
      reject(error)
    })
    child.once('exit', (code) => {
      clearTimeout(timeout)
      if (code === 0) resolve()
      else reject(new Error(`packaged Electron smoke command exited with code ${code}.`))
    })
  })
}

function pipeSanitized(stream, output) {
  if (!stream) return
  let buffered = ''
  stream.setEncoding('utf8')
  stream.on('data', (chunk) => {
    buffered += chunk
    const lines = buffered.split(/\r?\n/u)
    buffered = lines.pop() ?? ''
    for (const line of lines) output.write(`${sanitizeSmokeOutput(line)}\n`)
  })
  stream.on('end', () => {
    if (buffered) output.write(sanitizeSmokeOutput(buffered))
  })
}

function sanitizeSmokeOutput(value) {
  let sanitized = String(value)
  for (const raw of [repoRoot, packagePath, userDataRoot, activeRuntimeRoot, docxFixturePath, providedExecutable]) {
    if (raw) sanitized = sanitized.split(raw).join('[redacted-path]')
  }
  return sanitized
    .replace(/[A-Za-z]:\\[^\s"'<>|]+/gu, '[redacted-path]')
    .replace(/file:\/\/\/[^\s"'<>|]+/giu, '[redacted-file-url]')
}

async function waitForAppWindow(electronApp, timeoutMs) {
  const deadline = Date.now() + timeoutMs
  while (Date.now() < deadline) {
    for (const page of electronApp.windows()) {
      const diagnostics = await describePage(page)
      if (diagnostics.hasAppRoot && !diagnostics.url.startsWith('devtools://')) return page
    }
    const remaining = Math.max(250, deadline - Date.now())
    try {
      const page = await electronApp.waitForEvent('window', { timeout: Math.min(1000, remaining) })
      const diagnostics = await describePage(page)
      if (diagnostics.hasAppRoot && !diagnostics.url.startsWith('devtools://')) return page
    } catch {
      await new Promise((resolve) => setTimeout(resolve, 250))
    }
  }
  throw new Error('packaged app window did not become ready.')
}

async function waitForMountedApp(page, timeoutMs) {
  await page.waitForSelector('#app', { state: 'attached', timeout: timeoutMs })
  await page.waitForFunction(
    () => {
      const appRoot = document.querySelector('#app')
      const composerDraft = document.querySelector('[data-testid="composer-draft"]')
      return Boolean(composerDraft || (appRoot && (appRoot.children.length > 0 || appRoot.textContent?.trim())))
    },
    undefined,
    { timeout: timeoutMs },
  )
}

async function describePage(page) {
  try {
    return await page.evaluate(() => ({
      url: window.location.href,
      title: document.title,
      hasAppRoot: Boolean(document.querySelector('#app')),
    }))
  } catch {
    return { url: page.url(), title: '', hasAppRoot: false }
  }
}

function createMinimalDocxBuffer() {
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
    <w:p><w:r><w:t>Starverse M37 packaged Electron smoke</w:t></w:r></w:p>
    <w:p><w:r><w:t>Managed LibreOffice DOCX to PDF conversion.</w:t></w:r></w:p>
    <w:sectPr/>
  </w:body>
</w:document>`,
    },
  ])
}

function createZipBuffer(files) {
  const localParts = []
  const centralParts = []
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

function crc32(buffer) {
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

async function pathExists(target) {
  return stat(target).then(() => true).catch(() => false)
}

function defaultShortUserDataRoot() {
  const root = process.platform === 'win32' ? path.parse(os.tmpdir()).root : os.tmpdir()
  return path.join(root, 'svm37lo', `p${process.pid}`)
}

function isInsideRepo(candidate) {
  const relative = path.relative(repoRoot, path.resolve(candidate))
  return relative === '' || (!relative.startsWith('..') && !path.isAbsolute(relative))
}

function isOwnedSmokeRoot(candidate) {
  const root = path.resolve(process.platform === 'win32' ? path.join(path.parse(os.tmpdir()).root, 'svm37lo') : path.join(os.tmpdir(), 'svm37lo'))
  const relative = path.relative(root, path.resolve(candidate))
  return relative === '' || (!relative.startsWith('..') && !path.isAbsolute(relative))
}

function fail(message) {
  throw new Error(message)
}

main().catch((error) => {
  const message = error instanceof Error ? error.message : String(error)
  console.error(message
    .replace(/file:\/\/\/?[^\s"'<>)]*/gi, '<file-url-redacted>')
    .replace(/(^|[^A-Za-z])([A-Za-z]:[\\/][^\s"'<>)]*)/g, '$1<absolute-path-redacted>'))
  process.exit(1)
})
