#!/usr/bin/env node
import { spawn } from 'node:child_process'
import { rm } from 'node:fs/promises'
import os from 'node:os'
import path from 'node:path'
import { fileURLToPath } from 'node:url'

const scriptDir = path.dirname(fileURLToPath(import.meta.url))
const repoRoot = path.resolve(scriptDir, '..', '..')
const appRoot = path.resolve(
  process.env.STARVERSE_DFC_LIBREOFFICE_OFFICIAL_INSTALL_APP_ROOT ||
  path.join(os.tmpdir(), 'm45lo-app')
)
const packageOut = path.resolve(
  process.env.STARVERSE_DFC_LIBREOFFICE_OFFICIAL_INSTALL_SVPKG_OUT ||
  path.join(os.tmpdir(), 'm45lo-official-download', 'libreoffice.svpkg')
)
const activeRuntimeRoot = path.join(appRoot, 'managed-runtimes', 'dfc-office-pdf', 'libreoffice-office-pdf')

async function main() {
  if (isInsideRepo(appRoot) || isInsideRepo(packageOut)) {
    fail('M45 official install smoke roots must be repo-external.')
  }
  if (isOwnedSmokeRoot(appRoot)) await rm(appRoot, { recursive: true, force: true })
  if (isOwnedSmokeRoot(path.dirname(packageOut))) await rm(path.dirname(packageOut), { recursive: true, force: true })

  await runNode([
    path.join(repoRoot, 'node_modules', 'vitest', 'vitest.mjs'),
    '--run',
    'infra/files/dfcLibreOfficeOfficialInstall.real-smoke.test.ts',
    '--reporter=dot',
  ], {
    timeoutMs: 35 * 60 * 1000,
    env: {
      ...process.env,
      STARVERSE_DFC_LIBREOFFICE_OFFICIAL_INSTALL_SMOKE: '1',
      STARVERSE_DFC_LIBREOFFICE_OFFICIAL_INSTALL_APP_ROOT: appRoot,
      STARVERSE_DFC_LIBREOFFICE_OFFICIAL_INSTALL_SVPKG_OUT: packageOut,
      FORCE_COLOR: '0',
    },
  })

  await runNode([
    path.join(repoRoot, 'node_modules', 'vitest', 'vitest.mjs'),
    '--run',
    'infra/db/worker.filePipeline.test.ts',
    '-t',
    'real managed',
    '--reporter=dot',
    '--silent',
  ], {
    timeoutMs: 12 * 60 * 1000,
    env: {
      ...process.env,
      STARVERSE_DFC_LIBREOFFICE_REAL_SMOKE: '1',
      STARVERSE_DFC_LIBREOFFICE_RUNTIME_ROOT: activeRuntimeRoot,
      FORCE_COLOR: '0',
    },
  })

  await runPackageManager('npm', ['run', 'test:office-pdf-libreoffice-packaged-smoke'], {
    timeoutMs: 25 * 60 * 1000,
    env: {
      ...process.env,
      STARVERSE_DFC_LIBREOFFICE_PACKAGED_SVPKG: packageOut,
      STARVERSE_DFC_LIBREOFFICE_PACKAGED_APP_ROOT: appRoot,
      FORCE_COLOR: '0',
    },
  })

  await runPackageManager('npm', ['run', 'test:office-pdf-libreoffice-packaged-electron-smoke'], {
    timeoutMs: 45 * 60 * 1000,
    env: {
      ...process.env,
      STARVERSE_DFC_LIBREOFFICE_PACKAGED_ELECTRON_SVPKG: packageOut,
      STARVERSE_DFC_LIBREOFFICE_PACKAGED_ELECTRON_USER_DATA: appRoot,
      FORCE_COLOR: '0',
    },
  })

  console.log(JSON.stringify({
    type: 'dfc-m45-official-install-e2e-smoke',
    officialInstall: 'passed',
    postInstallDfcWorker: 'passed',
    packagedSmoke: 'passed',
    packagedElectronSmoke: 'passed',
    pathLengths: {
      appRoot: appRoot.length,
      activeRuntimeRoot: activeRuntimeRoot.length,
    },
    packageSource: 'fixed_github_release_asset',
    packageOut: 'repo_external_temp_svpkg',
    evidencePrivacy: 'sanitized',
  }, null, 2))
}

async function runNode(args, options) {
  await run(process.execPath, args, options)
}

async function runPackageManager(command, args, options) {
  if (process.platform !== 'win32') {
    await run(command, args, options)
    return
  }
  const shell = process.env.ComSpec || 'cmd.exe'
  await run(shell, ['/d', '/s', '/c', `${command}.cmd`, ...args], options)
}

async function run(command, args, options) {
  await new Promise((resolve, reject) => {
    const child = spawn(command, args, {
      cwd: repoRoot,
      env: options.env ?? process.env,
      shell: false,
      stdio: 'inherit',
      windowsHide: true,
    })
    const timeout = setTimeout(() => {
      child.kill()
      reject(new Error('M45 official install smoke command timed out.'))
    }, options.timeoutMs)
    child.once('error', (error) => {
      clearTimeout(timeout)
      reject(error)
    })
    child.once('exit', (code) => {
      clearTimeout(timeout)
      if (code === 0) resolve()
      else reject(new Error(`M45 official install smoke command exited with code ${code}.`))
    })
  })
}

function isInsideRepo(candidate) {
  const relative = path.relative(repoRoot, path.resolve(candidate))
  return relative === '' || (!relative.startsWith('..') && !path.isAbsolute(relative))
}

function isOwnedSmokeRoot(candidate) {
  const resolved = path.resolve(candidate)
  const tempRelative = path.relative(path.resolve(os.tmpdir()), resolved)
  return tempRelative === '' || (!tempRelative.startsWith('..') && !path.isAbsolute(tempRelative))
}

function fail(message) {
  console.error(message)
  process.exit(1)
}

main().catch((error) => {
  console.error(error instanceof Error ? error.message : String(error))
  process.exit(1)
})
