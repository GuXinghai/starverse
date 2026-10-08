import { PaginationNavigator, pageOfIndex, pageStartIndex } from './searchPagination'
import { PAGINATION_CAPACITY_PAGES } from './searchPreferences'
import type { SearchPreferences, SearchPresentation } from './searchPreferences'
import { SearchResultSession, isSearchSessionSuperseded } from './searchResultSession'
import type { SearchFetchPage, SearchSessionQuery } from './searchResultSession'
import type { SearchOrder } from './searchTypes'

/** Query size used when the whole result set is being retrieved progressively. */
const FULL_LOAD_CHUNK = 200

export type SearchBrowserQuery = Omit<SearchSessionQuery, 'order'>

/**
 * Temporary, per-open state of the Search dialog: the presentation and sort in effect, the browsing anchor, and the
 * two presentations' shared infrastructure. The persisted preferences are only read, never written, so closing and
 * reopening Search restores them.
 *
 * Both presentations read the one `SearchResultSession`; the paginator is a navigator over that same prefix and
 * owns no results of its own. The anchor is the zero-based index of the first visible result.
 */
export class SearchBrowser {
  readonly session: SearchResultSession
  private prefs: SearchPreferences
  private mode: SearchPresentation
  private sort: SearchOrder
  private query: SearchBrowserQuery | null = null
  private position = 0
  private nav: PaginationNavigator | null = null
  private measuredPageSize: number | null = null
  private scrollRequested = 0
  private scrollFailure: string | null = null
  private revision = 0
  private navigatorDetach: (() => void) | null = null
  private readonly listeners = new Set<() => void>()
  private readonly sessionDetach: () => void

  constructor(fetchPage: SearchFetchPage, prefs: SearchPreferences) {
    this.prefs = prefs
    this.mode = prefs.defaultPresentation
    this.sort = prefs.defaultSort
    this.session = new SearchResultSession(fetchPage, prefs.resultLimit)
    this.sessionDetach = this.session.subscribe(() => this.emit())
  }

  get presentation(): SearchPresentation { return this.mode }
  get order(): SearchOrder { return this.sort }
  get anchorIndex(): number { return this.position }
  get navigator(): PaginationNavigator | null { return this.mode === 'pagination' ? this.nav : null }
  get preferences(): SearchPreferences { return this.prefs }
  /** Adaptive page size needs a measured viewport before its first page can be shown. */
  get awaitingAdaptation(): boolean {
    return this.mode === 'pagination' && this.nav !== null && this.prefs.pagination.pageSizing === 'adaptive' && this.measuredPageSize === null
  }
  get scrollError(): string | null { return this.scrollFailure }
  /** Increments whenever the view must (re)position itself at `anchorIndex`. */
  get positionRevision(): number { return this.revision }

  subscribe(listener: () => void): () => void {
    this.listeners.add(listener)
    return () => { this.listeners.delete(listener) }
  }

  dispose(): void {
    this.session.dispose()
    this.nav = null
    this.sessionDetach()
    this.navigatorDetach?.()
    this.listeners.clear()
  }

  /** Runs a new search; the current sort and presentation are kept. */
  search(query: SearchBrowserQuery): void {
    this.query = query
    this.restart()
  }

  /** Re-sorts the same result set from its beginning. Nothing outside the dialog is touched. */
  setOrder(order: SearchOrder): void {
    if (order === this.sort) return
    this.sort = order
    if (this.query) this.restart()
    else this.emit()
  }

  /** Switches presentation without re-querying; the first visible result stays first visible. */
  setPresentation(presentation: SearchPresentation): void {
    if (presentation === this.mode) return
    this.mode = presentation
    if (!this.query) { this.emit(); return }
    if (presentation === 'pagination') this.enterPagination()
    else {
      // Late completions of the abandoned navigator must not move the scroll view.
      this.navigatorDetach?.()
      this.navigatorDetach = null
      this.nav = null
      this.scrollRequested = 0
      this.loadForScroll()
    }
    this.revision += 1
    this.emit()
  }

  /** Re-runs the current query from the start, e.g. after the search index was rebuilt under the loaded results. */
  refresh(): void {
    if (this.query) this.restart()
  }

  /** Reported by the view whenever its first visible result changes (zero-based, whole-result-set index). */
  setAnchor(index: number): void {
    this.position = Math.max(0, index)
  }

  /** Scroll presentation: keep enough results loaded ahead of the last visible one. */
  scrollDemand(lastVisibleIndex: number): void {
    if (this.mode !== 'scroll' || !this.query) return
    const { loading, batchSize, prefetchBatches } = this.prefs.scroll
    if (loading === 'full') return
    const demand = lastVisibleIndex + 1
    const prefetch = demand + prefetchBatches * batchSize
    if (prefetch <= this.scrollRequested) return
    this.scrollRequested = prefetch
    const settle = (error: unknown) => {
      if (isSearchSessionSuperseded(error)) return
      this.scrollRequested = 0
      this.scrollFailure = error instanceof Error ? error.message : 'SEARCH_FETCH_FAILED'
      this.emit()
    }
    this.scrollFailure = null
    this.session.ensureLoaded(demand, batchSize).catch(settle)
    this.session.ensureLoaded(prefetch, batchSize).catch(() => { /* surfaced by the demand request */ })
  }

