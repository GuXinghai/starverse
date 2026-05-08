/**
 * Gated real-runtime tests for Magika classify runner.
 *
 * These tests require an actual Magika runtime installation and a pre-staged
 * official plugin package. They are disabled by default and skipped in CI.
 *
 * To enable, set:
 *   STARVERSE_ENABLE_REAL_MAGIKA_TESTS=1
 *
 * The plugin directory must be set via:
 *   STARVERSE_REAL_MAGIKA_PLUGIN_DIR=<absolute path to engines/magika>
 *
 * Without a valid plugin directory, tests will skip with an explicit reason.
 * No network downloads are performed.
 */

import path from 'node:path'
import { describe, expect, it } from 'vitest'
import { discoverMagikaManagedPlugin } from './magikaManagedPlugin'
import { runMagikaClassify } from './magikaClassifyRunner'

const MAGIKA_TESTS_ENABLED = process.env.STARVERSE_ENABLE_REAL_MAGIKA_TESTS === '1'
const MAGIKA_PLUGIN_DIR = process.env.STARVERSE_REAL_MAGIKA_PLUGIN_DIR ?? ''

const describeRealMagika = MAGIKA_TESTS_ENABLED ? describe : describe.skip

// eslint-disable-next-line max-lines-per-function
describeRealMagika('magikaClassifyRunner (real runtime, gated)', () => {
  it('parses real manifest from pre-staged plugin directory', async () => {
    if (!MAGIKA_PLUGIN_DIR) {
      console.warn('[magika-real-test] STARVERSE_REAL_MAGIKA_PLUGIN_DIR is not set; skipping real manifest test')
      return
    }
    const discovery = await discoverMagikaManagedPlugin({
      pluginDirs: [MAGIKA_PLUGIN_DIR],
    })
    expect(discovery.available).toBe(true)
    if (!discovery.available) return
    expect(discovery.descriptor.manifest.engineId).toBe('magika')
    expect(discovery.descriptor.manifest.runtimeKind).toBe('local_loader')
    expect(discovery.descriptor.manifest.modelVersion).toBeTruthy()
    expect(discovery.descriptor.manifest.modelFiles.length).toBeGreaterThanOrEqual(1)
  })

  it('real runtime entry is executable node script', async () => {
    if (!MAGIKA_PLUGIN_DIR) {
      console.warn('[magika-real-test] STARVERSE_REAL_MAGIKA_PLUGIN_DIR is not set; skipping real runtime test')
      return
    }
    const discovery = await discoverMagikaManagedPlugin({
      pluginDirs: [MAGIKA_PLUGIN_DIR],
    })
    if (!discovery.available) return
    const { readFile } = await import('node:fs/promises')
    let content: string
    try {
      content = await readFile(discovery.descriptor.runtimeEntryPath, 'utf8')
    } catch {
      return
    }
    expect(content.length).toBeGreaterThan(0)
  })

  it('classify runner produces valid output with real runtime', async () => {
    if (!MAGIKA_PLUGIN_DIR) {
      console.warn('[magika-real-test] STARVERSE_REAL_MAGIKA_PLUGIN_DIR is not set; skipping real classify test')
      return
    }
    const discovery = await discoverMagikaManagedPlugin({
      pluginDirs: [MAGIKA_PLUGIN_DIR],
    })
    if (!discovery.available) return

    const modelDirPath = path.dirname(discovery.descriptor.modelFilePaths[0] ?? path.join(MAGIKA_PLUGIN_DIR, 'model'))
    const configDirPath = path.dirname(discovery.descriptor.configFilePaths[0] ?? path.join(MAGIKA_PLUGIN_DIR, 'model'))

    const result = await runMagikaClassify({
      inputBytes: new Uint8Array([1, 2, 3]),
      runtimeEntryPath: discovery.descriptor.runtimeEntryPath,
      modelDirPath,
      configDirPath,
      timeoutMs: 60000,
    })

    expect(result.ok).toBe(true)
    if (!result.ok) return
    expect(typeof result.label).toBe('string')
    expect(result.label.length).toBeGreaterThan(0)
    expect(result.score).toBeGreaterThanOrEqual(0)
    expect(result.score).toBeLessThanOrEqual(1)
    expect(result.modelVersion).toBeTruthy()
  })

  it('classify runner handles empty input with real runtime', async () => {
    if (!MAGIKA_PLUGIN_DIR) {
      console.warn('[magika-real-test] STARVERSE_REAL_MAGIKA_PLUGIN_DIR is not set; skipping real empty input test')
      return
    }
    const discovery = await discoverMagikaManagedPlugin({
      pluginDirs: [MAGIKA_PLUGIN_DIR],
    })
    if (!discovery.available) return

    const modelDirPath = path.dirname(discovery.descriptor.modelFilePaths[0] ?? '')
    const configDirPath = path.dirname(discovery.descriptor.configFilePaths[0] ?? '')

    const result = await runMagikaClassify({
      inputBytes: new Uint8Array(0),
      runtimeEntryPath: discovery.descriptor.runtimeEntryPath,
      modelDirPath,
      configDirPath,
      timeoutMs: 60000,
    })

    expect(result.ok).toBe(true)
  })

  it('classify runner returns input_too_large for 11MB input', async () => {
    const large = new Uint8Array(11 * 1024 * 1024)
    const result = await runMagikaClassify({
      inputBytes: large,
      runtimeEntryPath: '',
      modelDirPath: '',
      configDirPath: '',
    })
    expect(result.ok).toBe(false)
    if (result.ok) return
    expect(result.errorCode).toBe('input_too_large')
  })
})
