import { mkdtemp, mkdir, rm, writeFile } from 'node:fs/promises'
import os from 'node:os'
import path from 'node:path'
import { describe, expect, it } from 'vitest'
import {
  runTika,
  type TikaRunnerResult,
} from './tikaRunner'
import type { ExternalProcessRunResult } from './externalProcessRunner'

const NODE = process.execPath

function createFakeTikaRuntime(mode: 'detect' | 'extract_text' | 'metadata' | 'combined'): string {
  if (mode === 'detect') {
    return `process.stdout.write(JSON.stringify({detectedFormatId:"pdf",detectedMime:"application/pdf"}))`
  }
  if (mode === 'extract_text') {
    return `process.stdout.write(JSON.stringify({extractedText:"Hello world content"}))`
  }
  if (mode === 'metadata') {
    return `process.stdout.write(JSON.stringify({metadata:{"Content-Type":"application/pdf","Author":"Alice","X-Custom":"secret"}}))`
  }
  return `process.stdout.write(JSON.stringify({detectedFormatId:"pdf",detectedMime:"application/pdf",extractedText:"Hello world content",metadata:{"Content-Type":"application/pdf","Author":"Alice","X-Custom":"secret"},warnings:["truncated"]}))`
}

function createErrorRuntime(errorType: 'exit1' | 'bad_json' | 'empty_object' | 'no_fields' | 'bad_metadata' | 'crash' | 'sensitive_metadata'): string {
  if (errorType === 'exit1') return 'process.exit(1)'
  if (errorType === 'bad_json') return 'process.stdout.write("not json")'
  if (errorType === 'empty_object') return 'process.stdout.write("{}")'
  if (errorType === 'no_fields') return 'process.stdout.write(JSON.stringify({unrelated:true}))'
  if (errorType === 'bad_metadata') return 'process.stdout.write(JSON.stringify({metadata:"not-an-object"}))'
  if (errorType === 'crash') return 'throw new Error("tika crash")'
  if (errorType === 'sensitive_metadata') {
    return `process.stdout.write(JSON.stringify({metadata:{"Author":"alice","Resource-Name":"C:\\\\Users\\\\alice\\\\secret\\\\doc.pdf","X-Temp-Path":"/tmp/tika-input-abc123.bin","Custom-Hash":"abcdef0123456789abcdef0123456789abcdef0123456789abcdef0123456789beef"}}))`
  }
  return 'process.exit(0)'
}

type TempFixture = Readonly<{
  rootDir: string
  runtimeEntryPath: string
  cleanup: () => Promise<void>
}>

