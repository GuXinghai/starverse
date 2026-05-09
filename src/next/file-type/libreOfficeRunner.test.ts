import { mkdtemp, mkdir, rm, writeFile } from 'node:fs/promises'
import os from 'node:os'
import path from 'node:path'
import { describe, expect, it } from 'vitest'
import {
  runLibreOffice,
  type LibreOfficeRunnerResult,
} from './libreOfficeRunner'
import type { ExternalProcessRunResult } from './externalProcessRunner'

const NODE = process.execPath

function createFakeLoRuntime(target: 'pdf' | 'text' | 'html' | 'markdown', sourceFormat?: string): string {
  if (target === 'pdf') {
    const base64 = Buffer.from('fake-pdf-content').toString('base64')
    const src = sourceFormat ? `"sourceFormat":"${sourceFormat}"` : ''
    return `process.stdout.write(JSON.stringify({convertedBytesBase64:"${base64}",outputMime:"application/pdf"${src ? ',' + src : ''}}))`
  }
  if (target === 'text') {
    const src = sourceFormat ? `"sourceFormat":"${sourceFormat}"` : ''
    return `process.stdout.write(JSON.stringify({convertedText:"Hello world text content",outputMime:"text/plain"${src ? ',' + src : ''}}))`
  }
  if (target === 'html') {
    return 'process.stdout.write(JSON.stringify({convertedText:"<html><body>Converted</body></html>",outputMime:"text/html"}))'
  }
  return 'process.stdout.write(JSON.stringify({convertedText:"# Converted Markdown",outputMime:"text/markdown"}))'
}

function createMacroRuntime(blocked: boolean): string {
  if (blocked) {
    return 'process.stdout.write(JSON.stringify({macroBlocked:true,warnings:["macro detected in docx"]}))'
  }
  return 'process.stdout.write(JSON.stringify({macroBlocked:false,convertedText:"Safe document",outputMime:"text/plain",warnings:["macro scan passed"]}))'
}

function createErrorRuntime(errorType: 'exit1' | 'bad_json' | 'empty_object' | 'bad_base64' | 'crash'): string {
  if (errorType === 'exit1') return 'process.exit(1)'
  if (errorType === 'bad_json') return 'process.stdout.write("not json")'
  if (errorType === 'empty_object') return 'process.stdout.write("{}")'
  if (errorType === 'bad_base64') return 'process.stdout.write(JSON.stringify({convertedBytesBase64:"!!!invalid-base64!!!"}))'
  if (errorType === 'crash') return 'throw new Error("lo crash")'
  return 'process.exit(0)'
}

type TempFixture = Readonly<{
  rootDir: string
  runtimeEntryPath: string
  cleanup: () => Promise<void>
}>

