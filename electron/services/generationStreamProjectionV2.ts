export type GenerationStreamProjectionV2 =
  | Readonly<{
    type: 'assistant_body'
    operationId: string
    answerRootId: string
    content: string
  }>
  | Readonly<{
    type: 'image_output'
    operationId: string
    answerRootId: string
    outputIndex: number
    assetId: string
    assetRevisionId: string
    mime: string
  }>
  | Readonly<{
    type: 'reasoning_detail'
    operationId: string
    answerRootId: string
    detail: Readonly<Record<string, unknown>>
    persisted?: true
  }>
  | Readonly<{
    type: 'terminal'
    operationId: string
    answerRootId: string
    state: 'awaiting_tool' | 'completed' | 'failed' | 'cancelled'
    errorCode: string | null
    errorMessage: string | null
  }>

export type GenerationStreamProjectionSinkV2 = Readonly<{
  publish: (projection: GenerationStreamProjectionV2) => void
}>

/**
 * Renderer/IPC projection is deliberately best-effort and strictly downstream
 * of the authoritative V2 database transaction. A disconnected renderer must
 * never alter an already committed answer or terminal operation state.
 */
export function publishGenerationStreamProjectionV2(
  sink: GenerationStreamProjectionSinkV2 | undefined,
  projection: GenerationStreamProjectionV2,
): void {
  try {
    sink?.publish(Object.freeze({ ...projection }) as GenerationStreamProjectionV2)
  } catch {
    // Projection observers are not generation authorities.
  }
}

/** Persists only the renderer projection; provider-native artifacts remain the replay/continuation authority. */
export function createPersistentGenerationStreamProjectionSinkV2(
  db: BetterSqlite3.Database,
  downstream: GenerationStreamProjectionSinkV2,
): GenerationStreamProjectionSinkV2 {
  const reasoning = new AnswerReasoningProjectionV2Repo(db)
  return Object.freeze({ publish: (projection: GenerationStreamProjectionV2) => {
    if (projection.type === 'reasoning_detail' && projection.persisted !== true) {
      reasoning.append(projection.answerRootId, projection.detail)
    }
    downstream.publish(projection)
  } })
}
import type BetterSqlite3 from 'better-sqlite3'
import { AnswerReasoningProjectionV2Repo } from '../../infra/db/repo/answerReasoningProjectionV2Repo'
