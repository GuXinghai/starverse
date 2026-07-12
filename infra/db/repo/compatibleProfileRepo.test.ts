import BetterSqlite3 from 'better-sqlite3'
import { readFileSync } from 'node:fs'
import path from 'node:path'
import { afterEach, beforeEach, describe, expect, it } from 'vitest'
import { compatibleObjectPathSchema } from '../../../src/shared/provider/openai-chat-compatible'
import { CompatibleProfileRepo } from './compatibleProfileRepo'

describe('CompatibleProfileRepo', () => {
  let db: BetterSqlite3.Database
  let repo: CompatibleProfileRepo

  beforeEach(() => {
    db = new BetterSqlite3(':memory:')
    db.exec(readFileSync(path.resolve(process.cwd(), 'infra', 'db', 'schema.sql'), 'utf8'))
    repo = new CompatibleProfileRepo(db)
  })

  afterEach(() => db.close())

  const requestConfig = {
    schemaVersion: 1 as const,
    standardFieldOwnership: 'builder' as const,
    unsupportedFieldPolicy: 'error_before_fetch' as const,
    defaults: {},
    extraBody: { enabled: true, maxDepth: 8, maxKeys: 128, maxBytes: 32768 },
  }

  const reasoningConfig = {
    schemaVersion: 1 as const,
    mode: 'custom_preferred_with_builtin_fallback' as const,
    rules: [{ stream: { path: 'choices.*.delta.reasoning_content', mode: 'append' as const }, final: { path: 'choices.*.message.reasoning_content', mode: 'snapshot' as const }, semantic: 'text' as const }],
    replay: { format: 'disabled' as const, scope: 'never' as const },
  }

  const inlineConfig = {
    schemaVersion: 1 as const,
    canonicalThinkTags: true as const,
    customTags: [{ openTag: '<analysis>', closeTag: '</analysis>' }],
  }

  function createBaseProfiles() {
    repo.createRequestProfile({
      requestProfileId: 'ocp_request_profile_12345678',
      version: 1,
      config: requestConfig,
      createdAtMs: 1,
    })
    repo.createReasoningMapping({
      mappingId: 'ocp_reasoning_mapping_12345678',
      version: 1,
      config: reasoningConfig,
      createdAtMs: 1,
    })
    repo.createInlinePolicy({
      inlinePolicyId: 'ocp_inline_policy_12345678',
      version: 1,
      config: inlineConfig,
      createdAtMs: 1,
    })
  }

  it('round-trips immutable request, reasoning, inline and response profile versions', () => {
    createBaseProfiles()
    const response = repo.createResponseProfile({
      responseProfileId: 'ocp_response_profile_12345678',
      version: 1,
      reasoningMappingId: 'ocp_reasoning_mapping_12345678',
      reasoningMappingVersion: 1,
      inlinePolicyId: 'ocp_inline_policy_12345678',
      inlinePolicyVersion: 1,
      config: {
        schemaVersion: 1,
        choicePolicy: 'preserve_all',
        unknownFieldPolicy: 'bounded_diagnostics',
        reasoningMapping: { mappingId: 'ocp_reasoning_mapping_12345678', version: 1 },
        inlinePolicy: { inlinePolicyId: 'ocp_inline_policy_12345678', version: 1 },
      },
      createdAtMs: 2,
    })

    expect(repo.getRequestProfile('ocp_request_profile_12345678', 1)?.config).toEqual(requestConfig)
    expect(repo.getReasoningMapping('ocp_reasoning_mapping_12345678', 1)).toMatchObject({
      mode: 'custom_preferred_with_builtin_fallback',
    })
    expect(repo.getInlinePolicy('ocp_inline_policy_12345678', 1)?.config).toEqual(inlineConfig)
    expect(response).toMatchObject({
      reasoningMappingId: 'ocp_reasoning_mapping_12345678',
      inlinePolicyId: 'ocp_inline_policy_12345678',
    })
    expect(() => db.prepare(`
      UPDATE compatible_response_profiles SET config_json = '{}'
      WHERE response_profile_id = 'ocp_response_profile_12345678'
    `).run()).toThrow(/immutable/i)
  })

  it('creates versioned request mappings with a unique target path per profile version', () => {
    createBaseProfiles()
    const mapping = repo.createRequestFieldMapping({
      mappingId: 'ocp_request_mapping_12345678',
      version: 1,
      requestProfileId: 'ocp_request_profile_12345678',
      requestProfileVersion: 1,
      targetPath: ['reasoning', 'effort'],
      config: {
        schemaVersion: 1,
        mappingId: 'ocp_request_mapping_12345678',
        requestProfileId: 'ocp_request_profile_12345678',
        requestProfileVersion: 1,
        sourceField: 'reasoning_effort',
        targetPath: ['reasoning', 'effort'],
        valueKind: 'string',
        valueMapping: { low: 'low', medium: 'medium', high: 'high' },
        omission: 'omit_when_unset',
      },
      createdAtMs: 2,
    })
    expect(mapping.targetPath).toEqual(['reasoning', 'effort'])
    expect(() => repo.createRequestFieldMapping({
      ...mapping,
      mappingId: 'ocp_request_mapping_abcdefgh',
      targetPath: [...mapping.targetPath],
      config: {
        ...mapping.config,
        mappingId: 'ocp_request_mapping_abcdefgh',
        targetPath: compatibleObjectPathSchema.parse(mapping.config.targetPath),
      },
      createdAtMs: 3,
    })).toThrow(/unique/i)
  })

  it('rejects mismatched embedded profile references before SQLite', () => {
    createBaseProfiles()
    expect(() => repo.createResponseProfile({
      responseProfileId: 'ocp_response_profile_12345678',
      version: 1,
      reasoningMappingId: 'ocp_reasoning_mapping_12345678',
      reasoningMappingVersion: 1,
      inlinePolicyId: 'ocp_inline_policy_12345678',
      inlinePolicyVersion: 1,
      config: {
        schemaVersion: 1,
        choicePolicy: 'preserve_all',
        unknownFieldPolicy: 'bounded_diagnostics',
        reasoningMapping: { mappingId: 'ocp_reasoning_mapping_abcdefgh', version: 1 },
        inlinePolicy: { inlinePolicyId: 'ocp_inline_policy_12345678', version: 1 },
      },
      createdAtMs: 2,
    })).toThrow(/must match/i)
  })

  it('allows a new immutable version but rejects in-place mutation and duplicate version inserts', () => {
    repo.createRequestProfile({
      requestProfileId: 'ocp_request_profile_12345678',
      version: 1,
      config: requestConfig,
      createdAtMs: 1,
    })
    expect(() => repo.createRequestProfile({
      requestProfileId: 'ocp_request_profile_12345678',
      version: 1,
      config: requestConfig,
      createdAtMs: 2,
    })).toThrow(/unique/i)
    expect(repo.createRequestProfile({
      requestProfileId: 'ocp_request_profile_12345678',
      version: 2,
      config: { ...requestConfig, extraBody: { ...requestConfig.extraBody, enabled: false } },
      createdAtMs: 2,
    }).version).toBe(2)
    expect(() => db.prepare(`
      UPDATE compatible_request_profiles SET config_json = '{}'
      WHERE request_profile_id = 'ocp_request_profile_12345678' AND version = 1
    `).run()).toThrow(/immutable/i)
  })
})
