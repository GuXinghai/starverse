/* eslint-disable max-lines-per-function */

import { describe, expect, it } from 'vitest'
import BetterSqlite3 from 'better-sqlite3'
import { readFileSync } from 'node:fs'
import path from 'node:path'
import { BranchRepo } from '../db/repo/branchRepo'
import { ConversationDraftRepo } from '../db/repo/conversationDraftRepo'
import { FileDerivativeRepo } from '../db/repo/fileDerivativeRepo'
import { FileAssetRepo } from '../db/repo/fileAssetRepo'
import { FileTypeVerdictRepo } from '../db/repo/fileTypeVerdictRepo'
import { MessageAttachmentRepo } from '../db/repo/messageAttachmentRepo'
import { MessageRepo } from '../db/repo/messageRepo'
import { ConversationAttachmentService } from './conversationAttachmentService'
import { SendPlanService, type CollectedAttachmentInput, __sendPlanEligibilityInternals } from './sendPlanService'
import type { AttachmentSemanticSummary, SendPlanModelDescriptor, SendPlanProviderContext } from '../../src/shared/files/sendPlanTypes'
import type { FileAssetRecord, FileIngestStatus } from '../db/types'
import type { ConfidenceLevel, FileFormatId, FileKind, FileTypeVerdict } from '../../src/next/file-type'
import { canOpenBetterSqliteForSuite } from '../testUtils/betterSqliteGate'

const describeIfBetterSqlite = canOpenBetterSqliteForSuite('SendPlanService send planning') ? describe : describe.skip

function makeLocalAsset(overrides: Partial<FileAssetRecord> = {}): FileAssetRecord {
  return {
    id: 'asset-test',
    sha256: 'asset-test-sha',
    filename: 'asset-test.txt',
    extension: 'txt',
    mime: 'text/plain',
    sizeBytes: 4,
    assetKind: 'text',
    sourceKind: 'local_upload',
    storageBackend: 'local_fs',
    storageUri: 'assets/original/as/asset-test.txt',
    ingestStatus: 'stored' as FileIngestStatus,
    previewStatus: 'not_requested',
    sourceMetaJson: null,
    deletedAt: null,
    createdAt: 1_000,
    updatedAt: 1_000,
    ...overrides,
  }
}

function makeCollectedAttachment(overrides: Partial<CollectedAttachmentInput> = {}): CollectedAttachmentInput {
  return {
    attachmentId: 'att-test',
    assetId: 'asset-test',
    source: 'draft',
    messageId: null,
    aiPayloadKind: 'text',
    processingStatus: 'ready',
    includeInNextRequest: true,
    excludedReason: null,
    preferredSendMode: null,
    dfcManaged: false,
    selectedOptionId: null,
    selectedAssetRefs: [],
    selectedTargetKind: null,
    selectedSendStrategy: null,
    dfcDecision: null,
    fileAsset: makeLocalAsset(),
    semantic: null,
    ...overrides,
  }
}

function modelCapabilitySet(values: Array<'text_in' | 'image_in' | 'audio_in' | 'video_in' | 'file_in'>): Set<'text_in' | 'image_in' | 'audio_in' | 'video_in' | 'file_in'> {
  return new Set(values)
}

function normalizedProvider(overrides: Partial<{
  supportsImageUrlRef: boolean
  supportsPdfInputs: boolean
  supportsPdfUrlRef: boolean
  supportsTextUrlRef: boolean
  supportsVideoUrlRef: boolean
  supportsInlineData: boolean
  supportsProviderFileRef: boolean
  preferredDraftSendModes: Array<'url_ref' | 'inline_base64'>
}> = {}) {
  return {
    providerKey: 'openrouter',
    baseUrl: null,
    supportsImageUrlRef: true,
    supportsPdfInputs: true,
    supportsPdfUrlRef: true,
    supportsTextUrlRef: true,
    supportsVideoUrlRef: false,
    supportsInlineData: true,
    supportsProviderFileRef: false,
    preferredDraftSendModes: ['url_ref', 'inline_base64'] as Array<'url_ref' | 'inline_base64'>,
    ...overrides,
  }
}

function makeVerdict(
  formatId: FileFormatId,
  kind: FileKind,
  confidence: ConfidenceLevel = 'high',
  flags: FileTypeVerdict['flags'] = []
): FileTypeVerdict {
  return {
    primary: {
      formatId,
      kind,
      confidence,
      reasonCodes: [],
      sourceCodeMeta: null,
    },
    conflicts: [],
    flags,
    evidence: [],
    schemaVersion: 'v1',
    taxonomyVersion: 'taxonomy-v1',
    detectionCost: 'low',
    fingerprint: 'fp',
  }
}

