import type BetterSqlite3 from 'better-sqlite3'
import { z } from 'zod'
import {
  compatibleInlinePolicyConfigSchema,
  compatibleObjectPathSchema,
  compatibleProfileVersionSchema,
  compatibleReasoningMappingConfigSchema,
  compatibleRequestFieldMappingConfigSchema,
  compatibleRequestProfileConfigSchema,
  compatibleResponseProfileConfigSchema,
  inlinePolicyIdSchema,
  reasoningMappingIdSchema,
  requestFieldMappingIdSchema,
  requestProfileIdSchema,
  responseProfileIdSchema,
  type CompatibleInlineReasoningPolicy,
  type CompatibleReasoningMapping,
  type CompatibleRequestFieldMapping,
  type CompatibleRequestProfile,
  type CompatibleResponseProfile,
} from '../../../src/shared/provider/openai-chat-compatible'

const timestampSchema = z.number().int().nonnegative()

export const CreateCompatibleRequestProfileInputSchema = z.object({
  requestProfileId: requestProfileIdSchema,
  version: compatibleProfileVersionSchema,
  config: compatibleRequestProfileConfigSchema,
  createdAtMs: timestampSchema,
}).strict()

export const CreateCompatibleRequestFieldMappingInputSchema = z.object({
  mappingId: requestFieldMappingIdSchema,
  version: compatibleProfileVersionSchema,
  requestProfileId: requestProfileIdSchema,
  requestProfileVersion: compatibleProfileVersionSchema,
  targetPath: compatibleObjectPathSchema,
  config: compatibleRequestFieldMappingConfigSchema,
  createdAtMs: timestampSchema,
}).strict().superRefine((value, ctx) => {
  if (value.config.mappingId !== value.mappingId ||
      value.config.requestProfileId !== value.requestProfileId ||
      value.config.requestProfileVersion !== value.requestProfileVersion ||
      JSON.stringify(value.config.targetPath) !== JSON.stringify(value.targetPath)) {
    ctx.addIssue({ code: z.ZodIssueCode.custom, message: 'Request mapping identity/config fields must match.' })
  }
})

export const CreateCompatibleReasoningMappingInputSchema = z.object({
  mappingId: reasoningMappingIdSchema,
  version: compatibleProfileVersionSchema,
  config: compatibleReasoningMappingConfigSchema,
  createdAtMs: timestampSchema,
}).strict()

export const CreateCompatibleInlinePolicyInputSchema = z.object({
  inlinePolicyId: inlinePolicyIdSchema,
  version: compatibleProfileVersionSchema,
  config: compatibleInlinePolicyConfigSchema,
  createdAtMs: timestampSchema,
}).strict()

export const CreateCompatibleResponseProfileInputSchema = z.object({
  responseProfileId: responseProfileIdSchema,
  version: compatibleProfileVersionSchema,
  reasoningMappingId: reasoningMappingIdSchema,
  reasoningMappingVersion: compatibleProfileVersionSchema,
  inlinePolicyId: inlinePolicyIdSchema,
  inlinePolicyVersion: compatibleProfileVersionSchema,
  config: compatibleResponseProfileConfigSchema,
  createdAtMs: timestampSchema,
}).strict().superRefine((value, ctx) => {
  if (value.config.reasoningMapping.mappingId !== value.reasoningMappingId ||
      value.config.reasoningMapping.version !== value.reasoningMappingVersion ||
      value.config.inlinePolicy.inlinePolicyId !== value.inlinePolicyId ||
      value.config.inlinePolicy.version !== value.inlinePolicyVersion) {
    ctx.addIssue({ code: z.ZodIssueCode.custom, message: 'Response profile references and config must match.' })
  }
})

export type CreateCompatibleRequestProfileInput = z.input<typeof CreateCompatibleRequestProfileInputSchema>
export type CreateCompatibleRequestFieldMappingInput = z.input<typeof CreateCompatibleRequestFieldMappingInputSchema>
export type CreateCompatibleReasoningMappingInput = z.input<typeof CreateCompatibleReasoningMappingInputSchema>
export type CreateCompatibleInlinePolicyInput = z.input<typeof CreateCompatibleInlinePolicyInputSchema>
export type CreateCompatibleResponseProfileInput = z.input<typeof CreateCompatibleResponseProfileInputSchema>

type VersionedRow = { version: number; config_json: string; created_at_ms: number }

export class CompatibleProfileRepo {
  constructor(private readonly db: BetterSqlite3.Database) {}

