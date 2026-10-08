import type { SearchHit, SearchOrder, SearchPage, SearchQueryParams } from './searchTypes'

/** The immutable identity of one ordered result set: query, scope, filters and ordering. */
export type SearchSessionQuery = Readonly<Required<Pick<SearchQueryParams, 'q' | 'scope' | 'mode'>> & {
  projectId: string | null
  convoId: string | null
  timeFromSec?: number
  timeToSec?: number
  order: SearchOrder
}>

export type SearchFetchPage = (params: SearchQueryParams) => Promise<SearchPage>

/**
 * `more`  - further results may be fetched.
 * `end`   - the search itself has no further matches.
 * `limit` - matches exist beyond the configured display limit; nothing more is retrieved.
 */
export type SearchSessionStatus = 'more' | 'end' | 'limit'

export class SearchSessionSupersededError extends Error {
  constructor() { super('SEARCH_SESSION_SUPERSEDED') }
}

export function isSearchSessionSuperseded(error: unknown): boolean {
  return error instanceof SearchSessionSupersededError
}

type Waiter = {
  target: number
  chunk: number
  resolve: () => void
  reject: (error: unknown) => void
}

/** Largest window requested from the database in one query. */
const MAX_WINDOW = 1_000

/**
 * The single authority for one ordered result set. Results form a contiguous prefix of the ordered set, so
 * every presentation (scroll or pagination) reads the same array and the only way to see more is to extend it.
 * Starting a new query (or disposing) invalidates every in-flight fetch and pending waiter.
 */
export class SearchResultSession {
  private generation = 0
  private query: SearchSessionQuery | null = null
  private readonly items: SearchHit[] = []
  private state: SearchSessionStatus = 'more'
  private fetched = false
  private fetching = false
  private lastError: string | null = null
  private waiters: Waiter[] = []
  private readonly listeners = new Set<() => void>()

  constructor(private readonly fetchPage: SearchFetchPage, private readonly limit: number) {}

  get hits(): readonly SearchHit[] { return this.items }
  get loaded(): number { return this.items.length }
  get status(): SearchSessionStatus { return this.state }
  /** True once the first query of the current result set has returned. */
  get started(): boolean { return this.fetched }
  get loading(): boolean { return this.fetching }
  get error(): string | null { return this.lastError }
  get resultLimit(): number { return this.limit }
  get currentQuery(): SearchSessionQuery | null { return this.query }

  subscribe(listener: () => void): () => void {
    this.listeners.add(listener)
    return () => { this.listeners.delete(listener) }
  }

  /** Begins a new ordered result set, discarding everything from the previous one. */
  start(query: SearchSessionQuery): void {
    this.reset()
    this.query = query
    this.emit()
  }

  dispose(): void {
    this.reset()
    this.query = null
    this.emit()
  }

  /**
   * Resolves once at least `target` results are loaded or the result set cannot grow further (end or limit).
   * `chunk` is the preferred size of each underlying query. Waiters are served in order and share the fetch loop.
   */
  ensureLoaded(target: number, chunk = 200): Promise<void> {
    if (!this.query) return Promise.reject(new Error('SEARCH_SESSION_NOT_STARTED'))
    if (this.satisfied(target)) return Promise.resolve()
    return new Promise<void>((resolve, reject) => {
      this.waiters.push({ target, chunk: Math.max(1, Math.floor(chunk)), resolve, reject })
      if (!this.fetching) void this.pump()
    })
  }

  private satisfied(target: number): boolean {
    return this.items.length >= target || (this.fetched && this.state !== 'more')
  }

  private reset(): void {
    this.generation += 1
    this.items.length = 0
    this.state = 'more'
    this.fetched = false
    this.fetching = false
    this.lastError = null
    const stale = this.waiters
    this.waiters = []
    for (const waiter of stale) waiter.reject(new SearchSessionSupersededError())
  }

  private emit(): void {
    for (const listener of [...this.listeners]) listener()
  }

  private settleWaiters(): void {
    const pending: Waiter[] = []
    for (const waiter of this.waiters) {
      if (this.satisfied(waiter.target)) waiter.resolve()
      else pending.push(waiter)
    }
    this.waiters = pending
  }

  private async pump(): Promise<void> {
    const generation = this.generation
    const query = this.query
    if (!query) return
    this.fetching = true
    this.lastError = null
    this.emit()
    try {
      while (this.waiters.length > 0) {
        const room = this.limit - this.items.length
        if (room <= 0) break
        // One chunk per query, serving the most urgent (smallest) target first, so the batch the user is waiting
        // for lands before the batches prefetched behind it are requested.
        const head = this.waiters.reduce((best, waiter) => (waiter.target < best.target ? waiter : best))
        const size = Math.min(MAX_WINDOW, room, head.chunk)
        const offset = this.items.length
        const page = await this.fetchPage({ ...query, limit: size, offset })
        if (generation !== this.generation) return
        // A concurrent index change can make a window overlap; the offset we asked for is authoritative.
        this.items.push(...page.hits)
        this.fetched = true
        this.state = !page.hasMore ? 'end' : this.items.length >= this.limit ? 'limit' : 'more'
        this.settleWaiters()
        this.emit()
        if (this.state !== 'more') break
      }
    } catch (error) {
      if (generation !== this.generation) return
      this.lastError = error instanceof Error ? error.message : 'SEARCH_FETCH_FAILED'
      const failed = this.waiters
      this.waiters = []
      for (const waiter of failed) waiter.reject(error)
    } finally {
      if (generation === this.generation) {
        this.fetching = false
        this.settleWaiters()
        this.emit()
      }
    }
  }
}
