import { mkdtemp, mkdir, rm, writeFile } from 'node:fs/promises'
import os from 'node:os'
import path from 'node:path'
import { describe, expect, it } from 'vitest'
import {
  runMagikaClassify,
  type MagikaClassifyRunnerResult,
} from './magikaClassifyRunner'
import type { ExternalProcessRunResult } from './externalProcessRunner'

function createFakeRuntimeEntry(modelVersion: string): string {
  return `
const fs = require('fs');
const input = process.argv.indexOf('--input') >= 0 ? process.argv[process.argv.indexOf('--input') + 1] : null;
const inputBytes = input ? fs.readFileSync(input) : null;
const label = inputBytes && inputBytes.length > 0 ? 'json' : 'pdf';
const score = 0.95;
const result = { label, score, modelVersion: '${modelVersion}' };
process.stdout.write(JSON.stringify(result));
`
}

function createErrorRuntimeEntry(errorType: 'exit1' | 'bad_json' | 'missing_label' | 'bad_score' | 'crash'): string {
  if (errorType === 'exit1') return 'process.exit(1)'
  if (errorType === 'bad_json') return 'process.stdout.write("not json")'
  if (errorType === 'missing_label') return 'process.stdout.write(JSON.stringify({score:0.9}))'
  if (errorType === 'bad_score') return 'process.stdout.write(JSON.stringify({label:"pdf",score:-1}))'
  if (errorType === 'crash') return 'throw new Error("crash")'
  return 'process.exit(0)'
}

type TempFixture = Readonly<{
  rootDir: string
  runtimeEntryPath: string
  modelDirPath: string
  configDirPath: string
  cleanup: () => Promise<void>
}>

async function createTempFixture(input: Readonly<{
  modelVersion?: string
  errorType?: 'exit1' | 'bad_json' | 'missing_label' | 'bad_score' | 'crash'
}> = {}): Promise<TempFixture> {
  const rootDir = await mkdtemp(path.join(os.tmpdir(), 'starverse-classify-runner-'))
  const runtimeDir = path.join(rootDir, 'runtime')
  const modelDir = path.join(rootDir, 'model')
  const configDir = path.join(rootDir, 'config')
  await mkdir(runtimeDir, { recursive: true })
  await mkdir(modelDir, { recursive: true })
  await mkdir(configDir, { recursive: true })

  const runtimeCode = input.errorType
    ? createErrorRuntimeEntry(input.errorType)
    : createFakeRuntimeEntry(input.modelVersion ?? 'magika-v3')
  const runtimeEntryPath = path.join(runtimeDir, 'runner.js')
  await writeFile(runtimeEntryPath, runtimeCode)
  await writeFile(path.join(modelDir, 'model.bin'), 'fake-model')
  await writeFile(path.join(configDir, 'config.json'), '{}')

  return {
    rootDir,
    runtimeEntryPath,
    modelDirPath: modelDir,
    configDirPath: configDir,
    cleanup: async () => { await rm(rootDir, { recursive: true, force: true }) },
  }
}

function createMockProcessRunner(output: Partial<ExternalProcessRunResult>): (input: any) => Promise<ExternalProcessRunResult> {
  return async () => ({
    exitCode: 0,
    signal: null,
    stdout: '',
    stderr: '',
    timedOut: false,
    outputLimited: false,
    terminationAttempted: false,
    terminated: true,
    errorCode: null,
    elapsedMs: 100,
    ...output,
  })
}

