import type BetterSqlite3 from 'better-sqlite3'
import { stableSerializeProviderRequestV2 } from '../../../src/next/generation-v2/compiler/stableSerialize'
import {
  GenerationV2Identity,
  GenerationV2IdentityError,
  isGenerationV2Identity,
} from '../../../src/next/generation-v2/domain/identityV2'
import {
  decodeProviderBindingRecordV2,
  ProviderBindingV2Error,
  type DecodedProviderBindingRecordV2,
} from '../../../src/next/generation-v2/domain/providerBindingV2'
import {
  decodeOpenRouterImageDescriptorCacheRecordV2,
  OpenRouterImageDescriptorCacheRecordV2Error,
} from '../../../src/next/generation-v2/providers/openrouter-images/descriptorCacheRecordV2'
import { CanonicalOpenRouterImageDescriptorV2Error } from '../../../src/next/generation-v2/providers/openrouter-images/canonicalDescriptorV2'
import { OPENROUTER_FIRST_PARTY_ENDPOINT_PROFILE_ID_V2 } from '../../../src/next/generation-v2/providers/openrouter/verifiedFirstPartyEndpointProfileV2'
import {
  assertGenerationV2AuthorityTransactionContextV2,
  type GenerationV2AuthorityTransactionContextV2,
} from './generationV2AuthorityTransactionInternal'

const OPERATION = 'image_generate'

type BindingRow = {
  credential_scope_id: unknown
  model_id: unknown
  operation: unknown
  binding_generation: unknown
  provider_id: unknown
  endpoint_profile_id: unknown
  provider_tag: unknown
  provider_slug: unknown
  descriptor_revision: unknown
  descriptor_digest: unknown
  selected_by: unknown
  selected_at_ms: unknown
  protocol_contract_id: unknown
  contract_revision: unknown
  contract_definition_digest: unknown
  registry_revision: unknown
  source_descriptor_row_generation: unknown
  source_endpoint_set_revision: unknown
  updated_at_ms: unknown
}

type BindingRowWithClock = BindingRow & { clock_last_generation: unknown }

type DescriptorRow = {
  credential_scope_id: unknown
  model_id: unknown
  operation: unknown
  row_generation: unknown
  endpoint_set_revision: unknown
  fetched_at_ms: unknown
  descriptor_response_json: unknown
}

export type OpenRouterImageBindingKeyV2 = Readonly<{
  credentialScopeId: GenerationV2Identity<'credential_scope_id'>
  modelId: GenerationV2Identity<'model_id'>
}>

export type OpenRouterImageBindingRepositoryFactV2 = Readonly<{
  trust: 'repository_decoded_unverified'
  bindingGeneration: number
  sourceDescriptorRowGeneration: number
  sourceEndpointSetRevision: GenerationV2Identity<'endpoint_set_revision'>
  selectedAtMs: number
  updatedAtMs: number
  record: DecodedProviderBindingRecordV2
}>

export class OpenRouterImageBindingRepoV2Error extends Error {
  constructor(readonly code:
    | 'GENERATION_V2_OPENROUTER_BINDING_IDENTITY_INVALID'
    | 'GENERATION_V2_OPENROUTER_BINDING_RECORD_INVALID'
    | 'GENERATION_V2_OPENROUTER_BINDING_DESCRIPTOR_STALE'
    | 'GENERATION_V2_OPENROUTER_BINDING_CAS_CONFLICT'
    | 'GENERATION_V2_OPENROUTER_BINDING_STATE_INVALID'
    | 'GENERATION_V2_OPENROUTER_BINDING_GENERATION_EXHAUSTED'
    | 'GENERATION_V2_OPENROUTER_BINDING_CLOCK_INVALID') {
    super(code)
    this.name = 'OpenRouterImageBindingRepoV2Error'
  }
}

const facts = new WeakSet<object>()

function assertKey(key: OpenRouterImageBindingKeyV2): void {
  if (!key || typeof key !== 'object' ||
      !isGenerationV2Identity(key.credentialScopeId, 'credential_scope_id') ||
      !isGenerationV2Identity(key.modelId, 'model_id')) {
    throw new OpenRouterImageBindingRepoV2Error('GENERATION_V2_OPENROUTER_BINDING_IDENTITY_INVALID')
  }
}

function safePositive(value: unknown): number {
  if (!Number.isSafeInteger(value) || (value as number) <= 0) {
    throw new OpenRouterImageBindingRepoV2Error('GENERATION_V2_OPENROUTER_BINDING_STATE_INVALID')
  }
  return value as number
}

