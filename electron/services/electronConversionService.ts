import {
  failClosedElectronConversionResponse,
  prepareElectronConversionRequest,
  type ElectronConversionRequest,
  type ElectronConversionResponse,
} from '../../infra/files/electronConversionServiceContract'
import type { ElectronConversionBridge } from '../../infra/files/electronConversionBridge'

export class MainProcessElectronConversionService implements ElectronConversionBridge {
  async convert(rawRequest: ElectronConversionRequest): Promise<ElectronConversionResponse> {
    const prepared = prepareElectronConversionRequest(rawRequest)
    if (!prepared.ok) return prepared.response

    if (prepared.request.conversionKind !== 'html_to_pdf') {
      return failClosedElectronConversionResponse({
        requestId: prepared.request.requestId,
        conversionKind: prepared.request.conversionKind,
        status: 'blocked',
        code: 'electron_conversion_kind_unsupported',
        message: 'Electron conversion kind is unsupported.',
      })
    }

    return failClosedElectronConversionResponse({
      requestId: prepared.request.requestId,
      conversionKind: prepared.request.conversionKind,
      status: 'unavailable',
      code: 'electron_conversion_service_unavailable',
      message: 'Dedicated Electron conversion window adapter is not implemented.',
    })
  }
}

export function createMainProcessElectronConversionService(): MainProcessElectronConversionService {
  return new MainProcessElectronConversionService()
}