describe('SendPlanService semantic eligibility internals', () => {
  it('uses semantic mode and does not switch to legacy routing when semantic is absent', () => {
    const base = makeCollectedAttachment({
      aiPayloadKind: 'binary',
      processingStatus: 'ready',
    })

    const withSemantic = __sendPlanEligibilityInternals.resolveEligibilityEvaluationMode({
      ...base,
      semantic: {
        targetKind: 'plain_text',
        sendStrategy: 'text_in_prompt',
        mappedFromLegacy: false,
      },
    })
    const withoutSemantic = __sendPlanEligibilityInternals.resolveEligibilityEvaluationMode({
      ...base,
      semantic: null,
    })

    expect(withSemantic).toBe('semantic')
    expect(withoutSemantic).toBe('semantic')
  })

  it('resolves semantic summary from explicit semantic only', () => {
    const explicit = __sendPlanEligibilityInternals.resolveAttachmentSemanticSummary(makeCollectedAttachment({
      semantic: {
        targetKind: 'code',
        sendStrategy: 'text_in_prompt',
        mappedFromLegacy: false,
      },
    }))
    const absent = __sendPlanEligibilityInternals.resolveAttachmentSemanticSummary(makeCollectedAttachment({
      aiPayloadKind: 'pdf',
      processingStatus: 'ready',
      semantic: null,
    }))

    expect(explicit).toEqual({
      targetKind: 'code',
      sendStrategy: 'text_in_prompt',
      mappedFromLegacy: false,
    })
    expect(absent).toBeNull()
  })

  it('evaluates semantic text_in_prompt as compatible when model has text_in', () => {
    const attachment = makeCollectedAttachment({
      aiPayloadKind: 'text',
      processingStatus: 'ready',
      semantic: {
        targetKind: 'plain_text',
        sendStrategy: 'text_in_prompt',
        mappedFromLegacy: false,
      },
    })
    const result = __sendPlanEligibilityInternals.evaluateCompatibilityFromSemantic(
      attachment,
      modelCapabilitySet(['text_in']),
      normalizedProvider(),
      attachment.semantic as AttachmentSemanticSummary
    )
    expect(result.compatible).toBe(true)
    expect(result.reasonCode).toBeNull()
  })

  it('supports markdown/code/table_markdown text targets with text_in_prompt strategy', () => {
    const textTargets: AttachmentSemanticSummary['targetKind'][] = ['markdown', 'code', 'table_markdown']
    for (const targetKind of textTargets) {
      const attachment = makeCollectedAttachment({
        aiPayloadKind: 'text',
        processingStatus: 'ready',
        semantic: {
          targetKind,
          sendStrategy: 'text_in_prompt',
          mappedFromLegacy: false,
        },
      })
      const result = __sendPlanEligibilityInternals.evaluateCompatibilityFromSemantic(
        attachment,
        modelCapabilitySet(['text_in']),
        normalizedProvider(),
        attachment.semantic as AttachmentSemanticSummary
      )
      expect(result.compatible).toBe(true)
      expect(result.reasonCode).toBeNull()
    }
  })

  it('blocks semantic pdf_attachment when provider cannot accept pdf inputs', () => {
    const attachment = makeCollectedAttachment({
      aiPayloadKind: 'pdf',
      processingStatus: 'ready',
      fileAsset: makeLocalAsset({
        filename: 'asset-test.pdf',
        extension: 'pdf',
        mime: 'application/pdf',
        assetKind: 'document',
      }),
      semantic: {
        targetKind: 'pdf_attachment',
        sendStrategy: 'file_attachment',
        mappedFromLegacy: false,
      },
    })
    const result = __sendPlanEligibilityInternals.evaluateCompatibilityFromSemantic(
      attachment,
      modelCapabilitySet(['text_in', 'file_in']),
      normalizedProvider({ supportsPdfInputs: false }),
      attachment.semantic as AttachmentSemanticSummary
    )
    expect(result.compatible).toBe(false)
    expect(result.reasonCode).toBe('missing_pdf_input_capability')
  })

  it('requires file_in for semantic pdf_attachment (text_in alone is not sufficient)', () => {
    const attachment = makeCollectedAttachment({
      aiPayloadKind: 'pdf',
      processingStatus: 'ready',
      fileAsset: makeLocalAsset({
        filename: 'asset-test.pdf',
        extension: 'pdf',
        mime: 'application/pdf',
        assetKind: 'document',
      }),
      semantic: {
        targetKind: 'pdf_attachment',
        sendStrategy: 'file_attachment',
        mappedFromLegacy: false,
      },
    })
    const result = __sendPlanEligibilityInternals.evaluateCompatibilityFromSemantic(
      attachment,
      modelCapabilitySet(['text_in']),
      normalizedProvider({ supportsPdfInputs: true }),
      attachment.semantic as AttachmentSemanticSummary
    )
    expect(result.compatible).toBe(false)
    expect(result.reasonCode).toBe('missing_pdf_input_capability')
    expect(result.missingCapabilities).toEqual(['file_in'])
  })

  it('blocks semantic unsupported strategy', () => {
    const attachment = makeCollectedAttachment({
      aiPayloadKind: 'binary',
      processingStatus: 'ready',
      fileAsset: makeLocalAsset({
        filename: 'asset-test.bin',
        extension: 'bin',
        mime: 'application/octet-stream',
        assetKind: 'binary',
      }),
      semantic: {
        targetKind: 'unsupported',
        sendStrategy: 'unsupported',
        mappedFromLegacy: false,
      },
    })
    const result = __sendPlanEligibilityInternals.evaluateCompatibilityFromSemantic(
      attachment,
      modelCapabilitySet(['text_in', 'file_in']),
      normalizedProvider(),
      attachment.semantic as AttachmentSemanticSummary
    )
    expect(result.compatible).toBe(false)
    expect(result.reasonCode).toBe('unsupported_attachment_payload')
  })

  it('keeps convertible attachments blocked in semantic mode', () => {
    const attachment = makeCollectedAttachment({
      aiPayloadKind: 'pdf',
      processingStatus: 'convertible',
      fileAsset: makeLocalAsset({
        filename: 'asset-test.docx',
        extension: 'docx',
        mime: 'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
        assetKind: 'document',
      }),
      semantic: {
        targetKind: 'markdown',
        sendStrategy: 'text_in_prompt',
        mappedFromLegacy: false,
      },
    })
    const result = __sendPlanEligibilityInternals.evaluateCompatibilityFromSemantic(
      attachment,
      modelCapabilitySet(['text_in', 'file_in']),
      normalizedProvider(),
      attachment.semantic as AttachmentSemanticSummary
    )
    expect(result.compatible).toBe(false)
    expect(result.reasonCode).toBe('conversion_required_before_send')
  })

  it('keeps convertible html/pdf_attachment and ps/pdf_attachment blocked without ready converted pdf asset', () => {
    const htmlPdf = makeCollectedAttachment({
      aiPayloadKind: 'pdf',
      processingStatus: 'convertible',
      fileAsset: makeLocalAsset({
        filename: 'page.html',
        extension: 'html',
        mime: 'text/html',
        assetKind: 'text',
      }),
      semantic: {
        targetKind: 'pdf_attachment',
        sendStrategy: 'file_attachment',
        mappedFromLegacy: false,
      },
    })
    const psPdf = makeCollectedAttachment({
      aiPayloadKind: 'pdf',
      processingStatus: 'convertible',
      fileAsset: makeLocalAsset({
        filename: 'drawing.ps',
        extension: 'ps',
        mime: 'application/postscript',
        assetKind: 'text',
      }),
      semantic: {
        targetKind: 'pdf_attachment',
        sendStrategy: 'file_attachment',
        mappedFromLegacy: false,
      },
    })
    const htmlResult = __sendPlanEligibilityInternals.evaluateCompatibilityFromSemantic(
      htmlPdf,
      modelCapabilitySet(['text_in', 'file_in']),
      normalizedProvider({ supportsPdfInputs: true }),
      htmlPdf.semantic as AttachmentSemanticSummary
    )
    const psResult = __sendPlanEligibilityInternals.evaluateCompatibilityFromSemantic(
      psPdf,
      modelCapabilitySet(['text_in', 'file_in']),
      normalizedProvider({ supportsPdfInputs: true }),
      psPdf.semantic as AttachmentSemanticSummary
    )
    expect(htmlResult.compatible).toBe(false)
    expect(psResult.compatible).toBe(false)
    expect(htmlResult.reasonCode).toBe('conversion_required_before_send')
    expect(psResult.reasonCode).toBe('conversion_required_before_send')
  })

  it('does not expose the legacy default semantic mapper as a normal route helper', () => {
    expect((__sendPlanEligibilityInternals as unknown as { buildDefaultSemanticSummary?: unknown }).buildDefaultSemanticSummary).toBeUndefined()
  })

  it('requires both text_in and file_in for semantic mixed strategy', () => {
    const attachment = makeCollectedAttachment({
      aiPayloadKind: 'pdf',
      processingStatus: 'ready',
      semantic: {
        targetKind: 'hybrid',
        sendStrategy: 'mixed',
        mappedFromLegacy: false,
      },
    })
    const missingFile = __sendPlanEligibilityInternals.evaluateCompatibilityFromSemantic(
      attachment,
      modelCapabilitySet(['text_in']),
      normalizedProvider(),
      attachment.semantic as AttachmentSemanticSummary
    )
    const missingText = __sendPlanEligibilityInternals.evaluateCompatibilityFromSemantic(
      attachment,
      modelCapabilitySet(['file_in']),
      normalizedProvider(),
      attachment.semantic as AttachmentSemanticSummary
    )
    const complete = __sendPlanEligibilityInternals.evaluateCompatibilityFromSemantic(
      attachment,
      modelCapabilitySet(['text_in', 'file_in']),
      normalizedProvider(),
      attachment.semantic as AttachmentSemanticSummary
    )
    expect(missingFile.compatible).toBe(false)
    expect(missingFile.reasonCode).toBe('missing_mixed_input_capability')
    expect(missingText.compatible).toBe(false)
    expect(missingText.reasonCode).toBe('missing_mixed_input_capability')
    expect(complete.compatible).toBe(true)
    expect(complete.reasonCode).toBeNull()
  })

  it('supports native_file + file_attachment strategy with file_in capability', () => {
    const attachment = makeCollectedAttachment({
      aiPayloadKind: 'image',
      processingStatus: 'ready',
      semantic: {
        targetKind: 'native_file',
        sendStrategy: 'file_attachment',
        mappedFromLegacy: false,
      },
    })
    const result = __sendPlanEligibilityInternals.evaluateCompatibilityFromSemantic(
      attachment,
      modelCapabilitySet(['file_in']),
      normalizedProvider(),
      attachment.semantic as AttachmentSemanticSummary
    )
    expect(result.compatible).toBe(true)
    expect(result.reasonCode).toBeNull()
  })

  it('accepts matching preview/send lineage hashes as non-blocking', () => {
    const attachment = makeCollectedAttachment({
      fileAsset: makeLocalAsset({
        sourceMetaJson: {
          lineage: {
            previewContentHash: 'h1',
            sendContentHash: 'h1',
            previewSourceHash: 's1',
            sendSourceHash: 's1',
            previewSettingsHash: 'cfg1',
            sendSettingsHash: 'cfg1',
          },
        },
      }),
    })
    const summary = __sendPlanEligibilityInternals.evaluateAttachmentLineageSummary(attachment)
    const gate = __sendPlanEligibilityInternals.evaluateAttachmentLineageGuard(attachment)
    expect(summary.state).toBe('ok')
    expect(gate.blocked).toBe(false)
  })

  it('blocks lineage mismatch and stale assets through the lineage guard', () => {
    const mismatch = makeCollectedAttachment({
      fileAsset: makeLocalAsset({
        sourceMetaJson: {
          lineage: {
            previewContentHash: 'h1',
            sendContentHash: 'h2',
          },
        },
      }),
    })
    const stale = makeCollectedAttachment({
      fileAsset: makeLocalAsset({
        sourceMetaJson: {
          stale: true,
          staleReason: 'source_changed',
        },
      }),
    })
    expect(__sendPlanEligibilityInternals.evaluateAttachmentLineageGuard(mismatch)).toMatchObject({
      blocked: true,
      reasonCode: 'preview_send_asset_mismatch',
    })
    expect(__sendPlanEligibilityInternals.evaluateAttachmentLineageGuard(stale)).toMatchObject({
      blocked: true,
      reasonCode: 'stale_derived_asset',
    })
  })

  it('maps send route candidates into semantic targets for major format classes', () => {
    const modelCapabilities = __sendPlanEligibilityInternals.modelInputCapabilitiesFromDescriptor(
      model(['text', 'image', 'audio', 'video', 'file']),
      normalizedProvider()
    )
    const cases: Array<{
      formatId: FileFormatId
      kind: FileKind
      aiPayloadKind: CollectedAttachmentInput['aiPayloadKind']
      targetKind: AttachmentSemanticSummary['targetKind']
      sendStrategy: AttachmentSemanticSummary['sendStrategy']
    }> = [
      { formatId: 'plain_text', kind: 'text', aiPayloadKind: 'text', targetKind: 'plain_text', sendStrategy: 'text_in_prompt' },
      { formatId: 'markdown', kind: 'text', aiPayloadKind: 'text', targetKind: 'plain_text', sendStrategy: 'text_in_prompt' },
      { formatId: 'png', kind: 'image', aiPayloadKind: 'image', targetKind: 'native_file', sendStrategy: 'file_attachment' },
      { formatId: 'pdf', kind: 'document', aiPayloadKind: 'pdf', targetKind: 'markdown', sendStrategy: 'text_in_prompt' },
      { formatId: 'docx', kind: 'document', aiPayloadKind: 'text', targetKind: 'markdown', sendStrategy: 'text_in_prompt' },
      { formatId: 'xlsx', kind: 'spreadsheet', aiPayloadKind: 'text', targetKind: 'table_markdown', sendStrategy: 'text_in_prompt' },
      { formatId: 'pptx', kind: 'presentation', aiPayloadKind: 'text', targetKind: 'markdown', sendStrategy: 'text_in_prompt' },
      { formatId: 'html', kind: 'text', aiPayloadKind: 'text', targetKind: 'unsupported', sendStrategy: 'unsupported' },
      { formatId: 'svg', kind: 'image', aiPayloadKind: 'image', targetKind: 'native_file', sendStrategy: 'file_attachment' },
      { formatId: 'zip', kind: 'archive', aiPayloadKind: 'binary', targetKind: 'unsupported', sendStrategy: 'unsupported' },
      { formatId: 'windows_exe', kind: 'executable', aiPayloadKind: 'binary', targetKind: 'unsupported', sendStrategy: 'unsupported' },
      { formatId: 'unknown_binary', kind: 'binary', aiPayloadKind: 'binary', targetKind: 'unsupported', sendStrategy: 'unsupported' },
    ]

    for (const testCase of cases) {
      const candidates = __sendPlanEligibilityInternals.buildRouteCandidatesFromVerdict(
        makeVerdict(testCase.formatId, testCase.kind),
        modelCapabilities
      )
      const semantic = __sendPlanEligibilityInternals.semanticSummaryFromRouteCandidates(candidates, testCase.aiPayloadKind)
      expect(semantic).toMatchObject({
        targetKind: testCase.targetKind,
        sendStrategy: testCase.sendStrategy,
        mappedFromLegacy: false,
      })
    }
  })

  it('enforces blocked candidate gate for unsafe verdict routes', () => {
    const modelCapabilities = __sendPlanEligibilityInternals.modelInputCapabilitiesFromDescriptor(
      model(['text', 'image', 'audio', 'video', 'file']),
      normalizedProvider()
    )
    const blockedCandidates = __sendPlanEligibilityInternals.buildRouteCandidatesFromVerdict(
      makeVerdict('windows_exe', 'executable'),
      modelCapabilities
    )
    expect(__sendPlanEligibilityInternals.evaluateRouteCandidateGate(blockedCandidates)).toMatchObject({
      blocked: true,
      reasonCode: 'file_type_route_blocked',
    })

    const askUserCandidates = __sendPlanEligibilityInternals.buildRouteCandidatesFromVerdict(
      makeVerdict('zip', 'archive'),
      modelCapabilities
    )
    expect(__sendPlanEligibilityInternals.evaluateRouteCandidateGate(askUserCandidates)).toMatchObject({
      blocked: false,
    })
  })
})

function loadSchema(db: BetterSqlite3.Database) {
  const schemaPath = path.resolve(process.cwd(), 'infra', 'db', 'schema.sql')
  db.exec(readFileSync(schemaPath, 'utf8'))
}

function insertConvo(db: BetterSqlite3.Database, id: string) {
  db.prepare(`
    INSERT INTO convo(id, project_id, title, created_at, updated_at, meta)
    VALUES (@id, NULL, @title, 1, 1, NULL)
  `).run({ id, title: id })
}

function createHarness() {
  const db = new BetterSqlite3(':memory:')
  loadSchema(db)
  const fileAssetRepo = new FileAssetRepo(db)
  const fileDerivativeRepo = new FileDerivativeRepo(db)
  const fileTypeVerdictRepo = new FileTypeVerdictRepo(db)
  const messageRepo = new MessageRepo(db)
  const messageAttachmentRepo = new MessageAttachmentRepo(db)
  const branchRepo = new BranchRepo(db)
  const draftRepo = new ConversationDraftRepo(db)
  const conversationAttachmentService = new ConversationAttachmentService({
    db,
    fileAssetRepo,
    messageRepo,
    messageAttachmentRepo,
    branchRepo,
    draftRepo,
    now: () => 1_000,
  })
  const sendPlanService = new SendPlanService({
    conversationAttachmentService,
    fileAssetRepo,
    fileDerivativeRepo,
    fileTypeVerdictRepo,
    now: () => 2_000,
    parsingTimeoutMs: 100,
  })
  return {
    db,
    fileAssetRepo,
    fileDerivativeRepo,
    fileTypeVerdictRepo,
    messageRepo,
    branchRepo,
    conversationAttachmentService,
    sendPlanService,
  }
}

