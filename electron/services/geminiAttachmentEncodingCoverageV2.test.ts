import { describe, expect, it } from 'vitest'
import { validateGenerationExecutionCapabilityV2 } from '../../src/next/generation-v2/compiler/semanticCapabilityValidatorV2'
import { MODEL_CAPABILITY_SEMANTIC_PATHS_V2 as PATHS } from '../../src/next/generation-v2/capability/modelCapabilitySchemaV2'
import { decodeGenerationIntentLayerV2 } from '../../src/next/generation-v2/domain/generationIntentV2'
import { readReviewedGeminiGenerateContentDefinitionV2 } from '../../src/next/generation-v2/contracts/providerContractRegistryV2'
import { resolveEncodingCoverageRegistryV2 } from '../../src/next/generation-v2/capability/encodingCoverageRegistryV2'
import {
  canonicalizeResolvedCapabilityV2,
  runtimeSnapshotRecordFromResolvedCapabilityV2,
} from '../../src/next/generation-v2/capability/resolvedCapabilityV2'
import { decodeRuntimeCapabilitySnapshotV2 } from '../../src/next/generation-v2/capability/runtimeCapabilitySnapshotV2'
import { readVerifiedGeminiDeveloperApiEndpointProfileV2 } from '../../src/next/generation-v2/providers/gemini/verifiedEndpointProfileV2'
import { geminiAttachmentCapabilityFieldsV2 } from './geminiGenerateContentGenerationAuthorityV2Service'

const SUPPORTS = 'gemini.generate_content.v2.supports'
const digest = 'a'.repeat(64)
const MANAGED_PATHS = ['kind', 'assetId', 'assetRevisionId', 'assetSha256', 'include', 'sendAs', 'conversion']
const URL_PATHS = ['referenceId', 'referenceRevision', 'originalUrl', 'urlDigest', 'mediaKind', 'declaredMediaType',
  'capturedAtMs', 'provenance']

function capabilitySnapshot() {
  const definition = readReviewedGeminiGenerateContentDefinitionV2()
  const profile = readVerifiedGeminiDeveloperApiEndpointProfileV2()
  const descriptor = profile.descriptors.generateContent
  const attachmentFields = new Map(geminiAttachmentCapabilityFieldsV2(SUPPORTS).map((field) => [field.path, field]))
  const resolved = canonicalizeResolvedCapabilityV2({
    binding: {
      credentialScopeId: 'credential-scope:p', providerId: 'google_ai_studio', endpointProfileId: profile.endpointProfileId.value,
      endpointBinding: { kind: 'provider_managed_set', endpointSetRevision: profile.endpointSetRevision.value,
        descriptors: [{ endpointId: descriptor.endpointId.value, descriptorRevision: descriptor.descriptorRevision.value }] },
      protocolContractId: 'gemini-generate-content-v1beta', contractRevision: definition.contractRevision.value,
      contractDefinitionDigest: definition.definitionDigest.value, registryRevision: definition.registryRevision.value,
      modelId: 'gemini-2.5-flash', operation: 'text',
    },
    evidence: [{ evidenceId: SUPPORTS, kind: 'official_documentation', effect: 'supports',
      sourceRef: 'https://example.test/docs', verifiedAt: '2026-07-18T00:00:00.000Z', contentDigest: digest }],
    fields: PATHS.map((path) => attachmentFields.get(path) ?? { path, state: 'missing', constraints: [], evidenceIds: [] }),
    continuation: { kind: 'client_managed_native_replay', artifactKind: 'gemini_generate_content_native_history_v1',
      supportsBranchReplay: true, supportsRestartReplay: true, evidenceIds: [SUPPORTS] },
  })
  return decodeRuntimeCapabilitySnapshotV2(runtimeSnapshotRecordFromResolvedCapabilityV2({
    capability: resolved, resolvedAt: '2026-07-18T00:00:00.000Z', tools: [],
  }))
}

const managed = (overrides: Record<string, unknown> = {}) => ({
  kind: 'managed_file', assetId: 'asset:1', assetRevisionId: 'revision:1', assetSha256: digest,
  include: true, sendAs: 'provider_file', conversion: 'none', ...overrides,
})
const urlRef = (overrides: Record<string, unknown> = {}) => ({
  kind: 'url_reference', referenceId: 'url:1', referenceRevision: 'url-revision:1',
  originalUrl: 'https://example.test/a.png', urlDigest: digest, mediaKind: 'image',
  declaredMediaType: 'image/png', capturedAtMs: 1_000, provenance: 'user_supplied',
  include: true, sendAs: 'url_reference', conversion: 'none', ...overrides,
})
const layer = (attachments: unknown[]) => decodeGenerationIntentLayerV2({ schemaVersion: 2, attachments })

describe('Gemini GenerateContent attachment encoding coverage', () => {
  const snapshot = capabilitySnapshot()
  const validate = (attachments: unknown[]) => validateGenerationExecutionCapabilityV2(snapshot, layer(attachments))

  it('declares coverage for the managed-file paths the compiler encodes on both operations, and nothing for URLs', () => {
    for (const operation of ['text', 'tool_continue'] as const) {
      const paths = resolveEncodingCoverageRegistryV2({
        providerId: 'google_ai_studio', protocolContractId: 'gemini-generate-content-v1beta', operation,
      }).semanticPaths
      for (const field of MANAGED_PATHS) expect(paths).toContain(`attachments[].${field}`)
      for (const field of URL_PATHS) expect(paths).not.toContain(`attachments[].${field}`)
    }
  })

  it('admits included managed files in every form the compiler encodes', () => {
    const forms: [string, string][] = [['inline_text', 'plain_text'], ['image_reference', 'none'],
      ['provider_file', 'none'], ['converted_document', 'pdf']]
    for (const [sendAs, conversion] of forms) {
      expect(() => validate([managed({ sendAs, conversion })])).not.toThrow()
    }
  })

  it('admits excluded managed files', () => {
    expect(() => validate([managed({ include: false, sendAs: 'inline_text', conversion: 'plain_text' })])).not.toThrow()
  })

  it('does not let excluded unsupported attachments block validation, wherever they sit in the list', () => {
    expect(() => validate([urlRef({ include: false })])).not.toThrow()
    expect(() => validate([urlRef({ include: false }), managed()])).not.toThrow()
    expect(() => validate([managed(), urlRef({ include: false })])).not.toThrow()
    expect(() => validate([managed({ include: false, conversion: 'images' })])).not.toThrow()
  })

  it('still rejects included URL references and unencoded conversion values loudly', () => {
    expect(() => validate([urlRef()])).toThrow('GENERATION_V2_RESOLVED_CAPABILITY')
    expect(() => validate([urlRef({ include: false }), urlRef({ referenceId: 'url:2' })])).toThrow('GENERATION_V2_RESOLVED_CAPABILITY')
    expect(() => validate([managed({ conversion: 'images' })])).toThrow('GENERATION_V2_RESOLVED_CAPABILITY_VALUE_UNSUPPORTED')
  })
})
