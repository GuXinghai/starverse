import {
  canonicalizeUnverifiedRuntimeCapabilitySnapshotV2,
  decodeRuntimeCapabilitySnapshotV2,
  RUNTIME_CAPABILITY_SEMANTIC_PATHS_V2,
  type DecodedRuntimeCapabilitySnapshotV2,
  type PersistedRuntimeCapabilityFieldV2,
  type RuntimeCapabilityDomainV2,
  type RuntimeCapabilitySemanticPathV2,
} from '../../capability/runtimeCapabilitySnapshotV2'
import { projectDecodedProviderBindingRecordV2, type DecodedProviderBindingRecordV2 } from '../../domain/providerBindingV2'
import { stableSerializeProviderRequestV2 } from '../../compiler/stableSerialize'
import { OPENROUTER_FIRST_PARTY_ENDPOINT_PROFILE_ID_V2 } from '../openrouter/verifiedFirstPartyEndpointProfileV2'
import type { CanonicalOpenRouterImageDescriptorV2, CanonicalOpenRouterImageParameterV2 } from './canonicalDescriptorV2'
import { listReviewedProviderContractDefinitionsV2 } from '../../contracts/providerContractRegistryV2'

const PARAMETER_BY_PATH: Readonly<Partial<Record<RuntimeCapabilitySemanticPathV2, string>>> = Object.freeze({
  'generation.candidateCount': 'n',
  'generation.seed': 'seed',
  'image.aspectRatio': 'aspect_ratio',
  'image.background': 'background',
  'image.format': 'output_format',
  'image.outputCompression': 'output_compression',
  'image.quality': 'quality',
  'image.resolution': 'resolution',
  'image.size': 'size',
} as const satisfies Partial<Record<RuntimeCapabilitySemanticPathV2, string>>)

const DISABLED_ONLY_PATHS = new Set<RuntimeCapabilitySemanticPathV2>([
  'reasoning.mode', 'tools.mode', 'web.mode', 'providerExtension.kind',
])

export class OpenRouterImageRuntimeCapabilityV2Error extends Error {
  constructor(readonly code: 'GENERATION_V2_OPENROUTER_IMAGE_CAPABILITY_INVALID') {
    super(code)
    this.name = 'OpenRouterImageRuntimeCapabilityV2Error'
  }
}

function expectedDescriptor(binding: DecodedProviderBindingRecordV2, descriptor: CanonicalOpenRouterImageDescriptorV2): void {
  const selector = binding.endpointBinding.kind === 'pinned' ? binding.endpointBinding.selector : null
  if (binding.providerId.value !== 'openrouter' ||
      binding.endpointProfileId.value !== OPENROUTER_FIRST_PARTY_ENDPOINT_PROFILE_ID_V2 ||
      binding.protocolContractId.value !== 'openrouter-images-v1' || binding.operation !== 'image_generate' ||
      !selector || selector.kind !== 'openrouter_images_v1' ||
      selector.providerTag.value !== descriptor.providerTag.value ||
      selector.providerSlug.value !== descriptor.providerSlug.value ||
      selector.descriptorRevision.value !== descriptor.descriptorRevision.value ||
      selector.descriptorDigest.value !== descriptor.descriptorDigest.value) {
    throw new OpenRouterImageRuntimeCapabilityV2Error('GENERATION_V2_OPENROUTER_IMAGE_CAPABILITY_INVALID')
  }
}

