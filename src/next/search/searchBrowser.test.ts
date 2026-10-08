import { describe, expect, it } from 'vitest'
import { SearchBrowser } from './searchBrowser'
import type { SearchBrowserQuery } from './searchBrowser'
import { DEFAULT_SEARCH_PREFERENCES } from './searchPreferences'
import type { SearchPreferences } from './searchPreferences'
import { createFakeSearch, settle } from './searchTestKit'

const query: SearchBrowserQuery = {
  q: 'x', scope: { projectName: true, convoName: true, userMessages: true, assistantMessages: true },
  projectId: null, convoId: null, mode: 'fuzzy',
}

function prefs(overrides: {
  defaultSort?: SearchPreferences['defaultSort']
  defaultPresentation?: SearchPreferences['defaultPresentation']
  resultLimit?: number
  scroll?: Partial<SearchPreferences['scroll']>
  pagination?: Partial<SearchPreferences['pagination']>
} = {}): SearchPreferences {
  return {
    ...DEFAULT_SEARCH_PREFERENCES,
    defaultSort: overrides.defaultSort ?? DEFAULT_SEARCH_PREFERENCES.defaultSort,
    defaultPresentation: overrides.defaultPresentation ?? DEFAULT_SEARCH_PREFERENCES.defaultPresentation,
    resultLimit: overrides.resultLimit ?? DEFAULT_SEARCH_PREFERENCES.resultLimit,
    scroll: { ...DEFAULT_SEARCH_PREFERENCES.scroll, ...overrides.scroll },
    pagination: { ...DEFAULT_SEARCH_PREFERENCES.pagination, ...overrides.pagination },
  }
}

