import type { ProviderFailureV2 } from '../../shared/provider/providerFailureV2'
import type { CatalogPolicySourceV2, CatalogPolicyV2 } from '../../shared/modelCatalog/catalogPolicyV2'
import type { ConversationRouteSelection } from '../provider/conversationRouteSelection'

export type CatalogRuntimeSyncStateV2 = 'idle' | 'syncing' | 'failed'
export type CatalogRuntimeHydrationStateV2 = 'idle' | 'loading' | 'ready'
export type CatalogRuntimeRequestKindV2 = 'query' | 'mutation'

export type CatalogRuntimeRequestTokenV2 = Readonly<{
  routeKey: string
  kind: CatalogRuntimeRequestKindV2
  requestToken: number
  authorityRevision: number
}>

export type CatalogRuntimeStateV2<TItem extends Readonly<Record<string, unknown>> = Readonly<Record<string, unknown>>> = Readonly<{
  routeKey: string
  authorityScopeId: string | null
  authorityRevision: number
  displayedSnapshotDigest: string | null
  pendingSnapshotDigest: string | null
  items: readonly TItem[]
  hydrationState: CatalogRuntimeHydrationStateV2
  syncState: CatalogRuntimeSyncStateV2
  effectivePolicy: CatalogPolicyV2 | null
  policySource: CatalogPolicySourceV2
  stale: boolean
  failure: ProviderFailureV2 | null
  queryRequestToken: number
  mutationRequestToken: number
}>

export type CatalogModelSelectionCommandV2 = (
  selection: ConversationRouteSelection,
) => Promise<void>

const appRuntimeStores = new WeakMap<object, CatalogRuntimeStoreV2<any>>()
const appSelectionCommands = new WeakMap<object, CatalogModelSelectionCommandV2>()

export function catalogRuntimeStoreV2ForApp<
  TItem extends Readonly<Record<string, unknown>> = Readonly<Record<string, unknown>>,
>(appIdentity: object): CatalogRuntimeStoreV2<TItem> {
  const existing = appRuntimeStores.get(appIdentity)
  if (existing) return existing as CatalogRuntimeStoreV2<TItem>
  const created = new CatalogRuntimeStoreV2<TItem>()
  appRuntimeStores.set(appIdentity, created)
  return created
}

export function registerCatalogModelSelectionCommandV2(
  appIdentity: object,
  command: CatalogModelSelectionCommandV2,
): () => void {
  appSelectionCommands.set(appIdentity, command)
  return () => {
    if (appSelectionCommands.get(appIdentity) === command) appSelectionCommands.delete(appIdentity)
  }
}

export function catalogModelSelectionCommandV2ForApp(
  appIdentity: object,
): CatalogModelSelectionCommandV2 | null {
  return appSelectionCommands.get(appIdentity) ?? null
}

function normalizeRouteKey(value: unknown): string {
  const normalized = String(value ?? '').trim()
  if (!normalized || normalized.length > 1_024) throw new Error('CATALOG_RUNTIME_ROUTE_INVALID')
  return normalized
}

function empty<TItem extends Readonly<Record<string, unknown>>>(
  key: string,
  counters: Readonly<{ authorityRevision?: number; queryRequestToken?: number; mutationRequestToken?: number }> = {},
): CatalogRuntimeStateV2<TItem> {
  return Object.freeze({
    routeKey: key,
    authorityScopeId: null,
    authorityRevision: counters.authorityRevision ?? 0,
    displayedSnapshotDigest: null,
    pendingSnapshotDigest: null,
    items: Object.freeze([]),
    hydrationState: 'idle',
    syncState: 'idle',
    effectivePolicy: null,
    policySource: 'unconfigured',
    stale: true,
    failure: null,
    queryRequestToken: counters.queryRequestToken ?? 0,
    mutationRequestToken: counters.mutationRequestToken ?? 0,
  })
}

export class CatalogRuntimeStoreV2<TItem extends Readonly<Record<string, unknown>> = Readonly<Record<string, unknown>>> {
  readonly #states = new Map<string, CatalogRuntimeStateV2<TItem>>()
  readonly #listeners = new Set<() => void>()

  read(routeKeyValue: string): CatalogRuntimeStateV2<TItem> {
    const key = normalizeRouteKey(routeKeyValue)
    return this.#states.get(key) ?? empty<TItem>(key)
  }

