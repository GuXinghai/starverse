import { compatibleReasoningMappingConfigSchema } from '../schemas'

// Headless callers and repository saves share the same canonical schema.
export const compatibleReasoningPolicySchema = compatibleReasoningMappingConfigSchema.omit({ schemaVersion: true })
export const compatibleReasoningRuleSchema = compatibleReasoningMappingConfigSchema.shape.rules.element
export const compatibleReasoningReplayPolicySchema = compatibleReasoningMappingConfigSchema.shape.replay