describe('SearchBrowser', () => {
  describe('one authority for both presentations', () => {
    it('serves Scroll and Pagination from the same session without re-querying on a switch', async () => {
      const fake = createFakeSearch(2_000)
      const browser = new SearchBrowser(fake.fetch, prefs({ scroll: { loading: 'on-demand' }, pagination: { fixedPageSize: 50, prefetchPages: 1 } }))
      browser.search(query)
      await settle()
      browser.scrollDemand(180)
      await settle()
      const session = browser.session
      const before = fake.calls.length
      expect(session.loaded).toBeGreaterThanOrEqual(181)
      browser.setAnchor(60)
      browser.setPresentation('pagination')
      await settle()
      expect(browser.session).toBe(session)
      expect(browser.navigator?.currentPage).toBe(2)
      // Entering the page needed nothing that was not loaded; at most the configured prefetch ran.
      expect(fake.calls.slice(before).every((call) => (call.offset ?? 0) >= session.loaded - 50)).toBe(true)
      expect(new Set(fake.calls.map((call) => `${call.q}|${call.order}|${call.mode}`)).size).toBe(1)
    })

    it('keeps the first visible result across Scroll to Pagination and back', async () => {
      const fake = createFakeSearch(1_000)
      const browser = new SearchBrowser(fake.fetch, prefs({ pagination: { fixedPageSize: 50 } }))
      browser.search(query)
      browser.scrollDemand(300)
      await settle()
      browser.setAnchor(137)
      browser.setPresentation('pagination')
      await settle()
      expect(browser.anchorIndex).toBe(137)
      expect(browser.navigator?.currentPage).toBe(3) // results 100..149 contain #137
      expect(browser.navigator?.selectedPage).toBe(3)
      // In Pagination the view reports a different first visible row inside the page.
      browser.setAnchor(100 + 12)
      browser.setPresentation('scroll')
      await settle()
      expect(browser.presentation).toBe('scroll')
      expect(browser.anchorIndex).toBe(112)
      expect(browser.session.loaded).toBeGreaterThan(112)
    })

    it('does not enter a page beyond the pagination capacity but follows the clamped page', async () => {
      const fake = createFakeSearch(5_000)
      const browser = new SearchBrowser(fake.fetch, prefs({ resultLimit: 5_000, pagination: { fixedPageSize: 10, capacity: 'standard' } }))
      browser.search(query)
      browser.scrollDemand(2_000)
      await settle(40)
      browser.setAnchor(1_500)
      browser.setPresentation('pagination')
      await settle()
      expect(browser.navigator?.currentPage).toBe(99)
      expect(browser.navigator?.capacityBlocked).toBe(true)
      expect(browser.anchorIndex).toBe(98 * 10)
    })
  })

  describe('sorting', () => {
    it('restarts from the beginning with the new order and keeps the presentation', async () => {
      const fake = createFakeSearch(600)
      const browser = new SearchBrowser(fake.fetch, prefs({ pagination: { fixedPageSize: 20 } }))
      browser.search(query)
      browser.scrollDemand(300)
      await settle(20)
      browser.setAnchor(250)
      browser.setOrder('relevance')
      expect(browser.anchorIndex).toBe(0)
      expect(browser.session.loaded).toBe(0)
      await settle()
      expect(browser.session.currentQuery?.order).toBe('relevance')
      expect(fake.calls.find((call) => call.order === 'relevance')?.offset).toBe(0)
      expect(browser.presentation).toBe('scroll')

      browser.setPresentation('pagination')
      await settle()
      browser.clickPage(2)
      await settle()
      expect(browser.navigator?.currentPage).toBe(2)
      browser.setOrder('reverse-chronological')
      await settle()
      expect(browser.navigator?.currentPage).toBe(1)
      expect(browser.navigator?.selectedPage).toBe(1)
      expect(browser.anchorIndex).toBe(0)
    })

    it('ignores a response that belongs to the previous ordering', async () => {
      const fake = createFakeSearch(300, (index) => index)
      const browser = new SearchBrowser(fake.fetch, prefs())
      browser.search(query)
      await settle()
      fake.hold()
      browser.setOrder('reverse-chronological')
      browser.setOrder('relevance')
      fake.release()
      await settle()
      expect(browser.session.currentQuery?.order).toBe('relevance')
      expect(browser.session.loaded).toBeLessThanOrEqual(200)
    })
  })

  it('ignores a navigation of an abandoned paginator after switching back to Scroll', async () => {
    const fake = createFakeSearch(1_000)
    const browser = new SearchBrowser(fake.fetch, prefs({ defaultPresentation: 'pagination', pagination: { fixedPageSize: 10, prefetchPages: 3 } }))
    browser.search(query)
    await settle()
    fake.hold()
    browser.clickPage(3)
    browser.setAnchor(4)
    browser.setPresentation('scroll')
    const revision = browser.positionRevision
    fake.release()
    await settle()
    expect(browser.anchorIndex).toBe(4)
    expect(browser.positionRevision).toBe(revision)
    expect(browser.navigator).toBeNull()
  })

  it('refresh re-runs the query from the start', async () => {
    const fake = createFakeSearch(300)
    const browser = new SearchBrowser(fake.fetch, prefs())
    browser.search(query)
    browser.scrollDemand(100)
    await settle()
    browser.setAnchor(80)
    browser.refresh()
    expect(browser.session.loaded).toBe(0)
    expect(browser.anchorIndex).toBe(0)
    await settle()
    expect(browser.session.loaded).toBeGreaterThan(0)
  })

  describe('persisted defaults versus temporary state', () => {
    it('starts from the preferences and never mutates them', async () => {
      const preferences = prefs({ defaultSort: 'relevance', defaultPresentation: 'pagination' })
      const snapshot = JSON.stringify(preferences)
      const first = new SearchBrowser(createFakeSearch(100).fetch, preferences)
      expect(first.order).toBe('relevance')
      expect(first.presentation).toBe('pagination')
      first.setOrder('chronological')
      first.setPresentation('scroll')
      expect(JSON.stringify(preferences)).toBe(snapshot)
      const reopened = new SearchBrowser(createFakeSearch(100).fetch, preferences)
      expect(reopened.order).toBe('relevance')
      expect(reopened.presentation).toBe('pagination')
    })

    it('defaults to chronological order and Scroll', () => {
      const browser = new SearchBrowser(createFakeSearch(1).fetch, DEFAULT_SEARCH_PREFERENCES)
      expect(browser.order).toBe('chronological')
      expect(browser.presentation).toBe('scroll')
    })
  })

  describe('loading strategies', () => {
    it('Scroll on-demand fetches in configured batches and prefetches the configured batches ahead', async () => {
      const fake = createFakeSearch(5_000)
      const browser = new SearchBrowser(fake.fetch, prefs({ scroll: { loading: 'on-demand', batchSize: 50, prefetchBatches: 3 } }))
      browser.search(query)
      await settle()
      expect(fake.calls.every((call) => call.limit === 50)).toBe(true)
      expect(browser.session.loaded).toBe(200) // first visible row + 3 prefetched batches
      browser.scrollDemand(120)
      await settle()
      expect(browser.session.loaded).toBe(300)
      expect(browser.session.status).toBe('more')
    })

    it('Scroll on-demand never asks twice for the same horizon while a fetch is in flight', async () => {
      const fake = createFakeSearch(5_000)
      const browser = new SearchBrowser(fake.fetch, prefs())
      browser.search(query)
      await settle()
      fake.hold()
      const before = fake.calls.length
      for (let i = 0; i < 20; i += 1) browser.scrollDemand(190)
      fake.release()
      await settle()
      expect(fake.calls.length - before).toBeLessThanOrEqual(4)
    })

    it('Scroll full load retrieves progressively up to the limit and reports the limit, not the end', async () => {
      const fake = createFakeSearch(1_200)
      const browser = new SearchBrowser(fake.fetch, prefs({ resultLimit: 1_000, scroll: { loading: 'full' } }))
      browser.search(query)
      await settle(30)
      expect(browser.session.loaded).toBe(1_000)
      expect(browser.session.status).toBe('limit')
      expect(fake.calls.length).toBeGreaterThan(1)
      expect(Math.max(...fake.calls.map((call) => call.limit ?? 0))).toBeLessThanOrEqual(200)
    })

    it('Pagination on-demand prefetches pages, not batches', async () => {
      const fake = createFakeSearch(5_000)
      const browser = new SearchBrowser(fake.fetch, prefs({ defaultPresentation: 'pagination', pagination: { loading: 'on-demand', fixedPageSize: 25, prefetchPages: 3 } }))
      browser.search(query)
      await settle()
      expect(browser.navigator?.currentPage).toBe(1)
      expect(browser.session.loaded).toBe(100) // page 1 + three prefetched pages
      expect(fake.calls.every((call) => call.limit === 25)).toBe(true)
    })

    it('Pagination full load retrieves everything permitted by the limit', async () => {
      const fake = createFakeSearch(900)
      const browser = new SearchBrowser(fake.fetch, prefs({ defaultPresentation: 'pagination', resultLimit: 700, pagination: { loading: 'full', fixedPageSize: 10 } }))
      browser.search(query)
      await settle(30)
      expect(browser.session.loaded).toBe(700)
      expect(browser.session.status).toBe('limit')
      expect(browser.navigator?.maxPage).toBe(70)
    })

    it('does not fetch beyond what the pagination capacity can show', async () => {
      const fake = createFakeSearch(100_000)
      const browser = new SearchBrowser(fake.fetch, prefs({
        defaultPresentation: 'pagination', resultLimit: 100_000,
        pagination: { loading: 'on-demand', fixedPageSize: 5, prefetchPages: 500, capacity: 'standard' },
      }))
      browser.search(query)
      await settle(60)
      expect(browser.session.loaded).toBeLessThanOrEqual(99 * 5 + 5)
      expect(browser.navigator?.maxPage).toBe(99)
      expect(browser.navigator?.capacityBlocked).toBe(true)
    })

    it('reports the natural end separately from the limit', async () => {
      const browser = new SearchBrowser(createFakeSearch(40).fetch, prefs({ resultLimit: 100 }))
      browser.search(query)
      await settle()
      expect(browser.session.status).toBe('end')
    })
  })

  describe('Adaptive page size', () => {
    const adaptive = () => prefs({ defaultPresentation: 'pagination', pagination: { pageSizing: 'adaptive', fixedPageSize: 50 } })

    it('waits for a measured viewport before loading its first page', async () => {
      const fake = createFakeSearch(500)
      const browser = new SearchBrowser(fake.fetch, adaptive())
      browser.search(query)
      await settle()
      expect(browser.awaitingAdaptation).toBe(true)
      expect(fake.calls).toHaveLength(0)
      expect(await browser.adaptLayout(7)).toBe(true)
      expect(browser.awaitingAdaptation).toBe(false)
      expect(browser.navigator?.pageSize).toBe(7)
      expect(browser.navigator?.currentPage).toBe(1)
    })

    it('keeps its size until re-adapted, then preserves current and selected pages independently', async () => {
      const fake = createFakeSearch(600)
      const browser = new SearchBrowser(fake.fetch, adaptive())
      browser.search(query)
      await browser.adaptLayout(10)
      await settle()
      browser.session.ensureLoaded(400, 400).catch(() => undefined)
      await settle(20)
      browser.clickPage(6)
      await settle()
      browser.navigator?.select(9)
      expect(browser.navigator?.pageSize).toBe(10) // untouched by anything but an explicit re-adapt
      expect(await browser.adaptLayout(8)).toBe(true)
      const nav = browser.navigator!
      expect(nav.pageSize).toBe(8)
      expect(nav.currentPage).toBe(Math.floor(50 / 8) + 1) // first result of old page 6 was #50
      expect(nav.selectedPage).toBe(Math.floor(80 / 8) + 1) // first result of old page 9 was #80
      expect(browser.anchorIndex).toBe(50)
    })

    it('refuses an unmeasured viewport and recovers from a failed first page through the ordinary retry', async () => {
      const fake = createFakeSearch(500)
      const browser = new SearchBrowser(fake.fetch, adaptive())
      browser.search(query)
      expect(await browser.adaptLayout(0)).toBe(false)
      expect(browser.awaitingAdaptation).toBe(true)
      fake.failNext()
      expect(await browser.adaptLayout(6)).toBe(true)
      await settle()
      const nav = browser.navigator!
      expect(nav.pageSize).toBe(6)
      expect(nav.error).toBe('SEARCH_FAKE_FAILURE')
      browser.retryNavigation()
      await settle()
      expect(nav.error).toBeNull()
      expect(browser.session.loaded).toBeGreaterThanOrEqual(6)
    })

    it('is not awaiting a measurement before the first search creates its paginator', () => {
      const browser = new SearchBrowser(createFakeSearch(10).fetch, adaptive())
      expect(browser.awaitingAdaptation).toBe(false)
    })

    it('measures a Fixed-size preference as irrelevant', async () => {
      const browser = new SearchBrowser(createFakeSearch(100).fetch, prefs({ defaultPresentation: 'pagination' }))
      browser.search(query)
      expect(browser.awaitingAdaptation).toBe(false)
      expect(await browser.adaptLayout(5)).toBe(false)
    })
  })

  it('shows a failed Scroll fetch as an error and recovers on retry', async () => {
    const fake = createFakeSearch(500)
    const browser = new SearchBrowser(fake.fetch, prefs())
    browser.search(query)
    await settle()
    fake.failNext()
    browser.scrollDemand(400)
    await settle()
    expect(browser.scrollError).toBe('SEARCH_FAKE_FAILURE')
    browser.retryScroll(400)
    await settle()
    expect(browser.scrollError).toBeNull()
    expect(browser.session.loaded).toBeGreaterThan(400)
  })
  describe('scale', () => {
    it('full-loads tens of thousands of results in bounded queries without blocking', async () => {
      const fake = createFakeSearch(60_000)
      const browser = new SearchBrowser(fake.fetch, prefs({ resultLimit: 50_000, scroll: { loading: 'full' } }))
      const started = performance.now()
      browser.search(query)
      let ticks = 0
      const unsubscribe = browser.subscribe(() => { ticks += 1 })
      while (browser.session.status === 'more') await settle(1)
      unsubscribe()
      expect(browser.session.loaded).toBe(50_000)
      expect(browser.session.status).toBe('limit')
      expect(Math.max(...fake.calls.map((call) => call.limit ?? 0))).toBeLessThanOrEqual(200)
      expect(fake.calls).toHaveLength(250)
      expect(ticks).toBeGreaterThanOrEqual(250) // progressive: every chunk was observable before the load finished
      expect(performance.now() - started).toBeLessThan(5_000)
    })

    it('stays coherent under a burst of conflicting navigations', async () => {
      const fake = createFakeSearch(5_000)
      const browser = new SearchBrowser(fake.fetch, prefs({
        defaultPresentation: 'pagination', resultLimit: 5_000,
        pagination: { loading: 'full', fixedPageSize: 10, capacity: 'unlimited' },
      }))
      browser.search(query)
      while (browser.session.status === 'more') await settle(1)
      for (let i = 0; i < 400; i += 1) browser.clickPage(1 + ((i * 37) % 500))
      browser.clickPage(250)
      await settle(20)
      const nav = browser.navigator!
      expect(nav.currentPage).toBe(250)
      expect(nav.selectedPage).toBe(250)
      expect(nav.navigating).toBe(false)
      expect(browser.anchorIndex).toBe(2_490)
    })
  })
})