function decodeInputRecord(value: unknown): DecodedProviderBindingRecordV2 {
  let record: DecodedProviderBindingRecordV2
  try { record = decodeProviderBindingRecordV2(value) } catch (error) {
    if (error instanceof ProviderBindingV2Error || error instanceof GenerationV2IdentityError) {
      throw new OpenRouterImageBindingRepoV2Error('GENERATION_V2_OPENROUTER_BINDING_RECORD_INVALID')
    }
    throw error
  }
  if (record.providerId.value !== 'openrouter' || record.operation !== OPERATION ||
      record.endpointProfileId.value !== OPENROUTER_FIRST_PARTY_ENDPOINT_PROFILE_ID_V2 ||
      record.protocolContractId.value !== 'openrouter-images-v1' ||
      record.endpointBinding.kind !== 'pinned' || record.endpointBinding.selector.kind !== 'openrouter_images_v1' ||
      record.endpointBinding.selector.descriptorRevision.value !==
        `openrouter-images-descriptor-v1:${record.endpointBinding.selector.descriptorDigest.value}`) {
    throw new OpenRouterImageBindingRepoV2Error('GENERATION_V2_OPENROUTER_BINDING_RECORD_INVALID')
  }
  return record
}

function decodeRow(row: BindingRow): OpenRouterImageBindingRepositoryFactV2 {
  const bindingGeneration = safePositive(row.binding_generation)
  const sourceDescriptorRowGeneration = safePositive(row.source_descriptor_row_generation)
  if (row.operation !== OPERATION || row.provider_id !== 'openrouter' ||
      typeof row.selected_at_ms !== 'number' || !Number.isSafeInteger(row.selected_at_ms) || row.selected_at_ms < 0 ||
      typeof row.updated_at_ms !== 'number' || !Number.isSafeInteger(row.updated_at_ms) || row.updated_at_ms < row.selected_at_ms ||
      typeof row.source_endpoint_set_revision !== 'string' ||
      !/^openrouter-images-set-v1:[0-9a-f]{64}$/u.test(row.source_endpoint_set_revision)) {
    throw new OpenRouterImageBindingRepoV2Error('GENERATION_V2_OPENROUTER_BINDING_STATE_INVALID')
  }
  let record: DecodedProviderBindingRecordV2
  try {
    record = decodeInputRecord({
      credentialScopeId: row.credential_scope_id,
      providerId: row.provider_id,
      endpointProfileId: row.endpoint_profile_id,
      endpointBinding: {
        kind: 'pinned',
        selector: {
          kind: 'openrouter_images_v1',
          providerTag: row.provider_tag,
          providerSlug: row.provider_slug,
          descriptorRevision: row.descriptor_revision,
          descriptorDigest: row.descriptor_digest,
          selectedBy: row.selected_by,
          selectedAt: new Date(row.selected_at_ms).toISOString(),
        },
      },
      protocolContractId: row.protocol_contract_id,
      contractRevision: row.contract_revision,
      contractDefinitionDigest: row.contract_definition_digest,
      registryRevision: row.registry_revision,
      modelId: row.model_id,
      operation: row.operation,
    })
  } catch (error) {
    if (error instanceof RangeError || error instanceof OpenRouterImageBindingRepoV2Error ||
        error instanceof GenerationV2IdentityError) {
      throw new OpenRouterImageBindingRepoV2Error('GENERATION_V2_OPENROUTER_BINDING_STATE_INVALID')
    }
    throw error
  }
  const fact = Object.freeze({
    trust: 'repository_decoded_unverified' as const,
    bindingGeneration,
    sourceDescriptorRowGeneration,
    sourceEndpointSetRevision: GenerationV2Identity.create(
      'endpoint_set_revision',
      row.source_endpoint_set_revision,
    ),
    selectedAtMs: row.selected_at_ms,
    updatedAtMs: row.updated_at_ms,
    record,
  })
  facts.add(fact)
  return fact
}

type PersistedSelectorProjection = Readonly<{
  [K in keyof Extract<DecodedProviderBindingRecordV2['endpointBinding'], { kind: 'pinned' }>['selector']]-?: string
}>

type PersistedRecordProjection = Readonly<{
  [K in Exclude<keyof DecodedProviderBindingRecordV2, 'trust' | 'endpointBinding'>]-?: string
}> & Readonly<{
  endpointBinding: Readonly<{ kind: 'pinned'; selector: PersistedSelectorProjection }>
}>

