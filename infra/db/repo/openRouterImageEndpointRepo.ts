import type BetterSqlite3 from 'better-sqlite3'
import {
  decodeOpenRouterImageEndpointResponse,
  OPENROUTER_IMAGE_OPERATION,
  type OpenRouterImageDescriptorSet,
  type OpenRouterImageEndpointDescriptor,
  type OpenRouterImageIntent,
} from '../../../src/next/openrouter/images/endpointContract'
import {
  createUserOpenRouterImageBinding,
  resolveOpenRouterImageBinding,
  type OpenRouterImageBindingResolution,
  type OpenRouterImageEndpointBinding,
} from '../../../src/next/openrouter/images/bindingResolver'

type DescriptorSetRow = {
  credential_scope: string
  model_id: string
  revision: string
  fetched_at_ms: number
  hard_expires_at_ms: number
  descriptors_json: string
}

type BindingRow = {
  credential_scope: string
  model_id: string
  provider_tag: string
  provider_slug: string
  descriptor_revision: string
  selected_by: 'user' | 'sole_eligible'
  provider_options_json: string
}

function requireKey(value: unknown, name: string): string {
  const normalized = String(value ?? '').trim()
  if (!normalized) throw new Error(`${name} must be non-empty`)
  return normalized
}

function descriptorsToWire(descriptors: readonly OpenRouterImageEndpointDescriptor[]): unknown[] {
  return descriptors.map((descriptor) => descriptor.raw)
}

export class OpenRouterImageEndpointRepo {
  constructor(private readonly db: BetterSqlite3.Database) {}

  replaceCompleteDescriptorSet(
    set: OpenRouterImageDescriptorSet,
    expectedRevision: string | null,
  ): OpenRouterImageDescriptorSet {
    const credentialScope = requireKey(set.credentialScope, 'credentialScope')
    const modelId = requireKey(set.modelId, 'modelId')
    const revision = requireKey(set.revision, 'revision')
    if (!Number.isInteger(set.fetchedAtMs) || set.fetchedAtMs < 0) throw new Error('fetchedAtMs must be a non-negative integer')
    if (!Number.isInteger(set.hardExpiresAtMs) || set.hardExpiresAtMs <= set.fetchedAtMs) throw new Error('hardExpiresAtMs must be greater than fetchedAtMs')
    // Re-run the strict codec before replacing a previously successful set.
    const descriptors = decodeOpenRouterImageEndpointResponse({ data: descriptorsToWire(set.descriptors) })
    const descriptorsJson = JSON.stringify(descriptorsToWire(descriptors))
    this.db.transaction(() => {
      const current = this.db.prepare(`
        SELECT revision FROM openrouter_image_endpoint_descriptor_sets
        WHERE credential_scope = ? AND model_id = ? AND operation = ?
      `).get(credentialScope, modelId, OPENROUTER_IMAGE_OPERATION) as { revision: string } | undefined
      if ((current?.revision ?? null) !== expectedRevision) {
        throw new Error('OPENROUTER_IMAGE_DESCRIPTOR_REFRESH_STALE')
      }
      this.db.prepare(`
        INSERT INTO openrouter_image_endpoint_descriptor_sets (
          credential_scope, model_id, operation, revision, fetched_at_ms,
          hard_expires_at_ms, descriptors_json
        ) VALUES (?, ?, ?, ?, ?, ?, ?)
        ON CONFLICT(credential_scope, model_id, operation) DO UPDATE SET
          revision = excluded.revision,
          fetched_at_ms = excluded.fetched_at_ms,
          hard_expires_at_ms = excluded.hard_expires_at_ms,
          descriptors_json = excluded.descriptors_json
      `).run(credentialScope, modelId, OPENROUTER_IMAGE_OPERATION, revision, set.fetchedAtMs, set.hardExpiresAtMs, descriptorsJson)
      this.db.prepare(`
        INSERT INTO openrouter_image_endpoint_descriptor_history (
          credential_scope, model_id, operation, revision, fetched_at_ms,
          hard_expires_at_ms, descriptors_json
        ) VALUES (?, ?, ?, ?, ?, ?, ?)
        ON CONFLICT(credential_scope, model_id, operation, revision) DO NOTHING
      `).run(credentialScope, modelId, OPENROUTER_IMAGE_OPERATION, revision, set.fetchedAtMs, set.hardExpiresAtMs, descriptorsJson)
      this.db.prepare(`DELETE FROM openrouter_image_endpoint_descriptor_history WHERE fetched_at_ms < ?`)
        .run(set.fetchedAtMs - 90 * 24 * 60 * 60 * 1_000)
    })()
    return this.getDescriptorSet(credentialScope, modelId)!
  }

