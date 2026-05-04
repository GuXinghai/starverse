import { readFileSync } from 'node:fs'
import path from 'node:path'
import { describe, expect, it } from 'vitest'
import { STAGE_I_FIXTURE_SAMPLES } from './fixtures/fixtureCorpus'
import { probeContainer } from './containerProbe'
import { mergeFileTypeEvidence } from './evidenceMerge'
import { evaluateFileTypeStaticPolicy } from './fileTypeStaticPolicy'
import { detectMagic } from './magicDetector'
import { buildSendPlanCandidates } from './sendRouteMapping'
import { EXTENSION_TO_FORMAT_ID, MIME_TO_FORMAT_ID } from './taxonomyMap'
import { probeText } from './textProbe'
import type {
  FileTypeEvidence,
  FileTypeFlag,
  FileTypeStaticPolicyResult,
  FileTypeVerdict,
  ModelInputCapabilities,
} from './types'

type FixtureExpected = Readonly<{
  primary: Readonly<{ formatId: string; kind: string }>
  confidenceLevel: string
  minConflictCount: number
  requiredFlagReasons: readonly string[]
  staticPolicy: Readonly<{
    blocked: boolean
    blocksDirectSend: boolean
    blocksConversion: boolean
    needsParserValidation: boolean
  }>
  preview: Readonly<{ defaultPreviewMode: string }>
  candidate: Readonly<{
    route: string
    routeLabelCode: string
    blocked: boolean
    requiresJob: boolean
  }>
}>

type ExpectedPayload = Readonly<{
  version: string
  fixtures: Record<string, FixtureExpected>
}>

const DEFAULT_CAPABILITIES: ModelInputCapabilities = {
  acceptsText: true,
  acceptsImage: true,
  acceptsAudio: true,
  acceptsVideo: true,
  acceptsFile: true,
  acceptsPdf: true,
  acceptsCsv: true,
  acceptsTsv: true,
  acceptsUrlRef: true,
  acceptsInlineData: true,
}

const expected = loadExpected()

describe('Stage I fixture regression matrix', () => {
  it('keeps expected detection/policy/route outputs stable', () => {
    for (const sample of STAGE_I_FIXTURE_SAMPLES) {
      const fixtureExpected = expected.fixtures[sample.id]
      expect(fixtureExpected, `missing expected fixture: ${sample.id}`).toBeTruthy()

      const extension = normalizeExtension(sample.filename)
      const evidence: FileTypeEvidence[] = []
      if (extension && EXTENSION_TO_FORMAT_ID[extension]) {
        evidence.push({
          source: 'extension',
          detectedFormatId: EXTENSION_TO_FORMAT_ID[extension],
          detectedMime: null,
          detectedExtension: extension,
          confidence: 'medium',
          reasonCodes: [],
          errorCode: null,
          note: 'fixture:extension',
        })
      }
      const normalizedMime = normalizeMime(sample.mime)
      if (normalizedMime && MIME_TO_FORMAT_ID[normalizedMime]) {
        evidence.push({
          source: 'mime_os',
          detectedFormatId: MIME_TO_FORMAT_ID[normalizedMime],
          detectedMime: normalizedMime,
          detectedExtension: extension,
          confidence: 'medium',
          reasonCodes: [],
          errorCode: null,
          note: 'fixture:mime',
        })
      }

      const magic = detectMagic(sample.bytes)
      if (magic.evidence) evidence.push(magic.evidence)
      const container = probeContainer(sample.bytes)
      if (container.evidence) evidence.push(container.evidence)
      const text = probeText(sample.bytes)
      if (text.evidence) evidence.push(text.evidence)

      const merged = mergeFileTypeEvidence({ evidence })
      const combinedFlags = dedupeFlags([
        ...merged.flags,
        ...mapContainerFlags(container.flags),
        ...mapTextFlags(text.flags),
      ])
      const policy = evaluateFileTypeStaticPolicy({
        primary: merged.primary,
        conflicts: merged.conflicts,
        flags: combinedFlags,
      })
      const verdict: FileTypeVerdict = {
        primary: merged.primary,
        conflicts: merged.conflicts,
        flags: dedupeFlags([...combinedFlags, ...mapPolicyToFlags(policy)]),
        evidence,
        schemaVersion: 'fixture-stage-i',
        taxonomyVersion: 'fixture-stage-i',
        detectionCost: 'low',
        fingerprint: null,
      }
      const candidates = buildSendPlanCandidates({
        verdict,
        modelCapabilities: DEFAULT_CAPABILITIES,
      })
      const top = candidates[0]
      const staticSummary = summarizeStatic(policy)

      expect(verdict.primary.formatId, sample.id).toBe(
        fixtureExpected.primary.formatId
      )
      expect(verdict.primary.kind, sample.id).toBe(fixtureExpected.primary.kind)
      expect(verdict.primary.confidence, sample.id).toBe(fixtureExpected.confidenceLevel)
      expect(verdict.conflicts.length, sample.id).toBeGreaterThanOrEqual(fixtureExpected.minConflictCount)
      for (const reasonCode of fixtureExpected.requiredFlagReasons) {
        expect(verdict.flags.some((flag) => flag.reasonCode === reasonCode), `${sample.id}: missing flag ${reasonCode}`).toBe(true)
      }

      expect(staticSummary.blocked, sample.id).toBe(fixtureExpected.staticPolicy.blocked)
      expect(staticSummary.blocksDirectSend, sample.id).toBe(fixtureExpected.staticPolicy.blocksDirectSend)
      expect(staticSummary.blocksConversion, sample.id).toBe(fixtureExpected.staticPolicy.blocksConversion)
      expect(staticSummary.needsParserValidation, sample.id).toBe(fixtureExpected.staticPolicy.needsParserValidation)
      expect(policy.defaultPreviewMode, sample.id).toBe(fixtureExpected.preview.defaultPreviewMode)

      expect(top.route, sample.id).toBe(fixtureExpected.candidate.route)
      expect(top.routeLabelCode, sample.id).toBe(fixtureExpected.candidate.routeLabelCode)
      expect(top.blocked, sample.id).toBe(fixtureExpected.candidate.blocked)
      expect(top.requiresJob, sample.id).toBe(fixtureExpected.candidate.requiresJob)
    }
  })
})

