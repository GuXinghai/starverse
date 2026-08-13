import { probeContainer } from './containerProbe'
import { mergeFileTypeEvidence } from './evidenceMerge'
import { evaluateFileTypeStaticPolicy } from './fileTypeStaticPolicy'
import { detectMagic } from './magicDetector'
import { probeText } from './textProbe'
import { EXTENSION_TO_FORMAT_ID, FILE_TYPE_TAXONOMY_MAP_VERSION, MIME_TO_FORMAT_ID } from './taxonomyMap'
import { FILE_TYPE_TAXONOMY_VERSION } from './taxonomy'
import type {
  FileTypeDetectionTrigger,
  FileTypeEvidence,
  FileTypeFlag,
  FileTypeMagikaState,
  FileTypeStaticPolicyResult,
  FileTypeVerdict,
} from './types'

export const FILE_TYPE_VERDICT_SCHEMA_VERSION_V2 = 'file-type-verdict-v2.1'

export type BasicFileTypeDetectionV2Result = Readonly<{
  verdict: FileTypeVerdict
  staticPolicy: FileTypeStaticPolicyResult
}>

export function detectBasicFileTypeV2(input: Readonly<{
  bytes: Uint8Array
  filename: string | null
  declaredMime: string | null
  detectionTrigger: FileTypeDetectionTrigger
  additionalEvidence?: readonly FileTypeEvidence[]
  magika?: Readonly<{
    state: FileTypeMagikaState
    used: boolean
    modelVersion: string | null
    failureReason?: string | null
  }>
}>): BasicFileTypeDetectionV2Result {
  const evidence: FileTypeEvidence[] = []
  const extension = extensionOf(input.filename)
  const extensionFormat = extension ? EXTENSION_TO_FORMAT_ID[extension] : undefined
  if (extensionFormat) evidence.push(hintEvidence('extension', extensionFormat, null, extension, 'reason.extension_hint'))
  const mime = normalizeMime(input.declaredMime)
  const mimeFormat = mime ? MIME_TO_FORMAT_ID[mime] : undefined
  if (mimeFormat) evidence.push(hintEvidence('mime_browser', mimeFormat, mime, null, 'reason.mime_hint'))

  const magic = detectMagic(input.bytes)
  if (magic.evidence) evidence.push(magic.evidence)
  const container = probeContainer(input.bytes)
  if (container.evidence) evidence.push(container.evidence)
  const text = probeText(input.bytes)
  if (text.evidence) evidence.push(text.evidence)
  if (input.additionalEvidence) evidence.push(...input.additionalEvidence)

  const merged = mergeFileTypeEvidence({ evidence })
  const flags = mergeFlags(merged.flags, container.flags.map(containerFlag))
  const advanced = input.magika
  const verdict: FileTypeVerdict = Object.freeze({
    primary: merged.primary,
    conflicts: Object.freeze([...merged.conflicts]),
    flags: Object.freeze(flags),
    evidence: Object.freeze(evidence),
    provenance: Object.freeze({
      detectionLevel: advanced?.used ? 'advanced' : 'basic',
      engineMode: advanced?.used ? 'core_plus_magika' : 'core_only',
      usedMagika: advanced?.used ?? false,
      magikaState: advanced?.state ?? 'not_requested',
      evidenceSources: Object.freeze([...new Set(evidence.map((item) => item.source))]),
      decisiveEvidenceSource: evidence.find((item) => item.detectedFormatId === merged.primary.formatId)?.source ?? null,
      detectionTrigger: input.detectionTrigger,
      routeEligibility: 'verdict_ready',
      magikaModelVersion: advanced?.modelVersion ?? null,
      advancedAttempted: advanced?.state === 'available' || advanced?.state === 'failed' || advanced?.state === 'unavailable',
      advancedFailureReason: advanced?.failureReason ?? null,
    }),
    schemaVersion: FILE_TYPE_VERDICT_SCHEMA_VERSION_V2,
    taxonomyVersion: `${FILE_TYPE_TAXONOMY_VERSION}:${FILE_TYPE_TAXONOMY_MAP_VERSION}`,
    detectionCost: advanced?.used ? 'medium' : 'low',
    fingerprint: null,
  })
  return Object.freeze({ verdict, staticPolicy: Object.freeze(evaluateFileTypeStaticPolicy(verdict)) })
}

function extensionOf(filename: string | null): string | null {
  if (!filename) return null
  const base = filename.replace(/\\/gu, '/').split('/').pop() ?? ''
  const dot = base.lastIndexOf('.')
  return dot > 0 && dot < base.length - 1 ? base.slice(dot + 1).toLowerCase() : null
}

function normalizeMime(value: string | null): string | null {
  if (!value) return null
  const normalized = value.split(';', 1)[0].trim().toLowerCase()
  return normalized.includes('/') ? normalized : null
}

function hintEvidence(
  source: 'extension' | 'mime_browser',
  detectedFormatId: FileTypeEvidence['detectedFormatId'],
  detectedMime: string | null,
  detectedExtension: string | null,
  reasonCode: string,
): FileTypeEvidence {
  return Object.freeze({
    source, detectedFormatId, detectedMime, detectedExtension, confidence: 'medium',
    reasonCodes: Object.freeze([reasonCode]), errorCode: null, note: `${source}:declared`,
  })
}

function containerFlag(flag: string): FileTypeFlag {
  const blocking = flag === 'zip_slip' || flag === 'damaged_container' || flag === 'duplicate_entry'
  return Object.freeze({ flag: `container_${flag}`, reasonCode: `reason.container_${flag}`, blocking })
}

function mergeFlags(left: readonly FileTypeFlag[], right: readonly FileTypeFlag[]): FileTypeFlag[] {
  return [...new Map([...left, ...right].map((flag) => [`${flag.flag}:${flag.reasonCode}`, flag])).values()]
}
