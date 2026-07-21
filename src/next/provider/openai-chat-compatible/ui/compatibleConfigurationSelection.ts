import { z } from 'zod'
import { compatibleModelIdSchema, credentialVersionRefSchema, endpointRevisionIdSchema, inlinePolicyIdSchema, providerInstanceIdSchema, reasoningMappingIdSchema, requestProfileIdSchema, responseProfileIdSchema } from '@/shared/provider/openai-chat-compatible/identity'
import { compatibleBoundedJsonValueSchema } from '@/shared/provider/openai-chat-compatible/schemas'

export const compatibleConfigurationSelectionSchema = z.object({
  kind: z.literal('openai_chat_compatible_configuration'),
  providerInstanceId: providerInstanceIdSchema,
  providerName: z.string().trim().min(1).max(256),
  modelId: compatibleModelIdSchema,
  endpointRevisionId: endpointRevisionIdSchema,
  credentialVersionRef: credentialVersionRefSchema.nullable(),
  requestProfileId: requestProfileIdSchema,
  requestProfileVersion: z.number().int().positive(),
  responseProfileId: responseProfileIdSchema,
  responseProfileVersion: z.number().int().positive(),
  reasoningMappingId: reasoningMappingIdSchema,
  reasoningMappingVersion: z.number().int().positive(),
  inlinePolicyId: inlinePolicyIdSchema,
  inlinePolicyVersion: z.number().int().positive(),
  extraBody: compatibleBoundedJsonValueSchema.nullable().default(null),
}).strict()

export type CompatibleConfigurationSelection = z.infer<typeof compatibleConfigurationSelectionSchema>

export type CompatibleConfigurationPickerSource = Readonly<{
  providerInstanceId: string
  providerName: string
  models: readonly Readonly<{
    modelId: string
    displayName: string
    sourceLabel: string
    selection: CompatibleConfigurationSelection
  }>[]
}>

export function buildCompatibleConfigurationSelectionKey(input: unknown): string {
  const selection = compatibleConfigurationSelectionSchema.parse(input)
  return `${selection.providerInstanceId}::${selection.modelId}::${selection.endpointRevisionId}`
}
