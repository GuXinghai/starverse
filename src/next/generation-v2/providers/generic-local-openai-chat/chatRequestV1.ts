import { ImmutablePreparedBodyV2 } from '../../compiler/stableSerialize'
import type { GenericLocalOpenAIChatMessageV1 } from './nativeMessagesV1'

export type GenericLocalOpenAIChatRequestV1 = Readonly<{
  model: string
  messages: readonly GenericLocalOpenAIChatMessageV1[]
  stream: true
  stream_options: Readonly<{ include_usage: true }>
  max_tokens?: number
  temperature?: number
  top_p?: number
  stop?: string | readonly string[]
}>

export function compileGenericLocalOpenAIChatRequestV1(input: Readonly<{
  model: string
  messages: readonly GenericLocalOpenAIChatMessageV1[]
  generation: Readonly<{ maxTokens?: number; temperature?: number; topP?: number; stop?: string | readonly string[] }>
}>): Readonly<{ nativeRequest: GenericLocalOpenAIChatRequestV1; preparedBody: ImmutablePreparedBodyV2 }> {
  if (typeof input.model !== 'string' || input.model.trim() !== input.model || input.model.length === 0 || input.model.length > 512 ||
      !Array.isArray(input.messages) || input.messages.length === 0) throw new Error('GENERATION_V2_GENERIC_LOCAL_REQUEST_INVALID')
  const generation = input.generation
  if (generation.maxTokens !== undefined && (!Number.isSafeInteger(generation.maxTokens) || generation.maxTokens < 1)) throw new Error('GENERATION_V2_GENERIC_LOCAL_REQUEST_INVALID')
  if (generation.temperature !== undefined && (!Number.isFinite(generation.temperature) || generation.temperature < 0 || generation.temperature > 2)) throw new Error('GENERATION_V2_GENERIC_LOCAL_REQUEST_INVALID')
  if (generation.topP !== undefined && (!Number.isFinite(generation.topP) || generation.topP < 0 || generation.topP > 1)) throw new Error('GENERATION_V2_GENERIC_LOCAL_REQUEST_INVALID')
  if (generation.stop !== undefined) {
    const stop = typeof generation.stop === 'string' ? [generation.stop] : generation.stop
    if (!Array.isArray(stop) || stop.length === 0 || stop.length > 16 || stop.some((item) => typeof item !== 'string' || item.length === 0)) {
      throw new Error('GENERATION_V2_GENERIC_LOCAL_REQUEST_INVALID')
    }
  }
  const nativeRequest = Object.freeze({ model: input.model, messages: Object.freeze([...input.messages]), stream: true as const,
    stream_options: Object.freeze({ include_usage: true as const }),
    ...(generation.maxTokens === undefined ? {} : { max_tokens: generation.maxTokens }),
    ...(generation.temperature === undefined ? {} : { temperature: generation.temperature }),
    ...(generation.topP === undefined ? {} : { top_p: generation.topP }),
    ...(generation.stop === undefined ? {} : { stop: generation.stop }),
  })
  return Object.freeze({ nativeRequest, preparedBody: ImmutablePreparedBodyV2.fromNativeRequestWithMaxBytes(nativeRequest, 20 * 1024 * 1024) })
}
