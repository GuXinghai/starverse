import type BetterSqlite3 from 'better-sqlite3'
import {
  isAttachmentAssetRevisionRepositoryFactV2,
  type AttachmentAssetRevisionRepositoryFactV2,
} from './attachmentAssetV2Repo'
import {
  isGenerationExecutionOperationBundleForContextV2,
  type GenerationExecutionOperationBundleV2,
} from './generationExecutionV2Repo'
import {
  isGenerationRequestRepositoryFactForContextV2,
  type GenerationRequestRepositoryFactV2,
} from './generationRequestV2Repo'
import {
  assertGenerationV2AuthorityTransactionContextV2,
  type GenerationV2AuthorityTransactionContextV2,
} from './generationV2AuthorityTransactionInternal'
import { stableSerializeProviderRequestBoundedV2 } from '../../../src/next/generation-v2/compiler/stableSerialize'

const MAX_USAGE_BYTES = 1024 * 1024

export type GenerationImageOutputRepositoryFactV2 = Readonly<{
  operationId: string
  requestSequence: number
  answerRootId: string
  outputIndex: number
  partialImageIndex: number
  assetId: string
  assetRevisionId: string
  assetSha256: string
  mime: string
  providerCreatedAtMs: number | null
  providerUsageJson: string
  createdAtMs: number
}>

export class GenerationImageOutputV2RepoError extends Error {
  constructor(readonly code:
    | 'GENERATION_V2_IMAGE_OUTPUT_AUTHORITY_INVALID'
    | 'GENERATION_V2_IMAGE_OUTPUT_INPUT_INVALID'
    | 'GENERATION_V2_IMAGE_OUTPUT_STATE_INVALID'
    | 'GENERATION_V2_IMAGE_OUTPUT_IDEMPOTENCY_CONFLICT') {
    super(code)
    this.name = 'GenerationImageOutputV2RepoError'
  }
}

function closedObject(value: unknown): Readonly<Record<string, unknown>> {
  if (!value || typeof value !== 'object' || Array.isArray(value) ||
      (Object.getPrototypeOf(value) !== Object.prototype && Object.getPrototypeOf(value) !== null)) {
    throw new GenerationImageOutputV2RepoError('GENERATION_V2_IMAGE_OUTPUT_INPUT_INVALID')
  }
  const descriptors = Object.getOwnPropertyDescriptors(value)
  if (Reflect.ownKeys(value).some((key) => typeof key !== 'string') ||
      Object.values(descriptors).some((descriptor) => !descriptor.enumerable || !('value' in descriptor) ||
        descriptor.value === undefined)) {
    throw new GenerationImageOutputV2RepoError('GENERATION_V2_IMAGE_OUTPUT_INPUT_INVALID')
  }
  return Object.freeze(Object.fromEntries(Object.entries(descriptors).map(([key, descriptor]) => [key, descriptor.value])))
}

function requiredString(value: unknown, max: number): string {
  if (typeof value !== 'string' || value.length < 1 || value.length > max || value.trim() !== value ||
      /[\u0000-\u001f\u007f]/u.test(value)) {
    throw new GenerationImageOutputV2RepoError('GENERATION_V2_IMAGE_OUTPUT_INPUT_INVALID')
  }
  return value
}

function requiredIndex(value: unknown): number {
  if (!Number.isSafeInteger(value) || (value as number) < 0 || (value as number) > 9) {
    throw new GenerationImageOutputV2RepoError('GENERATION_V2_IMAGE_OUTPUT_INPUT_INVALID')
  }
  return value as number
}

function optionalTime(value: unknown): number | null {
  if (value === null || value === undefined) return null
  if (!Number.isSafeInteger(value) || (value as number) < 0) {
    throw new GenerationImageOutputV2RepoError('GENERATION_V2_IMAGE_OUTPUT_INPUT_INVALID')
  }
  return value as number
}

function usageJson(value: unknown): string {
  const usage = closedObject(value)
  try {
    return stableSerializeProviderRequestBoundedV2(usage, MAX_USAGE_BYTES)
  } catch {
    throw new GenerationImageOutputV2RepoError('GENERATION_V2_IMAGE_OUTPUT_INPUT_INVALID')
  }
}

