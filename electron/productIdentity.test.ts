import fs from 'node:fs'
import os from 'node:os'
import path from 'node:path'
import { describe, expect, it } from 'vitest'
import { getConfig } from 'app-builder-lib/out/util/config'
import packageMetadata from '../package.json'
import {
  resolveStarverseProductIdentity,
  STARVERSE_PACKAGE_NAME,
  STARVERSE_PACKAGED_APP_ID,
  STARVERSE_PRODUCT_NAME,
} from './productIdentity'
import {
  configureStarverseElectronIdentity,
  hasExplicitUserDataOverride,
} from './bootstrap/productIdentityBootstrap'

describe('Starverse packaged product identity', () => {
  it('uses package metadata as the sole production builder and runtime identity source', () => {
    expect(STARVERSE_PACKAGE_NAME).toBe('starverse-client')
    expect(STARVERSE_PRODUCT_NAME).toBe('Starverse')
    expect(STARVERSE_PACKAGED_APP_ID).toBe('io.github.guxinghai.starverse')
    expect(packageMetadata.build.appId).toBe(STARVERSE_PACKAGED_APP_ID)
    expect(fs.existsSync(path.resolve('electron-builder.json5'))).toBe(false)
    const mainSource = fs.readFileSync(path.resolve('electron/main.ts'), 'utf8')
    expect(mainSource.indexOf('configureStarverseElectronIdentity({'))
      .toBeLessThan(mainSource.indexOf("const DB_LOG_DIR = path.join(app.getPath('userData')"))
  })

  it('is the effective electron-builder configuration without a secondary config file', async () => {
    const config = await getConfig(process.cwd(), null, null)
    expect(config.appId).toBe('io.github.guxinghai.starverse')
    expect(config.directories?.output).toBe('release/${version}')
    expect(packageMetadata.productName).toBe('Starverse')
  })

  it('permits only the closed production, development and e2e identities', () => {
    expect(resolveStarverseProductIdentity('production')).toMatchObject({
      applicationId: 'io.github.guxinghai.starverse',
      productDirectory: 'Starverse',
      channel: 'production',
    })
    expect(resolveStarverseProductIdentity('development')).toMatchObject({
      applicationId: 'io.github.guxinghai.starverse.dev',
      productDirectory: 'Starverse',
      channel: 'development',
    })
    expect(resolveStarverseProductIdentity('e2e')).toMatchObject({
      applicationId: 'io.github.guxinghai.starverse.e2e',
      productDirectory: 'Starverse',
      channel: 'e2e',
    })
    expect(() => resolveStarverseProductIdentity('nightly' as never))
      .toThrow('STARVERSE_PRODUCT_IDENTITY_INVALID:channel')
  })

  it('configures identity and explicitly shares the production userData root before normal path reads', () => {
    const appDataRoot = fs.mkdtempSync(path.join(os.tmpdir(), 'starverse-product-identity-'))
    const calls: string[] = []
    const app = {
      setName: (value: string) => calls.push(`name:${value}`),
      setAppUserModelId: (value: string) => calls.push(`appId:${value}`),
      getPath: (name: 'appData') => {
        calls.push(`getPath:${name}`)
        return appDataRoot
      },
      setPath: (name: 'userData', value: string) => calls.push(`setPath:${name}:${value}`),
    }
    try {
      const production = configureStarverseElectronIdentity({
        app, isPackaged: true, isE2e: true, platform: 'win32', userDataOverrideRequested: false,
      })
      expect(production.channel).toBe('production')
      expect(calls).toEqual([
        'name:Starverse',
        'getPath:appData',
        `setPath:userData:${path.join(appDataRoot, 'Starverse')}`,
        'appId:io.github.guxinghai.starverse',
      ])
      expect(fs.statSync(path.join(appDataRoot, 'Starverse')).isDirectory()).toBe(true)

      calls.length = 0
      expect(configureStarverseElectronIdentity({
        app, isPackaged: false, isE2e: true, platform: 'win32', userDataOverrideRequested: false,
      }).applicationId).toBe('io.github.guxinghai.starverse.e2e')
      expect(calls).toEqual([
        'name:Starverse',
        'getPath:appData',
        `setPath:userData:${path.join(appDataRoot, 'Starverse')}`,
        'appId:io.github.guxinghai.starverse.e2e',
      ])

      calls.length = 0
      configureStarverseElectronIdentity({
        app, isPackaged: false, isE2e: false, platform: 'linux', userDataOverrideRequested: true,
      })
      expect(calls).toEqual(['name:Starverse'])
    } finally {
      fs.rmSync(appDataRoot, { recursive: true, force: true })
    }
  })

  it('recognizes only an explicit non-empty user-data-dir command-line override', () => {
    expect(hasExplicitUserDataOverride(['electron', '--user-data-dir=C:\\tmp\\profile'])).toBe(true)
    expect(hasExplicitUserDataOverride(['electron', '--user-data-dir', 'C:\\tmp\\profile'])).toBe(true)
    expect(hasExplicitUserDataOverride(['electron', '--user-data-dir='])).toBe(false)
    expect(hasExplicitUserDataOverride(['electron', '--user-data-dir'])).toBe(false)
    expect(hasExplicitUserDataOverride(['electron', '--other=value'])).toBe(false)
  })
})