function domainFor(path: RuntimeCapabilitySemanticPathV2, parameter: CanonicalOpenRouterImageParameterV2): RuntimeCapabilityDomainV2 | null {
  if (path === 'image.size') {
    if (parameter.rule.kind !== 'enum' || !parameter.rule.values.every((value) => typeof value === 'string')) return null
    const pairs = parameter.rule.values.map((value) => {
      const match = /^(\d{1,5})x(\d{1,5})$/u.exec(value as string)
      if (!match) return null
      const width = Number(match[1]); const height = Number(match[2])
      return Number.isSafeInteger(width) && Number.isSafeInteger(height) && width > 0 && height > 0
        ? Object.freeze({ width, height }) : null
    })
    return pairs.every((pair) => pair !== null)
      ? Object.freeze({ kind: 'dimensions_enum' as const, values: Object.freeze(pairs as ReadonlyArray<{ width: number; height: number }>) })
      : null
  }
  if (parameter.rule.kind === 'enum') {
    const allowed: Partial<Record<RuntimeCapabilitySemanticPathV2, readonly (string | number)[]>> = {
      'image.background': ['auto', 'transparent', 'opaque'],
      'image.format': ['png', 'jpeg', 'webp', 'svg'],
      'image.quality': ['auto', 'low', 'medium', 'high'],
      'image.resolution': ['512', '1K', '2K', '4K'],
    }
    const permitted = allowed[path]
    const values = path === 'image.aspectRatio'
      ? parameter.rule.values.filter((value) => typeof value === 'string' &&
          (value === 'auto' || /^[1-9]\d{0,4}:[1-9]\d{0,4}$/u.test(value)))
      : permitted ? parameter.rule.values.filter((value) => permitted.includes(value))
        : parameter.rule.values
    return values.length > 0 ? Object.freeze({ kind: 'enum' as const, values: Object.freeze(values) }) : null
  }
  if (parameter.rule.kind === 'range') {
    const integer = path === 'generation.candidateCount' || path === 'generation.seed' || path === 'image.outputCompression'
    if (integer && (!Number.isSafeInteger(parameter.rule.min) || !Number.isSafeInteger(parameter.rule.max))) return null
    return Object.freeze({ kind: 'range' as const, min: parameter.rule.min, max: parameter.rule.max, integer })
  }
  return path === 'image.stream' ? Object.freeze({ kind: 'boolean' as const }) : null
}

function supported(path: RuntimeCapabilitySemanticPathV2, domain: RuntimeCapabilityDomainV2, evidenceId: string): PersistedRuntimeCapabilityFieldV2 {
  return Object.freeze({ path, state: 'supported', domain, constraints: Object.freeze([]), evidenceIds: Object.freeze([evidenceId]) })
}
function unsupported(path: RuntimeCapabilitySemanticPathV2, evidenceId: string): PersistedRuntimeCapabilityFieldV2 {
  return Object.freeze({ path, state: 'unsupported', constraints: Object.freeze([]), evidenceIds: Object.freeze([evidenceId]) })
}
function unavailable(path: RuntimeCapabilitySemanticPathV2): PersistedRuntimeCapabilityFieldV2 {
  return Object.freeze({ path, state: 'unavailable', constraints: Object.freeze([]), evidenceIds: Object.freeze([]) })
}

function contractDocumentationUrl(binding: DecodedProviderBindingRecordV2): string {
  const definition = listReviewedProviderContractDefinitionsV2().find((candidate) =>
    candidate.providerId.value === binding.providerId.value &&
    candidate.protocolContractId.value === binding.protocolContractId.value &&
    candidate.definitionDigest.value === binding.contractDefinitionDigest.value,
  )
  const sourceRef = definition?.evidence.provenanceUrls[0]
  if (!definition || typeof sourceRef !== 'string' || !sourceRef.startsWith('https://')) {
    throw new OpenRouterImageRuntimeCapabilityV2Error('GENERATION_V2_OPENROUTER_IMAGE_CAPABILITY_INVALID')
  }
  return sourceRef
}

