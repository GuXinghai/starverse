import path from 'node:path'
import { describe, expect, it } from 'vitest'
import {
  completeDfcSandboxRun,
  createDfcConversionSandboxPlan,
  mapDfcSandboxProcessPolicy,
  resolveDfcSandboxOutputPath,
  sanitizeDfcSandboxDiagnostic,
  toDfcSandboxRendererSummary,
} from './dfcConversionSandbox'

const rootDir = path.resolve('tmp', 'dfc-sandbox-test')
const outputDir = path.join(rootDir, 'output')

function plan() {
  const result = createDfcConversionSandboxPlan({
    engineId: 'html-pdf',
    inputAssetId: 'asset-1',
    targetKind: 'pdf_attachment',
    sandboxRootDir: rootDir,
    sourceExtension: 'html',
    expectedOutput: { extension: 'pdf', mime: 'application/pdf' },
  })
  expect(result.ok).toBe(true)
  if (!result.ok) throw new Error('plan failed')
  return result.request
}

describe('DFC conversion sandbox foundation', () => {
  it('creates a controlled adapter contract under sandbox directories', () => {
    const request = plan()

    expect(request.engineId).toBe('html-pdf')
    expect(request.inputAssetId).toBe('asset-1')
    expect(request.targetKind).toBe('pdf_attachment')
    expect(request.expectedOutputExtension).toBe('pdf')
    expect(request.expectedOutputMime).toBe('application/pdf')
    expect(request.sandboxInputPath).toContain(`${path.sep}input${path.sep}`)
    expect(request.sandboxOutputPath).toContain(`${path.sep}output${path.sep}`)
    expect(request.workingDir).toContain(`${path.sep}work`)
    expect(request.processPolicy.mode).toBe('conversion')
    expect(request.processPolicy.shell).toBe(false)
  })

  it('rejects absolute output escape', () => {
    const result = resolveDfcSandboxOutputPath(outputDir, '/outside.pdf')

    expect(result.ok).toBe(false)
    if (!result.ok) expect(result.code).toBe('dfc_sandbox_output_path_absolute')
  })

  it('rejects path traversal output', () => {
    const result = resolveDfcSandboxOutputPath(outputDir, '..\\outside.pdf')

    expect(result.ok).toBe(false)
    if (!result.ok) expect(result.code).toBe('dfc_sandbox_output_path_traversal')
  })

  it('rejects UNC, drive escape, and NUL output names', () => {
    const unc = resolveDfcSandboxOutputPath(outputDir, '\\\\server\\share\\out.pdf')
    const drive = resolveDfcSandboxOutputPath(outputDir, 'C:\\temp\\out.pdf')
    const nul = resolveDfcSandboxOutputPath(outputDir, 'out.pdf\0.txt')

    expect(unc.ok).toBe(false)
    expect(drive.ok).toBe(false)
    expect(nul.ok).toBe(false)
    if (!unc.ok) expect(unc.code).toBe('dfc_sandbox_output_path_unc')
    if (!drive.ok) expect(drive.code).toBe('dfc_sandbox_output_path_drive_escape')
    if (!nul.ok) expect(nul.code).toBe('dfc_sandbox_output_path_nul')
  })

  it('keeps controlled output inside the sandbox output directory', () => {
    const result = resolveDfcSandboxOutputPath(outputDir, 'nested/out.pdf')

    expect(result.ok).toBe(true)
    if (!result.ok) return
    expect(result.path.startsWith(outputDir)).toBe(true)
    expect(result.path.endsWith(`${path.sep}nested${path.sep}out.pdf`)).toBe(true)
  })

  it('maps conversion timeout and termination policy through external process policy', () => {
    const result = mapDfcSandboxProcessPolicy({
      command: 'engine',
      timeoutMs: 12_345,
      terminationGraceMs: 2345,
    })

    expect(result.ok).toBe(true)
    if (!result.ok) return
    expect(result.policy.mode).toBe('conversion')
    expect(result.policy.timeoutMs).toBe(12_345)
    expect(result.policy.terminationGraceMs).toBe(2345)
    expect(result.policy.shell).toBe(false)
    expect(result.policy.allowBatchEntrypoint).toBe(false)
  })

  it('does not produce a derived asset on failed engine result', async () => {
    let cleaned = false
    const outcome = await completeDfcSandboxRun({
      plan: plan(),
      engineResult: {
        status: 'failed',
        errorCode: 'engine_failed',
        stderr: 'failed for C:\\Users\\alice\\secret\\in.html token=abc123',
      },
      cleanup: () => {
        cleaned = true
      },
    })

    expect(cleaned).toBe(true)
    expect(outcome.ok).toBe(false)
    expect(outcome.status).toBe('failed')
    expect(outcome.derivedAsset).toBeNull()
    expect(outcome.cleanupStatus).toBe('attempted')
    expect(JSON.stringify(outcome.diagnostics)).not.toContain('C:\\Users\\alice')
    expect(JSON.stringify(outcome.diagnostics)).not.toContain('abc123')
  })

  it('attempts cleanup after success and returns an internal derived asset candidate', async () => {
    let cleanupCalls = 0
    const request = plan()
    const outcome = await completeDfcSandboxRun({
      plan: request,
      engineResult: {
        status: 'succeeded',
        outputPath: request.sandboxOutputPath,
      },
      cleanup: () => {
        cleanupCalls += 1
      },
    })

    expect(cleanupCalls).toBe(1)
    expect(outcome.ok).toBe(true)
    expect(outcome.status).toBe('ready')
    expect(outcome.derivedAsset).toMatchObject({
      inputAssetId: 'asset-1',
      targetKind: 'pdf_attachment',
      mime: 'application/pdf',
      outputPath: request.sandboxOutputPath,
    })
    expect(outcome.cleanupStatus).toBe('attempted')
  })

  it('fails closed when engine output escapes the controlled output directory', async () => {
    const outcome = await completeDfcSandboxRun({
      plan: plan(),
      engineResult: {
        status: 'succeeded',
        outputPath: path.resolve('outside.pdf'),
      },
      cleanup: () => undefined,
    })

    expect(outcome.ok).toBe(false)
    expect(outcome.status).toBe('blocked')
    expect(outcome.derivedAsset).toBeNull()
    expect(outcome.diagnostics.map((item) => item.code)).toContain('dfc_sandbox_output_path_escape')
  })

  it('redacts absolute path, command, env, token, and full hash diagnostics', () => {
    const diagnostic = sanitizeDfcSandboxDiagnostic({
      code: 'engine_failed',
      message: 'C:\\Users\\alice\\doc.html /tmp/source.html token=secret fullHash=abcdef0123456789',
      stdout: 'https://example.test/private?contentToken=abc',
      stderr: 'sha256=abcdef01234567890123456789012345',
      command: 'C:\\Tools\\engine.exe --token=secret',
      env: { API_KEY: 'secret' },
    })
    const serialized = JSON.stringify(diagnostic)

    expect(serialized).toContain('[redacted-path]')
    expect(serialized).toContain('[redacted-secret]')
    expect(serialized).toContain('[redacted-hash]')
    expect(serialized).toContain('[redacted-command]')
    expect(serialized).toContain('[redacted-env]')
    expect(serialized).not.toContain('C:\\Users\\alice')
    expect(serialized).not.toContain('/tmp/source.html')
    expect(serialized).not.toContain('abcdef0123456789')
    expect(serialized).not.toContain('API_KEY')
  })

  it('keeps renderer summary free of paths, command, env, file body, storage refs, and hashes', async () => {
    const request = plan()
    const outcome = await completeDfcSandboxRun({
      plan: request,
      engineResult: {
        status: 'succeeded',
        outputPath: request.sandboxOutputPath,
        stdout: 'file body: secret document body storageRef=assets/original/raw.pdf fullHash=abcdef0123456789',
      },
      cleanup: () => undefined,
    })
    const summary = toDfcSandboxRendererSummary(outcome)
    const serialized = JSON.stringify(summary)

    expect(serialized).not.toContain(request.sandboxRootDir)
    expect(serialized).not.toContain(request.sandboxOutputPath)
    expect(serialized).not.toContain('storageRef')
    expect(serialized).not.toContain('secret document body')
    expect(serialized).not.toContain('abcdef0123456789')
    expect(serialized).not.toContain('command')
    expect(serialized).not.toContain('env')
  })

  it('reports cleanup failure without changing fail-closed semantics', async () => {
    const outcome = await completeDfcSandboxRun({
      plan: plan(),
      engineResult: { status: 'timeout', message: 'engine timeout at C:\\tmp\\input.html' },
      cleanup: () => {
        throw new Error('cleanup failed')
      },
    })

    expect(outcome.ok).toBe(false)
    expect(outcome.status).toBe('blocked')
    expect(outcome.derivedAsset).toBeNull()
    expect(outcome.cleanupStatus).toBe('failed')
  })
})
