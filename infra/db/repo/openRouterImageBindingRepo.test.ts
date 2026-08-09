import fs from 'node:fs'
import os from 'node:os'
import path from 'node:path'
import BetterSqlite3 from 'better-sqlite3'
import { describe, expect, it } from 'vitest'
import { GenerationV2Identity } from '../../../src/next/generation-v2/domain/identityV2'
import { applyGenerationV2SchemaForTest as applyGenerationV2Schema } from '../v2/testSchemaV2'
import type { CanonicalOpenRouterImageDescriptorV2 } from '../../../src/next/generation-v2/providers/openrouter-images/canonicalDescriptorV2'
import { OpenRouterImageEndpointRepo } from './openRouterImageEndpointRepo'
import {
  isOpenRouterImageBindingRepositoryFactV2,
  OpenRouterImageBindingRepo,
} from './openRouterImageBindingRepo'

const scope = GenerationV2Identity.create('credential_scope_id', 'credential-scope-v2:test')
const otherScope = GenerationV2Identity.create('credential_scope_id', 'credential-scope-v2:other')
const model = GenerationV2Identity.create('model_id', 'google/gemini-3.1-flash-image')
const contractDigest = 'a'.repeat(64)

function response() {
  return {
    id: model.value,
    endpoints: [
      {
        provider_name: 'Google AI Studio', provider_slug: 'google-ai-studio', provider_tag: 'google-ai-studio',
        supported_parameters: { n: { type: 'range', min: 1, max: 1 } },
        allowed_passthrough_parameters: [], supports_streaming: false,
      },
      {
        provider_name: 'Google Vertex', provider_slug: 'google-vertex/global', provider_tag: 'google-vertex/global',
        supported_parameters: { n: { type: 'range', min: 1, max: 1 } },
        allowed_passthrough_parameters: [], supports_streaming: false,
      },
    ],
  }
}

function record(descriptor: CanonicalOpenRouterImageDescriptorV2,
  selectedBy: 'user' | 'sole_eligible' = 'user') {
  return {
    credentialScopeId: scope.value,
    providerId: 'openrouter',
    endpointProfileId: 'openrouter-first-party-v1',
    endpointBinding: {
      kind: 'pinned',
      selector: {
        kind: 'openrouter_images_v1',
        providerTag: descriptor.providerTag.value,
        providerSlug: descriptor.providerSlug.value,
        descriptorRevision: descriptor.descriptorRevision.value,
        descriptorDigest: descriptor.descriptorDigest.value,
        selectedBy,
        selectedAt: '2026-07-15T00:00:00.000Z',
      },
    },
    protocolContractId: 'openrouter-images-v1',
    contractRevision: `openrouter-images-v1:${contractDigest}`,
    contractDefinitionDigest: contractDigest,
    registryRevision: `provider-contract-registry-v1:${'b'.repeat(64)}`,
    modelId: model.value,
    operation: 'image_generate',
  }
}

function fixture(times: number[]) {
  const db = new BetterSqlite3(':memory:')
  applyGenerationV2Schema(db, path.resolve(process.cwd()))
  const endpointRepo = new OpenRouterImageEndpointRepo(db, () => 100)
  const descriptorSet = endpointRepo.commitSuccessfulDescriptorResponse({
    credentialScopeId: scope, requestedModelId: model, response: response(), expectedGeneration: null,
  })
  const repo = new OpenRouterImageBindingRepo(db, () => {
    const value = times.shift()
    if (value === undefined) throw new Error('missing test clock')
    return value
  })
  return { db, repo, endpointRepo, descriptorSet }
}

