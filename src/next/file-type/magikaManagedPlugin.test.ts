import { createHash } from 'node:crypto'
import { mkdtemp, mkdir, rm, writeFile, readFile, readdir, stat } from 'node:fs/promises'
import os from 'node:os'
import path from 'node:path'
import { describe, expect, it } from 'vitest'
import { buildSendPlanCandidates } from './sendRouteMapping'
import {
  createManagedPluginMagikaRuntimeLoader,
  discoverMagikaManagedPlugin,
  evaluateMagikaManagedPluginAvailability,
  parseMagikaManagedPluginManifest,
  runManagedMagikaPluginHealthCheck,
  toManagedEnginePluginManifest,
  type MagikaManagedPluginManifest,
} from './magikaManagedPlugin'
import type { ModelInputCapabilities } from './types'

const fullCapabilities: ModelInputCapabilities = {
  acceptsText: true,
  acceptsImage: true,
  acceptsAudio: true,
  acceptsVideo: true,
  acceptsFile: true,
  acceptsPdf: true,
  acceptsCsv: true,
  acceptsTsv: true,
  acceptsUrlRef: true,
  acceptsInlineData: true,
}

type PluginFixture = Readonly<{
  rootDir: string
  runtimeEntryPath: string
  modelPath: string
  configPath: string
  manifestPath: string
  manifest: MagikaManagedPluginManifest
}>

async function withPluginFixture(
  run: (fixture: PluginFixture) => Promise<void>,
  input: Readonly<{
    withIntegrity?: boolean
    withHealthcheck?: boolean
  }> = {}
): Promise<void> {
  const rootDir = await mkdtemp(path.join(os.tmpdir(), 'starverse-magika-plugin-'))
  const runtimeDir = path.join(rootDir, 'runtime')
  const modelDir = path.join(rootDir, 'model')
  await mkdir(runtimeDir, { recursive: true })
  await mkdir(modelDir, { recursive: true })

  const runtimeEntryPath = path.join(runtimeDir, 'runner.js')
  const modelPath = path.join(modelDir, 'model.bin')
  const configPath = path.join(modelDir, 'config.json')
  await writeFile(runtimeEntryPath, 'module.exports = {}')
  await writeFile(modelPath, 'mock-model')
  await writeFile(configPath, '{"version":"m-v1"}')

  const runtimeSha = sha256(await readFile(runtimeEntryPath))
  const modelSha = sha256(await readFile(modelPath))
  const configSha = sha256(await readFile(configPath))

  const manifestObject: Record<string, unknown> = {
    manifestSchemaVersion: '1',
    engineId: 'magika',
    displayName: 'Magika managed plugin',
    pluginVersion: '0.1.0',
    runtimeKind: 'local_loader',
    runtimeEntry: 'runtime/runner.js',
    modelVersion: 'magika-model-v3',
    modelFiles: ['model/model.bin'],
    configFiles: ['model/config.json'],
    integrity: input.withIntegrity === false
      ? {}
      : {
          'runtime/runner.js': runtimeSha,
          'model/model.bin': modelSha,
          'model/config.json': configSha,
        },
    license: 'Apache-2.0',
    attribution: 'Google Magika',
    capabilities: ['text_extraction'],
    supportedFormatIds: [],
    supportedMimeTypes: [],
    taxonomyMapVersionCompatibility: 'v0-stage-b',
    supportedLabels: ['json', 'pdf'],
    minStarverseVersion: '0.0.2',
    platform: 'any',
  }

  if (input.withHealthcheck) {
    manifestObject.healthcheck = {
      command: 'node',
      args: ['-e', 'process.exit(0)'],
      cwd: null,
    }
  }

  const manifestPath = path.join(rootDir, 'manifest.json')
  await writeFile(manifestPath, JSON.stringify(manifestObject, null, 2))
  const manifest = parseMagikaManagedPluginManifest(manifestObject)

  try {
    await run({
      rootDir,
      runtimeEntryPath,
      modelPath,
      configPath,
      manifestPath,
      manifest,
    })
  } finally {
    await rm(rootDir, { recursive: true, force: true })
  }
}