function decodeRow(row: Readonly<Record<string, unknown>>): GenerationImageOutputRepositoryFactV2 {
  const required = ['operation_id', 'answer_root_id', 'asset_id', 'asset_revision_id', 'asset_sha256',
    'mime', 'provider_usage_json'] as const
  if (required.some((key) => typeof row[key] !== 'string') ||
      !Number.isSafeInteger(row.request_sequence) || !Number.isSafeInteger(row.output_index) ||
      !Number.isSafeInteger(row.partial_image_index) || !Number.isSafeInteger(row.created_at_ms) ||
      (row.provider_created_at_ms !== null && !Number.isSafeInteger(row.provider_created_at_ms)) ||
      !/^[0-9a-f]{64}$/u.test(row.asset_sha256 as string) ||
      (row.mime as string) !== (row.mime as string).toLowerCase() ||
      !/^image\/[a-z0-9][a-z0-9!#$&^_.+*-]*$/u.test(row.mime as string)) {
    throw new GenerationImageOutputV2RepoError('GENERATION_V2_IMAGE_OUTPUT_STATE_INVALID')
  }
  const providerUsageJson = row.provider_usage_json as string
  try {
    const parsed = JSON.parse(providerUsageJson)
    if (!parsed || typeof parsed !== 'object' || Array.isArray(parsed) ||
        stableSerializeProviderRequestBoundedV2(parsed, MAX_USAGE_BYTES) !== providerUsageJson) {
      throw new Error('invalid')
    }
  } catch {
    throw new GenerationImageOutputV2RepoError('GENERATION_V2_IMAGE_OUTPUT_STATE_INVALID')
  }
  return Object.freeze({
    operationId: row.operation_id as string,
    requestSequence: row.request_sequence as number,
    answerRootId: row.answer_root_id as string,
    outputIndex: row.output_index as number,
    partialImageIndex: row.partial_image_index as number,
    assetId: row.asset_id as string,
    assetRevisionId: row.asset_revision_id as string,
    assetSha256: row.asset_sha256 as string,
    mime: row.mime as string,
    providerCreatedAtMs: row.provider_created_at_ms as number | null,
    providerUsageJson,
    createdAtMs: row.created_at_ms as number,
  })
}

export class GenerationImageOutputV2Repo {
  constructor(
    private readonly db: BetterSqlite3.Database,
    private readonly nowMs: () => number = Date.now,
  ) {
    db.pragma('foreign_keys = ON')
    if (db.pragma('foreign_keys', { simple: true }) !== 1) {
      throw new GenerationImageOutputV2RepoError('GENERATION_V2_IMAGE_OUTPUT_STATE_INVALID')
    }
  }

  insertCompletedOutput(
    context: GenerationV2AuthorityTransactionContextV2,
    execution: GenerationExecutionOperationBundleV2,
    request: GenerationRequestRepositoryFactV2,
    input: Readonly<{
      outputIndex: number
      partialImageIndex: number
      revision: AttachmentAssetRevisionRepositoryFactV2
      providerCreatedAtMs?: number | null
      providerUsage: unknown
    }>,
  ): GenerationImageOutputRepositoryFactV2 {
    assertGenerationV2AuthorityTransactionContextV2(context, this.db)
    if (!isGenerationExecutionOperationBundleForContextV2(execution, context) ||
        !isGenerationRequestRepositoryFactForContextV2(request, context)) {
      throw new GenerationImageOutputV2RepoError('GENERATION_V2_IMAGE_OUTPUT_AUTHORITY_INVALID')
    }
    const value = closedObject(input)
    const revision = value.revision as AttachmentAssetRevisionRepositoryFactV2
    if (!isAttachmentAssetRevisionRepositoryFactV2(revision)) {
      throw new GenerationImageOutputV2RepoError('GENERATION_V2_IMAGE_OUTPUT_AUTHORITY_INVALID')
    }
    if (execution.snapshot.providerBinding.operation !== 'image_generate' ||
        request.operationId !== execution.operation.operationId.value ||
        request.answerRootId !== execution.operation.resultAnswerRootId.value ||
        request.requestSequence < 1 ||
        revision.assetKind !== 'image' || revision.sourceKind !== 'generated' ||
        revision.retiredAtMs !== null) {
      throw new GenerationImageOutputV2RepoError('GENERATION_V2_IMAGE_OUTPUT_STATE_INVALID')
    }
    const outputIndex = requiredIndex(value.outputIndex)
    const partialImageIndex = requiredIndex(value.partialImageIndex)
    const providerCreatedAtMs = optionalTime(value.providerCreatedAtMs)
    const providerUsageJson = usageJson(value.providerUsage)
    const existing = this.db.prepare(`SELECT operation_id, request_sequence, answer_root_id, output_index,
      partial_image_index, asset_id, asset_revision_id, asset_sha256, mime, provider_created_at_ms,
      provider_usage_json, created_at_ms
      FROM generation_image_output_v2
      WHERE operation_id=? AND request_sequence=? AND output_index=?`).get(
      request.operationId, request.requestSequence, outputIndex,
    ) as Record<string, unknown> | undefined
    if (existing) {
      const fact = decodeRow(existing)
      if (fact.partialImageIndex !== partialImageIndex || fact.assetId !== revision.assetId.value ||
          fact.assetRevisionId !== revision.assetRevisionId.value || fact.assetSha256 !== revision.blob.sha256.value ||
          fact.mime !== revision.blob.mime || fact.providerCreatedAtMs !== providerCreatedAtMs ||
          fact.providerUsageJson !== providerUsageJson) {
        throw new GenerationImageOutputV2RepoError('GENERATION_V2_IMAGE_OUTPUT_IDEMPOTENCY_CONFLICT')
      }
      return fact
    }
    const createdAtMs = this.nowMs()
    if (!Number.isSafeInteger(createdAtMs) || createdAtMs < request.createdAtMs) {
      throw new GenerationImageOutputV2RepoError('GENERATION_V2_IMAGE_OUTPUT_INPUT_INVALID')
    }
    this.db.prepare(`INSERT INTO generation_image_output_v2 (
      operation_id, request_sequence, answer_root_id, output_index, partial_image_index,
      asset_id, asset_revision_id, asset_sha256, mime, provider_created_at_ms,
      provider_usage_json, created_at_ms
    ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`).run(
      request.operationId, request.requestSequence, request.answerRootId, outputIndex, partialImageIndex,
      revision.assetId.value, revision.assetRevisionId.value, revision.blob.sha256.value, revision.blob.mime,
      providerCreatedAtMs, providerUsageJson, createdAtMs,
    )
    const row = this.db.prepare(`SELECT operation_id, request_sequence, answer_root_id, output_index,
      partial_image_index, asset_id, asset_revision_id, asset_sha256, mime, provider_created_at_ms,
      provider_usage_json, created_at_ms
      FROM generation_image_output_v2
      WHERE operation_id=? AND request_sequence=? AND output_index=?`).get(
      request.operationId, request.requestSequence, outputIndex,
    ) as Record<string, unknown> | undefined
    if (!row) throw new GenerationImageOutputV2RepoError('GENERATION_V2_IMAGE_OUTPUT_STATE_INVALID')
    return decodeRow(row)
  }
}