describe('OpenRouter Images V2 binding repository', () => {
  it('persists a structurally decoded-unverified binding against the exact current descriptor fact', () => {
    const { db, repo, descriptorSet } = fixture([1_752_537_600_000])
    try {
      const descriptor = descriptorSet.descriptorSet.descriptors[0]
      const fact = repo.compareAndSetBinding({
        record: record(descriptor), expectedBindingGeneration: null, expectedDescriptorRowGeneration: 1,
      })
      expect(fact).toMatchObject({
        trust: 'repository_decoded_unverified', bindingGeneration: 1, sourceDescriptorRowGeneration: 1,
      })
      expect(fact.sourceEndpointSetRevision.value).toBe(descriptorSet.endpointSetRevision.value)
      expect(fact.record.endpointBinding).toMatchObject({
        kind: 'pinned', selector: { providerTag: { value: descriptor.providerTag.value }, selectedBy: 'user' },
      })
      expect(isOpenRouterImageBindingRepositoryFactV2(fact)).toBe(true)
      expect(repo.getBinding({ credentialScopeId: scope, modelId: model })?.bindingGeneration).toBe(1)
    } finally { db.close() }
  })

  it('uses whole-record CAS for rebind and never infers a target from descriptor order', () => {
    const { db, repo, descriptorSet } = fixture([1_752_537_600_000, 1_752_537_600_001])
    try {
      const first = repo.compareAndSetBinding({
        record: record(descriptorSet.descriptorSet.descriptors[0]),
        expectedBindingGeneration: null, expectedDescriptorRowGeneration: 1,
      })
      const second = repo.compareAndSetBinding({
        record: record(descriptorSet.descriptorSet.descriptors[1], 'sole_eligible'),
        expectedBindingGeneration: first.bindingGeneration, expectedDescriptorRowGeneration: 1,
      })
      expect(second).toMatchObject({ bindingGeneration: 2 })
      expect(second.record.endpointBinding).toMatchObject({
        selector: { providerTag: { value: 'google-vertex/global' }, selectedBy: 'sole_eligible' },
      })
      expect(() => repo.compareAndSetBinding({
        record: record(descriptorSet.descriptorSet.descriptors[0]),
        expectedBindingGeneration: first.bindingGeneration, expectedDescriptorRowGeneration: 1,
      })).toThrow('GENERATION_V2_OPENROUTER_BINDING_CAS_CONFLICT')
    } finally { db.close() }
  })

  it('keeps the generation clock across delete/recreate and leaves a stale binding readable after descriptor invalidation', () => {
    const { db, repo, endpointRepo, descriptorSet } = fixture([1_752_537_600_000, 1_752_537_600_002])
    try {
      const first = repo.compareAndSetBinding({
        record: record(descriptorSet.descriptorSet.descriptors[0]),
        expectedBindingGeneration: null, expectedDescriptorRowGeneration: 1,
      })
      endpointRepo.invalidateCurrentDescriptorSet({ credentialScopeId: scope, modelId: model, expectedGeneration: 1 })
      expect(repo.getBinding({ credentialScopeId: scope, modelId: model })?.bindingGeneration).toBe(1)
      expect(repo.deleteBinding({
        key: { credentialScopeId: scope, modelId: model }, expectedBindingGeneration: first.bindingGeneration,
      })).toEqual({ deletedBindingGeneration: 1, nextBindingGeneration: 2 })
      expect(repo.getBinding({ credentialScopeId: scope, modelId: model })).toBeNull()
      const refreshed = endpointRepo.commitSuccessfulDescriptorResponse({
        credentialScopeId: scope, requestedModelId: model, response: response(), expectedGeneration: null,
      })
      const recreated = repo.compareAndSetBinding({
        record: record(refreshed.descriptorSet.descriptors[0]),
        expectedBindingGeneration: null, expectedDescriptorRowGeneration: refreshed.rowGeneration,
      })
      expect(recreated.bindingGeneration).toBe(3)
    } finally { db.close() }
  })

  it('rejects stale descriptor generation, mismatched target identity, options and legacy operation without writes', () => {
    const { db, repo, descriptorSet } = fixture([1_752_537_600_000])
    try {
      const descriptor = descriptorSet.descriptorSet.descriptors[0]
      for (const invalid of [
        { value: record(descriptor), descriptorGeneration: 2, error: 'DESCRIPTOR_STALE' },
        { value: { ...record(descriptor), endpointBinding: {
          kind: 'pinned', selector: { ...record(descriptor).endpointBinding.selector, providerSlug: 'wrong' },
        } }, descriptorGeneration: 1, error: 'DESCRIPTOR_STALE' },
        { value: { ...record(descriptor), providerOptions: {} }, descriptorGeneration: 1, error: 'RECORD_INVALID' },
        { value: { ...record(descriptor), operation: 'image-generation' }, descriptorGeneration: 1, error: 'RECORD_INVALID' },
      ]) expect(() => repo.compareAndSetBinding({
        record: invalid.value, expectedBindingGeneration: null,
        expectedDescriptorRowGeneration: invalid.descriptorGeneration,
      })).toThrow(invalid.error)
      expect(repo.getBinding({ credentialScopeId: scope, modelId: model })).toBeNull()
    } finally { db.close() }
  })

  it('isolates credential scope and fails closed on corrupt clock or generation exhaustion', () => {
    const { db, repo, descriptorSet } = fixture([1_752_537_600_000])
    try {
      const fact = repo.compareAndSetBinding({
        record: record(descriptorSet.descriptorSet.descriptors[0]),
        expectedBindingGeneration: null, expectedDescriptorRowGeneration: 1,
      })
      expect(repo.getBinding({ credentialScopeId: otherScope, modelId: model })).toBeNull()
      db.prepare(`
        UPDATE openrouter_image_endpoint_binding_generation_clock SET last_generation = 2
        WHERE credential_scope_id = ? AND model_id = ? AND operation = 'image_generate'
      `).run(scope.value, model.value)
      const before = db.serialize()
      expect(() => repo.getBinding({ credentialScopeId: scope, modelId: model }))
        .toThrow('GENERATION_V2_OPENROUTER_BINDING_STATE_INVALID')
      expect(() => repo.deleteBinding({
        key: { credentialScopeId: scope, modelId: model }, expectedBindingGeneration: fact.bindingGeneration,
      })).toThrow('GENERATION_V2_OPENROUTER_BINDING_STATE_INVALID')
      expect(db.serialize()).toEqual(before)

      db.prepare(`
        UPDATE openrouter_image_endpoint_binding_generation_clock SET last_generation = ?
        WHERE credential_scope_id = ? AND model_id = ? AND operation = 'image_generate'
      `).run(Number.MAX_SAFE_INTEGER, scope.value, model.value)
      db.prepare(`UPDATE openrouter_image_endpoint_bindings SET binding_generation = ?`)
        .run(Number.MAX_SAFE_INTEGER)
      const exhausted = db.serialize()
      expect(() => repo.deleteBinding({
        key: { credentialScopeId: scope, modelId: model }, expectedBindingGeneration: Number.MAX_SAFE_INTEGER,
      })).toThrow('GENERATION_V2_OPENROUTER_BINDING_GENERATION_EXHAUSTED')
      expect(db.serialize()).toEqual(exhausted)
    } finally { db.close() }
  })

  it('does not issue a repository fact when the binding clock is missing, behind, ahead or unsafe', () => {
    const { db, repo, descriptorSet } = fixture([1_752_537_600_000, 1_752_537_600_001])
    try {
      const first = repo.compareAndSetBinding({
        record: record(descriptorSet.descriptorSet.descriptors[0]),
        expectedBindingGeneration: null, expectedDescriptorRowGeneration: 1,
      })
      repo.compareAndSetBinding({
        record: record(descriptorSet.descriptorSet.descriptors[1]),
        expectedBindingGeneration: first.bindingGeneration, expectedDescriptorRowGeneration: 1,
      })
      const mutations = [
        () => db.prepare('DELETE FROM openrouter_image_endpoint_binding_generation_clock').run(),
        () => db.prepare(`UPDATE openrouter_image_endpoint_binding_generation_clock SET last_generation = 1`).run(),
        () => db.prepare(`UPDATE openrouter_image_endpoint_binding_generation_clock SET last_generation = 3`).run(),
        () => {
          db.pragma('ignore_check_constraints = ON')
          db.prepare(`UPDATE openrouter_image_endpoint_binding_generation_clock SET last_generation = 0`).run()
          db.pragma('ignore_check_constraints = OFF')
        },
      ]
      for (const mutate of mutations) {
        db.prepare(`
          INSERT INTO openrouter_image_endpoint_binding_generation_clock (
            credential_scope_id, model_id, operation, last_generation
          ) VALUES (?, ?, 'image_generate', 2)
          ON CONFLICT(credential_scope_id, model_id, operation) DO UPDATE SET last_generation = 2
        `).run(scope.value, model.value)
        mutate()
        expect(() => repo.getBinding({ credentialScopeId: scope, modelId: model }))
          .toThrow('GENERATION_V2_OPENROUTER_BINDING_STATE_INVALID')
      }
    } finally { db.close() }
  })

  it('rolls back clock changes when binding insert, update or delete aborts', () => {
    const { db, repo, descriptorSet } = fixture([
      1_752_537_600_000, 1_752_537_600_001, 1_752_537_600_002, 1_752_537_600_003,
    ])
    const firstDescriptor = descriptorSet.descriptorSet.descriptors[0]
    const secondDescriptor = descriptorSet.descriptorSet.descriptors[1]
    try {
      db.exec(`
        CREATE TRIGGER abort_binding_insert BEFORE INSERT ON openrouter_image_endpoint_bindings
        BEGIN SELECT RAISE(ABORT, 'blocked insert'); END;
      `)
      expect(() => repo.compareAndSetBinding({
        record: record(firstDescriptor), expectedBindingGeneration: null, expectedDescriptorRowGeneration: 1,
      })).toThrow('blocked insert')
      expect(db.prepare('SELECT COUNT(*) AS count FROM openrouter_image_endpoint_binding_generation_clock').get())
        .toEqual({ count: 0 })
      db.exec('DROP TRIGGER abort_binding_insert')

      const first = repo.compareAndSetBinding({
        record: record(firstDescriptor), expectedBindingGeneration: null, expectedDescriptorRowGeneration: 1,
      })
      db.exec(`
        CREATE TRIGGER abort_binding_update BEFORE UPDATE ON openrouter_image_endpoint_bindings
        BEGIN SELECT RAISE(ABORT, 'blocked update'); END;
      `)
      expect(() => repo.compareAndSetBinding({
        record: record(secondDescriptor), expectedBindingGeneration: first.bindingGeneration,
        expectedDescriptorRowGeneration: 1,
      })).toThrow('blocked update')
      expect(repo.getBinding({ credentialScopeId: scope, modelId: model })?.bindingGeneration).toBe(1)
      db.exec('DROP TRIGGER abort_binding_update')

      db.exec(`
        CREATE TRIGGER abort_binding_delete BEFORE DELETE ON openrouter_image_endpoint_bindings
        BEGIN SELECT RAISE(ABORT, 'blocked delete'); END;
      `)
      expect(() => repo.deleteBinding({
        key: { credentialScopeId: scope, modelId: model }, expectedBindingGeneration: 1,
      })).toThrow('blocked delete')
      expect(repo.getBinding({ credentialScopeId: scope, modelId: model })?.bindingGeneration).toBe(1)
    } finally { db.close() }
  })

  it('rolls back the binding and clock when the exact persisted-record postcondition is violated', () => {
    const { db, repo, descriptorSet } = fixture([1_752_537_600_000])
    try {
      db.exec(`
        CREATE TRIGGER tamper_binding_after_insert AFTER INSERT ON openrouter_image_endpoint_bindings
        BEGIN
          UPDATE openrouter_image_endpoint_bindings
          SET endpoint_profile_id = 'tampered-profile'
          WHERE credential_scope_id = NEW.credential_scope_id
            AND model_id = NEW.model_id
            AND operation = NEW.operation;
        END;
      `)
      expect(() => repo.compareAndSetBinding({
        record: record(descriptorSet.descriptorSet.descriptors[0]),
        expectedBindingGeneration: null,
        expectedDescriptorRowGeneration: 1,
      })).toThrow('GENERATION_V2_OPENROUTER_BINDING_STATE_INVALID')
      expect(db.prepare('SELECT COUNT(*) AS count FROM openrouter_image_endpoint_bindings').get())
        .toEqual({ count: 0 })
      expect(db.prepare('SELECT COUNT(*) AS count FROM openrouter_image_endpoint_binding_generation_clock').get())
        .toEqual({ count: 0 })
    } finally { db.close() }
  })

  it('normalizes cross-connection lock contention and allows only one initial writer', () => {
    const directory = fs.mkdtempSync(path.join(os.tmpdir(), 'starverse-or-binding-'))
    const databasePath = path.join(directory, 'starverse.db')
    const firstDb = new BetterSqlite3(databasePath)
    const secondDb = new BetterSqlite3(databasePath)
    try {
      firstDb.pragma('journal_mode = WAL')
      applyGenerationV2Schema(firstDb, path.resolve(process.cwd()))
      secondDb.pragma('busy_timeout = 1')
      const endpointRepo = new OpenRouterImageEndpointRepo(firstDb, () => 100)
      const descriptorSet = endpointRepo.commitSuccessfulDescriptorResponse({
        credentialScopeId: scope, requestedModelId: model, response: response(), expectedGeneration: null,
      })
      const first = new OpenRouterImageBindingRepo(firstDb, () => 1_752_537_600_000)
      const second = new OpenRouterImageBindingRepo(secondDb, () => 1_752_537_600_000)
      const bindingRecord = record(descriptorSet.descriptorSet.descriptors[0])
      first.compareAndSetBinding({ record: bindingRecord, expectedBindingGeneration: null, expectedDescriptorRowGeneration: 1 })
      expect(() => second.compareAndSetBinding({
        record: bindingRecord, expectedBindingGeneration: null, expectedDescriptorRowGeneration: 1,
      })).toThrow('GENERATION_V2_OPENROUTER_BINDING_CAS_CONFLICT')
      firstDb.exec('BEGIN IMMEDIATE')
      try {
        expect(() => second.deleteBinding({
          key: { credentialScopeId: scope, modelId: model }, expectedBindingGeneration: 1,
        })).toThrow('GENERATION_V2_OPENROUTER_BINDING_CAS_CONFLICT')
      } finally { firstDb.exec('ROLLBACK') }
    } finally {
      secondDb.close()
      firstDb.close()
      fs.rmSync(directory, { recursive: true, force: true })
    }
  })
})