function createAsset(
  repo: FileAssetRepo,
  id: string,
  overrides: Partial<Parameters<FileAssetRepo['create']>[0]> = {}
) {
  return repo.create({
    id,
    sha256: `${id}-sha`,
    filename: `${id}.txt`,
    extension: 'txt',
    mime: 'text/plain',
    sizeBytes: 4,
    assetKind: 'text',
    sourceKind: 'local_upload',
    storageBackend: 'local_fs',
    storageUri: `assets/original/${id.slice(0, 2)}/${id}.txt`,
    ingestStatus: 'stored',
    previewStatus: 'not_requested',
    createdAt: 1_000,
    updatedAt: 1_950,
    ...overrides,
  })
}

function createDerivative(
  repo: FileDerivativeRepo,
  id: string,
  parentAssetId: string,
  overrides: Partial<Parameters<FileDerivativeRepo['create']>[0]> = {}
) {
  return repo.create({
    id,
    parentAssetId,
    derivedKind: 'extracted_text',
    mime: 'text/markdown',
    storageUri: `assets/derivatives/${parentAssetId}/${id}.md`,
    generator: 'test-dfc-converter',
    status: 'ready',
    metaJson: {
      targetKind: 'markdown',
      usage: 'preview_and_send',
      storageClass: 'draft_bound',
      sourceHash: `${parentAssetId}-sha`,
      contentHash: `${id}-content`,
      conversionSettingsHash: `${id}-settings`,
      converterName: 'test-dfc-converter',
      converterVersion: '1',
    },
    createdAt: 1_000,
    updatedAt: 1_000,
    ...overrides,
  })
}

function createVerdict(
  h: ReturnType<typeof createHarness>,
  assetId: string,
  formatId: FileFormatId,
  kind: FileKind,
  confidence: ConfidenceLevel = 'high',
  flags: FileTypeVerdict['flags'] = [],
  provenance: FileTypeVerdict['provenance'] = null
) {
  h.fileTypeVerdictRepo.upsertCurrent({
    assetId,
    verdict: {
      primary: {
        formatId,
        kind,
        confidence,
        reasonCodes: [],
        sourceCodeMeta: null,
      },
      conflicts: [],
      flags,
      evidence: [],
      provenance,
      schemaVersion: 'v1',
      taxonomyVersion: 'taxonomy-v1',
      detectionCost: 'low',
      fingerprint: `${assetId}-fp`,
    },
    primaryFormatId: formatId,
    primaryKind: kind,
    confidenceLevel: confidence,
    versionInfo: {
      schemaVersion: 'schema-v1',
      taxonomyVersion: 'taxonomy-v1',
      taxonomyMapVersion: 'taxonomy-map-v1',
      magicTableVersion: 'magic-v1',
      mergeRulesVersion: 'merge-v1',
      containerProbeVersion: 'container-v1',
      textProbeVersion: 'text-v1',
      magikaModelVersion: null,
    },
    fingerprintJson: {
      algorithmVersion: 'sha256-v1',
      size: 4,
      modifiedTime: 1,
      headHash: `${assetId}-head`,
      headBytes: 4,
      tailHash: `${assetId}-tail`,
      tailBytes: 4,
      fullHash: `${assetId}-full`,
      fullHashStatus: 'computed',
    },
    updatedAt: 2_000,
  })
}

function model(inputModalities: string[]): SendPlanModelDescriptor {
  return {
    providerKey: 'openrouter',
    modelId: 'vendor/model',
    modelKey: 'openrouter::vendor/model',
    inputModalities,
    outputModalities: ['text'],
  }
}

function providerContext(overrides: Partial<SendPlanProviderContext> = {}): SendPlanProviderContext {
  return {
    providerKey: 'openrouter',
    supportsImageUrlRef: true,
    supportsPdfInputs: true,
    supportsPdfUrlRef: true,
    supportsTextUrlRef: true,
    supportsVideoUrlRef: false,
    supportsInlineData: true,
    ...overrides,
  }
}

