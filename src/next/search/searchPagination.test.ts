import { describe, expect, it } from 'vitest'
import {
  PaginationNavigator, discoveredPageCount, estimatePageLabelWidth, pageOfIndex, pageStartIndex, visiblePageWindow,
} from './searchPagination'
import type { PaginationInteractions } from './searchPagination'
import { SearchResultSession } from './searchResultSession'
import type { SearchSessionQuery } from './searchResultSession'
import { createFakeSearch } from './searchTestKit'

const query: SearchSessionQuery = {
  q: 'x', scope: { projectName: true, convoName: true, userMessages: true, assistantMessages: true },
  projectId: null, convoId: null, mode: 'fuzzy', order: 'chronological',
}
const direct: PaginationInteractions = { arrowClick: 'direct', pageClick: 'direct', keyboard: 'direct' }

function harness(total: number, options: { interactions?: PaginationInteractions; capacity?: number; prefetch?: number; size?: number; limit?: number } = {}, preload = 0) {
  const fake = createFakeSearch(total)
  const session = new SearchResultSession(fake.fetch, options.limit ?? 5_000)
  session.start(query)
  const navigator = new PaginationNavigator({
    ensureLoaded: (count, chunk) => session.ensureLoaded(count, chunk),
    loaded: () => session.loaded,
    status: () => session.status,
    capacityPages: () => options.capacity ?? Number.POSITIVE_INFINITY,
    prefetchPages: () => options.prefetch ?? 0,
    interactions: () => options.interactions ?? direct,
  }, options.size ?? 10)
  return { fake, session, navigator, preload: () => (preload > 0 ? session.ensureLoaded(preload, preload) : Promise.resolve()) }
}

describe('page arithmetic', () => {
  it('maps indices and pages both ways', () => {
    expect(pageOfIndex(0, 10)).toBe(1)
    expect(pageOfIndex(9, 10)).toBe(1)
    expect(pageOfIndex(10, 10)).toBe(2)
    expect(pageStartIndex(3, 10)).toBe(20)
    expect(pageOfIndex(pageStartIndex(7, 13), 13)).toBe(7)
  })

  it('counts a page that is only known to exist because the result set continues', () => {
    expect(discoveredPageCount(20, 'more', 10)).toBe(3)
    expect(discoveredPageCount(20, 'end', 10)).toBe(2)
    expect(discoveredPageCount(25, 'limit', 10)).toBe(3)
    expect(discoveredPageCount(0, 'end', 10)).toBe(1)
  })
})

describe('visiblePageWindow', () => {
  const labelWidth = () => 20
  const win = (selected: number, total: number, available: number) =>
    visiblePageWindow({ selected, total, available, gap: 0, labelWidth })

  it('centres the selection and expands outward with the available width', () => {
    expect(win(50, 99, 100)).toEqual({ first: 48, last: 52 })
    expect(win(50, 99, 140)).toEqual({ first: 47, last: 53 })
  })

  it('moves the selection toward an edge instead of leaving an empty side', () => {
    expect(win(1, 99, 100)).toEqual({ first: 1, last: 5 })
    expect(win(2, 99, 100)).toEqual({ first: 1, last: 5 })
    expect(win(99, 99, 100)).toEqual({ first: 95, last: 99 })
  })

  it('shows every page when they all fit and at least the selected page when nothing fits', () => {
    expect(win(2, 3, 500)).toEqual({ first: 1, last: 3 })
    expect(win(5, 9, 5)).toEqual({ first: 5, last: 5 })
  })

  it('is stable: selecting a neighbour shifts the window by at most one page', () => {
    for (let selected = 2; selected < 98; selected += 1) {
      const a = win(selected, 99, 130)
      const b = win(selected + 1, 99, 130)
      expect(Math.abs(b.first - a.first)).toBeLessThanOrEqual(1)
      expect(b.first).toBeGreaterThanOrEqual(a.first)
    }
  })

  it('uses natural label widths, wider for multi-digit pages', () => {
    expect(estimatePageLabelWidth(7)).toBeLessThan(estimatePageLabelWidth(77))
    expect(estimatePageLabelWidth(77)).toBeLessThan(estimatePageLabelWidth(777))
  })
})