const nonPersistedRecordKeysAreClosed:
  Exclude<keyof DecodedProviderBindingRecordV2, keyof PersistedRecordProjection | 'trust'> extends never
    ? true : never = true
void nonPersistedRecordKeysAreClosed

function persistedRecordProjection(record: DecodedProviderBindingRecordV2): PersistedRecordProjection | null {
  if (record.endpointBinding.kind !== 'pinned') return null
  const selector = record.endpointBinding.selector
  const selectorProjection = {
    kind: selector.kind,
    providerTag: selector.providerTag.value,
    providerSlug: selector.providerSlug.value,
    descriptorRevision: selector.descriptorRevision.value,
    descriptorDigest: selector.descriptorDigest.value,
    selectedBy: selector.selectedBy,
    selectedAt: selector.selectedAt,
  } satisfies PersistedSelectorProjection
  return {
    credentialScopeId: record.credentialScopeId.value,
    providerId: record.providerId.value,
    endpointProfileId: record.endpointProfileId.value,
    endpointBinding: { kind: 'pinned', selector: selectorProjection },
    protocolContractId: record.protocolContractId.value,
    contractRevision: record.contractRevision.value,
    contractDefinitionDigest: record.contractDefinitionDigest.value,
    registryRevision: record.registryRevision.value,
    modelId: record.modelId.value,
    operation: record.operation,
  } satisfies PersistedRecordProjection
}

function exactRecordMatch(
  left: DecodedProviderBindingRecordV2,
  right: DecodedProviderBindingRecordV2,
): boolean {
  const leftProjection = persistedRecordProjection(left)
  const rightProjection = persistedRecordProjection(right)
  return leftProjection !== null && rightProjection !== null &&
    stableSerializeProviderRequestV2(leftProjection) === stableSerializeProviderRequestV2(rightProjection)
}

export function isOpenRouterImageBindingRepositoryFactV2(
  value: unknown,
): value is OpenRouterImageBindingRepositoryFactV2 {
  return Boolean(value && typeof value === 'object' && facts.has(value))
}

export class OpenRouterImageBindingRepo {
  constructor(
    private readonly db: BetterSqlite3.Database,
    private readonly nowMs: () => number = Date.now,
  ) {}

  getBinding(key: OpenRouterImageBindingKeyV2): OpenRouterImageBindingRepositoryFactV2 | null {
    assertKey(key)
    const row = this.bindingRowWithClock(key.credentialScopeId.value, key.modelId.value)
    if (!row) return null
    const fact = decodeRow(row)
    if (safePositive(row.clock_last_generation) !== fact.bindingGeneration) {
      throw new OpenRouterImageBindingRepoV2Error('GENERATION_V2_OPENROUTER_BINDING_STATE_INVALID')
    }
    return fact
  }

  compareAndSetBinding(input: Readonly<{
    record: unknown
    expectedBindingGeneration: number | null
    expectedDescriptorRowGeneration: number
  }>): OpenRouterImageBindingRepositoryFactV2 {
    return this.runImmediate(this.db.transaction(() => this.compareAndSetBindingInCurrentTransaction(input)))
  }

