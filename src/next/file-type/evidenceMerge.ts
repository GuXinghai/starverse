import { FILE_FORMAT_DESCRIPTORS } from './taxonomy'
import type { FileFormatId, FileTypeConflict, FileTypeEvidence, FileTypeFlag, FileTypePrimary } from './types'

export type EvidenceMergeInput = Readonly<{
  evidence: readonly FileTypeEvidence[]
}>

export type EvidenceMergeResult = Readonly<{
  primary: FileTypePrimary
  conflicts: readonly FileTypeConflict[]
  flags: readonly FileTypeFlag[]
}>

const SOURCE_BASE_SCORE: Readonly<Record<FileTypeEvidence['source'], number>> = {
  container_probe: 1000,
  magic: 900,
  magika: 700,
  parser_probe: 650,
  text_probe: 600,
  external_detector: 550,
  extension: 400,
  mime_os: 300,
  mime_browser: 200,
  user_override: 50,
  cache: 40,
}

const CONFIDENCE_SCORE: Readonly<Record<NonNullable<FileTypeEvidence['confidence']>, number>> = {
  high: 100,
  medium: 60,
  low: 25,
  unknown: 0,
}

export function mergeFileTypeEvidence(input: EvidenceMergeInput): EvidenceMergeResult {
  const candidates = input.evidence.filter((item) => item.detectedFormatId !== null)
  if (candidates.length === 0) return buildUnknownResult()

  const scored = candidates.map((item) => ({ item, score: scoreEvidence(item) }))
  scored.sort((a, b) => b.score - a.score)
  const primaryEvidence = scored[0].item

  const primaryFormat = primaryEvidence.detectedFormatId ?? 'unknown'
  const primaryDescriptor = FILE_FORMAT_DESCRIPTORS[primaryFormat]
  const primary: FileTypePrimary = {
    formatId: primaryFormat,
    kind: primaryDescriptor?.primaryKind ?? 'unknown',
    confidence: normalizePrimaryConfidence(primaryEvidence),
    reasonCodes: primaryEvidence.reasonCodes,
    sourceCodeMeta: null,
  }

  const conflicts = collectConflicts(primaryFormat, scored)
  const flags = collectFlags(primary, scored, conflicts)

  return { primary, conflicts, flags }
}

function scoreEvidence(evidence: FileTypeEvidence): number {
  const base = SOURCE_BASE_SCORE[evidence.source] ?? 0
  const confidence = CONFIDENCE_SCORE[normalizeConfidence(evidence.confidence)]
  let extra = 0

  if (evidence.source === 'magic') {
    if ((evidence.note ?? '').includes('strong')) extra += 120
    if ((evidence.note ?? '').includes('container-signature')) extra -= 100
  }
  if (evidence.source === 'magika') {
    if (evidence.confidence === 'high') extra += 80
    else if (evidence.confidence === 'medium') extra += 40
  }
  if (evidence.source === 'text_probe') {
    const format = evidence.detectedFormatId
    const structured = format !== 'plain_text' && format !== 'unknown'
    if (structured) extra += 70
  }

  // Enforce conservative rule: extension/mime hints cannot dominate as high-confidence finals.
  if (evidence.source === 'extension' || evidence.source === 'mime_os' || evidence.source === 'mime_browser') {
    extra -= 40
  }

  return base + confidence + extra
}

function collectConflicts(primaryFormat: FileFormatId, scored: Array<{ item: FileTypeEvidence; score: number }>): FileTypeConflict[] {
  const conflicts: FileTypeConflict[] = []
  for (const { item } of scored.slice(1)) {
    if (!item.detectedFormatId || item.detectedFormatId === primaryFormat) continue
    conflicts.push({
      expectedFormatId: primaryFormat,
      observedFormatId: item.detectedFormatId,
      sources: [item.source],
      reasonCodes: item.reasonCodes,
      severity: item.confidence === 'high' ? 'high' : item.confidence === 'medium' ? 'medium' : 'low',
    })
  }
  return conflicts
}

function collectFlags(
  primary: FileTypePrimary,
  scored: Array<{ item: FileTypeEvidence; score: number }>,
  conflicts: readonly FileTypeConflict[]
): FileTypeFlag[] {
  const flags: FileTypeFlag[] = []
  const primaryDescriptor = FILE_FORMAT_DESCRIPTORS[primary.formatId]

  if (primaryDescriptor?.executable) {
    flags.push({
      flag: 'executable_content',
      reasonCode: 'reason.executable_content',
      blocking: true,
    })
  }

  if ((primary.formatId === 'unknown_binary' || primary.formatId === 'unknown') && primary.confidence !== 'high') {
    flags.push({
      flag: 'unknown_binary',
      reasonCode: 'reason.unknown_binary',
      blocking: true,
    })
  }

  const strongSignals = scored.filter(({ item }) => {
    if (!item.detectedFormatId) return false
    if (item.source === 'container_probe') return true
    return item.source === 'magic' && item.confidence === 'high'
  })
  const uniqueStrongFormats = new Set(strongSignals.map(({ item }) => item.detectedFormatId))
  if (uniqueStrongFormats.size > 1 || conflicts.some((conflict) => conflict.severity === 'high')) {
    flags.push({
      flag: 'polyglot_suspected',
      reasonCode: 'reason.polyglot_suspected',
      blocking: true,
    })
  }

  return dedupeFlags(flags)
}

function dedupeFlags(flags: readonly FileTypeFlag[]): FileTypeFlag[] {
  const map = new Map<string, FileTypeFlag>()
  for (const flag of flags) {
    map.set(`${flag.flag}:${flag.reasonCode}`, flag)
  }
  return Array.from(map.values())
}

function normalizeConfidence(confidence: FileTypeEvidence['confidence']): FileTypePrimary['confidence'] {
  if (confidence === 'high' || confidence === 'medium' || confidence === 'low') return confidence
  return 'unknown'
}

function normalizePrimaryConfidence(evidence: FileTypeEvidence): FileTypePrimary['confidence'] {
  const normalized = normalizeConfidence(evidence.confidence)
  if (evidence.source === 'extension' || evidence.source === 'mime_browser' || evidence.source === 'mime_os') {
    if (normalized === 'high') return 'medium'
  }
  return normalized
}

function buildUnknownResult(): EvidenceMergeResult {
  return {
    primary: {
      formatId: 'unknown',
      kind: 'unknown',
      confidence: 'unknown',
      reasonCodes: ['reason.unknown_binary'],
      sourceCodeMeta: null,
    },
    conflicts: [],
    flags: [
      {
        flag: 'unknown_binary',
        reasonCode: 'reason.unknown_binary',
        blocking: true,
      },
    ],
  }
}
