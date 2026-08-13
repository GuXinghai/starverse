import { z } from 'zod'
import {
  compatibleRouteIntentSchema,
  type CompatibleRouteIntent,
} from './openai-chat-compatible/ui'
import { RUNTIME_PROVIDER_IDS, type RuntimeProviderId } from './runtimeProviderId'

const runtimeProviderIdSchema = z.enum(RUNTIME_PROVIDER_IDS)

export const providerModelRouteSelectionSchema = z.object({
  schemaVersion: z.literal(1),
  kind: z.literal('provider_model'),
  providerId: runtimeProviderIdSchema,
  modelId: z.string().trim().min(1).max(512),
}).strict()

export const compatibleRouteSelectionSchema = compatibleRouteIntentSchema

export const conversationRouteSelectionSchema = z.discriminatedUnion('kind', [
  providerModelRouteSelectionSchema,
  compatibleRouteSelectionSchema,
])

export type ProviderModelRouteSelection = Readonly<{
  schemaVersion: 1
  kind: 'provider_model'
  providerId: RuntimeProviderId
  modelId: string
}>

export type CompatibleRouteSelection = CompatibleRouteIntent

export type ConversationRouteSelection = ProviderModelRouteSelection | CompatibleRouteSelection

export function createProviderModelRouteSelection(input: Readonly<{
  providerId: RuntimeProviderId
  modelId: string
}>): ProviderModelRouteSelection {
  return providerModelRouteSelectionSchema.parse({
    schemaVersion: 1,
    kind: 'provider_model',
    providerId: input.providerId,
    modelId: input.modelId,
  })
}
