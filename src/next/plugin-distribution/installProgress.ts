import type { PdpInstallOperationPhase } from './installRecovery'
import { sanitizePluginDistributionText } from './sanitization'

const URL_LIKE_RE = /[a-z][a-z0-9+.-]*:\/\/[^\s"'`]+/giu
const EMBEDDED_SHA256_RE = /[a-f0-9]{64}/giu

export type InstallProgressInput = Readonly<{
  operationId: string
  pluginId: string
  pluginVersion: string
  phase: PdpInstallOperationPhase
  percent?: number | null
  bytesReceived?: number | null
  errorCode?: string | null
  failureReason?: string | null
  diagnostic?: string | null
}>

export type InstallProgressDto = Readonly<{
  operationId: string
  pluginId: string
  pluginVersion: string
  phase: PdpInstallOperationPhase
  percent: number | null
  bytesReceivedBucket: 'none' | 'lt_1mb' | 'lt_10mb' | 'gte_10mb' | null
  errorCode: string | null
  failureReason: string | null
  diagnosticCode: string | null
}>

export function toInstallProgressDto(input: InstallProgressInput): InstallProgressDto {
  return {
    operationId: sanitizeIdentifier(input.operationId, 'operation'),
    pluginId: sanitizeIdentifier(input.pluginId, 'plugin'),
    pluginVersion: sanitizeIdentifier(input.pluginVersion, 'version'),
    phase: input.phase,
    percent: normalizePercent(input.percent),
    bytesReceivedBucket: bucketBytes(input.bytesReceived),
    errorCode: sanitizeCode(input.errorCode),
    failureReason: sanitizeCode(input.failureReason),
    diagnosticCode: sanitizeCode(input.diagnostic),
  }
}

function normalizePercent(input: number | null | undefined): number | null {
  if (typeof input !== 'number' || !Number.isFinite(input)) return null
  return Math.max(0, Math.min(100, Math.round(input)))
}

function bucketBytes(input: number | null | undefined): InstallProgressDto['bytesReceivedBucket'] {
  if (typeof input !== 'number' || !Number.isFinite(input) || input <= 0) return 'none'
  if (input < 1024 * 1024) return 'lt_1mb'
  if (input < 10 * 1024 * 1024) return 'lt_10mb'
  return 'gte_10mb'
}

function sanitizeIdentifier(input: string, fallback: string): string {
  const sanitized = sanitizeProgressText(input)
  if (!sanitized) return fallback
  return sanitized.replace(/[^a-z0-9._:-]/giu, '_').slice(0, 128) || fallback
}

function sanitizeCode(input: string | null | undefined): string | null {
  const sanitized = sanitizeProgressText(input)
  if (!sanitized) return null
  return sanitized.replace(/[^a-z0-9._:-]/giu, '_').slice(0, 128) || null
}

function sanitizeProgressText(input: string | null | undefined): string | undefined {
  return sanitizePluginDistributionText(input)
    ?.replace(URL_LIKE_RE, '[redacted-url]')
    .replace(EMBEDDED_SHA256_RE, '[redacted-hash]')
}