// eslint-disable-next-line max-lines-per-function
describe('magikaClassifyRunner', () => {
  it('runs fake runtime and returns classify output', async () => {
    const fixture = await createTempFixture()
    try {
      const result = await runMagikaClassify({
        inputBytes: new Uint8Array([1, 2, 3]),
        runtimeEntryPath: fixture.runtimeEntryPath,
        modelDirPath: fixture.modelDirPath,
        configDirPath: fixture.configDirPath,
      })
      expect(result.ok).toBe(true)
      if (!result.ok) return
      expect(result.label).toBe('json')
      expect(result.score).toBe(0.95)
      expect(result.modelVersion).toBe('magika-v3')
      expect(result.elapsedMs).toBeGreaterThanOrEqual(0)
    } finally {
      await fixture.cleanup()
    }
  })

  it('returns input_too_large when bytes exceed 10MB', async () => {
    const fixture = await createTempFixture()
    try {
      const large = new Uint8Array(10 * 1024 * 1024 + 1)
      const result = await runMagikaClassify({
        inputBytes: large,
        runtimeEntryPath: fixture.runtimeEntryPath,
        modelDirPath: fixture.modelDirPath,
        configDirPath: fixture.configDirPath,
      })
      expect(result.ok).toBe(false)
      if (result.ok) return
      expect(result.errorCode).toBe('input_too_large')
    } finally {
      await fixture.cleanup()
    }
  })

  it('handles runtime exit non-zero', async () => {
    const fixture = await createTempFixture({ errorType: 'exit1' })
    try {
      const result = await runMagikaClassify({
        inputBytes: new Uint8Array([1]),
        runtimeEntryPath: fixture.runtimeEntryPath,
        modelDirPath: fixture.modelDirPath,
        configDirPath: fixture.configDirPath,
      })
      expect(result.ok).toBe(false)
      if (result.ok) return
      expect(result.errorCode).toBe('runtime_error')
    } finally {
      await fixture.cleanup()
    }
  })

  it('handles invalid JSON output', async () => {
    const fixture = await createTempFixture({ errorType: 'bad_json' })
    try {
      const result = await runMagikaClassify({
        inputBytes: new Uint8Array([1]),
        runtimeEntryPath: fixture.runtimeEntryPath,
        modelDirPath: fixture.modelDirPath,
        configDirPath: fixture.configDirPath,
      })
      expect(result.ok).toBe(false)
      if (result.ok) return
      expect(result.errorCode).toBe('invalid_output')
    } finally {
      await fixture.cleanup()
    }
  })

  it('handles missing label in output', async () => {
    const fixture = await createTempFixture({ errorType: 'missing_label' })
    try {
      const result = await runMagikaClassify({
        inputBytes: new Uint8Array([1]),
        runtimeEntryPath: fixture.runtimeEntryPath,
        modelDirPath: fixture.modelDirPath,
        configDirPath: fixture.configDirPath,
      })
      expect(result.ok).toBe(false)
      if (result.ok) return
      expect(result.errorCode).toBe('invalid_output')
    } finally {
      await fixture.cleanup()
    }
  })

  it('handles bad score value', async () => {
    const fixture = await createTempFixture({ errorType: 'bad_score' })
    try {
      const result = await runMagikaClassify({
        inputBytes: new Uint8Array([1]),
        runtimeEntryPath: fixture.runtimeEntryPath,
        modelDirPath: fixture.modelDirPath,
        configDirPath: fixture.configDirPath,
      })
      expect(result.ok).toBe(false)
      if (result.ok) return
      expect(result.errorCode).toBe('invalid_output')
    } finally {
      await fixture.cleanup()
    }
  })

  it('handles timeout via mock process runner', async () => {
    const fixture = await createTempFixture()
    try {
      const result = await runMagikaClassify({
        inputBytes: new Uint8Array([1]),
        runtimeEntryPath: fixture.runtimeEntryPath,
        modelDirPath: fixture.modelDirPath,
        configDirPath: fixture.configDirPath,
      }, {
        processRunner: createMockProcessRunner({
          timedOut: true,
          errorCode: 'process_timeout',
          exitCode: null,
          stdout: '',
        }),
      })
      expect(result.ok).toBe(false)
      if (result.ok) return
      expect(result.errorCode).toBe('timeout')
    } finally {
      await fixture.cleanup()
    }
  })

  it('handles output limit via mock process runner', async () => {
    const fixture = await createTempFixture()
    try {
      const result = await runMagikaClassify({
        inputBytes: new Uint8Array([1]),
        runtimeEntryPath: fixture.runtimeEntryPath,
        modelDirPath: fixture.modelDirPath,
        configDirPath: fixture.configDirPath,
      }, {
        processRunner: createMockProcessRunner({
          outputLimited: true,
          errorCode: 'output_limit_exceeded',
          exitCode: null,
          stdout: '',
        }),
      })
      expect(result.ok).toBe(false)
      if (result.ok) return
      expect(result.errorCode).toBe('output_limit')
    } finally {
      await fixture.cleanup()
    }
  })

  it('handles process kill failure', async () => {
    const fixture = await createTempFixture()
    try {
      const result = await runMagikaClassify({
        inputBytes: new Uint8Array([1]),
        runtimeEntryPath: fixture.runtimeEntryPath,
        modelDirPath: fixture.modelDirPath,
        configDirPath: fixture.configDirPath,
      }, {
        processRunner: createMockProcessRunner({
          errorCode: 'process_kill_failed',
          exitCode: null,
          stdout: '',
        }),
      })
      expect(result.ok).toBe(false)
      if (result.ok) return
      expect(result.errorCode).toBe('process_kill_failed')
    } finally {
      await fixture.cleanup()
    }
  })

  it('sanitizes paths in failure details', async () => {
    const fixture = await createTempFixture({ errorType: 'exit1' })
    try {
      const result = await runMagikaClassify({
        inputBytes: new Uint8Array([1]),
        runtimeEntryPath: fixture.runtimeEntryPath,
        modelDirPath: fixture.modelDirPath,
        configDirPath: fixture.configDirPath,
      })
      expect(result.ok).toBe(false)
      if (result.ok) return
      expect(result.detail).not.toContain(fixture.runtimeEntryPath)
      expect(result.detail).not.toMatch(/[A-Za-z]:\\/u)
    } finally {
      await fixture.cleanup()
    }
  })

  it('classifies with empty input bytes returning label via fake runtime', async () => {
    const fixture = await createTempFixture()
    try {
      const result = await runMagikaClassify({
        inputBytes: new Uint8Array(0),
        runtimeEntryPath: fixture.runtimeEntryPath,
        modelDirPath: fixture.modelDirPath,
        configDirPath: fixture.configDirPath,
      })
      expect(result.ok).toBe(true)
      if (!result.ok) return
      expect(result.label).toBe('pdf')
    } finally {
      await fixture.cleanup()
    }
  })
})