  retryScroll(lastVisibleIndex: number): void {
    this.scrollFailure = null
    this.scrollRequested = 0
    this.scrollDemand(lastVisibleIndex)
    this.emit()
  }

  /**
   * Adaptive sizing: derives the page size from a freshly measured number of rows. The first measurement sizes
   * the paginator before any page is shown and places it on the page containing the anchor; later calls
   * (Re-adapt) preserve the first result of the previously current and previously selected pages independently
   * and only take effect once the new current page has loaded.
   */
  async adaptLayout(rows: number): Promise<boolean> {
    const nav = this.nav
    if (this.mode !== 'pagination' || !nav || this.prefs.pagination.pageSizing !== 'adaptive' || !(rows >= 1)) return false
    const size = Math.floor(rows)
    if (this.measuredPageSize === null) {
      nav.resize(size)
      this.measuredPageSize = size
      this.openPage(nav)
      this.revision += 1
      this.emit()
      return true
    }
    const firsts = { current: pageStartIndex(nav.currentPage, nav.pageSize), selected: pageStartIndex(nav.selectedPage, nav.pageSize) }
    const committed = await nav.rebase(size, firsts)
    // A newer search, sort or presentation replaced the navigator while the results loaded: nothing here applies.
    if (this.nav !== nav || !committed) return false
    this.measuredPageSize = size
    this.position = pageOfIndex(firsts.current, size) === nav.currentPage ? firsts.current : pageStartIndex(nav.currentPage, size)
    this.revision += 1
    this.emit()
    return true
  }

  /** Paginator input. Each one goes through the navigator's single navigation authority. */
  arrow(delta: -1 | 1): void { void this.committed(this.nav?.arrow(delta)) }
  key(delta: -1 | 1): void { void this.committed(this.nav?.key(delta)) }
  clickPage(page: number): void { void this.committed(this.nav?.clickPage(page)) }
  activateSelection(): void { void this.committed(this.nav?.activateSelection()) }
  retryNavigation(): void { void this.committed(this.nav?.retry()) }

  /** A committed navigation puts the view at the top of the newly current page. */
  private async committed(navigation: Promise<boolean> | null | undefined): Promise<void> {
    const nav = this.nav
    if (!navigation || !(await navigation) || !nav || nav !== this.nav) return
    this.position = pageStartIndex(nav.currentPage, nav.pageSize)
    this.revision += 1
    this.emit()
  }

  private restart(): void {
    if (!this.query) return
    this.position = 0
    this.revision += 1
    this.scrollRequested = 0
    this.scrollFailure = null
    this.session.start({ ...this.query, order: this.sort })
    if (this.mode === 'pagination') {
      this.nav = this.createNavigator()
      this.forwardNavigator(this.nav)
      if (!this.awaitingAdaptation) this.openPage(this.nav)
    } else {
      this.nav = null
      this.loadForScroll()
    }
    this.emit()
  }

  private loadForScroll(): void {
    if (this.prefs.scroll.loading === 'full') this.loadFully()
    else this.scrollDemand(this.position)
  }

  /** Full Load: retrieve progressively up to the display limit; whatever is loaded is already browsable. */
  private loadFully(): void {
    this.session.ensureLoaded(this.session.resultLimit, FULL_LOAD_CHUNK).catch((error) => {
      if (isSearchSessionSuperseded(error)) return
      this.scrollFailure = error instanceof Error ? error.message : 'SEARCH_FETCH_FAILED'
      this.emit()
    })
  }

  private enterPagination(): void {
    const nav = this.createNavigator()
    this.nav = nav
    this.forwardNavigator(nav)
    if (!this.awaitingAdaptation) this.openPage(nav)
  }

  /**
   * Puts a freshly created navigator on the page containing the anchor. When entering from Scroll the anchor's
   * result is already loaded, so no retrieval is needed to show it; the navigation then only prefetches.
   */
  private openPage(nav: PaginationNavigator): void {
    nav.enterAt(this.position)
    // Beyond the pagination capacity the navigator clamps to its last page; the anchor follows it.
    if (pageOfIndex(this.position, nav.pageSize) !== nav.currentPage) this.position = pageStartIndex(nav.currentPage, nav.pageSize)
    if (this.prefs.pagination.loading === 'full') this.loadFully()
    void nav.navigate(nav.currentPage)
  }

  private createNavigator(): PaginationNavigator {
    const { pagination } = this.prefs
    const size = this.measuredPageSize ?? pagination.fixedPageSize
    return new PaginationNavigator({
      ensureLoaded: (count, chunk) => this.session.ensureLoaded(count, pagination.loading === 'full' ? FULL_LOAD_CHUNK : chunk),
      loaded: () => this.session.loaded,
      status: () => this.session.status,
      capacityPages: () => PAGINATION_CAPACITY_PAGES[pagination.capacity],
      prefetchPages: () => (pagination.loading === 'on-demand' ? pagination.prefetchPages : 0),
      interactions: () => pagination,
    }, size)
  }

  private forwardNavigator(nav: PaginationNavigator): void {
    this.navigatorDetach?.()
    this.navigatorDetach = nav.subscribe(() => this.emit())
  }

  private emit(): void {
    for (const listener of [...this.listeners]) listener()
  }
}
