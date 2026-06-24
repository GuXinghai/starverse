import os from 'node:os'
import path from 'node:path'
import { EventEmitter } from 'node:events'
import { describe, expect, it } from 'vitest'
import {
  createWorkerThreadElectronConversionBridge,
  createUnavailableElectronConversionBridge,
  requestElectronConversion,
} from './electronConversionBridge'
import {
  failClosedElectronConversionResponse,
  prepareElectronConversionRequest,
  successElectronConversionResponse,
  toRendererSafeElectronConversionResponse,
  type ElectronConversionRequest,
} from './electronConversionServiceContract'

const root = path.join(os.tmpdir(), 'starverse-electron-conversion')

function validRequest(overrides: Partial<ElectronConversionRequest> = {}): ElectronConversionRequest {
  return {
    requestId: 'req-html-pdf-1',
    conversionKind: 'html_to_pdf',
    source: {
      kind: 'sandbox_input',
      rootDir: root,
      relativePath: 'input/source.html',
      mime: 'text/html',
    },
    output: {
      kind: 'sandbox_output',
      rootDir: root,
      relativePath: 'output/source.pdf',
      mime: 'application/pdf',
      extension: 'pdf',
    },
    timeoutMs: 15000,
    policy: {
      javascriptEnabled: false,
      networkEnabled: false,
      localFileAccessEnabled: false,
    },
    ...overrides,
  }
}

