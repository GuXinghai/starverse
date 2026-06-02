#!/usr/bin/env node
import { createHash } from 'node:crypto'
import { createWriteStream } from 'node:fs'
import { mkdir, readdir, readFile, rm, stat, writeFile } from 'node:fs/promises'
import path from 'node:path'
import { Readable } from 'node:stream'
import { fileURLToPath } from 'node:url'
import { spawn } from 'node:child_process'

const scriptDir = path.dirname(fileURLToPath(import.meta.url))
const repoRoot = path.resolve(scriptDir, '..', '..')
const libreOfficeVersion = process.env.STARVERSE_DFC_LIBREOFFICE_VERSION || '25.8.7'
const downloadUrl = process.env.STARVERSE_DFC_LIBREOFFICE_DOWNLOAD_URL
  || `https://download.documentfoundation.org/libreoffice/stable/${libreOfficeVersion}/win/x86_64/LibreOffice_${libreOfficeVersion}_Win_x86-64.msi`
const workRoot = path.resolve(repoRoot, process.env.STARVERSE_DFC_LIBREOFFICE_WORK_ROOT || '.external-runtime-work/libreoffice')
const runtimeRoot = path.resolve(workRoot, 'managed-runtimes', 'dfc-office-pdf', 'libreoffice-office-pdf')
const downloadDir = path.resolve(workRoot, 'downloads')
const downloadPath = path.join(downloadDir, path.basename(new URL(downloadUrl).pathname))

async function main() {
  if (process.platform !== 'win32') {
    fail('M28 dev smoke currently prepares the official Windows x86_64 MSI only. Provide STARVERSE_DFC_LIBREOFFICE_RUNTIME_ROOT for a prebuilt managed runtime on this platform.')
  }

  await mkdir(downloadDir, { recursive: true })
  await mkdir(runtimeRoot, { recursive: true })
  await downloadIfMissing(downloadUrl, downloadPath)
  const artifactBytes = await stat(downloadPath).then((entry) => entry.size)
  const artifactSha256 = await sha256File(downloadPath)

  let executablePath = await findSoffice(runtimeRoot)
  if (!executablePath) {
    await rm(runtimeRoot, { recursive: true, force: true })
    await mkdir(runtimeRoot, { recursive: true })
    await run('msiexec.exe', ['/a', downloadPath, '/qn', `TARGETDIR=${runtimeRoot}`], {
      cwd: repoRoot,
      timeoutMs: 10 * 60 * 1000,
    })
    executablePath = await findSoffice(runtimeRoot)
  }
  if (!executablePath) fail('LibreOffice administrative extraction completed but soffice.exe was not found under the managed runtime root.')

  const executableStat = await stat(executablePath)
  const executableSha256 = await sha256File(executablePath)
  const manifest = {
    manifestSchemaVersion: '1',
    pluginId: 'libreoffice',
    packageId: 'starverse.dfc.libreoffice',
    runtimePackageId: 'starverse.dfc.libreoffice',
    engineId: 'libreoffice',
    runtimeId: 'libreoffice-office-pdf',
    displayName: 'LibreOffice Office PDF',
    pluginVersion: `${libreOfficeVersion}-dev`,
    runtimeKind: 'managed_external_process',
    enabled: true,
    platform: process.platform,
    arch: process.arch,
    capabilities: ['office_to_pdf', 'docx_to_pdf'],
    executablePath: toRuntimeRelativePath(runtimeRoot, executablePath),
    libreOfficeVersion,
    packageVersion: `${libreOfficeVersion}-dev-managed-msi`,
    artifactSha256,
    executableSha256,
    executableSizeBytes: executableStat.size,
    provenance: `The Document Foundation official LibreOffice MSI (${downloadUrl})`,
    licenseId: 'MPL-2.0',
    attribution: 'LibreOffice by The Document Foundation',
    notices: [
      'Dev-only managed runtime smoke artifact. LibreOffice binary is not committed to git.',
      `Official MSI bytes: ${artifactBytes}`,
    ],
    minimumStarverseContractVersion: '1',
    officialRelease: {
      sourceKind: 'official',
      packageRef: downloadUrl,
      releaseTag: `libreoffice-${libreOfficeVersion}`,
      provenance: 'The Document Foundation official download archive',
    },
    securityPolicy: {
      macrosDisabled: true,
      networkDisabled: true,
      externalLinksDisabled: true,
      embeddedObjectExecutionDisabled: true,
      isolatedProfileRequired: true,
    },
  }
  await writeFile(path.join(runtimeRoot, 'manifest.json'), `${JSON.stringify(manifest, null, 2)}\n`, 'utf8')

  console.log(`Prepared managed LibreOffice runtime: ${runtimeRoot}`)
  console.log(`LibreOffice version: ${libreOfficeVersion}`)
  console.log('Artifact stored outside git under .external-runtime-work/libreoffice')

  await run(process.execPath, [
    path.join(repoRoot, 'node_modules', 'vitest', 'vitest.mjs'),
    '--run',
    'infra/files/dfcLibreOfficePdfAdapter.real-smoke.test.ts',
    'infra/db/worker.filePipeline.test.ts',
    '-t',
    'real managed',
    '--reporter=dot',
    '--silent',
  ], {
    cwd: repoRoot,
    timeoutMs: 3 * 60 * 1000,
    env: {
      ...process.env,
      STARVERSE_DFC_LIBREOFFICE_REAL_SMOKE: '1',
      STARVERSE_DFC_LIBREOFFICE_RUNTIME_ROOT: runtimeRoot,
    },
  })
}

