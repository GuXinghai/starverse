/* eslint-disable max-lines-per-function */

import { describe, expect, it } from 'vitest'
import BetterSqlite3 from 'better-sqlite3'
import { readFileSync } from 'node:fs'
import path from 'node:path'
import { BranchRepo } from '../db/repo/branchRepo'
import { ConversationDraftRepo } from '../db/repo/conversationDraftRepo'
import { FileAssetRepo } from '../db/repo/fileAssetRepo'
import { MessageAttachmentRepo } from '../db/repo/messageAttachmentRepo'
import { MessageRepo } from '../db/repo/messageRepo'
import { ConversationAttachmentService } from './conversationAttachmentService'
import { SendPlanService, type CollectedAttachmentInput, __sendPlanEligibilityInternals } from './sendPlanService'
import type { AttachmentSemanticSummary, SendPlanModelDescriptor, SendPlanProviderContext } from '../../src/shared/files/sendPlanTypes'
import type { FileAssetRecord, FileAssetIngestStatus } from '../db/types'

function canOpenBetterSqlite(): boolean {
  try {
    const db = new BetterSqlite3(':memory:')
    db.close()
    return true
  } catch {
    return false
  }
}

const describeIfBetterSqlite = canOpenBetterSqlite() ? describe : describe.skip

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
    ingestStatus: 'stored' as FileAssetIngestStatus,
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

describe('SendPlanService semantic eligibility internals', () => {
  it('uses semantic mode when explicit semantic is present and falls back to legacy mode when absent', () => {
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
    expect(withoutSemantic).toBe('legacy')
  })

  it('resolves semantic summary from explicit semantic first and falls back to legacy mapper', () => {
    const explicit = __sendPlanEligibilityInternals.resolveAttachmentSemanticSummary(makeCollectedAttachment({
      semantic: {
        targetKind: 'code',
        sendStrategy: 'text_in_prompt',
        mappedFromLegacy: false,
      },
    }))
    const fallback = __sendPlanEligibilityInternals.resolveAttachmentSemanticSummary(makeCollectedAttachment({
      aiPayloadKind: 'pdf',
      processingStatus: 'ready',
      semantic: null,
    }))

    expect(explicit).toEqual({
      targetKind: 'code',
      sendStrategy: 'text_in_prompt',
      mappedFromLegacy: false,
    })
    expect(fallback).toEqual({
      targetKind: 'pdf_attachment',
      sendStrategy: 'file_attachment',
      mappedFromLegacy: true,
    })
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

  it('maps convertible docx and xlsx defaults to text semantic targets for Step 4 baseline', () => {
    const docxSemantic = __sendPlanEligibilityInternals.buildDefaultSemanticSummary(
      makeCollectedAttachment({
        aiPayloadKind: 'pdf',
        processingStatus: 'convertible',
      }),
      makeLocalAsset({
        filename: 'draft.docx',
        extension: 'docx',
        mime: 'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
        assetKind: 'document',
      })
    )
    const xlsxSemantic = __sendPlanEligibilityInternals.buildDefaultSemanticSummary(
      makeCollectedAttachment({
        aiPayloadKind: 'pdf',
        processingStatus: 'convertible',
      }),
      makeLocalAsset({
        filename: 'sheet.xlsx',
        extension: 'xlsx',
        mime: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
        assetKind: 'document',
      })
    )
    expect(docxSemantic).toMatchObject({ targetKind: 'markdown', sendStrategy: 'text_in_prompt' })
    expect(xlsxSemantic).toMatchObject({ targetKind: 'table_markdown', sendStrategy: 'text_in_prompt' })
  })

  it('maps convertible html and postscript defaults to safe text semantic targets', () => {
    const htmlSemantic = __sendPlanEligibilityInternals.buildDefaultSemanticSummary(
      makeCollectedAttachment({
        aiPayloadKind: 'text',
        processingStatus: 'convertible',
      }),
      makeLocalAsset({
        filename: 'index.html',
        extension: 'html',
        mime: 'text/html',
        assetKind: 'text',
      })
    )
    const psSemantic = __sendPlanEligibilityInternals.buildDefaultSemanticSummary(
      makeCollectedAttachment({
        aiPayloadKind: 'text',
        processingStatus: 'convertible',
      }),
      makeLocalAsset({
        filename: 'figure.eps',
        extension: 'eps',
        mime: 'application/postscript',
        assetKind: 'text',
      })
    )
    expect(htmlSemantic).toMatchObject({ targetKind: 'markdown', sendStrategy: 'text_in_prompt' })
    expect(psSemantic).toMatchObject({ targetKind: 'code', sendStrategy: 'text_in_prompt' })
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
    now: () => 2_000,
    parsingTimeoutMs: 100,
  })
  return {
    db,
    fileAssetRepo,
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

  it('treats stale parsing as a terminal failure fallback and avoids permanent blocked state', () => {
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
    h.conversationAttachmentService.updateDraftText({ conversationId: 'c1', draftText: 'fallback text' })
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
    createAsset(h.fileAssetRepo, 'audio-local', {
      filename: 'voice.mp3',
      extension: 'mp3',
      mime: 'audio/mpeg',
      assetKind: 'audio',
      storageUri: 'assets/original/au/audio-local.mp3',
    })
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
        exclusionReason: 'incompatible_with_current_model',
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

  it('emits normalized semantic summary while preserving existing send behavior', () => {
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

    expect(plan.status).toBe('sendable')
    expect(plan.attachmentPlans).toEqual([
      expect.objectContaining({
        assetId: 'text-1',
        semantic: {
          targetKind: 'plain_text',
          sendStrategy: 'text_in_prompt',
          mappedFromLegacy: true,
        },
      }),
      expect.objectContaining({
        assetId: 'pdf-1',
        semantic: {
          targetKind: 'pdf_attachment',
          sendStrategy: 'file_attachment',
          mappedFromLegacy: true,
        },
      }),
    ])
  })

  it('keeps convertible attachments blocked but exposes semantic baseline for follow-up selection work', () => {
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
      exclusionReason: 'incompatible_with_current_model',
      selectedSendMode: null,
      semantic: {
        targetKind: 'pdf_attachment',
        sendStrategy: 'unsupported',
        mappedFromLegacy: true,
      },
    })
    expect(plan.status).toBe('blocked')
    expect(plan.blockingReasons).toEqual([
      expect.objectContaining({ code: 'current_draft_incompatible_with_current_model' }),
    ])
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
})