function loadExpected(): ExpectedPayload {
  const jsonPath = path.resolve(process.cwd(), 'src/next/file-type/fixtures/expected.json')
  return JSON.parse(readFileSync(jsonPath, 'utf8')) as ExpectedPayload
}

function mapPolicyToFlags(
  policy: ReturnType<typeof evaluateFileTypeStaticPolicy>
): FileTypeFlag[] {
  const flags: FileTypeFlag[] = []
  for (const reasonCode of policy.blockingReasonCodes) {
    flags.push({ flag: reasonToFlag(reasonCode), reasonCode, blocking: true })
  }
  for (const reasonCode of policy.warningReasonCodes) {
    flags.push({ flag: reasonToFlag(reasonCode), reasonCode, blocking: false })
  }
  return flags
}

function mapTextFlags(flags: readonly string[]): FileTypeFlag[] {
  if (flags.length === 0) return []
  return [{ flag: 'text_probe_uncertain', reasonCode: 'reason.low_confidence', blocking: false }]
}

function mapContainerFlags(flags: readonly string[]): FileTypeFlag[] {
  const out: FileTypeFlag[] = []
  for (const flag of flags) {
    if (flag === 'zip_slip') {
      out.push({ flag: 'zip_slip', reasonCode: 'reason.polyglot_suspected', blocking: true })
    } else {
      out.push({ flag: `container_${flag}`, reasonCode: 'reason.container_probe_failed', blocking: false })
    }
  }
  return out
}

function dedupeFlags(flags: readonly FileTypeFlag[]): FileTypeFlag[] {
  const map = new Map<string, FileTypeFlag>()
  for (const flag of flags) {
    map.set(`${flag.flag}:${flag.reasonCode}:${flag.blocking ? 1 : 0}`, flag)
  }
  return Array.from(map.values())
}

function reasonToFlag(reasonCode: string): string {
  return reasonCode.replace(/^reason\./, '').replace(/[^a-z0-9]+/gi, '_').toLowerCase()
}

function normalizeExtension(filename: string): string | null {
  const raw = String(filename ?? '').trim().toLowerCase()
  const ext = raw.split('.').pop() ?? ''
  return ext || null
}

function normalizeMime(mime: string | null): string | null {
  const raw = String(mime ?? '').split(';', 1)[0]?.trim().toLowerCase()
  return raw || null
}

function summarizeStatic(
  policy: FileTypeStaticPolicyResult
): Readonly<{
  blocked: boolean
  blocksDirectSend: boolean
  blocksConversion: boolean
  needsParserValidation: boolean
}> {
  return {
    blocked: policy.blocked,
    blocksDirectSend: policy.blocksDirectSend,
    blocksConversion: policy.blocksConversion,
    needsParserValidation: policy.needsParserValidation,
  }
}
