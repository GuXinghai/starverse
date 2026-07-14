import { readFileSync } from 'node:fs'
import path from 'node:path'
import BetterSqlite3 from 'better-sqlite3'
import { describe, expect, it } from 'vitest'
import { decodeOpenRouterImageEndpointResponse } from '../../../src/next/openrouter/images/endpointContract'
import { OpenRouterImageEndpointRepo } from './openRouterImageEndpointRepo'

function descriptors() {
  return decodeOpenRouterImageEndpointResponse({ data: [{
    provider_name: 'Provider A', provider_slug: 'provider-a', provider_tag: 'provider-a',
    supported_parameters: { n: { type: 'range', min: 1, max: 1 } },
    allowed_passthrough_parameters: ['cache'], supports_streaming: false,
  }] })
}

describe('OpenRouterImageEndpointRepo', () => {
  it('atomically auto-binds the sole eligible endpoint and reuses it', () => {
    const db = new BetterSqlite3(':memory:')
    db.exec(readFileSync(path.resolve('infra/db/v2/openRouterImagesSchema.sql'), 'utf8'))
    const repo = new OpenRouterImageEndpointRepo(db)
    repo.replaceCompleteDescriptorSet({
      credentialScope: 'scope', modelId: 'model', revision: 'r1',
      fetchedAtMs: 1, hardExpiresAtMs: 100, descriptors: descriptors(),
    }, null)
    const first = repo.resolveOrAutoBind({
      credentialScope: 'scope', modelId: 'model', expectedDescriptorRevision: 'r1',
      intent: { parameters: { n: 1 }, stream: false }, nowMs: 2,
    })
    const second = repo.resolveOrAutoBind({
      credentialScope: 'scope', modelId: 'model', expectedDescriptorRevision: 'r1',
      intent: { parameters: { n: 1 }, stream: false }, nowMs: 3,
    })
    expect(first.binding.selectedBy).toBe('sole_eligible')
    expect(second.shouldPersist).toBe(false)
    expect(repo.getBinding('scope', 'model')?.providerTag).toBe('provider-a')
    db.close()
  })

  it('rejects stale descriptor revisions before auto-binding or user binding', () => {
    const db = new BetterSqlite3(':memory:')
    db.exec(readFileSync(path.resolve('infra/db/v2/openRouterImagesSchema.sql'), 'utf8'))
    const repo = new OpenRouterImageEndpointRepo(db)
    repo.replaceCompleteDescriptorSet({
      credentialScope: 'scope', modelId: 'model', revision: 'r1',
      fetchedAtMs: 1, hardExpiresAtMs: 100, descriptors: descriptors(),
    }, null)
    expect(() => repo.resolveOrAutoBind({
      credentialScope: 'scope', modelId: 'model', expectedDescriptorRevision: 'stale',
      intent: { parameters: { n: 1 }, stream: false }, nowMs: 2,
    })).toThrow('STALE_CAPABILITY_REVISION')
    expect(() => repo.bindUserSelection({
      credentialScope: 'scope', modelId: 'model', expectedDescriptorRevision: 'stale',
      providerTag: 'provider-a', intent: { parameters: { n: 1 }, stream: false }, nowMs: 2,
    })).toThrow('STALE_CAPABILITY_REVISION')
    expect(repo.getBinding('scope', 'model')).toBeNull()
    db.close()
  })

  it('does not overwrite the last complete set when duplicate tags are rejected', () => {
    const db = new BetterSqlite3(':memory:')
    db.exec(readFileSync(path.resolve('infra/db/v2/openRouterImagesSchema.sql'), 'utf8'))
    const repo = new OpenRouterImageEndpointRepo(db)
    const valid = { credentialScope: 'scope', modelId: 'model', revision: 'r1', fetchedAtMs: 1, hardExpiresAtMs: 100, descriptors: descriptors() }
    repo.replaceCompleteDescriptorSet(valid, null)
    expect(() => repo.replaceCompleteDescriptorSet({ ...valid, revision: 'r2', descriptors: [...descriptors(), ...descriptors()] }, 'r1'))
      .toThrow('duplicate provider_tag')
    expect(repo.getDescriptorSet('scope', 'model')?.revision).toBe('r1')
    db.close()
  })

  it('rejects a stale refresh and makes 404 invalidation compare-and-delete', () => {
    const db = new BetterSqlite3(':memory:')
    db.exec(readFileSync(path.resolve('infra/db/v2/openRouterImagesSchema.sql'), 'utf8'))
    const repo = new OpenRouterImageEndpointRepo(db)
    const base = { credentialScope: 'scope', modelId: 'model', fetchedAtMs: 1, hardExpiresAtMs: 100, descriptors: descriptors() }
    repo.replaceCompleteDescriptorSet({ ...base, revision: 'r1' }, null)
    repo.replaceCompleteDescriptorSet({ ...base, revision: 'r2', fetchedAtMs: 2 }, 'r1')
    expect(() => repo.replaceCompleteDescriptorSet({ ...base, revision: 'stale', fetchedAtMs: 3 }, 'r1'))
      .toThrow('OPENROUTER_IMAGE_DESCRIPTOR_REFRESH_STALE')
    expect(repo.invalidateDescriptorSet('scope', 'model', 'r1')).toBe(false)
    expect(repo.getDescriptorSet('scope', 'model')?.revision).toBe('r2')
    expect(repo.invalidateDescriptorSet('scope', 'model', 'r2')).toBe(true)
    db.close()
  })
})