async function createTempFixture(input: Readonly<{
  mode?: 'detect' | 'extract_text' | 'metadata' | 'combined'
  errorType?: 'exit1' | 'bad_json' | 'empty_object' | 'no_fields' | 'bad_metadata' | 'crash' | 'sensitive_metadata'
}> = {}): Promise<TempFixture> {
  const rootDir = await mkdtemp(path.join(os.tmpdir(), 'starverse-tika-runner-'))
  const runtimeDir = path.join(rootDir, 'runtime')
  await mkdir(runtimeDir, { recursive: true })

  const runtimeCode = input.errorType
    ? createErrorRuntime(input.errorType)
    : createFakeTikaRuntime(input.mode ?? 'combined')
  const runtimeEntryPath = path.join(runtimeDir, 'fake-tika-runner.js')
  await writeFile(runtimeEntryPath, runtimeCode)

  return {
    rootDir,
    runtimeEntryPath,
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

function runTikaWithFixture(
  fixture: TempFixture,
  input: Readonly<{
    inputBytes?: Uint8Array
    mode?: 'detect' | 'extract_text' | 'metadata' | 'combined'
    metadataAllowlist?: readonly string[] | null
    maxInputBytes?: number
  }> = {}
): Promise<TikaRunnerResult> {
  return runTika({
    inputBytes: input.inputBytes ?? new Uint8Array([1, 2, 3]),
    command: NODE,
    args: [fixture.runtimeEntryPath],
    mode: input.mode ?? 'combined',
    metadataAllowlist: input.metadataAllowlist ?? null,
    maxInputBytes: input.maxInputBytes,
  })
}

// eslint-disable-next-line max-lines-per-function
describe('tikaRunner', () => {
  // -- detect mode --
  it('runs fake tika in detect mode and returns format+mime', async () => {
    const fixture = await createTempFixture({ mode: 'detect' })
    try {
      const result = await runTikaWithFixture(fixture, { mode: 'detect' })
      expect(result.ok).toBe(true)
      if (!result.ok) return
      expect(result.detectedFormatId).toBe('pdf')
      expect(result.detectedMime).toBe('application/pdf')
      expect(result.extractedText).toBeUndefined()
      expect(result.metadata).toBeUndefined()
      expect(result.elapsedMs).toBeGreaterThanOrEqual(0)
    } finally {
      await fixture.cleanup()
    }
  })

  // -- extract_text mode --
  it('runs fake tika in extract_text mode and returns extracted text', async () => {
    const fixture = await createTempFixture({ mode: 'extract_text' })
    try {
      const result = await runTikaWithFixture(fixture, { mode: 'extract_text' })
      expect(result.ok).toBe(true)
      if (!result.ok) return
      expect(result.extractedText).toBe('Hello world content')
      expect(result.detectedFormatId).toBeUndefined()
      expect(result.detectedMime).toBeUndefined()
      expect(result.metadata).toBeUndefined()
    } finally {
      await fixture.cleanup()
    }
  })

  // -- metadata mode --
  it('runs fake tika in metadata mode and returns metadata', async () => {
    const fixture = await createTempFixture({ mode: 'metadata' })
    try {
      const result = await runTikaWithFixture(fixture, {
        mode: 'metadata',
        metadataAllowlist: ['Content-Type', 'Author', 'X-Custom'],
      })
      expect(result.ok).toBe(true)
      if (!result.ok) return
      expect(result.metadata).toBeDefined()
      expect(result.metadata!['Content-Type']).toBe('application/pdf')
      expect(result.metadata!['Author']).toBe('Alice')
      expect(result.metadata!['X-Custom']).toBe('secret')
      expect(result.detectedFormatId).toBeUndefined()
      expect(result.extractedText).toBeUndefined()
    } finally {
      await fixture.cleanup()
    }
  })

  // -- combined mode --
  it('runs fake tika in combined mode and returns all fields', async () => {
    const fixture = await createTempFixture({ mode: 'combined' })
    try {
      const result = await runTikaWithFixture(fixture, {
        metadataAllowlist: ['Content-Type', 'Author', 'X-Custom'],
      })
      expect(result.ok).toBe(true)
      if (!result.ok) return
      expect(result.detectedFormatId).toBe('pdf')
      expect(result.detectedMime).toBe('application/pdf')
      expect(result.extractedText).toBe('Hello world content')
      expect(result.metadata).toBeDefined()
      expect(result.metadata!['Content-Type']).toBe('application/pdf')
      expect(result.warnings).toEqual(['truncated'])
    } finally {
      await fixture.cleanup()
    }
  })

  // -- input_too_large --
  it('returns input_too_large when bytes exceed limit', async () => {
    const fixture = await createTempFixture()
    try {
      const large = new Uint8Array(10 * 1024 * 1024 + 1)
      const result = await runTikaWithFixture(fixture, { inputBytes: large })
      expect(result.ok).toBe(false)
      if (result.ok) return
      expect(result.errorCode).toBe('input_too_large')
    } finally {
      await fixture.cleanup()
    }
  })

  // -- custom maxInputBytes --
  it('rejects input exceeding custom maxInputBytes', async () => {
    const fixture = await createTempFixture()
    try {
      const medium = new Uint8Array(2048)
      const result = await runTikaWithFixture(fixture, { inputBytes: medium, maxInputBytes: 1024 })
      expect(result.ok).toBe(false)
      if (result.ok) return
      expect(result.errorCode).toBe('input_too_large')
    } finally {
      await fixture.cleanup()
    }
  })

  // -- runtime_error: non-zero exit --
  it('handles runtime exit non-zero', async () => {
    const fixture = await createTempFixture({ errorType: 'exit1' })
    try {
      const result = await runTikaWithFixture(fixture)
      expect(result.ok).toBe(false)
      if (result.ok) return
      expect(result.errorCode).toBe('runtime_error')
    } finally {
      await fixture.cleanup()
    }
  })

  // -- invalid_output: bad JSON --
  it('handles invalid JSON output', async () => {
    const fixture = await createTempFixture({ errorType: 'bad_json' })
    try {
      const result = await runTikaWithFixture(fixture)
      expect(result.ok).toBe(false)
      if (result.ok) return
      expect(result.errorCode).toBe('invalid_output')
    } finally {
      await fixture.cleanup()
    }
  })

  // -- empty object is valid (trust caller to interpret) --
  it('accepts empty JSON object as valid output', async () => {
    const fixture = await createTempFixture({ errorType: 'empty_object' })
    try {
      const result = await runTikaWithFixture(fixture)
      expect(result.ok).toBe(true)
      if (!result.ok) return
      expect(result.detectedFormatId).toBeUndefined()
      expect(result.metadata).toBeUndefined()
    } finally {
      await fixture.cleanup()
    }
  })

  // -- unrelated fields only still returns ok --
  it('accepts output with only unrelated fields', async () => {
    const fixture = await createTempFixture({ errorType: 'no_fields' })
    try {
      const result = await runTikaWithFixture(fixture)
      expect(result.ok).toBe(true)
      if (!result.ok) return
      expect(result.detectedFormatId).toBeUndefined()
    } finally {
      await fixture.cleanup()
    }
  })

  // -- bad_metadata: metadata field is not an object, treated as missing --
  it('treats non-object metadata as missing and returns ok', async () => {
    const fixture = await createTempFixture({ errorType: 'bad_metadata' })
    try {
      const result = await runTikaWithFixture(fixture)
      expect(result.ok).toBe(true)
      if (!result.ok) return
      expect(result.metadata).toBeUndefined()
    } finally {
      await fixture.cleanup()
    }
  })

  // -- timeout via mock --
  it('handles timeout via mock process runner', async () => {
    const fixture = await createTempFixture()
    try {
      const result = await runTika({
        inputBytes: new Uint8Array([1]),
        command: NODE,
        args: [fixture.runtimeEntryPath],
        mode: 'combined',
        metadataAllowlist: null,
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

  // -- output limit via mock --
  it('handles output limit via mock process runner', async () => {
    const fixture = await createTempFixture()
    try {
      const result = await runTika({
        inputBytes: new Uint8Array([1]),
        command: NODE,
        args: [fixture.runtimeEntryPath],
        mode: 'combined',
        metadataAllowlist: null,
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

  // -- process kill failure via mock --
  it('handles process kill failure via mock', async () => {
    const fixture = await createTempFixture()
    try {
      const result = await runTika({
        inputBytes: new Uint8Array([1]),
        command: NODE,
        args: [fixture.runtimeEntryPath],
        mode: 'combined',
        metadataAllowlist: null,
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

  // -- path sanitization in error details --
  it('sanitizes paths in failure details', async () => {
    const fixture = await createTempFixture({ errorType: 'exit1' })
    try {
      const result = await runTikaWithFixture(fixture)
      expect(result.ok).toBe(false)
      if (result.ok) return
      expect(result.detail).not.toContain(fixture.runtimeEntryPath)
      expect(result.detail).not.toMatch(/[A-Za-z]:\\/u)
    } finally {
      await fixture.cleanup()
    }
  })

  // -- metadata allowlist: null blocks all (capability disabled) --
  it('blocks all metadata when allowlist is null', async () => {
    const fixture = await createTempFixture({ mode: 'metadata' })
    try {
      const result = await runTikaWithFixture(fixture, { mode: 'metadata', metadataAllowlist: null })
      expect(result.ok).toBe(true)
      if (!result.ok) return
      expect(result.metadata).toBeUndefined()
    } finally {
      await fixture.cleanup()
    }
  })

  // -- metadata allowlist: filter specific keys --
  it('filters metadata to allowlisted keys only', async () => {
    const fixture = await createTempFixture({ mode: 'metadata' })
    try {
      const result = await runTikaWithFixture(fixture, {
        mode: 'metadata',
        metadataAllowlist: ['Content-Type', 'Author'],
      })
      expect(result.ok).toBe(true)
      if (!result.ok) return
      expect(result.metadata).toBeDefined()
      expect(result.metadata!['Content-Type']).toBe('application/pdf')
      expect(result.metadata!['Author']).toBe('Alice')
      expect(result.metadata!['X-Custom']).toBeUndefined()
      expect(Object.keys(result.metadata!)).toHaveLength(2)
    } finally {
      await fixture.cleanup()
    }
  })

  // -- metadata allowlist: empty array filters everything --
  it('filters all metadata when allowlist is empty', async () => {
    const fixture = await createTempFixture({ mode: 'metadata' })
    try {
      const result = await runTikaWithFixture(fixture, {
        mode: 'metadata',
        metadataAllowlist: [],
      })
      expect(result.ok).toBe(true)
      if (!result.ok) return
      expect(result.metadata).toBeUndefined()
    } finally {
      await fixture.cleanup()
    }
  })

  // -- metadata allowlist: no matches returns undefined metadata --
  it('returns undefined metadata when allowlist has no matches', async () => {
    const fixture = await createTempFixture({ mode: 'metadata' })
    try {
      const result = await runTikaWithFixture(fixture, {
        mode: 'metadata',
        metadataAllowlist: ['NonExistent'],
      })
      expect(result.ok).toBe(true)
      if (!result.ok) return
      expect(result.metadata).toBeUndefined()
    } finally {
      await fixture.cleanup()
    }
  })

  // -- empty input bytes still processed --
  it('processes empty input bytes', async () => {
    const fixture = await createTempFixture({ mode: 'detect' })
    try {
      const result = await runTikaWithFixture(fixture, {
        inputBytes: new Uint8Array(0),
        mode: 'detect',
      })
      expect(result.ok).toBe(true)
      if (!result.ok) return
      expect(result.detectedFormatId).toBe('pdf')
    } finally {
      await fixture.cleanup()
    }
  })

  // -- sensitive metadata values: paths and hashes are redacted --
  it('redacts Windows and Unix paths in metadata values', async () => {
    const fixture = await createTempFixture({ errorType: 'sensitive_metadata' })
    try {
      const result = await runTikaWithFixture(fixture, {
        mode: 'metadata',
        metadataAllowlist: ['Author', 'Resource-Name', 'X-Temp-Path', 'Custom-Hash'],
      })
      expect(result.ok).toBe(true)
      if (!result.ok) return
      expect(result.metadata).toBeDefined()
      expect(result.metadata!['Author']).toBe('alice')
      expect(result.metadata!['Resource-Name']).toContain('[redacted-path]')
      expect(result.metadata!['Resource-Name']).not.toContain('C:')
      expect(result.metadata!['X-Temp-Path']).toContain('[redacted-path]')
      expect(result.metadata!['X-Temp-Path']).not.toContain('/tmp/')
      expect(result.metadata!['Custom-Hash']).toContain('[redacted-hash]')
      expect(result.metadata!['Custom-Hash']).not.toMatch(/[0-9a-fA-F]{64,}/)
    } finally {
      await fixture.cleanup()
    }
  })

  // -- sensitive metadata values: unknown keys not in allowlist are dropped --
  it('drops metadata keys not in allowlist even when value is benign', async () => {
    const fixture = await createTempFixture({ errorType: 'sensitive_metadata' })
    try {
      const result = await runTikaWithFixture(fixture, {
        mode: 'metadata',
        metadataAllowlist: ['Author'],
      })
      expect(result.ok).toBe(true)
      if (!result.ok) return
      expect(result.metadata).toBeDefined()
      expect(result.metadata!['Author']).toBe('alice')
      expect(result.metadata!['Resource-Name']).toBeUndefined()
      expect(result.metadata!['X-Temp-Path']).toBeUndefined()
      expect(result.metadata!['Custom-Hash']).toBeUndefined()
    } finally {
      await fixture.cleanup()
    }
  })

  // -- crash in runtime (throws, non-zero exit) --
  it('handles runtime crash', async () => {
    const fixture = await createTempFixture({ errorType: 'crash' })
    try {
      const result = await runTikaWithFixture(fixture)
      expect(result.ok).toBe(false)
      if (result.ok) return
      expect(['runtime_error', 'invalid_output']).toContain(result.errorCode)
    } finally {
      await fixture.cleanup()
    }
  })
})
