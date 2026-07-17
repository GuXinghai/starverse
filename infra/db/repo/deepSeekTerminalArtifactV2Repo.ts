import type BetterSqlite3 from 'better-sqlite3'
import {
  isDeepSeekStableTerminalArtifactV1,
  serializeDeepSeekStableTerminalArtifactV1,
  type DeepSeekStableTerminalArtifactV1,
} from '../../../src/next/generation-v2/providers/deepseek/terminalArtifactV1'
import {
  assertGenerationV2AuthorityTransactionContextV2,
  type GenerationV2AuthorityTransactionContextV2,
} from './generationV2AuthorityTransactionInternal'
import {
  isGenerationExecutionOperationBundleForContextV2,
  type GenerationExecutionOperationBundleV2,
} from './generationExecutionV2Repo'
import {
  isGenerationRequestRepositoryFactForContextV2,
  type GenerationRequestRepositoryFactV2,
} from './generationRequestV2Repo'

export class DeepSeekTerminalArtifactV2RepoError extends Error {
  constructor(readonly code:
    | 'GENERATION_V2_DEEPSEEK_TERMINAL_ARTIFACT_STATE_INVALID'
    | 'GENERATION_V2_DEEPSEEK_TERMINAL_ARTIFACT_CONFLICT') {
    super(code)
    this.name = 'DeepSeekTerminalArtifactV2RepoError'
  }
}

export class DeepSeekTerminalArtifactV2Repo {
  readonly #db: BetterSqlite3.Database

  constructor(db: BetterSqlite3.Database) {
    this.#db = db
    db.pragma('foreign_keys = ON')
    if (db.pragma('foreign_keys', { simple: true }) !== 1) {
      throw new DeepSeekTerminalArtifactV2RepoError(
        'GENERATION_V2_DEEPSEEK_TERMINAL_ARTIFACT_STATE_INVALID',
      )
    }
  }

  insertCompleted(
    context: GenerationV2AuthorityTransactionContextV2,
    execution: GenerationExecutionOperationBundleV2,
    request: GenerationRequestRepositoryFactV2,
    artifact: DeepSeekStableTerminalArtifactV1,
    createdAtMs: number,
  ): void {
    assertGenerationV2AuthorityTransactionContextV2(context, this.#db)
    if (!isGenerationExecutionOperationBundleForContextV2(execution, context) ||
        !isGenerationRequestRepositoryFactForContextV2(request, context) ||
        !isDeepSeekStableTerminalArtifactV1(artifact) || execution.operation.state !== 'completed' ||
        request.operationId !== execution.operation.operationId.value ||
        request.answerRootId !== execution.operation.resultAnswerRootId.value ||
        !Number.isSafeInteger(createdAtMs) || createdAtMs < execution.operation.updatedAtMs) {
      throw new DeepSeekTerminalArtifactV2RepoError(
        'GENERATION_V2_DEEPSEEK_TERMINAL_ARTIFACT_STATE_INVALID',
      )
    }
    const artifactJson = serializeDeepSeekStableTerminalArtifactV1(artifact)
    const existing = this.#db.prepare(`SELECT operation_id AS operationId,
      codec_version AS codecVersion, artifact_json AS artifactJson, artifact_hash AS artifactHash
      FROM generation_native_artifact_v2
      WHERE answer_root_id=? AND request_sequence=? AND artifact_kind=?`).get(
      request.answerRootId, request.requestSequence, artifact.artifactKind,
    ) as Readonly<Record<string, unknown>> | undefined
    if (existing) {
      if (existing.operationId !== request.operationId ||
          existing.codecVersion !== artifact.artifactCodecVersion ||
          existing.artifactJson !== artifactJson || existing.artifactHash !== artifact.artifactHash) {
        throw new DeepSeekTerminalArtifactV2RepoError(
          'GENERATION_V2_DEEPSEEK_TERMINAL_ARTIFACT_CONFLICT',
        )
      }
      return
    }
    this.#db.prepare(`INSERT INTO generation_native_artifact_v2 (
      answer_root_id, request_sequence, operation_id, artifact_kind, codec_version,
      artifact_json, artifact_hash, created_at_ms
    ) VALUES (?, ?, ?, ?, ?, ?, ?, ?)`).run(
      request.answerRootId, request.requestSequence, request.operationId, artifact.artifactKind,
      artifact.artifactCodecVersion, artifactJson, artifact.artifactHash, createdAtMs,
    )
  }
}