async function downloadIfMissing(url, targetPath) {
  const existingSize = await stat(targetPath).then((entry) => entry.size).catch(() => 0)
  if (existingSize > 0) return
  console.log(`Downloading official LibreOffice MSI: ${url}`)
  const response = await fetch(url, { redirect: 'follow' })
  if (!response.ok || !response.body) {
    fail(`LibreOffice download failed with HTTP ${response.status}.`)
  }
  await mkdir(path.dirname(targetPath), { recursive: true })
  await new Promise((resolve, reject) => {
    const out = createWriteStream(targetPath)
    Readable.fromWeb(response.body).pipe(out)
    out.on('finish', resolve)
    out.on('error', reject)
  })
}

async function findSoffice(rootDir) {
  const pending = [rootDir]
  while (pending.length > 0) {
    const current = pending.pop()
    const entries = await readdir(current, { withFileTypes: true }).catch(() => [])
    for (const entry of entries) {
      const full = path.join(current, entry.name)
      if (entry.isDirectory()) {
        pending.push(full)
      } else if (entry.isFile() && entry.name.toLowerCase() === 'soffice.exe') {
        return full
      }
    }
  }
  return null
}

function toRuntimeRelativePath(rootDir, targetPath) {
  const relative = path.relative(rootDir, targetPath)
  if (!relative || relative.startsWith('..') || path.isAbsolute(relative)) {
    fail('LibreOffice executable is not under the managed runtime root.')
  }
  return relative.split(path.sep).join('/')
}

async function sha256File(targetPath) {
  return createHash('sha256').update(await readFile(targetPath)).digest('hex')
}

async function run(command, args, options) {
  await new Promise((resolve, reject) => {
    const child = spawn(command, args, {
      cwd: options.cwd,
      env: options.env ?? process.env,
      shell: false,
      stdio: 'inherit',
      windowsHide: true,
    })
    const timeout = setTimeout(() => {
      child.kill()
      reject(new Error(`${command} timed out.`))
    }, options.timeoutMs)
    child.on('error', (error) => {
      clearTimeout(timeout)
      reject(error)
    })
    child.on('exit', (code) => {
      clearTimeout(timeout)
      if (code === 0) resolve()
      else reject(new Error(`${command} exited with code ${code}.`))
    })
  })
}

function fail(message) {
  console.error(message)
  process.exit(1)
}

main().catch((error) => {
  console.error(error instanceof Error ? error.message : String(error))
  process.exit(1)
})
