import type BetterSqlite3 from 'better-sqlite3'
import { stableSerializeProviderRequestV2 } from '../../../src/next/generation-v2/compiler/stableSerialize'
import { isGenerationV2Identity, type GenerationV2Identity } from '../../../src/next/generation-v2/domain/identityV2'
import {
  decodeCanonicalOpenRouterImageDescriptorSetV2,
  OPENROUTER_IMAGE_DESCRIPTOR_CACHE_MAX_BYTES_V2,
  projectCanonicalOpenRouterImageDescriptorSetForCacheV2,
} from '../../../src/next/generation-v2/providers/openrouter-images/canonicalDescriptorV2'
import {
  decodeOpenRouterImageDescriptorCacheRecordV2,
  type DecodedOpenRouterImageDescriptorCacheRecordV2,
} from '../../../src/next/generation-v2/providers/openrouter-images/descriptorCacheRecordV2'

const OPERATION = 'image_generate'
const HISTORY_RETENTION_MS = 90 * 24 * 60 * 60 * 1_000

type DescriptorSetRow = {
  credential_scope_id: string
  model_id: string
  operation: string
  row_generation: number
  endpoint_set_revision: string
  fetched_at_ms: number
  descriptor_response_json: string
}

type DescriptorGenerationClockRow = {
  last_generation: unknown
}

export class OpenRouterImageEndpointRepoV2Error extends Error {
  constructor(readonly code:
    | 'GENERATION_V2_OPENROUTER_CACHE_IDENTITY_INVALID'
    | 'GENERATION_V2_OPENROUTER_CACHE_MODEL_MISMATCH'
    | 'GENERATION_V2_OPENROUTER_CACHE_RESPONSE_TOO_LARGE'
    | 'GENERATION_V2_OPENROUTER_CACHE_CAS_CONFLICT'
    | 'GENERATION_V2_OPENROUTER_CACHE_STATE_INVALID'
    | 'GENERATION_V2_OPENROUTER_CACHE_GENERATION_EXHAUSTED'
    | 'GENERATION_V2_OPENROUTER_CACHE_CLOCK_REGRESSION') {
    super(code)
    this.name = 'OpenRouterImageEndpointRepoV2Error'
  }
}

function assertIdentity<K extends 'credential_scope_id' | 'model_id'>(
  value: GenerationV2Identity<K>,
  kind: K,
): void {
  if (!isGenerationV2Identity(value, kind)) {
    throw new OpenRouterImageEndpointRepoV2Error('GENERATION_V2_OPENROUTER_CACHE_IDENTITY_INVALID')
  }
}

export class OpenRouterImageEndpointRepo {
  constructor(
    private readonly db: BetterSqlite3.Database,
    private readonly nowMs: () => number = Date.now,
  ) {}