  createRequestProfile(input: CreateCompatibleRequestProfileInput): CompatibleRequestProfile {
    const value = CreateCompatibleRequestProfileInputSchema.parse(input)
    this.db.prepare(`
      INSERT INTO compatible_request_profiles (
        request_profile_id, version, schema_version, config_json, created_at_ms
      ) VALUES (@requestProfileId, @version, 1, @configJson, @createdAtMs)
    `).run({ ...value, configJson: JSON.stringify(value.config) })
    return this.getRequestProfile(value.requestProfileId, value.version)!
  }

  getRequestProfile(requestProfileId: unknown, version: unknown): CompatibleRequestProfile | null {
    const id = requestProfileIdSchema.parse(requestProfileId)
    const parsedVersion = compatibleProfileVersionSchema.parse(version)
    const row = this.db.prepare(`
      SELECT version, config_json, created_at_ms FROM compatible_request_profiles
      WHERE request_profile_id = ? AND version = ?
    `).get(id, parsedVersion) as VersionedRow | undefined
    return row ? {
      requestProfileId: id,
      version: row.version,
      config: compatibleRequestProfileConfigSchema.parse(JSON.parse(row.config_json)),
      createdAtMs: row.created_at_ms,
    } : null
  }

  createRequestFieldMapping(input: CreateCompatibleRequestFieldMappingInput): CompatibleRequestFieldMapping {
    const value = CreateCompatibleRequestFieldMappingInputSchema.parse(input)
    const referenced = this.db.prepare(`
      SELECT 1 FROM compatible_endpoint_revisions
      WHERE request_profile_id = ? AND request_profile_version = ?
      LIMIT 1
    `).get(value.requestProfileId, value.requestProfileVersion)
    if (referenced) throw new Error('compatible_request_profile_bundle_immutable')
    this.db.prepare(`
      INSERT INTO compatible_request_field_mappings (
        mapping_id, version, request_profile_id, request_profile_version,
        target_path_json, config_json, created_at_ms
      ) VALUES (
        @mappingId, @version, @requestProfileId, @requestProfileVersion,
        @targetPathJson, @configJson, @createdAtMs
      )
    `).run({
      ...value,
      targetPathJson: JSON.stringify(value.targetPath),
      configJson: JSON.stringify(value.config),
    })
    return this.getRequestFieldMapping(value.mappingId, value.version)!
  }

  getRequestFieldMapping(mappingId: unknown, version: unknown): CompatibleRequestFieldMapping | null {
    const id = requestFieldMappingIdSchema.parse(mappingId)
    const parsedVersion = compatibleProfileVersionSchema.parse(version)
    const row = this.db.prepare(`
      SELECT * FROM compatible_request_field_mappings WHERE mapping_id = ? AND version = ?
    `).get(id, parsedVersion) as {
      version: number
      request_profile_id: string
      request_profile_version: number
      target_path_json: string
      config_json: string
      created_at_ms: number
    } | undefined
    return row ? {
      mappingId: id,
      version: row.version,
      requestProfileId: requestProfileIdSchema.parse(row.request_profile_id),
      requestProfileVersion: row.request_profile_version,
      targetPath: compatibleObjectPathSchema.parse(JSON.parse(row.target_path_json)),
      config: compatibleRequestFieldMappingConfigSchema.parse(JSON.parse(row.config_json)),
      createdAtMs: row.created_at_ms,
    } : null
  }

  listRequestFieldMappings(requestProfileId: unknown, requestProfileVersion: unknown): CompatibleRequestFieldMapping[] {
    const profileId = requestProfileIdSchema.parse(requestProfileId)
    const profileVersion = compatibleProfileVersionSchema.parse(requestProfileVersion)
    const rows = this.db.prepare(`
      SELECT mapping_id, version FROM compatible_request_field_mappings
      WHERE request_profile_id = ? AND request_profile_version = ?
      ORDER BY mapping_id, version
    `).all(profileId, profileVersion) as Array<{ mapping_id: string; version: number }>
    return rows.map((row) => this.getRequestFieldMapping(row.mapping_id, row.version)!)
  }

  createReasoningMapping(input: CreateCompatibleReasoningMappingInput): CompatibleReasoningMapping {
    const value = CreateCompatibleReasoningMappingInputSchema.parse(input)
    this.db.prepare(`
      INSERT INTO compatible_reasoning_mappings (
        mapping_id, version, mode, schema_version, config_json, created_at_ms
      ) VALUES (@mappingId, @version, @mode, 1, @configJson, @createdAtMs)
    `).run({ ...value, mode: value.config.mode, configJson: JSON.stringify(value.config) })
    return this.getReasoningMapping(value.mappingId, value.version)!
  }

