import type { ProviderFailureV2 } from '../../../shared/provider/providerFailureV2'
import type { GenerationOperationBindingV2 } from './generationOperationBindingV2'

export type GenerationStreamPayloadV2 =
  | Readonly<{ type: 'assistant_body'; content: string }>
  | Readonly<{
    type: 'reasoning_detail'
    detail: Readonly<Record<string, unknown>>
  }>
  | Readonly<{
    type: 'image_output'
    outputIndex: number
    assetId: string
    assetRevisionId: string
    mime: string
  }>
  | Readonly<{
    type: 'terminal'
    state: 'awaiting_tool' | 'completed' | 'failed' | 'cancelled'
    errorCode: string | null
    errorMessage: string | null
    errorFact: ProviderFailureV2 | null
  }>

export type GenerationStreamEventV2 = Readonly<{
  operationId: string
  sequence: number
  payload: GenerationStreamPayloadV2
}>

export type GenerationOperationRuntimeSnapshotV2 = Readonly<{
  binding: GenerationOperationBindingV2
  status: 'generating' | 'completed' | 'failed' | 'cancelled'
  body: string
  reasoning: readonly Readonly<Record<string, unknown>>[]
  images: readonly Readonly<{
    outputIndex: number
    assetId: string
    assetRevisionId: string
    mime: string
  }>[]
  lastSequence: number
  errorFact: ProviderFailureV2 | null
  updatedAtMs: number
}>
