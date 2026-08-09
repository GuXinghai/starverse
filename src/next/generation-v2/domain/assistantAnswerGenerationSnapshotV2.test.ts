import { describe, expect, it } from 'vitest'
import { createHash } from 'node:crypto'
import {
  ASSISTANT_ANSWER_GENERATION_SNAPSHOT_V2_MAX_UTF8_BYTES,
  canonicalizeUnverifiedAssistantAnswerGenerationSnapshotV2,
  decodeAssistantAnswerGenerationSnapshotJsonV2,
  decodeAssistantAnswerGenerationSnapshotV2,
} from './assistantAnswerGenerationSnapshotV2'

const contractDigest = 'a'.repeat(64)
const registryDigest = 'b'.repeat(64)
const evidenceDigest = 'c'.repeat(64)
const capabilityFieldsDigest = 'd'.repeat(64)
const capabilitySnapshotHash = '9'.repeat(64)
const assetSha = 'e'.repeat(64)
const descriptorDigest = 'f'.repeat(64)
const providerFileHash = '1'.repeat(64)
const toolDefinitionsDigest = '2'.repeat(64)
const compatibleEndpointDigest = '3'.repeat(64)
const compatibleConfigDigest = '4'.repeat(64)
const compatibleExtraBody = Object.freeze({ vendor_option: true })
const compatibleExtraBodyDigest = createHash('sha256').update('{"vendor_option":true}', 'utf8').digest('hex')

function payload() {
  return {
    schemaVersion: 2,
    answerRootId: 'answer:1',
    operationId: 'operation:1',
    semanticIntent: {
      schemaVersion: 2,
      generation: { temperature: 0.25, stop: ['END'] },
      reasoning: { mode: 'enabled', effort: 'medium', summary: 'concise' },
      web: { mode: 'disabled' },
      image: { mode: 'disabled' },
      tools: {
        mode: 'enabled',
        allowedToolIds: ['tool:b', 'tool:a'],
        toolChoice: { mode: 'omitted' },
        sideEffectConfirmation: 'required_each_retry',
      },
      attachments: [{
        kind: 'managed_file',
        assetId: 'asset:1',
        assetRevisionId: 'asset-revision:1',
        assetSha256: assetSha,
        include: true,
        sendAs: 'provider_file',
        conversion: 'none',
      }],
      providerExtension: { kind: 'none' },
    },
    resolvedConfigRevisions: [
      { ownerKind: 'global', ownerId: 'global', revision: 'config:global:7' },
      { ownerKind: 'project', ownerId: 'project:1', revision: 'config:project:4' },
      { ownerKind: 'conversation', ownerId: 'conversation:1', revision: 'config:conversation:9' },
    ],
    providerBinding: {
      credentialScopeId: 'credential-scope:1',
      providerId: 'openrouter',
      endpointProfileId: 'profile:openrouter-images',
      endpointBinding: {
        kind: 'pinned',
        selector: {
          kind: 'openrouter_images_v1',
          providerTag: 'google-ai-studio',
          providerSlug: 'google-ai-studio',
          descriptorRevision: 'descriptor:7',
          descriptorDigest,
          selectedBy: 'user',
          selectedAt: '2026-07-15T00:00:00.000Z',
        },
      },
      protocolContractId: 'openrouter-images-v1',
      contractRevision: `openrouter-images-v1:${contractDigest}`,
      contractDefinitionDigest: contractDigest,
      registryRevision: `provider-contract-registry-v1:${registryDigest}`,
      modelId: 'google/gemini-image',
      operation: 'image_generate',
    },
    capabilityBinding: {
      capabilityRevision: 'capability:7',
      evidenceDigest,
      semanticFieldsDigest: capabilityFieldsDigest,
      snapshotHash: capabilitySnapshotHash,
    },
    attachmentProviderFileBindings: [{
      assetRevisionId: 'asset-revision:1',
      providerFileDescriptor: {
        descriptorId: 'provider-file:1',
        descriptorRevision: 'provider-file-revision:3',
        descriptorHash: providerFileHash,
      },
    }],
    toolAuthority: {
      kind: 'registry',
      toolRegistryRevision: 'tool-registry:5',
      toolDefinitionsDigest,
    },
  }
}