  getReasoningMapping(mappingId: unknown, version: unknown): CompatibleReasoningMapping | null {
    const id = reasoningMappingIdSchema.parse(mappingId)
    const parsedVersion = compatibleProfileVersionSchema.parse(version)
    const row = this.db.prepare(`
      SELECT version, mode, config_json, created_at_ms FROM compatible_reasoning_mappings
      WHERE mapping_id = ? AND version = ?
    `).get(id, parsedVersion) as VersionedRow & { mode: CompatibleReasoningMapping['mode'] } | undefined
    if (!row) return null
    const config = compatibleReasoningMappingConfigSchema.parse(JSON.parse(row.config_json))
    if (config.mode !== row.mode) throw new Error('Stored reasoning mapping mode/config mismatch.')
    return { mappingId: id, version: row.version, mode: row.mode, config, createdAtMs: row.created_at_ms }
  }

  createInlinePolicy(input: CreateCompatibleInlinePolicyInput): CompatibleInlineReasoningPolicy {
    const value = CreateCompatibleInlinePolicyInputSchema.parse(input)
    this.db.prepare(`
      INSERT INTO compatible_inline_policies (
        inline_policy_id, version, schema_version, config_json, created_at_ms
      ) VALUES (@inlinePolicyId, @version, 1, @configJson, @createdAtMs)
    `).run({ ...value, configJson: JSON.stringify(value.config) })
    return this.getInlinePolicy(value.inlinePolicyId, value.version)!
  }

  getInlinePolicy(inlinePolicyId: unknown, version: unknown): CompatibleInlineReasoningPolicy | null {
    const id = inlinePolicyIdSchema.parse(inlinePolicyId)
    const parsedVersion = compatibleProfileVersionSchema.parse(version)
    const row = this.db.prepare(`
      SELECT version, config_json, created_at_ms FROM compatible_inline_policies
      WHERE inline_policy_id = ? AND version = ?
    `).get(id, parsedVersion) as VersionedRow | undefined
    return row ? {
      inlinePolicyId: id,
      version: row.version,
      config: compatibleInlinePolicyConfigSchema.parse(JSON.parse(row.config_json)),
      createdAtMs: row.created_at_ms,
    } : null
  }

  createResponseProfile(input: CreateCompatibleResponseProfileInput): CompatibleResponseProfile {
    const value = CreateCompatibleResponseProfileInputSchema.parse(input)
    this.db.prepare(`
      INSERT INTO compatible_response_profiles (
        response_profile_id, version, schema_version,
        reasoning_mapping_id, reasoning_mapping_version,
        inline_policy_id, inline_policy_version, config_json, created_at_ms
      ) VALUES (
        @responseProfileId, @version, 1,
        @reasoningMappingId, @reasoningMappingVersion,
        @inlinePolicyId, @inlinePolicyVersion, @configJson, @createdAtMs
      )
    `).run({ ...value, configJson: JSON.stringify(value.config) })
    return this.getResponseProfile(value.responseProfileId, value.version)!
  }

  getResponseProfile(responseProfileId: unknown, version: unknown): CompatibleResponseProfile | null {
    const id = responseProfileIdSchema.parse(responseProfileId)
    const parsedVersion = compatibleProfileVersionSchema.parse(version)
    const row = this.db.prepare(`
      SELECT * FROM compatible_response_profiles WHERE response_profile_id = ? AND version = ?
    `).get(id, parsedVersion) as {
      version: number
      reasoning_mapping_id: string
      reasoning_mapping_version: number
      inline_policy_id: string
      inline_policy_version: number
      config_json: string
      created_at_ms: number
    } | undefined
    return row ? {
      responseProfileId: id,
      version: row.version,
      reasoningMappingId: reasoningMappingIdSchema.parse(row.reasoning_mapping_id),
      reasoningMappingVersion: row.reasoning_mapping_version,
      inlinePolicyId: inlinePolicyIdSchema.parse(row.inline_policy_id),
      inlinePolicyVersion: row.inline_policy_version,
      config: compatibleResponseProfileConfigSchema.parse(JSON.parse(row.config_json)),
      createdAtMs: row.created_at_ms,
    } : null
  }
}
