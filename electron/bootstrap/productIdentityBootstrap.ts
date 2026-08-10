import fs from 'node:fs'
import os from 'node:os'
import path from 'node:path'
import {
  resolveStarverseProductIdentity,
  type StarverseProductIdentity,
} from '../productIdentity'

type ElectronIdentityApp = Readonly<{
  setName(value: string): void
  setAppUserModelId(value: string): void
  getPath(name: 'appData'): string
  setPath(name: 'userData', value: string): void
}>

type ElectronAppDataApp = Readonly<{
  setPath(name: 'appData', value: string): void
}>

/**
 * The Electron shell smoke must never inherit the real app-data root.  This
 * override is deliberately unavailable outside the two explicit smoke gates.
 */
export function applyIsolatedEpoch2SmokeAppDataRoot(input: Readonly<{
  app: ElectronAppDataApp
  env: Readonly<Record<string, string | undefined>>
}>): boolean {
  if (input.env.SV_ELECTRON_SMOKE !== '1' || input.env.SV_EPOCH2_SMOKE_FIXTURE_AUTHORITY !== '1') return false
  const configured = String(input.env.SV_EPOCH2_SMOKE_APP_DATA_ROOT ?? '').trim()
  if (!configured || !path.isAbsolute(configured)) throw new Error('EPOCH2_SMOKE_APP_DATA_ROOT_INVALID')
  const temporaryRoot = path.resolve(os.tmpdir())
  const appDataRoot = path.resolve(configured)
  const relative = path.relative(temporaryRoot, appDataRoot)
  if (!relative || relative.startsWith(`..${path.sep}`) || path.isAbsolute(relative)) {
    throw new Error('EPOCH2_SMOKE_APP_DATA_ROOT_INVALID')
  }
  fs.mkdirSync(appDataRoot, { recursive: true })
  input.app.setPath('appData', appDataRoot)
  return true
}

export function configureStarverseElectronIdentity(input: Readonly<{
  app: ElectronIdentityApp
  isPackaged: boolean
  isE2e: boolean
  platform: NodeJS.Platform
  userDataOverrideRequested: boolean
}>): StarverseProductIdentity {
  const identity = resolveStarverseProductIdentity(
    input.isPackaged ? 'production' : input.isE2e ? 'e2e' : 'development',
  )
  input.app.setName(identity.productName)
  if (!input.userDataOverrideRequested) {
    const appDataRoot = path.resolve(input.app.getPath('appData'))
    const sharedUserData = path.resolve(appDataRoot, identity.productDirectory)
    const relative = path.relative(appDataRoot, sharedUserData)
    if (path.parse(appDataRoot).root === appDataRoot ||
        relative !== identity.productDirectory || path.isAbsolute(relative)) {
      throw new Error('STARVERSE_PRODUCT_IDENTITY_INVALID:userDataPath')
    }
    fs.mkdirSync(sharedUserData, { recursive: true })
    input.app.setPath('userData', sharedUserData)
  }
  if (input.platform === 'win32') input.app.setAppUserModelId(identity.applicationId)
  return identity
}

export function hasExplicitUserDataOverride(argv: readonly string[]): boolean {
  for (let index = 0; index < argv.length; index += 1) {
    const argument = argv[index]
    if (argument === '--user-data-dir') return typeof argv[index + 1] === 'string' && argv[index + 1] !== ''
    if (argument.startsWith('--user-data-dir=')) return argument.length > '--user-data-dir='.length
  }
  return false
}
