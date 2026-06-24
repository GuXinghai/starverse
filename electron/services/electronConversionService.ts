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
import { fetchPackageToFileWithElectronNet } from './electronOfficialPackageDownloadService'
import type { net } from 'electron'
import type {
  PackageDownloadFileTransportRequest,
  PackageDownloadFileTransportResult,
} from '../../src/next/plugin-distribution/packageDownloader'

export type MainProcessElectronConversionServiceInput = Readonly<{
  htmlToPdfAdapter?: ElectronHtmlPdfConversionAdapter
  officialPackageRequest?: typeof net.request
}>

export class MainProcessElectronConversionService implements ElectronConversionBridge {
  private readonly htmlToPdfAdapter: ElectronHtmlPdfConversionAdapter
  private readonly officialPackageRequest?: typeof net.request

  constructor(input: MainProcessElectronConversionServiceInput = {}) {
    this.htmlToPdfAdapter = input.htmlToPdfAdapter ?? createElectronHtmlPdfConversionAdapter()
    this.officialPackageRequest = input.officialPackageRequest
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

  async fetchPackageToFile(request: PackageDownloadFileTransportRequest): Promise<PackageDownloadFileTransportResult> {
    return await fetchPackageToFileWithElectronNet(request, { request: this.officialPackageRequest })
  }
}

export function createMainProcessElectronConversionService(
  input: MainProcessElectronConversionServiceInput = {}
): MainProcessElectronConversionService {
  return new MainProcessElectronConversionService(input)
}
