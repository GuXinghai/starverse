import { z } from 'zod'
import {
  compatibleChoiceIndexSchema,
  compatibleModelIdSchema,
  compatibleRequestIdSchema,
  credentialVersionRefSchema,
  endpointRevisionIdSchema,
  inlinePolicyIdSchema,
  providerInstanceIdSchema,
  reasoningMappingIdSchema,
  requestProfileIdSchema,
  responseProfileIdSchema,
  routeProvenanceIdSchema,
} from '../identity'

export const compatibleRouteSelectionSchema = z.object({
  providerInstanceId: providerInstanceIdSchema,
  modelId: compatibleModelIdSchema,
}).strict()

export const compatibleRouteSelectedPinsSchema = compatibleRouteSelectionSchema.extend({
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
}).strict()

export const compatibleRoutePrepareIdentitySchema = compatibleRouteSelectionSchema.extend({
  routeProvenanceId: routeProvenanceIdSchema,
  requestId: compatibleRequestIdSchema,
  createdAtMs: z.number().int().nonnegative(),
}).strict()

export const compatibleRoutePinSourceSchema = z.discriminatedUnion('kind', [
  z.object({ kind: z.literal('selected'), pins: compatibleRouteSelectedPinsSchema }).strict(),
  z.object({ kind: z.literal('historical'), routeProvenanceId: routeProvenanceIdSchema }).strict(),
])

export const compatibleRouteTransitionSchema = z.object({
  routeProvenanceId: routeProvenanceIdSchema,
  targetState: z.enum(['streaming', 'completed', 'failed', 'aborted', 'interrupted']),
  atMs: z.number().int().nonnegative(),
}).strict()

export const compatibleRouteAdditionalChoiceSchema = z.object({
  routeProvenanceId: routeProvenanceIdSchema,
  choiceIndex: compatibleChoiceIndexSchema.refine((value) => value > 0, 'Additional choice index must be greater than zero.'),
  createdAtMs: z.number().int().nonnegative(),
}).strict()

export const compatibleRoutePrepareChoicesSchema = z.object({
  routeProvenanceId: routeProvenanceIdSchema,
  choiceCount: z.number().int().min(1).max(16),
  createdAtMs: z.number().int().nonnegative(),
}).strict()

export const compatibleRoutePrepareExistingHistoricalSchema = z.object({
  route: z.object({
    routeProvenanceId: routeProvenanceIdSchema,
    requestId: compatibleRequestIdSchema,
    createdAtMs: z.number().int().nonnegative(),
  }).strict(),
  sourceRouteProvenanceId: routeProvenanceIdSchema,
  branchId: z.string().trim().min(1).max(256),
  questionId: z.string().trim().min(1).max(256),
  assistantId: z.string().trim().min(1).max(256),
}).strict()

export const compatibleHistoricalRouteLookupSchema = z.discriminatedUnion('kind', [
  z.object({ kind: z.literal('request_message'), messageId: z.string().trim().min(1).max(256) }).strict(),
  z.object({ kind: z.literal('choice_message'), messageId: z.string().trim().min(1).max(256) }).strict(),
  z.object({ kind: z.literal('route'), routeProvenanceId: routeProvenanceIdSchema }).strict(),
])

export const compatibleRouteRecordSchema = z.object({
  routeProvenanceId: routeProvenanceIdSchema,
  requestId: compatibleRequestIdSchema,
  requestMessageId: z.string().trim().min(1).max(256),
  protocolKey: z.literal('openai_chat_compatible'),
  providerInstanceId: providerInstanceIdSchema,
  modelId: compatibleModelIdSchema,
  endpointRevisionId: endpointRevisionIdSchema,
  credentialVersionRef: credentialVersionRefSchema.nullable(),
  requestProfileId: requestProfileIdSchema,
  requestProfileVersion: z.number().int().positive(),
  responseProfileId: responseProfileIdSchema,
  responseProfileVersion: z.number().int().positive(),
  reasoningMappingId: reasoningMappingIdSchema,
  reasoningMappingVersion: z.number().int().positive(),
  reasoningMode: z.enum(['custom_preferred_with_builtin_fallback', 'custom_only']),
  inlinePolicyId: inlinePolicyIdSchema,
  inlinePolicyVersion: z.number().int().positive(),
  state: z.enum(['prepared', 'streaming', 'completed', 'failed', 'aborted', 'interrupted']),
  createdAtMs: z.number().int().nonnegative(),
  updatedAtMs: z.number().int().nonnegative(),
  terminalAtMs: z.number().int().nonnegative().nullable(),
}).strict()

export const compatibleRouteChoiceRecordSchema = z.object({
  routeProvenanceId: routeProvenanceIdSchema,
  choiceIndex: compatibleChoiceIndexSchema,
  messageId: z.string().trim().min(1).max(256),
  createdAtMs: z.number().int().nonnegative(),
}).strict()

export const compatiblePreparedTurnResultSchema = z.object({
  route: compatibleRouteRecordSchema,
  choice: compatibleRouteChoiceRecordSchema,
  convoId: z.string().trim().min(1).max(256),
  branchId: z.string().trim().min(1).max(256),
  questionId: z.string().trim().min(1).max(256),
  questionSeq: z.number().int().nonnegative(),
  assistantId: z.string().trim().min(1).max(256),
  assistantSeq: z.number().int().nonnegative(),
  availability: z.object({
    available: z.boolean(),
    code: z.enum(['ready', 'provider_disabled', 'provider_deleted', 'credential_missing', 'credential_deleted']),
  }).strict(),
}).strict()

export const compatibleHistoricalRouteResultSchema = z.object({
  route: compatibleRouteRecordSchema,
  choices: z.array(compatibleRouteChoiceRecordSchema).max(1025),
  availability: z.object({
    available: z.boolean(),
    code: z.enum(['ready', 'provider_disabled', 'provider_deleted', 'credential_missing', 'credential_deleted']),
  }).strict(),
}).strict()

export type CompatibleRouteSelection = z.infer<typeof compatibleRouteSelectionSchema>
export type CompatibleRouteSelectedPins = z.infer<typeof compatibleRouteSelectedPinsSchema>
export type CompatibleRoutePrepareIdentity = z.infer<typeof compatibleRoutePrepareIdentitySchema>
export type CompatibleRoutePinSource = z.infer<typeof compatibleRoutePinSourceSchema>
export type CompatibleRouteTransition = z.infer<typeof compatibleRouteTransitionSchema>
export type CompatibleRouteAdditionalChoice = z.infer<typeof compatibleRouteAdditionalChoiceSchema>
export type CompatibleRoutePrepareChoices = z.infer<typeof compatibleRoutePrepareChoicesSchema>
export type CompatibleRoutePrepareExistingHistorical = z.infer<typeof compatibleRoutePrepareExistingHistoricalSchema>
export type CompatibleHistoricalRouteLookup = z.infer<typeof compatibleHistoricalRouteLookupSchema>
export type CompatiblePreparedTurnResult = z.infer<typeof compatiblePreparedTurnResultSchema>
export type CompatibleHistoricalRouteResult = z.infer<typeof compatibleHistoricalRouteResultSchema>

export type CompatibleRouteAvailability = Readonly<{
  available: boolean
  code: 'ready' | 'provider_disabled' | 'provider_deleted' | 'credential_missing' | 'credential_deleted'
}>