  commitSuccessfulDescriptorResponse(input: Readonly<{
    credentialScopeId: GenerationV2Identity<'credential_scope_id'>
    requestedModelId: GenerationV2Identity<'model_id'>
    response: unknown
    expectedGeneration: number | null
  }>): DecodedOpenRouterImageDescriptorCacheRecordV2 {
    assertIdentity(input.credentialScopeId, 'credential_scope_id')
    assertIdentity(input.requestedModelId, 'model_id')
    if (input.expectedGeneration !== null &&
        (!Number.isSafeInteger(input.expectedGeneration) || input.expectedGeneration <= 0)) {
      throw new OpenRouterImageEndpointRepoV2Error('GENERATION_V2_OPENROUTER_CACHE_CAS_CONFLICT')
    }
    const descriptorSet = decodeCanonicalOpenRouterImageDescriptorSetV2(input.response)
    if (descriptorSet.modelId.value !== input.requestedModelId.value) {
      throw new OpenRouterImageEndpointRepoV2Error('GENERATION_V2_OPENROUTER_CACHE_MODEL_MISMATCH')
    }
    const responseJson = stableSerializeProviderRequestV2(projectCanonicalOpenRouterImageDescriptorSetForCacheV2(descriptorSet))
    if (Buffer.byteLength(responseJson, 'utf8') > OPENROUTER_IMAGE_DESCRIPTOR_CACHE_MAX_BYTES_V2) {
      throw new OpenRouterImageEndpointRepoV2Error('GENERATION_V2_OPENROUTER_CACHE_RESPONSE_TOO_LARGE')
    }
    const fetchedAtMs = this.nowMs()
    if (!Number.isSafeInteger(fetchedAtMs) || fetchedAtMs < 0) {
      throw new OpenRouterImageEndpointRepoV2Error('GENERATION_V2_OPENROUTER_CACHE_CLOCK_REGRESSION')
    }

    const transaction = this.db.transaction(() => {
      const current = this.currentRow(input.credentialScopeId.value, input.requestedModelId.value)
      const clock = this.generationClockRow(input.credentialScopeId.value, input.requestedModelId.value)
      const lastGeneration = clock?.last_generation
      if (clock && (!Number.isSafeInteger(lastGeneration) || (lastGeneration as number) <= 0)) {
        throw new OpenRouterImageEndpointRepoV2Error('GENERATION_V2_OPENROUTER_CACHE_STATE_INVALID')
      }
      const highestHistoryGeneration = this.highestHistoryGeneration(
        input.credentialScopeId.value,
        input.requestedModelId.value,
      )
      if (highestHistoryGeneration !== null &&
          (!clock || highestHistoryGeneration > (lastGeneration as number))) {
        throw new OpenRouterImageEndpointRepoV2Error('GENERATION_V2_OPENROUTER_CACHE_STATE_INVALID')
      }
      if (current) {
        if (input.expectedGeneration === null || current.row_generation !== input.expectedGeneration) {
          throw new OpenRouterImageEndpointRepoV2Error('GENERATION_V2_OPENROUTER_CACHE_CAS_CONFLICT')
        }
        if (!clock || lastGeneration !== current.row_generation) {
          throw new OpenRouterImageEndpointRepoV2Error('GENERATION_V2_OPENROUTER_CACHE_STATE_INVALID')
        }
        if (fetchedAtMs < current.fetched_at_ms) {
          throw new OpenRouterImageEndpointRepoV2Error('GENERATION_V2_OPENROUTER_CACHE_CLOCK_REGRESSION')
        }
      } else if (input.expectedGeneration !== null) {
        throw new OpenRouterImageEndpointRepoV2Error('GENERATION_V2_OPENROUTER_CACHE_CAS_CONFLICT')
      }
      const priorGeneration = clock ? lastGeneration as number : 0
      if (priorGeneration >= Number.MAX_SAFE_INTEGER) {
        throw new OpenRouterImageEndpointRepoV2Error('GENERATION_V2_OPENROUTER_CACHE_GENERATION_EXHAUSTED')
      }
      const rowGeneration = priorGeneration + 1
      const clockResult = clock
        ? this.db.prepare(`
          UPDATE openrouter_image_endpoint_descriptor_generation_clock
          SET last_generation = ?
          WHERE credential_scope_id = ? AND model_id = ? AND operation = ? AND last_generation = ?
        `).run(
          rowGeneration,
          input.credentialScopeId.value,
          input.requestedModelId.value,
          OPERATION,
          priorGeneration,
        )
        : this.db.prepare(`
          INSERT INTO openrouter_image_endpoint_descriptor_generation_clock (
            credential_scope_id, model_id, operation, last_generation
          ) VALUES (?, ?, ?, ?)
          ON CONFLICT(credential_scope_id, model_id, operation) DO NOTHING
        `).run(input.credentialScopeId.value, input.requestedModelId.value, OPERATION, rowGeneration)
      if (clockResult.changes !== 1) {
        throw new OpenRouterImageEndpointRepoV2Error('GENERATION_V2_OPENROUTER_CACHE_CAS_CONFLICT')
      }
      const values = [
        input.credentialScopeId.value,
        input.requestedModelId.value,
        OPERATION,
        rowGeneration,
        descriptorSet.endpointSetRevision.value,
        fetchedAtMs,
        responseJson,
      ] as const
      const result = current === undefined
        ? this.db.prepare(`
          INSERT INTO openrouter_image_endpoint_descriptor_sets (
            credential_scope_id, model_id, operation, row_generation,
            endpoint_set_revision, fetched_at_ms, descriptor_response_json
          ) VALUES (?, ?, ?, ?, ?, ?, ?)
          ON CONFLICT(credential_scope_id, model_id, operation) DO NOTHING
        `).run(...values)
        : this.db.prepare(`
          UPDATE openrouter_image_endpoint_descriptor_sets SET
            row_generation = ?, endpoint_set_revision = ?, fetched_at_ms = ?, descriptor_response_json = ?
          WHERE credential_scope_id = ? AND model_id = ? AND operation = ?
            AND row_generation = ? AND fetched_at_ms <= ?
        `).run(
          rowGeneration,
          descriptorSet.endpointSetRevision.value,
          fetchedAtMs,
          responseJson,
          input.credentialScopeId.value,
          input.requestedModelId.value,
          OPERATION,
          input.expectedGeneration,
          fetchedAtMs,
        )
      if (result.changes !== 1) {
        throw new OpenRouterImageEndpointRepoV2Error('GENERATION_V2_OPENROUTER_CACHE_CAS_CONFLICT')
      }
      this.db.prepare(`
        INSERT INTO openrouter_image_endpoint_descriptor_history (
          credential_scope_id, model_id, operation, row_generation,
          endpoint_set_revision, fetched_at_ms, descriptor_response_json
        ) VALUES (?, ?, ?, ?, ?, ?, ?)
      `).run(...values)
      this.db.prepare(`DELETE FROM openrouter_image_endpoint_descriptor_history WHERE fetched_at_ms < ?`)
        .run(fetchedAtMs - HISTORY_RETENTION_MS)
      return this.getCurrentDescriptorSet(input.credentialScopeId, input.requestedModelId)!
    })
    return this.runImmediate(transaction)
  }

