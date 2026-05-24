import { describe, expect, it } from 'vitest'
import {
  DFC_TARGET_KINDS,
  createDfcDerivedAssetFacade,
  createDfcDerivedAssetOption,
  createDfcOriginalFileOption,
  resolveDfcManagedAttachment,
  sanitizeDfcAttachmentForRenderer,
  type DfcConversionOption,
  type DfcDerivedTargetKind,
} from './documentFormatConversion'

const LEGACY_FALLBACK_TRAP = {
  preferredSendMode: 'inline_base64',
  selectedSendMode: 'url_ref',
  legacyTargetKind: 'native_file',
  extension: 'pdf',
  mimeType: 'application/pdf',
} as const

function resolveWith(input: Readonly<{
  selectedOptionId?: string | null
  options?: readonly DfcConversionOption[]
  availableRawFileIds?: readonly string[]
  availableDerivedAssetIds?: readonly string[]
}>) {
  return resolveDfcManagedAttachment({
    dfcManaged: true,
    rawFileId: 'raw-1',
    selectedOptionId: input.selectedOptionId,
    options: input.options ?? [],
    availableRawFileIds: input.availableRawFileIds ?? ['raw-1'],
    availableDerivedAssetIds: input.availableDerivedAssetIds ?? ['derived-1'],
    legacy: LEGACY_FALLBACK_TRAP,
  })
}

describe('document format conversion contracts', () => {
  it('keeps legacy target vocabulary out of the DFC targetKind contract', () => {
    expect(DFC_TARGET_KINDS).toContain('original_file')
    expect(DFC_TARGET_KINDS).toContain('pdf_attachment')
    expect(DFC_TARGET_KINDS).not.toContain('native_file')
    expect(DFC_TARGET_KINDS).not.toContain('hybrid')
    expect(DFC_TARGET_KINDS).not.toContain('unsupported')
  })

  it('expresses original_file as a raw_file SendAssetRef', () => {
    const option = createDfcOriginalFileOption({ optionId: 'original', rawFileId: 'raw-1' })

    expect(option).toMatchObject({
      targetKind: 'original_file',
      sendStrategy: 'file_attachment',
      sendAssetRefs: [{ kind: 'raw_file', assetId: 'raw-1' }],
    })
  })

  it.each([
    'plain_text',
    'markdown',
    'code',
    'table_markdown',
    'pdf_attachment',
  ] as const)('expresses %s as a derived_asset SendAssetRef', (targetKind: DfcDerivedTargetKind) => {
    const option = createDfcDerivedAssetOption({
      optionId: targetKind,
      rawFileId: 'raw-1',
      derivedAssetId: 'derived-1',
      targetKind,
    })

    expect(option.sendAssetRefs).toEqual([{ kind: 'derived_asset', assetId: 'derived-1' }])
    expect(option.sendStrategy).toBe(targetKind === 'pdf_attachment' ? 'file_attachment' : 'text_in_prompt')
  })
})

