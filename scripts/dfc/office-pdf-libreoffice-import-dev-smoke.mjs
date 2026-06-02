#!/usr/bin/env node
import { stat } from 'node:fs/promises'
import path from 'node:path'
import { fileURLToPath } from 'node:url'
import { spawn } from 'node:child_process'

const scriptDir = path.dirname(fileURLToPath(import.meta.url))
const repoRoot = path.resolve(scriptDir, '..', '..')
const workRoot = path.resolve(repoRoot, process.env.STARVERSE_DFC_LIBREOFFICE_WORK_ROOT || '.external-runtime-work/libreoffice')
const sourceRuntimeRoot = path.resolve(workRoot, 'managed-runtimes', 'dfc-office-pdf', 'libreoffice-office-pdf')
const importAppRoot = path.resolve(workRoot, 'import-smoke-app-root')
const activeRuntimeRoot = path.resolve(importAppRoot, 'managed-runtimes', 'dfc-office-pdf', 'libreoffice-office-pdf')

async function main() {
  if (!await pathExists(path.join(sourceRuntimeRoot, 'manifest.json'))) {
    fail('M28 managed LibreOffice artifact is missing at the expected managed runtime work root. Run M28 artifact preparation first; M30 does not auto-download LibreOffice.')
  }

  await run(process.execPath, [
    path.join(repoRoot, 'node_modules', 'vitest', 'vitest.mjs'),
    '--run',
    'infra/files/dfcLibreOfficeManagedPackageInstaller.real-smoke.test.ts',
    '--reporter=dot',
    '--silent',
  ], {
    cwd: repoRoot,
    timeoutMs: 3 * 60 * 1000,
    env: {
      ...process.env,
      STARVERSE_DFC_LIBREOFFICE_IMPORT_REAL_SMOKE: '1',
      STARVERSE_DFC_LIBREOFFICE_SOURCE_RUNTIME_ROOT: sourceRuntimeRoot,
      STARVERSE_DFC_LIBREOFFICE_IMPORT_APP_ROOT: importAppRoot,
    },
  })

  console.log('Imported managed LibreOffice runtime active root: [managed-runtime-root]')
  console.log('M30 intentionally stops at adapter-level import smoke; DFC worker real smoke remains an M31 packaged-smoke item.')
  console.log('M30 dev import smoke used only the managed artifact; no system LibreOffice or PATH fallback was used.')
}

async function pathExists(target) {
  return stat(target).then(() => true).catch(() => false)
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