describe('AssistantAnswerGenerationSnapshotV2 persisted value codec', () => {
  it('canonicalizes a complete value, binds answer and operation, and verifies its hash', () => {
    const first = canonicalizeUnverifiedAssistantAnswerGenerationSnapshotV2(payload())
    const second = canonicalizeUnverifiedAssistantAnswerGenerationSnapshotV2(payload())
    expect(first).toEqual(second)
    expect(first.snapshotHash).toMatch(/^[0-9a-f]{64}$/u)
    expect(Object.isFrozen(first)).toBe(true)
    expect(Object.isFrozen(first.semanticIntent)).toBe(true)

    const decoded = decodeAssistantAnswerGenerationSnapshotV2(first)
    expect(decoded.trust).toBe('decoded_unverified')
    expect(decoded.answerRootId.value).toBe('answer:1')
    expect(decoded.operationId.value).toBe('operation:1')
    expect(decoded.semanticIntent.tools.mode).toBe('enabled')
    expect(decoded.semanticIntent.tools.mode === 'enabled' &&
      decoded.semanticIntent.tools.allowedToolIds.map((item) => item.value))
      .toEqual(['tool:a', 'tool:b'])
    expect(JSON.parse(decoded.canonicalJson)).toEqual(first)
    expect(decodeAssistantAnswerGenerationSnapshotJsonV2(decoded.canonicalJson).snapshotHash.value)
      .toBe(first.snapshotHash)
    expect(() => decodeAssistantAnswerGenerationSnapshotJsonV2(JSON.stringify(first)))
      .toThrow('GENERATION_V2_SNAPSHOT_NON_CANONICAL_JSON')

    expect(canonicalizeUnverifiedAssistantAnswerGenerationSnapshotV2({
      ...payload(), answerRootId: 'answer:2',
    }).snapshotHash).not.toBe(first.snapshotHash)
    expect(canonicalizeUnverifiedAssistantAnswerGenerationSnapshotV2({
      ...payload(), operationId: 'operation:2',
    }).snapshotHash).not.toBe(first.snapshotHash)
  })

  it('preserves Anthropic display selection in the immutable answer snapshot', () => {
    const candidate = payload()
    const record = canonicalizeUnverifiedAssistantAnswerGenerationSnapshotV2({
      ...candidate,
      semanticIntent: {
        ...candidate.semanticIntent,
        providerExtension: { kind: 'anthropic_messages', thinkingDisplay: 'omitted', thinkingMode: 'manual', manualThinkingBudgetTokens: 1024 },
      },
    })
    const decoded = decodeAssistantAnswerGenerationSnapshotV2(record)
    expect(decoded.semanticIntent.providerExtension).toEqual({
      kind: 'anthropic_messages', thinkingDisplay: 'omitted', thinkingMode: 'manual', manualThinkingBudgetTokens: 1024,
    })
    expect(JSON.parse(decoded.canonicalJson).semanticIntent.providerExtension).toEqual({
      kind: 'anthropic_messages', thinkingDisplay: 'omitted', thinkingMode: 'manual', manualThinkingBudgetTokens: 1024,
    })
  })

  it('requires and hashes complete immutable OpenAI-compatible configuration provenance', () => {
    const candidate = payload()
    ;(candidate as unknown as { providerBinding: Record<string, unknown> }).providerBinding = {
      ...candidate.providerBinding,
      credentialScopeId: 'credential-scope:compatible:1',
      providerId: 'openai_compatible',
      endpointProfileId: 'compatible-provider:1',
      endpointBinding: { kind: 'provider_managed_set', endpointSetRevision: 'compatible-endpoint:1', descriptors: [{ endpointId: 'compatible-provider:1', descriptorRevision: 'compatible-endpoint:1' }] },
      protocolContractId: 'openai_chat_compatible',
      contractRevision: `openai_chat_compatible:${contractDigest}`,
      modelId: 'compatible-model',
      operation: 'text',
    }
    const ref = (id: string) => ({ id, version: 1, digest: compatibleConfigDigest })
    ;(candidate as Record<string, unknown>).providerConfiguration = {
      kind: 'openai_chat_compatible', providerInstanceId: 'compatible-provider:1', endpointRevisionId: 'compatible-endpoint:1',
      endpointDigest: compatibleEndpointDigest, credentialRevision: 7,
      requestProfile: ref('request-profile:1'), requestMappings: [ref('mapping:a'), ref('mapping:b')],
      reasoningMapping: ref('reasoning:1'), inlinePolicy: ref('inline:1'), responseProfile: ref('response:1'),
      extraBody: compatibleExtraBody,
      extraBodyDigest: compatibleExtraBodyDigest,
    }
    const record = canonicalizeUnverifiedAssistantAnswerGenerationSnapshotV2(candidate)
    const decoded = decodeAssistantAnswerGenerationSnapshotV2(record)
    expect(decoded.providerConfiguration).toMatchObject({
      kind: 'openai_chat_compatible', credentialRevision: 7,
      providerInstanceId: { value: 'compatible-provider:1' },
      requestMappings: [{ id: { value: 'mapping:a' } }, { id: { value: 'mapping:b' } }],
      extraBody: compatibleExtraBody,
    })
    const missing = { ...candidate }
    delete (missing as Record<string, unknown>).providerConfiguration
    expect(() => canonicalizeUnverifiedAssistantAnswerGenerationSnapshotV2(missing))
      .toThrow('GENERATION_V2_SNAPSHOT_INVALID_VALUE')
    const mismatchedExtraBody = structuredClone(candidate) as Record<string, unknown>
    ;(mismatchedExtraBody.providerConfiguration as Record<string, unknown>).extraBody = { vendor_option: false }
    expect(() => canonicalizeUnverifiedAssistantAnswerGenerationSnapshotV2(mismatchedExtraBody))
      .toThrow('GENERATION_V2_SNAPSHOT_INVALID_VALUE')
  })

  it('rejects tampering and unsupported or sensitive fields', () => {
    const record = canonicalizeUnverifiedAssistantAnswerGenerationSnapshotV2(payload())
    expect(() => decodeAssistantAnswerGenerationSnapshotV2({ ...record, answerRootId: 'answer:2' }))
      .toThrow('GENERATION_V2_SNAPSHOT_HASH_MISMATCH')
    expect(() => canonicalizeUnverifiedAssistantAnswerGenerationSnapshotV2({ ...payload(), apiKey: 'secret' }))
      .toThrow('GENERATION_V2_SNAPSHOT_UNKNOWN_FIELD')
    expect(() => canonicalizeUnverifiedAssistantAnswerGenerationSnapshotV2({
      ...payload(), semanticIntent: { ...payload().semanticIntent, requestPatch: {} },
    })).toThrow('GENERATION_V2_INTENT_UNKNOWN_FIELD')
    expect(() => canonicalizeUnverifiedAssistantAnswerGenerationSnapshotV2({
      ...payload(), schemaVersion: 1,
    })).toThrow('GENERATION_V2_SNAPSHOT_INVALID_VALUE')
  })

  it('requires complete resolved semantics and exact config revision ordering', () => {
    const missingWeb = payload()
    delete (missingWeb.semanticIntent as Partial<typeof missingWeb.semanticIntent>).web
    expect(() => canonicalizeUnverifiedAssistantAnswerGenerationSnapshotV2(missingWeb))
      .toThrow('GENERATION_V2_RESOLVED_INTENT_INCOMPLETE')

    const reversed = payload()
    reversed.resolvedConfigRevisions.reverse()
    expect(() => canonicalizeUnverifiedAssistantAnswerGenerationSnapshotV2(reversed))
      .toThrow('GENERATION_V2_SNAPSHOT_DUPLICATE_VALUE')
    const duplicate = payload()
    duplicate.resolvedConfigRevisions[1] = { ...duplicate.resolvedConfigRevisions[0] }
    expect(() => canonicalizeUnverifiedAssistantAnswerGenerationSnapshotV2(duplicate))
      .toThrow('GENERATION_V2_SNAPSHOT_DUPLICATE_VALUE')
  })

  it('requires exact provider-file and tool authority bindings without confirmation results', () => {
    const noAttachmentBinding = payload()
    noAttachmentBinding.attachmentProviderFileBindings = []
    expect(() => canonicalizeUnverifiedAssistantAnswerGenerationSnapshotV2(noAttachmentBinding))
      .toThrow('GENERATION_V2_SNAPSHOT_ATTACHMENT_BINDING_MISMATCH')

    const wrongToolAuthority = payload()
    wrongToolAuthority.toolAuthority = { kind: 'none' } as typeof wrongToolAuthority.toolAuthority
    expect(() => canonicalizeUnverifiedAssistantAnswerGenerationSnapshotV2(wrongToolAuthority))
      .toThrow('GENERATION_V2_SNAPSHOT_TOOL_BINDING_MISMATCH')

    const withConfirmation = payload()
    withConfirmation.toolAuthority = { ...withConfirmation.toolAuthority, confirmed: true } as never
    expect(() => canonicalizeUnverifiedAssistantAnswerGenerationSnapshotV2(withConfirmation))
      .toThrow('GENERATION_V2_SNAPSHOT_UNKNOWN_FIELD')
  })

  it('hashes omitted and every explicit tool choice as distinct generation semantics', () => {
    const hashes = new Set<string>()
    for (const toolChoice of [
      { mode: 'omitted' }, { mode: 'auto' }, { mode: 'none' }, { mode: 'required' },
      { mode: 'named', toolId: 'tool:a' },
    ]) {
      const value = payload()
      ;(value.semanticIntent.tools as { toolChoice: unknown }).toolChoice = toolChoice
      const record = canonicalizeUnverifiedAssistantAnswerGenerationSnapshotV2(value)
      hashes.add(record.snapshotHash)
      const decoded = decodeAssistantAnswerGenerationSnapshotV2(record)
      expect(decoded.semanticIntent.tools.mode === 'enabled' && decoded.semanticIntent.tools.toolChoice.mode)
        .toBe(toolChoice.mode)
    }
    expect(hashes.size).toBe(5)
  })

  it('rejects accessors and sparse arrays at the snapshot boundary', () => {
    const accessor = payload() as Record<string, unknown>
    Object.defineProperty(accessor, 'operationId', { enumerable: true, get: () => 'operation:1' })
    expect(() => canonicalizeUnverifiedAssistantAnswerGenerationSnapshotV2(accessor))
      .toThrow('GENERATION_V2_SNAPSHOT_INVALID_SHAPE')

    const sparse = payload()
    sparse.attachmentProviderFileBindings = new Array(1) as typeof sparse.attachmentProviderFileBindings
    expect(() => canonicalizeUnverifiedAssistantAnswerGenerationSnapshotV2(sparse))
      .toThrow('GENERATION_V2_SNAPSHOT_INVALID_SHAPE')
  })

  it('enforces the exact serialized snapshot byte budget', () => {
    const oversized = payload()
    oversized.semanticIntent.generation.stop = [
      'x'.repeat(ASSISTANT_ANSWER_GENERATION_SNAPSHOT_V2_MAX_UTF8_BYTES),
    ]
    expect(() => canonicalizeUnverifiedAssistantAnswerGenerationSnapshotV2(oversized))
      .toThrow('GENERATION_V2_SNAPSHOT_BYTE_LIMIT_EXCEEDED')
  })
})
