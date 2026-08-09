import type { ProviderFailureV2 } from '../../src/shared/provider/providerFailureV2'

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
    errorFact?: ProviderFailureV2
  }>

export type GenerationStreamProjectionSinkV2 = Readonly<{
  publish: (projection: GenerationStreamProjectionV2) => void
}>

export const GENERATION_OPERATION_RUNTIME_START_V2 = Symbol('generation-operation-runtime-start-v2')

export type CoordinatedGenerationStreamProjectionSinkV2 = GenerationStreamProjectionSinkV2 & Readonly<{
  [GENERATION_OPERATION_RUNTIME_START_V2]: (
    result: unknown,
    run: (signal: AbortSignal) => Promise<unknown>,
  ) => boolean
}>

export function isCoordinatedGenerationStreamProjectionSinkV2(
  value: GenerationStreamProjectionSinkV2 | undefined,
): value is CoordinatedGenerationStreamProjectionSinkV2 {
  return typeof (value as Partial<CoordinatedGenerationStreamProjectionSinkV2> | undefined)
    ?.[GENERATION_OPERATION_RUNTIME_START_V2] === 'function'
}

export function publishGenerationStreamProjectionV2(
  sink: GenerationStreamProjectionSinkV2 | undefined,
  projection: GenerationStreamProjectionV2,
): void {
  sink?.publish(Object.freeze({ ...projection }) as GenerationStreamProjectionV2)
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