describe('PaginationNavigator', () => {
  it('commits a page only after its results are loaded', async () => {
    const { navigator, fake, session } = harness(95)
    fake.hold()
    const navigation = navigator.navigate(1)
    expect(navigator.currentPage).toBe(1)
    expect(session.loaded).toBe(0)
    expect(navigator.navigating).toBe(true)
    fake.release()
    expect(await navigation).toBe(true)
    expect(session.loaded).toBeGreaterThanOrEqual(10)
    expect(navigator.navigating).toBe(false)
  })

  it('keeps the previous page and the attempted selection when navigation fails, and retries', async () => {
    const { navigator, fake } = harness(95)
    await navigator.navigate(1)
    fake.failNext()
    expect(await navigator.navigate(2)).toBe(false)
    expect(navigator.currentPage).toBe(1)
    expect(navigator.selectedPage).toBe(2)
    expect(navigator.error).toBe('SEARCH_FAKE_FAILURE')
    expect(await navigator.retry()).toBe(true)
    expect(navigator.currentPage).toBe(2)
    expect(navigator.selectedPage).toBe(2)
    expect(navigator.error).toBeNull()
  })

  it('lets the newest navigation win over a slower earlier one', async () => {
    const { navigator, fake } = harness(500)
    await navigator.navigate(1)
    fake.hold()
    const slow = navigator.navigate(5)
    const fast = navigator.navigate(2)
    fake.release()
    expect(await slow).toBe(false)
    expect(await fast).toBe(true)
    expect(navigator.currentPage).toBe(2)
    expect(navigator.selectedPage).toBe(2)
  })

  it('prefetches the configured number of pages ahead, in pages', async () => {
    const { navigator, session } = harness(500, { prefetch: 3, size: 10 })
    await navigator.navigate(1)
    await new Promise((resolve) => setTimeout(resolve, 0))
    await new Promise((resolve) => setTimeout(resolve, 0))
    expect(session.loaded).toBeGreaterThanOrEqual(40)
  })

  describe('input categories', () => {
    it('navigates directly by default for arrows, page labels and keys', async () => {
      const { navigator, preload } = harness(95, {}, 95)
      await preload()
      await navigator.navigate(1)
      await navigator.arrow(1)
      expect(navigator.currentPage).toBe(2)
      await navigator.clickPage(5)
      expect(navigator.currentPage).toBe(5)
      await navigator.key(-1)
      expect(navigator.currentPage).toBe(4)
    })

    it('moves only the selection in select-first mode until Enter activates it', async () => {
      const { navigator, preload } = harness(95, { interactions: { arrowClick: 'select-first', pageClick: 'select-first', keyboard: 'select-first' } }, 95)
      await preload()
      await navigator.navigate(1)
      expect(navigator.arrow(1)).toBeNull()
      expect(navigator.selectedPage).toBe(2)
      expect(navigator.currentPage).toBe(1)
      expect(navigator.clickPage(6)).toBeNull()
      expect(navigator.key(-1)).toBeNull()
      expect(navigator.selectedPage).toBe(5)
      expect(navigator.currentPage).toBe(1)
      await navigator.activateSelection()
      expect(navigator.currentPage).toBe(5)
      expect(navigator.activateSelection()).toBeNull()
    })

    it('configures the three categories independently', async () => {
      const { navigator, preload } = harness(95, { interactions: { arrowClick: 'direct', pageClick: 'select-first', keyboard: 'select-first' } }, 95)
      await preload()
      await navigator.navigate(1)
      await navigator.arrow(1)
      expect(navigator.currentPage).toBe(2)
      expect(navigator.clickPage(4)).toBeNull()
      expect(navigator.currentPage).toBe(2)
      expect(navigator.key(1)).toBeNull()
      expect(navigator.selectedPage).toBe(5)
      expect(navigator.currentPage).toBe(2)
    })

    it('treats a click and Enter on the same page as one navigation', async () => {
      const a = harness(95, { interactions: direct }, 95)
      const b = harness(95, { interactions: { arrowClick: 'select-first', pageClick: 'select-first', keyboard: 'select-first' } }, 95)
      await a.preload(); await b.preload()
      await a.navigator.navigate(1); await b.navigator.navigate(1)
      await a.navigator.clickPage(7)
      b.navigator.clickPage(7); await b.navigator.activateSelection()
      expect([a.navigator.currentPage, a.navigator.selectedPage]).toEqual([b.navigator.currentPage, b.navigator.selectedPage])
      expect(a.session.loaded).toBe(b.session.loaded)
    })
  })

  describe('capacity', () => {
    it('stops at the capacity ceiling and flags that more results remain', async () => {
      const { navigator, session, preload } = harness(10_000, { capacity: 5, size: 10 }, 51)
      await preload()
      await navigator.navigate(5)
      expect(navigator.maxPage).toBe(5)
      expect(navigator.capacityBlocked).toBe(true)
      expect(session.loaded).toBeLessThanOrEqual(5 * 10 + 1)
      await navigator.navigate(99)
      expect(navigator.currentPage).toBe(5)
    })

    it('does not flag capacity when the results end exactly at the ceiling', async () => {
      const { navigator, preload } = harness(50, { capacity: 5, size: 10 }, 51)
      await preload()
      await navigator.navigate(5)
      expect(navigator.maxPage).toBe(5)
      expect(navigator.capacityBlocked).toBe(false)
    })

    it('is not bounded when unlimited', async () => {
      const { navigator, preload } = harness(3_000, { size: 10 }, 3_000)
      await preload()
      await navigator.navigate(300)
      expect(navigator.currentPage).toBe(300)
    })
  })

  describe('rebase (Adaptive re-adaptation)', () => {
    it('keeps the first result of the current and selected pages independently', async () => {
      const { navigator, preload } = harness(500, { size: 10 }, 500)
      await preload()
      await navigator.navigate(6) // current: results 50..59
      navigator.select(9) // selected: first result 80
      expect(await navigator.rebase(8, { current: pageStartIndex(6, 10), selected: pageStartIndex(9, 10) })).toBe(true)
      expect(navigator.pageSize).toBe(8)
      expect(navigator.currentPage).toBe(pageOfIndex(50, 8)) // 7
      expect(navigator.selectedPage).toBe(pageOfIndex(80, 8)) // 11
      expect(navigator.currentPage).not.toBe(1)
    })

    it('keeps the old size and page when the new current page cannot be loaded', async () => {
      const { navigator, fake, preload } = harness(500, { size: 10 }, 100)
      await preload()
      await navigator.navigate(2)
      fake.failNext()
      expect(await navigator.rebase(40, { current: 400, selected: 400 })).toBe(false)
      expect(navigator.pageSize).toBe(10)
      expect(navigator.currentPage).toBe(2)
    })
  })

  it('enters the page that contains an already-loaded result without retrieval', async () => {
    const { navigator, session, fake } = harness(500, { size: 10 })
    await session.ensureLoaded(200, 200)
    const before = fake.calls.length
    navigator.enterAt(137)
    expect(navigator.currentPage).toBe(14)
    expect(navigator.selectedPage).toBe(14)
    expect(fake.calls.length).toBe(before)
  })
})
