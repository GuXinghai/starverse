#!/usr/bin/env node
import { rm } from 'node:fs/promises'
import os from 'node:os'
import path from 'node:path'
import { fileURLToPath } from 'node:url'
import { spawn } from 'node:child_process'
import { formatPreflightEvidence, preflightLibreOfficeSvpkg } from './libreoffice-svpkg-preflight.mjs'

const scriptDir = path.dirname(fileURLToPath(import.meta.url))
const repoRoot = path.resolve(scriptDir, '..', '..')
const packagePath = String(
  process.env.STARVERSE_DFC_LIBREOFFICE_PACKAGED_SVPKG ||
  process.env.STARVERSE_DFC_LIBREOFFICE_REAL_SVPKG ||
  ''
).trim()
const appRoot = path.resolve(
  process.env.STARVERSE_DFC_LIBREOFFICE_PACKAGED_APP_ROOT ||
  path.join(os.tmpdir(), 'm35lo-app')
)
const activeRuntimeRoot = path.join(appRoot, 'managed-runtimes', 'dfc-office-pdf', 'libreoffice-office-pdf')

async function main() {
  if (!packagePath) {
    fail('STARVERSE_DFC_LIBREOFFICE_PACKAGED_SVPKG is required for the M35 packaged smoke.')
  }
  const packagePreflight = await preflightLibreOfficeSvpkg(packagePath)
  console.log(formatPreflightEvidence(packagePreflight))
  if (!packagePreflight.ok) fail(`M35 packaged smoke package preflight failed: ${packagePreflight.diagnosticCode}`)
  if (isInsideRepo(appRoot)) {
    fail('M35 packaged smoke app root must be repo-external.')
  }
  if (activeRuntimeRoot.length > 120) {
    fail(`office_pdf_path_policy_exceeded: activeRuntimeRootLength=${activeRuntimeRoot.length}`)
  }
  if (isUnderTemp(appRoot)) {
    await rm(appRoot, { recursive: true, force: true })
  }

  const commonEnv = {
    ...process.env,
    STARVERSE_DFC_LIBREOFFICE_PACKAGED_SMOKE: '1',
    STARVERSE_DFC_LIBREOFFICE_PACKAGED_SVPKG: packagePath,
    STARVERSE_DFC_LIBREOFFICE_PACKAGED_APP_ROOT: appRoot,
  }

  await run(process.execPath, [
    path.join(repoRoot, 'node_modules', 'vitest', 'vitest.mjs'),
    '--run',
    'infra/files/dfcLibreOfficePackagedSmokeConfidence.test.ts',
    '--reporter=dot',
  ], {
    cwd: repoRoot,
    timeoutMs: 18 * 60 * 1000,
    env: commonEnv,
  })

  await run(process.execPath, [
    path.join(repoRoot, 'node_modules', 'vitest', 'vitest.mjs'),
    '--run',
    'infra/db/worker.filePipeline.test.ts',
    '-t',
    'real managed',
    '--reporter=dot',
    '--silent',
  ], {
    cwd: repoRoot,
    timeoutMs: 10 * 60 * 1000,
    env: {
      ...process.env,
      STARVERSE_DFC_LIBREOFFICE_REAL_SMOKE: '1',
      STARVERSE_DFC_LIBREOFFICE_RUNTIME_ROOT: activeRuntimeRoot,
    },
  })

  console.log(JSON.stringify({
    type: 'dfc-libreoffice-m35-packaged-smoke-command',
    packagedSmoke: 'passed',
    workerSemantics: 'passed',
    pathLengths: {
      activeRuntimeRoot: activeRuntimeRoot.length,
    },
    packageInput: 'repo_external_svpkg',
    activeRuntimeRoot: 'managed_runtime_root',
  }))
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
      reject(new Error('M35 packaged smoke command timed out.'))
    }, options.timeoutMs)
    child.once('error', (error) => {
      clearTimeout(timeout)
      reject(error)
    })
    child.once('exit', (code) => {
      clearTimeout(timeout)
      if (code === 0) resolve()
      else reject(new Error(`M35 packaged smoke command exited with code ${code}.`))
    })
  })
}

function isInsideRepo(candidate) {
  const relative = path.relative(repoRoot, path.resolve(candidate))
  return relative === '' || (!relative.startsWith('..') && !path.isAbsolute(relative))
}

function isUnderTemp(candidate) {
  const relative = path.relative(path.resolve(os.tmpdir()), path.resolve(candidate))
  return relative === '' || (!relative.startsWith('..') && !path.isAbsolute(relative))
}

function fail(message) {
  console.error(message)
  process.exit(1)
}

main().catch((error) => {
  console.error(error instanceof Error ? error.message : String(error))
  process.exit(1)
})