  snapshot(): Readonly<Record<string, CatalogRuntimeStateV2<TItem>>> {
    return Object.freeze(Object.fromEntries(this.#states.entries()))
  }

  subscribe(listener: () => void): () => void {
    this.#listeners.add(listener)
    return () => this.#listeners.delete(listener)
  }

  beginQuery(routeKeyValue: string): CatalogRuntimeRequestTokenV2 {
    return this.#begin(routeKeyValue, 'query')
  }

  beginMutation(routeKeyValue: string): CatalogRuntimeRequestTokenV2 {
    return this.#begin(routeKeyValue, 'mutation')
  }

  isCurrent(token: CatalogRuntimeRequestTokenV2): boolean {
    const current = this.read(token.routeKey)
    return current.authorityRevision === token.authorityRevision &&
      (token.kind === 'query'
        ? current.queryRequestToken === token.requestToken
        : current.mutationRequestToken === token.requestToken)
  }

  setPolicy(input: Readonly<{
    routeKey: string
    effectivePolicy: CatalogPolicyV2 | null
    policySource: CatalogPolicySourceV2
  }>): void {
    const key = normalizeRouteKey(input.routeKey)
    const current = this.read(key)
    this.#publish(key, Object.freeze({
      ...current,
      effectivePolicy: input.effectivePolicy,
      policySource: input.policySource,
    }))
  }

  acceptAuthority(input: Readonly<{
    token: CatalogRuntimeRequestTokenV2
    authorityScopeId: string | null
    authorityRevision?: number
    displayedSnapshotDigest: string | null
    pendingSnapshotDigest: string | null
    items: readonly TItem[]
    stale?: boolean
    failure?: ProviderFailureV2 | null
  }>): boolean {
    if (!this.isCurrent(input.token)) return false
    const current = this.read(input.token.routeKey)
    const authorityRevision = input.authorityRevision ?? current.authorityRevision + 1
    if (!Number.isSafeInteger(authorityRevision) || authorityRevision < 0) return false
    if (current.authorityScopeId === input.authorityScopeId && authorityRevision < current.authorityRevision) return false
    this.#publish(input.token.routeKey, Object.freeze({
      ...current,
      authorityScopeId: input.authorityScopeId,
      authorityRevision,
      displayedSnapshotDigest: input.displayedSnapshotDigest,
      pendingSnapshotDigest: input.pendingSnapshotDigest,
      items: Object.freeze([...input.items]),
      hydrationState: 'ready',
      syncState: input.failure ? 'failed' : 'idle',
      stale: input.stale ?? current.stale,
      failure: input.failure ?? null,
    }))
    return true
  }

  acceptFailure(input: Readonly<{
    token: CatalogRuntimeRequestTokenV2
    failure: ProviderFailureV2
  }>): boolean {
    if (!this.isCurrent(input.token)) return false
    const current = this.read(input.token.routeKey)
    this.#publish(input.token.routeKey, Object.freeze({
      ...current,
      hydrationState: current.hydrationState === 'loading' ? 'ready' : current.hydrationState,
      syncState: 'failed',
      stale: true,
      failure: input.failure,
    }))
    return true
  }

  clear(routeKeyValue: string): void {
    const key = normalizeRouteKey(routeKeyValue)
    const current = this.read(key)
    this.#publish(key, empty<TItem>(key, {
      authorityRevision: current.authorityRevision + 1,
      queryRequestToken: current.queryRequestToken + 1,
      mutationRequestToken: current.mutationRequestToken + 1,
    }))
  }

  #begin(routeKeyValue: string, kind: CatalogRuntimeRequestKindV2): CatalogRuntimeRequestTokenV2 {
    const key = normalizeRouteKey(routeKeyValue)
    const current = this.read(key)
    const requestToken = (kind === 'query' ? current.queryRequestToken : current.mutationRequestToken) + 1
    this.#publish(key, Object.freeze({
      ...current,
      queryRequestToken: kind === 'query' ? requestToken : current.queryRequestToken,
      mutationRequestToken: kind === 'mutation' ? requestToken : current.mutationRequestToken,
      hydrationState: kind === 'query' ? 'loading' : current.hydrationState,
      syncState: kind === 'mutation' ? 'syncing' : current.syncState,
    }))
    return Object.freeze({ routeKey: key, kind, requestToken, authorityRevision: current.authorityRevision })
  }

  #publish(key: string, state: CatalogRuntimeStateV2<TItem>): void {
    this.#states.set(key, state)
    for (const listener of this.#listeners) listener()
  }
}
