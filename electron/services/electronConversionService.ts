import {
  failClosedElectronConversionResponse,
  prepareElectronConversionRequest,
  type ElectronConversionRequest,
  type ElectronConversionResponse,
} from '../../infra/files/electronConversionServiceContract'
import type { ElectronConversionBridge } from '../../infra/files/electronConversionBridge'
import {
  createElectronHtmlPdfConversionAdapter,
  type ElectronHtmlPdfConversionAdapter,
} from './electronHtmlPdfConversionAdapter'

export type MainProcessElectronConversionServiceInput = Readonly<{
  htmlToPdfAdapter?: ElectronHtmlPdfConversionAdapter
}>

export class MainProcessElectronConversionService implements ElectronConversionBridge {
  private readonly htmlToPdfAdapter: ElectronHtmlPdfConversionAdapter

  constructor(input: MainProcessElectronConversionServiceInput = {}) {
    this.htmlToPdfAdapter = input.htmlToPdfAdapter ?? createElectronHtmlPdfConversionAdapter()
  }

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

    return await this.htmlToPdfAdapter.convert(prepared.request)
  }
}

export function createMainProcessElectronConversionService(
  input: MainProcessElectronConversionServiceInput = {}
): MainProcessElectronConversionService {
  return new MainProcessElectronConversionService(input)
}
