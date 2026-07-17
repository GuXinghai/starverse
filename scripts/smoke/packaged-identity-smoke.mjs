#!/usr/bin/env node
import fs from 'node:fs/promises'
import os from 'node:os'
import path from 'node:path'
import { fileURLToPath } from 'node:url'
import { _electron as electron } from 'playwright'

const scriptDirectory = path.dirname(fileURLToPath(import.meta.url))
const repositoryRoot = path.resolve(scriptDirectory, '..', '..')
const packageMetadata = JSON.parse(await fs.readFile(path.join(repositoryRoot, 'package.json'), 'utf8'))
const executablePath = path.join(
  repositoryRoot,
  'release',
  packageMetadata.version,
  'win-unpacked',
  `${packageMetadata.productName}.exe`,
)
const userDataOverride = await fs.mkdtemp(path.join(os.tmpdir(), 'starverse-packaged-identity-'))

let electronApp
let passedEvidence
let primaryFailure
try {
  try {
    await fs.access(executablePath)
  } catch {
    throw new Error('PACKAGED_IDENTITY_SMOKE_EXECUTABLE_MISSING')
  }
  electronApp = await electron.launch({
    executablePath,
    args: [`--user-data-dir=${userDataOverride}`],
    cwd: repositoryRoot,
    env: {
      ...process.env,
      NODE_ENV: 'production',
      SV_ELECTRON_SMOKE: '1',
      FORCE_COLOR: '0',
    },
    timeout: 90_000,
  })
  const runtime = await electronApp.evaluate(async ({ app }) => {
    const fs = process.getBuiltinModule('fs')
    const path = process.getBuiltinModule('path')
    const schemaFiles = [
      'coreConversationSchema.sql',
      'generationConfigSchema.sql',
      'attachmentAssetSchema.sql',
      'openRouterImagesSchema.sql',
      'generationExecutionSchema.sql',
    ]
    const schemaBytes = await Promise.all(schemaFiles.map(async (fileName) => {
      const bytes = fs.readFileSync(path.join(app.getAppPath(), 'infra', 'db', 'v2', fileName))
      return bytes.byteLength
    }))
    return {
      isPackaged: app.isPackaged,
      productName: app.getName(),
      userData: app.getPath('userData'),
      schemaAssetsReadable: schemaBytes.every((length) => length > 0),
    }
  })
  if (runtime.isPackaged !== true) throw new Error('PACKAGED_IDENTITY_SMOKE_NOT_PACKAGED')
  if (runtime.productName !== packageMetadata.productName) throw new Error('PACKAGED_IDENTITY_SMOKE_PRODUCT_NAME_MISMATCH')
  if (!runtime.schemaAssetsReadable) throw new Error('PACKAGED_IDENTITY_SMOKE_SCHEMA_ASSETS_MISSING')
  if (path.resolve(runtime.userData) !== path.resolve(userDataOverride)) {
    throw new Error('PACKAGED_IDENTITY_SMOKE_USER_DATA_OVERRIDE_MISMATCH')
  }
  passedEvidence = {
    type: 'starverse-packaged-identity-smoke',
    result: 'passed',
    productName: runtime.productName,
    appId: packageMetadata.build.appId,
    userDataOverrideHonored: true,
    schemaAssetsReadable: true,
  }
} catch (error) {
  primaryFailure = error
}

let cleanupFailed = false
if (electronApp) {
  try {
    await electronApp.close()
  } catch {
    cleanupFailed = true
  }
}
try {
  await fs.rm(userDataOverride, { recursive: true, force: true, maxRetries: 5, retryDelay: 100 })
  try {
    await fs.access(userDataOverride)
    cleanupFailed = true
  } catch (error) {
    if (error?.code !== 'ENOENT') cleanupFailed = true
  }
} catch {
  cleanupFailed = true
}

if (primaryFailure) throw primaryFailure
if (cleanupFailed) throw new Error('PACKAGED_IDENTITY_SMOKE_CLEANUP_FAILED')
process.stdout.write(`${JSON.stringify(passedEvidence)}\n`)
