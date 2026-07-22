import { z } from 'zod'
import type { RawGenerationRequestStore } from '../debug/rawGenerationRequestStore'
import type { RegisterInvoke } from './types'

export const RAW_GENERATION_DEBUG_CHANNELS = [
  'raw-generation:get-status',
  'raw-generation:list-by-answer',
  'raw-generation:list-provider-errors-by-answer',
] as const

export function registerRawGenerationDebugIpc(input: Readonly<{ registerInvoke: RegisterInvoke; store: RawGenerationRequestStore }>): string[] {
  input.registerInvoke('raw-generation:get-status', () => input.store.getStatus())
  input.registerInvoke('raw-generation:list-by-answer', (_event, raw) => {
    const { answerRootId } = z.object({ answerRootId: z.string().trim().min(1).max(256) }).strict().parse(raw)
    return input.store.listByAnswerRootId(answerRootId)
  })
  input.registerInvoke('raw-generation:list-provider-errors-by-answer', (_event, raw) => {
    const { answerRootId } = z.object({ answerRootId: z.string().trim().min(1).max(256) }).strict().parse(raw)
    return input.store.listProviderErrorsByAnswerRootId(answerRootId)
  })
  return [...RAW_GENERATION_DEBUG_CHANNELS]
}
