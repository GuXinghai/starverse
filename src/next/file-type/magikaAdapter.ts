import { MAGIKA_LABEL_TO_FORMAT_ID } from './taxonomyMap'
import type { FileTypeEvidence } from './types'
import {
  createUnavailableMagikaRuntimeLoader,
  type MagikaRuntimeClassifyOutput,
  type MagikaRuntimeDetectionInput,
  type MagikaRuntimeLoader,
} from './magikaRuntimeLoader'

export type MagikaDetectionInput = MagikaRuntimeDetectionInput

export type MagikaRawOutput = MagikaRuntimeClassifyOutput

export interface MagikaAdapter {
  detect(input: MagikaDetectionInput): Promise<MagikaRawOutput | null> | MagikaRawOutput | null
}

export function createNoopMagikaAdapter(): MagikaAdapter {
  return {
    detect: () => null,
  }
}

export async function runMagikaProbe(
  adapter: MagikaAdapter,
  input: MagikaDetectionInput
): Promise<FileTypeEvidence | null> {
  const raw = await adapter.detect(input)
  if (!raw) return null
  return mapMagikaOutputToEvidence(raw, { modelVersion: null, runtimeKind: 'mock' })
}

export type MagikaRuntimeProbeResult = Readonly<{
  evidence: FileTypeEvidence | null
  modelVersion: string | null
  runtimeKind: string
  unavailableReason: string | null
  unavailableDetail: string | null
}>

export async function runMagikaRuntimeProbe(
  loader: MagikaRuntimeLoader,
  input: MagikaDetectionInput
): Promise<MagikaRuntimeProbeResult> {
  try {
    const loaded = await loader.load()
    if (!loaded.available) {
      return {
        evidence: null,
        modelVersion: normalizeModelVersion(loaded.modelVersion),
        runtimeKind: loaded.runtimeKind,
        unavailableReason: loaded.reason,
        unavailableDetail: loaded.detail,
      }
    }

    try {
      const raw = await loaded.runtime.classify(input)
      if (!raw) {
        return {
          evidence: null,
          modelVersion: normalizeModelVersion(loaded.runtime.modelVersion),
          runtimeKind: loaded.runtime.kind,
          unavailableReason: null,
          unavailableDetail: null,
        }
      }

      return {
        evidence: mapMagikaOutputToEvidence(raw, {
          modelVersion: loaded.runtime.modelVersion,
          runtimeKind: loaded.runtime.kind,
        }),
        modelVersion: normalizeModelVersion(loaded.runtime.modelVersion),
        runtimeKind: loaded.runtime.kind,
        unavailableReason: null,
        unavailableDetail: null,
      }
    } catch (error) {
      return {
        evidence: null,
        modelVersion: normalizeModelVersion(loaded.runtime.modelVersion),
        runtimeKind: loaded.runtime.kind,
        unavailableReason: 'runtime_error',
        unavailableDetail: summarizeRuntimeError(error),
      }
    }
  } catch (error) {
    const fallback = createUnavailableMagikaRuntimeLoader({
      reason: 'runtime_error',
      detail: summarizeRuntimeError(error),
    })
    const loaded = await fallback.load()
    if (loaded.available) {
      return {
        evidence: null,
        modelVersion: null,
        runtimeKind: 'unavailable',
        unavailableReason: 'runtime_error',
        unavailableDetail: 'unexpected loader fallback state',
      }
    }
    return {
      evidence: null,
      modelVersion: normalizeModelVersion(loaded.modelVersion),
      runtimeKind: loaded.runtimeKind,
      unavailableReason: loaded.reason,
      unavailableDetail: loaded.detail,
    }
  }
}

export function mapMagikaOutputToEvidence(
  raw: MagikaRawOutput,
  options: Readonly<{ modelVersion?: string | null; runtimeKind?: string | null }> = {}
): FileTypeEvidence {
  const label = String(raw.label ?? '').trim()
  const normalizedScore = Number.isFinite(raw.score) ? clamp(raw.score, 0, 1) : 0
  const mapped = MAGIKA_LABEL_TO_FORMAT_ID[label]
  const confidence = scoreToConfidence(normalizedScore)
  const detectedFormatId = mapped ?? 'unknown'
  return {
    source: 'magika',
    detectedFormatId,
    detectedMime: null,
    detectedExtension: null,
    confidence: mapped ? confidence : 'low',
    reasonCodes: mapped ? [] : ['reason.low_confidence'],
    errorCode: null,
    note: mapped ? `magika:${label}:${normalizedScore.toFixed(3)}` : `magika:${label}:unmapped`,
    engineVersion: normalizeModelVersion(options.modelVersion),
    engineRuntimeKind: normalizeRuntimeKind(options.runtimeKind),
  }
}

function scoreToConfidence(score: number): 'high' | 'medium' | 'low' {
  if (score >= 0.9) return 'high'
  if (score >= 0.65) return 'medium'
  return 'low'
}

function clamp(value: number, min: number, max: number): number {
  return Math.max(min, Math.min(max, value))
}

function normalizeModelVersion(value: string | null | undefined): string | null {
  const normalized = String(value ?? '').trim()
  return normalized.length > 0 ? normalized : null
}

function normalizeRuntimeKind(value: string | null | undefined): string | null {
  const normalized = String(value ?? '').trim()
  return normalized.length > 0 ? normalized : null
}

function summarizeRuntimeError(error: unknown): string {
  if (!(error instanceof Error)) return 'runtime probe failed'
  const combined = `${error.name}: ${error.message}`
  return combined
    .replace(/(contentToken["'\s:=]+)([^\s"',}]+)/gi, '$1[redacted-token]')
    .replace(/(fullHash["'\s:=]+)([A-Za-z0-9+/=:_-]{12,})/gi, '$1[redacted-hash]')
    .replace(/\b[A-Za-z]:\\[^\s"'`]+/g, '[redacted-path]')
    .replace(/(?:\/Users\/|\/home\/|\/mnt\/|\/var\/|\/tmp\/)[^\s"'`]+/g, '[redacted-path]')
}
