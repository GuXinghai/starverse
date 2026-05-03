import { describe, expect, it } from 'vitest'
import { buildSendPlanCandidates } from './sendRouteMapping'
import type {
  FileTypeVerdict,
  ModelInputCapabilities,
  SendRoute,
} from './types'

const fullCapabilities: ModelInputCapabilities = {
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

function verdict(formatId: FileTypeVerdict['primary']['formatId'], flags: FileTypeVerdict['flags'] = []): FileTypeVerdict {
  return {
    primary: {
      formatId,
      kind: formatId === 'unknown_binary' ? 'binary' : formatId === 'windows_exe' ? 'executable' : 'document',
      confidence: 'high',
      reasonCodes: [],
      sourceCodeMeta: null,
    },
    conflicts: [],
    flags,
    evidence: [],
    schemaVersion: 'v1',
    taxonomyVersion: 'v0',
    detectionCost: 'low',
    fingerprint: 'fp',
  }
}

function routesOf(items: readonly { route: SendRoute }[]): SendRoute[] {
  return items.map((item) => item.route)
}

describe('sendRouteMapping', () => {
  it('maps plain text-like formats to direct_text first', () => {
    const candidates = buildSendPlanCandidates({
      verdict: verdict('plain_text'),
      modelCapabilities: fullCapabilities,
    })
    expect(routesOf(candidates)).toContain('direct_text')
    expect(candidates[0]?.route).toBe('direct_text')
  })

  it('maps document/spreadsheet/presentation formats to conversion candidates', () => {
    const doc = buildSendPlanCandidates({ verdict: verdict('docx'), modelCapabilities: fullCapabilities })
    const sheet = buildSendPlanCandidates({ verdict: verdict('xlsx'), modelCapabilities: fullCapabilities })
    const ppt = buildSendPlanCandidates({ verdict: verdict('pptx'), modelCapabilities: fullCapabilities })
    expect(routesOf(doc)).toEqual(expect.arrayContaining(['converted_markdown', 'direct_file']))
    expect(routesOf(sheet)).toEqual(expect.arrayContaining(['converted_csv', 'converted_tsv']))
    expect(routesOf(ppt)).toEqual(expect.arrayContaining(['converted_markdown', 'rendered_images']))
  })

  it('blocks executable and polyglot-suspected verdicts via static policy', () => {
    const executable = buildSendPlanCandidates({
      verdict: verdict('windows_exe', [{ flag: 'executable_content', reasonCode: 'reason.executable_content', blocking: true }]),
      modelCapabilities: fullCapabilities,
    })
    const polyglot = buildSendPlanCandidates({
      verdict: verdict('pdf', [{ flag: 'polyglot_suspected', reasonCode: 'reason.polyglot_suspected', blocking: true }]),
      modelCapabilities: fullCapabilities,
    })
    expect(executable).toHaveLength(1)
    expect(executable[0]?.route).toBe('blocked')
    expect(polyglot).toHaveLength(1)
    expect(polyglot[0]?.blocked).toBe(true)
  })

  it('keeps override as candidate-only priority and does not mutate verdict', () => {
    const inputVerdict = verdict('pdf')
    const snapshot = JSON.stringify(inputVerdict)
    const candidates = buildSendPlanCandidates({
      verdict: inputVerdict,
      modelCapabilities: fullCapabilities,
      override: {
        requestedFormatId: null,
        requestedRoute: 'direct_file',
        forceSend: false,
        note: null,
      },
    })
    expect(candidates[0]?.route).toBe('direct_file')
    expect(JSON.stringify(inputVerdict)).toBe(snapshot)
  })

  it('uses engine availability to block requiresJob routes without polluting verdict', () => {
    const inputVerdict = verdict('docx')
    const candidates = buildSendPlanCandidates({
      verdict: inputVerdict,
      modelCapabilities: fullCapabilities,
      engineAvailability: {
        documentConversion: false,
      },
    })
    const converted = candidates.find((item) => item.route === 'converted_markdown')
    expect(converted).toBeTruthy()
    expect(converted?.blocked).toBe(true)
    expect(converted?.blockedBy).toContain('engine_document_conversion_unavailable')
    expect(inputVerdict.primary.formatId).toBe('docx')
  })

  it('changes candidates with model capability changes while detection input remains stable', () => {
    const v = verdict('png')
    const rich = buildSendPlanCandidates({
      verdict: v,
      modelCapabilities: fullCapabilities,
    })
    const limited = buildSendPlanCandidates({
      verdict: v,
      modelCapabilities: {
        ...fullCapabilities,
        acceptsImage: false,
        acceptsFile: false,
      },
    })
    const richImage = rich.find((item) => item.route === 'direct_image')
    const limitedImage = limited.find((item) => item.route === 'direct_image')
    expect(richImage?.blocked).toBe(false)
    expect(limitedImage?.blocked).toBe(true)
    expect(limitedImage?.blockedBy).toContain('model_image_unsupported')
  })

  it('handles archive and unknown_binary conservatively', () => {
    const archive = buildSendPlanCandidates({
      verdict: verdict('zip'),
      modelCapabilities: fullCapabilities,
    })
    const unknownBlocked = buildSendPlanCandidates({
      verdict: verdict('unknown_binary'),
      modelCapabilities: fullCapabilities,
    })
    const unknownAsk = buildSendPlanCandidates({
      verdict: verdict('unknown_binary'),
      modelCapabilities: fullCapabilities,
      userPrefs: { allowUnknownBinary: true },
    })
    expect(archive[0]?.route).toBe('ask_user')
    expect(unknownBlocked[0]?.route).toBe('blocked')
    expect(unknownAsk[0]?.route).toBe('ask_user')
  })
})
