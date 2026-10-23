import { describe, expect, it } from 'vitest'
import { CatalogRuntimeStoreV2 } from './catalogRuntimeStoreV2'
import { createProviderFailureV2 } from '../../shared/provider/providerFailureV2'

const policy = Object.freeze({
  startupSyncPolicy: 'stale_only' as const,
  pickerOpenSyncPolicy: 'stale_only' as const,
  listApplyMode: 'automatic' as const,
  freshnessMs: 1_234,
  retentionMs: 5_678,
})

function failure() {
  return createProviderFailureV2({
    context: { origin: 'ipc_bridge', phase: 'response_body', provider: { namespace: 'catalog_source', id: 'deepseek' },
      contractId: 'deepseek-models-v1', operationId: 'catalog:test', requestSequence: 1 },
    transportError: new Error('bridge failed'),
  })
}

describe('CatalogRuntimeStoreV2', () => {
  it('keeps policy, Last-Known-Good and pending state under one scope authority', () => {
    const store = new CatalogRuntimeStoreV2<{ id: string }>()
    store.setPolicy({ routeKey: 'deepseek', effectivePolicy: policy, policySource: 'global' })
    const token = store.beginQuery('deepseek')
    expect(store.acceptAuthority({ token,
      authorityScopeId: 'scope:1', displayedSnapshotDigest: 'a'.repeat(64),
      pendingSnapshotDigest: 'b'.repeat(64), items: [{ id: 'known-good' }], stale: false })).toBe(true)

    const failedToken = store.beginMutation('deepseek')
    expect(store.acceptFailure({ token: failedToken, failure: failure() })).toBe(true)
    expect(store.read('deepseek')).toMatchObject({
      effectivePolicy: policy,
      policySource: 'global',
      displayedSnapshotDigest: 'a'.repeat(64),
      pendingSnapshotDigest: 'b'.repeat(64),
      items: [{ id: 'known-good' }],
      syncState: 'failed',
      stale: true,
    })
  })

  it('rejects stale async publications without changing the newer scope state', () => {
    const store = new CatalogRuntimeStoreV2<{ id: string }>()
    const stale = store.beginQuery('openrouter::text')
    const current = store.beginQuery('openrouter::text')
    expect(store.acceptAuthority({ token: current,
      authorityScopeId: 'scope:new', displayedSnapshotDigest: 'c'.repeat(64),
      pendingSnapshotDigest: null, items: [{ id: 'new' }], stale: false })).toBe(true)
    expect(store.acceptAuthority({ token: stale,
      authorityScopeId: 'scope:old', displayedSnapshotDigest: 'd'.repeat(64),
      pendingSnapshotDigest: null, items: [{ id: 'old' }], stale: false })).toBe(false)
    expect(store.read('openrouter::text').items).toEqual([{ id: 'new' }])
  })

  // R4-08 (P6a-07): a query that lands first moves the authority revision. That used to discard the result of a
  // mutation started before it, which left the route stuck in 'syncing'.
  it('a mutation result survives a query that landed first, and still discards an older query', () => {
    const store = new CatalogRuntimeStoreV2<{ id: string }>()
    const base = store.beginQuery('deepseek')
    store.acceptAuthority({ token: base, authorityScopeId: 'scope:1', displayedSnapshotDigest: 'a'.repeat(64),
      pendingSnapshotDigest: 'b'.repeat(64), items: [{ id: 'one' }], stale: false })

    const mutation = store.beginMutation('deepseek')
    const query = store.beginQuery('deepseek')
    expect(store.acceptAuthority({ token: query, authorityScopeId: 'scope:1', displayedSnapshotDigest: 'a'.repeat(64),
      pendingSnapshotDigest: 'b'.repeat(64), items: [{ id: 'one' }], stale: false })).toBe(true)
    expect(store.acceptAuthority({ token: mutation, authorityScopeId: 'scope:1', displayedSnapshotDigest: 'b'.repeat(64),
      pendingSnapshotDigest: null, items: [{ id: 'one' }], stale: false })).toBe(true)
    expect(store.read('deepseek')).toMatchObject({ syncState: 'idle', pendingSnapshotDigest: null })

    const olderQuery = store.beginQuery('deepseek')
    const laterMutation = store.beginMutation('deepseek')
    store.acceptAuthority({ token: laterMutation, authorityScopeId: 'scope:1', displayedSnapshotDigest: 'c'.repeat(64),
      pendingSnapshotDigest: null, items: [{ id: 'two' }], stale: false })
    expect(store.acceptAuthority({ token: olderQuery, authorityScopeId: 'scope:1', displayedSnapshotDigest: 'a'.repeat(64),
      pendingSnapshotDigest: null, items: [{ id: 'stale' }], stale: false })).toBe(false)
    expect(store.read('deepseek').items).toEqual([{ id: 'two' }])
  })

  it('does not reuse a request generation after credential-scope invalidation', () => {
    const store = new CatalogRuntimeStoreV2<{ id: string }>()
    const oldCredentialRequest = store.beginMutation('openrouter::text')
    store.clear('openrouter::text')
    const newCredentialRequest = store.beginQuery('openrouter::text')

    expect(newCredentialRequest.authorityRevision).toBeGreaterThan(oldCredentialRequest.authorityRevision)
    expect(store.acceptAuthority({ token: newCredentialRequest,
      authorityScopeId: 'scope:new', displayedSnapshotDigest: 'e'.repeat(64), pendingSnapshotDigest: null,
      items: [{ id: 'new-scope' }], stale: false })).toBe(true)
    expect(store.acceptAuthority({ token: oldCredentialRequest,
      authorityScopeId: 'scope:old', displayedSnapshotDigest: 'f'.repeat(64), pendingSnapshotDigest: null,
      items: [{ id: 'old-scope' }], stale: false })).toBe(false)
    expect(store.read('openrouter::text')).toMatchObject({ authorityScopeId: 'scope:new', items: [{ id: 'new-scope' }] })
  })

  it('keeps query and mutation request tokens independent and rejects results from an older authority revision', () => {
    const store = new CatalogRuntimeStoreV2<{ id: string }>()
    const query = store.beginQuery('deepseek')
    const mutation = store.beginMutation('deepseek')

    expect(store.isCurrent(query)).toBe(true)
    expect(store.isCurrent(mutation)).toBe(true)
    expect(store.acceptAuthority({ token: mutation, authorityScopeId: 'scope:2',
      displayedSnapshotDigest: '1'.repeat(64), pendingSnapshotDigest: null,
      items: [{ id: 'mutated' }], stale: false })).toBe(true)
    expect(store.acceptAuthority({ token: query, authorityScopeId: 'scope:1',
      displayedSnapshotDigest: '2'.repeat(64), pendingSnapshotDigest: null,
      items: [{ id: 'stale-query' }], stale: false })).toBe(false)
    expect(store.read('deepseek').items).toEqual([{ id: 'mutated' }])
  })
})