async function readManifestObject(manifestPath: string): Promise<Record<string, unknown>> {
  const raw = await readFile(manifestPath, 'utf8')
  return JSON.parse(raw) as Record<string, unknown>
}

async function updateManifestObject(
  manifestPath: string,
  update: (manifest: Record<string, unknown>) => void
): Promise<void> {
  const manifest = await readManifestObject(manifestPath)
  update(manifest)
  await writeFile(manifestPath, JSON.stringify(manifest, null, 2))
}

// eslint-disable-next-line max-lines-per-function
describe('magikaManagedPlugin', () => {
  it('parses a valid managed plugin manifest', async () => {
    await withPluginFixture(async ({ manifest }) => {
      expect(manifest.engineId).toBe('magika')
      expect(manifest.modelVersion).toBe('magika-model-v3')
      expect(manifest.runtimeKind).toBe('local_loader')
    })
  })

  it('returns plugin_not_found when manifest is missing', async () => {
    const rootDir = await mkdtemp(path.join(os.tmpdir(), 'starverse-magika-missing-'))
    try {
      const discovery = await discoverMagikaManagedPlugin({ pluginDirs: [rootDir] })
      expect(discovery.available).toBe(false)
      if (discovery.available) return
      expect(discovery.reason).toBe('plugin_not_found')
    } finally {
      await rm(rootDir, { recursive: true, force: true })
    }
  })

  it('fails discovery when runtime entry is missing', async () => {
    await withPluginFixture(async ({ rootDir, runtimeEntryPath }) => {
      await rm(runtimeEntryPath, { force: true })
      const discovery = await discoverMagikaManagedPlugin({ pluginDirs: [rootDir] })
      expect(discovery.available).toBe(false)
      if (discovery.available) return
      expect(discovery.reason).toBe('runtime_entry_missing')
    })
  })

  it('fails discovery when model file is missing', async () => {
    await withPluginFixture(async ({ rootDir, modelPath }) => {
      await rm(modelPath, { force: true })
      const discovery = await discoverMagikaManagedPlugin({ pluginDirs: [rootDir] })
      expect(discovery.available).toBe(false)
      if (discovery.available) return
      expect(discovery.reason).toBe('model_file_missing')
    })
  })

  it('fails discovery when config file is missing', async () => {
    await withPluginFixture(async ({ rootDir, configPath }) => {
      await rm(configPath, { force: true })
      const discovery = await discoverMagikaManagedPlugin({ pluginDirs: [rootDir] })
      expect(discovery.available).toBe(false)
      if (discovery.available) return
      expect(discovery.reason).toBe('config_file_missing')
    })
  })

  it('rejects runtimeEntry path traversal outside plugin root', async () => {
    await withPluginFixture(async ({ rootDir, manifestPath }) => {
      await updateManifestObject(manifestPath, (manifest) => {
        manifest.runtimeEntry = '../../../system/sensitive.dll'
      })
      const discovery = await discoverMagikaManagedPlugin({ pluginDirs: [rootDir] })
      expect(discovery.available).toBe(false)
      if (discovery.available) return
      expect(discovery.reason).toBe('plugin_path_outside_root')
    })
  })

  it('rejects modelFiles path traversal outside plugin root', async () => {
    await withPluginFixture(async ({ rootDir, manifestPath }) => {
      await updateManifestObject(manifestPath, (manifest) => {
        manifest.modelFiles = ['../model.bin']
      })
      const discovery = await discoverMagikaManagedPlugin({ pluginDirs: [rootDir] })
      expect(discovery.available).toBe(false)
      if (discovery.available) return
      expect(discovery.reason).toBe('plugin_path_outside_root')
    })
  })

  it('rejects configFiles path traversal outside plugin root', async () => {
    await withPluginFixture(async ({ rootDir, manifestPath }) => {
      await updateManifestObject(manifestPath, (manifest) => {
        manifest.configFiles = ['../config.json']
      })
      const discovery = await discoverMagikaManagedPlugin({ pluginDirs: [rootDir] })
      expect(discovery.available).toBe(false)
      if (discovery.available) return
      expect(discovery.reason).toBe('plugin_path_outside_root')
    })
  })

  it('rejects runtimeEntry absolute path', async () => {
    await withPluginFixture(async ({ rootDir, manifestPath }) => {
      const absolute = path.resolve(rootDir, 'runtime', 'runner.js')
      await updateManifestObject(manifestPath, (manifest) => {
        manifest.runtimeEntry = absolute
      })
      const discovery = await discoverMagikaManagedPlugin({ pluginDirs: [rootDir] })
      expect(discovery.available).toBe(false)
      if (discovery.available) return
      expect(discovery.reason).toBe('manifest_invalid')
    })
  })

  it('rejects runtimeEntry Windows drive path', async () => {
    await withPluginFixture(async ({ rootDir, manifestPath }) => {
      await updateManifestObject(manifestPath, (manifest) => {
        manifest.runtimeEntry = 'C:\\Windows\\System32\\cmd.exe'
      })
      const discovery = await discoverMagikaManagedPlugin({ pluginDirs: [rootDir] })
      expect(discovery.available).toBe(false)
      if (discovery.available) return
      expect(discovery.reason).toBe('manifest_invalid')
    })
  })

  it('rejects runtimeEntry UNC path', async () => {
    await withPluginFixture(async ({ rootDir, manifestPath }) => {
      await updateManifestObject(manifestPath, (manifest) => {
        manifest.runtimeEntry = '\\\\server\\share\\magika.exe'
      })
      const discovery = await discoverMagikaManagedPlugin({ pluginDirs: [rootDir] })
      expect(discovery.available).toBe(false)
      if (discovery.available) return
      expect(discovery.reason).toBe('manifest_invalid')
    })
  })

  it('rejects quoted absolute runtimeEntry path', async () => {
    await withPluginFixture(async ({ rootDir, manifestPath }) => {
      await updateManifestObject(manifestPath, (manifest) => {
        manifest.runtimeEntry = '"C:\\Windows\\System32\\cmd.exe"'
      })
      const discovery = await discoverMagikaManagedPlugin({ pluginDirs: [rootDir] })
      expect(discovery.available).toBe(false)
      if (discovery.available) return
      expect(discovery.reason).toBe('manifest_invalid')
    })
  })

  it('rejects runtimeEntry absolute path with spaces', async () => {
    await withPluginFixture(async ({ rootDir, manifestPath }) => {
      await updateManifestObject(manifestPath, (manifest) => {
        manifest.runtimeEntry = 'C:\\Program Files\\Windows NT\\cmd.exe'
      })
      const discovery = await discoverMagikaManagedPlugin({ pluginDirs: [rootDir] })
      expect(discovery.available).toBe(false)
      if (discovery.available) return
      expect(discovery.reason).toBe('manifest_invalid')
    })
  })

  it('rejects path that targets sibling directory with similar prefix', async () => {
    const baseDir = await mkdtemp(path.join(os.tmpdir(), 'starverse-magika-prefix-'))
    const pluginDir = path.join(baseDir, 'magika')
    const siblingDir = path.join(baseDir, 'magika-evil')
    await mkdir(pluginDir, { recursive: true })
    await mkdir(path.join(pluginDir, 'runtime'), { recursive: true })
    await mkdir(path.join(pluginDir, 'model'), { recursive: true })
    await mkdir(siblingDir, { recursive: true })
    await writeFile(path.join(pluginDir, 'runtime', 'runner.js'), 'module.exports = {}')
    await writeFile(path.join(pluginDir, 'model', 'model.bin'), 'mock-model')
    await writeFile(path.join(pluginDir, 'model', 'config.json'), '{"version":"m-v1"}')
    await writeFile(path.join(siblingDir, 'runner.js'), 'evil')

    const runtimeBytes = await readFile(path.join(pluginDir, 'runtime', 'runner.js'))
    const modelBytes = await readFile(path.join(pluginDir, 'model', 'model.bin'))
    const configBytes = await readFile(path.join(pluginDir, 'model', 'config.json'))
    const manifestPath = path.join(pluginDir, 'manifest.json')
    const manifest = {
      manifestSchemaVersion: '1',
      engineId: 'magika',
      displayName: 'Magika managed plugin',
      pluginVersion: '0.1.0',
      runtimeKind: 'local_loader',
      runtimeEntry: '../magika-evil/runner.js',
      modelVersion: 'magika-model-v3',
      modelFiles: ['model/model.bin'],
      configFiles: ['model/config.json'],
      integrity: {
        '../magika-evil/runner.js': sha256(runtimeBytes),
        'model/model.bin': sha256(modelBytes),
        'model/config.json': sha256(configBytes),
      },
      license: 'Apache-2.0',
      attribution: 'Google Magika',
      capabilities: ['text_extraction'],
    }
    await writeFile(manifestPath, JSON.stringify(manifest, null, 2))

    try {
      const discovery = await discoverMagikaManagedPlugin({ pluginDirs: [pluginDir] })
      expect(discovery.available).toBe(false)
      if (discovery.available) return
      expect(discovery.reason).toBe('plugin_path_outside_root')
    } finally {
      await rm(baseDir, { recursive: true, force: true })
    }
  })

  it('fails discovery when runtimeEntry integrity entry is missing', async () => {
    await withPluginFixture(async ({ rootDir, manifestPath }) => {
      await updateManifestObject(manifestPath, (manifest) => {
        const integrity = { ...(manifest.integrity as Record<string, string>) }
        delete integrity['runtime/runner.js']
        manifest.integrity = integrity
      })
      const discovery = await discoverMagikaManagedPlugin({ pluginDirs: [rootDir] })
      expect(discovery.available).toBe(false)
      if (discovery.available) return
      expect(discovery.reason).toBe('integrity_missing')
    })
  })

  it('fails discovery when modelFiles integrity entry is missing', async () => {
    await withPluginFixture(async ({ rootDir, manifestPath }) => {
      await updateManifestObject(manifestPath, (manifest) => {
        const integrity = { ...(manifest.integrity as Record<string, string>) }
        delete integrity['model/model.bin']
        manifest.integrity = integrity
      })
      const discovery = await discoverMagikaManagedPlugin({ pluginDirs: [rootDir] })
      expect(discovery.available).toBe(false)
      if (discovery.available) return
      expect(discovery.reason).toBe('integrity_missing')
    })
  })

  it('fails discovery when configFiles integrity entry is missing', async () => {
    await withPluginFixture(async ({ rootDir, manifestPath }) => {
      await updateManifestObject(manifestPath, (manifest) => {
        const integrity = { ...(manifest.integrity as Record<string, string>) }
        delete integrity['model/config.json']
        manifest.integrity = integrity
      })
      const discovery = await discoverMagikaManagedPlugin({ pluginDirs: [rootDir] })
      expect(discovery.available).toBe(false)
      if (discovery.available) return
      expect(discovery.reason).toBe('integrity_missing')
    })
  })

  it('rejects integrity key path traversal', async () => {
    await withPluginFixture(async ({ rootDir, manifestPath, runtimeEntryPath }) => {
      await updateManifestObject(manifestPath, (manifest) => {
        manifest.integrity = {
          '../runtime/runner.js': sha256(Buffer.from('fake')),
          ...(manifest.integrity as Record<string, string>),
        }
      })
      const discovery = await discoverMagikaManagedPlugin({ pluginDirs: [rootDir] })
      expect(discovery.available).toBe(false)
      if (discovery.available) return
      expect(discovery.reason).toBe('plugin_path_outside_root')
      expect(discovery.detail).not.toContain(runtimeEntryPath)
    })
  })

  it('passes discovery when all core files include correct integrity hashes', async () => {
    await withPluginFixture(async ({ rootDir }) => {
      const discovery = await discoverMagikaManagedPlugin({ pluginDirs: [rootDir] })
      expect(discovery.available).toBe(true)
    })
  })

  it('fails discovery on integrity hash mismatch', async () => {
    await withPluginFixture(async ({ rootDir, modelPath }) => {
      await writeFile(modelPath, 'tampered-model')
      const discovery = await discoverMagikaManagedPlugin({ pluginDirs: [rootDir] })
      expect(discovery.available).toBe(false)
      if (discovery.available) return
      expect(discovery.reason).toBe('hash_mismatch')
    })
  })

  it('propagates modelVersion through managed runtime loader', async () => {
    await withPluginFixture(async ({ rootDir }) => {
      const loader = createManagedPluginMagikaRuntimeLoader({
        pluginDirs: [rootDir],
        classify: async () => ({ label: 'json', score: 0.93 }),
      })
      const loaded = await loader.load()
      expect(loaded.available).toBe(true)
      if (!loaded.available) return
      expect(loaded.runtime.modelVersion).toBe('magika-model-v3')
      const result = await loaded.runtime.classify({ bytes: new Uint8Array([1]) })
      expect(result?.label).toBe('json')
    })
  })

  it('maps health timeout and output limit with structured failure reasons', async () => {
    await withPluginFixture(
      async ({ rootDir }) => {
        const timeout = await evaluateMagikaManagedPluginAvailability({
          pluginDirs: [rootDir],
          healthRunner: async () => ({
            status: 'timeout',
            reason: 'engine_timeout',
            detail: 'timeout',
          }),
        })
        expect(timeout.available).toBe(false)
        expect(timeout.reason).toBe('engine_timeout')

        const outputLimited = await evaluateMagikaManagedPluginAvailability({
          pluginDirs: [rootDir],
          healthRunner: async () => ({
            status: 'failed',
            reason: 'output_limit_exceeded',
            detail: 'too much output',
          }),
        })
        expect(outputLimited.available).toBe(false)
        expect(outputLimited.reason).toBe('output_limit_exceeded')
      },
      { withHealthcheck: true }
    )
  })

  it('falls back to unavailable loader when plugin health is unavailable', async () => {
    await withPluginFixture(
      async ({ rootDir }) => {
        const loader = createManagedPluginMagikaRuntimeLoader({
          pluginDirs: [rootDir],
          healthRunner: async () => ({
            status: 'failed',
            reason: 'engine_unavailable',
            detail: 'runner unavailable',
          }),
        })
        const loaded = await loader.load()
        expect(loaded.available).toBe(false)
        if (loaded.available) return
        expect(loaded.reason).toBe('runtime_unavailable')
      },
      { withHealthcheck: true }
    )
  })

  it('does not globally block send route mapping when magika engine is unavailable', () => {
    const candidates = buildSendPlanCandidates({
      verdict: {
        primary: {
          formatId: 'docx',
          kind: 'document',
          confidence: 'high',
          reasonCodes: [],
          sourceCodeMeta: null,
        },
        conflicts: [],
        flags: [],
        evidence: [],
        schemaVersion: 'v1',
        taxonomyVersion: 'v1',
        detectionCost: 'low',
        fingerprint: 'fp',
      },
      modelCapabilities: fullCapabilities,
      engineAvailability: {
        engines: [
          {
            id: 'magika',
            displayName: 'Magika',
            version: 'v3',
            platform: 'any',
            kind: 'plugin',
            capabilities: [],
            supportedFormatIds: [],
            supportedMimeTypes: [],
            enabled: true,
            healthStatus: 'failed',
            failureReason: 'engine_unavailable',
            failureDetails: 'runtime unavailable',
            lastCheckedAt: 1,
            healthcheck: null,
          },
        ],
        diagnostics: [],
        capabilityAvailability: {
          document_conversion: true,
          spreadsheet_conversion: true,
          presentation_conversion: true,
          rendered_images: true,
          text_extraction: true,
          audio_extraction: true,
          frame_selection: true,
        },
        routeAvailability: {
          documentConversion: true,
          spreadsheetConversion: true,
          presentationConversion: true,
          renderedImages: true,
          textExtraction: true,
          audioExtraction: true,
          frameSelection: true,
        },
      },
    })
    const converted = candidates.find((candidate) => candidate.route === 'converted_markdown')
    expect(converted?.blocked).toBe(false)
  })

  it('does not add magika or tfjs to main-package dependencies', async () => {
    const packageJsonPath = path.resolve(process.cwd(), 'package.json')
    const raw = await readFile(packageJsonPath, 'utf8')
    const parsed = JSON.parse(raw) as {
      dependencies?: Record<string, string>
      devDependencies?: Record<string, string>
    }
    const deps = Object.keys(parsed.dependencies ?? {})
    const devDeps = Object.keys(parsed.devDependencies ?? {})
    const all = new Set([...deps, ...devDeps])
    expect(all.has('magika')).toBe(false)
    expect(all.has('@tensorflow/tfjs')).toBe(false)
    expect(all.has('@tensorflow/tfjs-node')).toBe(false)
  })

  it('keeps repository free of committed local magika model bundle artifacts', async () => {
    const repoRoot = process.cwd()
    const forbiddenRoots = [
      path.join(repoRoot, '.starverse-engines', 'magika', 'model'),
      path.join(repoRoot, 'StarversePortable', 'engines', 'magika', 'model'),
      path.join(repoRoot, 'engines', 'magika', 'model'),
    ]
    for (const forbidden of forbiddenRoots) {
      const exists = await existsPath(forbidden)
      expect(exists).toBe(false)
    }
  })

  it('converts parsed plugin descriptor into registry manifest contract', async () => {
    await withPluginFixture(async ({ rootDir }) => {
      const discovery = await discoverMagikaManagedPlugin({ pluginDirs: [rootDir] })
      expect(discovery.available).toBe(true)
      if (!discovery.available) return
      const manifest = toManagedEnginePluginManifest(discovery.descriptor)
      expect(manifest.id).toBe('magika')
      expect(manifest.kind).toBe('plugin')
      expect(manifest.version).toBe('0.1.0')
    })
  })

  it('sanitizes absolute paths from discovery failure detail', async () => {
    await withPluginFixture(async ({ rootDir, runtimeEntryPath }) => {
      await rm(runtimeEntryPath, { force: true })
      const discovery = await discoverMagikaManagedPlugin({ pluginDirs: [rootDir] })
      expect(discovery.available).toBe(false)
      if (discovery.available) return
      expect(discovery.detail).not.toContain(runtimeEntryPath)
      expect(discovery.detail).not.toMatch(/[A-Za-z]:\\/u)
      expect(discovery.detail).not.toMatch(/\/Users\/|\/home\/|\/mnt\/|\/var\/|\/tmp\//u)
    })
  })
})

function sha256(bytes: Uint8Array): string {
  return createHash('sha256').update(Buffer.from(bytes)).digest('hex')
}

async function existsPath(value: string): Promise<boolean> {
  try {
    const entry = await stat(value)
    if (entry.isFile()) return true
    if (entry.isDirectory()) {
      const files = await readdir(value)
      return files.length > 0
    }
    return false
  } catch {
    return false
  }
}
