import type { NetworkProxySettings } from './networkProxy'
import type { NetworkErrorEnvelope } from '../network/networkErrorEnvelope'

export type PackageDownloadProgress = Readonly<{
  bytesReceived: number
  totalBytes: number | null
  retryCount?: number
  phase?: 'downloading' | 'retrying' | 'paused_retryable'
}>

export type PackageDownloadResumeDescriptor = Readonly<{
  pluginId: string
  runtimeId: string
  packageId: string
  releaseTag: string
  assetName: string
  sourceKind: 'github_release_asset'
  expectedSizeBytes: number
  expectedSha256: string
  tempArtifactId: string
  rangeSupportMode: 'direct_browser_download_url' | 'redirected_asset_host'
}>

export type PackageDownloadResumeOptions = Readonly<{
  enabled: boolean
  descriptor: PackageDownloadResumeDescriptor
  maxRetries: number
  retryDelayMs: number
}>

export type PackageDownloadFileTransportRequest = Readonly<{
  transportRef: string
  maxBytes: number
  outputPath: string
  signal?: AbortSignal
  onProgress?: (progress: PackageDownloadProgress) => void
  resume?: PackageDownloadResumeOptions
  proxy?: NetworkProxySettings
}>

export type PackageDownloadFileTransportResult =
  | Readonly<{
      ok: true
      filePath: string
      sizeBytes: number
      sha256: string
      finalRef?: string | null
    }>
  | Readonly<{
      ok: false
      code:
        | 'cancelled'
        | 'download_failed'
        | 'redirect_rejected'
        | 'too_large'
        | 'resume_range_ignored'
        | 'resume_range_rejected'
        | 'resume_content_range_invalid'
        | 'resume_retries_exhausted'
      detail?: string | null
      finalRef?: string | null
      networkError?: NetworkErrorEnvelope
    }>