/** Produces only exact descriptor-backed capability facts. Attachment URL issuance is intentionally separate. */
export function composeOpenRouterImageRuntimeCapabilityV2(input: Readonly<{
  binding: DecodedProviderBindingRecordV2
  descriptor: CanonicalOpenRouterImageDescriptorV2
  resolvedAt: string
}>): DecodedRuntimeCapabilitySnapshotV2 {
  expectedDescriptor(input.binding, input.descriptor)
  if (Number.isNaN(Date.parse(input.resolvedAt)) || new Date(input.resolvedAt).toISOString() !== input.resolvedAt) {
    throw new OpenRouterImageRuntimeCapabilityV2Error('GENERATION_V2_OPENROUTER_IMAGE_CAPABILITY_INVALID')
  }
  const supportEvidenceId = `openrouter.images.descriptor.${input.descriptor.descriptorDigest.value}.supports`
  const rejectEvidenceId = `openrouter.images.descriptor.${input.descriptor.descriptorDigest.value}.rejects`
  const contractEvidenceId = `openrouter.images.contract.${input.binding.contractDefinitionDigest.value}.supports`
  const contractSourceRef = contractDocumentationUrl(input.binding)
  const parameter = new Map(input.descriptor.parameters.map((item) => [item.name, item]))
  const fields = Object.freeze(RUNTIME_CAPABILITY_SEMANTIC_PATHS_V2.map((path) => {
    if (path === 'image.mode') return supported(path, Object.freeze({ kind: 'enum', values: Object.freeze(['generate']) }), contractEvidenceId)
    if (path === 'image.stream') {
      return input.descriptor.supportsStreaming
        ? supported(path, Object.freeze({ kind: 'boolean' }), supportEvidenceId)
        : unsupported(path, rejectEvidenceId)
    }
    if (DISABLED_ONLY_PATHS.has(path)) {
      const value = path === 'providerExtension.kind' ? 'none' : 'disabled'
      return supported(path, Object.freeze({ kind: 'enum', values: Object.freeze([value]) }), contractEvidenceId)
    }
    const wire = PARAMETER_BY_PATH[path]
    if (wire) {
      const item = parameter.get(wire)
      if (!item) return unsupported(path, rejectEvidenceId)
      const domain = domainFor(path, item)
      return domain ? supported(path, domain, supportEvidenceId) : unavailable(path)
    }
    return unavailable(path)
  }))
  const record = canonicalizeUnverifiedRuntimeCapabilitySnapshotV2({
    schemaVersion: 2,
    resolvedAt: input.resolvedAt,
    binding: projectDecodedProviderBindingRecordV2(input.binding),
    evidence: Object.freeze([
      Object.freeze({ evidenceId: contractEvidenceId, kind: 'official_documentation' as const, effect: 'supports' as const,
        sourceRef: contractSourceRef, verifiedAt: input.resolvedAt, contentDigest: input.binding.contractDefinitionDigest.value }),
      Object.freeze({ evidenceId: supportEvidenceId, kind: 'endpoint_descriptor' as const, effect: 'supports' as const,
        sourceRef: input.descriptor.providerTag.value, verifiedAt: input.resolvedAt, contentDigest: input.descriptor.descriptorDigest.value }),
      Object.freeze({ evidenceId: rejectEvidenceId, kind: 'endpoint_descriptor' as const, effect: 'rejects' as const,
        sourceRef: input.descriptor.providerTag.value, verifiedAt: input.resolvedAt, contentDigest: input.descriptor.descriptorDigest.value }),
    ]),
    fields,
    tools: Object.freeze([]),
    continuation: Object.freeze({ kind: 'none' as const, evidenceIds: Object.freeze([contractEvidenceId]) }),
  })
  const snapshot = decodeRuntimeCapabilitySnapshotV2(record)
  if (stableSerializeProviderRequestV2(projectDecodedProviderBindingRecordV2(snapshot.binding)) !==
      stableSerializeProviderRequestV2(projectDecodedProviderBindingRecordV2(input.binding))) {
    throw new OpenRouterImageRuntimeCapabilityV2Error('GENERATION_V2_OPENROUTER_IMAGE_CAPABILITY_INVALID')
  }
  return snapshot
}
