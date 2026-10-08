import { describe, expect, it } from 'vitest'
import { SearchResultSession, isSearchSessionSuperseded } from './searchResultSession'
import type { SearchSessionQuery } from './searchResultSession'
import { createFakeSearch, settle } from './searchTestKit'

const query: SearchSessionQuery = {
  q: 'x', scope: { projectName: true, convoName: true, userMessages: true, assistantMessages: true },
  projectId: null, convoId: null, mode: 'fuzzy', order: 'chronological',
}

describe('SearchResultSession', () => {
  it('extends one contiguous prefix in whole chunks and reports the natural end', async () => {
    const fake = createFakeSearch(120)
    const session = new SearchResultSession(fake.fetch, 5_000)
    session.start(query)
    await session.ensureLoaded(10, 50)
    expect(session.loaded).toBe(50)
    expect(session.status).toBe('more')
    await session.ensureLoaded(500, 50)
    expect(session.loaded).toBe(120)
    expect(session.status).toBe('end')
    expect(session.hits.map((hit) => hit.score)).toEqual(Array.from({ length: 120 }, (_, i) => i))
    expect(fake.calls.map((call) => [call.offset, call.limit])).toEqual([[0, 50], [50, 50], [100, 50]])
  })

  it('distinguishes the configured display limit from the end of the results', async () => {
    const fake = createFakeSearch(500)
    const session = new SearchResultSession(fake.fetch, 120)
    session.start(query)
    await session.ensureLoaded(10_000, 50)
    expect(session.loaded).toBe(120)
    expect(session.status).toBe('limit')
    expect(fake.calls.at(-1)).toMatchObject({ offset: 100, limit: 20 })

    const exact = new SearchResultSession(createFakeSearch(120).fetch, 120)
    exact.start(query)
    await exact.ensureLoaded(10_000, 50)
    expect(exact.loaded).toBe(120)
    expect(exact.status).toBe('end')
  })

  it('serves the most urgent demand first so prefetch never delays the visible batch', async () => {
    const fake = createFakeSearch(1_000)
    const session = new SearchResultSession(fake.fetch, 5_000)
    session.start(query)
    const prefetch = session.ensureLoaded(200, 50)
    const demand = session.ensureLoaded(10, 50)
    await demand
    expect(session.loaded).toBe(50)
    await prefetch
    expect(session.loaded).toBe(200)
    expect(fake.calls.every((call) => call.limit === 50)).toBe(true)
  })

  it('caps every database query window', async () => {
    const fake = createFakeSearch(10_000)
    const session = new SearchResultSession(fake.fetch, 10_000)
    session.start(query)
    await session.ensureLoaded(3_500, 3_500)
    expect(Math.max(...fake.calls.map((call) => call.limit ?? 0))).toBeLessThanOrEqual(1_000)
    expect(session.loaded).toBeGreaterThanOrEqual(3_500)
  })

  it('discards responses of a superseded result set and rejects their waiters', async () => {
    const fake = createFakeSearch(500)
    const session = new SearchResultSession(fake.fetch, 5_000)
    session.start(query)
    fake.hold()
    const stale = session.ensureLoaded(50, 50)
    const staleOutcome = stale.catch((error) => error)
    session.start({ ...query, order: 'relevance' })
    fake.release()
    expect(isSearchSessionSuperseded(await staleOutcome)).toBe(true)
    await settle()
    expect(session.loaded).toBe(0)
    await session.ensureLoaded(50, 50)
    expect(session.loaded).toBe(50)
    expect(session.currentQuery?.order).toBe('relevance')
  })

  it('reports a failed fetch to its waiters, keeps loaded results, and succeeds on retry', async () => {
    const fake = createFakeSearch(300)
    const session = new SearchResultSession(fake.fetch, 5_000)
    session.start(query)
    await session.ensureLoaded(50, 50)
    fake.failNext()
    await expect(session.ensureLoaded(100, 50)).rejects.toThrow('SEARCH_FAKE_FAILURE')
    expect(session.loaded).toBe(50)
    expect(session.error).toBe('SEARCH_FAKE_FAILURE')
    await session.ensureLoaded(100, 50)
    expect(session.loaded).toBe(100)
    expect(session.error).toBeNull()
  })

  it('does not re-query when the requested amount is already loaded', async () => {
    const fake = createFakeSearch(100)
    const session = new SearchResultSession(fake.fetch, 5_000)
    session.start(query)
    await session.ensureLoaded(60, 60)
    await session.ensureLoaded(30, 30)
    expect(fake.calls).toHaveLength(1)
  })
})
