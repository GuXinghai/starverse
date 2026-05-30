import {
  failClosedElectronConversionResponse,
  prepareElectronConversionRequest,
  sanitizeElectronConversionDiagnostic,
  type ElectronConversionRequest,
  type ElectronConversionResponse,
} from './electronConversionServiceContract'

export type ElectronConversionBridge = Readonly<{
  convert: (request: ElectronConversionRequest) => Promise<ElectronConversionResponse>
}>

type WorkerConversionPort = Readonly<{
  postMessage: (message: unknown) => void
  on: (event: 'message', handler: (message: any) => void) => void
}>

export function createUnavailableElectronConversionBridge(): ElectronConversionBridge {
  return {
    async convert(request) {
      return failClosedElectronConversionResponse({
        requestId: request.requestId,
        conversionKind: request.conversionKind,
        status: 'unavailable',
        code: 'electron_conversion_service_unavailable',
        message: 'Electron conversion service is unavailable.',
      })
    },
  }
}

export function createWorkerThreadElectronConversionBridge(port: WorkerConversionPort): ElectronConversionBridge {
  const pending = new Map<string, {
    resolve: (response: ElectronConversionResponse) => void
    timer: NodeJS.Timeout
  }>()

  port.on('message', (message: any) => {
    if (!message || message.type !== 'electron-conversion-response') return
    const id = typeof message.id === 'string' ? message.id : ''
    const entry = pending.get(id)
    if (!entry) return
    pending.delete(id)
    clearTimeout(entry.timer)
    entry.resolve(message.response as ElectronConversionResponse)
  })

  return {
    async convert(request) {
      return await new Promise<ElectronConversionResponse>((resolve) => {
        const id = `${request.requestId}:${Date.now()}:${Math.random().toString(36).slice(2)}`
        const timer = setTimeout(() => {
          pending.delete(id)
          resolve(failClosedElectronConversionResponse({
            requestId: request.requestId,
            conversionKind: request.conversionKind,
            status: 'timed_out',
            code: 'electron_conversion_timeout',
            message: 'Electron conversion service timed out.',
          }))
        }, request.timeoutMs)
        pending.set(id, { resolve, timer })
        port.postMessage({
          type: 'electron-conversion-request',
          id,
          request,
        })
      })
    },
  }
}

export async function requestElectronConversion(
  bridge: ElectronConversionBridge | null | undefined,
  rawRequest: unknown
): Promise<ElectronConversionResponse> {
  const prepared = prepareElectronConversionRequest(rawRequest)
  if (!prepared.ok) return prepared.response

  if (!bridge) {
    return failClosedElectronConversionResponse({
      requestId: prepared.request.requestId,
      conversionKind: prepared.request.conversionKind,
      status: 'unavailable',
      code: 'electron_conversion_service_unavailable',
      message: 'Electron conversion service is unavailable.',
    })
  }

  try {
    const response = await bridge.convert(prepared.request)
    return {
      ...response,
      requestId: prepared.request.requestId,
      conversionKind: prepared.request.conversionKind,
      diagnostics: response.diagnostics.map((diagnostic) => sanitizeElectronConversionDiagnostic(diagnostic)),
      output: response.status === 'success' ? response.output : null,
    }
  } catch (error) {
    return failClosedElectronConversionResponse({
      requestId: prepared.request.requestId,
      conversionKind: prepared.request.conversionKind,
      status: 'failed',
      code: 'electron_conversion_blocked',
      message: error instanceof Error ? error.message : String(error),
    })
  }
}
