import { ImmutablePreparedBodyV2 } from '../../compiler/stableSerialize'
import type { OllamaNativeChatMessageV1 } from './nativeMessagesV1'

export type OllamaThinkingSelectionV1 = false | true | string
export function compileOllamaNativeChatRequestV1(input: Readonly<{ model: string; messages: readonly OllamaNativeChatMessageV1[];
  thinking: OllamaThinkingSelectionV1;
  generation: Readonly<{ maxOutputTokens?: number; temperature?: number; topP?: number; topK?: number; seed?: number;
    stop?: readonly string[]; repetitionPenalty?: number }> }>) {
  if (!input.model.trim() || input.model.trim() !== input.model || !input.messages.length) throw new Error('GENERATION_V2_OLLAMA_REQUEST_INVALID')
  if (typeof input.thinking === 'string' && (input.thinking.length === 0 || input.thinking.length > 4096)) {
    throw new Error('GENERATION_V2_OLLAMA_REQUEST_INVALID')
  }
  const g = input.generation
  if (g.maxOutputTokens !== undefined && (!Number.isSafeInteger(g.maxOutputTokens) || g.maxOutputTokens < 1) ||
      g.temperature !== undefined && (!Number.isFinite(g.temperature) || g.temperature < 0) ||
      g.topP !== undefined && (!Number.isFinite(g.topP) || g.topP < 0 || g.topP > 1) ||
      g.topK !== undefined && (!Number.isSafeInteger(g.topK) || g.topK < 1) ||
      g.seed !== undefined && !Number.isSafeInteger(g.seed) ||
      g.repetitionPenalty !== undefined && (!Number.isFinite(g.repetitionPenalty) || g.repetitionPenalty <= 0) ||
      g.stop !== undefined && (!Array.isArray(g.stop) || g.stop.length > 16 || g.stop.some((item) => !item))) throw new Error('GENERATION_V2_OLLAMA_REQUEST_INVALID')
  const options = Object.freeze({ ...(g.maxOutputTokens === undefined ? {} : { num_predict: g.maxOutputTokens }),
    ...(g.temperature === undefined ? {} : { temperature: g.temperature }), ...(g.topP === undefined ? {} : { top_p: g.topP }),
    ...(g.topK === undefined ? {} : { top_k: g.topK }), ...(g.seed === undefined ? {} : { seed: g.seed }),
    ...(g.stop === undefined ? {} : { stop: g.stop }), ...(g.repetitionPenalty === undefined ? {} : { repeat_penalty: g.repetitionPenalty }) })
  const nativeRequest = Object.freeze({ model: input.model, messages: Object.freeze([...input.messages]), stream: true as const, think: input.thinking,
    ...(Object.keys(options).length === 0 ? {} : { options }) })
  return Object.freeze({ nativeRequest, preparedBody: ImmutablePreparedBodyV2.fromNativeRequestWithMaxBytes(nativeRequest, 20 * 1024 * 1024) })
}