  /**
   * Performs the CAS in the caller-owned transaction. This is deliberately
   * separate from the public standalone entrypoint: generation commands must
   * not create a nested savepoint while assembling their graph, snapshot,
   * request and endpoint binding as one authority transaction.
   */
  private compareAndSetBindingInCurrentTransaction(input: Readonly<{
    record: unknown
    expectedBindingGeneration: number | null
    expectedDescriptorRowGeneration: number
  }>): OpenRouterImageBindingRepositoryFactV2 {
    const record = decodeInputRecord(input.record)
    const key = { credentialScopeId: record.credentialScopeId, modelId: record.modelId }
    assertKey(key)
    if (input.expectedBindingGeneration !== null &&
        (!Number.isSafeInteger(input.expectedBindingGeneration) || input.expectedBindingGeneration <= 0)) {
      throw new OpenRouterImageBindingRepoV2Error('GENERATION_V2_OPENROUTER_BINDING_CAS_CONFLICT')
    }
    if (!Number.isSafeInteger(input.expectedDescriptorRowGeneration) || input.expectedDescriptorRowGeneration <= 0) {
      throw new OpenRouterImageBindingRepoV2Error('GENERATION_V2_OPENROUTER_BINDING_DESCRIPTOR_STALE')
    }
      const descriptor = this.currentDescriptor(key.credentialScopeId.value, key.modelId.value)
      if (!descriptor || descriptor.rowGeneration !== input.expectedDescriptorRowGeneration) {
        throw new OpenRouterImageBindingRepoV2Error('GENERATION_V2_OPENROUTER_BINDING_DESCRIPTOR_STALE')
      }
      const selector = record.endpointBinding.kind === 'pinned' ? record.endpointBinding.selector : null
      const target = selector && descriptor.descriptorSet.descriptors.find((candidate) =>
        candidate.providerTag.value === selector.providerTag.value)
      if (!selector || !target || target.providerSlug.value !== selector.providerSlug.value ||
          target.descriptorRevision.value !== selector.descriptorRevision.value ||
          target.descriptorDigest.value !== selector.descriptorDigest.value) {
        throw new OpenRouterImageBindingRepoV2Error('GENERATION_V2_OPENROUTER_BINDING_DESCRIPTOR_STALE')
      }
      const current = this.bindingRow(key.credentialScopeId.value, key.modelId.value)
      const clock = this.clockGeneration(key.credentialScopeId.value, key.modelId.value)
      if (current) {
        const currentFact = decodeRow(current)
        if (input.expectedBindingGeneration === null ||
            currentFact.bindingGeneration !== input.expectedBindingGeneration) {
          throw new OpenRouterImageBindingRepoV2Error('GENERATION_V2_OPENROUTER_BINDING_CAS_CONFLICT')
        }
        if (clock !== currentFact.bindingGeneration) {
          throw new OpenRouterImageBindingRepoV2Error('GENERATION_V2_OPENROUTER_BINDING_STATE_INVALID')
        }
      } else if (input.expectedBindingGeneration !== null) {
        throw new OpenRouterImageBindingRepoV2Error('GENERATION_V2_OPENROUTER_BINDING_CAS_CONFLICT')
      }
      const now = this.nowMs()
      if (!Number.isSafeInteger(now) || now < 0) {
        throw new OpenRouterImageBindingRepoV2Error('GENERATION_V2_OPENROUTER_BINDING_CLOCK_INVALID')
      }
      const priorGeneration = clock ?? 0
      if (priorGeneration >= Number.MAX_SAFE_INTEGER) {
        throw new OpenRouterImageBindingRepoV2Error('GENERATION_V2_OPENROUTER_BINDING_GENERATION_EXHAUSTED')
      }
      const bindingGeneration = priorGeneration + 1
      this.advanceClock(key, clock, bindingGeneration)
      const selectedAtMs = Date.parse(selector.selectedAt)
      const updatedAtMs = Math.max(now, selectedAtMs)
      const values = [
        key.credentialScopeId.value, key.modelId.value, OPERATION, bindingGeneration,
        record.providerId.value, record.endpointProfileId.value,
        selector.providerTag.value, selector.providerSlug.value,
        selector.descriptorRevision.value, selector.descriptorDigest.value,
        selector.selectedBy, selectedAtMs,
        record.protocolContractId.value, record.contractRevision.value,
        record.contractDefinitionDigest.value, record.registryRevision.value,
        descriptor.rowGeneration, descriptor.endpointSetRevision.value, updatedAtMs,
      ] as const
      const write = current
        ? this.db.prepare(`
          UPDATE openrouter_image_endpoint_bindings SET
            binding_generation = ?, provider_id = ?, endpoint_profile_id = ?, provider_tag = ?, provider_slug = ?,
            descriptor_revision = ?, descriptor_digest = ?, selected_by = ?, selected_at_ms = ?,
            protocol_contract_id = ?, contract_revision = ?, contract_definition_digest = ?, registry_revision = ?,
            source_descriptor_row_generation = ?, source_endpoint_set_revision = ?, updated_at_ms = ?
          WHERE credential_scope_id = ? AND model_id = ? AND operation = ? AND binding_generation = ?
        `).run(...values.slice(3), values[0], values[1], OPERATION, input.expectedBindingGeneration)
        : this.db.prepare(`
          INSERT INTO openrouter_image_endpoint_bindings (
            credential_scope_id, model_id, operation, binding_generation, provider_id, endpoint_profile_id,
            provider_tag, provider_slug, descriptor_revision, descriptor_digest, selected_by, selected_at_ms,
            protocol_contract_id, contract_revision, contract_definition_digest, registry_revision,
            source_descriptor_row_generation, source_endpoint_set_revision, updated_at_ms
          ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
          ON CONFLICT(credential_scope_id, model_id, operation) DO NOTHING
        `).run(...values)
      if (write.changes !== 1) {
        throw new OpenRouterImageBindingRepoV2Error('GENERATION_V2_OPENROUTER_BINDING_CAS_CONFLICT')
      }
      const persisted = this.getBinding(key)
      if (!persisted || persisted.bindingGeneration !== bindingGeneration ||
          persisted.sourceDescriptorRowGeneration !== descriptor.rowGeneration ||
          persisted.sourceEndpointSetRevision.value !== descriptor.endpointSetRevision.value ||
          !exactRecordMatch(persisted.record, record)) {
        throw new OpenRouterImageBindingRepoV2Error('GENERATION_V2_OPENROUTER_BINDING_STATE_INVALID')
      }
      return persisted
  }