  getDescriptorSet(credentialScope: unknown, modelId: unknown): OpenRouterImageDescriptorSet | null {
    const scope = requireKey(credentialScope, 'credentialScope')
    const model = requireKey(modelId, 'modelId')
    const row = this.db.prepare(`
      SELECT credential_scope, model_id, revision, fetched_at_ms, hard_expires_at_ms, descriptors_json
      FROM openrouter_image_endpoint_descriptor_sets
      WHERE credential_scope = ? AND model_id = ? AND operation = ?
    `).get(scope, model, OPENROUTER_IMAGE_OPERATION) as DescriptorSetRow | undefined
    if (!row) return null
    return {
      credentialScope: row.credential_scope,
      modelId: row.model_id,
      revision: row.revision,
      fetchedAtMs: row.fetched_at_ms,
      hardExpiresAtMs: row.hard_expires_at_ms,
      descriptors: decodeOpenRouterImageEndpointResponse({ data: JSON.parse(row.descriptors_json) }),
    }
  }

  invalidateDescriptorSet(credentialScope: unknown, modelId: unknown, expectedRevision: unknown): boolean {
    const scope = requireKey(credentialScope, 'credentialScope')
    const model = requireKey(modelId, 'modelId')
    const revision = requireKey(expectedRevision, 'expectedRevision')
    const result = this.db.prepare(`
      DELETE FROM openrouter_image_endpoint_descriptor_sets
      WHERE credential_scope = ? AND model_id = ? AND operation = ? AND revision = ?
    `).run(scope, model, OPENROUTER_IMAGE_OPERATION, revision)
    return result.changes > 0
  }

  getBinding(credentialScope: unknown, modelId: unknown): OpenRouterImageEndpointBinding | null {
    const scope = requireKey(credentialScope, 'credentialScope')
    const model = requireKey(modelId, 'modelId')
    const row = this.db.prepare(`
      SELECT credential_scope, model_id, provider_tag, provider_slug,
             descriptor_revision, selected_by, provider_options_json
      FROM openrouter_image_endpoint_bindings
      WHERE credential_scope = ? AND model_id = ? AND operation = ?
    `).get(scope, model, OPENROUTER_IMAGE_OPERATION) as BindingRow | undefined
    return row ? {
      credentialScope: row.credential_scope,
      modelId: row.model_id,
      operation: OPENROUTER_IMAGE_OPERATION,
      providerTag: row.provider_tag,
      providerSlug: row.provider_slug,
      descriptorRevision: row.descriptor_revision,
      selectedBy: row.selected_by,
      providerOptions: JSON.parse(row.provider_options_json) as Record<string, unknown>,
    } : null
  }

  resolveOrAutoBind(input: Readonly<{
    credentialScope: string
    modelId: string
    intent: OpenRouterImageIntent
    nowMs: number
  }>): OpenRouterImageBindingResolution {
    return this.db.transaction(() => {
      const set = this.getDescriptorSet(input.credentialScope, input.modelId)
      if (!set) throw new Error('OPENROUTER_IMAGE_ENDPOINT_STALE')
      const resolution = resolveOpenRouterImageBinding({
        descriptorSet: set,
        binding: this.getBinding(input.credentialScope, input.modelId),
        intent: input.intent,
        nowMs: input.nowMs,
      })
      if (resolution.shouldPersist) this.persistBinding(resolution.binding, input.nowMs)
      return resolution
    })()
  }

  bindUserSelection(input: Readonly<{
    credentialScope: string
    modelId: string
    providerTag: string
    intent: OpenRouterImageIntent
    nowMs: number
  }>): OpenRouterImageEndpointBinding {
    return this.db.transaction(() => {
      const set = this.getDescriptorSet(input.credentialScope, input.modelId)
      if (!set || input.nowMs >= set.hardExpiresAtMs) throw new Error('OPENROUTER_IMAGE_ENDPOINT_STALE')
      const binding = createUserOpenRouterImageBinding({
        descriptorSet: set,
        providerTag: input.providerTag,
        intent: input.intent,
      })
      this.persistBinding(binding, input.nowMs)
      return binding
    })()
  }

  private persistBinding(binding: OpenRouterImageEndpointBinding, updatedAtMs: number): void {
    this.db.prepare(`
      INSERT INTO openrouter_image_endpoint_bindings (
        credential_scope, model_id, operation, provider_tag, provider_slug,
        descriptor_revision, selected_by, provider_options_json, updated_at_ms
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
      ON CONFLICT(credential_scope, model_id, operation) DO UPDATE SET
        provider_tag = excluded.provider_tag,
        provider_slug = excluded.provider_slug,
        descriptor_revision = excluded.descriptor_revision,
        selected_by = excluded.selected_by,
        provider_options_json = excluded.provider_options_json,
        updated_at_ms = excluded.updated_at_ms
    `).run(
      binding.credentialScope,
      binding.modelId,
      binding.operation,
      binding.providerTag,
      binding.providerSlug,
      binding.descriptorRevision,
      binding.selectedBy,
      JSON.stringify(binding.providerOptions),
      updatedAtMs,
    )
  }
}
