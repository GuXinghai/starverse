import { z } from 'zod'
import {
  compatibleModelIdSchema,
  providerInstanceIdSchema,
} from '@/shared/provider/openai-chat-compatible/identity'

export const compatibleRouteIntentSchema = z.object({
  schemaVersion: z.literal(2),
  kind: z.literal('openai_chat_compatible'),
  providerInstanceId: providerInstanceIdSchema,
  modelId: compatibleModelIdSchema,
}).strict()

export type CompatibleRouteIntent = z.infer<typeof compatibleRouteIntentSchema>

export type CompatibleRoutePickerSource = Readonly<{
  providerInstanceId: string
  providerName: string
  models: readonly Readonly<{
    modelId: string
    displayName: string
    sourceLabel: string
    routeIntent: CompatibleRouteIntent
  }>[]
}>

export function createCompatibleRouteIntent(input: Readonly<{
  providerInstanceId: string
  modelId: string
}>): CompatibleRouteIntent {
  return compatibleRouteIntentSchema.parse({
    schemaVersion: 2,
    kind: 'openai_chat_compatible',
    providerInstanceId: input.providerInstanceId,
    modelId: input.modelId,
  })
}

export function buildCompatibleRouteIntentKey(input: unknown): string {
  const intent = compatibleRouteIntentSchema.parse(input)
  return `${intent.providerInstanceId}::${intent.modelId}`
}