describe('electron conversion bridge boundary', () => {
  it('forwards official package file downloads over the worker/main bridge with progress', async () => {
    const workerSide = new EventEmitter() as EventEmitter & {
      postMessage: (message: unknown) => void
    }
    const mainSide = new EventEmitter() as EventEmitter & {
      postMessage: (message: unknown) => void
    }
    workerSide.postMessage = (message: unknown) => {
      setImmediate(() => mainSide.emit('message', message))
    }
    mainSide.postMessage = (message: unknown) => {
      setImmediate(() => workerSide.emit('message', message))
    }
    mainSide.on('message', (message: any) => {
      if (message?.type !== 'electron-package-download-request') return
      mainSide.postMessage({
        type: 'electron-package-download-progress',
        id: message.id,
        progress: { bytesReceived: 10, totalBytes: 20, phase: 'downloading' },
      })
      mainSide.postMessage({
        type: 'electron-package-download-response',
        id: message.id,
        response: {
          ok: true,
          filePath: message.request.outputPath,
          sizeBytes: 20,
          sha256: 'a'.repeat(64),
          finalRef: 'https://release-assets.githubusercontent.com/github-production-release-asset/test/pkg.svpkg',
        },
      })
    })

    const progress: unknown[] = []
    const result = await createWorkerThreadElectronConversionBridge(workerSide).fetchPackageToFile?.({
      transportRef: 'https://github.com/GuXinghai/starverse/releases/download/test/pkg.svpkg',
      maxBytes: 1024,
      outputPath: path.join(root, 'download', 'pkg.svpkg'),
      onProgress: (value) => progress.push(value),
      proxy: { proxyMode: 'system', manualProxyUrl: '', noProxy: '', strictSSL: true },
    })

    expect(result).toMatchObject({ ok: true, sizeBytes: 20 })
    expect(progress).toEqual([expect.objectContaining({ phase: 'downloading', bytesReceived: 10 })])
  })

  it('fails closed when the worker/main conversion bridge is unavailable', async () => {
    const response = await requestElectronConversion(null, validRequest())

    expect(response).toMatchObject({
      requestId: 'req-html-pdf-1',
      conversionKind: 'html_to_pdf',
      status: 'unavailable',
      output: null,
      cleanupStatus: 'not_requested',
      diagnostics: [expect.objectContaining({ code: 'electron_conversion_service_unavailable' })],
    })
  })

  it.each([
    ['source traversal', { source: { ...validRequest().source, relativePath: '../secret.html' } }],
    ['source UNC', { source: { ...validRequest().source, relativePath: '\\\\server\\share\\secret.html' } }],
    ['source NUL', { source: { ...validRequest().source, relativePath: 'input/source\u0000.html' } }],
    ['output traversal', { output: { ...validRequest().output, relativePath: '..\\secret.pdf' } }],
    ['output drive escape', { output: { ...validRequest().output, relativePath: 'C:\\Users\\private\\secret.pdf' } }],
  ])('rejects invalid controlled paths before service execution: %s', async (_name, override) => {
    let called = false
    const response = await requestElectronConversion({
      async convert(request) {
        called = true
        return failClosedElectronConversionResponse({
          requestId: request.requestId,
          conversionKind: request.conversionKind,
          status: 'blocked',
          code: 'electron_conversion_blocked',
          message: 'should not be called for invalid paths',
        })
      },
    }, { ...validRequest(), ...override })

    expect(called).toBe(false)
    expect(response).toMatchObject({
      status: 'blocked',
      output: null,
      diagnostics: [expect.objectContaining({ code: 'electron_conversion_request_invalid' })],
    })
  })

  it('blocks policy requests that try to enable JavaScript, network, or local file access', async () => {
    const response = await requestElectronConversion(createUnavailableElectronConversionBridge(), {
      ...validRequest(),
      policy: { javascriptEnabled: true, networkEnabled: false, localFileAccessEnabled: false },
    })

    expect(response).toMatchObject({
      status: 'blocked',
      output: null,
      diagnostics: [expect.objectContaining({ code: 'electron_conversion_blocked' })],
    })
  })

  it('sanitizes diagnostics and strips internal output paths from renderer-safe responses', () => {
    const prepared = prepareElectronConversionRequest(validRequest())
    if (!prepared.ok) throw new Error('expected valid conversion request')
    const response = {
      ...successElectronConversionResponse({
        request: prepared.request,
        outputPath: path.join(root, 'output/source.pdf'),
      }),
      diagnostics: [
        {
          code: 'electron_conversion_blocked' as const,
          message: 'blocked C:\\Users\\private\\secret.html file:///C:/Users/private/secret.html storageUri=assets/original/private sha256=abcdef0123456789abcdef0123456789 file body: <html>secret</html> token=secret-token command=/bin/run env=SECRET=1',
        },
      ],
    }

    const safe = toRendererSafeElectronConversionResponse(response)
    const serialized = JSON.stringify(safe)

    expect(safe.output).toEqual({ kind: 'controlled_output', mime: 'application/pdf', extension: 'pdf' })
    expect(serialized).not.toContain(root)
    expect(serialized).not.toContain('C:\\Users\\private')
    expect(serialized).not.toContain('file:///')
    expect(serialized).not.toContain('assets/original/private')
    expect(serialized).not.toContain('abcdef0123456789abcdef0123456789')
    expect(serialized).not.toContain('<html>secret</html>')
    expect(serialized).not.toContain('secret-token')
    expect(serialized).not.toContain('SECRET=1')
  })

  it('does not produce a ready output when the skeleton bridge fails closed', async () => {
    const response = await createUnavailableElectronConversionBridge().convert(validRequest())

    expect(response.status).toBe('unavailable')
    expect(response.output).toBeNull()
    expect(JSON.stringify(response)).not.toContain('derived_asset')
    expect(JSON.stringify(response)).not.toContain('converted_pdf')
  })

  it('normalizes thrown bridge errors into sanitized fail-closed diagnostics', async () => {
    const response = await requestElectronConversion({
      async convert() {
        throw new Error('failed at C:\\Users\\private\\secret.html storageRef=raw-secret file body: secret')
      },
    }, validRequest())

    const serialized = JSON.stringify(response)
    expect(response).toMatchObject({
      status: 'failed',
      output: null,
      diagnostics: [expect.objectContaining({ code: 'electron_conversion_blocked' })],
    })
    expect(serialized).not.toContain('C:\\Users\\private')
    expect(serialized).not.toContain('raw-secret')
    expect(serialized).not.toContain('file body: secret')
  })

  it('can express timed out fail-closed diagnostics without output', () => {
    const response = failClosedElectronConversionResponse({
      requestId: 'req-timeout',
      conversionKind: 'html_to_pdf',
      status: 'timed_out',
      code: 'electron_conversion_timeout',
      message: 'Electron conversion timed out.',
      cleanupStatus: 'attempted',
    })

    expect(response).toMatchObject({
      status: 'timed_out',
      output: null,
      cleanupStatus: 'attempted',
      diagnostics: [expect.objectContaining({ code: 'electron_conversion_timeout' })],
    })
  })
})
