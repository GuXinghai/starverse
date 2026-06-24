import os from 'node:os'
import path from 'node:path'
import { EventEmitter } from 'node:events'
import { Readable } from 'node:stream'
import { mkdir, rm, stat } from 'node:fs/promises'
import { describe, expect, it } from 'vitest'
import { STARTUP_IPC_CHANNELS } from '../ipc/startupIpcAudit'
import {
  createMainProcessElectronConversionService,
  MainProcessElectronConversionService,
} from './electronConversionService'
import { successElectronConversionResponse } from '../../infra/files/electronConversionServiceContract'

const root = path.join(os.tmpdir(), 'starverse-electron-conversion-main')

function validRequest(conversionKind = 'html_to_pdf') {
  return {
    requestId: 'req-main-service-1',
    conversionKind,
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
  } as const
}

describe('main-process electron conversion service skeleton', () => {
  it('creates a main-process service object without exposing a renderer IPC channel', () => {
    const service = createMainProcessElectronConversionService()

    expect(service).toBeInstanceOf(MainProcessElectronConversionService)
    expect([...STARTUP_IPC_CHANNELS].some((channel) => channel.includes('conversion'))).toBe(false)
    expect([...STARTUP_IPC_CHANNELS].some((channel) => channel.includes('html-pdf'))).toBe(false)
  })

  it('delegates supported html_to_pdf requests to the dedicated conversion adapter', async () => {
    const service = createMainProcessElectronConversionService({
      htmlToPdfAdapter: {
        async convert(request) {
          return successElectronConversionResponse({
            request,
            outputPath: request.resolvedOutputPath,
          })
        },
      },
    })

    const response = await service.convert(validRequest())

    expect(response).toMatchObject({
      requestId: 'req-main-service-1',
      conversionKind: 'html_to_pdf',
      status: 'success',
      output: { kind: 'controlled_output', mime: 'application/pdf', extension: 'pdf' },
      cleanupStatus: 'attempted',
    })
  })

  it('blocks unsupported conversion kinds without creating output', async () => {
    const response = await createMainProcessElectronConversionService().convert(validRequest('office_to_pdf') as any)

    expect(response).toMatchObject({
      conversionKind: 'office_to_pdf',
      status: 'blocked',
      output: null,
      diagnostics: [expect.objectContaining({ code: 'electron_conversion_kind_unsupported' })],
    })
  })

  it('rejects invalid requests before any future window adapter could run', async () => {
    const response = await createMainProcessElectronConversionService().convert({
      ...validRequest(),
      source: { ...validRequest().source, relativePath: '../secret.html' },
    } as any)

    expect(response).toMatchObject({
      status: 'blocked',
      output: null,
      diagnostics: [expect.objectContaining({ code: 'electron_conversion_request_invalid' })],
    })
  })

  it('streams official package downloads through the injected Electron net request', async () => {
    const tempRoot = path.join(root, `package-download-${Date.now()}`)
    const outputPath = path.join(tempRoot, 'official.svpkg')
    await mkdir(tempRoot, { recursive: true })
    try {
      const fakeRequest = ((options: any) => {
        const request = new EventEmitter() as EventEmitter & {
          setHeader: (name: string, value: string) => void
          end: () => void
          abort: () => void
        }
        request.setHeader = () => undefined
        request.abort = () => undefined
        request.end = () => {
          const response = Readable.from([Buffer.from('package-bytes')]) as Readable & {
            statusCode?: number
            headers?: Record<string, string>
            url?: string
          }
          response.statusCode = 200
          response.headers = { 'content-length': '13' }
          response.url = options.url
          setImmediate(() => request.emit('response', response))
        }
        return request
      }) as any
      const service = createMainProcessElectronConversionService({ officialPackageRequest: fakeRequest })

      const result = await service.fetchPackageToFile?.({
        transportRef: 'https://github.com/GuXinghai/starverse/releases/download/test/pkg.svpkg',
        maxBytes: 1024,
        outputPath,
        proxy: { proxyMode: 'system', manualProxyUrl: '', noProxy: '', strictSSL: true },
      })

      expect(result).toMatchObject({
        ok: true,
        filePath: outputPath,
        sizeBytes: 13,
      })
      expect((await stat(outputPath)).size).toBe(13)
    } finally {
      await rm(tempRoot, { recursive: true, force: true })
    }
  })
})
