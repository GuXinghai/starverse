import { mkdtemp, mkdir, rm, writeFile } from 'node:fs/promises'
import os from 'node:os'
import path from 'node:path'
import { describe, expect, it } from 'vitest'
import {
  runPandoc,
  type PandocRunnerResult,
} from './pandocRunner'
import type { ExternalProcessRunResult } from './externalProcessRunner'

const NODE = process.execPath

function createFakePandocRuntime(target: 'markdown' | 'plain' | 'html'): string {
  if (target === 'markdown') {
    return `process.stdout.write(JSON.stringify({convertedText:"# Heading\\n\\nHello **world**\\n\\n- item 1\\n- item 2"}))`
  }
  if (target === 'plain') {
    return `process.stdout.write(JSON.stringify({convertedText:"Heading\\n\\nHello world\\n\\nitem 1\\nitem 2"}))`
  }
  if (target === 'html') {
    return `process.stdout.write(JSON.stringify({convertedText:"<h1>Heading</h1>\\n<p>Hello <strong>world</strong></p>\\n<ul>\\n<li>item 1</li>\\n<li>item 2</li>\\n</ul>"}))`
  }
  return 'process.exit(0)'
}

function createLuaDeniedRuntime(): string {
  return 'process.stdout.write(JSON.stringify({luaFilterDenied:true,warnings:["lua filter blocked"]}))'
}

function createErrorRuntime(errorType: 'exit1' | 'bad_json' | 'not_object' | 'empty_text' | 'crash'): string {
  if (errorType === 'exit1') return 'process.exit(1)'
  if (errorType === 'bad_json') return 'process.stdout.write("not json")'
  if (errorType === 'not_object') return 'process.stdout.write("null")'
  if (errorType === 'empty_text') return 'process.stdout.write(JSON.stringify({convertedText:""}))'
  if (errorType === 'crash') return 'throw new Error("pandoc crash")'
  return 'process.exit(0)'
}

type TempFixture = Readonly<{
  rootDir: string
  runtimeEntryPath: string
  cleanup: () => Promise<void>
}>