describeIfBetterSqlite('SendPlanService send planning', () => {
  it('treats an empty draft as idle without creating a SendPlan issue', () => {
    const h = createHarness()
    insertConvo(h.db, 'c1')

    const collected = h.sendPlanService.collectCurrentSendInputs({
      conversationId: 'c1',
      model: model(['text']),
      providerContext: providerContext(),
    })
    const plan = h.sendPlanService.buildSendPlan(collected)

    expect(plan.status).toBe('blocked')
    expect(plan.includedAttachments).toEqual([])
    expect(plan.excludedAttachments).toEqual([])
    expect(plan.attachmentPlans).toEqual([])
    expect(plan.warnings).toEqual([])
    expect(plan.blockingReasons).toEqual([])
    expect(plan.requiresModelChange).toBe(false)
    expect(plan.canProceedAfterDroppingExcluded).toBe(false)
    expect(plan.requiresUserConfirmation).toBe(false)
  })

  it('marks pure text as sendable with no attachment requirements', () => {
    const h = createHarness()
    insertConvo(h.db, 'c1')
    h.conversationAttachmentService.updateDraftText({ conversationId: 'c1', draftText: 'hello' })

    const collected = h.sendPlanService.collectCurrentSendInputs({
      conversationId: 'c1',
      model: model(['text']),
      providerContext: providerContext(),
    })
    const plan = h.sendPlanService.buildSendPlan(collected)

    expect(plan.status).toBe('sendable')
    expect(plan.includedAttachments).toEqual([])
    expect(plan.warnings).toEqual([])
    expect(plan.blockingReasons).toEqual([])
  })

  it('treats compatible current draft attachments as sendable', () => {
    const h = createHarness()
    insertConvo(h.db, 'c1')
    createAsset(h.fileAssetRepo, 'img-1', {
      filename: 'photo.png',
      extension: 'png',
      mime: 'image/png',
      assetKind: 'image',
      storageUri: 'assets/original/im/img-1.png',
    })
    createVerdict(h, 'img-1', 'png', 'image')
    h.conversationAttachmentService.addDraftAttachment({ conversationId: 'c1', assetId: 'img-1' })

    const collected = h.sendPlanService.collectCurrentSendInputs({
      conversationId: 'c1',
      model: model(['text', 'image']),
      providerContext: providerContext(),
    })
    const plan = h.sendPlanService.buildSendPlan(collected)

    expect(plan.status).toBe('sendable')
    expect(plan.includedAttachments).toEqual([
      expect.objectContaining({ assetId: 'img-1', source: 'draft' }),
    ])
    expect(plan.attachmentPlans).toEqual([
      expect.objectContaining({
        assetId: 'img-1',
        source: 'draft',
        selectedSendMode: 'inline_base64',
        eligibility: 'included',
      }),
    ])
  })

  it('plans a DFC-managed original_file from the selected raw_file ref without native_file fallback', () => {
    const h = createHarness()
    insertConvo(h.db, 'c1')
    createAsset(h.fileAssetRepo, 'pdf-raw', {
      filename: 'brief.pdf',
      extension: 'pdf',
      mime: 'application/pdf',
      assetKind: 'document',
      storageUri: 'assets/original/pd/pdf-raw.pdf',
    })
    createVerdict(h, 'pdf-raw', 'pdf', 'document')
    h.conversationAttachmentService.addDraftAttachment({
      conversationId: 'c1',
      assetId: 'pdf-raw',
      preferredSendMode: 'url_ref',
      dfcManaged: true,
      selectedOptionId: 'option-original',
      selectedAssetRefs: [{ kind: 'raw_file', assetId: 'pdf-raw' }],
    })

    const collected = h.sendPlanService.collectCurrentSendInputs({
      conversationId: 'c1',
      model: model(['text', 'file']),
      providerContext: providerContext(),
    })
    const plan = h.sendPlanService.buildSendPlan(collected)

    expect(plan.status).toBe('sendable')
    expect(plan.attachmentPlans[0]).toMatchObject({
      assetId: 'pdf-raw',
      semantic: {
        targetKind: 'original_file',
        sendStrategy: 'file_attachment',
        mappedFromLegacy: false,
      },
      sendAssetRefs: [{ kind: 'raw_file', assetId: 'pdf-raw' }],
      selectedSendMode: 'inline_base64',
      eligibility: 'included',
    })
  })

  it('preserves DFC-managed history original_file semantics without legacy remapping', () => {
    const h = createHarness()
    insertConvo(h.db, 'c1')
    createAsset(h.fileAssetRepo, 'history-pdf', {
      filename: 'history.pdf',
      extension: 'pdf',
      mime: 'application/pdf',
      assetKind: 'document',
      storageUri: 'assets/original/hi/history-pdf.pdf',
    })
    createVerdict(h, 'history-pdf', 'pdf', 'document')
    const selectedAssetRefs = [{ kind: 'raw_file' as const, assetId: 'history-pdf' }]
    const draftAttachment = h.conversationAttachmentService.addDraftAttachment({
      conversationId: 'c1',
      assetId: 'history-pdf',
    })
    const originalOption = h.conversationAttachmentService
      .getDfcDraftAttachmentOptions({ conversationId: 'c1', assetId: 'history-pdf' })
      .options.find((option) => option.targetKind === 'original_file')!
    h.conversationAttachmentService.updateDraftAttachmentSettings({
      conversationId: 'c1',
      assetId: 'history-pdf',
      dfcManaged: true,
      selectedOptionId: originalOption.optionId,
      selectedAssetRefs,
    })
    const message = h.conversationAttachmentService.commitDraftToUserMessage({
      conversationId: 'c1',
      dfcAttachmentSendSnapshots: [{
        attachmentId: draftAttachment.id,
        assetId: 'history-pdf',
        targetKind: 'original_file',
        sendStrategy: 'file_attachment',
        sendAssetRefs: selectedAssetRefs,
      }],
    }).message
    h.conversationAttachmentService.updateDraftText({ conversationId: 'c1', draftText: 'new request' })

    const plan = h.sendPlanService.buildSendPlan(h.sendPlanService.collectCurrentSendInputs({
      conversationId: 'c1',
      historyScope: { messageIds: [message.id] },
      model: model(['text', 'file']),
      providerContext: providerContext(),
    }))

    expect(plan.status).toBe('sendable')
    expect(plan.attachmentPlans).toEqual([
      expect.objectContaining({
        assetId: 'history-pdf',
        source: 'history',
        semantic: {
          targetKind: 'original_file',
          sendStrategy: 'file_attachment',
          mappedFromLegacy: false,
        },
        sendAssetRefs: selectedAssetRefs,
        selectedSendMode: 'inline_base64',
        eligibility: 'included',
      }),
    ])
  })

  it('plans a DFC-managed text target from the selected derived_asset ref', () => {
    const h = createHarness()
    insertConvo(h.db, 'c1')
    createAsset(h.fileAssetRepo, 'csv-raw', {
      filename: 'data.csv',
      extension: 'csv',
      mime: 'text/csv',
      assetKind: 'text',
      storageUri: 'assets/original/cs/csv-raw.csv',
      sourceMetaJson: {
        textConversion: {
          status: 'ready',
          targetKind: 'table_markdown',
          derivativeId: 'derived-table',
          storageUri: 'assets/derivatives/csv-raw/derived-table.md',
          mime: 'text/markdown',
        },
        lineage: {
          stale: false,
          sendAssetReady: true,
          sourceHash: 'csv-raw-sha',
          previewContentHash: 'derived-table-content',
          sendContentHash: 'derived-table-content',
          conversionSettingsHash: 'derived-table-settings',
          sendTextStorageUri: 'assets/derivatives/csv-raw/derived-table.md',
          sendTextBytes: 32,
        },
      },
    })
    createDerivative(h.fileDerivativeRepo, 'derived-table', 'csv-raw', {
      metaJson: {
        targetKind: 'table_markdown',
        usage: 'preview_and_send',
        storageClass: 'draft_bound',
        sourceHash: 'csv-raw-sha',
        contentHash: 'derived-table-content',
        conversionSettingsHash: 'derived-table-settings',
        converterName: 'test-dfc-converter',
        converterVersion: '1',
      },
    })
    createVerdict(h, 'csv-raw', 'csv', 'text')
    h.conversationAttachmentService.addDraftAttachment({
      conversationId: 'c1',
      assetId: 'csv-raw',
      dfcManaged: true,
      selectedOptionId: 'option-table',
      selectedAssetRefs: [{ kind: 'derived_asset', assetId: 'derived-table' }],
    })

    const collected = h.sendPlanService.collectCurrentSendInputs({
      conversationId: 'c1',
      model: model(['text']),
      providerContext: providerContext(),
    })
    const plan = h.sendPlanService.buildSendPlan(collected)

    expect(plan.status).toBe('sendable')
    expect(plan.attachmentPlans[0]).toMatchObject({
      assetId: 'csv-raw',
      semantic: {
        targetKind: 'table_markdown',
        sendStrategy: 'text_in_prompt',
        mappedFromLegacy: false,
      },
      sendAssetRefs: [{ kind: 'derived_asset', assetId: 'derived-table' }],
      selectedSendMode: 'inline_base64',
      eligibility: 'included',
    })
  })

  it('blocks DFC selected derived assets when Send Plan cannot verify the derivative repository', () => {
    const h = createHarness()
    insertConvo(h.db, 'c1')
    createAsset(h.fileAssetRepo, 'csv-raw', {
      filename: 'data.csv',
      extension: 'csv',
      mime: 'text/csv',
      assetKind: 'text',
      storageUri: 'assets/original/cs/csv-raw.csv',
      sourceMetaJson: {
        textConversion: {
          status: 'ready',
          targetKind: 'table_markdown',
          derivativeId: 'derived-table',
          storageUri: 'assets/derivatives/csv-raw/derived-table.md',
          mime: 'text/markdown',
          usage: 'preview_and_send',
          storageClass: 'draft_bound',
          sourceHash: 'csv-raw-sha',
          contentHash: 'derived-table-content',
          conversionSettingsHash: 'derived-table-settings',
          converterName: 'test-dfc-converter',
          converterVersion: '1',
        },
      },
    })
    createDerivative(h.fileDerivativeRepo, 'derived-table', 'csv-raw', {
      metaJson: {
        targetKind: 'table_markdown',
        usage: 'preview_and_send',
        storageClass: 'draft_bound',
        sourceHash: 'csv-raw-sha',
        contentHash: 'derived-table-content',
        conversionSettingsHash: 'derived-table-settings',
        converterName: 'test-dfc-converter',
        converterVersion: '1',
      },
    })
    createVerdict(h, 'csv-raw', 'csv', 'text')
    h.conversationAttachmentService.addDraftAttachment({
      conversationId: 'c1',
      assetId: 'csv-raw',
      dfcManaged: true,
      selectedOptionId: 'option-table',
      selectedAssetRefs: [{ kind: 'derived_asset', assetId: 'derived-table' }],
    })
    const sendPlanWithoutDerivativeRepo = new SendPlanService({
      conversationAttachmentService: h.conversationAttachmentService,
      fileAssetRepo: h.fileAssetRepo,
      fileTypeVerdictRepo: h.fileTypeVerdictRepo,
      now: () => 2_000,
      parsingTimeoutMs: 100,
    })

    const plan = sendPlanWithoutDerivativeRepo.buildSendPlan(sendPlanWithoutDerivativeRepo.collectCurrentSendInputs({
      conversationId: 'c1',
      model: model(['text']),
      providerContext: providerContext(),
    }))

    expect(plan.status).toBe('blocked')
    expect(plan.attachmentPlans[0]).toMatchObject({
      assetId: 'csv-raw',
      semantic: {
        targetKind: 'table_markdown',
        sendStrategy: 'text_in_prompt',
      },
      selectedSendMode: null,
      eligibility: 'blocked',
      exclusionReason: 'selected_option_blocked',
      lineage: {
        state: 'unknown',
        stale: false,
        staleReason: null,
        sourceHash: null,
        previewContentHash: null,
        sendContentHash: null,
        conversionSettingsHash: null,
      },
    })
    expect(JSON.stringify(plan.attachmentPlans[0])).not.toContain('derived-table-content')
    expect(JSON.stringify(plan.attachmentPlans[0])).not.toContain('csv-raw-sha')
  })

  it('uses selected DFC derived asset facade lineage instead of stale raw asset lineage metadata', () => {
    const h = createHarness()
    insertConvo(h.db, 'c1')
    createAsset(h.fileAssetRepo, 'csv-raw', {
      filename: 'data.csv',
      extension: 'csv',
      mime: 'text/csv',
      assetKind: 'text',
      storageUri: 'assets/original/cs/csv-raw.csv',
      sourceMetaJson: {
        textConversion: {
          status: 'ready',
          targetKind: 'table_markdown',
          derivativeId: 'derived-table',
          storageUri: 'assets/derivatives/csv-raw/derived-table.md',
          mime: 'text/markdown',
        },
        lineage: {
          stale: false,
          sendAssetReady: true,
          previewContentHash: 'old-preview-content',
          sendContentHash: 'old-send-content',
          sendTextStorageUri: 'assets/derivatives/csv-raw/derived-table.md',
          sendTextBytes: 32,
        },
      },
    })
    createDerivative(h.fileDerivativeRepo, 'derived-table', 'csv-raw', {
      metaJson: {
        targetKind: 'table_markdown',
        usage: 'preview_and_send',
        storageClass: 'draft_bound',
        sourceHash: 'csv-raw-sha',
        contentHash: 'derived-table-content',
        conversionSettingsHash: 'derived-table-settings',
        converterName: 'test-dfc-converter',
        converterVersion: '1',
      },
    })
    createVerdict(h, 'csv-raw', 'csv', 'text')
    h.conversationAttachmentService.addDraftAttachment({
      conversationId: 'c1',
      assetId: 'csv-raw',
      dfcManaged: true,
      selectedOptionId: 'option-table',
      selectedAssetRefs: [{ kind: 'derived_asset', assetId: 'derived-table' }],
    })

    const plan = h.sendPlanService.buildSendPlan(h.sendPlanService.collectCurrentSendInputs({
      conversationId: 'c1',
      model: model(['text']),
      providerContext: providerContext(),
    }))

    expect(plan.status).toBe('sendable')
    expect(plan.attachmentPlans[0]).toMatchObject({
      assetId: 'csv-raw',
      eligibility: 'included',
      exclusionReason: null,
      lineage: {
        state: 'ok',
        stale: false,
        staleReason: null,
        sourceHash: null,
        previewContentHash: null,
        sendContentHash: null,
        conversionSettingsHash: null,
      },
    })
    expect(JSON.stringify(plan.attachmentPlans[0])).not.toContain('derived-table-content')
    expect(JSON.stringify(plan.attachmentPlans[0])).not.toContain('csv-raw-sha')
  })

  it('blocks preview-only or malformed DFC selected derived assets without legacy fallback', () => {
    const cases = [
      {
        assetId: 'dfc-preview-only',
        derivativeId: 'derived-preview-only',
        metaJson: {
          targetKind: 'markdown',
          usage: 'preview_only',
          storageClass: 'draft_bound',
          sourceHash: 'dfc-preview-only-sha',
          contentHash: 'derived-preview-only-content',
          conversionSettingsHash: 'derived-preview-only-settings',
          converterName: 'test-dfc-converter',
          converterVersion: '1',
        },
        reason: 'preview_only_asset_not_sendable',
        lineageState: 'preview_only_asset_not_sendable',
      },
      {
        assetId: 'dfc-missing-lineage',
        derivativeId: 'derived-missing-lineage',
        metaJson: {
          targetKind: 'markdown',
          usage: 'preview_and_send',
          storageClass: 'draft_bound',
          contentHash: 'derived-missing-lineage-content',
          conversionSettingsHash: 'derived-missing-lineage-settings',
          converterName: 'test-dfc-converter',
          converterVersion: '1',
        },
        reason: 'send_asset_not_ready',
        lineageState: 'send_asset_not_ready',
      },
    ]

    for (const testCase of cases) {
      const h = createHarness()
      insertConvo(h.db, 'c1')
      createAsset(h.fileAssetRepo, testCase.assetId, {
        filename: `${testCase.assetId}.txt`,
        extension: 'txt',
        mime: 'text/plain',
        assetKind: 'text',
        storageUri: `assets/original/df/${testCase.assetId}.txt`,
        sourceMetaJson: {
          textConversion: {
            status: 'ready',
            targetKind: 'markdown',
            derivativeId: testCase.derivativeId,
            storageUri: `assets/derivatives/${testCase.assetId}/${testCase.derivativeId}.md`,
            mime: 'text/markdown',
          },
          lineage: {
            stale: false,
            sendAssetReady: true,
            sourceHash: `${testCase.assetId}-sha`,
            previewContentHash: `${testCase.derivativeId}-content`,
            sendContentHash: `${testCase.derivativeId}-content`,
            conversionSettingsHash: `${testCase.derivativeId}-settings`,
            sendTextStorageUri: `assets/derivatives/${testCase.assetId}/${testCase.derivativeId}.md`,
            sendTextBytes: 32,
          },
        },
      })
      createDerivative(h.fileDerivativeRepo, testCase.derivativeId, testCase.assetId, {
        metaJson: testCase.metaJson,
      })
      createVerdict(h, testCase.assetId, 'markdown', 'text')
      h.conversationAttachmentService.addDraftAttachment({
        conversationId: 'c1',
        assetId: testCase.assetId,
        dfcManaged: true,
        selectedOptionId: `option-${testCase.assetId}`,
        selectedAssetRefs: [{ kind: 'derived_asset', assetId: testCase.derivativeId }],
      })

      const plan = h.sendPlanService.buildSendPlan(h.sendPlanService.collectCurrentSendInputs({
        conversationId: 'c1',
        model: model(['text']),
        providerContext: providerContext(),
      }))

      expect(plan.status).toBe('blocked')
      expect(plan.attachmentPlans[0]).toMatchObject({
        assetId: testCase.assetId,
        selectedSendMode: null,
        eligibility: 'blocked',
        exclusionReason: testCase.reason,
        lineage: expect.objectContaining({
          state: testCase.lineageState,
          sourceHash: null,
          previewContentHash: null,
          sendContentHash: null,
          conversionSettingsHash: null,
        }),
      })
      expect(JSON.stringify(plan.attachmentPlans[0])).not.toContain(`${testCase.derivativeId}-content`)
      expect(JSON.stringify(plan.attachmentPlans[0])).not.toContain(`${testCase.assetId}-sha`)
    }
  })

  it('blocks DFC-managed attachments without falling back to legacy routes when the selected option is missing', () => {
    const h = createHarness()
    insertConvo(h.db, 'c1')
    createAsset(h.fileAssetRepo, 'pdf-missing-option', {
      filename: 'missing.pdf',
      extension: 'pdf',
      mime: 'application/pdf',
      assetKind: 'document',
      storageUri: 'assets/original/pd/pdf-missing-option.pdf',
      sourceMetaJson: {
        lineage: {
          sourceHash: 'pdf-missing-option-sha',
          previewContentHash: 'pdf-missing-option-preview',
          sendContentHash: 'pdf-missing-option-send',
          conversionSettingsHash: 'pdf-missing-option-settings',
        },
      },
    })
    createVerdict(h, 'pdf-missing-option', 'pdf', 'document')
    h.conversationAttachmentService.addDraftAttachment({
      conversationId: 'c1',
      assetId: 'pdf-missing-option',
      dfcManaged: true,
      selectedOptionId: null,
      selectedAssetRefs: [{ kind: 'raw_file', assetId: 'pdf-missing-option' }],
    })

    const plan = h.sendPlanService.buildSendPlan(h.sendPlanService.collectCurrentSendInputs({
      conversationId: 'c1',
      model: model(['text', 'file']),
      providerContext: providerContext(),
    }))

    expect(plan.status).toBe('blocked')
    expect(plan.attachmentPlans[0]).toMatchObject({
      assetId: 'pdf-missing-option',
      semantic: {
        targetKind: 'unsupported',
        sendStrategy: 'unsupported',
      },
      selectedSendMode: null,
      eligibility: 'blocked',
      exclusionReason: 'selected_option_missing',
      lineage: {
        state: 'unknown',
        stale: false,
        staleReason: null,
        sourceHash: null,
        previewContentHash: null,
        sendContentHash: null,
        conversionSettingsHash: null,
      },
    })
    expect(JSON.stringify(plan.attachmentPlans[0])).not.toContain('pdf-missing-option-sha')
    expect(JSON.stringify(plan.attachmentPlans[0])).not.toContain('pdf-missing-option-preview')
  })

  it('blocks a DFC selected original_file when the selected raw_file ref does not match the raw asset', () => {
    const h = createHarness()
    insertConvo(h.db, 'c1')
    createAsset(h.fileAssetRepo, 'pdf-raw-mismatch', {
      filename: 'mismatch.pdf',
      extension: 'pdf',
      mime: 'application/pdf',
      assetKind: 'document',
      storageUri: 'assets/original/pd/pdf-raw-mismatch.pdf',
    })
    createVerdict(h, 'pdf-raw-mismatch', 'pdf', 'document')
    h.conversationAttachmentService.addDraftAttachment({
      conversationId: 'c1',
      assetId: 'pdf-raw-mismatch',
      dfcManaged: true,
      selectedOptionId: 'option-original',
      selectedAssetRefs: [{ kind: 'raw_file', assetId: 'other-raw' }],
    })

    const plan = h.sendPlanService.buildSendPlan(h.sendPlanService.collectCurrentSendInputs({
      conversationId: 'c1',
      model: model(['text', 'file']),
      providerContext: providerContext(),
    }))

    expect(plan.status).toBe('blocked')
    expect(plan.attachmentPlans[0]).toMatchObject({
      assetId: 'pdf-raw-mismatch',
      semantic: {
        targetKind: 'original_file',
        sendStrategy: 'file_attachment',
      },
      selectedSendMode: null,
      eligibility: 'blocked',
      exclusionReason: 'raw_file_ref_missing',
    })
  })

  it('blocks failed, stale, and unverifiable DFC selected derived assets without legacy fallback', () => {
    const cases: Array<{
      assetId: string
      derivativeId: string
      status: 'failed' | 'deleted' | 'ready'
      reason: string
      sourceHash?: string
      rawSha256?: string | null
    }> = [
      { assetId: 'dfc-failed', derivativeId: 'derived-failed', status: 'failed', reason: 'selected_option_failed' },
      { assetId: 'dfc-stale', derivativeId: 'derived-stale', status: 'deleted', reason: 'selected_option_stale' },
      { assetId: 'dfc-source-mismatch', derivativeId: 'derived-source-mismatch', status: 'ready', reason: 'selected_option_stale', sourceHash: 'old-source-sha' },
      { assetId: 'dfc-source-unverifiable', derivativeId: 'derived-source-unverifiable', status: 'ready', reason: 'selected_option_blocked', rawSha256: null },
    ]

    for (const testCase of cases) {
      const h = createHarness()
      insertConvo(h.db, 'c1')
      createAsset(h.fileAssetRepo, testCase.assetId, {
        sha256: testCase.rawSha256 === undefined ? `${testCase.assetId}-sha` : testCase.rawSha256,
        filename: `${testCase.assetId}.txt`,
        extension: 'txt',
        mime: 'text/plain',
        assetKind: 'text',
        storageUri: `assets/original/df/${testCase.assetId}.txt`,
        sourceMetaJson: {
          lineage: {
            sourceHash: `${testCase.assetId}-sha`,
            previewContentHash: `${testCase.derivativeId}-content`,
            sendContentHash: `${testCase.derivativeId}-content`,
            conversionSettingsHash: `${testCase.derivativeId}-settings`,
          },
        },
      })
      createDerivative(h.fileDerivativeRepo, testCase.derivativeId, testCase.assetId, {
        status: testCase.status,
        metaJson: {
          targetKind: 'plain_text',
          usage: 'preview_and_send',
          storageClass: 'draft_bound',
          sourceHash: testCase.sourceHash ?? `${testCase.assetId}-sha`,
          contentHash: `${testCase.derivativeId}-content`,
          conversionSettingsHash: `${testCase.derivativeId}-settings`,
          converterName: 'test-dfc-converter',
          converterVersion: '1',
        },
      })
      createVerdict(h, testCase.assetId, 'plain_text', 'text')
      h.conversationAttachmentService.addDraftAttachment({
        conversationId: 'c1',
        assetId: testCase.assetId,
        dfcManaged: true,
        selectedOptionId: `option-${testCase.assetId}`,
        selectedAssetRefs: [{ kind: 'derived_asset', assetId: testCase.derivativeId }],
      })

      const plan = h.sendPlanService.buildSendPlan(h.sendPlanService.collectCurrentSendInputs({
        conversationId: 'c1',
        model: model(['text']),
        providerContext: providerContext(),
      }))

      expect(plan.status).toBe('blocked')
      expect(plan.attachmentPlans[0]).toMatchObject({
        assetId: testCase.assetId,
        semantic: {
          targetKind: 'plain_text',
          sendStrategy: 'text_in_prompt',
        },
        selectedSendMode: null,
        eligibility: 'blocked',
        exclusionReason: testCase.reason,
        lineage: {
          state: 'unknown',
          stale: false,
          staleReason: null,
          sourceHash: null,
          previewContentHash: null,
          sendContentHash: null,
          conversionSettingsHash: null,
        },
      })
      expect(JSON.stringify(plan.attachmentPlans[0])).not.toContain(`${testCase.derivativeId}-content`)
      expect(JSON.stringify(plan.attachmentPlans[0])).not.toContain(`${testCase.assetId}-sha`)
    }
  })

  it('honors draft attachment send mode preference when ordering available modes', () => {
    const h = createHarness()
    insertConvo(h.db, 'c1')
    createAsset(h.fileAssetRepo, 'text-url', {
      filename: 'link.txt',
      extension: 'txt',
      mime: 'text/plain',
      assetKind: 'text',
      storageUri: 'assets/original/te/text-url.txt',
      sourceMetaJson: {
        originalUrl: 'https://example.test/link.txt',
        resolvedUrl: 'https://example.test/link.txt',
        retentionMode: 'link_only',
        probeStatus: 'accessible',
        materializationStatus: 'not_requested',
      },
    })
    createVerdict(h, 'text-url', 'plain_text', 'text')
    h.conversationAttachmentService.addDraftAttachment({
      conversationId: 'c1',
      assetId: 'text-url',
      preferredSendMode: 'url_ref',
    })

    const collected = h.sendPlanService.collectCurrentSendInputs({
      conversationId: 'c1',
      model: model(['text']),
      providerContext: providerContext({
        preferredDraftSendModes: ['inline_base64', 'url_ref'],
      }),
    })
    const plan = h.sendPlanService.buildSendPlan(collected)

    expect(plan.status).toBe('sendable')
    expect(plan.attachmentPlans[0]).toEqual(expect.objectContaining({
      assetId: 'text-url',
      selectedSendMode: 'url_ref',
      fallbackSendModes: ['inline_base64'],
    }))
  })

  it('does not treat preview failure as a send blocker for image assets', () => {
    const h = createHarness()
    insertConvo(h.db, 'c1')
    createAsset(h.fileAssetRepo, 'img-preview-failed', {
      filename: 'photo.png',
      extension: 'png',
      mime: 'image/png',
      assetKind: 'image',
      previewStatus: 'failed',
      storageUri: 'assets/original/im/img-preview-failed.png',
    })
    createVerdict(h, 'img-preview-failed', 'png', 'image')
    h.conversationAttachmentService.addDraftAttachment({ conversationId: 'c1', assetId: 'img-preview-failed' })

    const collected = h.sendPlanService.collectCurrentSendInputs({
      conversationId: 'c1',
      model: model(['text', 'image']),
      providerContext: providerContext(),
    })
    const plan = h.sendPlanService.buildSendPlan(collected)

    expect(plan.status).toBe('sendable')
    expect(plan.attachmentPlans).toEqual([
      expect.objectContaining({
        assetId: 'img-preview-failed',
        source: 'draft',
        selectedSendMode: 'inline_base64',
        exclusionReason: null,
      }),
    ])
  })

  it('downgrades to sendable_with_warnings when current draft is valid but history attachments are excluded', () => {
    const h = createHarness()
    insertConvo(h.db, 'c1')
    h.conversationAttachmentService.updateDraftText({ conversationId: 'c1', draftText: 'ask' })
    createAsset(h.fileAssetRepo, 'audio-1', {
      filename: 'clip.mp3',
      extension: 'mp3',
      mime: 'audio/mpeg',
      assetKind: 'audio',
      storageUri: 'assets/original/au/audio-1.mp3',
    })
    createVerdict(h, 'audio-1', 'mp3', 'audio')
    h.conversationAttachmentService.addDraftAttachment({ conversationId: 'c1', assetId: 'audio-1' })
    const userMessage = h.conversationAttachmentService.commitDraftToUserMessage({ conversationId: 'c1' }).message

    h.conversationAttachmentService.updateDraftText({ conversationId: 'c1', draftText: 'new ask' })
    const collected = h.sendPlanService.collectCurrentSendInputs({
      conversationId: 'c1',
      historyScope: { messageIds: [userMessage.id] },
      model: model(['text']),
      providerContext: providerContext(),
    })
    const plan = h.sendPlanService.buildSendPlan(collected)

    expect(plan.status).toBe('sendable_with_warnings')
    expect(plan.excludedAttachments).toEqual([
      expect.objectContaining({
        assetId: 'audio-1',
        source: 'history',
        exclusionReason: 'incompatible_with_current_model',
      }),
    ])
    expect(plan.warnings).toEqual([
      expect.objectContaining({
        code: 'history_attachment_excluded',
        assetId: 'audio-1',
      }),
    ])
  })

  it('keeps URL assets sendable_with_warnings when probing failed but the URL is still retained', () => {
    const h = createHarness()
    insertConvo(h.db, 'c1')
    createAsset(h.fileAssetRepo, 'url-img', {
      sha256: null,
      filename: 'remote.png',
      extension: 'png',
      mime: 'image/png',
      assetKind: 'image',
      sourceKind: 'url_import',
      storageBackend: 'remote_url',
      storageUri: 'https://example.test/remote.png',
      ingestStatus: 'probe_failed',
      sourceMetaJson: {
        originalUrl: 'https://example.test/original.png',
        resolvedUrl: 'https://example.test/remote.png',
        retentionMode: 'link_only',
        probeStatus: 'probe_failed',
        materializationStatus: 'not_requested',
      },
    })
    createVerdict(h, 'url-img', 'png', 'image')
    h.conversationAttachmentService.addDraftAttachment({ conversationId: 'c1', assetId: 'url-img' })

    const collected = h.sendPlanService.collectCurrentSendInputs({
      conversationId: 'c1',
      model: model(['text', 'image']),
      providerContext: providerContext(),
    })
    const plan = h.sendPlanService.buildSendPlan(collected)

    expect(plan.status).toBe('sendable_with_warnings')
    expect(plan.attachmentPlans).toEqual([
      expect.objectContaining({
        assetId: 'url-img',
        selectedSendMode: 'url_ref',
        displayStatus: 'ready_with_warnings',
      }),
    ])
  })

  it('keeps URL assets sendable_with_warnings when local copy materialization failed but the URL remains retained', () => {
    const h = createHarness()
    insertConvo(h.db, 'c1')
    createAsset(h.fileAssetRepo, 'url-pdf', {
      sha256: null,
      filename: 'remote.pdf',
      extension: 'pdf',
      mime: 'application/pdf',
      assetKind: 'document',
      sourceKind: 'url_import',
      storageBackend: 'remote_url',
      storageUri: 'https://example.test/remote.pdf',
      ingestStatus: 'materialization_failed',
      sourceMetaJson: {
        originalUrl: 'https://example.test/original.pdf',
        resolvedUrl: 'https://example.test/remote.pdf',
        retentionMode: 'link_and_file',
        probeStatus: 'accessible',
        materializationStatus: 'materialization_failed',
      },
    })
    createVerdict(h, 'url-pdf', 'pdf', 'document')
    h.conversationAttachmentService.addDraftAttachment({ conversationId: 'c1', assetId: 'url-pdf' })

    const collected = h.sendPlanService.collectCurrentSendInputs({
      conversationId: 'c1',
      model: model(['text', 'file']),
      providerContext: providerContext(),
    })
    const plan = h.sendPlanService.buildSendPlan(collected)

    expect(plan.status).toBe('sendable_with_warnings')
    expect(plan.attachmentPlans[0]).toMatchObject({
      assetId: 'url-pdf',
      selectedSendMode: 'url_ref',
      displayStatus: 'ready_with_warnings',
    })
  })

  it('returns partially_sendable when non-core current draft attachments can be dropped while text remains valid', () => {
    const h = createHarness()
    insertConvo(h.db, 'c1')
    createAsset(h.fileAssetRepo, 'img-1', {
      filename: 'photo.png',
      extension: 'png',
      mime: 'image/png',
      assetKind: 'image',
      storageUri: 'assets/original/im/img-1.png',
    })
    createVerdict(h, 'img-1', 'png', 'image')
    h.conversationAttachmentService.updateDraftText({ conversationId: 'c1', draftText: 'keep the text' })
    h.conversationAttachmentService.addDraftAttachment({ conversationId: 'c1', assetId: 'img-1' })

    const collected = h.sendPlanService.collectCurrentSendInputs({
      conversationId: 'c1',
      model: model(['text']),
      providerContext: providerContext(),
    })
    const plan = h.sendPlanService.buildSendPlan(collected)

    expect(plan.status).toBe('partially_sendable')
    expect(plan.canProceedAfterDroppingExcluded).toBe(true)
    expect(plan.excludedAttachments).toEqual([
      expect.objectContaining({
        assetId: 'img-1',
        source: 'draft',
        exclusionReason: 'incompatible_with_current_model',
      }),
    ])
  })

  it('returns blocked when the only current draft input is incompatible with the selected model', () => {
    const h = createHarness()
    insertConvo(h.db, 'c1')
    createAsset(h.fileAssetRepo, 'img-1', {
      filename: 'photo.png',
      extension: 'png',
      mime: 'image/png',
      assetKind: 'image',
      storageUri: 'assets/original/im/img-1.png',
    })
    createVerdict(h, 'img-1', 'png', 'image')
    h.conversationAttachmentService.addDraftAttachment({ conversationId: 'c1', assetId: 'img-1' })

    const collected = h.sendPlanService.collectCurrentSendInputs({
      conversationId: 'c1',
      model: model(['text']),
      providerContext: providerContext(),
    })
    const plan = h.sendPlanService.buildSendPlan(collected)

    expect(plan.status).toBe('blocked')
    expect(plan.requiresModelChange).toBe(true)
    expect(plan.blockingReasons).toEqual([
      expect.objectContaining({ code: 'current_draft_incompatible_with_current_model' }),
    ])
  })

  it('blocks sending while a non-terminal parsing attachment is still pending', () => {
    const h = createHarness()
    insertConvo(h.db, 'c1')
    createAsset(h.fileAssetRepo, 'pending-1', {
      filename: 'photo.png',
      extension: 'png',
      mime: 'image/png',
      assetKind: 'image',
      ingestStatus: 'pending',
      updatedAt: 1_980,
      storageUri: 'assets/original/pe/pending-1.png',
    })
    h.conversationAttachmentService.addDraftAttachment({ conversationId: 'c1', assetId: 'pending-1' })

    const collected = h.sendPlanService.collectCurrentSendInputs({
      conversationId: 'c1',
      model: model(['text', 'image']),
      providerContext: providerContext(),
    })
    const gate = h.sendPlanService.evaluateAttachmentParsingGate(collected)
    const plan = h.sendPlanService.buildSendPlan(collected)

    expect(gate.blocked).toBe(true)
    expect(gate.pendingAttachments.map((item) => item.assetId)).toEqual(['pending-1'])
    expect(plan.status).toBe('blocked')
    expect(plan.blockingReasons).toEqual([
      expect.objectContaining({ code: 'attachment_parsing_incomplete', assetId: 'pending-1' }),
      expect.objectContaining({ code: 'draft_attachment_blocked', assetId: 'pending-1' }),
    ])
  })

  it('treats stale parsing as a terminal failure and avoids permanent blocked state', () => {
    const h = createHarness()
    insertConvo(h.db, 'c1')
    createAsset(h.fileAssetRepo, 'stale-1', {
      filename: 'voice.mp3',
      extension: 'mp3',
      mime: 'audio/mpeg',
      assetKind: 'audio',
      ingestStatus: 'pending',
      updatedAt: 1_000,
      storageUri: 'assets/original/st/stale-1.mp3',
    })
    createVerdict(h, 'stale-1', 'mp3', 'audio')
    h.conversationAttachmentService.updateDraftText({ conversationId: 'c1', draftText: 'text remains sendable' })
    h.conversationAttachmentService.addDraftAttachment({ conversationId: 'c1', assetId: 'stale-1' })

    const collected = h.sendPlanService.collectCurrentSendInputs({
      conversationId: 'c1',
      model: model(['text']),
      providerContext: providerContext(),
    })
    const gate = h.sendPlanService.evaluateAttachmentParsingGate(collected)
    const plan = h.sendPlanService.buildSendPlan(collected)

    expect(gate.blocked).toBe(false)
    expect(gate.timedOutAttachments.map((item) => item.assetId)).toEqual(['stale-1'])
    expect(plan.status).toBe('partially_sendable')
    expect(plan.canProceedAfterDroppingExcluded).toBe(true)
  })

  it('recomputes eligibility after attachment resolution and after model changes', () => {
    const h = createHarness()
    insertConvo(h.db, 'c1')
    createAsset(h.fileAssetRepo, 'img-1', {
      filename: 'photo.png',
      extension: 'png',
      mime: 'image/png',
      assetKind: 'image',
      ingestStatus: 'pending',
      updatedAt: 1_980,
      storageUri: 'assets/original/im/img-1.png',
    })
    createVerdict(h, 'img-1', 'png', 'image')
    h.conversationAttachmentService.addDraftAttachment({ conversationId: 'c1', assetId: 'img-1' })

    const blocked = h.sendPlanService.recomputeEligibilityOnAttachmentResolved({
      conversationId: 'c1',
      model: model(['text', 'image']),
      providerContext: providerContext(),
    })
    expect(blocked.status).toBe('blocked')

    h.db.prepare(`
      UPDATE file_assets
      SET ingest_status = 'stored', updated_at = 2000
      WHERE id = 'img-1'
    `).run()

    const resolved = h.sendPlanService.recomputeEligibilityOnAttachmentResolved({
      conversationId: 'c1',
      model: model(['text', 'image']),
      providerContext: providerContext(),
    })
    expect(resolved.status).toBe('sendable')

    const modelChanged = h.sendPlanService.recomputeEligibilityOnModelChanged({
      conversationId: 'c1',
      model: model(['text']),
      providerContext: providerContext(),
    })
    expect(modelChanged.status).toBe('blocked')
  })

  it('prioritizes current draft attachments over history and dedupes the same asset to draft ownership', () => {
    const h = createHarness()
    insertConvo(h.db, 'c1')
    createAsset(h.fileAssetRepo, 'shared-1', {
      filename: 'photo.png',
      extension: 'png',
      mime: 'image/png',
      assetKind: 'image',
      storageUri: 'assets/original/sh/shared-1.png',
    })
    createVerdict(h, 'shared-1', 'png', 'image')
    h.conversationAttachmentService.addDraftAttachment({ conversationId: 'c1', assetId: 'shared-1' })
    const firstMessage = h.conversationAttachmentService.commitDraftToUserMessage({ conversationId: 'c1' }).message
    h.conversationAttachmentService.addDraftAttachment({ conversationId: 'c1', assetId: 'shared-1' })

    const collected = h.sendPlanService.collectCurrentSendInputs({
      conversationId: 'c1',
      historyScope: { messageIds: [firstMessage.id] },
      model: model(['text', 'image']),
      providerContext: providerContext(),
    })
    const plan = h.sendPlanService.buildSendPlan(collected)

    expect(plan.includedAttachments).toEqual([
      expect.objectContaining({ assetId: 'shared-1', source: 'draft' }),
    ])
    expect(plan.excludedAttachments).toEqual([
      expect.objectContaining({
        assetId: 'shared-1',
        source: 'history',
        exclusionReason: 'deduped_to_current_draft',
      }),
    ])
  })

  it('selects send modes conservatively across image, pdf, audio, and video inputs', () => {
    const h = createHarness()
    insertConvo(h.db, 'c1')
    createAsset(h.fileAssetRepo, 'img-url', {
      sha256: 'img',
      filename: 'remote.png',
      extension: 'png',
      mime: 'image/png',
      assetKind: 'image',
      sourceKind: 'url_import',
      storageBackend: 'local_fs',
      storageUri: 'assets/original/im/img-url.png',
      sourceMetaJson: {
        originalUrl: 'https://example.test/photo.png',
        resolvedUrl: 'https://cdn.example.test/photo.png',
        retentionMode: 'link_and_file',
        probeStatus: 'accessible',
        materializationStatus: 'stored',
      },
    })
    createVerdict(h, 'img-url', 'png', 'image')
    createAsset(h.fileAssetRepo, 'pdf-url', {
      sha256: 'pdf',
      filename: 'remote.pdf',
      extension: 'pdf',
      mime: 'application/pdf',
      assetKind: 'document',
      sourceKind: 'url_import',
      storageBackend: 'local_fs',
      storageUri: 'assets/original/pd/pdf-url.pdf',
      sourceMetaJson: {
        originalUrl: 'https://example.test/file.pdf',
        resolvedUrl: 'https://cdn.example.test/file.pdf',
        retentionMode: 'link_and_file',
        probeStatus: 'accessible',
        materializationStatus: 'stored',
      },
    })
    createVerdict(h, 'pdf-url', 'pdf', 'document')
    createAsset(h.fileAssetRepo, 'audio-local', {
      filename: 'voice.mp3',
      extension: 'mp3',
      mime: 'audio/mpeg',
      assetKind: 'audio',
      storageUri: 'assets/original/au/audio-local.mp3',
    })
    createVerdict(h, 'audio-local', 'mp3', 'audio')
    createAsset(h.fileAssetRepo, 'video-url', {
      filename: 'clip.mp4',
      extension: 'mp4',
      mime: 'video/mp4',
      assetKind: 'video',
      storageUri: 'assets/original/vi/video-url.mp4',
      sourceMetaJson: {
        originalUrl: 'https://example.test/clip.mp4',
        resolvedUrl: 'https://example.test/clip.mp4',
      },
    })
    createVerdict(h, 'video-url', 'mp4', 'video')

    h.conversationAttachmentService.addDraftAttachment({ conversationId: 'c1', assetId: 'img-url' })
    h.conversationAttachmentService.addDraftAttachment({ conversationId: 'c1', assetId: 'pdf-url' })
    h.conversationAttachmentService.addDraftAttachment({ conversationId: 'c1', assetId: 'audio-local' })
    h.conversationAttachmentService.addDraftAttachment({ conversationId: 'c1', assetId: 'video-url' })

    const collected = h.sendPlanService.collectCurrentSendInputs({
      conversationId: 'c1',
      model: model(['text', 'image', 'audio', 'video', 'file']),
      providerContext: providerContext(),
    })
    const selections = collected.draftAttachments.map((attachment) =>
      h.sendPlanService.selectAttachmentSendMode(attachment, collected.model, collected.providerContext)
    )

    expect(selections).toEqual([
      expect.objectContaining({
        assetId: 'img-url',
        selectedSendMode: 'url_ref',
        fallbackSendModes: ['inline_base64'],
      }),
      expect.objectContaining({
        assetId: 'pdf-url',
        selectedSendMode: 'url_ref',
        fallbackSendModes: ['inline_base64'],
      }),
      expect.objectContaining({
        assetId: 'audio-local',
        selectedSendMode: 'inline_base64',
        fallbackSendModes: [],
      }),
      expect.objectContaining({
        assetId: 'video-url',
        selectedSendMode: 'inline_base64',
        fallbackSendModes: [],
      }),
    ])
  })

  it('honors provider PDF support and keeps Send Plan fields internally consistent', () => {
    const h = createHarness()
    insertConvo(h.db, 'c1')
    createAsset(h.fileAssetRepo, 'pdf-url', {
      sha256: 'pdf',
      filename: 'remote.pdf',
      extension: 'pdf',
      mime: 'application/pdf',
      assetKind: 'document',
      sourceKind: 'url_import',
      storageBackend: 'remote_url',
      storageUri: 'https://cdn.example.test/file.pdf',
      sourceMetaJson: {
        originalUrl: 'https://example.test/file.pdf',
        resolvedUrl: 'https://cdn.example.test/file.pdf',
        retentionMode: 'link_only',
        probeStatus: 'accessible',
        materializationStatus: 'not_requested',
      },
    })
    createVerdict(h, 'pdf-url', 'pdf', 'document')
    h.conversationAttachmentService.updateDraftText({ conversationId: 'c1', draftText: 'pdf context still exists' })
    h.conversationAttachmentService.addDraftAttachment({ conversationId: 'c1', assetId: 'pdf-url' })

    const collected = h.sendPlanService.collectCurrentSendInputs({
      conversationId: 'c1',
      model: model(['text', 'file']),
      providerContext: providerContext({ supportsPdfInputs: false }),
    })
    const plan = h.sendPlanService.buildSendPlan(collected)

    expect(plan.status).toBe('partially_sendable')
    expect(plan.plannerVersion).toBe('phase-5/v1')
    expect(plan.excludedAttachments).toEqual([
      expect.objectContaining({
        assetId: 'pdf-url',
        source: 'draft',
        exclusionReason: 'pdf_not_supported_by_provider',
      }),
    ])
    expect(plan.attachmentPlans[0]).toMatchObject({
      assetId: 'pdf-url',
      displayStatus: 'incompatible_with_current_model',
      selectedSendMode: null,
    })
    expect(plan.includedAttachments).toEqual([])
    expect(plan.warnings).toEqual([])
    expect(plan.blockingReasons).toEqual([])
  })

  it('blocks attachments without verdict instead of deriving routes from extension or MIME', () => {
    const h = createHarness()
    insertConvo(h.db, 'c1')
    createAsset(h.fileAssetRepo, 'text-1', {
      filename: 'notes.txt',
      extension: 'txt',
      mime: 'text/plain',
      assetKind: 'text',
      storageUri: 'assets/original/te/text-1.txt',
    })
    createAsset(h.fileAssetRepo, 'pdf-1', {
      filename: 'manual.pdf',
      extension: 'pdf',
      mime: 'application/pdf',
      assetKind: 'document',
      storageUri: 'assets/original/pd/pdf-1.pdf',
    })
    h.conversationAttachmentService.addDraftAttachment({ conversationId: 'c1', assetId: 'text-1' })
    h.conversationAttachmentService.addDraftAttachment({ conversationId: 'c1', assetId: 'pdf-1' })

    const collected = h.sendPlanService.collectCurrentSendInputs({
      conversationId: 'c1',
      model: model(['text', 'file']),
      providerContext: providerContext(),
    })
    const plan = h.sendPlanService.buildSendPlan(collected)

    expect(plan.status).toBe('blocked')
    expect(plan.attachmentPlans).toEqual([
      expect.objectContaining({
        assetId: 'text-1',
        displayStatus: 'detection_required',
        exclusionReason: 'file_type_detection_required',
        semantic: {
          targetKind: 'unsupported',
          sendStrategy: 'unsupported',
          mappedFromLegacy: false,
        },
      }),
      expect.objectContaining({
        assetId: 'pdf-1',
        displayStatus: 'detection_required',
        exclusionReason: 'file_type_detection_required',
        semantic: {
          targetKind: 'unsupported',
          sendStrategy: 'unsupported',
          mappedFromLegacy: false,
        },
      }),
    ])
    expect(plan.includedAttachments).toEqual([])
    expect(plan.blockingReasons).toEqual(expect.arrayContaining([
      expect.objectContaining({ code: 'draft_attachment_blocked', assetId: 'text-1' }),
      expect.objectContaining({ code: 'draft_attachment_blocked', assetId: 'pdf-1' }),
    ]))
  })

  it('keeps convertible attachments blocked until verdict-based routing is available', () => {
    const h = createHarness()
    insertConvo(h.db, 'c1')
    createAsset(h.fileAssetRepo, 'docx-1', {
      filename: 'draft.docx',
      extension: 'docx',
      mime: 'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
      assetKind: 'document',
      storageUri: 'assets/original/do/docx-1.docx',
    })
    h.conversationAttachmentService.addDraftAttachment({ conversationId: 'c1', assetId: 'docx-1' })
    h.db.prepare(`
      UPDATE draft_attachments
      SET processing_status = 'convertible', ai_payload_kind = 'pdf'
      WHERE asset_id = 'docx-1'
    `).run()

    const collected = h.sendPlanService.collectCurrentSendInputs({
      conversationId: 'c1',
      model: model(['text', 'file']),
      providerContext: providerContext(),
    })
    const plan = h.sendPlanService.buildSendPlan(collected)
    const draftDocPlan = plan.attachmentPlans.find((item) => item.assetId === 'docx-1')

    expect(draftDocPlan).toMatchObject({
      displayStatus: 'detection_required',
      exclusionReason: 'file_type_detection_required',
      selectedSendMode: null,
      semantic: {
        targetKind: 'unsupported',
        sendStrategy: 'unsupported',
        mappedFromLegacy: false,
      },
    })
    expect(plan.status).toBe('blocked')
    expect(plan.blockingReasons).toEqual(expect.arrayContaining([
      expect.objectContaining({ code: 'draft_attachment_blocked', assetId: 'docx-1' }),
    ]))
  })

  it('blocks preview-only or stale lineage assets in send plan preflight', () => {
    const h = createHarness()
    insertConvo(h.db, 'c1')
    createAsset(h.fileAssetRepo, 'preview-only-1', {
      filename: 'preview-only.png',
      extension: 'png',
      mime: 'image/png',
      assetKind: 'image',
      sourceKind: 'derived',
      storageUri: 'assets/derived/pr/preview-only-1.png',
      sourceMetaJson: {
        previewOnly: true,
      },
    })
    createAsset(h.fileAssetRepo, 'stale-1', {
      filename: 'stale.txt',
      extension: 'txt',
      mime: 'text/plain',
      assetKind: 'text',
      sourceMetaJson: {
        stale: true,
        staleReason: 'source_changed',
      },
    })
    h.conversationAttachmentService.addDraftAttachment({ conversationId: 'c1', assetId: 'preview-only-1' })
    h.conversationAttachmentService.addDraftAttachment({ conversationId: 'c1', assetId: 'stale-1' })
    h.conversationAttachmentService.updateDraftText({ conversationId: 'c1', draftText: 'lineage gate check' })

    const collected = h.sendPlanService.collectCurrentSendInputs({
      conversationId: 'c1',
      model: model(['text', 'image', 'file']),
      providerContext: providerContext(),
    })
    const plan = h.sendPlanService.buildSendPlan(collected)

    expect(plan.status).toBe('blocked')
    expect(plan.attachmentPlans).toEqual([
      expect.objectContaining({
        assetId: 'preview-only-1',
        eligibility: 'blocked',
        exclusionReason: 'preview_only_asset_not_sendable',
      }),
      expect.objectContaining({
        assetId: 'stale-1',
        eligibility: 'blocked',
        exclusionReason: 'stale_derived_asset',
      }),
    ])
  })

  it('derives semantic from sendRouteMapping candidates when verdict is available', () => {
    const h = createHarness()
    insertConvo(h.db, 'c1')
    createAsset(h.fileAssetRepo, 'docx-v', {
      filename: 'draft.docx',
      extension: 'docx',
      mime: 'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
      assetKind: 'document',
      storageUri: 'assets/original/do/docx-v.docx',
    })
    createVerdict(h, 'docx-v', 'docx', 'document')
    h.conversationAttachmentService.addDraftAttachment({ conversationId: 'c1', assetId: 'docx-v' })
    h.db.prepare(`
      UPDATE draft_attachments
      SET ai_payload_kind = 'text',
          processing_status = 'native_supported'
      WHERE asset_id = 'docx-v'
    `).run()

    const collected = h.sendPlanService.collectCurrentSendInputs({
      conversationId: 'c1',
      model: model(['text', 'file']),
      providerContext: providerContext(),
    })
    const docxAttachment = collected.draftAttachments.find((item) => item.assetId === 'docx-v')
    expect(docxAttachment?.semantic).toMatchObject({
      targetKind: 'markdown',
      sendStrategy: 'text_in_prompt',
      mappedFromLegacy: false,
    })
    expect(docxAttachment?.routeCandidates?.length ?? 0).toBeGreaterThan(0)
  })

  it('changes route candidate compatibility on model switch without mutating detection metadata', () => {
    const h = createHarness()
    insertConvo(h.db, 'c1')
    createAsset(h.fileAssetRepo, 'pdf-route', {
      filename: 'manual.pdf',
      extension: 'pdf',
      mime: 'application/pdf',
      assetKind: 'document',
      storageUri: 'assets/original/pd/pdf-route.pdf',
      sourceMetaJson: {
        fileTypeDetection: {
          currentJobId: 'job-1',
          lastVerdictId: 'verdict-1',
        },
      },
    })
    createVerdict(h, 'pdf-route', 'pdf', 'document')
    h.conversationAttachmentService.addDraftAttachment({ conversationId: 'c1', assetId: 'pdf-route' })
    h.db.prepare(`
      UPDATE draft_attachments
      SET ai_payload_kind = 'pdf',
          processing_status = 'native_supported'
      WHERE asset_id = 'pdf-route'
    `).run()

    const beforeVerdict = h.fileTypeVerdictRepo.getCurrentByAssetId('pdf-route')
    const beforeVerdictJson = JSON.stringify(beforeVerdict)
    const beforeMeta = h.db.prepare(`
      SELECT source_meta_json AS sourceMetaJson
      FROM file_assets
      WHERE id = 'pdf-route'
      LIMIT 1
    `).get() as { sourceMetaJson: string | null }

    const withFileModel = h.sendPlanService.collectCurrentSendInputs({
      conversationId: 'c1',
      model: model(['text', 'file']),
      providerContext: providerContext(),
    })
    const withTextOnlyModel = h.sendPlanService.collectCurrentSendInputs({
      conversationId: 'c1',
      model: model(['text']),
      providerContext: providerContext(),
    })

    const fileModelAttachment = withFileModel.draftAttachments.find((item) => item.assetId === 'pdf-route')
    const textModelAttachment = withTextOnlyModel.draftAttachments.find((item) => item.assetId === 'pdf-route')
    const fileModelPlan = h.sendPlanService.buildSendPlan(withFileModel)
    const textModelPlan = h.sendPlanService.buildSendPlan(withTextOnlyModel)
    expect(fileModelAttachment?.routeCandidates?.some((candidate) => candidate.compatible && !candidate.blocked)).toBe(true)
    expect(textModelAttachment?.routeCandidates?.some((candidate) => candidate.compatible && !candidate.blocked)).toBe(true)
    expect(fileModelAttachment?.routeCandidates?.find((candidate) => candidate.route === 'direct_file')?.compatible).toBe(true)
    expect(textModelAttachment?.routeCandidates?.find((candidate) => candidate.route === 'direct_file')?.compatible).toBe(false)
    expect(fileModelPlan.attachmentPlans[0]?.fileType).toBeTruthy()
    expect(textModelPlan.attachmentPlans[0]?.fileType).toBeTruthy()

    const afterMeta = h.db.prepare(`
      SELECT source_meta_json AS sourceMetaJson
      FROM file_assets
      WHERE id = 'pdf-route'
      LIMIT 1
    `).get() as { sourceMetaJson: string | null }
    expect(afterMeta.sourceMetaJson).toBe(beforeMeta.sourceMetaJson)
    const afterVerdict = h.fileTypeVerdictRepo.getCurrentByAssetId('pdf-route')
    expect(JSON.stringify(afterVerdict)).toBe(beforeVerdictJson)
    expect(JSON.stringify(afterVerdict)).not.toContain('routeCandidates')
    expect(JSON.stringify(afterVerdict)).not.toContain('direct_file')
  })

  it('keeps direct PDF send available when text derivative is unsupported', () => {
    const h = createHarness()
    insertConvo(h.db, 'c1')
    createAsset(h.fileAssetRepo, 'pdf-route-derivative', {
      filename: 'manual.pdf',
      extension: 'pdf',
      mime: 'application/pdf',
      assetKind: 'document',
      storageUri: 'assets/original/pd/pdf-route-derivative.pdf',
      sourceMetaJson: {
        textConversion: {
          status: 'failed',
          errorCode: 'derivative_asset_not_supported',
          errorMessage: 'Extracted text only supports text assets or captured PDF annotations in phase 7.',
        },
        lineage: {
          stale: true,
          staleReason: 'derivative_asset_not_supported',
          sendAssetReady: false,
        },
        fileTypeDetection: {
          routeEligibility: 'verdict_ready',
          detectionLevel: 'advanced',
          engineMode: 'core_plus_magika',
          usedMagika: true,
          magikaState: 'available',
          advancedAttempted: true,
        },
      },
    })
    createVerdict(h, 'pdf-route-derivative', 'pdf', 'document', 'high', [], {
      routeEligibility: 'verdict_ready',
      detectionLevel: 'advanced',
      engineMode: 'core_plus_magika',
      usedMagika: true,
      magikaState: 'available',
      evidenceSources: ['extension', 'mime_os', 'magic', 'magika'],
      decisiveEvidenceSource: 'magic',
      detectionTrigger: 'send_plan_build',
      magikaModelVersion: 'standard_v3_3',
      advancedAttempted: true,
      advancedFailureReason: null,
    })
    h.conversationAttachmentService.addDraftAttachment({ conversationId: 'c1', assetId: 'pdf-route-derivative' })
    h.db.prepare(`
      UPDATE draft_attachments
      SET ai_payload_kind = 'pdf',
          processing_status = 'native_supported'
      WHERE asset_id = 'pdf-route-derivative'
    `).run()

    const collected = h.sendPlanService.collectCurrentSendInputs({
      conversationId: 'c1',
      model: model(['text', 'file']),
      providerContext: providerContext(),
    })
    const attachment = collected.draftAttachments.find((item) => item.assetId === 'pdf-route-derivative')
    expect(attachment?.routeCandidates?.find((candidate) => candidate.route === 'converted_markdown')).toMatchObject({
      blocked: true,
      blockedBy: expect.arrayContaining(['derivative_asset_not_supported']),
    })
    expect(attachment?.routeCandidates?.find((candidate) => candidate.route === 'extracted_text')).toMatchObject({
      blocked: true,
      blockedBy: expect.arrayContaining(['derivative_asset_not_supported']),
    })
    expect(attachment?.routeCandidates?.find((candidate) => candidate.route === 'direct_file')).toMatchObject({
      compatible: true,
      blocked: false,
    })
    expect(attachment?.semantic).toMatchObject({
      targetKind: 'pdf_attachment',
      sendStrategy: 'file_attachment',
    })

    const plan = h.sendPlanService.buildSendPlan(collected)
    expect(plan.status).toBe('sendable')
    expect(plan.includedAttachments).toEqual([
      expect.objectContaining({
        assetId: 'pdf-route-derivative',
      }),
    ])
    expect(plan.excludedAttachments).toEqual([])
    expect(plan.attachmentPlans[0]).toMatchObject({
      assetId: 'pdf-route-derivative',
      eligibility: 'included',
      exclusionReason: null,
      selectedSendMode: 'inline_base64',
      fileType: expect.objectContaining({
        recommendedRoute: 'direct_file',
        blocked: false,
      }),
      detection: expect.objectContaining({
        routeEligibility: 'verdict_ready',
        detectionLevel: 'advanced',
        usedMagika: true,
        magikaState: 'available',
      }),
      lineage: expect.objectContaining({
        state: 'ok',
        stale: false,
        staleReason: 'derivative_asset_not_supported',
      }),
    })
  })

  it('blocks PDF send when text derivative is unsupported and direct file is incompatible', () => {
    const h = createHarness()
    insertConvo(h.db, 'c1')
    createAsset(h.fileAssetRepo, 'pdf-no-direct', {
      filename: 'manual.pdf',
      extension: 'pdf',
      mime: 'application/pdf',
      assetKind: 'document',
      storageUri: 'assets/original/pd/pdf-no-direct.pdf',
      sourceMetaJson: {
        textConversion: {
          status: 'failed',
          errorCode: 'derivative_asset_not_supported',
          errorMessage: 'Extracted text only supports text assets or captured PDF annotations in phase 7.',
        },
      },
    })
    createVerdict(h, 'pdf-no-direct', 'pdf', 'document')
    h.conversationAttachmentService.addDraftAttachment({ conversationId: 'c1', assetId: 'pdf-no-direct' })
    h.db.prepare(`
      UPDATE draft_attachments
      SET ai_payload_kind = 'pdf',
          processing_status = 'native_supported'
      WHERE asset_id = 'pdf-no-direct'
    `).run()

    const collected = h.sendPlanService.collectCurrentSendInputs({
      conversationId: 'c1',
      model: model(['text']),
      providerContext: providerContext(),
    })
    const plan = h.sendPlanService.buildSendPlan(collected)
    expect(plan.status).toBe('blocked')
    expect(plan.includedAttachments).toEqual([])
    expect(plan.attachmentPlans[0]).toMatchObject({
      assetId: 'pdf-no-direct',
      eligibility: 'excluded',
      exclusionReason: 'file_type_route_blocked',
      fileType: expect.objectContaining({
        recommendedRoute: 'converted_markdown',
        blocked: true,
        blockedBy: expect.arrayContaining(['derivative_asset_not_supported']),
      }),
    })
  })
})
