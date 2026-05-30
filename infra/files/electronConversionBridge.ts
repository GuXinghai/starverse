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