  getCurrentDescriptorSet(
    credentialScopeId: GenerationV2Identity<'credential_scope_id'>,
    modelId: GenerationV2Identity<'model_id'>,
  ): DecodedOpenRouterImageDescriptorCacheRecordV2 | null {
    assertIdentity(credentialScopeId, 'credential_scope_id')
    assertIdentity(modelId, 'model_id')
    const row = this.currentRow(credentialScopeId.value, modelId.value)
    return row ? decodeOpenRouterImageDescriptorCacheRecordV2(row) : null
  }

  invalidateCurrentDescriptorSet(input: Readonly<{
    credentialScopeId: GenerationV2Identity<'credential_scope_id'>
    modelId: GenerationV2Identity<'model_id'>
    expectedGeneration: number
  }>): Readonly<{ invalidatedRowGeneration: number }> {
    assertIdentity(input.credentialScopeId, 'credential_scope_id')
    assertIdentity(input.modelId, 'model_id')
    if (!Number.isSafeInteger(input.expectedGeneration) || input.expectedGeneration <= 0) {
      throw new OpenRouterImageEndpointRepoV2Error('GENERATION_V2_OPENROUTER_CACHE_CAS_CONFLICT')
    }
    const transaction = this.db.transaction(() => {
      const current = this.currentRow(input.credentialScopeId.value, input.modelId.value)
      if (!current || current.row_generation !== input.expectedGeneration) {
        throw new OpenRouterImageEndpointRepoV2Error('GENERATION_V2_OPENROUTER_CACHE_CAS_CONFLICT')
      }
      const clock = this.generationClockRow(input.credentialScopeId.value, input.modelId.value)
      if (!clock || !Number.isSafeInteger(clock.last_generation) ||
          clock.last_generation !== current.row_generation) {
        throw new OpenRouterImageEndpointRepoV2Error('GENERATION_V2_OPENROUTER_CACHE_STATE_INVALID')
      }
      const highestHistoryGeneration = this.highestHistoryGeneration(
        input.credentialScopeId.value,
        input.modelId.value,
      )
      if (highestHistoryGeneration !== null && highestHistoryGeneration > (clock.last_generation as number)) {
        throw new OpenRouterImageEndpointRepoV2Error('GENERATION_V2_OPENROUTER_CACHE_STATE_INVALID')
      }
      const result = this.db.prepare(`
        DELETE FROM openrouter_image_endpoint_descriptor_sets
        WHERE credential_scope_id = ? AND model_id = ? AND operation = ? AND row_generation = ?
      `).run(input.credentialScopeId.value, input.modelId.value, OPERATION, input.expectedGeneration)
      if (result.changes !== 1) {
        throw new OpenRouterImageEndpointRepoV2Error('GENERATION_V2_OPENROUTER_CACHE_CAS_CONFLICT')
      }
      return Object.freeze({ invalidatedRowGeneration: input.expectedGeneration })
    })
    return this.runImmediate(transaction)
  }

  private currentRow(credentialScopeId: string, modelId: string): DescriptorSetRow | undefined {
    return this.db.prepare(`
      SELECT credential_scope_id, model_id, operation, row_generation,
             endpoint_set_revision, fetched_at_ms, descriptor_response_json
      FROM openrouter_image_endpoint_descriptor_sets
      WHERE credential_scope_id = ? AND model_id = ? AND operation = ?
    `).get(credentialScopeId, modelId, OPERATION) as DescriptorSetRow | undefined
  }

  private generationClockRow(credentialScopeId: string, modelId: string): DescriptorGenerationClockRow | undefined {
    return this.db.prepare(`
      SELECT last_generation
      FROM openrouter_image_endpoint_descriptor_generation_clock
      WHERE credential_scope_id = ? AND model_id = ? AND operation = ?
    `).get(credentialScopeId, modelId, OPERATION) as DescriptorGenerationClockRow | undefined
  }

  private highestHistoryGeneration(credentialScopeId: string, modelId: string): number | null {
    const row = this.db.prepare(`
      SELECT MAX(row_generation) AS highest_generation
      FROM openrouter_image_endpoint_descriptor_history
      WHERE credential_scope_id = ? AND model_id = ? AND operation = ?
    `).get(credentialScopeId, modelId, OPERATION) as { highest_generation: unknown }
    if (row.highest_generation === null) return null
    if (!Number.isSafeInteger(row.highest_generation) || (row.highest_generation as number) <= 0) {
      throw new OpenRouterImageEndpointRepoV2Error('GENERATION_V2_OPENROUTER_CACHE_STATE_INVALID')
    }
    return row.highest_generation as number
  }


  private runImmediate<T>(transaction: { immediate(): T }): T {
    try {
      return transaction.immediate()
    } catch (error) {
      if (error instanceof OpenRouterImageEndpointRepoV2Error) throw error
      const code = (error as { code?: unknown })?.code
      if (code === 'SQLITE_BUSY' || code === 'SQLITE_BUSY_SNAPSHOT' || code === 'SQLITE_LOCKED') {
        throw new OpenRouterImageEndpointRepoV2Error('GENERATION_V2_OPENROUTER_CACHE_CAS_CONFLICT')
      }
      throw error
    }
  }
}