  /**
   * Command-only CAS under the sole V2 authority transaction owner.
   */
  compareAndSetBindingInAuthorityTransaction(
    context: GenerationV2AuthorityTransactionContextV2,
    input: Readonly<{
      record: unknown
      expectedBindingGeneration: number | null
      expectedDescriptorRowGeneration: number
    }>,
  ): OpenRouterImageBindingRepositoryFactV2 {
    assertGenerationV2AuthorityTransactionContextV2(context, this.db)
    return this.compareAndSetBindingInCurrentTransaction(input)
  }

  deleteBinding(input: Readonly<{
    key: OpenRouterImageBindingKeyV2
    expectedBindingGeneration: number
  }>): Readonly<{ deletedBindingGeneration: number; nextBindingGeneration: number }> {
    assertKey(input.key)
    if (!Number.isSafeInteger(input.expectedBindingGeneration) || input.expectedBindingGeneration <= 0) {
      throw new OpenRouterImageBindingRepoV2Error('GENERATION_V2_OPENROUTER_BINDING_CAS_CONFLICT')
    }
    const transaction = this.db.transaction(() => {
      const current = this.bindingRow(input.key.credentialScopeId.value, input.key.modelId.value)
      if (!current) throw new OpenRouterImageBindingRepoV2Error('GENERATION_V2_OPENROUTER_BINDING_CAS_CONFLICT')
      const fact = decodeRow(current)
      const clock = this.clockGeneration(input.key.credentialScopeId.value, input.key.modelId.value)
      if (fact.bindingGeneration !== input.expectedBindingGeneration) {
        throw new OpenRouterImageBindingRepoV2Error('GENERATION_V2_OPENROUTER_BINDING_CAS_CONFLICT')
      }
      if (clock !== fact.bindingGeneration) {
        throw new OpenRouterImageBindingRepoV2Error('GENERATION_V2_OPENROUTER_BINDING_STATE_INVALID')
      }
      if (clock >= Number.MAX_SAFE_INTEGER) {
        throw new OpenRouterImageBindingRepoV2Error('GENERATION_V2_OPENROUTER_BINDING_GENERATION_EXHAUSTED')
      }
      const nextBindingGeneration = clock + 1
      this.advanceClock(input.key, clock, nextBindingGeneration)
      const result = this.db.prepare(`
        DELETE FROM openrouter_image_endpoint_bindings
        WHERE credential_scope_id = ? AND model_id = ? AND operation = ? AND binding_generation = ?
      `).run(
        input.key.credentialScopeId.value,
        input.key.modelId.value,
        OPERATION,
        input.expectedBindingGeneration,
      )
      if (result.changes !== 1) {
        throw new OpenRouterImageBindingRepoV2Error('GENERATION_V2_OPENROUTER_BINDING_CAS_CONFLICT')
      }
      return Object.freeze({ deletedBindingGeneration: fact.bindingGeneration, nextBindingGeneration })
    })
    return this.runImmediate(transaction)
  }

