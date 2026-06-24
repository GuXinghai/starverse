import { EventEmitter } from 'node:events'
import { describe, expect, it, vi } from 'vitest'
import {
  LIBREOFFICE_SYSTEM_PROXY_PROBE_IPC_CHANNELS,
  probeLibreOfficeOfficialDownloadWithElectronNet,
  registerLibreOfficeSystemProxyProbeIpc,
} from './libreOfficeSystemProxyProbeIpc'

const officialUrl = 'https://github.com/GuXinghai/starverse/releases/download/starverse-runtime-libreoffice-v0.1.0-26.2.4-win32-x64/starverse-runtime-libreoffice-0.1.0-26.2.4-win32-x64.svpkg'
const assetUrl = 'https://release-assets.githubusercontent.com/github-production-release-asset/test'

type FakeResponse = Readonly<{
  statusCode: number
  headers?: Record<string, string>
  url?: string
  chunks?: readonly Buffer[]
}>

function createRequest(responses: FakeResponse[]) {
  const calls: Array<{ options: any; headers: Record<string, string>; aborted: boolean }> = []
  const request = vi.fn((options: any) => {
    const call = { options, headers: {} as Record<string, string>, aborted: false }
    calls.push(call)
    const req = new EventEmitter() as EventEmitter & {
      setHeader: (name: string, value: string) => void
      end: () => void
      abort: () => void
    }
    req.setHeader = (name, value) => {
      call.headers[name] = value
    }
    req.abort = () => {
      call.aborted = true
    }
    req.end = () => {
      const responseSpec = responses.shift()
      if (!responseSpec) {
        queueMicrotask(() => req.emit('error', new Error('unexpected_request')))
        return
      }
      const response = new EventEmitter() as EventEmitter & {
        statusCode: number
        headers: Record<string, string>
        url: string
      }
      response.statusCode = responseSpec.statusCode
      response.headers = responseSpec.headers ?? {}
      response.url = responseSpec.url ?? officialUrl
      queueMicrotask(() => {
        req.emit('response', response)
        for (const chunk of responseSpec.chunks ?? []) response.emit('data', chunk)
        response.emit('end')
      })
    }
    return req
  }) as any
  return { request, calls }
}

describe('libreOfficeSystemProxyProbeIpc', () => {
  it('registers the bounded system proxy probe channel', () => {
    const registerInvoke = vi.fn()
    const channels = registerLibreOfficeSystemProxyProbeIpc({ registerInvoke, request: vi.fn() as any })

    expect(channels).toEqual([...LIBREOFFICE_SYSTEM_PROXY_PROBE_IPC_CHANNELS])
    expect(registerInvoke.mock.calls.map(([channel]) => channel)).toEqual([
      'network-proxy:probe-libreoffice-system',
    ])
  })

  it('passes when Electron net returns matching HEAD and 1KB Range responses', async () => {
    const { request, calls } = createRequest([
      {
        statusCode: 200,
        headers: { 'content-length': '518907010' },
        url: assetUrl,
      },
      {
        statusCode: 206,
        headers: { 'content-range': 'bytes 0-1023/518907010' },
        url: assetUrl,
        chunks: [Buffer.alloc(1024)],
      },
    ])

    const result = await probeLibreOfficeOfficialDownloadWithElectronNet({ request })

    expect(result).toMatchObject({
      ok: true,
      proxyMode: 'system',
      headPassed: true,
      contentLength: 'match',
      rangePassed: true,
      terminalDiagnostic: 'proxy_probe_passed',
    })
    expect(calls[0].options).toMatchObject({ method: 'HEAD', redirect: 'follow' })
    expect(calls[1].headers).toMatchObject({ Range: 'bytes=0-1023' })
  })

  it('does not consume the body when a Range request is ignored', async () => {
    const { request, calls } = createRequest([
      {
        statusCode: 200,
        headers: { 'content-length': '518907010' },
        url: assetUrl,
      },
      {
        statusCode: 200,
        headers: { 'content-length': '518907010' },
        url: assetUrl,
        chunks: [Buffer.alloc(4096)],
      },
    ])

    const result = await probeLibreOfficeOfficialDownloadWithElectronNet({ request })

    expect(result).toMatchObject({
      ok: false,
      proxyMode: 'system',
      headPassed: true,
      rangePassed: false,
      terminalDiagnostic: 'range_failed',
    })
    expect(calls[1].aborted).toBe(true)
  })
})
