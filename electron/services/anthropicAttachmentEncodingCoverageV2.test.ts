import { describe, expect, it } from 'vitest'
import { validateGenerationExecutionCapabilityV2 } from '../../src/next/generation-v2/compiler/semanticCapabilityValidatorV2'
import { compileAnthropicMessagesRequestV1 } from '../../src/next/generation-v2/providers/anthropic/messagesRequestV1'
import { MODEL_CAPABILITY_SEMANTIC_PATHS_V2 as PATHS } from '../../src/next/generation-v2/capability/modelCapabilitySchemaV2'
import { decodeGenerationIntentLayerV2 } from '../../src/next/generation-v2/domain/generationIntentV2'
import { decodeResolvedGenerationIntentV2 } from '../../src/next/generation-v2/domain/resolvedGenerationIntentV2'
import { readReviewedAnthropicMessagesDefinitionV2 } from '../../src/next/generation-v2/contracts/providerContractRegistryV2'
import { resolveEncodingCoverageRegistryV2 } from '../../src/next/generation-v2/capability/encodingCoverageRegistryV2'
import {
  canonicalizeResolvedCapabilityV2,
  runtimeSnapshotRecordFromResolvedCapabilityV2,
} from '../../src/next/generation-v2/capability/resolvedCapabilityV2'
import { decodeRuntimeCapabilitySnapshotV2 } from '../../src/next/generation-v2/capability/runtimeCapabilitySnapshotV2'
import { ANTHROPIC_URL_METADATA_UNKNOWN_EVIDENCE_V2, anthropicAttachmentCapabilityFieldsV2 } from './anthropicGenerationAuthorityV2Service'

const SUPPORTS = 'anthropic.messages.v2.supports'
const digest = 'a'.repeat(64)

function capabilitySnapshot() {
  const definition = readReviewedAnthropicMessagesDefinitionV2()
  const attachmentFields = new Map(anthropicAttachmentCapabilityFieldsV2().map((field) => [field.path, field]))
  const resolved = canonicalizeResolvedCapabilityV2({
    binding: {
      credentialScopeId: 'credential-scope:p', providerId: 'anthropic', endpointProfileId: 'profile:anthropic',
      endpointBinding: { kind: 'provider_managed_set', endpointSetRevision: 'endpoint-set:1',
        descriptors: [{ endpointId: 'endpoint:anthropic', descriptorRevision: 'descriptor:1' }] },
      protocolContractId: 'anthropic-messages-2023-06-01', contractRevision: definition.contractRevision.value,
      contractDefinitionDigest: definition.definitionDigest.value, registryRevision: definition.registryRevision.value,
      modelId: 'claude-sonnet-4-5', operation: 'text',
    },
    evidence: [{ evidenceId: SUPPORTS, kind: 'official_documentation', effect: 'supports',
      sourceRef: 'https://example.test/docs', verifiedAt: '2026-07-18T00:00:00.000Z', contentDigest: digest },
      ANTHROPIC_URL_METADATA_UNKNOWN_EVIDENCE_V2],
    fields: PATHS.map((path) => attachmentFields.get(path) ??
      { path, state: 'missing', constraints: [], evidenceIds: [] }),
    continuation: { kind: 'client_managed_native_replay', artifactKind: 'anthropic_messages_native_history_v1',
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

describe('Anthropic attachment encoding coverage', () => {
  const snapshot = capabilitySnapshot()
  const validate = (attachments: unknown[]) => validateGenerationExecutionCapabilityV2(snapshot, layer(attachments))

  it('declares coverage for the already-implemented attachment paths on both operations, and only those', () => {
    for (const operation of ['text', 'tool_continue'] as const) {
      const paths = resolveEncodingCoverageRegistryV2({
        providerId: 'anthropic', protocolContractId: 'anthropic-messages-2023-06-01', operation,
      }).semanticPaths
      for (const field of ['kind', 'referenceId', 'referenceRevision', 'originalUrl', 'urlDigest', 'mediaKind',
        'declaredMediaType', 'capturedAtMs', 'provenance']) expect(paths).toContain(`attachments[].${field}`)
      expect(paths).not.toContain('image.size')
    }
  })

  it('admits included and excluded managed files', () => {
    expect(() => validate([managed()])).not.toThrow()
    expect(() => validate([managed({ include: false, sendAs: 'inline_text' })])).not.toThrow()
  })

  it('admits URL image and document references, included or excluded', () => {
    for (const mediaKind of ['image', 'document']) {
      expect(() => validate([urlRef({ mediaKind })])).not.toThrow()
      expect(() => validate([urlRef({ mediaKind, include: false })])).not.toThrow()
    }
    const { declaredMediaType: _omitted, ...withoutMediaType } = urlRef()
    expect(() => validate([withoutMediaType])).not.toThrow()
  })

  it('still rejects unsupported URL media kinds loudly', () => {
    for (const mediaKind of ['audio', 'video', 'other']) {
      expect(() => validate([urlRef({ mediaKind })])).toThrow('GENERATION_V2_RESOLVED_CAPABILITY_VALUE_UNSUPPORTED')
    }
  })
})

describe('Anthropic request compiler attachment dispositions', () => {
  const compile = (attachments: unknown[]) => compileAnthropicMessagesRequestV1({
    modelId: 'claude-sonnet-4-5',
    intent: decodeResolvedGenerationIntentV2({
      schemaVersion: 2, generation: { maxOutputTokens: 1024 }, reasoning: { mode: 'disabled' },
      web: { mode: 'disabled' }, image: { mode: 'disabled' }, tools: { mode: 'disabled' }, attachments,
      providerExtension: { kind: 'anthropic_messages', thinkingDisplay: 'provider_default', thinkingMode: 'model_recommended' },
    }).value,
    messages: [{ role: 'user', content: 'hi' }],
  })
  const paths = (result: ReturnType<typeof compile>) => result.dispositions
    .filter((entry) => entry.semanticPath.startsWith('attachments[')).map((entry) => `${entry.semanticPath}:${entry.outcome}`)

  it('records the discriminant and URL metadata for included URL references without managed-file paths', () => {
    const result = compile([urlRef()])
    expect(result.issues).toEqual([])
    const recorded = paths(result)
    expect(recorded).toContain('attachments[0].kind:accepted_no_wire')
    expect(recorded).toContain('attachments[0].originalUrl:encoded')
    expect(recorded).toContain('attachments[0].mediaKind:encoded')
    expect(recorded).toContain('attachments[0].include:encoded')
    expect(recorded.some((entry) => entry.startsWith('attachments[0].assetId'))).toBe(false)
  })

  it('keeps excluded attachments unencoded and immutable intent order stable', () => {
    const result = compile([urlRef({ include: false }), managed({ assetId: 'asset:2', include: false, sendAs: 'inline_text' })])
    expect(result.issues).toEqual([])
    const recorded = paths(result)
    expect(recorded.filter((entry) => entry.endsWith(':encoded'))).toEqual([])
    expect(recorded).toContain('attachments[0].originalUrl:accepted_no_wire')
    expect(recorded).toContain('attachments[1].assetId:accepted_no_wire')
    expect(recorded).toContain('attachments[1].kind:accepted_no_wire')
  })

  it('records encoded include/sendAs for an included managed file', () => {
    const recorded = paths(compile([managed()]))
    expect(recorded).toContain('attachments[0].kind:accepted_no_wire')
    expect(recorded).toContain('attachments[0].include:encoded')
    expect(recorded).toContain('attachments[0].sendAs:encoded')
  })
})
