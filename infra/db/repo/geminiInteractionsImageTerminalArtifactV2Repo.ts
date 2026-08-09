import type BetterSqlite3 from 'better-sqlite3'
import {
  isGeminiInteractionsImageTerminalArtifactV2,
  serializeGeminiInteractionsImageTerminalArtifactV2,
  type GeminiInteractionsImageTerminalArtifactV2,
} from '../../../src/next/generation-v2/providers/gemini/interactionsTerminalArtifactV2'
import { assertGenerationV2AuthorityTransactionContextV2, type GenerationV2AuthorityTransactionContextV2 } from './generationV2AuthorityTransactionInternal'
import { isGenerationExecutionOperationBundleForContextV2, type GenerationExecutionOperationBundleV2 } from './generationExecutionV2Repo'
import { isGenerationRequestRepositoryFactForContextV2, type GenerationRequestRepositoryFactV2 } from './generationRequestV2Repo'

export class GeminiInteractionsImageTerminalArtifactV2RepoError extends Error {
  constructor(readonly code: 'GENERATION_V2_GEMINI_INTERACTIONS_TERMINAL_STATE_INVALID' |
    'GENERATION_V2_GEMINI_INTERACTIONS_TERMINAL_CONFLICT') { super(code); this.name = 'GeminiInteractionsImageTerminalArtifactV2RepoError' }
}
export class GeminiInteractionsImageTerminalArtifactV2Repo {
  constructor(private readonly db: BetterSqlite3.Database) {
    db.pragma('foreign_keys = ON')
    if (db.pragma('foreign_keys', { simple: true }) !== 1) this.invalid()
  }
  insertRequestTerminal(context: GenerationV2AuthorityTransactionContextV2,
    execution: GenerationExecutionOperationBundleV2, request: GenerationRequestRepositoryFactV2,
    artifact: GeminiInteractionsImageTerminalArtifactV2, createdAtMs: number): void {
    assertGenerationV2AuthorityTransactionContextV2(context, this.db)
    if (!isGenerationExecutionOperationBundleForContextV2(execution, context) ||
        !isGenerationRequestRepositoryFactForContextV2(request, context) ||
        !isGeminiInteractionsImageTerminalArtifactV2(artifact) ||
        (execution.operation.state !== 'completed' && execution.operation.state !== 'streaming') ||
        execution.snapshot.providerBinding.protocolContractId.value !== 'gemini-interactions-v1beta' ||
        request.operationId !== execution.operation.operationId.value ||
        request.answerRootId !== execution.operation.targetAnswerId.value ||
        !Number.isSafeInteger(createdAtMs) || createdAtMs < execution.operation.updatedAtMs) this.invalid()
    const json = serializeGeminiInteractionsImageTerminalArtifactV2(artifact)
    const existing = this.db.prepare(`SELECT operation_id AS operationId, codec_version AS codecVersion,
      artifact_json AS artifactJson, artifact_hash AS artifactHash FROM generation_native_artifact_v2
      WHERE answer_root_id=? AND request_sequence=? AND artifact_kind=?`).get(
      request.answerRootId, request.requestSequence, artifact.artifactKind,
    ) as Readonly<Record<string, unknown>> | undefined
    if (existing) {
      if (existing.operationId !== request.operationId || existing.codecVersion !== artifact.artifactCodecVersion ||
          existing.artifactJson !== json || existing.artifactHash !== artifact.artifactHash) {
        throw new GeminiInteractionsImageTerminalArtifactV2RepoError('GENERATION_V2_GEMINI_INTERACTIONS_TERMINAL_CONFLICT')
      }
      return
    }
    this.db.prepare(`INSERT INTO generation_native_artifact_v2 (answer_root_id, request_sequence, operation_id,
      artifact_kind, codec_version, artifact_json, artifact_hash, created_at_ms, completion_scope)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, 'request_terminal')`).run(request.answerRootId, request.requestSequence,
      request.operationId, artifact.artifactKind, artifact.artifactCodecVersion, json, artifact.artifactHash, createdAtMs)
  }
  private invalid(): never { throw new GeminiInteractionsImageTerminalArtifactV2RepoError('GENERATION_V2_GEMINI_INTERACTIONS_TERMINAL_STATE_INVALID') }
}
