export type GenerationV2IdentityKind =
  | 'provider_id'
  | 'model_id'
  | 'endpoint_profile_id'
  | 'provider_slug'
  | 'provider_tag'
  | 'endpoint_set_revision'
  | 'endpoint_id'
  | 'protocol_contract_id'
  | 'contract_revision'
  | 'registry_revision'
  | 'credential_scope_id'
  | 'config_revision'
  | 'capability_revision'
  | 'descriptor_revision'
  | 'asset_id'
  | 'asset_revision_id'
  | 'url_reference_id'
  | 'url_reference_revision'
  | 'blob_id'
  | 'tool_id'
  | 'tool_registry_revision'
  | 'provider_file_descriptor_id'
  | 'provider_file_descriptor_revision'
  | 'compatible_provider_instance_id'
  | 'compatible_endpoint_revision_id'
  | 'compatible_config_id'
  | 'operation_id'

export type GenerationV2DigestKind =
  | 'evidence_digest'
  | 'descriptor_digest'
  | 'snapshot_hash'
  | 'asset_sha256'
  | 'url_digest'
  | 'body_sha256'
  | 'contract_digest'
  | 'capability_fields_digest'
  | 'tool_definitions_digest'
  | 'provider_file_descriptor_hash'
  | 'endpoint_profile_digest'
  | 'compatible_config_digest'
  | 'compatible_extra_body_digest'
  | 'compatible_endpoint_digest'

const IDENTITY_KINDS = new Set<GenerationV2IdentityKind>([
  'provider_id', 'model_id', 'endpoint_profile_id', 'provider_slug', 'provider_tag',
  'endpoint_set_revision', 'endpoint_id',
  'protocol_contract_id', 'contract_revision', 'registry_revision',
  'credential_scope_id', 'config_revision', 'capability_revision', 'descriptor_revision',
  'asset_id', 'asset_revision_id', 'url_reference_id', 'url_reference_revision', 'blob_id',
  'tool_id', 'operation_id',
  'tool_registry_revision', 'provider_file_descriptor_id', 'provider_file_descriptor_revision',
  'compatible_provider_instance_id', 'compatible_endpoint_revision_id', 'compatible_config_id',
])

const DIGEST_KINDS = new Set<GenerationV2DigestKind>([
  'evidence_digest', 'descriptor_digest', 'snapshot_hash', 'asset_sha256', 'url_digest', 'body_sha256', 'contract_digest',
  'capability_fields_digest', 'tool_definitions_digest', 'provider_file_descriptor_hash',
  'endpoint_profile_digest',
  'compatible_config_digest', 'compatible_extra_body_digest', 'compatible_endpoint_digest',
])

export class GenerationV2IdentityError extends Error {
  constructor(readonly code:
    | 'GENERATION_V2_IDENTITY_INVALID_KIND'
    | 'GENERATION_V2_IDENTITY_INVALID_VALUE'
    | 'GENERATION_V2_DIGEST_INVALID') {
    super(code)
    this.name = 'GenerationV2IdentityError'
  }
}

const IDENTITY_TOKEN: unique symbol = Symbol('starverse.generation-v2.identity')
const identities = new WeakSet<object>()

export class GenerationV2Identity<K extends GenerationV2IdentityKind> {
  private constructor(
    token: typeof IDENTITY_TOKEN,
    readonly kind: K,
    readonly value: string,
  ) {
    if (token !== IDENTITY_TOKEN) throw new GenerationV2IdentityError('GENERATION_V2_IDENTITY_INVALID_VALUE')
    identities.add(this)
    Object.freeze(this)
  }

  static create<K extends GenerationV2IdentityKind>(kind: K, value: string): GenerationV2Identity<K> {
    if (!IDENTITY_KINDS.has(kind)) throw new GenerationV2IdentityError('GENERATION_V2_IDENTITY_INVALID_KIND')
    assertIdentityValue(value)
    return new GenerationV2Identity(IDENTITY_TOKEN, kind, value)
  }

  toJSON(): Readonly<{ kind: K; value: string }> {
    return Object.freeze({ kind: this.kind, value: this.value })
  }
}

Object.freeze(GenerationV2Identity.prototype)

const DIGEST_TOKEN: unique symbol = Symbol('starverse.generation-v2.digest')
const digests = new WeakSet<object>()

export class GenerationV2Digest<K extends GenerationV2DigestKind> {
  private constructor(
    token: typeof DIGEST_TOKEN,
    readonly kind: K,
    readonly value: string,
  ) {
    if (token !== DIGEST_TOKEN) throw new GenerationV2IdentityError('GENERATION_V2_DIGEST_INVALID')
    digests.add(this)
    Object.freeze(this)
  }

  static create<K extends GenerationV2DigestKind>(kind: K, value: string): GenerationV2Digest<K> {
    if (!DIGEST_KINDS.has(kind) || typeof value !== 'string' || !/^[0-9a-f]{64}$/u.test(value)) {
      throw new GenerationV2IdentityError('GENERATION_V2_DIGEST_INVALID')
    }
    return new GenerationV2Digest(DIGEST_TOKEN, kind, value)
  }

  toJSON(): Readonly<{ kind: K; value: string }> {
    return Object.freeze({ kind: this.kind, value: this.value })
  }
}

Object.freeze(GenerationV2Digest.prototype)

function assertIdentityValue(value: string): void {
  if (typeof value !== 'string' || value.length === 0 || value.length > 512 || value.trim() !== value || /[\u0000-\u001f\u007f]/u.test(value)) {
    throw new GenerationV2IdentityError('GENERATION_V2_IDENTITY_INVALID_VALUE')
  }
}

export function isGenerationV2Identity<K extends GenerationV2IdentityKind>(
  value: unknown,
  kind: K,
): value is GenerationV2Identity<K> {
  return Boolean(value && typeof value === 'object' && identities.has(value) &&
    (value as GenerationV2Identity<GenerationV2IdentityKind>).kind === kind)
}

export function isGenerationV2Digest<K extends GenerationV2DigestKind>(
  value: unknown,
  kind: K,
): value is GenerationV2Digest<K> {
  return Boolean(value && typeof value === 'object' && digests.has(value) &&
    (value as GenerationV2Digest<GenerationV2DigestKind>).kind === kind)
}

export function readGenerationV2Identity<K extends GenerationV2IdentityKind>(
  value: GenerationV2Identity<K>,
  kind: K,
): string {
  if (!isGenerationV2Identity(value, kind)) throw new GenerationV2IdentityError('GENERATION_V2_IDENTITY_INVALID_KIND')
  return value.value
}

export function readGenerationV2Digest<K extends GenerationV2DigestKind>(
  value: GenerationV2Digest<K>,
  kind: K,
): string {
  if (!isGenerationV2Digest(value, kind)) throw new GenerationV2IdentityError('GENERATION_V2_DIGEST_INVALID')
  return value.value
}