describe('resolveDfcManagedAttachment no-silent-fallback scaffold', () => {
  it('returns needs_user_selection when selectedOptionId is missing and ignores legacy fallback data', () => {
    const decision = resolveWith({
      selectedOptionId: null,
      options: [createDfcOriginalFileOption({ optionId: 'original', rawFileId: 'raw-1' })],
    })

    expect(decision).toMatchObject({
      status: 'needs_user_selection',
      reasonCode: 'selected_option_missing',
      targetKind: null,
      sendAssetRefs: [],
      needsUserAction: true,
    })
  })

  it('returns failed for a failed selected option and does not fall back to legacy selectedSendMode', () => {
    const decision = resolveWith({
      selectedOptionId: 'text',
      options: [
        createDfcDerivedAssetOption({
          optionId: 'text',
          rawFileId: 'raw-1',
          derivedAssetId: 'derived-1',
          targetKind: 'plain_text',
          status: 'failed',
        }),
      ],
    })

    expect(decision).toMatchObject({
      status: 'failed',
      reasonCode: 'selected_option_failed',
      targetKind: 'plain_text',
      sendAssetRefs: [],
    })
  })

  it('returns pending for a pending selected option and does not fall back to legacy selectedSendMode', () => {
    const decision = resolveWith({
      selectedOptionId: 'text',
      options: [
        createDfcDerivedAssetOption({
          optionId: 'text',
          rawFileId: 'raw-1',
          derivedAssetId: 'derived-1',
          targetKind: 'plain_text',
          status: 'pending',
        }),
      ],
    })

    expect(decision).toMatchObject({
      status: 'pending',
      reasonCode: 'selected_option_pending',
      targetKind: 'plain_text',
      sendAssetRefs: [],
      needsUserAction: false,
    })
  })

  it('returns stale for a stale selected option and does not fall back to legacy target kind', () => {
    const decision = resolveWith({
      selectedOptionId: 'markdown',
      options: [
        createDfcDerivedAssetOption({
          optionId: 'markdown',
          rawFileId: 'raw-1',
          derivedAssetId: 'derived-1',
          targetKind: 'markdown',
          status: 'stale',
        }),
      ],
    })

    expect(decision).toMatchObject({
      status: 'stale',
      reasonCode: 'selected_option_stale',
      targetKind: 'markdown',
      sendAssetRefs: [],
    })
  })

  it('returns pending while option generation is pending and no selected option exists', () => {
    const decision = resolveDfcManagedAttachment({
      dfcManaged: true,
      rawFileId: 'raw-1',
      selectedOptionId: null,
      options: [createDfcOriginalFileOption({ optionId: 'original', rawFileId: 'raw-1' })],
      availableRawFileIds: ['raw-1'],
      availableDerivedAssetIds: [],
      optionGenerationState: 'pending',
      legacy: LEGACY_FALLBACK_TRAP,
    })

    expect(decision).toMatchObject({
      status: 'pending',
      reasonCode: 'selected_option_pending',
      targetKind: null,
      sendAssetRefs: [],
      needsUserAction: false,
    })
  })

  it('returns incompatible for an incompatible selected option and ignores extension/MIME fallback data', () => {
    const decision = resolveWith({
      selectedOptionId: 'code',
      options: [
        createDfcDerivedAssetOption({
          optionId: 'code',
          rawFileId: 'raw-1',
          derivedAssetId: 'derived-1',
          targetKind: 'code',
          compatibilityStatus: 'incompatible',
        }),
      ],
    })

    expect(decision).toMatchObject({
      status: 'incompatible',
      reasonCode: 'selected_option_incompatible',
      targetKind: 'code',
      sendAssetRefs: [],
    })
  })

  it('blocks when original_file points to a missing raw_file and does not use native_file fallback', () => {
    const decision = resolveWith({
      selectedOptionId: 'original',
      options: [createDfcOriginalFileOption({ optionId: 'original', rawFileId: 'raw-1' })],
      availableRawFileIds: [],
    })

    expect(decision).toMatchObject({
      status: 'blocked',
      reasonCode: 'raw_file_ref_missing',
      targetKind: 'original_file',
      sendAssetRefs: [],
    })
  })

  it('blocks when a derived target points to a missing derived_asset and ignores hybrid fallback', () => {
    const decision = resolveWith({
      selectedOptionId: 'table',
      options: [
        createDfcDerivedAssetOption({
          optionId: 'table',
          rawFileId: 'raw-1',
          derivedAssetId: 'derived-1',
          targetKind: 'table_markdown',
        }),
      ],
      availableDerivedAssetIds: [],
    })

    expect(decision).toMatchObject({
      status: 'blocked',
      reasonCode: 'derived_asset_ref_missing',
      targetKind: 'table_markdown',
      sendAssetRefs: [],
    })
  })

  it('returns a ready decision only from the selected DFC option and SendAssetRef', () => {
    const decision = resolveWith({
      selectedOptionId: 'markdown',
      options: [
        createDfcOriginalFileOption({ optionId: 'original', rawFileId: 'raw-1' }),
        createDfcDerivedAssetOption({
          optionId: 'markdown',
          rawFileId: 'raw-1',
          derivedAssetId: 'derived-1',
          targetKind: 'markdown',
        }),
      ],
    })

    expect(decision).toMatchObject({
      status: 'ready',
      reasonCode: null,
      selectedOptionId: 'markdown',
      targetKind: 'markdown',
      sendStrategy: 'text_in_prompt',
      sendAssetRefs: [{ kind: 'derived_asset', assetId: 'derived-1' }],
      needsUserAction: false,
    })
  })
})