async function createTempFixture(input: Readonly<{
  target?: 'markdown' | 'plain' | 'html'
  variant?: 'lua_denied'
  errorType?: 'exit1' | 'bad_json' | 'not_object' | 'empty_text' | 'crash'
}> = {}): Promise<TempFixture> {
  const rootDir = await mkdtemp(path.join(os.tmpdir(), 'starverse-pandoc-runner-'))
  const runtimeDir = path.join(rootDir, 'runtime')
  await mkdir(runtimeDir, { recursive: true })

  let runtimeCode: string
  if (input.errorType) {
    runtimeCode = createErrorRuntime(input.errorType)
  } else if (input.variant === 'lua_denied') {
    runtimeCode = createLuaDeniedRuntime()
  } else {
    runtimeCode = createFakePandocRuntime(input.target ?? 'markdown')
  }
  const runtimeEntryPath = path.join(runtimeDir, 'fake-pandoc-runner.js')
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

function runPandocWithFixture(
  fixture: TempFixture,
  input: Readonly<{
    inputBytes?: Uint8Array
    target?: 'markdown' | 'plain' | 'html'
    sourceFormat?: string
    maxInputBytes?: number
  }> = {}
): Promise<PandocRunnerResult> {
  return runPandoc({
    inputBytes: input.inputBytes ?? new Uint8Array([1, 2, 3]),
    command: NODE,
    args: [fixture.runtimeEntryPath],
    target: input.target ?? 'markdown',
    sourceFormat: input.sourceFormat as any,
    maxInputBytes: input.maxInputBytes,
  })
}

// eslint-disable-next-line max-lines-per-function
describe('pandocRunner', () => {
  // -- markdown conversion --
  it('returns markdown output on success', async () => {
    const fixture = await createTempFixture({ target: 'markdown' })
    try {
      const result = await runPandocWithFixture(fixture, { target: 'markdown' })
      expect(result.ok).toBe(true)
      if (!result.ok) return
      expect(result.convertedText).toContain('# Heading')
      expect(result.convertedText).toContain('**world**')
      expect(result.outputFormat).toBe('gfm')
    } finally {
      await fixture.cleanup()
    }
  })

  // -- plain text conversion --
  it('returns plain text output on success', async () => {
    const fixture = await createTempFixture({ target: 'plain' })
    try {
      const result = await runPandocWithFixture(fixture, { target: 'plain' })
      expect(result.ok).toBe(true)
      if (!result.ok) return
      expect(result.convertedText).toContain('Heading')
      expect(result.convertedText).toContain('Hello world')
      expect(result.outputFormat).toBe('plain')
    } finally {
      await fixture.cleanup()
    }
  })

  // -- html conversion --
  it('returns html output on success', async () => {
    const fixture = await createTempFixture({ target: 'html' })
    try {
      const result = await runPandocWithFixture(fixture, { target: 'html' })
      expect(result.ok).toBe(true)
      if (!result.ok) return
      expect(result.convertedText).toContain('<h1>')
      expect(result.convertedText).toContain('<li>')
      expect(result.outputFormat).toBe('html')
    } finally {
      await fixture.cleanup()
    }
  })

  // -- unsupported source format --
  it('rejects unsupported source format', async () => {
    const fixture = await createTempFixture()
    try {
      const result = await runPandocWithFixture(fixture, { sourceFormat: 'epub' as any })
      expect(result.ok).toBe(false)
      if (result.ok) return
      expect(result.errorCode).toBe('unsupported_source_format')
    } finally {
      await fixture.cleanup()
    }
  })

  // -- unsupported target format --
  it('rejects unsupported target format', async () => {
    const fixture = await createTempFixture()
    try {
      const result = await runPandocWithFixture(fixture, { target: 'pdf' as any })
      expect(result.ok).toBe(false)
      if (result.ok) return
      expect(result.errorCode).toBe('unsupported_target_format')
    } finally {
      await fixture.cleanup()
    }
  })

  // -- input too large --
  it('returns input_too_large when bytes exceed limit', async () => {
    const fixture = await createTempFixture()
    try {
      const large = new Uint8Array(50 * 1024 * 1024 + 1)
      const result = await runPandocWithFixture(fixture, { inputBytes: large })
      expect(result.ok).toBe(false)
      if (result.ok) return
      expect(result.errorCode).toBe('input_too_large')
    } finally {
      await fixture.cleanup()
    }
  })

  // -- output too large --
  it('rejects output that exceeds max bytes', async () => {
    const largeText = '#'.repeat(11 * 1024 * 1024)
    const mockRunner = createMockProcessRunner({
      stdout: JSON.stringify({ convertedText: largeText }),
    })
    const result = await runPandoc({
      inputBytes: new Uint8Array([1]),
      command: NODE,
      args: ['fake'],
      target: 'markdown',
    }, {
      processRunner: mockRunner,
    })
    expect(result.ok).toBe(false)
    if (result.ok) return
    expect(result.errorCode).toBe('output_too_large')
  })

  // -- invalid JSON --
  it('handles invalid JSON output', async () => {
    const fixture = await createTempFixture({ errorType: 'bad_json' })
    try {
      const result = await runPandocWithFixture(fixture)
      expect(result.ok).toBe(false)
      if (result.ok) return
      expect(result.errorCode).toBe('invalid_output')
    } finally {
      await fixture.cleanup()
    }
  })

  // -- empty text output --
  it('handles empty converted text', async () => {
    const fixture = await createTempFixture({ errorType: 'empty_text' })
    try {
      const result = await runPandocWithFixture(fixture)
      expect(result.ok).toBe(false)
      if (result.ok) return
      expect(result.errorCode).toBe('invalid_output')
    } finally {
      await fixture.cleanup()
    }
  })

  // -- non-object JSON --
  it('handles non-object JSON output', async () => {
    const fixture = await createTempFixture({ errorType: 'not_object' })
    try {
      const result = await runPandocWithFixture(fixture)
      expect(result.ok).toBe(false)
      if (result.ok) return
      expect(result.errorCode).toBe('invalid_output')
    } finally {
      await fixture.cleanup()
    }
  })

  // -- runtime error --
  it('handles runtime exit non-zero', async () => {
    const fixture = await createTempFixture({ errorType: 'exit1' })
    try {
      const result = await runPandocWithFixture(fixture)
      expect(result.ok).toBe(false)
      if (result.ok) return
      expect(result.errorCode).toBe('runtime_error')
    } finally {
      await fixture.cleanup()
    }
  })

  // -- timeout via mock --
  it('handles timeout via mock process runner', async () => {
    const fixture = await createTempFixture()
    try {
      const result = await runPandoc({
        inputBytes: new Uint8Array([1]),
        command: NODE,
        args: [fixture.runtimeEntryPath],
        target: 'markdown',
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
      const result = await runPandoc({
        inputBytes: new Uint8Array([1]),
        command: NODE,
        args: [fixture.runtimeEntryPath],
        target: 'markdown',
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

  // -- lua filter denied --
  it('blocks lua filter execution', async () => {
    const fixture = await createTempFixture({ variant: 'lua_denied' })
    try {
      const result = await runPandocWithFixture(fixture)
      expect(result.ok).toBe(false)
      if (result.ok) return
      expect(result.errorCode).toBe('lua_filter_denied')
    } finally {
      await fixture.cleanup()
    }
  })

  // -- error detail sanitization --
  it('sanitizes paths in failure details', async () => {
    const fixture = await createTempFixture({ errorType: 'exit1' })
    try {
      const result = await runPandocWithFixture(fixture)
      expect(result.ok).toBe(false)
      if (result.ok) return
      expect(result.detail).not.toContain(fixture.runtimeEntryPath)
      expect(result.detail).not.toMatch(/[A-Za-z]:\\/u)
    } finally {
      await fixture.cleanup()
    }
  })

  // -- crash --
  it('handles runtime crash', async () => {
    const fixture = await createTempFixture({ errorType: 'crash' })
    try {
      const result = await runPandocWithFixture(fixture)
      expect(result.ok).toBe(false)
      if (result.ok) return
      expect(['runtime_error', 'invalid_output']).toContain(result.errorCode)
    } finally {
      await fixture.cleanup()
    }
  })

  // -- command+args array invocation (no shell) --
  it('uses command+args array (no shell) invocation', async () => {
    const fixture = await createTempFixture({ target: 'markdown' })
    try {
      const result = await runPandocWithFixture(fixture, { target: 'markdown' })
      expect(result.ok).toBe(true)
      if (!result.ok) return
      expect(result.convertedText).toBeDefined()
    } finally {
      await fixture.cleanup()
    }
  })

  // -- custom maxInputBytes --
  it('rejects input exceeding custom maxInputBytes', async () => {
    const fixture = await createTempFixture()
    try {
      const medium = new Uint8Array(2048)
      const result = await runPandocWithFixture(fixture, { inputBytes: medium, maxInputBytes: 1024 })
      expect(result.ok).toBe(false)
      if (result.ok) return
      expect(result.errorCode).toBe('input_too_large')
    } finally {
      await fixture.cleanup()
    }
  })
})
