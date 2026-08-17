import { z } from 'zod'
import {
  compatibleOrdinaryHeadersSchema,
  compatibleEndpointSecurityPolicySchema,
  compatibleQueryConfigSchema,
  isCompatibleProtectedTransportHeaderName,
  isCompatibleSecretLikeFieldName,
  looksLikeCompatibleSecretValue,
  normalizeCompatibleHeaderName,
  compatibleObjectPathSchema,
  compatibleRequestProfileConfigSchema,
  compatibleReasoningMappingConfigSchema,
  compatibleInlinePolicyConfigSchema,
} from '../schemas'
import { credentialVersionRefSchema, providerInstanceIdSchema } from '../identity'

const headerTokenPattern = /^[!#$%&'*+.^_`|~0-9A-Za-z-]+$/

export const compatibleRegistryBaseUrlSchema = z.string().trim().min(1).max(2048).transform((value, ctx) => {
  let parsed: URL
  try {
    parsed = new URL(value)
  } catch {
    ctx.addIssue({ code: z.ZodIssueCode.custom, message: 'Base URL is invalid.' })
    return z.NEVER
  }
  if (parsed.protocol !== 'http:' && parsed.protocol !== 'https:') {
    ctx.addIssue({ code: z.ZodIssueCode.custom, message: 'Only HTTP(S) Base URLs are allowed.' })
    return z.NEVER
  }
  if (parsed.username || parsed.password) {
    ctx.addIssue({ code: z.ZodIssueCode.custom, message: 'Base URL userinfo is forbidden.' })
    return z.NEVER
  }
  if (parsed.search || parsed.hash) {
    ctx.addIssue({ code: z.ZodIssueCode.custom, message: 'Base URL query and fragment are forbidden.' })
    return z.NEVER
  }
  const pathname = parsed.pathname.replace(/\/+$/u, '')
  const apiPath = pathname.endsWith('/v1')
    ? pathname.replace(/(?:\/v1)+$/u, '/v1')
    : `${pathname}/v1`
  return `${parsed.origin}${apiPath}`
})

const sensitiveHeaderInputSchema = z.object({
  name: z.string().trim().min(1).max(128).refine((value) => headerTokenPattern.test(value), 'Header name must be an RFC token.'),
  value: z.string().min(1).max(64 * 1024),
}).strict()

export const compatibleRegistryCredentialInputSchema = z.discriminatedUnion('mode', [
  z.object({ mode: z.literal('none') }).strict(),
  z.object({ mode: z.literal('bearer'), token: z.string().trim().min(1).max(64 * 1024) }).strict(),
  z.object({
    mode: z.literal('basic'),
    username: z.string().min(1).max(4096),
    password: z.string().min(1).max(64 * 1024),
  }).strict(),
  z.object({
    mode: z.literal('custom_headers'),
    headers: z.array(sensitiveHeaderInputSchema).min(1).max(32),
  }).strict(),
]).superRefine((value, ctx) => {
  if (value.mode === 'custom_headers') {
    const seen = new Set<string>()
    value.headers.forEach((entry, index) => {
      const name = normalizeCompatibleHeaderName(entry.name)
      if (seen.has(name)) {
        ctx.addIssue({ code: z.ZodIssueCode.custom, path: ['headers', index, 'name'], message: 'Duplicate sensitive header name.' })
      }
      seen.add(name)
      if (isCompatibleProtectedTransportHeaderName(name)) {
        ctx.addIssue({ code: z.ZodIssueCode.custom, path: ['headers', index, 'name'], message: 'Transport-owned header is forbidden.' })
      }
      if (/\r|\n/u.test(entry.value)) {
        ctx.addIssue({ code: z.ZodIssueCode.custom, path: ['headers', index, 'value'], message: 'Header values cannot contain CR or LF.' })
      }
    })
  }
})

export const compatibleRegistryEndpointConfigSchema = z.object({
  baseUrl: compatibleRegistryBaseUrlSchema,
  securityPolicy: compatibleEndpointSecurityPolicySchema,
  ordinaryHeaders: compatibleOrdinaryHeadersSchema,
  query: compatibleQueryConfigSchema,
}).strict().transform((value) => ({
  baseUrl: value.baseUrl,
  allowInsecureHttp: value.baseUrl.startsWith('http:'),
  securityPolicy: value.securityPolicy,
  ordinaryHeaders: [...value.ordinaryHeaders]
    .map((entry) => ({ ...entry, name: normalizeCompatibleHeaderName(entry.name) }))
    .sort((left, right) => left.name.localeCompare(right.name)),
  query: [...value.query]
    .map((entry) => ({ ...entry, name: entry.name.trim() }))
    .sort((left, right) => left.name.localeCompare(right.name)),
}))

export const createCompatibleProviderCommandSchema = z.object({
  displayName: z.string().trim().min(1).max(256),
  endpoint: compatibleRegistryEndpointConfigSchema,
  credential: compatibleRegistryCredentialInputSchema,
  requestMappings: z.array(z.object({
    sourceField: z.enum(['reasoning_enabled', 'reasoning_effort', 'reasoning_budget']),
    targetPath: compatibleObjectPathSchema,
    omission: z.enum(['omit_when_unset', 'required']),
  }).strict()).max(32).default([]),
}).strict()

export const updateCompatibleProviderCommandSchema = z.object({
  providerInstanceId: providerInstanceIdSchema,
  displayName: z.string().trim().min(1).max(256).optional(),
  status: z.enum(['active', 'disabled']).optional(),
}).strict().refine((value) => value.displayName !== undefined || value.status !== undefined, {
  message: 'At least one provider field must be updated.',
})

export const updateCompatibleEndpointCommandSchema = z.object({
  providerInstanceId: providerInstanceIdSchema,
  endpoint: compatibleRegistryEndpointConfigSchema,
  clearAuthentication: z.boolean().default(false),
}).strict()

const compatibleRegistryRequestMappingInputSchema = z.object({
  sourceField: z.enum(['reasoning_enabled', 'reasoning_effort', 'reasoning_budget']),
  targetPath: compatibleObjectPathSchema,
  omission: z.enum(['omit_when_unset', 'required']),
}).strict()

export const reviseCompatibleConfigurationCommandSchema = z.object({
  providerInstanceId: providerInstanceIdSchema,
  requestProfile: compatibleRequestProfileConfigSchema,
  requestMappings: z.array(compatibleRegistryRequestMappingInputSchema).max(32),
  reasoningMapping: compatibleReasoningMappingConfigSchema,
  inlinePolicy: compatibleInlinePolicyConfigSchema,
  acceptedDiscoveryPaths: z.array(z.string().trim().min(1).max(1024)).max(32).default([]),
}).strict()

export const rotateCompatibleCredentialCommandSchema = z.object({
  providerInstanceId: providerInstanceIdSchema,
  credential: compatibleRegistryCredentialInputSchema.refine((value) => value.mode !== 'none', {
    message: 'Credential rotation requires an authenticated mode.',
  }),
}).strict()

export const deleteCompatibleCredentialCommandSchema = z.object({
  credentialVersionRef: credentialVersionRefSchema,
}).strict()

export const compatibleProviderIdCommandSchema = z.object({
  providerInstanceId: providerInstanceIdSchema,
}).strict()

export type CompatibleRegistryCredentialInput = z.infer<typeof compatibleRegistryCredentialInputSchema>
export type CompatibleRegistryEndpointConfig = z.infer<typeof compatibleRegistryEndpointConfigSchema>

export function assertCompatibleQueryValueIsPublic(name: string, value: string): void {
  if (isCompatibleSecretLikeFieldName(name) || looksLikeCompatibleSecretValue(value)) {
    throw new Error('Secrets are forbidden in query parameters.')
  }
}
