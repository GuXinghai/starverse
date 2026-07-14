import { readFileSync } from 'node:fs'
import fs from 'node:fs'
import os from 'node:os'
import path from 'node:path'
import BetterSqlite3 from 'better-sqlite3'
import { describe, expect, it } from 'vitest'
import { GenerationV2Identity } from '../../../src/next/generation-v2/domain/identityV2'
import { OpenRouterImageEndpointRepo } from './openRouterImageEndpointRepo'

const scope = GenerationV2Identity.create('credential_scope_id', 'credential-scope-v2:test')
const model = GenerationV2Identity.create('model_id', 'google/gemini-3.1-flash-image')

function response(tag = 'google-ai-studio', modelId = model.value) {
  return {
    id: modelId,
    endpoints: [{
      provider_name: 'Google AI Studio', provider_slug: tag, provider_tag: tag,
      supported_parameters: { n: { type: 'range', min: 1, max: 1 } },
      allowed_passthrough_parameters: ['cache'], supports_streaming: false,
    }],
  }
}

function fixture(times: number[]) {
  const db = new BetterSqlite3(':memory:')
  db.exec(readFileSync(path.resolve('infra/db/v2/openRouterImagesSchema.sql'), 'utf8'))
  const repo = new OpenRouterImageEndpointRepo(db, () => {
    const value = times.shift()
    if (value === undefined) throw new Error('missing test clock value')
    return value
  })
  return { db, repo }
}

