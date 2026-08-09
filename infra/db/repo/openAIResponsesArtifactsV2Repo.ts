import type BetterSqlite3 from 'better-sqlite3'
import { stableSerializeProviderRequestV2 } from '../../../src/next/generation-v2/compiler/stableSerialize'
import {
  isOpenAIResponsesContinuationArtifactV2,
  type OpenAIResponsesContinuationArtifactV2,
} from '../../../src/next/generation-v2/providers/openai-responses/continuationArtifactV2'
import {
  isOpenAIResponsesTerminalArtifactV1,
  type OpenAIResponsesTerminalArtifactV1,
} from '../../../src/next/generation-v2/providers/openai-responses/terminalArtifactV1'
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

export class OpenAIResponsesArtifactsV2RepoError extends Error {
  constructor(readonly code:
    | 'GENERATION_V2_OPENAI_ARTIFACT_STATE_INVALID'
    | 'GENERATION_V2_OPENAI_ARTIFACT_CONFLICT') {
    super(code)
    this.name = 'OpenAIResponsesArtifactsV2RepoError'
  }
}

type Artifact = OpenAIResponsesContinuationArtifactV2 | OpenAIResponsesTerminalArtifactV1

export class OpenAIResponsesArtifactsV2Repo {
  readonly #db: BetterSqlite3.Database

  constructor(db: BetterSqlite3.Database) {
    this.#db = db
    db.pragma('foreign_keys = ON')
    if (db.pragma('foreign_keys', { simple: true }) !== 1) {
      throw new OpenAIResponsesArtifactsV2RepoError('GENERATION_V2_OPENAI_ARTIFACT_STATE_INVALID')
    }
  }

  insertOperationTerminal(
    context: GenerationV2AuthorityTransactionContextV2,
    execution: GenerationExecutionOperationBundleV2,
    request: GenerationRequestRepositoryFactV2,
    artifact: Artifact,
    createdAtMs: number,
  ): void {
    this.#insert(context, execution, request, artifact, createdAtMs, 'operation_terminal')
  }

  insertRequestTerminal(
    context: GenerationV2AuthorityTransactionContextV2,
    execution: GenerationExecutionOperationBundleV2,
    request: GenerationRequestRepositoryFactV2,
    artifact: Artifact,
    createdAtMs: number,
  ): void {
    this.#insert(context, execution, request, artifact, createdAtMs, 'request_terminal')
  }

  #insert(
    context: GenerationV2AuthorityTransactionContextV2,
    execution: GenerationExecutionOperationBundleV2,
    request: GenerationRequestRepositoryFactV2,
    artifact: Artifact,
    createdAtMs: number,
    completionScope: 'operation_terminal' | 'request_terminal',
  ): void {
    assertGenerationV2AuthorityTransactionContextV2(context, this.#db)
    if (!isGenerationExecutionOperationBundleForContextV2(execution, context) ||
        !isGenerationRequestRepositoryFactForContextV2(request, context) ||
        (!isOpenAIResponsesContinuationArtifactV2(artifact) && !isOpenAIResponsesTerminalArtifactV1(artifact)) ||
        (completionScope === 'operation_terminal'
          ? execution.operation.state !== 'completed'
          : (execution.operation.state !== 'completed' && execution.operation.state !== 'streaming')) ||
        request.operationId !== execution.operation.operationId.value ||
        request.answerRootId !== execution.operation.targetAnswerId.value ||
        !Number.isSafeInteger(createdAtMs) || createdAtMs < execution.operation.updatedAtMs) {
      throw new OpenAIResponsesArtifactsV2RepoError('GENERATION_V2_OPENAI_ARTIFACT_STATE_INVALID')
    }
    const artifactJson = 'canonicalJson' in artifact
      ? artifact.canonicalJson
      : stableSerializeProviderRequestV2(artifact)
    const existing = this.#db.prepare(`SELECT operation_id AS operationId,
      codec_version AS codecVersion, artifact_json AS artifactJson, artifact_hash AS artifactHash,
      completion_scope AS completionScope
      FROM generation_native_artifact_v2
      WHERE answer_root_id=? AND request_sequence=? AND artifact_kind=?`).get(
      request.answerRootId, request.requestSequence, artifact.artifactKind,
    ) as Readonly<Record<string, unknown>> | undefined
    if (existing) {
      if (existing.operationId !== request.operationId ||
          existing.codecVersion !== artifact.artifactCodecVersion ||
          existing.artifactJson !== artifactJson || existing.artifactHash !== artifact.artifactHash ||
          existing.completionScope !== completionScope) {
        throw new OpenAIResponsesArtifactsV2RepoError('GENERATION_V2_OPENAI_ARTIFACT_CONFLICT')
      }
      return
    }
    this.#db.prepare(`INSERT INTO generation_native_artifact_v2 (
      answer_root_id, request_sequence, operation_id, artifact_kind, codec_version,
      artifact_json, artifact_hash, created_at_ms, completion_scope
    ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`).run(
      request.answerRootId, request.requestSequence, request.operationId, artifact.artifactKind,
      artifact.artifactCodecVersion, artifactJson, artifact.artifactHash, createdAtMs, completionScope,
    )
  }
}
