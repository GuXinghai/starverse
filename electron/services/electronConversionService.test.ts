import os from 'node:os'
import path from 'node:path'
import { describe, expect, it } from 'vitest'
import { STARTUP_IPC_CHANNELS } from '../ipc/startupIpcAudit'
import {
  createMainProcessElectronConversionService,
  MainProcessElectronConversionService,
} from './electronConversionService'

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

  it('fails closed for supported html_to_pdf until the dedicated window adapter exists', async () => {
    const response = await createMainProcessElectronConversionService().convert(validRequest())

    expect(response).toMatchObject({
      requestId: 'req-main-service-1',
      conversionKind: 'html_to_pdf',
      status: 'unavailable',
      output: null,
      cleanupStatus: 'not_requested',
      diagnostics: [expect.objectContaining({ code: 'electron_conversion_service_unavailable' })],
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
})