describe('sanitizeDfcAttachmentForRenderer', () => {
  it('omits path, fileUrl, full hash, contentToken, file body, and raw storage refs', () => {
    const dto = sanitizeDfcAttachmentForRenderer({
      attachmentId: 'draft-attachment-1',
      rawFileId: 'raw-1',
      filename: 'notes.txt',
      sizeBytes: 123,
      selectedOptionId: 'text',
      targetKind: 'plain_text',
      status: 'ready',
      warnings: ['large_text_warning'],
      diagnostics: [{ code: 'ok', message: 'safe' }],
      path: 'C:\\Users\\owner\\secret\\notes.txt',
      fileUrl: 'file:///C:/Users/owner/secret/notes.txt',
      hash: 'a'.repeat(64),
      contentToken: 'token-secret',
      body: 'file body',
      storageRef: 'assets/original/raw-1.txt',
    })

    expect(dto).toEqual({
      attachmentId: 'draft-attachment-1',
      rawFileId: 'raw-1',
      filename: 'notes.txt',
      sizeBytes: 123,
      selectedOptionId: 'text',
      targetKind: 'plain_text',
      status: 'ready',
      warnings: ['large_text_warning'],
      diagnostics: [{ code: 'ok', message: 'safe' }],
    })
    expect('path' in dto).toBe(false)
    expect('fileUrl' in dto).toBe(false)
    expect('hash' in dto).toBe(false)
    expect('contentToken' in dto).toBe(false)
    expect('body' in dto).toBe(false)
    expect('storageRef' in dto).toBe(false)
  })
})

describe('createDfcDerivedAssetFacade', () => {
  it('maps a ready derivative record with DFC metadata into a DerivedAsset facade', () => {
    const result = createDfcDerivedAssetFacade({
      derivativeId: 'derivative-1',
      sourceFileId: 'raw-1',
      mime: 'text/markdown',
      storageRef: 'assets/derived/raw-1/derivative-1.txt',
      status: 'ready',
      generator: 'dfc-text',
      metaJson: {
        targetKind: 'markdown',
        sourceHash: 'source-hash',
        contentHash: 'content-hash',
        conversionSettingsHash: 'settings-hash',
        usage: 'preview_and_send',
        storageClass: 'draft_bound',
        converterName: 'dfc-text',
        converterVersion: '1',
        warnings: ['large_text_warning'],
        path: 'C:\\Users\\owner\\secret\\notes.md',
        fileUrl: 'file:///C:/Users/owner/secret/notes.md',
      },
    })

    expect(result).toEqual({
      ok: true,
      asset: {
        assetId: 'derivative-1',
        sourceFileId: 'raw-1',
        targetKind: 'markdown',
        mime: 'text/markdown',
        storageRef: 'assets/derived/raw-1/derivative-1.txt',
        usage: 'preview_and_send',
        storageClass: 'draft_bound',
        sourceHash: 'source-hash',
        contentHash: 'content-hash',
        conversionSettingsHash: 'settings-hash',
        converter: {
          name: 'dfc-text',
          version: '1',
        },
        warnings: ['large_text_warning'],
      },
    })
  })

  it('rejects original_file because raw_file must not create DerivedAsset', () => {
    const result = createDfcDerivedAssetFacade({
      derivativeId: 'derivative-1',
      sourceFileId: 'raw-1',
      storageRef: 'assets/derived/raw-1/derivative-1.txt',
      status: 'ready',
      generator: 'dfc-text',
      metaJson: {
        targetKind: 'original_file',
        sourceHash: 'source-hash',
        contentHash: 'content-hash',
        conversionSettingsHash: 'settings-hash',
        usage: 'preview_and_send',
        storageClass: 'draft_bound',
        converterVersion: '1',
      },
    })

    expect(result).toEqual({ ok: false, reasonCode: 'derived_asset_original_file_not_allowed' })
  })

  it('rejects derivatives missing same-source metadata instead of inferring from storage or MIME', () => {
    const result = createDfcDerivedAssetFacade({
      derivativeId: 'derivative-1',
      sourceFileId: 'raw-1',
      mime: 'text/plain',
      storageRef: 'assets/derived/raw-1/derivative-1.txt',
      status: 'ready',
      generator: 'dfc-text',
      metaJson: {
        targetKind: 'plain_text',
        sourceHash: 'source-hash',
        usage: 'preview_and_send',
        storageClass: 'draft_bound',
        converterName: 'dfc-text',
        converterVersion: '1',
      },
    })

    expect(result).toEqual({ ok: false, reasonCode: 'derived_asset_missing_content_hash' })
  })
})
