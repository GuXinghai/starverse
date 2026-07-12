import { z } from 'zod'
import {
  credentialVersionRefSchema,
  inlinePolicyIdSchema,
  reasoningMappingIdSchema,
  requestFieldMappingIdSchema,
  requestProfileIdSchema,
  responseProfileIdSchema,
  compatibleProfileVersionSchema,
} from './identity'

export const COMPATIBLE_JSON_SCHEMA_VERSION = 1 as const
export const COMPATIBLE_RAW_VALUE_MAX_BYTES = 16 * 1024
export const COMPATIBLE_RAW_VALUE_MAX_DEPTH = 8
export const COMPATIBLE_RAW_VALUE_MAX_NODES = 512
export const COMPATIBLE_RAW_STRING_MAX_LENGTH = 4096

const httpTokenPattern = /^[!#$%&'*+.^_`|~0-9A-Za-z-]+$/
const queryNamePattern = /^[A-Za-z0-9._~-]+$/
const dangerousObjectKeys = new Set(['__proto__', 'prototype', 'constructor'])
const protectedTransportHeaders = new Set([
  'host',
  'content-length',
  'connection',
  'keep-alive',
  'proxy-authenticate',
  'proxy-authorization',
  'te',
  'trailer',
  'transfer-encoding',
  'upgrade',
  'authorization',
  'accept',
  'content-type',
])
const sensitiveHeaderNames = new Set([
  'authorization',
  'proxy-authorization',
  'cookie',
  'set-cookie',
  'x-api-key',
  'api-key',
])
const standardResponseFieldNames = new Set([
  'id',
  'object',
  'created',
  'model',
  'choices',
  'usage',
  'system_fingerprint',
  'role',
  'content',
  'tool_calls',
  'finish_reason',
])

export const compatibleEndpointSecurityPolicySchema = z.enum(['compatibility_first', 'strict_ssrf'])
export type CompatibleEndpointSecurityPolicy = z.infer<typeof compatibleEndpointSecurityPolicySchema>

export function isCompatibleSecretLikeFieldName(value: unknown): boolean {
  const normalized = String(value ?? '').trim().toLowerCase()
  if (!normalized) return false
  if (sensitiveHeaderNames.has(normalized)) return true
  return /(^|[-_.])(?:api[-_.]?key|access|auth(?:orization)?|bearer|basic|client[-_.]?secret|credential|key|password|passwd|secret|session|signature|token|cookie)(?:[-_.]|$)/i.test(normalized)
}

export function normalizeCompatibleHeaderName(value: unknown): string {
  return String(value ?? '').trim().toLowerCase()
}

export function isCompatibleProtectedTransportHeaderName(value: unknown): boolean {
  const normalized = normalizeCompatibleHeaderName(value)
  return protectedTransportHeaders.has(normalized) || normalized.startsWith('sec-') || normalized.startsWith('proxy-')
}

export function looksLikeCompatibleSecretValue(value: unknown): boolean {
  const normalized = String(value ?? '').trim()
  if (!normalized) return false
  return /^(?:bearer|basic)\s+/i.test(normalized) ||
    /^(?:sk|pk|rk|sess|token|key|secret|password|auth)[-_][A-Za-z0-9_-]{8,}$/i.test(normalized) ||
    /^[A-Za-z0-9+/=_-]{32,}$/.test(normalized)
}

const headerNameSchema = z.string().trim().min(1).max(128).refine(
  (value) => httpTokenPattern.test(value),
  'Header name must be an RFC token.',
)

const ordinaryHeaderEntrySchema = z.object({
  name: headerNameSchema,
  value: z.string().max(8192),
  classification: z.literal('public_non_secret'),
}).strict()

export const compatibleOrdinaryHeadersSchema = z.array(ordinaryHeaderEntrySchema).max(64).superRefine((entries, ctx) => {
  const seen = new Set<string>()
  entries.forEach((entry, index) => {
    const name = entry.name.toLowerCase()
    if (seen.has(name)) {
      ctx.addIssue({ code: z.ZodIssueCode.custom, path: [index, 'name'], message: 'Duplicate header name.' })
    }
    seen.add(name)
    if (isCompatibleProtectedTransportHeaderName(name)) {
      ctx.addIssue({ code: z.ZodIssueCode.custom, path: [index, 'name'], message: 'Transport-owned header is forbidden.' })
    }
    if (isCompatibleSecretLikeFieldName(name) || looksLikeCompatibleSecretValue(entry.value)) {
      ctx.addIssue({ code: z.ZodIssueCode.custom, path: [index], message: 'Secret-like headers must use secure references.' })
    }
    if (/\r|\n/.test(entry.value)) {
      ctx.addIssue({ code: z.ZodIssueCode.custom, path: [index, 'value'], message: 'Header values cannot contain CR or LF.' })
    }
  })
})

const sensitiveHeaderRefSchema = z.object({
  name: headerNameSchema,
  credentialVersionRef: credentialVersionRefSchema,
}).strict()

export const compatibleSensitiveHeaderRefsSchema = z.array(sensitiveHeaderRefSchema).max(32).superRefine((entries, ctx) => {
  const seen = new Set<string>()
  entries.forEach((entry, index) => {
    const name = entry.name.toLowerCase()
    if (seen.has(name)) {
      ctx.addIssue({ code: z.ZodIssueCode.custom, path: [index, 'name'], message: 'Duplicate sensitive header name.' })
    }
    seen.add(name)
    if (isCompatibleProtectedTransportHeaderName(name)) {
      ctx.addIssue({ code: z.ZodIssueCode.custom, path: [index, 'name'], message: 'Transport-owned header is forbidden.' })
    }
  })
})

const queryEntrySchema = z.object({
  name: z.string().trim().min(1).max(128).refine((value) => queryNamePattern.test(value), 'Query name is invalid.'),
  value: z.string().max(8192),
  classification: z.literal('public_non_secret'),
}).strict()

export const compatibleQueryConfigSchema = z.array(queryEntrySchema).max(64).superRefine((entries, ctx) => {
  const seen = new Set<string>()
  entries.forEach((entry, index) => {
    const name = entry.name.toLowerCase()
    if (seen.has(name)) {
      ctx.addIssue({ code: z.ZodIssueCode.custom, path: [index, 'name'], message: 'Duplicate query parameter.' })
    }
    seen.add(name)
    if (isCompatibleSecretLikeFieldName(name) || looksLikeCompatibleSecretValue(entry.value)) {
      ctx.addIssue({ code: z.ZodIssueCode.custom, path: [index], message: 'Secrets are forbidden in query parameters.' })
    }
  })
})

export const compatibleAuthDescriptorSchema = z.discriminatedUnion('mode', [
  z.object({ mode: z.literal('none') }).strict(),
  z.object({ mode: z.literal('bearer'), credentialVersionRef: credentialVersionRefSchema }).strict(),
  z.object({ mode: z.literal('basic'), credentialVersionRef: credentialVersionRefSchema }).strict(),
  z.object({ mode: z.literal('custom_headers'), credentialVersionRef: credentialVersionRefSchema }).strict(),
])

const pathSegmentSchema = z.union([
  z.string().trim().min(1).max(128).refine((value) => !dangerousObjectKeys.has(value), 'Unsafe object path segment.'),
  z.number().int().nonnegative().max(1024),
])

export const compatibleObjectPathSchema = z.array(pathSegmentSchema).min(1).max(16)

const compatibleRequestProfileDefaultsSchema = z.record(z.unknown()).superRefine((value, ctx) => {
  const error = validateBoundedJsonValue(value, false, true)
  if (error) ctx.addIssue({ code: z.ZodIssueCode.custom, message: error })
  if (Object.keys(value).length > 64) ctx.addIssue({ code: z.ZodIssueCode.custom, message: 'Too many request profile defaults.' })
})

export const compatibleRequestProfileConfigSchema = z.object({
  schemaVersion: z.literal(COMPATIBLE_JSON_SCHEMA_VERSION),
  standardFieldOwnership: z.literal('builder'),
  unsupportedFieldPolicy: z.literal('error_before_fetch'),
  defaults: compatibleRequestProfileDefaultsSchema.default({}),
  extraBody: z.object({
    enabled: z.boolean(),
    maxDepth: z.number().int().min(1).max(16),
    maxKeys: z.number().int().min(1).max(512),
    maxBytes: z.number().int().min(1).max(256 * 1024),
  }).strict(),
}).strict()

export const compatibleRequestFieldMappingConfigSchema = z.object({
  schemaVersion: z.literal(COMPATIBLE_JSON_SCHEMA_VERSION),
  mappingId: requestFieldMappingIdSchema,
  requestProfileId: requestProfileIdSchema,
  requestProfileVersion: compatibleProfileVersionSchema,
  sourceField: z.enum(['reasoning_enabled', 'reasoning_effort', 'reasoning_budget']),
  targetPath: compatibleObjectPathSchema,
  valueKind: z.enum(['boolean', 'number', 'string']),
  valueMapping: z.record(z.union([z.null(), z.boolean(), z.number().finite(), z.string().max(4096)])).superRefine((value, ctx) => {
    if (Object.keys(value).length > 64) ctx.addIssue({ code: z.ZodIssueCode.custom, message: 'Too many mapped values.' })
    for (const [key, mapped] of Object.entries(value)) {
      if (dangerousObjectKeys.has(key)) ctx.addIssue({ code: z.ZodIssueCode.custom, path: [key], message: 'Unsafe mapped value key.' })
      const error = validateBoundedJsonValue(mapped, false, true)
      if (error) ctx.addIssue({ code: z.ZodIssueCode.custom, path: [key], message: error })
    }
  }),
  omission: z.enum(['omit_when_unset', 'required']),
}).strict()

export const compatibleResponseProfileConfigSchema = z.object({
  schemaVersion: z.literal(COMPATIBLE_JSON_SCHEMA_VERSION),
  choicePolicy: z.literal('preserve_all'),
  unknownFieldPolicy: z.literal('bounded_diagnostics'),
  reasoningMapping: z.object({
    mappingId: reasoningMappingIdSchema,
    version: compatibleProfileVersionSchema,
  }).strict(),
  inlinePolicy: z.object({
    inlinePolicyId: inlinePolicyIdSchema,
    version: compatibleProfileVersionSchema,
  }).strict(),
}).strict()

const reasoningPathDslSchema = z.string().min(1).max(1024).superRefine((value, ctx) => {
  const parts = value.split('.')
  if (parts.length > 32 || parts.some((part) => !(/^(?:[A-Za-z_][A-Za-z0-9_-]{0,127}|\*|0|[1-9][0-9]{0,5})$/.test(part)) || dangerousObjectKeys.has(part))) {
    ctx.addIssue({ code: z.ZodIssueCode.custom, message: 'Invalid compatible reasoning path.' })
  }
})
const reasoningTextPathDslSchema = reasoningPathDslSchema.refine((value) => !value.split('.').includes('*'), 'Reasoning textPath cannot use wildcard segments.')

const reasoningValueRuleSchema = z.object({
  stream: z.object({ path: reasoningPathDslSchema, mode: z.enum(['append', 'snapshot']), textPath: reasoningTextPathDslSchema.optional() }).strict(),
  final: z.object({ path: reasoningPathDslSchema, mode: z.enum(['snapshot', 'blocks']), textPath: reasoningTextPathDslSchema.optional() }).strict().optional(),
  semantic: z.enum(['text', 'blocks', 'opaque']),
}).strict().superRefine((value, ctx) => {
  if (value.semantic === 'text' && value.final?.mode === 'blocks') ctx.addIssue({ code: z.ZodIssueCode.custom, message: 'Text semantic cannot use blocks final mode.' })
  if (value.semantic === 'opaque' && (value.stream.textPath || value.final?.textPath)) ctx.addIssue({ code: z.ZodIssueCode.custom, message: 'Opaque semantic cannot expose textPath.' })
})

const compatibleReasoningReplaySchema = z.union([
  z.object({ format: z.literal('disabled'), scope: z.literal('never') }).strict(),
  z.object({ format: z.literal('assistant_field'), field: z.string().regex(/^[A-Za-z_][A-Za-z0-9_-]{0,127}$/), scope: z.enum(['tool_call_chain_only', 'all_assistant_messages']) }).strict(),
  z.object({ format: z.literal('assistant_content_tags'), openTag: z.string().min(3).max(64), closeTag: z.string().min(4).max(64), scope: z.enum(['tool_call_chain_only', 'all_assistant_messages']) }).strict(),
]).superRefine((value, ctx) => {
  if (value.format === 'assistant_content_tags' && (value.openTag === value.closeTag || /[\r\n]/.test(value.openTag + value.closeTag))) ctx.addIssue({ code: z.ZodIssueCode.custom, message: 'Invalid replay tags.' })
})

export const compatibleReasoningMappingConfigSchema = z.object({
  schemaVersion: z.literal(COMPATIBLE_JSON_SCHEMA_VERSION),
  mode: z.enum(['custom_preferred_with_builtin_fallback', 'custom_only']),
  rules: z.array(reasoningValueRuleSchema).max(32),
  replay: compatibleReasoningReplaySchema.default({ format: 'disabled', scope: 'never' }),
}).strict()

const customTagPairSchema = z.object({
  openTag: z.string().min(1),
  closeTag: z.string().min(1),
}).strict().superRefine((pair, ctx) => {
  if (pair.openTag === '<think>' || pair.closeTag === '</think>') {
    ctx.addIssue({ code: z.ZodIssueCode.custom, message: 'Canonical think tags are implicit and cannot be duplicated.' })
  }
  if (pair.openTag === pair.closeTag || /[\r\n]/.test(pair.openTag + pair.closeTag)) {
    ctx.addIssue({ code: z.ZodIssueCode.custom, message: 'Inline tag pair is invalid.' })
  }
  if (/^ {0,3}(?:`+|~{3,})/.test(pair.openTag) || /^ {0,3}(?:`+|~{3,})/.test(pair.closeTag)) ctx.addIssue({ code: z.ZodIssueCode.custom, message: 'Inline tags conflict with Markdown delimiters.' })
  const encoder = new TextEncoder()
  if (encoder.encode(pair.openTag).byteLength > 128 || encoder.encode(pair.closeTag).byteLength > 128) ctx.addIssue({ code: z.ZodIssueCode.custom, message: 'Inline tag exceeds UTF-8 byte limit.' })
})

export const compatibleInlinePolicyConfigSchema = z.object({
  schemaVersion: z.literal(COMPATIBLE_JSON_SCHEMA_VERSION),
  canonicalThinkTags: z.literal(true),
  customTags: z.array(customTagPairSchema).max(16).superRefine((pairs, ctx) => {
    const tokens = ['<think>', '</think>', ...pairs.flatMap((pair) => [pair.openTag, pair.closeTag])]
    if (new TextEncoder().encode(tokens.join('')).byteLength > 4096) ctx.addIssue({ code: z.ZodIssueCode.custom, message: 'Inline matcher state exceeds byte limit.' })
    for (let index = 0; index < tokens.length; index += 1) for (let other = 0; other < tokens.length; other += 1) {
      if (index !== other && tokens[other]!.startsWith(tokens[index]!)) ctx.addIssue({ code: z.ZodIssueCode.custom, message: 'Inline tags have duplicate or prefix ambiguity.' })
    }
  }),
}).strict()

const nullableCapabilitySchema = z.boolean().nullable()
const nullablePriceSchema = z.string().trim().regex(/^\d+(?:\.\d+)?$/).nullable()

export const compatibleModelMetadataSchema = z.object({
  schemaVersion: z.literal(COMPATIBLE_JSON_SCHEMA_VERSION),
  displayName: z.string().trim().min(1).max(256).nullable(),
  contextLength: z.number().int().positive().nullable(),
  maxOutputTokens: z.number().int().positive().nullable(),
  capabilities: z.object({
    text: nullableCapabilitySchema,
    vision: nullableCapabilitySchema,
    tools: nullableCapabilitySchema,
    structuredOutputs: nullableCapabilitySchema,
    reasoning: nullableCapabilitySchema,
  }).strict(),
  pricing: z.object({
    prompt: nullablePriceSchema,
    completion: nullablePriceSchema,
    request: nullablePriceSchema,
    image: nullablePriceSchema,
  }).strict(),
  fieldProvenance: z.record(z.enum(['remote_sync', 'manual', 'unknown'])),
}).strict()

const diagnosticCodeSchema = z.string().trim().min(1).max(128).regex(/^[a-z][a-z0-9_.-]*$/)

export const compatibleCatalogSyncDiagnosticsSchema = z.object({
  schemaVersion: z.literal(COMPATIBLE_JSON_SCHEMA_VERSION),
  code: diagnosticCodeSchema,
  messageKey: diagnosticCodeSchema,
  retryable: z.boolean(),
  httpStatus: z.number().int().min(100).max(599).nullable(),
}).strict()

export const compatibleRedactedPreviewSchema = z.object({
  kind: z.literal('redacted'),
  valueType: z.enum(['null', 'boolean', 'number', 'string', 'array', 'object']),
  originalLength: z.number().int().nonnegative().max(1_000_000_000).nullable(),
}).strict()

export const compatibleDiscoveredFieldAggregateSchema = z.object({
  schemaVersion: z.literal(COMPATIBLE_JSON_SCHEMA_VERSION),
  observedShapes: z.array(z.enum(['null', 'boolean', 'number', 'string', 'array', 'object'])).min(1).max(6),
  redactedPreview: compatibleRedactedPreviewSchema.nullable(),
  sampleCount: z.number().int().positive().max(1_000_000_000),
}).strict()

const redactedStringTokens = new Set(['[redacted]', '[truncated]', '[dropped]'])

function validateBoundedJsonValue(
  value: unknown,
  rejectStandardFields: boolean,
  allowArbitraryStrings: boolean,
): string | null {
  let nodes = 0
  const ancestors = new WeakSet<object>()
  const visit = (candidate: unknown, depth: number): string | null => {
    nodes += 1
    if (nodes > COMPATIBLE_RAW_VALUE_MAX_NODES) return 'JSON value has too many nodes.'
    if (depth > COMPATIBLE_RAW_VALUE_MAX_DEPTH) return 'JSON value is too deeply nested.'
    if (candidate === null || typeof candidate === 'boolean') return null
    if (typeof candidate === 'number') return Number.isFinite(candidate) ? null : 'JSON numbers must be finite.'
    if (typeof candidate === 'string') {
      if (candidate.length > COMPATIBLE_RAW_STRING_MAX_LENGTH) return 'JSON string is too long.'
      if (!allowArbitraryStrings && !redactedStringTokens.has(candidate)) {
        return 'Raw extension strings must be redacted before persistence.'
      }
      if (looksLikeCompatibleSecretValue(candidate)) return 'JSON string contains a secret-like value.'
      return null
    }
    if (!candidate || typeof candidate !== 'object') return 'Value is not JSON-compatible.'
    if (ancestors.has(candidate)) return 'Value contains a cycle.'
    ancestors.add(candidate)
    try {
      if (Array.isArray(candidate)) {
        for (const item of candidate) {
          const error = visit(item, depth + 1)
          if (error) return error
        }
        return null
      }
      for (const [key, child] of Object.entries(candidate as Record<string, unknown>)) {
        if (dangerousObjectKeys.has(key)) return 'Unsafe object key.'
        if (isCompatibleSecretLikeFieldName(key)) return 'Secret-like object key.'
        if (rejectStandardFields && standardResponseFieldNames.has(key)) return 'Standard response fields cannot be duplicated in raw extensions.'
        const error = visit(child, depth + 1)
        if (error) return error
      }
      return null
    } finally {
      ancestors.delete(candidate)
    }
  }
  const error = visit(value, 0)
  if (error) return error
  try {
    const serialized = JSON.stringify(value)
    if (serialized === undefined) return 'Value is not JSON-compatible.'
    if (new TextEncoder().encode(serialized).byteLength > COMPATIBLE_RAW_VALUE_MAX_BYTES) {
      return 'JSON value exceeds the byte limit.'
    }
  } catch {
    return 'Value is not serializable JSON.'
  }
  return null
}

export const compatibleBoundedJsonValueSchema = z.unknown().superRefine((value, ctx) => {
  const error = validateBoundedJsonValue(value, false, true)
  if (error) ctx.addIssue({ code: z.ZodIssueCode.custom, message: error })
})

export const compatibleRawExtensionValueSchema = z.unknown().superRefine((value, ctx) => {
  const error = validateBoundedJsonValue(value, true, false)
  if (error) ctx.addIssue({ code: z.ZodIssueCode.custom, message: error })
})

export const compatibleCredentialMaskedSummarySchema = z.object({
  schemaVersion: z.literal(COMPATIBLE_JSON_SCHEMA_VERSION),
  authMode: z.enum(['none', 'bearer', 'basic', 'custom_headers']),
  configured: z.boolean(),
  maskState: z.enum(['not_applicable', 'not_configured', 'configured_masked']),
  sensitiveHeaderNames: z.array(headerNameSchema).max(32),
}).strict().superRefine((value, ctx) => {
  const expectedMaskState = value.authMode === 'none'
    ? 'not_applicable'
    : value.configured ? 'configured_masked' : 'not_configured'
  if (value.maskState !== expectedMaskState) {
    ctx.addIssue({ code: z.ZodIssueCode.custom, path: ['maskState'], message: 'Credential mask state is inconsistent.' })
  }
  if (value.authMode !== 'custom_headers' && value.sensitiveHeaderNames.length > 0) {
    ctx.addIssue({ code: z.ZodIssueCode.custom, path: ['sensitiveHeaderNames'], message: 'Sensitive header names require custom_headers auth.' })
  }
})

export const compatibleProfileReferenceSchema = z.object({
  requestProfileId: requestProfileIdSchema,
  requestProfileVersion: compatibleProfileVersionSchema,
  responseProfileId: responseProfileIdSchema,
  responseProfileVersion: compatibleProfileVersionSchema,
}).strict()

export type CompatibleAuthDescriptor = z.infer<typeof compatibleAuthDescriptorSchema>
export type CompatibleOrdinaryHeaders = z.infer<typeof compatibleOrdinaryHeadersSchema>
export type CompatibleSensitiveHeaderRefs = z.infer<typeof compatibleSensitiveHeaderRefsSchema>
export type CompatibleQueryConfig = z.infer<typeof compatibleQueryConfigSchema>
export type CompatibleRequestProfileConfig = z.infer<typeof compatibleRequestProfileConfigSchema>
export type CompatibleRequestFieldMappingConfig = z.infer<typeof compatibleRequestFieldMappingConfigSchema>
export type CompatibleResponseProfileConfig = z.infer<typeof compatibleResponseProfileConfigSchema>
export type CompatibleReasoningMappingConfig = z.infer<typeof compatibleReasoningMappingConfigSchema>
export type CompatibleInlinePolicyConfig = z.infer<typeof compatibleInlinePolicyConfigSchema>
export type CompatibleModelMetadata = z.infer<typeof compatibleModelMetadataSchema>
export type CompatibleCatalogSyncDiagnostics = z.infer<typeof compatibleCatalogSyncDiagnosticsSchema>
export type CompatibleDiscoveredFieldAggregate = z.infer<typeof compatibleDiscoveredFieldAggregateSchema>
export type CompatibleCredentialMaskedSummary = z.infer<typeof compatibleCredentialMaskedSummarySchema>