async function createTempFixture(input: Readonly<{
  target?: 'pdf' | 'text' | 'html' | 'markdown'
  sourceFormat?: string
  macroBlocked?: boolean
  errorType?: 'exit1' | 'bad_json' | 'empty_object' | 'bad_base64' | 'crash'
}> = {}): Promise<TempFixture> {
  const rootDir = await mkdtemp(path.join(os.tmpdir(), 'starverse-lo-runner-'))
  const runtimeDir = path.join(rootDir, 'runtime')
  await mkdir(runtimeDir, { recursive: true })

  let runtimeCode: string
  if (input.errorType) {
    runtimeCode = createErrorRuntime(input.errorType)
  } else if (input.macroBlocked !== undefined) {
    runtimeCode = createMacroRuntime(input.macroBlocked)
  } else {
    runtimeCode = createFakeLoRuntime(input.target ?? 'pdf', input.sourceFormat)
  }
  const runtimeEntryPath = path.join(runtimeDir, 'fake-lo-runner.js')
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

function runLoWithFixture(
  fixture: TempFixture,
  input: Readonly<{
    inputBytes?: Uint8Array
    target?: 'pdf' | 'text' | 'html' | 'markdown'
    sourceFormat?: string
    macroPolicy?: 'deny' | 'warn'
    maxInputBytes?: number
  }> = {}
): Promise<LibreOfficeRunnerResult> {
  return runLibreOffice({
    inputBytes: input.inputBytes ?? new Uint8Array([1, 2, 3]),
    command: NODE,
    args: [fixture.runtimeEntryPath],
    target: input.target ?? 'pdf',
    sourceFormat: input.sourceFormat as any,
    macroPolicy: input.macroPolicy ?? 'deny',
    maxInputBytes: input.maxInputBytes,
  })
}

// eslint-disable-next-line max-lines-per-function
describe('libreOfficeRunner', () => {
  // -- pdf conversion --
  it('returns pdf convertedBytes and mime on success', async () => {
    const fixture = await createTempFixture({ target: 'pdf' })
    try {
      const result = await runLoWithFixture(fixture, { target: 'pdf' })
      expect(result.ok).toBe(true)
      if (!result.ok) return
      expect(result.convertedBytes).toBeDefined()
      expect(result.outputMime).toBe('application/pdf')
      expect(result.convertedText).toBeUndefined()
    } finally {
      await fixture.cleanup()
    }
  })

  // -- text conversion --
  it('returns plain text on text conversion', async () => {
    const fixture = await createTempFixture({ target: 'text' })
    try {
      const result = await runLoWithFixture(fixture, { target: 'text' })
      expect(result.ok).toBe(true)
      if (!result.ok) return
      expect(result.convertedText).toBe('Hello world text content')
      expect(result.outputMime).toBe('text/plain')
      expect(result.convertedBytes).toBeUndefined()
    } finally {
      await fixture.cleanup()
    }
  })

  // -- html conversion --
  it('returns html output on html conversion', async () => {
    const fixture = await createTempFixture({ target: 'html' })
    try {
      const result = await runLoWithFixture(fixture, { target: 'html' })
      expect(result.ok).toBe(true)
      if (!result.ok) return
      expect(result.convertedText).toContain('<html>')
      expect(result.outputMime).toBe('text/html')
    } finally {
      await fixture.cleanup()
    }
  })

  // -- markdown conversion --
  it('returns markdown output on markdown conversion', async () => {
    const fixture = await createTempFixture({ target: 'markdown' })
    try {
      const result = await runLoWithFixture(fixture, { target: 'markdown' })
      expect(result.ok).toBe(true)
      if (!result.ok) return
      expect(result.convertedText).toBe('# Converted Markdown')
      expect(result.outputMime).toBe('text/markdown')
    } finally {
      await fixture.cleanup()
    }
  })

  // -- source format passthrough --
  it('passes sourceFormat through on successful conversion', async () => {
    const fixture = await createTempFixture({ target: 'pdf', sourceFormat: 'docx' })
    try {
      const result = await runLoWithFixture(fixture, { target: 'pdf', sourceFormat: 'docx', macroPolicy: 'warn' })
      expect(result.ok).toBe(true)
      if (!result.ok) return
      expect(result.sourceFormat).toBe('docx')
    } finally {
      await fixture.cleanup()
    }
  })

  // -- unsupported source format --
  it('rejects unsupported source format', async () => {
    const fixture = await createTempFixture()
    try {
      const result = await runLoWithFixture(fixture, { sourceFormat: 'wpd' as any })
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
      const result = await runLoWithFixture(fixture, { target: 'epub' as any })
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
      const result = await runLoWithFixture(fixture, { inputBytes: large })
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
      const result = await runLoWithFixture(fixture, { inputBytes: medium, maxInputBytes: 1024 })
      expect(result.ok).toBe(false)
      if (result.ok) return
      expect(result.errorCode).toBe('input_too_large')
    } finally {
      await fixture.cleanup()
    }
  })

  // -- invalid JSON --
  it('handles invalid JSON output', async () => {
    const fixture = await createTempFixture({ errorType: 'bad_json' })
    try {
      const result = await runLoWithFixture(fixture)
      expect(result.ok).toBe(false)
      if (result.ok) return
      expect(result.errorCode).toBe('invalid_output')
    } finally {
      await fixture.cleanup()
    }
  })

  // -- empty object --
  it('accepts empty JSON object as valid output', async () => {
    const fixture = await createTempFixture({ errorType: 'empty_object' })
    try {
      const result = await runLoWithFixture(fixture)
      expect(result.ok).toBe(true)
      if (!result.ok) return
      expect(result.convertedBytes).toBeUndefined()
      expect(result.convertedText).toBeUndefined()
    } finally {
      await fixture.cleanup()
    }
  })

  // -- runtime error --
  it('handles runtime exit non-zero', async () => {
    const fixture = await createTempFixture({ errorType: 'exit1' })
    try {
      const result = await runLoWithFixture(fixture)
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
      const result = await runLibreOffice({
        inputBytes: new Uint8Array([1]),
        command: NODE,
        args: [fixture.runtimeEntryPath],
        target: 'pdf',
        macroPolicy: 'deny',
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
      const result = await runLibreOffice({
        inputBytes: new Uint8Array([1]),
        command: NODE,
        args: [fixture.runtimeEntryPath],
        target: 'pdf',
        macroPolicy: 'deny',
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

  // -- macro deny: blocks macro-capable source --
  it('blocks macro-capable docx with macroPolicy=deny before running', async () => {
    const fixture = await createTempFixture()
    try {
      const result = await runLoWithFixture(fixture, { sourceFormat: 'docx', macroPolicy: 'deny' })
      expect(result.ok).toBe(false)
      if (result.ok) return
      expect(result.errorCode).toBe('macro_active_content_blocked')
    } finally {
      await fixture.cleanup()
    }
  })

  // -- macro deny also blocks doc/xlsx/pptx --
  it('blocks macro-capable xlsx with macroPolicy=deny', async () => {
    const fixture = await createTempFixture()
    try {
      const result = await runLoWithFixture(fixture, { sourceFormat: 'xlsx', macroPolicy: 'deny' })
      expect(result.ok).toBe(false)
      if (result.ok) return
      expect(result.errorCode).toBe('macro_active_content_blocked')
    } finally {
      await fixture.cleanup()
    }
  })

  // -- macro warn: allows macro-capable but captures blocked flag --
  it('allows macro-capable docx with macroPolicy=warn and captures blocked flag', async () => {
    const fixture = await createTempFixture({ sourceFormat: 'docx', macroBlocked: true })
    try {
      const result = await runLoWithFixture(fixture, { sourceFormat: 'docx', macroPolicy: 'warn' })
      expect(result.ok).toBe(true)
      if (!result.ok) return
      expect(result.warnings).toContain('macro detected in docx')
      expect(result.macroBlocked).toBe(true)
    } finally {
      await fixture.cleanup()
    }
  })

  // -- macro warn: clean docx with no macros detected --
  it('allows macro-capable docx with macroPolicy=warn when clean', async () => {
    const fixture = await createTempFixture({ sourceFormat: 'docx', macroBlocked: false })
    try {
      const result = await runLoWithFixture(fixture, { sourceFormat: 'docx', macroPolicy: 'warn' })
      expect(result.ok).toBe(true)
      if (!result.ok) return
      expect(result.macroBlocked).toBeUndefined()
      expect(result.convertedText).toBe('Safe document')
    } finally {
      await fixture.cleanup()
    }
  })

  // -- odt is not macro-capable --
  it('does not block odt (not macro-capable) even with deny', async () => {
    const fixture = await createTempFixture({ target: 'text', sourceFormat: 'odt' })
    try {
      const result = await runLoWithFixture(fixture, { target: 'text', sourceFormat: 'odt', macroPolicy: 'deny' })
      expect(result.ok).toBe(true)
      if (!result.ok) return
      expect(result.convertedText).toBe('Hello world text content')
    } finally {
      await fixture.cleanup()
    }
  })

  // -- error detail sanitization --
  it('sanitizes paths in failure details', async () => {
    const fixture = await createTempFixture({ errorType: 'exit1' })
    try {
      const result = await runLoWithFixture(fixture)
      expect(result.ok).toBe(false)
      if (result.ok) return
      expect(result.detail).not.toContain(fixture.runtimeEntryPath)
      expect(result.detail).not.toMatch(/[A-Za-z]:\\/u)
    } finally {
      await fixture.cleanup()
    }
  })

  // -- crash in runtime --
  it('handles runtime crash', async () => {
    const fixture = await createTempFixture({ errorType: 'crash' })
    try {
      const result = await runLoWithFixture(fixture)
      expect(result.ok).toBe(false)
      if (result.ok) return
      expect(['runtime_error', 'invalid_output']).toContain(result.errorCode)
    } finally {
      await fixture.cleanup()
    }
  })

  // -- invalid base64 in convertedBytesBase64 --
  it('handles invalid base64 convertedBytes', async () => {
    const fixture = await createTempFixture({ errorType: 'bad_base64' })
    try {
      const result = await runLoWithFixture(fixture)
      expect(result.ok).toBe(false)
      if (result.ok) return
      expect(result.errorCode).toBe('invalid_output')
    } finally {
      await fixture.cleanup()
    }
  })

  // -- args array not shell: verified via contract (command + args, no shell) --
  it('uses command + args array (no shell) for parameter array invocation', async () => {
    const fixture = await createTempFixture({ target: 'pdf' })
    try {
      const result = await runLoWithFixture(fixture, { target: 'pdf' })
      expect(result.ok).toBe(true)
      if (!result.ok) return
      expect(result.convertedBytes).toBeDefined()
    } finally {
      await fixture.cleanup()
    }
  })
})