describe('OpenRouterImageEndpointRepo V2 successful descriptor facts', () => {
  it('derives revision/time/generation and re-decodes the complete official envelope on read', () => {
    const { db, repo } = fixture([100])
    try {
      const fact = repo.commitSuccessfulDescriptorResponse({
        credentialScopeId: scope, requestedModelId: model, response: response(), expectedGeneration: null,
      })
      expect(fact.trust).toBe('repository_decoded_unverified')
      expect(fact.rowGeneration).toBe(1)
      expect(fact.fetchedAtMs).toBe(100)
      expect(fact.endpointSetRevision.value).toMatch(/^openrouter-images-set-v1:[0-9a-f]{64}$/u)
      expect(repo.getCurrentDescriptorSet(scope, model)?.descriptorSet.descriptors[0].descriptorDigest.value)
        .toMatch(/^[0-9a-f]{64}$/u)
    } finally { db.close() }
  })

  it('rejects model mismatch, duplicate tags and stale CAS without overwriting last success', () => {
    const { db, repo } = fixture([100, 200])
    try {
      const first = repo.commitSuccessfulDescriptorResponse({
        credentialScopeId: scope, requestedModelId: model, response: response(), expectedGeneration: null,
      })
      expect(() => repo.commitSuccessfulDescriptorResponse({
        credentialScopeId: scope, requestedModelId: model, response: response('other', 'wrong-model'), expectedGeneration: 1,
      })).toThrow('GENERATION_V2_OPENROUTER_CACHE_MODEL_MISMATCH')
      expect(() => repo.commitSuccessfulDescriptorResponse({
        credentialScopeId: scope, requestedModelId: model,
        response: { id: model.value, endpoints: [response().endpoints[0], response().endpoints[0]] }, expectedGeneration: 1,
      })).toThrow('GENERATION_V2_OPENROUTER_DESCRIPTOR_DUPLICATE_TAG')
      expect(() => repo.commitSuccessfulDescriptorResponse({
        credentialScopeId: scope, requestedModelId: model, response: response('google-vertex/global'), expectedGeneration: null,
      })).toThrow('GENERATION_V2_OPENROUTER_CACHE_CAS_CONFLICT')
      expect(repo.getCurrentDescriptorSet(scope, model)?.endpointSetRevision.value).toBe(first.endpointSetRevision.value)
    } finally { db.close() }
  })

  it('uses row generation rather than content revision and rejects clock regression', () => {
    const { db, repo } = fixture([200, 100, 300])
    try {
      const first = repo.commitSuccessfulDescriptorResponse({
        credentialScopeId: scope, requestedModelId: model, response: response(), expectedGeneration: null,
      })
      expect(() => repo.commitSuccessfulDescriptorResponse({
        credentialScopeId: scope, requestedModelId: model, response: response(), expectedGeneration: 1,
      })).toThrow('GENERATION_V2_OPENROUTER_CACHE_CLOCK_REGRESSION')
      const second = repo.commitSuccessfulDescriptorResponse({
        credentialScopeId: scope, requestedModelId: model, response: response(), expectedGeneration: 1,
      })
      expect(second.rowGeneration).toBe(2)
      expect(second.endpointSetRevision.value).toBe(first.endpointSetRevision.value)
      expect(second.fetchedAtMs).toBe(300)
      const history = db.prepare('SELECT row_generation FROM openrouter_image_endpoint_descriptor_history ORDER BY row_generation').all()
      expect(history).toEqual([{ row_generation: 1 }, { row_generation: 2 }])
    } finally { db.close() }
  })

  it('rejects tampered persisted revision and non-canonical JSON on read', () => {
    const { db, repo } = fixture([100])
    try {
      repo.commitSuccessfulDescriptorResponse({
        credentialScopeId: scope, requestedModelId: model, response: response(), expectedGeneration: null,
      })
      db.prepare('UPDATE openrouter_image_endpoint_descriptor_sets SET endpoint_set_revision = ?').run('forged')
      expect(() => repo.getCurrentDescriptorSet(scope, model)).toThrow('GENERATION_V2_OPENROUTER_CACHE_RECORD_CONTENT_MISMATCH')
      db.prepare('UPDATE openrouter_image_endpoint_descriptor_sets SET endpoint_set_revision = ?, descriptor_response_json = ?')
        .run('forged', JSON.stringify(response(), null, 2))
      expect(() => repo.getCurrentDescriptorSet(scope, model)).toThrow('GENERATION_V2_OPENROUTER_CACHE_RECORD_CONTENT_MISMATCH')
    } finally { db.close() }
  })

  it('uses SQL generation CAS across database connections and normalizes lock contention', () => {
    const directory = fs.mkdtempSync(path.join(os.tmpdir(), 'starverse-or-images-cas-'))
    const databasePath = path.join(directory, 'starverse.db')
    const firstDb = new BetterSqlite3(databasePath)
    const secondDb = new BetterSqlite3(databasePath)
    try {
      firstDb.pragma('journal_mode = WAL')
      firstDb.exec(readFileSync(path.resolve('infra/db/v2/openRouterImagesSchema.sql'), 'utf8'))
      secondDb.pragma('busy_timeout = 1')
      const firstRepo = new OpenRouterImageEndpointRepo(firstDb, () => 100)
      const secondRepo = new OpenRouterImageEndpointRepo(secondDb, () => 200)
      firstRepo.commitSuccessfulDescriptorResponse({
        credentialScopeId: scope, requestedModelId: model, response: response(), expectedGeneration: null,
      })
      expect(() => secondRepo.commitSuccessfulDescriptorResponse({
        credentialScopeId: scope, requestedModelId: model, response: response('google-vertex/global'), expectedGeneration: null,
      })).toThrow('GENERATION_V2_OPENROUTER_CACHE_CAS_CONFLICT')
      firstDb.exec('BEGIN IMMEDIATE')
      try {
        expect(() => secondRepo.commitSuccessfulDescriptorResponse({
          credentialScopeId: scope, requestedModelId: model, response: response(), expectedGeneration: 1,
        })).toThrow('GENERATION_V2_OPENROUTER_CACHE_CAS_CONFLICT')
      } finally {
        firstDb.exec('ROLLBACK')
      }
      expect(secondDb.prepare('SELECT COUNT(*) AS count FROM openrouter_image_endpoint_descriptor_history').get())
        .toEqual({ count: 1 })
    } finally {
      secondDb.close()
      firstDb.close()
      fs.rmSync(directory, { recursive: true, force: true })
    }
  })

  it('bounds endpoint cardinality and excludes non-capability pricing from the success cache', () => {
    const { db, repo } = fixture([100])
    try {
      const priced = response() as ReturnType<typeof response> & { endpoints: Array<Record<string, unknown>> }
      priced.endpoints[0].pricing = { diagnostic: 'x'.repeat(2_000_000) }
      repo.commitSuccessfulDescriptorResponse({
        credentialScopeId: scope, requestedModelId: model, response: priced, expectedGeneration: null,
      })
      const stored = db.prepare('SELECT descriptor_response_json FROM openrouter_image_endpoint_descriptor_sets').get() as { descriptor_response_json: string }
      expect(stored.descriptor_response_json).not.toContain('pricing')
      const endpoints = Array.from({ length: 65 }, (_, index) => response(`provider-${index}`).endpoints[0])
      expect(() => repo.commitSuccessfulDescriptorResponse({
        credentialScopeId: scope, requestedModelId: model,
        response: { id: model.value, endpoints }, expectedGeneration: 1,
      })).toThrow('GENERATION_V2_OPENROUTER_DESCRIPTOR_INVALID_VALUE')
    } finally { db.close() }
  })

  it('rejects capability projections and direct database rows above the one MiB cache limit', () => {
    const { db, repo } = fixture([100])
    try {
      const supportedParameters = Object.fromEntries(Array.from({ length: 64 }, (_, index) => [
        `${String(index).padStart(3, '0')}-${'x'.repeat(508)}`,
        { type: 'boolean' },
      ]))
      const endpoints = Array.from({ length: 32 }, (_, index) => ({
        ...response(`provider-${index}`).endpoints[0],
        supported_parameters: supportedParameters,
      }))
      expect(() => repo.commitSuccessfulDescriptorResponse({
        credentialScopeId: scope, requestedModelId: model,
        response: { id: model.value, endpoints }, expectedGeneration: null,
      })).toThrow('GENERATION_V2_OPENROUTER_CACHE_RESPONSE_TOO_LARGE')

      const oversizedJson = JSON.stringify({ id: model.value, padding: 'x'.repeat(1_048_576) })
      expect(() => db.prepare(`
        INSERT INTO openrouter_image_endpoint_descriptor_sets (
          credential_scope_id, model_id, operation, row_generation,
          endpoint_set_revision, fetched_at_ms, descriptor_response_json
        ) VALUES (?, ?, 'image_generate', 1, 'revision', 1, ?)
      `).run(scope.value, model.value, oversizedJson)).toThrow()
    } finally { db.close() }
  })
})