  private currentDescriptor(credentialScopeId: string, modelId: string) {
    const row = this.db.prepare(`
      SELECT credential_scope_id, model_id, operation, row_generation,
             endpoint_set_revision, fetched_at_ms, descriptor_response_json
      FROM openrouter_image_endpoint_descriptor_sets
      WHERE credential_scope_id = ? AND model_id = ? AND operation = ?
    `).get(credentialScopeId, modelId, OPERATION) as DescriptorRow | undefined
    if (!row) return null
    try { return decodeOpenRouterImageDescriptorCacheRecordV2(row) } catch (error) {
      if (error instanceof OpenRouterImageDescriptorCacheRecordV2Error ||
          error instanceof CanonicalOpenRouterImageDescriptorV2Error ||
          error instanceof GenerationV2IdentityError) {
        throw new OpenRouterImageBindingRepoV2Error('GENERATION_V2_OPENROUTER_BINDING_STATE_INVALID')
      }
      throw error
    }
  }

  private bindingRow(credentialScopeId: string, modelId: string): BindingRow | undefined {
    return this.db.prepare(`
      SELECT credential_scope_id, model_id, operation, binding_generation, provider_id, endpoint_profile_id,
             provider_tag, provider_slug, descriptor_revision, descriptor_digest, selected_by, selected_at_ms,
             protocol_contract_id, contract_revision, contract_definition_digest, registry_revision,
             source_descriptor_row_generation, source_endpoint_set_revision, updated_at_ms
      FROM openrouter_image_endpoint_bindings
      WHERE credential_scope_id = ? AND model_id = ? AND operation = ?
    `).get(credentialScopeId, modelId, OPERATION) as BindingRow | undefined
  }

  private bindingRowWithClock(credentialScopeId: string, modelId: string): BindingRowWithClock | undefined {
    return this.db.prepare(`
      SELECT b.credential_scope_id, b.model_id, b.operation, b.binding_generation,
             b.provider_id, b.endpoint_profile_id, b.provider_tag, b.provider_slug,
             b.descriptor_revision, b.descriptor_digest, b.selected_by, b.selected_at_ms,
             b.protocol_contract_id, b.contract_revision, b.contract_definition_digest, b.registry_revision,
             b.source_descriptor_row_generation, b.source_endpoint_set_revision, b.updated_at_ms,
             c.last_generation AS clock_last_generation
      FROM openrouter_image_endpoint_bindings AS b
      LEFT JOIN openrouter_image_endpoint_binding_generation_clock AS c
        ON c.credential_scope_id = b.credential_scope_id
       AND c.model_id = b.model_id
       AND c.operation = b.operation
      WHERE b.credential_scope_id = ? AND b.model_id = ? AND b.operation = ?
    `).get(credentialScopeId, modelId, OPERATION) as BindingRowWithClock | undefined
  }

  private clockGeneration(credentialScopeId: string, modelId: string): number | null {
    const row = this.db.prepare(`
      SELECT last_generation FROM openrouter_image_endpoint_binding_generation_clock
      WHERE credential_scope_id = ? AND model_id = ? AND operation = ?
    `).get(credentialScopeId, modelId, OPERATION) as { last_generation: unknown } | undefined
    if (!row) return null
    return safePositive(row.last_generation)
  }

  private advanceClock(key: OpenRouterImageBindingKeyV2, current: number | null, next: number): void {
    const result = current === null
      ? this.db.prepare(`
        INSERT INTO openrouter_image_endpoint_binding_generation_clock (
          credential_scope_id, model_id, operation, last_generation
        ) VALUES (?, ?, ?, ?) ON CONFLICT(credential_scope_id, model_id, operation) DO NOTHING
      `).run(key.credentialScopeId.value, key.modelId.value, OPERATION, next)
      : this.db.prepare(`
        UPDATE openrouter_image_endpoint_binding_generation_clock SET last_generation = ?
        WHERE credential_scope_id = ? AND model_id = ? AND operation = ? AND last_generation = ?
      `).run(next, key.credentialScopeId.value, key.modelId.value, OPERATION, current)
    if (result.changes !== 1) {
      throw new OpenRouterImageBindingRepoV2Error('GENERATION_V2_OPENROUTER_BINDING_CAS_CONFLICT')
    }
  }

  private runImmediate<T>(transaction: { immediate(): T }): T {
    try { return transaction.immediate() } catch (error) {
      if (error instanceof OpenRouterImageBindingRepoV2Error) throw error
      const code = (error as { code?: unknown })?.code
      if (code === 'SQLITE_BUSY' || code === 'SQLITE_BUSY_SNAPSHOT' || code === 'SQLITE_LOCKED') {
        throw new OpenRouterImageBindingRepoV2Error('GENERATION_V2_OPENROUTER_BINDING_CAS_CONFLICT')
      }
      throw error
    }
  }
}
