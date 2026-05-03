import { MAGIKA_LABEL_TO_FORMAT_ID } from './taxonomyMap'
import type { FileTypeEvidence } from './types'

export type MagikaDetectionInput = Readonly<{
  bytes: Uint8Array
  filename?: string | null
  mime?: string | null
}>

export type MagikaRawOutput = Readonly<{
  label: string
  score: number
}>

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
  return mapMagikaOutputToEvidence(raw)
}

export function mapMagikaOutputToEvidence(raw: MagikaRawOutput): FileTypeEvidence {
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
