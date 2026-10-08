import type { SearchFetchPage } from './searchResultSession'
import type { SearchHit, SearchPage, SearchQueryParams } from './searchTypes'

/** Deterministic in-memory stand-in for the search IPC: a fixed ordered set windowed by offset/limit. */
export function fakeHit(index: number): SearchHit {
  return { entityType: 'message', entityId: `m${index}`, projectId: 'p', convoId: 'c', createdAtSec: index, snippet: `hit ${index}`, score: index }
}

export type FakeSearch = {
  fetch: SearchFetchPage
  calls: SearchQueryParams[]
  /** Holds every subsequent response until `release()` is called. */
  hold(): void
  release(): void
  /** Makes the next `count` fetches reject. */
  failNext(count?: number): void
}

export function createFakeSearch(total: number, order = (index: number) => index): FakeSearch {
  const calls: SearchQueryParams[] = []
  let gate: Promise<void> | null = null
  let open: (() => void) | null = null
  let failures = 0
  return {
    calls,
    hold() { gate = new Promise<void>((resolve) => { open = resolve }) },
    release() { open?.(); gate = null; open = null },
    failNext(count = 1) { failures = count },
    async fetch(params): Promise<SearchPage> {
      calls.push(params)
      if (gate) await gate
      if (failures > 0) { failures -= 1; throw new Error('SEARCH_FAKE_FAILURE') }
      const offset = params.offset ?? 0
      const limit = params.limit ?? 50
      const hits: SearchHit[] = []
      for (let index = offset; index < Math.min(total, offset + limit); index += 1) hits.push(fakeHit(order(index)))
      return { hits, hasMore: offset + limit < total }
    },
  }
}

/** Lets pending promise chains (and a few timers) settle. */
export async function settle(times = 10): Promise<void> {
  for (let i = 0; i < times; i += 1) await new Promise<void>((resolve) => setTimeout(resolve, 0))
}
