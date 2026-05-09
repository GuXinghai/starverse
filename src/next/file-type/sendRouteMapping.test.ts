import { describe, expect, it } from 'vitest'
import { buildSendPlanCandidates } from './sendRouteMapping'
import { createExternalEngineRegistry } from './externalEngineRegistry'
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

// eslint-disable-next-line max-lines-per-function
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

  it('accepts registry engineAvailability envelope and uses routeAvailability for gating', () => {
    const registry = createExternalEngineRegistry(() => 1000)
    registry.registerBuiltInEngineDefinitions()
    registry.markEngineHealthy({ engineId: 'tika' })
    registry.disableEngine('tika')
    const availability = registry.getEngineAvailability()

    const candidates = buildSendPlanCandidates({
      verdict: verdict('docx'),
      modelCapabilities: fullCapabilities,
      engineAvailability: availability,
    })

    const converted = candidates.find((item) => item.route === 'converted_markdown')
    expect(converted?.blocked).toBe(true)
    expect(converted?.blockedBy).toContain('engine_document_conversion_unavailable')
  })

  it('does not globally block routes when magika engine is unavailable but routeAvailability stays true', () => {
    const availability = {
      engines: [
        {
          id: 'magika',
          displayName: 'Magika',
          version: 'mock-v1',
          platform: 'any',
          kind: 'builtin',
          capabilities: [],
          supportedFormatIds: [],
          supportedMimeTypes: [],
          enabled: true,
          healthStatus: 'failed',
          failureReason: 'engine_unavailable',
          failureDetails: 'runtime unavailable',
          lastCheckedAt: 1000,
          healthcheck: null,
        },
      ],
      diagnostics: [],
      capabilityAvailability: {
        document_conversion: true,
        spreadsheet_conversion: true,
        presentation_conversion: true,
        rendered_images: true,
        text_extraction: true,
        metadata_extraction: false,
        audio_extraction: true,
        frame_selection: true,
      },
      routeAvailability: {
        documentConversion: true,
        spreadsheetConversion: true,
        presentationConversion: true,
        renderedImages: true,
        textExtraction: true,
        audioExtraction: true,
        frameSelection: true,
      },
    } as const

    const candidates = buildSendPlanCandidates({
      verdict: verdict('docx'),
      modelCapabilities: fullCapabilities,
      engineAvailability: availability,
    })
    const converted = candidates.find((item) => item.route === 'converted_markdown')
    expect(converted?.blocked).toBe(false)
    expect(converted?.blockedBy).toEqual([])
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

  // === P4-C6 engine-specific tests ===

  function engineAvailabilityWith(overrides: Partial<Record<string, boolean>>) {
    const base = {
      documentConversion: false,
      spreadsheetConversion: false,
      presentationConversion: false,
      renderedImages: false,
      textExtraction: false,
      audioExtraction: false,
      frameSelection: false,
    }
    return { ...base, ...overrides }
  }

  it('blocks extracted_text when textExtraction is unavailable', () => {
    const candidates = buildSendPlanCandidates({
      verdict: verdict('docx'),
      modelCapabilities: fullCapabilities,
      engineAvailability: engineAvailabilityWith({ textExtraction: false }),
    })
    const extracted = candidates.find((item) => item.route === 'extracted_text')
    expect(extracted).toBeDefined()
    expect(extracted?.blocked).toBe(true)
    expect(extracted?.blockedBy).toContain('engine_text_extraction_unavailable')
  })

  it('unlocks extracted_text when textExtraction is available', () => {
    const candidates = buildSendPlanCandidates({
      verdict: verdict('docx'),
      modelCapabilities: fullCapabilities,
      engineAvailability: engineAvailabilityWith({ textExtraction: true }),
    })
    const extracted = candidates.find((item) => item.route === 'extracted_text')
    expect(extracted).toBeDefined()
    expect(extracted?.blocked).toBe(false)
    expect(extracted?.blockedBy).toEqual([])
  })

  it('blocks converted_markdown when documentConversion is unavailable', () => {
    const candidates = buildSendPlanCandidates({
      verdict: verdict('docx'),
      modelCapabilities: fullCapabilities,
      engineAvailability: engineAvailabilityWith({ documentConversion: false }),
    })
    const md = candidates.find((item) => item.route === 'converted_markdown')
    expect(md).toBeDefined()
    expect(md?.blocked).toBe(true)
    expect(md?.blockedBy).toContain('engine_document_conversion_unavailable')
  })

  it('unlocks converted_markdown when documentConversion is available', () => {
    const candidates = buildSendPlanCandidates({
      verdict: verdict('docx'),
      modelCapabilities: fullCapabilities,
      engineAvailability: engineAvailabilityWith({ documentConversion: true }),
    })
    const md = candidates.find((item) => item.route === 'converted_markdown')
    expect(md?.blocked).toBe(false)
  })

  it('blocks selected_frames when frameSelection is unavailable', () => {
    const candidates = buildSendPlanCandidates({
      verdict: verdict('mp4'),
      modelCapabilities: fullCapabilities,
      engineAvailability: engineAvailabilityWith({ frameSelection: false }),
    })
    const frames = candidates.find((item) => item.route === 'selected_frames')
    expect(frames).toBeDefined()
    expect(frames?.blocked).toBe(true)
    expect(frames?.blockedBy).toContain('engine_frame_selection_unavailable')
  })

  it('blocks extracted_audio when audioExtraction is unavailable', () => {
    const candidates = buildSendPlanCandidates({
      verdict: verdict('mp3'),
      modelCapabilities: fullCapabilities,
      engineAvailability: engineAvailabilityWith({ audioExtraction: false }),
    })
    const audio = candidates.find((item) => item.route === 'extracted_audio')
    expect(audio).toBeDefined()
    expect(audio?.blocked).toBe(true)
    expect(audio?.blockedBy).toContain('engine_audio_extraction_unavailable')
  })

  it('blocks rendered_images when both renderedImages and presentationConversion are unavailable', () => {
    const candidates = buildSendPlanCandidates({
      verdict: verdict('pptx'),
      modelCapabilities: fullCapabilities,
      engineAvailability: engineAvailabilityWith({ renderedImages: false, presentationConversion: false }),
    })
    const images = candidates.find((item) => item.route === 'rendered_images')
    expect(images).toBeDefined()
    expect(images?.blocked).toBe(true)
    expect(images?.blockedBy).toContain('engine_rendered_images_unavailable')
  })

  it('executable files stay blocked even when all engines are available', () => {
    const candidates = buildSendPlanCandidates({
      verdict: verdict('windows_exe', [{ flag: 'executable_content', reasonCode: 'reason.executable_content', blocking: true }]),
      modelCapabilities: fullCapabilities,
      engineAvailability: engineAvailabilityWith({
        documentConversion: true,
        textExtraction: true,
        spreadsheetConversion: true,
        presentationConversion: true,
        renderedImages: true,
        audioExtraction: true,
        frameSelection: true,
      }),
    })
    expect(candidates[0]?.route).toBe('blocked')
  })

  it('does not mutate verdict when engine availability affects candidates', () => {
    const inputVerdict = verdict('docx')
    const snapshot = JSON.stringify(inputVerdict)
    buildSendPlanCandidates({
      verdict: inputVerdict,
      modelCapabilities: fullCapabilities,
      engineAvailability: engineAvailabilityWith({ textExtraction: false }),
    })
    expect(JSON.stringify(inputVerdict)).toBe(snapshot)
  })

  it('accepts registry envelope with real engine availability gating documentConversion', () => {
    const registry = createExternalEngineRegistry(() => 1000)
    registry.registerBuiltInEngineDefinitions()
    const docEngines = ['tika', 'libreoffice', 'pandoc'] as const
    for (const id of docEngines) {
      registry.disableEngine(id)
    }
    const availability = registry.getEngineAvailability()

    const candidates = buildSendPlanCandidates({
      verdict: verdict('docx'),
      modelCapabilities: fullCapabilities,
      engineAvailability: availability,
    })
    const converted = candidates.find((item) => item.route === 'converted_markdown')
    expect(converted?.blocked).toBe(true)
    expect(converted?.blockedBy).toContain('engine_document_conversion_unavailable')
  })

  it('accepts registry envelope with tika alone unlocking both text extraction and document conversion', () => {
    const registry = createExternalEngineRegistry(() => 1000)
    registry.registerBuiltInEngineDefinitions()
    for (const id of ['tika', 'libreoffice', 'pandoc'] as const) {
      registry.disableEngine(id)
    }
    registry.enableEngine('tika')
    registry.markEngineHealthy({ engineId: 'tika' })
    const availability = registry.getEngineAvailability()

    const candidates = buildSendPlanCandidates({
      verdict: verdict('docx'),
      modelCapabilities: fullCapabilities,
      engineAvailability: availability,
    })
    const extracted = candidates.find((item) => item.route === 'extracted_text')
    expect(extracted?.blocked).toBe(false)
    const converted = candidates.find((item) => item.route === 'converted_markdown')
    expect(converted?.blocked).toBe(false) // tika manifest includes document_conversion
  })

  it('accepts registry envelope with only pandoc providing documentConversion', () => {
    const registry = createExternalEngineRegistry(() => 1000)
    registry.registerBuiltInEngineDefinitions()
    for (const id of ['tika', 'libreoffice', 'pandoc'] as const) {
      registry.disableEngine(id)
    }
    registry.enableEngine('pandoc')
    registry.markEngineHealthy({ engineId: 'pandoc' })
    const availability = registry.getEngineAvailability()

    const candidates = buildSendPlanCandidates({
      verdict: verdict('docx'),
      modelCapabilities: fullCapabilities,
      engineAvailability: availability,
    })
    const extracted = candidates.find((item) => item.route === 'extracted_text')
    expect(extracted?.blocked).toBe(true) // pandoc manifest has no text_extraction
    const converted = candidates.find((item) => item.route === 'converted_markdown')
    expect(converted?.blocked).toBe(false) // pandoc has document_conversion
  })
})
